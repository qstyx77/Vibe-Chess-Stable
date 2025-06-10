
import type { Piece, PlayerColor, PieceType, AIMove, AIGameState, AIBoardState, AISquareState, Item, AlgebraicSquare } from '@/types';
import { coordsToAlgebraic, algebraicToCoords, getCastlingRightsString, isPieceInvulnerableToAttack as isPieceInvulnerableToAttackUtil, isValidSquare as isValidSquareUtil } from '@/lib/chess-utils';

// To enable detailed logging for King safety checks, set this to true
const AI_DEBUG_KING_SAFETY_ONLY = false; 

const aiLog = (message: string, isKingSafetyCheck: boolean | undefined, callId: string | null | undefined, ...args: any[]) => {
    if (AI_DEBUG_KING_SAFETY_ONLY && isKingSafetyCheck) { // Only log if the global flag is true AND it's a king safety check
        const idPart = callId ? ` CALLID:${callId}` : '';
        console.log(`%c[AI_DEBUG${idPart}] ${message}`, 'color: orange;', ...args);
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


    constructor(depth = 3) {
        this.maxDepth = depth;
        this.positionCache = new Map();
        this.maxCacheSize = 10000;
        this.searchStartTime = 0;
        this.maxSearchTime = 5000; // 5 seconds

        this.pieceValues = {
            'pawn': [100, 120, 140, 180, 220, 260, 280, 300, 320, 340],
            'knight': [320, 360, 400, 450, 500, 550, 580, 610, 640, 670],
            'bishop': [330, 370, 420, 470, 520, 570, 600, 630, 660, 690],
            'rook': [500, 520, 580, 620, 660, 700, 730, 760, 790, 820],
            'queen': [900, 920, 940, 960, 1200, 1250, 1350],
            'king': [20000, 20000, 20000, 20000, 20000, 20000, 20000],
            'commander': [150, 180, 210, 250, 290, 330, 360, 390, 420, 450],
            'hero': [700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150],
            'infiltrator': [250, 270, 290, 310, 330, 350, 370, 390, 410, 430]
        };

        this.captureLevelBonuses = {
            'pawn': 1, 'knight': 2, 'bishop': 2, 'rook': 2, 'queen': 3, 'king': 1, 'commander': 1, 'hero': 2, 'infiltrator': 1
        };

        this.positionalBonuses = {
            center: 10,
            nearCenter: 5,
            development: 15,
            kingSafety: 25,
            pawnStructure: 8,
            anvilMalus: -15,
            infiltratorAdvance: 50,
        };

        this.knightMoves = [[-2,-1], [-2,1], [-1,-2], [-1,2], [1,-2], [1,2], [2,-1], [2,1]];
        this.kingMoves = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        this.directions = {
            rook: [[0,1], [0,-1], [1,0], [-1,0]],
            bishop: [[1,1], [1,-1], [-1,1], [-1,-1]],
            queen: [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]]
        };

        this.centerSquares = new Set(['33', '34', '43', '44']); // d5, e5, d4, e4
        this.nearCenterSquares = new Set(['22', '23', '24', '25', '32', '35', '42', '45', '52', '53', '54', '55']);
    }

    getBestMove = (originalGameState: AIGameState, color: PlayerColor): { move: AIMove | null; extraTurn: boolean } => {
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
                console.error("[AI_ERROR] getBestMove: Invalid gameState or color provided.");
                return { move: null, extraTurn: false };
            }
            const legalMoves = this.generateAllMoves(gameState, color);

            if (legalMoves.length === 0) {
                return { move: null, extraTurn: false };
            }
            const result = this.minimax(gameState, this.maxDepth, -Infinity, Infinity, true, color);
            let finalMove = result.move;
            let finalExtraTurn = result.extraTurn || false;

            if (!finalMove && legalMoves.length > 0) {
                finalMove = legalMoves[0];
                const tempState = this.makeMoveOptimized(gameState, finalMove, color);
                finalExtraTurn = tempState.extraTurn || false;
            }
            return { move: finalMove, extraTurn: finalExtraTurn };

        } catch (error) {
            console.error("[AI_ERROR] Error in getBestMove:", error);
            try {
                const fallbackGameState: AIGameState = {
                    ...originalGameState,
                    board: localBoardCopy,
                    capturedPieces: {
                        white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                        black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
                    },
                    killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
                };
                const fallbackMoves = this.generateAllMoves(fallbackGameState, color);
                if (fallbackMoves.length > 0) {
                    const tempState = this.makeMoveOptimized(fallbackGameState, fallbackMoves[0], color);
                    return { move: fallbackMoves[0], extraTurn: tempState.extraTurn || false };
                }
                return { move: null, extraTurn: false };
            } catch (fallbackError) {
                console.error("[AI_ERROR] Fallback Error in getBestMove:", fallbackError);
                return { move: null, extraTurn: false };
            }
        }
    }

    minimax = (gameState: AIGameState, depth: number, alpha: number, beta: number, isMaximizingPlayer: boolean, aiColor: PlayerColor): { score: number; move: AIMove | null; extraTurn?: boolean } => {
        try {
             if (Date.now() - this.searchStartTime > this.maxSearchTime) {
                 return { score: this.evaluatePosition(gameState, aiColor), move: null, extraTurn: gameState.extraTurn };
             }

            if (this.isGameOver(gameState)) {
                return {
                    score: this.evaluatePosition(gameState, aiColor),
                    move: null,
                    extraTurn: gameState.extraTurn
                };
            }
            if (depth === 0) {
                 return { score: this.evaluatePosition(gameState, aiColor), move: null, extraTurn: gameState.extraTurn };
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
                    move: null,
                    extraTurn: gameState.extraTurn
                };
            }
            moves.sort((a, b) => this.quickEvaluateMove(gameState, b, currentPlayerForNode) -
                                this.quickEvaluateMove(gameState, a, currentPlayerForNode));

            let bestMove : AIMove | null = moves[0];
            let bestExtraTurn = false;

            if (isMaximizingPlayer) {
                let maxEval = -Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, false, aiColor);

                    if (evaluation.score > maxEval) {
                        maxEval = evaluation.score;
                        bestMove = move;
                        bestExtraTurn = newGameState.extraTurn || false;
                    }
                    alpha = Math.max(alpha, evaluation.score);
                    if (beta <= alpha) break;
                }
                const result = { score: maxEval, move: bestMove, depth, extraTurn: bestExtraTurn };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            } else {
                let minEval = Infinity;
                for (const move of moves) {
                    const newGameState = this.makeMoveOptimized(gameState, move, currentPlayerForNode);
                    const evaluation = this.minimax(newGameState, depth - 1, alpha, beta, true, aiColor);

                    if (evaluation.score < minEval) {
                        minEval = evaluation.score;
                        bestMove = move;
                        bestExtraTurn = newGameState.extraTurn || false;
                    }
                    beta = Math.min(beta, evaluation.score);
                    if (beta <= alpha) break;
                }
                const result = { score: minEval, move: bestMove, depth, extraTurn: bestExtraTurn };
                if (this.positionCache.size < this.maxCacheSize) this.positionCache.set(positionKey, result);
                return result;
            }
        } catch (error) {
            console.error("[AI_ERROR] Minimax error:", error, "Depth:", depth, "Maximizing:", isMaximizingPlayer);
            return { score: isMaximizingPlayer ? -Infinity : Infinity, move: null, extraTurn: false };
        }
    }

    makeMoveOptimized = (originalGameState: AIGameState, move: AIMove, currentPlayer: PlayerColor): AIGameState => {
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
                newBoardForOptimizedMove[r_idx] = Array(8).fill(null).map(() => ({ piece: null, item: null }));
            }
        }

        const baseStateCopy = {
            ...originalGameState,
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 },
            capturedPieces: { // Deep copy captured pieces
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
        };

        const newState: AIGameState = {
            ...baseStateCopy,
            board: newBoardForOptimizedMove,
            currentPlayer: currentPlayer,
            extraTurn: false,
            gameMoveCounter: (baseStateCopy.gameMoveCounter || 0) + 1,
            enPassantTargetSquare: null,
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
        let pieceCapturedByAnvil = false;
        let capturedPieceDataForScoring: Piece | null = null;


        const targetSquareState = newState.board[toRow]?.[toCol];
        const originalTargetPiece = targetSquareState?.piece ? { ...targetSquareState.piece } : null;
        const originalTypeOfMovingPiece = movingPieceCopy.type;
        const originalLevelOfMovingPiece = Number(movingPieceCopy.level || 1);

        movingPieceCopy.hasMoved = true;

        if (movingPieceCopy.type === 'pawn' && Math.abs(fromRow - toRow) === 2) {
            newState.enPassantTargetSquare = coordsToAlgebraic(fromRow + (movingPieceCopy.color === 'white' ? -1 : 1), fromCol);
        }


        if (move.type === 'enpassant') {
            if (!originalGameState.enPassantTargetSquare || coordsToAlgebraic(toRow, toCol) !== originalGameState.enPassantTargetSquare) {
                return newState;
            }
            const capturedPawnRow = movingPieceCopy.color === 'white' ? toRow + 1 : toRow - 1;
            const capturedPawn = newState.board[capturedPawnRow]?.[toCol]?.piece;
            if (!capturedPawn || capturedPawn.type !== 'pawn' || capturedPawn.color === movingPieceCopy.color) {
                return newState;
            }
            capturedPieceDataForScoring = { ...capturedPawn };
            newState.board[capturedPawnRow][toCol].piece = null;
            pieceWasCaptured = true;
            movingPieceCopy.type = 'infiltrator';
            movingPieceCopy.id = `${movingPieceCopy.id}_infiltrator_AI`;
        } else if (move.type === 'capture') {
            if (!originalTargetPiece || originalTargetPiece.color === movingPieceCopy.color || this.isPieceInvulnerableToAttackAI(originalTargetPiece, movingPieceCopy) || targetSquareState?.item) {
                return newState;
            }
            pieceWasCaptured = true;
            capturedPieceDataForScoring = originalTargetPiece;
            if (movingPieceCopy.type !== 'infiltrator') {
                newState.capturedPieces[currentPlayer].push(originalTargetPiece);
            }
            const levelBonus = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
            const currentLevel = Number(movingPieceCopy.level || 1);
            let newCalculatedLevel = currentLevel + levelBonus;
            if (movingPieceCopy.type === 'queen') {
                 newCalculatedLevel = Math.min(newCalculatedLevel, 7);
            }
            movingPieceCopy.level = newCalculatedLevel;
        } else if (move.type === 'move') {
            if (originalTargetPiece || targetSquareState?.item) {
                return newState;
            }
        } else if (move.type === 'promotion') {
            if (targetSquareState?.item) {
                return newState;
            }

            let newPieceLevel = 1;
            if (originalTypeOfMovingPiece === 'pawn' || originalTypeOfMovingPiece === 'commander') {
                 newPieceLevel = originalLevelOfMovingPiece;
            }


            if (originalTargetPiece && originalTargetPiece.color !== movingPieceCopy.color && !this.isPieceInvulnerableToAttackAI(originalTargetPiece, movingPieceCopy)) {
                 pieceWasCaptured = true;
                 capturedPieceDataForScoring = originalTargetPiece;
                 if (movingPieceCopy.type !== 'infiltrator') { 
                    newState.capturedPieces[currentPlayer].push(originalTargetPiece);
                 }
                 const levelBonusPromo = this.captureLevelBonuses[originalTargetPiece.type as PieceType] || 1;
                 newPieceLevel = (originalTypeOfMovingPiece === 'pawn' || originalTypeOfMovingPiece === 'commander' ? originalLevelOfMovingPiece : 1) + levelBonusPromo;
            } else if (originalTargetPiece && originalTargetPiece.color === movingPieceCopy.color) {
                return newState;
            }
            if (movingPieceCopy.type === 'commander') {
                movingPieceCopy.type = 'hero';
                movingPieceCopy.id = `${movingPieceCopy.id}_HeroPromo_AI`;
                movingPieceCopy.level = newPieceLevel;
                if (originalLevelOfMovingPiece >= 5) {
                    newState.extraTurn = true;
                }
            } else { // Pawn promotion
                movingPieceCopy.type = move.promoteTo || 'queen';
                movingPieceCopy.level = (movingPieceCopy.type === 'queen') ? Math.min(newPieceLevel, 7) : newPieceLevel;
                if (originalLevelOfMovingPiece >= 5) {
                    newState.extraTurn = true;
                }
            }
        } else if (move.type === 'castle') {
            const isKingside = toCol > fromCol;
            const rookFromColCastle = isKingside ? 7 : 0;
            const rookToColCastle = isKingside ? toCol - 1 : toCol + 1;
            const rookSourceSquareState = newState.board[fromRow]?.[rookFromColCastle];
            const rook = rookSourceSquareState?.piece;
            if (!rook || rook.type !== 'rook' || rook.hasMoved || movingPieceCopy.hasMoved) {
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
        } else if (move.type === 'self-destruct' && (movingPieceCopy.type === 'knight' || movingPieceCopy.type === 'hero') && (Number(movingPieceCopy.level || 1)) >= 5) {
            let destroyedPiecesCountAI = 0;
            let destroyedAnvilsCountAI = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = fromRow + dr, adjC = fromCol + dc;
                if (this.isValidSquareAI(adjR, adjC)) {
                    const victimSquareStateAI = newState.board[adjR]?.[adjC];
                    if (!victimSquareStateAI) continue;

                    if (victimSquareStateAI.item?.type === 'anvil') {
                        victimSquareStateAI.item = null;
                        destroyedAnvilsCountAI++;
                    }
                    
                    const victimPieceAI = victimSquareStateAI.piece;
                    if (victimPieceAI && victimPieceAI.color !== currentPlayer && victimPieceAI.type !== 'king') {
                        const isQueenTargetSelfDestruct = victimPieceAI.type === 'queen';
                        const isNormallyInvulnerableSelfDestruct = !isQueenTargetSelfDestruct && this.isPieceInvulnerableToAttackAI(victimPieceAI, movingPieceCopy);

                        if (!isNormallyInvulnerableSelfDestruct || (isQueenTargetSelfDestruct /* Queen bypass invulnerability for self-destruct */)) {
                            if (movingPieceCopy.type !== 'infiltrator') { // Infiltrator self-destruct obliterates
                                newState.capturedPieces[currentPlayer].push({ ...victimPieceAI }); 
                            }
                            victimSquareStateAI.piece = null;
                            destroyedPiecesCountAI++;
                            pieceWasCaptured = true; 
                        }
                    }
                }
            }
            newState.board[fromRow][fromCol].piece = null; // Remove the self-destructing piece
        } else if (move.type === 'swap') {
            const targetPieceForSwapSquareState = newState.board[toRow]?.[toCol];
            const targetPieceForSwap = targetPieceForSwapSquareState?.piece;
            if (targetPieceForSwapSquareState?.item) return newState;
            const movingPieceLevelForSwap = Number(movingPieceCopy.level || 1);
            if (!targetPieceForSwap || targetPieceForSwap.color !== movingPieceCopy.color ||
                !(((movingPieceCopy.type === 'knight' || movingPieceCopy.type === 'hero') && targetPieceForSwap.type === 'bishop' && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4)) ||
                  (movingPieceCopy.type === 'bishop' && (targetPieceForSwap.type === 'knight' || targetPieceForSwap.type === 'hero') && (typeof movingPieceLevelForSwap === 'number' && !isNaN(movingPieceLevelForSwap) && movingPieceLevelForSwap >= 4))) ) {
                return newState;
            }
            newState.board[toRow][toCol].piece = { ...movingPieceCopy, hasMoved: true };
            newState.board[fromRow][fromCol].piece = { ...targetPieceForSwap, hasMoved: targetPieceForSwap.hasMoved || true };
        }

        newState.board[fromRow][fromCol].piece = null;
        newState.board[toRow][toCol].piece = movingPieceCopy;

        const pieceOnToSquare = newState.board[toRow]?.[toCol]?.piece;
        if (pieceOnToSquare && pieceOnToSquare.id === movingPieceCopy.id) {

            if (pieceWasCaptured && capturedPieceDataForScoring) {
                if (originalTypeOfMovingPiece === 'pawn' && capturedPieceDataForScoring.type === 'commander') {
                    pieceOnToSquare.type = 'commander';
                    pieceOnToSquare.id = `${pieceOnToSquare.id}_CmdrByCapture_AI`;
                }
                if (newState.killStreaks && !originalGameState.firstBloodAchieved) {
                    newState.firstBloodAchieved = true;
                    newState.playerWhoGotFirstBlood = currentPlayer;
                }
                if (pieceOnToSquare.type === 'commander') {
                    newState.board.forEach(rowSquares => {
                        rowSquares.forEach(sqState => {
                            if (sqState.piece && sqState.piece.color === currentPlayer && sqState.piece.type === 'pawn' && sqState.piece.id !== pieceOnToSquare.id) {
                                let newPawnLevel = (sqState.piece.level || 1) + 1;
                                sqState.piece.level = newPawnLevel;
                            }
                        });
                    });
                } else if (pieceOnToSquare.type === 'hero') {
                    newState.board.forEach(rowSquares => {
                        rowSquares.forEach(sqState => {
                            if (sqState.piece && sqState.piece.color === currentPlayer && sqState.piece.id !== pieceOnToSquare.id) {
                                let newAllyLevel = (sqState.piece.level || 1) + 1;
                                if (sqState.piece.type === 'queen') {
                                    newAllyLevel = Math.min(newAllyLevel, 7);
                                }
                                sqState.piece.level = newAllyLevel;
                            }
                        });
                    });
                }
            }
            const pieceOnToSquareActualLevel = Number(pieceOnToSquare.level || 1);
            if ((pieceOnToSquare.type === 'pawn' || pieceOnToSquare.type === 'commander') && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) && (move.type === 'move' || move.type === 'capture')) {
                const pushResult = this.handlePawnPushBack(newState, toRow, toCol, pieceOnToSquare.color);
                if (pushResult.pieceCrushedByAnvil) {
                    pieceCapturedByAnvil = true;
                }
            }
            if (pieceOnToSquare.type === 'bishop' && (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 5) && (move.type === 'move' || move.type === 'capture')) {
                this.handleBishopConversion(newState, toRow, toCol, pieceOnToSquare.color);
            }
            if (pieceOnToSquare.type === 'rook' &&
                (typeof pieceOnToSquareActualLevel === 'number' && !isNaN(pieceOnToSquareActualLevel) && pieceOnToSquareActualLevel >= 4) &&
                pieceOnToSquareActualLevel > originalLevelOfMovingPiece
            ) {
                this.handleResurrection(newState, currentPlayer);
            }

            if (pieceOnToSquare.type === 'queen') {
                const queenCurrentLevelAI = Number(pieceOnToSquare.level || 1);
                let triggerAISacrifice = false;
                if (queenCurrentLevelAI === 7) {
                    if (move.type === 'promotion' && (move.promoteTo === 'queen' || (originalTypeOfMovingPiece === 'commander' && pieceOnToSquare.type === 'queen'))) {
                        triggerAISacrifice = true;
                    } else if (move.type !== 'promotion' && originalTypeOfMovingPiece === 'queen' && originalLevelOfMovingPiece < 7) {
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
                                if(p_square_state) p_square_state.piece = null;
                                const opponentColorForSac = currentPlayer === 'white' ? 'black' : 'white';
                                newState.capturedPieces[opponentColorForSac].push({...p, id: `${p.id}_sac_AI_${Date.now()}`});
                                pawnSacrificed = true;
                                break;
                            }
                        }
                        if (pawnSacrificed) break;
                    }
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
        if (pieceOnToSquare?.type === 'infiltrator') {
            const backRank = pieceOnToSquare.color === 'white' ? 0 : 7;
            if (toRow === backRank) {
                newState.gameOver = true;
                newState.winner = currentPlayer;
            }
        }


        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
        if (pieceWasCaptured || pieceCapturedByAnvil) {
            newState.killStreaks[currentPlayer] = (newState.killStreaks[currentPlayer] || 0) + (move.type === 'self-destruct' ? (newState.capturedPieces[currentPlayer].length - (originalGameState.capturedPieces[currentPlayer]?.length || 0)) : 1);
            newState.killStreaks[opponentColor] = 0;
             if (newState.killStreaks[currentPlayer] === 3) {
                 this.handleResurrection(newState, currentPlayer);
            }
            if (newState.killStreaks[currentPlayer] === 6) newState.extraTurn = true;
        } else if (move.type === 'self-destruct' && newState.board[fromRow]?.[fromCol]?.item === null && !pieceWasCaptured) { // If self-destruct only destroyed anvils
             // Don't reset streak if only anvils were destroyed by self-destruct
        }
        else {
            newState.killStreaks[currentPlayer] = 0;
        }
        if (newState.firstBloodAchieved && newState.playerWhoGotFirstBlood === currentPlayer && !newState.board.flat().some(sq => sq.piece?.type === 'commander' && sq.piece.color === currentPlayer)) {
            const pieceThatMovedIsNowCommander = newState.board[toRow]?.[toCol]?.piece?.type === 'commander';
            if (!pieceThatMovedIsNowCommander) {
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
        if (newState.gameMoveCounter > 0 && newState.gameMoveCounter % 9 === 0) {
            const emptySquaresForAnvil: [number, number][] = [];
            for (let r_anvil = 0; r_anvil < 8; r_anvil++) {
                for (let c_anvil = 0; c_anvil < 8; c_anvil++) {
                    if (newState.board[r_anvil] && !newState.board[r_anvil][c_anvil]?.piece && !newState.board[r_anvil][c_anvil]?.item) {
                        emptySquaresForAnvil.push([r_anvil, c_anvil]);
                    }
                }
            }
            if (emptySquaresForAnvil.length > 0) {
                const [anvilR, anvilC] = emptySquaresForAnvil[Math.floor(Math.random() * emptySquaresForAnvil.length)];
                if(newState.board[anvilR]?.[anvilC]) {
                    newState.board[anvilR][anvilC].item = { type: 'anvil' };
                }
            }
        }
        if (!newState.gameOver && !newState.extraTurn) {
            newState.currentPlayer = opponentColor;
        } else if (!newState.gameOver && newState.extraTurn) {
            newState.currentPlayer = currentPlayer;
            if (this.isInCheck(newState, opponentColor, true)) {
                const opponentMoves = this.generateAllMoves(newState, opponentColor);
                if (opponentMoves.length === 0) {
                    newState.gameOver = true;
                    newState.winner = currentPlayer;
                    newState.autoCheckmate = true;
                }
            }
        }
        return newState;
    }

    handlePawnPushBack = (newState: AIGameState, pawnRow: number, pawnCol: number, pawnColor: PlayerColor): { pieceCrushedByAnvil: boolean } => {
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
                            if (!this.isValidSquareAI(pushToR, pushToC)) {
                                adjSquareState.item = null;
                            } else {
                                const destSquareStateAnvil = newState.board[pushToR]?.[pushToC];
                                if (!destSquareStateAnvil) continue;
                                if (destSquareStateAnvil.item?.type === 'anvil') {  }
                                else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type !== 'king') {
                                    // Anvil captures do not go to capturedPieces, they are obliterated
                                    // newState.capturedPieces[pawnColor].push({...destSquareStateAnvil.piece, id: `${destSquareStateAnvil.piece.id}_anvilcrush_${Date.now()}`});
                                    destSquareStateAnvil.piece = null;
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                    pieceCrushed = true;
                                } else if (destSquareStateAnvil.piece && destSquareStateAnvil.piece.type === 'king') {  }
                                else {
                                    destSquareStateAnvil.item = { type: 'anvil' };
                                    adjSquareState.item = null;
                                }
                            }
                        } else {
                            if (this.isValidSquareAI(pushToR, pushToC)) {
                                const destSquareStatePiece = newState.board[pushToR]?.[pushToC];
                                if (!destSquareStatePiece) continue;
                                if (!destSquareStatePiece.piece && !destSquareStatePiece.item) {
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

    handleBishopConversion = (newState: AIGameState, bishopRow: number, bishopCol: number, bishopColor: PlayerColor) => {
        const bishopSquareState = newState.board[bishopRow]?.[bishopCol];
        const bishop = bishopSquareState?.piece;
        if(!bishop || (bishop.type !== 'bishop' && bishop.type !== 'hero') || bishop.color !== bishopColor) return;

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
                         if (Math.random() < 0.5) {
                            targetSquareState.piece = { ...targetPiece, color: bishopColor, id: `conv_${targetPiece.id}_${Date.now()}` };
                         }
                    }
                }
            }
        }
    }

    shouldConvertPiece = (row: number, col: number): boolean => {
        return true;
    }

    handleResurrection = (newState: AIGameState, currentPlayer: PlayerColor) => {
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
            let preferredResSquares = emptySquares.filter(([r_sq,c_sq]) => {
                 if (currentPlayer === 'white') return r_sq >= 4 && r_sq < 7;
                 return r_sq <= 3 && r_sq > 0;
            });
            if (preferredResSquares.length === 0) preferredResSquares = emptySquares;

            let resRow, resCol;
            if (preferredResSquares.length > 2) {
                preferredResSquares.sort((a,b) => (Math.abs(a[1]-3.5) + Math.abs(a[0]-(currentPlayer === 'white' ? 6 : 1))) - (Math.abs(b[1]-3.5) + Math.abs(b[0]-(currentPlayer === 'white' ? 6 : 1))));
                 [resRow, resCol] = preferredResSquares[0];
            } else {
                 [resRow, resCol] = preferredResSquares[Math.floor(Math.random() * preferredResSquares.length)];
            }

            const resSquareState = newState.board[resRow]?.[resCol];
            if (resSquareState) {
                const resurrectedPiece: Piece = { ...pieceToResurrect, level: 1, id: `${pieceToResurrect.id}_res${Date.now()}`, hasMoved: (pieceToResurrect.type === 'king' || pieceToResurrect.type === 'rook') ? false : true, invulnerableTurnsRemaining: 0 };
                resSquareState.piece = resurrectedPiece;
                newState.capturedPieces[opponentColor] = piecesToChooseFrom.filter(p => p.id !== pieceToResurrect.id);
                const promotionRank = currentPlayer === 'white' ? 0 : 7;
                const resurrectedPieceOnBoardSquareState = newState.board[resRow]?.[resCol];
                if (resurrectedPieceOnBoardSquareState?.piece?.type === 'pawn' && resRow === promotionRank) {
                    resurrectedPieceOnBoardSquareState.piece.type = 'queen';
                    resurrectedPieceOnBoardSquareState.piece.level = 1;
                    resurrectedPieceOnBoardSquareState.piece.id = `${resurrectedPiece.id}_resPromo_Q`;
                } else if (resurrectedPieceOnBoardSquareState?.piece?.type === 'commander' && resRow === promotionRank) {
                    resurrectedPieceOnBoardSquareState.piece.type = 'hero';
                    resurrectedPieceOnBoardSquareState.piece.id = `${resurrectedPiece.id}_resPromo_H`;
                } else if (resurrectedPieceOnBoardSquareState?.piece?.type === 'infiltrator' && resRow === promotionRank) {
                    newState.gameOver = true;
                    newState.winner = currentPlayer;
                }
            }
        }
    }

    chooseBestResurrectionPiece = (capturedPieces: Piece[]): Piece | null => {
        if (!capturedPieces || capturedPieces.length === 0) return null;
        return [...capturedPieces].sort((a,b) => (this.pieceValues[b.type]?.[0] || 0) - (this.pieceValues[a.type]?.[0] || 0))[0];
    }


    evaluatePosition = (gameState: AIGameState, aiColor: PlayerColor): number => {
        let score = 0;
        if (!gameState || !gameState.board) return 0;

        if (this.isGameOver(gameState)) {
            if (gameState.winner === aiColor) {
                if (gameState.board.some(row => row.some(sq => sq.piece?.type === 'infiltrator' && sq.piece.color === aiColor && ( (aiColor === 'white' && sq.rowIndex === 0) || (aiColor === 'black' && sq.rowIndex === 7) ) ))) {
                    return 500000;
                }
                return gameState.autoCheckmate ? 250000 : 200000;
            }
            if (gameState.winner === (aiColor === 'white' ? 'black' : 'white')) return gameState.autoCheckmate ? -250000 : -200000;
            return 0;
        }

        score += this.evaluateMaterial(gameState, aiColor);
        score += this.evaluatePositional(gameState, aiColor);
        score += this.evaluateKingSafety(gameState, aiColor, AI_DEBUG_KING_SAFETY_ONLY); 
        score += this.evaluateKillStreaks(gameState, aiColor);
        score += this.evaluateSpecialAbilitiesAndLevels(gameState, aiColor);
        score += this.evaluateAnvils(gameState, aiColor);
        if (gameState.extraTurn && gameState.currentPlayer === aiColor) score += 75;
        return score;
    }

    evaluateAnvils = (gameState: AIGameState, aiColor: PlayerColor): number => {
        let anvilScore = 0;
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const aiKingPos = this.findKing(gameState, aiColor);
        const oppKingPos = this.findKing(gameState, opponentColor);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (square && square.item?.type === 'anvil') {
                    if (aiKingPos && Math.abs(r - aiKingPos.row) <= 2 && Math.abs(c - aiKingPos.col) <= 2) {
                        anvilScore += this.positionalBonuses.anvilMalus;
                    }
                    if (oppKingPos && Math.abs(r - oppKingPos.row) <= 2 && Math.abs(c - oppKingPos.col) <= 2) {
                        anvilScore -= this.positionalBonuses.anvilMalus;
                    }
                }
            }
        }
        return anvilScore;
    }


    isSquareImportantForAI = (gameState: AIGameState, r: number, c: number, aiColor: PlayerColor): boolean => {
        const squareState = gameState.board[r]?.[c];
        if (!squareState) return false;
        const piece = squareState.piece;
        if(piece && piece.color === aiColor) {
            if((piece.type === 'pawn' || piece.type === 'commander' || piece.type === 'infiltrator') && ((aiColor === 'white' && r < 6) || (aiColor === 'black' && r > 1))) return true;
            if((piece.type === 'knight' || piece.type === 'bishop' || piece.type === 'hero') && !piece.hasMoved) return true;
        }
        return false;
    }

    evaluateMaterial = (gameState: AIGameState, aiColor: PlayerColor): number => {
        let materialScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece) {
                    const currentPieceLevel = Number(piece.level || 1);
                    const pieceLevelValues = this.pieceValues[piece.type];
                    if (!pieceLevelValues) continue;
                    const levelForEval = piece.type === 'queen' ? Math.min(currentPieceLevel, 7) : currentPieceLevel;
                    const effectiveLevelForArrayIndex = Math.max(1, levelForEval);
                    const valueIndex = Math.min(effectiveLevelForArrayIndex - 1, pieceLevelValues.length - 1);
                    let value = pieceLevelValues[valueIndex] || 0;
                    if ((piece.type !== 'queen' && piece.type !== 'king') && effectiveLevelForArrayIndex > pieceLevelValues.length) {
                        value = pieceLevelValues[pieceLevelValues.length - 1] + (effectiveLevelForArrayIndex - pieceLevelValues.length) * 20;
                    }
                    materialScore += (piece.color === aiColor ? value : -value);
                }
            }
        }
        return materialScore;
    }

    evaluatePositional = (gameState: AIGameState, aiColor: PlayerColor): number => {
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
                    if ((piece.type === 'knight' || piece.type === 'bishop' || piece.type === 'hero') && !piece.hasMoved) {
                        if ((gameState.gameMoveCounter || 0) > 4 && ((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           positionalScore -= this.positionalBonuses.development * multiplier * 0.5;
                        } else if (!((piece.color === 'white' && r === 7) || (piece.color === 'black' && r === 0))) {
                           positionalScore += this.positionalBonuses.development * multiplier;
                        }
                    }
                    if (piece.type === 'pawn' || piece.type === 'commander') {
                        const promotionRank = piece.color === 'white' ? 0 : 7;
                        const distanceToPromotion = Math.abs(r - promotionRank);
                        positionalScore += (6 - distanceToPromotion) * this.positionalBonuses.pawnStructure * multiplier;
                        let isIsolated = true;
                        let isDoubled = false;
                        for(let dr_pawn = -1; dr_pawn <=1; dr_pawn++){
                            if(dr_pawn === 0) continue;
                            const row_pawn_check = gameState.board[r+dr_pawn]?.[c];
                            if(row_pawn_check && row_pawn_check.piece?.type === piece.type && row_pawn_check.piece?.color === piece.color) isDoubled = true;
                        }
                        for(let dc_pawn = -1; dc_pawn <=1; dc_pawn+=2){
                             for(let r_check_pawn = 0; r_check_pawn<8; r_check_pawn++){
                                const adjacent_file_pawn_check = gameState.board[r_check_pawn]?.[c+dc_pawn];
                                if(adjacent_file_pawn_check && adjacent_file_pawn_check.piece?.type === piece.type && adjacent_file_pawn_check.piece?.color === piece.color){
                                    isIsolated = false; break;
                                }
                             }
                             if(!isIsolated) break;
                        }
                        if(isIsolated) positionalScore -= 3 * multiplier;
                        if(isDoubled) positionalScore -= 2 * multiplier;
                    }
                    if (piece.type === 'infiltrator') {
                        const backRank = piece.color === 'white' ? 0 : 7;
                        const distanceToBackRank = Math.abs(r - backRank);
                        positionalScore += (7 - distanceToBackRank) * this.positionalBonuses.infiltratorAdvance * multiplier;
                    }
                }
            }
        }
        return positionalScore;
    }

    evaluateKingSafety = (gameState: AIGameState, aiColor: PlayerColor, isKingSafetyCheck: boolean = false): number => {
        let safetyScore = 0;
        const kingPos = this.findKing(gameState, aiColor);
        const opponentColor = aiColor === 'white' ? 'black' : 'white';
        const callId = isKingSafetyCheck ? `KS_EVAL_${Date.now()}_${Math.random().toString(36).substring(7)}` : null;
        aiLog(`[AI_DEBUG_EVAL_KING_SAFETY_ENTRY] For ${aiColor}.`, isKingSafetyCheck, callId);


        if (kingPos) {
            if (this.isInCheck(gameState, aiColor, true)) { 
                safetyScore -= 200;
            }
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
            if (pawnShields < 2) safetyScore -= (2-pawnShields) * this.positionalBonuses.kingSafety;
            safetyScore -= this.countDirectThreats(gameState, kingPos.row, kingPos.col, opponentColor, isKingSafetyCheck, callId) * 15;
        }
        const opponentKingPos = this.findKing(gameState, opponentColor);
        if (opponentKingPos) {
            if (this.isInCheck(gameState, opponentColor, true)) { 
                safetyScore += 100;
            }
             safetyScore += this.countDirectThreats(gameState, opponentKingPos.row, opponentKingPos.col, aiColor, isKingSafetyCheck, callId) * 10;
        }
        aiLog(`[AI_DEBUG_EVAL_KING_SAFETY_RESULT] Score for ${aiColor}: ${safetyScore}.`, isKingSafetyCheck, callId);
        return safetyScore;
    }

    countDirectThreats = (gameState: AIGameState, kingRow: number, kingCol: number, attackerColor: PlayerColor, isKingSafetyCheck: boolean = false, parentCallId?: string | null): number => {
        let threats = 0;
        const callId = (parentCallId && isKingSafetyCheck) ? parentCallId : (isKingSafetyCheck ? `KS_COUNT_THREATS_${Date.now()}_${Math.random().toString(36).substring(7)}` : null);
        aiLog(`[AI_DEBUG_COUNT_THREATS_ENTRY] King at ${coordsToAlgebraic(kingRow,kingCol)}, attacker: ${attackerColor}.`, isKingSafetyCheck, callId);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const squareState = gameState.board[r]?.[c];
                if (!squareState) continue;
                const piece = squareState.piece;
                if (piece && piece.color === attackerColor) {
                    // Simplified threat check, doesn't account for blocks for speed in eval
                    if (piece.type === 'queen' || piece.type === 'rook') {
                        if (r === kingRow || c === kingCol) threats++;
                    }
                    if (piece.type === 'queen' || piece.type === 'bishop') {
                        if (Math.abs(r - kingRow) === Math.abs(c - kingCol)) threats++;
                    }
                    if (piece.type === 'knight' || piece.type === 'hero') {
                        if ((Math.abs(r - kingRow) === 2 && Math.abs(c - kingCol) === 1) || (Math.abs(r - kingRow) === 1 && Math.abs(c - kingCol) === 2)) threats++;
                    }
                }
            }
        }
        aiLog(`[AI_DEBUG_COUNT_THREATS_RESULT] Threats: ${threats}.`, isKingSafetyCheck, callId);
        return threats;
    }

    evaluateKillStreaks = (gameState: AIGameState, aiColor: PlayerColor): number => {
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

    evaluateSpecialAbilitiesAndLevels = (gameState: AIGameState, aiColor: PlayerColor): number => {
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
                        abilitiesScore += (pieceActualLevel -1) * 15 * multiplier;
                        if (piece.type === 'queen' && pieceActualLevel === 7) {
                            abilitiesScore += 70 * multiplier;
                        }
                        if (piece.type === 'bishop' && pieceActualLevel >= 3){
                            abilitiesScore += 25 * multiplier;
                        }
                         if (piece.type === 'pawn' || piece.type === 'commander') {
                            const promotionRank = piece.color === 'white' ? 0 : 7;
                            const distanceToPromotion = Math.abs(r - promotionRank);
                             abilitiesScore += (7 - distanceToPromotion) * 8 * multiplier;
                             if (pieceActualLevel >= 5) abilitiesScore += 30 * multiplier;
                         }
                         if (piece.type === 'commander') {
                            abilitiesScore += 40 * multiplier;
                         }
                         if (piece.type === 'hero') {
                             abilitiesScore += 100 * multiplier;
                         }
                         if (piece.type === 'infiltrator') {
                            const backRank = piece.color === 'white' ? 0 : 7;
                            if (Math.abs(r - backRank) <= 1) {
                                abilitiesScore += 200 * multiplier;
                            }
                         }
                    }
                }
            }
        }
        return abilitiesScore;
    }

    isPieceInvulnerableToAttackAI = (targetPiece: Piece | null, attackingPiece: Piece | null): boolean => {
        return isPieceInvulnerableToAttackUtil(targetPiece, attackingPiece);
    }

    findPieceCoords = (gameState: AIGameState, pieceId: string): {row: number, col: number} | null => {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (gameState.board[r]?.[c]?.piece?.id === pieceId) {
                    return {row: r, col: c};
                }
            }
        }
        return null;
    }

    generateAllMoves = (originalGameState: AIGameState, color: PlayerColor): AIMove[] => {
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
                        aiLog(`Error generating moves for piece at ${r},${c}:`, false, null, e);
                    }
                }
            }
        }
        const localGameStateCopyForFilter: AIGameState = {
            ...originalGameState,
            board: newBoardState,
            capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
        };
        const legalMoves = allPossibleMoves.filter(move => {
            try {
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
                    currentPlayer: color
                };
                const tempState = this.makeMoveOptimized(tempStateValidationCopy, move, color);
                return !this.isInCheck(tempState, color, AI_DEBUG_KING_SAFETY_ONLY);
            } catch (e) {
                aiLog("Error during legal move filtering:", false, null, e, move);
                return false;
            }
        });
        return legalMoves;
    }

    generatePieceMovesOptimized = (gameState: AIGameState, row: number, col: number, piece: Piece): AIMove[] => {
        const moves: AIMove[] = [];
        switch (piece.type) {
            case 'pawn':      this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'commander': this.addPawnMoves(moves, gameState, row, col, piece);   break;
            case 'infiltrator':this.addInfiltratorMoves(moves, gameState, row, col, piece); break;
            case 'knight':    this.addKnightMoves(moves, gameState, row, col, piece); break;
            case 'hero':      this.addKnightMoves(moves, gameState, row, col, piece); break;
            case 'bishop':    this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.bishop); break;
            case 'rook':      this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.rook);   break;
            case 'queen':     this.addSlidingMoves(moves, gameState, row, col, piece, this.directions.queen);  break;
            case 'king':      this.addKingMoves(moves, gameState, row, col, piece);   break;
        }
        this.addSpecialMoves(moves, gameState, row, col, piece);
        return moves;
    }

    addSpecialMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) => {
        const pieceActualLevel = Number(piece.level || 1);
        if ((piece.type === 'knight' || piece.type === 'hero') && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 5) {
            moves.push({ from: [r, c], to: [r, c], type: 'self-destruct' });
        }
        if (((piece.type === 'knight' || piece.type === 'hero') && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4) ||
            (piece.type === 'bishop' && typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4)) {
            const targetTypeForSwap = (piece.type === 'knight' || piece.type === 'hero') ? 'bishop' : (piece.type === 'bishop' ? 'knight' : null);
            if (targetTypeForSwap) {
                for (let R_idx = 0; R_idx < 8; R_idx++) {
                    for (let C_idx = 0; C_idx < 8; C_idx++) {
                        const targetSquare = gameState.board[R_idx]?.[C_idx];
                        const canSwapWithTarget = targetTypeForSwap === 'knight' ? (targetSquare?.piece?.type === 'knight' || targetSquare?.piece?.type === 'hero') : targetSquare?.piece?.type === targetTypeForSwap;
                        if (targetSquare?.piece && targetSquare.piece.color === piece.color && canSwapWithTarget && !targetSquare.item ) {
                            moves.push({ from: [r, c], to: [R_idx, C_idx], type: 'swap' });
                        }
                    }
                }
            }
        }
    }

    addPawnMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) => {
        const dir = piece.color === 'white' ? -1 : 1;
        const startRow = piece.color === 'white' ? 6 : 1;
        const promotionRank = piece.color === 'white' ? 0 : 7;
        const levelPawn = Number(piece.level || 1);
        const board = gameState.board;
        const r_plus_dir = r + dir;
        if (this.isValidSquareAI(r_plus_dir, c)) {
            const forwardSquare = board[r_plus_dir]?.[c];
            if (forwardSquare && !forwardSquare.piece && !forwardSquare.item ) {
                if (r_plus_dir === promotionRank) {
                    if (piece.type === 'commander') {
                        moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'promotion', promoteTo: 'hero' });
                    } else {
                        ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'promotion', promoteTo: pt as PieceType }));
                    }
                } else {
                    moves.push({ from: [r,c], to: [r_plus_dir, c], type: 'move' });
                }
                if (r === startRow && !piece.hasMoved && this.isValidSquareAI(r + 2 * dir, c)) {
                    const intermediateSquare = board[r_plus_dir]?.[c];
                    const doubleForwardSquare = board[r + 2 * dir]?.[c];
                    if (intermediateSquare && doubleForwardSquare && !intermediateSquare.piece && !intermediateSquare.item && !doubleForwardSquare.piece && !doubleForwardSquare.item ) {
                        moves.push({ from: [r,c], to: [r + 2 * dir, c], type: 'move' });
                    }
                }
            }
        }
        [-1, 1].forEach(dc_val => {
            const capture_r = r + dir;
            const capture_c = c + dc_val;
            if (this.isValidSquareAI(capture_r, capture_c)) {
                const targetSquareState = board[capture_r]?.[capture_c];
                if (!targetSquareState || targetSquareState.item) return;

                const targetPiece = targetSquareState.piece;
                if (targetPiece && targetPiece.color !== piece.color && !this.isPieceInvulnerableToAttackAI(targetPiece, piece) ) {
                     if (capture_r === promotionRank) {
                        if (piece.type === 'commander') {
                            moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'promotion', promoteTo: 'hero' });
                        } else {
                            ['queen', 'rook', 'bishop', 'knight'].forEach(pt => moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'promotion', promoteTo: pt as PieceType }));
                        }
                     } else {
                        moves.push({ from: [r,c], to: [capture_r, capture_c], type: 'capture' });
                     }
                }
            }
        });
        if (gameState.enPassantTargetSquare) {
            const {row: epR, col: epC} = algebraicToCoords(gameState.enPassantTargetSquare);
            if (Math.abs(c - epC) === 1 && r + dir === epR) {
                const capturedPawnActualRow = piece.color === 'white' ? epR + 1 : epR - 1;
                if (gameState.board[capturedPawnActualRow]?.[epC]?.piece?.type === 'pawn') {
                    moves.push({ from: [r,c], to: [epR, epC], type: 'enpassant'});
                }
            }
        }

        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 2) {
            const r_minus_dir = r-dir;
            if (this.isValidSquareAI(r_minus_dir, c)) {
                const backwardSquare = board[r_minus_dir]?.[c];
                if (backwardSquare && !backwardSquare.piece && !backwardSquare.item ) {
                    moves.push({ from: [r,c], to: [r_minus_dir, c], type: 'move' });
                }
            }
        }
        if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 3) {
            [-1, 1].forEach(dc_side => {
                const side_c = c + dc_side;
                if (this.isValidSquareAI(r, side_c)) {
                    const sideSquare = board[r]?.[side_c];
                    if (sideSquare && !sideSquare.piece && !sideSquare.item ) {
                        moves.push({ from: [r,c], to: [r, side_c], type: 'move' });
                    }
                }
            });
        }
    }

    addInfiltratorMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) => {
        const dir = piece.color === 'white' ? -1 : 1;
        const board = gameState.board;
        const targetOffsets = [
            {dr: dir, dc: 0},    // Forward
            {dr: dir, dc: -1},   // Forward-left diagonal
            {dr: dir, dc: 1}     // Forward-right diagonal
        ];

        targetOffsets.forEach(offset => {
            const targetR = r + offset.dr;
            const targetC = c + offset.dc;

            if (this.isValidSquareAI(targetR, targetC)) {
                const targetSquareState = board[targetR]?.[targetC];
                if (targetSquareState && !targetSquareState.item) {
                    const targetPiece = targetSquareState.piece;
                    if (!targetPiece) { // Move to empty square
                        moves.push({ from: [r,c], to: [targetR, targetC], type: 'move' });
                    } else if (targetPiece.color !== piece.color && !this.isPieceInvulnerableToAttackAI(targetPiece, piece)) { // Capture
                        moves.push({ from: [r,c], to: [targetR, targetC], type: 'capture' });
                    }
                }
            }
        });
    }

    addKnightMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) => {
        const level = Number(piece.level || 1);
        const board = gameState.board;
        this.knightMoves.forEach(([dr, dc]) => {
            const R = r + dr; const C = c + dc;
            if (this.isValidSquareAI(R, C)) {
                const targetSquareState = board[R]?.[C];
                if (targetSquareState && !targetSquareState.item ) {
                    const target = targetSquareState.piece;
                    if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttackAI(target, piece))) {
                        moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                    }
                }
            }
        });
        if (typeof level === 'number' && !isNaN(level) && level >= 2) {
            [[ -1, 0 ], [ 1, 0 ], [ 0, -1 ], [ 0, 1 ]].forEach(([dr,dc]) => {
                const R = r + dr; const C = c + dc;
                 if (this.isValidSquareAI(R, C)) {
                    const targetSquareState = board[R]?.[C];
                    if (targetSquareState && !targetSquareState.item ) {
                        const target = targetSquareState.piece;
                        if (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttackAI(target, piece))) {
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
                    const targetSquareState = board[R]?.[C];
                    if (targetSquareState && !targetSquareState.item ) {
                        const target = targetSquareState.piece;
                        const mid1R = r + Math.sign(dr); const mid1C = c + Math.sign(dc);
                        const mid2R = r + 2 * Math.sign(dr); const mid2C = c + 2 * Math.sign(dc);

                        let pathBlocked = false;
                        if (this.isValidSquareAI(mid1R, mid1C) && (board[mid1R]?.[mid1C]?.piece || board[mid1R]?.[mid1C]?.item )) pathBlocked = true;
                        if (!pathBlocked && this.isValidSquareAI(mid2R, mid2C) && (board[mid2R]?.[mid2C]?.piece || board[mid2R]?.[mid2C]?.item )) pathBlocked = true;

                        if (!pathBlocked && (!target || (target.color !== piece.color && !this.isPieceInvulnerableToAttackAI(target, piece)))) {
                            moves.push({ from: [r,c], to: [R,C], type: target ? 'capture' : 'move' });
                        }
                    }
                }
            });
        }
    }

    addSlidingMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece, directions: [number,number][]) => {
        const pieceActualLevel = Number(piece.level || 1);
        const board = gameState.board;
        directions.forEach(([dr, dc]) => {
            for (let i = 1; i < 8; i++) {
                const R = r + i * dr; const C = c + i * dc;
                if (!this.isValidSquareAI(R, C)) break;
                const targetSquareState = board[R]?.[C];
                if(!targetSquareState || targetSquareState.item) break;

                const targetPiece = targetSquareState.piece;
                if (!targetPiece) {
                     moves.push({ from: [r,c], to: [R,C], type: 'move' });
                } else {
                    if (targetPiece.color !== piece.color) {
                        if (!this.isPieceInvulnerableToAttackAI(targetPiece, piece) ) {
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

    addKingMoves = (moves: AIMove[], gameState: AIGameState, r: number, c: number, piece: Piece) => {
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
                    const targetSquareKingState = board[R_k]?.[C_k];
                    if (targetSquareKingState && !targetSquareKingState.item ) {
                        if (maxDist === 2 && (Math.abs(dr_k) === 2 || Math.abs(dc_k) === 2)) {
                            const midR_k = r + Math.sign(dr_k);
                            const midC_k = c + Math.sign(dc_k);
                            if (!this.isValidSquareAI(midR_k, midC_k) || board[midR_k]?.[midC_k]?.piece || board[midR_k]?.[midC_k]?.item ||
                                this.isSquareAttackedAI(gameState, midR_k, midC_k, opponentColor, AI_DEBUG_KING_SAFETY_ONLY, null, [R_k, C_k] )) {
                                continue;
                            }
                        }
                        const target_k = targetSquareKingState.piece;
                         if (!target_k || (target_k.color !== piece.color && !this.isPieceInvulnerableToAttackAI(target_k, piece))) {
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
                    const targetSquareKnightMoveState = board[R_n]?.[C_n];
                    if (targetSquareKnightMoveState && !targetSquareKnightMoveState.item ){
                        const target_n = targetSquareKnightMoveState.piece;
                        if (!target_n || (target_n.color !== piece.color && !this.isPieceInvulnerableToAttackAI(target_n, piece))) {
                             moves.push({ from: [r,c], to: [R_n,C_n], type: target_n ? 'capture' : 'move' });
                        }
                    }
                }
            });
        }
        if (!piece.hasMoved && !this.isInCheck(gameState, piece.color, AI_DEBUG_KING_SAFETY_ONLY)) {
            if (this.canCastle(gameState, piece.color, true, r, c)) {
                moves.push({ from: [r,c], to: [r, c + 2], type: 'castle' });
            }
            if (this.canCastle(gameState, piece.color, false, r, c)) {
                moves.push({ from: [r,c], to: [r, c - 2], type: 'castle' });
            }
        }
    }

    isLegalMoveQuick = (originalGameState: AIGameState, move: AIMove, color: PlayerColor): boolean => {
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
             capturedPieces: {
                white: originalGameState.capturedPieces?.white?.map(p => ({ ...p })) || [],
                black: originalGameState.capturedPieces?.black?.map(p => ({ ...p })) || [],
            },
            killStreaks: originalGameState.killStreaks ? { ...originalGameState.killStreaks } : { white: 0, black: 0 }
        };

        const resultingState = this.makeMoveOptimized(tempStateForLegalityCheck, move, color);
        return !this.isInCheck(resultingState, color, AI_DEBUG_KING_SAFETY_ONLY);
    }

    isInCheck = (gameState: AIGameState, color: PlayerColor, isKingSafetyCheck: boolean = false): boolean => {
        const callId = isKingSafetyCheck ? `KS_IN_CHECK_${Date.now()}_${Math.random().toString(36).substring(7)}` : null;
        aiLog(`[AI_DEBUG_IS_IN_CHECK_ENTRY] For color: ${color}. isKingSafetyCheck: ${isKingSafetyCheck}`, isKingSafetyCheck, callId);

        const kingPos = this.findKing(gameState, color);
        aiLog(`[AI_DEBUG_IS_IN_CHECK_KING_POS] King for ${color} found at: ${kingPos ? `${coordsToAlgebraic(kingPos.row, kingPos.col)} (${kingPos.row},${kingPos.col})` : 'NONE'}`, isKingSafetyCheck, callId);

        if (!kingPos) return true;
        const opponentColorForCheck = color === 'white' ? 'black' : 'white';
        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                const attackerSquareState = gameState.board[r_att]?.[c_att];
                if (!attackerSquareState) continue;
                const attackerPiece = attackerSquareState.piece;
                if (attackerPiece && attackerPiece.color === opponentColorForCheck) {
                    if (this.canAttackSquare(gameState, [r_att,c_att], [kingPos.row, kingPos.col], attackerPiece, isKingSafetyCheck, callId)) {
                        aiLog(`[AI_DEBUG_IS_IN_CHECK_RESULT] King ${color} at ${coordsToAlgebraic(kingPos.row, kingPos.col)} IS attacked by ${attackerPiece.color} ${attackerPiece.type} at ${coordsToAlgebraic(r_att,c_att)}. RESULT: true`, isKingSafetyCheck, callId);
                        return true;
                    }
                }
            }
        }
        aiLog(`[AI_DEBUG_IS_IN_CHECK_RESULT] King ${color} at ${kingPos ? coordsToAlgebraic(kingPos.row, kingPos.col) : 'N/A'} is NOT in check. RESULT: false`, isKingSafetyCheck, callId);
        return false;
    }

    isGameOver = (gameState: AIGameState): boolean => {
        if(gameState.gameOver) return true;
        if (!this.findKing(gameState, 'white') || !this.findKing(gameState, 'black')) return true;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = gameState.board[r]?.[c]?.piece;
                if (piece?.type === 'infiltrator') {
                    const backRank = piece.color === 'white' ? 0 : 7;
                    if (r === backRank) {
                        gameState.winner = piece.color;
                        gameState.gameOver = true;
                        return true;
                    }
                }
            }
        }


        const playerToMove = gameState.currentPlayer;
        if (!playerToMove) {
            return false;
        }

        const tempGameStateForMoveGen: AIGameState = {...gameState, currentPlayer: playerToMove};
        const legalMoves = this.generateAllMoves(tempGameStateForMoveGen, playerToMove);

        if (legalMoves.length === 0) {
            if (this.isInCheck(gameState, playerToMove, AI_DEBUG_KING_SAFETY_ONLY)) {
                gameState.winner = playerToMove === 'white' ? 'black' : 'white';
            } else {
                gameState.winner = 'draw';
            }
            gameState.gameOver = true;
            return true;
        }
        return false;
    }

    canCastle = (gameState: AIGameState, color: PlayerColor, kingside: boolean, kingRow: number, kingCol: number): boolean => {
        const kingSquareState = gameState.board[kingRow]?.[kingCol];
        if (!kingSquareState || !kingSquareState.piece || kingSquareState.piece.hasMoved) return false;

        const rookCol = kingside ? 7 : 0;
        const rookSquareState = gameState.board[kingRow]?.[rookCol];
        if (!rookSquareState || !rookSquareState.piece || rookSquareState.piece.type !== 'rook' || rookSquareState.piece.hasMoved) return false;

        const pathStartCol = kingside ? kingCol + 1 : rookCol + 1;
        const pathEndCol = kingside ? rookCol -1 : kingCol -1;

        for (let c_path = Math.min(pathStartCol, pathEndCol); c_path <= Math.max(pathStartCol, pathEndCol); c_path++) {
            if (gameState.board[kingRow]?.[c_path]?.piece || gameState.board[kingRow]?.[c_path]?.item ) return false;
        }
        const opponentColorForCastle = color === 'white' ? 'black' : 'white';
        const squaresToCheck: [number, number][] = [[kingRow, kingCol]];
        if (kingside) {
            squaresToCheck.push([kingRow, kingCol + 1], [kingRow, kingCol + 2]);
        } else {
            squaresToCheck.push([kingRow, kingCol - 1], [kingRow, kingCol - 2]);
        }

        for (const [r_check, c_check] of squaresToCheck) {
             if (this.isSquareAttackedAI(gameState, r_check, c_check, opponentColorForCastle, AI_DEBUG_KING_SAFETY_ONLY)) return false;
        }
        return true;
    }

    isSquareAttackedAI = (gameState: AIGameState, r_target: number, c_target: number, attackerColor: PlayerColor, isKingSafetyCheck: boolean = false, parentCallId?: string | null, ignoreAttackerAtCoords?: [number, number] | null): boolean => {
        const callId = (parentCallId && isKingSafetyCheck) ? parentCallId : (isKingSafetyCheck ? `KS_SQ_ATT_${Date.now()}_${Math.random().toString(36).substring(7)}` : null);
        const targetAlgForLog = coordsToAlgebraic(r_target, c_target);
        aiLog(`[AI_DEBUG_IS_SQ_ATTACKED_AI_ENTRY] Target: ${targetAlgForLog} (${r_target},${c_target}) by ${attackerColor}. IgnoreAttackerAt: ${ignoreAttackerAtCoords ? coordsToAlgebraic(ignoreAttackerAtCoords[0], ignoreAttackerAtCoords[1]) : 'None'}`, isKingSafetyCheck, callId);

        for (let r_att = 0; r_att < 8; r_att++) {
            for (let c_att = 0; c_att < 8; c_att++) {
                if (ignoreAttackerAtCoords && r_att === ignoreAttackerAtCoords[0] && c_att === ignoreAttackerAtCoords[1]) {
                    aiLog(`    [AI_DEBUG_IS_SQ_ATTACKED_AI_IGNORE] Skipping ignored attacker at ${coordsToAlgebraic(r_att,c_att)}`, isKingSafetyCheck, callId);
                    continue;
                }
                const squareState = gameState.board[r_att]?.[c_att];
                if(!squareState) continue;
                const piece = squareState.piece;
                if(piece && piece.color === attackerColor){
                    if (this.canAttackSquare(gameState, [r_att,c_att], [r_target, c_target], piece, isKingSafetyCheck, callId)) {
                        aiLog(`    [AI_DEBUG_IS_SQ_ATTACKED_AI_RESULT] Target ${targetAlgForLog} IS attacked by ${piece.color} ${piece.type} at ${coordsToAlgebraic(r_att,c_att)}. RESULT: true`, isKingSafetyCheck, callId);
                        return true;
                    }
                }
            }
        }
        aiLog(`    [AI_DEBUG_IS_SQ_ATTACKED_AI_RESULT] Target ${targetAlgForLog} is NOT attacked by ${attackerColor}. RESULT: false`, isKingSafetyCheck, callId);
        return false;
    }

    canAttackSquare = (gameState: AIGameState, from: [number, number], to: [number, number], piece: Piece, isKingSafetyCheck: boolean = false, parentCallId?: string | null): boolean => {
        const callId = (parentCallId && isKingSafetyCheck) ? parentCallId : (isKingSafetyCheck ? `KS_CAN_ATT_${Date.now()}_${Math.random().toString(36).substring(7)}` : null);
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = toRow - fromRow;
        const deltaCol = toCol - fromCol;

        const fromAlgForLog = coordsToAlgebraic(fromRow, fromCol);
        const toAlgForLog = coordsToAlgebraic(toRow, toCol);
        aiLog(`[AI_DEBUG_CAN_ATTACK_SQUARE_ENTRY] Attacker: ${piece.color} ${piece.type} L${piece.level} from ${fromAlgForLog} to ${toAlgForLog}. IsKingSafetyCheck: ${isKingSafetyCheck}`, isKingSafetyCheck, callId);


        const targetSquareState = gameState.board[toRow]?.[toCol];
        if (!targetSquareState) {
            aiLog(`    [AI_DEBUG_CAN_ATTACK_SQUARE_RESULT] Target square invalid. Result: false`, isKingSafetyCheck, callId);
            return false;
        }

        const pieceOnAttackedSquare = targetSquareState.piece;
        if (pieceOnAttackedSquare && this.isPieceInvulnerableToAttackAI(pieceOnAttackedSquare, piece)) {
             aiLog(`    [AI_DEBUG_CAN_ATTACK_SQUARE_RESULT] Target ${pieceOnAttackedSquare.color}${pieceOnAttackedSquare.type} is invulnerable. Result: false`, isKingSafetyCheck, callId);
             return false;
        }

        let canAttackResult = false;
        switch (piece.type) {
            case 'pawn':
            case 'commander':
                const direction = piece.color === 'white' ? -1 : 1;
                canAttackResult = deltaRow === direction && Math.abs(deltaCol) === 1 && !targetSquareState.item;
                break;
            case 'infiltrator':
                const infiltratorDir = piece.color === 'white' ? -1 : 1;
                canAttackResult = deltaRow === infiltratorDir && (deltaCol === 0 || Math.abs(deltaCol) === 1) && !targetSquareState.item;
                break;
            case 'knight':
            case 'hero':
                const knightActualLevel = Number(piece.level || 1);
                if ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2)) canAttackResult = !targetSquareState.item;
                else if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=2 && ((deltaRow === 0 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && deltaCol === 0))) canAttackResult = !targetSquareState.item;
                else if (typeof knightActualLevel === 'number' && !isNaN(knightActualLevel) && knightActualLevel >=3 && ((deltaRow === 0 && Math.abs(deltaCol) === 3) || (Math.abs(deltaRow) === 3 && deltaCol === 0))) {
                    const stepR = Math.sign(deltaRow);
                    const stepC = Math.sign(deltaCol);
                    let pathBlocked = false;
                    if (this.isValidSquareAI(fromRow + stepR, fromCol + stepC) && (gameState.board[fromRow + stepR]?.[fromCol + stepC]?.piece || gameState.board[fromRow + stepR]?.[fromCol + stepC]?.item )) pathBlocked = true;
                    if (!pathBlocked && this.isValidSquareAI(fromRow + 2*stepR, fromCol + 2*stepC) && (gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.piece || gameState.board[fromRow + 2*stepR]?.[fromCol + 2*stepC]?.item )) pathBlocked = true;
                    canAttackResult = !pathBlocked && !targetSquareState.item;
                }
                break;
            case 'bishop':
                canAttackResult = Math.abs(deltaRow) === Math.abs(deltaCol) && this.isPathClear(gameState.board, from, to, piece, isKingSafetyCheck, callId) && !targetSquareState.item;
                break;
            case 'rook':
                canAttackResult = (deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece, isKingSafetyCheck, callId) && !targetSquareState.item;
                break;
            case 'queen':
                canAttackResult = (Math.abs(deltaRow) === Math.abs(deltaCol) || deltaRow === 0 || deltaCol === 0) && this.isPathClear(gameState.board, from, to, piece, isKingSafetyCheck, callId) && !targetSquareState.item;
                break;
            case 'king':
                const kingActualLevelForAttack = Number(piece.level || 1);
                let effectiveMaxDist = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 2 && !isKingSafetyCheck) ? 2 : 1; // Simplified for direct attack check
                let canUseKnightMove = (typeof kingActualLevelForAttack === 'number' && !isNaN(kingActualLevelForAttack) && kingActualLevelForAttack >= 5 && !isKingSafetyCheck); // Simplified

                if (Math.abs(deltaRow) <= effectiveMaxDist && Math.abs(deltaCol) <= effectiveMaxDist && (deltaRow === 0 || deltaCol === 0 || Math.abs(deltaRow) === Math.abs(deltaCol))) {
                    if (effectiveMaxDist === 2 && (Math.abs(deltaRow) === 2 || Math.abs(deltaCol) === 2)) {
                        const midR = fromRow + Math.sign(deltaRow);
                        const midC = fromCol + Math.sign(deltaCol);
                        if (this.isValidSquareAI(midR, midC) && (gameState.board[midR]?.[midC]?.piece || gameState.board[midR]?.[midC]?.item )) { canAttackResult = false; break; }
                    }
                    canAttackResult = !targetSquareState.item;
                    break;
                }
                if (canUseKnightMove && ((Math.abs(deltaRow) === 2 && Math.abs(deltaCol) === 1) || (Math.abs(deltaRow) === 1 && Math.abs(deltaCol) === 2))) {
                    canAttackResult = !targetSquareState.item;
                }
                break;
            default:
                canAttackResult = false;
        }
        aiLog(`    [AI_DEBUG_CAN_ATTACK_SQUARE_RESULT] Final Result for ${fromAlgForLog} to ${toAlgForLog} (Type: ${piece.type}): ${canAttackResult}`, isKingSafetyCheck, callId);
        return canAttackResult;
    }

    isPathClear = (board: AIBoardState, from: [number, number], to: [number, number], piece: Piece, isKingSafetyCheck: boolean = false, parentCallId?: string | null): boolean => {
        const callId = (parentCallId && isKingSafetyCheck) ? parentCallId : (isKingSafetyCheck ? `KS_PATH_CLR_${Date.now()}_${Math.random().toString(36).substring(7)}` : null);
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const deltaRow = Math.sign(toRow - fromRow);
        const deltaCol = Math.sign(toCol - fromCol);

        let r_path = fromRow + deltaRow;
        let c_path = fromCol + deltaCol;

        const fromAlgForLog = coordsToAlgebraic(fromRow, fromCol);
        const toAlgForLog = coordsToAlgebraic(toRow, toCol);
        aiLog(`[AI_DEBUG_PATH_CLEAR_ENTRY] Path for ${piece.color} ${piece.type} L${piece.level} from ${fromAlgForLog} to ${toAlgForLog}. IsKingSafetyCheck: ${isKingSafetyCheck}`, isKingSafetyCheck, callId);

        while (r_path !== toRow || c_path !== toCol) {
            if (!this.isValidSquareAI(r_path,c_path)) {
                aiLog(`    [AI_DEBUG_PATH_CLEAR_BLOCKED] Invalid intermediate square: ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`, isKingSafetyCheck, callId);
                return false;
            }
            const pathSquareState = board[r_path]?.[c_path];
            if (!pathSquareState) {
                 aiLog(`    [AI_DEBUG_PATH_CLEAR_BLOCKED] Undefined pathSquareState at ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`, isKingSafetyCheck, callId);
                return false;
            }

            if (pathSquareState.item) {
                aiLog(`    [AI_DEBUG_PATH_CLEAR_BLOCKED] Item ${pathSquareState.item.type} at intermediate ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`, isKingSafetyCheck, callId);
                return false;
            }

            const pathPiece = pathSquareState.piece;
            if (pathPiece) {
                if (piece.type === 'bishop' && (Number(piece.level||1)) >= 2 && pathPiece.color === piece.color) {
                    aiLog(`    [AI_DEBUG_PATH_CLEAR_JUMP] Bishop L${piece.level} jumping friendly ${pathPiece.type} at ${coordsToAlgebraic(r_path,c_path)}.`, isKingSafetyCheck, callId);
                } else {
                    aiLog(`    [AI_DEBUG_PATH_CLEAR_BLOCKED] Piece ${pathPiece.color}${pathPiece.type} at intermediate ${coordsToAlgebraic(r_path,c_path)}. Path Clear: false`, isKingSafetyCheck, callId);
                    return false;
                }
            } else {
                 aiLog(`    [AI_DEBUG_PATH_CLEAR_EMPTY] Intermediate ${coordsToAlgebraic(r_path,c_path)} is empty.`, isKingSafetyCheck, callId);
            }
            r_path += deltaRow;
            c_path += deltaCol;
        }
        aiLog(`[AI_DEBUG_PATH_CLEAR_SUCCESS] Path Clear for ${piece.color} ${piece.type} from ${fromAlgForLog} to ${toAlgForLog}: true`, isKingSafetyCheck, callId);
        return true;
    }

    findKing = (gameState: AIGameState, color: PlayerColor): { row: number; col: number; piece: Piece } | null => {
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

    isValidSquareAI = (row: number, col: number): boolean => {
        return isValidSquareUtil(row, col);
    }

    countAdjacentEnemies = (gameState: AIGameState, row: number, col: number, color: PlayerColor): number => {
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

    quickEvaluateMove = (gameState: AIGameState, move: AIMove, playerColor: PlayerColor): number => {
        let score = 0;
        const [toR, toC] = move.to;
        const targetSquareState = gameState.board[toR]?.[toC];
        if (!targetSquareState || targetSquareState.item) return -Infinity;

        const targetPiece = targetSquareState.piece;
        if (targetPiece && targetPiece.color !== playerColor) {
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
                score += capturedValue * 10;
            }
        }
        if (move.type === 'promotion') {
            const promoValue = this.pieceValues[move.promoteTo || 'queen']?.[0] || 0;
            score += promoValue;
        }
        if (move.type === 'enpassant') {
            score += this.pieceValues['pawn'][0] * 10 + 50;
        }
        if (move.type === 'castle') {
            score += 25;
        }
        if (move.type === 'self-destruct') {
            const [fromR_sd, fromC_sd] = move.from;
            const movingPiece = gameState.board[fromR_sd]?.[fromC_sd]?.piece;
            if (movingPiece) {
                for (let dr_sd = -1; dr_sd <= 1; dr_sd++) {
                    for (let dc_sd = -1; dc_sd <=1; dc_sd++) {
                        if (dr_sd ===0 && dc_sd ===0) continue;
                        const adjR_sd = fromR_sd + dr_sd;
                        const adjC_sd = fromC_sd + dc_sd;
                        if (this.isValidSquareAI(adjR_sd, adjC_sd)) {
                            const victimSq = gameState.board[adjR_sd]?.[adjC_sd];
                            if (victimSq && victimSq.item?.type === 'anvil') {
                                score += 10; // Small bonus for clearing an anvil
                            }
                            if (victimSq && victimSq.piece && victimSq.piece.color !== playerColor && victimSq.piece.type !== 'king' && !victimSq.item) {
                                const isQueenTargetForQuickEval = victimSq.piece.type === 'queen';
                                if (isQueenTargetForQuickEval || !this.isPieceInvulnerableToAttackAI(victimSq.piece, movingPiece)) {
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
                                        score += vVal;
                                     }
                                }
                            }
                        }
                    }
                }
            }
        }
        const rcKeyTo = `${toR}${toC}`;
        if (this.centerSquares.has(rcKeyTo)) {
            score += 5;
        } else if (this.nearCenterSquares.has(rcKeyTo)) {
            score += 2;
        }
        return score;
    }

    getPositionKey = (gameState: AIGameState, isMaximizingPlayer: boolean): string => {
        let key = '';
        for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
                const s_state = gameState.board[r_idx]?.[c_idx];
                if (s_state) {
                    const p_piece = s_state.piece;
                    const i_item = s_state.item;
                    if (p_piece) {
                        let pieceChar = '';
                        switch(p_piece.type) {
                            case 'pawn': pieceChar = 'P'; break;
                            case 'knight': pieceChar = 'N'; break;
                            case 'bishop': pieceChar = 'B'; break;
                            case 'rook': pieceChar = 'R'; break;
                            case 'queen': pieceChar = 'Q'; break;
                            case 'king': pieceChar = 'K'; break;
                            case 'commander': pieceChar = 'C'; break;
                            case 'hero': pieceChar = 'H'; break;
                            case 'infiltrator': pieceChar = 'I'; break;
                            default: pieceChar = 'X';
                        }
                        key += `${p_piece.color[0]}${pieceChar}${Number(p_piece.level || 1)}`;
                        if (p_piece.invulnerableTurnsRemaining && p_piece.invulnerableTurnsRemaining > 0) key += `i${p_piece.invulnerableTurnsRemaining}`;
                        if (p_piece.hasMoved) key += 'm';
                    } else if (i_item) {
                        key += `I${i_item.type[0]}`;
                    } else {
                        key += '--';
                    }
                } else {
                    key += 'XX';
                }
            }
        }
        key += `-${gameState.currentPlayer ? gameState.currentPlayer[0] : 'X'}`;
        key += `-${isMaximizingPlayer ? 'M' : 'm'}`;
        key += `-w${gameState.killStreaks?.white || 0}b${gameState.killStreaks?.black || 0}`;
        key += `-g${gameState.gameMoveCounter || 0}`;
        key += `-fb${gameState.firstBloodAchieved ? 'T' : 'F'}${gameState.playerWhoGotFirstBlood ? gameState.playerWhoGotFirstBlood[0] : 'N'}`;
        key += `-ep${gameState.enPassantTargetSquare || '-'}`;
        return key;
    }

    selectPawnForCommanderPromotion = (gameState: AIGameState): [number, number] | null => {
        const availablePawns: {row: number, col: number, score: number}[] = [];
        const aiColor = gameState.currentPlayer;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = gameState.board[r]?.[c];
                if (square?.piece && square.piece.color === aiColor && square.piece.type === 'pawn' && square.piece.level === 1) {
                    let score = 0;
                    if (c >=2 && c <= 5) score += 10;
                    if (aiColor === 'white') {
                        if (r === 5) score += 5;
                        if (r === 4) score += 8;
                    } else {
                        if (r === 2) score += 5;
                        if (r === 3) score += 8;
                    }
                    availablePawns.push({row: r, col: c, score});
                }
            }
        }

        if (availablePawns.length === 0) return null;
        availablePawns.sort((a,b) => b.score - a.score);
        return [availablePawns[0].row, availablePawns[0].col];
    }
}
