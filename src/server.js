
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });
const rooms = {};

wss.on('connection', ws => {
    console.log('[Server] Client connected.');
    let currentRoomId = null;

    ws.on('message', message => {
        const msgStr = message.toString();
        let data;
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            console.error('[Server] Failed to parse message:', msgStr, e);
            return;
        }

        const { type, roomId } = data;
        console.log(`[Server] Received message type '${type}' for roomId '${roomId || 'N/A'}'`);

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                currentRoomId = newRoomId;
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}.`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    currentRoomId = roomId;
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    if (creator && creator.readyState === WebSocket.OPEN) {
                      creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                    }

                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`[Server] Client joined room ${roomId}.`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            default: { // Relaying offers, answers, candidates
                if (roomId && rooms[roomId]) {
                    const otherPeer = rooms[roomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`[Server] Relaying message type '${type}' to peer in room ${roomId}.`);
                        otherPeer.send(msgStr);
                    } else {
                        console.warn(`[Server] Could not relay message type '${type}' in room ${roomId}. Peer not found or not open.`);
                    }
                } else {
                  console.error(`[Server] Could not find room to relay message type '${type}'. Provided roomId: '${roomId}'.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log(`[Server] Client disconnected. Cleaning up room: ${currentRoomId || 'N/A'}`);
        if (currentRoomId && rooms[currentRoomId]) {
            rooms[currentRoomId] = rooms[currentRoomId].filter(peer => peer !== ws);
            if (rooms[currentRoomId].length === 0) {
                delete rooms[currentRoomId];
                console.log(`[Server] Room ${currentRoomId} is empty and has been deleted.`);
            } else {
                const remainingPeer = rooms[currentRoomId][0];
                if (remainingPeer && remainingPeer.readyState === WebSocket.OPEN) {
                    remainingPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                }
            }
        }
    });

    ws.on('error', (err) => {
        console.error('[Server] WebSocket error:', err);
    });
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
