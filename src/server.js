
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
const { initializeBoard, applyMove, isKingInCheck, isCheckmate, isStalemate } = require('./lib/chess-utils.js');


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

                const { payload: move, movingPlayer } = data;
                if (movingPlayer !== room.gameState.currentPlayer) {
                    return; // Ignore move if it's not the player's turn
                }

                // Apply the move on the server's authoritative game state
                const { newBoard, capturedPiece, ...restOfResult } = applyMove(room.gameState.board, move, room.gameState.enPassantTarget);
                room.gameState.board = newBoard;
                room.gameState.enPassantTarget = restOfResult.enPassantTargetSet || null;
                
                if (capturedPiece) {
                    room.gameState.capturedPieces[movingPlayer].push(capturedPiece);
                    room.gameState.killStreaks[movingPlayer] = (room.gameState.killStreaks[movingPlayer] || 0) + 1;
                    const opponent = movingPlayer === 'white' ? 'black' : 'white';
                    room.gameState.killStreaks[opponent] = 0;
                } else {
                    room.gameState.killStreaks[movingPlayer] = 0;
                }
                
                // Check for game over conditions
                const nextPlayer = movingPlayer === 'white' ? 'black' : 'white';
                const inCheck = isKingInCheck(newBoard, nextPlayer, room.gameState.enPassantTarget);
                let message = "\u00A0";
                
                if (isCheckmate(newBoard, nextPlayer, room.gameState.enPassantTarget)) {
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, gameOver: true, winner: movingPlayer, isCheckmate: true, message: `Checkmate! ${movingPlayer} wins!` };
                } else if (isStalemate(newBoard, nextPlayer, room.gameState.enPassantTarget)) {
                    room.gameState.gameInfo = { ...room.gameState.gameInfo, gameOver: true, winner: 'draw', isStalemate: true, message: "Stalemate! It's a draw." };
                } else if (inCheck) {
                    message = "Check!";
                }

                if (!room.gameState.gameInfo.gameOver) {
                    room.gameState.currentPlayer = nextPlayer;
                    room.gameState.gameInfo = {
                        ...room.gameState.gameInfo,
                        isCheck: inCheck,
                        playerWithKingInCheck: inCheck ? nextPlayer : null,
                        message: message
                    };
                }
                
                // Broadcast the entire new state to all players
                broadcastToRoom(ws.roomId, {
                    type: 'game-move',
                    payload: move,
                    movingPlayer: movingPlayer,
                    fullBoardState: room.gameState.board,
                    capturedPieces: room.gameState.capturedPieces,
                    killStreaks: room.gameState.killStreaks,
                    enPassantTarget: room.gameState.enPassantTarget,
                    gameInfo: room.gameState.gameInfo
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
                    // Just broadcast these events, the client will handle the logic
                    // This ensures both clients see the same random outcome
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
