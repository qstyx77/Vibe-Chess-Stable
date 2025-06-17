
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors'); // Import the cors package

const WSS_PORT = 8082; // Define the port

const rooms = {}; // Stores room data, e.g., { roomId: { creator: ws, joiner: ws } }
const clients = new Map(); // Stores ws -> clientId mapping

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Create an HTTP server
const httpServer = http.createServer((req, res) => {
  // Use cors middleware to handle CORS for all HTTP requests
  // This will handle pre-flight OPTIONS requests and add CORS headers to other requests.
  cors()(req, res, () => {
    // If CORS middleware doesn't end the response (e.g., for a non-OPTIONS request it modified),
    // and it's not a WebSocket upgrade request, then this server isn't meant to handle it.
    if (req.headers.upgrade !== 'websocket' && !res.writableEnded) {
      console.log(`HTTP Server: Received non-WebSocket request for ${req.url}, sending 404.`);
      res.writeHead(404);
      res.end();
    }
    // If it IS a WebSocket upgrade, the 'ws' server (wss) will handle it via the 'upgrade' event on httpServer.
  });
});

// Create a WebSocket server and attach it to the HTTP server
// We are not specifying a 'path' here, so it should handle upgrades on any path the HTTP server passes to it.
const wss = new WebSocket.Server({ server: httpServer });

console.log(`Signaling server (HTTP with WebSocket upgrade) starting, attempting to listen on http://0.0.0.0:${WSS_PORT}`);

wss.on('headers', (headers, req) => {
    const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    // The req.url here will be the path the client requested for the WebSocket connection.
    console.log(`WebSocketServer: Received headers for an incoming connection attempt from IP: ${clientIp}. Path: ${req.url}`);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const clientId = generateId();
  clients.set(ws, clientId);
  // req.url will give the path the WebSocket connection was established on.
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
  // This confirms the HTTP server is listening, which is what the WebSocket server is attached to.
  console.log(`HTTP server with WebSocket support is listening on port ${WSS_PORT}. Ready for connections on any path.`);
});

httpServer.on('error', (error) => {
  console.error('HTTP Server encountered an error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${WSS_PORT} is already in use. Ensure no other process (like a previous server.js) is using it.`);
    // process.exit(1); // Optional: exit if port is in use
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in server.js:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

