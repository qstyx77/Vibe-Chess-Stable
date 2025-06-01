
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
  isValidSquare,
  processRookResurrectionCheck,
  type RookResurrectionResult,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Bot } from 'lucide-react';
import VibeChessAI from '@/ai/vibe-chess-ai';

let globalResurrectionIdCounter = 0;

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
  const aiInstanceRef = useRef(new VibeChessAI(2));
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

  const [isAwaitingRookSacrifice, setIsAwaitingRookSacrifice] = useState(false);
  const [playerToSacrificeForRook, setPlayerToSacrificeForRook] = useState<PlayerColor | null>(null);
  const [rookToMakeInvulnerable, setRookToMakeInvulnerable] = useState<AlgebraicSquare | null>(null);
  const [boardForRookSacrifice, setBoardForRookSacrifice] = useState<BoardState | null>(null);
  const [originalTurnPlayerForRookSacrifice, setOriginalTurnPlayerForRookSacrifice] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromRookLevelUp, setIsExtraTurnFromRookLevelUp] = useState<boolean>(false);

  const [isResurrectionPromotionInProgress, setIsResurrectionPromotionInProgress] = useState(false);
  const [playerForPostResurrectionPromotion, setPlayerForPostResurrectionPromotion] = useState<PlayerColor | null>(null);
  const [isExtraTurnForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion] = useState<boolean>(false);


  const { toast } = useToast();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn;

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  }, [isWhiteAI, isBlackAI]);

  const getKillStreakToastMessage = useCallback((streak: number): string | null => {
    if (streak === 1) return "KILL STREAK!";
    if (streak === 2) return "DOUBLE KILL!";
    if (streak === 3) return "TRIPLE KILL!";
    if (streak === 4) return "ULTRA KILL!";
    if (streak === 5) return "MONSTER KILL!";
    if (streak >= 6) return "RAMPAGE!";
    return null; 
  }, []);

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
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setBoardOrientation, setGameInfo, isKingInCheck, isStalemate]);


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
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, getPlayerDisplayName, determineBoardOrientation, setGameInfo, setBoardOrientation, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, isKingInCheck, isCheckmate, isStalemate]);

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
  }, [positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn, getCastlingRightsString, boardToPositionHash]);

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
      isResurrectionPromotionInProgress: isResurrectionPromotionInProgress,
      playerForPostResurrectionPromotion: playerForPostResurrectionPromotion,
      isExtraTurnForPostResurrectionPromotion: isExtraTurnForPostResurrectionPromotion,
      promotionSquare: promotionSquare,
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
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion, promotionSquare,
  ]);

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    queenMovedWithThis: Move | null,
    originalQueenLevelIfKnown: number | undefined,
    isExtraTurnFromOriginalMove: boolean
  ): boolean => {

    if (!queenMovedWithThis) {
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
        return false;
    }

    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenAfterLeveling = boardAfterPrimaryMove[toR]?.[toC]?.piece;

    const {row: fromRPrev, col: fromCPrev} = algebraicToCoords(queenMovedWithThis.from);
    const pieceOnFromSquare = board[fromRPrev]?.[fromCPrev]?.piece;

    const originalLevel = originalQueenLevelIfKnown !== undefined
        ? originalQueenLevelIfKnown
        : (pieceOnFromSquare && pieceOnFromSquare.type === 'queen' ? (Number(pieceOnFromSquare.level || 1)) : 0);


    const conditionMet = queenAfterLeveling &&
      queenAfterLeveling.type === 'queen' &&
      queenAfterLeveling.color === playerWhoseQueenLeveled &&
      (Number(queenAfterLeveling.level || 1)) >= 6 && 
      originalLevel < 6; 


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

      if (hasPawnsToSacrifice) {
        const isCurrentPlayerAI = (playerWhoseQueenLeveled === 'white' && isWhiteAI) || (playerWhoseQueenLeveled === 'black' && isBlackAI);
        if (isCurrentPlayerAI) {
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
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
          return false;
        } else {
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))));
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select a Pawn to sacrifice!` }));
          return true;
        }
      }
    }
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
    return false;
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, board, processMoveEnd, isWhiteAI, isBlackAI, setBoard, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, setCapturedPieces, algebraicToCoords]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    console.log("Lemur Test Message - Square Clicked:", algebraic);
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;
    let originalPieceLevelBeforeMove: number | undefined;

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
    

    if (selectedSquare) { 
      const { row: fromR_selected, col: fromC_selected } = algebraicToCoords(selectedSquare);
      const pieceDataAtSelectedSquareFromBoard = board[fromR_selected]?.[fromC_selected];
      const pieceToMoveFromSelected = pieceDataAtSelectedSquareFromBoard?.piece;
      
      if (!pieceToMoveFromSelected) {
        setSelectedSquare(null); 
        setPossibleMoves([]);
        setIsMoveProcessing(false);
        return;
      }

      originalPieceLevelBeforeMove = Number(pieceToMoveFromSelected.level || 1);
      
      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare);
      console.log(`[DEBUG page.tsx] Attempting move WITH ${pieceToMoveFromSelected.type} (L${originalPieceLevelBeforeMove}) from ${selectedSquare} to ${algebraic}.`);
      console.log(`[DEBUG page.tsx]   Freshly calculated moves for this piece: ${JSON.stringify(freshlyCalculatedMovesForThisPiece)}`);
      console.log(`[DEBUG page.tsx]   'possibleMoves' state variable (for comparison): ${JSON.stringify(possibleMoves)}`);
      
      const isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);
      console.log(`[DEBUG page.tsx]   Does fresh list include ${algebraic}? ${isMoveInFreshList}`);


      if (selectedSquare === algebraic && pieceToMoveFromSelected.type === 'knight' && (Number(pieceToMoveFromSelected.level || 1)) >= 5) {
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
            if (isValidSquare(adjR, adjC)) {
              const victimPiece = boardAfterDestruct[adjR][adjC].piece;
              if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                if (isPieceInvulnerableToAttack(victimPiece, pieceToMoveFromSelected)) {
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
        
        let newStreakForSelfDestructPlayer = killStreaks[selfDestructPlayer] || 0;
        if (selfDestructCapturedSomething) {
            newStreakForSelfDestructPlayer += piecesDestroyedCount;
        } else {
            newStreakForSelfDestructPlayer = 0;
        }
        setKillStreaks(prev => ({ ...prev, [selfDestructPlayer]: newStreakForSelfDestructPlayer }));

        if (selfDestructCapturedSomething) {
            const streakMsg = getKillStreakToastMessage(newStreakForSelfDestructPlayer);
            if (streakMsg) {
                setKillStreakFlashMessage(streakMsg);
                setKillStreakFlashMessageKey(k => k + 1);
            }
        }


        if (selfDestructCapturedSomething) {
          setLastCapturePlayer(selfDestructPlayer);
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
           if(lastCapturePlayer === selfDestructPlayer) setLastCapturePlayer(null);
        }

        if (selfDestructCapturedSomething && newStreakForSelfDestructPlayer === 3) {
          let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] || [])];
          if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
            const pieceToResOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop(); 
            if (pieceToResOriginal) {
              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
              if (emptySquares.length > 0) {
                const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                const newUniqueSuffix = globalResurrectionIdCounter++;
                const resurrectedPiece: Piece = { ...pieceToResOriginal, level: 1, id: `${pieceToResOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResOriginal.type === 'king' || pieceToResOriginal.type === 'rook' ? false : pieceToResOriginal.hasMoved, invulnerableTurnsRemaining: 0 };
                finalBoardStateForTurn[resR][resC].piece = resurrectedPiece; 
                finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResOriginal.id); 
                toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });

                const promoRow = selfDestructPlayer === 'white' ? 0 : 7;
                if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                    setPlayerForPostResurrectionPromotion(selfDestructPlayer);
                    setIsExtraTurnForPostResurrectionPromotion(newStreakForSelfDestructPlayer === 6);
                    setIsResurrectionPromotionInProgress(true);
                    setIsPromotingPawn(true);
                    setPromotionSquare(randomSquareAlg);
                    setBoard(finalBoardStateForTurn);
                    setCapturedPieces(finalCapturedPiecesStateForTurn);
                    setIsMoveProcessing(false);
                    setAnimatedSquareTo(null);
                    return; 
                }
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

          const streakGrantsExtraTurn = newStreakForSelfDestructPlayer === 6;
          const currentMoveData: Move = { from: selectedSquare!, to: selectedSquare!, type: 'self-destruct' };

          const sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, selfDestructPlayer, currentMoveData, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
          if (!sacrificeNeededForQueen) {
            processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn);
          }
          setIsMoveProcessing(false);
        }, 800);
        return;
      } else if (isMoveInFreshList) {
        console.log(`[DEBUG page.tsx] Move ${selectedSquare}->${algebraic} IS IN freshlyCalculatedMoves. Proceeding with move application.`);
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        const moveBeingMade: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured, conversionEvents, originalPieceLevel: levelFromApplyMove, selfCheckByPushBack } = applyMove(finalBoardStateForTurn, moveBeingMade);
        finalBoardStateForTurn = newBoard;

        if (selfCheckByPushBack) {
          const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
          toast({
            title: "Auto-Checkmate!",
            description: `${getPlayerDisplayName(currentPlayer)}'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
            variant: "destructive",
            duration: 5000
          });
          setGameInfo(prev => ({
            ...prev,
            message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
            isCheck: true,
            playerWithKingInCheck: currentPlayer,
            isCheckmate: true,
            isStalemate: false,
            gameOver: true,
            winner: opponentPlayer
          }));
          setBoard(finalBoardStateForTurn);
          setCapturedPieces(finalCapturedPiecesStateForTurn);
          setIsMoveProcessing(false);
          setAnimatedSquareTo(null);
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
          return;
        }


        const capturingPlayer = currentPlayer;
        const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
        
        const pieceWasCapturedThisTurn = !!captured;
        let newStreakForCapturingPlayer = killStreaks[capturingPlayer] || 0;

        if (pieceWasCapturedThisTurn) {
            newStreakForCapturingPlayer++;
        } else {
            newStreakForCapturingPlayer = 0; 
        }
        setKillStreaks(prev => ({ ...prev, [capturingPlayer]: newStreakForCapturingPlayer }));

        if (pieceWasCapturedThisTurn) {
            const streakMsg = getKillStreakToastMessage(newStreakForCapturingPlayer);
            if (streakMsg) {
                setKillStreakFlashMessage(streakMsg);
                setKillStreakFlashMessageKey(k => k + 1);
            }
        }


        if (captured) {
          setLastCapturePlayer(capturingPlayer);
          finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
          if(lastCapturePlayer === capturingPlayer) setLastCapturePlayer(null);
        }

        if (pieceWasCapturedThisTurn && newStreakForCapturingPlayer === 3) {
          let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
          if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
            const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
            if (pieceToResurrectOriginal) {
              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
              if (emptySquares.length > 0) {
                const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                const newUniqueSuffix = globalResurrectionIdCounter++;
                const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved, invulnerableTurnsRemaining: 0 };
                finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                finalCapturedPiecesStateForTurn[opponentPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginal.id);
                toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });

                const promoRow = capturingPlayer === 'white' ? 0 : 7;
                if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                    setPlayerForPostResurrectionPromotion(capturingPlayer);
                    setIsExtraTurnForPostResurrectionPromotion(newStreakForCapturingPlayer === 6);
                    setIsResurrectionPromotionInProgress(true);
                    setIsPromotingPawn(true);
                    setPromotionSquare(randomSquareAlg);
                    setBoard(finalBoardStateForTurn);
                    setCapturedPieces(finalCapturedPiecesStateForTurn);
                    setIsMoveProcessing(false);
                    setAnimatedSquareTo(null);
                    return; 
                }
              }
            }
          }
        }

        const { row: toR, col: toC } = algebraicToCoords(algebraic);
        const movedPieceOnToSquareHuman = finalBoardStateForTurn[toR]?.[toC]?.piece;
        let humanRookResData: RookResurrectionResult | null = null;

        if (movedPieceOnToSquareHuman && (movedPieceOnToSquareHuman.type === 'rook' || (moveBeingMade.type === 'promotion' && moveBeingMade.promoteTo === 'rook')) ) {
          const oldLevelForResurrectionCheck = levelFromApplyMove !== undefined ? levelFromApplyMove : originalPieceLevelBeforeMove;
          humanRookResData = processRookResurrectionCheck(
            finalBoardStateForTurn,
            currentPlayer,
            moveBeingMade,
            algebraic,
            oldLevelForResurrectionCheck,
            finalCapturedPiecesStateForTurn,
            globalResurrectionIdCounter
          );
          if (humanRookResData.resurrectionPerformed) {
            finalBoardStateForTurn = humanRookResData.boardWithResurrection;
            finalCapturedPiecesStateForTurn = humanRookResData.capturedPiecesAfterResurrection;
            globalResurrectionIdCounter = humanRookResData.newResurrectionIdCounter!;
            toast({
                title: "Rook's Call!",
                description: `${getPlayerDisplayName(currentPlayer)}'s Rook resurrected their ${humanRookResData.resurrectedPieceData!.type} to ${humanRookResData.resurrectedSquareAlg!}! (L1)`,
                duration: 3000,
            });

            if (humanRookResData.resurrectedPieceData?.type === 'pawn') {
                const promoRow = currentPlayer === 'white' ? 0 : 7;
                if (algebraicToCoords(humanRookResData.resurrectedSquareAlg!).row === promoRow) {
                    setPlayerForPostResurrectionPromotion(currentPlayer);
                    setIsExtraTurnForPostResurrectionPromotion(newStreakForCapturingPlayer === 6);
                    setIsResurrectionPromotionInProgress(true);
                    setIsPromotingPawn(true);
                    setPromotionSquare(humanRookResData.resurrectedSquareAlg!);
                    setBoard(finalBoardStateForTurn);
                    setCapturedPieces(finalCapturedPiecesStateForTurn);
                    setIsMoveProcessing(false);
                    setAnimatedSquareTo(null);
                    return; 
                }
            }
          }
        }

        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);

        setTimeout(() => {
          setAnimatedSquareTo(null);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          const movedPieceFinalSquare = finalBoardStateForTurn[toR]?.[toC];
          const pieceOnBoardAfterMove = movedPieceFinalSquare?.piece;
          const isPawnPromotingMove = pieceOnBoardAfterMove && pieceOnBoardAfterMove.type === 'pawn' && (toR === 0 || toR === 7);
          const streakGrantsExtraTurn = newStreakForCapturingPlayer === 6;
          let isPendingHumanResurrectionPromotion = isResurrectionPromotionInProgress; 

          let sacrificeNeededForQueen = false;
          if (!isPendingHumanResurrectionPromotion && pieceOnBoardAfterMove?.type === 'queen' ) {
             sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, levelFromApplyMove, streakGrantsExtraTurn);
          }

          if (isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen && !isAwaitingRookSacrifice && !isPendingHumanResurrectionPromotion) {
            setIsPromotingPawn(true); setPromotionSquare(algebraic);
          } else if (!isPawnPromotingMove && !sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isPendingHumanResurrectionPromotion) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, streakGrantsExtraTurn);
          } else if (humanRookResData?.resurrectionPerformed && !isPendingHumanResurrectionPromotion) {
             processMoveEnd(finalBoardStateForTurn, currentPlayer, streakGrantsExtraTurn);
          }
          setIsMoveProcessing(false);
        }, 800);
        return;
      } else {
         console.log(`[DEBUG page.tsx] Move ${selectedSquare}->${algebraic} IS NOT in freshlyCalculatedMoves. ILLEGAL. (State possibleMoves: ${JSON.stringify(possibleMoves)})`);
         setSelectedSquare(null);
         setPossibleMoves([]);
         toast({ title: "Illegal Move", description: `That move is not allowed for the ${pieceToMoveFromSelected.type}.`, variant: "destructive", duration: 3000 });
         setIsMoveProcessing(false); 
         return;
      }
    } else if (clickedPiece && clickedPiece.color === currentPlayer) { 
      setSelectedSquare(algebraic);
      const legalMovesForPlayer = getPossibleMoves(board, algebraic);
      const pieceLevelForLog = Number(clickedPiece.level || 1);
      console.log(`[DEBUG page.tsx] Selected piece ${clickedPiece.type} L${pieceLevelForLog} at ${algebraic}. Calculated possibleMoves by getPossibleMoves: ${JSON.stringify(legalMovesForPlayer)}`);
      setPossibleMoves(legalMovesForPlayer);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    } else { 
      setSelectedSquare(null);
      setPossibleMoves([]);
      if (clickedPiece && clickedPiece.color !== currentPlayer) {
        setEnemySelectedSquare(algebraic);
        const enemyMoves = getPossibleMoves(board, algebraic); 
        setEnemyPossibleMoves(enemyMoves);
      } else {
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
      }
    }
  }, [
    board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer,
    saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, 
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing,
    setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, processPawnSacrificeCheck,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    algebraicToCoords, applyMove, isKingInCheck, isPieceInvulnerableToAttack, isValidSquare, processRookResurrectionCheck,
    setGameInfoBasedOnExtraTurn, completeTurn, getPossibleMoves, coordsToAlgebraic,
    isResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setIsResurrectionPromotionInProgress,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey
  ]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing ) return; 
    
    let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = boardToUpdate[row]?.[col]?.piece;

    if (!pieceBeingPromoted || (pieceBeingPromoted.type !== 'pawn' && !isResurrectionPromotionInProgress) ) {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false);
      setIsResurrectionPromotionInProgress(false); 
      return;
    }

    saveStateToHistory(); 

    const originalPawnLevel = Number(pieceBeingPromoted.level || 1);
    const pawnColor = pieceBeingPromoted.color;
    const originalPieceId = pieceBeingPromoted.id;

    boardToUpdate[row][col].piece = {
      ...pieceBeingPromoted,
      type: pieceType,
      level: 1,
      id: isResurrectionPromotionInProgress ? `${originalPieceId}_resPromo_${pieceType}` : `${originalPieceId}_promo_${pieceType}`,
      hasMoved: true,
    };
    
    setLastMoveTo(promotionSquare); 
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);
    setBoard(boardToUpdate); 

    setTimeout(() => {
      setAnimatedSquareTo(null);
      
      let currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0; 
      
      if (isResurrectionPromotionInProgress) {
        toast({ title: "Resurrected Pawn Promoted!", description: `${getPlayerDisplayName(playerForPostResurrectionPromotion!)}'s Pawn on ${promotionSquare} promoted to ${pieceType}! (L1)`, duration: 2500 });
        currentStreakForPromotingPlayer = killStreaks[playerForPostResurrectionPromotion!] || 0; 
        processMoveEnd(boardToUpdate, playerForPostResurrectionPromotion!, isExtraTurnForPostResurrectionPromotion || currentStreakForPromotingPlayer === 6);
        setIsResurrectionPromotionInProgress(false);
        setPlayerForPostResurrectionPromotion(null);
        setIsExtraTurnForPostResurrectionPromotion(false);
      } else {
        toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)`, duration: 2500 });
        const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6; 
        const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;

        let sacrificeNeededForQueen = false;
        const moveThatLedToPromotion: Move = { from: lastMoveFrom!, to: promotionSquare, type: 'promotion', promoteTo: pieceType };

        if (pieceType === 'queen') {
          sacrificeNeededForQueen = processPawnSacrificeCheck(boardToUpdate, pawnColor, moveThatLedToPromotion, 1, combinedExtraTurn);
        } else if (pieceType === 'rook') {
          const { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed, resurrectedPieceData, resurrectedSquareAlg, newResurrectionIdCounter } = processRookResurrectionCheck(
            boardToUpdate, pawnColor, moveThatLedToPromotion, promotionSquare, 0, capturedPieces, globalResurrectionIdCounter
          );
          if (resurrectionPerformed) {
            boardToUpdate = boardWithResurrection;
            setCapturedPieces(capturedPiecesAfterResurrection); 
            setBoard(boardToUpdate); 
            globalResurrectionIdCounter = newResurrectionIdCounter!;
            toast({ title: "Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(pawnColor)}'s new Rook resurrected their ${resurrectedPieceData!.type} to ${resurrectedSquareAlg!}! (L1)`, duration: 3000 });
            
            if (resurrectedPieceData?.type === 'pawn') {
                const promoR = pawnColor === 'white' ? 0 : 7;
                if (algebraicToCoords(resurrectedSquareAlg!).row === promoR) {
                    setPlayerForPostResurrectionPromotion(pawnColor);
                    setIsExtraTurnForPostResurrectionPromotion(combinedExtraTurn); 
                    setIsResurrectionPromotionInProgress(true); 
                    setIsPromotingPawn(true);
                    setPromotionSquare(resurrectedSquareAlg!);
                    setIsMoveProcessing(false);
                    setAnimatedSquareTo(null);
                    return; 
                }
            }
          }
        }

        if (!sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isResurrectionPromotionInProgress) { 
           processMoveEnd(boardToUpdate, pawnColor, combinedExtraTurn);
        }
      }
      
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setIsMoveProcessing(false);
    }, 800);
  }, [
    board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, processRookResurrectionCheck,
    isMoveProcessing, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves,
    setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, algebraicToCoords, capturedPieces, setCapturedPieces,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, processMoveEnd, setLastMoveTo
  ]);


  const performAiMove = useCallback(async () => {
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
        originalPieceLevelForAI = Number(pieceOnFromSquareForAI?.level || 1);


        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
          console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: VibeChessAI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquareForAI);
          aiErrorOccurredRef.current = true;
        } else {
          const pseudoPossibleMovesForAiPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg);
          const legalMovesForAiPieceOnBoard = pseudoPossibleMovesForAiPiece;

          let isAiMoveActuallyLegal = false;

          if (aiMoveType === 'self-destruct' && pieceOnFromSquareForAI.type === 'knight' && originalPieceLevelForAI >= 5) {
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
                (pieceOnFromSquareForAI.type === 'knight' && originalPieceLevelForAI >=4 && targetPieceForAISwap?.type === 'bishop' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color ) ||
                (pieceOnFromSquareForAI.type === 'bishop' && originalPieceLevelForAI >=4 && targetPieceForAISwap?.type === 'knight' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color );

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
            let piecesDestroyedByAICount = 0;
            let levelFromAIApplyMove: number | undefined = originalPieceLevelForAI;
            let selfCheckByAIPushBack = false;


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
                    if (isValidSquare(adjR_AI, adjC_AI)) {
                        const victimPiece_AI = finalBoardStateForAI[adjR_AI][adjC_AI].piece;
                        if (victimPiece_AI && victimPiece_AI.color !== currentPlayer && victimPiece_AI.type !== 'king') {
                        if (isPieceInvulnerableToAttack(victimPiece_AI, selfDestructingKnight_AI)) {
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
              const applyMoveResult = applyMove(finalBoardStateForAI, moveForApplyMoveAI!);
              finalBoardStateForAI = applyMoveResult.newBoard;
              levelFromAIApplyMove = applyMoveResult.originalPieceLevel;
              selfCheckByAIPushBack = applyMoveResult.selfCheckByPushBack;

              if (selfCheckByAIPushBack) {
                const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
                toast({
                  title: "Auto-Checkmate!",
                  description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
                  variant: "destructive",
                  duration: 5000
                });
                setGameInfo(prev => ({
                  ...prev,
                  message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
                  isCheck: true,
                  playerWithKingInCheck: currentPlayer,
                  isCheckmate: true,
                  isStalemate: false,
                  gameOver: true,
                  winner: opponentPlayer
                }));
                setBoard(finalBoardStateForAI);
                setCapturedPieces(finalCapturedPiecesForAI);
                setIsMoveProcessing(false);
                setIsAiThinking(false);
                setAnimatedSquareTo(null);
                setSelectedSquare(null); setPossibleMoves([]);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
                return;
              }
              toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMoveAI!.from} to ${moveForApplyMoveAI!.to}`, duration: 1500 });

              if (applyMoveResult.capturedPiece) {
                aiMoveCapturedSomething = true;
                finalCapturedPiecesForAI[currentPlayer].push(applyMoveResult.capturedPiece);
              }
              if (applyMoveResult.conversionEvents && applyMoveResult.conversionEvents.length > 0) {
                applyMoveResult.conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
              }
            }

            if(!aiErrorOccurredRef.current) {
                let newStreakForAIPlayer = killStreaks[currentPlayer] || 0;
                if (aiMoveCapturedSomething) {
                    newStreakForAIPlayer += (piecesDestroyedByAICount > 0 ? piecesDestroyedByAICount : 1);
                } else {
                    newStreakForAIPlayer = 0;
                }
                setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreakForAIPlayer }));

                if (aiMoveCapturedSomething) {
                    const streakMsg = getKillStreakToastMessage(newStreakForAIPlayer);
                    if (streakMsg) {
                        setKillStreakFlashMessage(streakMsg);
                        setKillStreakFlashMessageKey(k => k + 1);
                    }
                }


                if (aiMoveCapturedSomething) {
                  setLastCapturePlayer(currentPlayer);
                  setShowCaptureFlash(true);
                  setCaptureFlashKey(k => k + 1);
                } else {
                  if(lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                }


                if (aiMoveCapturedSomething && newStreakForAIPlayer === 3) {
                  const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                  let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                  if (piecesOfAICapturedByOpponent.length > 0) {
                      const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop();
                      if (pieceToResOriginalAI) {
                      const emptySqAI: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForAI[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySqAI.length > 0) {
                          const randSqAI_alg = emptySqAI[Math.floor(Math.random() * emptySqAI.length)];
                          const { row: resRAI, col: resCAI } = algebraicToCoords(randSqAI_alg);
                          const newUniqueSuffixAI = globalResurrectionIdCounter++;
                          const resurrectedAI: Piece = { ...pieceToResOriginalAI, level: 1, id: `${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved, invulnerableTurnsRemaining: 0 };
                          finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                          finalCapturedPiecesForAI[opponentColorAI] = piecesOfAICapturedByOpponent.filter(p => p.id !== pieceToResOriginalAI.id);
                          toast({ title: "AI Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });

                          const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                          if (resurrectedAI.type === 'pawn' && resRAI === promoRowAI) {
                              finalBoardStateForAI[resRAI][resCAI].piece!.type = 'queen'; 
                              finalBoardStateForAI[resRAI][resCAI].piece!.level = 1;
                              finalBoardStateForAI[resRAI][resCAI].piece!.id = `${resurrectedAI.id}_resPromo_Q`;
                              toast({ title: "AI Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 2500 });
                          }
                      }
                      }
                  }
                }

                const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
                const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
                let aiRookResData: RookResurrectionResult | null = null;

                if (aiMovedPieceOnToSquare && (aiMovedPieceOnToSquare.type === 'rook' || (moveForApplyMoveAI!.type === 'promotion' && moveForApplyMoveAI!.promoteTo === 'rook')) && moveForApplyMoveAI!.type !== 'self-destruct') {
                  const oldLevelForAIResCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI;
                  aiRookResData = processRookResurrectionCheck(
                      finalBoardStateForAI,
                      currentPlayer,
                      moveForApplyMoveAI,
                      aiToAlg as AlgebraicSquare,
                      oldLevelForAIResCheck,
                      finalCapturedPiecesForAI,
                      globalResurrectionIdCounter
                  );
                  if (aiRookResData.resurrectionPerformed) {
                      finalBoardStateForAI = aiRookResData.boardWithResurrection;
                      finalCapturedPiecesForAI = aiRookResData.capturedPiecesAfterResurrection;
                      globalResurrectionIdCounter = aiRookResData.newResurrectionIdCounter!;
                      toast({ title: "AI Rook's Call!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Rook resurrected their ${aiRookResData.resurrectedPieceData!.type} to ${aiRookResData.resurrectedSquareAlg!}! (L1)`, duration: 3000 });
                      
                      if (aiRookResData.resurrectedPieceData?.type === 'pawn') {
                          const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                          const {row: resRookAIR, col: resRookAIC} = algebraicToCoords(aiRookResData.resurrectedSquareAlg!);
                          if (resRookAIR === promoRowAI) {
                              finalBoardStateForAI[resRookAIR][resRookAIC].piece!.type = 'queen';
                              finalBoardStateForAI[resRookAIR][resRookAIC].piece!.level = 1;
                              finalBoardStateForAI[resRookAIR][resRookAIC].piece!.id = `${aiRookResData.resurrectedPieceData.id}_resPromo_Q`;
                              toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 2500 });
                          }
                      }
                  }
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

                const streakGrantsExtraTurnForAI = newStreakForAIPlayer === 6;

                let sacrificeNeededForAIQueen = false;

                if (isAIPawnPromoting && !isAwaitingRookSacrifice && !isAwaitingPawnSacrifice ) {
                    const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen';
                    const pawnLevelBeforeAIPromo = levelFromAIApplyMove || originalPieceLevelForAI || 1;

                    const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                    if(finalBoardStateForAI[promoR][promoC].piece && finalBoardStateForAI[promoR][promoC].piece!.type === 'pawn') {
                        finalBoardStateForAI[promoR][promoC].piece!.type = promotedTypeAI;
                        finalBoardStateForAI[promoR][promoC].piece!.level = 1;
                        finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_promo_${promotedTypeAI}`;
                        setBoard(finalBoardStateForAI.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))));
                    }
                    toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });

                    const aiPawnPromoExtraTurn = pawnLevelBeforeAIPromo >= 5;
                    const combinedExtraTurnForAI = aiPawnPromoExtraTurn || streakGrantsExtraTurnForAI;
                    const pieceAfterAIPromo = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;

                    if (pieceAfterAIPromo?.type === 'queen') {
                      sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, 1, combinedExtraTurnForAI);
                    } else if (pieceAfterAIPromo?.type === 'rook' && aiRookResData && !aiRookResData.resurrectionPerformed) { 
                        const { boardWithResurrection, capturedPiecesAfterResurrection: capturedAfterAIRookRes, resurrectionPerformed: aiPromoRookResPerformed, resurrectedPieceData: aiPromoRookPieceData, resurrectedSquareAlg: aiPromoRookSquareAlg, newResurrectionIdCounter: aiPromoRookIdCounter } = processRookResurrectionCheck(
                            finalBoardStateForAI, currentPlayer, moveForApplyMoveAI, aiToAlg as AlgebraicSquare, 0, finalCapturedPiecesForAI, globalResurrectionIdCounter
                        );
                        if (aiPromoRookResPerformed) {
                            finalBoardStateForAI = boardWithResurrection;
                            finalCapturedPiecesForAI = capturedAfterAIRookRes;
                            globalResurrectionIdCounter = aiPromoRookIdCounter!;
                            setBoard(finalBoardStateForAI);
                            setCapturedPieces(finalCapturedPiecesForAI);
                            toast({ title: "AI Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s new Rook resurrected their ${aiPromoRookPieceData!.type} to ${aiPromoRookSquareAlg!}! (L1)`, duration: 3000 });
                            if(aiPromoRookPieceData?.type === 'pawn'){
                                const promoR_AI = currentPlayer === 'white' ? 0 : 7;
                                const {row: resRookPromoAIR, col: resRookPromoAIC} = algebraicToCoords(aiPromoRookSquareAlg!);
                                if (resRookPromoAIR === promoR_AI) {
                                    finalBoardStateForAI[resRookPromoAIR][resRookPromoAIC].piece!.type = 'queen';
                                    finalBoardStateForAI[resRookPromoAIR][resRookPromoAIC].piece!.level = 1;
                                    finalBoardStateForAI[resRookPromoAIR][resRookPromoAIC].piece!.id = `${aiPromoRookPieceData.id}_resPromo_Q`;
                                    toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 2500 });
                                }
                            }
                        }
                    }
                    if(!sacrificeNeededForAIQueen && !isAwaitingRookSacrifice && !isAwaitingPawnSacrifice){
                        processMoveEnd(finalBoardStateForAI, currentPlayer, combinedExtraTurnForAI);
                    }
                } else if (!isAwaitingRookSacrifice && !isAwaitingPawnSacrifice && pieceAtDestinationAI?.type === 'queen') {
                    sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI!, levelFromAIApplyMove, streakGrantsExtraTurnForAI);
                    if (!sacrificeNeededForAIQueen) {
                        processMoveEnd(finalBoardStateForAI, currentPlayer, streakGrantsExtraTurnForAI);
                    }
                } else if (aiRookResData?.resurrectionPerformed || (!sacrificeNeededForAIQueen && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice) ) {
                     processMoveEnd(finalBoardStateForAI, currentPlayer, streakGrantsExtraTurnForAI);
                }

                setAnimatedSquareTo(null);
                setIsMoveProcessing(false);
                setIsAiThinking(false);
                }, 800);
            } else {
              aiErrorOccurredRef.current = true;
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
    saveStateToHistory, toast, getPlayerDisplayName, 
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
    setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo,
    setShowCaptureFlash, setCaptureFlashKey, setIsWhiteAI, setIsBlackAI,
    setLastMoveFrom, setLastMoveTo,
    processPawnSacrificeCheck,
    algebraicToCoords, coordsToAlgebraic, applyMove, isKingInCheck, isPieceInvulnerableToAttack, isValidSquare, processRookResurrectionCheck,
    setGameInfoBasedOnExtraTurn, completeTurn, processMoveEnd, getPossibleMoves,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey
  ]);


  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isResurrectionPromotionInProgress) {
      performAiMove();
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress]);

  useEffect(() => {
    if (!board || positionHistory.length > 0) return;
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
    if (initialHash) {
      setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory, getCastlingRightsString, boardToPositionHash]);

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
    globalResurrectionIdCounter = 0;
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
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
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

    setIsResurrectionPromotionInProgress(false);
    setPlayerForPostResurrectionPromotion(null);
    setIsExtraTurnForPostResurrectionPromotion(false);

    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
  }, [toast, determineBoardOrientation, getCastlingRightsString, boardToPositionHash, board, currentPlayer]);

  const handleUndo = useCallback(() => {
    if ((isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress) {
      toast({ title: "Undo Failed", description: "Cannot undo during AI turn, processing, or pending actions.", duration: 2500 });
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
      setPromotionSquare(stateToRestore.promotionSquare || null);
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

      setIsResurrectionPromotionInProgress(stateToRestore.isResurrectionPromotionInProgress);
      setPlayerForPostResurrectionPromotion(stateToRestore.playerForPostResurrectionPromotion);
      setIsExtraTurnForPostResurrectionPromotion(stateToRestore.isExtraTurnForPostResurrectionPromotion);


      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    } else {
      setLastMoveFrom(null);
      setLastMoveTo(null);
    }
  }, [
    historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing,
    isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress,
    setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setPositionHistory, setLastMoveFrom, setLastMoveTo, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage,
    setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn,
    setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setKillStreakFlashMessage,
    setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove,
    setIsAwaitingRookSacrifice, setPlayerToSacrificeForRook, setRookToMakeInvulnerable, setBoardForRookSacrifice, setOriginalTurnPlayerForRookSacrifice, setIsExtraTurnFromRookLevelUp,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion
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

  const isInteractionDisabled = gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress;

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
            <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress} aria-label="Undo Move" className="h-8 px-2 text-xs">
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
                isResurrectionPromotionInProgress ? `${getPlayerDisplayName(playerForPostResurrectionPromotion!)} promoting Pawn!` :
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
              isInteractionDisabled={isInteractionDisabled}
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
        pawnColor={
            promotionSquare &&
            (isResurrectionPromotionInProgress ? playerForPostResurrectionPromotion : board[algebraicToCoords(promotionSquare).row][algebraicToCoords(promotionSquare).col].piece?.color) || null
        }
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}

    

    

    




