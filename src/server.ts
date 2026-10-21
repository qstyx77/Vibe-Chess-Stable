
import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';
import * as admin from 'firebase-admin';

import { 
    initializeBoard, 
    applyMove, 
    isKingInCheck, 
    isCheckmate, 
    isStalemate, 
    spawnShroom, 
    processRookResurrectionCheck,
    algebraicToCoords,
    coordsToAlgebraic,
    isQueenSacrificeRequired,
    getPossibleMoves,
    isValidSquare,
    getPromotionLevel,
    VAL_MAP,
    boardToPositionHash,
    getCastlingRightsString,
    getEffectiveLevel,
    syncSoulLink,
    isItemValidForPiece,
    triggerPushBack,
    processOilSlickTimers,
    processPoisonDamage,
    FRONTLINE_TYPES,
    findKing,
    isSquareAttacked,
    getActiveSets
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType, InventoryItemType, ChatMessage, Move } from './types';

// Initialize Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

const server = http.createServer((req, res) => {
    const urlString = req.url || '';
    const url = new URL(urlString, `http://${req.headers.host}`);

    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

interface Tournament {
    id: string;
    round: 1 | 2 | 3;
    participantsData: Record<string, any>; // userId -> data
    activeRoomIds: Set<string>;
    roundWinners: string[]; // userIds
    countdownTimer?: NodeJS.Timeout;
}

const rooms: Record<string, { 
    clients: (WebSocket & { userId?: string, roomId?: string, username?: string })[]; 
    gameState: any; 
    isRanked: boolean; 
    tournamentId?: string; 
    round?: number; 
    turnTimer?: NodeJS.Timeout; 
    positionHistory: string[]; 
    historyTracks: {
        white: { type: PieceType | null, item: InventoryItemType | null, level: number | null },
        black: { type: PieceType | null, item: InventoryItemType | null, level: number | null },
        global: { type: PieceType | null, item: InventoryItemType | null, level: number | null }
    }
}> = {};
const userConnections: Record<string, (WebSocket & { userId?: string, roomId?: string, username?: string })> = {};
const tournaments: Record<string, Tournament> = {};

const broadcastToRoom = (roomId: string, message: any) => {
    const room = rooms[roomId];
    if (room && room.clients) {
        const payload = JSON.stringify(message);
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
};

const broadcastPresence = () => {
    const presenceData = Object.values(userConnections).map(conn => ({
        userId: conn.userId,
        username: conn.username
    }));
    const msg = JSON.stringify({ type: 'presence-update', users: presenceData });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
};

async function getUidByUsername(username: string) {
    const usersRef = admin.firestore().collection('users');
    const q = await usersRef.where('username', '==', username).limit(1).get();
    if (q.empty) return null;
    return q.docs[0].id;
}

function calculateEloChange(winnerElo: number, loserElo: number) {
    const k = 32;
    const expectedScoreWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedScoreLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));
    
    return {
        winnerGain: Math.round(k * (1 - expectedScoreWinner)),
        loserLoss: Math.round(k * (0 - expectedScoreLoser))
    };
}

const startArena = () => {
    if (arenaQueue.length < 8) return;
    const participants = arenaQueue.splice(0, 8);
    const tournamentId = `tourney_${Math.random().toString(36).substring(2, 9)}`;
    
    const tournament: Tournament = {
        id: tournamentId,
        round: 1,
        participantsData: {},
        activeRoomIds: new Set(),
        roundWinners: []
    };

    for (let i = 0; i < 4; i++) {
        const p1 = participants[i*2];
        const p2 = participants[i*2+1];
        
        tournament.participantsData[p1.userId] = p1.userData;
        tournament.participantsData[p2.userId] = p2.userData;

        const roomId = `arena_${tournamentId}_r1_${i}`;
        const board = initializeBoard(
            p1.userData?.elo || 1200, 
            p2.userData?.elo || 1200, 
            p1.userData?.unlockedPieces || [], 
            p2.userData?.unlockedPieces || [],
            p1.userData?.equipment || {},
            p2.userData?.equipment || {}
        );

        rooms[roomId] = {
            clients: [],
            isRanked: true,
            tournamentId: tournamentId,
            round: 1,
            positionHistory: [],
            historyTracks: {
                white: { type: null, item: null, level: null },
                black: { type: null, item: null, level: null },
                global: { type: null, item: null, level: null }
            },
            gameState: {
                board,
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTargetSquare: null,
                gameMoveCounter: 0,
                lastMoveFrom: null,
                lastMoveTo: null,
                gameInfo: { message: " ", isCheck: false, gameOver: false },
                shroomSpawnCounter: 0,
                nextShroomSpawnTurn: 5,
                players: { white: p1.userData, black: p2.userData },
                didOpponentCaptureLastTurn: false
            }
        };

        tournament.activeRoomIds.add(roomId);

        p1.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
        p2.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
    }

    tournaments[tournamentId] = tournament;
    wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
};

const startNextTournamentRound = (tournamentId: string) => {
    const tournament = tournaments[tournamentId];
    if (!tournament) return;

    tournament.round++;
    const winners = tournament.roundWinners;
    tournament.roundWinners = [];
    
    tournament.activeRoomIds.clear();

    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i+1];
        
        if (!p2Id) {
            tournament.roundWinners.push(p1Id);
            const ws = userConnections[p1Id];
            if (ws) ws.send(JSON.stringify({ tournamentId, type: 'tournament-intermission', round: tournament.round, nextRound: tournament.round + 1 }));
            continue;
        }

        const p1Data = tournament.participantsData[p1Id];
        const p2Data = tournament.participantsData[p2Id];

        const roomId = `arena_${tournamentId}_r${tournament.round}_${i}`;
        const board = initializeBoard(
            p1Data?.elo || 1200, 
            p2Data?.elo || 1200, 
            p1Data?.unlockedPieces || [], 
            p2Data?.unlockedPieces || [],
            p1Data?.equipment || {},
            p2Data?.equipment || {}
        );

        rooms[roomId] = {
            clients: [],
            isRanked: true,
            tournamentId: tournamentId,
            round: tournament.round,
            positionHistory: [],
            historyTracks: {
                white: { type: null, item: null, level: null },
                black: { type: null, item: null, level: null },
                global: { type: null, item: null, level: null }
            },
            gameState: {
                board,
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTargetSquare: null,
                gameMoveCounter: 0,
                lastMoveFrom: null,
                lastMoveTo: null,
                gameInfo: { message: " ", isCheck: false, gameOver: false },
                shroomSpawnCounter: 0,
                nextShroomSpawnTurn: 5,
                players: { white: p1Data, black: p2Data },
                didOpponentCaptureLastTurn: false
            }
        };

        tournament.activeRoomIds.add(roomId);

        const ws1 = userConnections[p1Id];
        const ws2 = userConnections[p2Id];
        if (ws1) ws1.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
        if (ws2) ws2.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
    }
};

