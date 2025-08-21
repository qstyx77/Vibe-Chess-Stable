
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Basic health check for the server itself
    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    res.writeHead(404);
    res.end();
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

    const remainingClients = room.filter(client => client !== ws);
    if (remainingClients.length === 0) {
        console.log(`[Server] Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        rooms[roomId] = remainingClients;
        // Notify remaining peers that the other has disconnected
        broadcastToRoom(roomId, JSON.stringify({ type: 'peer-disconnected' }), ws);
        console.log(`[Server] Notified remaining peers in room ${roomId} of disconnection.`);
    }
};

wss.on('connection', ws => {
    console.log('[Server] Client connected.');

    ws.on('message', message => {
        const messageStr = message.toString();
        let data;
        try {
            data = JSON.parse(messageStr);
        } catch (e) {
            console.error('[Server] Failed to parse message:', messageStr, e);
            return;
        }

        const { type, roomId, payload } = data;
        
        switch (type) {
            case 'create-room':
                leaveRoom(ws); 
                const newRoomId = Math.random().toString(36).substring(2, 9);
                rooms[newRoomId] = [ws];
                clientToRoom.set(ws, newRoomId);
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}`);
                break;
            
            case 'join-room':
                if (rooms[roomId] && rooms[roomId].length < 2) {
                    leaveRoom(ws); 
                    rooms[roomId].push(ws);
                    clientToRoom.set(ws, roomId);
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    broadcastToRoom(roomId, JSON.stringify({ type: 'peer-joined', roomId: roomId }), ws);
                    console.log(`[Server] Client joined room ${roomId}. Notifying peer.`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;

            case 'offer':
            case 'answer':
            case 'candidate':
                 const currentRoomIdForRelay = clientToRoom.get(ws);
                 if (currentRoomIdForRelay) {
                   console.log(`[Server] Relaying message type '${type}' to peer in room ${currentRoomIdForRelay}.`);
                   broadcastToRoom(currentRoomIdForRelay, messageStr, ws);
                 } else if (roomId) { // Fallback for joiner before map is set
                   console.log(`[Server] Relaying message type '${type}' to peer in room ${roomId} (using provided roomId).`);
                   broadcastToRoom(roomId, messageStr, ws);
                 } else {
                   console.error(`[Server] Cannot relay message. Client not in a room and no roomId provided.`);
                 }
                 break;

            default:
                console.warn(`[Server] Received unhandled message type: ${type}`);
                break;
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

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
