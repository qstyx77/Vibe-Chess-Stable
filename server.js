
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
    ws.roomId = null; // Attach roomId to ws connection for cleanup

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
        console.log(`[Server] Received message type '${type}' for room '${roomId || 'N/A'}'`);

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = newRoomId; // Tag the connection
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    ws.roomId = roomId; // Tag the connection
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    if (creator && creator.readyState === WebSocket.OPEN) {
                      creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                      console.log(`[Server] Sent 'peer-joined' to creator in room ${roomId}.`);
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
                    // Forward the message to all OTHER clients in the room.
                    rooms[roomId].forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            console.log(`[Server] Relaying message type '${type}' to peer in room ${roomId}.`);
                            client.send(msgStr);
                        }
                    });
                } else {
                  console.error(`[Server] Cannot relay message. Room '${roomId}' not found.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        const roomIdToClean = ws.roomId; // Use tagged ID for cleanup
        if (roomIdToClean && rooms[roomIdToClean]) {
            rooms[roomIdToClean] = rooms[roomIdToClean].filter(p => p !== ws);

            // Notify remaining peer if they exist
            if (rooms[roomIdToClean].length > 0) {
                const otherPeer = rooms[roomIdToClean][0];
                if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                    console.log(`[Server] Notified peer in room ${roomIdToClean} of disconnection.`);
                }
            }
            
            // Delete room if now empty
            if (rooms[roomIdToClean].length === 0) {
                delete rooms[roomIdToClean];
                console.log(`[Server] Room ${roomIdToClean} is empty and has been deleted.`);
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
