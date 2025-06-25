
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

    ws.on('message', message => {
        const msgStr = message.toString();
        let data;
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            console.error('Failed to parse message:', msgStr, e);
            return;
        }

        const { type, roomId } = data;

        if (type === 'create-room') {
            const newRoomId = Math.random().toString(36).substring(2, 9);
            ws.roomId = newRoomId;
            rooms[newRoomId] = [ws];
            ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
            console.log(`Room created: ${newRoomId}`);
            return; 
        }

        if (type === 'join-room') {
            if (rooms[roomId] && rooms[roomId].length === 1) {
                ws.roomId = roomId;
                rooms[roomId].push(ws);
                
                const creator = rooms[roomId][0];
                creator.send(JSON.stringify({ type: 'peer-joined', roomId }));
                ws.send(JSON.stringify({ type: 'room-joined', roomId }));
                console.log(`Client joined room ${roomId}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
            }
            return;
        }

        // For ALL other message types (offer, answer, candidate, game moves, etc.)
        // just relay them to the other peer in the room.
        if (ws.roomId && rooms[ws.roomId]) {
            const otherPeer = rooms[ws.roomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                console.log(`Relaying '${type}' to peer in room ${ws.roomId}`);
                otherPeer.send(msgStr); // Forward the original message string
            } else if (otherPeer) {
                 console.warn(`Could not relay '${type}' to peer in room ${ws.roomId}, peer state is ${otherPeer.readyState}`);
            }
             else {
                console.error(`Could not find peer to relay '${type}' in room ${ws.roomId}`);
            }
        } else {
            console.error(`Could not find room for client sending message type '${type}'. ws.roomId is ${ws.roomId}.`);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        const roomId = ws.roomId;
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
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
