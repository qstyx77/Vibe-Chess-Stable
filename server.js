
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 }); // Changed port to 8081

const rooms = {}; // Stores room data, e.g., { roomId: { creator: ws, joiner: ws } }
const clients = new Map(); // Stores ws -> clientId mapping

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

console.log('Signaling server started on ws://localhost:8081'); // Updated log message

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(ws, clientId);
  console.log(`Client ${clientId} connected`);

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

    const currentRoomId = ws.roomId; // Get roomId from ws object if it exists

    switch (data.type) {
      case 'create-room':
        const newRoomId = `room_${generateId()}`;
        rooms[newRoomId] = { creator: ws, joiner: null, offer: null, answer: null, creatorCandidates: [], joinerCandidates: [] };
        ws.roomId = newRoomId; // Assign roomId to the WebSocket object
        ws.isCreator = true;
        console.log(`Room ${newRoomId} created by ${clientId}`);
        ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
        break;

      case 'join-room':
        const roomToJoin = rooms[data.roomId];
        if (roomToJoin && !roomToJoin.joiner) {
          roomToJoin.joiner = ws;
          ws.roomId = data.roomId; // Assign roomId to the WebSocket object
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
           // Send queued candidates from joiner to creator
          rooms[currentRoomId].joinerCandidates.forEach(candidate => {
            rooms[currentRoomId].creator.send(JSON.stringify({ type: 'candidate', payload: candidate, roomId: currentRoomId }));
          });
          rooms[currentRoomId].joinerCandidates = []; // Clear queue
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
             // Queue candidate if peer is not yet connected or description not set
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
      
      case 'error-signal': // For clients to explicitly signal errors to each other
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
        // Optionally, reset the room for the remaining peer or clean it up
        if (remainingPeer === room.creator) {
            rooms[currentRoomId].joiner = null;
            rooms[currentRoomId].answer = null;
            rooms[currentRoomId].joinerCandidates = [];
        } else { // remainingPeer is joiner, creator disconnected
            // If creator disconnects, the room might be considered defunct
             delete rooms[currentRoomId];
             console.log(`Room ${currentRoomId} closed as creator disconnected.`);
        }
      } else {
        // Both peers might have disconnected or it was a solo creator
        delete rooms[currentRoomId];
        console.log(`Room ${currentRoomId} removed as no peers remain or creator left before join.`);
      }
    }
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    const errorClientId = clients.get(ws);
    console.error(`Error from client ${errorClientId}:`, error);
    // ws.close() will be called automatically, triggering the 'close' event
  });
});

wss.on('listening', () => {
  console.log('WebSocketServer is listening on port 8081');
});

wss.on('error', (error) => {
  console.error('WebSocketServer failed to start:', error);
});
