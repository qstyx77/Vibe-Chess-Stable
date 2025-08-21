
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

const rooms = {};
const clientToRoom = new Map();

const sendToPeer = (roomId, message, sender) => {
  const clients = rooms[roomId];
  if (clients && clients.length === 2) {
    const peer = clients.find(client => client !== sender);
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(message);
    } else {
        console.log(`[Server] Peer not found or not open in room ${roomId}.`);
    }
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
    if (remainingClients.length > 0) {
        rooms[roomId] = remainingClients;
        sendToPeer(roomId, JSON.stringify({ type: 'peer-disconnected' }), ws);
        console.log(`[Server] Notified remaining peer in room ${roomId} of disconnection.`);
    } else {
        console.log(`[Server] Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
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

        const { type, roomId } = data;
        const currentRoomId = clientToRoom.get(ws);

        switch (type) {
            case 'create-room':
                if (currentRoomId) leaveRoom(ws);
                const newRoomId = Math.random().toString(36).substring(2, 9);
                rooms[newRoomId] = [ws];
                clientToRoom.set(ws, newRoomId);
                ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
                console.log(`[Server] Room created: ${newRoomId}`);
                break;
            
            case 'join-room':
                if (rooms[roomId] && rooms[roomId].length < 2) {
                    if (currentRoomId) leaveRoom(ws);
                    rooms[roomId].push(ws);
                    clientToRoom.set(ws, roomId);
                    ws.send(JSON.stringify({ type: 'room-joined', roomId: roomId }));
                    sendToPeer(roomId, JSON.stringify({ type: 'peer-joined' }), ws);
                    console.log(`[Server] Client joined room ${roomId}. Notifying peer.`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
                }
                break;

            case 'offer':
            case 'answer':
            case 'candidate':
            case 'game-move':
                if (currentRoomId) {
                  sendToPeer(currentRoomId, messageStr, ws);
                } else {
                  console.error(`[Server] Cannot relay '${type}'. Client not in a room.`);
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
