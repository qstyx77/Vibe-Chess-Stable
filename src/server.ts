
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
    isItemValidForPiece
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType, InventoryItemType, ChatMessage } from './types';


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

const rooms: Record<string, { clients: (WebSocket & { userId?: string, roomId?: string, username?: string })[]; gameState: any; isRanked: boolean; turnTimer?: NodeJS.Timeout; positionHistory: string[]; }> = {};
const userConnections: Record<string, (WebSocket & { userId?: string, roomId?: string, username?: string })> = {};
let globalServerUniqueIdCounter = 10000;

const rankedQueue: { ws: WebSocket & { userId?: string, roomId?: string }; userId: string; elo: number; username: string; wins: number; losses: number; equipment?: Record<string, string>; unlockedPieces?: string[]; timestamp: number }[] = [];

const calculateElo = (playerElo: number, opponentElo: number, result: 'win' | 'loss' | 'draw') => {
    const K = 32;
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    let actualScore;
    if (result === 'win') actualScore = 1;
    else if (result === 'loss') actualScore = 0;
    else actualScore = 0.5;

    return Math.round(playerElo + K * (actualScore - expectedScore));
};

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
    const onlineUserIds = Object.keys(userConnections);
    const msg = JSON.stringify({ type: 'presence-update', userIds: onlineUserIds });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
};

const applyEquipment = (b: any, equip: Record<string, string> | undefined, targetColor: PlayerColor) => {
  if(!equip) return b;
  return b.map((row: any) => row.map((sq: any) => {
    if (sq.piece && sq.piece.color === targetColor) {
      const lobbyEquivalentId = sq.piece.id.replace(/^[wb]/, 'w');
      if (equip[lobbyEquivalentId]) {
        return { ...sq, piece: { ...sq.piece, heldItem: equip[lobbyEquivalentId] } };
      }
    }
    return sq;
  }));
};

const onGameOver = (roomId: string, winner: PlayerColor | 'draw', reason: string, details: any = {}) => {
    const room = rooms[roomId];
    if (!room || room.gameState.gameInfo.gameOver) return;

    room.gameState.gameInfo.gameOver = true;
    room.gameState.gameInfo.winner = winner;
    
    const whitePlayer = room.gameState.players.white;
    const blackPlayer = room.gameState.players.black;
    
    let message = "";
    if (reason === 'checkmate') message = `Checkmate! ${winner === 'draw' ? 'Draw' : (room.gameState.players[winner as PlayerColor]?.username || winner)} wins!`;
    else if (reason === 'auto-checkmate') message = `Auto-Checkmate! ${room.gameState.players[winner as PlayerColor]?.username || winner} wins!`;
    else if (reason === 'self-check') message = `Checkmate! ${room.gameState.players[winner as PlayerColor]?.username || winner} wins by self-check!`;
    else if (reason === 'stalemate') message = "Stalemate! It's a draw.";
    else if (reason === 'threefold-repetition') message = "Draw by Threefold Repetition!";
    else if (reason === 'infiltration') message = `${room.gameState.players[winner as PlayerColor]?.username || winner} wins by Infiltration!`;
    else if (reason === 'timeout') message = `Timeout. ${winner === 'draw' ? 'Draw' : (room.gameState.players[winner as PlayerColor]?.username || winner)} wins!`;
    else if (reason === 'self-check-timeout') message = `${room.gameState.players[details.timedOutPlayer]?.username || details.timedOutPlayer} ran out of time in check. ${room.gameState.players[winner as PlayerColor]?.username || winner} wins!`;
    else if (reason === 'resign') message = `${room.gameState.players[details.resigningPlayer]?.username || details.resigningPlayer} resigned. ${room.gameState.players[winner as PlayerColor]?.username || winner} wins!`;
    
    room.gameState.gameInfo.message = message;

    let eloChanges = null;
    if (room.isRanked) {
        const whiteId = whitePlayer.userId;
        const blackId = blackPlayer.userId;
        const whiteElo = whitePlayer.elo;
        const blackElo = blackPlayer.elo;

        let whiteResult: 'win' | 'loss' | 'draw' = winner === 'white' ? 'win' : (winner === 'black' ? 'loss' : 'draw');
        let blackResult: 'win' | 'loss' | 'draw' = winner === 'black' ? 'win' : (winner === 'white' ? 'loss' : 'draw');

        const newWhiteElo = calculateElo(whiteElo, blackElo, whiteResult);
        const newBlackElo = calculateElo(blackElo, whiteElo, blackResult);

        eloChanges = {
            [whiteId]: { 
              oldElo: whiteElo, 
              newElo: newWhiteElo, 
              wins: whitePlayer.wins || 0, 
              losses: whitePlayer.losses || 0 
            },
            [blackId]: { 
              oldElo: blackElo, 
              newElo: newBlackElo, 
              wins: blackPlayer.wins || 0, 
              losses: blackPlayer.losses || 0 
            }
        };
    }

    broadcastToRoom(roomId, {
        type: 'game-over',
        winner,
        reason,
        eloChanges,
        ...details
    });

    if (room.turnTimer) clearTimeout(room.turnTimer);
};

