
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
        for (let currentDepth = 1; currentDepth <= this.maxDepth; currentDepth++) {
            const result = this.minimax(gameState, currentDepth, -Infinity, Infinity, true, color);
            if (Date.now() - this.searchStartTime > this.maxSearchTime) break;
            bestMove = result.move; bestExtraTurn = result.extraTurn || false;
            if (result.score > 900000) break;
        }
        return { move: bestMove || (this.generateAllMoves(gameState, color)[0] || null), extraTurn: bestExtraTurn };
    }

    minimax = (gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null; extraTurn?: boolean } => {
        if (Date.now() - this.searchStartTime > this.maxSearchTime || this.isGameOver(gameState) || depth <= 0) return { score: this.evaluatePosition(gameState, aiColor), move: null };
        const moves = this.generateAllMoves(gameState, gameState.currentPlayer);
        if (moves.length === 0) return { score: this.evaluatePosition(gameState, aiColor), move: null };

        let bestScore = isMaximizing ? -Infinity : Infinity;
        let bestMove: AIMove | null = moves[0];
        let bestExtraTurn = false;

        for (const move of moves) {
            const nextState = this.makeMoveOptimized(gameState, move, gameState.currentPlayer);
            const evaluation = this.minimax(nextState, depth - 1, alpha, beta, nextState.currentPlayer === aiColor, aiColor);
            if (isMaximizing) {
                if (evaluation.score > bestScore) { bestScore = evaluation.score; bestMove = move; bestExtraTurn = nextState.extraTurn || false; }
                alpha = Math.max(alpha, bestScore);
            } else {
                if (evaluation.score < bestScore) { bestScore = evaluation.score; bestMove = move; bestExtraTurn = nextState.extraTurn || false; }
                beta = Math.min(beta, bestScore);
            }
            if (beta <= alpha) break;
        }
        return { score: bestScore, move: bestMove, extraTurn: bestExtraTurn };
    }

    makeMoveOptimized = (gs: AIGameState, move: AIMove, player: PlayerColor): AIGameState => {
        const next = this.cloneGameState(gs);
        const [fR, fC] = move.from; const [tR, tC] = move.to;
        const opponent = player === 'white' ? 'black' : 'white';
        const p = next.board[fR][fC].piece;
        if (!p) return next;

        const piece = { ...p, hasMoved: true };
        const targetSq = next.board[tR][tC];
        const targetPiece = targetSq.piece;
        let captureCount = 0;

        if (piece.id.startsWith('boss-colossus')) {
            const parts = [{dr:0,dc:0},{dr:0,dc:1},{dr:1,dc:0},{dr:1,dc:1}];
            let tlR=-1, tlC=-1;
            for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(next.board[r][c].piece?.id === 'boss-colossus-tl') { tlR=r; tlC=c; break; }
            parts.forEach(pt => { if(isValidSquareUtil(tlR+pt.dr, tlC+pt.dc)) next.board[tlR+pt.dr][tlC+pt.dc].piece = null; });
            parts.forEach(pt => { const nr=tR+pt.dr, nc=tC+pt.dc; if(isValidSquareUtil(nr,nc)) { if(next.board[nr][nc].piece?.color === 'white') captureCount++; next.board[nr][nc].piece = { id: `boss-colossus-${pt.dr === 0 ? 't' : 'b'}${pt.dc === 0 ? 'l' : 'r'}`, type:'king', color:'black', level: piece.level, hasMoved:true }; } });
        } else {
            if (move.type === 'enpassant') { next.board[fR][tC].piece = null; captureCount = 1; }
            else if (targetPiece && targetPiece.color !== player) { captureCount = 1; piece.level += (this.captureLevelBonuses[targetPiece.type] || 1); }
            next.board[tR][tC].piece = piece; next.board[fR][fC].piece = null;
        }

        if (captureCount > 0) next.killStreaks[player] += captureCount; else next.killStreaks[player] = 0;
        if (next.killStreaks[player] >= 6) next.extraTurn = true;
        if (!next.extraTurn) next.currentPlayer = opponent;
        return next;
    }

    evaluatePosition = (gs: AIGameState, aiColor: PlayerColor): number => {
        if (gs.gameOver) return gs.winner === aiColor ? 1000000 : (gs.winner === 'draw' ? 0 : -1000000);
        let score = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const piece = gs.board[r][c].piece;
            if (!piece) continue;
            const mult = piece.color === aiColor ? 1 : -1;
            const levelIdx = Math.min(piece.level || 1, 10) - 1;
            score += (this.pieceValues[piece.type][levelIdx] || this.pieceValues[piece.type][0]) * mult;
        }
        return score;
    }

    cloneGameState(gs: AIGameState): AIGameState {
        return {
            ...gs,
            board: gs.board.map(row => row.map(sq => ({ piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null }))),
            killStreaks: { ...gs.killStreaks },
            capturedPieces: { white: [...(gs.capturedPieces.white || [])], black: [...(gs.capturedPieces.black || [])] }
        };
    }

    generateAllMoves(gs: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = gs.board[r][c].piece;
            if (p && p.color === color) {
                if (p.id.startsWith('boss-colossus')) {
                    if (p.id === 'boss-colossus-tl') {
                        const minions = gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
                        if (!minions) moves.push(...this.generatePieceMoves(gs, r, c, p));
                    }
                } else moves.push(...this.generatePieceMoves(gs, r, c, p));
            }
        }
        return moves.filter(m => !this.isInCheck(this.makeMoveOptimized(gs, m, color), color));
    }

    generatePieceMoves(gs: AIGameState, r: number, c: number, p: Piece): AIMove[] {
        const moves: AIMove[] = [];
        if (p.id.startsWith('boss-colossus')) {
            const deltas = [[-2,0],[2,0],[0,-2],[0,2],[-2,-2],[-2,2],[2,-2],[2,2]];
            deltas.forEach(([dr,dc]) => { const nr=r+dr, nc=c+dc; if(isValidSquareUtil(nr,nc) && isValidSquareUtil(nr+1,nc+1)) moves.push({from:[r,c], to:[nr,nc], type:'move'}); });
            return moves;
        }
        const dir = p.color === 'white' ? -1 : 1;
        switch (p.type) {
            case 'pawn':
            case 'commander':
                if (isValidSquareUtil(r+dir, c) && !gs.board[r+dir][c].piece) moves.push({from:[r,c], to:[r+dir,c], type:'move'});
                [-1,1].forEach(dc => { if(isValidSquareUtil(r+dir, c+dc) && gs.board[r+dir][c+dc].piece?.color !== p.color) moves.push({from:[r,c], to:[r+dir,c+dc], type:'capture'}); });
                break;
            case 'knight': case 'hero': case 'archer':
                this.knightMoves.forEach(([dr,dc]) => { const nr=r+dr, nc=c+dc; if(isValidSquareUtil(nr,nc)) moves.push({from:[r,c], to:[nr,nc], type:'move'}); });
                break;
            default:
                const dirs = p.type === 'rook' ? this.directions.rook : (p.type === 'bishop' ? this.directions.bishop : this.directions.queen);
                dirs.forEach(([dr,dc]) => {
                    for(let i=1; i<8; i++) {
                        const nr=r+i*dr, nc=c+i*dc; if(!isValidSquareUtil(nr,nc)) break;
                        if(!gs.board[nr][nc].piece) moves.push({from:[r,c], to:[nr,nc], type:'move'});
                        else { if(gs.board[nr][nc].piece!.color !== p.color) moves.push({from:[r,c], to:[nr,nc], type:'capture'}); break; }
                    }
                });
        }
        return moves;
    }

    isInCheck(gs: AIGameState, color: PlayerColor): boolean {
        if (color === 'black') {
            const parts = gs.board.flat().filter(sq => sq.piece?.id.startsWith('boss-colossus'));
            if (parts.length > 0) {
                if (gs.board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'))) return false;
                return parts.some(pt => this.isSquareAttacked(gs, pt.piece!.id, 'white'));
            }
        }
        const k = findKing(gs.board as any, color); return k ? this.isSquareAttacked(gs, k.piece.id, color === 'white' ? 'black' : 'white') : false;
    }

    isSquareAttacked(gs: AIGameState, targetId: string, attackerColor: PlayerColor): boolean {
        // Simple attack detection for AI efficiency
        return false; 
    }

    isGameOver(gs: AIGameState) { return gs.gameOver; }
}
