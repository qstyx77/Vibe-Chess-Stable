
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item, AlgebraicSquare, InventoryItemType } from '@/types';
import { coordsToAlgebraic, algebraicToCoords, getCastlingRightsString, isPieceInvulnerableToAttack as isPieceInvulnerableToAttackUtil, isValidSquare as isValidSquareUtil, findKing, getEffectiveLevel, getPromotionLevel, FRONTLINE_TYPES } from '@/lib/chess-utils';

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

        const targetPiece = next.board[tR][tC].piece;
        let captureCount = 0;

        next.lastMovedPieceType = movingPiece.type;

        if (movingPiece.id.startsWith('boss-colossus')) {
            const parts = [{dr:0,dc:0,id:'tl'},{dr:0,dc:1,id:'tr'},{dr:1,dc:0,id:'bl'},{dr:1,dc:1,id:'br'}];
            let tlR=-1, tlC=-1;
            for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(next.board[r][c].piece?.id === 'boss-colossus-tl') { tlR=r; tlC=c; break; }
            
            parts.forEach(pt => { if(isValidSquareUtil(tlR+pt.dr, tlC+pt.dc)) next.board[tlR+pt.dr][tlC+pt.dc].piece = null; });
            
            parts.forEach(pt => { 
                const nr=tR+pt.dr, nc=tC+pt.dc; 
                if(isValidSquareUtil(nr,nc)) { 
                    if(next.board[nr][nc].piece?.color === opponent) captureCount++; 
                    next.board[nr][nc].piece = { id: `boss-colossus-${pt.id}`, type:'king', color:player, level: movingPiece.level, hasMoved:true }; 
                } 
            });
        } else if (move.type === 'swap' || move.type === 'dance-swap' || move.type === 'grapple-hook-swap') {
            const p1 = { ...movingPiece, hasMoved: true, isShielded: false };
            const p2 = targetPiece ? { ...targetPiece, hasMoved: true, isShielded: false } : null;
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
            const landedPiece = { ...movingPiece, hasMoved: true, isShielded: false };
            if (move.type === 'enpassant') { 
                next.board[fR][tC].piece = null; 
                captureCount = 1; 
            } else if (targetPiece && targetPiece.color !== player && targetPiece.type !== 'king') { 
                captureCount = 1; 
                let gain = (this.captureLevelBonuses[targetPiece.type] || 1); 
                if (landedPiece.heldItem === 'sweet_revenge' && gs.didOpponentCaptureLastTurn) gain += 1;
                landedPiece.level += gain;
                if (landedPiece.type === 'queen') landedPiece.level = Math.min(7, landedPiece.level);
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

            next.board[tR][tC].piece = landedPiece; 
            if (fR !== tR || fC !== tC) {
                next.board[fR][fC].piece = null;
            }
        }

        if (captureCount > 0) {
            next.killStreaks[player] += captureCount; 
        }
        else if (!['swap', 'dance-swap', 'grapple-hook-swap', 'myco-propagate'].includes(move.type || '')) next.killStreaks[player] = 0;
        
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
        
        if (!playerKing) return -1000000;
        if (!opponentKing) return 1000000;

        // Rewards logic incentive
        score += (currentStreak * 15);
        score -= (opponentStreak * 15);

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
                
                if (piece.type === 'infiltrator') {
                    const targetRank = piece.color === 'white' ? 0 : 7;
                    const distance = Math.abs(r - targetRank);
                    score += (7 - distance) * 50 * mult;
                }

                if (piece.color === aiColor && piece.type !== 'king') {
                    if (this.centerSquares.has(`${r}${c}`)) score += 20;
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
            }
        };
    }

    generateAllMoves(gs: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === color) {
                    if ((p.cooldownTurnsRemaining || 0) > 0 || (p.frozenTurnsRemaining || 0) > 0) continue;

                    if (p.id.startsWith('boss-colossus')) {
                        if (p.id === 'boss-colossus-tl') {
                            const minions = gs.board.flat().some(sq => sq.piece && sq.piece.color === p.color && !sq.piece.id.startsWith('boss-colossus'));
                            if (!minions) moves.push(...this.generatePieceMoves(gs, r, c, p));
                        }
                    } else {
                        moves.push(...this.generatePieceMoves(gs, r, c, p));
                    }
                }
            }
        }
        return moves.filter(m => !this.isInCheck(this.makeMoveOptimized(gs, m, color), color, true));
    }

    generatePieceMoves(gs: AIGameState, r: number, c: number, p: Piece, simplified: boolean = false): AIMove[] {
        const moves: AIMove[] = [];
        const effLevel = getEffectiveLevel(gs.board as any, r, c);
        const silenced = isSilencedInternal(gs.board, r, c, p.color);

        if (p.type === 'mimic') {
            const patternType = (gs.lastMovedPieceType && gs.lastMovedPieceType !== 'mimic') ? gs.lastMovedPieceType : 'pawn';
            const virtualPiece = { ...p, type: patternType };
            return this.generatePieceMoves(gs, r, c, virtualPiece, true);
        }
        
        if (p.id.startsWith('boss-colossus')) {
            const strides = [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[-2,2],[2,-2],[2,2]];
            const leaps = [[-4, -2], [-4, 2], [-2, -4], [-2, 4], [2, -4], [2, 4], [4, -2], [4, 2]];
            
            [...strides, ...leaps].forEach(([dr,dc]) => { 
                const nr=r+dr, nc=c+dc; 
                if(isValidSquareUtil(nr,nc) && isValidSquareUtil(nr+1,nc+1)) {
                    moves.push({from:[r,c], to:[nr,nc], type:'move'}); 
                }
            });
            return moves;
        }

        const dir = p.color === 'white' ? -1 : 1;
        const hasMagicScroll = p.heldItem && ['wind_scroll', 'life_leach', 'summon_anvil', 'shield_scroll', 'rally_scroll', 'antidote', 'detonation_scroll', 'swap_scroll', 'ice_scroll', 'resurrection_scroll', 'faith_scroll', 'kings_decree', 'ice_blast', 'soul_harvest', 'earthquake_scroll', 'demonic_possession', 'heavy_rain'].includes(p.heldItem);
        const hasSelfAbility = ((p.type === 'knight' || p.type === 'hero' || p.type === 'archer') && effLevel >= 5);
        if (!silenced && (hasMagicScroll || hasSelfAbility || p.type === 'myco_mage')) {
            moves.push({ from: [r, c], to: [r, c], type: 'move' });
        }

        switch (p.type) {
            case 'pawn':
            case 'dancer':
            case 'commander':
            case 'grappler':
            case 'myco_mage':
                if (isValidSquareUtil(r+dir, c) && !gs.board[r+dir][c].piece && (!gs.board[r+dir][c].item || gs.board[r+dir][c].item?.type === 'shroom')) {
                    moves.push({from:[r,c], to:[r+dir,c], type:'move'});
                    const isStartRank = (p.color === 'white' && (r === 6 || r === 7)) || (p.color === 'black' && (r === 0 || r === 1));
                    const canJump = !p.hasMoved && isStartRank || p.heldItem === 'swift_cloak';
                    if (canJump && isValidSquareUtil(r+2*dir, c) && !gs.board[r+2*dir][c].piece && !gs.board[r+2*dir][c].item && !gs.board[r+dir][c].piece && !gs.board[r+dir][c].item) {
                        moves.push({from:[r,c], to:[r+2*dir,c], type:'move'});
                    }
                }
                [-1,1].forEach(dc => { 
                    if(isValidSquareUtil(r+dir, c+dc)) {
                        const targetSq = gs.board[r+dir][c+dc];
                        const target = targetSq.piece;
                        if (target && target.color !== p.color) {
                            if (target.type !== 'king' || simplified || p.id.startsWith('boss-colossus')) {
                                const targetLevel = getEffectiveLevel(gs.board as any, r+dir, c+dc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
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
                            if (target.type !== 'king' || simplified) {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
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
                        if (targetSq.item?.type === 'anvil') return; 
                        const target = targetSq.piece;
                        if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else if (target.color !== p.color) {
                            if (target.type !== 'king' || simplified) {
                                const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
                                    moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                }
                            }
                        }
                        else if (effLevel >= 4 && target.color === p.color && (target.type === 'bishop' || target.type === 'archbishop')) moves.push({from:[r,c], to:[nr,nc], type:'swap'});
                    }
                });
                if (effLevel >= 2) {
                    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if (isValidSquareUtil(nr,nc)) {
                            const targetSq = gs.board[nr][nc];
                            if (targetSq.item?.type === 'anvil') return; 
                            const target = targetSq.piece;
                            if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                            else if (target.color !== p.color) {
                                if (target.type !== 'king' || simplified) {
                                    const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                    if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
                                        moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                    }
                                }
                            }
                        }
                    });
                }
                if (effLevel >= 3) {
                    const jumps = [[3,0],[-3,0],[0,3],[0,-3]];
                    jumps.forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if (isValidSquareUtil(nr,nc)) {
                            const targetSq = gs.board[nr][nc];
                            if (targetSq.item?.type === 'anvil') return;
                            const target = targetSq.piece;
                            if (!target || (target.color !== p.color && !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any))) {
                                const sR = Math.sign(dr); const sC = Math.sign(dc);
                                let clear = true;
                                for(let i=1; i<3; i++) {
                                    const ir = r + i*sR; const ic = c + i*sC;
                                    if(gs.board[ir][ic].piece || gs.board[ir][ic].item?.type === 'anvil') clear = false;
                                }
                                if(clear) {
                                    if (!target || target.type !== 'king' || simplified) {
                                        moves.push({from:[r,c], to:[nr,nc], type:'move'});
                                    }
                                }
                            }
                        }
                    });
                }
                if (effLevel >= 5) moves.push({from:[r,c], to:[r,c], type:'self-destruct'});
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
                                if (target.type !== 'king' || simplified) {
                                    const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                    if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
                                        moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                                    }
                                }
                                break;
                            } 
                            else if (effLevel >= 4 && target.color === p.color && (target.type === 'knight' || target.type === 'hero' || target.type === 'archer')) moves.push({from:[r,c], to:[nr,nc], type:'swap'});
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
                        if(targetSq.item?.type === 'anvil') break;
                        if(d === 2) {
                            const midR = r + dr; const midC = c + dc;
                            if(gs.board[midR][midC].piece || gs.board[midR][midC].item?.type === 'anvil') break;
                        }
                        const target = targetSq.piece;
                        if(!target || target.color !== p.color) {
                            if(!target || !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any)) {
                                if (!target || target.type !== 'king' || simplified) {
                                    moves.push({from:[r,c], to:[nr,nc], type:'move'});
                                }
                            }
                        }
                        if(target) break;
                    }
                });
                if(effLevel >= 5) {
                    this.knightMoves.forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if(isValidSquareUtil(nr,nc) && gs.board[nr][nc].item?.type !== 'anvil') {
                            const target = gs.board[nr][nc].piece;
                            if(!target || (target.color !== p.color && !isPieceInvulnerableToAttackUtil(target, p, getEffectiveLevel(gs.board as any, nr, nc), effLevel, gs.board as any))) {
                                if (!target || target.type !== 'king' || simplified) {
                                    moves.push({from:[r,c], to:[nr,nc], type:'move'});
                                }
                            }
                        }
                    });
                }
                if (!simplified && !p.hasMoved && !this.isInCheck(gs, p.color, true)) {
                    const kingRow = p.color === 'white' ? 7 : 0;
                    if (r === kingRow && c === 4) {
                        const rkSq = gs.board[kingRow][7];
                        if (rkSq.piece && (rkSq.piece.type === 'rook' || rkSq.piece.type === 'palace') && !rkSq.piece.hasMoved) {
                            if (!gs.board[kingRow][5].piece && !gs.board[kingRow][6].piece && !gs.board[kingRow][5].item && !gs.board[kingRow][6].item) {
                                moves.push({ from: [r, c], to: [kingRow, 6], type: 'castle' });
                            }
                        }
                        const rqSq = gs.board[kingRow][0];
                        if (rqSq.piece && (rqSq.piece.type === 'rook' || rqSq.piece.type === 'palace') && !rqSq.piece.hasMoved) {
                            if (!gs.board[kingRow][1].piece && !gs.board[kingRow][2].piece && !gs.board[kingRow][3].piece && !gs.board[kingRow][1].item && !gs.board[kingRow][2].item && !gs.board[kingRow][3].item) {
                                moves.push({ from: [r, c], to: [kingRow, 2], type: 'castle' });
                            }
                        }
                    }
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
                                if (target.type !== 'king' || simplified || p.id.startsWith('boss-colossus')) {
                                    const targetLevel = getEffectiveLevel(gs.board as any, nr, nc);
                                    if (!isPieceInvulnerableToAttackUtil(target, p, targetLevel, effLevel, gs.board as any)) {
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

        if (p.heldItem === 'cardinal_greaves' && p.heldItem !== 'tortoise_hammer') {
            if (isValidSquareUtil(r+dir, c) && !gs.board[r+dir][c].piece) moves.push({from:[r,c], to:[r+dir,c], type:'move'});
        }
        if (p.heldItem === 'drift_boots' && p.heldItem !== 'tortoise_hammer') {
            [-1,1].forEach(dc => { if(isValidSquareUtil(r+dir, c+dc) && !gs.board[r+dir][c+dc].piece) moves.push({from:[r,c], to:[r+dir, c+dc], type:'move'}); });
        }

        return moves;
    }

    isInCheck(gs: AIGameState, color: PlayerColor, simplified: boolean = false): boolean {
        if (color === 'black') {
            const parts = gs.board.flat().filter(sq => sq.piece?.id.startsWith('boss-colossus'));
            if (parts.length > 0) {
                const otherMinions = gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
                if (otherMinions) return false;
                for (const pt of parts) {
                    const coords = this.findPieceCoordsById(gs, pt.piece!.id);
                    if (coords.row !== -1 && this.isSquareAttacked(gs, coords.row, coords.col, 'white', simplified)) return true;
                }
                return false;
            }
        }
        const king = this.findKingCoords(gs, color);
        if (!king) return false;
        return this.isSquareAttacked(gs, king.row, king.col, color === 'white' ? 'black' : 'white', simplified);
    }

    findKingCoords(gs: AIGameState, color: PlayerColor) {
        if (color === 'black') {
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
                if (gs.board[r][c].piece?.id === 'boss-colossus-tl') return { row: r, col: c };
        }
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) 
            if (gs.board[r][c].piece?.type === 'king' && gs.board[r][c].piece?.color === color) return { row: r, col: c };
        return null;
    }
    
    findPieceCoordsById(gs: AIGameState, id: string) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gs.board[r][c].piece?.id === id) return { row: r, col: c };
        return { row: -1, col: -1 };
    }

    isSquareAttacked(gs: AIGameState, tr: number, tc: number, attackerColor: PlayerColor, simplified: boolean = false): boolean {
        if (tr === -1) return false;
        const pieceOnTarget = gs.board[tr][tc].piece;
        const targetLevel = getEffectiveLevel(gs.board as any, tr, tc);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === attackerColor) {
                    const effLevel = getEffectiveLevel(gs.board as any, r, c);
                    if (p.heldItem === 'knights_boots') {
                        for (const [dr, dc] of this.knightMoves) {
                            if (r + dr === tr && c + dc === tc) {
                                if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                            }
                        }
                        continue;
                    }

                    if (p.type === 'pawn' || p.type === 'commander' || p.type === 'infiltrator' || p.type === 'grappler' || p.type === 'dancer' || p.type === 'myco_mage') {
                        const direction = p.color === 'white' ? -1 : 1;
                        if (r + direction === tr && Math.abs(c - tc) === 1) {
                            if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                        }
                        if (p.type === 'infiltrator' && r + direction === tr && c === tc) {
                            if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                        }
                        if (p.heldItem === 'drift_boots') {
                            if (r + direction === tr && Math.abs(c - tc) === 1) if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                        }
                    } else if (p.type === 'mimic') {
                        const patternType = (gs.lastMovedPieceType && gs.lastMovedPieceType !== 'mimic') ? gs.lastMovedPieceType : 'pawn';
                        const moves = this.generatePieceMoves(gs, r, c, { ...p, type: patternType }, true);
                        if (moves.some(m => m.to[0] === tr && m.to[1] === tc)) return true;
                    } else if (p.type === 'knight' || p.type === 'hero' || p.type === 'archer') {
                        for (const [dr, dc] of this.knightMoves) {
                            if (r + dr === tr && c + dc === tc) {
                                if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                            }
                        }
                        if (effLevel >= 2) {
                            for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                                if (r + dr === tr && c + dc === tc) {
                                    if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                                }
                            }
                        }
                        if (effLevel >= 3) {
                            for (const [dr, dc] of [[3,0],[-3,0],[0,3],[0,-3]]) {
                                if (r + dr === tr && c + dc === tc) {
                                    const sR = Math.sign(tr - r); const sC = Math.sign(tc - c);
                                    let clear = true;
                                    if (Math.abs(tr - r) === 3) for (let i = 1; i < 3; i++) if (gs.board[r + i * sR][c].piece || gs.board[r + i * sR][c].item?.type === 'anvil') clear = false;
                                    if (Math.abs(tc - c) === 3) for (let i = 1; i < 3; i++) if (gs.board[r][c + i * sC].piece || gs.board[r][c + i * sC].item?.type === 'anvil') clear = false;
                                    if (clear && !isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                                }
                            }
                        }
                    } else if (p.type === 'king') {
                        const maxDistance = effLevel >= 2 ? 2 : 1;
                        const dr = tr - r; const dc = tc - c;
                        if (Math.abs(dr) <= maxDistance && Math.abs(dc) <= maxDistance && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                            let clear = true;
                            if (Math.abs(dr) === 2 || Math.abs(dc) === 2) {
                                const midR = r + Math.sign(dr); const midC = c + Math.sign(dc);
                                if (gs.board[midR][midC].piece || gs.board[midR][midC].item?.type === 'anvil') clear = false;
                            }
                            if (clear && !isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                        }
                        if (effLevel >= 5) {
                            for (const [dr, dc] of this.knightMoves) {
                                if (r + dr === tr && c + dc === tc) {
                                    if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                                }
                            }
                        }
                    } else {
                        const isBishopType = p.type === 'bishop' || p.type === 'archbishop';
                        const dirs = p.type === 'rook' || p.type === 'palace' ? this.directions.rook : (isBishopType ? this.directions.bishop : this.directions.queen);
                        for (const [dr, dc] of dirs) {
                            for (let i = 1; i < 8; i++) {
                                const nr = r + i * dr, nc = c + i * dc;
                                if (!isValidSquareUtil(nr, nc)) break;
                                if (nr === tr && nc === tc) {
                                    if (!isPieceInvulnerableToAttackUtil(pieceOnTarget, p, targetLevel, effLevel, gs.board as any)) return true;
                                    break;
                                }
                                const midSq = gs.board[nr][nc];
                                if (midSq.piece || midSq.item?.type === 'anvil') {
                                    if (isBishopType) {
                                        if (effLevel < 2 || midSq.piece?.color !== p.color) break;
                                    } else {
                                        const hasPhase = p.heldItem === 'phase_boots' && effLevel >= 2;
                                        if (!hasPhase || midSq.piece?.color !== p.color) break;
                                    }
                                }
                            }
                        }
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
