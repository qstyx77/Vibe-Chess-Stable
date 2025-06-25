
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling Server is running');
});

const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', ws => {
    console.log('Client connected.');
    
    let myRoomId = null;

    ws.on('message', message => {
        const msgStr = message.toString();
        let data;
        try {
            data = JSON.parse(msgStr);
        } catch (e) {
            console.error('Failed to parse message:', msgStr, e);
            return;
        }

        const { type, roomId: msgRoomId } = data;

        if (type === 'create-room') {
            const newRoomId = Math.random().toString(36).substring(2, 9);
            myRoomId = newRoomId; // Set for this connection
            rooms[newRoomId] = [ws];
            ws.send(JSON.stringify({ type: 'room-created', roomId: newRoomId }));
            console.log(`Room created: ${newRoomId}`);
            return;
        }

        if (type === 'join-room') {
            if (rooms[msgRoomId] && rooms[msgRoomId].length === 1) {
                myRoomId = msgRoomId; // Set for this connection
                rooms[myRoomId].push(ws);
                
                const creator = rooms[myRoomId][0];
                creator.send(JSON.stringify({ type: 'peer-joined', roomId: myRoomId }));
                ws.send(JSON.stringify({ type: 'room-joined', roomId: myRoomId }));
                console.log(`Client joined room ${myRoomId}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Room not found or is full.' }));
            }
            return;
        }

        // For all other messages, use myRoomId from the closure.
        if (myRoomId && rooms[myRoomId]) {
            const otherPeer = rooms[myRoomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                console.log(`Relaying '${type}' to peer in room ${myRoomId}`);
                otherPeer.send(msgStr);
            } else {
                 console.warn(`Could not relay '${type}' to peer in room ${myRoomId}, peer state is ${otherPeer?.readyState}`);
            }
        } else {
            console.error(`Could not find room for client sending message type '${type}'. myRoomId is ${myRoomId}.`);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        if (myRoomId && rooms[myRoomId]) {
            const otherPeer = rooms[myRoomId].find(peer => peer !== ws);
            if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
                otherPeer.send(JSON.stringify({ type: 'peer-disconnected' }));
            }
            delete rooms[myRoomId];
            console.log(`Room ${myRoomId} cleaned up.`);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});


const PORT = 8082;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================`);
    console.log(`  SIGNALING SERVER IS UP AND LISTENING ON PORT ${PORT}`);
    console.log(`================================================`);
});
