
const http = require('http');
const WebSocket = require('ws');
const cors =require('cors');

const WSS_PORT = 8082;

const rooms = {};
const clients = new Map();

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const httpServer = http.createServer((req, res) => {
  console.log(`HTTP Server: Received request for ${req.url}`);
  console.log('HTTP Server: Request Headers:', JSON.stringify(req.headers, null, 2));

  cors()(req, res, () => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
      console.log(`HTTP Server: Request for ${req.url} is a WebSocket upgrade. Passing to WebSocket server.`);
      // Let the WebSocket server handle it by not ending the response here.
      return;
    }

    if (!res.writableEnded) {
      console.log(`HTTP Server: Request for ${req.url} is a non-WebSocket HTTP request. Sending 404.`);
      res.writeHead(404);
      res.end();
    }
  });
});

const wss = new WebSocket.Server({ server: httpServer });
console.log(`Signaling server (HTTP with WebSocket upgrade) starting, attempting to listen on http://0.0.0.0:${WSS_PORT}`);


wss.on('headers', (headers, req) => {
    const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    console.log(`WebSocketServer: Received headers for an incoming connection attempt from IP: ${clientIp}. Path: ${req.url}`);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const clientId = generateId();
  clients.set(ws, clientId);
  console.log(`Client ${clientId} (IP: ${clientIp}) connected to path ${req.url}`);

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Failed to parse message or message is not JSON:', message, e);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      return;
    }

    console.log(`Received message from ${clientId}:`, data.type, data.roomId || '');

    const currentRoomId = ws.roomId;

    switch (data.type) {
      case 'create-room':
        const newRoomId = `room_${generateId()}`;
        rooms[newRoomId] = { creator: ws, joiner: null, offer: null, answer: null, creatorCandidates: [], joinerCandidates: [] };
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
          ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId, offer: roomToJoin.offer, candidates: roomToJoin.creatorCandidates }));
          if (roomToJoin.creator) {
            roomToJoin.creator.send(JSON.stringify({ type: 'peer-joined', roomId: data.roomId }));
          }
        } else {
          console.log(`Room ${data.roomId} not found or full for client ${clientId}`);
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
        }
        break;

      case 'offer':
        if (currentRoomId && rooms[currentRoomId]) {
          rooms[currentRoomId].offer = data.payload;
          console.log(`Offer from ${clientId} for room ${currentRoomId}`);
          if (rooms[currentRoomId].joiner && ws === rooms[currentRoomId].creator) {
            rooms[currentRoomId].joiner.send(JSON.stringify({ type: 'offer', payload: data.payload, roomId: currentRoomId }));
          }
        }
        break;

      case 'answer':
        if (currentRoomId && rooms[currentRoomId] && rooms[currentRoomId].creator && ws === rooms[currentRoomId].joiner) {
          rooms[currentRoomId].answer = data.payload;
          console.log(`Answer from ${clientId} for room ${currentRoomId}`);
          rooms[currentRoomId].creator.send(JSON.stringify({ type: 'answer', payload: data.payload, roomId: currentRoomId }));
          rooms[currentRoomId].joinerCandidates.forEach(candidate => {
            if (rooms[currentRoomId].creator) {
                rooms[currentRoomId].creator.send(JSON.stringify({ type: 'candidate', payload: candidate, roomId: currentRoomId }));
            }
          });
          rooms[currentRoomId].joinerCandidates = [];
        }
        break;

      case 'candidate':
        if (currentRoomId && rooms[currentRoomId]) {
          console.log(`Candidate from ${clientId} for room ${currentRoomId}`);
          const room = rooms[currentRoomId];
          const targetPeer = ws.isCreator ? room.joiner : room.creator;

          if (targetPeer) {
            targetPeer.send(JSON.stringify({ type: 'candidate', payload: data.payload, roomId: currentRoomId }));
          } else {
            if(ws.isCreator) {
                room.creatorCandidates.push(data.payload);
            } else {
                room.joinerCandidates.push(data.payload);
            }
            console.log(`Candidate from ${clientId} queued for room ${currentRoomId}`);
          }
        }
        break;

      case 'move':
        if (currentRoomId && rooms[currentRoomId]) {
          console.log(`Move from ${clientId} in room ${currentRoomId}:`, data.payload);
          const room = rooms[currentRoomId];
          const targetPeer = ws === room.creator ? room.joiner : room.creator;
          if (targetPeer) {
            targetPeer.send(JSON.stringify({ type: 'move', payload: data.payload, roomId: currentRoomId }));
          }
        }
        break;

      case 'error-signal':
        if (currentRoomId && rooms[currentRoomId]) {
            console.log(`Error signal from ${clientId} in room ${currentRoomId}: ${data.message}`);
            const room = rooms[currentRoomId];
            const targetPeer = ws === room.creator ? room.joiner : room.creator;
            if (targetPeer) {
                targetPeer.send(JSON.stringify({ type: 'peer-error', message: data.message, roomId: currentRoomId }));
            }
        }
        break;

      default:
        console.log(`Unknown message type from ${clientId}: ${data.type}`);
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
    }
  });

  ws.on('close', () => {
    const closedClientId = clients.get(ws);
    console.log(`Client ${closedClientId} disconnected`);
    const currentRoomId = ws.roomId;
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const remainingPeer = ws === room.creator ? room.joiner : room.creator;
      if (remainingPeer) {
        remainingPeer.send(JSON.stringify({ type: 'peer-disconnected', roomId: currentRoomId }));
        if (remainingPeer === room.creator) {
            console.log(`Joiner left room ${currentRoomId}. Resetting joiner-specific parts.`);
            rooms[currentRoomId].joiner = null;
            rooms[currentRoomId].answer = null;
            rooms[currentRoomId].joinerCandidates = [];
        } else {
            console.log(`Creator left room ${currentRoomId}. Closing room.`);
             delete rooms[currentRoomId];
             console.log(`Room ${currentRoomId} closed as creator disconnected.`);
        }
      } else {
        delete rooms[currentRoomId];
        console.log(`Room ${currentRoomId} removed as no peers remain or creator left before join.`);
      }
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    const errorClientId = clients.get(ws);
    console.error(`Error from client ${errorClientId}:`, error);
  });
});

httpServer.listen(WSS_PORT, '0.0.0.0', () => {
  console.log(`HTTP server with WebSocket support is listening on port ${WSS_PORT}. Ready for connections on any path.`);
});

httpServer.on('error', (error) => {
  console.error('HTTP Server encountered an error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${WSS_PORT} is already in use. Ensure no other process (like a previous server.js) is using it.`);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in server.js:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
