
import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from './firebase/config';


import { 
    initializeBoard, 
    applyMove, 
    isKingInCheck, 
    isCheckmate, 
    isStalemate, 
    getCastlingRightsString, 
    boardToPositionHash, 
    spawnAnvil, 
    spawnShroom, 
    processRookResurrectionCheck,
    coordsToAlgebraic,
    algebraicToCoords,
} from './lib/chess-utils';
import type { BoardState, PlayerColor, Piece, Move, GameStatus } from './types';


const server = http.createServer((req, res) => {
    // Add a guard to handle cases where req.url is undefined
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

const rooms: Record<string, { clients: (WebSocket & { userId?: string })[]; gameState: any; isRanked: boolean; turnTimer?: NodeJS.Timeout; }> = {};
let globalServerUniqueIdCounter = 10000;

// Ranked matchmaking queue
const rankedQueue: { ws: WebSocket & { userId?: string }; userId: string; elo: number; username: string; timestamp: number }[] = [];

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
        console.log(`[Server | broadcastToRoom] Broadcasting to room ${roomId}:`, message.type);
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
};

const startServerTurnTimer = (roomId: string) => {
    const room = rooms[roomId];
    if (!room || room.gameState.gameInfo.gameOver) return;

    // Clear any existing timer for this room
    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
    }

    const currentMoveCounter = room.gameState.gameMoveCounter;
    const playerToMove = room.gameState.currentPlayer;

    room.turnTimer = setTimeout(() => {
        const roomAfterTimeout = rooms[roomId];
        // Check if the game state has changed since the timer was set
        if (roomAfterTimeout && roomAfterTimeout.gameState.gameMoveCounter === currentMoveCounter && !roomAfterTimeout.gameState.gameInfo.gameOver) {
            console.log(`[Server] Timeout! Player ${playerToMove}'s turn has expired for move ${currentMoveCounter}.`);
            
            const timedOutPlayer = playerToMove;
            roomAfterTimeout.gameState.killStreaks[timedOutPlayer] = 0;

            const opponent = timedOutPlayer === 'white' ? 'black' : 'white';
            let winnerOnTimeout = opponent;
            let reason = 'timeout';

            if (timedOutPlayer === 'white') roomAfterTimeout.gameState.whiteTimeouts++;
            else roomAfterTimeout.gameState.blackTimeouts++;
            
            const timedOutPlayerInCheck = isKingInCheck(roomAfterTimeout.gameState.board, timedOutPlayer, roomAfterTimeout.gameState.enPassantTarget);
            if (timedOutPlayerInCheck) {
                reason = 'self-check-timeout';
            }
            
            if (roomAfterTimeout.gameState.whiteTimeouts >= 3 || roomAfterTimeout.gameState.blackTimeouts >= 3 || timedOutPlayerInCheck) {
                roomAfterTimeout.gameState.gameInfo.gameOver = true;
                roomAfterTimeout.gameState.gameInfo.winner = winnerOnTimeout;
                roomAfterTimeout.gameState.gameInfo.message = `${(roomAfterTimeout.gameState.players[timedOutPlayer] || {}).username || timedOutPlayer} ran out of time. ${winnerOnTimeout} wins!`;

                const broadcastMsg = { type: 'forfeit-timeout', timedOutPlayer, winner: winnerOnTimeout, reason };
                broadcastToRoom(roomId, broadcastMsg);
                if (roomAfterTimeout.turnTimer) clearTimeout(roomAfterTimeout.turnTimer);
                return;
            }

            roomAfterTimeout.gameState.currentPlayer = opponent;
            
            const inCheck = isKingInCheck(roomAfterTimeout.gameState.board, opponent, roomAfterTimeout.gameState.enPassantTarget);
            roomAfterTimeout.gameState.gameInfo.isCheck = inCheck;
            roomAfterTimeout.gameState.gameInfo.playerWithKingInCheck = inCheck ? opponent : null;
            roomAfterTimeout.gameState.gameInfo.message = inCheck ? "Check!" : `Timed out. It's now ${opponent}'s turn.`;

            const broadcastMsg = {
                type: 'game-move',
                fullGameState: roomAfterTimeout.gameState,
                lastPlayer: timedOutPlayer,
            };
            broadcastToRoom(roomId, broadcastMsg);

            startServerTurnTimer(roomId);
        }
    }, 45000);
}