const triggerNextSpecialAction = (room: any, actingPlayer: PlayerColor) => {
    const roomId = room.clients[0].roomId;
    
    if (room.gameState.pendingCommanderPromo) {
        broadcastToRoom(roomId, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
        startSpecialActionTimer(roomId, 'commander-promo', actingPlayer);
        return;
    }

    if (room.gameState.pendingPromotions && room.gameState.pendingPromotions.length > 0) {
        const nextPromo = room.gameState.pendingPromotions[0];
        broadcastToRoom(roomId, { 
            type: 'promotion-required', 
            square: nextPromo.square, 
            targetLevel: nextPromo.targetLevel, 
            player: actingPlayer, 
            fullGameState: room.gameState 
        });
        startSpecialActionTimer(roomId, 'pawn-promo', actingPlayer);
        return;
    }

    if (room.gameState.pendingKSActions && room.gameState.pendingKSActions.length > 0) {
        const nextAction = room.gameState.pendingKSActions.shift();
        const { type, context } = nextAction;
        
        if (type === 'holy-shield') {
            room.gameState.shieldContext = context;
            broadcastToRoom(roomId, { type: 'awaiting-shield-selection', player: actingPlayer, fullGameState: room.gameState });
            startSpecialActionTimer(roomId, 'holy-shield', actingPlayer);
        } else if (type === 'anvil-drop') {
            room.gameState.anvilDropContext = context;
            broadcastToRoom(roomId, { type: 'awaiting-anvil-drop', player: actingPlayer, fullGameState: room.gameState });
            startSpecialActionTimer(roomId, 'anvil-drop', actingPlayer);
        } else if (type === 'archer-snipe') {
            room.gameState.archerSnipeContext = context;
            broadcastToRoom(roomId, { type: 'awaiting-archer-snipe', player: actingPlayer, fullGameState: room.gameState });
            startSpecialActionTimer(roomId, 'archer-snipe', actingPlayer);
        }
        return;
    }

    if (room.gameState.pendingQueenSacrifice) {
        room.gameState.isAwaitingPawnSacrifice = true;
        broadcastToRoom(roomId, { type: 'awaiting-pawn-sacrifice', player: actingPlayer, fullGameState: room.gameState });
        startSpecialActionTimer(roomId, 'queen-sacrifice', actingPlayer);
        delete room.gameState.pendingQueenSacrifice;
        return;
    }

    finalizeTurn(room, actingPlayer, room.gameState.isPendingExtraTurn, room.gameState.pendingEnPassantTarget);
};

const finalizeTurn = (room: any, movingPlayerColor: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null = null) => {
    room.gameState.gameMoveCounter++;
    room.gameState.enPassantTargetSquare = newEnPassantTarget;
    delete room.gameState.isPendingExtraTurn;
    delete room.gameState.pendingEnPassantTarget;
    delete room.gameState.resurrectedSquare; 

    let currentShroomCounter = (room.gameState.shroomSpawnCounter || 0) + 1;
    room.gameState.shroomSpawnCounter = currentShroomCounter;
    if (currentShroomCounter >= (room.gameState.nextShroomSpawnTurn || 5)) {
        const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(room.gameState.board);
        if (shroomSpawnedAt) {
            room.gameState.board = boardAfterShroom;
            const newNextTurn = Math.floor(Math.random() * 6) + 5;
            room.gameState.shroomSpawnCounter = 0;
            room.gameState.nextShroomSpawnTurn = newNextTurn;
            broadcastToRoom(room.clients[0].roomId, { type: 'shroom-spawn', square: shroomSpawnedAt, nextTurn: newNextTurn });
        }
    }

    const nextPlayer = isExtraTurn ? movingPlayerColor : (movingPlayerColor === 'white' ? 'black' : 'white');
    
    const movingPlayerSelfCheck = isKingInCheck(room.gameState.board, movingPlayerColor, room.gameState.enPassantTargetSquare, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem);
    if (movingPlayerSelfCheck && !isExtraTurn) {
        onGameOver(room.clients[0].roomId, movingPlayerColor === 'white' ? 'black' : 'white', 'self-check');
        return;
    }

    const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem);

    if (inCheck && isExtraTurn) {
        onGameOver(room.clients[0].roomId, movingPlayerColor, 'auto-checkmate');
        return;
    }

    if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem)) {
        onGameOver(room.clients[0].roomId, movingPlayerColor, 'checkmate');
        return;
    } else if (isStalemate(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem)) {
        onGameOver(room.clients[0].roomId, 'draw', 'stalemate');
        return;
    }

    const rights = getCastlingRightsString(room.gameState.board);
    const hash = boardToPositionHash(room.gameState.board, nextPlayer, rights, room.gameState.enPassantTargetSquare);
    room.positionHistory.push(hash);
    const occurrences = room.positionHistory.filter((h: string) => h === hash).length;
    if (occurrences >= 3) {
        onGameOver(room.clients[0].roomId, 'draw', 'threefold-repetition');
        return;
    }

    room.gameState.gameInfo = {
        message: inCheck ? "Check!" : " ",
        isCheck: inCheck,
        playerWithKingInCheck: inCheck ? nextPlayer : null,
        isCheckmate: false,
        isStalemate: false,
        gameOver: false,
    };

    room.gameState.currentPlayer = nextPlayer;

    broadcastToRoom(room.clients[0].roomId, {
        type: 'game-move',
        fullGameState: room.gameState,
        lastPlayer: movingPlayerColor,
    });
    
    startServerTurnTimer(room.clients[0].roomId);
};

