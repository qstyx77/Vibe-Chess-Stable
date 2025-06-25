
const WebSocket = require('ws');
const http = require('http');

// Simple in-memory store for rooms
const rooms = {};

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const server = http.createServer((req, res) => {
    // Basic HTTP server to respond to health checks or other requests if needed
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});


const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        let data;
        const messageString = message.toString();
        try {
            data = JSON.parse(messageString);
        } catch (e) {
            console.error('Failed to parse message:', e);
            return;
        }

        const { type, roomId, payload } = data;

        switch (type) {
            case 'create-room': {
                const newRoomId = generateId();
                rooms[newRoomId] = [ws];
                ws.roomId = newRoomId; // Attach roomId to the WebSocket object
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`Room created: ${newRoomId}`);
                break;
            }

            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    rooms[roomId].push(ws);
                    ws.roomId = roomId; // Attach roomId to the WebSocket object
                    
                    const creator = rooms[roomId][0];
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`Client joined room: ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }

            // All other message types are for relaying
            default: {
                const currentRoomId = ws.roomId;
                if (currentRoomId && rooms[currentRoomId]) {
                    const room = rooms[currentRoomId];
                    const otherPeer = room.find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                         if (type === 'candidate') console.log(`Relaying candidate for room ${currentRoomId}`);
                         if (type === 'offer') console.log(`Relaying offer for room ${currentRoomId}`);
                         if (type === 'answer') console.log(`Relaying answer for room ${currentRoomId}`);
                        otherPeer.send(messageString); // Forward the original message string
                    } else {
                        console.log(`Could not find other peer or other peer not ready in room ${currentRoomId}`);
                    }
                } else {
                     console.log(`Could not find room for client with roomId ${currentRoomId}`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const roomId = ws.roomId;
        if (roomId && rooms[roomId]) {
            // Remove the disconnected client
            rooms[roomId] = rooms[roomId].filter(peer => peer !== ws);

            if (rooms[roomId].length > 0) {
                // Notify the remaining peer
                const otherPeer = rooms[roomId][0];
                 if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                 }
            } else {
                // If room is empty, delete it
                delete rooms[roomId];
                console.log(`Room closed and deleted: ${roomId}`);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server started on port ${PORT}`);
});
