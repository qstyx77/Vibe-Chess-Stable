
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
        console.log(`[SERVER LOG] Broadcasting message to room ${roomId}:`, message);
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                console.log(`[SERVER LOG] Sending to client in room ${roomId}. Is sender: ${client === sender}`);
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
            return;
        }

        switch (data.type) {
            case 'create-room': {
                const roomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = roomId;
                rooms[roomId] = {
                    clients: [ws],
                };
                ws.send(JSON.stringify({ type: 'room-created', roomId: roomId, color: 'white' }));
                break;
            }
            case 'join-room': {
                const roomId = data.roomId;
                const room = rooms[roomId];
                if (room && room.clients.length < 2) {
                    ws.roomId = roomId;
                    room.clients.push(ws);
                    
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId, color: 'black' }));
                    
                    broadcastToRoom(roomId, { type: 'player-joined' }, ws);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            case 'game-move':
            case 'resign':
            case 'forfeit-timeout':
            case 'turn-pass-timeout':
            case 'anvil-spawn':
            case 'shroom-spawn':
            {
                if (ws.roomId) {
                    broadcastToRoom(ws.roomId, data, ws);
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
                broadcastToRoom(ws.roomId, { type: 'opponent-disconnected' }, ws);
                delete rooms[ws.roomId];
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
