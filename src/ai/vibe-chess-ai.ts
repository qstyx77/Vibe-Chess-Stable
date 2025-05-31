
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
                // console.log(`AI: No legal moves available for ${color}.`);
                return null;
            }

            // console.log(`AI: Generated ${legalMoves.length} legal moves for ${color}. Starting minimax for depth ${this.maxDepth}.`);

            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color); // Always maximizing for aiColor

            // console.log(`AI: Evaluation completed in ${Date.now() - this.searchStartTime}ms for ${color}. Depth: ${this.maxDepth}`);
            // console.log(`AI: Best move evaluation: ${result.score}. Move:`, result.move);

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
        const originalLevelOfMovingPiece = parseInt(String(gameState.board[fromRow][fromCol]?.level || 1), 10);


        // 1. Invulnerability is respected, not decremented by AI.

        // 2. Apply the move and basic consequences
        movingPieceCopy.hasMoved = true;

        if (move.type === 'capture') {
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) {
                return newState; // Invalid capture or target invulnerable
            }
            pieceWasCaptured = true;
            newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            movingPieceCopy.level = Math.min(6, (parseInt(String(movingPieceCopy.level || 1), 10)) + levelBonus);
            newState.board[toRow][toCol] = movingPieceCopy;
            newState.board[fromRow][fromCol] = null;
        } else if (move.type === 'move') {
            if (originalTargetPiece) return newState; // Cannot move to occupied square
            newState.board[toRow][toCol] = movingPieceCopy;
            newState.board[fromRow][fromCol] = null;
        } else if (move.type === 'promotion') {
            const originalPawnLevel = parseInt(String(gameState.board[fromRow][fromCol]?.level || 1), 10);
            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color) { // Capture promotion
                 if (this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) return newState;
                 pieceWasCaptured = true;
                 newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                return newState; // Cannot capture own piece on promotion
            }
            movingPieceCopy.type = move.promoteTo || 'queen';
            movingPieceCopy.level = 1; // Base level for promoted piece
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
        } else if (move.type === 'self-destruct' && movingPieceCopy.type === 'knight' && (parseInt(String(movingPieceCopy.level || 1), 10)) >= 5) {
            let destroyedCount = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = fromRow + dr, adjC = fromCol + dc;
                if (this.isValidSquare(adjR, adjC)) {
                    const victim = newState.board[adjR][adjC];
                    if (victim && victim.color !== currentPlayer && victim.type !== 'king' && !this.isPieceInvulnerableToAttack(victim, movingPieceCopy)) {
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
                !((movingPieceCopy.type === 'knight' && targetPieceForSwap.type === 'bishop' && (parseInt(String(movingPieceCopy.level || 1), 10)) >= 4) ||
                  (movingPieceCopy.type === 'bishop' && targetPieceForSwap.type === 'knight' && (parseInt(String(movingPieceCopy.level || 1), 10)) >= 4)) ) {
                return newState; // Invalid swap
            }
            newState.board[toRow][toCol] = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol] = { ...targetPieceForSwap, hasMoved: true };
        }

        // 3. Apply VIBE CHESS post-move effects for the piece that MOVED
        const pieceOnToSquare = newState.board[toRow][toCol];
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) { // Ensure it's the piece that moved
            if (pieceOnToSquare.type === 'pawn' && (parseInt(String(pieceOnToSquare.level || 1), 10)) >= 4 && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'bishop' && (parseInt(String(pieceOnToSquare.level || 1), 10)) >= 5 && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                // Bishop conversion is probabilistic and handled by main game, AI doesn't simulate the change
            }
            if (pieceOnToSquare.type === 'rook' &&
                (parseInt(String(pieceOnToSquare.level || 1), 10)) >= 3 &&
                (parseInt(String(pieceOnToSquare.level || 1), 10)) > originalLevelOfMovingPiece 
            ) {
                this.handleResurrection(newState, currentPlayer);
            }

            if (pieceOnToSquare.type === 'queen' &&
                (parseInt(String(pieceOnToSquare.level || 1), 10)) >= 5 &&
                originalLevelOfMovingPiece < 5 &&
                (move.type === 'capture' || (move.type === 'promotion' && pieceWasCaptured))
            ) {
                let pawnSacrificed = false;
                for(let r_sac=0; r_sac<8; r_sac++) {
                    for(let c_sac=0; c_sac<8; c_sac++) {
                        const p = newState.board[r_sac][c_sac];
                        if (p && p.type === 'pawn' && p.color === currentPlayer) {
                            newState.board[r_sac][c_sac] = null;
                            const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
                            newState.capturedPieces[opponentColor].push({...p});
                            pawnSacrificed = true;
                            break;
                        }
                    }
                    if (pawnSacrificed) break;
                }
            }
        }

        // 4. Update Kill Streaks
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        if (pieceWasCaptured) {
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + 1;
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
            newState.currentPlayer = currentPlayer;
            if (this.isInCheck(newState, opponentColor)) {
                const opponentMoves = this.generateAllMoves(newState, opponentColor);
                if (opponentMoves.length === 0) {
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
        // AI does not simulate the 50% conversion to prevent desync.
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
        for(let r=0; r<8; r++) for(let c=0; c<8; c++){
            if(!newState.board[r][c]) emptySquares.push([r,c]);
        }

        if (emptySquares.length > 0) {
            let placed = false;
            const backRank = currentPlayer === 'white' ? 7 : 0; 
            const preferredResSquares = emptySquares.filter(([r_sq,c_sq]) => r_sq === backRank);
            
            let resRow, resCol;
            if (preferredResSquares.length > 0) {
                 [resRow, resCol] = preferredResSquares[Math.floor(Math.random() * preferredResSquares.length)];
            } else {
                 [resRow, resCol] = emptySquares[Math.floor(Math.random() * emptySquares.length)];
            }

            const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook' ? false : pieceToResurrect.hasMoved };
            newState.board[resRow][resCol] = resurrectedPiece;

            newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);

            const promotionRank = currentPlayer === 'white' ? 0 : 7; 
            if (resurrectedPiece.type === 'pawn' && resRow === promotionRank) {
                newState.board[resRow][resCol]!.type = 'queen';
                newState.board[resRow][resCol]!.level = 1;
                newState.board[resRow][resCol]!.id = `${resurrectedPiece.id}_resPromo_Q`;
            }
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

        if (this.isGameOver(gameState)) {
            if (gameState.winner === aiColor) return 200000;
            if (gameState.winner === (aiColor === 'white' ? 'black' : 'white')) return -200000;
            return 0;
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
                    const level = Math.max(1, Math.min(6, parseInt(String(piece.level || 1), 10)));
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
                safetyScore -= 200;
            }
            safetyScore -= this.countDirectThreats(gameState, kingPos.row, kingPos.col, opponentColor) * 15;
        }

        const opponentKingPos = this.findKing(gameState, opponentColor);
        if (opponentKingPos) {
            if (this.isInCheck(gameState, opponentColor)) {
                safetyScore += 100;
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

        if (aiPlayerStreak >= 2) streakScore += 10 * aiPlayerStreak;
        if (aiPlayerStreak === 3) streakScore += 50; // Bonus for resurrection potential
        if (aiPlayerStreak >= 5) streakScore += 25; // Small bonus for maintaining streak
        if (aiPlayerStreak === 6) streakScore += 150; // Bonus for extra turn potential

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
                    const pieceLevel = parseInt(String(piece.level || 1), 10);
                    abilitiesScore += (pieceLevel -1) * 15 * multiplier; // General level bonus

                    if (piece.type === 'queen' && pieceLevel >= 5) {
                        abilitiesScore += 60 * multiplier; // L5 Queen is strong
                    }
                    if (piece.type === 'bishop' && pieceLevel >= 3){ // Pawn immunity for bishop
                        abilitiesScore += 25 * multiplier;
                    }
                     if (piece.type === 'pawn') {
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                         abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier; // Closer to promotion is good
                         if (pieceLevel >= 5) abilitiesScore += 30 * multiplier; // L5 Pawn extra turn potential
                    }
                }
            }
        }
        return abilitiesScore;
    }

    isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null): boolean {
        if (!targetPiece || !attackingPiece) return false;
    
        const targetLevel = parseInt(String(targetPiece.level || 1), 10);
        const attackerLevel = parseInt(String(attackingPiece.level || 1), 10);
    
        if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
            return true;
        }
        if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
            return true;
        }
        if (targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
            return true;
        }
        return false;
    }

    findPieceCoords(gameState: AIGameState, pieceId: string): {row: number, col: number} | null {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (gameState.board[r][c]?.id === pieceId) {
                    return {row: r, col: c};
                }
            }
        }
        return null;
    }


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
            const tempState = this.makeMoveOptimized(JSON.parse(JSON.stringify(gameState)), move, color);
            return !this.isInCheck(tempState, color);
        });
    }

    generatePieceMovesOptimized(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        switch (piece.type) {
            case 'pawn':   this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'knight': this.addKnightMoves(moves, gameState, row, col, piece); break;
            case 'bishop': this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.bishop); break;
            case 'rook':   this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.rook);   break;
            case 'queen':  this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.queen);  break;
            case 'king':   this.addKingMoves(moves, gameState, row, col, piece);   break;
        }
        this.addSpecialMoves(moves, gameState, row, col, piece);
        return moves;
    }

    addSpecialMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = parseInt(String(piece.level || 1), 10);
        if (piece.type === 'knight' && level >= 5) {
            moves.push({ from: [r, c], to: [r, c], type: 'self-destruct' });
        }
        if ((piece.type === 'knight' && level >= 4) || (piece.type === 'bishop' && level >= 4)) {
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
        const level = parseInt(String(piece.level || 1), 10);
        const board = gameState.board;

        // Forward 1
        if (this.isValidSquare(r + dir, c) && !board[r + dir][c]) {
            if (r + dir === promotionRank) {
                ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r + dir, c], type: 'promotion', promoteTo: pt as PieceType }));
            } else {
                moves.push({ from: [r,c], to: [r + dir, c], type: 'move' });
            }
            // Forward 2 from start
            if (r === startRow && !piece.hasMoved && this.isValidSquare(r + 2 * dir, c) && !board[r + dir][c] && !board[r + 2 * dir][c]) {
                moves.push({ from: [r,c], to: [r + 2 * dir, c], type: 'move' });
            }
        }
        // Diagonal captures
        [-1, 1].forEach(dc => {
            if (this.isValidSquare(r + dir, c + dc)) {
                const target = board[r + dir][c + dc];
                if (target && target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece)) {
                     if (!(target.type === 'bishop' && (parseInt(String(target.level || 1), 10)) >= 3 && piece.type === 'pawn')) { // Bishop L3+ immune to pawns
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
        const level = parseInt(String(piece.level || 1), 10);
        const board = gameState.board;
        this.knightMoves.forEach(([dr, dc]) => {
            const R = r + dr; const C = c + dc;
            if (this.isValidSquare(R, C)) {
                const target = board[R][C];
                if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                    moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                }
            }
        });
        if (level >= 2) {
            [[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquare(R, C)) {
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
        if (level >= 3) {
             [[ -3, 0 ], [ 3, 0 ], [ 0, -3 ], [ 0, 3 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquare(R, C)) {
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
    }

    addSlidingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece, directions: [number,number][]) {
        const level = parseInt(String(piece.level || 1), 10);
        const board = gameState.board;
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const R = r + i * dr; const C = c + i * dc;
                if (!this.isValidSquare(R, C)) break;
                const target = board[R][C];
                if (!target) {
                    moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else {
                    if (target.color !== piece.color) {
                        if (!this.isPieceInvulnerableToAttack(target, piece)) {
                           moves.push({ from: [r,c], to: [R,C], type: 'capture' });
                        }
                    } else if (piece.type === 'bishop' && level >=2 && target.color === piece.color){
                        // Bishop L2+ can phase through own pieces, so continue scan
                        continue;
                    }
                    break; // Path blocked by other color or non-phasing own piece
                }
            }
        });
    }

    addKingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = parseInt(String(piece.level || 1), 10);
        let maxDist = level >= 2 ? 2 : 1;
        const board = gameState.board;
        const opponentColor = piece.color === 'white' ? 'black' : 'white';

        for (let dr = -maxDist; dr <= maxDist; dr++) {
            for (let dc = -maxDist; dc <= maxDist; dc++) {
                if (dr === 0 && dc === 0) continue;
                const R = r + dr; const C = c + dc;
                if (this.isValidSquare(R, C)) {
                    if (maxDist === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                        const midR = r + Math.sign(dr);
                        const midC = c + Math.sign(dc);
                        if (this.isValidSquare(midR, midC)) {
                            if (board[midR][midC]) continue; // Path blocked by any piece
                            if (this.isSquareAttacked(gameState, midR, midC, opponentColor, true)) continue;
                        }
                    }
                    const target = board[R][C];
                     if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            }
        }
        if (level >= 5) {
            this.knightMoves.forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                if (this.isValidSquare(R,C)){
                    const target = board[R][C];
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
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

    isLegalMoveQuick(gameState: AIGameState, move: AIMove, color: PlayerColor): boolean {
        const tempState = this.makeMoveOptimized(JSON.parse(JSON.stringify(gameState)), move, color);
        return !this.isInCheck(tempState, color);
    }

    isInCheck(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKing(gameState, color);
        if (!kingPos) return true; // No king means effectively in check / game over
        const opponentColor = color === 'white' ? 'black' : 'white';

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const attackerPiece = gameState.board[r_att][c_att];
                if (attackerPiece && attackerPiece.color === opponentColor) {
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
        if (!playerToMove) return false; // Should not happen in a valid state

        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true; // King captured

        const legalMoves = this.generateAllMoves(gameState, playerToMove);
        if (legalMoves.length === 0) {
            return true; 
        }
        return false;
    }


    canCastle(gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean {
        const king = gameState.board[kingRow][kingCol];
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
        const squaresToNotBeAttacked: [number, number][] = [[kingRow, kingCol]]; 
        if (kingside) {
            squaresToNotBeAttacked.push([kingRow, kingCol + 1], [kingRow, kingCol + 2]);
        } else {
            squaresToNotBeAttacked.push([kingRow, kingCol - 1], [kingRow, kingCol - 2]);
        }

        for (const [r_check, c_check] of squaresToNotBeAttacked) {
             if (this.isSquareAttacked(gameState, r_check, c_check, opponentColor, true)) return false;
        }
        return true;
    }

    isSquareAttacked(gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor, simplifyKingCheck: boolean = false): boolean{
        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const piece = gameState.board[r_att][c_att];
                if(piece && piece.color === attackerColor){
                    if (this.canAttackSquare(gameState, [r_att,c_att], [r_target, c_target], piece, simplifyKingCheck)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    canAttackSquare(gameState: AIGameState, from: [number, number], to: [number, number], piece: Piece, simplifyKingCheck: boolean = false): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = toRow - fromRow;
        const deltaCol = toCol - fromCol;
        const targetPiece = gameState.board[toRow][toCol]; 

        if (targetPiece && this.isPieceInvulnerableToAttack(targetPiece, piece)) {
             return false;
        }

        switch (piece.type) {
            case 'pawn':
                const direction = piece.color === 'white' ? -1 : 1;
                return deltaRow === direction && Math.abs(deltaCol) === 1;
            case 'knight':
                const knightLevel = parseInt(String(piece.level || 1), 10);
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) return true;
                if (knightLevel >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) return true;
                if (knightLevel >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) return true;
                return false;
            case 'bishop':
                return Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to, piece);
            case 'rook':
                return (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece);
            case 'queen':
                return (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece);
            case 'king':
                const kingLevel = parseInt(String(piece.level || 1), 10);
                let effectiveMaxDist = kingLevel >= 2 ? 2 : 1;
                let canUseKnightMove = kingLevel >= 5;

                if (simplifyKingCheck) {
                    effectiveMaxDist = 1;
                    canUseKnightMove = false;
                }

                if (Math.abs(deltaRow) <= effectiveMaxDist && Math.abs(deltaCol) <= effectiveMaxDist) {
                    if (effectiveMaxDist === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2) && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquare(midR, midC) && gameState.board[midR][midC]) return false; // Path blocked
                        if (!simplifyKingCheck && this.isSquareAttacked(gameState, midR, midC, piece.color === 'white' ? 'black' : 'white', true)) {
                            return false;
                        }
                    }
                    return true;
                }

                if (canUseKnightMove && ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) {
                    return true;
                }
                return false;
            default:
                return false;
        }
    }

    isPathClear(board: AIBoardState, from: [number, number], to: [number, number], piece: Piece): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = Math.sign(toRow - fromRow);
        const deltaCol = Math.sign(toCol - fromCol);
        const bishopLevelForPhasing = (piece.type === 'bishop' && (parseInt(String(piece.level || 1), 10)) >= 2);

        let r = fromRow + deltaRow;
        let c = fromCol + deltaCol;

        while (r !== toRow || c !== toCol) {
            if (!this.isValidSquare(r,c)) return false; 
            const pathPiece = board[r][c];
            if (pathPiece) {
                if (bishopLevelForPhasing && pathPiece.color === piece.color) {
                    // Bishop L2+ can phase through own piece
                } else {
                    return false; // Path blocked
                }
            }
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

    quickEvaluateMove(gameState: AIGameState, move: AIMove, playerColor: PlayerColor): number {
        let score = 0;
        const [toR, toC] = move.to;
        const targetPiece = gameState.board[toR]?.[toC];

        if (targetPiece && targetPiece.color !== playerColor) {
            const capturedValue = this.pieceValues[targetPiece.type]?.[(parseInt(String(targetPiece.level || 1), 10)) - 1] || 0;
            score += capturedValue * 10; // Heavily prioritize captures
        }

        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0;
            score += promoValue;
        }

        // Small bonus for moving towards center
        if (this.centerSquares.has(`${toR}${toC}`)) {
            score += 5;
        } else if (this.nearCenterSquares.has(`${toR}${toC}`)) {
            score += 2;
        }

        return score;
    }

    getPositionKey(gameState: AIGameState, isMaximizingPlayer: boolean): string {
        let key = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = gameState.board[r][c];
                if (p) {
                    key += `${p.color[0]}${p.type[0]}${parseInt(String(p.level || 1), 10)}`;
                    if (p.invulnerableTurnsRemaining) key += `i${p.invulnerableTurnsRemaining}`;
                    if (p.hasMoved) key += 'm';
                } else {
                    key += '--';
                }
            }
        }
        key += `-${gameState.currentPlayer[0]}`;
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`;
        key += `-w${gameState.killStreaks?.white || 0}b${gameState.killStreaks?.black || 0}`;
        return key;
    }

}

export default VibeChessAI;

