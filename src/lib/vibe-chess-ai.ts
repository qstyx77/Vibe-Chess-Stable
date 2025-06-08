
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item } from '@/types';
import { coordsToAlgebraic } from '@/lib/chess-utils'; // Assuming algebraicToCoords is not needed here

export class VibeChessAI {
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


    constructor(depth = 3) {
        this.maxDepth = depth;
        this.positionCache = new Map();
        this.maxCacheSize = 10000;
        this.searchStartTime = 0;
        this.maxSearchTime = 5000; // 5 seconds

        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260, 280, 300, 320, 340], // L1-L10
            'knight': [320, 360, 400, 450, 500, 550, 580, 610, 640, 670], // L1-L10
            'bishop': [330, 370, 420, 470, 520, 570, 600, 630, 660, 690], // L1-L10
            'rook': [500, 520, 580, 620, 660, 700, 730, 760, 790, 820], // L1-L10
            'queen': [900, 920, 940, 960, 1200, 1250, 1350], // Max L7
            'king': [20000, 20000, 20000, 20000, 20000, 20000, 20000], // King level doesn't typically change value this way
            'commander': [150, 180, 210, 250, 290, 330, 360, 390, 420, 450] // L1-L10
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1, 'commander': 1
        };

        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15, // Penalty if not developed, bonus if developed
            kingSafety: 25,  // Penalty per missing pawn shield
            pawnStructure: 8, // Bonus for advanced pawns, penalty for isolated/doubled
            anvilMalus: -15 // Penalty for anvil near own king, bonus for anvil near opponent king
        };

        this.knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        this.kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        this.directions = {
            rook: [[0,1], [0,-1], [1,0], [-1,0]],
            bishop: [[1,1], [1,-1], [-1,1], [-1,-1]],
            queen: [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
        };

        this.centerSquares = new Set(['33', '34', '43', '44']); // d5, e5, d4, e4 (0-indexed)
        this.nearCenterSquares = new Set(['22', '23', '24', '25', '32', '35', '42', '45', '52', '53', '54', '55']);
    }

    getBestMove(originalGameState: AIGameState, color: PlayerColor): AIMove | null {
        // Create a deep copy of the board to avoid modifying the original
      const localBoardCopy: AIBoardState = [];
        if (originalGameState.board && Array.isArray(originalGameState.board)) {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                localBoardCopy[r_idx] = [];
                const originalRow = originalGameState.board[r_idx];
                if (originalRow && Array.isArray(originalRow)) {
                    for (let c_idx = 0; c_idx < 8; c_idx++) {
                        const originalSquare = originalRow[c_idx];
                        localBoardCopy[r_idx][c_idx] = {
                            piece: originalSquare?.piece ? { ...originalSquare.piece } : null,
                            item: originalSquare?.item ? { ...originalSquare.item } : null,
                        };
                    }
                } else {
                    // If a row is missing, fill it with empty squares
                     localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
                }
            }
        } else {
            // If the board itself is missing, create a fully empty one (though this shouldn't happen)
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
            }
        }

        const gameState: AIGameState = {
            ...originalGameState,
            board: localBoardCopy,
            // Deep copy capturedPieces and killStreaks as well
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 },
        };


        try {
            this.searchStartTime = Date.now();
            this.positionCache.clear(); // Clear cache for each new top-level move decision

            if (!gameState?.board || !color) {
                console.error("AI getBestMove: Invalid gameState or color provided.");
                return null;
            }

            // First, check if the AI is currently in check.
            // If so, prioritize moves that get out of check.
            // (This is implicitly handled by the minimax filtering out illegal moves,
            // but an explicit check here could guide move ordering if needed).

            const legalMoves = this.generateAllMoves(gameState, color);

            if (legalMoves.length === 0) {
                // This means checkmate or stalemate
                return null;
            }

            // Simple heuristic: if only one move, take it.
            // if (legalMoves.length === 1) {
            //     return legalMoves[0];
            // }

            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color);

            // If minimax returns no move but legal moves exist, pick the first (potentially random or first sorted)
            if (!result.move && legalMoves.length > 0) {
                // Fallback: could sort legalMoves by a quick evaluation or simply return the first one
                // For now, returning the first one if minimax fails to select.
                return legalMoves[0];
            }
            return result.move;

        } catch (error) {
            console.error("AI Error in getBestMove:", error);
            // Fallback in case of unexpected error during AI processing
            try {
                const fallbackGameState: AIGameState = { // Ensure this is also a deep copy
                    ...originalGameState,
                    board: localBoardCopy, // Use the already deep-copied board
                    capturedPieces: {
                        white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                        black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
                    },
                    killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
                };
                const fallbackMoves = this.generateAllMoves(fallbackGameState, color);
                return fallbackMoves.length > 0 ? fallbackMoves[0] : null;
            } catch (fallbackError) {
                console.error("AI Fallback Error in getBestMove:", fallbackError);
                return null;
            }
        }
    }

    minimax(gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null } {
        try {
             if (Date.now() - this.searchStartTime > this.maxSearchTime) {
                 // Time limit exceeded, return current evaluation
                 return { score: this.evaluatePosition(gameState, aiColor), move: null };
             }

            if (this.isGameOver(gameState)) {
                return {
                    score: this.evaluatePosition(gameState, aiColor), // Use existing evaluatePosition for game over
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

            if (moves.length === 0) { // No legal moves means checkmate or stalemate from this position
                return {
                    score: this.evaluatePosition(gameState, aiColor), // Evaluate current board as end state
                    move: null
                };
            }

            // Move ordering: Try more promising moves first (e.g., captures, checks)
            moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayerForNode) -
                                this.quickEvaluateMove(gameState, a, currentPlayerForNode));

            let bestMove : AIMove | null = moves[0]; // Default to the first move

            if (isMaximizingPlayer) {
                let maxEval = -Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, false, aiColor);

                    if (evaluation.score > maxEval) {
                        maxEval = evaluation.score;
                        bestMove = move;
                    }
                    alpha = Math.max(alpha, evaluation.score);
                    if (beta <= alpha) break; // Beta cut-off
                }
                const result = { score: maxEval, move: bestMove, depth };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            } else { // Minimizing player
                let minEval = Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, true, aiColor);

                    if (evaluation.score < minEval) {
                        minEval = evaluation.score;
                        bestMove = move;
                    }
                    beta = Math.min(beta, evaluation.score);
                    if (beta <= alpha) break; // Alpha cut-off
                }
                const result = { score: minEval, move: bestMove, depth };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            }
        } catch (error) {
            console.error("Minimax error:", error, "Depth:", depth, "Maximizing:", isMaximizingPlayer);
            return { score: isMaximizingPlayer ? -Infinity : Infinity, move: null }; // Error condition
        }
    }

    makeMoveOptimized(originalGameState: AIGameState, move: AIMove, currentPlayer: PlayerColor): AIGameState {
        const newBoardForOptimizedMove: AIBoardState = [];
         if (originalGameState.board && Array.isArray(originalGameState.board)) {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardForOptimizedMove[r_idx] = [];
                const originalRow = originalGameState.board[r_idx];
                if (originalRow && Array.isArray(originalRow)) {
                     for (let c_idx = 0; c_idx < 8; c_idx++) {
                        const originalSquare = originalRow[c_idx];
                        newBoardForOptimizedMove[r_idx][c_idx] = {
                            piece: originalSquare?.piece ? { ...originalSquare.piece } : null,
                            item: originalSquare?.item ? { ...originalSquare.item } : null,
                        };
                    }
                } else {
                    newBoardForOptimizedMove[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
                }
            }
        } else {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardForOptimizedMove[r_idx] = [];
                for (let c_idx = 0; c_idx < 8; c_idx++) {
                     newBoardForOptimizedMove[r_idx][c_idx] = { piece: null, item: null };
                }
            }
        }

        // Create a deep copy of the game state, especially mutable parts like board, capturedPieces, killStreaks
        const baseStateCopy = {
            ...originalGameState,
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 },
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
        };

        const newState: AIGameState = {
            ...baseStateCopy,
            board: newBoardForOptimizedMove, // Use the properly deep-copied board
            currentPlayer: currentPlayer, // This might change based on extraTurn
            extraTurn: false, // Reset extra turn flag for this new state
            gameMoveCounter: (baseStateCopy.gameMoveCounter || 0) + 1
        };

        if (!newState.killStreaks) newState.killStreaks = {white:0, black:0};
        if (!newState.capturedPieces) newState.capturedPieces = {white:[], black:[]};


        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;

        const movingPieceSourceSquare = newState.board[fromRow]?.[fromCol];
        if (!movingPieceSourceSquare || !movingPieceSourceSquare.piece) {
            // console.warn("AI makeMoveOptimized: No piece at source square", move.from);
            return newState; // Or handle as an error
        }
        const movingPieceCopy = { ...movingPieceSourceSquare.piece! }; // Make a copy to modify

        let pieceWasCaptured = false;
        let pieceCapturedByAnvil = false; // For pawn push-back

        const targetSquareState = newState.board[toRow]?.[toCol];
        const originalTargetPiece = targetSquareState?.piece ? { ...targetSquareState.piece } : null;
        const originalTypeOfMovingPiece = movingPieceCopy.type; // Before potential promotion
        const originalLevelOfMovingPiece = Number(movingPieceCopy.level || 1);

        movingPieceCopy.hasMoved = true; // Most moves set this


        // Handle move types
        if (move.type === 'capture') {
            // Ensure target piece exists, is opponent, and not invulnerable
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy) || targetSquareState?.item) {
                // console.warn("AI makeMoveOptimized: Invalid capture attempt", move);
                return newState; // Invalid capture
            }
            pieceWasCaptured = true;
            newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            // Level up moving piece
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            const currentLevel = Number(movingPieceCopy.level || 1);
            let newCalculatedLevel = currentLevel + levelBonus;
            if (movingPieceCopy.type === 'queen') { // Queen level cap
                 newCalculatedLevel = Math.min(newCalculatedLevel, 7);
            }
            movingPieceCopy.level = newCalculatedLevel;


            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'move') {
            if (originalTargetPiece || targetSquareState?.item) { // Cannot move to occupied square or item square
                // console.warn("AI makeMoveOptimized: Invalid move to occupied/item square", move);
                return newState;
            }
            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'promotion') {
            if (targetSquareState?.item) { // Cannot promote onto an item
                return newState;
            }

            const originalPawnLevel = Number(movingPieceCopy.level || 1); // Level of the pawn before promoting
            let newPieceLevel = 1; // Promoted pieces start at L1

            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color && !this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) {
                 // Promotion with capture
                 pieceWasCaptured = true;
                 newState.capturedPieces[currentPlayer].push(originalTargetPiece);
                 const levelBonusPromo = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
                 newPieceLevel = 1 + levelBonusPromo; // L1 + capture bonus
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                // Cannot capture own piece during promotion
                return newState;
            }
            // Else: Promotion to empty square, newPieceLevel remains 1

            movingPieceCopy.type = move.promoteTo || 'queen'; // Default to queen if not specified
            movingPieceCopy.level = (movingPieceCopy.type === 'queen') ? Math.min(newPieceLevel, 7) : newPieceLevel; // Apply queen cap


            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'castle') {
            const isKingside = toCol > fromCol;
            const rookFromColCastle = isKingside ? 7 : 0;
            const rookToColCastle = isKingside ? toCol - 1 : toCol + 1; // rook moves next to king
            const rookSourceSquareState = newState.board[fromRow]?.[rookFromColCastle];
            const rook = rookSourceSquareState?.piece;
            if (!rook || rook.type !== 'rook' || rook.hasMoved || movingPieceCopy.hasMoved) {
                // console.warn("AI makeMoveOptimized: Invalid castle conditions", move);
                 return newState; // Invalid castle
            }

            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            if (newState.board[fromRow]?.[rookToColCastle]) {
                newState.board[fromRow][rookToColCastle].piece = { ...rook, hasMoved: true };
            }
            newState.board[fromRow][fromCol].piece = null; // King moves from original square
            if(newState.board[fromRow]?.[rookFromColCastle]) {
                newState.board[fromRow][rookFromColCastle].piece = null; // Rook moves from original square
            }
        } else if (move.type === 'self-destruct' && movingPieceCopy.type === 'knight' && (Number(movingPieceCopy.level || 1)) >= 5) {
            let destroyedCount = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = fromRow + dr, adjC = fromCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const victimSquareState = newState.board[adjR]?.[adjC];
                    const victim = victimSquareState?.piece;
                    if (victimSquareState?.item?.type === 'anvil') continue; // Cannot destroy anvil

                    if (victim && victim.color !== currentPlayer && victim.type !== 'king' && !this.isPieceInvulnerableToAttack(victim, movingPieceCopy)) {
                        newState.capturedPieces[currentPlayer].push({ ...victim });
                        if(victimSquareState) victimSquareState.piece = null;
                        destroyedCount++;
                    }
                }
            }
            newState.board[fromRow][fromCol].piece = null; // Knight self-destructs
            if (destroyedCount > 0) pieceWasCaptured = true; // Counts as capture for streaks
        } else if (move.type === 'swap') {
            const targetPieceForSwapSquareState = newState.board[toRow]?.[toCol];
            const targetPieceForSwap = targetPieceForSwapSquareState?.piece;
            if (targetPieceForSwapSquareState?.item) return newState; // Cannot swap with item
            const movingPieceLevelForSwap = Number(movingPieceCopy.level || 1);
            // Validate swap conditions (Knight L4+ with Bishop, Bishop L4+ with Knight, same color)
            if (!targetPieceForSwap || targetPieceForSwap.color !== movingPieceCopy.color ||
                !((movingPieceCopy.type === 'knight' && targetPieceForSwap.type === 'bishop' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4)) ||
                  (movingPieceCopy.type === 'bishop' && targetPieceForSwap.type === 'knight' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4))) ) {
                return newState;
            }
            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol].piece = { ...targetPieceForSwap, hasMoved: targetPieceForSwap.hasMoved || true }; // Target piece also 'moves'
        }

        // Post-move effects (commander, pawn push, bishop conversion, rook resurrection, queen sacrifice, king dominion)
        const pieceOnToSquare = newState.board[toRow]?.[toCol]?.piece;
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) { // Ensure the piece that moved is the one we're checking

            // Commander promotion on pawn captures commander
            if (pieceWasCaptured) {
                // If a PAWN captured a COMMANDER
                if (originalTypeOfMovingPiece === 'pawn' && originalTargetPiece && originalTargetPiece.type === 'commander') {
                    pieceOnToSquare.type = 'commander';
                    pieceOnToSquare.id = `${pieceOnToSquare.id}_CmdrByCapture_AI`;
                }

                // Commander Rallying Cry
                if (newState.killStreaks && !originalGameState.firstBloodAchieved) { // First Blood occurs now
                    newState.firstBloodAchieved = true;
                    newState.playerWhoGotFirstBlood = currentPlayer;
                }
                if (pieceOnToSquare.type === 'commander') {
                    // Level up other friendly pawns
                    newState.board.forEach(rowSquares => {
                        rowSquares.forEach(sqState => {
                            if (sqState.piece && sqState.piece.color === currentPlayer && sqState.piece.type === 'pawn' && sqState.piece.id !== pieceOnToSquare.id) {
                                let newPawnLevel = (sqState.piece.level || 1) + 1;
                                // Consider queen cap if this levels up a pawn to become a queen (though rally doesn't directly promote)
                                sqState.piece.level = newPawnLevel;
                            }
                        });
                    });
                }
            }


            // Pawn Push-Back
            const pieceOnToSquareActualLevel = Number(pieceOnToSquare.level || 1);
            if ((pieceOnToSquare.type === 'pawn' || pieceOnToSquare.type === 'commander') && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) && (move.type === 'move' || move.type === 'capture')) {
                const pushResult = this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
                if (pushResult.pieceCrushedByAnvil) {
                    // Note: This is a special kind of capture for streaks/scoring.
                    // It's not a direct capture by the pawn itself.
                    pieceCapturedByAnvil = true; // Special flag for streaks
                }
            }
            // Bishop Conversion
            if (pieceOnToSquare.type === 'bishop' && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 5) && (move.type === 'move' || move.type === 'capture')) {
                this.handleBishopConversion(newState, toRow, toCol, pieceOnToSquare.color);
            }
            // Rook Resurrection (if level increased to L4+)
            if (pieceOnToSquare.type === 'rook' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) &&
                pieceOnToSquareActualLevel > originalLevelOfMovingPiece // Only if level *increased* to L4+
            ) {
                this.handleResurrection(newState, currentPlayer);
            }

            // Queen L7 Pawn Sacrifice Check
            if (pieceOnToSquare.type === 'queen') {
                const queenCurrentLevelAI = Number(pieceOnToSquare.level || 1);
                let triggerAISacrifice = false;
                if (queenCurrentLevelAI === 7) {
                    // Did it *become* L7 this turn?
                    if (move.type === 'promotion' && move.promoteTo === 'queen') { // Promoted to L7 Queen
                        triggerAISacrifice = true;
                    } else if (move.type !== 'promotion' && originalTypeOfMovingPiece === 'queen' && originalLevelOfMovingPiece < 7) { // Leveled up to L7 Queen
                        triggerAISacrifice = true;
                    }
                }

                if (triggerAISacrifice) {
                    let pawnSacrificed = false;
                    for(let r_sac=0; r_sac<8; r_sac++) {
                        for(let c_sac=0; c_sac<8; c_sac++) {
                            const p_square_state = newState.board[r_sac]?.[c_sac];
                            const p = p_square_state?.piece;
                            if (p && (p.type === 'pawn' || p.type === 'commander') && p.color === currentPlayer) {
                                if(p_square_state) p_square_state.piece = null; // Sacrifice
                                const opponentColorForSac = currentPlayer === 'white' ? 'black' : 'white';
                                newState.capturedPieces[opponentColorForSac].push({...p, id: `${p.id}_sac_AI_${Date.now()}`}); // Add to opponent's captures
                                pawnSacrificed = true;
                                break;
                            }
                        }
                        if (pawnSacrificed) break;
                    }
                }
            }
            // King's Dominion (level reduction for opponent queens)
             if (pieceOnToSquare.type === 'king' && pieceOnToSquare.level > originalLevelOfMovingPiece) { // King leveled up
              const levelsGainedByKing = pieceOnToSquare.level - originalLevelOfMovingPiece;
              if (levelsGainedByKing > 0) {
                const kingColor = pieceOnToSquare.color;
                const opponentColorKing = kingColor === 'white' ? 'black' : 'white';
                for (let r_idx = 0; r_idx < 8; r_idx++) {
                  for (let c_idx = 0; c_idx < 8; c_idx++) {
                    const squareStateKing = newState.board[r_idx]?.[c_idx];
                    if (squareStateKing?.piece && squareStateKing.piece.type === 'queen' && squareStateKing.piece.color === opponentColorKing) {
                      squareStateKing.piece.level = Math.max(1, (squareStateKing.piece.level || 1) - levelsGainedByKing);
                    }
                  }
                }
              }
            }
        }

        // Update kill streaks and extra turn logic
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        if (pieceWasCaptured || pieceCapturedByAnvil) { // pieceCapturedByAnvil also counts for streak
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + (move.type === 'self-destruct' ? (newState.capturedPieces[currentPlayer].length - (originalGameState.capturedPieces[currentPlayer]?.length || 0)) : 1);
            newState.killStreaks[opponentColor] = 0; // Reset opponent's streak on capture
             if (newState.killStreaks[currentPlayer] === 3) { // Streak of 3: Resurrection
                 this.handleResurrection(newState, currentPlayer);
            }
            // Extra turn conditions: Streak of 6 OR L5+ pawn promotion
            const pawnLevelForExtraTurn = Number(movingPieceCopy.level || 1); // Use level of the pawn *before* promotion
            if (newState.killStreaks[currentPlayer] === 6 || (move.type === 'promotion' && (originalTypeOfMovingPiece === 'pawn' || originalTypeOfMovingPiece === 'commander') && pawnLevelForExtraTurn >= 5) ) newState.extraTurn = true;
        } else { // No capture, reset current player's streak
            newState.killStreaks[currentPlayer] = 0;
        }

        // Handle AI's Commander Promotion post First Blood
        if (newState.firstBloodAchieved && newState.playerWhoGotFirstBlood === currentPlayer && !newState.board.flat().some(sq => sq.piece?.type === 'commander' && sq.piece.color === currentPlayer)) {
            // Check if the piece that just moved *became* the commander (e.g. pawn capturing commander)
            const pieceThatMovedIsNowCommander = newState.board[toRow]?.[toCol]?.piece?.type === 'commander';
            if (!pieceThatMovedIsNowCommander) { // If not, AI needs to select a pawn
                const commanderPawnCoords = this.selectPawnForCommanderPromotion(newState);
                if (commanderPawnCoords) {
                    const [pawnR, pawnC] = commanderPawnCoords;
                    const pawnToPromoteSquare = newState.board[pawnR]?.[pawnC];
                    if (pawnToPromoteSquare?.piece && pawnToPromoteSquare.piece.type === 'pawn' && pawnToPromoteSquare.piece.level === 1) {
                        pawnToPromoteSquare.piece.type = 'commander';
                        pawnToPromoteSquare.piece.id = `${pawnToPromoteSquare.piece.id}_CMD_AI`;
                    }
                }
            }
        }


        // Anvil Spawning
        if (newState.gameMoveCounter > 0 && newState.gameMoveCounter % 9 === 0) {
            const emptySquaresForAnvil: [number, number][] = [];
            for (let r_anvil = 0; r_anvil < 8; r_anvil++) {
                for (let c_anvil = 0; c_anvil < 8; c_anvil++) {
                    if (!newState.board[r_anvil][r_anvil].piece && !newState.board[r_anvil][c_anvil].item) {
                        emptySquaresForAnvil.push([r_anvil, c_anvil]);
                    }
                }
            }
            if (emptySquaresForAnvil.length > 0) {
                const [anvilR, anvilC] = emptySquaresForAnvil[Math.floor(Math.random() * emptySquaresForAnvil.length)];
                newState.board[anvilR][anvilC].item = { type: 'anvil' };
            }
        }


        // Finalize current player for next turn and check for auto-checkmate on extra turn
        if (!newState.extraTurn) {
            newState.currentPlayer = opponentColor;
        } else {
            newState.currentPlayer = currentPlayer; // AI keeps the turn
            // Check for auto-checkmate if AI got an extra turn and delivered check
            if (this.isInCheck(newState, opponentColor)) { // Opponent is now in check
                const opponentMoves = this.generateAllMoves(newState, opponentColor);
                if (opponentMoves.length === 0) { // Opponent has no legal moves
                    newState.gameOver = true;
                    newState.winner = currentPlayer;
                    newState.autoCheckmate = true; // Mark as auto-checkmate
                }
            }
        }
        return newState;
    }

    // Helper function to handle pawn push-back logic
    handlePawnPushBack(newState: AIGameState, pawnRow: number, pawnCol: number, pawnColor: PlayerColor): { pieceCrushedByAnvil: boolean } {
        let pieceCrushed = false;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = pawnRow + dr;
                const adjC = pawnCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const adjSquareState = newState.board[adjR]?.[adjC];
                    if (!adjSquareState) continue;
                    const entityToPush = adjSquareState.piece || adjSquareState.item;
                    const isEntityAnvil = adjSquareState.item?.type === 'anvil';

                    if (entityToPush && (isEntityAnvil || (adjSquareState.piece && adjSquareState.piece!.color !== pawnColor))) {
                        const pushToR = adjR + dr;
                        const pushToC = adjC + dc;

                        if (isEntityAnvil) {
                            if (!this.isValidSquareAI(pushToR, pushToC)) { // Pushed off board
                                adjSquareState.item = null;
                            } else {
                                const destSquareStateAnvil = newState.board[pushToR][pushToC];
                                if (destSquareStateAnvil.item?.type === 'anvil') { /* Anvil cannot push anvil */ }
                                else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type !== 'king') {
                                    // Anvil captures piece
                                    newState.capturedPieces[pawnColor].push({...destSquareStateAnvil.piece, id: `${destSquareStateAnvil.piece.id}_anvilcrush_${Date.now()}`}); // Track anvil capture
                                    destSquareStateAnvil.piece = null;
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                    pieceCrushed = true;
                                } else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type === 'king') { /* Anvil cannot capture king */ }
                                else { // Anvil moves to empty square
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                }
                            }
                        } else { // Pushing a piece
                            if (this.isValidSquareAI(pushToR, pushToC)) {
                                const destSquareStatePiece = newState.board[pushToR][pushToC];
                                if (!destSquareStatePiece.piece && !destSquareStatePiece.item) { // Can only push to empty square
                                    destSquareStatePiece.piece = { ...adjSquareState.piece! };
                                    adjSquareState.piece = null;
                                }
                            }
                        }
                    }
                }
            }
        }
        return { pieceCrushedByAnvil: pieceCrushed };
    }


    // Helper function to handle bishop conversion
    handleBishopConversion(newState: AIGameState, bishopRow: number, bishopCol: number, bishopColor: PlayerColor) {
        const bishopSquareState = newState.board[bishopRow]?.[bishopCol];
        const bishop = bishopSquareState?.piece;
        if(!bishop || (bishop.type !== 'bishop' && bishop.type !== 'commander') || bishop.color !== bishopColor) return; // Commander doesn't convert

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = bishopRow + dr;
                const adjC = bishopCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const targetSquareState = newState.board[adjR]?.[adjC];
                    if (!targetSquareState || targetSquareState.item) continue; // Cannot convert on item square
                    const targetPiece = targetSquareState.piece;
                    if (targetPiece && targetPiece.color !== bishopColor && targetPiece.type !== 'king') { // Cannot convert kings
                         if (Math.random() < 0.5) { // 50% chance
                            targetSquareState.piece = { ...targetPiece, color: bishopColor, id: `conv_${targetPiece.id}_${Date.now()}` };
                         }
                    }
                }
            }
        }
    }

    // Placeholder for more complex bishop conversion logic if needed
    shouldConvertPiece(row: number, col: number): boolean {
        // Example: could depend on proximity to king, piece value, etc.
        return true; // For now, always attempt if conditions met
    }

    // Helper function to handle resurrection
    handleResurrection(newState: AIGameState, currentPlayer: PlayerColor) {
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        const piecesToChooseFrom = newState.capturedPieces?.[opponentColor] || [];
        if (piecesToChooseFrom.length === 0) return;

        const pieceToResurrect = this.chooseBestResurrectionPiece(piecesToChooseFrom);
        if (!pieceToResurrect) return;

        // Find empty squares, prefer player's own half, non-back-rank initially
        const emptySquares: [number, number][] = [];
        for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++){
            const currentSquareState = newState.board[r_idx]?.[c_idx];
            if(currentSquareState && !currentSquareState.piece && !currentSquareState.item ) emptySquares.push([r_idx,c_idx]);
        }

        if (emptySquares.length > 0) {
            // Prioritize squares on the player's side, not too close to the edge
            const backRank = currentPlayer === 'white' ? 7 : 0;
            let preferredResSquares = emptySquares.filter(([r_sq,c_sq]) => {
                 if (currentPlayer === 'white') return r_sq >= 4 && r_sq < 7; // Rows 4-6 for white
                 return r_sq <= 3 && r_sq > 0; // Rows 1-3 for black
            });
            if (preferredResSquares.length === 0) preferredResSquares = emptySquares; // Fallback to any empty square

            let resRow, resCol;
            if (preferredResSquares.length > 2) {
                // Simple heuristic: pick a square somewhat central on the player's side
                preferredResSquares.sort((a,b) => (Math.abs(a[1]-3.5) + Math.abs(a[0]-(currentPlayer === 'white' ? 6 : 1))) - (Math.abs(b[1]-3.5) + Math.abs(b[0]-(currentPlayer === 'white' ? 6 : 1))));
                 [resRow, resCol] = preferredResSquares[0];
            } else {
                 [resRow, resCol] = preferredResSquares[Math.floor(Math.random() * preferredResSquares.length)];
            }

            const resSquareState = newState.board[resRow]?.[resCol];
            if (resSquareState) {
                const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: (pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook') ? false : true, invulnerableTurnsRemaining: 0 };
                resSquareState.piece = resurrectedPiece;
                // Remove from captured list
                newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);

                // Handle immediate promotion if resurrected pawn lands on promotion rank
                const promotionRank = currentPlayer === 'white' ? 0 : 7;
                const resurrectedPieceOnBoardSquareState = newState.board[resRow]?.[resCol];
                if (resurrectedPieceOnBoardSquareState?.piece?.type === 'pawn' && resRow === promotionRank) {
                    resurrectedPieceOnBoardSquareState.piece.type = 'queen'; // Auto-promote to queen
                    resurrectedPieceOnBoardSquareState.piece.level = 1; // Resurrected promo starts L1
                    resurrectedPieceOnBoardSquareState.piece.id = `${resurrectedPiece.id}_resPromo_Q`;
                }
            }
        }
    }

    chooseBestResurrectionPiece(capturedPieces: Piece[]): Piece | null {
        if (!capturedPieces || capturedPieces.length === 0) return null;
        // Simple: resurrect the most valuable piece based on its base L1 value
        return [...capturedPieces].sort((a,b) => (this.pieceValues[b.type]?.[0] || 0) - (this.pieceValues[a.type]?.[0] || 0))[0];
    }


    evaluatePosition(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        if (!gameState || !gameState.board) return 0; // Should not happen if called correctly

        // Handle game over states with high scores
        if (this.isGameOver(gameState)) { // isGameOver should set gameState.winner
            if (gameState.winner === aiColor) return gameState.autoCheckmate ? 250000 : 200000; // Higher score for auto-checkmate
            if (gameState.winner === (aiColor === 'white' ? 'black' : 'white')) return gameState.autoCheckmate ? -250000 : -200000;
            return 0; // Draw
        }

        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor);
        score += this.evaluateKillStreaks(gameState, aiColor);
        score += this.evaluateSpecialAbilitiesAndLevels(gameState, aiColor);
        score += this.evaluateAnvils(gameState, aiColor); // Consider anvil positions
        if (gameState.extraTurn && gameState.currentPlayer === aiColor) score += 75; // Bonus for having an extra turn
        return score;
    }

    evaluateAnvils(gameState: AIGameState, aiColor: PlayerColor): number {
        let anvilScore = 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const aiKingPos = this.findKing(gameState, aiColor);
        const oppKingPos = this.findKing(gameState, opponentColor);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (square && square.item?.type === 'anvil') {
                    // Penalty if anvil is near AI's king
                    if (aiKingPos && Math.abs(r - aiKingPos.row) <= 2 && Math.abs(c - aiKingPos.col) <= 2) {
                        anvilScore += this.positionalBonuses.anvilMalus; // Negative bonus
                    }
                    // Bonus if anvil is near opponent's king
                    if (oppKingPos && Math.abs(r - oppKingPos.row) <= 2 && Math.abs(c - oppKingPos.col) <= 2) {
                        anvilScore -= this.positionalBonuses.anvilMalus; // Positive bonus (double negative)
                    }
                    // todo: consider anvils blocking key development squares or escape routes
                }
            }
        }
        return anvilScore;
    }


    isSquareImportantForAI(gameState: AIGameState, r: number, c: number, aiColor: PlayerColor): boolean {
        const squareState = gameState.board[r]?.[c];
        if (!squareState) return false;
        const piece = squareState.piece;
        if(piece && piece.color === aiColor) {
            // Pawns advancing or controlling center
            if((piece.type === 'pawn' || piece.type === 'commander') && ((aiColor === 'white' && r < 6) || (aiColor === 'black' && r > 1))) return true;
            // Knights/Bishops not yet moved from starting squares (early game)
            if((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) return true;
        }
        return false;
    }

    evaluateMaterial(gameState: AIGameState, aiColor: PlayerColor): number {
        let materialScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece) {
                    const currentPieceLevel = Number(piece.level || 1);
                    const pieceLevelValues = this.pieceValues[piece.type];
                    if (!pieceLevelValues) continue; // Should not happen with valid PieceType

                    // Queen level capped at 7 for value, other pieces use their actual level
                    const levelForEval = piece.type === 'queen' ? Math.min(currentPieceLevel, 7) : currentPieceLevel;
                    const effectiveLevelForArrayIndex = Math.max(1, levelForEval); // Ensure at least L1

                    // Get value, handling levels beyond defined array (e.g. pawns L10+)
                    const valueIndex = Math.min(effectiveLevelForArrayIndex - 1, pieceLevelValues.length - 1);
                    let value = pieceLevelValues[valueIndex] || 0;

                    // Extrapolate value for pieces leveled beyond defined max (except queen/king)
                    if ((piece.type !== 'queen' && piece.type !== 'king') && effectiveLevelForArrayIndex > pieceLevelValues.length) {
                        value = pieceLevelValues[pieceLevelValues.length - 1] + (effectiveLevelForArrayIndex - pieceLevelValues.length) * 20; // Example: +20 per extra level
                    }


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
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    const rcKey = `${r}${c}`; // 0-indexed key for sets
                    // Center control
                    if (this.centerSquares.has(rcKey)) {
                        positionalScore += this.positionalBonuses.center * multiplier;
                    } else if (this.nearCenterSquares.has(rcKey)) {
                        positionalScore += this.positionalBonuses.nearCenter * multiplier;
                    }
                    // Development of knights and bishops
                    if ((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) {
                        // Penalize if still on back rank after a few moves
                        if ((gameState.gameMoveCounter || 0) > 4 && ((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           positionalScore -= this.positionalBonuses.development * multiplier * 0.5; // Half penalty
                        } else if (!((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           // Bonus if developed off back rank (already handled by not being penalized)
                           positionalScore += this.positionalBonuses.development * multiplier;
                        }
                    }
                    // Pawn structure: advanced pawns, isolated/doubled pawns
                    if (piece.type === 'pawn' || piece.type === 'commander') {
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                        positionalScore += (6 - distanceToPromotion) * this.positionalBonuses.pawnStructure * multiplier; // Bonus for advancement

                        // Check for isolated/doubled pawns (simplified check)
                        let isIsolated = true;
                        let isDoubled = false;
                        // Check same file for doubled
                        for(let dr_pawn = -1; dr_pawn <=1; dr_pawn++){
                            if(dr_pawn === 0) continue;
                            if(this.isValidSquareAI(r+dr_pawn, c) && gameState.board[r+dr_pawn][c].piece?.type === piece.type && gameState.board[r+dr_pawn][c].piece?.color === piece.color) isDoubled = true;
                        }
                        // Check adjacent files for support (isolated)
                        for(let dc_pawn = -1; dc_pawn <=1; dc_pawn+=2){ // Check c-1 and c+1
                             for(let r_check_pawn = 0; r_check_pawn<8; r_check_pawn++){
                                if(this.isValidSquareAI(r_check_pawn, c+dc_pawn) && gameState.board[r_check_pawn][c+dc_pawn].piece?.type === piece.type && gameState.board[r_check_pawn][c+dc_pawn].piece?.color === piece.color){
                                    isIsolated = false; break;
                                }
                             }
                             if(!isIsolated) break;
                        }
                        if(isIsolated) positionalScore -= 3 * multiplier; // Small penalty for isolated
                        if(isDoubled) positionalScore -= 2 * multiplier; // Small penalty for doubled
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
            // Penalty if king is in check
            if (this.isInCheck(gameState, aiColor)) {
                safetyScore -= 200; // Significant penalty for being in check
            }
            // Pawn shield evaluation
            let pawnShields = 0;
            const shieldDeltas = aiColor === 'white' ? [[-1,-1],[-1,0],[-1,1]] : [[1,-1],[1,0],[1,1]]; // Pawns in front of king
            for(const [dr_s, dc_s] of shieldDeltas) {
                const shieldR = kingPos.row + dr_s;
                const shieldC = kingPos.col + dc_s;
                if (this.isValidSquareAI(shieldR, shieldC)) {
                    const shieldSquare = gameState.board[shieldR]?.[shieldC];
                    if (shieldSquare?.piece?.type === 'pawn' && shieldSquare.piece.color === aiColor) {
                        pawnShields++;
                    }
                }
            }
            if (pawnShields < 2) safetyScore -= (2-pawnShields) * this.positionalBonuses.kingSafety;

            // Number of direct threats (simplified: pieces that could attack if path was clear)
            safetyScore -= this.countDirectThreats(gameState, kingPos.row, kingPos.col, opponentColor) * 15;
        }

        // Consider opponent's king safety (bonus if opponent's king is less safe)
        const opponentKingPos = this.findKing(gameState, opponentColor);
        if (opponentKingPos) {
            if (this.isInCheck(gameState, opponentColor)) {
                safetyScore += 100; // Bonus if opponent is in check
            }
             safetyScore += this.countDirectThreats(gameState, opponentKingPos.row, opponentKingPos.col, aiColor) * 10; // Bonus for threatening opponent king
        }
        return safetyScore;
    }

    // Counts pieces that could attack a square if pieces in between were removed (simplified threat assessment)
    countDirectThreats(gameState: AIGameState, kingRow: number, kingCol: number, attackerColor: PlayerColor): number {
        let threats = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece && piece.color === attackerColor) {
                    // Check for queen/rook on same rank/file
                    if (piece.type === 'queen' || piece.type === 'rook') {
                        if (r === kingRow || c === kingCol) threats++;
                    }
                    // Check for queen/bishop on same diagonal
                    if (piece.type === 'queen' || piece.type === 'bishop') {
                        if (Math.abs(r - kingRow) === Math.abs(c - kingCol)) threats++;
                    }
                    // Check for knight attacks
                    if (piece.type === 'knight') {
                        if ((Math.abs(r - kingRow) === 2 && Math.abs(c - kingCol) === 1) || (Math.abs(r - kingRow) === 1 && Math.abs(c - kingCol) === 2)) threats++;
                    }
                }
            }
        }
        return threats;
    }

    evaluateKillStreaks(gameState: AIGameState, aiColor: PlayerColor): number {
        let streakScore = 0;
        const ks = gameState.killStreaks || {white:0, black:0}; // Default if undefined
        const aiPlayerStreak = ks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentPlayerStreak = ks[opponentColor] || 0;

        // Bonus for AI's streak
        if (aiPlayerStreak >= 2) streakScore += 10 * aiPlayerStreak;
        if (aiPlayerStreak === 3) streakScore += 50; // Resurrection bonus
        if (aiPlayerStreak >= 5) streakScore += 25; // General high streak bonus
        if (aiPlayerStreak === 6) streakScore += 150; // Extra turn bonus

        // Penalty for opponent's streak
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
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    const pieceActualLevel = Number(piece.level || 1);
                    if (typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel)) {
                        // General bonus for higher level pieces
                        abilitiesScore += (pieceActualLevel -1) * 15 * multiplier; // +15 per level above 1

                        // Specific ability bonuses
                        if (piece.type === 'queen' && pieceActualLevel === 7) { // L7 Queen invulnerability
                            abilitiesScore += 70 * multiplier;
                        }
                        if (piece.type === 'bishop' && pieceActualLevel >= 3){ // Pawn immunity
                            abilitiesScore += 25 * multiplier;
                        }
                         if (piece.type === 'pawn' || piece.type === 'commander') {
                            // Promotion potential bonus (already somewhat covered in positional)
                            const promotionRank = piece.color === 'white' ? 0 : 7;
                            const distanceToPromotion = Math.abs(r - promotionRank);
                             abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier; // Stronger bonus closer to promotion
                             if (pieceActualLevel >= 5) abilitiesScore += 30 * multiplier; // Extra turn on L5+ pawn promo
                         }
                         if (piece.type === 'commander') {
                            abilitiesScore += 40 * multiplier; // Bonus for having a commander
                         }
                         // Todo: Add bonuses for Knight L5 self-destruct potential, Bishop L5 conversion potential, etc.
                    }
                }
            }
        }
        return abilitiesScore;
    }


    // Simplified invulnerability check for AI (matches game logic)
    isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null): boolean {
        if (!targetPiece || !attackingPiece) return false;

        const targetActualLevel = Number(targetPiece.level || 1);
        const attackerActualLevel = Number(attackingPiece.level || 1);

        // Queen L7 Royal Guard
        if (targetPiece.type === 'queen' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 7 && (typeof attackerActualLevel !== 'number' || isNaN(attackerActualLevel) || attackerActualLevel < targetActualLevel)) {
            return true;
        }
        // Bishop L3+ Pawn Immunity
        if (targetPiece.type === 'bishop' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 3 && (attackingPiece.type === 'pawn' || attackingPiece.type === 'commander')) {
            return true;
        }
        // General invulnerability turns (e.g., from Rook ability)
        if (targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
            return true;
        }
        return false;
    }

    // Helper to find a piece by ID (if needed, though AI operates on board state)
    findPieceCoords(gameState: AIGameState, pieceId: string): {row: number, col: number} | null {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (gameState.board[r]?.[c]?.piece?.id === pieceId) {
                    return {row: r, col: c};
                }
            }
        }
        return null;
    }

    // Generates all pseudo-legal moves for a player
    generateAllMoves(originalGameState: AIGameState, color: PlayerColor): AIMove[] {
        const newBoardState: AIBoardState = [];
        if (originalGameState.board && Array.isArray(originalGameState.board)) {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardState[r_idx] = [];
                const originalRow = originalGameState.board[r_idx];
                if (originalRow && Array.isArray(originalRow)) {
                    for (let c_idx = 0; c_idx < 8; c_idx++) {
                        const originalSquare = originalRow[c_idx];
                        newBoardState[r_idx][c_idx] = {
                            piece: originalSquare?.piece ? { ...originalSquare.piece } : null,
                            item: originalSquare?.item ? { ...originalSquare.item } : null,
                        };
                    }
                } else {
                    newBoardState[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
                }
            }
        } else {
             for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardState[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
            }
        }

        const gameState: AIGameState = {
            ...originalGameState,
            board: newBoardState,
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
        };

        const allPossibleMoves: AIMove[] = [];
        if (!gameState || !gameState.board || !Array.isArray(gameState.board)) {
            // console.error("AI generateAllMoves: Invalid gameState.board");
            return [];
        }

        for (let r = 0; r < 8; r++) {
            const currentRow = gameState.board[r];
            if (!currentRow || !Array.isArray(currentRow)) {
                // console.warn(`AI generateAllMoves: Row ${r} is invalid.`);
                continue; // Skip malformed row
            }
            for (let c = 0; c < 8; c++) {
                const squareCell = currentRow[c];
                // if (!squareCell) {
                //     console.warn(`AI generateAllMoves: Square ${r},${c} is invalid.`);
                //     continue; // Skip malformed cell
                // }
                const piece = squareCell?.piece;

                if (piece && piece.color === color) {
                    try {
                        allPossibleMoves.push(...this.generatePieceMovesOptimized(gameState, r, c, piece));
                    } catch (e) {
                        // console.error(`AI Error generating moves for piece at ${r},${c}:`, e);
                    }
                }
            }
        }

        // Filter out moves that leave the king in check
        const localGameStateCopyForFilter: AIGameState = {
            ...originalGameState, // Use original state for consistent filtering context
            board: newBoardState, // Operate on the copied board for making moves
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
        };


        const legalMoves = allPossibleMoves.filter(move => {
            try {
                // Create a fresh deep copy for each move validation to avoid state pollution
                const tempStateValidationCopy: AIGameState = {
                    ...localGameStateCopyForFilter, // Base game state
                    board: localGameStateCopyForFilter.board.map(row => row.map(square => ({ // Deep copy board again
                        piece: square.piece ? { ...square.piece } : null,
                        item: square.item ? { ...square.item } : null,
                    }))),
                    capturedPieces: { // Deep copy other mutable parts
                        white: localGameStateCopyForFilter.capturedPieces?.white?.map(p => ({ ...p })) || [],
                        black: localGameStateCopyForFilter.capturedPieces?.black?.map(p => ({ ...p })) || [],
                    },
                    killStreaks: localGameStateCopyForFilter.killStreaks ? { ...localGameStateCopyForFilter.killStreaks } : { white: 0, black: 0 },
                    currentPlayer: color // Set current player for makeMoveOptimized context
                };
                const tempState = this.makeMoveOptimized(tempStateValidationCopy, move, color);
                return !this.isInCheck(tempState, color); // Check if the player *making* the move is in check
            } catch (e) {
                // console.error("AI Error during legal move filtering:", e, "Move:", move);
                return false; // Treat as illegal if error occurs
            }
        });
        return legalMoves;
    }


    // Generates pseudo-legal moves for a single piece
    generatePieceMovesOptimized(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        switch (piece.type) {
            case 'pawn':   this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'commander': this.addPawnMoves(moves, gameState, row, col, piece); break; // Commanders move like pawns
            case 'knight': this.addKnightMoves(moves, gameState, row, col, piece); break;
            case 'bishop': this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.bishop); break;
            case 'rook':   this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.rook);   break;
            case 'queen':  this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.queen);  break;
            case 'king':   this.addKingMoves(moves, gameState, row, col, piece);   break;
        }
        // Add special L4/L5 moves if applicable (self-destruct for Knight, swap for Knight/Bishop)
        this.addSpecialMoves(moves, gameState, row, col, piece);
        return moves;
    }

    addSpecialMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const pieceActualLevel = Number(piece.level || 1);
        // Knight L5 Self-Destruct
        if (piece.type === 'knight' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 5) {
            moves.push({ from: [r, c], to: [r, c], type: 'self-destruct' });
        }
        // Knight/Bishop L4 Swap
        if ((piece.type === 'knight' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4) ||
            (piece.type === 'bishop' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4)) {
            const targetType = piece.type === 'knight' ? 'bishop' : 'knight';
            for (let R_idx = 0; R_idx < 8; R_idx++) {
                for (let C_idx = 0; C_idx < 8; C_idx++) {
                    const targetSquare = gameState.board[R_idx]?.[C_idx];
                    if (targetSquare?.piece && targetSquare.piece.color === piece.color && targetSquare.piece.type === targetType && !targetSquare.item ) {
                        moves.push({ from: [r, c], to: [R_idx, C_idx], type: 'swap' });
                    }
                }
            }
        }
    }

    addPawnMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const dir = piece.color === 'white' ? -1 : 1; // White moves from high row to low, Black low to high
        const startRow = piece.color === 'white' ? 6 : 1;
        const promotionRank = piece.color === 'white' ? 0 : 7;
        const levelPawn = Number(piece.level || 1);
        const board = gameState.board;

        // Standard 1-square forward move
        const r_plus_dir = r + dir;
        if (this.isValidSquareAI(r_plus_dir, c)) {
            const forwardSquare = board[r_plus_dir][c];
            if (!forwardSquare.piece && !forwardSquare.item ) { // Must be empty
                if (r_plus_dir === promotionRank && piece.type !== 'commander') { // Pawns promote, Commanders don't
                    ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'promotion', promoteTo: pt as PieceType }));
                } else {
                    moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'move' });
                }
                // Double move from start
                if (r === startRow && !piece.hasMoved && this.isValidSquareAI(r + 2 * dir, c)) { // Piece hasn't moved
                    const intermediateSquare = board[r_plus_dir][c]; // Already checked this is empty
                    const doubleForwardSquare = board[r + 2 * dir][c];
                    if (!intermediateSquare.piece && !intermediateSquare.item && !doubleForwardSquare.piece && !doubleForwardSquare.item ) {
                        moves.push({ from: [r,c], to: [r + 2 * dir, c], type: 'move' });
                    }
                }
            }
        }

        // Diagonal captures
        [-1, 1].forEach(dc_val => {
            const capture_r = r + dir;
            const capture_c = c + dc_val;
            if (this.isValidSquareAI(capture_r, capture_c)) {
                const targetSquareState = board[capture_r][capture_c];
                if (targetSquareState.item) return; // Cannot capture item square

                const targetPiece = targetSquareState.piece;
                if (targetPiece && targetPiece.color !== piece.color && !this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                     if (capture_r === promotionRank && piece.type !== 'commander') {
                        ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'promotion', promoteTo: pt as PieceType }));
                     } else {
                        moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'capture' });
                     }
                }
                // En passant would be added here if implemented
            }
        });

        // L2+ Backward move
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 2) {
            const r_minus_dir = r-dir; // Opposite direction
            if (this.isValidSquareAI(r_minus_dir, c)) {
                const backwardSquare = board[r_minus_dir][c];
                if (!backwardSquare.piece && !backwardSquare.item ) {
                    moves.push({ from: [r,c], to: [r_minus_dir, c], type: 'move' });
                }
            }
        }
        // L3+ Sideways move
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 3) {
            [-1, 1].forEach(dc_side => {
                const side_c = c + dc_side;
                if (this.isValidSquareAI(r, side_c)) { // Same row, different col
                    const sideSquare = board[r][side_c];
                    if (!sideSquare.piece && !sideSquare.item ) {
                        moves.push({ from: [r,c], to: [r, side_c], type: 'move' });
                    }
                }
            });
        }
        // L4+ Push-Back is an effect of a move, not a move type itself.
        // It's handled in makeMoveOptimized.
    }


    addKnightMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = Number(piece.level || 1);
        const board = gameState.board;
        // Standard L-moves
        this.knightMoves.forEach(([dr, dc]) => {
            const R = r + dr; const C = c + dc;
            if (this.isValidSquareAI(R, C)) {
                const targetSquareState = board[R][C];
                if (!targetSquareState.item ) {
                    const target = targetSquareState.piece;
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            }
        });
        // L2+ Cardinal move (1 square)
        if (typeof level === 'number' && !isNaN(level) && level >= 2) {
            [[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquareAI(R, C)) {
                    const targetSquareState = board[R][C];
                    if (!targetSquareState.item ) {
                        const target = targetSquareState.piece;
                        if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                            moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                        }
                    }
                }
            });
        }
        // L3+ Cardinal jump (3 squares)
        if (typeof level === 'number' && !isNaN(level) && level >= 3) {
             [[ -3, 0 ], [ 3, 0 ], [ 0, -3 ], [ 0, 3 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquareAI(R, C)) {
                    const targetSquareState = board[R][C];
                    if (!targetSquareState.item ) { // Cannot jump to item square
                        const target = targetSquareState.piece;
                        // Check path for blocking pieces/items
                        const mid1R = r + Math.sign(dr); const mid1C = c + Math.sign(dc);
                        const mid2R = r + 2 * Math.sign(dr); const mid2C = c + 2 * Math.sign(dc);

                        let pathBlocked = false;
                        if (this.isValidSquareAI(mid1R, mid1C) && (board[mid1R][mid1C].piece || board[mid1R][mid1C].item )) pathBlocked = true;
                        if (!pathBlocked && this.isValidSquareAI(mid2R, mid2C) && (board[mid2R][mid2C].piece || board[mid2R][mid2C].item )) pathBlocked = true;

                        if (!pathBlocked && (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece)))) {
                            moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                        }
                    }
                }
            });
        }
        // L4+ Swap and L5+ Self-Destruct are handled in addSpecialMoves
    }

    addSlidingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece, directions: [number,number][]) {
        const pieceActualLevel = Number(piece.level || 1);
        const board = gameState.board;
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const R = r + i * dr; const C = c + i * dc;
                if (!this.isValidSquareAI(R, C)) break; // Off board
                const targetSquareState = board[R][C];
                if(targetSquareState.item) break; // Blocked by item

                const targetPiece = targetSquareState.piece;
                if (!targetPiece) { // Empty square
                     moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else { // Square occupied
                    if (targetPiece.color !== piece.color) { // Opponent piece
                        if (!this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                           moves.push({ from: [r,c], to: [R,C], type: 'capture' });
                        }
                    } else if (piece.type === 'bishop' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >=2 && targetPiece.color === piece.color){
                        // Bishop L2+ can jump friendly pieces, so continue scanning
                        continue;
                    }
                    // Any other piece (Rook, Queen, Bishop < L2, or Bishop L2+ encountering enemy) stops here
                    break;
                }
            }
        });
    }

    addKingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const kingActualLevel = Number(piece.level || 1);
        let maxDist = (typeof kingActualLevel === 'number' && !isNaN(kingActualLevel) && kingActualLevel >= 2) ? 2 : 1;
        const board = gameState.board;
        const opponentColor = piece.color === 'white' ? 'black' : 'white';

        // Standard King moves (1 or 2 squares)
        for (let dr_k = -maxDist; dr_k <= maxDist; dr_k++) {
            for (let dc_k = -maxDist; dc_k <= maxDist; dc_k++) {
                if (dr_k === 0 && dc_k === 0) continue; // Skip current square
                 // Must be straight or diagonal
                 if (!(dr_k === 0 || dc_k === 0 || Math.abs(dr_k) === Math.abs(dc_k))) {
                    continue;
                }

                const R_k = r + dr_k; const C_k = c + dc_k;
                if (this.isValidSquareAI(R_k, C_k)) {
                    const targetSquareKingState = board[R_k][C_k];
                    if (!targetSquareKingState.item ) { // Cannot move to item square
                        // Check intermediate square for 2-square moves
                        if (maxDist === 2 && (Math.abs(dr_k) === 2 || Math.abs(dc_k) === 2)) {
                            const midR_k = r + Math.sign(dr_k);
                            const midC_k = c + Math.sign(dc_k);
                            // Intermediate square must be empty and not attacked (for movement, not attack generation)
                            if (!this.isValidSquareAI(midR_k, midC_k) || board[midR_k][midC_k].piece || board[midR_k][midC_k].item ||
                                this.isSquareAttackedAI(gameState, midR_k, midC_k, opponentColor, true)) { // simplifyKingCheck = true for path safety
                                continue; // Path blocked or unsafe
                            }
                        }
                        const target_k = targetSquareKingState.piece;
                         if (!target_k || (target_k.color !== piece.color && !this.isPieceInvulnerableToAttack(target_k, piece))) {
                            moves.push({ from: [r,c], to: [R_k,C_k], type: target_k ? 'capture' : 'move' });
                        }
                    }
                }
            }
        }
        // L5+ Knight's Agility
        if (typeof kingActualLevel === 'number' && !isNaN(kingActualLevel) && kingActualLevel >= 5) {
            this.knightMoves.forEach(([dr_n,dc_n]) => {
                const R_n = r + dr_n; const C_n = c + dc_n;
                if (this.isValidSquareAI(R_n,C_n)){
                    const targetSquareKnightMoveState = board[R_n][C_n];
                    if (!targetSquareKnightMoveState.item ){ // Cannot move to item square
                        const target_n = targetSquareKnightMoveState.piece;
                        if (!target_n || (target_n.color !== piece.color && !this.isPieceInvulnerableToAttack(target_n, piece))) {
                             moves.push({ from: [r,c], to: [R_n,C_n], type: target_n ? 'capture' : 'move' });
                        }
                    }
                }
            });
        }

        // Castling
        if (!piece.hasMoved && !this.isInCheck(gameState, piece.color)) { // Cannot castle if king has moved or is in check
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

    // Quick check for move legality primarily used in generateAllMoves filter
    isLegalMoveQuick(originalGameState: AIGameState, move: AIMove, color: PlayerColor): boolean {
        // Create a robust deep copy for this check
        const tempBoardState: AIBoardState = [];
        if (originalGameState.board && Array.isArray(originalGameState.board)) {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                tempBoardState[r_idx] = [];
                const originalRow = originalGameState.board[r_idx];
                if (originalRow && Array.isArray(originalRow)) {
                    for (let c_idx = 0; c_idx < 8; c_idx++) {
                        const originalSquare = originalRow[c_idx];
                        tempBoardState[r_idx][c_idx] = {
                            piece: originalSquare?.piece ? { ...originalSquare.piece } : null,
                            item: originalSquare?.item ? { ...originalSquare.item } : null,
                        };
                    }
                } else {
                    tempBoardState[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
                }
            }
        } else {
             for (let r_idx = 0; r_idx < 8; r_idx++) {
                tempBoardState[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
            }
        }

        const tempStateForLegalityCheck: AIGameState = {
            ...originalGameState,
            board: tempBoardState,
             capturedPieces: { // Ensure deep copy for captured pieces
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 } // And kill streaks
        };

        const resultingState = this.makeMoveOptimized(tempStateForLegalityCheck, move, color);
        return !this.isInCheck(resultingState, color); // Is the player making the move in check *after* the move?
    }

    // Checks if a given color's king is in check
    isInCheck(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKing(gameState, color);
        if (!kingPos) return true; // No king means effectively in check (or game over)
        const opponentColorForCheck = color === 'white' ? 'black' : 'white';

        // Check if any opponent piece attacks the king's square
        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const attackerSquareState = gameState.board[r_att]?.[c_att];
                if (!attackerSquareState) continue;
                const attackerPiece = attackerSquareState.piece;
                if (attackerPiece && attackerPiece.color === opponentColorForCheck) {
                    if (this.canAttackSquare(gameState, [r_att,c_att], [kingPos.row, kingPos.col], attackerPiece)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Determines if the game is over (checkmate, stalemate, or other conditions)
    isGameOver(gameState: AIGameState): boolean {
        if(gameState.gameOver) return true; // If already marked as game over

        // Check for missing kings (shouldn't happen in normal play but good failsafe)
        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true;

        const playerToMove = gameState.currentPlayer;
        if (!playerToMove) {
            // console.warn("AI isGameOver: No current player defined in gameState.");
            return false; // Or handle as an error/specific state
        }

        const tempGameStateForMoveGen: AIGameState = {...gameState, currentPlayer: playerToMove}; // Ensure currentPlayer is set for generateAllMoves
        const legalMoves = this.generateAllMoves(tempGameStateForMoveGen, playerToMove);

        if (legalMoves.length === 0) {
            if (this.isInCheck(gameState, playerToMove)) {
                gameState.winner = playerToMove === 'white' ? 'black' : 'white'; // Checkmate
            } else {
                gameState.winner = 'draw'; // Stalemate
            }
            gameState.gameOver = true;
            return true;
        }
        // Add other draw conditions if necessary (e.g., threefold repetition, 50-move rule)
        return false;
    }

    // Checks if castling is legal
    canCastle(gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean {
        const kingSquareState = gameState.board[kingRow]?.[kingCol];
        if (!kingSquareState || !kingSquareState.piece || kingSquareState.piece.hasMoved) return false; // King has moved

        const rookCol = kingside ? 7 : 0;
        const rookSquareState = gameState.board[kingRow]?.[rookCol];
        if (!rookSquareState || !rookSquareState.piece || rookSquareState.piece.type !== 'rook' || rookSquareState.piece.hasMoved) return false; // Rook has moved or not a rook

        // Check path between king and rook
        const pathStartCol = kingside ? kingCol + 1 : rookCol + 1;
        const pathEndCol = kingside ? rookCol -1 : kingCol -1; // One square before rook / king

        for (let c_path = Math.min(pathStartCol, pathEndCol); c_path <= Math.max(pathStartCol, pathEndCol); c_path++) {
            if (gameState.board[kingRow]?.[c_path]?.piece || gameState.board[kingRow]?.[c_path]?.item ) return false; // Path blocked
        }

        // Check if king passes through or lands on attacked squares
        const opponentColorForCastle = color === 'white' ? 'black' : 'white';
        const squaresToCheck: [number, number][] = [[kingRow, kingCol]]; // King's current square
        if (kingside) {
            squaresToCheck.push([kingRow, kingCol + 1], [kingRow, kingCol + 2]);
        } else {
            squaresToCheck.push([kingRow, kingCol - 1], [kingRow, kingCol - 2]);
        }

        for (const [r_check, c_check] of squaresToCheck) {
             if (this.isSquareAttackedAI(gameState, r_check, c_check, opponentColorForCastle, true)) return false; // simplifyKingCheck=true as these are transit squares for king
        }
        return true;
    }

    // Checks if a square is attacked by the opponent
    isSquareAttackedAI(gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor, simplifyKingCheck: boolean = false): boolean{
        // const targetAlg = coordsToAlgebraic(r_target, c_target);
        // console.log(`AI IS SQUARE ATTACKED DEBUG: Target ${targetAlg} (${r_target},${c_target}), Attacker: ${attackerColor}, simplifyKingCheck: ${simplifyKingCheck}`);

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const squareState = gameState.board[r_att]?.[c_att];
                if(!squareState) continue;
                const piece = squareState.piece;
                if(piece && piece.color === attackerColor){
                    if (this.canAttackSquare(gameState, [r_att,c_att], [r_target, c_target], piece, simplifyKingCheck)) {
                        // console.log(`   AI IS SQUARE ATTACKED DEBUG: ${targetAlg} IS attacked by ${piece.color} ${piece.type} at ${coordsToAlgebraic(r_att,c_att)}`);
                        return true;
                    }
                }
            }
        }
        // console.log(`   AI IS SQUARE ATTACKED DEBUG: ${targetAlg} IS NOT attacked by ${attackerColor}`);
        return false;
    }

    // Checks if a piece from a 'from' square can attack a 'to' square
    canAttackSquare(gameState: AIGameState, from: [number, number], to: [number, number], piece: Piece, simplifyKingCheck: boolean = false): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = toRow - fromRow;
        const deltaCol = toCol - fromCol;

        const targetSquareState = gameState.board[toRow]?.[toCol];
        if (!targetSquareState) return false; // Should not happen with isValidSquareAI checks before calling

        const pieceOnAttackedSquare = targetSquareState.piece; // Can be null (attacking empty square) or a piece

        // Check invulnerability of the piece on the target square (if any)
        if (pieceOnAttackedSquare && this.isPieceInvulnerableToAttack(pieceOnAttackedSquare, piece)) {
            // console.log(`AI CAN ATTACK SQUARE DEBUG: For ${piece.color}${piece.type}@${coordsToAlgebraic(fromRow, fromCol)} to ${coordsToAlgebraic(toRow, toCol)}. Target ${pieceOnAttackedSquare.color}${pieceOnAttackedSquare.type} is invulnerable. Result: false`);
             return false;
        }

        let canAttackResult = false;
        const fromAlg = coordsToAlgebraic(fromRow, fromCol);
        const toAlg = coordsToAlgebraic(toRow, toCol);

        switch (piece.type) {
            case 'pawn':
            case 'commander':
                const direction = piece.color === 'white' ? -1 : 1;
                canAttackResult = deltaRow === direction && Math.abs(deltaCol) === 1 && !targetSquareState.item; // Pawns attack diagonally, cannot attack item squares
                break;
            case 'knight':
                const knightActualLevel = Number(piece.level || 1);
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) canAttackResult = !targetSquareState.item;
                else if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) canAttackResult = !targetSquareState.item; // L2 cardinal
                else if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) { // L3 cardinal jump
                    // Check path for L3 Knight jump
                    const stepR = Math.sign(deltaRow);
                    const stepC = Math.sign(deltaCol);
                    let pathBlocked = false;
                    if (this.isValidSquareAI(fromRow + stepR, fromCol + stepC) && (gameState.board[fromRow + stepR]?.[fromCol + stepC]?.piece || gameState.board[fromRow + stepR]?.[fromCol + stepC]?.item )) pathBlocked = true;
                    if (!pathBlocked && this.isValidSquareAI(fromRow + 2*stepR, fromCol + 2*stepC) && (gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.piece || gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.item )) pathBlocked = true;
                    canAttackResult = !pathBlocked && !targetSquareState.item;
                }
                break;
            case 'bishop':
                canAttackResult = Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
                break;
            case 'rook':
                canAttackResult = (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
                break;
            case 'queen':
                canAttackResult = (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
                break;
            case 'king':
                const kingActualLevelForAttack = Number(piece.level || 1);
                // Use effectiveMaxDist only for simplifyKingCheck=false.
                // When simplifyKingCheck=true, king only "attacks" 1 square away for path safety checks.
                let effectiveMaxDist = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 2 && !simplifyKingCheck) ? 2 : 1;
                let canUseKnightMove = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 5 && !simplifyKingCheck);

                if (Math.abs(deltaRow) <= effectiveMaxDist && Math.abs(deltaCol) <= effectiveMaxDist && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                    // For 2-square king attacks, check if intermediate square is empty (no piece, no item)
                    if (effectiveMaxDist === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2)) {
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquareAI(midR, midC) && (gameState.board[midR]?.[midC]?.piece || gameState.board[midR]?.[midC]?.item )) { canAttackResult = false; break; } // Path blocked by piece or item
                        // No need to check if intermediate is attacked for *attack generation*
                    }
                    canAttackResult = !targetSquareState.item; // Can attack if target has no item
                    break;
                }
                // L5+ King Knight move
                if (canUseKnightMove && ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) {
                    canAttackResult = !targetSquareState.item;
                }
                break;
            default:
                canAttackResult = false;
        }
        // console.log(`AI CAN ATTACK SQUARE DEBUG: For ${piece.color}${piece.type}@${fromAlg} to ${toAlg}. simplifyKingCheck: ${simplifyKingCheck}. Result: ${canAttackResult}`);
        return canAttackResult;
    }

    isPathClear(board: AIBoardState, from: [number, number], to: [number, number], piece: Piece): boolean {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = Math.sign(toRow - fromRow);
        const deltaCol = Math.sign(toCol - fromCol);

        let r_path = fromRow + deltaRow;
        let c_path = fromCol + deltaCol;

        const fromAlg = coordsToAlgebraic(fromRow, fromCol);
        const toAlg = coordsToAlgebraic(toRow, toCol);
        const isCheckingSpecificPath = false; // (fromAlg === 'g5' && toAlg === 'e7' && piece.type === 'queen');

        if (isCheckingSpecificPath) {
            // console.log(`AI PATH CLEAR (SPECIFIC): For ${piece.color}${piece.type}@${fromAlg} to ${toAlg}. Initial check.`);
        }

        while (r_path !== toRow || c_path !== toCol) { // Loop through intermediate squares
            if (!this.isValidSquareAI(r_path,c_path)) {
                if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): Invalid intermediate: ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`);
                return false; // Path goes off board
            }
            const pathSquareState = board[r_path]?.[c_path];
            if (!pathSquareState) { // Should not happen if board is well-formed
                if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): Undefined pathSquareState at ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`);
                return false;
            }

            if (pathSquareState.item) {
                if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): Item ${pathSquareState.item.type} at intermediate ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`);
                return false; // Blocked by an item
            }

            const pathPiece = pathSquareState.piece;
            if (pathPiece) {
                // Bishop L2+ can jump friendly pieces
                if (piece.type === 'bishop' && (Number(piece.level||1)) >= 2 && pathPiece.color === piece.color) {
                    // Friendly piece, Bishop L2+ can jump. Continue.
                    if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): Bishop L2+ jumping friendly ${pathPiece.type} at ${coordsToAlgebraic(r_path,c_path)}.`);
                } else {
                    // Any other piece (Rook, Queen, Bishop <L2, or Bishop L2+ encountering enemy) is blocked.
                    if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): PathPiece ${pathPiece.color}${pathPiece.type} at intermediate ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`);
                    return false;
                }
            } else {
                 if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): Intermediate ${coordsToAlgebraic(r_path,c_path)} is empty.`);
            }
            r_path += deltaRow;
            c_path += deltaCol;
        }

        if (isCheckingSpecificPath) console.log(`   AI PATH CLEAR (SPECIFIC): For ${piece.color}${piece.type}@${fromAlg} to ${toAlg}. Path Clear: true`);
        return true; // Path is clear if loop completes
    }

    // Finds the king of a given color
    findKing(gameState: AIGameState, color: PlayerColor): { row: number; col: number; piece: Piece } | null {
        if (!gameState || !gameState.board) return null;
        for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
                const squareState = gameState.board[r_idx]?.[c_idx];
                if (!squareState) continue;
                const piece = squareState.piece;
                // Ensure piece is not null before accessing its properties
                if (piece && piece.type === 'king' && piece.color === color) {
                    // In case of multiple kings (which shouldn't happen in standard chess),
                    // this returns the first one found. This matches chess-utils behavior.
                    return { row: r_idx, col: c_idx, piece: piece };
                }
            }
        }
        return null; // King not found
    }

    isValidSquareAI(row: number, col: number): boolean {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    countAdjacentEnemies(gameState: AIGameState, row: number, col: number, color: PlayerColor): number {
        let count = 0;
        for (let deltaRow = -1; deltaRow <= 1; deltaRow++) {
            for (let deltaCol = -1; deltaCol <= 1; deltaCol++) {
                if (deltaRow === 0 && deltaCol === 0) continue;
                const newRow = row + deltaRow;
                const newCol = col + deltaCol;
                if (this.isValidSquareAI(newRow, newCol)) {
                    const squareState = gameState.board[newRow]?.[newCol];
                    if (!squareState) continue;
                    const piece = squareState.piece;
                    if (piece && piece.color !== color && piece.type !== 'king') { // Don't count opponent's king as simple adjacent threat for this purpose
                        count++;
                    }
                }
            }
        }
        return count;
    }

    // Quick evaluation for move ordering
    quickEvaluateMove(gameState: AIGameState, move: AIMove, playerColor: PlayerColor): number {
        let score = 0;
        const [toR, toC] = move.to;
        const targetSquareState = gameState.board[toR]?.[toC]; // Target square of the move
        if (!targetSquareState || targetSquareState.item) return -Infinity; // Cannot move to item square

        const targetPiece = targetSquareState.piece; // Piece on the target square (if any)

        // Prefer captures of more valuable pieces
        if (targetPiece && targetPiece.color !== playerColor) { // Is it a capture?
            const targetLevel = Number(targetPiece.level || 1);
            const pieceLevelValues = this.pieceValues[targetPiece.type];
            if (pieceLevelValues) {
                const levelForEval = targetPiece.type === 'queen' ? Math.min(targetLevel, 7) : targetLevel;
                const effectiveLevelForArrayIndex = Math.max(1, levelForEval);
                const valueIndex = Math.min(effectiveLevelForArrayIndex - 1, pieceLevelValues.length - 1);
                let capturedValue = pieceLevelValues[valueIndex] || 0;
                 if ((targetPiece.type !== 'queen' && targetPiece.type !== 'king') && effectiveLevelForArrayIndex > pieceLevelValues.length) {
                    capturedValue = pieceLevelValues[pieceLevelValues.length - 1] + (effectiveLevelForArrayIndex - pieceLevelValues.length) * 20;
                }
                score += capturedValue * 10; // Multiply by 10 to give captures high priority
            }
        }

        // Prefer promotions to higher value pieces
        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0; // Value of L1 promoted piece
            score += promoValue;
        }
        // Prefer castling
        if (move.type === 'castle') {
            score += 25; // Small bonus for castling
        }
        // Prefer self-destruct if it captures something
        if (move.type === 'self-destruct') {
            const [fromR_sd, fromC_sd] = move.from;
            for (let dr_sd = -1; dr_sd <= 1; dr_sd++) {
                for (let dc_sd = -1; dc_sd <=1; dc_sd++) {
                    if (dr_sd ===0 && dc_sd ===0) continue;
                    const adjR_sd = fromR_sd + dr_sd;
                    const adjC_sd = fromC_sd + dc_sd;
                    if (this.isValidSquareAI(adjR_sd, adjC_sd)) {
                        const victimSq = gameState.board[adjR_sd][adjC_sd];
                        if (victimSq.piece && victimSq.piece.color !== playerColor && victimSq.piece.type !== 'king' && !victimSq.item) {
                             const victimLevel = Number(victimSq.piece.level || 1);
                             const pLv = this.pieceValues[victimSq.piece.type];
                             if (pLv) {
                                const lfe = victimSq.piece.type === 'queen' ? Math.min(victimLevel, 7) : victimLevel;
                                const elai = Math.max(1, lfe);
                                const vi = Math.min(elai -1, pLv.length -1);
                                let vVal = pLv[vi] || 0;
                                if((victimSq.piece.type !== 'queen' && victimSq.piece.type !== 'king') && elai > pLv.length){
                                    vVal = pLv[pLv.length-1] + (elai - pLv.length)*20;
                                }
                                score += vVal; // Add value of each piece destroyed
                             }
                        }
                    }
                }
            }
        }


        // Small bonus for moving towards center
        const rcKeyTo = `${toR}${toC}`;
        if (this.centerSquares.has(rcKeyTo)) {
            score += 5;
        } else if (this.nearCenterSquares.has(rcKeyTo)) {
            score += 2;
        }

        // Add a small random factor to break ties and encourage variety
        // score += Math.random() * 0.1;

        return score;
    }

    // Generates a unique key for the current game state for caching
    getPositionKey(gameState: AIGameState, isMaximizingPlayer: boolean): string {
        let key = '';
        for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
                const s_state = gameState.board[r_idx]?.[c_idx];
                if (s_state) {
                    const p_piece = s_state.piece;
                    const i_item = s_state.item;
                    if (p_piece) {
                        key += `${p_piece.color[0]}${p_piece.type[0]}${Number(p_piece.level || 1)}`;
                        if (p_piece.invulnerableTurnsRemaining && p_piece.invulnerableTurnsRemaining > 0) key += `i${p_piece.invulnerableTurnsRemaining}`;
                        if (p_piece.hasMoved) key += 'm';
                    } else if (i_item) {
                        key += `I${i_item.type[0]}`;
                    } else {
                        key += '--'; // Empty square
                    }
                } else {
                    key += 'XX'; // Should not happen with proper board initialization
                }
            }
        }
        key += `-${gameState.currentPlayer ? gameState.currentPlayer[0] : 'X'}`; // Current player
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`; // Is it AI's turn to maximize?
        key += `-w${gameState.killStreaks?.white || 0}b${gameState.killStreaks?.black || 0}`;
        key += `-g${gameState.gameMoveCounter || 0}`;
        key += `-fb${gameState.firstBloodAchieved ? 'T' : 'F'}${gameState.playerWhoGotFirstBlood ? gameState.playerWhoGotFirstBlood[0] : 'N'}`;
        // Consider castling rights if available in AIGameState
        return key;
    }

    // AI logic to select a pawn for Commander promotion
    selectPawnForCommanderPromotion(gameState: AIGameState): [number, number] | null {
        const availablePawns: {row: number, col: number, score: number}[] = [];
        const aiColor = gameState.currentPlayer; // The AI is the current player

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (square?.piece && square.piece.color === aiColor && square.piece.type === 'pawn' && square.piece.level === 1) {
                    // Score pawns: prefer central, more advanced pawns
                    let score = 0;
                    // Central pawns (c,d,e,f files)
                    if (c >=2 && c <= 5) score += 10;
                    // Advanced pawns
                    if (aiColor === 'white') { // White moves from high row (6) to low (0)
                        if (r === 5) score += 5; // On 3rd rank
                        if (r === 4) score += 8; // On 4th rank
                    } else { // Black moves from low row (1) to high (7)
                        if (r === 2) score += 5; // On 3rd rank
                        if (r === 3) score += 8; // On 4th rank
                    }
                    // Could add more heuristics (e.g., protected pawns)
                    availablePawns.push({row: r, col: c, score});
                }
            }
        }

        if (availablePawns.length === 0) return null;

        // Sort by score descending
        availablePawns.sort((a,b) => b.score - a.score);
        return [availablePawns[0].row, availablePawns[0].col]; // Pick the highest scored pawn
    }
}

