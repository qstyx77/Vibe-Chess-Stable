
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
    applyArchbishop,
    applyPalace,
    applyArcher,
    isQueenSacrificeRequired,
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType } from './types';


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

const rooms: Record<string, { clients: (WebSocket & { userId?: string, roomId?: string })[]; gameState: any; isRanked: boolean; turnTimer?: NodeJS.Timeout; }> = {};
let globalServerUniqueIdCounter = 10000;

const rankedQueue: { ws: WebSocket & { userId?: string, roomId?: string }; userId: string; elo: number; username: string; wins: number; losses: number; timestamp: number }[] = [];

const calculateElo = (playerElo: number, opponentElo: number, result: 'win' | 'loss' | 'draw') => {
    const K = 32;
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    let actualScore;
    if (result === 'win') actualScore = 1;
    else if (result === 'loss') actualScore = 0;
    else actualScore = 0.5;

    return Math.round(playerElo + K * (actualScore - expectedScore));
};

const getVCNChar = (type: PieceType) => {
    switch (type) {
      case 'commander': return 'C';
      case 'infiltrator': return 'I';
      case 'hero': return 'H';
      case 'archer': return 'AR';
      case 'archbishop': return 'AB';
      case 'palace': return 'PL';
      case 'knight': return 'N';
      case 'pawn': return '';
      default: return type.charAt(0).toUpperCase();
    }
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
    
    // Check Chain: 1. Commander Promo -> 2. Pawn Promo -> 3. KS Action -> 4. Queen Sacrifice
    if (room.gameState.pendingCommanderPromo) {
        broadcastToRoom(roomId, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
        startSpecialActionTimer(roomId, 'commander-promo', actingPlayer);
        return;
    }

    if (room.gameState.pendingPromotion) {
        const { square } = room.gameState.pendingPromotion;
        broadcastToRoom(roomId, { type: 'promotion-required', square, player: actingPlayer, fullGameState: room.gameState });
        startSpecialActionTimer(roomId, 'pawn-promo', actingPlayer);
        return;
    }

    if (room.gameState.pendingKSAction) {
        const { type, context } = room.gameState.pendingKSAction;
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
        delete room.gameState.pendingKSAction;
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
    const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare);

    if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare)) {
        onGameOver(room.clients[0].roomId, movingPlayerColor, 'checkmate');
        return;
    } else if (isStalemate(room.gameState.board, nextPlayer, room.gameState.enPassantTargetSquare)) {
        onGameOver(room.clients[0].roomId, 'draw', 'stalemate');
        return;
    }

    room.gameState.gameInfo = {
        message: inCheck ? "Check!" : " ",
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

        // Auto-finalize current special action if timed out
        if (actionType === 'queen-sacrifice') {
            roomAfterTimeout.gameState.isAwaitingPawnSacrifice = false;
        } else if (actionType === 'commander-promo') {
            roomAfterTimeout.gameState.pendingCommanderPromo = false;
        } else if (actionType === 'pawn-promo') {
            delete roomAfterTimeout.gameState.pendingPromotion;
        } else if (actionType === 'anvil-drop') {
            delete roomAfterTimeout.gameState.pendingKSAction;
        } else if (actionType === 'holy-shield') {
            delete roomAfterTimeout.gameState.pendingKSAction;
        } else if (actionType === 'archer-snipe') {
            delete roomAfterTimeout.gameState.pendingKSAction;
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
            
            const timedOutPlayerInCheck = isKingInCheck(roomAfterTimeout.gameState.board, timedOutPlayer, roomAfterTimeout.gameState.enPassantTargetSquare);
            
            if (roomAfterTimeout.gameState.whiteTimeouts >= 3 || roomAfterTimeout.gameState.blackTimeouts >= 3 || timedOutPlayerInCheck) {
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

        rooms[roomId] = {
            clients: [whitePlayer.ws, blackPlayer.ws],
            isRanked: true,
            gameState: {
                board: initializeBoard(),
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTargetSquare: null,
                gameMoveCounter: 0,
                lastMoveFrom: null,
                lastMoveTo: null,
                firstBloodAchieved: false,
                playerWhoGotFirstBlood: null,
                isAwaitingCommanderPromotion: false,
                gameInfo: { message: " ", isCheck: false, isCheckmate: false, isStalemate: false, gameOver: false },
                shroomSpawnCounter: 0,
                nextShroomSpawnTurn: Math.floor(Math.random() * 6) + 5,
                whiteTimeouts: 0,
                blackTimeouts: 0,
                specialActionId: 0,
                players: {
                    white: { userId: whitePlayer.userId, elo: whitePlayer.elo, username: whitePlayer.username, wins: whitePlayer.wins, losses: whitePlayer.losses },
                    black: { userId: blackPlayer.userId, elo: blackPlayer.elo, username: blackPlayer.username, wins: blackPlayer.wins, losses: blackPlayer.losses }
                }
            }
        };

        if (whitePlayer.elo >= 1500) rooms[roomId].gameState.board = applyArchbishop(rooms[roomId].gameState.board, 'white');
        if (whitePlayer.elo >= 1800) rooms[roomId].gameState.board = applyPalace(rooms[roomId].gameState.board, 'white');
        if (whitePlayer.elo >= 2100) rooms[roomId].gameState.board = applyArcher(rooms[roomId].gameState.board, 'white');
        if (blackPlayer.elo >= 1500) rooms[roomId].gameState.board = applyArchbishop(rooms[roomId].gameState.board, 'black');
        if (blackPlayer.elo >= 1800) rooms[roomId].gameState.board = applyPalace(rooms[roomId].gameState.board, 'black');
        if (blackPlayer.elo >= 2100) rooms[roomId].gameState.board = applyArcher(rooms[roomId].gameState.board, 'black');

        whitePlayer.ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'white', gameState: rooms[roomId].gameState }));
        blackPlayer.ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'black', gameState: rooms[roomId].gameState }));
        startServerTurnTimer(roomId);
    }
};
setInterval(processRankedQueue, 5000);


wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string }) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            const room = ws.roomId ? rooms[ws.roomId] : undefined;

            switch (data.type) {
                case 'chat-message':
                    if (room) {
                        broadcastToRoom(ws.roomId!, {
                            type: 'chat-message',
                            message: {
                                id: `msg_${Date.now()}`,
                                sender: data.sender,
                                text: data.text,
                                timestamp: Date.now(),
                                color: data.color
                            }
                        });
                    }
                    break;
                case 'create-room': {
                    const roomId = Math.random().toString(36).substring(2, 9);
                    ws.roomId = roomId;
                    ws.userId = data.user?.userId;
                    rooms[roomId] = {
                        clients: [ws],
                        isRanked: false,
                        gameState: {
                            board: initializeBoard(),
                            currentPlayer: 'white',
                            capturedPieces: { white: [], black: [] },
                            killStreaks: { white: 0, black: 0 },
                            enPassantTargetSquare: null,
                            gameMoveCounter: 0,
                            lastMoveFrom: null,
                            lastMoveTo: null,
                            firstBloodAchieved: false,
                            playerWhoGotFirstBlood: null,
                            isAwaitingCommanderPromotion: false,
                            gameInfo: { message: " ", isCheck: false, gameOver: false },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: Math.floor(Math.random() * 6) + 5,
                            whiteTimeouts: 0,
                            blackTimeouts: 0,
                            specialActionId: 0,
                            players: {
                                white: data.user ? { userId: data.user.userId, username: data.user.username, elo: data.user.elo, wins: data.user.wins, losses: data.user.losses } : null,
                                black: null
                            }
                        }
                    };
                    if (data.user?.elo >= 1500) rooms[roomId].gameState.board = applyArchbishop(rooms[roomId].gameState.board, 'white');
                    if (data.user?.elo >= 1800) rooms[roomId].gameState.board = applyPalace(rooms[roomId].gameState.board, 'white');
                    if (data.user?.elo >= 2100) rooms[roomId].gameState.board = applyArcher(rooms[roomId].gameState.board, 'white');
                    ws.send(JSON.stringify({ type: 'room-created', roomId, color: 'white', gameState: rooms[roomId].gameState }));
                    break;
                }
                case 'join-room': {
                    const roomToJoin = rooms[data.roomId];
                    if (roomToJoin && roomToJoin.clients.length < 2) {
                        ws.roomId = data.roomId;
                        ws.userId = data.user?.userId;
                        roomToJoin.clients.push(ws);
                        roomToJoin.gameState.players.black = data.user ? { userId: data.user.userId, username: data.user.username, elo: data.user.elo, wins: data.user.wins, losses: data.user.losses } : null;
                        if (data.user?.elo >= 1500) roomToJoin.gameState.board = applyArchbishop(roomToJoin.gameState.board, 'black');
                        if (data.user?.elo >= 1800) roomToJoin.gameState.board = applyPalace(roomToJoin.gameState.board, 'black');
                        if (data.user?.elo >= 2100) roomToJoin.gameState.board = applyArcher(roomToJoin.gameState.board, 'black');
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
                        rankedQueue.push({ ws, userId: data.userId, elo: data.elo, username: data.username, wins: data.wins, losses: data.losses, timestamp: Date.now() });
                    }
                    break;
                case 'leave-ranked-queue':
                    const idx = rankedQueue.findIndex(p => p.ws === ws);
                    if (idx > -1) rankedQueue.splice(idx, 1);
                    break;
                case 'commander-promo':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece && piece.type === 'pawn') {
                            piece.type = 'commander';
                            room.gameState.pendingCommanderPromo = false;
                            room.gameState.lastVCNMove = `[Promo-C]@${data.square}`;
                            triggerNextSpecialAction(room, piece.color);
                        }
                    }
                    break;
                case 'anvil-drop':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        room.gameState.board[row][col].item = { type: 'anvil' };
                        room.gameState.lastVCNMove = `+[A]@${data.square}`;
                        triggerNextSpecialAction(room, room.gameState.currentPlayer);
                    }
                    break;
                case 'holy-shield':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece) {
                            piece.isShielded = true;
                            triggerNextSpecialAction(room, room.gameState.currentPlayer);
                        }
                    }
                    break;
                case 'archer-snipe':
                    if (room && data.square) {
                        const { row, col } = algebraicToCoords(data.square);
                        const targetPiece = room.gameState.board[row]?.[col]?.piece;
                        if (targetPiece) {
                            const movingPlayer = room.gameState.currentPlayer;
                            room.gameState.capturedPieces[movingPlayer].push(targetPiece);
                            room.gameState.board[row][col].piece = null;
                            triggerNextSpecialAction(room, movingPlayer);
                        }
                    }
                    break;
                case 'finalize-promotion':
                    if (room && data.payload) {
                        const { square, promoteTo } = data.payload;
                        const { row, col } = algebraicToCoords(square);
                        const piece = room.gameState.board[row]?.[col]?.piece;
                        if (piece) {
                            piece.type = promoteTo;
                            delete room.gameState.pendingPromotion;
                            triggerNextSpecialAction(room, piece.color);
                        }
                    }
                    break;
                case 'pawn-sacrifice':
                    if (room && data.payload) {
                        const { square } = data.payload;
                        const { row, col } = algebraicToCoords(square);
                        const victim = room.gameState.board[row]?.[col]?.piece;
                        if (victim) {
                            room.gameState.capturedPieces[victim.color === 'white' ? 'black' : 'white'].push(victim);
                            room.gameState.board[row][col].piece = null;
                            room.gameState.isAwaitingPawnSacrifice = false;
                            triggerNextSpecialAction(room, victim.color);
                        }
                    }
                    break;
                case 'game-move':
                    if (room && data.payload) {
                        const movingPlayer = room.gameState.currentPlayer;
                        const movingPieceStart = room.gameState.board[algebraicToCoords(data.payload.from).row][algebraicToCoords(data.payload.from).col].piece;
                        const originalLevel = movingPieceStart?.level || 1;
                        
                        const { newBoard, capturedPiece, selfDestructCaptures, ...rest } = applyMove(room.gameState.board, data.payload, room.gameState.enPassantTargetSquare);
                        room.gameState.board = newBoard;
                        
                        const caps = (capturedPiece ? 1 : 0) + (selfDestructCaptures?.length || 0) + (rest.pieceCapturedByAnvil ? 1 : 0);
                        if (capturedPiece) room.gameState.capturedPieces[movingPlayer].push(capturedPiece);
                        if (selfDestructCaptures) selfDestructCaptures.forEach(p => room.gameState.capturedPieces[movingPlayer].push(p));
                        if (rest.pieceCapturedByAnvil) room.gameState.capturedPieces[movingPlayer].push(rest.pieceCapturedByAnvil);

                        room.gameState.lastMoveFrom = data.payload.from;
                        room.gameState.lastMoveTo = data.payload.to;

                        const oldStreak = room.gameState.killStreaks[movingPlayer];
                        if (caps > 0) {
                            room.gameState.killStreaks[movingPlayer] += caps;
                        } else {
                            room.gameState.killStreaks[movingPlayer] = 0;
                        }
                        const newStreak = room.gameState.killStreaks[movingPlayer];

                        // Chain logic: Build pending actions
                        room.gameState.isPendingExtraTurn = rest.extraTurn || (newStreak >= 6);
                        room.gameState.pendingEnPassantTarget = rest.enPassantTargetSet;

                        if (caps > 0 && !room.gameState.firstBloodAchieved) {
                            room.gameState.firstBloodAchieved = true;
                            room.gameState.playerWhoGotFirstBlood = movingPlayer;
                            room.gameState.pendingCommanderPromo = true;
                        }

                        const { row: tr } = algebraicToCoords(data.payload.to);
                        const landedPiece = newBoard[tr][algebraicToCoords(data.payload.to).col].piece;
                        if (landedPiece && landedPiece.type === 'pawn' && (tr === 0 || tr === 7)) {
                            room.gameState.pendingPromotion = { square: data.payload.to };
                        }

                        if (newStreak >= 2 && oldStreak < 2 && newBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === movingPlayer)) {
                            room.gameState.pendingKSAction = { type: 'holy-shield', context: { playerWhoseTurnCompleted: movingPlayer, isExtraTurn: room.gameState.isPendingExtraTurn, newEnPassantTarget: rest.enPassantTargetSet } };
                        } else if (newStreak >= 5 && oldStreak < 5 && newBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === movingPlayer)) {
                            room.gameState.pendingKSAction = { type: 'archer-snipe', context: { playerWhoseTurnCompleted: movingPlayer, isExtraTurn: room.gameState.isPendingExtraTurn, newEnPassantTarget: rest.enPassantTargetSet } };
                        } else if (newStreak >= 3 && oldStreak < 3) {
                            room.gameState.pendingKSAction = { type: 'anvil-drop', context: { playerWhoseTurnCompleted: movingPlayer, isExtraTurn: room.gameState.isPendingExtraTurn, newEnPassantTarget: rest.enPassantTargetSet } };
                        }

                        if (isQueenSacrificeRequired(newBoard, movingPlayer, data.payload, originalLevel)) {
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
