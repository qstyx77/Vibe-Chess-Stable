
const WebSocket = require('ws');
const http = require('http');

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

const rooms = {};

// Server-side game logic import (ensure path is correct)
const { initializeBoard, applyMove, isKingInCheck, isCheckmate, isStalemate, getCastlingRightsString, boardToPositionHash, spawnAnvil: spawnAnvilUtil, spawnShroom: spawnShroomUtil } = require('./lib/chess-utils.js');


const broadcastToRoom = (roomId, message) => {
    const room = rooms[roomId];
    if (room && room.clients) {
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
};

wss.on('connection', ws => {
    ws.roomId = null;

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.error('[Server] Failed to parse message:', message.toString());
            return;
        }

        const room = rooms[ws.roomId];

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
                            message: "\u00A0",
                            isCheck: false,
                            playerWithKingInCheck: null,
                            isCheckmate: false,
                            isStalemate: false,
                            gameOver: false,
                        }
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
            case 'game-move': {
                if (!room) return;

                const { payload: move } = data;
                const movingPlayer = room.gameState.currentPlayer;

                // --- Start of Server-Authoritative Move Processing ---
                
                const { newBoard, capturedPiece, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
                
                room.gameState.board = newBoard;
                room.gameState.enPassantTarget = restOfResult.enPassantTargetSet || null;
                room.gameState.lastMoveFrom = move.from;
                room.gameState.lastMoveTo = move.to;

                if (capturedPiece) {
                    room.gameState.capturedPieces[movingPlayer].push(capturedPiece);
                    room.gameState.killStreaks[movingPlayer] = (room.gameState.killStreaks[movingPlayer] || 0) + 1;
                    const opponent = movingPlayer === 'white' ? 'black' : 'white';
                    room.gameState.killStreaks[opponent] = 0;
                    if(!room.gameState.firstBloodAchieved) {
                        room.gameState.firstBloodAchieved = true;
                        room.gameState.playerWhoGotFirstBlood = movingPlayer;
                    }
                } else {
                    room.gameState.killStreaks[movingPlayer] = 0;
                }

                if (data.payload.type === 'commander-promo' && data.payload.square) {
                    const { row, col } = require('./lib/chess-utils.js').algebraicToCoords(data.payload.square);
                    if(room.gameState.board[row][col].piece) {
                       room.gameState.board[row][col].piece.type = 'commander';
                    }
                }
                
                room.gameState.gameMoveCounter++;
                const nextPlayer = movingPlayer === 'white' ? 'black' : 'white';

                const inCheck = isKingInCheck(newBoard, nextPlayer, room.gameState.enPassantTarget);
                let message = "\u00A0";
                let gameOver = false;
                let winner = undefined;

                if (isCheckmate(newBoard, nextPlayer, room.gameState.enPassantTarget)) {
                    message = `Checkmate! ${movingPlayer} wins!`;
                    gameOver = true;
                    winner = movingPlayer;
                } else if (isStalemate(newBoard, nextPlayer, room.gameState.enPassantTarget)) {
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
            case 'anvil-spawn':
            case 'shroom-spawn': {
                 if (room) {
                    broadcastToRoom(ws.roomId, data);
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
