
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', ws => {
    console.log('Client connected.');

    const findRoomByClient = (client) => {
        for (const roomId in rooms) {
            if (rooms[roomId].includes(client)) {
                return roomId;
            }
        }
        return null;
    };

    ws.on('message', message => {
        const msgStr = message.toString();
        let data;
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            console.error('Failed to parse message:', msgStr, e);
            return;
        }

        switch (data.type) {
            case 'create-room': {
                const roomId = Math.random().toString(36).substring(2, 9);
                rooms[roomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId }));
                console.log(`Room created: ${roomId}`);
                break;
            }
            case 'join-room': {
                const { roomId } = data;
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId }));
                    ws.send(JSON.stringify({ type: 'room-joined', roomId }));
                    console.log(`Client joined room ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            case 'offer':
            case 'answer':
            case 'candidate': {
                const roomId = findRoomByClient(ws);
                if (roomId && rooms[roomId]) {
                    const otherPeer = rooms[roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`Relaying '${data.type}' to peer in room ${roomId}`);
                        otherPeer.send(msgStr);
                    }
                }
                break;
            }
            default: { // All other game-specific messages
                const roomId = findRoomByClient(ws);
                if (roomId && rooms[roomId]) {
                    const otherPeer = rooms[roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        otherPeer.send(msgStr);
                    }
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        const roomId = findRoomByClient(ws);
        if (roomId && rooms[roomId]) {
            const otherPeer = rooms[roomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
            delete rooms[roomId];
            console.log(`Room ${roomId} cleaned up.`);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    // This log is critical for confirming the server started.
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
