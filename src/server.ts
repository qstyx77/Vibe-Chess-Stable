
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
                    
                    broadcastToRoom(ws.roomId!, {
                        type: 'commander-promo-finalized',
                        fullGameState: room.gameState,
                        lastPlayer: playerWhoActed
                    });
                }
                break;
            }
            case 'finalize-promotion': {
                if (!room || !data.payload) break;
                const { square, promoteTo } = data.payload;
                const movingPlayer = room.gameState.currentPlayer;
    
                const client = room.clients.find(c => c === ws);
                if (!client || (room.gameState.players[movingPlayer] && client.userId !== room.gameState.players[movingPlayer].userId)) {
                    return; // Not this player's turn to promote
                }
    
                const { row, col } = algebraicToCoords(square);
                const piece = room.gameState.board[row]?.[col]?.piece;
    
                if (piece && piece.color === movingPlayer && (piece.type === 'pawn' || piece.type === 'commander') && (row === 0 || row === 7)) {
                    const originalLevel = piece.level;
                    piece.type = promoteTo;
                    // The level would have been calculated during the initial applyMove
    
                    const opponentPlayer = movingPlayer === 'white' ? 'black' : 'white';
                    const isExtraTurn = (originalLevel >= 5) || (room.gameState.killStreaks[movingPlayer] >= 6);
                    const nextPlayer = isExtraTurn ? movingPlayer : opponentPlayer;
    
                    const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTarget);
                    let message = " ";
                    let gameOver = false;
                    let winner: PlayerColor | 'draw' | undefined = undefined;
    
                    if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
                        message = `Checkmate! ${(room.gameState.players[movingPlayer] || {username: movingPlayer}).username} wins!`;
                        gameOver = true;
                        winner = movingPlayer;
                    } else if (isStalemate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
                        message = "Stalemate! It's a draw.";
                        gameOver = true;
                        winner = 'draw';
                    } else if (inCheck) {
                        message = "Check!";
                    }
    
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, message, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: gameOver && winner === movingPlayer, isStalemate: gameOver && winner === 'draw', gameOver, winner };
                    room.gameState.currentPlayer = nextPlayer;
    
                    broadcastToRoom(ws.roomId, { type: 'game-move', fullGameState: room.gameState, lastPlayer: movingPlayer });
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
                        broadcastToRoom(ws.roomId!, broadcastMsg);
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

                // Server-side validation: Ensure the piece being moved belongs to the current player
                const { from } = move;
                const { row: fromRow, col: fromCol } = algebraicToCoords(from);
                const pieceBeingMoved = room.gameState.board[fromRow]?.[fromCol]?.piece;

                if (!pieceBeingMoved || pieceBeingMoved.color !== movingPlayerColor) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid move: Not your piece or empty square.' }));
                    return; // Stop processing this move
                }

                const opponentPlayer = movingPlayerColor === 'white' ? 'black' : 'white';
            
                const { newBoard, capturedPiece, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
            
                let wasCapture = false;
                if (capturedPiece) {
                    wasCapture = true;
                    if (!restOfResult.promotedToInfiltrator) {
                        room.gameState.capturedPieces[movingPlayerColor].push({ ...capturedPiece, id: `srv_cap_${globalServerUniqueIdCounter++}` });
                    }
                }
                if (restOfResult.pieceCapturedByAnvil) {
                    wasCapture = true;
                    room.gameState.capturedPieces[movingPlayerColor].push({ ...restOfResult.pieceCapturedByAnvil, id: `srv_anvil_cap_${globalServerUniqueIdCounter++}`});
                }
            
                if (wasCapture) {
                    room.gameState.killStreaks[movingPlayerColor] = (room.gameState.killStreaks[movingPlayerColor] || 0) + 1;
                    room.gameState.killStreaks[opponentPlayer] = 0;
                    if (!room.gameState.firstBloodAchieved) {
                        room.gameState.firstBloodAchieved = true;
                        room.gameState.playerWhoGotFirstBlood = movingPlayerColor;
                        room.gameState.isAwaitingCommanderPromotion = true;
                        room.gameState.gameInfo = { ...room.gameState.gameInfo, message: `${(room.gameState.players[movingPlayerColor] || {}).username || movingPlayerColor} to select Commander!` };
                        room.gameState.board = newBoard; // Update board before broadcasting
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
                const isPromotion = pieceOnToSquare && (pieceOnToSquare.type === 'pawn' || pieceOnToSquare.type === 'commander') && (toRow === 0 || toRow === 7);
    
                if (isPromotion && !move.promoteTo) {
                    // Pawn has reached the back rank, waiting for client's promotion choice.
                    broadcastToRoom(ws.roomId, {
                        type: 'game-move', 
                        fullGameState: room.gameState,
                        lastPlayer: movingPlayerColor,
                    });
                    return; // Wait for 'finalize-promotion' message.
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

                const isExtraTurn = restOfResult.promotedToInfiltrator ? false : ((restOfResult as any).extraTurn || (room.gameState.killStreaks[movingPlayerColor] === 6));
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
            
                if (gameOver) {
                    broadcastToRoom(ws.roomId, { type: 'game-over', winner, reason: winner === 'draw' ? 'stalemate' : 'checkmate' });
                } else {
                    broadcastToRoom(ws.roomId, {
                        type: 'game-move',
                        fullGameState: room.gameState,
                        lastPlayer: movingPlayerColor,
                    });
                }
                break;
            }
            case 'resign':
                 if (room) {
                    const winner = data.resigningPlayer === 'white' ? 'black' : 'white';
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, gameOver: true, winner };
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

    

    




