
'use client';

import type { ReactNode } from 'react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import {
  initializeBoard,
  applyMove,
  algebraicToCoords,
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  filterLegalMoves,
  coordsToAlgebraic,
  getCastlingRightsString,
  boardToPositionHash,
  type ConversionEvent,
  isPieceInvulnerableToAttack,
  isValidSquare, // Added import
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Bot } from 'lucide-react';
import VibeChessAI from '@/ai/vibe-chess-ai';

let resurrectionIdCounter = 0;

const initialGameStatus: GameStatus = {
  message: "\u00A0",
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  isThreefoldRepetitionDraw: false,
  gameOver: false,
  winner: undefined,
};

function adaptBoardForAI(
  currentBoardState: BoardState,
  playerForAITurn: PlayerColor,
  currentKillStreaks: { white: number; black: number },
  currentCapturedPieces: { white: Piece[]; black: Piece[] }
): any {
  const aiBoard = currentBoardState.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      const pieceForAI: any = {
        ...squareState.piece,
      };
      return pieceForAI;
    })
  );

  return {
    board: aiBoard,
    currentPlayer: playerForAITurn,
    killStreaks: {
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: {
      white: currentCapturedPieces?.white?.map(p => ({ ...p })) || [],
      black: currentCapturedPieces?.black?.map(p => ({ ...p })) || [],
    },
    gameOver: false,
    winner: undefined,
    extraTurn: false,
    autoCheckmate: false,
  };
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({ ...initialGameStatus });
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [positionHistory, setPositionHistory] = useState<string[]>([]);
  const [enemySelectedSquare, setEnemySelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [enemyPossibleMoves, setEnemyPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('flipping');
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  const flashedCheckStateRef = useRef<string | null>(null);
  const [killStreakFlashMessage, setKillStreakFlashMessage] = useState<string | null>(null);
  const [killStreakFlashMessageKey, setKillStreakFlashMessageKey] = useState<number>(0);
  const [showCaptureFlash, setShowCaptureFlash] = useState(false);
  const [captureFlashKey, setCaptureFlashKey] = useState(0);
  const [showCheckFlashBackground, setShowCheckFlashBackground] = useState(false);
  const [checkFlashBackgroundKey, setCheckFlashBackgroundKey] = useState(0);
  const [showCheckmatePatternFlash, setShowCheckmatePatternFlash] = useState(false);
  const [checkmatePatternFlashKey, setCheckmatePatternFlashKey] = useState(0);
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [lastCapturePlayer, setLastCapturePlayer] = useState<PlayerColor | null>(null);
  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef(new VibeChessAI(2)); // AI depth
  const aiErrorOccurredRef = useRef(false);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);

  // States for Rook Sacrifice/Resurrection (previously removed, ensure they are not needed for current logic)
  const [isAwaitingRookSacrifice, setIsAwaitingRookSacrifice] = useState(false);
  const [playerToSacrificeForRook, setPlayerToSacrificeForRook] = useState<PlayerColor | null>(null);
  const [rookToMakeInvulnerable, setRookToMakeInvulnerable] = useState<AlgebraicSquare | null>(null);
  const [boardForRookSacrifice, setBoardForRookSacrifice] = useState<BoardState | null>(null);
  const [originalTurnPlayerForRookSacrifice, setOriginalTurnPlayerForRookSacrifice] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromRookLevelUp, setIsExtraTurnFromRookLevelUp] = useState<boolean>(false);


  const { toast } = useToast();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn;

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  }, [isWhiteAI, isBlackAI]);

  const determineBoardOrientation = useCallback((
    currentViewMode: ViewMode,
    playerForTurn: PlayerColor,
    blackIsCurrentlyAI: boolean,
    whiteIsCurrentlyAI: boolean
  ): PlayerColor => {
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white';
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black';
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white';

    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white';
  }, []);

  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const newOrientation = determineBoardOrientation(viewMode, playerTakingExtraTurn, isBlackAI, isWhiteAI);
    if (newOrientation !== boardOrientation) {
      setBoardOrientation(newOrientation);
    }

    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);

    if (opponentInCheck) {
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins by delivering check with an extra turn!`, duration: 2500 });
      setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn }));
      return;
    }

    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
      setGameInfo(prev => ({ ...prev, message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
    } else {
      setGameInfo(prev => ({ ...prev, message, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setBoardOrientation, setGameInfo]);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';

    const newOrientation = determineBoardOrientation(viewMode, nextPlayer, isBlackAI, isWhiteAI);
    if (newOrientation !== boardOrientation) {
      setBoardOrientation(newOrientation);
    }

    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const inCheck = isKingInCheck(updatedBoard, nextPlayer);
    let newPlayerWithKingInCheck: PlayerColor | null = null;
    let currentMessage = "\u00A0";

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        currentMessage = `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded }));
      } else {
        currentMessage = "Check!";
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
      } else {
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
      }
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, getPlayerDisplayName, determineBoardOrientation, setGameInfo, setBoardOrientation, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


  const processMoveEnd = useCallback((boardAfterMove: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean) => {
    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(boardAfterMove);
    const currentPositionHash = boardToPositionHash(boardAfterMove, nextPlayerForHash, castlingRights);

    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.isCheckmate && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) {
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 2500 });
      setGameInfo(prev => ({
        ...prev,
        message: "Draw by Threefold Repetition!",
        isCheck: false,
        playerWithKingInCheck: null,
        isCheckmate: false,
        isStalemate: true,
        isThreefoldRepetitionDraw: true,
        gameOver: true,
        winner: 'draw',
      }));
      return;
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn]);

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    queenMovedWithThis: Move | null,
    originalQueenLevelIfKnown: number | undefined,
    isExtraTurnFromOriginalMove: boolean
  ): boolean => {
    console.log("SAC_DEBUG: processPawnSacrificeCheck called. Player:", playerWhoseQueenLeveled, "Move:", queenMovedWithThis, "Original Queen Lvl:", originalQueenLevelIfKnown, "Is Extra Turn:", isExtraTurnFromOriginalMove);
    
    if (!queenMovedWithThis) {
        console.log("SAC_DEBUG: No queen move data, cannot process sacrifice. Calling processMoveEnd.");
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
        return false;
    }

    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenAfterLeveling = boardAfterPrimaryMove[toR]?.[toC]?.piece;
    console.log("SAC_DEBUG: Queen on board after move:", queenAfterLeveling);

    const {row: fromRPrev, col: fromCPrev} = algebraicToCoords(queenMovedWithThis.from);
    const queenBeforeMove = board[fromRPrev]?.[fromCPrev]?.piece;
    const originalLevel = originalQueenLevelIfKnown !== undefined 
        ? originalQueenLevelIfKnown 
        : (queenBeforeMove && queenBeforeMove.type === 'queen' ? (queenBeforeMove.level || 1) : 0);

    console.log("SAC_DEBUG: Original Queen Level (derived from 'board' state):", originalLevel, "Piece on from square before move:", queenBeforeMove);

    const conditionMet = queenAfterLeveling &&
      queenAfterLeveling.type === 'queen' &&
      queenAfterLeveling.color === playerWhoseQueenLeveled &&
      queenAfterLeveling.level >= 5 &&
      originalLevel < 5;

    console.log("SAC_DEBUG: Sacrifice conditionMet:", conditionMet);

    if (conditionMet) {
      let hasPawnsToSacrifice = false;
      for (const row of boardAfterPrimaryMove) {
        for (const square of row) {
          if (square.piece && square.piece.type === 'pawn' && square.piece.color === playerWhoseQueenLeveled) {
            hasPawnsToSacrifice = true;
            break;
          }
        }
        if (hasPawnsToSacrifice) break;
      }
      console.log("SAC_DEBUG: Has pawns to sacrifice:", hasPawnsToSacrifice);

      if (hasPawnsToSacrifice) {
        const isCurrentPlayerAI = (playerWhoseQueenLeveled === 'white' && isWhiteAI) || (playerWhoseQueenLeveled === 'black' && isBlackAI);
        if (isCurrentPlayerAI) {
          console.log("SAC_DEBUG: AI to sacrifice pawn.");
          let pawnSacrificed = false;
          const boardCopyForAISacrifice = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          let sacrificedAIPawn: Piece | null = null;

          for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
              const pieceAtSquare = boardCopyForAISacrifice[r_idx][c_idx].piece;
              if (pieceAtSquare?.type === 'pawn' && pieceAtSquare?.color === playerWhoseQueenLeveled) {
                sacrificedAIPawn = { ...pieceAtSquare };
                boardCopyForAISacrifice[r_idx][c_idx].piece = null;
                pawnSacrificed = true;
                console.log("SAC_DEBUG: AI sacrificed pawn at", coordsToAlgebraic(r_idx, c_idx));
                break;
              }
            }
            if (pawnSacrificed) break;
          }
          setBoard(boardCopyForAISacrifice);
          if (sacrificedAIPawn) {
            const opponentColor = playerWhoseQueenLeveled === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({
              ...prev,
              [opponentColor]: [...(prev[opponentColor] || []), sacrificedAIPawn!]
            }));
          }
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)} (AI) sacrificed a Pawn!`, duration: 2500 });
          console.log("SAC_DEBUG: AI sacrifice handled. Calling processMoveEnd.");
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
          return false;
        } else {
          console.log("SAC_DEBUG: Human to sacrifice pawn. Entering sacrifice mode.");
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))));
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select a Pawn to sacrifice!` }));
          return true;
        }
      } else {
        console.log("SAC_DEBUG: Condition met but no pawns to sacrifice. Calling processMoveEnd.");
      }
    } else {
      console.log("SAC_DEBUG: Sacrifice condition not met. Calling processMoveEnd.");
    }
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
    return false;
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, board, processMoveEnd, isWhiteAI, isBlackAI, setBoard, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, setCapturedPieces]);

  const processRookSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhosePieceLeveled: PlayerColor,
    rookMove: Move | null, 
    rookSquareAfterMove: AlgebraicSquare | null, 
    originalLevelOfPiece: number | undefined, 
    isExtraTurnFromOriginalMove: boolean
  ): boolean => {
    console.log(`ROOK_RES_DEBUG: processRookSacrificeCheck (formerly Rook Sacrifice Check) for ${playerWhosePieceLeveled}. Rook move:`, rookMove, `Original Level: ${originalLevelOfPiece}`);
    
    if (!rookMove || !rookSquareAfterMove) {
      console.log("ROOK_RES_DEBUG: No rook move data. Calling processMoveEnd for resurrection check.");
      processMoveEnd(boardAfterPrimaryMove, playerWhosePieceLeveled, isExtraTurnFromOriginalMove);
      return false;
    }

    const { row: rookR, col: rookC } = algebraicToCoords(rookSquareAfterMove);
    const rookOnBoard = boardAfterPrimaryMove[rookR]?.[rookC]?.piece;

    console.log("ROOK_RES_DEBUG: Rook on board after move:", rookOnBoard);

    const isRookLevelUpToL3Plus = rookOnBoard &&
      rookOnBoard.type === 'rook' &&
      rookOnBoard.color === playerWhosePieceLeveled &&
      (rookOnBoard.level || 1) >= 3 &&
      (originalLevelOfPiece || 0) < 3;

    const isPawnPromotedToRook = rookOnBoard &&
      rookOnBoard.type === 'rook' &&
      rookOnBoard.color === playerWhosePieceLeveled &&
      rookMove.type === 'promotion' &&
      rookMove.promoteTo === 'rook';


    if (isRookLevelUpToL3Plus || isPawnPromotedToRook) {
      console.log(`ROOK_RES_DEBUG: Rook ${rookOnBoard.id} at ${rookSquareAfterMove} L${rookOnBoard.level} (prev L${originalLevelOfPiece}) triggered resurrection. Is promo: ${isPawnPromotedToRook}`);
      const opponentColor = playerWhosePieceLeveled === 'white' ? 'black' : 'white';
      
      let resurrectionSuccessful = false;
      let boardAfterResurrection = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));


      setCapturedPieces(prevCaptured => {
        const piecesToChooseFrom = prevCaptured[opponentColor] ? [...prevCaptured[opponentColor]] : [];
        console.log(`ROOK_RES_DEBUG: Pieces available for ${playerWhosePieceLeveled} to resurrect:`, piecesToChooseFrom.length);

        if (piecesToChooseFrom.length > 0) {
          const pieceToResurrectOriginal = piecesToChooseFrom[Math.floor(Math.random() * piecesToChooseFrom.length)];
          
          const emptyAdjacentSquares: AlgebraicSquare[] = [];
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const adjR = rookR + dr;
              const adjC = rookC + dc;
              if (isValidSquare(adjR, adjC) && !boardAfterResurrection[adjR][adjC].piece) {
                emptyAdjacentSquares.push(coordsToAlgebraic(adjR, adjC));
              }
            }
          }
          console.log(`ROOK_RES_DEBUG: Empty adjacent squares for Rook at ${rookSquareAfterMove}:`, emptyAdjacentSquares.join(', '));

          if (emptyAdjacentSquares.length > 0) {
            const targetSquareAlg = emptyAdjacentSquares[Math.floor(Math.random() * emptyAdjacentSquares.length)];
            const { row: resR, col: resC } = algebraicToCoords(targetSquareAlg);
            
            const newUniqueSuffix = resurrectionIdCounter++;
            const resurrectedPieceData: Piece = {
              ...pieceToResurrectOriginal,
              level: 1,
              id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`,
              hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved,
            };
            
            boardAfterResurrection[resR][resC].piece = resurrectedPieceData;
            setBoard(boardAfterResurrection); 

            toast({
              title: "Rook's Call!",
              description: `${getPlayerDisplayName(playerWhosePieceLeveled)}'s Rook resurrected their ${resurrectedPieceData.type} to ${targetSquareAlg}! (L1)`,
              duration: 3000,
            });
            console.log(`ROOK_RES_DEBUG: Resurrected ${resurrectedPieceData.type} to ${targetSquareAlg}. Board updated.`);
            resurrectionSuccessful = true;
            
            const updatedCapturedForOpponent = piecesToChooseFrom.filter(p => p.id !== pieceToResurrectOriginal.id);
            return {
              ...prevCaptured,
              [opponentColor]: updatedCapturedForOpponent,
            };
          } else {
             console.log(`ROOK_RES_DEBUG: No empty adjacent squares for resurrection.`);
          }
        } else {
             console.log(`ROOK_RES_DEBUG: No pieces for ${playerWhosePieceLeveled} to resurrect.`);
        }
        return prevCaptured; 
      });
      
      processMoveEnd(boardAfterResurrection, playerWhosePieceLeveled, isExtraTurnFromOriginalMove);
      return false; 
    }

    console.log("ROOK_RES_DEBUG: Rook did not trigger L3+ resurrection. Calling processMoveEnd.");
    processMoveEnd(boardAfterPrimaryMove, playerWhosePieceLeveled, isExtraTurnFromOriginalMove);
    return false;
  }, [toast, getPlayerDisplayName, processMoveEnd, setBoard, setCapturedPieces, isValidSquare]);


  const saveStateToHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(square => ({
        ...square,
        piece: square.piece ? { ...square.piece } : null
      }))),
      currentPlayer: currentPlayer,
      gameInfo: { ...gameInfo },
      capturedPieces: {
        white: capturedPieces.white.map(p => ({ ...p })),
        black: capturedPieces.black.map(p => ({ ...p })),
      },
      killStreaks: { ...killStreaks },
      lastCapturePlayer: lastCapturePlayer,
      boardOrientation: boardOrientation,
      viewMode: viewMode,
      isWhiteAI: isWhiteAI,
      isBlackAI: isBlackAI,
      enemySelectedSquare: enemySelectedSquare,
      enemyPossibleMoves: [...enemyPossibleMoves],
      positionHistory: [...positionHistory],
      lastMoveFrom: lastMoveFrom,
      lastMoveTo: lastMoveTo,
      isAwaitingPawnSacrifice: isAwaitingPawnSacrifice,
      playerToSacrificePawn: playerToSacrificePawn,
      boardForPostSacrifice: boardForPostSacrifice ? boardForPostSacrifice.map(row => row.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))) : null,
      playerWhoMadeQueenMove: playerWhoMadeQueenMove,
      isExtraTurnFromQueenMove: isExtraTurnFromQueenMove,
      isAwaitingRookSacrifice: isAwaitingRookSacrifice,
      playerToSacrificeForRook: playerToSacrificeForRook,
      rookToMakeInvulnerable: rookToMakeInvulnerable,
      boardForRookSacrifice: boardForRookSacrifice ? boardForRookSacrifice.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))) : null,
      originalTurnPlayerForRookSacrifice: originalTurnPlayerForRookSacrifice,
      isExtraTurnFromRookLevelUp: isExtraTurnFromRookLevelUp,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20);
      return newHistory;
    });
  }, [
    board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode,
    isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory, lastMoveFrom, lastMoveTo,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp
  ]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    console.log(
      `STREAK_DEBUG (Human Turn Start): CurrentPlayer: ${currentPlayer}, LastCapturePlayer: ${lastCapturePlayer}, WhiteStreak: ${killStreaks.white}, BlackStreak: ${killStreaks.black}`
    );
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;

    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
      if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer) {
        let boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        const pawnToSacrifice = { ...boardAfterSacrifice[row][col].piece! };
        boardAfterSacrifice[row][col].piece = null;

        setBoard(boardAfterSacrifice);

        const opponentOfSacrificer = playerWhoMadeQueenMove! === 'white' ? 'black' : 'white';
        setCapturedPieces(prevCaptured => {
          const newCaptured = { ...prevCaptured };
          newCaptured[opponentOfSacrificer] = [...(newCaptured[opponentOfSacrificer] || []), pawnToSacrifice];
          return newCaptured;
        });

        toast({ title: "Pawn Sacrificed!", description: `${getPlayerDisplayName(currentPlayer)} sacrificed their Pawn!`, duration: 2500 });

        const playerWhoTriggeredSacrifice = playerWhoMadeQueenMove;
        const extraTurnAfterSacrifice = isExtraTurnFromQueenMove;

        setIsAwaitingPawnSacrifice(false);
        setPlayerToSacrificePawn(null);
        setBoardForPostSacrifice(null);
        setPlayerWhoMadeQueenMove(null);
        setIsExtraTurnFromQueenMove(false);

        setLastMoveFrom(null);
        setLastMoveTo(algebraic);

        processMoveEnd(boardAfterSacrifice, playerWhoTriggeredSacrifice!, extraTurnAfterSacrifice);
      } else {
        toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns to sacrifice for the Queen.", duration: 2500 });
      }
      return;
    }

    if (isAwaitingRookSacrifice && playerToSacrificeForRook === currentPlayer) {
      toast({ title: "Rook Action", description: "Rook ability is now automatic on L3+.", duration: 2500 });
      setIsAwaitingRookSacrifice(false);
      setPlayerToSacrificeForRook(null);
      setRookToMakeInvulnerable(null);
      processMoveEnd(boardForRookSacrifice || board, originalTurnPlayerForRookSacrifice || currentPlayer, isExtraTurnFromRookLevelUp || false);
      setBoardForRookSacrifice(null);
      setOriginalTurnPlayerForRookSacrifice(null);
      setIsExtraTurnFromRookLevelUp(false);
      return;
    }


    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
      white: capturedPieces.white.map(p => ({ ...p })),
      black: capturedPieces.black.map(p => ({ ...p }))
    };
    let originalPieceLevelBeforeMove: number | undefined;

    if (selectedSquare) {
      const { row: fromR_selected, col: fromC_selected } = algebraicToCoords(selectedSquare);
      const pieceDataAtSelected = finalBoardStateForTurn[fromR_selected]?.[fromC_selected];
      const pieceToMoveFromSelected = pieceDataAtSelected?.piece;
      originalPieceLevelBeforeMove = pieceToMoveFromSelected?.level;

      if (selectedSquare === algebraic && pieceToMoveFromSelected && pieceToMoveFromSelected.type === 'knight' && pieceToMoveFromSelected.color === currentPlayer && (pieceToMoveFromSelected.level || 1) >= 5) {
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(selectedSquare);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        const selfDestructPlayer = currentPlayer;
        const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
        let selfDestructCapturedSomething = false;
        let piecesDestroyedCount = 0;
        let boardAfterDestruct = finalBoardStateForTurn.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));

        const tempBoardForCheck = boardAfterDestruct.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        tempBoardForCheck[fromR_selected][fromC_selected].piece = null;
        if (isKingInCheck(tempBoardForCheck, selfDestructPlayer)) {
          toast({ title: "Illegal Move", description: "Cannot self-destruct into check.", duration: 2500 });
          setIsMoveProcessing(false); setAnimatedSquareTo(null); return;
        }

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const adjR = fromR_selected + dr;
            const adjC = fromC_selected + dc;
            if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
              const victimPiece = boardAfterDestruct[adjR][adjC].piece;
              if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                if (isPieceInvulnerableToAttack(victimPiece, pieceToMoveFromSelected, boardAfterDestruct)) { 
                  toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable ${victimPiece.type}.`, duration: 2500 });
                  continue;
                }
                finalCapturedPiecesStateForTurn[selfDestructPlayer].push({ ...victimPiece });
                boardAfterDestruct[adjR][adjC].piece = null;
                toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
                selfDestructCapturedSomething = true;
                piecesDestroyedCount++;
              }
            }
          }
        }
        boardAfterDestruct[fromR_selected][fromC_selected].piece = null;
        finalBoardStateForTurn = boardAfterDestruct;

        let calculatedNewStreakForSelfDestructPlayer: number = killStreaks[selfDestructPlayer] || 0;

        setKillStreaks(prevKillStreaks => {
          const newStreaks = {
            white: prevKillStreaks.white,
            black: prevKillStreaks.black
          };
          if (selfDestructCapturedSomething) {
            newStreaks[selfDestructPlayer] = (newStreaks[selfDestructPlayer] || 0) + piecesDestroyedCount;
          } else {
            newStreaks[selfDestructPlayer] = 0;
          }
          calculatedNewStreakForSelfDestructPlayer = newStreaks[selfDestructPlayer];
          return newStreaks;
        });


        if (selfDestructCapturedSomething) {
          setLastCapturePlayer(selfDestructPlayer);
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
           if(lastCapturePlayer === selfDestructPlayer) setLastCapturePlayer(null);
        }


        if (calculatedNewStreakForSelfDestructPlayer === 3) {
          let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] || [])];
          if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
            const pieceToResOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
            if (pieceToResOriginal) {
              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
              if (emptySquares.length > 0) {
                const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                const newUniqueSuffix = resurrectionIdCounter++;
                const resurrectedPiece: Piece = { ...pieceToResOriginal, level: 1, id: `${pieceToResOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResOriginal.type === 'king' || pieceToResOriginal.type === 'rook' ? false : pieceToResOriginal.hasMoved };
                finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] = piecesOfCurrentPlayerCapturedByOpponent;
                toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
              } else {
                finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer].push(pieceToResOriginal);
              }
            }
          }
        }
        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);

        setTimeout(() => {
          setAnimatedSquareTo(null);
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          const streakGrantsExtraTurn = calculatedNewStreakForSelfDestructPlayer === 6;
          const currentMoveData: Move = { from: selectedSquare!, to: selectedSquare!, type: 'self-destruct' };

          const sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, selfDestructPlayer, currentMoveData, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
          if (!sacrificeNeededForQueen) {
            processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn);
          }
          setIsMoveProcessing(false);
        }, 800);
        return;
      } else if (possibleMoves.includes(algebraic)) {
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        const pieceBeingMoved = finalBoardStateForTurn[algebraicToCoords(selectedSquare).row]?.[algebraicToCoords(selectedSquare).col]?.piece;
        originalPieceLevelBeforeMove = pieceBeingMoved?.level || 1;

        const moveBeingMade: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured, conversionEvents, originalPieceLevel: levelFromApplyMove } = applyMove(finalBoardStateForTurn, moveBeingMade);
        finalBoardStateForTurn = newBoard;
        if (originalPieceLevelBeforeMove === undefined && levelFromApplyMove !== undefined) originalPieceLevelBeforeMove = levelFromApplyMove;


        const capturingPlayer = currentPlayer;
        const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';

        let piecesCapturedThisTurn = 0;
        if (captured) piecesCapturedThisTurn = 1;

        let currentCalculatedStreakForCapturingPlayer: number = killStreaks[capturingPlayer] || 0;

        setKillStreaks(prevKillStreaks => {
            const newStreaks = { 
                white: prevKillStreaks.white, 
                black: prevKillStreaks.black 
            };
            if (captured) {
                newStreaks[capturingPlayer] = (prevKillStreaks[capturingPlayer] || 0) + piecesCapturedThisTurn;
            } else {
                newStreaks[capturingPlayer] = 0;
            }
            currentCalculatedStreakForCapturingPlayer = newStreaks[capturingPlayer];
            return newStreaks;
        });


        if (captured) {
          setLastCapturePlayer(capturingPlayer);
          finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
          if(lastCapturePlayer === capturingPlayer) setLastCapturePlayer(null);
        }

        if (currentCalculatedStreakForCapturingPlayer === 3) {
          let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
          if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
            const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
            if (pieceToResurrectOriginal) {
              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
              if (emptySquares.length > 0) {
                const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                const newUniqueSuffix = resurrectionIdCounter++;
                const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                finalCapturedPiecesStateForTurn[opponentPlayer] = piecesOfCurrentPlayerCapturedByOpponent;
                toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
              } else {
                finalCapturedPiecesStateForTurn[opponentPlayer].push(pieceToResurrectOriginal);
              }
            }
          }
        }

        const { row: toRow, col: toCol } = algebraicToCoords(algebraic); 
        const movedPieceOnToSquare = finalBoardStateForTurn[toRow]?.[toCol]?.piece;
        if (
            movedPieceOnToSquare &&
            movedPieceOnToSquare.type === 'rook' &&
            (movedPieceOnToSquare.level || 1) >= 3 &&
            (originalPieceLevelBeforeMove || 0) < 3 
        ) {
          console.log(`ROOK_RES_DEBUG (Human): Rook ${movedPieceOnToSquare.id} at ${algebraic} L${movedPieceOnToSquare.level} (prev L${originalPieceLevelBeforeMove}) triggered resurrection.`);
          const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
          
          setCapturedPieces(prevCaptured => {
            const piecesToChooseFrom = prevCaptured[opponentColor] ? [...prevCaptured[opponentColor]] : [];
            if (piecesToChooseFrom.length > 0) {
              const pieceToResurrectOriginal = piecesToChooseFrom[Math.floor(Math.random() * piecesToChooseFrom.length)];
              const rookCurrentPos = { row: toRow, col: toCol };
              const emptyAdjacentSquares: AlgebraicSquare[] = [];
              for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  if (dr === 0 && dc === 0) continue;
                  const adjR = rookCurrentPos.row + dr;
                  const adjC = rookCurrentPos.col + dc;
                  if (isValidSquare(adjR, adjC) && !finalBoardStateForTurn[adjR][adjC].piece) {
                    emptyAdjacentSquares.push(coordsToAlgebraic(adjR, adjC));
                  }
                }
              }
              if (emptyAdjacentSquares.length > 0) {
                const targetSquareAlg = emptyAdjacentSquares[Math.floor(Math.random() * emptyAdjacentSquares.length)];
                const { row: resR, col: resC } = algebraicToCoords(targetSquareAlg);
                const newUniqueSuffix = resurrectionIdCounter++;
                const resurrectedPieceData: Piece = {
                  ...pieceToResurrectOriginal,
                  level: 1,
                  id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`,
                  hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved,
                };
                finalBoardStateForTurn[resR][resC].piece = resurrectedPieceData; 
                toast({
                  title: "Rook's Call!",
                  description: `${getPlayerDisplayName(currentPlayer)}'s Rook resurrected their ${resurrectedPieceData.type} to ${targetSquareAlg}! (L1)`,
                  duration: 3000,
                });
                console.log(`ROOK_RES_DEBUG (Human): Resurrected ${resurrectedPieceData.type} to ${targetSquareAlg}.`);
                
                const updatedCapturedForOpponent = piecesToChooseFrom.filter(p => p.id !== pieceToResurrectOriginal.id);
                return { ...prevCaptured, [opponentColor]: updatedCapturedForOpponent };
              }
            }
            return prevCaptured;
          });
        }


        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
        }

        setBoard(finalBoardStateForTurn); 
        setCapturedPieces(finalCapturedPiecesStateForTurn); 

        setTimeout(() => {
          setAnimatedSquareTo(null);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          const movedPieceFinalSquare = finalBoardStateForTurn[toRow][toCol];
          const pieceOnBoardAfterMove = movedPieceFinalSquare.piece;
          const isPawnPromotingMove = pieceOnBoardAfterMove && pieceOnBoardAfterMove.type === 'pawn' && (toRow === 0 || toRow === 7);
          const streakGrantsExtraTurn = currentCalculatedStreakForCapturingPlayer === 6;

          const sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, originalPieceLevelBeforeMove, streakGrantsExtraTurn);

          if (isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen && !isAwaitingRookSacrifice) {
            setIsPromotingPawn(true); setPromotionSquare(algebraic);
          } else if (!isPawnPromotingMove && !sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice) {
            const sacrificeNeededForRook = processRookSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, algebraic, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
            if(!sacrificeNeededForRook){
              processMoveEnd(finalBoardStateForTurn, currentPlayer, streakGrantsExtraTurn);
            }
          }
          setIsMoveProcessing(false);
        }, 800);
        return;
      }
    }
    setSelectedSquare(null);
    setPossibleMoves([]);
    if (clickedPiece && clickedPiece.color !== currentPlayer) {
      setEnemySelectedSquare(algebraic);
      const enemyMoves = getPossibleMoves(board, algebraic);
      setEnemyPossibleMoves(enemyMoves);
    } else if (clickedPiece && clickedPiece.color === currentPlayer) {
      setSelectedSquare(algebraic);
      const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
      const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
      setPossibleMoves(legalMovesForPlayer);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    } else {
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    }
  }, [
    board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer,
    saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, filterLegalMoves, setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing,
    setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, processPawnSacrificeCheck,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp, processRookSacrificeCheck, 
    algebraicToCoords, applyMove, isKingInCheck, isPieceInvulnerableToAttack, isValidSquare,
    setGameInfoBasedOnExtraTurn, completeTurn 
  ]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice) return;
    saveStateToHistory();

    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;

    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false); return;
    }
    const originalPawnLevel = originalPawnOnBoard.level || 1;
    const pawnColor = originalPawnOnBoard.color;

    boardAfterPromotion[row][col].piece = {
      ...originalPawnOnBoard,
      type: pieceType,
      level: 1,
      id: `${originalPawnOnBoard.id}_promo_${pieceType}`,
      hasMoved: true,
    };
    
    const promotedPieceRef = boardAfterPromotion[row][col].piece!;

    setLastMoveTo(promotionSquare);
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);

    let finalBoardStateAfterPromotion = boardAfterPromotion;
    
    setBoard(finalBoardStateAfterPromotion);

    setTimeout(() => {
      setAnimatedSquareTo(null);
      toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)`, duration: 2500 });

      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);

      const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
      const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;
      const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;
      const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;

      let sacrificeNeededForQueen = false;
      let sacrificeNeededForRook = false;
      
      const moveThatLedToPromotion: Move = {
        from: lastMoveFrom!, 
        to: promotionSquare,
        type: 'promotion', 
        promoteTo: pieceType 
      };

      if (pieceType === 'queen') {
        sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateAfterPromotion, pawnColor, moveThatLedToPromotion, undefined, combinedExtraTurn);
      } else if (pieceType === 'rook') {
        sacrificeNeededForRook = processRookSacrificeCheck(finalBoardStateAfterPromotion, pawnColor, moveThatLedToPromotion, promotionSquare, undefined, combinedExtraTurn);
      }
      
      if (!sacrificeNeededForQueen && !sacrificeNeededForRook && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice) {
         processMoveEnd(finalBoardStateAfterPromotion, pawnColor, combinedExtraTurn);
      }

      setIsPromotingPawn(false); setPromotionSquare(null);
      setIsMoveProcessing(false);
    }, 800);
  }, [
    board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, processRookSacrificeCheck,
    isMoveProcessing, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves,
    setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, setLastMoveTo, processMoveEnd, algebraicToCoords, capturedPieces, setCapturedPieces
  ]);


  const performAiMove = useCallback(async () => {
    console.log(
      `STREAK_DEBUG (AI Turn Start - ${currentPlayer}): LastCapturePlayer: ${lastCapturePlayer}, WhiteStreak: ${killStreaks.white}, BlackStreak: ${killStreaks.black}`
    );
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice) {
      setIsAiThinking(false);
      return;
    }

    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

    let aiFromAlg: AlgebraicSquare | null = null;
    let aiToAlg: AlgebraicSquare | null = null;
    let originalPieceLevelForAI: number | undefined;
    let moveForApplyMoveAI: Move | null = null;
    
    let finalBoardStateForAI = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesForAI = {
      white: capturedPieces.white.map(p => ({ ...p })),
      black: capturedPieces.black.map(p => ({ ...p }))
    };


    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      const gameStateForAI = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI);
      const aiMoveDataFromVibeAI = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

      if (!aiMoveDataFromVibeAI || !aiMoveDataFromVibeAI.from || !aiMoveDataFromVibeAI.to ||
        !Array.isArray(aiMoveDataFromVibeAI.from) || aiMoveDataFromVibeAI.from.length !== 2 ||
        !Array.isArray(aiMoveDataFromVibeAI.to) || aiMoveDataFromVibeAI.to.length !== 2) {
        console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: VibeChessAI returned invalid move structure. Raw move:`, aiMoveDataFromVibeAI);
        aiErrorOccurredRef.current = true;
      } else {
        aiFromAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.from[0], aiMoveDataFromVibeAI.from[1]);
        aiToAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.to[0], aiMoveDataFromVibeAI.to[1]);
        const aiMoveType = (aiMoveDataFromVibeAI.type || 'move') as Move['type'];
        const aiPromoteTo = aiMoveDataFromVibeAI.promoteTo as PieceType | undefined;

        const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromVibeAI.from[0]]?.[aiMoveDataFromVibeAI.from[1]];
        const pieceOnFromSquareForAI = pieceDataAtFromAI?.piece;
        originalPieceLevelForAI = pieceOnFromSquareForAI?.level || 1;

        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
          console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: VibeChessAI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquareForAI);
          aiErrorOccurredRef.current = true;
        } else {
          const pseudoPossibleMovesForAiPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg);
          const legalMovesForAiPieceOnBoard = filterLegalMoves(finalBoardStateForAI, aiFromAlg, pseudoPossibleMovesForAiPiece, currentPlayer);
          let isAiMoveActuallyLegal = false;

          if (aiMoveType === 'self-destruct' && pieceOnFromSquareForAI.type === 'knight' && (pieceOnFromSquareForAI.level || 1) >= 5) {
            if (aiFromAlg === aiToAlg) {
              const tempStateAfterSelfDestruct = finalBoardStateForAI.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
              tempStateAfterSelfDestruct[aiMoveDataFromVibeAI.from[0]][aiMoveDataFromVibeAI.from[1]].piece = null;
              if (!isKingInCheck(tempStateAfterSelfDestruct, currentPlayer)) {
                isAiMoveActuallyLegal = true;
              } else {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI self-destruct from ${aiFromAlg} would leave king in check.`);
                aiErrorOccurredRef.current = true;
              }
            } else {
              console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
              aiErrorOccurredRef.current = true;
            }
          } else if (aiMoveType === 'swap') {
             const targetPieceForAISwap = finalBoardStateForAI[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;
            const validSwapCondition = 
                (pieceOnFromSquareForAI.type === 'knight' && (pieceOnFromSquareForAI.level || 1) >=4 && targetPieceForAISwap?.type === 'bishop' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color ) ||
                (pieceOnFromSquareForAI.type === 'bishop' && (pieceOnFromSquareForAI.level || 1) >=4 && targetPieceForAISwap?.type === 'knight' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color );

            if (validSwapCondition) {
                 isAiMoveActuallyLegal = true;
            } else {
                 console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested illegal swap: ${aiFromAlg} to ${aiToAlg}. Swap Condition: ${validSwapCondition}`);
                 aiErrorOccurredRef.current = true;
            }
          } else {
            isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
            if (!isAiMoveActuallyLegal) {
              console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: VibeChessAI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Valid moves for piece: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveType}`);
              aiErrorOccurredRef.current = true;
            }
          }

          if (!aiErrorOccurredRef.current && isAiMoveActuallyLegal) {
            saveStateToHistory();
            setLastMoveFrom(aiFromAlg as AlgebraicSquare);
            setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
            setIsMoveProcessing(true);
            setAnimatedSquareTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
            moveForApplyMoveAI = { from: aiFromAlg, to: aiToAlg, type: aiMoveType, promoteTo: aiPromoteTo };


            let aiMoveCapturedSomething = false;
            let currentCalculatedStreakForAIPlayer: number = killStreaks[currentPlayer] || 0;
            let piecesDestroyedByAICount = 0;

            if (moveForApplyMoveAI!.type === 'self-destruct') {
              const { row: knightR_AI, col: knightC_AI } = algebraicToCoords(moveForApplyMoveAI!.from);
              const selfDestructingKnight_AI = finalBoardStateForAI[knightR_AI]?.[knightC_AI]?.piece;

              const tempBoardForCheckAI = finalBoardStateForAI.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
              tempBoardForCheckAI[knightR_AI][knightC_AI].piece = null; 
              if (isKingInCheck(tempBoardForCheckAI, currentPlayer)) {
                  console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Self-destruct would put AI in check. Cancelling.`);
                  aiErrorOccurredRef.current = true;
              } else if (selfDestructingKnight_AI) { 
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const adjR_AI = knightR_AI + dr;
                    const adjC_AI = knightC_AI + dc;
                    if (adjR_AI >= 0 && adjR_AI < 8 && adjC_AI >= 0 && adjC_AI < 8) {
                        const victimPiece_AI = finalBoardStateForAI[adjR_AI][adjC_AI].piece;
                        if (victimPiece_AI && victimPiece_AI.color !== currentPlayer && victimPiece_AI.type !== 'king') {
                        if (isPieceInvulnerableToAttack(victimPiece_AI, selfDestructingKnight_AI, finalBoardStateForAI)) { 
                            toast({ title: "Invulnerable!", description: `AI Knight's self-destruct failed on invulnerable ${victimPiece_AI.type}.`, duration: 2500 });
                            continue;
                        }
                        finalCapturedPiecesForAI[currentPlayer].push({ ...victimPiece_AI });
                        finalBoardStateForAI[adjR_AI][adjC_AI].piece = null;
                        aiMoveCapturedSomething = true;
                        piecesDestroyedByAICount++;
                        }
                    }
                    }
                }
                finalBoardStateForAI[knightR_AI][knightC_AI].piece = null;
                toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Knight Self-Destructs!`, description: `${piecesDestroyedByAICount} pieces obliterated.`, duration: 2500 });
              } else {
                  aiErrorOccurredRef.current = true; 
              }
            } else {
              const { newBoard, capturedPiece: capturedByAI, conversionEvents, originalPieceLevel } = applyMove(finalBoardStateForAI, moveForApplyMoveAI!);
              finalBoardStateForAI = newBoard;
              if (originalPieceLevelForAI === undefined && originalPieceLevel !== undefined) originalPieceLevelForAI = originalPieceLevel;
              toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMoveAI!.from} to ${moveForApplyMoveAI!.to}`, duration: 1500 });

              if (capturedByAI) {
                aiMoveCapturedSomething = true;
                finalCapturedPiecesForAI[currentPlayer].push(capturedByAI);
              }
              if (conversionEvents && conversionEvents.length > 0) {
                conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
              }
            }
            
            if(!aiErrorOccurredRef.current) {
                setKillStreaks(prevKillStreaks => {
                const newStreaks = {
                    white: prevKillStreaks.white,
                    black: prevKillStreaks.black
                };
                if (aiMoveCapturedSomething) {
                    newStreaks[currentPlayer] = (prevKillStreaks[currentPlayer] || 0) + (piecesDestroyedByAICount > 0 ? piecesDestroyedByAICount : 1);
                } else {
                    newStreaks[currentPlayer] = 0;
                }
                currentCalculatedStreakForAIPlayer = newStreaks[currentPlayer];
                return newStreaks;
                });

                if (aiMoveCapturedSomething) {
                setLastCapturePlayer(currentPlayer);
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                } else {
                if(lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                }


                if (currentCalculatedStreakForAIPlayer === 3) {
                const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                if (piecesOfAICapturedByOpponent.length > 0) {
                    const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop();
                    if (pieceToResOriginalAI) {
                    const emptySqAI: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForAI[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySqAI.length > 0) {
                        const randSqAI = emptySqAI[Math.floor(Math.random() * emptySqAI.length)];
                        const { row: resRAI, col: resCAI } = algebraicToCoords(randSqAI);
                        const newUniqueSuffixAI = resurrectionIdCounter++;
                        const resurrectedAI: Piece = { ...pieceToResOriginalAI, level: 1, id: `${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                        finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                        finalCapturedPiecesForAI[opponentColorAI] = piecesOfAICapturedByOpponent;
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                    } else {
                        finalCapturedPiecesForAI[opponentColorAI].push(pieceToResOriginalAI);
                    }
                    }
                }
                }
                
                const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
                const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
                if (
                  aiMovedPieceOnToSquare &&
                  aiMovedPieceOnToSquare.type === 'rook' &&
                  (aiMovedPieceOnToSquare.level || 1) >= 3 &&
                  (originalPieceLevelForAI || 0) < 3 &&
                  moveForApplyMoveAI!.type !== 'self-destruct' 
                ) {
                  console.log(`ROOK_RES_DEBUG (AI): Rook ${aiMovedPieceOnToSquare.id} at ${aiToAlg} L${aiMovedPieceOnToSquare.level} (prev L${originalPieceLevelForAI}) triggered resurrection.`);
                  const opponentColorForAIRes = currentPlayer === 'white' ? 'black' : 'white';
                  
                  setCapturedPieces(prevCaptured => { 
                    const piecesToChooseFromAI = prevCaptured[opponentColorForAIRes] ? [...prevCaptured[opponentColorForAIRes]] : [];
                    if (piecesToChooseFromAI.length > 0) {
                      const pieceToResOriginalAI = piecesToChooseFromAI[Math.floor(Math.random() * piecesToChooseFromAI.length)];
                      const rookCurrentPosAI = { row: aiToR, col: aiToC };
                      const emptyAdjacentSquaresAI: AlgebraicSquare[] = [];
                      for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                          if (dr === 0 && dc === 0) continue;
                          const adjR_AI = rookCurrentPosAI.row + dr;
                          const adjC_AI = rookCurrentPosAI.col + dc;
                          if (isValidSquare(adjR_AI, adjC_AI) && !finalBoardStateForAI[adjR_AI][adjC_AI].piece) {
                            emptyAdjacentSquaresAI.push(coordsToAlgebraic(adjR_AI, adjC_AI));
                          }
                        }
                      }
                      if (emptyAdjacentSquaresAI.length > 0) {
                        const targetSquareAlgAI = emptyAdjacentSquaresAI[Math.floor(Math.random() * emptyAdjacentSquaresAI.length)];
                        const { row: resR_AI, col: resC_AI } = algebraicToCoords(targetSquareAlgAI);
                        const newUniqueSuffixAI = resurrectionIdCounter++;
                        const resurrectedPieceDataAI: Piece = {
                          ...pieceToResOriginalAI,
                          level: 1,
                          id: `${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`,
                          hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved,
                        };
                        finalBoardStateForAI[resR_AI][resC_AI].piece = resurrectedPieceDataAI; 
                        toast({
                          title: "AI Rook's Call!",
                          description: `${getPlayerDisplayName(currentPlayer)} (AI) Rook resurrected their ${resurrectedPieceDataAI.type} to ${targetSquareAlgAI}! (L1)`,
                          duration: 3000,
                        });
                         console.log(`ROOK_RES_DEBUG (AI): Resurrected ${resurrectedPieceDataAI.type} to ${targetSquareAlgAI}.`);
                        const updatedCapturedForOpponentAI = piecesToChooseFromAI.filter(p => p.id !== pieceToResOriginalAI.id);
                        return { ...prevCaptured, [opponentColorForAIRes]: updatedCapturedForOpponentAI };
                      }
                    }
                    return prevCaptured; 
                  });
                }


                setBoard(finalBoardStateForAI); 
                setCapturedPieces(finalCapturedPiecesForAI); 


                setTimeout(() => {
                const pieceAtDestinationAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
                const promotionRowAI = currentPlayer === 'white' ? 0 : 7;

                const isAIPawnPromoting = pieceAtDestinationAI &&
                    pieceAtDestinationAI.type === 'pawn' &&
                    algebraicToCoords(aiToAlg as AlgebraicSquare).row === promotionRowAI &&
                    moveForApplyMoveAI!.type !== 'self-destruct';

                const streakGrantsExtraTurnForAI = currentCalculatedStreakForAIPlayer === 6;

                let sacrificeNeededForAIQueen = false;
                let sacrificeNeededForAIRook = false;
                
                if (isAIPawnPromoting && !isAwaitingRookSacrifice && !isAwaitingPawnSacrifice) {
                    const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen';
                    const originalPawnLevelForAIPromo = originalPieceLevelForAI || 1;

                    toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });

                    const aiPawnPromoExtraTurn = originalPawnLevelForAIPromo >= 5;
                    const combinedExtraTurnForAI = aiPawnPromoExtraTurn || streakGrantsExtraTurnForAI;
                    
                    const pieceAfterAIPromo = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;

                    if (pieceAfterAIPromo?.type === 'queen') {
                      sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, undefined, combinedExtraTurnForAI);
                    } else if (pieceAfterAIPromo?.type === 'rook') {
                      sacrificeNeededForAIRook = processRookSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, aiToAlg as AlgebraicSquare, undefined, combinedExtraTurnForAI);
                    }
                    
                    if(!sacrificeNeededForAIQueen && !sacrificeNeededForAIRook && !isAwaitingRookSacrifice){
                        processMoveEnd(finalBoardStateForAI, currentPlayer, combinedExtraTurnForAI);
                    }

                } else if (!isAwaitingRookSacrifice && !isAwaitingPawnSacrifice) { 
                    sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, originalPieceLevelForAI, streakGrantsExtraTurnForAI);
                     if (!sacrificeNeededForAIQueen) {
                        sacrificeNeededForAIRook = processRookSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, aiToAlg as AlgebraicSquare, originalPieceLevelForAI, streakGrantsExtraTurnForAI);
                     }
                    if (!sacrificeNeededForAIQueen && !sacrificeNeededForAIRook && !isAwaitingRookSacrifice) {
                        processMoveEnd(finalBoardStateForAI, currentPlayer, streakGrantsExtraTurnForAI);
                    }
                }
                
                setAnimatedSquareTo(null);
                setIsMoveProcessing(false);
                setIsAiThinking(false); 
                }, 800);
            }
          } else {
            aiErrorOccurredRef.current = true;
          }
        }
      }
    } catch (error) {
      console.error(`AI (${getPlayerDisplayName(currentPlayer)}) Error in performAiMove (outer try-catch):`, error);
      aiErrorOccurredRef.current = true;
    }

    if (aiErrorOccurredRef.current) {
      toast({
        title: `AI (${getPlayerDisplayName(currentPlayer)}) Error/Forfeit`,
        description: "AI move forfeited or error occurred.",
        variant: "destructive",
        duration: 2500,
      });
      if(currentPlayer === 'white') setIsWhiteAI(false); else setIsBlackAI(false);
      setIsMoveProcessing(false);
      setIsAiThinking(false);
      setTimeout(() => {
        completeTurn(finalBoardStateForAI, currentPlayer); 
      }, 0);
    }
  }, [
    board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer,
    isWhiteAI, isBlackAI, isAiThinking, isAwaitingPawnSacrifice, isAwaitingRookSacrifice,
    saveStateToHistory, toast, getPlayerDisplayName, filterLegalMoves, getPossibleMoves,
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
    setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo,
    setShowCaptureFlash, setCaptureFlashKey, setIsWhiteAI, setIsBlackAI,
    setLastMoveFrom, setLastMoveTo,
    processPawnSacrificeCheck, processRookSacrificeCheck,
    algebraicToCoords, coordsToAlgebraic, applyMove, isKingInCheck, isPieceInvulnerableToAttack, isValidSquare,
    setGameInfoBasedOnExtraTurn, completeTurn, processMoveEnd
  ]);


  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice) {
      performAiMove();
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice, isAwaitingRookSacrifice]);

  useEffect(() => {
    if (!board || positionHistory.length > 0) return;
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
    if (initialHash) {
      setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory]);

  useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver && gameInfo.winner === 'draw') {
      currentCheckStateString = 'draw';
    } else if (gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = `checkmate-${gameInfo.playerWithKingInCheck}`;
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    }

    if (currentCheckStateString) {
      if (flashedCheckStateRef.current !== currentCheckStateString) {
        if (currentCheckStateString.startsWith('draw')) {
          setFlashMessage('DRAW!');
          setShowCheckmatePatternFlash(true);
          setCheckmatePatternFlashKey(k => k + 1);
        } else if (currentCheckStateString.startsWith('checkmate')) {
          setFlashMessage('CHECKMATE!');
          setShowCheckmatePatternFlash(true);
          setCheckmatePatternFlashKey(k => k + 1);
        } else if (currentCheckStateString.endsWith('-check')) {
          setFlashMessage('CHECK!');
          setShowCheckFlashBackground(true);
          setCheckFlashBackgroundKey(k => k + 1);
        }
        setFlashMessageKey(k => k + 1);
        flashedCheckStateRef.current = currentCheckStateString;
      }
    } else {
      if (flashedCheckStateRef.current) {
        flashedCheckStateRef.current = null;
      }
    }
  }, [gameInfo]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (flashMessage) {
      const duration = (flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!') ? 2500 : 1500;
      timerId = setTimeout(() => {
        setFlashMessage(null);
      }, duration);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [flashMessage, flashMessageKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (killStreakFlashMessage) {
      timerId = setTimeout(() => {
        setKillStreakFlashMessage(null);
      }, 1500);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [killStreakFlashMessage, killStreakFlashMessageKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCaptureFlash) {
      timerId = setTimeout(() => {
        setShowCaptureFlash(false);
      }, 2250);
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCaptureFlash, captureFlashKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250);
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250);
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);


  const resetGame = useCallback(() => {
    resurrectionIdCounter = 0;
    const initialBoardState = initializeBoard();
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const newIsWhiteAI = false;
    const newIsBlackAI = false;
    setIsWhiteAI(newIsWhiteAI);
    setIsBlackAI(newIsBlackAI);

    setGameInfo({ ...initialGameStatus });
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights);
    if(initialHash) setPositionHistory([initialHash]); else setPositionHistory([]);


    setFlashMessage(null);
    setKillStreakFlashMessage(null);
    setShowCaptureFlash(false);
    setCaptureFlashKey(0);
    setShowCheckFlashBackground(false);
    setCheckFlashBackgroundKey(0);
    setShowCheckmatePatternFlash(false);
    setCheckmatePatternFlashKey(0);

    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setLastMoveFrom(null);
    setLastMoveTo(null);

    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;

    const initialOrientation = determineBoardOrientation('flipping', 'white', newIsWhiteAI, newIsBlackAI);
    setBoardOrientation(initialOrientation);
    setAnimatedSquareTo(null);
    setIsMoveProcessing(false);

    setIsAwaitingPawnSacrifice(false);
    setPlayerToSacrificePawn(null);
    setBoardForPostSacrifice(null);
    setPlayerWhoMadeQueenMove(null);
    setIsExtraTurnFromQueenMove(false);

    setIsAwaitingRookSacrifice(false);
    setPlayerToSacrificeForRook(null);
    setRookToMakeInvulnerable(null);
    setBoardForRookSacrifice(null);
    setOriginalTurnPlayerForRookSacrifice(null);
    setIsExtraTurnFromRookLevelUp(false);

    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
  }, [toast, determineBoardOrientation]);

  const handleUndo = useCallback(() => {
    if ((isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice) {
      toast({ title: "Undo Failed", description: "Cannot undo during AI turn, processing, or sacrifice.", duration: 2500 });
      return;
    }
    if (historyStack.length === 0) {
      toast({ title: "Undo Failed", description: "No moves to undo.", duration: 2500 });
      setLastMoveFrom(null);
      setLastMoveTo(null);
      return;
    }

    const playerWhoseTurnItIsNow = currentPlayer;
    const lastMovePlayer = playerWhoseTurnItIsNow === 'white' ? 'black' : 'white';

    let aiMadeTheActualLastMove = false;
    if (lastMovePlayer === 'white' && isWhiteAI) aiMadeTheActualLastMove = true;
    else if (lastMovePlayer === 'black' && isBlackAI) aiMadeTheActualLastMove = true;

    const isHumanVsAiGame = (isWhiteAI && !isBlackAI) || (!isWhiteAI && isBlackAI);
    let statesToPop = 1;
    if (isHumanVsAiGame && aiMadeTheActualLastMove && historyStack.length >= 2) {
      statesToPop = 2;
    }

    const targetHistoryIndex = historyStack.length - statesToPop;
    if (targetHistoryIndex < 0) {
      toast({ title: "Undo Error", description: "Not enough history.", duration: 2500 });
      return;
    }
    const stateToRestore = historyStack[targetHistoryIndex];
    const newHistoryStack = historyStack.slice(0, targetHistoryIndex);

    if (stateToRestore) {
      setBoard(stateToRestore.board);
      setCurrentPlayer(stateToRestore.currentPlayer);
      setGameInfo(stateToRestore.gameInfo);
      setCapturedPieces(stateToRestore.capturedPieces);
      setKillStreaks(stateToRestore.killStreaks);
      setLastCapturePlayer(stateToRestore.lastCapturePlayer);
      setPositionHistory(stateToRestore.positionHistory || []);
      setLastMoveFrom(stateToRestore.lastMoveFrom || null);
      setLastMoveTo(stateToRestore.lastMoveTo || null);

      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation(stateToRestore.viewMode, stateToRestore.currentPlayer, stateToRestore.isBlackAI, stateToRestore.isWhiteAI));

      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(stateToRestore.enemySelectedSquare || null);
      setEnemyPossibleMoves(stateToRestore.enemyPossibleMoves || []);

      flashedCheckStateRef.current = null;
      setFlashMessage(null);
      setKillStreakFlashMessage(null);
      setShowCaptureFlash(false);
      setShowCheckFlashBackground(false);
      setShowCheckmatePatternFlash(false);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false);
      aiErrorOccurredRef.current = false;
      setHistoryStack(newHistoryStack);

      setIsAwaitingPawnSacrifice(stateToRestore.isAwaitingPawnSacrifice);
      setPlayerToSacrificePawn(stateToRestore.playerToSacrificePawn);
      setBoardForPostSacrifice(stateToRestore.boardForPostSacrifice);
      setPlayerWhoMadeQueenMove(stateToRestore.playerWhoMadeQueenMove);
      setIsExtraTurnFromQueenMove(stateToRestore.isExtraTurnFromQueenMove);

      setIsAwaitingRookSacrifice(stateToRestore.isAwaitingRookSacrifice);
      setPlayerToSacrificeForRook(stateToRestore.playerToSacrificeForRook);
      setRookToMakeInvulnerable(stateToRestore.rookToMakeInvulnerable);
      setBoardForRookSacrifice(stateToRestore.boardForRookSacrifice);
      setOriginalTurnPlayerForRookSacrifice(stateToRestore.originalTurnPlayerForRookSacrifice);
      setIsExtraTurnFromRookLevelUp(stateToRestore.isExtraTurnFromRookLevelUp);


      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    } else {
      setLastMoveFrom(null);
      setLastMoveTo(null);
    }
  }, [
    historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing,
    isAwaitingPawnSacrifice, isAwaitingRookSacrifice,
    setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setPositionHistory, setLastMoveFrom, setLastMoveTo, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage,
    setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn,
    setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setKillStreakFlashMessage,
    setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove,
    setIsAwaitingRookSacrifice, setPlayerToSacrificeForRook, setRookToMakeInvulnerable, setBoardForRookSacrifice, setOriginalTurnPlayerForRookSacrifice, setIsExtraTurnFromRookLevelUp
  ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [determineBoardOrientation, currentPlayer, isBlackAI, isWhiteAI, setViewMode, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


  const handleToggleWhiteAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing) return;
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, viewMode, isBlackAI, toast, determineBoardOrientation, setIsWhiteAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);

  const handleToggleBlackAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing) return;
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, viewMode, isWhiteAI, toast, determineBoardOrientation, setIsBlackAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center">
        {flashMessage && (<div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
        {killStreakFlashMessage && (<div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}

        <div className="w-full flex flex-col items-center mb-6 space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
              <RefreshCw className="mr-1" /> Reset
            </Button>
            <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
              <BookOpen className="mr-1" /> Rules
            </Button>
            <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice} aria-label="Undo Move" className="h-8 px-2 text-xs">
              <Undo2 className="mr-1" /> Undo
            </Button>
            <Button variant="outline" onClick={handleToggleWhiteAI} disabled={(isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
              <Bot className="mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleBlackAI} disabled={(isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
              <Bot className="mr-1" /> Black AI: {isBlackAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
              <View className="mr-1" /> View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
          <div className="md:w-1/3 lg:w-1/4">
            <GameControls
              currentPlayer={currentPlayer}
              gameStatusMessage={
                isAwaitingPawnSacrifice ? `${getPlayerDisplayName(playerToSacrificePawn!)} select Pawn to sacrifice!` :
                  isAwaitingRookSacrifice ? `${getPlayerDisplayName(playerToSacrificeForRook!)}: Rook action pending.` : 
                    gameInfo.message || "\u00A0"
              }
              capturedPieces={capturedPieces}
              isCheck={gameInfo.isCheck}
              isGameOver={gameInfo.gameOver}
              killStreaks={killStreaks}
              isWhiteAI={isWhiteAI}
              isBlackAI={isBlackAI}
            />
          </div>
          <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
            <ChessBoard
              boardState={board}
              selectedSquare={selectedSquare}
              possibleMoves={possibleMoves}
              enemySelectedSquare={enemySelectedSquare}
              enemyPossibleMoves={enemyPossibleMoves}
              onSquareClick={handleSquareClick}
              playerColor={boardOrientation}
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice}
              applyBoardOpacityEffect={applyBoardOpacityEffect}
              playerInCheck={gameInfo.playerWithKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              lastMoveFrom={lastMoveFrom}
              lastMoveTo={lastMoveTo}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
            />
          </div>
        </div>
      </div>
      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={promotionSquare && board[algebraicToCoords(promotionSquare).row][algebraicToCoords(promotionSquare).col].piece?.color || null}
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}

    

    

    