
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

const broadcastToRoom = (roomId, message, sender) => {
    const room = rooms[roomId];
    if (room && room.clients) {
        room.clients.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                console.log(`[Server] Broadcasting message to client in room ${roomId}. Message: ${JSON.stringify(message)}`);
                client.send(JSON.stringify(message));
            }
        });
    }
};

wss.on('connection', ws => {
    console.log('[Server] A client connected.');
    ws.roomId = null;

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message.toString());
            console.log('[Server] Received message:', data);
        } catch (e) {
            console.error('[Server] Failed to parse message:', message.toString(), e);
            return;
        }

        switch (data.type) {
            case 'create-room': {
                const roomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = roomId;
                rooms[roomId] = {
                    clients: [ws],
                };
                const response = { type: 'room-created', roomId: roomId, color: 'white' };
                ws.send(JSON.stringify(response));
                console.log(`[Server] Room created: ${roomId}. Sent to creator:`, response);
                break;
            }
            case 'join-room': {
                const roomId = data.roomId;
                const room = rooms[roomId];
                if (room && room.clients.length < 2) {
                    ws.roomId = roomId;
                    room.clients.push(ws);
                    
                    const joinResponse = { type: 'room-joined', roomId: roomId, color: 'black' };
                    ws.send(JSON.stringify(joinResponse));
                    console.log(`[Server] Player joined room ${roomId}. Sent to joiner:`, joinResponse);
                    
                    const opponentNotification = { type: 'player-joined' };
                    broadcastToRoom(roomId, opponentNotification, ws);
                     console.log(`[Server] Notified opponent in room ${roomId}:`, opponentNotification);
                } else {
                    const errorResponse = { type: 'error', message: 'Room not found or is full.' };
                    ws.send(JSON.stringify(errorResponse));
                    console.log(`[Server] Join room failed for ${roomId}. Sent:`, errorResponse);
                }
                break;
            }
            case 'game-move':
            case 'resign':
            case 'forfeit-timeout':
            case 'turn-pass-timeout':
            {
                if (ws.roomId) {
                    console.log(`[Server] Relaying '${data.type}' message in room ${ws.roomId}`);
                    broadcastToRoom(ws.roomId, data, ws);
                } else {
                    console.error('[Server] Cannot relay message. Client not in a room.');
                }
                break;
            }
            default:
                console.log(`[Server] Received unhandled message type: ${data.type}`);
        }
    });

    ws.on('close', () => {
        console.log('[Server] Client disconnected.');
        if (ws.roomId) {
            const room = rooms[ws.roomId];
            if (room) {
                // Notify remaining player
                console.log(`[Server] Notifying opponent in room ${ws.roomId} of disconnection.`);
                broadcastToRoom(ws.roomId, { type: 'opponent-disconnected' }, ws);
                
                // Clean up the room
                delete rooms[ws.roomId];
                console.log(`[Server] Room ${ws.roomId} closed.`);
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
