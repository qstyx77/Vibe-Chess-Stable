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
    triggerPushBack,
    processOilSlickTimers,
    processPoisonDamage,
    FRONTLINE_TYPES
} from './lib/chess-utils';
import type { PlayerColor, Piece, AlgebraicSquare, PieceType, InventoryItemType, ChatMessage, Move } from './types';


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
    for (let i = 0; i < 4; i++) {
        const p1 = participants[i*2];
        const p2 = participants[i*2+1];
        const roomId = `arena_${Math.random().toString(36).substring(2, 9)}`;
        p1.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
        p2.ws.send(JSON.stringify({ type: 'tournament-match-ready', roomId }));
    }
    wss.clients.forEach(c => c.send(JSON.stringify({ type: 'tournament-queue-update', count: arenaQueue.length })));
};

let arenaQueue: { ws: WebSocket; userId: string }[] = [];

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
                    const board = initializeBoard(
                        data.user?.elo || 1200, 
                        1200, 
                        data.user?.unlockedPieces || [], 
                        [],
                        data.user?.equipment || {}
                    );
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
                            lastMovedPieceLevel: null,
                            lastMovedPieceHeldItem: null,
                            gameInfo: { message: " ", isCheck: false, gameOver: false },
                            shroomSpawnCounter: 0,
                            nextShroomSpawnTurn: 5,
                            players: { white: data.user, black: null },
                            didOpponentCaptureLastTurn: false
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
                        
                        // Apply gear for the joining black player
                        const blackEq = data.user?.equipment || {};
                        roomToJoin.gameState.board.forEach((row: any) => row.forEach((sq: any) => {
                            if (sq.piece && sq.piece.color === 'black' && blackEq[sq.piece.id]) {
                                sq.piece.heldItem = blackEq[sq.piece.id];
                            }
                        }));

                        ws.send(JSON.stringify({ type: 'room-joined', roomId: data.roomId, color: 'black', gameState: roomToJoin.gameState }));
                        broadcastToRoom(data.roomId, { type: 'player-joined', gameState: roomToJoin.gameState });
                    }
                    break;
                }
                case 'anvil-drop': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && !room.gameState.board[row][col].piece && !room.gameState.board[row][col].item) {
                        room.gameState.board[row][col].item = { type: 'anvil' };
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { anvilDrop: true, dropPos: data.square }
                        });
                    }
                    break;
                }
                case 'holy-shield': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        room.gameState.board[row][col].piece.isShielded = true;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { shield: true, shieldPos: data.square }
                        });
                    }
                    break;
                }
                case 'archer-snipe': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        const sniped = room.gameState.board[row][col].piece;
                        room.gameState.capturedPieces[sniped.color].push(sniped);
                        room.gameState.board[row][col].piece = null;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { snipe: true, snipePos: data.square }
                        });
                    }
                    break;
                }
                case 'pawn-sacrifice': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { row, col } = algebraicToCoords(data.payload.square);
                    if (isValidSquare(row, col) && room.gameState.board[row][col].piece) {
                        const sacrificed = room.gameState.board[row][col].piece;
                        room.gameState.capturedPieces[sacrificed.color].push(sacrificed);
                        room.gameState.board[row][col].piece = null;
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { sacrifice: true, sacPos: data.payload.square }
                        });
                    }
                    break;
                }
                case 'ks-resurrection': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const { pieceId, square } = data.payload;
                    const { row, col } = algebraicToCoords(square);
                    const playerColor = room.clients[0] === ws ? 'white' : 'black';
                    const piece = room.gameState.capturedPieces[playerColor].find((p: Piece) => p.id === pieceId);
                    if (piece && isValidSquare(row, col) && !room.gameState.board[row][col].piece) {
                        const resPiece = { 
                            ...piece, 
                            id: `res_ks_${piece.id}_${Date.now()}`,
                            level: 1, 
                            hasMoved: true, 
                            isShielded: false, 
                            isPoisoned: false, 
                            cooldownTurnsRemaining: 0, 
                            frozenTurnsRemaining: 0 
                        };
                        room.gameState.board[row][col].piece = resPiece;
                        room.gameState.capturedPieces[playerColor] = room.gameState.capturedPieces[playerColor].filter((p: Piece) => p.id !== pieceId);
                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: room.gameState,
                            events: { resurrection: true, resPos: square }
                        });
                    }
                    break;
                }
                case 'game-move': {
                    const room = ws.roomId ? rooms[ws.roomId] : null;
                    if (!room) break;
                    const movePayload = data.payload as Move;
                    const gs = room.gameState;
                    
                    const playerColor = room.clients[0] === ws ? 'white' : 'black';
                    const isRewardMove = ['dance-swap', 'dance-move', 'anvil-drop', 'holy-shield', 'archer-snipe', 'pawn-sacrifice', 'ks-resurrection', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen'].includes(movePayload.type || '');
                    
                    if (gs.currentPlayer !== playerColor && !isRewardMove) break;

                    const fromSq = algebraicToCoords(movePayload.from);
                    const movingPiece = gs.board[fromSq.row][fromSq.col].piece;
                    if (!movingPiece && !isRewardMove) break;

                    const result = applyMove(gs.board, movePayload, gs.enPassantTargetSquare, gs.capturedPieces, gs.lastMovedPieceType, gs.lastMovedPieceHeldItem, gs.lastMovedPieceLevel, gs.didOpponentCaptureLastTurn);
                    
                    gs.board = result.newBoard;
                    gs.enPassantTargetSquare = result.enPassantTargetSet;
                    
                    let resurrectionEvent = null;
                    if (result.capturedPiece) {
                        const targetPile = result.capturedPiece.color;
                        if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                        gs.capturedPieces[targetPile].push(result.capturedPiece);
                        gs.killStreaks[playerColor]++;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (result.selfDestructCaptures?.length) {
                        result.selfDestructCaptures.forEach((p: Piece) => {
                            const targetPile = p.color;
                            if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                            gs.capturedPieces[targetPile].push(p);
                        });
                        gs.killStreaks[playerColor] += result.selfDestructCaptures.length;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (result.pieceCapturedByAnvil) {
                        const targetPile = result.pieceCapturedByAnvil.color;
                        if (!Array.isArray(gs.capturedPieces[targetPile])) gs.capturedPieces[targetPile] = [];
                        gs.capturedPieces[targetPile].push(result.pieceCapturedByAnvil);
                        gs.killStreaks[playerColor]++;
                        gs.didOpponentCaptureLastTurn = true;
                    } else if (!isRewardMove) {
                        gs.killStreaks[playerColor] = 0;
                        gs.didOpponentCaptureLastTurn = false;
                    }

                    // Check for Rook/Palace Resurrection Call
                    const toCoords = algebraicToCoords(movePayload.to);
                    const landedPiece = gs.board[toCoords.row][toCoords.col].piece;
                    const wasCapture = !!(result.capturedPiece || result.pieceCapturedByAnvil || result.selfDestructCaptures?.length);
                    
                    if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && wasCapture) {
                        const resRes = processRookResurrectionCheck(
                            gs.board,
                            playerColor,
                            movePayload,
                            movePayload.to,
                            gs.lastMovedPieceLevel || 1,
                            gs.capturedPieces,
                            Date.now()
                        );
                        if (resRes.resurrectionPerformed) {
                            gs.board = resRes.boardWithResurrection;
                            gs.capturedPieces = resRes.capturedPiecesAfterResurrection;
                            resurrectionEvent = {
                                square: resRes.resurrectedSquareAlg,
                                piece: resRes.resurrectedPieceData
                            };
                        }
                    }

                    if (movingPiece) {
                        gs.lastMovedPieceType = movingPiece.type;
                        gs.lastMovedPieceLevel = movingPiece.level;
                        gs.lastMovedPieceHeldItem = movingPiece.heldItem;
                    }
                    
                    if (result.infiltrationWin) {
                        broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'infiltration' });
                        delete rooms[ws.roomId!];
                        return;
                    }

                    const actingKingSq = gs.board.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === playerColor);
                    if (gs.killStreaks[playerColor] >= 8 && actingKingSq?.piece?.heldItem === 'kings_conquest') {
                        broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'conquest' });
                        delete rooms[ws.roomId!];
                        return;
                    }

                    const oppColor = playerColor === 'white' ? 'black' : 'white';
                    if (isCheckmate(gs.board, oppColor, gs.enPassantTargetSquare, gs.lastMovedPieceType, gs.lastMovedPieceHeldItem, gs.lastMovedPieceLevel)) {
                        broadcastToRoom(ws.roomId!, { type: 'game-over', winner: playerColor, reason: 'checkmate' });
                        delete rooms[ws.roomId!];
                        return;
                    }
                    
                    const hash = boardToPositionHash(gs.board, gs.currentPlayer === 'white' ? 'black' : 'white', gs.enPassantTargetSquare);
                    const isFrontlineMove = movingPiece?.type && FRONTLINE_TYPES.includes(movingPiece.type);
                    if (result.capturedPiece || isFrontlineMove) {
                        room.positionHistory = [hash];
                    } else {
                        room.positionHistory.push(hash);
                    }

                    const repeats = room.positionHistory.filter(h => h === hash).length;
                    if (repeats >= 3) {
                        broadcastToRoom(ws.roomId!, { type: 'game-over', winner: 'draw', reason: 'repetition' });
                        delete rooms[ws.roomId!];
                    } else {
                        if (!result.extraTurn && !isRewardMove) {
                            gs.currentPlayer = gs.currentPlayer === 'white' ? 'black' : 'white';
                        }
                        
                        // Consolidate rich move data for client animations
                        const events = {
                            captured: wasCapture,
                            capturedType: (result.capturedPiece || result.pieceCapturedByAnvil)?.type,
                            selfDestructs: result.selfDestructCaptures?.length || 0,
                            shroom: result.shroomConsumed,
                            hero: result.promotedToHero,
                            rally: !!result.rallyCryTriggered,
                            rallyPos: result.rallyCryTriggered?.square,
                            conversions: result.conversionEvents?.map(e => e.at) || [],
                            reflection: result.reflectionOccurred,
                            ralliedSquares: result.ralliedSquares || [],
                            extraTurn: result.extraTurn,
                            resurrection: !!resurrectionEvent,
                            resPos: resurrectionEvent?.square
                        };

                        broadcastToRoom(ws.roomId!, { 
                            type: 'game-move', 
                            gameState: gs, 
                            move: movePayload,
                            events
                        });
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