const handleTournamentGameOver = (tournamentId: string, roomId: string, winnerColor: PlayerColor, reason: string) => {
    const tournament = tournaments[tournamentId];
    const room = rooms[roomId];
    if (!tournament || !room) return;

    const winnerData = winnerColor === 'white' ? room.gameState.players.white : room.gameState.players.black;
    const loserData = winnerColor === 'white' ? room.gameState.players.black : room.gameState.players.white;

    if (!winnerData || !loserData) return;

    tournament.roundWinners.push(winnerData.userId);
    tournament.activeRoomIds.delete(roomId);

    const eloChanges = calculateEloChange(winnerData.elo || 1200, loserData.elo || 1200);
    const eloInfo: any = {};
    eloInfo[winnerData.userId] = { oldElo: winnerData.elo || 1200, newElo: (winnerData.elo || 1200) + eloChanges.winnerGain };
    eloInfo[loserData.userId] = { oldElo: loserData.elo || 1200, newElo: (loserData.elo || 1200) + eloChanges.loserLoss };

    const goldEarned: Record<string, number> = {};
    if (tournament.round === 3) goldEarned[winnerData.userId] = 500; 

    broadcastToRoom(roomId, { 
        type: 'game-over', 
        winner: winnerColor, 
        reason,
        eloInfo,
        goldEarned,
        moveCount: room.gameState.gameMoveCounter
    });

    const winnerWs = userConnections[winnerData.userId];
    if (winnerWs) {
        winnerWs.send(JSON.stringify({ 
            type: 'tournament-intermission', 
            round: tournament.round,
            nextRound: tournament.round + 1
        }));
    }

    delete rooms[roomId];

    if (tournament.activeRoomIds.size === 0) {
        if (tournament.round < 3) {
            broadcastTournamentMessage(tournamentId, `Round ${tournament.round} complete! Next round starts in 15 seconds...`);
            tournament.countdownTimer = setTimeout(() => {
                startNextTournamentRound(tournamentId);
            }, 15000);
        } else {
            if (winnerWs) {
                winnerWs.send(JSON.stringify({ type: 'chat-message', message: {
                    id: `tourney_win_${Date.now()}`,
                    sender: 'SYSTEM',
                    text: `[ARENA]: CONGRATULATIONS! You are the Tournament Champion!`,
                    timestamp: Date.now(),
                    category: 'social'
                }}));
            }
            delete tournaments[tournamentId];
        }
    }
};

