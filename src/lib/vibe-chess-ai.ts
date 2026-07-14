
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item, AlgebraicSquare } from '@/types';
import { coordsToAlgebraic, algebraicToCoords, getCastlingRightsString, isPieceInvulnerableToAttack as isPieceInvulnerableToAttackUtil, isValidSquare as isValidSquareUtil, findKing, getEffectiveLevel, getPromotionLevel } from '@/lib/chess-utils';

export class VibeChessAI {
    maxDepth: number;
    positionCache: Map<string, { score: number; move: AIMove | null; depth: number; extraTurn?: boolean }>;
    maxCacheSize: number;
    searchStartTime: number;
    maxSearchTime: number;

    pieceValues: Record<PieceType, number[]>;
    captureLevelBonuses: Record<PieceType, number>;
    positionalBonuses: Record<string, number>;
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
            'archer': [400, 500, 600, 750, 900, 1000, 1100, 1200, 1300, 1400]
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1, 'commander': 1, 'hero': 2, 'infiltrator': 1, 'archbishop': 2, 'palace': 2, 'archer': 2
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
        
        // Iterative deepening
        for (let currentDepth = 1; currentDepth <= this.maxDepth; currentDepth++) {
            const result = this.minimax(gameState, currentDepth, -Infinity, Infinity, true, color);
            if (Date.now() - this.searchStartTime > this.maxSearchTime) break;
            bestMove = result.move; 
            bestExtraTurn = result.extraTurn || false;
            if (result.score > 900000) break; // Checkmate found
        }
        
