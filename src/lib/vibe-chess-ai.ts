
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
        this.maxSearchTime = 5000; 

        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260, 280, 300, 320, 340], 
            'knight': [320, 360, 400, 450, 500, 550, 580, 610, 640, 670],
            'bishop': [330, 370, 420, 470, 520, 570, 600, 630, 660, 690],
            'rook': [500, 520, 580, 620, 660, 700, 730, 760, 790, 820],
            'queen': [900, 920, 940, 960, 1200, 1250, 1350], 
            'king': [20000, 20000, 20000, 20000, 20000, 20000, 20000],
            'commander': [150, 180, 210, 250, 290, 330, 360, 390, 420, 450]
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1, 'commander': 1
        };

        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15,
            kingSafety: 25,
            pawnStructure: 8,
            anvilMalus: -15
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

    getBestMove(originalGameState: AIGameState, color: PlayerColor): AIMove | null {
      
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
                     localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
                }
            }
        } else { 
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
            }
        }
    
        const gameState: AIGameState = {
            ...originalGameState,
            board: localBoardCopy,
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 },
        };


        try {
            this.searchStartTime = Date.now();
            this.positionCache.clear();

            if (!gameState?.board || !color) {
                // console.warn("AI: getBestMove called with invalid gameState or color.", gameState, color);
                return null;
            }

            const legalMoves = this.generateAllMoves(gameState, color);

            if (legalMoves.length === 0) {
                // console.log(`AI: No legal moves found for ${color}.`);
                return null;
            }

            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color);
            
            if (!result.move && legalMoves.length > 0) {
                // console.warn("AI: Minimax returned null move, falling back to first legal move.");
                return legalMoves[0];
            }
            return result.move;

        } catch (error) {
            // console.error("AI: Error in getBestMove:", error);
            try {
                const fallbackGameState: AIGameState = { // Ensure gameState is well-defined for fallback
                    ...originalGameState,
                    board: localBoardCopy, // Use the copied board
                    capturedPieces: {
                        white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                        black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
                    },
                    killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
                };
                const fallbackMoves = this.generateAllMoves(fallbackGameState, color); 
                return fallbackMoves.length > 0 ? fallbackMoves[0] : null;
            } catch (fallbackError) {
                // console.error("AI: Error in fallback move generation:", fallbackError);
                return null;
            }
        }
    }

    minimax(gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null } {
        try {
             if (Date.now() - this.searchStartTime > this.maxSearchTime) {
                 // console.log(`AI: Max search time exceeded at depth ${depth}`);
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

            if (moves.length === 0) { // Stalemate or checkmate
                return {
                    score: this.evaluatePosition(gameState, aiColor), // Score from current player's perspective
                    move: null
                };
            }

            moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayerForNode) -
                                this.quickEvaluateMove(gameState, a, currentPlayerForNode));

            let bestMove : AIMove | null = moves[0];

            if (isMaximizingPlayer) {
                let maxEval = -Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    // Pass aiColor consistently for evaluation perspective
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, false, aiColor);

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
            } else { // Minimizing player (opponent)
                let minEval = Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    // Pass aiColor consistently for evaluation perspective
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, true, aiColor);

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
            // console.error("AI: Error in minimax:", error, "Depth:", depth, "Maximizing:", isMaximizingPlayer);
            return { score: isMaximizingPlayer ? -Infinity : Infinity, move: null };
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
            // This case should ideally not be hit if originalGameState is always valid
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardForOptimizedMove[r_idx] = [];
                for (let c_idx = 0; c_idx < 8; c_idx++) {
                     newBoardForOptimizedMove[r_idx][c_idx] = { piece: null, item: null };
                }
            }
        }
    
        // Deep copy other potentially mutable parts of gameState
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
            board: newBoardForOptimizedMove,
            currentPlayer: currentPlayer, // Set this initially, might change due to extraTurn
            extraTurn: false, // Reset before evaluating move
            gameMoveCounter: (baseStateCopy.gameMoveCounter || 0) + 1
        };

        // Ensure killStreaks and capturedPieces are initialized if they weren't in originalGameState
        if (!newState.killStreaks) newState.killStreaks = {white:0, black:0};
        if (!newState.capturedPieces) newState.capturedPieces = {white:[], black:[]};


        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;

        const movingPieceSourceSquare = newState.board[fromRow]?.[fromCol];
        if (!movingPieceSourceSquare || !movingPieceSourceSquare.piece) {
            // console.warn("AI: makeMoveOptimized - No piece to move from", move.from);
            return newState; // Return current state if no piece to move
        }
        const movingPieceCopy = { ...movingPieceSourceSquare.piece! }; // Assert piece is not null

        let pieceWasCaptured = false;
        let pieceCapturedByAnvil = false; // For anvil captures specifically

        const targetSquareState = newState.board[toRow]?.[toCol];
        const originalTargetPiece = targetSquareState?.piece ? { ...targetSquareState.piece } : null;
        const originalLevelOfMovingPiece = Number(movingPieceCopy.level || 1);

        movingPieceCopy.hasMoved = true;


        if (move.type === 'capture') {
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy) || targetSquareState?.item) {
                // console.warn("AI: makeMoveOptimized - Invalid capture attempt", move, originalTargetPiece, targetSquareState?.item);
                return newState; // Invalid capture
            }
            pieceWasCaptured = true;
            newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            const currentLevel = Number(movingPieceCopy.level || 1);
            let newCalculatedLevel = currentLevel + levelBonus;
            if (movingPieceCopy.type === 'queen') {
                 newCalculatedLevel = Math.min(newCalculatedLevel, 7); // Queen max level 7
            }
            movingPieceCopy.level = newCalculatedLevel;


            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'move') {
            if (originalTargetPiece || targetSquareState?.item) {
                // console.warn("AI: makeMoveOptimized - Invalid move to occupied/item square", move, originalTargetPiece, targetSquareState?.item);
                return newState;
            }
            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'promotion') {
            if (targetSquareState?.item) {
                // console.warn("AI: makeMoveOptimized - Invalid promotion to item square", move, targetSquareState?.item);
                return newState; 
            }

            const originalPawnLevel = Number(movingPieceCopy.level || 1);
            let newPieceLevel = 1; 

            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color && !this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) {
                 pieceWasCaptured = true;
                 newState.capturedPieces[currentPlayer].push(originalTargetPiece);
                 const levelBonusPromo = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
                 newPieceLevel = 1 + levelBonusPromo; 
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                // console.warn("AI: makeMoveOptimized - Invalid promotion capture of own piece", move);
                return newState; 
            }

            movingPieceCopy.type = move.promoteTo || 'queen';
            movingPieceCopy.level = (movingPieceCopy.type === 'queen') ? Math.min(newPieceLevel, 7) : newPieceLevel;


            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'castle') {
            const isKingside = toCol > fromCol;
            const rookFromColCastle = isKingside ? 7 : 0;
            const rookToColCastle = isKingside ? toCol - 1 : toCol + 1;
            const rookSourceSquareState = newState.board[fromRow]?.[rookFromColCastle];
            const rook = rookSourceSquareState?.piece;
            if (!rook || rook.type !== 'rook' || rook.hasMoved || movingPieceCopy.hasMoved) {
                 // console.warn("AI: makeMoveOptimized - Invalid castle conditions", move);
                 return newState;
            }
            
            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            if (newState.board[fromRow]?.[rookToColCastle]) {
                newState.board[fromRow][rookToColCastle].piece = { ...rook, hasMoved: true };
            }
            newState.board[fromRow][fromCol].piece = null;
            if(newState.board[fromRow]?.[rookFromColCastle]) {
                newState.board[fromRow][rookFromColCastle].piece = null;
            }
        } else if (move.type === 'self-destruct' && movingPieceCopy.type === 'knight' && (Number(movingPieceCopy.level || 1)) >= 5) {
            let destroyedCount = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = fromRow + dr, adjC = fromCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const victimSquareState = newState.board[adjR]?.[adjC];
                    const victim = victimSquareState?.piece;
                    if (victimSquareState?.item?.type === 'anvil') continue; 

                    if (victim && victim.color !== currentPlayer && victim.type !== 'king' && !this.isPieceInvulnerableToAttack(victim, movingPieceCopy)) {
                        newState.capturedPieces[currentPlayer].push({ ...victim });
                        if(victimSquareState) victimSquareState.piece = null;
                        destroyedCount++;
                    }
                }
            }
            newState.board[fromRow][fromCol].piece = null;
            if (destroyedCount > 0) pieceWasCaptured = true;
        } else if (move.type === 'swap') {
            const targetPieceForSwapSquareState = newState.board[toRow]?.[toCol];
            const targetPieceForSwap = targetPieceForSwapSquareState?.piece;
            if (targetPieceForSwapSquareState?.item) return newState; 
            const movingPieceLevelForSwap = Number(movingPieceCopy.level || 1);
            if (!targetPieceForSwap || targetPieceForSwap.color !== movingPieceCopy.color ||
                !((movingPieceCopy.type === 'knight' && targetPieceForSwap.type === 'bishop' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4)) ||
                  (movingPieceCopy.type === 'bishop' && targetPieceForSwap.type === 'knight' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4))) ) {
                // console.warn("AI: makeMoveOptimized - Invalid swap conditions", move);
                return newState;
            }
            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol].piece = { ...targetPieceForSwap, hasMoved: targetPieceForSwap.hasMoved || true };
        }

        const pieceOnToSquare = newState.board[toRow]?.[toCol]?.piece;
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) { 
            // Check if the piece that moved is now on the target square

            if (pieceWasCaptured) {
                if (newState.killStreaks && !originalGameState.firstBloodAchieved) {
                    newState.firstBloodAchieved = true;
                    newState.playerWhoGotFirstBlood = currentPlayer;
                    // AI handles commander promotion after this move sequence
                }
                if (pieceOnToSquare.type === 'commander') {
                    newState.board.forEach(rowSquares => {
                        rowSquares.forEach(sqState => {
                            if (sqState.piece && sqState.piece.color === currentPlayer && sqState.piece.type === 'pawn' && sqState.piece.id !== pieceOnToSquare.id) {
                                let newPawnLevel = (sqState.piece.level || 1) + 1;
                                // Commanders don't make other pawns into queens, so no queen cap here.
                                sqState.piece.level = newPawnLevel;
                            }
                        });
                    });
                }
            }


            const pieceOnToSquareActualLevel = Number(pieceOnToSquare.level || 1);
            if ((pieceOnToSquare.type === 'pawn' || pieceOnToSquare.type === 'commander') && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) && (move.type === 'move' || move.type === 'capture')) {
                const pushResult = this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
                if (pushResult.pieceCrushedByAnvil) {
                    // This event is for streak counting, not adding to capturedPieces array here.
                    pieceCapturedByAnvil = true; // Use this to adjust kill streaks later
                }
            }
            if (pieceOnToSquare.type === 'bishop' && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 5) && (move.type === 'move' || move.type === 'capture')) {
                this.handleBishopConversion(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'rook' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) &&
                pieceOnToSquareActualLevel > originalLevelOfMovingPiece // Only on level up to 4+
            ) {
                this.handleResurrection(newState, currentPlayer);
            }

            if (pieceOnToSquare.type === 'queen' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel === 7) && 
                (move.type === 'capture' || (move.type === 'promotion' && pieceWasCaptured)) // Sacrifice only if it *became* L7 via capture or promotion-capture
            ) {
                let pawnSacrificed = false;
                for(let r_sac=0; r_sac<8; r_sac++) {
                    for(let c_sac=0; c_sac<8; c_sac++) {
                        const p_square_state = newState.board[r_sac]?.[c_sac];
                        const p = p_square_state?.piece;
                        if (p && (p.type === 'pawn' || p.type === 'commander') && p.color === currentPlayer) {
                            if(p_square_state) p_square_state.piece = null;
                            const opponentColorForSac = currentPlayer === 'white' ? 'black' : 'white';
                            // Ensure unique ID for sacrificed pawn in AI simulation
                            newState.capturedPieces[opponentColorForSac].push({...p, id: `${p.id}_sac_AI_${Date.now()}`}); 
                            pawnSacrificed = true;
                            break;
                        }
                    }
                    if (pawnSacrificed) break;
                }
            }
             if (pieceOnToSquare.type === 'king' && pieceOnToSquare.level > originalLevelOfMovingPiece) {
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

        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        if (pieceWasCaptured || pieceCapturedByAnvil) { // Include anvil "captures" for streaks
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + (move.type === 'self-destruct' ? (newState.capturedPieces[currentPlayer].length - (originalGameState.capturedPieces[currentPlayer]?.length || 0)) : 1);
            newState.killStreaks[opponentColor] = 0;
             if (newState.killStreaks[currentPlayer] === 3) {
                 this.handleResurrection(newState, currentPlayer);
            }
            const pawnLevelForExtraTurn = Number(movingPieceCopy.level || 1);
            if (newState.killStreaks[currentPlayer] === 6 || (move.type === 'promotion' && pawnLevelForExtraTurn >= 5) ) newState.extraTurn = true;
        } else {
            newState.killStreaks[currentPlayer] = 0;
        }
        
        // First Blood Commander Promotion for AI
        if (newState.firstBloodAchieved && newState.playerWhoGotFirstBlood === currentPlayer && !newState.board.flat().some(sq => sq.piece?.type === 'commander' && sq.piece.color === currentPlayer)) {
            const commanderPawnCoords = this.selectPawnForCommanderPromotion(newState);
            if (commanderPawnCoords) {
                const [pawnR, pawnC] = commanderPawnCoords;
                const pawnToPromoteSquare = newState.board[pawnR]?.[pawnC];
                if (pawnToPromoteSquare?.piece && (pawnToPromoteSquare.piece.type === 'pawn' || pawnToPromoteSquare.piece.type === 'commander') && pawnToPromoteSquare.piece.level === 1) {
                    pawnToPromoteSquare.piece.type = 'commander';
                    pawnToPromoteSquare.piece.id = `${pawnToPromoteSquare.piece.id}_CMD_AI`;
                }
            }
        }


        // Anvil Spawning
        if (newState.gameMoveCounter > 0 && newState.gameMoveCounter % 9 === 0) {
            const emptySquaresForAnvil: [number, number][] = [];
            for (let r_anvil = 0; r_anvil < 8; r_anvil++) {
                for (let c_anvil = 0; c_anvil < 8; c_anvil++) {
                    if (!newState.board[r_anvil][c_anvil].piece && !newState.board[r_anvil][c_anvil].item) {
                        emptySquaresForAnvil.push([r_anvil, c_anvil]);
                    }
                }
            }
            if (emptySquaresForAnvil.length > 0) {
                const [anvilR, anvilC] = emptySquaresForAnvil[Math.floor(Math.random() * emptySquaresForAnvil.length)];
                newState.board[anvilR][anvilC].item = { type: 'anvil' };
            }
        }


        if (!newState.extraTurn) {
            newState.currentPlayer = opponentColor;
        } else {
            newState.currentPlayer = currentPlayer; // Current player gets another turn
             // Check if this extra turn results in auto-checkmate
            if (this.isInCheck(newState, opponentColor)) {
                const opponentMoves = this.generateAllMoves(newState, opponentColor);
                if (opponentMoves.length === 0) { // Opponent is checkmated
                    newState.gameOver = true;
                    newState.winner = currentPlayer;
                    newState.autoCheckmate = true; // Flag for evaluation
                }
            }
        }
        return newState;
    }

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
                            if (!this.isValidSquareAI(pushToR, pushToC)) { // Anvil pushed off board
                                adjSquareState.item = null;
                            } else {
                                const destSquareStateAnvil = newState.board[pushToR][pushToC];
                                if (destSquareStateAnvil.item?.type === 'anvil') { /* Can't push anvil into another anvil */ }
                                else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type !== 'king') {
                                    // Piece captured by anvil, don't add to capturedPieces array, it disappears
                                    destSquareStateAnvil.piece = null; 
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                    pieceCrushed = true;
                                } else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type === 'king') { /* Can't push anvil into King */ }
                                else { // Empty square
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                }
                            }
                        } else { // Pushing a piece
                            if (this.isValidSquareAI(pushToR, pushToC)) {
                                const destSquareStatePiece = newState.board[pushToR][pushToC];
                                if (!destSquareStatePiece.piece && !destSquareStatePiece.item) { // Must be empty
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


    handleBishopConversion(newState: AIGameState, bishopRow: number, bishopCol: number, bishopColor: PlayerColor) {
        const bishopSquareState = newState.board[bishopRow]?.[bishopCol];
        const bishop = bishopSquareState?.piece;
        if(!bishop || (bishop.type !== 'bishop' && bishop.type !== 'commander') || bishop.color !== bishopColor) return; // Commanders are pawns for movement

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = bishopRow + dr;
                const adjC = bishopCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const targetSquareState = newState.board[adjR]?.[adjC];
                    if (!targetSquareState || targetSquareState.item) continue; 
                    const targetPiece = targetSquareState.piece;
                    if (targetPiece && targetPiece.color !== bishopColor && targetPiece.type !== 'king') {
                         if (Math.random() < 0.5) { // 50% chance
                            targetSquareState.piece = { ...targetPiece, color: bishopColor, id: `conv_${targetPiece.id}_${Date.now()}` };
                         }
                    }
                }
            }
        }
    }

    shouldConvertPiece(row: number, col: number): boolean {
        // Simplified: AI considers conversion always possible if ability met.
        // Actual game might have 50% chance applied in applyMove.
        return true; 
    }

    handleResurrection(newState: AIGameState, currentPlayer: PlayerColor) {
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        const piecesToChooseFrom = newState.capturedPieces?.[opponentColor] || [];
        if (piecesToChooseFrom.length === 0) return;

        const pieceToResurrect = this.chooseBestResurrectionPiece(piecesToChooseFrom);
        if (!pieceToResurrect) return;

        const emptySquares: [number, number][] = [];
        for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++){
            const currentSquareState = newState.board[r_idx]?.[c_idx];
            if(currentSquareState && !currentSquareState.piece && !currentSquareState.item ) emptySquares.push([r_idx,c_idx]);
        }

        if (emptySquares.length > 0) {
            const backRank = currentPlayer === 'white' ? 7 : 0; // Resurrect to own back rank if possible
            let preferredResSquares = emptySquares.filter(([r_sq,c_sq]) => {
                 if (currentPlayer === 'white') return r_sq >= 4; // Prioritize own half
                 return r_sq <= 3;
            });
            if (preferredResSquares.length === 0) preferredResSquares = emptySquares; // Fallback to any empty

            let resRow, resCol;
            // Try to place near the center of the preferred squares or randomly if few options
            if (preferredResSquares.length > 2) {
                preferredResSquares.sort((a,b) => (Math.abs(a[1]-3.5) + Math.abs(a[0]-(currentPlayer === 'white' ? 6 : 1))) - (Math.abs(b[1]-3.5) + Math.abs(b[0]-(currentPlayer === 'white' ? 6 : 1))));
                 [resRow, resCol] = preferredResSquares[0];
            } else {
                 [resRow, resCol] = preferredResSquares[Math.floor(Math.random() * preferredResSquares.length)];
            }
            
            const resSquareState = newState.board[resRow]?.[resCol];
            if (resSquareState) { // Should always be true if emptySquares.length > 0
                const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: (pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook') ? false : true, invulnerableTurnsRemaining: 0 };
                resSquareState.piece = resurrectedPiece;

                newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);

                // Handle immediate promotion if resurrected pawn lands on promotion rank
                const promotionRank = currentPlayer === 'white' ? 0 : 7;
                const resurrectedPieceOnBoardSquareState = newState.board[resRow]?.[resCol];
                if (resurrectedPieceOnBoardSquareState?.piece?.type === 'pawn' && resRow === promotionRank) {
                    resurrectedPieceOnBoardSquareState.piece.type = 'queen'; // AI promotes to Queen
                    resurrectedPieceOnBoardSquareState.piece.level = 1; 
                    resurrectedPieceOnBoardSquareState.piece.id = `${resurrectedPiece.id}_resPromo_Q`;
                }
            }
        }
    }

    chooseBestResurrectionPiece(capturedPieces: Piece[]): Piece | null {
        if (!capturedPieces || capturedPieces.length === 0) return null;
        // Simple heuristic: resurrect highest base value piece
        return [...capturedPieces].sort((a,b) => (this.pieceValues[b.type]?.[0] || 0) - (this.pieceValues[a.type]?.[0] || 0))[0];
    }


    evaluatePosition(gameState: AIGameState, aiColor: PlayerColor): number {
        let score = 0;
        if (!gameState || !gameState.board) return 0;

        if (this.isGameOver(gameState)) {
            if (gameState.winner === aiColor) return gameState.autoCheckmate ? 250000 : 200000; // Higher score for auto-checkmate
            if (gameState.winner === (aiColor === 'white' ? 'black' : 'white')) return gameState.autoCheckmate ? -250000 : -200000;
            return 0; // Draw
        }

        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor);
        score += this.evaluateKillStreaks(gameState, aiColor);
        score += this.evaluateSpecialAbilitiesAndLevels(gameState, aiColor);
        score += this.evaluateAnvils(gameState, aiColor);
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
                        anvilScore += this.positionalBonuses.anvilMalus;
                    }
                    // Bonus if anvil is near opponent's king
                    if (oppKingPos && Math.abs(r - oppKingPos.row) <= 2 && Math.abs(c - oppKingPos.col) <= 2) {
                        anvilScore -= this.positionalBonuses.anvilMalus; // Becomes a positive score for AI
                    }
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
            if((piece.type === 'pawn' || piece.type === 'commander') && ((aiColor === 'white' && r < 6) || (aiColor === 'black' && r > 1))) return true; // Advancing pawns/commanders
            if((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) return true; // Undeveloped minor pieces
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
                    
                    // Queen max level is 7, others can go higher but values are capped for eval.
                    const levelForEval = piece.type === 'queen' ? Math.min(currentPieceLevel, 7) : currentPieceLevel;
                    const effectiveLevelForArrayIndex = Math.max(1, levelForEval); // Ensure level is at least 1 for array indexing
                    
                    const valueIndex = Math.min(effectiveLevelForArrayIndex - 1, pieceLevelValues.length - 1); // Clamp index
                    let value = pieceLevelValues[valueIndex] || 0; // Default to 0 if somehow undefined

                    // For non-queen/king pieces, extrapolate value if level exceeds defined values
                    if ((piece.type !== 'queen' && piece.type !== 'king') && effectiveLevelForArrayIndex > pieceLevelValues.length) {
                        // Add a small bonus for each level beyond the defined max for that piece type
                        value = pieceLevelValues[pieceLevelValues.length - 1] + (effectiveLevelForArrayIndex - pieceLevelValues.length) * 20; // e.g., +20 per extra level
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
                    const rcKey = `${r}${c}`;
                    if (this.centerSquares.has(rcKey)) {
                        positionalScore += this.positionalBonuses.center * multiplier;
                    } else if (this.nearCenterSquares.has(rcKey)) {
                        positionalScore += this.positionalBonuses.nearCenter * multiplier;
                    }
                    // Undeveloped minor pieces (Knights/Bishops)
                    if ((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) { 
                        // Penalty if still on back rank after a few moves (e.g., gameMoveCounter > 4)
                        if ((gameState.gameMoveCounter || 0) > 4 && ((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           positionalScore -= this.positionalBonuses.development * multiplier * 0.5; // Reduced penalty
                        } else if (!((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           positionalScore += this.positionalBonuses.development * multiplier; // Bonus if moved off back rank
                        }
                    }
                    // Pawn structure and advancement
                    if (piece.type === 'pawn' || piece.type === 'commander') {
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                        positionalScore += (6 - distanceToPromotion) * this.positionalBonuses.pawnStructure * multiplier; // Pawns are more valuable closer to promotion
                         // Check for isolated or doubled pawns (simplified)
                        let isIsolated = true;
                        let isDoubled = false;
                        for(let dr_pawn = -1; dr_pawn <=1; dr_pawn++){
                            if(dr_pawn === 0) continue;
                            if(this.isValidSquareAI(r+dr_pawn, c) && gameState.board[r+dr_pawn][c].piece?.type === piece.type && gameState.board[r+dr_pawn][c].piece?.color === piece.color) isDoubled = true;
                        }
                        for(let dc_pawn = -1; dc_pawn <=1; dc_pawn+=2){ // Check adjacent files
                             for(let r_check_pawn = 0; r_check_pawn<8; r_check_pawn++){
                                if(this.isValidSquareAI(r_check_pawn, c+dc_pawn) && gameState.board[r_check_pawn][c+dc_pawn].piece?.type === piece.type && gameState.board[r_check_pawn][c+dc_pawn].piece?.color === piece.color){
                                    isIsolated = false; break;
                                }
                             }
                             if(!isIsolated) break;
                        }
                        if(isIsolated) positionalScore -= 3 * multiplier;
                        if(isDoubled) positionalScore -= 2 * multiplier;
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
                safetyScore -= 200; // Heavy penalty for being in check
            }
            // Pawn shield evaluation
            let pawnShields = 0;
            const shieldDeltas = aiColor === 'white' ? [[-1,-1],[-1,0],[-1,1]] : [[1,-1],[1,0],[1,1]];
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
            // Penalize if king has fewer than 2 pawns directly in front or diagonally in front
            if (pawnShields < 2) safetyScore -= (2-pawnShields) * this.positionalBonuses.kingSafety;

            // Penalize for open files towards the king, or many enemy pieces nearby
            safetyScore -= this.countDirectThreats(gameState, kingPos.row, kingPos.col, opponentColor) * 15;
        }

        // Evaluate opponent's king safety (good for AI if opponent king is unsafe)
        const opponentKingPos = this.findKing(gameState, opponentColor);
        if (opponentKingPos) {
            if (this.isInCheck(gameState, opponentColor)) {
                safetyScore += 100; // Bonus for checking opponent
            }
             safetyScore += this.countDirectThreats(gameState, opponentKingPos.row, opponentKingPos.col, aiColor) * 10;
        }
        return safetyScore;
    }

    countDirectThreats(gameState: AIGameState, kingRow: number, kingCol: number, attackerColor: PlayerColor): number {
        let threats = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece && piece.color === attackerColor) {
                    // Check if this piece can attack the king's square
                    // This requires a simplified version of canAttackSquare that doesn't cause infinite recursion
                    // For now, let's count pieces in proximity or on attacking lines
                    if (piece.type === 'queen' || piece.type === 'rook') {
                        if (r === kingRow || c === kingCol) threats++;
                    }
                    if (piece.type === 'queen' || piece.type === 'bishop') {
                        if (Math.abs(r - kingRow) === Math.abs(c - kingCol)) threats++;
                    }
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
        const ks = gameState.killStreaks || {white:0, black:0};
        const aiPlayerStreak = ks[aiColor] || 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const opponentPlayerStreak = ks[opponentColor] || 0;

        if (aiPlayerStreak >= 2) streakScore += 10 * aiPlayerStreak;
        if (aiPlayerStreak === 3) streakScore += 50; // Resurrection is valuable
        if (aiPlayerStreak >= 5) streakScore += 25; // General high streak bonus
        if (aiPlayerStreak === 6) streakScore += 150; // Extra turn is very valuable

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
                        abilitiesScore += (pieceActualLevel -1) * 15 * multiplier; 

                        // Specific ability bonuses
                        if (piece.type === 'queen' && pieceActualLevel === 7) { // Max level for queen with special ability
                            abilitiesScore += 70 * multiplier; // Royal Guard
                        }
                        if (piece.type === 'bishop' && pieceActualLevel >= 3){ // Pawn Immunity
                            abilitiesScore += 25 * multiplier;
                        }
                         if (piece.type === 'pawn' || piece.type === 'commander') {
                            const promotionRank = piece.color === 'white' ? 0 : 7;
                            const distanceToPromotion = Math.abs(r - promotionRank);
                             abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier; // Bonus for pawn advancement
                             if (pieceActualLevel >= 5) abilitiesScore += 30 * multiplier; // Pawn promotion extra turn potential
                         }
                         if (piece.type === 'commander') {
                            abilitiesScore += 40 * multiplier; // Bonus for having a commander
                         }
                    }
                }
            }
        }
        return abilitiesScore;
    }


    isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null): boolean {
        if (!targetPiece || !attackingPiece) return false;

        const targetActualLevel = Number(targetPiece.level || 1);
        const attackerActualLevel = Number(attackingPiece.level || 1);

        if (targetPiece.type === 'queen' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 7 && (typeof attackerActualLevel !== 'number' || isNaN(attackerActualLevel) || attackerActualLevel < targetActualLevel)) {
            return true;
        }
        if (targetPiece.type === 'bishop' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 3 && (attackingPiece.type === 'pawn' || attackingPiece.type === 'commander')) { // Commanders are pawns for this
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
                if (gameState.board[r]?.[c]?.piece?.id === pieceId) {
                    return {row: r, col: c};
                }
            }
        }
        return null;
    }

    generateAllMoves(originalGameState: AIGameState, color: PlayerColor): AIMove[] {
        // Ensure we're working with a deep copy for move generation and temporary states
        const gameState: AIGameState = {
            ...originalGameState,
            board: originalGameState.board.map(row => row.map(square => ({
                piece: square.piece ? { ...square.piece } : null,
                item: square.item ? { ...square.item } : null,
            }))),
            capturedPieces: { // Deep copy captured pieces
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 } // Deep copy kill streaks
        };

        const allPossibleMoves: AIMove[] = [];
        if (!gameState || !gameState.board || !Array.isArray(gameState.board)) {
            // console.warn("AI: generateAllMoves called with invalid gameState.board");
            return [];
        }

        for (let r = 0; r < 8; r++) {
            const currentRow = gameState.board[r];
            if (!currentRow || !Array.isArray(currentRow)) {
                // console.warn(`AI: Row ${r} is invalid in generateAllMoves.`);
                continue;
            }
            for (let c = 0; c < 8; c++) {
                const squareCell = currentRow[c];
                const piece = squareCell?.piece; // piece can be null

                if (piece && piece.color === color) {
                    try {
                        allPossibleMoves.push(...this.generatePieceMovesOptimized(gameState, r, c, piece));
                    } catch (e) {
                        // console.error(`AI: Error generating moves for piece at ${r},${c}:`, e);
                    }
                }
            }
        }
        
        // Filter for legal moves
        const localGameStateCopyForFilter: AIGameState = { // Another deep copy for filtering
            ...originalGameState, 
            board: originalGameState.board.map(row => row.map(square => ({ 
                piece: square.piece ? { ...square.piece } : null,
                item: square.item ? { ...square.item } : null,
             }))),
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
        };


        const legalMoves = allPossibleMoves.filter(move => {
            try {
                // Create a fresh copy for each move validation to prevent state pollution
                const tempStateValidationCopy: AIGameState = {
                    ...localGameStateCopyForFilter,
                    board: localGameStateCopyForFilter.board.map(row => row.map(square => ({
                        piece: square.piece ? { ...square.piece } : null,
                        item: square.item ? { ...square.item } : null,
                    }))),
                    capturedPieces: {
                        white: localGameStateCopyForFilter.capturedPieces?.white?.map(p => ({ ...p })) || [],
                        black: localGameStateCopyForFilter.capturedPieces?.black?.map(p => ({ ...p })) || [],
                    },
                    killStreaks: localGameStateCopyForFilter.killStreaks ? { ...localGameStateCopyForFilter.killStreaks } : { white: 0, black: 0 },
                    currentPlayer: color // Ensure current player is set for makeMoveOptimized
                };
                const tempState = this.makeMoveOptimized(tempStateValidationCopy, move, color);
                return !this.isInCheck(tempState, color);
            } catch (e) {
                // console.error("AI: Error during legal move filtering for move:", move, e);
                return false;
            }
        });
        return legalMoves;
    }


    generatePieceMovesOptimized(gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] {
        const moves: AIMove[] = [];
        switch (piece.type) {
            case 'pawn':   this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'commander': this.addPawnMoves(moves, gameState, row, col, piece); break; // Commander moves like a pawn
            case 'knight': this.addKnightMoves(moves, gameState, row, col, piece); break;
            case 'bishop': this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.bishop); break;
            case 'rook':   this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.rook);   break;
            case 'queen':  this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.queen);  break;
            case 'king':   this.addKingMoves(moves, gameState, row, col, piece);   break;
        }
        this.addSpecialMoves(moves, gameState, row, col, piece); // For Knight/Bishop special moves
        return moves;
    }

    addSpecialMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const pieceActualLevel = Number(piece.level || 1);
        if (piece.type === 'knight' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 5) {
            moves.push({ from: [r, c], to: [r, c], type: 'self-destruct' });
        }
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
        const dir = piece.color === 'white' ? -1 : 1;
        const startRow = piece.color === 'white' ? 6 : 1;
        const promotionRank = piece.color === 'white' ? 0 : 7;
        const levelPawn = Number(piece.level || 1);
        const board = gameState.board;

        // Forward move
        const r_plus_dir = r + dir;
        if (this.isValidSquareAI(r_plus_dir, c)) {
            const forwardSquare = board[r_plus_dir][c];
            if (!forwardSquare.piece && !forwardSquare.item ) {
                if (r_plus_dir === promotionRank) {
                    ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'promotion', promoteTo: pt as PieceType }));
                } else {
                    moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'move' });
                }
                // Double forward move
                if (r === startRow && !piece.hasMoved && this.isValidSquareAI(r + 2 * dir, c)) {
                    const intermediateSquare = board[r_plus_dir][c]; // Already checked this one
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
                if (targetSquareState.item) return; // Cannot capture on a square with an item

                const targetPiece = targetSquareState.piece;
                if (targetPiece && targetPiece.color !== piece.color && !this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                     if (capture_r === promotionRank) {
                        ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'promotion', promoteTo: pt as PieceType }));
                     } else {
                        moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'capture' });
                     }
                }
            }
        });

        // Backward move (L2+)
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 2) {
            const r_minus_dir = r-dir;
            if (this.isValidSquareAI(r_minus_dir, c)) {
                const backwardSquare = board[r_minus_dir][c];
                if (!backwardSquare.piece && !backwardSquare.item ) {
                    moves.push({ from: [r,c], to: [r_minus_dir, c], type: 'move' });
                }
            }
        }
        // Sideways move (L3+)
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 3) {
            [-1, 1].forEach(dc_side => {
                const side_c = c + dc_side;
                if (this.isValidSquareAI(r, side_c)) {
                    const sideSquare = board[r][side_c];
                    if (!sideSquare.piece && !sideSquare.item ) {
                        moves.push({ from: [r,c], to: [r, side_c], type: 'move' });
                    }
                }
            });
        }
    }


    addKnightMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = Number(piece.level || 1);
        const board = gameState.board;
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
        if (typeof level === 'number' && !isNaN(level) && level >= 3) {
             [[ -3, 0 ], [ 3, 0 ], [ 0, -3 ], [ 0, 3 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquareAI(R, C)) {
                    const targetSquareState = board[R][C];
                    if (!targetSquareState.item ) {
                        const target = targetSquareState.piece;
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
    }

    addSlidingMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece, directions: [number,number][]) {
        const pieceActualLevel = Number(piece.level || 1);
        const board = gameState.board;
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const R = r + i * dr; const C = c + i * dc;
                if (!this.isValidSquareAI(R, C)) break;
                const targetSquareState = board[R][C];
                if(targetSquareState.item) break; 

                const targetPiece = targetSquareState.piece;
                if (!targetPiece) {
                     moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else {
                    if (targetPiece.color !== piece.color) {
                        if (!this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                           moves.push({ from: [r,c], to: [R,C], type: 'capture' });
                        }
                    } else if (piece.type === 'bishop' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >=2 && targetPiece.color === piece.color){
                        // Bishop L2+ can jump friendly pieces, so continue path
                        continue; 
                    }
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

        for (let dr_k = -maxDist; dr_k <= maxDist; dr_k++) {
            for (let dc_k = -maxDist; dc_k <= maxDist; dc_k++) {
                if (dr_k === 0 && dc_k === 0) continue;
                 if (!(dr_k === 0 || dc_k === 0 || Math.abs(dr_k) === Math.abs(dc_k))) {
                    continue;
                }

                const R_k = r + dr_k; const C_k = c + dc_k;
                if (this.isValidSquareAI(R_k, C_k)) {
                    const targetSquareKingState = board[R_k][C_k];
                    if (!targetSquareKingState.item ) {
                        if (maxDist === 2 && (Math.abs(dr_k) === 2 || Math.abs(dc_k) === 2)) {
                            const midR_k = r + Math.sign(dr_k);
                            const midC_k = c + Math.sign(dc_k);
                            if (!this.isValidSquareAI(midR_k, midC_k) || board[midR_k][midC_k].piece || board[midR_k][midC_k].item || 
                                this.isSquareAttackedAI(gameState, midR_k, midC_k, opponentColor, true)) { // Check if path is blocked or attacked
                                continue; 
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
        if (typeof kingActualLevel === 'number' && !isNaN(kingActualLevel) && kingActualLevel >= 5) {
            this.knightMoves.forEach(([dr_n,dc_n]) => {
                const R_n = r + dr_n; const C_n = c + dc_n;
                if (this.isValidSquareAI(R_n,C_n)){
                    const targetSquareKnightMoveState = board[R_n][C_n];
                    if (!targetSquareKnightMoveState.item ){
                        const target_n = targetSquareKnightMoveState.piece;
                        if (!target_n || (target_n.color !== piece.color && !this.isPieceInvulnerableToAttack(target_n, piece))) {
                             moves.push({ from: [r,c], to: [R_n,C_n], type: target_n ? 'capture' : 'move' });
                        }
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
        // This function is primarily for sorting, so a full makeMove might be too slow.
        // A simpler check could be to see if the 'to' square is valid for the piece type
        // without full check simulation. However, for accuracy, full check is better if perf allows.
        const tempStateForLegalityCheck: AIGameState = {
            ...gameState,
            board: gameState.board.map(row => row.map(square => ({
                piece: square.piece ? { ...square.piece } : null,
                item: square.item ? { ...square.item } : null,
            }))),
             capturedPieces: {
                white: gameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: gameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: gameState.killStreaks ? { ...gameState.killStreaks } : { white: 0, black: 0 }
        };
        const resultingState = this.makeMoveOptimized(tempStateForLegalityCheck, move, color); 
        return !this.isInCheck(resultingState, color);
    }

    isInCheck(gameState: AIGameState, color: PlayerColor): boolean {
        const kingPos = this.findKing(gameState, color);
        if (!kingPos) return true; // No king means king is captured, effectively in checkmate.
        const opponentColorForCheck = color === 'white' ? 'black' : 'white';

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

    isGameOver(gameState: AIGameState): boolean {
        if(gameState.gameOver) return true;

        const playerToMove = gameState.currentPlayer;
        if (!playerToMove) {
            // console.warn("AI: isGameOver - No current player defined.");
            return false; 
        }

        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true;

        // Temporarily set currentPlayer to the one whose turn it is for move generation
        const tempGameStateForMoveGen: AIGameState = {...gameState, currentPlayer: playerToMove};
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
        return false;
    }

    canCastle(gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean {
        const kingSquareState = gameState.board[kingRow]?.[kingCol];
        if (!kingSquareState || !kingSquareState.piece || kingSquareState.piece.hasMoved) return false;

        const rookCol = kingside ? 7 : 0;
        const rookSquareState = gameState.board[kingRow]?.[rookCol];
        if (!rookSquareState || !rookSquareState.piece || rookSquareState.piece.type !== 'rook' || rookSquareState.piece.hasMoved) return false;

        const pathStartCol = kingside ? kingCol + 1 : rookCol + 1;
        const pathEndCol = kingside ? rookCol -1 : kingCol -1; // Corrected: kingCol - 1 for queenside
        
        for (let c_path = Math.min(pathStartCol, pathEndCol); c_path <= Math.max(pathStartCol, pathEndCol); c_path++) {
            if (gameState.board[kingRow]?.[c_path]?.piece || gameState.board[kingRow]?.[c_path]?.item ) return false;
        }

        const opponentColorForCastle = color === 'white' ? 'black' : 'white';
        // Squares king passes through or lands on cannot be attacked
        const squaresToCheck: [number, number][] = [[kingRow, kingCol]]; // King's current square
        if (kingside) {
            squaresToCheck.push([kingRow, kingCol + 1], [kingRow, kingCol + 2]);
        } else { // Queenside
            squaresToCheck.push([kingRow, kingCol - 1], [kingRow, kingCol - 2]);
        }

        for (const [r_check, c_check] of squaresToCheck) {
             if (this.isSquareAttackedAI(gameState, r_check, c_check, opponentColorForCastle, true)) return false; // Simplify king check for castling path
        }
        return true;
    }

    // simplifyKingCheck: if true, king attack checks are simplified (e.g. no recursive check for king moving into check)
    isSquareAttackedAI(gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor, simplifyKingCheck: boolean = false): boolean{

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const squareState = gameState.board[r_att]?.[c_att];
                if(!squareState) continue;
                const piece = squareState.piece;
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

        const targetSquareState = gameState.board[toRow]?.[toCol]; // Target square for the attack
        if (!targetSquareState) return false; // Should not happen if 'to' is valid
        
        // Piece on the square being attacked. If null, it's an attack on an empty square.
        const pieceOnAttackedSquare = targetSquareState.piece; 


        // If the piece on the target square is invulnerable to this attacker
        if (pieceOnAttackedSquare && this.isPieceInvulnerableToAttack(pieceOnAttackedSquare, piece)) {
             return false;
        }

        switch (piece.type) {
            case 'pawn':
            case 'commander': // Commanders attack like pawns
                const direction = piece.color === 'white' ? -1 : 1;
                return deltaRow === direction && Math.abs(deltaCol) === 1 && !targetSquareState.item; // Can't attack square with item
            case 'knight':
                const knightActualLevel = Number(piece.level || 1);
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) return !targetSquareState.item;
                if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) return !targetSquareState.item;
                if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) {
                    const stepR = Math.sign(deltaRow);
                    const stepC = Math.sign(deltaCol);
                    // Check path for 3-square cardinal jump
                    if (this.isValidSquareAI(fromRow + stepR, fromCol + stepC) && (gameState.board[fromRow + stepR]?.[fromCol + stepC]?.piece || gameState.board[fromRow + stepR]?.[fromCol + stepC]?.item )) return false;
                    if (this.isValidSquareAI(fromRow + 2*stepR, fromCol + 2*stepC) && (gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.piece || gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.item )) return false;
                    return !targetSquareState.item;
                }
                return false;
            case 'bishop':
                return Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
            case 'rook':
                return (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
            case 'queen':
                return (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece) && !targetSquareState.item;
            case 'king':
                const kingActualLevelForAttack = Number(piece.level || 1);
                let effectiveMaxDist = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 2 && !simplifyKingCheck) ? 2 : 1;
                let canUseKnightMove = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 5 && !simplifyKingCheck);

                if (simplifyKingCheck) { // When checking if a square is attacked (e.g. for castling), simplify king's threat
                    effectiveMaxDist = 1;
                    canUseKnightMove = false;
                }

                if (Math.abs(deltaRow) <= effectiveMaxDist && Math.abs(deltaCol) <= effectiveMaxDist && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                    if (effectiveMaxDist === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2)) { // If it's a 2-square linear move
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquareAI(midR, midC) && (gameState.board[midR]?.[midC]?.piece || gameState.board[midR]?.[midC]?.item )) return false; // Path blocked
                        // When checking if king attacks a square, don't simplify its own movement path check regarding opponent attacks
                        if (!simplifyKingCheck && this.isSquareAttackedAI(gameState, midR, midC, piece.color === 'white' ? 'black' : 'white', true)) { 
                            return false; // Cannot move through an attacked square to attack
                        }
                    }
                    return !targetSquareState.item; // Can't attack square with item
                }

                if (canUseKnightMove && ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) {
                    return !targetSquareState.item; // Can't attack square with item
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

        let r_path = fromRow + deltaRow;
        let c_path = fromCol + deltaCol;

        while (r_path !== toRow || c_path !== toCol) {
            if (!this.isValidSquareAI(r_path,c_path)) return false; // Should not happen if 'to' is valid
            const pathSquareState = board[r_path]?.[c_path];
            if (!pathSquareState) return false; // Should not happen
            if (pathSquareState.item) return false; // Path blocked by item
            
            const pathPiece = pathSquareState.piece;
            if (pathPiece) {
                // Bishop L2+ can jump friendly pieces
                if (piece.type === 'bishop' && (Number(piece.level||1)) >= 2 && pathPiece.color === piece.color) {
                    // It's a friendly piece, Bishop can jump over it
                } else {
                    return false; // Path blocked by another piece (enemy or non-jumpable friendly)
                }
            }
            r_path += deltaRow;
            c_path += deltaCol;
        }
        return true;
    }

    findKing(gameState: AIGameState, color: PlayerColor): { row: number; col: number; piece: Piece } | null {
        if (!gameState || !gameState.board) return null;
        for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
                const squareState = gameState.board[r_idx]?.[c_idx];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece && piece.type === 'king' && piece.color === color) {
                    return { row: r_idx, col: c_idx, piece: piece };
                }
            }
        }
        return null;
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
        const targetSquareState = gameState.board[toR]?.[toC];
        if (!targetSquareState || targetSquareState.item) return -Infinity; // Avoid moves to item squares

        const targetPiece = targetSquareState.piece;

        if (targetPiece && targetPiece.color !== playerColor) {
            const targetLevel = Number(targetPiece.level || 1);
            // Use the same logic as evaluateMaterial for piece value
            const pieceLevelValues = this.pieceValues[targetPiece.type];
            const levelForEval = targetPiece.type === 'queen' ? Math.min(targetLevel, 7) : targetLevel;
            const effectiveLevelForArrayIndex = Math.max(1, levelForEval);
            const valueIndex = Math.min(effectiveLevelForArrayIndex - 1, pieceLevelValues.length - 1);
            let capturedValue = pieceLevelValues[valueIndex] || 0;
            if ((targetPiece.type !== 'queen' && targetPiece.type !== 'king') && effectiveLevelForArrayIndex > pieceLevelValues.length) {
                capturedValue = pieceLevelValues[pieceLevelValues.length - 1] + (effectiveLevelForArrayIndex - pieceLevelValues.length) * 20;
            }
            score += capturedValue * 10; // Prioritize captures heavily
        }

        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0;
            score += promoValue; // Add value of promoted piece
        }
        if (move.type === 'castle') {
            score += 25; // Castling is generally good
        }
        if (move.type === 'self-destruct') {
            // Estimate value of destroyed pieces
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
                             const lfe = victimSq.piece.type === 'queen' ? Math.min(victimLevel, 7) : victimLevel;
                             const elai = Math.max(1, lfe);
                             const vi = Math.min(elai -1, pLv.length -1);
                             let vVal = pLv[vi] || 0;
                             if((victimSq.piece.type !== 'queen' && victimSq.piece.type !== 'king') && elai > pLv.length){
                                vVal = pLv[pLv.length-1] + (elai - pLv.length)*20;
                             }
                             score += vVal; // Don't multiply by 10, self-destruct is risky
                        }
                    }
                }
            }
        }


        // Positional bonus for moving to a better square
        const rcKeyTo = `${toR}${toC}`;
        if (this.centerSquares.has(rcKeyTo)) {
            score += 5;
        } else if (this.nearCenterSquares.has(rcKeyTo)) {
            score += 2;
        }
        
        // Check if move puts opponent in check (quick check, not full isInCheck)
        // This is complex to do "quickly". For now, prioritize captures and promotions.

        return score;
    }

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
                        key += '--';
                    }
                } else {
                    key += 'XX'; // Should not happen with proper board init
                }
            }
        }
        key += `-${gameState.currentPlayer ? gameState.currentPlayer[0] : 'X'}`; // Handle undefined currentPlayer
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`;
        key += `-w${gameState.killStreaks?.white || 0}b${gameState.killStreaks?.black || 0}`;
        key += `-g${gameState.gameMoveCounter || 0}`;
        key += `-fb${gameState.firstBloodAchieved ? 'T' : 'F'}${gameState.playerWhoGotFirstBlood ? gameState.playerWhoGotFirstBlood[0] : 'N'}`;
        // Add castling rights if available and relevant to your AI state
        return key;
    }

    selectPawnForCommanderPromotion(gameState: AIGameState): [number, number] | null {
        const availablePawns: {row: number, col: number, score: number}[] = [];
        const aiColor = gameState.currentPlayer;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (square?.piece && square.piece.color === aiColor && square.piece.type === 'pawn' && square.piece.level === 1) {
                    let score = 0;
                    // Prefer central pawns
                    if (c >=2 && c <= 5) score += 10;
                    // Prefer pawns closer to opponent's side but not too far
                    if (aiColor === 'white') {
                        if (r === 5) score += 5; // 3rd rank
                        if (r === 4) score += 8; // 4th rank
                    } else { // black
                        if (r === 2) score += 5; // 3rd rank
                        if (r === 3) score += 8; // 4th rank
                    }
                    availablePawns.push({row: r, col: c, score});
                }
            }
        }

        if (availablePawns.length === 0) return null;

        availablePawns.sort((a,b) => b.score - a.score); // Sort by score descending
        return [availablePawns[0].row, availablePawns[0].col];
    }
}