const broadcastTournamentMessage = (tournamentId: string, text: string) => {
    const tournament = tournaments[tournamentId];
    if (!tournament) return;
    Object.keys(tournament.participantsData).forEach(uid => {
        const ws = userConnections[uid];
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'chat-message',
                message: {
                    id: `tourney_msg_${Date.now()}`,
                    sender: 'SYSTEM',
                    text: `[ARENA]: ${text}`,
                    timestamp: Date.now(),
                    category: 'social'
                }
            }));
        }
    });
};

const moveTypeToItem: Record<string, InventoryItemType> = {
    'wind-scroll': 'wind_scroll',
    'life-leach': 'life_leach',
    'summon-anvil': 'summon_anvil',
    'shield-scroll': 'shield_scroll',
    'rally-scroll': 'rally_scroll',
    'antidote': 'antidote',
    'swap-scroll': 'swap_scroll',
    'ice-scroll': 'ice_scroll',
    'resurrection-scroll': 'resurrection_scroll',
    'faith-scroll': 'faith_scroll',
    'kings-decree': 'kings_decree',
    'ice-blast': 'ice_blast',
    'soul-harvest': 'soul_harvest',
    'earthquake-scroll': 'earthquake_scroll',
    'demonic-possession': 'demonic_possession',
    'heavy-rain': 'heavy_rain',
    'oil-slick': 'oil_slick',
    'phase-out': 'phase_out',
    'glacial-ray': 'glacial_ray',
    'burning-ray': 'burning_ray',
    'lose-thy-faith': 'lose_faith_scroll'
};

let arenaQueue: { ws: WebSocket; userId: string; userData: any }[] = [];

wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string, username?: string }) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'identify':
                    ws.userId = data.userId;
                    ws.username = data.username;
                    userConnections[data.userId] = ws;
                    broadcastPresence();
                    ws.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length }));
                    break;
                case 'admin-command': {
                    const entropy = () => Math.random().toString(36).substr(2, 5);
                    const sendResponse = (text: string, index: number) => {
                        ws.send(JSON.stringify({ 
                            type: 'chat-message', 
                            message: { 
                                id: `admin_${Date.now()}_${index}_${entropy()}`, 
                                sender: 'SYSTEM', 
                                text,
                                timestamp: Date.now(), 
                                category: 'battle' 
                            } 
                        }));
                    };

                    const authId = ws.userId || data.senderId;
                    if (!authId) {
                        sendResponse("ERROR: Session not identified. Please wait or re-log.", 0);
                        break;
                    }

                    try {
                        let isVerifiedAdmin = false;
                        try {
                            const userSnap = await admin.firestore().doc(`users/${authId}`).get();
                            const userData = userSnap.data();
                            if (userData?.role === 'admin') isVerifiedAdmin = true;
                        } catch (dbError) {
                            console.warn("[Admin] Database unreachable, performing session fallback...");
                            // FALLBACK: Allow SUGGA verified session even if database check times out
                            if (ws.username?.toUpperCase() === 'SUGGA') {
                                isVerifiedAdmin = true;
                            }
                        }

                        if (!isVerifiedAdmin) {
                            sendResponse("PERMISSION DENIED: Administrative access required.", 0);
                            break;
                        }

                        const parts = data.text.trim().split(' ');
                        const cmd = parts[0].toLowerCase();

                        if (cmd === '/adminhelp') {
                            const help = [
                                "ADMIN COMMAND CENTER - SYNTAX GUIDE (CASE SENSITIVE USERNAMES):",
                                "/gold <user> <amount> - e.g. /gold SUGGA 1000",
                                "/elo <user> <value> - e.g. /elo Bob 1500",
                                "/unlock <user> <piece> - e.g. /unlock Bob dancer",
                                "/clear_inv <user> - Wipes loot bag",
                                "/mute <user> <mins> - e.g. /mute Bob 60 (Mutes chat)",
                                "/unmute <user> - Restore chat access",
                                "/ban <user> <mins> - e.g. /ban Bob 1440 (Suspends login)",
                                "/unban <user> - Restore login access",
                                "/delete_acc <user> - WIPE Auth and Firestore record",
                                "/who - List all online players and their stats",
                            ];
                            help.forEach((h, i) => sendResponse(h, i));
                        } else if (cmd === '/who') {
                            const online = await Promise.all(Object.keys(userConnections).map(async uid => {
                                const snap = await admin.firestore().doc(`users/${uid}`).get();
                                const d = snap.data();
                                return `${d?.username} (Elo: ${d?.eloRating}, Gold: ${d?.goldBalance})`;
                            }));
                            sendResponse(`PLAYERS: ${online.length > 0 ? online.join(', ') : 'None online.'}`, 0);
                        } else {
                            const targetName = parts[1];
                            if (!targetName) {
                                sendResponse(`ERROR: Missing target name. Usage: ${cmd} <name> <value>`, 0);
                                break;
                            }

                            const targetUid = await getUidByUsername(targetName);
                            if (!targetUid) {
                                sendResponse(`ERROR: Target user '${targetName}' not found (Check case sensitivity).`, 0);
                                break;
                            }
                            const targetRef = admin.firestore().doc(`users/${targetUid}`);

                            if (cmd === '/gold') {
                                const amt = parseInt(parts[2]);
                                if (isNaN(amt)) { sendResponse("Usage: /gold <name> <amount>", 0); break; }
                                await targetRef.update({ goldBalance: amt });
                                sendResponse(`SUCCESS: Set ${targetName}'s Gold to ${amt}.`, 0);
                            } else if (cmd === '/elo') {
                                const val = parseInt(parts[2]);
                                if (isNaN(val)) { sendResponse("Usage: /elo <name> <value>", 0); break; }
                                await targetRef.update({ eloRating: val });
                                sendResponse(`SUCCESS: Set ${targetName}'s Elo to ${val}.`, 0);
                            } else if (cmd === '/unlock') {
                                const p = parts[2];
                                if (!p) { sendResponse("Usage: /unlock <name> <piece_type>", 0); break; }
                                await targetRef.update({ unlockedPieces: admin.firestore.FieldValue.arrayUnion(p) });
                                sendResponse(`SUCCESS: Unlocked ${p} for ${targetName}.`, 0);
                            } else if (cmd === '/clear_inv') {
                                await targetRef.update({ inventory: [] });
                                sendResponse(`SUCCESS: Wiped ${targetName}'s inventory.`, 0);
                            } else if (cmd === '/mute') {
                                const mins = parseInt(parts[2]) || 60;
                                const until = Date.now() + (mins * 60 * 1000);
                                await targetRef.update({ mutedUntil: until });
                                sendResponse(`SUCCESS: Muted ${targetName} for ${mins} minutes.`, 0);
                            } else if (cmd === '/unmute') {
                                await targetRef.update({ mutedUntil: 0 });
                                sendResponse(`SUCCESS: Unmuted ${targetName}.`, 0);
                            } else if (cmd === '/ban') {
                                const mins = parseInt(parts[2]) || 60;
                                const until = Date.now() + (mins * 60 * 1000);
                                await targetRef.update({ bannedUntil: until });
                                sendResponse(`SUCCESS: Banned ${targetName} for ${mins} minutes.`, 0);
                            } else if (cmd === '/unban') {
                                await targetRef.update({ bannedUntil: 0 });
                                sendResponse(`SUCCESS: Unbanned ${targetName}.`, 0);
                            } else if (cmd === '/delete_acc') {
                                await admin.auth().deleteUser(targetUid);
                                await targetRef.delete();
                                sendResponse(`SUCCESS: Permanently deleted ${targetName}.`, 0);
                            }
                        }
                    } catch (e) {
                        console.error("[Admin Command Processor Error]", e);
                        sendResponse("ERROR: Database connection timeout.", 0);
                    }
                    break;
                }
                case 'join-tournament-queue':
                    if (!arenaQueue.find(p => p.userId === data.userId)) {
                        arenaQueue.push({ ws, userId: data.userId, userData: data.user });
                        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
                        if (arenaQueue.length >= 8) startArena();
                    }
                    break;
                case 'chat-message': {
                    if (!data.senderId) break;
                    const senderSnap = await admin.firestore().doc(`users/${data.senderId}`).get();
                    const senderData = senderSnap.data();
                    if (senderData?.mutedUntil && senderData.mutedUntil > Date.now()) {
                        ws.send(JSON.stringify({ type: 'chat-message', message: { id: `mute_${Date.now()}`, sender: 'SYSTEM', text: "You are currently muted.", timestamp: Date.now(), category: 'log' } }));
                        break;
                    }

                    const msg: ChatMessage = {
                        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        sender: data.sender,
                        senderId: data.senderId,
                        text: data.text,
                        timestamp: Date.now(),
                        color: data.color,
                        category: data.category
                    };
                    if (data.category === 'battle' && ws.roomId) broadcastToRoom(ws.roomId, { type: 'chat-message', message: msg });
                    else {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'chat-message', message: msg }));
                        });
                    }
                    break;
                }
                case 'create-room': {
                    const roomId = Math.random().toString(36).substring(2, 9);
                    ws.roomId = roomId;
                    ws.userId = data.user?.userId;
                    ws.username = data.user?.username;
                    const board = initializeBoard(
                        data.user?.elo || 1200, 
                        1200, 
                        data.user?.unlockedPieces || [], 
                        [],
                        data.user?.equipment || {}
                    );
                    rooms[roomId] = {
                        clients: [ws],
                        isRanked: false,
                        positionHistory: [],
                        historyTracks: {
                            white: { type: null, item: null, level: null },
                            black: { type: null, item: null, level: null },
                            global: { type: null, item: null, level: null }
                        },
                        gameState: {
                            board,
                            currentPlayer: 'white',
                            capturedPieces: { white: [], black: [] },
                            killStreaks: { white: 0, black: 0 },
                            enPassantTargetSquare: null,
                            gameMoveCounter: 0,
                            lastMoveFrom: null,
                            lastMoveTo: null,
                            gameInfo: { message: " ", isCheck: false, gameOver: false },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: 5,
                            players: { white: data.user, black: null },
                            didOpponentCaptureLastTurn: false
                        }
                    };
                    ws.send(JSON.stringify({ type: 'room-created', roomId, color: 'white', gameState: rooms[roomId].gameState }));
                    break;
                }
                case 'join-room': {
                    const roomToJoin = rooms[data.roomId];
                    if (roomToJoin) {
                        ws.roomId = data.roomId;
                        ws.userId = data.user?.userId;
                        ws.username = data.user?.username;
                        roomToJoin.clients.push(ws);
                        
                        if (!roomToJoin.gameState.players.white && data.color === 'white') roomToJoin.gameState.players.white = data.user;
                        if (!roomToJoin.gameState.players.black && (data.color === 'black' || roomToJoin.gameState.players.white)) roomToJoin.gameState.players.black = data.user;

                        const eq = data.user?.equipment || {};
                        const pColor = roomToJoin.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                        
                        const elo = data.user?.elo || 1200;
                        let bUp = false, rUp = false, nUp = false;

                        roomToJoin.gameState.board.forEach((row: any) => row.forEach((sq: any) => {
                            if (sq.piece && sq.piece.color === pColor) {
                                if (eq[sq.piece.id]) sq.piece.heldItem = eq[sq.piece.id];
                                if (sq.piece.type === 'bishop' && elo >= 1500 && !bUp) { sq.piece.type = 'archbishop'; bUp = true; }
                                if (sq.piece.type === 'rook' && elo >= 1800 && !rUp) { sq.piece.type = 'palace'; rUp = true; }
                                if (sq.piece.type === 'knight' && elo >= 2100 && !nUp) { sq.piece.type = 'archer'; nUp = true; }
                            }
                        }));

                        ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId, color: pColor, gameState: roomToJoin.gameState }));
                        broadcastToRoom(data.roomId, { type: 'player-joined', gameState: roomToJoin.gameState });
                    }
                    break;
                }
                case 'anvil-drop': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const playerColor = room.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                    if (room.gameState.currentPlayer !== playerColor) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && !room.gameState.board[row][col].piece && !room.gameState.board[row][col].item) {
                        room.gameState.board[row][col].item = { type: 'anvil' };
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: room.gameState, events: { anvilDrop: true, dropPos: data.square } });
                    }
                    break;
                }
                case 'holy-shield': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const playerColor = room.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                    if (room.gameState.currentPlayer !== playerColor) break;
                    const { row, col } = algebraicToCoords(data.square);
                    const board = room.gameState.board;
                    if (isValidSquare(row, col) && board[row][col].piece?.color === playerColor) {
                        const targetPiece = board[row][col].piece;
                        targetPiece.isShielded = true;
                        const levelChanges = [];
                        const rosaryArchbishop = board.flat().find((sq: any) => sq.piece && sq.piece.color === playerColor && sq.piece.heldItem === 'rosary');
                        if (rosaryArchbishop) {
                            const oldL = targetPiece.level;
                            targetPiece.level = Math.min(targetPiece.type === 'queen' ? 7 : 99, (targetPiece.level || 1) + 1);
                            if (targetPiece.level > oldL) levelChanges.push({ square: data.square, delta: 1 });
                        }
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: room.gameState, events: { shield: true, shieldPos: data.square, levelChanges } });
                    }
                    break;
                }
                case 'archer-snipe': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const playerColor = room.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                    if (room.gameState.currentPlayer !== playerColor) break;
                    const { row, col } = algebraicToCoords(data.square);
                    const board = room.gameState.board;
                    if (isValidSquare(row, col) && board[row][col].piece?.color !== playerColor) {
                        const sniped = board[row][col].piece;
                        let smokeEscaped = false; let hydraSplit = false; let phxRes = false;
                        if (sniped.heldItem === 'smoke_bomb') {
                             const backIdx = sniped.color === 'white' ? 7 : 0;
                             const cands = [];
                             for(let i=0; i<8; i++) if(!board[backIdx][i].piece && !board[backIdx][i].item) cands.push(i);
                             if (cands.length > 0) {
                                 const destC = cands[Math.floor(Math.random()*cands.length)];
                                 board[backIdx][destC].piece = { ...sniped, heldItem: null, hasMoved: true, id: `${sniped.id}_smoke_${Date.now()}` };
                                 board[row][col].piece = null; smokeEscaped = true;
                             }
                        } else if (sniped.id.startsWith('boss-hydra')) {
                             hydraSplit = true; board[row][col].piece = null;
                             const hAdj = [];
                             for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                                 const nr=row+dr, nc=col+dc;
                                 if(isValidSquare(nr,nc) && !board[nr][nc].piece && !board[nr][nc].item) hAdj.push({r:nr, c:nc});
                             }
                             hAdj.sort(()=>Math.random()-0.5).slice(0,2).forEach((pos, i) => {
                                 board[pos.r][pos.c].piece = { id:`h_${sniped.id}_${i}`, type:'knight', color:sniped.color, level:2, hasMoved:true };
                             });
                        } else if (sniped.heldItem === 'phoenix_down') {
                             phxRes = true; board[row][col].piece = null;
                             const em = [];
                             for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!board[r][c].piece && !board[r][c].item) em.push({r,c});
                             if (em.length > 0) {
                                 const p = em[Math.floor(Math.random()*em.length)];
                                 board[p.r][p.c].piece = { ...sniped, id:`phx_${sniped.id}`, hasMoved:true };
                             }
                        }
                        if (!smokeEscaped && !hydraSplit && !phxRes) {
                            room.gameState.capturedPieces[sniped.color].push(sniped);
                            board[row][col].piece = null;
                        }
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: room.gameState, events: { snipe: true, snipePos: data.square, smokeBomb: smokeEscaped, smokePos: smokeEscaped ? data.square : undefined, hydraSplit: hydraSplit, phoenixRes: phxRes } });
                    }
                    break;
                }
                case 'pawn-sacrifice': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const playerColor = room.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                    if (room.gameState.currentPlayer !== playerColor) break;
                    const { row, col } = algebraicToCoords(data.payload.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece?.color === playerColor) {
                        const sacrificed = room.gameState.board[row][col].piece;
                        room.gameState.capturedPieces[sacrificed.color].push(sacrificed);
                        room.gameState.board[row][col].piece = null;
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: room.gameState, events: { sacrifice: true, sacPos: data.payload.square } });
                    }
                    break;
                }
                case 'ks-resurrection': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const playerColor = room.gameState.players.white?.userId === ws.userId ? 'white' : 'black';
                    if (room.gameState.currentPlayer !== playerColor) break;
                    const { pieceId, square } = data.payload;
                    const { row, col } = algebraicToCoords(square);
                    const piece = room.gameState.capturedPieces[playerColor].find((p: Piece) => p.id === pieceId);
                    if (piece && isValidSquare(row, col) && !room.gameState.board[row][col].piece) {
                        const resPiece = { ...piece, id: `res_ks_${piece.id}_${Date.now()}`, level: 1, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                        room.gameState.board[row][col].piece = resPiece;
                        room.gameState.capturedPieces[playerColor] = room.gameState.capturedPieces[playerColor].filter((p: Piece) => p.id !== pieceId);
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: room.gameState, events: { resurrection: true, resPos: square } });
                    }
                    break;
                }
                case 'game-move': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const movePayload = data.payload as Move;
                    const gs = room.gameState;
                    const playerColor = gs.players.white?.userId === ws.userId ? 'white' : 'black';
                    const isRewardMove = ['dance-swap', 'dance-move', 'anvil-drop', 'holy-shield', 'archer-snipe', 'pawn-sacrifice', 'ks-resurrection', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen'].includes(movePayload.type || '');
                    if (gs.currentPlayer !== playerColor && !isRewardMove) break;
                    const fromSq = algebraicToCoords(movePayload.from);
                    const movingPiece = gs.board[fromSq.row][fromSq.col].piece;
                    if (!isRewardMove) {
                        if (!movingPiece || movingPiece.color !== playerColor) break;
                        const legalMoves = getPossibleMoves(gs.board, movePayload.from, gs.enPassantTargetSquare, room.historyTracks.white, room.historyTracks.black, room.historyTracks.global);
                        if (!legalMoves.includes(movePayload.to)) break;
                    }
                    const result = applyMove(gs.board, movePayload, gs.enPassantTargetSquare, gs.capturedPieces, room.historyTracks.white, room.historyTracks.black, room.historyTracks.global, gs.didOpponentCaptureLastTurn);
                    gs.board = result.newBoard; gs.enPassantTargetSquare = result.enPassantTargetSet;
                    let resurrectionEvent = null;
                    if (result.capturedPiece) {
                        const targetPile = result.capturedPiece.color;
                        if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                        gs.capturedPieces[targetPile].push(result.capturedPiece);
                        gs.killStreaks[playerColor]++; gs.didOpponentCaptureLastTurn = true;
                    } else if (result.selfDestructCaptures?.length) {
                        result.selfDestructCaptures.forEach((p: Piece) => {
                            const targetPile = p.color;
                            if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                            gs.capturedPieces[targetPile].push(p);
                        });
                        gs.killStreaks[playerColor] += result.selfDestructCaptures.length; gs.didOpponentCaptureLastTurn = true;
                    } else if (result.obliteratedPieces && result.obliteratedPieces.length > 0) {
                        gs.killStreaks[playerColor] += result.obliteratedPieces.length; gs.didOpponentCaptureLastTurn = true;
                    } else if (!isRewardMove) {
                        gs.killStreaks[playerColor] = 0; gs.didOpponentCaptureLastTurn = false;
                    }
                    const wasCapture = !!(result.capturedPiece || result.selfDestructCaptures?.length || (result.obliteratedPieces && result.obliteratedPieces.length > 0) || result.smokeBombEvent);
                    const toCoords = algebraicToCoords(movePayload.to);
                    const landedPiece = gs.board[toCoords.row][toCoords.col].piece;
                    if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && wasCapture) {
                        const resRes = processRookResurrectionCheck(gs.board, playerColor, movePayload, movePayload.to, movingPiece?.level || 1, gs.capturedPieces, Date.now());
                        if (resRes.resurrectionPerformed) {
                            gs.board = resRes.boardWithResurrection; gs.capturedPieces = resRes.capturedPiecesAfterResurrection;
                            resurrectionEvent = { square: resRes.resurrectedSquareAlg, piece: resRes.resurrectedPieceData };
                        }
                    }
                    if (movingPiece) {
                        const trackInfo = { type: movingPiece.type, level: movingPiece.level, item: movingPiece.heldItem || null };
                        if (playerColor === 'white') room.historyTracks.white = trackInfo;
                        else room.historyTracks.black = trackInfo;
                        room.historyTracks.global = trackInfo;
                    }
                    let shroomSpawnedEvent = false; let shroomSpawnPos = null;
                    if (!isRewardMove) {
                        gs.shroomSpawnCounter++;
                        const activeSets = getActiveSets(gs.board, playerColor);
                        if (activeSets.includes('alchemist')) gs.shroomSpawnCounter++;
                        if (gs.shroomSpawnCounter >= gs.nextShroomSpawnTurn) {
                            const { newBoard: bAS, spawnedAt } = spawnShroom(gs.board);
                            if (spawnedAt) { gs.board = bAS; gs.shroomSpawnCounter = 0; gs.nextShroomSpawnTurn = Math.floor(Math.random() * 6) + 5; shroomSpawnedEvent = true; shroomSpawnPos = spawnedAt; }
                        }
                    }
                    if (result.infiltrationWin || (gs.killStreaks[playerColor] >= 8 && gs.board.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === playerColor)?.piece?.heldItem === 'kings_conquest')) {
                        const reason = result.infiltrationWin ? 'infiltration' : 'conquest';
                        if (room.tournamentId) handleTournamentGameOver(room.tournamentId, ws.roomId!, playerColor, reason);
                        else {
                            const winnerData = playerColor === 'white' ? gs.players.white : gs.players.black;
                            const loserData = playerColor === 'white' ? gs.players.black : gs.players.white;
                            const eloInfo: any = {};
                            if (winnerData && loserData) {
                                const changes = calculateEloChange(winnerData.elo || 1200, loserData.elo || 1200);
                                eloInfo[winnerData.userId] = { oldElo: winnerData.elo || 1200, newElo: (winnerData.elo || 1200) + changes.winnerGain };
                                eloInfo[loserData.userId] = { oldElo: loserData.elo || 1200, newElo: (loserData.elo || 1200) + changes.loserLoss };
                            }
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason, eloInfo, goldEarned: {}, moveCount: gs.gameMoveCounter });
                        }
                        return;
                    }
                    const oppColor = playerColor === 'white' ? 'black' : 'white';
                    let mate = isCheckmate(gs.board, oppColor, gs.enPassantTargetSquare, room.historyTracks.white, room.historyTracks.black, room.historyTracks.global);
                    if (mate) {
                        const kingInfo = findKing(gs.board, oppColor);
                        if (kingInfo && kingInfo.piece.heldItem === 'kings_ransom') {
                            const bRI = oppColor === 'white' ? 7 : 0; const safe = [];
                            for (let c = 0; c < 8; c++) {
                                const alg = coordsToAlgebraic(bRI, c);
                                if (!gs.board[bRI][c].piece && !gs.board[bRI][c].item && !isSquareAttacked(gs.board, alg, playerColor, false, null, gs.enPassantTargetSquare, room.historyTracks.white, room.historyTracks.black, room.historyTracks.global, true)) safe.push(alg);
                            }
                            if (safe.length > 0) {
                                const dest = safe[Math.floor(Math.random() * safe.length)]; const { row: dr, col: dc } = algebraicToCoords(dest); const { row: kr, col: kc } = algebraicToCoords(kingInfo.algebraic);
                                gs.board[kr][kc].piece = null; gs.board[dr][dc].piece = { ...kingInfo.piece, heldItem: null, level: 1, hasMoved: true };
                                mate = false; broadcastToRoom(ws.roomId!, { type: 'chat-message', message: { id: `ransom_${Date.now()}`, sender: 'SYSTEM', text: `[SYS]: ${oppColor.toUpperCase()} King saved by King's Ransom!`, timestamp: Date.now(), category: 'log' } });
                            }
                        }
                    }
                    if (mate) {
                        if (room.tournamentId) handleTournamentGameOver(room.tournamentId, ws.roomId!, playerColor, 'checkmate');
                        else {
                            const winnerData = playerColor === 'white' ? gs.players.white : gs.players.black;
                            const loserData = playerColor === 'white' ? gs.players.black : gs.players.white;
                            const eloInfo: any = {};
                            if (winnerData && loserData) {
                                const changes = calculateEloChange(winnerData.elo || 1200, loserData.elo || 1200);
                                eloInfo[winnerData.userId] = { oldElo: winnerData.elo || 1200, newElo: (winnerData.elo || 1200) + changes.winnerGain };
                                eloInfo[loserData.userId] = { oldElo: loserData.elo || 1200, newElo: (loserData.elo || 1200) + changes.loserLoss };
                            }
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'checkmate', eloInfo, goldEarned: {}, moveCount: gs.gameMoveCounter });
                        }
                        return;
                    }
                    const hash = boardToPositionHash(gs.board, gs.currentPlayer === 'white' ? 'black' : 'white', gs.enPassantTargetSquare);
                    const isFLM = movingPiece?.type && FRONTLINE_TYPES.includes(movingPiece.type);
                    if (wasCapture || isFLM) room.positionHistory = [hash]; else room.positionHistory.push(hash);
                    const repeats = room.positionHistory.filter(h => h === hash).length;
                    if (repeats >= 3) {
                        if (room.tournamentId) handleTournamentGameOver(room.tournamentId, ws.roomId!, 'draw', 'repetition');
                        else broadcastToRoom(ws.roomId!, { type: 'game-over', winner: 'draw', reason: 'repetition' });
                    } else {
                        const exT = result.extraTurn || false;
                        if (!exT && !isRewardMove) {
                            gs.currentPlayer = gs.currentPlayer === 'white' ? 'black' : 'white';
                            const { newBoard: bAP, levelChanges: pCh } = processPoisonDamage(gs.board, gs.currentPlayer);
                            gs.board = bAP; result.levelChanges = [...(result.levelChanges || []), ...pCh];
                        }
                        const evs = {
                            captured: wasCapture,
                            capturedType: (result.capturedPiece || result.obliteratedPieces?.[0] || result.smokeBombEvent?.piece)?.type,
                            obliterated: result.obliteratedPieces && result.obliteratedPieces.length > 0,
                            shroom: result.shroomConsumed, hero: result.promotedToHero,
                            rally: !!result.rallyCryTriggered, rallyPos: result.rallyCryTriggered?.square,
                            conversions: result.conversionEvents?.map(e => e.at) || [], reflection: result.reflectionOccurred,
                            ralliedSquares: result.ralliedSquares || [], extraTurn: exT,
                            resurrection: !!resurrectionEvent, resPos: resurrectionEvent?.square,
                            hydraSplit: result.hydraSplitOccurred, hydraSpawnSquares: result.hydraSpawnSquares,
                            resScroll: !!result.resurrectionScrollEvent, resScrollPos: result.resurrectionScrollEvent?.square,
                            levelChanges: result.levelChanges || [], stolen: !!result.stolenItem, stolenItem: result.stolenItem,
                            smokeBomb: !!result.smokeBombEvent, smokePos: result.smokeBombEvent?.square,
                            glassShard: result.glassShardTriggered, signal_horn: !!result.signalHornEvent,
                            signalHornTargetType: result.signalHornEvent?.piece.type,
                            soulLink: result.obliteratedPieces?.some(p => p.id.includes('_linked_')),
                            soulLinkCount: result.obliteratedPieces?.filter(p => p.id.includes('_linked_')).length,
                            shroomSpawned: shroomSpawnedEvent, shroomPos: shroomSpawnedEvent ? shroomSpawnPos : null
                        };
                        broadcastToRoom(ws.roomId!, { type: 'game-move', gameState: gs, move: movePayload, events: evs });
                    }
                    break;
                }
            }
        } catch (err) { console.error('[Server] Msg Error:', err); }
    });
    ws.on('close', () => {
        if (ws.userId) delete userConnections[ws.userId];
        arenaQueue = arenaQueue.filter(p => p.userId !== ws.userId);
        broadcastPresence();
        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => { console.log(`Server listening on port ${PORT}`); });
