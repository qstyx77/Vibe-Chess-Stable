
import WebSocket from 'ws';
import http from 'http';
import { URL } from 'url';

import { 
    initializeBoard, 
    applyMove, 
    isKingInCheck, 
    isCheckmate, 
    isStalemate, 
    spawnShroom, 
    processRookResurrectionCheck,
    algebraicToCoords,
    coordsToAlgebraic,
    isQueenSacrificeRequired,
    getPossibleMoves,
    isValidSquare,
    getPromotionLevel,
    VAL_MAP,
    boardToPositionHash,
    getCastlingRightsString,
    getEffectiveLevel,
    syncSoulLink,
    isItemValidForPiece,
    triggerPushBack
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType, InventoryItemType, ChatMessage } from './types';


const server = http.createServer((req, res) => {
    const urlString = req.url || '';
    const url = new URL(urlString, `http://${req.headers.host}`);

    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }
    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

const rooms: Record<string, { clients: (WebSocket & { userId?: string, roomId?: string, username?: string })[]; gameState: any; isRanked: boolean; turnTimer?: NodeJS.Timeout; positionHistory: string[]; }> = {};
const userConnections: Record<string, (WebSocket & { userId?: string, roomId?: string, username?: string })> = {};
let globalServerUniqueIdCounter = 10000;

const rankedQueue: { ws: WebSocket & { userId?: string, roomId?: string }; userId: string; elo: number; username: string; wins: number; losses: number; equipment?: Record<string, string>; unlockedPieces?: string[]; timestamp: number }[] = [];
let arenaQueue: { ws: WebSocket; userId: string }[] = [];

const broadcastToRoom = (roomId: string, message: any) => {
    const room = rooms[roomId];
    if (room && room.clients) {
        const payload = JSON.stringify(message);
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
};

const broadcastPresence = () => {
    const presenceData = Object.values(userConnections).map(conn => ({
        userId: conn.userId,
        username: conn.username
    }));
    const msg = JSON.stringify({ type: 'presence-update', users: presenceData });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
};

const startArena = () => {
    if (arenaQueue.length < 8) return;
    const participants = arenaQueue.splice(0, 8);
    // In a real implementation, we would generate a 3-round bracket here.
    // For MVP, we pair them off into 4 private rooms for Round 1.
    for (let i = 0; i < 4; i++) {
        const p1 = participants[i*2];
        const p2 = participants[i*2+1];
        const roomId = `arena_${Math.random().toString(36).substring(2, 9)}`;
        p1.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
        p2.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
    }
    wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
};

wss.on('connection', (ws: WebSocket & { roomId?: string, userId?: string, username?: string }) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'identify':
                    ws.userId = data.userId;
                    ws.username = data.username;
                    userConnections[data.userId] = ws;
                    broadcastPresence();
                    ws.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length }));
                    break;
                case 'join-tournament-queue':
                    if (!arenaQueue.find(p => p.userId === data.userId)) {
                        arenaQueue.push({ ws, userId: data.userId });
                        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
                        if (arenaQueue.length >= 8) startArena();
                    }
                    break;
                case 'market-listing-broadcast':
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'chat-message',
                                message: {
                                    id: `market_${Date.now()}`,
                                    sender: 'SYSTEM',
                                    text: `[MARKET]: ${ws.username} listed 1x ${data.item} for ${data.price}g!`,
                                    timestamp: Date.now(),
                                    category: 'market'
                                }
                            }));
                        }
                    });
                    break;
                case 'chat-message':
                    const msg: ChatMessage = {
                        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        sender: data.sender,
                        senderId: data.senderId,
                        text: data.text,
                        timestamp: Date.now(),
                        color: data.color,
                        category: data.category
                    };
                    if (data.category === 'battle' && ws.roomId) broadcastToRoom(ws.roomId, { type: 'chat-message', message: msg });
                    else {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'chat-message', message: msg }));
                        });
                    }
                    break;
                case 'create-room': {
                    const roomId = Math.random().toString(36).substring(2, 9);
                    ws.roomId = roomId;
                    ws.userId = data.user?.userId;
                    ws.username = data.user?.username;
                    const board = initializeBoard(data.user?.elo || 1200, 1200, data.user?.unlockedPieces || []);
                    rooms[roomId] = {
                        clients: [ws],
                        isRanked: false,
                        positionHistory: [],
                        gameState: {
                            board,
                            currentPlayer: 'white',
                            capturedPieces: { white: [], black: [] },
                            killStreaks: { white: 0, black: 0 },
                            enPassantTargetSquare: null,
                            gameMoveCounter: 0,
                            lastMoveFrom: null,
                            lastMoveTo: null,
                            lastMovedPieceType: null,
                            gameInfo: { message: " ", isCheck: false, gameOver: false },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: 5,
                            players: { white: data.user, black: null }
                        }
                    };
                    ws.send(JSON.stringify({ type: 'room-created', roomId, color: 'white', gameState: rooms[roomId].gameState }));
                    break;
                }
                case 'join-room': {
                    const roomToJoin = rooms[data.roomId];
                    if (roomToJoin && roomToJoin.clients.length < 2) {
                        ws.roomId = data.roomId;
                        ws.userId = data.user?.userId;
                        ws.username = data.user?.username;
                        roomToJoin.clients.push(ws);
                        roomToJoin.gameState.players.black = data.user;
                        ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId, color: 'black', gameState: roomToJoin.gameState }));
                        broadcastToRoom(data.roomId, { type: 'player-joined', gameState: roomToJoin.gameState });
                    }
                    break;
                }
            }
        } catch (err) { console.error('[Server] Msg Error:', err); }
    });
    ws.on('close', () => {
        if (ws.userId) delete userConnections[ws.userId];
        arenaQueue = arenaQueue.filter(p => p.ws !== ws);
        wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
    });
});

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => { console.log(`Server listening on port ${PORT}`); });
