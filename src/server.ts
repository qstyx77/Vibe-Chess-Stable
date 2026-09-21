import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';

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
    FRONTLINE_TYPES
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType, InventoryItemType, ChatMessage, Move } from './types';


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

const rooms: Record<string, { clients: (WebSocket & { userId?: string, roomId?: string, username?: string })[]; gameState: any; isRanked: boolean; tournamentId?: string; round?: number; turnTimer?: NodeJS.Timeout; positionHistory: string[]; }> = {};
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

    // Store participant data and initialize rooms for Round 1
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
            clients: [], // Will be populated when they join via match-ready redirect
            isRanked: true,
            tournamentId: tournamentId,
            round: 1,
            positionHistory: [],
            gameState: {
                board,
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTargetSquare: null,
                gameMoveCounter: 0,
                lastMoveFrom: null,
                lastMoveTo: null,
                lastMovedPieceType: null,
                lastMovedPieceLevel: null,
                lastMovedPieceHeldItem: null,
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
    
    // Clear active rooms from previous round (they should already be gone but just in case)
    tournament.activeRoomIds.clear();

    for (let i = 0; i < winners.length; i += 2) {
        const p1Id = winners[i];
        const p2Id = winners[i+1];
        
        if (!p2Id) {
            // Bye logic
            tournament.roundWinners.push(p1Id);
            const ws = userConnections[p1Id];
            if (ws) ws.send(JSON.stringify({ type: 'tournament-intermission', round: tournament.round, nextRound: tournament.round + 1 }));
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
            gameState: {
                board,
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTargetSquare: null,
                gameMoveCounter: 0,
                lastMoveFrom: null,
                lastMoveTo: null,
                lastMovedPieceType: null,
                lastMovedPieceLevel: null,
                lastMovedPieceHeldItem: null,
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

    // Standard game-over broadcast to the room
    broadcastToRoom(roomId, { type: 'game-over', winner: winnerColor, reason });

    // Handle winner intermission
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
            // Wait 15 seconds before starting next round to allow re-equipping
            broadcastTournamentMessage(tournamentId, `Round ${tournament.round} complete! Next round starts in 15 seconds...`);
            tournament.countdownTimer = setTimeout(() => {
                startNextTournamentRound(tournamentId);
            }, 15000);
        } else {
            // Tournament Final Complete
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
                case 'join-tournament-queue':
                    if (!arenaQueue.find(p => p.userId === data.userId)) {
                        arenaQueue.push({ ws, userId: data.userId, userData: data.user });
                        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
                        if (arenaQueue.length >= 8) startArena();
                    }
                    break;
                case 'market-listing-broadcast':
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'chat-message',
                                message: {
                                    id: `market_${Date.now()}`,
                                    sender: 'SYSTEM',
                                    text: `[MARKET]: ${ws.username} listed 1x ${data.item} for ${data.price}g!`,
                                    timestamp: Date.now(),
                                    category: 'market'
                                }
                            }));
                        }
                    });
                    break;
                case 'chat-message':
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
                        gameState: {
                            board,
                            currentPlayer: 'white',
                            capturedPieces: { white: [], black: [] },
                            killStreaks: { white: 0, black: 0 },
                            enPassantTargetSquare: null,
                            gameMoveCounter: 0,
                            lastMoveFrom: null,
                            lastMoveTo: null,
                            lastMovedPieceType: null,
                            lastMovedPieceLevel: null,
                            lastMovedPieceHeldItem: null,
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
                    if (roomToJoin && roomToJoin.clients.length < 2) {
                        ws.roomId = data.roomId;
                        ws.userId = data.user?.userId;
                        ws.username = data.user?.username;
                        roomToJoin.clients.push(ws);
                        
                        // Sync room player data if missing (e.g. tournament auto-redirect)
                        if (!roomToJoin.gameState.players.white && data.color === 'white') roomToJoin.gameState.players.white = data.user;
                        if (!roomToJoin.gameState.players.black && data.color === 'black') roomToJoin.gameState.players.black = data.user;

                        // Apply gear for the joining player
                        const eq = data.user?.equipment || {};
                        const pColor = roomToJoin.clients.length === 1 ? 'white' : 'black';
                        roomToJoin.gameState.board.forEach((row: any) => row.forEach((sq: any) => {
                            if (sq.piece && sq.piece.color === pColor && eq[sq.piece.id]) {
                                sq.piece.heldItem = eq[sq.piece.id];
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
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && !room.gameState.board[row][col].piece && !room.gameState.board[row][col].item) {
                        room.gameState.board[row][col].item = { type: 'anvil' };
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { anvilDrop: true, dropPos: data.square }
                        });
                    }
                    break;
                }
                case 'holy-shield': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        room.gameState.board[row][col].piece.isShielded = true;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { shield: true, shieldPos: data.square }
                        });
                    }
                    break;
                }
                case 'archer-snipe': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        const sniped = room.gameState.board[row][col].piece;
                        room.gameState.capturedPieces[sniped.color].push(sniped);
                        room.gameState.board[row][col].piece = null;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { snipe: true, snipePos: data.square }
                        });
                    }
                    break;
                }
                case 'pawn-sacrifice': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.payload.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        const sacrificed = room.gameState.board[row][col].piece;
                        room.gameState.capturedPieces[sacrificed.color].push(sacrificed);
                        room.gameState.board[row][col].piece = null;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { sacrifice: true, sacPos: data.payload.square }
                        });
                    }
                    break;
                }
                case 'ks-resurrection': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { pieceId, square } = data.payload;
                    const { row, col } = algebraicToCoords(square);
                    const playerColor = room.clients[0] === ws ? 'white' : 'black';
                    const piece = room.gameState.capturedPieces[playerColor].find((p: Piece) => p.id === pieceId);
                    if (piece && isValidSquare(row, col) && !room.gameState.board[row][col].piece) {
                        const resPiece = { 
                            ...piece, 
                            id: `res_ks_${piece.id}_${Date.now()}`,
                            level: 1, 
                            hasMoved: true, 
                            isShielded: false, 
                            isPoisoned: false, 
                            cooldownTurnsRemaining: 0, 
                            frozenTurnsRemaining: 0 
                        };
                        room.gameState.board[row][col].piece = resPiece;
                        room.gameState.capturedPieces[playerColor] = room.gameState.capturedPieces[playerColor].filter((p: Piece) => p.id !== pieceId);
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { resurrection: true, resPos: square }
                        });
                    }
                    break;
                }
                case 'game-move': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const movePayload = data.payload as Move;
                    const gs = room.gameState;
                    
                    const playerColor = room.clients[0] === ws ? 'white' : 'black';
                    const isRewardMove = ['dance-swap', 'dance-move', 'anvil-drop', 'holy-shield', 'archer-snipe', 'pawn-sacrifice', 'ks-resurrection', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen'].includes(movePayload.type || '');
                    
                    if (gs.currentPlayer !== playerColor && !isRewardMove) break;

                    const fromSq = algebraicToCoords(movePayload.from);
                    const movingPiece = gs.board[fromSq.row][fromSq.col].piece;
                    if (!movingPiece && !isRewardMove) break;

                    const result = applyMove(gs.board, movePayload, gs.enPassantTargetSquare, gs.capturedPieces, gs.lastMovedPieceType, gs.lastMovedPieceHeldItem, gs.lastMovedPieceLevel, gs.didOpponentCaptureLastTurn);
                    
                    gs.board = result.newBoard;
                    gs.enPassantTargetSquare = result.enPassantTargetSet;
                    
                    let resurrectionEvent = null;
                    if (result.capturedPiece) {
                        const targetPile = result.capturedPiece.color;
                        if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                        gs.capturedPieces[targetPile].push(result.capturedPiece);
                        gs.killStreaks[playerColor]++;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (result.selfDestructCaptures?.length) {
                        result.selfDestructCaptures.forEach((p: Piece) => {
                            const targetPile = p.color;
                            if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                            gs.capturedPieces[targetPile].push(p);
                        });
                        gs.killStreaks[playerColor] += result.selfDestructCaptures.length;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (result.pieceCapturedByAnvil) {
                        const targetPile = result.pieceCapturedByAnvil.color;
                        if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                        gs.capturedPieces[targetPile].push(result.pieceCapturedByAnvil);
                        gs.killStreaks[playerColor]++;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (!isRewardMove) {
                        gs.killStreaks[playerColor] = 0;
                        gs.didOpponentCaptureLastTurn = false;
                    }

                    // Check for Rook/Palace Resurrection Call
                    const toCoords = algebraicToCoords(movePayload.to);
                    const landedPiece = gs.board[toCoords.row][toCoords.col].piece;
                    const wasCapture = !!(result.capturedPiece || result.pieceCapturedByAnvil || result.selfDestructCaptures?.length);
                    
                    if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && wasCapture) {
                        const resRes = processRookResurrectionCheck(
                            gs.board,
                            playerColor,
                            movePayload,
                            movePayload.to,
                            gs.lastMovedPieceLevel || 1,
                            gs.capturedPieces,
                            Date.now()
                        );
                        if (resRes.resurrectionPerformed) {
                            gs.board = resRes.boardWithResurrection;
                            gs.capturedPieces = resRes.capturedPiecesAfterResurrection;
                            resurrectionEvent = {
                                square: resRes.resurrectedSquareAlg,
                                piece: resRes.resurrectedPieceData
                            };
                        }
                    }

                    if (movingPiece) {
                        gs.lastMovedPieceType = movingPiece.type;
                        gs.lastMovedPieceLevel = movingPiece.level;
                        gs.lastMovedPieceHeldItem = movingPiece.heldItem;
                    }
                    
                    if (result.infiltrationWin) {
                        if (room.tournamentId) {
                            handleTournamentGameOver(room.tournamentId, ws.roomId!, playerColor, 'infiltration');
                        } else {
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'infiltration' });
                            delete rooms[ws.roomId!];
                        }
                        return;
                    }

                    const actingKingSq = gs.board.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === playerColor);
                    if (gs.killStreaks[playerColor] >= 8 && actingKingSq?.piece?.heldItem === 'kings_conquest') {
                        if (room.tournamentId) {
                            handleTournamentGameOver(room.tournamentId, ws.roomId!, playerColor, 'conquest');
                        } else {
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'conquest' });
                            delete rooms[ws.roomId!];
                        }
                        return;
                    }

                    const oppColor = playerColor === 'white' ? 'black' : 'white';
                    if (isCheckmate(gs.board, oppColor, gs.enPassantTargetSquare, gs.lastMovedPieceType, gs.lastMovedPieceHeldItem, gs.lastMovedPieceLevel)) {
                        if (room.tournamentId) {
                            handleTournamentGameOver(room.tournamentId, ws.roomId!, playerColor, 'checkmate');
                        } else {
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'checkmate' });
                            delete rooms[ws.roomId!];
                        }
                        return;
                    }
                    
                    const hash = boardToPositionHash(gs.board, gs.currentPlayer === 'white' ? 'black' : 'white', gs.enPassantTargetSquare);
                    const isFrontlineMove = movingPiece?.type && FRONTLINE_TYPES.includes(movingPiece.type);
                    if (result.capturedPiece || isFrontlineMove) {
                        room.positionHistory = [hash];
                    } else {
                        room.positionHistory.push(hash);
                    }

                    const repeats = room.positionHistory.filter(h => h === hash).length;
                    if (repeats >= 3) {
                        if (room.tournamentId) {
                             handleTournamentGameOver(room.tournamentId, ws.roomId!, 'draw', 'repetition');
                        } else {
                            broadcastToRoom(ws.roomId!, { type: 'game-over', winner: 'draw', reason: 'repetition' });
                            delete rooms[ws.roomId!];
                        }
                    } else {
                        if (!result.extraTurn && !isRewardMove) {
                            gs.currentPlayer = gs.currentPlayer === 'white' ? 'black' : 'white';
                        }
                        
                        const events = {
                            captured: wasCapture,
                            capturedType: (result.capturedPiece || result.pieceCapturedByAnvil)?.type,
                            selfDestructs: result.selfDestructCaptures?.length || 0,
                            shroom: result.shroomConsumed,
                            hero: result.promotedToHero,
                            rally: !!result.rallyCryTriggered,
                            rallyPos: result.rallyCryTriggered?.square,
                            conversions: result.conversionEvents?.map(e => e.at) || [],
                            reflection: result.reflectionOccurred,
                            ralliedSquares: result.ralliedSquares || [],
                            extraTurn: result.extraTurn,
                            resurrection: !!resurrectionEvent,
                            resPos: resurrectionEvent?.square,
                            hydraSplit: result.hydraSplitOccurred
                        };

                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: gs, 
                            move: movePayload,
                            events
                        });
                    }
                    break;
                }
            }
        } catch (err) { console.error('[Server] Msg Error:', err); }
    });
    ws.on('close', () => {
        if (ws.userId) delete userConnections[ws.userId];
        arenaQueue = arenaQueue.filter(p => p.userId !== ws.userId);
        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => { console.log(`Server listening on port ${PORT}`); });
