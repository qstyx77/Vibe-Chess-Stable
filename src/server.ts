
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
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

const rooms: Record<string, { clients: (WebSocket & { userId?: string })[]; gameState: any; isRanked: boolean; }> = {};
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
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
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

        player1Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'white', players: rooms[roomId].gameState.players }));
        player2Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'black', players: rooms[roomId].gameState.players }));
    }
};
setInterval(processRankedQueue, 10000);


wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string }) => {
    ws.roomId = undefined;
    ws.userId = undefined;

    ws.on('message', async (message) => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            return;
        }

        if (!ws.roomId && data.type !== 'create-room' && data.type !== 'join-room' && data.type !== 'join-ranked-queue') {
            return;
        }
        
        const room = ws.roomId ? rooms[ws.roomId] : undefined;

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
                }
                break;
            }
            case 'finalize-promotion': {
                console.log('[Server] Received finalize-promotion:', data.payload);
                if (!room || !data.payload) {
                    console.log('[Server] Finalize-promotion rejected: no room or payload.');
                    break;
                }
                const { square, promoteTo } = data.payload;
                
                const { row, col } = algebraicToCoords(square);
                const piece = room.gameState.board[row]?.[col]?.piece;
            
                if (piece && (piece.type === 'pawn' || piece.type === 'commander')) {
                    console.log(`[Server] Promoting piece at ${square} to ${promoteTo}.`);
                    const promotingPlayerColor = piece.color;
                    const opponentPlayer = promotingPlayerColor === 'white' ? 'black' : 'white';
            
                    piece.type = promoteTo;
                    if(promoteTo === 'queen') {
                        piece.level = Math.min(piece.level, 7);
                    }
            
                    const isExtraTurn = room.gameState.promotionContext?.extraTurn || false;
                    const nextPlayer = isExtraTurn ? promotingPlayerColor : opponentPlayer;
            
                    const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTarget);
                    let message = " ";
                    let gameOver = false;
                    let winner: PlayerColor | 'draw' | undefined = undefined;
            
                    if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
                        message = `Checkmate! ${(room.gameState.players[promotingPlayerColor] || {username: promotingPlayerColor}).username} wins!`;
                        gameOver = true;
                        winner = promotingPlayerColor;
                    } else if (isStalemate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
                        message = "Stalemate! It's a draw.";
                        gameOver = true;
                        winner = 'draw';
                    } else if (inCheck) {
                        message = "Check!";
                    }
            
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, message, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: gameOver && winner === promotingPlayerColor, isStalemate: gameOver && winner === 'draw', gameOver, winner };
                    room.gameState.currentPlayer = nextPlayer;
                    delete room.gameState.promotionContext;
            
                    broadcastToRoom(ws.roomId, { type: 'game-move', fullGameState: room.gameState, lastPlayer: promotingPlayerColor });
                    console.log('[Server] Broadcasted final game state after promotion.');
                } else {
                     console.log(`[Server] Finalize-promotion failed: no valid piece found at ${square}. Piece is:`, piece);
                }
                break;
            }
            case 'timeout': {
                if (room && !room.gameState.gameInfo.gameOver) {
                    const timedOutPlayer = data.timedOutPlayer;

                    if (room.gameState.currentPlayer !== timedOutPlayer) {
                        return;
                    }

                    const opponent = timedOutPlayer === 'white' ? 'black' : 'white';
                    let winnerOnTimeout = opponent;
                    let reason = 'timeout';

                    if (timedOutPlayer === 'white') room.gameState.whiteTimeouts++;
                    else room.gameState.blackTimeouts++;
                    
                    const timedOutPlayerInCheck = isKingInCheck(room.gameState.board, timedOutPlayer, room.gameState.enPassantTarget);
                    if (timedOutPlayerInCheck) {
                        reason = 'self-check-timeout';
                    }
                    
                    if (room.gameState.whiteTimeouts >= 3 || room.gameState.blackTimeouts >= 3 || timedOutPlayerInCheck) {
                        room.gameState.gameInfo.gameOver = true;
                        room.gameState.gameInfo.winner = winnerOnTimeout;
                        const broadcastMsg = { type: 'forfeit-timeout', timedOutPlayer, winner: winnerOnTimeout, reason };
                        broadcastToRoom(ws.roomId, broadcastMsg);
                        return;
                    }

                    room.gameState.currentPlayer = opponent;
                    
                    const inCheck = isKingInCheck(room.gameState.board, opponent, room.gameState.enPassantTarget);
                    if (inCheck) {
                        room.gameState.gameInfo.message = "Check!";
                        room.gameState.gameInfo.isCheck = true;
                        room.gameState.gameInfo.playerWithKingInCheck = opponent;
                    } else {
                        room.gameState.gameInfo.message = " ";
                        room.gameState.gameInfo.isCheck = false;
                        room.gameState.gameInfo.playerWithKingInCheck = null;
                    }

                    const broadcastMsg = {
                        type: 'game-move',
                        fullGameState: room.gameState,
                        lastPlayer: timedOutPlayer,
                    };
                    broadcastToRoom(ws.roomId, broadcastMsg);
                 }
                 break;
            }
            case 'game-move': {
                if (!room || !data.payload) break;

                const movingPlayerColor = room.gameState.currentPlayer;
                const movingPlayerInfo = room.gameState.players[movingPlayerColor];
                if (room.clients.length > 1 && movingPlayerInfo && movingPlayerInfo.userId && movingPlayerInfo.userId !== ws.userId) {
                    return;
                }

                const { payload: move } = data;

                const { from } = move;
                const { row: fromRow, col: fromCol } = algebraicToCoords(from);
                const pieceBeingMoved = room.gameState.board[fromRow]?.[fromCol]?.piece;

                if (!pieceBeingMoved || pieceBeingMoved.color !== movingPlayerColor) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid move: Not your piece or empty square.' }));
                    return;
                }

                const opponentPlayer = movingPlayerColor === 'white' ? 'black' : 'white';
            
                const { newBoard, capturedPiece, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
                let wasCapture = !!capturedPiece || !!restOfResult.pieceCapturedByAnvil;
                let extraTurnFromStreak = false;
                room.gameState.resurrectedSquare = null;

                if (wasCapture) {
                    if (capturedPiece && !restOfResult.promotedToInfiltrator) {
                        room.gameState.capturedPieces[movingPlayerColor].push({ ...capturedPiece, id: `srv_cap_${globalServerUniqueIdCounter++}` });
                    }
                    if (restOfResult.pieceCapturedByAnvil) {
                        room.gameState.capturedPieces[movingPlayerColor].push({ ...restOfResult.pieceCapturedByAnvil, id: `srv_anvil_cap_${globalServerUniqueIdCounter++}`});
                    }

                    room.gameState.killStreaks[movingPlayerColor]++;
                    room.gameState.killStreaks[opponentPlayer] = 0;

                    if (room.gameState.killStreaks[movingPlayerColor] === 6) {
                        extraTurnFromStreak = true;
                        room.gameState.killStreaks[movingPlayerColor] = 0;
                    } else if (room.gameState.killStreaks[movingPlayerColor] === 3) {
                        const opponentColorForRes = movingPlayerColor === 'white' ? 'black' : 'white';
                        const piecesToChooseFrom = room.gameState.capturedPieces[opponentColorForRes] || [];
                        if (piecesToChooseFrom.length > 0) {
                            const pieceToResurrect = chooseBestResurrectionPiece(piecesToChooseFrom);
                            if (pieceToResurrect) {
                                const emptySquares: {row: number, col: number}[] = [];
                                for (let r_idx = 0; r_idx < 8; r_idx++) {
                                    for (let c_idx = 0; c_idx < 8; c_idx++) {
                                        if (!newBoard[r_idx][c_idx].piece && !newBoard[r_idx][c_idx].item) {
                                            emptySquares.push({row: r_idx, col: c_idx});
                                        }
                                    }
                                }

                                if (emptySquares.length > 0) {
                                    const {row: resR, col: resC} = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                                    const resurrectedPiece: Piece = {
                                        ...pieceToResurrect,
                                        level: 1,
                                        id: `srv_res_${globalServerUniqueIdCounter++}`,
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
                        room.gameState.killStreaks[movingPlayerColor] = 0;
                    }

                    if (!room.gameState.firstBloodAchieved) {
                        room.gameState.firstBloodAchieved = true;
                        room.gameState.playerWhoGotFirstBlood = movingPlayerColor;
                        room.gameState.isAwaitingCommanderPromotion = true;
                        room.gameState.gameInfo = { ...room.gameState.gameInfo, message: `${(room.gameState.players[movingPlayerColor] || {}).username || movingPlayerColor} to select Commander!` };
                        room.gameState.board = newBoard; // Board state is needed for commander selection
                        broadcastToRoom(ws.roomId, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
                        return; // Halt further processing until commander is chosen
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
    
                if (isPawnPromotion) {
                    console.log(`[Server] Pawn promotion detected for ${movingPlayerColor} at ${move.to}. Sending 'promotion-required'.`);
                    room.gameState.promotionContext = {
                        extraTurn: (restOfResult as any).extraTurn || extraTurnFromStreak,
                    };
                    broadcastToRoom(ws.roomId, {
                        type: 'promotion-required',
                        square: move.to,
                        player: movingPlayerColor,
                        fullGameState: room.gameState
                    });
                    return;
                }
            
                room.gameState.gameMoveCounter++;

                if (room.gameState.gameMoveCounter > 0 && room.gameState.gameMoveCounter % 9 === 0) {
                    const { newBoard: boardAfterAnvil, spawnedAt } = spawnAnvil(room.gameState.board);
                    if (spawnedAt) {
                        room.gameState.board = boardAfterAnvil;
                        broadcastToRoom(ws.roomId, { type: 'anvil-spawn', square: spawnedAt });
                    }
                }
                
                let currentShroomCounter = (room.gameState.shroomSpawnCounter || 0) + 1;
                room.gameState.shroomSpawnCounter = currentShroomCounter;
                if (currentShroomCounter >= (room.gameState.nextShroomSpawnTurn || 5)) {
                    const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(room.gameState.board);
                    if (shroomSpawnedAt) {
                        room.gameState.board = boardAfterShroom;
                        const newNextTurn = Math.floor(Math.random() * 6) + 5;
                        room.gameState.shroomSpawnCounter = 0;
                        room.gameState.nextShroomSpawnTurn = newNextTurn;
                        broadcastToRoom(ws.roomId, { type: 'shroom-spawn', square: shroomSpawnedAt, nextTurn: newNextTurn });
                    }
                }

                const isExtraTurn = restOfResult.promotedToInfiltrator ? false : ((restOfResult as any).extraTurn || extraTurnFromStreak);
                const nextPlayer = isExtraTurn ? movingPlayerColor : opponentPlayer;
            
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
                    isCheckmate: winner === movingPlayerColor && !isStalemate,
                    isStalemate: winner === 'draw',
                    gameOver: gameOver,
                    winner: winner,
                };
            
                room.gameState.currentPlayer = nextPlayer;
            
                if (gameOver && room.isRanked) {
                   // Elo logic would go here
                }
            
                // Always broadcast the final state as a 'game-move'
                broadcastToRoom(ws.roomId, {
                    type: 'game-move',
                    fullGameState: room.gameState,
                    lastPlayer: movingPlayerColor,
                });

                break;
            }
            case 'resign':
                 if (room) {
                    const winner = data.resigningPlayer === 'white' ? 'black' : 'white';
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, gameOver: true, winner };
                    broadcastToRoom(ws.roomId, data);
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
                break;
        }
    });

    ws.on('close', () => {
        const queueIndex = rankedQueue.findIndex(p => p.ws === ws);
        if (queueIndex > -1) {
            rankedQueue.splice(queueIndex, 1);
        }

        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room) {
                room.clients = room.clients.filter(client => client !== ws);
                
                if (room.clients.length > 0) {
                     if (!room.gameState.gameInfo.gameOver) {
                        const winner = room.clients.find(c => c !== ws) === room.clients[0] ? (room.gameState.players.white.userId === room.clients[0].userId ? 'white' : 'black') : (room.gameState.players.white.userId === room.clients[0].userId ? 'black' : 'white');
                        room.gameState.gameInfo.gameOver = true;
                        room.gameState.gameInfo.winner = winner;
                        broadcastToRoom(ws.roomId, { type: 'opponent-disconnected' });
                    }
                }
               
                if (room.clients.length === 0) {
                    delete rooms[ws.roomId];
                }
            }
        }
    });

    ws.on('error', (err) => {
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
});

    

    






    

    




    