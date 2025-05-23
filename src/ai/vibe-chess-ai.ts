
// src/ai/vibe-chess-ai.ts
/**
 * Vibe Chess AI - Minimax Implementation
 * Accounts for leveling pieces, kill streaks, and special abilities
 */

import type { Piece, PlayerColor } from '@/types'; // Assuming types are available

// Simplified GameState structure expected by this AI.
// Needs to be populated from the main game's state.
interface AISquareState {
  piece: Piece | null;
  // Add other square properties if needed by AI's internal logic
}
type AIBoardState = (Piece | null)[][]; // AI expects a simpler board of Piece or null

interface AIGameState {
  board: AIBoardState;
  killStreaks: { white: number; black: number };
  currentPlayer: PlayerColor; // The player whose turn it is to move IN THIS SIMULATED STATE
  // Add other relevant game state properties that the AI's evaluation needs,
  // e.g., gameInfo for check/checkmate status, capturedPieces for resurrection logic if AI handles it.
  // For now, keeping it minimal based on current VibeChessAI evaluation functions.
  gameInfo?: { // Optional, as AI has its own checkmate detection stubs
    isCheck: boolean;
    playerWithKingInCheck: PlayerColor | null;
    isCheckmate: boolean;
    isStalemate: boolean;
    gameOver: boolean;
  };
  // The AI's evaluation also uses piece.invulnerable. Our main Piece type uses invulnerableTurnsRemaining.
  // This needs to be mapped when creating AIBoardState.
}

interface AIMove {
  from: [number, number]; // [row, col]
  to: [number, number];   // [row, col]
  type: 'move' | 'capture' | 'swap' | 'self-destruct' | 'castle'; // Added castle
  promotion?: Piece['type']; // For pawn promotion
}


class VibeChessAI {
    maxDepth: number;
    positionCache: Map<string, { score: number, move: AIMove | null }>;
    pieceValues: Record<Piece['type'], number[]>;
    positionalBonuses: Record<string, number>;

