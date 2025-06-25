
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const WSS_PORT = 8082;

const rooms = {};
const clients = new Map(); // Map clientId to WebSocket

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const httpServer = http.createServer((req, res) => {
  cors()(req, res, () => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      return; // Let WebSocket server handle it
    }
    if (!res.writableEnded) {
      res.writeHead(404);
      res.end();
    }
  });
});

const wss = new WebSocket.Server({ server: httpServer });
console.log(`Signaling server starting on port ${WSS_PORT}`);

wss.on('connection', (ws, req) => {
  const clientId = generateId();
  clients.set(clientId, ws);
  ws.clientId = clientId; // Attach clientId to ws for easy lookup
  console.log(`Client ${clientId} connected.`);

  ws.on('message', (message) => {
    let data;
    const messageString = message.toString();
    try {
      data = JSON.parse(messageString);
    } catch (e) {
      console.error('Failed to parse message:', messageString, e);
      return;
    }

    console.log(`Received message from ${clientId}:`, data.type, data.roomId || '');
    
    // Find the room the sender is in for game moves
    const currentRoomId = Object.keys(rooms).find(roomId => {
        const room = rooms[roomId];
        return room.creator === clientId || room.joiner === clientId;
    });

    switch (data.type) {
      case 'create-room':
        const newRoomId = `room_${generateId()}`;
        rooms[newRoomId] = { creator: clientId, joiner: null };
        console.log(`Room ${newRoomId} created by ${clientId}`);
        ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
        break;

      case 'join-room':
        const roomToJoin = rooms[data.roomId];
        if (roomToJoin && !roomToJoin.joiner) {
          roomToJoin.joiner = clientId;
          console.log(`Client ${clientId} joined room ${data.roomId}`);
          
          const creatorWs = clients.get(roomToJoin.creator);
          if (creatorWs && creatorWs.readyState === WebSocket.OPEN) {
            creatorWs.send(JSON.stringify({ type: 'peer-joined', roomId: data.roomId }));
          }
          ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
        }
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
        const targetRoomId = data.roomId;
        if (targetRoomId && rooms[targetRoomId]) {
          const room = rooms[targetRoomId];
          const isSenderCreator = room.creator === clientId;
          const targetClientId = isSenderCreator ? room.joiner : room.creator;
          
          if (targetClientId) {
            const targetPeerWs = clients.get(targetClientId);
            if (targetPeerWs && targetPeerWs.readyState === WebSocket.OPEN) {
              // Re-stringify the parsed data object to ensure a clean payload
              targetPeerWs.send(JSON.stringify(data));
            } else {
              console.error(`Cannot forward ${data.type}: target peer ${targetClientId} not found or connection not open.`);
            }
          }
        } else {
          console.error(`Cannot forward ${data.type}: room not found for roomId: ${targetRoomId}`);
        }
        break;

      case 'move':
      case 'forfeit-timeout':
      case 'turn-pass-timeout':
      case 'resign':
      case 'commander-promo':
      case 'pawn-sacrifice':
      case 'game-over':
        if (currentRoomId && rooms[currentRoomId]) {
          const room = rooms[currentRoomId];
          const isSenderCreator = room.creator === clientId;
          const targetClientId = isSenderCreator ? room.joiner : room.creator;
          if (targetClientId) {
            const targetPeerWs = clients.get(targetClientId);
            if (targetPeerWs && targetPeerWs.readyState === WebSocket.OPEN) {
              targetPeerWs.send(messageString);
            }
          }
        }
        break;

      default:
        console.log(`Unknown message type from ${clientId}: ${data.type}`);
    }
  });

  ws.on('close', () => {
    const closedClientId = ws.clientId;
    if (!closedClientId) return;

    console.log(`Client ${closedClientId} disconnected`);
    const currentRoomId = Object.keys(rooms).find(roomId => {
        const room = rooms[roomId];
        return room.creator === closedClientId || room.joiner === closedClientId;
    });

    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const remainingClientId = room.creator === closedClientId ? room.joiner : room.creator;
      
      if (remainingClientId) {
        const remainingPeerWs = clients.get(remainingClientId);
        if (remainingPeerWs && remainingPeerWs.readyState === WebSocket.OPEN) {
            remainingPeerWs.send(JSON.stringify({ type: 'peer-disconnected', roomId: currentRoomId }));
        }
      }
      delete rooms[currentRoomId];
      console.log(`Room ${currentRoomId} closed.`);
    }
    clients.delete(closedClientId);
  });

  ws.on('error', (error) => {
    console.error(`Error from client ${ws.clientId}:`, error);
  });
});

httpServer.listen(WSS_PORT, '0.0.0.0', () => {
  console.log(`HTTP server with WebSocket support is listening on port ${WSS_PORT}.`);
});
