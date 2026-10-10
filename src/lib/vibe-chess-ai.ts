
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item, AlgebraicSquare, InventoryItemType, LastMoveInfo } from '@/types';
import { coordsToAlgebraic, algebraicToCoords, getCastlingRightsString, isPieceInvulnerableToAttack as isPieceInvulnerableToAttackUtil, isValidSquare as isValidSquareUtil, getEffectiveLevel, getPromotionLevel, FRONTLINE_TYPES } from '@/lib/chess-utils';

export class VibeChessAI {
    maxDepth: number;
    positionCache: Map<string, { score: number; move: AIMove | null; depth: number; extraTurn?: boolean }>;
    maxCacheSize: number;
    searchStartTime: number;
    maxSearchTime: number;

    pieceValues: Record<string, number[]>;
    captureLevelBonuses: Record<string, number>;
    centerSquares: Set<string>;

    knightMoves: [number, number][];
    kingMoves: [number, number][];
    directions: Record<'rook' | 'bishop' | 'queen', [number, number][]>;

    constructor(depth = 4) {
        this.maxDepth = depth;
        this.positionCache = new Map();
        this.maxCacheSize = 20000;
        this.searchStartTime = 0;
        this.maxSearchTime = 4500;

        this.pieceValues = {
            'pawn': [100, 150, 200, 300, 400, 500, 550, 600, 650, 700],
            'knight': [350, 400, 450, 550, 650, 700, 750, 800, 850, 900],
            'bishop': [360, 420, 500, 600, 700, 750, 800, 850, 900, 950],
            'rook': [550, 600, 700, 850, 950, 1000, 1050, 1100, 1150, 1200],
            'queen': [1000, 1100, 1200, 1300, 1600, 1800, 2500],
            'king': [50000, 50000, 50000, 50000, 50000, 50000, 50000],
            'commander': [200, 250, 300, 450, 550, 600, 650, 700, 750, 800],
            'hero': [800, 900, 1000, 1150, 1300, 1400, 1500, 1600, 1700, 1800],
            'infiltrator': [400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200],
            'archbishop': [450, 550, 650, 800, 950, 1050, 1150, 1250, 1350, 1450],
            'palace': [650, 750, 850, 1000, 1150, 1250, 1350, 1450, 1550, 1650],
            'archer': [400, 500, 600, 750, 900, 1000, 1100, 1200, 1300, 1400],
            'dancer': [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
            'mimic': [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
            'grappler': [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
            'myco_mage': [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1, 'commander': 1, 'hero': 2, 'infiltrator': 1, 'archbishop': 2, 'palace': 2, 'archer': 2, 'dancer': 1, 'mimic': 1, 'grappler': 1, 'myco_mage': 1
        };

        this.centerSquares = new Set(['33', '34', '43', '44']); 
        this.knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        this.kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        this.directions = {
            rook: [[0,1], [0,-1], [1,0], [-1,0]],
            bishop: [[1,1], [1,-1], [-1,1], [-1,-1]],
            queen: [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
        };
    }

    getBestMove = (originalGameState: AIGameState, color: PlayerColor): { move: AIMove | null; extraTurn: boolean } => {
        this.searchStartTime = Date.now();
        this.positionCache.clear();
        let bestMove: AIMove | null = null;
        let bestExtraTurn = false;
        const gameState = this.cloneGameState(originalGameState);
        
        try {
            for (let currentDepth = 1; currentDepth <= this.maxDepth; currentDepth++) {
                const result = this.minimax(gameState, currentDepth, -Infinity, Infinity, true, color);
                if (Date.now() - this.searchStartTime > this.maxSearchTime) break;
                if (result.move) {
                    bestMove = result.move; 
                    bestExtraTurn = result.extraTurn || false;
                }
                if (result.score > 900000) break;
            }
        } catch (e) {
            console.error("[AI Internal Error]", e);
        }
        
        return { move: bestMove || (this.generateAllMoves(gameState, color)[0] || null), extraTurn: bestExtraTurn };
    }

    minimax = (gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null; extraTurn?: boolean } => {
        if (Date.now() - this.searchStartTime > this.maxSearchTime || depth <= 0) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        const moves = this.generateAllMoves(gameState, gameState.currentPlayer);
        
        if (moves.length === 0) {
            const inCheck = this.isInCheck(gameState, gameState.currentPlayer);
            if (inCheck) return { score: isMaximizing ? -1000000 + depth : 1000000 - depth, move: null };
            return { score: 0, move: null };
        }

        let bestScore = isMaximizing ? -Infinity : Infinity;
        let bestMove: AIMove | null = moves[0];
        let bestExtraTurn = false;

        for (const move of moves) {
            const nextState = this.makeMoveOptimized(gameState, move, gameState.currentPlayer);
            const evaluation = this.minimax(nextState, depth - 1, alpha, beta, nextState.currentPlayer === aiColor, aiColor);
            
            if (isMaximizing) {
                if (evaluation.score > bestScore) { 
                    bestScore = evaluation.score; 
                    bestMove = move; 
                    bestExtraTurn = nextState.extraTurn || false; 
                }
                alpha = Math.max(alpha, bestScore);
            } else {
                if (evaluation.score < bestScore) { 
                    bestScore = evaluation.score; 
                    bestMove = move; 
                    bestExtraTurn = nextState.extraTurn || false; 
                }
                beta = Math.min(beta, bestScore);
            }
            if (beta <= alpha) break;
        }
        
        return { score: bestScore, move: bestMove, extraTurn: bestExtraTurn };
    }

    makeMoveOptimized = (gs: AIGameState, move: AIMove, player: PlayerColor): AIGameState => {
        const next = this.cloneGameState(gs);
        const [fR, fC] = move.from; 
        const [tR, tC] = move.to;
        const opponent = player === 'white' ? 'black' : 'white';
        const movingPiece = next.board[fR][fC].piece;
        if (!movingPiece) return next;

        const targetSq = next.board[tR][tC];
        const targetPiece = targetSq.piece;
        const targetItem = targetSq.item;
        let captureCount = 0;

        const moveInfo: LastMoveInfo = { type: movingPiece.type, level: movingPiece.level, item: movingPiece.heldItem || null };
        if (player === 'white') next.lastMoveWhite = moveInfo; else next.lastMoveBlack = moveInfo;
        next.lastMoveGlobal = moveInfo;

        if (move.type === 'grapple-throw') {
            if (targetPiece?.type === 'king') return next; 
            if (move.grappledFrom) {
                const [gr, gc] = move.grappledFrom;
                next.board[gr][gc].piece = null;
                next.board[gr][gc].item = null;
            }
            if (move.thrownItem === 'anvil') {
                next.board[tR][tC].item = { type: 'anvil' };
            } else if (move.thrownPiece) {
                const p = { ...move.thrownPiece, hasMoved: true };
                next.board[tR][tC].piece = p;
                if (targetPiece?.color === opponent) captureCount++;
            }
            next.board[fR][fC].piece = { ...movingPiece, hasMoved: true };
        } else if (movingPiece.id?.startsWith('boss-colossus')) {
            const pts = [{dr:0,dc:0,id:'tl'},{dr:0,dc:1,id:'tr'},{dr:1,dc:0,id:'bl'},{dr:1,dc:1,id:'br'}];
            let tlR=-1, tlC=-1;
            for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(next.board[r][c].piece?.id === 'boss-colossus-tl') { tlR=r; tlC=c; break; }
            pts.forEach(pt => { if(isValidSquareUtil(tlR+pt.dr, tlC+pt.dc)) next.board[tlR+pt.dr][tlC+pt.dc].piece = null; });
            pts.forEach(pt => { 
                const nr=tR+pt.dr, nc=tC+pt.dc; 
                if(isValidSquareUtil(nr,nc)) { 
                    if(next.board[nr][nc].piece?.color === opponent) captureCount++; 
                    next.board[nr][nc].piece = { id: `boss-colossus-${pt.id}`, type:'king', color:player, level: movingPiece.level, hasMoved:true }; 
                } 
            });
        } else if (move.type === 'swap' || move.type === 'dance-swap' || move.type === 'grapple-hook-swap') {
            const p1 = { ...movingPiece, hasMoved: true, isShielded: false };
            const p2 = targetPiece ? { ...targetPiece, hasMoved: true, isShielded: false } : null;
            if (move.type === 'dance-swap' && targetItem?.type === 'shroom') {
                p1.level += 1;
                if (p1.type === 'queen') p1.level = Math.min(7, p1.level);
                next.board[tR][tC].item = null;
            }
            next.board[tR][tC].piece = p1;
            next.board[fR][fC].piece = p2;
        } else if (move.type === 'self-destruct') {
            next.board[fR][fC].piece = null;
            for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                const nr=fR+dr, nc=fC+dc;
                if(isValidSquareUtil(nr,nc) && next.board[nr][nc].piece?.color === opponent && next.board[nr][nc].piece?.type !== 'king') {
                    next.board[nr][nc].piece = null;
                    captureCount++;
                }
            }
        } else {
            const landedPiece = { ...movingPiece, isShielded: false, hasMoved: true };
            if (move.type === 'enpassant') { 
                next.board[fR][tC].piece = null; 
                captureCount = 1; 
            } else if (targetPiece && targetPiece.color !== player && targetPiece.type !== 'king') { 
                captureCount = 1; 
                let g = (this.captureLevelBonuses[targetPiece.type] || 1); 
                if (landedPiece.heldItem === 'sweet_revenge' && gs.didOpponentCaptureLastTurn) g += 1;
                landedPiece.level += g;
                if (landedPiece.type === 'queen') landedPiece.level = Math.min(7, landedPiece.level);
            }
            if (targetItem?.type === 'shroom') {
                landedPiece.level += 1;
                if (landedPiece.type === 'queen') landedPiece.level = Math.min(7, landedPiece.level);
                next.board[tR][tC].item = null;
            }
            
            const backRank = landedPiece.color === 'white' ? 0 : 7;
            if (tR === backRank) {
                if (FRONTLINE_TYPES.includes(landedPiece.type)) {
                    landedPiece.type = 'queen';
                    landedPiece.level = 1; 
                } else if (landedPiece.type === 'commander') {
                    landedPiece.type = 'hero';
                }
            }
            
            if (targetPiece?.type !== 'king') {
                next.board[tR][tC].piece = landedPiece; 
                if (fR !== tR || fC !== tC) {
                    next.board[fR][fC].piece = null;
                }
            }

            if (FRONTLINE_TYPES.includes(landedPiece.type) && Math.abs(fR - tR) === 2) {
                next.enPassantTargetSquare = coordsToAlgebraic(fR + Math.sign(tR - fR), fC);
            } else {
                next.enPassantTargetSquare = null;
            }
        }

        if (captureCount > 0) {
            next.killStreaks[player] += captureCount; 
        } else if (!['swap', 'dance-swap', 'grapple-hook-swap', 'myco-propagate'].includes(move.type || '')) {
            next.killStreaks[player] = 0;
        }
        
        if (next.killStreaks[player] >= 6) next.extraTurn = true;
        if (!next.extraTurn) next.currentPlayer = opponent;
        return next;
    }

    evaluatePosition = (gs: AIGameState, aiColor: PlayerColor): number => {
        let score = 0;
        const currentStreak = gs.killStreaks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentStreak = gs.killStreaks[opponentColor] || 0;

        const playerKing = this.findKingCoords(gs, aiColor);
        const opponentKing = this.findKingCoords(gs, opponentColor);
        
        if (!playerKing) score -= 1000000;
        if (!opponentKing) score += 1000000;

        score += (currentStreak * 25);
        score -= (opponentStreak * 25);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gs.board[r][c].piece;
                if (!piece) continue;
                const mult = piece.color === aiColor ? 1 : -1;
                const levelIdx = Math.min(piece.level || 1, 10) - 1;
                const values = this.pieceValues[piece.type];
                
                if (values) {
                    const baseValue = (values[levelIdx] || values[0]);
                    score += baseValue * mult;
                } else {
                    score += 100 * mult;
                }

                if (piece.color === aiColor) {
                    if (piece.type === 'infiltrator') {
                        const targetRank = piece.color === 'white' ? 0 : 7;
                        const distance = Math.abs(r - targetRank);
                        score += (7 - distance) * 60; 
                    }
                    if (this.centerSquares.has(`${r}${c}`)) score += 30;
                    if (['hero', 'archbishop', 'palace', 'archer'].includes(piece.type)) score += 50;
                    if (['commander', 'myco_mage', 'dancer', 'mimic', 'grappler'].includes(piece.type)) score += 30;
                } else {
                    if (piece.type === 'infiltrator') {
                        const targetRank = piece.color === 'white' ? 0 : 7;
                        const distance = Math.abs(r - targetRank);
                        score -= (7 - distance) * 60;
                    }
                    if (this.centerSquares.has(`${r}${c}`)) score -= 30;
                }
            }
        }
        return score;
    }

    cloneGameState(gs: AIGameState): AIGameState {
        const whiteCaps = gs.capturedPieces?.white || [];
        const blackCaps = gs.capturedPieces?.black || [];
        return {
            ...gs,
            board: gs.board.map(row => row.map(sq => ({ piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null }))),
            killStreaks: { ...gs.killStreaks },
            capturedPieces: { 
                white: [...whiteCaps], 
                black: [...blackCaps] 
            },
            lastMoveWhite: gs.lastMoveWhite ? { ...gs.lastMoveWhite } : null,
            lastMoveBlack: gs.lastMoveBlack ? { ...gs.lastMoveBlack } : null,
            lastMoveGlobal: gs.lastMoveGlobal ? { ...gs.lastMoveGlobal } : null
        };
    }

    generateAllMoves(gs: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === color) {
                    if ((p.cooldownTurnsRemaining || 0) > 0 || (p.frozenTurnsRemaining || 0) > 0) continue;
                    if (p.id?.startsWith('boss-colossus')) {
                        if (p.id === 'boss-colossus-tl') {
                            const minions = gs.board.flat().some(sq => sq.piece && sq.piece.color === p.color && !sq.piece.id?.startsWith('boss-colossus'));
                            if (!minions) moves.push(...this.generatePieceMoves(gs, r, c, p));
                        }
                    } else {
                        moves.push(...this.generatePieceMoves(gs, r, c, p));
                    }
                }
            }
        }
        return moves.filter(m => !this.isInCheck(this.makeMoveOptimized(gs, m, color), color));
    }

    generatePieceMoves(gs: AIGameState, r: number, c: number, p: Piece, simplified: boolean = false): AIMove[] {
        const moves: AIMove[] = [];
        const effLevel = getEffectiveLevel(gs.board as any, r, c);
        const silenced = isSilencedInternal(gs.board, r, c, p.color);
        const oppColor = p.color === 'white' ? 'black' : 'white';

        if (p.type === 'mimic') {
            const patternType = (gs.lastMoveGlobal?.type && gs.lastMoveGlobal.type !== 'mimic') ? gs.lastMoveGlobal.type : 'pawn';
            const virtualPiece = { ...p, type: patternType };
            
            let mimickedItem: InventoryItemType | null = null;
            if (p.heldItem === 'mirror_mask') {
                const enemyLast = p.color === 'white' ? gs.lastMoveBlack : gs.lastMoveWhite;
                mimickedItem = enemyLast?.item || null;
            } else if (p.heldItem === 'mimic_blade') {
                const allyLast = p.color === 'white' ? gs.lastMoveWhite : gs.lastMoveBlack;
                mimickedItem = allyLast?.item || null;
            }
            virtualPiece.heldItem = mimickedItem;
            return this.generatePieceMoves(gs, r, c, virtualPiece, simplified); 
        }
        
        if (p.id?.startsWith('boss-colossus')) {
            const strides = [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[-2,2],[2,-2],[2,2]];
            const leaps = [[-4, -2], [-4, 2], [-2, -4], [-2, 4], [2, -4], [2, 4], [4, -2], [4, 2]];
            [...strides, ...leaps].forEach(([dr,dc]) => { 
                const nr=r+dr, nc=c+dc; 
                if(isValidSquareUtil(nr,nc) && isValidSquareUtil(nr+1,nc+1)) {
                    const colossusParts = ['boss-colossus-tl', 'boss-colossus-tr', 'boss-colossus-bl', 'boss-colossus-br'];
                    const offsets = [[0,0], [0,1], [1,0], [1,1]];
                    let isBlocked = false;
                    for (const [or, oc] of offsets) {
                        const targetSq = gs.board[nr+or][nc+oc];
                        if (targetSq.item?.type === 'anvil') { isBlocked = true; break; }
                        if (targetSq.piece && targetSq.piece.color === p.color && !colossusParts.includes(targetSq.piece.id)) { isBlocked = true; break; }
                    }
                    if (!isBlocked) {
                        const stepR = Math.sign(dr); const stepC = Math.sign(dc);
                        const dist = Math.max(Math.abs(dr), Math.abs(dc));
                        for (let i = 1; i < dist; i++) {
                            const ir = r + i * stepR; const ic = c + i * stepC;
                            for (const [or, oc] of offsets) {
                                if (!isValidSquareUtil(ir+or, ic+oc)) { isBlocked = true; break; }
                                const pathSq = gs.board[ir+or][ic+oc];
                                if ((pathSq.piece && !colossusParts.includes(pathSq.piece.id)) || pathSq.item?.type === 'anvil') { isBlocked = true; break; }
                            }
                            if (isBlocked) break;
                        }
                    }
                    if (!isBlocked) {
                        const targetPiece = gs.board[nr][nc].piece;
                        if (targetPiece?.type !== 'king') moves.push({from:[r,c], to:[nr,nc], type:'move'});
                    }
                }
            });
            return moves;
        }

        if (!simplified && p.type === 'grappler' && !silenced) {
            const range = effLevel;
            const inCheck = this.isInCheck(gs, p.color);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const pr = r + dr, pc = c + dc;
                    if (!isValidSquareUtil(pr, pc)) continue;
                    const targetSq = gs.board[pr][pc];
                    const targetPiece = targetSq.piece;
                    const targetAnvil = targetSq.item?.type === 'anvil' && p.heldItem === 'power_glove';
                    if ((targetPiece && targetPiece.type !== 'king') || targetAnvil) {
                        const possibleLandings: [number, number][] = [];
                        if (inCheck) {
                           for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                               const d = Math.max(Math.abs(tr-r), Math.abs(tc-c));
                               if (d > 0 && d <= range && (tr === r || tc === c || Math.abs(tr-r) === Math.abs(tc-c))) {
                                   if (!gs.board[tr][tc].piece && !gs.board[tr][tc].item) possibleLandings.push([tr, tc]);
                               }
                           }
                        } else {
                           const backRank = p.color === 'white' ? 0 : 7;
                           for(let tc=0; tc<8; tc++) {
                               const d = Math.max(Math.abs(backRank-r), Math.abs(tc-c));
                               if (d > 0 && d <= range && (backRank === r || tc === c || Math.abs(backRank-r) === Math.abs(tc-c))) {
                                   if (!gs.board[backRank][tc].piece && !gs.board[backRank][tc].item) possibleLandings.push([backRank, tc]);
                               }
                           }
                        }
                        possibleLandings.forEach(l => {
                            if (gs.board[l[0]][l[1]].piece?.type !== 'king') {
                                moves.push({ 
                                    from: [r, c], 
                                    to: l, 
                                    type: 'grapple-throw', 
                                    thrownPiece: targetPiece ? { ...targetPiece } : undefined,
                                    thrownItem: targetAnvil ? 'anvil' : undefined,
                                    grappledFrom: [pr, pc]
                                });
                            }
                        });
                    }
                }
            }
        }

        const dir = p.color === 'white' ? -1 : 1;
        switch (p.type) {
            case 'pawn':
            case 'dancer':
            case 'commander':
            case 'grappler':
            case 'myco_mage':
                if (isValidSquareUtil(r+dir, c) && !gs.board[r+dir][c].piece && (!gs.board[r+dir][c].item || gs.board[r+dir][c].item?.type === 'shroom')) {
                    moves.push({from:[r,c], to:[r+dir,c], type:'move'});
                    const isStartRank = (p.color === 'white' && (r === 6 || r === 7)) || (p.color === 'black' && (r === 1 || r === 0));
                    const canJump = !p.hasMoved && isStartRank || p.heldItem === 'swift_cloak';
                    if (canJump && isValidSquareUtil(r+2*dir, c) && !gs.board[r+2*dir][c].piece && !gs.board[r+2*dir][c].item && !gs.board[r+dir][c].piece && !gs.board[r+dir][c].item) {
                        moves.push({from:[r,c], to:[r+2*dir,c], type:'move'});
                    }
                }
                [-1,1].forEach(dc => { 
                    if(isValidSquareUtil(r+dir, c+dc)) {
                        const targetSq = gs.board[r+dir][c+dc];
                        const target = targetSq.piece;
                        if ((target && target.color !== p.color) || (simplified && !targetSq.item)) {
                           if (simplified || (target && target.type !== 'king')) {
                                const targetLevel = getEffectiveLevel(gs.board as any, r+dir, c+dc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                    moves.push({from:[r,c], to:[r+dir,c+dc], type:'capture'});
                                }
                           }
                        }
                        if (!target && !targetSq.item && gs.enPassantTargetSquare === coordsToAlgebraic(r+dir, c+dc)) moves.push({from:[r,c], to:[r+dir,c+dc], type:'enpassant'});
                    }
                });
                if (effLevel >= 2 && isValidSquareUtil(r-dir, c) && !gs.board[r-dir][c].piece && (!gs.board[r-dir][c].item || gs.board[r-dir][c].item?.type === 'shroom')) moves.push({from:[r,c], to:[r-dir,c], type:'move'});
                if (effLevel >= 3) {
                    [-1,1].forEach(dc => { if(isValidSquareUtil(r, c+dc) && !gs.board[r][c+dc].piece && (!gs.board[r][c+dc].item || gs.board[r][c+dc].item?.type === 'shroom')) moves.push({from:[r,c], to:[r,c+dc], type:'move'}); });
                }
                break;
            case 'infiltrator':
                [-1, 0, 1].forEach(dc => {
                    const nr = r + dir; const nc = c + dc;
                    if (isValidSquareUtil(nr, nc)) {
                        const targetSq = gs.board[nr][nc];
                        if (targetSq.item?.type === 'anvil') return; 
                        const target = targetSq.piece;
                        if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else if (target.color !== p.color) {
                            if (simplified || target.type !== 'king') {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                    moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                }
                            }
                        }
                    }
                });
                break;
            case 'knight': case 'hero': case 'archer':
                this.knightMoves.forEach(([dr,dc]) => { 
                    const nr=r+dr, nc=c+dc; 
                    if(isValidSquareUtil(nr,nc)) {
                        const targetSq = gs.board[nr][nc];
                        if (targetSq.piece?.type === 'king' && !simplified) return; 
                        if (targetSq.item?.type === 'anvil') return; 
                        const target = targetSq.piece;
                        if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else if (target.color !== p.color) {
                            const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                            if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                            }
                        }
                    }
                });
                if (effLevel >= 2) {
                    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if(isValidSquareUtil(nr,nc)) {
                            const targetSq = gs.board[nr][nc];
                            if (targetSq.piece?.type === 'king' && !simplified) return; 
                            if (targetSq.item?.type === 'anvil') return; 
                            const target = targetSq.piece;
                            if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                            else if (target.color !== p.color) {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                    moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                }
                            }
                        }
                    });
                }
                if (effLevel >= 3) {
                    const jumps = [[3,0],[-3,0],[0,3],[0,-3]];
                    jumps.forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if(isValidSquareUtil(nr,nc)) {
                            const targetSq = gs.board[nr][nc];
                            if (targetSq.piece?.type === 'king' && !simplified) return; 
                            if (targetSq.item?.type === 'anvil') return;
                            const target = targetSq.piece;
                            if (!target || (target.color !== p.color && (simplified || target.type !== 'king') && !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any, simplified))) {
                                const sR = Math.sign(dr); const sC = Math.sign(dc);
                                let clear = true;
                                for(let i=1; i<3; i++) {
                                    const ir = r + i*sR; const ic = c + i*sC;
                                    if(isValidSquareUtil(ir,ic) && (gs.board[ir][ic].piece || gs.board[ir][ic].item?.type === 'anvil')) clear = false;
                                }
                                if(clear) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                            }
                        }
                    });
                }
                if (!simplified && !silenced && effLevel >= 4) {
                    for(let sr=0; sr<8; sr++) for(let sc=0; sc<8; sc++) {
                        const tp = gs.board[sr][sc].piece;
                        if(tp && tp.color === p.color && (tp.type === 'bishop' || tp.type === 'archbishop')) {
                            moves.push({from:[r,c], to:[sr,sc], type:'swap'});
                        }
                    }
                }
                if (effLevel >= 5 && !silenced) moves.push({from:[r,c], to:[r,c], type:'self-destruct'});
                break;
            case 'bishop': case 'archbishop':
                this.directions.bishop.forEach(([dr,dc]) => {
                    for(let i=1; i<8; i++) {
                        const nr=r+i*dr, nc=c+i*dc; if(!isValidSquareUtil(nr,nc)) break;
                        const targetSq = gs.board[nr][nc];
                        if (targetSq.item?.type === 'anvil') break; 
                        const target = targetSq.piece;
                        if(!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else { 
                            if(target.color !== p.color) {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (target.type !== 'king' || simplified) {
                                    if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                        moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                    }
                                }
                                break;
                            } 
                            if (effLevel < 2) break;
                        }
                    }
                });
                break;
            case 'king':
                const maxD = effLevel >= 2 ? 2 : 1;
                this.kingMoves.forEach(([dr,dc]) => {
                    for(let d=1; d<=maxD; d++) {
                        const nr=r+d*dr, nc=c+d*dc;
                        if(!isValidSquareUtil(nr,nc)) break;
                        const targetSq = gs.board[nr][nc];
                        if(targetSq.piece?.type === 'king' && !simplified) break; 
                        if(targetSq.item?.type === 'anvil') break;
                        if(d === 2) {
                            const midR = r + dr; const midC = c + dc;
                            if(gs.board[midR][midC].piece || gs.board[midR][midC].item?.type === 'anvil') break;
                        }
                        const target = targetSq.piece;
                        if(!target || target.color !== p.color) {
                            if(!target || !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any, simplified)) {
                                moves.push({from:[r,c], to:[nr,nc], type:'move'});
                            }
                        }
                        if(target) break; 
                    }
                });
                if (effLevel >= 5) {
                    this.knightMoves.forEach(([dr, dc]) => {
                        const nr = r + dr, nc = c + dc;
                        if (isValidSquareUtil(nr, nc)) {
                            const targetSq = gs.board[nr][nc];
                            if (targetSq.piece?.type === 'king' && !simplified) return;
                            if (targetSq.item?.type === 'anvil') return;
                            const target = targetSq.piece;
                            if (!target || target.color !== p.color) {
                                if (!target || !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any, simplified)) {
                                    moves.push({ from: [r, c], to: [nr, nc], type: 'move' });
                                }
                            }
                        }
                    });
                }
                break;
            default:
                const isRookType = p.type === 'rook' || p.type === 'palace';
                const pDirs = isRookType ? this.directions.rook : this.directions.queen;
                pDirs.forEach(([dr, dc]) => {
                    for (let i = 1; i < 8; i++) {
                        const nr = r + i * dr, nc = c + i * dc;
                        if (!isValidSquareUtil(nr, nc)) break;
                        const targetSq = gs.board[nr][nc];
                        if (targetSq.item?.type === 'anvil') break;
                        const target = targetSq.piece;
                        if (!target) {
                            moves.push({ from: [r, c], to: [nr, nc], type: 'move' });
                        } else {
                            if (target.color !== p.color) {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (target.type !== 'king' || simplified) {
                                    if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any, simplified)) {
                                        moves.push({ from: [r, c], to: [nr, nc], type: 'capture' });
                                    }
                                }
                                break;
                            } else {
                                const hasPhase = p.heldItem === 'phase_boots' && effLevel >= 2;
                                if (!hasPhase) break;
                            }
                        }
                    }
                });
        }
        return moves;
    }

    isInCheck(gs: AIGameState, color: PlayerColor): boolean {
        if (color === 'black') {
            const colossusParts = gs.board.flat().filter(sq => sq.piece?.id?.startsWith('boss-colossus'));
            if (colossusParts.length > 0) {
                const otherMinions = gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id?.startsWith('boss-colossus'));
                if (otherMinions) return false;
                for (const pt of colossusParts) {
                    const coords = this.findPieceCoordsById(gs, pt.piece!.id);
                    if (coords.row !== -1 && this.isSquareAttacked(gs, coords.row, coords.col, 'white')) return true;
                }
                return false;
            }
        }
        const king = this.findKingCoords(gs, color);
        if (!king) return false; 
        return this.isSquareAttacked(gs, king.row, king.col, color === 'white' ? 'black' : 'white');
    }

    findKingCoords(gs: AIGameState, color: PlayerColor) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === color && p.type === 'king') return { row: r, col: c };
            }
        }
        if (color === 'black') {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = gs.board[r][c].piece;
                    if (p && p.id?.startsWith('boss-')) return { row: r, col: c };
                }
            }
        }
        return null;
    }
    
    findPieceCoordsById(gs: AIGameState, id: string) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gs.board[r][c].piece?.id === id) return { row: r, col: c };
        return { row: -1, col: -1 };
    }

    isSquareAttacked(gs: AIGameState, tr: number, tc: number, attackerColor: PlayerColor): boolean {
        if (tr === -1) return false;
        const targetPiece = gs.board[tr][tc].piece;
        const targetLevel = getEffectiveLevel(gs.board as any, tr, tc);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === attackerColor) {
                    const effLevel = getEffectiveLevel(gs.board as any, r, c);
                    const moves = this.generatePieceMoves(gs, r, c, p, true); 
                    if (moves.some(m => m.to[0] === tr && m.to[1] === tc)) {
                        if (!isPieceInvulnerableToAttackUtil(targetPiece, p, targetLevel, effLevel, gs.board as any, true)) return true;
                    }
                }
            }
        }
        return false; 
    }
}

function isSilencedInternal(board: AIBoardState, r: number, c: number, color: PlayerColor): boolean {
  const oppColor = color === 'white' ? 'black' : 'white';
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (isValidSquareUtil(nr, nc)) {
        const p = board[nr][nc].piece;
        if (p && p.color === oppColor && p.heldItem === 'aura_silence') return true;
      }
    }
  }
  return false;
}