        return { move: bestMove || (this.generateAllMoves(gameState, color)[0] || null), extraTurn: bestExtraTurn };
    }

    minimax = (gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null; extraTurn?: boolean } => {
        if (Date.now() - this.searchStartTime > this.maxSearchTime || depth <= 0) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        const moves = this.generateAllMoves(gameState, gameState.currentPlayer);
        
        // Handle Game Over states
        if (moves.length === 0) {
            const inCheck = this.isInCheck(gameState, gameState.currentPlayer);
            if (inCheck) return { score: isMaximizing ? -1000000 + depth : 1000000 - depth, move: null };
            return { score: 0, move: null }; // Stalemate
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
        let captureCount = 0;

        // --- AGGRESSIVE MEGA STRIDE COLOSSUS AI SIMULATION ---
        if (movingPiece.id.startsWith('boss-colossus')) {
            const parts = [{dr:0,dc:0,id:'tl'},{dr:0,dc:1,id:'tr'},{dr:1,dc:0,id:'bl'},{dr:1,dc:1,id:'br'}];
            let tlR=-1, tlC=-1;
            for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(next.board[r][c].piece?.id === 'boss-colossus-tl') { tlR=r; tlC=c; break; }
            
            // Clear old position
            parts.forEach(pt => { if(isValidSquareUtil(tlR+pt.dr, tlC+pt.dc)) next.board[tlR+pt.dr][tlC+pt.dc].piece = null; });
            
            // CRUSHING STRIDE: AoE Capture all Hero units in 2x2 zone
            parts.forEach(pt => { 
                const nr=tR+pt.dr, nc=tC+pt.dc; 
                if(isValidSquareUtil(nr,nc)) { 
                    if(next.board[nr][nc].piece?.color === 'white') captureCount++; 
                    next.board[nr][nc].piece = { id: `boss-colossus-${pt.id}`, type:'king', color:'black', level: movingPiece.level, hasMoved:true }; 
                } 
            });
        } else if (move.type === 'swap') {
            const p1 = { ...movingPiece, hasMoved: true };
            const p2 = targetPiece ? { ...targetPiece, hasMoved: true } : null;
            next.board[tR][tC].piece = p1;
            next.board[fR][fC].piece = p2;
        } else {
            const landedPiece = { ...movingPiece, hasMoved: true };
            if (move.type === 'enpassant') { 
                next.board[fR][tC].piece = null; 
                captureCount = 1; 
                landedPiece.type = 'infiltrator';
            } else if (targetPiece && targetPiece.color !== player) { 
                captureCount = 1; 
                landedPiece.level += (this.captureLevelBonuses[targetPiece.type] || 1); 
                if (landedPiece.type === 'queen') landedPiece.level = Math.min(7, landedPiece.level);
            }
            next.board[tR][tC].piece = landedPiece; 
            next.board[fR][fC].piece = null;
        }

        if (captureCount > 0) next.killStreaks[player] += captureCount; 
        else if (move.type !== 'swap') next.killStreaks[player] = 0;
        
        if (next.killStreaks[player] >= 6) next.extraTurn = true;
        if (!next.extraTurn) next.currentPlayer = opponent;
        
        return next;
    }

    evaluatePosition = (gs: AIGameState, aiColor: PlayerColor): number => {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gs.board[r][c].piece;
                if (!piece) continue;
                const mult = piece.color === aiColor ? 1 : -1;
                const levelIdx = Math.min(piece.level || 1, 10) - 1;
                const baseValue = (this.pieceValues[piece.type][levelIdx] || this.pieceValues[piece.type][0]);
                score += baseValue * mult;
                
                // Position bonuses
                if (piece.color === aiColor && piece.type !== 'king') {
                    if (this.centerSquares.has(`${r}${c}`)) score += 20;
                }
            }
        }

        // CRUSH VALUE: Bonus score for having more captured hero units
        const heroGraveyardCount = gs.capturedPieces?.black?.length || 0;
        score += heroGraveyardCount * 50;

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
                    if (p.id.startsWith('boss-colossus')) {
                        if (p.id === 'boss-colossus-tl') {
                            const minions = gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
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

    generatePieceMoves(gs: AIGameState, r: number, c: number, p: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const effLevel = p.level || 1; 
        
        if (p.id.startsWith('boss-colossus')) {
            // TITAN MOVEMENT: 4x4 displacement and Mega-L jumps
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
        
        switch (p.type) {
            case 'pawn':
            case 'commander':
                if (isValidSquareUtil(r+dir, c) && !gs.board[r+dir][c].piece) {
                    moves.push({from:[r,c], to:[r+dir,c], type:'move'});
                    if (!p.hasMoved && isValidSquareUtil(r+2*dir, c) && !gs.board[r+2*dir][c].piece) {
                        moves.push({from:[r,c], to:[r+2*dir,c], type:'move'});
                    }
                }
                [-1,1].forEach(dc => { 
                    if(isValidSquareUtil(r+dir, c+dc)) {
                        const target = gs.board[r+dir][c+dc].piece;
                        if (target && target.color !== p.color) moves.push({from:[r,c], to:[r+dir,c+dc], type:'capture'});
                        if (!target && gs.enPassantTargetSquare === coordsToAlgebraic(r+dir, c+dc)) moves.push({from:[r,c], to:[r+dir,c+dc], type:'enpassant'});
                    }
                });
                if (effLevel >= 2 && isValidSquareUtil(r-dir, c) && !gs.board[r-dir][c].piece) moves.push({from:[r,c], to:[r-dir,c], type:'move'});
                if (effLevel >= 3) {
                    [-1,1].forEach(dc => { if(isValidSquareUtil(r, c+dc) && !gs.board[r][c+dc].piece) moves.push({from:[r,c], to:[r,c+dc], type:'move'}); });
                }
                break;
            case 'knight': case 'hero': case 'archer':
                this.knightMoves.forEach(([dr,dc]) => { 
                    const nr=r+dr, nc=c+dc; 
                    if(isValidSquareUtil(nr,nc)) {
                        const target = gs.board[nr][nc].piece;
                        if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else if (target.color !== p.color) moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                        else if (effLevel >= 4 && (target.type === 'bishop' || target.type === 'archbishop')) moves.push({from:[r,c], to:[nr,nc], type:'swap'});
                    }
                });
                if (effLevel >= 2) {
                    [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc]) => {
                        const nr=r+dr, nc=c+dc;
                        if (isValidSquareUtil(nr,nc)) {
                            const target = gs.board[nr][nc].piece;
                            if (!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                            else if (target.color !== p.color) moves.push({from:[r,c], to:[nr,nc], type:'capture'});
                        }
                    });
                }
                break;
            case 'bishop': case 'archbishop':
                this.directions.bishop.forEach(([dr,dc]) => {
                    for(let i=1; i<8; i++) {
                        const nr=r+i*dr, nc=c+i*dc; if(!isValidSquareUtil(nr,nc)) break;
                        const target = gs.board[nr][nc].piece;
                        if(!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else { 
                            if(target.color !== p.color) moves.push({from:[r,c], to:[nr,nc], type:'capture'}); 
                            else if (effLevel >= 4 && (target.type === 'knight' || target.type === 'hero' || target.type === 'archer')) moves.push({from:[r,c], to:[nr,nc], type:'swap'});
                            if (effLevel < 2) break;
                        }
                    }
                });
                break;
            default:
                const dirs = p.type === 'rook' || p.type === 'palace' ? this.directions.rook : this.directions.queen;
                dirs.forEach(([dr,dc]) => {
                    for(let i=1; i<8; i++) {
                        const nr=r+i*dr, nc=c+i*dc; if(!isValidSquareUtil(nr,nc)) break;
                        const target = gs.board[nr][nc].piece;
                        if(!target) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else { if(target.color !== p.color) moves.push({from:[r,c], to:[nr,nc], type:'capture'}); break; }
                    }
                });
        }
        return moves;
    }

    isInCheck(gs: AIGameState, color: PlayerColor): boolean {
        if (color === 'black') {
            const parts = gs.board.flat().filter(sq => sq.piece?.id.startsWith('boss-colossus'));
            if (parts.length > 0) {
                // Dormancy check
                const otherMinions = gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
                if (otherMinions) return false;
                
                // Evaluate 2x2 hitbox for any threats
                return parts.some(pt => {
                    const coords = this.findPieceCoordsById(gs, pt.piece!.id);
                    if (coords.row === -1) return false;
                    return this.isSquareAttacked(gs, coords.row, coords.col, 'white');
                });
            }
        }
        const king = this.findKingCoords(gs, color);
        if (!king) return false;
        return this.isSquareAttacked(gs, king.row, king.col, color === 'white' ? 'black' : 'white');
    }

    findKingCoords(gs: AIGameState, color: PlayerColor) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gs.board[r][c].piece?.type === 'king' && gs.board[r][c].piece?.color === color) return { r, c, row: r, col: c };
        return null;
    }
    
    findPieceCoordsById(gs: AIGameState, id: string) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (gs.board[r][c].piece?.id === id) return { row: r, col: c };
        return { row: -1, col: -1 };
    }

    isSquareAttacked(gs: AIGameState, tr: number, tc: number, attackerColor: PlayerColor): boolean {
        if (tr === -1) return false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === attackerColor) {
                    if (p.type === 'pawn' || p.type === 'commander' || p.type === 'infiltrator') {
                        const dir = p.color === 'white' ? -1 : 1;
                        if (r + dir === tr && Math.abs(c - tc) === 1) return true;
                    } else if (p.type === 'knight' || p.type === 'hero' || p.type === 'archer') {
                        if (this.knightMoves.some(([dr,dc]) => r+dr === tr && c+dc === tc)) return true;
                    } else if (p.type === 'king') {
                        if (this.kingMoves.some(([dr,dc]) => r+dr === tr && c+dc === tc)) return true;
                    } else {
                        const dirs = p.type === 'rook' || p.type === 'palace' ? this.directions.rook : (p.type === 'bishop' || p.type === 'archbishop' ? this.directions.bishop : this.directions.queen);
                        for (const [dr, dc] of dirs) {
                            for (let i = 1; i < 8; i++) {
                                const nr = r + i * dr, nc = c + i * dc;
                                if (!isValidSquareUtil(nr, nc)) break;
                                if (nr === tr && nc === tc) return true;
                                if (gs.board[nr][nc].piece) break;
                            }
                        }
                    }
                }
            }
        }
        return false; 
    }
}
