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

    // Each ws connection will have its roomId attached directly
    // This is more reliable than relying on a variable in the closure
    ws.roomId = null;

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
                ws.roomId = newRoomId; // Attach roomId to the connection object
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`Room created: ${newRoomId}`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    ws.roomId = roomId; // Attach roomId to the connection object
                    rooms[roomId].push(ws);
                    const creator = rooms[roomId][0];
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`Client joined room ${roomId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            default: {
                // For relaying, trust the roomId on the connection object first,
                // then fallback to the one in the message.
                const relayRoomId = ws.roomId || roomId;
                if (relayRoomId && rooms[relayRoomId]) {
                    const otherPeer = rooms[relayRoomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        otherPeer.send(msgStr);
                         // Explicitly log candidate relaying to be sure
                        if (type === 'candidate') {
                            console.log(`Relayed candidate from a client in room ${relayRoomId}`);
                        }
                    }
                } else {
                    console.error(`Could not find room to relay message type '${type}' for roomId '${relayRoomId}'`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        // Use the attached roomId for cleanup
        const roomIdToClean = ws.roomId;
        if (roomIdToClean && rooms[roomIdToClean]) {
            rooms[roomIdToClean] = rooms[roomIdToClean].filter(peer => peer !== ws);
            
            if (rooms[roomIdToClean].length > 0) {
                const otherPeer = rooms[roomIdToClean][0];
                if(otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                }
            } 
            
            if (rooms[roomIdToClean].length === 0) {
                delete rooms[roomIdToClean];
                console.log(`Room ${roomIdToClean} cleaned up.`);
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
