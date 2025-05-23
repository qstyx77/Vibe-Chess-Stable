
import type { Piece, PlayerColor, PieceType } from '@/types';

// Simplified GameState structure expected by this AI.
// Needs to be populated from the main game's state.
interface AISquareState {
  piece: Piece | null;
}
type AIBoardState = (Piece | null)[][]; // Representing the 8x8 board

interface AIGameState {
  board: AIBoardState;
  killStreaks: { white: number; black: number };
  currentPlayer: PlayerColor; // The player whose turn it is to move IN THIS SIMULATED STATE
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
  type: 'move' | 'capture' | 'swap' | 'self-destruct' | 'castle';
  promotion?: PieceType; // For pawn promotion
}


/**
 * Vibe Chess AI - Minimax Implementation
 * Accounts for leveling pieces, kill streaks, and special abilities
 */
class VibeChessAI {
    constructor(depth = 3) { // Default depth reduced for performance
        this.maxDepth = depth;
        this.positionCache = new Map();
        
        // Piece values adjusted for leveling system
        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260], // Levels 1-6
            'knight': [320, 360, 400, 450, 500, 550],
            'bishop': [330, 370, 420, 470, 520, 570],
            'rook': [500, 520, 580, 620, 660, 700], // Level 3+ invulnerability bonus
            'queen': [900, 920, 940, 960, 1200, 1250], // Level 5+ invulnerability bonus
            'king': [20000, 20000, 20000, 20000, 20000, 20000] // King value constant
        };
        
        // Positional bonuses for piece placement
        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15,
            kingSafety: 25,
            pawnStructure: 8
        };
    }

    /**
     * Main AI move selection function
     * @param {AIGameState} gameState - Current game state
     * @param {PlayerColor} color - AI's color ('white' or 'black')
     * @returns {AIMove | null} Best move found
     */
    getBestMove(gameState: AIGameState, color: PlayerColor): AIMove | null {
        const startTime = Date.now();
        this.positionCache.clear();
        
        // Determine if AI is maximizing player based on its color and current turn for Minimax
        // The 'isMaximizingPlayer' in minimax is true if it's AI's turn to make a move it wants to maximize.
        // If gameState.currentPlayer is the AI's color, then the AI is maximizing.
        // However, the `minimax` signature uses `color === 'white'` for initial isMaximizingPlayer.
        // It should be `gameState.currentPlayer === color` for the root call, or simply pass `true` if the initial call is for AI's turn.
        // For simplicity, let's assume the first call to minimax is always for the AI player to maximize its score.
        const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color);
        
        console.log(`AI evaluation completed in ${Date.now() - startTime}ms`);
        console.log(`Best move evaluation: ${result.score}`);
        
        return result.move;
    }

    /**
     * Minimax algorithm with alpha-beta pruning
     * @param {AIGameState} gameState
     * @param {number} depth
     * @param {number} alpha
     * @param {number} beta
     * @param {boolean} isMaximizingPlayer
     * @param {PlayerColor} aiColor - The color of the AI player for whom we are evaluating
     * @returns {{ score: number, move: AIMove | null }}
     */
    minimax(gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, aiColor: PlayerColor): { score: number, move: AIMove | null } {
        if (depth === 0 || this.isGameOver(gameState)) {
            return {
                score: this.evaluatePosition(gameState, aiColor),
                move: null
            };
        }

        // The player whose turn it is in *this current simulated state*
        const currentPlayerForThisNode = isMaximizingPlayer ? aiColor : (aiColor === 'white' ? 'black' : 'white');
        const moves = this.generateAllMoves(gameState, currentPlayerForThisNode);
        
        if (moves.length === 0) { // No legal moves
             // If current player has no moves, it's either stalemate (0) or checkmate (loss for current player)
            if (this.isInCheck(gameState, currentPlayerForThisNode)) { // Current player is in checkmate
                return { 
                    score: currentPlayerForThisNode === aiColor ? (-100000 - depth) : (100000 + depth), 
                    move: null 
                }; 
            } else { // Stalemate
                return { score: 0, move: null };
            }
        }

        let bestMove: AIMove | null = moves[0] || null;

        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            
            for (const move of moves) {
                const newGameState = this.makeMove(gameState, move); // This needs to set newGameState.currentPlayer correctly
                const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, false, aiColor);
                
                if (evaluation.score > maxEval) {
                    maxEval = evaluation.score;
                    bestMove = move;
                }
                
                alpha = Math.max(alpha, evaluation.score);
                if (beta <= alpha) break; 
            }
            
            return { score: maxEval, move: bestMove };
        } else { // Minimizing player's turn
            let minEval = Infinity;
            
            for (const move of moves) {
                const newGameState = this.makeMove(gameState, move); // This needs to set newGameState.currentPlayer correctly
                const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, true, aiColor);
                
                if (evaluation.score < minEval) {
                    minEval = evaluation.score;
                    bestMove = move;
                }
                
                beta = Math.min(beta, evaluation.score);
                if (beta <= alpha) break; 
            }
            
            return { score: minEval, move: bestMove };
        }
    }

    /**
     * Comprehensive position evaluation function
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluatePosition(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        
        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKillStreaks(gameState, aiColor);
        score += this.evaluateSpecialAbilities(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor);
        
        const checkmateScore = this.evaluateCheckmate(gameState, aiColor);
        if (checkmateScore !== 0) return checkmateScore; // Prioritize checkmate
        
        return score;
    }

    /**
     * Evaluate material balance considering piece levels
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluateMaterial(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = gameState.board[row][col];
                if (piece) {
                    const level = Math.max(1, Math.min(6, piece.level || 1)); // Ensure level is within 1-6
                    const pieceValueArray = this.pieceValues[piece.type];
                    const pieceValue = pieceValueArray ? pieceValueArray[level - 1] : (piece.type === 'king' ? 0 : 100); // Default for unknown types if any, king has own val
                    
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

    /**
     * Evaluate positional factors
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluatePositional(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = gameState.board[row][col];
                if (piece && piece.color === aiColor) {
                    if ((row >= 3 && row <= 4) && (col >= 3 && col <= 4)) {
                        score += this.positionalBonuses.center;
                    } else if ((row >= 2 && row <= 5) && (col >= 2 && col <= 5)) {
                        score += this.positionalBonuses.nearCenter;
                    }
                    
                    if ((piece.type === 'knight' || piece.type === 'bishop') && 
                        (piece.level || 1) >= 2 && piece.hasMoved !== false) { // Assuming piece.hasMoved implies it's developed
                        score += this.positionalBonuses.development;
                    }
                }
            }
        }
        
        return score;
    }

    /**
     * Evaluate kill streak potential and current streaks
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluateKillStreaks(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        const killStreaks = gameState.killStreaks || {white: 0, black: 0};
        const aiStreak = killStreaks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentStreak = killStreaks[opponentColor] || 0;
        
        if (aiStreak >= 6) score += 200; 
        else if (aiStreak >= 5) score += 100;
        else if (aiStreak >= 3) score += 50; 
        else if (aiStreak >= 2) score += 25;
        
        if (opponentStreak >= 6) score -= 200;
        else if (opponentStreak >= 5) score -= 100;
        else if (opponentStreak >= 3) score -= 50;
        
        return score;
    }

    /**
     * Evaluate special piece abilities
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluateSpecialAbilities(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = gameState.board[row][col];
                if (!piece) continue;
                
                const multiplier = piece.color === aiColor ? 1 : -1;
                const level = piece.level || 1;
                
                switch (piece.type) {
                    case 'rook':
                        if (level >= 3 && piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) { // Check invulnerableTurnsRemaining
                            score += 100 * multiplier;
                        }
                        break;
                        
                    case 'queen':
                        if (level >= 5) { // Royal Guard - needs context of attacking piece level
                            score += 150 * multiplier; // Simplified static bonus
                        }
                        break;
                        
                    case 'bishop':
                        if (level >= 3) { // Pawn immunity
                            score += 50 * multiplier;
                        }
                        if (level >= 5) { // Conversion potential (hard to evaluate statically)
                            score += 75 * multiplier;
                        }
                        break;
                        
                    case 'knight':
                        if (level >= 5) { // Self-destruct potential
                            const adjacentEnemies = this.countAdjacentEnemies(gameState, row, col, piece.color);
                            score += (adjacentEnemies * 30) * multiplier; // Simplified
                        }
                        break;
                        
                    case 'pawn':
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(row - promotionRank);
                        if (distanceToPromotion <= 2) {
                            score += (20 * (3 - distanceToPromotion)) * multiplier;
                        }
                        if (level >= 4) { // Push-back potential
                            score += 15 * multiplier;
                        }
                        break;
                }
            }
        }
        
        return score;
    }

    /**
     * Evaluate king safety including invulnerable piece threats
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluateKingSafety(gameState: AIGameState, aiColor: PlayerColor): number {
        const aiKingPos = this.findKingPos(gameState, aiColor);
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentKingPos = this.findKingPos(gameState, opponentColor);
        
        let score = 0;
        
        if (aiKingPos) {
            if (this.isInCheckByInvulnerable(gameState, aiColor)) {
                score -= 500; // Severe penalty for being in check by invulnerable piece
            }
            const aiThreats = this.countThreatsToSquare(gameState, aiKingPos.row, aiKingPos.col, aiColor);
            score -= aiThreats * 30; // General penalty for threats
        }
        
        if (opponentKingPos) {
             if (this.isInCheckByInvulnerable(gameState, opponentColor)) {
                score += 400; // High bonus for putting opponent in check by invulnerable piece
            }
            const opponentThreats = this.countThreatsToSquare(gameState, opponentKingPos.row, opponentKingPos.col, opponentColor);
            score += opponentThreats * 40; // General bonus for threatening opponent
        }
        
        return score;
    }


    /**
     * Check for checkmate conditions
     * @param {AIGameState} gameState
     * @param {PlayerColor} aiColor
     * @returns {number}
     */
    evaluateCheckmate(gameState: AIGameState, aiColor: PlayerColor): number {
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        
        if (this.isInCheckmate(gameState, opponentColor)) {
            return 100000; // AI wins
        }
        
        if (this.isInCheckmate(gameState, aiColor)) {
            return -100000; // AI loses
        }
        
        return 0;
    }

    /**
     * Generate all legal moves for a player
     * @param {AIGameState} gameState
     * @param {PlayerColor} color
     * @returns {AIMove[]}
     */
    generateAllMoves(gameState: AIGameState, color: PlayerColor): AIMove[] {
        const moves: AIMove[] = [];
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === color) {
                    const pieceMoves = this.generatePieceMoves(gameState, r, c, piece); // Pass piece
                    moves.push(...pieceMoves);
                }
            }
        }
        
        return moves.filter(move => {
            const tempState = this.makeMove(gameState, move);
            return !this.isInCheck(tempState, color);
        });
    }

    /**
     * Generate moves for a specific piece considering its level and abilities
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generatePieceMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        if (!piece) return [];
        
        switch (piece.type) {
            case 'pawn':
                return this.generatePawnMoves(gameState, row, col, piece);
            case 'knight':
                return this.generateKnightMoves(gameState, row, col, piece);
            case 'bishop':
                return this.generateBishopMoves(gameState, row, col, piece);
            case 'rook':
                return this.generateRookMoves(gameState, row, col, piece);
            case 'queen':
                return this.generateQueenMoves(gameState, row, col, piece);
            case 'king':
                return this.generateKingMoves(gameState, row, col, piece);
            default:
                return [];
        }
    }

    /**
     * Generate pawn moves with level-based abilities
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generatePawnMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const direction = piece.color === 'white' ? -1 : 1;
        const startRow = piece.color === 'white' ? 6 : 1;
        const level = piece.level || 1;
        
        // Standard forward move
        if (this.isValidSquare(row + direction, col) && !gameState.board[row + direction][col]) {
            moves.push({ from: [row, col], to: [row + direction, col], type: 'move' });
            // Two squares from start
            if (row === startRow && this.isValidSquare(row + 2 * direction, col) && !gameState.board[row + 2 * direction][col]) {
                moves.push({ from: [row, col], to: [row + 2 * direction, col], type: 'move' });
            }
        }
        
        // Diagonal captures
        for (const deltaCol of [-1, 1]) {
            const newRow = row + direction;
            const newCol = col + deltaCol;
            if (this.isValidSquare(newRow, newCol)) {
                const target = gameState.board[newRow][newCol];
                if (target && target.color !== piece.color) {
                     // Bishop L3+ immunity
                    if (target.type === 'bishop' && (target.level || 1) >=3) continue;
                    moves.push({ from: [row, col], to: [newRow, newCol], type: 'capture' });
                }
            }
        }
        
        if (level >= 2) { // Backward move
            const backRow = row - direction;
            if (this.isValidSquare(backRow, col) && !gameState.board[backRow][col]) {
                moves.push({ from: [row, col], to: [backRow, col], type: 'move' });
            }
        }
        
        if (level >= 3) { // Sideways move
            for (const deltaCol of [-1, 1]) {
                if (this.isValidSquare(row, col + deltaCol) && !gameState.board[row][col + deltaCol]) {
                    moves.push({ from: [row, col], to: [row, col + deltaCol], type: 'move' });
                }
            }
        }
        return moves;
    }

    /**
     * Generate knight moves with level-based abilities
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generateKnightMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const level = piece.level || 1;
        
        const knightDeltas = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        if (level >= 2) { // Cardinal moves
            knightDeltas.push([-1,0], [1,0], [0,-1], [0,1]);
        }
        if (level >= 3) { // 3-square cardinal jumps
             knightDeltas.push([-3,0], [3,0], [0,-3], [0,3]);
        }
        
        for (const [deltaRow, deltaCol] of knightDeltas) {
            const newRow = row + deltaRow;
            const newCol = col + deltaCol;
            if (this.isValidSquare(newRow, newCol)) {
                const target = gameState.board[newRow][newCol];
                if (!target || target.color !== piece.color) {
                     // Invulnerability check (Rook L3+, Queen L5+ vs lower level)
                    if (target) {
                        if (target.type === 'rook' && (target.level || 1) >= 3 && target.invulnerableTurnsRemaining && target.invulnerableTurnsRemaining > 0) continue;
                        if (target.type === 'queen' && (target.level || 1) >= 5 && level < (target.level || 1) ) continue;
                    }
                    moves.push({ from: [row, col], to: [newRow, newCol], type: target ? 'capture' : 'move'});
                }
            }
        }
        
        if (level >= 5) { // Self-destruct
            moves.push({ from: [row, col], to: [row, col], type: 'self-destruct' });
        }
        
        return moves;
    }
    
    /**
     * Generate sliding moves for Bishop, Rook, Queen
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @param {[number,number][]} directions
     * @returns {AIMove[]}
     */
    generateSlidingMoves(gameState: AIGameState, row: number, col: number, piece: Piece, directions: [number,number][]): AIMove[] {
        const moves: AIMove[] = [];
        const level = piece.level || 1;

        for (const [deltaRow, deltaCol] of directions) {
            for (let i = 1; i < 8; i++) {
                const newRow = row + i * deltaRow;
                const newCol = col + i * deltaCol;
                
                if (!this.isValidSquare(newRow, newCol)) break;
                
                const target = gameState.board[newRow][newCol];
                
                if (!target) {
                    moves.push({ from: [row, col], to: [newRow, newCol], type: 'move' });
                } else {
                    if (piece.type === 'bishop' && level >= 2 && target.color === piece.color) { // Bishop L2+ Phase
                        continue; 
                    }
                    if (target.color !== piece.color) {
                         // Invulnerability check
                        if (target.type === 'rook' && (target.level || 1) >= 3 && target.invulnerableTurnsRemaining && target.invulnerableTurnsRemaining > 0) break; // Stop if target is invulnerable rook
                        if (target.type === 'queen' && (target.level || 1) >= 5 && level < (target.level || 1) ) break; // Stop if target is higher-level invulnerable queen

                        moves.push({ from: [row, col], to: [newRow, newCol], type: 'capture' });
                    }
                    break; // Blocked by own piece (if not Bishop L2+) or after a capture
                }
            }
        }
        return moves;
    }


    /**
     * Generate bishop moves with level-based abilities
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generateBishopMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        return this.generateSlidingMoves(gameState, row, col, piece, [[-1,-1],[-1,1],[1,-1],[1,1]]);
    }

    /**
     * Generate rook moves
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generateRookMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        return this.generateSlidingMoves(gameState, row, col, piece, [[-1,0],[1,0],[0,-1],[0,1]]);
    }

    /**
     * Generate queen moves
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generateQueenMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
         return this.generateSlidingMoves(gameState, row, col, piece, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    }

    /**
     * Generate king moves with level-based extended reach
     * @param {AIGameState} gameState
     * @param {number} row
     * @param {number} col
     * @param {Piece} piece
     * @returns {AIMove[]}
     */
    generateKingMoves(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        const level = piece.level || 1;
        const maxDistance = level >= 2 ? 2 : 1;
        
        for (let dr = -maxDistance; dr <= maxDistance; dr++) {
            for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                if (dr === 0 && dc === 0) continue;
                
                const newRow = row + dr;
                const newCol = col + dc;
                
                if (!this.isValidSquare(newRow, newCol)) continue;
                
                // For 2-square moves, check if intermediate square is empty
                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) ) {
                     const midRow = row + Math.sign(dr);
                     const midCol = col + Math.sign(dc);
                     if (gameState.board[midRow] && gameState.board[midRow][midCol]) continue; // Path blocked
                }
                
                const target = gameState.board[newRow][newCol];
                if (!target || target.color !== piece.color) {
                    // Invulnerability check for target piece
                    if (target) {
                        if (target.type === 'rook' && (target.level || 1) >= 3 && target.invulnerableTurnsRemaining && target.invulnerableTurnsRemaining > 0) continue;
                        if (target.type === 'queen' && (target.level || 1) >= 5 && level < (target.level || 1)) continue;
                    }
                    moves.push({ from: [row, col], to: [newRow, newCol], type: target ? 'capture' : 'move' });
                }
            }
        }
        // Castling (Simplified: AI needs to check game rules for hasMoved, path clear, not in check)
        // Current AI does not implement castling logic due to complexity in makeMove simulation.
        return moves;
    }

    /**
     * Check if king is in check by invulnerable piece
     * @param {AIGameState} gameState
     * @param {PlayerColor} color
     * @returns {boolean}
     */
    isInCheckByInvulnerable(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKingPos(gameState, color);
        if (!kingPos) return false;
        
        const enemyColor = color === 'white' ? 'black' : 'white';
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === enemyColor && this.isPieceInvulnerable(piece, null)) { // Pass null for attacker for general inv check
                    const moves = this.generatePieceMoves(gameState, r, c, piece);
                    for (const move of moves) {
                        if (move.to[0] === kingPos.row && move.to[1] === kingPos.col) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /**
     * Check if a piece is currently invulnerable against a potential attacker
     * @param {Piece} piece - The piece to check for invulnerability
     * @param {Piece | null} attackerPiece - The piece attempting to attack (null if general check)
     * @returns {boolean}
     */
    isPieceInvulnerable(piece: Piece, attackerPiece: Piece | null): boolean {
        const pieceLevel = piece.level || 1;
        
        if (piece.type === 'rook' && pieceLevel >= 3 && piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) {
            return true;
        }
        
        if (piece.type === 'queen' && pieceLevel >= 5) {
            if (!attackerPiece) return true; // General invulnerability for eval
            const attackerLevel = attackerPiece.level || 1;
            if (attackerLevel < pieceLevel) return true; // Royal Guard
        }
        return false;
    }


    /**
     * Utility functions
     */
    isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    /**
     * CRITICAL for Minimax: This function MUST accurately reflect ALL Vibe Chess rules
     * when applying a move to a new game state for simulation.
     * The current version is a STUB and only copies state and basic piece movement.
     * It does NOT accurately simulate:
     *  - Leveling up on capture.
     *  - Triggering invulnerability for Rooks.
     *  - Pawn push-back (L4+).
     *  - Bishop conversion (L5+).
     *  - Knight self-destruct.
     *  - Updating kill streaks or handle resurrection.
     *  - Pawn promotion.
     *  - Updating 'hasMoved' for King/Rook accurately for castling checks.
     *  - Decrementing 'invulnerableTurnsRemaining'.
     *  - Updating 'currentPlayer' for the next turn.
     * Without these, the Minimax search is evaluating incorrect future states.
     */
    makeMove(gameState: AIGameState, move: AIMove): AIGameState {
        const newState: AIGameState = JSON.parse(JSON.stringify(gameState)); // Deep copy

        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;
        
        const movingPiece = newState.board[fromRow][fromCol];

        if (!movingPiece) {
            console.error("VibeChessAI.makeMove: No piece at from square", move.from);
            return newState; 
        }

        // Basic piece move for simulation
        newState.board[toRow][toCol] = { ...movingPiece };
        newState.board[fromRow][fromCol] = null;
        
        // Rudimentary 'hasMoved' for AI's internal castling check (if it were fully implemented)
        if (newState.board[toRow][toCol] && (newState.board[toRow][toCol]!.type === 'king' || newState.board[toRow][toCol]!.type === 'rook')) {
            (newState.board[toRow][toCol]! as Piece).hasMoved = true;
        }

        // CRITICAL: Simulate currentPlayer switch for the next node in Minimax
        newState.currentPlayer = newState.currentPlayer === 'white' ? 'black' : 'white';
        
        // TODO: Implement FULL Vibe Chess rule simulation here for accurate Minimax.
        // This includes leveling, captures, special abilities, promotions, kill streaks, etc.

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

    countThreatsToSquare(gameState: AIGameState, targetRow: number, targetCol: number, defendingColor: PlayerColor): number {
        let threats = 0;
        const attackerColor = defendingColor === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === attackerColor) {
                    // This needs to use the AI's internal generatePieceMoves
                    // which should check for Vibe Chess specific capture rules
                    const moves = this.generatePieceMoves(gameState, r, c, piece);
                    for (const move of moves) {
                        if (move.to[0] === targetRow && move.to[1] === targetCol && (move.type === 'capture' || (piece.type === 'knight' && move.type === 'move'))) { 
                            threats++;
                            break; 
                        }
                    }
                }
            }
        }
        return threats;
    }
    
    isInCheck(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKingPos(gameState, color);
        if (!kingPos) return false; 
        return this.countThreatsToSquare(gameState, kingPos.row, kingPos.col, color) > 0 ||
               this.isInCheckByInvulnerable(gameState, color);
    }
    
    wouldLeaveKingInCheck(gameState: AIGameState, move: AIMove, color: PlayerColor): boolean {
        const tempState = this.makeMove(gameState, move);
        return this.isInCheck(tempState, color);
    }

    isInCheckmate(gameState: AIGameState, color: PlayerColor): boolean {
        if (!this.isInCheck(gameState, color)) return false;
        const moves = this.generateAllMoves(gameState, color); // These should already be legal
        return moves.length === 0;
    }

    isGameOver(gameState: AIGameState): boolean {
        // Check based on the gameInfo if available, otherwise determine from board state
        if (gameState.gameInfo && gameState.gameInfo.gameOver) {
            return true;
        }
        // Simplified game over condition for AI's internal check: checkmate for either player
        return this.isInCheckmate(gameState, 'white') || this.isInCheckmate(gameState, 'black');
    }
}

// Export for use in your chess game
export default VibeChessAI;
