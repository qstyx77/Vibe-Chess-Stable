
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });

// Key: roomId, Value: Array of two WebSocket connections
const rooms = {};

// Key: WebSocket connection, Value: roomId
const wsToRoomMap = new Map();

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        const messageString = message.toString();
        let data;
        try {
            data = JSON.parse(messageString);
        } catch (e) {
            console.error('Failed to parse message:', messageString, e);
            return;
        }

        const { type, roomId } = data;

        switch (type) {
            case 'create-room': {
                const newRoomId = generateId();
                rooms[newRoomId] = [ws];
                wsToRoomMap.set(ws, newRoomId);
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`Room created: ${newRoomId}`);
                break;
            }

            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    rooms[roomId].push(ws);
                    wsToRoomMap.set(ws, roomId);
                    
                    const creator = rooms[roomId][0];
                    if (creator && creator.readyState === WebSocket.OPEN) {
                        creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                    }
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`Client joined room: ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }

            // All other message types are for relaying
            default: {
                const currentRoomId = wsToRoomMap.get(ws);
                if (currentRoomId && rooms[currentRoomId]) {
                    const roomPeers = rooms[currentRoomId];
                    const otherPeer = roomPeers.find(peer => peer !== ws);
                    
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`Relaying message of type '${type}' to other peer in room ${currentRoomId}`);
                        otherPeer.send(messageString); // Forward the original message string
                    } else {
                        console.log(`Could not find or send to other peer in room ${currentRoomId}. Other peer readyState: ${otherPeer?.readyState}`);
                    }
                } else {
                     console.log(`Could not find room for sending client. Room map lookup failed for this ws connection.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const roomId = wsToRoomMap.get(ws);
        if (roomId && rooms[roomId]) {
            const otherPeer = rooms[roomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
            
            // Clean up
            delete rooms[roomId];
            wsToRoomMap.delete(ws);
            if (otherPeer) {
                wsToRoomMap.delete(otherPeer);
            }
            console.log(`Room ${roomId} closed and deleted.`);
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