const finalizeTurn = (room: any, movingPlayerColor: PlayerColor, isExtraTurn: boolean) => {
    console.log(`[Server | finalizeTurn] Finalizing turn for ${movingPlayerColor}. Extra Turn: ${isExtraTurn}`);
    room.gameState.gameMoveCounter++;

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

    const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTarget);
    let message = " ";
    let gameOver = false;
    let winner: PlayerColor | 'draw' | undefined = undefined;

    if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
        message = `Checkmate! ${(room.gameState.players[movingPlayerColor] || {}).username || movingPlayerColor} wins!`;
        gameOver = true;
        winner = movingPlayerColor;
    } else if (isStalemate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
        message = "Stalemate! It's a draw.";
        gameOver = true;
        winner = 'draw';
    } else if (inCheck) {
        message = "Check!";
    }

    room.gameState.gameInfo = {
        message: message,
        isCheck: inCheck,
        playerWithKingInCheck: inCheck ? nextPlayer : null,
        isCheckmate: gameOver && winner === movingPlayerColor,
        isStalemate: gameOver && winner === 'draw',
        gameOver: gameOver,
        winner: winner,
    };

    room.gameState.currentPlayer = nextPlayer;

    if (gameOver && room.isRanked) {
        // Elo logic would go here
    }

    console.log(`[Server | finalizeTurn] Broadcasting "game-move" to room ${room.clients[0].roomId}.`);
    broadcastToRoom(room.clients[0].roomId, {
        type: 'game-move',
        fullGameState: room.gameState,
        lastPlayer: movingPlayerColor,
    });
    
    if (!room.gameState.gameInfo.gameOver) {
        startServerTurnTimer(room.clients[0].roomId);
    }
};

const processRankedQueue = async () => {
    if (rankedQueue.length < 2) {
        return;
    }

    rankedQueue.sort((a, b) => a.elo - b.elo);

    while (rankedQueue.length >= 2) {
        const player1Data = rankedQueue.shift()!;
        const player2Data = rankedQueue.shift()!;

        const roomId = `ranked_${Math.random().toString(36).substring(2, 9)}`;
        const player1Ws = player1Data.ws;
        const player2Ws = player2Data.ws;

        player1Ws.roomId = roomId;
        player2Ws.roomId = roomId;

        rooms[roomId] = {
            clients: [player1Ws, player2Ws],
            isRanked: true,
            gameState: {
                board: initializeBoard(),
                currentPlayer: 'white',
                capturedPieces: { white: [], black: [] },
                killStreaks: { white: 0, black: 0 },
                enPassantTarget: null,
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
                players: {
                    white: { userId: player1Data.userId, elo: player1Data.elo, username: player1Data.username },
                    black: { userId: player2Data.userId, elo: player2Data.elo, username: player2Data.username }
                }
            }
        };

        player1Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'white', gameState: rooms[roomId].gameState }));
        player2Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'black', gameState: rooms[roomId].gameState }));
        startServerTurnTimer(roomId);
    }
};
setInterval(processRankedQueue, 10000);


wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string }) => {
    console.log('[Server] A client connected.');
    ws.roomId = undefined;
    ws.userId = undefined;

    ws.on('message', async (message) => {
        try {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch (e) {
                console.log('[Server] Failed to parse message:', e);
                return;
            }
            
            const room = ws.roomId ? rooms[ws.roomId] : undefined;

            if (room && room.turnTimer) {
                clearTimeout(room.turnTimer);
            }

            console.log('[Server] Received message:', data.type, data.payload || data);


            if (!ws.roomId && data.type !== 'create-room' && data.type !== 'join-room' && data.type !== 'join-ranked-queue') {
                console.log(`[Server] Message of type ${data.type} rejected because client is not in a room.`);
                return;
            }
            
            switch (data.type) {
                case 'create-room': {
                    const roomId = Math.random().toString(36).substring(2, 9);
                    ws.roomId = roomId;
                    if (data.user) { ws.userId = data.user.userId; }
                    rooms[roomId] = {
                        clients: [ws],
                        isRanked: false,
                        gameState: {
                            board: initializeBoard(),
                            currentPlayer: 'white',
                            capturedPieces: { white: [], black: [] },
                            killStreaks: { white: 0, black: 0 },
                            enPassantTarget: null,
                            gameMoveCounter: 0,
                            lastMoveFrom: null,
                            lastMoveTo: null,
                            firstBloodAchieved: false,
                            playerWhoGotFirstBlood: null,
                            isAwaitingCommanderPromotion: false,
                            resurrectedSquare: null,
                            gameInfo: {
                                message: " ",
                                isCheck: false,
                                playerWithKingInCheck: null,
                                isCheckmate: false,
                                isStalemate: false,
                                gameOver: false,
                            },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: Math.floor(Math.random() * 6) + 5,
                            whiteTimeouts: 0,
                            blackTimeouts: 0,
                            players: {
                                white: data.user ? { userId: data.user.userId, username: data.user.username } : null,
                                black: null
                            }
                        }
                    };
                    ws.send(JSON.stringify({ type: 'room-created', roomId: roomId, color: 'white', gameState: rooms[roomId].gameState }));
                    break;
                }
                case 'join-room': {
                    const roomIdToJoin = data.roomId;
                    const roomToJoin = rooms[roomIdToJoin];
                    if (roomToJoin && roomToJoin.clients.length < 2) {
                        ws.roomId = roomIdToJoin;
                        if (data.user) { ws.userId = data.user.userId; }
                        roomToJoin.clients.push(ws);
                        roomToJoin.gameState.players.black = data.user ? { userId: data.user.userId, username: data.user.username } : null;

                        ws.send(JSON.stringify({ type: 'room-joined', roomId: roomIdToJoin, color: 'black', gameState: roomToJoin.gameState }));
                        
                        broadcastToRoom(roomIdToJoin, { type: 'player-joined', gameState: roomToJoin.gameState });
                        startServerTurnTimer(roomIdToJoin);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                    }
                    break;
                }
                case 'join-ranked-queue': {
                    const { userId, username, elo } = data;
                    if (!userId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'User ID is required for ranked play.' }));
                        return;
                    }
                    ws.userId = userId;

                    const existingPlayer = rankedQueue.find(p => p.ws === ws);
                    if (!existingPlayer) {
                        rankedQueue.push({ ws, userId, elo, username, timestamp: Date.now() });
                    }
                    break;
                }
                case 'leave-ranked-queue': {
                    const index = rankedQueue.findIndex(p => p.ws === ws);
                    if (index > -1) {
                        rankedQueue.splice(index, 1);
                    }
                    break;
                }
                case 'commander-promo': {
                    if (!room || !data.square) break;

                    const { row, col } = require('./lib/chess-utils.js').algebraicToCoords(data.square);
                    const piece = room.gameState.board[row]?.[col]?.piece;
                    const playerWhoActed = room.gameState.playerWhoGotFirstBlood;
                    
                    if (piece && piece.color === playerWhoActed && piece.type === 'pawn' && piece.level === 1) {
                        piece.type = 'commander';
                        piece.id = `${piece.id}_CMD_SRV`;
                        
                        room.gameState.isAwaitingCommanderPromotion = false;
                        
                        const opponent = playerWhoActed === 'white' ? 'black' : 'white';
                        room.gameState.currentPlayer = opponent;
                        
                        const inCheck = isKingInCheck(room.gameState.board, opponent, room.gameState.enPassantTarget);
                        if (isCheckmate(room.gameState.board, opponent, room.gameState.enPassantTarget)) {
                            room.gameState.gameInfo = { message: `Checkmate! ${playerWhoActed} wins!`, isCheck: true, playerWithKingInCheck: opponent, isCheckmate: true, gameOver: true, winner: playerWhoActed };
                        } else if (isStalemate(room.gameState.board, opponent, room.gameState.enPassantTarget)) {
                            room.gameState.gameInfo = { message: "Stalemate! It's a draw.", isCheck: false, playerWithKingInCheck: null, isStalemate: true, gameOver: true, winner: 'draw' };
                        } else {
                            room.gameState.gameInfo = { ...room.gameState.gameInfo, message: inCheck ? "Check!" : " ", isCheck: inCheck, playerWithKingInCheck: inCheck ? opponent : null, gameOver: false };
                        }
                        
                        broadcastToRoom(ws.roomId, {
                            type: 'commander-promo-finalized',
                            fullGameState: room.gameState,
                            lastPlayer: playerWhoActed
                        });

                        if (!room.gameState.gameInfo.gameOver) {
                            startServerTurnTimer(ws.roomId);
                        }
                    }
                    break;
                }
                case 'finalize-promotion': {
                    console.log('[Server | finalize-promotion] Received:', data.payload);
                    if (!room || !data.payload) {
                        console.log('[Server | finalize-promotion] Rejected: no room or payload.');
                        break;
                    }
                
                    const { square, promoteTo } = data.payload;
                    const { row, col } = algebraicToCoords(square);
                    const piece = room.gameState.board[row]?.[col]?.piece;
                
                    if (piece && (piece.type === 'pawn' || piece.type === 'commander')) {
                        console.log(`[Server | finalize-promotion] Promoting piece at ${square} to ${promoteTo}.`);
                        const promotingPlayerColor = piece.color;
                
                        piece.type = promoteTo;
                        if(promoteTo === 'queen') {
                            piece.level = Math.min(piece.level, 7);
                        }
                
                        const { extraTurn, anvilDropContext } = room.gameState.promotionContext || {};
                        delete room.gameState.promotionContext;

                        if (anvilDropContext) {
                            room.gameState.anvilDropContext = anvilDropContext;
                            broadcastToRoom(ws.roomId, {
                                type: 'awaiting-anvil-drop',
                                player: promotingPlayerColor,
                                fullGameState: room.gameState,
                            });
                        } else {
                            finalizeTurn(room, promotingPlayerColor, extraTurn || false);
                        }
                    } else {
                        console.log(`[Server | finalize-promotion] Finalize-promotion failed: no valid piece found at ${square}. Piece is:`, piece);
                    }
                    break;
                }
                case 'anvil-drop': {
                    if (!room || !data.square) break;

                    const { row, col } = algebraicToCoords(data.square);
                    if (room.gameState.board[row]?.[col]?.piece || room.gameState.board[row]?.[col]?.item) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid anvil placement.' }));
                        return;
                    }
                    room.gameState.board[row][col].item = { type: 'anvil' };

                    const { playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = room.gameState.anvilDropContext;
                    delete room.gameState.anvilDropContext;

                    finalizeTurn(room, playerWhoseTurnCompleted, isExtraTurn);
                    break;
                }
                case 'game-move': {
                    if (!room || !data.payload) {
                        console.log('[Server | game-move] Rejected: no room or payload.');
                        return;
                    }

                    const movingPlayerColor = room.gameState.currentPlayer;
                    const movingPlayerInfo = room.gameState.players[movingPlayerColor];
                    if (room.clients.length > 1 && movingPlayerInfo && movingPlayerInfo.userId && movingPlayerInfo.userId !== ws.userId) {
                        console.log(`[Server | game-move] Rejected: Out of turn move by ${ws.userId}. It is ${movingPlayerColor}'s turn (${movingPlayerInfo.userId}).`);
                        return;
                    }

                    console.log(`[Server | game-move] Processing move for player: ${movingPlayerColor}`, data.payload);

                    const { payload: move } = data;

                    const { from } = move;
                    const { row: fromRow, col: fromCol } = algebraicToCoords(from);
                    const pieceBeingMoved = room.gameState.board[fromRow]?.[fromCol]?.piece;

                    if (!pieceBeingMoved || pieceBeingMoved.color !== movingPlayerColor) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid move: Not your piece or empty square.' }));
                        return;
                    }

                    const opponentPlayer = movingPlayerColor === 'white' ? 'black' : 'white';
                    
                    const { newBoard, capturedPiece, selfDestructCaptures, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
                    
                    room.gameState.resurrectedSquare = null;
                    
                    let capturesThisTurn = 0;
                    if (capturedPiece) capturesThisTurn++;
                    if (restOfResult.pieceCapturedByAnvil) capturesThisTurn++;
                    if (selfDestructCaptures) capturesThisTurn += selfDestructCaptures.length;
                    
                    let newStreak = room.gameState.killStreaks[movingPlayerColor] || 0;

                    if (capturesThisTurn > 0) {
                        newStreak += capturesThisTurn;
                        room.gameState.killStreaks[movingPlayerColor] = newStreak;
                        
                        if (capturedPiece && !restOfResult.promotedToInfiltrator) {
                            room.gameState.capturedPieces[movingPlayerColor].push({ ...capturedPiece, id: `srv_cap_${globalServerUniqueIdCounter++}` });
                        }
                        if (restOfResult.pieceCapturedByAnvil) {
                            room.gameState.capturedPieces[movingPlayerColor].push({ ...restOfResult.pieceCapturedByAnvil, id: `srv_anvil_cap_${globalServerUniqueIdCounter++}`});
                        }
                        if (selfDestructCaptures && selfDestructCaptures.length > 0) {
                            selfDestructCaptures.forEach(p => room.gameState.capturedPieces[movingPlayerColor].push({ ...p, id: `srv_sd_cap_${globalServerUniqueIdCounter++}` }));
                        }

                        if (!room.gameState.firstBloodAchieved) {
                            room.gameState.firstBloodAchieved = true;
                            room.gameState.playerWhoGotFirstBlood = movingPlayerColor;
                            room.gameState.isAwaitingCommanderPromotion = true;
                            room.gameState.gameInfo = { ...room.gameState.gameInfo, message: `${(room.gameState.players[movingPlayerColor] || {}).username || movingPlayerColor} to select Commander!` };
                            room.gameState.board = newBoard;
                            broadcastToRoom(ws.roomId, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
                            return; 
                        }
                    } else {
                        room.gameState.killStreaks[movingPlayerColor] = 0;
                    }
                
                    room.gameState.board = newBoard;
                    room.gameState.enPassantTarget = restOfResult.enPassantTargetSet || null;
                    room.gameState.lastMoveFrom = move.from;
                    room.gameState.lastMoveTo = move.to;

                    const { row: toRow, col: toCol } = algebraicToCoords(move.to);
                    const pieceOnToSquare = newBoard[toRow]?.[toCol]?.piece;
                    const isPawnPromotion = pieceOnToSquare && pieceOnToSquare.type === 'pawn' && (toRow === 0 || toRow === 7) && !restOfResult.promotedToInfiltrator;
                    
                    const extraTurnFromStreak = newStreak === 6;
                    const combinedExtraTurn = restOfResult.promotedToInfiltrator ? false : ((restOfResult as any).extraTurn || extraTurnFromStreak);
                    
                     if (newStreak === 3) {
                        const anvilContext = {
                            playerWhoseTurnCompleted: movingPlayerColor,
                            isExtraTurn: combinedExtraTurn,
                            newEnPassantTarget: restOfResult.enPassantTargetSet,
                        };
                        room.gameState.anvilDropContext = anvilContext;
                        if (isPawnPromotion) {
                            room.gameState.promotionContext = {
                                extraTurn: combinedExtraTurn,
                                anvilDropContext: anvilContext,
                            };
                            broadcastToRoom(ws.roomId, {
                                type: 'promotion-required',
                                square: move.to,
                                player: movingPlayerColor,
                                fullGameState: room.gameState,
                            });
                            return;
                        } else {
                            broadcastToRoom(ws.roomId, {
                                type: 'awaiting-anvil-drop',
                                player: movingPlayerColor,
                                fullGameState: room.gameState,
                            });
                            return;
                        }
                    } else if (newStreak === 4) {
                        const opponentColorForRes = movingPlayerColor === 'white' ? 'black' : 'white';
                        const piecesToChooseFrom = room.gameState.capturedPieces[opponentColorForRes] || [];
                        if (piecesToChooseFrom.length > 0) {
                            const pieceToResurrect = chooseBestResurrectionPiece(piecesToChooseFrom);
                            if (pieceToResurrect) {
                                const emptySquares: {row: number, col: number}[] = [];
                                for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) {
                                    if (!newBoard[r_idx][c_idx].piece && !newBoard[r_idx][c_idx].item) emptySquares.push({row: r_idx, col: c_idx});
                                }
                                if (emptySquares.length > 0) {
                                    const {row: resR, col: resC} = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                                    const resurrectedPiece: Piece = {
                                        ...pieceToResurrect,
                                        level: 1, id: `srv_res_${globalServerUniqueIdCounter++}`,
                                        hasMoved: pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook' ? false : pieceToResurrect.hasMoved,
                                        invulnerableTurnsRemaining: 0,
                                    };
                                    const promotionRank = movingPlayerColor === 'white' ? 0 : 7;
                                    if (resurrectedPiece.type === 'pawn' && resR === promotionRank) resurrectedPiece.type = 'queen';
                                    else if (resurrectedPiece.type === 'commander' && resR === promotionRank) resurrectedPiece.type = 'hero';
                                    newBoard[resR][resC].piece = resurrectedPiece;
                                    room.gameState.resurrectedSquare = coordsToAlgebraic(resR, resC);
                                    room.gameState.capturedPieces[opponentColorForRes] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);
                                }
                            }
                        }
                    }

                    if (isPawnPromotion) {
                        room.gameState.promotionContext = { extraTurn: combinedExtraTurn };
                        broadcastToRoom(ws.roomId, {
                            type: 'promotion-required',
                            square: move.to,
                            player: movingPlayerColor,
                            fullGameState: room.gameState
                        });
                        return; 
                    }
                
                    finalizeTurn(room, movingPlayerColor, combinedExtraTurn);

                    break;
                }
                case 'resign':
                    if (room) {
                        const resigningPlayer = data.resigningPlayer;
                        const winner = resigningPlayer === 'white' ? 'black' : 'white';
                        room.gameState.gameInfo = { ...room.gameState.gameInfo, gameOver: true, winner: winner };
                        broadcastToRoom(ws.roomId, { ...data, winner });
                    }
                    break;
                case 'forfeit-timeout': {
                    if (room && data.winner && !room.gameState.gameInfo.gameOver) {
                        room.gameState.gameInfo.gameOver = true;
                        room.gameState.gameInfo.winner = data.winner;
                        broadcastToRoom(ws.roomId, data);
                    }
                    break;
                }
                default:
                    if (room && !room.gameState.gameInfo.gameOver) {
                         startServerTurnTimer(ws.roomId);
                    }
                    break;
            }
        } catch (error) {
            console.error('[Server] CRITICAL ERROR in message handler:', error);
            if (ws.roomId && rooms[ws.roomId]) {
                broadcastToRoom(ws.roomId, { type: 'error', message: 'A critical server error occurred. The game may be unstable.' });
            }
        }
    });

    ws.on('close', () => {
        console.log(`[Server] Client disconnected. UserID: ${ws.userId}, RoomID: ${ws.roomId}`);
        const queueIndex = rankedQueue.findIndex(p => p.ws === ws);
        if (queueIndex > -1) {
            rankedQueue.splice(queueIndex, 1);
        }

        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room) {
                 if (room.turnTimer) {
                    clearTimeout(room.turnTimer);
                }
                room.clients = room.clients.filter(client => client !== ws);
                
                 if (room.clients.length > 0 && !room.gameState.gameInfo.gameOver) {
                    const opponentClient = room.clients[0];
                    const opponentUserId = opponentClient.userId;
                    const winner = room.gameState.players.white.userId === opponentUserId ? 'white' : 'black';

                    room.gameState.gameInfo.gameOver = true;
                    room.gameState.gameInfo.winner = winner;
                    room.gameState.gameInfo.message = `Opponent disconnected. ${winner} wins!`;
                    broadcastToRoom(ws.roomId, { type: 'opponent-disconnected', winner });
                }
               
                if (room.clients.length === 0) {
                    console.log(`[Server] Deleting empty room: ${ws.roomId}`);
                    delete rooms[ws.roomId];
                }
            }
        }
    });

    ws.on('error', (err) => {
        console.error('[Server] WebSocket error:', err);
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`  GAME SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});

    

    


