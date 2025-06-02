
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState } from '@/types';
import { coordsToAlgebraic } from '@/lib/chess-utils';

/**
 * VIBE Chess AI - Complete Implementation
 * Handles all VIBE Chess mechanics including leveling, special abilities, and complex move generation
 */
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


    constructor(depth = 3) { // Default depth
        this.maxDepth = depth;
        this.positionCache = new Map();
        this.maxCacheSize = 10000;
        this.searchStartTime = 0;
        this.maxSearchTime = 5000; // 5 seconds

        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260],
            'knight': [320, 360, 400, 450, 500, 550],
            'bishop': [330, 370, 420, 470, 520, 570],
            'rook': [500, 520, 580, 620, 660, 700],
            'queen': [900, 920, 940, 960, 1200, 1250],
            'king': [20000, 20000, 20000, 20000, 20000, 20000]
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1
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
    getBestMove(originalGameState: AIGameState, color: PlayerColor): AIMove | null {
        try {
            // Create a pristine, local copy of the board for this call
            const localBoardCopy: AIBoardState = [];
            if (originalGameState.board && Array.isArray(originalGameState.board)) {
                for (let r_idx = 0; r_idx < 8; r_idx++) {
                    localBoardCopy[r_idx] = [];
                    const originalRow = originalGameState.board[r_idx];
                    if (originalRow && Array.isArray(originalRow)) {
                        for (let c_idx = 0; c_idx < 8; c_idx++) {
                            const originalSquare = originalRow[c_idx];
                            localBoardCopy[r_idx][c_idx] = {
                                piece: originalSquare?.piece ? { ...originalSquare.piece } : null
                            };
                        }
                    } else { // Fallback for malformed row
                         localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
                    }
                }
            } else {
                 // Fallback: create empty board if originalGameState.board is malformed
                for (let r_idx = 0; r_idx < 8; r_idx++) {
                    localBoardCopy[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
                }
            }

            // Use this local copy for all operations within getBestMove and its callees
            const gameState: AIGameState = {
                ...originalGameState, // Copy other properties
                board: localBoardCopy   // Use the freshly copied board
            };

            this.searchStartTime = Date.now();
            this.positionCache.clear();

            if (!gameState.board || !color) {
                return null;
            }

            const legalMoves = this.generateAllMoves(gameState, color);

            if (legalMoves.length === 0) {
                return null;
            }

            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color);

            return result.move || legalMoves[0];

        } catch (error) {
            console.error("AI: Error in getBestMove:", error);
            // Attempt to generate moves with original state as a last resort if local copy fails
            try {
                const fallbackMoves = this.generateAllMoves(originalGameState, color);
                return fallbackMoves.length > 0 ? fallbackMoves[0] : null;
            } catch (fallbackError) {
                console.error("AI: Error in fallback move generation:", fallbackError);
                return null;
            }
        }
    }

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

            moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayerForNode) -
                                this.quickEvaluateMove(gameState, a, currentPlayerForNode));

            let bestMove : AIMove | null = moves[0];

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
            } else {
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
            return { score: isMaximizingPlayer ? -Infinity : Infinity, move: null };
        }
    }

    makeMoveOptimized(gameState: AIGameState, move: AIMove, currentPlayer: PlayerColor): AIGameState {
        const newBoardForOptimizedMove: AIBoardState = [];
        if (gameState.board && Array.isArray(gameState.board)) {
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardForOptimizedMove[r_idx] = [];
                const originalRow = gameState.board[r_idx];
                if (originalRow && Array.isArray(originalRow)) {
                    for (let c_idx = 0; c_idx < 8; c_idx++) {
                        const originalSquare = originalRow[c_idx];
                        newBoardForOptimizedMove[r_idx][c_idx] = {
                            piece: originalSquare?.piece ? { ...originalSquare.piece } : null
                        };
                    }
                } else {
                     newBoardForOptimizedMove[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
                }
            }
        } else { 
            for (let r_idx = 0; r_idx < 8; r_idx++) {
                newBoardForOptimizedMove[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
            }
        }
    
        const baseStateCopy: Partial<AIGameState> = {
            ...gameState, // Spread first to copy all existing properties
            killStreaks: gameState.killStreaks ? { ...gameState.killStreaks } : { white: 0, black: 0 },
            capturedPieces: {
                white: gameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: gameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            }
        };
        delete baseStateCopy.board; // Remove the old board reference
    
        const newState: AIGameState = {
            ...(baseStateCopy as Omit<AIGameState, 'board' | 'currentPlayer' | 'extraTurn' | 'gameMoveCounter'>),
            board: newBoardForOptimizedMove,
            currentPlayer: currentPlayer, 
            extraTurn: false, 
            gameMoveCounter: (gameState.gameMoveCounter || 0) + 1
        };


        if (!newState.killStreaks) newState.killStreaks = {white:0, black:0};
        if (!newState.capturedPieces) newState.capturedPieces = {white:[], black:[]};

        const [fromRow, fromCol] = move.from;
        const [toRow, toCol] = move.to;

        const movingPieceSourceSquare = newState.board[fromRow]?.[fromCol];
        if (!movingPieceSourceSquare || !movingPieceSourceSquare.piece) {
            return newState;
        }
        const movingPieceCopy = { ...movingPieceSourceSquare.piece! };

        let pieceWasCaptured = false;
        const targetSquareState = newState.board[toRow]?.[toCol];
        const originalTargetPiece = targetSquareState?.piece ? { ...targetSquareState.piece } : null;
        const originalLevelOfMovingPiece = Number(movingPieceCopy.level || 1);

        movingPieceCopy.hasMoved = true;


        if (move.type === 'capture') {
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) {
                return newState;
            }
            pieceWasCaptured = true;
            newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            movingPieceCopy.level = Math.min(6, (Number(movingPieceCopy.level || 1)) + levelBonus);

            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'move') {
            if (originalTargetPiece) return newState;
            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'promotion') {
            const originalPawnLevel = Number(movingPieceCopy.level || 1);
            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color) {
                 if (this.isPieceInvulnerableToAttack(originalTargetPiece, movingPieceCopy)) return newState;
                 pieceWasCaptured = true;
                 newState.capturedPieces[currentPlayer].push(originalTargetPiece);
                 const levelBonusPromo = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
                 movingPieceCopy.level = Math.min(6, (Number(movingPieceCopy.level || 1)) + levelBonusPromo);
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                return newState;
            }

            movingPieceCopy.type = move.promoteTo || 'queen';
            if (!pieceWasCaptured) {
                movingPieceCopy.level = 1;
            }

            if(typeof originalPawnLevel === 'number' && !isNaN(originalPawnLevel) && originalPawnLevel >= 5) {
                 newState.extraTurn = true;
            }
            newState.board[toRow][toCol].piece = movingPieceCopy;
            newState.board[fromRow][fromCol].piece = null;
        } else if (move.type === 'castle') {
            const isKingside = toCol > fromCol;
            const rookFromColCastle = isKingside ? 7 : 0;
            const rookToColCastle = isKingside ? toCol - 1 : toCol + 1;
            const rookSourceSquare = newState.board[fromRow]?.[rookFromColCastle];
            const rook = rookSourceSquare?.piece;
            if (!rook || rook.type !== 'rook' || rook.hasMoved || movingPieceCopy.hasMoved) return newState;
            
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
                    const victimSquare = newState.board[adjR]?.[adjC];
                    const victim = victimSquare?.piece;
                    if (victim && victim.color !== currentPlayer && victim.type !== 'king' && !this.isPieceInvulnerableToAttack(victim, movingPieceCopy)) {
                        newState.capturedPieces[currentPlayer].push({ ...victim });
                        if(victimSquare) victimSquare.piece = null;
                        destroyedCount++;
                    }
                }
            }
            newState.board[fromRow][fromCol].piece = null;
            if (destroyedCount > 0) pieceWasCaptured = true;
        } else if (move.type === 'swap') {
            const targetPieceForSwapSquare = newState.board[toRow]?.[toCol];
            const targetPieceForSwap = targetPieceForSwapSquare?.piece;
            const movingPieceLevelForSwap = Number(movingPieceCopy.level || 1);
            if (!targetPieceForSwap || targetPieceForSwap.color !== movingPieceCopy.color ||
                !((movingPieceCopy.type === 'knight' && targetPieceForSwap.type === 'bishop' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4)) ||
                  (movingPieceCopy.type === 'bishop' && targetPieceForSwap.type === 'knight' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4))) ) {
                return newState;
            }
            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol].piece = { ...targetPieceForSwap, hasMoved: targetPieceForSwap.hasMoved || true };
        }

        const pieceOnToSquare = newState.board[toRow]?.[toCol]?.piece;
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) {
            const pieceOnToSquareActualLevel = Number(pieceOnToSquare.level || 1);
            if (pieceOnToSquare.type === 'pawn' && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'bishop' && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 5) && (move.type === 'move' || move.type === 'capture' || move.type === 'promotion')) {
                this.handleBishopConversion(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'rook' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 3) &&
                pieceOnToSquareActualLevel > originalLevelOfMovingPiece
            ) {
                this.handleResurrection(newState, currentPlayer);
            }

            if (pieceOnToSquare.type === 'queen' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 6) &&
                originalLevelOfMovingPiece < 6 &&
                (move.type === 'capture' || (move.type === 'promotion' && pieceWasCaptured))
            ) {
                let pawnSacrificed = false;
                for(let r_sac=0; r_sac<8; r_sac++) {
                    for(let c_sac=0; c_sac<8; c_sac++) {
                        const p_square = newState.board[r_sac]?.[c_sac];
                        const p = p_square?.piece;
                        if (p && p.type === 'pawn' && p.color === currentPlayer) {
                            if(p_square) p_square.piece = null;
                            const opponentColorForSac = currentPlayer === 'white' ? 'black' : 'white';
                            newState.capturedPieces[opponentColorForSac].push({...p});
                            pawnSacrificed = true;
                            break;
                        }
                    }
                    if (pawnSacrificed) break;
                }
            }
        }

        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        if (pieceWasCaptured) {
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + 1;
            newState.killStreaks[opponentColor] = 0;
            if (newState.killStreaks[currentPlayer] === 3) this.handleResurrection(newState, currentPlayer);
            if (newState.killStreaks[currentPlayer] === 6) newState.extraTurn = true;
        } else {
            newState.killStreaks[currentPlayer] = 0;
        }


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
                if (this.isValidSquareAI(adjR, adjC)) {
                    const adjSquare = newState.board[adjR]?.[adjC];
                    const adjPiece = adjSquare?.piece;
                    if (adjPiece && adjPiece.color !== pawnColor) {
                        const pushToR = adjR + dr;
                        const pushToC = adjC + dc;
                        const pushToSquare = newState.board[pushToR]?.[pushToC];
                        if (this.isValidSquareAI(pushToR, pushToC) && pushToSquare && !pushToSquare.piece ) {
                            pushToSquare.piece = adjPiece;
                             if(adjSquare) adjSquare.piece = null;
                        }
                    }
                }
            }
        }
    }

    handleBishopConversion(newState: AIGameState, bishopRow: number, bishopCol: number, bishopColor: PlayerColor) {
        const bishopSquare = newState.board[bishopRow]?.[bishopCol];
        const bishop = bishopSquare?.piece;
        if(!bishop || bishop.type !== 'bishop' || bishop.color !== bishopColor) return;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = bishopRow + dr;
                const adjC = bishopCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const targetSquare = newState.board[adjR]?.[adjC];
                    if (!targetSquare) continue;
                    const targetPiece = targetSquare.piece;
                    if (targetPiece && targetPiece.color !== bishopColor && targetPiece.type !== 'king') {
                         if (Math.random() < 0.5) {
                            targetSquare.piece = { ...targetPiece, color: bishopColor, id: `conv_${targetPiece.id}_${Date.now()}` };
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
        for(let r=0; r<8; r++) for(let c=0; c<8; c++){
            const currentSquare = newState.board[r]?.[c];
            if(currentSquare && !currentSquare.piece ) emptySquares.push([r,c]);
        }

        if (emptySquares.length > 0) {
            const backRank = currentPlayer === 'white' ? 7 : 0;
            const preferredResSquares = emptySquares.filter(([r_sq,c_sq]) => r_sq === backRank);

            let resRow, resCol;
            if (preferredResSquares.length > 0) {
                 [resRow, resCol] = preferredResSquares[Math.floor(Math.random() * preferredResSquares.length)];
            } else {
                 [resRow, resCol] = emptySquares[Math.floor(Math.random() * emptySquares.length)];
            }
            
            const resSquare = newState.board[resRow]?.[resCol];
            if (resSquare) {
                const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook' ? false : pieceToResurrect.hasMoved };
                resSquare.piece = resurrectedPiece;

                newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);

                const promotionRank = currentPlayer === 'white' ? 0 : 7;
                const resurrectedPieceOnBoardSquare = newState.board[resRow]?.[resCol];
                if (resurrectedPieceOnBoardSquare?.piece?.type === 'pawn' && resRow === promotionRank) {
                    resurrectedPieceOnBoardSquare.piece.type = 'queen';
                    resurrectedPieceOnBoardSquare.piece.level = 1;
                    resurrectedPieceOnBoardSquare.piece.id = `${resurrectedPiece.id}_resPromo_Q`;
                }
            }
        }
    }

    chooseBestResurrectionPiece(capturedPieces: Piece[]): Piece | null {
        if (!capturedPieces || capturedPieces.length === 0) return null;
        return [...capturedPieces].sort((a,b) => (this.pieceValues[b.type]?.[0] || 0) - (this.pieceValues[a.type]?.[0] || 0))[0];
    }


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


    isSquareImportantForAI(gameState: AIGameState, r: number, c: number, aiColor: PlayerColor): boolean {
        const square = gameState.board[r]?.[c];
        if (!square) return false;
        const piece = square.piece;
        if(piece && piece.color === aiColor) {
            if(piece.type === 'pawn' && ((aiColor === 'white' && r < 6) || (aiColor === 'black' && r > 1))) return true;
            if((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) return true;
        }
        return false; 
    }

    evaluateMaterial(gameState: AIGameState, aiColor: PlayerColor): number {
        let materialScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (!square) continue;
                const piece = square.piece;
                if (piece) {
                    const level = Math.max(1, Math.min(6, Number(piece.level || 1)));
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
                const square = gameState.board[r]?.[c];
                if (!square) continue;
                const piece = square.piece;
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    if (this.centerSquares.has(`${r}${c}`)) {
                        positionalScore += this.positionalBonuses.center * multiplier;
                    } else if (this.nearCenterSquares.has(`${r}${c}`)) {
                        positionalScore += this.positionalBonuses.nearCenter * multiplier;
                    }
                    if ((piece.type === 'knight' || piece.type === 'bishop') && !piece.hasMoved) { // Check for !hasMoved
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
                const square = gameState.board[r]?.[c];
                if (!square) continue;
                const piece = square.piece;
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
        if (aiPlayerStreak === 3) streakScore += 50;
        if (aiPlayerStreak >= 5) streakScore += 25;
        if (aiPlayerStreak === 6) streakScore += 150;

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
                const square = gameState.board[r]?.[c];
                if (!square) continue;
                const piece = square.piece;
                if (piece) {
                    const multiplier = piece.color === aiColor ? 1 : -1;
                    const pieceActualLevel = Number(piece.level || 1);
                    if (typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel)) {
                        abilitiesScore += (pieceActualLevel -1) * 15 * multiplier;

                        if (piece.type === 'queen' && pieceActualLevel >= 6) {
                            abilitiesScore += 60 * multiplier;
                        }
                        if (piece.type === 'bishop' && pieceActualLevel >= 3){
                            abilitiesScore += 25 * multiplier;
                        }
                         if (piece.type === 'pawn') {
                            const promotionRank = piece.color === 'white' ? 0 : 7;
                            const distanceToPromotion = Math.abs(r - promotionRank);
                             abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier;
                             if (pieceActualLevel >= 5) abilitiesScore += 30 * multiplier;
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

        if (targetPiece.type === 'queen' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 6 && (typeof attackerActualLevel !== 'number' || isNaN(attackerActualLevel) || attackerActualLevel < targetActualLevel)) {
            return true;
        }
        if (targetPiece.type === 'bishop' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 3 && attackingPiece.type === 'pawn') {
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

    generateAllMoves(gameState: AIGameState, color: PlayerColor): AIMove[] {
        const allPossibleMoves: AIMove[] = [];
        if (!gameState || !gameState.board) {
            return [];
        }
        if (!Array.isArray(gameState.board)) {
            return [];
        }

        for (let r = 0; r < 8; r++) {
            const currentRow = gameState.board[r];
            if (!currentRow || !Array.isArray(currentRow)) {
                continue;
            }
            for (let c = 0; c < 8; c++) {
                const squareCell = currentRow[c];
                const piece = squareCell?.piece; 

                if (piece && piece.color === color) {
                    try {
                        allPossibleMoves.push(...this.generatePieceMovesOptimized(gameState, r, c, piece));
                    } catch (e) {
                    }
                }
            }
        }

        const legalMoves = allPossibleMoves.filter(move => {
            try {
                 // Create a completely new copy for validation
                const tempStateForValidation_Board: AIBoardState = [];
                if (gameState.board && Array.isArray(gameState.board)) {
                    for (let r_idx = 0; r_idx < 8; r_idx++) {
                        tempStateForValidation_Board[r_idx] = [];
                        const originalRow = gameState.board[r_idx];
                         if (originalRow && Array.isArray(originalRow)) {
                            for (let c_idx = 0; c_idx < 8; c_idx++) {
                                const originalSquare = originalRow[c_idx];
                                tempStateForValidation_Board[r_idx][c_idx] = {
                                    piece: originalSquare?.piece ? { ...originalSquare.piece } : null
                                };
                            }
                        } else {
                            tempStateForValidation_Board[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
                        }
                    }
                } else {
                    for (let r_idx = 0; r_idx < 8; r_idx++) {
                        tempStateForValidation_Board[r_idx] = Array(8).fill(null).map(() => ({ piece: null }));
                    }
                }

                const tempStateForValidation: AIGameState = {
                    ...gameState,
                    board: tempStateForValidation_Board,
                    killStreaks: gameState.killStreaks ? { ...gameState.killStreaks } : { white: 0, black: 0 },
                    capturedPieces: { 
                        white: gameState.capturedPieces?.white?.map(p => ({...p})) || [],
                        black: gameState.capturedPieces?.black?.map(p => ({...p})) || []
                    }
                };
                const tempStateAfterMove = this.makeMoveOptimized(tempStateForValidation, move, color);
                return !this.isInCheck(tempStateAfterMove, color);
            } catch (e) {
                return false;
            }
        });
        return legalMoves;
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
                    if (targetSquare?.piece && targetSquare.piece.color === piece.color && targetSquare.piece.type === targetType ) {
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

        if (this.isValidSquareAI(r + dir, c) && !board[r + dir]?.[c]?.piece ) {
            if (r + dir === promotionRank) {
                ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r + dir, c], type: 'promotion', promoteTo: pt as PieceType }));
            } else {
                moves.push({ from: [r,c], to: [r + dir, c], type: 'move' });
            }
            if (r === startRow && !piece.hasMoved && this.isValidSquareAI(r + 2 * dir, c) &&
                !board[r + dir]?.[c]?.piece  &&
                !board[r + 2 * dir]?.[c]?.piece  ) {
                moves.push({ from: [r,c], to: [r + 2 * dir, c], type: 'move' });
            }
        }
        [-1, 1].forEach(dc => {
            if (this.isValidSquareAI(r + dir, c + dc)) {
                const targetSquare = board[r + dir]?.[c + dc];
                if (!targetSquare) return;
                const targetPiece = targetSquare.piece;

                if (targetPiece && targetPiece.color !== piece.color && !this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                     const targetActualLevel = Number(targetPiece.level || 1);
                     if (!(targetPiece.type === 'bishop' && typeof targetActualLevel === 'number' && !isNaN(targetActualLevel) && targetActualLevel >= 3 && piece.type === 'pawn')) {
                        if (r + dir === promotionRank) {
                            ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r + dir, c + dc], type: 'promotion', promoteTo: pt as PieceType }));
                        } else {
                            moves.push({ from: [r,c], to: [r + dir, c + dc], type: 'capture' });
                        }
                    }
                }
            }
        });
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 2) {
            if (this.isValidSquareAI(r - dir, c) && !board[r - dir]?.[c]?.piece ) {
                moves.push({ from: [r,c], to: [r - dir, c], type: 'move' });
            }
        }
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 3) {
            [-1, 1].forEach(dc => {
                if (this.isValidSquareAI(r, c + dc) && !board[r]?.[c + dc]?.piece ) {
                    moves.push({ from: [r,c], to: [r, c + dc], type: 'move' });
                }
            });
        }
    }

    addKnightMoves(moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) {
        const level = Number(piece.level || 1);
        const board = gameState.board;
        this.knightMoves.forEach(([dr, dc]) => {
            const R = r + dr; const C = c + dc;
            const targetSquare = board[R]?.[C];
            if (this.isValidSquareAI(R, C) && targetSquare ) {
                const target = targetSquare.piece;
                if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                    moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                }
            }
        });
        if (typeof level === 'number' && !isNaN(level) && level >= 2) {
            [[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                const targetSquare = board[R]?.[C];
                 if (this.isValidSquareAI(R, C) && targetSquare ) {
                    const target = targetSquare.piece;
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            });
        }
        if (typeof level === 'number' && !isNaN(level) && level >= 3) {
             [[ -3, 0 ], [ 3, 0 ], [ 0, -3 ], [ 0, 3 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                const targetSquare = board[R]?.[C];
                 if (this.isValidSquareAI(R, C) && targetSquare ) {
                    const target = targetSquare.piece;
                    const mid1R = r + Math.sign(dr); const mid1C = c + Math.sign(dc);
                    const mid2R = r + 2 * Math.sign(dr); const mid2C = c + 2 * Math.sign(dc);
                    if (this.isValidSquareAI(mid1R, mid1C) && (board[mid1R]?.[mid1C]?.piece )) return;
                    if (this.isValidSquareAI(mid2R, mid2C) && (board[mid2R]?.[mid2C]?.piece )) return;

                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttack(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
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
                const targetSquare = board[R]?.[C];
                if(!targetSquare) break;

                const targetPiece = targetSquare.piece;
                if (!targetPiece) {
                     moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else {
                    if (targetPiece.color !== piece.color) {
                        if (!this.isPieceInvulnerableToAttack(targetPiece, piece) ) {
                           moves.push({ from: [r,c], to: [R,C], type: 'capture' });
                        }
                    } else if (piece.type === 'bishop' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >=2 && targetPiece.color === piece.color){
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
                const targetSquareKing = board[R_k]?.[C_k];
                if (this.isValidSquareAI(R_k, C_k) && targetSquareKing ) {
                    if (maxDist === 2 && (Math.abs(dr_k) === 2 || Math.abs(dc_k) === 2) ) {
                        const midR_k = r + Math.sign(dr_k);
                        const midC_k = c + Math.sign(dc_k);
                        if (this.isValidSquareAI(midR_k, midC_k)) {
                            if (board[midR_k]?.[midC_k]?.piece ) continue;
                            if (this.isSquareAttackedAI(gameState, midR_k, midC_k, opponentColor, true)) continue;
                        }
                    }
                    const target_k = targetSquareKing.piece;
                     if (!target_k || (target_k.color !== piece.color && !this.isPieceInvulnerableToAttack(target_k, piece))) {
                        moves.push({ from: [r,c], to: [R_k,C_k], type: target_k ? 'capture' : 'move' });
                    }
                }
            }
        }
        if (typeof kingActualLevel === 'number' && !isNaN(kingActualLevel) && kingActualLevel >= 5) {
            this.knightMoves.forEach(([dr_n,dc_n]) => {
                const R_n = r + dr_n; const C_n = c + dc_n;
                const targetSquareKnightMove = board[R_n]?.[C_n];
                if (this.isValidSquareAI(R_n,C_n) && targetSquareKnightMove ){
                    const target_n = targetSquareKnightMove.piece;
                    if (!target_n || (target_n.color !== piece.color && !this.isPieceInvulnerableToAttack(target_n, piece))) {
                         moves.push({ from: [r,c], to: [R_n,C_n], type: target_n ? 'capture' : 'move' });
                    }
                }
            });
        }

        if (!piece.hasMoved && !this.isInCheck(gameState, piece.color)) {
            if (this.canCastle(gameState, piece.color, true, r, c)) {
                moves.push({ from: [r,c], to: [r, c + 2], type: 'castle' });
            }
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
        if (!kingPos) return true;
        const opponentColorForCheck = color === 'white' ? 'black' : 'white';

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const attackerSquare = gameState.board[r_att]?.[c_att];
                if (!attackerSquare) continue;
                const attackerPiece = attackerSquare.piece;
                if (attackerPiece && attackerPiece.color === opponentColorForCheck) {
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
        if (!playerToMove) return false;

        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true;

        const legalMoves = this.generateAllMoves(gameState, playerToMove);
        if (legalMoves.length === 0) {
            return true;
        }
        return false;
    }

    canCastle(gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean {
        const kingSquare = gameState.board[kingRow]?.[kingCol];
        if (!kingSquare || !kingSquare.piece || kingSquare.piece.hasMoved) return false;

        const rookCol = kingside ? 7 : 0;
        const rookSquare = gameState.board[kingRow]?.[rookCol];
        if (!rookSquare || !rookSquare.piece || rookSquare.piece.type !== 'rook' || rookSquare.piece.hasMoved) return false;

        const pathStart = kingside ? kingCol + 1 : rookCol + 1;
        const pathEnd = kingside ? rookCol -1 : kingCol -1;
        for (let c = Math.min(pathStart, pathEnd); c <= Math.max(pathStart, pathEnd); c++) {
            if (gameState.board[kingRow]?.[c]?.piece ) return false;
        }

        const opponentColorForCastle = color === 'white' ? 'black' : 'white';
        const squaresToNotBeAttacked: [number, number][] = [[kingRow, kingCol]];
        if (kingside) {
            squaresToNotBeAttacked.push([kingRow, kingCol + 1], [kingRow, kingCol + 2]);
        } else {
            squaresToNotBeAttacked.push([kingRow, kingCol - 1], [kingRow, kingCol - 2]);
        }

        for (const [r_check, c_check] of squaresToNotBeAttacked) {
             if (this.isSquareAttackedAI(gameState, r_check, c_check, opponentColorForCastle, true)) return false;
        }
        return true;
    }

    isSquareAttackedAI(gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor, simplifyKingCheck: boolean = false): boolean{

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const square = gameState.board[r_att]?.[c_att];
                if(!square) continue;
                const piece = square.piece;
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

        const targetSquare = gameState.board[toRow]?.[toCol];
        if (!targetSquare) return false;
        const targetPieceOnSquare = targetSquare.piece;


        if (targetPieceOnSquare && this.isPieceInvulnerableToAttack(targetPieceOnSquare, piece)) {
             return false;
        }

        switch (piece.type) {
            case 'pawn':
                const direction = piece.color === 'white' ? -1 : 1;
                return deltaRow === direction && Math.abs(deltaCol) === 1;
            case 'knight':
                const knightActualLevel = Number(piece.level || 1);
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) return true;
                if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) return true;
                if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) {
                    const stepR = Math.sign(deltaRow);
                    const stepC = Math.sign(deltaCol);
                    if (this.isValidSquareAI(fromRow + stepR, fromCol + stepC) && gameState.board[fromRow + stepR]?.[fromCol + stepC]?.piece ) return false;
                    if (this.isValidSquareAI(fromRow + 2*stepR, fromCol + 2*stepC) && gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.piece ) return false;
                    return true;
                }
                return false;
            case 'bishop':
                return Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to, piece);
            case 'rook':
                return (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece);
            case 'queen':
                return (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece);
            case 'king':
                const kingActualLevelForAttack = Number(piece.level || 1);
                let effectiveMaxDist = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 2 && !simplifyKingCheck) ? 2 : 1;
                let canUseKnightMove = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 5 && !simplifyKingCheck);

                if (simplifyKingCheck) {
                    effectiveMaxDist = 1;
                    canUseKnightMove = false;
                }

                if (Math.abs(deltaRow) <= effectiveMaxDist && Math.abs(deltaCol) <= effectiveMaxDist && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                    if (effectiveMaxDist === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2)) {
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquareAI(midR, midC) && (gameState.board[midR]?.[midC]?.piece )) return false;
                        if (!simplifyKingCheck && this.isSquareAttackedAI(gameState, midR, midC, piece.color === 'white' ? 'black' : 'white', true)) {
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
        const pieceActualLevel = Number(piece.level || 1);
        const bishopLevelForPhasing = (piece.type === 'bishop' && (typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 2));

        let r = fromRow + deltaRow;
        let c = fromCol + deltaCol;

        while (r !== toRow || c !== toCol) {
            if (!this.isValidSquareAI(r,c)) return false;
            const pathSquare = board[r]?.[c];
            if (!pathSquare) return false; // Should not happen if isValidSquareAI passed
            const pathPiece = pathSquare.piece;
            if (pathPiece) {
                if (bishopLevelForPhasing && pathPiece.color === piece.color) {
                    // Phase through friendly
                } else {
                    return false;
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
                const square = gameState.board[r]?.[c];
                if (!square) continue;
                const piece = square.piece;
                if (piece && piece.type === 'king' && piece.color === color) {
                    return { row: r, col: c, piece: piece };
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
                    const square = gameState.board[newRow]?.[newCol];
                    if (!square) continue;
                    const piece = square.piece;
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
        const targetSquare = gameState.board[toR]?.[toC];
        if (!targetSquare) return score;

        const targetPiece = targetSquare.piece;

        if (targetPiece && targetPiece.color !== playerColor) {
            const capturedValue = this.pieceValues[targetPiece.type]?.[(Number(targetPiece.level || 1)) - 1] || 0;
            score += capturedValue * 10;
        }

        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0;
            score += promoValue;
        }

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
                const s = gameState.board[r]?.[c];
                if (s) {
                    const p = s.piece;
                    if (p) {
                        key += `${p.color[0]}${p.type[0]}${Number(p.level || 1)}`;
                        if (p.invulnerableTurnsRemaining) key += `i${p.invulnerableTurnsRemaining}`;
                        if (p.hasMoved) key += 'm';
                    } else {
                        key += '--';
                    }
                } else {
                    key += 'XX';
                }
            }
        }
        key += `-${gameState.currentPlayer[0]}`;
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`;
        const whiteKillStreak = gameState.killStreaks?.white ?? 0;
        const blackKillStreak = gameState.killStreaks?.black ?? 0;
        key += `-w${whiteKillStreak}b${blackKillStreak}`;
        key += `-mc${gameState.gameMoveCounter || 0}`;
        return key;
    }
}

// Removed 'export default VibeChessAI;' as it's now a named export
// This file is src/lib/vibe-chess-ai.ts and should not have 'use server'
