const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });

// Simple object to store rooms. Key is roomId, value is an array of ws connections.
const rooms = {};

wss.on('connection', ws => {
    console.log('Client connected.');

    // We need to associate a connection with a room. Let's do it on the ws object itself.
    let currentRoomId = null;

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

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                rooms[newRoomId] = [ws];
                currentRoomId = newRoomId; // Store it for this connection
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`Room created: ${newRoomId}`);
                break;
            }

            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    rooms[roomId].push(ws);
                    currentRoomId = roomId; // Store it for this connection
                    const creator = rooms[roomId][0];
                    // Notify both players
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`Client joined room ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            
            // For all other message types (offer, answer, candidate), just relay them.
            default: {
                if (roomId && rooms[roomId]) {
                    const otherPeer = rooms[roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        // Forward the original message string
                        otherPeer.send(msgStr);
                         // Add explicit logging for candidates to be sure
                        if (type === 'candidate') {
                            console.log(`Relayed candidate from a client in room ${roomId}`);
                        }
                    }
                } else {
                    console.error(`Could not find room ${roomId} to relay message type '${type}'`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (currentRoomId && rooms[currentRoomId]) {
            // Remove the disconnected client from the room
            rooms[currentRoomId] = rooms[currentRoomId].filter(peer => peer !== ws);
            
            if (rooms[currentRoomId].length > 0) {
                // Notify the remaining peer
                const otherPeer = rooms[currentRoomId][0];
                if(otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                }
            } 
            
            // If room is empty, delete it
            if (rooms[currentRoomId].length === 0) {
                delete rooms[currentRoomId];
                console.log(`Room ${currentRoomId} cleaned up.`);
            }
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