const startSpecialActionTimer = (roomId: string, actionType: string, actingPlayer: PlayerColor) => {
    const room = rooms[roomId];
    if (!room || room.gameState.gameInfo.gameOver) return;

    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
    }
    
    const specialActionId = (room.gameState.specialActionId || 0) + 1;
    room.gameState.specialActionId = specialActionId;

    room.turnTimer = setTimeout(() => {
        const roomAfterTimeout = rooms[roomId];
        if (!roomAfterTimeout || roomAfterTimeout.gameState.gameInfo.gameOver || roomAfterTimeout.gameState.specialActionId !== specialActionId) {
            return;
        }

        const timedOutPlayer = actingPlayer;
        const opponent = timedOutPlayer === 'white' ? 'black' : 'white';
        
        if (roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] === undefined) {
            roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] = 0;
        }
        roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`]++;
        
        if (roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] >= 3) {
            onGameOver(roomId, opponent, 'timeout', { timedOutPlayer });
            return;
        }

        if (actionType === 'queen-sacrifice') {
            roomAfterTimeout.gameState.isAwaitingPawnSacrifice = false;
        } else if (actionType === 'commander-promo') {
            roomAfterTimeout.gameState.pendingCommanderPromo = false;
        } else if (actionType === 'pawn-promo') {
            if (roomAfterTimeout.gameState.pendingPromotions) {
                roomAfterTimeout.gameState.pendingPromotions.shift();
            }
        }

        triggerNextSpecialAction(roomAfterTimeout, actingPlayer);
    }, 15000);
};

const startServerTurnTimer = (roomId: string) => {
    const room = rooms[roomId];
    if (!room || room.gameState.gameInfo.gameOver) return;

    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
    }

    const currentMoveCounter = room.gameState.gameMoveCounter;
    const playerToMove = room.gameState.currentPlayer;

    room.turnTimer = setTimeout(() => {
        const roomAfterTimeout = rooms[roomId];
        if (roomAfterTimeout && roomAfterTimeout.gameState.gameMoveCounter === currentMoveCounter && !roomAfterTimeout.gameState.gameInfo.gameOver) {
            const timedOutPlayer = playerToMove;
            const opponent = timedOutPlayer === 'white' ? 'black' : 'white';

            if (timedOutPlayer === 'white') roomAfterTimeout.gameState.whiteTimeouts++;
            else roomAfterTimeout.gameState.blackTimeouts++;
            
            const timedOutPlayerInCheck = isKingInCheck(roomAfterTimeout.gameState.board, timedOutPlayer, roomAfterTimeout.gameState.enPassantTargetSquare, roomAfterTimeout.gameState.lastMovedPieceType, roomAfterTimeout.gameState.lastMovedPieceHeldItem);
            
            if (roomAfterTimeout.gameState.whiteTimeouts >= 3 || roomAfterTimeout.gameState.blackTimeouts >= 3 || (timedOutPlayerInCheck && roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] > 0)) {
                onGameOver(roomId, opponent, timedOutPlayerInCheck ? 'self-check-timeout' : 'timeout', { timedOutPlayer });
                return;
            }

            roomAfterTimeout.gameState.currentPlayer = opponent;
            finalizeTurn(roomAfterTimeout, timedOutPlayer, false, roomAfterTimeout.gameState.enPassantTargetSquare);
        }
    }, 45000);
}

const processRankedQueue = async () => {
    if (rankedQueue.length < 2) return;

    while (rankedQueue.length >= 2) {
        const p1 = rankedQueue.shift()!;
        const p2 = rankedQueue.shift()!;

        const roomId = `ranked_${Math.random().toString(36).substring(2, 9)}`;
        const isP1White = Math.random() < 0.5;
        const whitePlayer = isP1White ? p1 : p2;
        const blackPlayer = isP1White ? p2 : p1;

        whitePlayer.ws.roomId = roomId;
        blackPlayer.ws.roomId = roomId;

        let board = initializeBoard(whitePlayer.elo, blackPlayer.elo, whitePlayer.unlockedPieces || [], blackPlayer.unlockedPieces || []);
        board = applyEquipment(board, whitePlayer.equipment, 'white');
        board = applyEquipment(board, blackPlayer.equipment, 'black');

        rooms[roomId] = {
            clients: [whitePlayer.ws, blackPlayer.ws],
            isRanked: true,
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
                lastMovedPieceHeldItem: null,
                firstBloodAchieved: false,
                playerWhoGotFirstBlood: null,
                isAwaitingCommanderPromotion: false,
                gameInfo: { message: " ", isCheck: false, isCheckmate: false, isStalemate: false, gameOver: false },
                shroomSpawnCounter: 0,
                nextShroomSpawnTurn: Math.floor(Math.random() * 6) + 5,
                whiteTimeouts: 0,
                blackTimeouts: 0,
                specialActionId: 0,
                players: {
                    white: { userId: whitePlayer.userId, elo: whitePlayer.elo, username: whitePlayer.username, wins: whitePlayer.wins, losses: whitePlayer.losses, unlockedPieces: whitePlayer.unlockedPieces },
                    black: { userId: blackPlayer.userId, elo: blackPlayer.elo, username: blackPlayer.username, wins: blackPlayer.wins, losses: blackPlayer.losses, unlockedPieces: blackPlayer.unlockedPieces }
                }
            }
        };

        whitePlayer.ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'white', gameState: rooms[roomId].gameState }));
        blackPlayer.ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'black', gameState: rooms[roomId].gameState }));
        startServerTurnTimer(roomId);
    }
};
setInterval(processRankedQueue, 5000);


wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string, username?: string }) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const room = ws.roomId ? rooms[ws.roomId] : undefined;
            const actingColor: PlayerColor = room && room.clients[0].userId === ws.userId ? 'white' : 'black';

            switch (data.type) {
                case 'identify':
                    ws.userId = data.userId;
                    ws.username = data.username;
                    userConnections[data.userId] = ws;
                    broadcastPresence();
                    break;
                case 'challenge-friend':
                    const friendWs = userConnections[data.friendId];
                    if (friendWs && friendWs.readyState === WebSocket.OPEN) {
                        friendWs.send(JSON.stringify({
                            type: 'chat-message',
                            message: {
                                id: `chal_${Date.now()}`,
                                sender: data.senderName,
                                senderId: ws.userId,
                                text: `Hero ${data.senderName} has challenged you to a duel!`,
                                timestamp: Date.now(),
                                category: 'social',
                                isChallenge: true,
                                challengeRoomId: data.roomId
                            }
                        }));
                    }
                    break;
                case 'chat-message':
                    const msg: ChatMessage = {
                        id: `msg_${Date.now()}`,
                        sender: data.sender,
                        senderId: data.senderId,
                        text: data.text,
                        timestamp: Date.now(),
                        color: data.color,
                        category: data.category
                    };
                    
                    if (data.category === 'battle' && ws.roomId) {
                        broadcastToRoom(ws.roomId, { type: 'chat-message', message: msg });
                    } else if (data.category === 'social') {
                        // WHISPER / PRIVATE MESSAGE (targetId or targetName)
                        if (data.targetId || data.targetName) {
                            let targetWs = null;
                            if (data.targetId) {
                                targetWs = userConnections[data.targetId];
                            } else if (data.targetName) {
                                // Resolve username to connection (case-insensitive)
                                targetWs = Object.values(userConnections).find(conn => 
                                    conn.username?.toLowerCase() === data.targetName.toLowerCase()
                                );
                            }

                            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                                // Send decorated message to target
                                targetWs.send(JSON.stringify({
                                    type: 'chat-message',
                                    message: {
                                        ...msg,
                                        text: `(Whisper from ${msg.sender}): ${data.text}`
                                    }
                                }));
                                // Send confirmation back to sender
                                ws.send(JSON.stringify({
                                    type: 'chat-message',
                                    message: {
                                        ...msg,
                                        text: `(Whisper to ${targetWs.username}): ${data.text}`
                                    }
                                }));
                            } else {
                                // Inform sender target is away
                                ws.send(JSON.stringify({
                                    type: 'chat-message',
                                    message: {
                                        id: `sys_${Date.now()}`,
                                        sender: 'SYSTEM',
                                        text: `Hero ${data.targetName || 'unknown'} is not in the realm.`,
                                        timestamp: Date.now(),
                                        category: 'log'
                                    }
                                }));
                            }
                        } else {
                            // GLOBAL SOCIAL BROADCAST
                            wss.clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ type: 'chat-message', message: msg }));
                                }
                            });
                        }
                    }
                    break;
                case 'create-room': {
                    const roomId = Math.random().toString(36).substring(2, 9);
                    ws.roomId = roomId;
                    ws.userId = data.user?.userId;
                    ws.username = data.user?.username;
                    
                    let board = initializeBoard(data.user?.elo || 1200, 1200, data.user?.unlockedPieces || []);
                    board = applyEquipment(board, data.user?.equipment, 'white');

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
                            lastMovedPieceHeldItem: null,
                            firstBloodAchieved: false,
                            playerWhoGotFirstBlood: null,
                            isAwaitingCommanderPromotion: false,
                            gameInfo: { message: " ", isCheck: false, gameOver: false },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: Math.floor(Math.random() * 6) + 5,
                            whiteTimeouts: 0,
                            blackTimeouts: 0,
                            specialActionId: 0,
                            players: {
                                white: data.user ? { userId: data.user.userId, username: data.user.username, elo: data.user.elo, wins: data.user.wins, losses: data.user.losses, equipment: data.user.equipment, unlockedPieces: data.user.unlockedPieces || [] } : null,
                                black: null
                            }
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
                        roomToJoin.gameState.players.black = data.user ? { userId: data.user.userId, username: data.user.username, elo: data.user.elo, wins: data.user.wins, losses: data.user.losses, equipment: data.user.equipment, unlockedPieces: data.user.unlockedPieces || [] } : null;
                        
                        const whiteElo = roomToJoin.gameState.players.white?.elo || 1200;
                        const blackElo = data.user?.elo || 1200;
                        const whiteUnlocks = roomToJoin.gameState.players.white?.unlockedPieces || [];
                        const blackUnlocks = data.user?.unlockedPieces || [];
                        
                        let newBoard = initializeBoard(whiteElo, blackElo, whiteUnlocks, blackUnlocks);

                        newBoard = applyEquipment(newBoard, roomToJoin.gameState.players.white?.equipment, 'white');
                        newBoard = applyEquipment(newBoard, data.user?.equipment, 'black');
                        
                        roomToJoin.gameState.board = newBoard;

                        ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId, color: 'black', gameState: roomToJoin.gameState }));
                        broadcastToRoom(data.roomId, { type: 'player-joined', gameState: roomToJoin.gameState });
                        startServerTurnTimer(data.roomId);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full.' }));
                    }
                    break;
                }
                case 'join-ranked-queue':
                    ws.userId = data.userId;
                    if (!rankedQueue.some(p => p.ws === ws)) {
                        rankedQueue.push({ 
                            ws, 
                            userId: data.userId, 
                            elo: data.elo, 
                            username: data.username, 
                            wins: data.wins, 
                            losses: data.losses, 
                            equipment: data.equipment, 
                            unlockedPieces: data.unlockedPieces || [],
                            timestamp: Date.now() 
                        });
                    }
                    break;
                case 'leave-ranked-queue':
                    const idx = rankedQueue.findIndex(p => p.ws === ws);
                    if (idx > -1) rankedQueue.splice(idx, 1);
                    break;
                case 'commander-promo':
                    if (room && data.square) {
                        if (!room.gameState.pendingCommanderPromo || actingColor !== room.gameState.playerWhoGotFirstBlood) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Illegal Commander Promotion.' }));
                            return;
                        }
                        const { row, col } = algebraicToCoords(data.square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece && piece.type === 'pawn' && piece.level === 1 && piece.color === actingColor) {
                            piece.type = 'commander';
                            delete room.gameState.pendingCommanderPromo;
                            broadcastToRoom(ws.roomId!, { type: 'commander-promo-finalized', fullGameState: room.gameState, lastPlayer: actingColor });
                            triggerNextSpecialAction(room, actingColor);
                        }
                    }
                    break;
                case 'anvil-drop':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        if (!room.gameState.board[row][col].piece && !room.gameState.board[row][col].item) {
                            room.gameState.board[row][col].item = { type: 'anvil' };
                            triggerNextSpecialAction(room, actingColor);
                        }
                    }
                    break;
                case 'holy-shield':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece && piece.color === actingColor && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== room.gameState.shieldContext.capturingPieceId) {
                            piece.isShielded = true;
                            delete room.gameState.shieldContext;
                            triggerNextSpecialAction(room, actingColor);
                        }
                    }
                    break;
                case 'archer-snipe':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        const targetPiece = room.gameState.board[row]?.[col]?.piece;
                        if (targetPiece && targetPiece.color !== actingColor && targetPiece.type !== 'king' && targetPiece.type !== 'queen') {
                            const archers = room.gameState.board.flat().filter((sq: any) => {
                                const p = sq.piece;
                                if (!p || p.color !== actingColor) return false;
                                if (p.type === 'archer') return true;
                                if (p.type === 'knight' && p.heldItem === 'shortbow' && getEffectiveLevel(room.gameState.board, sq.rowIndex, sq.colIndex) >= 3) return true;
                                return false;
                            }).map((sq: any) => sq.piece);
                            const responsibleArcher = archers.find((a: Piece) => a.level >= (targetPiece.level || 1));
                            
                            if (responsibleArcher) {
                                const gain = {pawn: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[targetPiece.type] || 0;
                                responsibleArcher.level += gain;

                                const targetPile = targetPiece.color;
                                room.gameState.capturedPieces[targetPile].push(targetPiece);
                                room.gameState.board[row][col].piece = null;
                                delete room.gameState.archerSnipeContext;
                                triggerNextSpecialAction(room, actingColor);
                            }
                        }
                    }
                    break;
                case 'finalize-promotion':
                    if (room && data.payload) {
                        const { square, promoteTo } = data.payload;
                        if (!room.gameState.pendingPromotions || room.gameState.pendingPromotions.length === 0 || actingColor !== room.gameState.currentPlayer) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Illegal Promotion.' }));
                            return;
                        }

                        const nextPromoInQueue = room.gameState.pendingPromotions[0];
                        if (nextPromoInQueue.square !== square) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Promoting wrong piece.' }));
                            return;
                        }

                        const { row, col } = algebraicToCoords(square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece && (piece.type === 'pawn' || piece.type === 'commander' || ['dancer', 'mimic', 'grappler', 'myco_mage'].includes(piece.type) || nextPromoInQueue.fromResurrection)) {
                            
                            if (piece.heldItem && !isItemValidForPiece(piece.heldItem, promoteTo)) {
                              ws.send(JSON.stringify({ type: 'equipment-returned', item: piece.heldItem }));
                              piece.heldItem = null;
                            }

                            piece.type = promoteTo;
                            piece.level = nextPromoInQueue.targetLevel || 1;
                            if (promoteTo === 'queen') piece.level = Math.min(piece.level, 7);
                            
                            if (piece.level >= 5) room.gameState.isPendingExtraTurn = true;

                            room.gameState.pendingPromotions.shift();
                            triggerNextSpecialAction(room, actingColor);
                        }
                    }
                    break;
                case 'pawn-sacrifice':
                    if (room && data.payload) {
                        const { square } = data.payload;
                        if (!room.gameState.isAwaitingPawnSacrifice || actingColor !== room.gameState.currentPlayer) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Illegal Sacrifice.' }));
                            return;
                        }
                        const { row, col } = algebraicToCoords(square);
                        const victim = room.gameState.board[row]?.[col]?.piece;
                        if (victim && (victim.type === 'pawn' || victim.type === 'commander' || ['dancer', 'mimic', 'grappler', 'myco_mage'].includes(victim.type)) && victim.color === actingColor) {
                            const targetPile = victim.color;
                            room.gameState.capturedPieces[targetPile].push(victim);
                            room.gameState.board[row][col].piece = null;
                            room.gameState.isAwaitingPawnSacrifice = false;
                            triggerNextSpecialAction(room, actingColor);
                        }
                    }
                    break;
                case 'game-move':
                    if (room && data.payload) {
                        const movingPlayer = room.gameState.currentPlayer;
                        if (actingColor !== movingPlayer) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Not your turn.' }));
                            return;
                        }

                        const { from, to, type: moveType } = data.payload;
                        const fromCoords = algebraicToCoords(from);
                        const movingPieceStart = room.gameState.board[fromCoords.row][fromCoords.col].piece;
                        
                        if (!movingPieceStart || movingPieceStart.color !== actingColor) {
                            ws.send(JSON.stringify({ type: 'error', message: 'No piece at source.' }));
                            return;
                        }

                        let isLegal = false;
                        if (moveType === 'grapple-throw') {
                            const {row: fr, col: fc} = fromCoords;
                            const {row: tr, col: tc} = algebraicToCoords(to);
                            const effLevel = getEffectiveLevel(room.gameState.board, fr, fc);
                            const dist = Math.max(Math.abs(fr-tr), Math.abs(fc-tc));
                            const isCardinal = fr === tr || fc === tc;
                            const isDiagonal = Math.abs(fr - tr) === Math.abs(fc - tc);
                            if (dist <= effLevel && (isCardinal || isDiagonal) && dist > 0) isLegal = true;
                        } else if (moveType === 'self-destruct' || ['resurrection-scroll', 'faith-scroll', 'ice-scroll', 'antidote', 'rally-scroll', 'shield-scroll', 'summon-anvil', 'wind-scroll', 'life-leach', 'swap-scroll', 'ice-blast', 'soul-harvest', 'earthquake-scroll', 'kings-decree', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen', 'demonic-possession'].includes(moveType)) {
                            const effLevel = getEffectiveLevel(room.gameState.board, fromCoords.row, fromCoords.col);
                            const hItem = movingPieceStart.heldItem;
                            if (from === to || ['tele-portobello', 'spore-bomb'].includes(moveType)) {
                                if (moveType === 'self-destruct' && effLevel >= 5 && ['knight', 'hero', 'archer'].includes(movingPieceStart.type)) isLegal = true;
                                if (moveType === 'resurrection-scroll' && hItem === 'resurrection_scroll' && effLevel >= 4) isLegal = true;
                                if (moveType === 'faith-scroll' && hItem === 'faith_scroll' && effLevel >= 5) isLegal = true;
                                if (moveType === 'ice-scroll' && hItem === 'ice_scroll' && effLevel >= 2) isLegal = true;
                                if (moveType === 'swap-scroll' && hItem === 'swap_scroll' && effLevel >= 3) isLegal = true;
                                if (moveType === 'shield-scroll' && hItem === 'shield_scroll' && effLevel >= 2) isLegal = true;
                                if (moveType === 'rally-scroll' && hItem === 'rally_scroll' && effLevel >= 3) isLegal = true;
                                if (moveType === 'kings-decree' && hItem === 'kings_decree' && movingPieceStart.type === 'king') isLegal = true;
                                if (moveType === 'ice-blast' && hItem === 'ice_blast') isLegal = true;
                                if (moveType === 'soul-harvest' && hItem === 'soul_harvest' && !(['king', 'queen'].includes(movingPieceStart.type))) isLegal = true;
                                if (moveType === 'earthquake-scroll' && hItem === 'earthquake_scroll' && effLevel >= 3) isLegal = true;
                                if (['wind-scroll', 'life-leach', 'summon-anvil', 'antidote'].includes(moveType)) isLegal = true;
                                if (['myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen'].includes(moveType)) isLegal = true;
                                
                                if (isLegal) {
                                    const tempBoard = room.gameState.board.map((r: any) => r.map((s: any) => ({...s, piece: s.piece ? {...s.piece} : null})));
                                    if (moveType === 'self-destruct') tempBoard[fromCoords.row][fromCoords.col].piece = null;
                                    if (isKingInCheck(tempBoard, actingColor, null, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem)) isLegal = false;
                                }
                            }
                        } else {
                            const legalMoves = getPossibleMoves(room.gameState.board, from, room.gameState.enPassantTargetSquare, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem);
                            if (legalMoves.includes(to)) isLegal = true;
                        }

                        if (!isLegal) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Illegal move attempted.' }));
                            return;
                        }

                        const originalLevel = movingPieceStart.level || 1;
                        const originalType = movingPieceStart.type;
                        const originalHeldItem = movingPieceStart.heldItem;
                        const { newBoard, capturedPiece, selfDestructCaptures, resurrectionScrollEvent, promotedToInfiltrator, itemReturned, multiPromotions, ...rest } = applyMove(room.gameState.board, data.payload, room.gameState.enPassantTargetSquare, room.gameState.capturedPieces, room.gameState.lastMovedPieceType, room.gameState.lastMovedPieceHeldItem);
                        
                        let finalizedBoard = newBoard;
                        const caps = (capturedPiece ? 1 : 0) + (selfDestructCaptures?.length || 0) + (rest.pieceCapturedByAnvil ? 1 : 0);
                        
                        if (itemReturned) {
                          ws.send(JSON.stringify({ type: 'equipment-returned', item: itemReturned }));
                        }

                        const isObliterationMove = promotedToInfiltrator || (movingPieceStart.type === 'infiltrator' && capturedPiece);

                        if (capturedPiece && !isObliterationMove) {
                            const targetPile = capturedPiece.color;
                            room.gameState.capturedPieces[targetPile].push(capturedPiece);
                        }
                        if (selfDestructCaptures) {
                            selfDestructCaptures.forEach(p => {
                                const targetPile = p.color;
                                room.gameState.capturedPieces[targetPile].push(p);
                            });
                        }
                        
                        if (resurrectionScrollEvent) {
                            const p = resurrectionScrollEvent.piece;
                            const targetPile = p.color;
                            room.gameState.capturedPieces[targetPile] = room.gameState.capturedPieces[targetPile].filter((pi: any) => pi.id !== p.id) ;
                            room.gameState.resurrectedSquare = resurrectionScrollEvent.square;
                        }

                        room.gameState.pendingPromotions = multiPromotions || [];

                        const toCoords = algebraicToCoords(to);
                        const pieceAtDest = finalizedBoard[toCoords.row][toCoords.col].piece;
                        if (pieceAtDest && (['rook', 'palace'].includes(pieceAtDest.type)) && caps > 0) {
                            const resResult = processRookResurrectionCheck(
                                finalizedBoard, movingPlayer, data.payload, to,
                                originalLevel, room.gameState.capturedPieces, globalServerUniqueIdCounter
                            );
                            if (resResult.resurrectionPerformed) {
                                finalizedBoard = resResult.boardWithResurrection;
                                room.gameState.capturedPieces = resResult.capturedPiecesAfterResurrection;
                                globalServerUniqueIdCounter = resResult.newResurrectionIdCounter!;
                                room.gameState.resurrectedSquare = resResult.resurrectedSquareAlg;
                                
                                if (resResult.promotionRequiredForResurrectedPawn) {
                                    room.gameState.pendingPromotions.push({ 
                                        square: resResult.resurrectedSquareAlg, 
                                        player: movingPlayer, 
                                        fromResurrection: true, 
                                        targetLevel: 1 
                                    } as any);
                                }
                            }
                        }

                        const oldStreak = room.gameState.killStreaks[movingPlayer];
                        if (caps > 0) room.gameState.killStreaks[movingPlayer] += caps;
                        else {
                            if (moveType !== 'swap' && !['resurrection-scroll', 'faith-scroll', 'ice-scroll', 'antidote', 'rally-scroll', 'shield-scroll', 'summon-anvil', 'wind-scroll', 'life-leach', 'swap-scroll', 'ice-blast', 'soul-harvest', 'earthquake-scroll', 'kings-decree', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen'].includes(moveType)) {
                                room.gameState.killStreaks[movingPlayer] = 0;
                            }
                        }
                        const newStreak = room.gameState.killStreaks[movingPlayer];

                        if (newStreak >= 4 && oldStreak < 4) {
                            const myPile = movingPlayer;
                            const myAvailableResurrections = room.gameState.capturedPieces[myPile];
                            if (myAvailableResurrections && myAvailableResurrections.length > 0) {
                                const sorted = [...myAvailableResurrections].sort((a, b) => (VAL_MAP[b.type] || 0) - (VAL_MAP[a.type] || 0));
                                const pieceToResurrect = sorted[0];
                                const emptySquares = [];
                                for (let r = 0; r < 8; r++) {
                                    for (let c = 0; c < 8; c++) {
                                        if (!finalizedBoard[r][c].piece && !finalizedBoard[r][c].item) {
                                            emptySquares.push({ r, c });
                                        }
                                    }
                                }
                                if (emptySquares.length > 0) {
                                    const spawnPos = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                                    const resurrectedPiece = {
                                        ...pieceToResurrect,
                                        level: 1,
                                        id: pieceToResurrect.id,
                                        hasMoved: true,
                                        isShielded: false,
                                        isPoisoned: false,
                                        cooldownTurnsRemaining: 0,
                                        frozenTurnsRemaining: 0,
                                        heldItem: pieceToResurrect.heldItem || null
                                    };
                                    const oppBackRank = movingPlayer === 'white' ? 0 : 7;
                                    if (resurrectedPiece.type === 'commander' && spawnPos.r === oppBackRank) {
                                        resurrectedPiece.type = 'hero';
                                    }
                                    finalizedBoard[spawnPos.r][spawnPos.c].piece = resurrectedPiece;
                                    room.gameState.capturedPieces[myPile] = myAvailableResurrections.filter(p => p.id !== pieceToResurrect.id);
                                    room.gameState.resurrectedSquare = coordsToAlgebraic(spawnPos.r, spawnPos.c);
                                    
                                    syncSoulLink(finalizedBoard, movingPlayer);

                                    if (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(resurrectedPiece.type) && spawnPos.r === oppBackRank) {
                                        room.gameState.pendingPromotions.push({ 
                                            square: room.gameState.resurrectedSquare, 
                                            player: movingPlayer, 
                                            fromResurrection: true, 
                                            targetLevel: 1 
                                        } as any);
                                    }
                                }
                            }
                        }

                        room.gameState.board = finalizedBoard;
                        room.gameState.lastMoveFrom = from;
                        room.gameState.lastMoveTo = to;
                        room.gameState.lastMovedPieceType = originalType;
                        room.gameState.lastMovedPieceHeldItem = originalHeldItem;

                        room.gameState.isPendingExtraTurn = rest.extraTurn || (oldStreak < 6 && newStreak >= 6);
                        room.gameState.pendingEnPassantTarget = rest.enPassantTargetSet;

                        if (caps > 0 && !room.gameState.firstBloodAchieved) {
                            room.gameState.firstBloodAchieved = true;
                            room.gameState.playerWhoGotFirstBlood = movingPlayer;
                            room.gameState.pendingCommanderPromo = true;
                        }

                        const landedPiece = finalizedBoard[toCoords.row][toCoords.col].piece;
                        if (landedPiece && ['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage', 'commander'].includes(landedPiece.type) && toCoords.row === (movingPlayer === 'white' ? 0 : 7)) {
                            room.gameState.pendingPromotions.push({ 
                                square: to, 
                                player: movingPlayer,
                                targetLevel: getPromotionLevel(capturedPiece?.type || rest.pieceCapturedByAnvil?.type || null)
                            });
                        }

                        room.gameState.pendingKSActions = [];

                        if (newStreak >= 2 && oldStreak < 2) {
                            const hasArchbishop = finalizedBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === movingPlayer);
                            if (hasArchbishop) {
                                const capturerId = finalizedBoard[toCoords.row][toCoords.col].piece?.id;
                                const eligibleTargets = finalizedBoard.flat().some(sq => sq.piece && sq.piece.color === movingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturerId);
                                if (eligibleTargets) {
                                    room.gameState.pendingKSActions.push({ type: 'holy-shield', context: { capturingPieceId: capturerId, playerWhoseTurnCompleted: movingPlayer } });
                                }
                            }
                        }

                        const snipers = finalizedBoard.flat().filter(sq => {
                            const p = sq.piece;
                            if (!p || p.color !== movingPlayer) return false;
                            if (p.type === 'archer') return true;
                            if (p.type === 'knight' && p.heldItem === 'shortbow' && getEffectiveLevel(finalizedBoard, sq.rowIndex, sq.colIndex) >= 3) return true;
                            return false;
                        }).map(sq => sq.piece);
                        const maxSniperLevel = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
                        const hasCrossbow = finalizedBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === movingPlayer && sq.piece.heldItem === 'crossbow');
                        
                        if ((newStreak >= 5 && oldStreak < 5 && snipers.length > 0) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow)) {
                            const opponentColorForSnipe = movingPlayer === 'white' ? 'black' : 'white';
                            const hasVictims = finalizedBoard.flat().some(sq => 
                                sq.piece && 
                                sq.piece.color === opponentColorForSnipe && 
                                sq.piece.level <= maxSniperLevel && 
                                sq.piece.type !== 'king' && 
                                sq.piece.type !== 'queen'
                            );
                            if (hasVictims) {
                                room.gameState.pendingKSActions.push({ type: 'archer-snipe', context: { playerWhoseTurnCompleted: movingPlayer } });
                            }
                        }

                        if (newStreak >= 3 && oldStreak < 3) {
                            room.gameState.pendingKSActions.push({ type: 'anvil-drop', context: { playerWhoseTurnCompleted: movingPlayer } });
                        }

                        if (isQueenSacrificeRequired(finalizedBoard, movingPlayer, data.payload, originalLevel, originalType)) {
                            room.gameState.pendingQueenSacrifice = true;
                        }

                        triggerNextSpecialAction(room, movingPlayer);
                    }
                    break;
                case 'resign':
                    if (room) {
                        const resigningPlayer = data.resigningPlayer;
                        const winner = resigningPlayer === 'white' ? 'black' : 'white';
                        onGameOver(ws.roomId!, winner, 'resign', { resigningPlayer });
                    }
                    break;
            }
        } catch (err) {
            console.error('[Server] Msg Error:', err);
        }
    });

    ws.on('close', () => {
        const qIdx = rankedQueue.findIndex(p => p.ws === ws);
        if (qIdx > -1) rankedQueue.splice(qIdx, 1);
        if (ws.userId) {
            if (userConnections[ws.userId] === ws) {
                delete userConnections[ws.userId];
                broadcastPresence();
            }
        }
        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room && !room.gameState.gameInfo.gameOver) {
                const winner = room.gameState.players.white?.userId === ws.userId ? 'black' : 'white';
                onGameOver(ws.roomId, winner, 'timeout');
            }
        }
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
