
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const WSS_PORT = 8082;

const rooms = {};

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

const httpServer = http.createServer((req, res) => {
  cors()(req, res, () => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      return;
    }
    if (!res.writableEnded) {
      res.writeHead(404);
      res.end();
    }
  });
});

const wss = new WebSocket.Server({ server: httpServer });
console.log(`Signaling server starting on port ${WSS_PORT}`);

wss.on('connection', (ws) => {
  let currentRoomId = null;

  console.log('Client connected');

  ws.on('message', (message) => {
    const messageString = message.toString();
    let data;
    try {
        data = JSON.parse(messageString);
    } catch(e) {
        console.error("Failed to parse message", e);
        return;
    }


    switch (data.type) {
      case 'create-room':
        currentRoomId = `room_${generateId()}`;
        rooms[currentRoomId] = [ws];
        console.log(`Room ${currentRoomId} created.`);
        ws.send(JSON.stringify({ type: 'room-created', roomId: currentRoomId }));
        break;

      case 'join-room':
        const roomToJoin = rooms[data.roomId];
        if (roomToJoin && roomToJoin.length === 1) {
          currentRoomId = data.roomId;
          roomToJoin.push(ws);
          console.log(`Client joined room ${currentRoomId}`);
          
          const creatorWs = roomToJoin[0];
          if (creatorWs && creatorWs.readyState === WebSocket.OPEN) {
            creatorWs.send(JSON.stringify({ type: 'peer-joined', roomId: currentRoomId }));
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'room-joined', roomId: currentRoomId }));
          }
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
        }
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
      case 'move':
      case 'forfeit-timeout':
      case 'turn-pass-timeout':
      case 'resign':
      case 'commander-promo':
      case 'pawn-sacrifice':
      case 'game-over':
        if (currentRoomId && rooms[currentRoomId]) {
          const room = rooms[currentRoomId];
          const otherPeer = room.find(peer => peer !== ws);
          if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
            otherPeer.send(messageString);
          }
        }
        break;
      
      default:
        console.log(`Unknown message type: ${data.type}`);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const otherPeer = room.find(peer => peer !== ws);
      if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
        otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
      }
      delete rooms[currentRoomId];
      console.log(`Room ${currentRoomId} closed.`);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error:`, error);
  });
});

httpServer.listen(WSS_PORT, '0.0.0.0', () => {
  console.log(`HTTP server with WebSocket support is listening on port ${WSS_PORT}.`);
});
