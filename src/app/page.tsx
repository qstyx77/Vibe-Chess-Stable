
'use client';

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
  killStreaks: { white: 0, black: 0 },
  capturedPieces: { white: [], black: [] },
};

function adaptBoardForAI(
  mainBoard: BoardState,
  currentPlayerForAI: PlayerColor,
  currentKillStreaks: GameStatus['killStreaks'],
  currentCapturedPieces: GameStatus['capturedPieces']
): any { 
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      const pieceForAI: any = { 
        ...squareState.piece,
        invulnerable: (squareState.piece.invulnerableTurnsRemaining || 0) > 0,
      };
      return pieceForAI;
    })
  );

  return {
    board: aiBoard,
    currentPlayer: currentPlayerForAI,
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
  };
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({...initialGameStatus});
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [positionHistory, setPositionHistory] = useState<string[]>([]);

  const [enemySelectedSquare, setEnemySelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [enemyPossibleMoves, setEnemyPossibleMoves] = useState<AlgebraicSquare[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('flipping');
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  const flashedCheckStateRef = useRef<string | null>(null);

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
    
    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;
    if (opponentInCheck) {
      message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn! Check!`;
    }
    
    const currentStreakForPlayer = killStreaks[playerTakingExtraTurn] || 0;
    const streakGrantsExtraTurn = currentStreakForPlayer === 6;

    const pawnJustPromotedAndGaveExtraTurn = promotionSquare && 
      (currentBoard[algebraicToCoords(promotionSquare!).row]?.[algebraicToCoords(promotionSquare!).col]?.piece?.level || 0) >= 5; // Check original pawn level might be needed here

    if (opponentInCheck && ( streakGrantsExtraTurn || pawnJustPromotedAndGaveExtraTurn )) {
        toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn, killStreaks, capturedPieces });
        return;
    }

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw', killStreaks, capturedPieces });
    } else {
        setGameInfo({ message, isCheck: opponentInCheck, playerWithKingInCheck: opponentInCheck ? opponentColor : null, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, killStreaks, promotionSquare, capturedPieces, setGameInfo, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);


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
        setGameInfo({ message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded, killStreaks, capturedPieces });
      } else {
        currentMessage = "Check!";
        setGameInfo({ message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo({ message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw', killStreaks, capturedPieces });
      } else {
        setGameInfo({ message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
      }
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, getPlayerDisplayName, determineBoardOrientation, killStreaks, capturedPieces, setGameInfo, setBoardOrientation, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);

  const processMoveEnd = useCallback((boardAfterMove: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean) => {
    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(boardAfterMove);
    const currentPositionHash = boardToPositionHash(boardAfterMove, nextPlayerForHash, castlingRights);

    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.gameOver) { 
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 2500 });
      setGameInfo({ 
        message: "Draw by Threefold Repetition!",
        isCheck: false,
        playerWithKingInCheck: null,
        isCheckmate: false,
        isStalemate: true, 
        isThreefoldRepetitionDraw: true,
        gameOver: true,
        winner: 'draw',
        killStreaks,
        capturedPieces
      });
      return; 
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, gameInfo.gameOver, killStreaks, capturedPieces, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn]);

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState, 
    playerWhoseQueenLeveled: PlayerColor, 
    queenMovedWithThis: Move | null,
    originalQueenLevelIfKnown: number | undefined,
    isExtraTurnFromOriginalMove: boolean
  ): boolean => { // Returns true if sacrifice mode initiated, false otherwise
    if (!queenMovedWithThis) return false;

    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenAfterLeveling = boardAfterPrimaryMove[toR]?.[toC]?.piece;
    const originalLevel = originalQueenLevelIfKnown ?? 0;

    console.log("SAC_DEBUG: Checking sacrifice. Queen on board:", queenAfterLeveling, "Original Level:", originalLevel);

    const conditionMet = queenAfterLeveling &&
                         queenAfterLeveling.type === 'queen' &&
                         queenAfterLeveling.color === playerWhoseQueenLeveled &&
                         queenAfterLeveling.level === 5 &&
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
        if ((playerWhoseQueenLeveled === 'white' && isWhiteAI) || (playerWhoseQueenLeveled === 'black' && isBlackAI)) {
          // AI auto-sacrifices
          let pawnSacrificed = false;
          const boardCopyForAISacrifice = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              if (boardCopyForAISacrifice[r][c].piece?.type === 'pawn' && boardCopyForAISacrifice[r][c].piece?.color === playerWhoseQueenLeveled) {
                console.log(`SAC_DEBUG: AI sacrificing pawn at ${coordsToAlgebraic(r,c)}`);
                boardCopyForAISacrifice[r][c].piece = null;
                pawnSacrificed = true;
                break;
              }
            }
            if (pawnSacrificed) break;
          }
          setBoard(boardCopyForAISacrifice);
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)}'s Queen reached Level 5! A pawn was sacrificed.`, duration: 2500 });
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
          return false; // Sacrifice handled, turn sequence continues
        } else {
          // Human player needs to sacrifice
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove);
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select a Pawn to sacrifice for your Queen's power!` }));
          console.log("SAC_DEBUG: Human sacrifice mode initiated for player", playerWhoseQueenLeveled);
          return true; // Sacrifice mode initiated, pause turn sequence
        }
      } else {
         console.log("SAC_DEBUG: Queen L5, but no pawns to sacrifice. Proceeding.");
      }
    }
    // No sacrifice needed or AI handled it, proceed with normal turn end for original move
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
    return false;
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, isWhiteAI, isBlackAI, processMoveEnd, setBoard]);


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
      boardForPostSacrifice: boardForPostSacrifice ? boardForPostSacrifice.map(row => row.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))) : null,
      playerWhoMadeQueenMove: playerWhoMadeQueenMove,
      isExtraTurnFromQueenMove: isExtraTurnFromQueenMove,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); 
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove]);


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
    
    setGameInfo({...initialGameStatus, killStreaks: {white:0, black:0}, capturedPieces: {white:[], black:[]}});
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights);
    setPositionHistory([initialHash]);

    setFlashMessage(null);
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

    setShowCheckFlashBackground(false);
    setCheckFlashBackgroundKey(0);
    setShowCaptureFlash(false);
    setCaptureFlashKey(0);
    setShowCheckmatePatternFlash(false);
    setCheckmatePatternFlashKey(0);
    setAnimatedSquareTo(null);
    setIsMoveProcessing(false);

    setIsAwaitingPawnSacrifice(false);
    setPlayerToSacrificePawn(null);
    setBoardForPostSacrifice(null);
    setPlayerWhoMadeQueenMove(null);
    setIsExtraTurnFromQueenMove(false);

    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
  }, [toast, determineBoardOrientation]);

  useEffect(() => {
    const initialBoardState = board || initializeBoard();
    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, currentPlayer, initialCastlingRights);
    if(positionHistory.length === 0 && initialHash){
        setPositionHistory([initialHash]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

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
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

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
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);

  useEffect(() => {
    setBoard(prevBoard => {
      if (!prevBoard) return prevBoard;
      let boardWasModified = false;
      const boardAfterInvulnerabilityWearOff = prevBoard.map(row =>
        row.map(square => {
          if (square.piece &&
              square.piece.color === currentPlayer && // Affects current player's Rooks
              square.piece.type === 'rook' &&
              square.piece.invulnerableTurnsRemaining &&
              square.piece.invulnerableTurnsRemaining > 0) {
            console.log(`VIBE_DEBUG (HvsH & AI): Clearing invulnerability for ${currentPlayer} Rook ${square.piece.id} at ${square.algebraic}. Was: ${square.piece.invulnerableTurnsRemaining}`);
            boardWasModified = true;
            return { ...square, piece: { ...square.piece, invulnerableTurnsRemaining: 0 } };
          }
          return square;
        })
      );
      if (boardWasModified) {
        return boardAfterInvulnerabilityWearOff;
      }
      return prevBoard;
    });
  }, [currentPlayer, setBoard]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row][col]; // Read from current board state
    const clickedPiece = clickedSquareState.piece;

    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
        if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer) {
            saveStateToHistory();
            const boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            boardAfterSacrifice[row][col].piece = null; // Sacrifice the pawn
            setBoard(boardAfterSacrifice);

            toast({ title: "Pawn Sacrificed!", description: `${getPlayerDisplayName(currentPlayer)} sacrificed their Pawn for the Queen's power!`, duration: 2500 });
            
            const playerWhoQueenLeveled = playerWhoMadeQueenMove;
            const extraTurnAfterSacrifice = isExtraTurnFromQueenMove;

            setIsAwaitingPawnSacrifice(false);
            setPlayerToSacrificePawn(null);
            setBoardForPostSacrifice(null);
            setPlayerWhoMadeQueenMove(null);
            setIsExtraTurnFromQueenMove(false);
            
            setLastMoveFrom(null); // No specific "from" for sacrifice visual
            setLastMoveTo(algebraic); // Highlight sacrificed pawn's square

            // Now complete the original turn
            processMoveEnd(boardAfterSacrifice, playerWhoQueenLeveled!, extraTurnAfterSacrifice);
        } else {
            toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns to sacrifice.", duration: 2500 });
        }
        return;
    }


    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };
    
    const pieceOriginalSquareState = selectedSquare ? finalBoardStateForTurn[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col] : null;
    const originalPieceForLevelCheck = pieceOriginalSquareState?.piece;


    if (selectedSquare) {
        const pieceToMoveData = finalBoardStateForTurn[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
        const pieceToMove = pieceToMoveData.piece;

        if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && (pieceToMove.level || 1) >= 5) {
            saveStateToHistory();
            const originalKnightLevel = pieceToMove.level;
            setLastMoveFrom(selectedSquare);
            setLastMoveTo(selectedSquare);
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic); 

            const selfDestructPlayer = currentPlayer;
            const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
            let selfDestructCapturedSomething = false;
            
            const piecesDestroyed: Piece[] = [];
            const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);

            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const adjR = knightR + dr;
                    const adjC = knightC + dc;
                    if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                        const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                        if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                             if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceToMove.level || 1) < (victimPiece.level || 1))) {
                                toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable piece.`, duration: 2500 });
                                continue;
                            }
                            piecesDestroyed.push({ ...victimPiece });
                            finalCapturedPiecesStateForTurn[selfDestructPlayer].push({...victimPiece});
                            finalBoardStateForTurn[adjR][adjC].piece = null;
                            toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
                            selfDestructCapturedSomething = true;
                        }
                    }
                }
            }
            finalBoardStateForTurn[knightR][knightC].piece = null; 

            const calculatedNewStreakForPlayer = selfDestructCapturedSomething ? 
              ((killStreaks[selfDestructPlayer] || 0) + piecesDestroyed.length) : 
              0;
            
            setKillStreaks(prevKillStreaks => {
              const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
              newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
              if (selfDestructCapturedSomething) { 
                newStreaks[opponentOfSelfDestructPlayer] = 0;
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
              }
              return newStreaks;
            });
            setLastCapturePlayer(selfDestructCapturedSomething ? selfDestructPlayer : null );


            if (calculatedNewStreakForPlayer === 3) {
                let piecesOfCurrentPlayerCapturedByOpponent = finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] || [];
                if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
                    if (pieceToResurrectOriginal) { 
                      finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] = [...piecesOfCurrentPlayerCapturedByOpponent]; 
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                          const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                          const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                          const newUniqueSuffix = resurrectionIdCounter++;
                          const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                          finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                          toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
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
                const streakGrantsExtraTurn = calculatedNewStreakForPlayer === 6;
                
                // Check for Queen L5 sacrifice AFTER self-destruct resolution (unlikely Knight levels Queen)
                const sacrificeTriggered = processPawnSacrificeCheck(finalBoardStateForTurn, selfDestructPlayer, {from: selectedSquare, to: selectedSquare}, originalKnightLevel, streakGrantsExtraTurn);
                if (!sacrificeTriggered) {
                    // processMoveEnd is called inside processPawnSacrificeCheck if no sacrifice is needed
                }
                setIsMoveProcessing(false);
            }, 800); 
            return;
        } else if (possibleMoves.includes(algebraic)) { 
            saveStateToHistory();
            const originalPieceLevelBeforeMove = originalPieceForLevelCheck?.level;
            setLastMoveFrom(selectedSquare);
            setLastMoveTo(algebraic);
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic);

            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, { from: selectedSquare, to: algebraic });
            finalBoardStateForTurn = newBoard;

            const capturingPlayer = currentPlayer;
            const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
            
            const currentCalculatedStreakForCapturingPlayer = captured ? 
                ((lastCapturePlayer === capturingPlayer ? (killStreaks[capturingPlayer] || 0) : 0) + 1) :
                0;

            setKillStreaks(prevKillStreaks => {
              const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
              newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
              if (captured) { 
                newStreaks[opponentPlayer] = 0; 
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
              }
              return newStreaks;
            });
            setLastCapturePlayer(captured ? capturingPlayer : null );


            if (captured) {
                 finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
            }

            if (currentCalculatedStreakForCapturingPlayer === 3) {
                let piecesBelongingToCurrentPlayerCapturedByOpponent = finalCapturedPiecesStateForTurn[opponentPlayer] || [];
                if (piecesBelongingToCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesBelongingToCurrentPlayerCapturedByOpponent.pop();
                    if(pieceToResurrectOriginal){
                      finalCapturedPiecesStateForTurn[opponentPlayer] = [...piecesBelongingToCurrentPlayerCapturedByOpponent]; 
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                          const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                          const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                          const newUniqueSuffix = resurrectionIdCounter++;
                          const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                          finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                          toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
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

                const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
                const movedPieceOnBoard = movedPieceFinalSquare.piece;
                const { row: toRowPawnCheck } = algebraicToCoords(algebraic);
                const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);
                const streakGrantsExtraTurn = currentCalculatedStreakForCapturingPlayer === 6;

                if (isPawnPromotingMove) {
                    setIsPromotingPawn(true); setPromotionSquare(algebraic);
                } else {
                    const sacrificeTriggered = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, {from: selectedSquare, to: algebraic}, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
                    if(!sacrificeTriggered){
                        // processMoveEnd is called inside processPawnSacrificeCheck if sacrifice is not needed or handled by AI
                    }
                }
                setIsMoveProcessing(false);
            }, 800); 
            return;
        }

        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) { 
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(finalBoardStateForTurn, algebraic); 
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) { 
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(finalBoardStateForTurn, algebraic); 
            const legalMovesForPlayer = filterLegalMoves(finalBoardStateForTurn, algebraic, pseudoPossibleMoves, currentPlayer);
            setPossibleMoves(legalMovesForPlayer);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else { 
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }

    }
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer, saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, filterLegalMoves, setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing, setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, processPawnSacrificeCheck, determineBoardOrientation, setGameInfoBasedOnExtraTurn, completeTurn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove]);


  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing || isAwaitingPawnSacrifice) return;
    saveStateToHistory();
    
    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;

    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      console.error("Promotion error: No pawn found at promotion square or piece is not a pawn.");
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false); return;
    }
    const originalPawnLevel = originalPawnOnBoard.level || 1;
    const pawnColor = originalPawnOnBoard.color;
    const originalMoveForPawnPromo = { from: lastMoveFrom!, to: promotionSquare }; // Assuming lastMoveFrom is the pawn's original square

    boardAfterPromotion[row][col].piece = {
        ...originalPawnOnBoard,
        type: pieceType,
        level: 1, 
        invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0, 
        id: `${originalPawnOnBoard.id}_promo_${pieceType}`,
        hasMoved: true,
    };
    
    setLastMoveFrom(lastMoveFrom); 
    setLastMoveTo(promotionSquare); 
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);

    setBoard(boardAfterPromotion);

    setTimeout(() => {
        setAnimatedSquareTo(null);
        if (pieceType === 'rook') {
            console.log(`VIBE_DEBUG: Pawn promoted to Rook (Color: ${pawnColor}) at ${promotionSquare} GAINED invulnerability.`);
            toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to Rook! (L1) Invulnerable!`, duration: 2500 });
        } else {
            toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)`, duration: 2500 });
        }

        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);

        const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
        const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;
        const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;
        
        const sacrificeTriggered = processPawnSacrificeCheck(boardAfterPromotion, pawnColor, originalMoveForPawnPromo, undefined /* Queen didn't level up */, combinedExtraTurn);

        if (!sacrificeTriggered) {
          // processMoveEnd is called within processPawnSacrificeCheck if no sacrifice is needed
        }
        
        setIsPromotingPawn(false); setPromotionSquare(null);
        setIsMoveProcessing(false);
    }, 800); 
  }, [ board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processMoveEnd, isMoveProcessing, setGameInfo, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, processPawnSacrificeCheck, determineBoardOrientation, setGameInfoBasedOnExtraTurn, completeTurn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove]);


  const handleUndo = useCallback(() => {
    if ((isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice) {
      toast({ title: "Undo Failed", description: "Cannot undo while AI is thinking, move processing, or awaiting sacrifice.", duration: 2500 });
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
        toast({ title: "Undo Error", description: "Not enough history to undo that many moves.", duration: 2500 });
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
      setShowCheckFlashBackground(false);
      setShowCaptureFlash(false);
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


      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    } else { 
        setLastMoveFrom(null);
        setLastMoveTo(null);
    }
  }, [ historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing, isAwaitingPawnSacrifice, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPositionHistory, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage, setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn, setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setLastMoveFrom, setLastMoveTo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [determineBoardOrientation, currentPlayer, isBlackAI, isWhiteAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


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
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, viewMode, isWhiteAI, toast, determineBoardOrientation, setIsBlackAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);


  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice) return; 

    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...`}));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    
    // Allow UI to update before heavy computation
    await new Promise(resolve => setTimeout(resolve, 50)); 

    try {
        const gameStateForAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces);
        const aiMoveDataFromAI = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

        if (!aiMoveDataFromAI || !Array.isArray(aiMoveDataFromAI.from) || aiMoveDataFromAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromAI.to) || aiMoveDataFromAI.to.length !== 2) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI returned invalid move structure. Raw move:`, aiMoveDataFromAI);
            aiErrorOccurredRef.current = true;
        } else {
            const aiFromAlg = coordsToAlgebraic(aiMoveDataFromAI.from[0], aiMoveDataFromAI.from[1]);
            const aiToAlg = coordsToAlgebraic(aiMoveDataFromAI.to[0], aiMoveDataFromAI.to[1]);
            const pieceDataAtFrom = board[aiMoveDataFromAI.from[0]]?.[aiMoveDataFromAI.from[1]];
            const pieceOnFromSquareForAI = pieceDataAtFrom?.piece;

            if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquareForAI);
                aiErrorOccurredRef.current = true;
            } else {
                const pseudoPossibleMovesForAiPiece = getPossibleMoves(board, aiFromAlg);
                const legalMovesForAiPieceOnBoard = filterLegalMoves(board, aiFromAlg, pseudoPossibleMovesForAiPiece, currentPlayer);
                const aiMoveType = (aiMoveDataFromAI.type || 'move') as Move['type'];
                let isAiMoveActuallyLegal = false;

                if (aiMoveType === 'self-destruct' && pieceOnFromSquareForAI.type === 'knight' && (pieceOnFromSquareForAI.level || 1) >= 5) {
                    if (aiFromAlg === aiToAlg) isAiMoveActuallyLegal = true; 
                    else console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
                } else if (aiMoveType === 'swap') {
                    isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.some(m => m === aiToAlg && (
                        (pieceOnFromSquareForAI.type === 'knight' && board[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece?.type === 'bishop') ||
                        (pieceOnFromSquareForAI.type === 'bishop' && board[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece?.type === 'knight')
                    ));
                     if (!isAiMoveActuallyLegal) console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested illegal swap: ${aiFromAlg} to ${aiToAlg}. Valid moves: ${legalMovesForAiPieceOnBoard.join(', ')}`);
                }
                else {
                    isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
                }

                if (!isAiMoveActuallyLegal) {
                    console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Valid moves for piece: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveType}`);
                    aiErrorOccurredRef.current = true;
                } 
                
                if(!aiErrorOccurredRef.current) {
                    saveStateToHistory();
                    const originalPieceForLevelCheckAI = pieceOnFromSquareForAI?.level;
                    setLastMoveFrom(aiFromAlg);
                    setLastMoveTo(aiMoveType === 'self-destruct' ? aiFromAlg : aiToAlg); 
                    setIsMoveProcessing(true);
                    setAnimatedSquareTo(aiMoveType === 'self-destruct' ? aiFromAlg : aiToAlg);

                    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
                    let finalCapturedPiecesStateForTurn = {
                        white: capturedPieces.white.map(p => ({...p})),
                        black: capturedPieces.black.map(p => ({...p}))
                    };
                    
                    let aiMoveCapturedSomething = false;
                    let currentCalculatedStreakForAIPlayer: number;
                    const moveForApplyMove: Move = { from: aiFromAlg, to: aiToAlg, type: aiMoveType, promoteTo: aiMoveDataFromAI.promoteTo };

                    if (moveForApplyMove.type === 'self-destruct') {
                        const { row: knightR, col: knightC } = algebraicToCoords(moveForApplyMove.from);
                        const selfDestructingKnight = finalBoardStateForTurn[knightR][knightC].piece; 
                        let piecesDestroyedByAI: Piece[] = [];

                        for (let dr = -1; dr <= 1; dr++) {
                          for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const adjR = knightR + dr;
                            const adjC = knightC + dc;
                            if (adjR >= 0 && adjR < 8 && adjC >=0 && adjC < 8 ) {
                              const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                              if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king' && selfDestructingKnight) {
                                if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                    (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (selfDestructingKnight.level || 1) < (victimPiece.level || 1))) {
                                  toast({ title: "Invulnerable!", description: `AI Knight's self-destruct failed on invulnerable ${victimPiece.type}.`, duration: 2500 });
                                  continue;
                                }
                                piecesDestroyedByAI.push({ ...victimPiece });
                                finalCapturedPiecesStateForTurn[currentPlayer].push({ ...victimPiece });
                                finalBoardStateForTurn[adjR][adjC].piece = null;
                                aiMoveCapturedSomething = true;
                              }
                            }
                          }
                        }
                        finalBoardStateForTurn[knightR][knightC].piece = null; 
                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Knight Self-Destructs!`, description: `${piecesDestroyedByAI.length} pieces obliterated.`, duration: 2500});
                        currentCalculatedStreakForAIPlayer = aiMoveCapturedSomething ? 
                            ((lastCapturePlayer === currentPlayer ? (killStreaks[currentPlayer] || 0) : 0) + piecesDestroyedByAI.length) :
                            0;

                    } else { 
                        const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, moveForApplyMove);
                        finalBoardStateForTurn = newBoard;
                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMove.from} to ${moveForApplyMove.to}`, duration: 1500});

                        if (captured) {
                            aiMoveCapturedSomething = true;
                            finalCapturedPiecesStateForTurn[currentPlayer].push(captured);
                        }
                        currentCalculatedStreakForAIPlayer = captured ? 
                            ((lastCapturePlayer === currentPlayer ? (killStreaks[currentPlayer] || 0) : 0) + 1) :
                            0;
                        
                        if (conversionEvents && conversionEvents.length > 0) {
                            conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
                        }
                    }

                    setKillStreaks(prevKillStreaks => {
                        const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
                        newStreaks[currentPlayer] = currentCalculatedStreakForAIPlayer;
                        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
                        if(aiMoveCapturedSomething) { 
                            newStreaks[opponentColor] = 0; 
                            setShowCaptureFlash(true);
                            setCaptureFlashKey(k => k + 1);
                        }
                        return newStreaks;
                    });
                    setLastCapturePlayer(aiMoveCapturedSomething ? currentPlayer : null );


                    if (currentCalculatedStreakForAIPlayer === 3) {
                        const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                        let piecesOfAICapturedByOpponent = finalCapturedPiecesStateForTurn[opponentColorAI] || [];
                         if (piecesOfAICapturedByOpponent.length > 0) {
                            const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop(); 
                            if(pieceToResOriginalAI){
                              finalCapturedPiecesStateForTurn[opponentColorAI] = [...piecesOfAICapturedByOpponent]; 
                              const emptySqAI: AlgebraicSquare[] = [];
                              for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                              if(emptySqAI.length > 0){
                                  const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                  const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                  const newUniqueSuffixAI = resurrectionIdCounter++;
                                  const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                                  finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI;
                                  toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                              }
                            }
                        }
                    }

                    setBoard(finalBoardStateForTurn);
                    setCapturedPieces(finalCapturedPiecesStateForTurn);

                    setTimeout(() => {
                        setAnimatedSquareTo(null);
                        const pieceAtDestination = finalBoardStateForTurn[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
                        const promotionRowAI = currentPlayer === 'white' ? 0 : 7;

                        const isAIPawnPromoting = pieceAtDestination &&
                                                  pieceAtDestination.type === 'pawn' &&
                                                  algebraicToCoords(aiToAlg as AlgebraicSquare).row === promotionRowAI &&
                                                  moveForApplyMove.type !== 'self-destruct'; 

                        const streakGrantsExtraTurnForAI = currentCalculatedStreakForAIPlayer === 6;

                        if (isAIPawnPromoting) {
                            const promotedTypeAI = moveForApplyMove.promoteTo || 'queen'; 
                            const originalPawnForAIPromo = finalBoardStateForTurn[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;

                            if (originalPawnForAIPromo && originalPawnForAIPromo.type === 'pawn') { 
                                const originalPawnLevelForAIPromo = originalPawnForAIPromo.level || 1;
                                const finalBoardAfterAIPromotion = finalBoardStateForTurn.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                                finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece = {
                                    ...(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece as Piece),
                                    type: promotedTypeAI,
                                    level: 1, 
                                    invulnerableTurnsRemaining: promotedTypeAI === 'rook' ? 1 : 0,
                                    id: `${(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece as Piece).id}_promo_${promotedTypeAI}_ai`,
                                    hasMoved: true,
                                };
                                setBoard(finalBoardAfterAIPromotion);
                                toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });
                                
                                const aiPawnPromoExtraTurn = originalPawnLevelForAIPromo >= 5;
                                const combinedExtraTurnForAI = aiPawnPromoExtraTurn || streakGrantsExtraTurnForAI;
                                
                                const sacrificeNeededForAI = processPawnSacrificeCheck(finalBoardAfterAIPromotion, currentPlayer, moveForApplyMove, undefined /*Queen didn't level up*/, combinedExtraTurnForAI);
                                if (!sacrificeNeededForAI) {
                                    // processMoveEnd is called by processPawnSacrificeCheck if AI sacrifice handled or not needed
                                }

                            } else { // Should not happen if pieceAtDestination is pawn
                                const sacrificeNeededForAI = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveForApplyMove, originalPieceForLevelCheckAI, streakGrantsExtraTurnForAI);
                                if (!sacrificeNeededForAI) {
                                     // processMoveEnd is called by processPawnSacrificeCheck
                                }
                            }
                        } else {
                            const sacrificeNeededForAI = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveForApplyMove, originalPieceForLevelCheckAI, streakGrantsExtraTurnForAI);
                             if (!sacrificeNeededForAI) {
                                // processMoveEnd is called by processPawnSacrificeCheck
                            }
                        }
                        setIsAiThinking(false);
                        setIsMoveProcessing(false);
                    }, 800); 
                }
            }
        }
    } catch (error) {
        console.error(`AI (${getPlayerDisplayName(currentPlayer)}) Error in performAiMove try-catch:`, error);
        aiErrorOccurredRef.current = true;
    }
    
    if (aiErrorOccurredRef.current) {
        toast({
            title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`,
            description: "AI move forfeited or error occurred.",
            variant: "destructive",
            duration: 2500,
        });
        
        // Defer state updates to allow current render cycle to complete
        setTimeout(() => {
            if (currentPlayer === 'white') setIsWhiteAI(false);
            if (currentPlayer === 'black') setIsBlackAI(false);
            completeTurn(board, currentPlayer); 
            setIsAiThinking(false);
            setIsMoveProcessing(false);
        }, 0);
    }
  }, [
      board, currentPlayer, gameInfo.gameOver, isPromotingPawn,
      isWhiteAI, isBlackAI, 
      killStreaks, capturedPieces, lastCapturePlayer, 
      saveStateToHistory, toast, getPlayerDisplayName,
      processMoveEnd, filterLegalMoves, getPossibleMoves,
      completeTurn, determineBoardOrientation, setGameInfoBasedOnExtraTurn, 
      applyMove, algebraicToCoords, coordsToAlgebraic, 
      setBoard, setCapturedPieces, setGameInfo, setKillStreaks, setLastCapturePlayer,
      setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
      setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo, setShowCaptureFlash, setCaptureFlashKey,
      setIsWhiteAI, setIsBlackAI, setLastMoveFrom, setLastMoveTo, 
      isAwaitingPawnSacrifice, playerToSacrificePawn, processPawnSacrificeCheck, 
      boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove,
      setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, 
      setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove
    ]
  );


  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice) {
       performAiMove();
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice]);

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center relative">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center">
        {flashMessage && ( <div key={flashMessageKey} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 'animate-flash-checkmate' : 'animate-flash-check' }`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}

        <div className="w-full flex flex-col items-center mb-6 space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
            <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
                <RefreshCw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
                <BookOpen className="h-4 w-4 mr-1" /> Rules
            </Button>
            <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice} aria-label="Undo Move" className="h-8 px-2 text-xs">
                <Undo2 className="h-4 w-4 mr-1" /> Undo
            </Button>
             <Button variant="outline" onClick={handleToggleWhiteAI} disabled={(isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
                <Bot className="h-4 w-4 mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleBlackAI} disabled={(isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
                <Bot className="h-4 w-4 mr-1" /> Black AI: {isBlackAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
                <View className="h-4 w-4 mr-1" /> View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
            </Button>
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
            <div className="md:w-1/3 lg:w-1/4">
            <GameControls
                currentPlayer={currentPlayer}
                gameStatusMessage={isAwaitingPawnSacrifice ? `${getPlayerDisplayName(playerToSacrificePawn!)} select Pawn to sacrifice!` : gameInfo.message || "\u00A0"}
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
                isInteractionDisabled={gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice}
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

