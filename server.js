
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
    let myRoomId = null;

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
                myRoomId = roomId;
                ws.send(JSON.stringify({ type: 'room-created', roomId }));
                console.log(`Room created: ${roomId}`);
                break;
            }
            case 'join-room': {
                const { roomId } = data;
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    myRoomId = roomId;
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    // Notify creator that peer joined
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId }));
                    // Notify joiner that room was joined successfully
                    ws.send(JSON.stringify({ type: 'room-joined', roomId }));
                    console.log(`Client joined room ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            default: { // Relay all other messages like offer, answer, candidate
                const { roomId } = data;
                if (roomId && rooms[roomId]) {
                    const peers = rooms[roomId];
                    const otherPeer = peers.find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`Relaying '${data.type}' to peer in room ${roomId}`);
                        otherPeer.send(msgStr);
                    } else {
                        console.log(`Could not find or send to other peer in room ${roomId}. Other peer readyState: ${otherPeer?.readyState}`);
                    }
                } else {
                     console.log(`Could not find room for sending client for message type ${data.type}.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (myRoomId && rooms[myRoomId]) {
            const peers = rooms[myRoomId];
            const otherPeer = peers.find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
            delete rooms[myRoomId];
             console.log(`Room ${myRoomId} cleaned up.`);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server started on port ${PORT}`);
});
