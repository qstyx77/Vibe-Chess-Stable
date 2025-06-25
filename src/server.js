
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

    // Each connection can only be in one room.
    let myRoomId = null;

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
        console.log(`[Server] Received message type '${type}' for roomId: '${roomId || 'N/A'}'`);

        switch (type) {
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 9);
                myRoomId = newRoomId;
                rooms[newRoomId] = [ws];
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}. Creator assigned.`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    myRoomId = roomId;
                    rooms[roomId].push(ws);
                    
                    const creator = rooms[roomId][0];
                    console.log(`[Server] Notifying creator in room ${roomId} that a peer has joined.`);
                    creator.send(JSON.stringify({ type: 'peer-joined', roomId: roomId }));

                    console.log(`[Server] Confirming room join for joiner in room ${roomId}.`);
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    console.log(`[Server] Client successfully joined room ${roomId}.`);
                } else {
                    const reason = !rooms[roomId] ? 'Room not found' : `Room is full`;
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                    console.error(`[Server] Join failed for room ${roomId}. Reason: ${reason}.`);
                }
                break;
            }
            default: {
                // For all other messages (offer, answer, candidate), just relay them.
                const relayRoomId = roomId || myRoomId;
                if (relayRoomId && rooms[relayRoomId]) {
                    const otherPeer = rooms[relayRoomId].find(peer => peer !== ws);
                    if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                        console.log(`[Server] Relaying message type '${type}' to peer in room ${relayRoomId}.`);
                        otherPeer.send(msgStr);
                    } else {
                        console.warn(`[Server] Could not relay '${type}'. Peer not found or not open in room ${relayRoomId}.`);
                    }
                } else {
                    console.error(`[Server] Could not find room to relay message '${type}'. relayRoomId: '${relayRoomId}'`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log(`[Server] Client disconnected from room: ${myRoomId || 'N/A'}`);
        
        if (myRoomId && rooms[myRoomId]) {
            rooms[myRoomId] = rooms[myRoomId].filter(peer => peer !== ws);
            
            if (rooms[myRoomId].length > 0) {
                const otherPeer = rooms[myRoomId][0];
                if(otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                    console.log(`[Server] Notifying remaining peer in room ${myRoomId} of disconnection.`);
                    otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
                }
            } 
            
            if (rooms[myRoomId].length === 0) {
                delete rooms[myRoomId];
                console.log(`[Server] Room ${myRoomId} is now empty and has been deleted.`);
            }
        }
        myRoomId = null;
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
