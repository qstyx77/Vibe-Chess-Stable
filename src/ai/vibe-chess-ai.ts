
import type { Piece, PlayerColor, PieceType } from '@/types';

// Helper interfaces for the AI's internal game state representation
interface AISquareState {
  piece: Piece | null;
}
type AIBoardState = (Piece | null)[][]; // Representing the 8x8 board

interface AIGameState {
  board: AIBoardState;
  currentPlayer: PlayerColor;
  killStreaks: { white: number; black: number };
  capturedPieces: { white: Piece[]; black: Piece[] }; 
  gameOver?: boolean;
  winner?: PlayerColor | 'draw';
  extraTurn?: boolean; 
  autoCheckmate?: boolean;
  // Add other VIBE CHESS specific states the AI needs to consider e.g. castling rights string if not on piece.hasMoved
}

interface AIMove {
  from: [number, number]; // [row, col]
  to: [number, number];   // [row, col]
  type: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap';
  promoteTo?: PieceType; 
}


/**
 * VIBE Chess AI - Complete Implementation
 * Handles all VIBE Chess mechanics including leveling, special abilities, and complex move generation
 */
class VibeChessAI {
    maxDepth: number;
    positionCache: Map<string, { score: number; move: AIMove | null; depth: number }>;
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


    constructor(depth = 3) { // Default depth
        this.maxDepth = depth;
        this.positionCache = new Map();
        this.maxCacheSize = 10000; 
        this.searchStartTime = 0;
        this.maxSearchTime = 5000; 
        
        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260],
            'knight': [320, 360, 400, 450, 500, 550],
            'bishop': [330, 370, 420, 470, 520, 570],
            'rook': [500, 520, 580, 620, 660, 700],
            'queen': [900, 920, 940, 960, 1200, 1250],
            'king': [20000, 20000, 20000, 20000, 20000, 20000]
        };
        
        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 0
        };
        
        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15,
            kingSafety: 25,
            pawnStructure: 8
        };

        this.knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        this.kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        this.directions = {
            rook: [[0,1], [0,-1], [1,0], [-1,0]],
            bishop: [[1,1], [1,-1], [-1,1], [-1,-1]],
            queen: [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
        };
        
        this.centerSquares = new Set(['33', '34', '43', '44']); // rowCol strings
        this.nearCenterSquares = new Set(['22', '23', '24', '25', '32', '35', '42', '45', '52', '53', '54', '55']);
    }

    /**
     * Main AI move selection function
     */
    getBestMove(gameState: AIGameState, color: PlayerColor): AIMove | null {
        try {
            this.searchStartTime = Date.now();
            this.positionCache.clear();
            
            if (!gameState?.board || !color) {
                console.error("AI: Invalid game state or color provided to getBestMove");
                return null;
            }
            
            const legalMoves = this.generateAllMoves(gameState, color);
            
            if (legalMoves.length === 0) {
                console.log(`AI: No legal moves available for ${color}.`);
                return null;
            }
            
            console.log(`AI: Generated ${legalMoves.length} legal moves for ${color}. Starting minimax for depth ${this.maxDepth}.`);
            
            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color); // Always maximizing for aiColor
            
            console.log(`AI: Evaluation completed in ${Date.now() - this.searchStartTime}ms for ${color}. Depth: ${this.maxDepth}`);
            console.log(`AI: Best move evaluation: ${result.score}. Move:`, result.move);
            
            return result.move || legalMoves[0];
            
        } catch (error) {
            console.error("AI: Error in getBestMove:", error);
            const fallbackMoves = this.generateAllMoves(gameState, color);
            return fallbackMoves.length > 0 ? fallbackMoves[0] : null;
        }
    }

    /**
     * Minimax algorithm with alpha-beta pruning
     */
    minimax(gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null } {
        try {
             if (Date.now() - this.searchStartTime > this.maxSearchTime) {
                 return { score: this.evaluatePosition(gameState, aiColor), move: null };
             }

            if (this.isGameOver(gameState)) {
                return {
                    score: this.evaluatePosition(gameState, aiColor),
                    move: null
                };
            }
            if (depth === 0) {
                 return { score: this.evaluatePosition(gameState, aiColor), move: null };
            }

            const positionKey = this.getPositionKey(gameState, isMaximizingPlayer);
            const cached = this.positionCache.get(positionKey);
            if (cached && cached.depth >= depth) {
                return cached;
            }

            const currentPlayerForNode = isMaximizingPlayer ? aiColor : (aiColor === 'white' ? 'black' : 'white');
            const moves = this.generateAllMoves(gameState, currentPlayerForNode);
            
            if (moves.length === 0) {
                return {
                    score: this.evaluatePosition(gameState, aiColor),
                    move: null
                };
            }
            
            // Move ordering for better pruning
            moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayerForNode) - 
                                this.quickEvaluateMove(gameState, a, currentPlayerForNode));


            let bestMove : AIMove | null = moves[0]; // Default to first move

            if (isMaximizingPlayer) {
                let maxEval = -Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const nextIsMaximizing = newGameState.extraTurn ? isMaximizingPlayer : !isMaximizingPlayer;
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, nextIsMaximizing, aiColor);
                    
                    if (evaluation.score > maxEval) {
                        maxEval = evaluation.score;
                        bestMove = move;
                    }
                    alpha = Math.max(alpha, evaluation.score);
                    if (beta <= alpha) break;
                }
                const result = { score: maxEval, move: bestMove, depth };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            } else { // Minimizing player
                let minEval = Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const nextIsMaximizing = newGameState.extraTurn ? isMaximizingPlayer : !isMaximizingPlayer;
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, nextIsMaximizing, aiColor);
                    
                    if (evaluation.score < minEval) {
                        minEval = evaluation.score;
                        bestMove = move;
                    }
                    beta = Math.min(beta, evaluation.score);
                    if (beta <= alpha) break;
                }
                const result = { score: minEval, move: bestMove, depth };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            }
        } catch (error) {
            console.error("AI: Error in minimax:", error, "Depth:", depth, "Player:", isMaximizingPlayer ? "Max" : "Min");
            return { score: isMaximizingPlayer ? -Infinity : Infinity, move: null };
        }
    }

    /**
     * Optimized makeMove function for internal AI simulation
     */
    makeMoveOptimized(gameState: AIGameState, move: AIMove, currentPlayer: PlayerColor): AIGameState {
        const newState: AIGameState = {
            ...JSON.parse(JSON.stringify(gameState)), // Deep copy for safety, can be optimized
            currentPlayer: currentPlayer, // Will be updated later if no extra turn
            extraTurn: false,
            gameOver: gameState.gameOver, // Carry over gameOver status
            winner: gameState.winner,     // Carry over winner
        };
        
        if (!newState.killStreaks) newState.killStreaks = {white:0, black:0};
        if (!newState.capturedPieces) newState.capturedPieces = {white:[], black:[]};

        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;
        const movingPieceCopy = { ...newState.board[fromRow][fromCol]! }; // Ensure piece exists and copy
        
        let pieceWasCaptured = false;
        const originalTargetPiece = newState.board[toRow][toCol] ? { ...newState.board[toRow][toCol]! } : null;
        const originalLevelOfMovingPiece = gameState.board[fromRow][fromCol]?.level || 1;


        // 1. Decrease invulnerability for opponent's pieces at START of this simulated turn
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = newState.board[r][c];
                if (p && p.color === opponentColor && p.invulnerableTurnsRemaining && p.invulnerableTurnsRemaining > 0) {
                    p.invulnerableTurnsRemaining--;
                    if (p.invulnerableTurnsRemaining === 0) {
                        delete p.invulnerableTurnsRemaining;
                    }
                }
            }
        }

        // 2. Apply the move and basic consequences
        movingPieceCopy.hasMoved = true;

        if (move.type === 'capture') {
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy, newState)) {
                return newState; // Invalid capture or target invulnerable
            }
            pieceWasCaptured = true;
            newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            movingPieceCopy.level = Math.min(6, (movingPieceCopy.level || 1) + levelBonus);
            if (movingPieceCopy.type === 'rook' && (movingPieceCopy.level || 1) >= 3) {
                // Rook L3 invulnerability is handled in game logic, not directly set here by AI simulation
                // AI will recognize it if the game state has it.
            }
            newState.board[toRow][toCol] = movingPieceCopy;
            newState.board[fromRow][fromCol] = null;
        } else if (move.type === 'move') {
            if (originalTargetPiece) return newState; // Cannot move to occupied square
            newState.board[toRow][toCol] = movingPieceCopy;
            newState.board[fromRow][fromCol] = null;
        } else if (move.type === 'promotion') {
            const originalPawnLevel = gameState.board[fromRow][fromCol]?.level || 1;
            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color) { // Capture promotion
                 if (this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy, newState)) return newState;
                 pieceWasCaptured = true;
                 newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                return newState; // Cannot capture own piece on promotion
            }
            movingPieceCopy.type = move.promoteTo || 'queen';
            movingPieceCopy.level = 1; // Base level for promoted piece
            // If promotion results in a capture, level up the new piece
            if (pieceWasCaptured && originalTargetPiece) {
                 const levelBonusPromo = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
                 movingPieceCopy.level = Math.min(6, movingPieceCopy.level + levelBonusPromo);
            }
            newState.extraTurn = originalPawnLevel >= 5;
            newState.board[toRow][toCol] = movingPieceCopy;
            newState.board[fromRow][fromCol] = null;
        } else if (move.type === 'castle') {
            const isKingside = toCol > fromCol;
            const rookFromCol = isKingside ? 7 : 0;
            const rookToCol = isKingside ? toCol - 1 : toCol + 1;
            const rook = newState.board[fromRow][rookFromCol];
            if (!rook || rook.type !== 'rook' || rook.hasMoved || movingPieceCopy.hasMoved) return newState;
            newState.board[toRow][toCol] = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][rookToCol] = { ...rook, hasMoved: true };
            newState.board[fromRow][fromCol] = null;
            newState.board[fromRow][rookFromCol] = null;
        } else if (move.type === 'self-destruct' && movingPieceCopy.type === 'knight' && (movingPieceCopy.level || 1) >= 5) {
            let destroyedCount = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = fromRow + dr, adjC = fromCol + dc;
                if (this.isValidSquare(adjR, adjC)) {
                    const victim = newState.board[adjR][adjC];
                    if (victim && victim.color !== currentPlayer && victim.type !== 'king' && !this.isPieceInvulnerableToAttack(victim, movingPieceCopy, newState)) {
                        newState.capturedPieces[currentPlayer].push({ ...victim });
                        newState.board[adjR][adjC] = null;
                        destroyedCount++;
                    }
                }
            }
            newState.board[fromRow][fromCol] = null;
            if (destroyedCount > 0) pieceWasCaptured = true;
        } else if (move.type === 'swap') {
            const targetPieceForSwap = newState.board[toRow][toCol];
            if (!targetPieceForSwap || targetPieceForSwap.color !== movingPieceCopy.color ||
                !((movingPieceCopy.type === 'knight' && targetPieceForSwap.type === 'bishop' && (movingPieceCopy.level || 1) >= 4) ||
                  (movingPieceCopy.type === 'bishop' && targetPieceForSwap.type === 'knight' && (movingPieceCopy.level || 1) >= 4)) ) {
                return newState; // Invalid swap
            }
            newState.board[toRow][toCol] = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol] = { ...targetPieceForSwap, hasMoved: true };
        }
        
        // 3. Apply VIBE CHESS post-move effects for the piece that MOVED
        const pieceOnToSquare = newState.board[toRow][toCol];
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) { // Ensure it's the piece that moved
            if (pieceOnToSquare.type === 'pawn' && (pieceOnToSquare.level || 1) >= 4 && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'bishop' && (pieceOnToSquare.level || 1) >= 5 && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                this.handleBishopConversion(newState, toRow, toCol, pieceOnToSquare.color);
            }
            // Rook Resurrection: if the piece that moved is a rook, its level is >=3, AND its level increased this turn
            if (pieceOnToSquare.type === 'rook' &&
                (pieceOnToSquare.level || 1) >= 3 &&
                (pieceOnToSquare.level || 1) > originalLevelOfMovingPiece
            ) {
                this.handleResurrection(newState, currentPlayer);
            }
        }

        // 4. Update Kill Streaks
        if (pieceWasCaptured) {
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + 1; // Assuming 1 piece captured for simplicity; self-destruct would need more complex update here if AI uses it
            newState.killStreaks[opponentColor] = 0;
            if (newState.killStreaks[currentPlayer] === 3) this.handleResurrection(newState, currentPlayer);
            if (newState.killStreaks[currentPlayer] === 6) newState.extraTurn = true;
        } else {
            newState.killStreaks[currentPlayer] = 0;
        }

        // 5. Determine Next Player
        if (!newState.extraTurn) {
            newState.currentPlayer = opponentColor;
        } else {
            newState.currentPlayer = currentPlayer; // Current player gets another turn
            // If extra turn leads to checkmate
            if (this.isInCheck(newState, opponentColor)) {
                const opponentMoves = this.generateAllMoves(newState, opponentColor);
                if (opponentMoves.length === 0) { // Checkmate
                    newState.gameOver = true;
                    newState.winner = currentPlayer;
                }
            }
        }
        
        return newState;
    }
    
    handlePawnPushBack(newState: AIGameState, pawnRow: number, pawnCol: number, pawnColor: PlayerColor) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = pawnRow + dr;
                const adjC = pawnCol + dc;
                if (this.isValidSquare(adjR, adjC)) {
                    const adjPiece = newState.board[adjR][adjC];
                    if (adjPiece && adjPiece.color !== pawnColor) {
                        const pushToR = adjR + dr;
                        const pushToC = adjC + dc;
                        if (this.isValidSquare(pushToR, pushToC) && !newState.board[pushToR][pushToC]) {
                            newState.board[pushToR][pushToC] = adjPiece;
                            newState.board[adjR][adjC] = null;
                        }
                    }
                }
            }
        }
    }

    handleBishopConversion(newState: AIGameState, bishopRow: number, bishopCol: number, bishopColor: PlayerColor) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = bishopRow + dr;
                const adjC = bishopCol + dc;
                if (this.isValidSquare(adjR, adjC)) {
                    const adjPiece = newState.board[adjR][adjC];
                    if (adjPiece && adjPiece.color !== bishopColor && adjPiece.type !== 'king') {
                        if (this.shouldConvertPiece(adjR, adjC)) { 
                            adjPiece.color = bishopColor;
                            adjPiece.id = `conv_${adjPiece.id}_${Date.now()}`;
                        }
                    }
                }
            }
        }
    }
    
    shouldConvertPiece(row: number, col: number): boolean { 
        return (row + col) % 2 === 0; 
    }

    handleResurrection(newState: AIGameState, currentPlayer: PlayerColor) {
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        const piecesToChooseFrom = newState.capturedPieces?.[opponentColor] || [];
        if (piecesToChooseFrom.length === 0) return;

        const pieceToResurrect = this.chooseBestResurrectionPiece(piecesToChooseFrom);
        if (!pieceToResurrect) return;

        const emptySquares: [number, number][] = [];
        // AI simplified resurrection: Place on any empty square.
        // A more complex version would place it adjacent to the triggering Rook,
        // but that requires knowing which Rook triggered it if multiple are L3+.
        for(let r=0; r<8; r++) for(let c=0; c<8; c++){
            if(!newState.board[r][c]) emptySquares.push([r,c]);
        }


        if (emptySquares.length > 0) {
            const [resRow, resCol] = emptySquares[Math.floor(Math.random() * emptySquares.length)];
            const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: false };
            newState.board[resRow][resCol] = resurrectedPiece;
            
            newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);
        }
    }

    chooseBestResurrectionPiece(capturedPieces: Piece[]): Piece | null {
        if (!capturedPieces || capturedPieces.length === 0) return null;
        return [...capturedPieces].sort((a,b) => (this.pieceValues[b.type]?.[0] || 0) - (this.pieceValues[a.type]?.[0] || 0))[0];
    }
    
    /**
     * Evaluation Functions
     */
    evaluatePosition(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        if (!gameState || !gameState.board) return 0;

        // Check for terminal states first
        if (this.isGameOver(gameState)) {
            if (gameState.winner === aiColor) return 200000; // AI wins
            if (gameState.winner === (aiColor === 'white' ? 'black' : 'white')) return -200000; // AI loses
            return 0; // Draw
        }

        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor);
        score += this.evaluateKillStreaks(gameState, aiColor);
        score += this.evaluateSpecialAbilitiesAndLevels(gameState, aiColor);
        
        return score;
    }

    evaluateMaterial(gameState: AIGameState, aiColor: PlayerColor): number {
        let materialScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece) {
                    const level = Math.max(1, Math.min(6, piece.level || 1));
                    const value = this.pieceValues[piece.type]?.[level - 1] || this.pieceValues[piece.type]?.[0] || 0;
                    materialScore += (piece.color === aiColor ? value : -value);
                }
            }
        }
        return materialScore;
    }

    evaluatePositional(gameState: AIGameState, aiColor: PlayerColor): number {
        let positionalScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    if (this.centerSquares.has(`${r}${c}`)) {
                        positionalScore += this.positionalBonuses.center * multiplier;
                    } else if (this.nearCenterSquares.has(`${r}${c}`)) {
                        positionalScore += this.positionalBonuses.nearCenter * multiplier;
                    }
                    if ((piece.type === 'knight' || piece.type === 'bishop') && piece.hasMoved) {
                        positionalScore += this.positionalBonuses.development * multiplier;
                    }
                }
            }
        }
        return positionalScore;
    }
    
    evaluateKingSafety(gameState: AIGameState, aiColor: PlayerColor): number {
        let safetyScore = 0;
        const kingPos = this.findKing(gameState, aiColor);
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
    
        if (kingPos) {
            if (this.isInCheck(gameState, aiColor)) {
                safetyScore -= 200; // Significant penalty for being in check
            }
            // Count direct threats for a more nuanced safety score
            safetyScore -= this.countDirectThreats(gameState, kingPos.row, kingPos.col, opponentColor) * 15;
        }
    
        // Consider opponent's king safety (less weight)
        const opponentKingPos = this.findKing(gameState, opponentColor);
        if (opponentKingPos) {
            if (this.isInCheck(gameState, opponentColor)) {
                safetyScore += 100; // Bonus for checking the opponent
            }
             safetyScore += this.countDirectThreats(gameState, opponentKingPos.row, opponentKingPos.col, aiColor) * 10;
        }
        return safetyScore;
    }

    countDirectThreats(gameState: AIGameState, kingRow: number, kingCol: number, attackerColor: PlayerColor): number {
        let threats = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === attackerColor) {
                    // Use simplified attack check to avoid recursion with full move gen
                    if (this.canAttackSquare(gameState, [r, c], [kingRow, kingCol], piece)) {
                        threats++;
                    }
                }
            }
        }
        return threats;
    }


    evaluateKillStreaks(gameState: AIGameState, aiColor: PlayerColor): number {
        let streakScore = 0;
        const ks = gameState.killStreaks || {white:0, black:0};
        const aiPlayerStreak = ks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentPlayerStreak = ks[opponentColor] || 0;

        if (aiPlayerStreak >= 2) streakScore += 10 * aiPlayerStreak; // Small bonus per streak
        if (aiPlayerStreak === 3) streakScore += 50; // Resurrection
        if (aiPlayerStreak >= 5) streakScore += 25; // Nearing extra turn
        if (aiPlayerStreak === 6) streakScore += 150; // Extra turn

        if (opponentPlayerStreak >= 2) streakScore -= 10 * opponentPlayerStreak;
        if (opponentPlayerStreak === 3) streakScore -= 50;
        if (opponentPlayerStreak >= 5) streakScore -= 25;
        if (opponentPlayerStreak === 6) streakScore -= 150;
        return streakScore;
    }

    evaluateSpecialAbilitiesAndLevels(gameState: AIGameState, aiColor: PlayerColor): number {
        let abilitiesScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    abilitiesScore += ((piece.level || 1) -1) * 15 * multiplier; // General level bonus

                    // Rook L3+ invulnerability is a game state effect, not directly an AI evaluation bonus unless it provides material advantage
                    // if (piece.type === 'rook' && (piece.level || 1) >= 3 && piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) {
                    //     abilitiesScore += 75 * multiplier; 
                    // }
                    if (piece.type === 'queen' && (piece.level || 1) >= 5) {
                        abilitiesScore += 60 * multiplier; 
                    }
                    if (piece.type === 'bishop' && (piece.level || 1) >= 3){
                        abilitiesScore += 25 * multiplier;
                    }
                     if (piece.type === 'pawn') {
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                         abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier; // Closer pawns are much better
                    }
                }
            }
        }
        return abilitiesScore;
    }

    // --- Invulnerability Check ---
    isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null, gameState: AIGameState): boolean {
        if (!targetPiece) return false; // No piece, not invulnerable
        if (!attackingPiece) return false; // No attacker context

        const targetLevel = targetPiece.level || 1;
        const attackerLevel = attackingPiece.level || 1;

        // Rule 1: Queen L5+ vs. lower level attacker
        if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
            return true;
        }

        // Rule 2: Bishop L3+ vs. Pawn attacker
        if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
            return true;
        }
        
        // Rule 3: General invulnerability turns (e.g., Rook L3+ ability from game rules, not AI eval)
        // This is checked based on the targetPiece's own property if set by the game engine.
        // The AI's `invulnerableTurnsRemaining` is for *opponent* pieces after *its* rook levels.
        // The game state passed to the AI should reflect actual invulnerability.
        if (targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
            return true;
        }

        return false;
    }
    
    // --- Move Generation ---
    generateAllMoves(gameState: AIGameState, color: PlayerColor): AIMove[] {
        const allPossibleMoves: AIMove[] = [];
        if (!gameState || !gameState.board) {
            console.error("AI: generateAllMoves called with invalid gameState");
            return [];
        }

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.color === color) {
                    allPossibleMoves.push(...this.generatePieceMovesOptimized(gameState, r, c, piece));
                }
            }
        }
        
        return allPossibleMoves.filter(move => {
            // Temporarily apply the move to a new state
            const tempState = this.makeMoveOptimized(JSON.parse(JSON.stringify(gameState)), move, color);
            // Check if the player who made the move is in check in the new state
            return !this.isInCheck(tempState, color);
        });
    }

    generatePieceMovesOptimized(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        switch (piece.type) {
            case 'pawn':   this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'knight': this.addKnightMoves(moves, gameState, row, col, piece); break; // Pass full gameState for invuln check
            case 'bishop': this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.bishop); break;
            case 'rook':   this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.rook);   break;
            case 'queen':  this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.queen);  break;
            case 'king':   this.addKingMoves(moves, gameState, row, col, piece);   break;
        }
        // Add special moves (self-destruct, swap)
        this.addSpecialMoves(moves, gameState, row, col, piece);
        return moves;
    }
    
    addSpecialMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = piece.level || 1;
        if (piece.type === 'knight' && level >= 5) { // Knight L5+ Self-Destruct
            moves.push({ from: [r, c], to: [r, c], type: 'self-destruct' });
        }
        if ((piece.type === 'knight' && level >= 4) || (piece.type === 'bishop' && level >= 4)) { // Knight/Bishop L4+ Swaps
            const targetType = piece.type === 'knight' ? 'bishop' : 'knight';
            for (let R = 0; R < 8; R++) {
                for (let C = 0; C < 8; C++) {
                    const targetPiece = gameState.board[R][C];
                    if (targetPiece && targetPiece.color === piece.color && targetPiece.type === targetType) {
                        moves.push({ from: [r, c], to: [R, C], type: 'swap' });
                    }
                }
            }
        }
    }

    addPawnMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const dir = piece.color === 'white' ? -1 : 1;
        const startRow = piece.color === 'white' ? 6 : 1;
        const promotionRank = piece.color === 'white' ? 0 : 7;
        const level = piece.level || 1;
        const board = gameState.board;

        // Forward 1
        if (this.isValidSquare(r + dir, c) && !board[r + dir][c]) {
            if (r + dir === promotionRank) {
                ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r + dir, c], type: 'promotion', promoteTo: pt as PieceType }));
            } else {
                moves.push({ from: [r,c], to: [r + dir, c], type: 'move' });
            }
            // Forward 2 from start
            if (r === startRow && this.isValidSquare(r + 2 * dir, c) && !board[r + 2 * dir][c]) {
                moves.push({ from: [r,c], to: [r + 2 * dir, c], type: 'move' });
            }
        }
        // Diagonal captures
        [-1, 1].forEach(dc => {
            if (this.isValidSquare(r + dir, c + dc)) {
                const target = board[r + dir][c + dc];
                if (target && target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState)) {
                     if (!(target.type === 'bishop' && (target.level || 1) >= 3 && piece.type === 'pawn')) { // Bishop L3+ immunity (already covered by general invuln check)
                        if (r + dir === promotionRank) {
                            ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r + dir, c + dc], type: 'promotion', promoteTo: pt as PieceType }));
                        } else {
                            moves.push({ from: [r,c], to: [r + dir, c + dc], type: 'capture' });
                        }
                    }
                }
            }
        });
        // Backward L2+
        if (level >= 2 && this.isValidSquare(r - dir, c) && !board[r - dir][c]) {
            moves.push({ from: [r,c], to: [r - dir, c], type: 'move' });
        }
        // Sideways L3+
        if (level >= 3) {
            [-1, 1].forEach(dc => {
                if (this.isValidSquare(r, c + dc) && !board[r][c + dc]) {
                    moves.push({ from: [r,c], to: [r, c + dc], type: 'move' });
                }
            });
        }
    }

    addKnightMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = piece.level || 1;
        const board = gameState.board; // Extract board for convenience
        this.knightMoves.forEach(([dr, dc]) => { // Standard L-shape
            const R = r + dr; const C = c + dc;
            if (this.isValidSquare(R, C)) {
                const target = board[R][C];
                if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState))) {
                    moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                }
            }
        });
        if (level >= 2) { // Cardinal 1
            [[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquare(R, C)) {
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
        if (level >= 3) { // Cardinal 3 Jump
             [[ -3, 0 ], [ 3, 0 ], [ 0, -3 ], [ 0, 3 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquare(R, C)) {
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
    }

    addSlidingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece, directions: [number,number][]) {
        const level = piece.level || 1;
        const board = gameState.board; // Extract board for convenience
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const R = r + i * dr; const C = c + i * dc;
                if (!this.isValidSquare(R, C)) break;
                const target = board[R][C];
                if (!target) {
                    moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else {
                    if (target.color !== piece.color) {
                        if (!this.isPieceInvulnerableToAttack(target, piece, gameState)) {
                           moves.push({ from: [r,c], to: [R,C], type: 'capture' });
                        }
                    } else if (piece.type === 'bishop' && level >=2 && target.color === piece.color){
                        continue; // Bishop L2+ can phase through own piece
                    }
                    break; 
                }
            }
        });
    }

    addKingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = piece.level || 1;
        const maxDist = level >= 2 ? 2 : 1;
        const board = gameState.board;

        for (let dr = -maxDist; dr <= maxDist; dr++) {
            for (let dc = -maxDist; dc <= maxDist; dc++) {
                if (dr === 0 && dc === 0) continue;
                const R = r + dr; const C = c + dc;
                if (this.isValidSquare(R, C)) {
                    if (maxDist === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                        const midR = r + Math.sign(dr);
                        const midC = c + Math.sign(dc);
                        if (this.isValidSquare(midR, midC) && board[midR][midC]) continue; 
                        // Simplified: AI's internal check for moving through attack is implicitly handled by isLegalMoveQuick later
                    }
                    const target = board[R][C];
                     if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            }
        }
        if (level >= 5) { // L5+ Knight moves
            this.knightMoves.forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                if (this.isValidSquare(R,C)){
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece, gameState))) {
                         moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
        // Castling
        if (!piece.hasMoved && !this.isInCheck(gameState, piece.color)) {
            // Kingside
            if (this.canCastle(gameState, piece.color, true, r, c)) {
                moves.push({ from: [r,c], to: [r, c + 2], type: 'castle' });
            }
            // Queenside
            if (this.canCastle(gameState, piece.color, false, r, c)) {
                moves.push({ from: [r,c], to: [r, c - 2], type: 'castle' });
            }
        }
    }
    
    // --- Game State Checks ---
    isLegalMoveQuick(gameState: AIGameState, move: AIMove, color: PlayerColor): boolean {
        const tempState = this.makeMoveOptimized(JSON.parse(JSON.stringify(gameState)), move, color);
        return !this.isInCheck(tempState, color); 
    }
    
    isInCheck(gameState: AIGameState, color: PlayerColor): boolean { 
        const kingPos = this.findKing(gameState, color);
        if (!kingPos) return true; 
        const opponentColor = color === 'white' ? 'black' : 'white';
        
        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const attackerPiece = gameState.board[r_att][c_att];
                if (attackerPiece && attackerPiece.color === opponentColor) {
                    // Use a simplified attack check that doesn't involve full move generation or recursion
                    if (this.canAttackSquare(gameState, [r_att, c_att], [kingPos.row, kingPos.col], attackerPiece)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    isGameOver(gameState: AIGameState): boolean {
        if(gameState.gameOver) return true;

        const playerToMove = gameState.currentPlayer;
        if (!playerToMove) return false; // Should be set by makeMove

        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true;

        const legalMoves = this.generateAllMoves(gameState, playerToMove);
        if (legalMoves.length === 0) {
            if (this.isInCheck(gameState, playerToMove)) { // Checkmate
                // gameState.gameOver = true; // AI should not modify passed gameState directly in checks
                // gameState.winner = playerToMove === 'white' ? 'black' : 'white';
                return true; 
            } else { // Stalemate
                // gameState.gameOver = true;
                // gameState.winner = 'draw';
                return true; 
            }
        }
        return false;
    }

    // isInCheckmate is implicitly handled by isGameOver + isInCheck combination in minimax

    canCastle(gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean {
        const king = gameState.board[kingRow][kingCol]; // Already confirmed it's the king
        if (!king || king.hasMoved) return false;

        const rookCol = kingside ? 7 : 0;
        const rook = gameState.board[kingRow][rookCol];
        if (!rook || rook.type !== 'rook' || rook.hasMoved) return false;

        const pathStart = kingside ? kingCol + 1 : rookCol + 1;
        const pathEnd = kingside ? rookCol -1 : kingCol -1;
        for (let c = Math.min(pathStart, pathEnd); c <= Math.max(pathStart, pathEnd); c++) {
            if (gameState.board[kingRow][c]) return false;
        }
        
        const opponentColor = color === 'white' ? 'black' : 'white';
        // Check squares king passes THROUGH are not attacked
        const checkColStart = kingside ? kingCol : kingCol -1; // King starts here or moves one left for Q-side
        const checkColEnd = kingside ? kingCol + 2 : kingCol;   // King lands here or started here for Q-side
        
        for (let c = Math.min(checkColStart, checkColEnd); c <= Math.max(checkColStart, checkColEnd); c++) {
            // Only check squares the king actually passes through or lands on *during castling*
            if ((kingside && (c === kingCol +1 || c === kingCol +2)) || (!kingside && (c === kingCol -1 || c === kingCol -2))) {
                 if (this.isSquareAttacked(gameState, kingRow, c, opponentColor)) return false;
            }
        }
        return true;
    }
    
    isSquareAttacked(gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor): boolean{
        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const piece = gameState.board[r_att][c_att];
                if(piece && piece.color === attackerColor){
                    if (this.canAttackSquare(gameState, [r_att,c_att], [r_target, c_target], piece)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    canAttackSquare(gameState: AIGameState, from: [number, number], to: [number, number], piece: Piece): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = toRow - fromRow;
        const deltaCol = toCol - fromCol;
        const level = piece.level || 1;

        switch (piece.type) {
            case 'pawn':
                const direction = piece.color === 'white' ? -1 : 1;
                return deltaRow === direction && Math.abs(deltaCol) === 1;
            case 'knight':
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) return true;
                if (level >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) return true;
                if (level >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) return true;
                return false;
            case 'bishop':
                return Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to);
            case 'rook':
                return (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to);
            case 'queen':
                return (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to);
            case 'king':
                const maxDistKing = level >= 2 ? 2 : 1;
                if (Math.abs(deltaRow) <= maxDistKing && Math.abs(deltaCol) <= maxDistKing) {
                     if (maxDistKing === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2) && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquare(midR, midC) && gameState.board[midR][midC]) return false; // Path blocked
                    }
                    return true;
                }
                if (level >=5 && ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) return true; // L5 Knight moves
                return false;
            default:
                return false;
        }
    }

    isPathClear(board: AIBoardState, from: [number, number], to: [number, number]): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = Math.sign(toRow - fromRow);
        const deltaCol = Math.sign(toCol - fromCol);
        
        let r = fromRow + deltaRow;
        let c = fromCol + deltaCol;
        
        while (r !== toRow || c !== toCol) {
            if (!this.isValidSquare(r,c)) return false; // Should not happen if 'to' is valid
            if (board[r][c]) return false; // Path blocked
            r += deltaRow;
            c += deltaCol;
        }
        return true;
    }

    findKing(gameState: AIGameState, color: PlayerColor): { row: number; col: number; piece: Piece } | null {
        if (!gameState || !gameState.board) return null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r][c];
                if (piece && piece.type === 'king' && piece.color === color) {
                    return { row: r, col: c, piece: piece };
                }
            }
        }
        return null;
    }

    isValidSquare(row: number, col: number): boolean {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }
    
    // Utility, if needed by AI, or can be removed if AI doesn't use it
    countAdjacentEnemies(gameState: AIGameState, row: number, col: number, color: PlayerColor): number {
        let count = 0;
        for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
            for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
                if (deltaRow === 0 && deltaCol === 0) continue;
                const newRow = row + deltaRow;
                const newCol = col + deltaCol;
                if (this.isValidSquare(newRow, newCol)) {
                    const piece = gameState.board[newRow][newCol];
                    if (piece && piece.color !== color && piece.type !== 'king') {
                        count++;
                    }
                }
            }
        }
        return count;
    }

    // Helper for quick move evaluation during move ordering
    quickEvaluateMove(gameState: AIGameState, move: AIMove, playerColor: PlayerColor): number {
        let score = 0;
        const [toR, toC] = move.to;
        const targetPiece = gameState.board[toR]?.[toC];
        
        if (targetPiece && targetPiece.color !== playerColor) { // Capture
            const capturedValue = this.pieceValues[targetPiece.type]?.[(targetPiece.level || 1) - 1] || 0;
            score += capturedValue * 10; // Heavily prioritize captures
        }
        
        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0;
            score += promoValue;
        }

        // Positional bonus for moving to center (simple heuristic)
        if (this.centerSquares.has(`${toR}${toC}`)) {
            score += 5;
        } else if (this.nearCenterSquares.has(`${toR}${toC}`)) {
            score += 2;
        }
        
        return score;
    }
    
    // Get a string key for the current game state for caching
    getPositionKey(gameState: AIGameState, isMaximizingPlayer: boolean): string {
        let key = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gameState.board[r][c];
                if (p) {
                    key += `${p.color[0]}${p.type[0]}${p.level || 1}`;
                    if (p.invulnerableTurnsRemaining) key += `i${p.invulnerableTurnsRemaining}`;
                } else {
                    key += '--';
                }
            }
        }
        key += `-${gameState.currentPlayer[0]}`;
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`;
        key += `-w${gameState.killStreaks?.white || 0}b${gameState.killStreaks?.black || 0}`;
        // Could add castling rights if tracked more explicitly in AIGameState beyond piece.hasMoved
        return key;
    }

}

export default VibeChessAI;


    