
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const WSS_PORT = 8082;

const rooms = {};
const clients = new Map();

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const httpServer = http.createServer((req, res) => {
  console.log(`HTTP Server: Received request for ${req.url}`);
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
  clients.set(ws, clientId);
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
    const currentRoomId = ws.roomId;

    switch (data.type) {
      case 'create-room':
        const newRoomId = `room_${generateId()}`;
        rooms[newRoomId] = { creator: ws, joiner: null };
        ws.roomId = newRoomId;
        ws.isCreator = true;
        console.log(`Room ${newRoomId} created by ${clientId}`);
        ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
        break;

      case 'join-room':
        const roomToJoin = rooms[data.roomId];
        if (roomToJoin && !roomToJoin.joiner) {
          roomToJoin.joiner = ws;
          ws.roomId = data.roomId;
          ws.isCreator = false;
          console.log(`Client ${clientId} joined room ${data.roomId}`);
          
          // Notify the creator that a peer has joined so they can initiate the offer
          if (roomToJoin.creator && roomToJoin.creator.readyState === WebSocket.OPEN) {
            roomToJoin.creator.send(JSON.stringify({ type: 'peer-joined', roomId: data.roomId }));
          }
          // Notify the joiner that they have successfully joined the room
          ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
        }
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
        const targetRoomId = data.roomId; // Use roomId from message payload for forwarding
        if (targetRoomId && rooms[targetRoomId]) {
          const room = rooms[targetRoomId];
          const targetPeer = ws === room.creator ? room.joiner : room.creator;
          if (targetPeer && targetPeer.readyState === WebSocket.OPEN) {
            targetPeer.send(messageString); // Forward the raw message
          } else {
            console.error(`Cannot forward ${data.type}: target peer not found or connection not open.`);
          }
        } else {
          console.error(`Cannot forward ${data.type}: room not found for roomId: ${targetRoomId}`);
        }
        break;

      // Game-specific moves are forwarded directly
      case 'move':
      case 'forfeit-timeout':
      case 'turn-pass-timeout':
      case 'resign':
      case 'commander-promo':
      case 'pawn-sacrifice':
      case 'game-over':
        if (currentRoomId && rooms[currentRoomId]) {
          const room = rooms[currentRoomId];
          const targetPeer = ws === room.creator ? room.joiner : room.creator;
          if (targetPeer && targetPeer.readyState === WebSocket.OPEN) {
            targetPeer.send(messageString); // Forward the raw message
          }
        }
        break;

      default:
        console.log(`Unknown message type from ${clientId}: ${data.type}`);
    }
  });

  ws.on('close', () => {
    const closedClientId = clients.get(ws);
    console.log(`Client ${closedClientId} disconnected`);
    const currentRoomId = ws.roomId;
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const remainingPeer = ws === room.creator ? room.joiner : room.creator;
      if (remainingPeer && remainingPeer.readyState === WebSocket.OPEN) {
        remainingPeer.send(JSON.stringify({ type: 'peer-disconnected', roomId: currentRoomId }));
      }
      // Clean up the room if either player leaves
      delete rooms[currentRoomId];
      console.log(`Room ${currentRoomId} closed.`);
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error(`Error from client ${clients.get(ws)}:`, error);
  });
});

httpServer.listen(WSS_PORT, '0.0.0.0', () => {
  console.log(`HTTP server with WebSocket support is listening on port ${WSS_PORT}.`);
});
