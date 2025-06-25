
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

    ws.roomId = null;

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
        console.log(`[Server] Received message type '${type}' from client with current ws.roomId: '${ws.roomId || 'N/A'}' for message roomId: '${roomId || 'N/A'}'`);

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                ws.roomId = newRoomId;
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}. Creator assigned to room.`);
                break;
            }
            case 'join-room': {
                console.log(`[Server] Attempting to join room ${roomId}. Current rooms:`, Object.keys(rooms));
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    ws.roomId = roomId;
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    console.log(`[Server] Notifying creator in room ${roomId} that a peer has joined.`);
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));

                    console.log(`[Server] Confirming room join with the joiner in room ${roomId}.`);
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`[Server] Client successfully joined room ${roomId}. Room now has ${rooms[roomId].length} peers.`);
                } else {
                    const reason = !rooms[roomId] ? 'Room not found' : `Room is full (${rooms[roomId].length} peers)`;
                    console.error(`[Server] Join failed for room ${roomId}. Reason: ${reason}.`);
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            default: {
                const relayRoomId = ws.roomId;
                if (relayRoomId && rooms[relayRoomId]) {
                    const otherPeer = rooms[relayRoomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`[Server] Relaying message type '${type}' to peer in room ${relayRoomId}.`);
                        otherPeer.send(msgStr);
                    } else {
                        console.warn(`[Server] Could not relay message type '${type}' in room ${relayRoomId}. Peer not found or not open.`);
                    }
                } else {
                    console.error(`[Server] Could not find room to relay message type '${type}' for client with ws.roomId '${relayRoomId}'.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        const roomIdToClean = ws.roomId;
        console.log(`[Server] Client disconnected. Cleaning up room: ${roomIdToClean || 'N/A'}`);
        
        if (roomIdToClean && rooms[roomIdToClean]) {
            rooms[roomIdToClean] = rooms[roomIdToClean].filter(peer => peer !== ws);
            
            if (rooms[roomIdToClean].length > 0) {
                const otherPeer = rooms[roomIdToClean][0];
                if(otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    console.log(`[Server] Notifying remaining peer in room ${roomIdToClean} of disconnection.`);
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                }
            } 
            
            if (rooms[roomIdToClean].length === 0) {
                delete rooms[roomIdToClean];
                console.log(`[Server] Room ${roomIdToClean} is now empty and has been deleted.`);
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
