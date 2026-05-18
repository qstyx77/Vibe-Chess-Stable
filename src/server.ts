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
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare } from './types';


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

const rankedQueue: { ws: WebSocket & { userId?: string, roomId?: string }; userId: string; elo: number; username: string; timestamp: number }[] = [];

const pieceValues: Record<string, number> = {
    'pawn': 1, 'commander': 1, 'infiltrator': 1,
    'knight': 3, 'hero': 3, 'bishop': 3,
    'rook': 5,
    'queen': 9,
    'king': 0
};

const chooseBestResurrectionPiece = (capturedPieces: Piece[]): Piece | null => {
    if (!capturedPieces || capturedPieces.length === 0) return null;
    return [...capturedPieces].sort((a,b) => (pieceValues[b.type] || 0) - (pieceValues[a.type] || 0))[0];
};

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

const onGameOver = (roomId: string, winner: PlayerColor | 'draw', reason: string, details: any = {}) => {
    const room = rooms[roomId];
    if (!room || room.gameState.gameInfo.gameOver) return;

    room.gameState.gameInfo.gameOver = true;
    room.gameState.gameInfo.winner = winner;
    
    let message = "";
    if (reason === 'checkmate') message = `Checkmate! ${winner === 'draw' ? 'Draw' : (room.gameState.players[winner]?.username || winner)} wins!`;
    else if (reason === 'stalemate') message = "Stalemate! It's a draw.";
    else if (reason === 'infiltration') message = `${room.gameState.players[winner as PlayerColor]?.username || winner} wins by Infiltration!`;
    else if (reason === 'timeout') message = `Timeout. ${winner === 'draw' ? 'Draw' : (room.gameState.players[winner as PlayerColor]?.username || winner)} wins!`;
    else if (reason === 'resign') message = `${room.gameState.players[details.resigningPlayer]?.username || details.resigningPlayer} resigned. ${room.gameState.players[winner as PlayerColor]?.username || winner} wins!`;
    
    room.gameState.gameInfo.message = message;

    let eloChanges = null;
    if (room.isRanked) {
        const whiteId = room.gameState.players.white.userId;
        const blackId = room.gameState.players.black.userId;
        const whiteElo = room.gameState.players.white.elo;
        const blackElo = room.gameState.players.black.elo;

        let whiteResult: 'win' | 'loss' | 'draw' = winner === 'white' ? 'win' : (winner === 'black' ? 'loss' : 'draw');
        let blackResult: 'win' | 'loss' | 'draw' = winner === 'black' ? 'win' : (winner === 'white' ? 'loss' : 'draw');

        const newWhiteElo = calculateElo(whiteElo, blackElo, whiteResult);
        const newBlackElo = calculateElo(blackElo, whiteElo, blackResult);

        eloChanges = {
            [whiteId]: { oldElo: whiteElo, newElo: newWhiteElo, wins: room.gameState.players.white.wins || 0, losses: room.gameState.players.white.losses || 0 },
            [blackId]: { oldElo: blackElo, newElo: newBlackElo, wins: room.gameState.players.black.wins || 0, losses: room.gameState.players.black.losses || 0 }
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

const finalizeTurn = (room: any, movingPlayerColor: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null = null) => {
    room.gameState.gameMoveCounter++;
    room.gameState.enPassantTargetSquare = newEnPassantTarget;

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

const startSpecialActionTimer = (roomId: string, actionType: 'commander-promo' | 'pawn-promo' | 'anvil-drop', actingPlayer: PlayerColor) => {
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
        if (roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] === undefined) {
            roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`] = 0;
        }
        roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`]++;
        const currentTimeoutCount = roomAfterTimeout.gameState[`${timedOutPlayer}Timeouts`];

        if (currentTimeoutCount >= 3) {
            const winnerOnTimeout = timedOutPlayer === 'white' ? 'black' : 'white';
            onGameOver(roomId, winnerOnTimeout, 'timeout', { timedOutPlayer });
            return;
        }

        if (actionType === 'anvil-drop') {
            const { playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = roomAfterTimeout.gameState.anvilDropContext;
            delete roomAfterTimeout.gameState.anvilDropContext;
            finalizeTurn(roomAfterTimeout, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget);
        } else if (actionType === 'commander-promo') {
            roomAfterTimeout.gameState.isAwaitingCommanderPromotion = false;
            const playerWhoActed = roomAfterTimeout.gameState.playerWhoGotFirstBlood;
            const opponent = playerWhoActed === 'white' ? 'black' : 'white';
            roomAfterTimeout.gameState.currentPlayer = opponent;
            finalizeTurn(roomAfterTimeout, playerWhoActed, false, null);
        } else if (actionType === 'pawn-promo') {
            const { player } = roomAfterTimeout.gameState.promotionContext;
            delete roomAfterTimeout.gameState.promotionContext;
            finalizeTurn(roomAfterTimeout, player, false, null);
        }
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
                    white: { userId: whitePlayer.userId, elo: whitePlayer.elo, username: whitePlayer.username },
                    black: { userId: blackPlayer.userId, elo: blackPlayer.elo, username: blackPlayer.username }
                }
            }
        };

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
                                white: data.user ? { userId: data.user.userId, username: data.user.username } : null,
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
                        roomToJoin.clients.push(ws);
                        roomToJoin.gameState.players.black = data.user ? { userId: data.user.userId, username: data.user.username } : null;
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
                        rankedQueue.push({ ws, userId: data.userId, elo: data.elo, username: data.username, timestamp: Date.now() });
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
                            room.gameState.isAwaitingCommanderPromotion = false;
                            const opponent = piece.color === 'white' ? 'black' : 'white';
                            room.gameState.currentPlayer = opponent;
                            broadcastToRoom(ws.roomId!, { type: 'commander-promo-finalized', fullGameState: room.gameState, lastPlayer: piece.color });
                            startServerTurnTimer(ws.roomId!);
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
                            const { extraTurn, anvilDropContext } = room.gameState.promotionContext || {};
                            delete room.gameState.promotionContext;
                            if (anvilDropContext) {
                                room.gameState.anvilDropContext = anvilDropContext;
                                broadcastToRoom(ws.roomId!, { type: 'awaiting-anvil-drop', player: piece.color, fullGameState: room.gameState });
                                startSpecialActionTimer(ws.roomId!, 'anvil-drop', piece.color);
                            } else {
                                finalizeTurn(room, piece.color, extraTurn);
                            }
                        }
                    }
                    break;
                case 'game-move':
                    if (room && data.payload) {
                        const movingPlayer = room.gameState.currentPlayer;
                        const { newBoard, capturedPiece, selfDestructCaptures, ...rest } = applyMove(room.gameState.board, data.payload, room.gameState.enPassantTargetSquare);
                        room.gameState.board = newBoard;
                        let caps = (capturedPiece ? 1 : 0) + (selfDestructCaptures?.length || 0) + (rest.pieceCapturedByAnvil ? 1 : 0);
                        
                        if (caps > 0 && !room.gameState.firstBloodAchieved) {
                            room.gameState.firstBloodAchieved = true;
                            room.gameState.playerWhoGotFirstBlood = movingPlayer;
                            room.gameState.isAwaitingCommanderPromotion = true;
                            broadcastToRoom(ws.roomId!, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
                            startSpecialActionTimer(ws.roomId!, 'commander-promo', movingPlayer);
                            return;
                        }

                        if (rest.infiltrationWin) {
                            onGameOver(ws.roomId!, movingPlayer, 'infiltration');
                            return;
                        }

                        const { row: tr, col: tc } = algebraicToCoords(data.payload.to);
                        const piece = newBoard[tr][tc].piece;
                        if (piece && piece.type === 'pawn' && (tr === 0 || tr === 7)) {
                            room.gameState.promotionContext = { square: data.payload.to, player: movingPlayer };
                            broadcastToRoom(ws.roomId!, { type: 'promotion-required', square: data.payload.to, player: movingPlayer, fullGameState: room.gameState });
                            startSpecialActionTimer(ws.roomId!, 'pawn-promo', movingPlayer);
                            return;
                        }

                        finalizeTurn(room, movingPlayer, rest.extraTurn, rest.enPassantTargetSet);
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
                const winner = room.gameState.players.white.userId === ws.userId ? 'black' : 'white';
                onGameOver(ws.roomId, winner, 'timeout');
            }
        }
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});