    constructor(depth = 3) { // Defaulting to depth 3 for performance
        this.maxDepth = depth;
        this.positionCache = new Map();
        
        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260], 
            'knight': [320, 360, 400, 450, 500, 550],
            'bishop': [330, 370, 420, 470, 520, 570],
            'rook': [500, 520, 580, 620, 660, 700], 
            'queen': [900, 920, 940, 960, 1200, 1250], 
            'king': [20000, 20000, 20000, 20000, 20000, 20000]
        };
        
        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15,
            kingSafety: 25,
            pawnStructure: 8
        };
    }

    getBestMove(gameState: AIGameState, aiPlayerColor: PlayerColor): AIMove | null {
        const startTime = Date.now();
        this.positionCache.clear(); // Consider if cache should persist across turns for deeper states
        
        // The initial call to minimax sets isMaximizingPlayer based on whose turn it is.
        // If gameState.currentPlayer is the aiPlayerColor, then the AI is the maximizing player for this root call.
        // However, the provided minimax signature expects isMaximizingPlayer directly.
        // We want the AI to maximize its own score.
        const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, aiPlayerColor);
        
        console.log(`VibeChessAI: Evaluation completed in ${Date.now() - startTime}ms`);
        console.log(`VibeChessAI: Best move evaluation: ${result.score}`);
        if (!result.move) {
            console.warn("VibeChessAI: No move found by minimax.");
        }
        
        return result.move;
    }

    minimax(gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayerNow: boolean, aiPlayerColor: PlayerColor): { score: number, move: AIMove | null } {
        const gameStateKey = JSON.stringify(gameState.board) + gameState.currentPlayer + depth + isMaximizingPlayerNow; // Simple cache key
        if (this.positionCache.has(gameStateKey)) {
            return this.positionCache.get(gameStateKey)!;
        }

        if (depth === 0 || this.isGameOver(gameState, aiPlayerColor)) { // Pass aiPlayerColor to isGameOver
            return {
                score: this.evaluatePosition(gameState, aiPlayerColor),
                move: null
            };
        }

        // gameState.currentPlayer is the player whose turn it is in THIS simulated state
        const moves = this.generateAllMoves(gameState, gameState.currentPlayer);
        
        if (moves.length === 0) { // No legal moves means stalemate or checkmate
             // If current player has no moves, it's either stalemate (0) or checkmate (loss for current player)
            if (this.isInCheck(gameState, gameState.currentPlayer)) { // Current player is in checkmate
                return { 
                    score: gameState.currentPlayer === aiPlayerColor ? -100000 - depth : 100000 + depth, 
                    move: null 
                }; 
            } else { // Stalemate
                return { score: 0, move: null };
            }
        }

        let bestMove: AIMove | null = moves[0]; // Default to first move

        if (isMaximizingPlayerNow) { // AI's turn (or simulating AI's turn)
            let maxEval = -Infinity;
            for (const move of moves) {
                const newGameState = this.makeMove(gameState, move);
                // The next turn is for the other player, so isMaximizingPlayer becomes false
                const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, false, aiPlayerColor);
                
                if (evaluation.score > maxEval) {
                    maxEval = evaluation.score;
                    bestMove = move;
                }
                alpha = Math.max(alpha, evaluation.score);
                if (beta <= alpha) break; 
            }
            const result = { score: maxEval, move: bestMove };
            this.positionCache.set(gameStateKey, result);
            return result;
        } else { // Opponent's turn (or simulating opponent's turn)
            let minEval = Infinity;
            for (const move of moves) {
                const newGameState = this.makeMove(gameState, move);
                // The next turn is for the AI player, so isMaximizingPlayer becomes true
                const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, true, aiPlayerColor);
                
                if (evaluation.score < minEval) {
                    minEval = evaluation.score;
                    bestMove = move;
                }
                beta = Math.min(beta, evaluation.score);
                if (beta <= alpha) break;
            }
            const result = { score: minEval, move: bestMove };
            this.positionCache.set(gameStateKey, result);
            return result;
        }
    }

    evaluatePosition(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKillStreaks(gameState, aiColor); // Assuming gameState has killStreaks
        score += this.evaluateSpecialAbilities(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor);
        
        const checkmateScore = this.evaluateCheckmate(gameState, aiColor);
        if (checkmateScore !== 0) return checkmateScore; // Prioritize checkmate
        
        return score;
    }

    evaluateMaterial(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece) {
                    // Ensure level is within bounds for pieceValues array
                    const levelIndex = Math.max(0, Math.min(piece.level - 1, this.pieceValues[piece.type].length - 1));
                    const pieceValue = this.pieceValues[piece.type][levelIndex] || this.pieceValues[piece.type][0];
                    
                    if (piece.color === aiColor) {
                        score += pieceValue;
                    } else {
                        score -= pieceValue;
                    }
                }
            }
        }
        return score;
    }

    evaluatePositional(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === aiColor) {
                    if ((r >= 3 && r <= 4) && (c >= 3 && c <= 4)) {
                        score += this.positionalBonuses.center;
                    } else if ((r >= 2 && r <= 5) && (c >= 2 && c <= 5)) {
                        score += this.positionalBonuses.nearCenter;
                    }
                    if ((piece.type === 'knight' || piece.type === 'bishop') && 
                        !((piece.type === 'knight' && (r === 0 || r === 7 || c === 0 || c === 7)) || // knight on edge
                          (piece.type === 'bishop' && (r === 0 || r === 7 || c === 0 || c === 7))) && // bishop on edge if not developed
                        (piece.hasMoved !== false)) { // Assuming hasMoved exists and implies development
                        score += this.positionalBonuses.development;
                    }
                }
            }
        }
        return score;
    }

    evaluateKillStreaks(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        if (!gameState.killStreaks) return 0;

        const aiStreak = gameState.killStreaks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentStreak = gameState.killStreaks[opponentColor] || 0;
        
        if (aiStreak >= 6) score += 200; 
        else if (aiStreak >= 5) score += 100;
        else if (aiStreak >= 3) score += 50; 
        else if (aiStreak >= 2) score += 25;
        
        if (opponentStreak >= 6) score -= 200;
        else if (opponentStreak >= 5) score -= 100;
        else if (opponentStreak >= 3) score -= 50;
        
        return score;
    }

    evaluateSpecialAbilities(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (!piece) continue;
                
                const multiplier = piece.color === aiColor ? 1 : -1;
                
                switch (piece.type) {
                    case 'rook':
                        if (piece.level >= 3 && (piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) ) {
                            score += 100 * multiplier;
                        }
                        break;
                    case 'queen':
                        if (piece.level >= 5) { // Royal Guard logic needs full implementation
                            score += 150 * multiplier;
                        }
                        break;
                    case 'bishop':
                        if (piece.level >= 3) { // Pawn immunity
                            score += 50 * multiplier;
                        }
                        // Conversion L5+: Hard to evaluate statically, could be very powerful
                        if (piece.level >= 5) score += 75 * multiplier;
                        break;
                    case 'knight':
                        if (piece.level >= 5) { // Self-destruct potential
                            const adjacentEnemies = this.countAdjacentEnemies(gameState, r, c, piece.color);
                            score += (adjacentEnemies * 30) * multiplier; // Simplified
                        }
                        break;
                    case 'pawn':
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                        if (distanceToPromotion <= 2) {
                            score += (20 * (3 - distanceToPromotion)) * multiplier;
                        }
                        // Push-back L4+: Hard to evaluate statically
                        if (piece.level >= 4) score += 15 * multiplier;
                        break;
                }
            }
        }
        return score;
    }

    evaluateKingSafety(gameState: AIGameState, aiColor: PlayerColor): number {
        const aiKingPos = this.findKingPos(gameState, aiColor);
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentKingPos = this.findKingPos(gameState, opponentColor);
        
        let score = 0;
        
        if (aiKingPos) {
            const aiThreats = this.countThreatsToSquare(gameState, aiKingPos.row, aiKingPos.col, aiColor);
            score -= aiThreats * 50; // Increased penalty for threats to own king
        }
        
        if (opponentKingPos) {
            const opponentThreats = this.countThreatsToSquare(gameState, opponentKingPos.row, opponentKingPos.col, opponentColor);
            score += opponentThreats * 40; 
        }
        return score;
    }

    evaluateCheckmate(gameState: AIGameState, aiColor: PlayerColor): number {
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        
        if (this.isInCheckmate(gameState, opponentColor)) return 100000;
        if (this.isInCheckmate(gameState, aiColor)) return -100000;
        if (this.isStalemate(gameState, opponentColor) && gameState.currentPlayer === opponentColor) return 0;
        if (this.isStalemate(gameState, aiColor) && gameState.currentPlayer === aiColor) return 0;

        return 0;
    }

    // --- Placeholder/Simplified Move Generation & Game Logic ---
    // IMPORTANT: These need to be fully implemented to match Vibe Chess rules for the AI to be effective.
    // The current implementations are very basic and likely don't cover all Vibe Chess abilities.

    generateAllMoves(gameState: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === color) {
                    const pieceMoves = this.generatePieceMoves(gameState, r, c, piece);
                    moves.push(...pieceMoves);
                }
            }
        }
        // Critical: Filter moves that would leave the king in check.
        // This requires a robust `wouldLeaveKingInCheck` which itself needs `makeMove` and `isInCheck`.
        return moves.filter(move => {
            const tempState = this.makeMove(gameState, move);
            return !this.isInCheck(tempState, color);
        });
    }
    
    generatePieceMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        // This is a VASTLY simplified move generator.
        // It needs to incorporate ALL Vibe Chess rules for each piece type and level.
        // For now, let's just implement basic pawn moves for demonstration.
        if (piece.type === 'pawn') {
            return this.generatePawnMoves(gameState, row, col, piece);
        }
        if (piece.type === 'knight') {
            return this.generateKnightMoves(gameState, row, col, piece);
        }
         if (piece.type === 'bishop') {
            return this.generateBishopMoves(gameState, row, col, piece);
        }
        if (piece.type === 'rook') {
            return this.generateRookMoves(gameState, row, col, piece);
        }
        if (piece.type === 'queen') {
            return this.generateQueenMoves(gameState, row, col, piece);
        }
        if (piece.type === 'king') {
            return this.generateKingMoves(gameState, row, col, piece);
        }
        // Add other pieces...
        return []; // Placeholder
    }

    generatePawnMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const direction = piece.color === 'white' ? -1 : 1; // White moves from high row to low, black low to high
        const startRow = piece.color === 'white' ? 6 : 1;

        // 1. Forward one square
        const r1 = row + direction;
        if (this.isValidSquare(r1, col) && !gameState.board[r1][col]) {
            moves.push({ from: [row, col], to: [r1, col], type: 'move' });
            // 2. Forward two squares from start
            if (row === startRow) {
                const r2 = row + 2 * direction;
                if (this.isValidSquare(r2, col) && !gameState.board[r2][col]) {
                    moves.push({ from: [row, col], to: [r2, col], type: 'move' });
                }
            }
        }
        // 3. Diagonal captures
        for (const dc of [-1, 1]) {
            const cr = row + direction;
            const cc = col + dc;
            if (this.isValidSquare(cr, cc) && gameState.board[cr][cc] && gameState.board[cr][cc]!.color !== piece.color) {
                // Bishop L3+ immunity
                const targetPiece = gameState.board[cr][cc]!;
                if (targetPiece.type === 'bishop' && targetPiece.level >=3) continue;
                moves.push({ from: [row, col], to: [cr, cc], type: 'capture' });
            }
        }
        // VIBE CHESS ABILITIES FOR PAWN (Simplified for AI stub)
        // L2+ Backward
        if (piece.level >=2) {
            const backRow = row - direction;
            if(this.isValidSquare(backRow, col) && !gameState.board[backRow][col]) {
                moves.push({from: [row,col], to: [backRow, col], type: 'move'});
            }
        }
        // L3+ Sideways
        if (piece.level >=3) {
             for (const dc of [-1, 1]) {
                if (this.isValidSquare(row, col + dc) && !gameState.board[row][col + dc]) {
                    moves.push({ from: [row, col], to: [row, col + dc], type: 'move' });
                }
            }
        }
        // L4+ Push-Back (not implemented in this AI's move generation)
        // L5+ Promotion Bonus (handled after move selection by main game)
        return moves;
    }

    generateKnightMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const deltas = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        if (piece.level >= 2) {
            deltas.push([-1,0], [1,0], [0,-1], [0,1]);
        }
        if (piece.level >= 3) {
            deltas.push([-3,0], [3,0], [0,-3], [0,3]);
        }

        for (const [dr, dc] of deltas) {
            const r = row + dr;
            const c = col + dc;
            if (this.isValidSquare(r, c)) {
                const target = gameState.board[r][c];
                if (!target || target.color !== piece.color) {
                    moves.push({ from: [row, col], to: [r, c], type: target ? 'capture' : 'move' });
                }
            }
        }
        // L4+ Swap (not implemented in this AI's move generation)
        // L5+ Self-destruct (special move type)
        if (piece.level >= 5) {
            moves.push({ from: [row,col], to: [row,col], type: 'self-destruct' });
        }
        return moves;
    }

    generateSlidingMoves(gameState: AIGameState, row: number, col: number, piece: Piece, directions: [number, number][]): AIMove[] {
        const moves: AIMove[] = [];
        for (const [dr, dc] of directions) {
            for (let i = 1; i < 8; i++) {
                const r = row + i * dr;
                const c = col + i * dc;
                if (!this.isValidSquare(r, c)) break;
                const target = gameState.board[r][c];
                if (!target) {
                    moves.push({ from: [row, col], to: [r, c], type: 'move' });
                } else {
                    if (piece.type === 'bishop' && piece.level >= 2 && target.color === piece.color) { // Bishop L2+ Phase
                        continue;
                    }
                    if (target.color !== piece.color) {
                        // Rook L3+ invulnerability (when target is invulnerable rook)
                        if (target.type === 'rook' && (target.invulnerableTurnsRemaining && target.invulnerableTurnsRemaining > 0)) break; 
                        // Queen L5+ invulnerability (when target is invulnerable queen and attacker is lower level)
                        if (target.type === 'queen' && target.level >= 5 && piece.level < target.level) break;

                        moves.push({ from: [row, col], to: [r, c], type: 'capture' });
                    }
                    break; 
                }
            }
        }
        return moves;
    }
    
    generateBishopMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves = this.generateSlidingMoves(gameState, row, col, piece, [[-1,-1],[-1,1],[1,-1],[1,1]]);
        // L4+ Swap (not implemented)
        // L5+ Conversion (not implemented as a move, but as an after-effect)
        return moves;
    }
    generateRookMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
         // L3+ invulnerability on level up (status, not move gen)
        return this.generateSlidingMoves(gameState, row, col, piece, [[-1,0],[1,0],[0,-1],[0,1]]);
    }
    generateQueenMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        // L5+ invulnerability to lower level (checked in target validation)
        return this.generateSlidingMoves(gameState, row, col, piece, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    }

    generateKingMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const maxDist = piece.level >= 2 ? 2 : 1;

        for(let dr = -maxDist; dr <= maxDist; dr++) {
            for(let dc = -maxDist; dc <= maxDist; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr;
                const c = col + dc;

                if (this.isValidSquare(r,c)) {
                    // Check path for 2-square straight moves
                    if (maxDist === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                         const midR = row + Math.sign(dr);
                         const midC = col + Math.sign(dc);
                         if (gameState.board[midR][midC]) continue; // Path blocked
                    }
                    const target = gameState.board[r][c];
                    if (!target || target.color !== piece.color) {
                        moves.push({ from: [row,col], to: [r,c], type: target ? 'capture' : 'move'});
                    }
                }
            }
        }
        // Castling (Simplified: AI needs to check game rules for hasMoved, path clear, not in check)
        // Assume hasMoved is part of Piece object. For simplicity, AI castling not fully implemented here.
        // if (piece.hasMoved === false && !this.isInCheck(gameState, piece.color)) {
        //     // Check Kingside (O-O)
        //     // Check Queenside (O-O-O)
        // }
        return moves;
    }


    isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    /**
     * CRITICAL for Minimax: This function MUST accurately reflect ALL Vibe Chess rules
     * when applying a move to a new game state for simulation.
     * The current version is a STUB and only copies state.
     * It does NOT:
     *  - Actually move pieces.
     *  - Handle captures.
     *  - Update piece levels on capture.
     *  - Trigger invulnerability for Rooks.
     *  - Handle pawn push-back (L4+).
     *  - Handle Bishop conversion (L5+).
     *  - Knight self-destruct.
     *  - Update kill streaks or handle resurrection.
     *  - Handle pawn promotion.
     *  - Update 'hasMoved' for King/Rook.
     *  - Update 'currentPlayer'.
     *  - Update 'invulnerableTurnsRemaining' status decrement.
     * Without these, the Minimax search is evaluating incorrect future states.
     */
    makeMove(gameState: AIGameState, move: AIMove): AIGameState {
        const newState: AIGameState = JSON.parse(JSON.stringify(gameState)); // Deep copy

        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;
        
        const movingPiece = newState.board[fromRow][fromCol];

        if (!movingPiece) {
            console.error("VibeChessAI.makeMove: No piece at from square", move.from);
            return newState; // Should not happen if generateMoves is correct
        }

        // Simple piece move for simulation (DOES NOT INCLUDE VIBE CHESS RULES)
        const capturedPiece = newState.board[toRow][toCol] ? { ...newState.board[toRow][toCol] } : null;
        newState.board[toRow][toCol] = { ...movingPiece };
        newState.board[fromRow][fromCol] = null;
        
        // Rudimentary 'hasMoved' for King/Rook for castling check in AI (if AI was to implement castling)
        if (newState.board[toRow][toCol] && (newState.board[toRow][toCol]!.type === 'king' || newState.board[toRow][toCol]!.type === 'rook')) {
            (newState.board[toRow][toCol]! as Piece).hasMoved = true;
        }

        // Switch current player for the next simulated turn
        newState.currentPlayer = newState.currentPlayer === 'white' ? 'black' : 'white';

        // TODO: THIS IS WHERE ALL VIBE CHESS RULES NEED TO BE APPLIED
        // For the AI to make good decisions, this makeMove needs to simulate:
        // - Leveling up on capture (based on captured piece type)
        // - Rook invulnerability on level up / promotion
        // - Pawn promotion (e.g., default to Queen for AI simulation)
        // - Kill streak updates, resurrection
        // - Pawn push-back, Bishop conversion, Knight self-destruct logic
        // - Correct decrement of invulnerableTurnsRemaining for opponent's invulnerable pieces
        // ...and any other Vibe Chess specific rule.

        return newState;
    }

    findKingPos(gameState: AIGameState, color: PlayerColor): { row: number, col: number, piece: Piece } | null {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.type === 'king' && piece.color === color) {
                    return { row: r, col: c, piece };
                }
            }
        }
        return null;
    }

    countAdjacentEnemies(gameState: AIGameState, row: number, col: number, attackerColor: PlayerColor): number {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr;
                const c = col + dc;
                if (this.isValidSquare(r, c)) {
                    const piece = gameState.board[r][c];
                    if (piece && piece.color !== attackerColor && piece.type !== 'king') {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    isSquareAttacked(gameState: AIGameState, targetRow: number, targetCol: number, attackerColor: PlayerColor): boolean {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === attackerColor) {
                    // This needs to use the AI's internal generatePieceMoves
                    // which should check for Vibe Chess specific capture rules
                    const moves = this.generatePieceMoves(gameState, r, c, piece);
                    for (const move of moves) {
                        if (move.to[0] === targetRow && move.to[1] === targetCol && (move.type === 'capture' || move.type === 'move')) { // Knights also "capture" by moving
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    countThreatsToSquare(gameState: AIGameState, targetRow: number, targetCol: number, defendingColor: PlayerColor): number {
        let threats = 0;
        const attackerColor = defendingColor === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === attackerColor) {
                    const moves = this.generatePieceMoves(gameState, r, c, piece);
                    for (const move of moves) {
                         // Check if the move targets the square, considering captures or knight moves
                        if (move.to[0] === targetRow && move.to[1] === targetCol) {
                           if (move.type === 'capture' || (piece.type === 'knight' && move.type === 'move')) {
                                threats++;
                                break; 
                           }
                        }
                    }
                }
            }
        }
        return threats;
    }

    isInCheck(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKingPos(gameState, color);
        if (!kingPos) return false; // Should not happen
        return this.isSquareAttacked(gameState, kingPos.row, kingPos.col, color === 'white' ? 'black' : 'white');
    }
    
    // This function would be called by generateAllMoves to filter
    // wouldLeaveKingInCheck(gameState: AIGameState, move: AIMove, color: PlayerColor): boolean {
    //     const tempState = this.makeMove(gameState, move);
    //     return this.isInCheck(tempState, color);
    // }

    isInCheckmate(gameState: AIGameState, color: PlayerColor): boolean {
        if (!this.isInCheck(gameState, color)) return false;
        const moves = this.generateAllMoves(gameState, color); // These should already be legal
        return moves.length === 0;
    }

    isStalemate(gameState: AIGameState, color: PlayerColor): boolean {
        if (this.isInCheck(gameState, color)) return false;
        const moves = this.generateAllMoves(gameState, color);
        return moves.length === 0;
    }

    isGameOver(gameState: AIGameState, aiPlayerColor: PlayerColor): boolean {
        // Check if current player (from gameState.currentPlayer) has any moves
        const possibleMoves = this.generateAllMoves(gameState, gameState.currentPlayer);
        if (possibleMoves.length === 0) {
            return true; // Checkmate or stalemate
        }
        // Add other game over conditions if any (e.g., insufficient material - not implemented)
        return false; 
    }
}

export default VibeChessAI;


    