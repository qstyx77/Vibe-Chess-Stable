
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item, AlgebraicSquare } from '@/types';
import { coordsToAlgebraic, algebraicToCoords, getCastlingRightsString, isPieceInvulnerableToAttack as isPieceInvulnerableToAttackUtil, isValidSquare as isValidSquareUtil, findKing } from '@/lib/chess-utils';

const AI_DEBUG_ENABLED = false;

const aiLog = (message: string, ...args: any[]) => {
    if (AI_DEBUG_ENABLED) {
        console.log(`%c[AI_DEBUG] ${message}`, 'color: orange;', ...args);
    }
};

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
    nearCenterSquares: Set<string>;

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

        this.positionalBonuses = {
            center: 20,
            nearCenter: 10,
            development: 30,
            kingSafety: 40,
            pawnStructure: 15,
            anvilPenalty: -30,
            infiltratorAggression: 80,
            shroomWeight: 120,
        };

        this.knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        this.kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        this.directions = {
            rook: [[0,1], [0,-1], [1,0], [-1,0]],
            bishop: [[1,1], [1,-1], [-1,1], [-1,-1]],
            queen: [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
        };

        this.centerSquares = new Set(['33', '34', '43', '44']); 
        this.nearCenterSquares = new Set(['22', '23', '24', '25', '32', '35', '42', '45', '52', '53', '54', '55']);
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

                bestMove = result.move;
                bestExtraTurn = result.extraTurn || false;
                
                if (result.score > 900000) break;
            }

            if (!bestMove) {
                const moves = this.generateAllMoves(gameState, color);
                if (moves.length > 0) bestMove = moves[0];
            }

            return { move: bestMove, extraTurn: bestExtraTurn };
        } catch (error) {
            console.error("[AI_ERROR] Critical failure in getBestMove:", error);
            const fallbackMoves = this.generateAllMoves(gameState, color);
            return { move: fallbackMoves.length > 0 ? fallbackMoves[0] : null, extraTurn: false };
        }
    }

    minimax = (gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null; extraTurn?: boolean } => {
        if (Date.now() - this.searchStartTime > this.maxSearchTime) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        if (this.isGameOver(gameState)) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        if (depth <= 0) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        const positionKey = this.getPositionKey(gameState, isMaximizing);
        const cached = this.positionCache.get(positionKey);
        if (cached && cached.depth >= depth) return cached;

        const currentPlayer = gameState.currentPlayer;
        const moves = this.generateAllMoves(gameState, currentPlayer);

        if (moves.length === 0) {
            return { score: this.evaluatePosition(gameState, aiColor), move: null };
        }

        moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayer) - this.quickEvaluateMove(gameState, a, currentPlayer));

        let bestScore = isMaximizing ? -Infinity : Infinity;
        let bestMove: AIMove | null = moves[0];
        let bestExtraTurn = false;

        for (const move of moves) {
            const nextState = this.makeMoveOptimized(gameState, move, currentPlayer);
            const nextIsMaximizing = nextState.currentPlayer === aiColor;
            
            const evaluation = this.minimax(nextState, depth - 1, alpha, beta, nextIsMaximizing, aiColor);

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

        const result = { score: bestScore, move: bestMove, depth, extraTurn: bestExtraTurn };
        if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
        return result;
    }

    makeMoveOptimized = (originalGameState: AIGameState, move: AIMove, currentPlayer: PlayerColor): AIGameState => {
        const nextState = this.cloneGameState(originalGameState);
        const [fR, fC] = move.from;
        const [tR, tC] = move.to;
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';

        const movingSquare = nextState.board[fR][fC];
        if (!movingSquare.piece) return nextState;

        const piece = { ...movingSquare.piece };
        piece.isShielded = false; 
        piece.hasMoved = true;

        const targetSquare = nextState.board[tR][tC];
        const targetPiece = targetSquare.piece;
        const targetItem = targetSquare.item;

        let captureOccurred = false;
        let captureCount = 0;

        if (targetItem?.type === 'shroom') {
            const currentLevel = piece.level || 1;
            if (piece.type === 'queen') {
                if (currentLevel < 6) piece.level = currentLevel + 1;
            } else {
                piece.level = currentLevel + 1;
            }
            targetSquare.item = null;
        }

        if (move.type === 'enpassant') {
            const epRow = piece.color === 'white' ? tR + 1 : tR - 1;
            if (nextState.board[epRow]?.[tC]) nextState.board[epRow][tC].piece = null;
            piece.type = 'infiltrator';
            captureOccurred = true;
            captureCount = 1;
        } else if (targetPiece && targetPiece.color !== currentPlayer) {
            captureOccurred = true;
            captureCount = 1;
            const levelBonus = this.captureLevelBonuses[targetPiece.type] || 1;
            piece.level = Math.min(piece.type === 'queen' ? 7 : 99, (piece.level || 1) + levelBonus);
            
            if (piece.type === 'commander') this.applyRally(nextState, currentPlayer, 'pawn');
            else if (piece.type === 'hero') this.applyRally(nextState, currentPlayer, 'all');
            
            if (piece.type === 'king') this.reduceEnemyQueens(nextState, opponentColor, levelBonus);
        }

        if (move.type === 'self-destruct') {
            const sdResult = this.handleSelfDestruct(nextState, fR, fC, currentPlayer);
            captureCount = sdResult.captures;
            captureOccurred = captureCount > 0;
            nextState.board[fR][fC].piece = null;
        } else if (move.type === 'swap') {
            const temp = targetPiece;
            targetSquare.piece = piece;
            movingSquare.piece = temp;
        } else if (move.type === 'castle') {
            const isKingside = tC > fC;
            const rookFC = isKingside ? 7 : 0;
            const rookTC = isKingside ? tC - 1 : tC + 1;
            const rook = nextState.board[fR]?.[rookFC]?.piece;
            if (rook) {
                nextState.board[fR][rookTC].piece = { ...rook, hasMoved: true };
                nextState.board[fR][rookFC].piece = null;
            }
            targetSquare.piece = piece;
            movingSquare.piece = null;
        } else {
            targetSquare.piece = piece;
            movingSquare.piece = null;
        }

        if (move.type === 'promotion') {
            piece.type = move.promoteTo || 'queen';
            if (piece.type === 'queen') piece.level = Math.min(piece.level, 7);
            if (originalGameState.board[fR][fC].piece?.level! >= 5) nextState.extraTurn = true;
        }

        if (captureOccurred) {
            nextState.killStreaks[currentPlayer] += captureCount;
            if (nextState.killStreaks[currentPlayer] >= 6) nextState.extraTurn = true;
        } else {
            nextState.killStreaks[currentPlayer] = 0;
        }

        if (piece.type === 'infiltrator' && tR === (piece.color === 'white' ? 0 : 7)) {
            nextState.gameOver = true;
            nextState.winner = currentPlayer;
        }

        if (!nextState.gameOver && !nextState.extraTurn) {
            nextState.currentPlayer = opponentColor;
        }

        return nextState;
    }

    evaluatePosition = (gameState: AIGameState, aiColor: PlayerColor): number => {
        if (gameState.gameOver) {
            if (gameState.winner === aiColor) return 1000000;
            if (gameState.winner === 'draw') return 0;
            return -1000000;
        }

        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        let score = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = gameState.board[r][c];
                const piece = sq.piece;
                if (!piece) {
                    if (sq.item?.type === 'shroom') score += (aiColor === gameState.currentPlayer ? 50 : -50);
                    continue;
                }

                const mult = piece.color === aiColor ? 1 : -1;
                const levelIdx = Math.min(piece.level || 1, 10) - 1;
                const baseValue = this.pieceValues[piece.type][levelIdx] || this.pieceValues[piece.type][0];
                
                score += baseValue * mult;

                const rcKey = `${r}${c}`;
                if (this.centerSquares.has(rcKey)) score += 10 * mult;
                
                if (piece.type === 'infiltrator') {
                    const progress = Math.abs(r - (piece.color === 'white' ? 7 : 0));
                    score += progress * 40 * mult;
                }
            }
        }

        score += (gameState.killStreaks[aiColor] * 30);
        score -= (gameState.killStreaks[opponentColor] * 40);

        if (this.isInCheck(gameState, aiColor)) score -= 800;
        if (this.isInCheck(gameState, opponentColor)) score += 400;

        return score;
    }

    cloneGameState(gs: AIGameState): AIGameState {
        return {
            ...gs,
            board: gs.board.map(row => row.map(sq => ({
                piece: sq.piece ? { ...sq.piece } : null,
                item: sq.item ? { ...sq.item } : null
            }))),
            killStreaks: { ...(gs.killStreaks || { white: 0, black: 0 }) },
            capturedPieces: {
                white: gs.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: gs.capturedPieces?.black?.map(p => ({ ...p })) || []
            }
        };
    }

    quickEvaluateMove(gameState: AIGameState, move: AIMove, player: PlayerColor): number {
        const [tR, tC] = move.to;
        const target = gameState.board[tR][tC];
        let score = 0;
        
        if (target.piece) {
            score += 100 + (this.pieceValues[target.piece.type][0]);
        }
        if (move.type === 'promotion') score += 500;
        if (move.type === 'self-destruct') score += 100;
        if (target.item?.type === 'shroom') score += 150;

        return score;
    }

    applyRally(gs: AIGameState, color: PlayerColor, target: 'pawn' | 'all') {
        gs.board.forEach(row => row.forEach(sq => {
            if (sq.piece && sq.piece.color === color) {
                if (target === 'all' || (target === 'pawn' && sq.piece.type === 'pawn')) {
                    // Queen cannot reach Level 7 via rallying cry
                    sq.piece.level = Math.min(sq.piece.type === 'queen' ? 6 : 99, (sq.piece.level || 1) + 1);
                }
            }
        }));
    }

    reduceEnemyQueens(gs: AIGameState, color: PlayerColor, amount: number) {
        gs.board.forEach(row => row.forEach(sq => {
            if (sq.piece && sq.piece.color === color && sq.piece.type === 'queen') {
                sq.piece.level = Math.max(1, (sq.piece.level || 1) - amount);
            }
        }));
    }

    handleSelfDestruct(gs: AIGameState, r: number, c: number, color: PlayerColor): { captures: number } {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (isValidSquareUtil(nr, nc)) {
                const target = gs.board[nr][nc];
                if (target.piece && target.piece.color !== color && target.piece.type !== 'king') {
                    target.piece = null;
                    count++;
                }
                if (target.item?.type === 'anvil') target.item = null;
            }
        }
        return { captures: count };
    }

    generateAllMoves(gs: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = gs.board[r][c].piece;
            if (p && p.color === color) {
                moves.push(...this.generatePieceMoves(gs, r, c, p));
            }
        }
        return moves.filter(m => {
            const next = this.makeMoveOptimized(gs, m, color);
            return !this.isInCheck(next, color);
        });
    }

    generatePieceMoves(gs: AIGameState, r: number, c: number, p: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const level = p.level || 1;
        
        switch (p.type) {
            case 'pawn':
            case 'commander':
                const dir = p.color === 'white' ? -1 : 1;
                if (this.canMoveTo(gs, r + dir, c)) {
                    const isPromo = (r + dir === 0 || r + dir === 7);
                    moves.push({ from: [r,c], to: [r + dir, c], type: isPromo ? 'promotion' : 'move', promoteTo: isPromo ? 'queen' : undefined });
                }
                if (!p.hasMoved && this.canMoveTo(gs, r+dir, c) && this.canMoveTo(gs, r+2*dir, c)) moves.push({ from:[r,c], to:[r+2*dir, c], type:'move' });
                [-1, 1].forEach(dc => {
                    if (this.canCaptureAt(gs, r+dir, c+dc, p.color, p)) {
                        const isPromo = (r + dir === 0 || r + dir === 7);
                        moves.push({ from:[r,c], to:[r+dir, c+dc], type: isPromo ? 'promotion' : 'capture', promoteTo: isPromo ? 'queen' : undefined });
                    }
                });
                if (level >= 2 && this.canMoveTo(gs, r - dir, c)) moves.push({ from:[r,c], to:[r-dir, c], type:'move' });
                if (level >= 3) [-1, 1].forEach(dc => { if(this.canMoveTo(gs, r, c+dc)) moves.push({ from:[r,c], to:[r, c+dc], type:'move' }); });
                break;

            case 'knight':
            case 'hero':
            case 'archer':
                this.knightMoves.forEach(([dr, dc]) => {
                    const nr = r + dr, nc = c + dc;
                    if (this.canMoveOrCapture(gs, nr, nc, p.color, p)) moves.push({ from:[r,c], to:[nr, nc], type: gs.board[nr][nc].piece ? 'capture' : 'move' });
                });
                if (level >= 5) moves.push({ from:[r,c], to:[r,c], type:'self-destruct' });
                break;

            case 'bishop':
            case 'archbishop':
                this.addSliding(gs, moves, r, c, p, this.directions.bishop, level >= 2);
                break;

            case 'rook':
            case 'palace':
                this.addSliding(gs, moves, r, c, p, this.directions.rook, false);
                break;

            case 'queen':
                this.addSliding(gs, moves, r, c, p, this.directions.queen, false);
                break;

            case 'king':
                this.kingMoves.forEach(([dr, dc]) => {
                    const nr = r + dr, nc = c + dc;
                    if (this.canMoveOrCapture(gs, nr, nc, p.color, p)) moves.push({ from:[r,c], to:[nr, nc], type: gs.board[nr][nc].piece ? 'capture' : 'move' });
                });
                break;
        }
        return moves;
    }

    addSliding(gs: AIGameState, moves: AIMove[], r: number, c: number, p: Piece, dirs: [number, number][], phaseThrough: boolean) {
        dirs.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const nr = r + i * dr, nc = c + i * dc;
                if (!isValidSquareUtil(nr, nc)) break;
                const sq = gs.board[nr][nc];
                if (sq.item && sq.item.type !== 'shroom') break;
                if (!sq.piece) {
                    moves.push({ from:[r,c], to:[nr, nc], type:'move' });
                } else {
                    if (sq.piece.color !== p.color) {
                        if (!isPieceInvulnerableToAttackUtil(sq.piece, p)) moves.push({ from:[r,c], to:[nr, nc], type:'capture' });
                        break;
                    } else {
                        if (!phaseThrough) break;
                    }
                }
            }
        });
    }

    canMoveTo(gs: AIGameState, r: number, c: number) {
        return isValidSquareUtil(r, c) && !gs.board[r][c].piece && (!gs.board[r][c].item || gs.board[r][c].item?.type === 'shroom');
    }

    canCaptureAt(gs: AIGameState, r: number, c: number, color: PlayerColor, attacker: Piece) {
        if (!isValidSquareUtil(r, c)) return false;
        const target = gs.board[r][c].piece;
        if (!target || target.color === color) return false;
        return !isPieceInvulnerableToAttackUtil(target, attacker);
    }

    canMoveOrCapture(gs: AIGameState, r: number, c: number, color: PlayerColor, attacker: Piece) {
        if (!isValidSquareUtil(r, c)) return false;
        const sq = gs.board[r][c];
        if (sq.item && sq.item.type !== 'shroom') return false;
        if (!sq.piece) return true;
        if (sq.piece.color === color) return false;
        return !isPieceInvulnerableToAttackUtil(sq.piece, attacker);
    }

    isInCheck(gs: AIGameState, color: PlayerColor): boolean {
        const k = findKing(gs.board as any, color);
        if (!k) return false; // Important for Dungeon mode: No king = No check
        
        const opp = color === 'white' ? 'black' : 'white';
        // Simple attack map check for AI performance
        return this.isSquareAttacked(gs, k.row, k.col, opp);
    }

    isSquareAttacked(gs: AIGameState, r: number, c: number, attackerColor: PlayerColor): boolean {
        // Fast attack check for minimax
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightDeltas) {
            const p = gs.board[r+dr]?.[c+dc]?.piece;
            if (p && p.color === attackerColor && ['knight', 'hero', 'archer'].includes(p.type)) return true;
        }
        
        const cardDirs = [[0,1], [0,-1], [1,0], [-1,0]];
        for (const [dr, dc] of cardDirs) {
            for (let i = 1; i < 8; i++) {
                const nr = r+i*dr, nc = c+i*dc;
                if (!isValidSquareUtil(nr, nc)) break;
                const p = gs.board[nr][nc].piece;
                if (p) {
                    if (p.color === attackerColor && ['rook', 'palace', 'queen'].includes(p.type)) return true;
                    break;
                }
            }
        }

        const diagDirs = [[1,1], [1,-1], [-1,1], [-1,-1]];
        for (const [dr, dc] of diagDirs) {
            for (let i = 1; i < 8; i++) {
                const nr = r+i*dr, nc = c+i*dc;
                if (!isValidSquareUtil(nr, nc)) break;
                const p = gs.board[nr][nc].piece;
                if (p) {
                    if (p.color === attackerColor && ['bishop', 'archbishop', 'queen'].includes(p.type)) return true;
                    break;
                }
            }
        }
        
        const pawnDir = attackerColor === 'white' ? 1 : -1;
        for (const dc of [-1, 1]) {
            const p = gs.board[r+pawnDir]?.[c+dc]?.piece;
            if (p && p.color === attackerColor && ['pawn', 'commander'].includes(p.type)) return true;
        }

        return false;
    }

    isGameOver(gs: AIGameState) { return gs.gameOver; }

    getPositionKey(gs: AIGameState, maximizing: boolean): string {
        return `${gs.currentPlayer[0]}${maximizing ? 'M' : 'm'}${gs.board.flat().map(s => s.piece ? s.piece.id[0]+s.piece.level : '--').join('')}`;
    }

    selectPawnForCommanderPromotion(gs: AIGameState): [number, number] | null {
        const color = gs.currentPlayer;
        let best: [number, number] | null = null;
        let minR = color === 'white' ? 8 : -1;
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gs.board[r][c].piece;
                if (p && p.color === color && p.type === 'pawn' && p.level === 1) {
                    if ((color === 'white' && r < minR) || (color === 'black' && r > minR)) {
                        minR = r;
                        best = [r, c];
                    }
                }
            }
        }
        return best;
    }
}
