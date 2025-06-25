
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

        const { type, roomId, payload } = data; // Destructure all possible fields

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = newRoomId; // Attach roomId to the ws connection object
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`Room created: ${newRoomId}`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    ws.roomId = roomId;
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    // Notify both peers
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId }));
                    ws.send(JSON.stringify({ type: 'room-joined', roomId }));
                    console.log(`Client joined room ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            // All other messages are just for relaying
            case 'offer':
            case 'answer':
            case 'candidate': {
                 if (ws.roomId && rooms[ws.roomId]) {
                    const otherPeer = rooms[ws.roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`Relaying '${type}' to peer in room ${ws.roomId}`);
                        otherPeer.send(msgStr);
                    }
                } else {
                    console.error(`Could not find room for client sending message type '${type}'. This might happen if a message is sent after a room is closed.`);
                }
                break;
            }
            // Handle game-specific messages that also need to be relayed
            default: {
                if (ws.roomId && rooms[ws.roomId]) {
                    const otherPeer = rooms[ws.roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                       otherPeer.send(msgStr);
                    }
                } else {
                   console.warn(`Received message of type '${type}' from a client not in a known room.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        const roomId = ws.roomId; // Use the attached roomId
        if (roomId && rooms[roomId]) {
            const otherPeer = rooms[roomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
            // Clean up the room
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
