
import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';

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

const rooms: Record<string, { clients: WebSocket[]; gameState: any; }> = {};
let globalServerUniqueIdCounter = 10000;

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

wss.on('connection', (ws: WebSocket & { roomId?: string }) => {
    ws.roomId = undefined;

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.error('[Server] Failed to parse message:', message.toString());
            return;
        }

        if (!ws.roomId && data.type !== 'create-room' && data.type !== 'join-room') {
            return;
        }
        
        const room = ws.roomId ? rooms[ws.roomId] : undefined;

        switch (data.type) {
            case 'create-room': {
                const roomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = roomId;
                rooms[roomId] = {
                    clients: [ws],
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
            case 'commander-promo': {
                 if (!room || !data.square) return;

                const { row, col } = require('./lib/chess-utils.js').algebraicToCoords(data.square);
                const piece = room.gameState.board[row]?.[col]?.piece;
                
                if (piece && piece.color === room.gameState.playerWhoGotFirstBlood && piece.type === 'pawn' && piece.level === 1) {
                    piece.type = 'commander';
                    piece.id = `${piece.id}_CMD_SRV`;
                    
                    const playerWhoActed = room.gameState.playerWhoGotFirstBlood;
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
                        type: 'game-move',
                        fullGameState: room.gameState,
                        lastPlayer: playerWhoActed
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
                        // Don't change turn yet, wait for commander selection
                         room.gameState.gameInfo = { ...room.gameState.gameInfo, message: `${movingPlayer} to select Commander!` };
                         broadcastToRoom(ws.roomId!, { type: 'game-move', fullGameState: room.gameState, lastPlayer: movingPlayer });
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
                let winner = undefined;

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

                // --- End of Server-Authoritative Move Processing ---

                // Broadcast the single, authoritative new game state to ALL clients
                broadcastToRoom(ws.roomId, {
                    type: 'game-move',
                    fullGameState: room.gameState,
                    lastPlayer: movingPlayer,
                });
                break;
            }
            case 'resign':
            case 'forfeit-timeout':
                 if (room) {
                    const winner = data.resigningPlayer === 'white' ? 'black' : (data.timedOutPlayer === 'white' ? 'black' : 'white');
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
            case 'turn-pass-timeout': {
                 if (room) {
                    room.gameState.currentPlayer = data.nextPlayer;
                    broadcastToRoom(ws.roomId, data);
                 }
                 break;
            }
            default:
                break;
        }
    });

    ws.on('close', () => {
        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room) {
                room.clients = room.clients.filter(client => client !== ws);
                
                if (room.clients.length > 0) {
                    broadcastToRoom(ws.roomId, { type: 'opponent-disconnected' });
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

    