
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
    coordsToAlgebraic
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
const rankedQueue: { ws: WebSocket & { userId?: string }; userId: string; elo: number; timestamp: number }[] = [];


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

    console.log(`[Server] Processing ranked queue with ${rankedQueue.length} players.`);
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
                player1: { id: player1Data.userId, elo: player1Data.elo },
                player2: { id: player2Data.userId, elo: player2Data.elo },
            }
        };

        player1Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'white', opponent: {id: player2Data.userId, elo: player2Data.elo} }));
        player2Ws.send(JSON.stringify({ type: 'ranked-match-found', roomId, color: 'black', opponent: {id: player1Data.userId, elo: player1Data.elo} }));

        console.log(`[Server] Matched ${player1Data.userId} (ELO: ${player1Data.elo}) vs ${player2Data.userId} (ELO: ${player2Data.elo}) in room ${roomId}`);
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
            console.error('[Server] Failed to parse message:', message.toString());
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
                rooms[roomId] = {
                    clients: [ws],
                    isRanked: false,
                    gameState: {
                        board: initializeBoard(),
                        currentPlayer: 'white',
                        capturedPieces: { white: [], black: [] },
                        killStreaks: { white: [], black: [] },
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
                    }
                };
                ws.send(JSON.stringify({ type: 'room-created', roomId: roomId, color: 'white' }));
                break;
            }
            case 'join-room': {
                const roomIdToJoin = data.roomId;
                const roomToJoin = rooms[roomIdToJoin];
                if (roomToJoin && roomToJoin.clients.length < 2) {
                    ws.roomId = roomIdToJoin;
                    roomToJoin.clients.push(ws);
                    
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomIdToJoin, color: 'black' }));
                    
                    broadcastToRoom(roomIdToJoin, { type: 'player-joined' });
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
             case 'join-ranked-queue': {
                const { userId } = data;
                if (!userId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'User ID is required for ranked play.' }));
                    return;
                }
                ws.userId = userId;

                // For simplicity in this environment, we'll fetch ELO here.
                // In a production system, you'd want a more secure way to get this.
                let userElo = 1200; // Default
                let userWins = 0;
                let userLosses = 0;
                try {
                    const app = initializeApp(firebaseConfig, 'server-app-for-elo');
                    const firestore = getFirestore(app);
                    const userDocRef = doc(firestore, 'users', userId);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        userElo = userDoc.data().eloRating || 1200;
                        userWins = userDoc.data().wins || 0;
                        userLosses = userDoc.data().losses || 0;
                    }
                } catch(e) {
                    console.error("Error fetching ELO:", e);
                }


                const existingPlayer = rankedQueue.find(p => p.userId === userId);
                if (!existingPlayer) {
                    rankedQueue.push({ ws, userId, elo: userElo, timestamp: Date.now() });
                    console.log(`[Server] User ${userId} (ELO: ${userElo}) joined the ranked queue. Queue size: ${rankedQueue.length}`);
                }
                break;
            }
            case 'leave-ranked-queue': {
                const index = rankedQueue.findIndex(p => p.ws === ws);
                if (index > -1) {
                    rankedQueue.splice(index, 1);
                    console.log(`[Server] User left ranked queue. Queue size: ${rankedQueue.length}`);
                }
                break;
            }
            case 'commander-promo': {
                 if (!room || !data.square) return;

                const { row, col } = require('./lib/chess-utils.js').algebraicToCoords(data.square);
                const piece = room.gameState.board[row]?.[col]?.piece;
                
                if (piece && piece.color === room.gameState.playerWhoGotFirstBlood && piece.type === 'pawn' && piece.level === 1) {
                    piece.type = 'commander';
                    piece.id = `${piece.id}_CMD_SRV`;
                    
                    // Reset the promotion flags
                    room.gameState.isAwaitingCommanderPromotion = false;
                    room.gameState.playerWhoGotFirstBlood = null;

                    const playerWhoActed = room.gameState.currentPlayer;
                    const opponent = playerWhoActed === 'white' ? 'black' : 'white';
                    room.gameState.currentPlayer = opponent;
                    
                    const inCheck = isKingInCheck(room.gameState.board, opponent, room.gameState.enPassantTarget);
                    
                    if (isCheckmate(room.gameState.board, opponent, room.gameState.enPassantTarget)) {
                         room.gameState.gameInfo = { message: `Checkmate! ${playerWhoActed} wins!`, isCheck: true, playerWithKingInCheck: opponent, isCheckmate: true, gameOver: true, winner: playerWhoActed };
                    } else if (isStalemate(room.gameState.board, opponent, room.gameState.enPassantTarget)) {
                        room.gameState.gameInfo = { message: "Stalemate! It's a draw.", isCheck: false, playerWithKingInCheck: null, isStalemate: true, gameOver: true, winner: 'draw' };
                    } else if (inCheck) {
                        room.gameState.gameInfo = { message: "Check!", isCheck: true, playerWithKingInCheck: opponent, isCheckmate: false, gameOver: false };
                    } else {
                        room.gameState.gameInfo = { message: " ", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, gameOver: false };
                    }
                    
                    broadcastToRoom(ws.roomId!, {
                        type: 'commander-promo-finalized',
                        fullGameState: room.gameState,
                        lastPlayer: playerWhoActed
                    });
                }
                break;
            }
            case 'timeout': {
                 if (room && !room.gameState.gameInfo.gameOver) {
                    const timedOutPlayer = room.gameState.currentPlayer;
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
                        broadcastToRoom(ws.roomId, { type: 'forfeit-timeout', timedOutPlayer, winner: winnerOnTimeout, reason });
                        return;
                    }

                    // This is the fix: ensure currentPlayer is set to the opponent.
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

                    broadcastToRoom(ws.roomId, {
                        type: 'game-move',
                        fullGameState: room.gameState,
                        lastPlayer: timedOutPlayer, // The player who timed out still 'made' the move (by timing out)
                    });
                 }
                 break;
            }
            case 'game-move': {
                if (!room || !data.payload) return;
                
                const { payload: move } = data;
                const movingPlayer = room.gameState.currentPlayer;
                const opponentPlayer = movingPlayer === 'white' ? 'black' : 'white';

                // --- Start of Server-Authoritative Move Processing ---
                const { newBoard, capturedPiece, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
                
                room.gameState.board = newBoard;
                room.gameState.enPassantTarget = restOfResult.enPassantTargetSet || null;
                room.gameState.lastMoveFrom = move.from;
                room.gameState.lastMoveTo = move.to;

                let wasCapture = false;
                if (capturedPiece) {
                    wasCapture = true;
                    if (restOfResult.promotedToInfiltrator) {
                        // Obliterated
                    } else {
                        room.gameState.capturedPieces[movingPlayer].push({ ...capturedPiece, id: `srv_cap_${globalServerUniqueIdCounter++}` });
                    }
                }
                 if (restOfResult.pieceCapturedByAnvil) {
                    wasCapture = true;
                    room.gameState.capturedPieces[movingPlayer].push({ ...restOfResult.pieceCapturedByAnvil, id: `srv_anvil_cap_${globalServerUniqueIdCounter++}`});
                }

                if (wasCapture) {
                    room.gameState.killStreaks[movingPlayer] = (room.gameState.killStreaks[movingPlayer] || 0) + 1;
                    room.gameState.killStreaks[opponentPlayer] = 0;
                    if(!room.gameState.firstBloodAchieved) {
                        room.gameState.firstBloodAchieved = true;
                        room.gameState.playerWhoGotFirstBlood = movingPlayer;
                        room.gameState.isAwaitingCommanderPromotion = true;
                        // Don't change turn yet, wait for commander selection
                         room.gameState.gameInfo = { ...room.gameState.gameInfo, message: `${movingPlayer} to select Commander!` };
                         // Send a specific message to ensure clients are in sync
                         broadcastToRoom(ws.roomId!, { type: 'awaiting-commander-promo', fullGameState: room.gameState });
                         return; // IMPORTANT: Stop processing until commander is selected
                    }
                } else {
                    room.gameState.killStreaks[movingPlayer] = 0;
                }

                room.gameState.gameMoveCounter++;
                const isExtraTurn = restOfResult.promotedToInfiltrator ? false : ((restOfResult as any).extraTurn || (room.gameState.killStreaks[movingPlayer] === 6));
                const nextPlayer = isExtraTurn ? movingPlayer : opponentPlayer;


                const inCheck = isKingInCheck(room.gameState.board, nextPlayer, room.gameState.enPassantTarget);
                let message = " ";
                let gameOver = false;
                let winner: PlayerColor | 'draw' | undefined = undefined;

                if (isCheckmate(room.gameState.board, nextPlayer, room.gameState.enPassantTarget)) {
                    message = `Checkmate! ${movingPlayer} wins!`;
                    gameOver = true;
                    winner = movingPlayer;
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
                    isCheckmate: winner === movingPlayer && !isStalemate,
                    isStalemate: winner === 'draw',
                    gameOver: gameOver,
                    winner: winner
                };

                room.gameState.currentPlayer = nextPlayer;

                let eloChanges = null;
                if (gameOver && room.isRanked) {
                    const p1 = room.gameState.player1;
                    const p2 = room.gameState.player2;

                    const p1Result = winner === 'draw' ? 'draw' : (p1.id === room.clients[0].userId ? (winner === 'white' ? 'win' : 'loss') : (winner === 'black' ? 'win' : 'loss'));
                    const p2Result = winner === 'draw' ? 'draw' : (p2.id === room.clients[1].userId ? (winner === 'black' ? 'win' : 'loss') : (winner === 'white' ? 'win' : 'loss'));

                    const p1NewElo = calculateElo(p1.elo, p2.elo, p1Result);
                    const p2NewElo = calculateElo(p2.elo, p1.elo, p2Result);
                    
                    eloChanges = {
                        [p1.id]: { oldElo: p1.elo, newElo: p1NewElo },
                        [p2.id]: { oldElo: p2.elo, newElo: p2NewElo }
                    };
                }

                // --- End of Server-Authoritative Move Processing ---

                 if (gameOver) {
                    broadcastToRoom(ws.roomId, { type: 'game-over', winner, reason: winner === 'draw' ? 'stalemate' : 'checkmate', eloChanges });
                } else {
                    broadcastToRoom(ws.roomId, {
                        type: 'game-move',
                        fullGameState: room.gameState,
                        lastPlayer: movingPlayer,
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
            case 'anvil-spawn': {
                 if (room) {
                    const { newBoard, spawnedAt } = spawnAnvil(room.gameState.board);
                     if (spawnedAt) {
                         room.gameState.board = newBoard;
                         broadcastToRoom(ws.roomId, { type: 'anvil-spawn', square: spawnedAt });
                    }
                 }
                 break;
            }
             case 'shroom-spawn': {
                 if (room) {
                    const { newBoard, spawnedAt } = spawnShroom(room.gameState.board);
                    if (spawnedAt) {
                        room.gameState.board = newBoard;
                        const newNextTurn = Math.floor(Math.random() * 6) + 5;
                        room.gameState.shroomSpawnCounter = 0;
                        room.gameState.nextShroomSpawnTurn = newNextTurn;
                        broadcastToRoom(ws.roomId, { type: 'shroom-spawn', square: spawnedAt, nextTurn: newNextTurn });
                    }
                 }
                 break;
            }
            case 'forfeit-timeout': {
                if (room && data.winner) {
                    room.gameState.gameInfo.gameOver = true;
                    room.gameState.gameInfo.winner = data.winner;
                    // Forward the message to other clients
                    broadcastToRoom(ws.roomId, data);
                }
                break;
            }
            default:
                break;
        }
    });

    ws.on('close', () => {
        // Handle leaving ranked queue
        const queueIndex = rankedQueue.findIndex(p => p.ws === ws);
        if (queueIndex > -1) {
            rankedQueue.splice(queueIndex, 1);
            console.log(`[Server] User left ranked queue on disconnect. Queue size: ${rankedQueue.length}`);
        }

        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room) {
                room.clients = room.clients.filter(client => client !== ws);
                
                if (room.clients.length > 0) {
                     if (!room.gameState.gameInfo.gameOver) {
                        const winner = room.clients[0] === ws ? 'black' : 'white';
                        room.gameState.gameInfo.gameOver = true;
                        room.gameState.gameInfo.winner = winner;
                        broadcastToRoom(ws.roomId, { type: 'opponent-disconnected' });
                    }
                }
               
                if (room.clients.length === 0) {
                    delete rooms[ws.roomId];
                    console.log(`[Server] Room ${ws.roomId} closed.`);
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

    

    
