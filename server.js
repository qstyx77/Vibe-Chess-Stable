
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });

// Map from a roomId to an array of ws clients in that room.
const rooms = {};
// Map from a ws client to the roomId it's in.
const clientToRoom = new Map();

const broadcastToRoom = (roomId, message, sender) => {
  const clients = rooms[roomId];
  if (clients) {
    clients.forEach(client => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

const leaveRoom = (ws) => {
    const roomId = clientToRoom.get(ws);
    if (!roomId) return;

    console.log(`[Server] Client leaving room ${roomId}`);
    clientToRoom.delete(ws);

    const room = rooms[roomId];
    if (!room) return;

    const newRoom = room.filter(client => client !== ws);
    if (newRoom.length === 0) {
        console.log(`[Server] Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        rooms[roomId] = newRoom;
        // Notify remaining peer
        const remainingPeer = newRoom[0];
        if (remainingPeer && remainingPeer.readyState === WebSocket.OPEN) {
            remainingPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            console.log(`[Server] Notified peer in room ${roomId} of disconnection.`);
        }
    }
};

wss.on('connection', ws => {
    console.log('[Server] Client connected.');

    ws.on('message', messageStr => {
        let data;
        try {
            data = JSON.parse(messageStr);
        } catch (e) {
            console.error('[Server] Failed to parse message:', messageStr, e);
            return;
        }

        const { type, roomId } = data;
        console.log(`[Server] Received message type '${type}' for room '${roomId || 'N/A'}'`);

        switch (type) {
            case 'create-room': {
                leaveRoom(ws); // Ensure client isn't in another room
                const newRoomId = Math.random().toString(36).substring(2, 9);
                rooms[newRoomId] = [ws];
                clientToRoom.set(ws, newRoomId);
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}`);
                break;
            }
            case 'join-room': {
                if (rooms[roomId] && rooms[roomId].length === 1) {
                    leaveRoom(ws); // Ensure client isn't in another room
                    rooms[roomId].push(ws);
                    clientToRoom.set(ws, roomId);
                    
                    const creator = rooms[roomId][0];
                    if (creator && creator.readyState === WebSocket.OPEN) {
                      creator.send(JSON.stringify({ type: 'peer-joined', roomId }));
                      console.log(`[Server] Sent 'peer-joined' to creator in room ${roomId}.`);
                    }

                    ws.send(JSON.stringify({ type: 'room-joined', roomId }));
                    console.log(`[Server] Client joined room ${roomId}.`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;
            }
            default: {
                // For all other messages, just relay them to the other person in the room.
                const currentRoomId = clientToRoom.get(ws);
                if (currentRoomId) {
                  console.log(`[Server] Relaying message type '${type}' to peer in room ${currentRoomId}.`);
                  broadcastToRoom(currentRoomId, messageStr, ws);
                } else {
                  console.error(`[Server] Cannot relay message. Client not in a room.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('[Server] Client disconnected.');
        leaveRoom(ws);
    });

    ws.on('error', (err) => {
        console.error('[Server] WebSocket error:', err);
        leaveRoom(ws);
    });
});

const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
