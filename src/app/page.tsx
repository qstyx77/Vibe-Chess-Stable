
'use client';

import type { ReactNode } from 'react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
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
  coordsToAlgebraic,
  getCastlingRightsString,
  boardToPositionHash,
  type ConversionEvent,
  isPieceInvulnerableToAttack,
  isValidSquare,
  processRookResurrectionCheck,
  type RookResurrectionResult,
  spawnShroom,
  boardToSimpleString,
  findKing,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, QueenLevelReducedEvent, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, RallyCryEvent } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag, Trophy } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { AuthWidget } from '@/components/auth/AuthWidget';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ChessPieceDisplay } from '@/components/evolving-chess/ChessPieceDisplay';
import { PieceAbilitiesInfo } from '@/components/evolving-chess/PieceAbilitiesInfo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


let globalUniqueIdCounter = 0;
let globalServerUniqueIdCounter = 10000;

const initialGameStatus: GameStatus = {
  message: " ",
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  isThreefoldRepetitionDraw: false,
  isInfiltrationWin: false,
  gameOver: false,
  winner: undefined,
};

function adaptBoardForAI(
  currentBoardState: BoardState,
  playerForAITurn: PlayerColor,
  currentKillStreaks: { white: number; black: number },
  currentCapturedPieces: { white: Piece[]; black: Piece[] },
  gameMoveCounter: number,
  firstBloodAchieved: boolean,
  playerWhoGotFirstBlood: PlayerColor | null,
  enPassantTargetSquare: AlgebraicSquare | null,
  shroomSpawnCounter?: number,
  nextShroomSpawnTurn?: number
): AIGameState {
  const newAiBoard: AIBoardState = [];
  for (let r_idx = 0; r_idx < 8; r_idx++) {
    const boardRow = currentBoardState[r_idx];
    const newAiRow: AISquareState[] = [];
    if (boardRow) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        newAiRow.push({
          piece: squareState?.piece ? { ...squareState.piece } : null,
          item: squareState?.item ? { ...squareState.item } : null,
        });
      }
    } else {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        newAiRow.push({ piece: null, item: null });
      }
    }
    newAiBoard.push(newAiRow);
  }

  return {
    board: newAiBoard,
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
    gameMoveCounter: gameMoveCounter,
    firstBloodAchieved: firstBloodAchieved,
    playerWhoGotFirstBlood: playerWhoGotFirstBlood,
    enPassantTargetSquare: enPassantTargetSquare,
    shroomSpawnCounter: shroomSpawnCounter,
    nextShroomSpawnTurn: nextShroomSpawnTurn,
  };
}


export default function EvolvingChessPage() {
  const { user, userData } = useUser();
  const firestore = useFirestore();
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
  const [playerToPromote, setPlayerToPromote] = useState<PlayerColor | null>(null);
  const [promotionMoveWasCapture, setPromotionMoveWasCapture] = useState(false);
  const [promotionPawnOriginalLevel, setPromotionPawnOriginalLevel] = useState<number | null>(null);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef<VibeChessAI | null>(null);
  const aiErrorOccurredRef = useRef(false);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [gameMoveCounter, setGameMoveCounter] = useState(0);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);


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

  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);

  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);

  const [resurrectedSquares, setResurrectedSquares] = useState<ResurrectedSquareInfo[]>([]);

  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);

  const [turnTimer, setTurnTimer] = useState<number | null>(null);
  const [activeTimerPlayer, setActiveTimerPlayer] = useState<PlayerColor | null>(null);
  const turnTimerIntervalId = useRef<NodeJS.Timeout | null>(null);
  const [whiteTimeouts, setWhiteTimeouts] = useState(0);
  const [blackTimeouts, setBlackTimeouts] = useState(0);
  const [effects, setEffects] = useState<Effect[]>([]);

  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [playerToDropAnvil, setPlayerToDropAnvil] = useState<PlayerColor | null>(null);
  const [anvilDropContext, setAnvilDropContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null>(null);
  const [anvilDropAfterPromotion, setAnvilDropAfterPromotion] = useState(false);


  const { toast } = useToast();
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn || isAwaitingCommanderPromotion;

  const [inputRoomId, setInputRoomId] = useState('');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'waiting'>('disconnected');
  const [gamePlayers, setGamePlayers] = useState<{white: {username?: string; userId?: string; elo?: number;} | null, black: {username?: string; userId?: string; elo?: number;} | null} | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [showLossScreen, setShowLossScreen] = useState(false);
  const [showWinScreen, setShowWinScreen] = useState(false);
  const [timerWarningKey, setTimerWarningKey] = useState(0);
  const [showTimerWarning, setShowTimerWarning] = useState(false);
  const [isRankedGame, setIsRankedGame] = useState(false);
  const [rankedQueueStatus, setRankedQueueStatus] = useState<'idle' | 'searching'>('idle');
  const prevKillStreaksRef = useRef<{ white: number; black: number }>({ white: 0, black: 0 });
  const prevFirstBloodRef = useRef(false);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor) => {
    const newEffect: Effect = {
        id: Date.now() + Math.random(),
        type,
        square,
        color,
    };
    setEffects(prev => [...prev, newEffect]);
  }, []);

  useEffect(() => {
    if (effects.length > 0) {
      const timer = setTimeout(() => {
        setEffects([]);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [effects]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    if (!player) return 'A player'; // Guard against undefined player
    if (onlineStatus === 'connected' || onlineStatus === 'waiting') {
        const username = gamePlayers?.[player]?.username;
        if (username) {
            if (player === localPlayerColor) {
                return `${username} (You)`;
            }
            return username;
        }
    }
    
    // Local game logic
    let baseName: string = player.charAt(0).toUpperCase() + player.slice(1);
    
    if (player === 'white' && isWhiteAI && onlineStatus === 'disconnected') return `${baseName} (AI)`;
    if (player === 'black' && isBlackAI && onlineStatus === 'disconnected') return `${baseName} (AI)`;

    return baseName;
  }, [isWhiteAI, isBlackAI, onlineStatus, localPlayerColor, gamePlayers]);
  
  const fullGameReset = useCallback(() => {
    globalUniqueIdCounter = 0;
    const initialBoardState = initializeBoard();
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameMoveCounter(0);

    const newIsWhiteAI = false;
    const newIsBlackAI = false;
    setIsWhiteAI(newIsWhiteAI);
setIsBlackAI(newIsBlackAI);

    setGameInfo({ ...initialGameStatus });
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights, null);
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
    setPlayerToPromote(null);
    setPromotionMoveWasCapture(false);
    setPromotionPawnOriginalLevel(null);
    setKillStreaks({ white: 0, black: 0 });
    setHistoryStack([]);
    setLastMoveFrom(null);
    setLastMoveTo(null);

    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;

    setBoardOrientation('white');
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

    setFirstBloodAchieved(false);
    setPlayerWhoGotFirstBlood(null);
    setIsAwaitingCommanderPromotion(false);

    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    
    setLocalPlayerColor(null);
    setRoomId(null);
    setOnlineStatus('disconnected');
    setGamePlayers(null);

    setResurrectedSquares([]);
    setPieceForInfoDisplay(null);
    setShowLossScreen(false);
    setShowWinScreen(false);
    setEffects([]);

    setTurnTimer(null);
    setActiveTimerPlayer(null);
    if (turnTimerIntervalId.current) clearInterval(turnTimerIntervalId.current);
    setWhiteTimeouts(0);
    setBlackTimeouts(0);
    setIsRankedGame(false);
    setRankedQueueStatus('idle');
    setEnPassantTargetSquare(null);

    setIsAwaitingAnvilDrop(false);
    setPlayerToDropAnvil(null);
    setAnvilDropContext(null);
    setAnvilDropAfterPromotion(false);
  }, []);

  const disconnectAndReset = useCallback(() => {
    if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent onclose handler from running again
        wsRef.current.close();
        wsRef.current = null;
    }
    if (onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle') {
      fullGameReset();
      toast({ title: "Disconnected", description: "You have left the online session.", duration: 1000 });
    }
  }, [fullGameReset, toast, onlineStatus, rankedQueueStatus]);

  const determineBoardOrientation = useCallback((): PlayerColor => {
    if (isWhiteAI && isBlackAI && onlineStatus === 'disconnected') return 'white';
    if (isWhiteAI && !isBlackAI && onlineStatus === 'disconnected') return 'black';
    if (!isWhiteAI && isBlackAI && onlineStatus === 'disconnected') return 'white';

    if (onlineStatus === 'connected' || onlineStatus === 'waiting') {
        return localPlayerColor || 'white';
    }

    if (viewMode === 'flipping') return currentPlayer;
    return 'white';
  }, [isWhiteAI, isBlackAI, onlineStatus, localPlayerColor, viewMode, currentPlayer]);

  useEffect(() => {
    if (animatedSquareTo) {
      const timer = setTimeout(() => setAnimatedSquareTo(null), 800);
      return () => clearTimeout(timer);
    }
  }, [animatedSquareTo]);

  useEffect(() => {
    // Clear resurrection highlights for the player whose turn it now is.
    if (resurrectedSquares.length > 0) {
      setResurrectedSquares(prev => prev.filter(rs => rs.player !== currentPlayer));
    }
  }, [currentPlayer]);

  const getKillStreakToastMessage = useCallback((streak: number): string | null => {
    if (streak === 2) return "DOUBLE KILL!";
    if (streak === 3) return "TRIPLE KILL!";
    if (streak === 4) return "ULTRA KILL!";
    if (streak === 5) return "MONSTER KILL!";
    if (streak >= 6) return "RAMPAGE!";
    return null;
  }, []);

  const saveStateToHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(square => ({
        ...square,
        piece: square.piece ? { ...square.piece } : null,
        item: square.item ? { ...square.item } : null,
      }))),
      currentPlayer: currentPlayer,
      gameInfo: { ...gameInfo },
      capturedPieces: {
        white: capturedPieces.white.map(p => ({ ...p })),
        black: capturedPieces.black.map(p => ({ ...p })),
      },
      killStreaks: { ...killStreaks },
      boardOrientation: boardOrientation,
      viewMode: viewMode,
      isWhiteAI: isWhiteAI,
      isBlackAI: isBlackAI,
      enemySelectedSquare: enemySelectedSquare,
      enemyPossibleMoves: [...enemyPossibleMoves],
      positionHistory: [...positionHistory],
      lastMoveFrom: lastMoveFrom,
      lastMoveTo: lastMoveTo,
      gameMoveCounter: gameMoveCounter,
      enPassantTargetSquare: enPassantTargetSquare,

      isAwaitingPawnSacrifice: isAwaitingPawnSacrifice,
      playerToSacrificePawn: playerToSacrificePawn,
      boardForPostSacrifice: boardForPostSacrifice ? boardForPostSacrifice.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))) : null,
      playerWhoMadeQueenMove: playerWhoMadeQueenMove,
      isExtraTurnFromQueenMove: isExtraTurnFromQueenMove,
      isAwaitingRookSacrifice: isAwaitingRookSacrifice,
      playerToSacrificeForRook: playerToSacrificeForRook,
      rookToMakeInvulnerable: rookToMakeInvulnerable,
      boardForRookSacrifice: boardForRookSacrifice ? boardForRookSacrifice.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))) : null,
      originalTurnPlayerForRookSacrifice: originalTurnPlayerForRookSacrifice,
      isExtraTurnFromRookLevelUp: isExtraTurnFromRookLevelUp,
      isResurrectionPromotionInProgress: isResurrectionPromotionInProgress,
      playerForPostResurrectionPromotion: playerForPostResurrectionPromotion,
      isExtraTurnForPostResurrectionPromotion: isExtraTurnForPostResurrectionPromotion,
      promotionSquare: promotionSquare,
      promotionMoveWasCapture: promotionMoveWasCapture,
      promotionPawnOriginalLevel: promotionPawnOriginalLevel,
      firstBloodAchieved: firstBloodAchieved,
      playerWhoGotFirstBlood: playerWhoGotFirstBlood,
      isAwaitingCommanderPromotion: isAwaitingCommanderPromotion,
      shroomSpawnCounter: shroomSpawnCounter,
      nextShroomSpawnTurn: nextShroomSpawnTurn,
      resurrectedSquares: [...resurrectedSquares],
      turnTimer: turnTimer,
      activeTimerPlayer: activeTimerPlayer,
      whiteTimeouts: whiteTimeouts,
      blackTimeouts: blackTimeouts,
      originalPromotionLevel: promotionPawnOriginalLevel,
      isAwaitingAnvilDrop: isAwaitingAnvilDrop,
      playerToDropAnvil: playerToDropAnvil,
      anvilDropContext: anvilDropContext,
      anvilDropAfterPromotion: anvilDropAfterPromotion,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20);
      return newHistory;
    });
  }, [
    board, currentPlayer, gameInfo, capturedPieces, killStreaks, boardOrientation, viewMode,
    isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory, lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion, promotionSquare, promotionMoveWasCapture, promotionPawnOriginalLevel,
    firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn,
    resurrectedSquares, turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts,
    isAwaitingAnvilDrop, playerToDropAnvil, anvilDropContext, anvilDropAfterPromotion,
  ]);

  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    setCurrentPlayer(playerTakingExtraTurn);


    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor, null);

    if (opponentInCheck) {
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins by delivering check with an extra turn!`, duration: 8000 });
      setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn }));
      if (onlineStatus === 'connected') {
        const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: playerTakingExtraTurn, timedOutPlayer: opponentColor, reason: 'auto-checkmate' }));
        }
      }
      return;
    }

    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor, null);
    if (opponentIsStalemated) {
      setGameInfo(prev => ({ ...prev, message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
       if (onlineStatus === 'connected') {
         const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'stalemate' }));
        }
      }
    } else {
      setGameInfo(prev => ({ ...prev, message, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [toast, getPlayerDisplayName, onlineStatus]);

  const stopTurnTimer = useCallback(() => {
      if (turnTimerIntervalId.current) {
          clearInterval(turnTimerIntervalId.current);
          turnTimerIntervalId.current = null;
      }
      setActiveTimerPlayer(null);
      setTurnTimer(null);
  }, []);

  const startTurnTimer = useCallback((player: PlayerColor, duration: number = 45) => {
    stopTurnTimer();

    setActiveTimerPlayer(player);
    setTurnTimer(duration);

    turnTimerIntervalId.current = setInterval(() => {
        setTurnTimer(currentTimerValue => {
            if (currentTimerValue === null || currentTimerValue <= 0) {
                 if (turnTimerIntervalId.current) {
                    clearInterval(turnTimerIntervalId.current);
                    turnTimerIntervalId.current = null;
                 }
                 return 0;
            }
            
            if (currentTimerValue === 11) {
                setShowTimerWarning(true);
                setTimerWarningKey(k => k + 1);
            }
            return currentTimerValue - 1;
        });
    }, 1000);
  }, [stopTurnTimer, setShowTimerWarning, setTimerWarningKey]);

  useEffect(() => {
    // This effect is the single source of truth for all UI timers in online games.
    if (onlineStatus !== 'connected' || gameInfo.gameOver) {
      stopTurnTimer();
      return;
    }

    let timerStarted = false;

    // --- Special Action Timers (15s) ---
    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === localPlayerColor) {
      startTurnTimer(playerWhoGotFirstBlood, 15);
      timerStarted = true;
    } else if (isAwaitingAnvilDrop && playerToDropAnvil === localPlayerColor) {
      startTurnTimer(playerToDropAnvil, 15);
      timerStarted = true;
    } else if (isPromotingPawn && playerToPromote === localPlayerColor) {
      startTurnTimer(playerToPromote, 15);
      timerStarted = true;
    }
    
    const isAnySpecialAction = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress;

    // --- Main Turn Timer (45s) ---
    if (!timerStarted && !isAnySpecialAction) {
      startTurnTimer(currentPlayer);
      timerStarted = true;
    }

    // --- Stop Timer Condition ---
    if (!timerStarted) {
      // This will be hit if a special action is ongoing for the OTHER player,
      // or if we are in some other state where no timer should be active.
      stopTurnTimer();
    }

    return () => {
      stopTurnTimer();
    };
  }, [
    onlineStatus,
    gameInfo.gameOver,
    currentPlayer,
    localPlayerColor,
    // Special action states
    isAwaitingCommanderPromotion,
    playerWhoGotFirstBlood,
    isAwaitingAnvilDrop,
    playerToDropAnvil,
    isPromotingPawn,
    playerToPromote,
    // Other flags that might stop timers
    isAwaitingPawnSacrifice,
    isAwaitingRookSacrifice,
    isResurrectionPromotionInProgress,
    // useCallback dependencies
    startTurnTimer,
    stopTurnTimer,
  ]);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor, newEnPassantTarget: AlgebraicSquare | null) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setEnPassantTargetSquare(newEnPassantTarget);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const inCheck = isKingInCheck(updatedBoard, nextPlayer, newEnPassantTarget);
    let newPlayerWithKingInCheck: PlayerColor | null = null;
    let currentMessage = " ";

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer, newEnPassantTarget);
      if (mate) {
        currentMessage = `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded }));
         if (onlineStatus === 'connected') {
          const ws = wsRef.current;
          if(ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: playerWhoseTurnEnded, timedOutPlayer: nextPlayer, reason: 'checkmate' }));
          }
        }
        return;
      } else {
        currentMessage = "Check!";
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer, newEnPassantTarget);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
         if (onlineStatus === 'connected') {
          const ws = wsRef.current;
          if(ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'stalemate' }));
          }
        }
        return;
      }
    }
     setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: inCheck, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));
  }, [getPlayerDisplayName, onlineStatus]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep;
    const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter);
    
    // Item Spawn Logic - only the current player triggers the check
    if (onlineStatus !== 'connected' || localPlayerColor === playerWhoseTurnCompleted) {
      // Shroom Spawn Logic
      let currentShroomCounter = shroomSpawnCounter + 1;
      setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= nextShroomSpawnTurn) {
          if (onlineStatus === 'connected') {
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'shroom-spawn' }));
              }
          } else {
              const { newBoard, spawnedAt } = spawnShroom(currentBoardState);
              if (spawnedAt) {
                  currentBoardState = newBoard;
                  setBoard(currentBoardState);
                  const newNextTurn = Math.floor(Math.random() * 6) + 5;
                  toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
                  setShroomSpawnCounter(0);
                  setNextShroomSpawnTurn(newNextTurn);
              }
          }
      }
    }


    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(currentBoardState);
    const currentPositionHash = boardToPositionHash(currentBoardState, nextPlayerForHash, castlingRights, newEnPassantTarget);

    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.isCheckmate && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw && !gameInfo.isInfiltrationWin) {
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 8000 });
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
      if (onlineStatus === 'connected') {
        const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'threefold-repetition' }));
        }
      }
      return;
    }

    if (gameInfo.gameOver) { 
      return;
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(currentBoardState, playerWhoseTurnCompleted);
    } else {
      completeTurn(currentBoardState, playerWhoseTurnCompleted, newEnPassantTarget);
    }
  }, [
    positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, gameInfo.isInfiltrationWin, gameInfo.gameOver,
    setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn,
    gameMoveCounter, setBoard,
    getPlayerDisplayName, setCurrentPlayer, isWhiteAI, isBlackAI, 
    shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus,
    localPlayerColor
  ]);

  const applyServerGameState = useCallback((gameState: any, lastPlayer?: PlayerColor) => {
    if (!gameState) return;
    console.log('[CLIENT] Applying server game state:', gameState);

    setBoard(gameState.board);
    if (gameState.players) setGamePlayers(gameState.players);
    setCapturedPieces(gameState.capturedPieces);
    setKillStreaks(gameState.killStreaks);
    setGameInfo(gameState.gameInfo);
    setCurrentPlayer(gameState.currentPlayer);
    setGameMoveCounter(gameState.gameMoveCounter || 0);
    setLastMoveFrom(gameState.lastMoveFrom || null);
    setLastMoveTo(gameState.lastMoveTo || null);
    setEnPassantTargetSquare(gameState.enPassantTargetSquare || null);
    setFirstBloodAchieved(gameState.firstBloodAchieved || false);
    setIsAwaitingCommanderPromotion(gameState.isAwaitingCommanderPromotion || false);
    setPlayerWhoGotFirstBlood(gameState.playerWhoGotFirstBlood || null);
    setWhiteTimeouts(gameState.whiteTimeouts || 0);
    setBlackTimeouts(gameState.blackTimeouts || 0);

    // Reset transient UI state that shouldn't be persisted from local play
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setIsMoveProcessing(false);

    // Clear history to prevent local-online interference
    setHistoryStack([]);
    const castlingRights = getCastlingRightsString(gameState.board);
    const initialHash = boardToPositionHash(gameState.board, gameState.currentPlayer, castlingRights, gameState.enPassantTargetSquare || null);
    if (initialHash) setPositionHistory([initialHash]); else setPositionHistory([]);
    
    // Only animate if there's a last move, otherwise it's a fresh board
    if (gameState.lastMoveTo) {
      setAnimatedSquareTo(gameState.lastMoveTo);
    } else {
      setAnimatedSquareTo(null);
    }

    if (gameState.resurrectedSquare && lastPlayer) {
      addEffect('light-beam', gameState.resurrectedSquare);
      setResurrectedSquares(prev => [...prev, { square: gameState.resurrectedSquare, player: lastPlayer }]);
    }
  }, [addEffect]);


  const handleIncomingData = useCallback((data: any) => {
      console.log('[CLIENT] < RECEIVED WS from server:', data);
      switch (data.type) {
        case 'promotion-required': {
            console.log('[CLIENT] "promotion-required" case hit.');
            const { square, player } = data;
            
            applyServerGameState(data.fullGameState);
            setIsMoveProcessing(false);

            if (player === localPlayerColor) {
                console.log(`[CLIENT] This client (${localPlayerColor}) needs to promote.`);
                setPlayerToPromote(player);
                setIsPromotingPawn(true);
                setPromotionSquare(square);
                setIsResurrectionPromotionInProgress(!!data.fullGameState.promotionContext?.fromResurrection);
            } else {
                console.log(`[CLIENT] Another player (${player}) is promoting. My color is ${localPlayerColor}.`);
            }
            break;
        }
        case 'awaiting-anvil-drop': {
            const { fullGameState, player } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false); 

            setIsAwaitingAnvilDrop(true);
            setPlayerToDropAnvil(player);
            if (player === localPlayerColor) {
              setGameInfo(prev => ({...prev, message: "KILL STREAK OF 3! Place an anvil."}));
            } else {
              setGameInfo(prev => ({...prev, message: `KILL STREAK OF 3! ${getPlayerDisplayName(player)} is placing an anvil.`}));
            }
            break;
        }
        case 'commander-promo-finalized': {
            applyServerGameState(data.fullGameState, data.lastPlayer);
            break;
        }
        case 'game-move': {
            applyServerGameState(data.fullGameState, data.lastPlayer);
            // After applying the new definitive state, reset any client-side "awaiting" flags.
            setIsAwaitingAnvilDrop(false);
            setPlayerToDropAnvil(null);
            break;
        }
        case 'awaiting-commander-promo': {
            const { fullGameState } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false);

            // Crucially, set the awaiting promotion flag
            setIsAwaitingCommanderPromotion(true);
            toast({ title: "First Blood!", description: `${getPlayerDisplayName(fullGameState.playerWhoGotFirstBlood!)} to select a Pawn to promote!`, duration: 8000});
            break;
        }
        case 'shroom-spawn': {
            const { square, nextTurn } = data;
            const { row, col } = algebraicToCoords(square);
            setBoard(currentBoard => {
                const newBoard = currentBoard.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
                newBoard[row][col].item = { type: 'shroom' };
                return newBoard;
            });
            setShroomSpawnCounter(0);
            setNextShroomSpawnTurn(nextTurn);
            toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
            break;
        }
        case 'forfeit-timeout':
        case 'game-over':
        case 'resign': {
            const { winner, reason, timedOutPlayer, resigningPlayer, eloChanges } = data;
            let message = "";
            let isResignation = data.type === 'resign';
            if (reason === 'checkmate') message = `Checkmate! ${getPlayerDisplayName(winner)} wins!`;
            else if (reason === 'stalemate') message = `Stalemate! It's a draw.`;
            else if (reason === 'threefold-repetition') message = `Draw by Threefold Repetition!`;
            else if (reason === 'infiltration') message = `${getPlayerDisplayName(winner)} wins by Infiltration!`;
            else if (reason === 'self-check') {
                toast({
                    title: "Auto-Checkmate!",
                    description: `${getPlayerDisplayName(timedOutPlayer!)}'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(winner)} wins!`,
                    variant: "destructive",
                    duration: 8000,
                });
                message = `Checkmate! ${getPlayerDisplayName(winner)} wins by self-check!`;
            }
            else if (reason === 'self-check-timeout') message = `${getPlayerDisplayName(timedOutPlayer!)} lost by running out of time in check!`;
            else if (reason === 'timeout') message = `${getPlayerDisplayName(timedOutPlayer!)} ran out of time. ${getPlayerDisplayName(winner)} wins!`;
            else if (isResignation) message = `${getPlayerDisplayName(resigningPlayer)} resigned. ${getPlayerDisplayName(winner)} wins!`;
            
            setGameInfo(prev => ({ ...prev, message, gameOver: true, winner }));
            
            if (isRankedGame && eloChanges && user) {
                const playerEloChange = eloChanges[user.uid];
                if (playerEloChange) {
                    const eloChange = playerEloChange.newElo - playerEloChange.oldElo;
                    const newWins = winner === localPlayerColor ? playerEloChange.wins + 1 : playerEloChange.wins;
                    const newLosses = winner !== localPlayerColor && winner !== 'draw' ? playerEloChange.losses + 1 : playerEloChange.losses;

                    toast({
                        title: `Ranked Match Complete! ELO: ${playerEloChange.newElo} (${eloChange > 0 ? '+' : ''}${eloChange})`,
                        description: `Wins: ${newWins}, Losses: ${newLosses}`,
                        duration: 8000,
                    });
                    
                    const userDocRef = doc(firestore, 'users', user.uid);
                    updateDocumentNonBlocking(userDocRef, {
                        eloRating: playerEloChange.newElo,
                        wins: newWins,
                        losses: newLosses
                    });
                }
            }
            setIsRankedGame(false);
            setIsMoveProcessing(false);
            setAnimatedSquareTo(null);
            break;
        }
    }
  }, [localPlayerColor, toast, getPlayerDisplayName, isRankedGame, user, firestore, applyServerGameState]);


  // Effect for cleaning up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopTurnTimer();
    };
  }, [stopTurnTimer]);

  const handleOnlinePlay = useCallback(async (action: 'create' | 'join' | 'ranked') => {
    if (wsRef.current) {
      disconnectAndReset();
      return;
    }
  
    // Reset local game state before initiating online connection
    fullGameReset();

    setOnlineStatus('connecting');
  
    const getWebSocketUrl = () => {
      if (typeof window === 'undefined') return '';
      const hostname = window.location.hostname;
      // In a typical cloud dev environment, the server port might be mapped differently.
      // This logic attempts to replace a common client-side port (like 9000) with the server-side port (8080).
      // You may need to adjust this based on your specific environment.
      const websocketHostname = hostname.replace(/^(\d+)-/, '8080-');
      return `wss://${websocketHostname}`;
    };
  
    const wsUrl = getWebSocketUrl();
    if (!wsUrl) {
      toast({ title: "Connection Error", description: "Could not generate a valid WebSocket URL.", variant: 'destructive', duration: 8000 });
      setOnlineStatus('disconnected');
      return;
    }
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
  
    ws.onopen = () => {
      console.log('[CLIENT] WebSocket connected.');
      const userInfo = user ? { userId: user.uid, username: userData?.username || user.displayName || 'Anonymous' } : null;
      let payload;
      if (action === 'create') {
        payload = { type: 'create-room', user: userInfo };
      } else if (action === 'join' && inputRoomId) {
        payload = { type: 'join-room', roomId: inputRoomId, user: userInfo };
      } else if (action === 'ranked') {
          if(user) {
              setRankedQueueStatus('searching');
              payload = { type: 'join-ranked-queue', userId: user.uid, username: userData?.username, elo: userData?.eloRating };
          }
      }
      if (payload) {
          console.log('[CLIENT] > SENDING WS to server:', payload);
          ws.send(JSON.stringify(payload));
      }
    };
  
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        console.log('[CLIENT] < RECEIVED WS from server:', data); // Log all incoming messages
        switch (data.type) {
          case 'room-created':
            setRoomId(data.roomId);
            setLocalPlayerColor(data.color);
            setOnlineStatus('waiting');
            applyServerGameState(data.gameState);
            toast({ title: "Room Created!", description: `Share Room ID: ${data.roomId}`, duration: 8000 });
            break;
          case 'player-joined':
            applyServerGameState(data.gameState);
            setOnlineStatus('connected');
            toast({ title: "Player Joined!", description: "Your game is starting.", duration: 8000 });
            break;
          case 'room-joined':
            setRoomId(data.roomId);
            setLocalPlayerColor(data.color);
            applyServerGameState(data.gameState);
            setOnlineStatus('connected');
            toast({ title: "Joined Room!", description: `Successfully joined room ${data.roomId}.`, duration: 8000 });
            break;
          case 'ranked-match-found':
              setRankedQueueStatus('idle');
              setRoomId(data.roomId);
              setLocalPlayerColor(data.color);
              applyServerGameState(data.gameState);
              setIsRankedGame(true);
              setOnlineStatus('connected');
              toast({ title: "Ranked Match Found!", description: "Your ranked game is starting.", duration: 8000 });
              break;
          case 'opponent-disconnected':
            if (gameInfo.gameOver) return;
            const winningPlayer = localPlayerColor || (gamePlayers?.white?.userId === user?.uid ? 'white' : 'black');
            toast({ title: "Opponent Left", description: "Your opponent has disconnected. You win!", duration: 8000 });
            setGameInfo(prev => ({ ...prev, gameOver: true, winner: winningPlayer, message: "Opponent disconnected. You win!" }));
            // We do NOT call disconnectAndReset() immediately to preserve state for win/loss screen
            break;
          case 'error':
            toast({ title: "Connection Error", description: data.message, variant: 'destructive', duration: 8000 });
            if(wsRef.current) {
              wsRef.current.onclose = null;
              wsRef.current.close();
              wsRef.current = null;
            }
            setOnlineStatus('disconnected');
            setRankedQueueStatus('idle');
            break;
          default:
            handleIncomingData(data);
            break;
        }
      } catch (err) {
        console.error('[CLIENT] Error parsing WebSocket message:', err);
      }
    };
  
    ws.onerror = (err) => {
      console.error('[CLIENT] WebSocket error:', err);
      toast({ title: "Connection Error", description: "Could not connect to the game server. Check console for details.", variant: 'destructive', duration: 8000 });
      setOnlineStatus('disconnected');
      setRankedQueueStatus('idle');
    };
  
    ws.onclose = (event) => {
        console.log(`[CLIENT] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
        if (wsRef.current) { // Check if the closure is for the current WebSocket instance
            wsRef.current = null;
            if (onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle') {
                // If game is over, keep state so winner can see result. Otherwise, reset.
                if (!gameInfo.gameOver) {
                    toast({ title: "Connection Closed", description: "Disconnected from game server.", duration: 8000});
                    fullGameReset();
                } else {
                    setOnlineStatus('disconnected');
                }
            }
        }
    };
  
  }, [inputRoomId, handleIncomingData, gameInfo.gameOver, localPlayerColor, disconnectAndReset, fullGameReset, toast, onlineStatus, user, userData, rankedQueueStatus, gamePlayers, applyServerGameState]);
  

  useEffect(() => {
    const initializeAI = () => {
      try {
        aiInstanceRef.current = new VibeChessAI(2);
      } catch (err: any) {
        toast({
          title: "AI Initialization Error",
          description: `There was an issue loading the AI component: ${err.message}`,
          variant: "destructive",
          duration: 8000,
        });
      }
    };
    initializeAI();
  }, [toast]);


  useEffect(() => {
    setBoardOrientation(determineBoardOrientation());
  }, [determineBoardOrientation]);

  const hasAnyLegalMoves = useCallback((board: BoardState, playerColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const squareState = board[r]?.[c];
        if(!squareState) continue;
        const piece = squareState.piece;
        if (piece && piece.color === playerColor) {
          const pieceSquareAlgebraic = squareState.algebraic;
          const legalMoves = getPossibleMoves(board, pieceSquareAlgebraic, enPassantTargetSquare);
          if (legalMoves.length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    queenMovedWithThis: Move | null,
    originalPieceLevelIfKnown: number | undefined,
    isExtraTurnFromOriginalMove: boolean,
    newEnPassantTarget: AlgebraicSquare | null
  ): boolean => {

    if (!queenMovedWithThis) {
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, newEnPassantTarget);
        return false;
    }

    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenOnSquare = boardAfterPrimaryMove[toR]?.[toC]?.piece;

    if (!queenOnSquare || queenOnSquare.type !== 'queen' || queenOnSquare.color !== playerWhoseQueenLeveled) {
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, newEnPassantTarget);
        return false;
    }

    const currentQueenLevel = Number(queenOnSquare.level || 1);
    const previousLevelOfThisPiece = Number(originalPieceLevelIfKnown || 0);

    let leveledUpToQueenL7 = false;
    if (currentQueenLevel === 7) {
        if (queenMovedWithThis?.type === 'promotion' && queenMovedWithThis.promoteTo === 'queen') {
            leveledUpToQueenL7 = true;
        } else if (queenMovedWithThis?.type !== 'promotion' && queenOnSquare.type === 'queen' && previousLevelOfThisPiece < 7) {
            leveledUpToQueenL7 = true;
        }
    }


    if (leveledUpToQueenL7) {
      let hasPawnsToSacrifice = false;
      for (const row of boardAfterPrimaryMove) {
        for (const square of row) {
          if (square.piece && (square.piece.type === 'pawn' || square.piece.type === 'commander') && square.piece.color === playerWhoseQueenLeveled) {
            hasPawnsToSacrifice = true;
            break;
          }
        }
        if (hasPawnsToSacrifice) break;
      }

      if (hasPawnsToSacrifice) {
        const isCurrentPlayerAI = (playerWhoseQueenLeveled === 'white' && isWhiteAI && onlineStatus === 'disconnected') || (playerWhoseQueenLeveled === 'black' && isBlackAI && onlineStatus === 'disconnected');
        if (isCurrentPlayerAI) {
          let pawnSacrificed = false;
          const boardCopyForAISacrifice = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
          let sacrificedAIPawn: Piece | null = null;

          for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
              const pieceAtSquare = boardCopyForAISacrifice[r_idx][c_idx].piece;
              if (pieceAtSquare && (pieceAtSquare.type === 'pawn' || pieceAtSquare.type === 'commander') && pieceAtSquare.color === playerWhoseQueenLeveled) {
                sacrificedAIPawn = { ...pieceAtSquare, id: `${pieceAtSquare.id}_sac_AI_${globalUniqueIdCounter++}` };
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
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)} (AI) sacrificed a Pawn/Commander for L7 Queen!`, duration: 8000 });
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, newEnPassantTarget);
          return false;
        } else {
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))));
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
          setEnPassantTargetSquare(newEnPassantTarget);
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select Pawn/Commander to sacrifice for L7 Queen!` }));
          return true;
        }
      }
    }
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, newEnPassantTarget);
    return false;
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, processMoveEnd, isWhiteAI, isBlackAI, setBoard, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, setCapturedPieces, onlineStatus]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    let moveBeingMade: Move | null = null;
    let humanPlayerAchievedFirstBloodThisTurn = false;
    let originalPieceLevelBeforeMove: number | undefined;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;
    setPieceForInfoDisplay(clickedPiece || null);

    // --- Online "Not My Turn" block ---
    if (onlineStatus === 'connected' && localPlayerColor !== currentPlayer) {
        if (clickedPiece) {
            // Allow selecting any piece for info, but don't show moves for opponent's pieces
            // to avoid confusion. This is a UI choice.
            if (clickedPiece.color === localPlayerColor) {
                // It's not my turn, but I'm clicking my own piece.
                setSelectedSquare(algebraic);
                setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare));
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else {
                // It's not my turn, and I'm clicking an opponent's piece.
                setSelectedSquare(null);
                setPossibleMoves([]);
                setEnemySelectedSquare(algebraic);
                setEnemyPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare));
            }
        } else {
            // Clicked an empty square when it's not my turn.
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
        return; // Exit here for online "not my turn" case.
    }

    if (isAwaitingAnvilDrop && playerToDropAnvil === currentPlayer) {
        if (!clickedSquareState?.piece && !clickedSquareState?.item) {
            if (onlineStatus === 'connected') {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'anvil-drop', square: algebraic }));
                }
                // Client now waits for server to respond after setting processing to true.
                setIsMoveProcessing(true); 
                return;
            }
    
            // --- Offline Logic ---
            saveStateToHistory();
            const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = anvilDropContext!;
            const boardAfterAnvilDrop = boardForNextStep.map(r => r.map(s => ({ ...s })));
            boardAfterAnvilDrop[row][col].item = { type: 'anvil' };
            setBoard(boardAfterAnvilDrop);
            
            toast({ title: "Anvil Dropped!", description: `Anvil placed on ${algebraic}.`, duration: 2000 });
        
            processMoveEnd(boardAfterAnvilDrop, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget);
        
            setIsAwaitingAnvilDrop(false);
            setPlayerToDropAnvil(null);
            setAnvilDropContext(null);
        } else {
            toast({ title: "Invalid Placement", description: "Anvil must be placed on an empty square.", variant: "destructive" });
        }
        return;
    }

    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress) {
      if (!(isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)) {
          return;
      }
    }
    
    const clickedItem = clickedSquareState?.item;

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) {
        if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer && clickedPiece.level === 1) {
            saveStateToHistory();
            
            if (onlineStatus === 'connected') {
                const ws = wsRef.current;
                if(ws && ws.readyState === WebSocket.OPEN) {
                    const payload = JSON.stringify({ type: 'commander-promo', square: algebraic });
                    console.log('[CLIENT] > SENDING WS to server:', payload);
                    ws.send(payload);
                }
                // Client no longer progresses state; it waits for server's authoritative response.
                setIsAwaitingCommanderPromotion(false);
                setPlayerWhoGotFirstBlood(null);
                return;
            }

            // This block now only runs for local games
            const boardAfterCommanderPromo = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            boardAfterCommanderPromo[row][col].piece!.type = 'commander';
            boardAfterCommanderPromo[row][col].piece!.id = `${boardAfterCommanderPromo[row][col].piece!.id}_CMD_${globalUniqueIdCounter++}`;
            setBoard(boardAfterCommanderPromo);
            toast({ title: "Commander Promoted!", description: `${getPlayerDisplayName(currentPlayer)}'s Pawn on ${algebraic} is now a Commander!`, duration: 8000});
            
            setIsAwaitingCommanderPromotion(false);
            setPlayerWhoGotFirstBlood(null);
            
            const playerWhoActed = currentPlayer;
            const opponent = playerWhoActed === 'white' ? 'black' : 'white';
            
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
            setLastMoveFrom(null);
            setLastMoveTo(algebraic);

            // Turn progression is now handled authoritatively by the server in online mode.
            // For local, we set the next player's turn.
            setCurrentPlayer(opponent);
            const inCheck = isKingInCheck(boardAfterCommanderPromo, opponent, enPassantTargetSquare);
             if (isCheckmate(boardAfterCommanderPromo, opponent, enPassantTargetSquare)) {
                setGameInfo({ message: `Checkmate! ${playerWhoActed} wins!`, isCheck: true, playerWithKingInCheck: opponent, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoActed });
            } else if (isStalemate(boardAfterCommanderPromo, opponent, enPassantTargetSquare)) {
                setGameInfo({ message: "Stalemate! It's a draw.", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
            } else {
                 setGameInfo(prev => ({...prev, message: inCheck ? "Check!" : " ", isCheck: inCheck, playerWithKingInCheck: inCheck ? opponent : null, gameOver: false }));
            }
            return;
        } else {
            toast({title: "Invalid Commander Choice", description: "Select one of your own Level 1 Pawns to promote.", duration: 8000});
        }
        return;
    }


    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
      if (clickedPiece && (clickedPiece.type === 'pawn' || clickedPiece.type === 'commander') && clickedPiece.color === currentPlayer) {
        saveStateToHistory();
        let boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
        const pawnToSacrificeBase = { ...boardAfterSacrifice[row][col].piece! };
        const pawnToSacrifice = { ...pawnToSacrificeBase, id: `${pawnToSacrificeBase.id}_sac_${globalUniqueIdCounter++}`};
        addEffect('poof', algebraic);
        boardAfterSacrifice[row][col].piece = null;

        setBoard(boardAfterSacrifice);

        const opponentOfSacrificer = playerWhoMadeQueenMove! === 'white' ? 'black' : 'white';
        setCapturedPieces(prevCaptured => {
          const newCaptured = { ...prevCaptured };
          newCaptured[opponentOfSacrificer] = [...(newCaptured[opponentOfSacrificer] || []), pawnToSacrifice];
          return newCaptured;
        });

        toast({ title: "Pawn/Commander Sacrificed!", description: `${getPlayerDisplayName(currentPlayer)} sacrificed their ${pawnToSacrifice.type}!`, duration: 8000 });
        if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if(ws && ws.readyState === WebSocket.OPEN) {
                const payload = JSON.stringify({ type: 'game-move', payload: { type: 'pawn-sacrifice', player: currentPlayer, square: algebraic } });
                console.log('[CLIENT] > SENDING WS to server:', payload);
                ws.send(payload);
            }
        }


        const playerWhoTriggeredSacrifice = playerWhoMadeQueenMove;
        const extraTurnAfterSacrifice = isExtraTurnFromQueenMove;

        setIsAwaitingPawnSacrifice(false);
        setPlayerToSacrificePawn(null);
        setBoardForPostSacrifice(null);
        setPlayerWhoMadeQueenMove(null);
        setIsExtraTurnFromQueenMove(false);

        setLastMoveFrom(null);
        setLastMoveTo(algebraic);

        processMoveEnd(boardAfterSacrifice, playerWhoTriggeredSacrifice!, extraTurnAfterSacrifice, enPassantTargetSquare);
      } else {
        toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns/Commanders to sacrifice for the Queen.", duration: 8000 });
      }
      return;
    }

    if (clickedItem && clickedItem.type !== 'shroom') {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
        return;
    }

    if (isAwaitingRookSacrifice && playerToSacrificeForRook === currentPlayer) {
      toast({ title: "Rook Action", description: "Rook ability is now automatic on L4+.", duration: 8000 });
      setIsAwaitingRookSacrifice(false);
      setPlayerToSacrificeForRook(null);
      setRookToMakeInvulnerable(null);
      processMoveEnd(boardForRookSacrifice || board, originalTurnPlayerForRookSacrifice || currentPlayer, isExtraTurnFromRookLevelUp || false, enPassantTargetSquare);
      setBoardForRookSacrifice(null);
      setOriginalTurnPlayerForRookSacrifice(null);
      setIsExtraTurnFromRookLevelUp(false);
      return;
    }

    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
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

      if (selectedSquare === algebraic && !(pieceToMoveFromSelected.type === 'knight' || pieceToMoveFromSelected.type === 'hero') && (Number(pieceToMoveFromSelected.level || 1)) >= 5) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
        return;
      }

      originalPieceLevelBeforeMove = Number(pieceToMoveFromSelected.level || 1);
      setPromotionPawnOriginalLevel(originalPieceLevelBeforeMove);


      moveBeingMade = { from: selectedSquare, to: algebraic };
      
      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      let isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);

      // Explicitly check and set en passant move type
      if (isMoveInFreshList) {
          if ((pieceToMoveFromSelected.type === 'pawn' || pieceToMoveFromSelected.type === 'commander') && algebraic === enPassantTargetSquare) {
            moveBeingMade.type = 'enpassant';
          } else if (board[row]?.[col]?.piece && board[row]?.[col]?.piece?.color !== pieceToMoveFromSelected.color) {
              moveBeingMade.type = 'capture';
          } else if (pieceToMoveFromSelected.type === 'king' && Math.abs(fromC_selected - col) === 2) {
              moveBeingMade.type = 'castle';
          }
      }


      if (selectedSquare === algebraic && (pieceToMoveFromSelected.type === 'knight' || pieceToMoveFromSelected.type === 'hero') && (Number(pieceToMoveFromSelected.level || 1)) >= 5) {
        const tempBoardForCheck = board.map(r => r.map(s => ({...s})));
        tempBoardForCheck[fromR_selected][fromC_selected].piece = null;
        if (isKingInCheck(tempBoardForCheck, currentPlayer, enPassantTargetSquare)) {
          toast({ title: "Illegal Move", description: "Cannot self-destruct into check.", duration: 8000 });
          return;
        }

        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(selectedSquare);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);
        addEffect('explosion', selectedSquare);
        moveBeingMade = { from: selectedSquare, to: selectedSquare, type: 'self-destruct' };
        
        if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if(ws && ws.readyState === WebSocket.OPEN) {
              const payload = JSON.stringify({ type: 'game-move', payload: moveBeingMade, movingPlayer: currentPlayer });
              console.log('[CLIENT] > SENDING WS to server:', payload);
              ws.send(payload);
            }
            return;
        }

        const applyMoveResult = applyMove(finalBoardStateForTurn, moveBeingMade, enPassantTargetSquare);
        let { newBoard, selfDestructCaptures, destroyedAnvils, enPassantTargetSet: nextEnpassantTarget } = applyMoveResult;
        
        finalBoardStateForTurn = newBoard;

        if (selfDestructCaptures) {
          selfDestructCaptures.forEach(p => finalCapturedPiecesStateForTurn[currentPlayer].push(p));
        }
        if (destroyedAnvils > 0) toast({ title: "Anvils Shattered!", description: `${getPlayerDisplayName(currentPlayer)} ${pieceToMoveFromSelected.type} destroyed ${destroyedAnvils} anvil${destroyedAnvils > 1 ? 's' : ''}!`, duration: 8000 });
        
        const selfDestructPlayer = currentPlayer;
        let newStreakForSelfDestructPlayer = killStreaks[selfDestructPlayer] || 0;
        let capturesThisTurnForSelfDestruct = selfDestructCaptures ? selfDestructCaptures.length : 0;
        
        if (capturesThisTurnForSelfDestruct > 0) {
            newStreakForSelfDestructPlayer += capturesThisTurnForSelfDestruct;
        } else {
            newStreakForSelfDestructPlayer = 0;
        }
        setKillStreaks(prev => ({...prev, [selfDestructPlayer]: newStreakForSelfDestructPlayer}));
        
        if (capturesThisTurnForSelfDestruct > 0) {
            if (!firstBloodAchieved) {
                setKillStreakFlashMessage("FIRST BLOOD!");
                setKillStreakFlashMessageKey(k => k + 1);
            } else {
                const streakMsg = getKillStreakToastMessage(newStreakForSelfDestructPlayer);
                if (streakMsg) {
                    setKillStreakFlashMessage(streakMsg);
                    setKillStreakFlashMessageKey(k => k + 1);
                }
            }
            setShowCaptureFlash(true);
            setCaptureFlashKey(k => k + 1);
        }

        const isHumanPlayerForFirstBlood = !((selfDestructPlayer === 'white' && isWhiteAI && onlineStatus === 'disconnected') || (selfDestructPlayer === 'black' && isBlackAI && onlineStatus === 'disconnected'));
        if (capturesThisTurnForSelfDestruct > 0 && !firstBloodAchieved) {
            setFirstBloodAchieved(true);
            setPlayerWhoGotFirstBlood(selfDestructPlayer);
            if (isHumanPlayerForFirstBlood) humanPlayerAchievedFirstBloodThisTurn = true;
            toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(selfDestructPlayer)} can promote a Level 1 Pawn to Commander!`, duration: 8000 });
        } else if (newStreakForSelfDestructPlayer === 3) {
            setIsAwaitingAnvilDrop(true);
            setPlayerToDropAnvil(selfDestructPlayer);
            setGameInfo(prev => ({ ...prev, message: `KILL STREAK OF 3! Place an anvil.` }));
            const anvilDropCtx = {
                boardForNextStep: finalBoardStateForTurn,
                playerWhoseTurnCompleted: selfDestructPlayer,
                isExtraTurn: false,
                newEnPassantTarget: nextEnpassantTarget
            };
            setAnvilDropContext(anvilDropCtx);
        } else if (newStreakForSelfDestructPlayer === 4) {
            let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[selfDestructPlayer === 'white' ? 'black' : 'white'] || [])];
            if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
              const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
              if (pieceToResurrectOriginal) {
                const emptySquares: AlgebraicSquare[] = [];
                for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece && !finalBoardStateForTurn[r_idx][c_idx].item) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                if (emptySquares.length > 0) {
                  const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                  const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                  const newUniqueSuffix = globalUniqueIdCounter++;
                  const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved, invulnerableTurnsRemaining: 0 };

                  const promoRow = selfDestructPlayer === 'white' ? 0 : 7;
                  if (resurrectedPiece.type === 'commander' && resR === promoRow) {
                      resurrectedPiece.type = 'hero';
                      resurrectedPiece.id = `${resurrectedPiece.id}_HeroPromo_Res`;
                      toast({ title: "Resurrection & Promotion!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s Commander resurrected and promoted to Hero! (L1)`, duration: 8000 });
                  } else {
                      toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 8000 });
                  }
                  finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                  addEffect('light-beam', randomSquareAlg);
                  setResurrectedSquares(prev => [...prev, { square: randomSquareAlg, player: selfDestructPlayer }]);
                  finalCapturedPiecesStateForTurn[selfDestructPlayer === 'white' ? 'black' : 'white'] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginal.id);

                  if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                      setPlayerForPostResurrectionPromotion(selfDestructPlayer);
                      setIsExtraTurnForPostResurrectionPromotion(newStreakForSelfDestructPlayer === 6);
                      setIsResurrectionPromotionInProgress(true);
                      setPlayerToPromote(selfDestructPlayer);
                      setIsPromotingPawn(true);
                      setPromotionSquare(randomSquareAlg);
                      setBoard(finalBoardStateForTurn);
                      setCapturedPieces(finalCapturedPiecesStateForTurn);
                      setIsMoveProcessing(false);
                      return;
                  }
                }
              }
            }
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);


        setTimeout(() => {
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          const streakGrantsExtraTurn = newStreakForSelfDestructPlayer === 6;
          if (humanPlayerAchievedFirstBloodThisTurn) {
              setIsAwaitingCommanderPromotion(true);
              setGameInfo(prev => ({...prev, message: `${getPlayerDisplayName(selfDestructPlayer)}: Select L1 Pawn for Commander!`}));
              if (onlineStatus === 'disconnected') {
                setIsMoveProcessing(false);
              }
              return;
          }

          if (isAwaitingAnvilDrop) {
              setIsMoveProcessing(false);
              return;
          }


          processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn, nextEnpassantTarget);
          setIsMoveProcessing(false);
        }, 800);
        return;
      } else if (isMoveInFreshList && moveBeingMade) {
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                const payload = JSON.stringify({ type: 'game-move', payload: moveBeingMade });
                console.log('[CLIENT] > SENDING WS to server:', payload);
                ws.send(payload);
            }
            // For online games, we stop client-side processing here.
            // The server will send back the authoritative state.
            return;
        }

        const applyMoveResult = applyMove(finalBoardStateForTurn, moveBeingMade, enPassantTargetSquare);
        const { 
            newBoard: boardAfterMove, 
            capturedPiece: capturedPieceFromApply, 
            pieceCapturedByAnvil: pieceCapturedByAnvilFromApply, 
            selfCheckByPushBack: selfCheckByPushBackFromApply,
            anvilPushedOffBoard: anvilPushedOffBoardFromApply,
            conversionEvents: conversionEventsFromApply,
            queenLevelReducedEvents: queenLevelReducedEventsFromApply,
            promotedToInfiltrator: becameInfiltratorFromApply,
            infiltrationWin: gameWonByInfiltrationFromApply,
            shroomConsumed: shroomConsumedFromApply,
            rallyCryTriggered,
            extraTurn: extraTurnFromApplyMove,
            specialCaptureSquare,
            originalPieceLevel: levelFromApplyMoveInternal,
        } = applyMoveResult;
        
        finalBoardStateForTurn = boardAfterMove;
        let nextEnpassantTarget = applyMoveResult.enPassantTargetSet;

        if (becameInfiltratorFromApply) {
          toast({ title: "Infiltrator!", description: `${getPlayerDisplayName(currentPlayer)}'s pawn promoted to an Infiltrator!`, duration: 8000 });
        }


        if (gameWonByInfiltrationFromApply) {
          setBoard(finalBoardStateForTurn);
          setCapturedPieces(finalCapturedPiecesStateForTurn);
          toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, duration: 8000 });
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
          setIsMoveProcessing(false);
           if (onlineStatus === 'connected') {
             const ws = wsRef.current;
            if(ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: currentPlayer, reason: 'infiltration' }));
            }
           }
          return;
        }

        if (shroomConsumedFromApply) {
            const movedPieceData = finalBoardStateForTurn[algebraicToCoords(algebraic).row]?.[algebraicToCoords(algebraic).col]?.piece;
            if(movedPieceData) {
                toast({ title: "Level Up!", description: `${getPlayerDisplayName(currentPlayer)}'s ${movedPieceData.type} consumed a Shroom 🍄 and leveled up to L${movedPieceData.level}!`, duration: 8000 });
            }
        }


        if (queenLevelReducedEventsFromApply && queenLevelReducedEventsFromApply.length > 0) {
            queenLevelReducedEventsFromApply.forEach(event => {
                const queenOwnerName = getPlayerDisplayName(event.reducedByKingOfColor === 'white' ? 'black' : 'white');
                toast({
                title: "King's Dominion!",
                description: `${getPlayerDisplayName(event.reducedByKingOfColor)} King leveled up! ${queenOwnerName}'s Queen (ID: ...${event.queenId.slice(-4)}) level reduced by ${event.reductionAmount} from L${event.originalLevel} to L${event.newLevel}.`,
                duration: 8000,
                });
            });
        }


        if (selfCheckByPushBackFromApply) {
          const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
          toast({
            title: "Auto-Checkmate!",
            description: `${getPlayerDisplayName(currentPlayer)}'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
            variant: "destructive",
            duration: 8000,
          });
          setGameInfo(prev => ({
            ...prev,
            message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
            isCheck: true,
            playerWithKingInCheck: currentPlayer,
            isCheckmate: true, isStalemate: false, gameOver: true, winner: opponentPlayer
          }));
          setBoard(finalBoardStateForTurn);
          setIsMoveProcessing(false);
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
          if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if(ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: opponentPlayer, timedOutPlayer: currentPlayer, reason: 'self-check' }));
            }
          }
          return;
        }

        const capturingPlayer = currentPlayer;
        const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
        
        let newStreak = killStreaks[capturingPlayer] || 0;
        let capturesThisTurn = 0;
        if (capturedPieceFromApply) capturesThisTurn++;
        if (pieceCapturedByAnvilFromApply) capturesThisTurn++;

        if (capturesThisTurn > 0) {
            newStreak += capturesThisTurn;
            setKillStreaks(prev => {
                const currentOpponentStreak = prev[opponentPlayer];
                return {
                    ...prev,
                    [capturingPlayer]: newStreak,
                    [opponentPlayer]: 0 // Reset opponent's streak on capture
                };
            });
            if (!firstBloodAchieved) {
                setKillStreakFlashMessage("FIRST BLOOD!");
                setKillStreakFlashMessageKey(k => k + 1);
            } else {
                const streakMsg = getKillStreakToastMessage(newStreak);
                if (streakMsg) {
                    setKillStreakFlashMessage(streakMsg);
                    setKillStreakFlashMessageKey(k => k + 1);
                }
            }
        } else {
            // Reset streak only if it was a non-capturing move by this player
            if (killStreaks[capturingPlayer] > 0) {
                setKillStreaks(prev => ({...prev, [capturingPlayer]: 0}));
            }
            newStreak = 0;
        }
        
        const { row: toR_final_check_infiltrator, col: toC_final_check_infiltrator } = algebraicToCoords(algebraic);
        const pieceThatMadeTheMove = finalBoardStateForTurn[toR_final_check_infiltrator]?.[toC_final_check_infiltrator]?.piece;

        if (capturedPieceFromApply) {
          addEffect('poof', specialCaptureSquare || algebraic);
          if (!(pieceThatMadeTheMove && pieceThatMadeTheMove.type === 'infiltrator')) {
              const uniqueCapturedPiece = { ...capturedPieceFromApply, id: `${capturedPieceFromApply.id}_cap_${globalUniqueIdCounter++}` };
              finalCapturedPiecesStateForTurn[capturingPlayer].push(uniqueCapturedPiece);
          } else {
            toast({ title: "Obliterated!", description: `${getPlayerDisplayName(capturingPlayer)}'s Infiltrator obliterated ${capturedPieceFromApply.color} ${capturedPieceFromApply.type}!`, duration: 8000});
          }
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else if (pieceCapturedByAnvilFromApply) {
          addEffect('poof', specialCaptureSquare || algebraic);
          finalCapturedPiecesStateForTurn[capturingPlayer].push({ ...pieceCapturedByAnvilFromApply, id: `${pieceCapturedByAnvilFromApply.id}_cap_anvil_${globalUniqueIdCounter++}` });
          toast({ title: "Anvil Crush!", description: `${getPlayerDisplayName(currentPlayer)}'s Pawn push made an Anvil capture a ${pieceCapturedByAnvilFromApply.type}!`, duration: 8000 });
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        }
        if (anvilPushedOffBoardFromApply) {
            toast({ title: "Anvil Removed!", description: "Anvil pushed off the board.", duration: 8000 });
        }
        if (rallyCryTriggered) {
          addEffect('shockwave', rallyCryTriggered.square, rallyCryTriggered.color);
        }
        

        let humanRookResData: RookResurrectionResult | null = null;
        const { row: toR_final, col: toC_final } = algebraicToCoords(algebraic);
        const movedPieceOnToSquareHuman = finalBoardStateForTurn[toR_final]?.[toC_final]?.piece;

        if (movedPieceOnToSquareHuman && (movedPieceOnToSquareHuman.type === 'rook' || (moveBeingMade.type === 'promotion' && moveBeingMade.promoteTo === 'rook')) ) {
           if (capturesThisTurn > 0) { // Only call if a capture occurred this move
            const oldLevelForResurrectionCheck = levelFromApplyMoveInternal !== undefined ? levelFromApplyMoveInternal : originalPieceLevelBeforeMove;
            humanRookResData = processRookResurrectionCheck(
              finalBoardStateForTurn,
              currentPlayer,
              moveBeingMade,
              algebraic,
              oldLevelForResurrectionCheck,
              finalCapturedPiecesStateForTurn,
              globalUniqueIdCounter
            );
            if (humanRookResData.resurrectionPerformed) {
              finalBoardStateForTurn = humanRookResData.boardWithResurrection;
              finalCapturedPiecesStateForTurn = humanRookResData.capturedPiecesAfterResurrection;
              globalUniqueIdCounter = humanRookResData.newResurrectionIdCounter!;
              addEffect('light-beam', humanRookResData!.resurrectedSquareAlg!);
              setResurrectedSquares(prev => [...prev, { square: humanRookResData!.resurrectedSquareAlg!, player: currentPlayer }]);
              toast({
                  title: "Rook's Call!",
                  description: `${getPlayerDisplayName(currentPlayer)}'s Rook resurrected their ${humanRookResData.resurrectedPieceData!.type} to ${humanRookResData.resurrectedSquareAlg!}! (L1)`,
                  duration: 8000,
              });

              if (humanRookResData.promotionRequiredForResurrectedPawn) {
                  const isExtraTurnForRookResPromo = newStreak === 6;
                  setPlayerForPostResurrectionPromotion(currentPlayer);
                  setIsExtraTurnForPostResurrectionPromotion(isExtraTurnForRookResPromo);
                  setIsResurrectionPromotionInProgress(true);
                  setPlayerToPromote(currentPlayer);
                  setIsPromotingPawn(true);
                  setPromotionSquare(humanRookResData.resurrectedSquareAlg!);
                  setBoard(finalBoardStateForTurn);
                  setCapturedPieces(finalCapturedPiecesStateForTurn);
                  setIsMoveProcessing(false);
                  return;
              }
            }
          }
        }

        if (capturesThisTurn > 0 && !firstBloodAchieved) {
            if (onlineStatus === 'connected') {
                const ws = wsRef.current;
                if(ws && ws.readyState === WebSocket.OPEN) {
                    const payload = JSON.stringify({ type: 'game-move', payload: moveBeingMade, movingPlayer: currentPlayer });
                    console.log('[CLIENT] > SENDING WS to server:', payload);
                    ws.send(payload);
                }
            } else {
                setFirstBloodAchieved(true);
                setPlayerWhoGotFirstBlood(capturingPlayer);
                const isHumanPlayer = !((capturingPlayer === 'white' && isWhiteAI) || (capturingPlayer === 'black' && isBlackAI));
                if (isHumanPlayer) humanPlayerAchievedFirstBloodThisTurn = true;
                toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(capturingPlayer)} can promote a Level 1 Pawn to Commander!`, duration: 8000 });
            }
        }
        
        const originalPieceDataFromBoard = board[algebraicToCoords(selectedSquare).row]?.[algebraicToCoords(selectedSquare).col]?.piece;
        const commanderHeroPromoExtraTurn = (originalPieceDataFromBoard?.type === 'commander' && (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 && pieceThatMadeTheMove?.type === 'hero');
        const isPawnPromotingMove = pieceThatMadeTheMove && pieceThatMadeTheMove.type === 'pawn' && (toR_final === 0 || toR_final === 7) && !becameInfiltratorFromApply;
        const pawnLevelGrantsExtraTurn = (originalPieceDataFromBoard?.type === 'pawn' && (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 && (toR_final === 0 || toR_final === 7) && !isPawnPromotingMove && !becameInfiltratorFromApply);
        const streakGrantsExtraTurn = newStreak === 6;
        const combinedExtraTurn = commanderHeroPromoExtraTurn || pawnLevelGrantsExtraTurn || streakGrantsExtraTurn || extraTurnFromApplyMove;

        let isEnteringAnvilDropMode = false;
        if (newStreak === 3) {
            isEnteringAnvilDropMode = true;
            const anvilDropCtx = {
                boardForNextStep: finalBoardStateForTurn,
                playerWhoseTurnCompleted: capturingPlayer,
                isExtraTurn: combinedExtraTurn,
                newEnPassantTarget: nextEnpassantTarget,
            };
            setAnvilDropContext(anvilDropCtx);
            if (isPawnPromotingMove) {
                setAnvilDropAfterPromotion(true);
            } else {
                setIsAwaitingAnvilDrop(true);
                setPlayerToDropAnvil(capturingPlayer);
                setGameInfo(prev => ({...prev, message: `KILL STREAK OF 3! Place an anvil.`}));
            }
        } else if (newStreak === 4) {
              if (!humanRookResData?.resurrectionPerformed) {
                  let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
                  if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
                    if (pieceToResurrectOriginal) {
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece && !finalBoardStateForTurn[r_idx][c_idx].item) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = globalUniqueIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved, invulnerableTurnsRemaining: 0 };

                        const promoRow = capturingPlayer === 'white' ? 0 : 7;
                        if (resurrectedPiece.type === 'commander' && resR === promoRow) {
                            resurrectedPiece.type = 'hero';
                            resurrectedPiece.id = `${resurrectedPiece.id}_HeroPromo_Res`;
                            toast({ title: "Resurrection & Promotion!", description: `${getPlayerDisplayName(capturingPlayer)}'s Commander resurrected and promoted to Hero! (L1)`, duration: 8000 });
                        } else {
                            toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 8000 });
                        }
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                        addEffect('light-beam', randomSquareAlg);
                        setResurrectedSquares(prev => [...prev, { square: randomSquareAlg, player: capturingPlayer }]);
                        finalCapturedPiecesStateForTurn[opponentPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginal.id);


                        if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                            setPlayerForPostResurrectionPromotion(capturingPlayer);
                            setIsExtraTurnForPostResurrectionPromotion(newStreak === 6);
                            setIsResurrectionPromotionInProgress(true);
                            setPlayerToPromote(capturingPlayer);
                            setIsPromotingPawn(true);
                            setPromotionSquare(randomSquareAlg);
                            setBoard(finalBoardStateForTurn);
                            setCapturedPieces(finalCapturedPiecesStateForTurn);
                            setIsMoveProcessing(false);
                            return;
                        }
                      }
                    }
                  }
              }
        }


        if (conversionEventsFromApply && conversionEventsFromApply.length > 0) {
          conversionEventsFromApply.forEach(event => {
            toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 });
            addEffect('conversion', event.at, event.byPiece.color);
          });
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);

        if (isEnteringAnvilDropMode && !isPawnPromotingMove) {
            setIsMoveProcessing(false); // Allow anvil drop interaction
            return;
        }

        setTimeout(() => {
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          const movedPieceFinalSquare = finalBoardStateForTurn[toR_final]?.[toC_final];
          const pieceOnBoardAfterMove = movedPieceFinalSquare?.piece;
          
          if (humanPlayerAchievedFirstBloodThisTurn) {
              setIsAwaitingCommanderPromotion(true);
              setGameInfo(prev => ({...prev, message: `${getPlayerDisplayName(capturingPlayer)}: Select L1 Pawn for Commander!`}));
              if (onlineStatus === 'disconnected') {
                setIsMoveProcessing(false);
              }
              return;
          }


          let isPendingHumanResurrectionPromotion = isResurrectionPromotionInProgress;
          let sacrificeNeededForQueen = false;

          if (!isPendingHumanResurrectionPromotion && pieceOnBoardAfterMove?.type === 'queen' ) {
             sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, levelFromApplyMoveInternal, combinedExtraTurn, nextEnpassantTarget);
          }

          if (isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen && !isPendingHumanResurrectionPromotion) {
            setPlayerToPromote(currentPlayer);
            setIsPromotingPawn(true); 
            setPromotionSquare(algebraic);
          } else if (!isPawnPromotingMove && !sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isPendingHumanResurrectionPromotion && !becameInfiltratorFromApply) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnpassantTarget);
          } else if (humanRookResData?.resurrectionPerformed && !isPendingHumanResurrectionPromotion) {
             processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnpassantTarget);
          } else if ((becameInfiltratorFromApply) && !isPendingHumanResurrectionPromotion && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnpassantTarget);
          }

          setIsMoveProcessing(false);
        }, 800);
        return;
      } else {
        if (clickedPiece && (!clickedItem || clickedItem.type === 'shroom')) {
            if(clickedPiece.color === currentPlayer) { 
                setSelectedSquare(algebraic);
                const legalMovesForPlayer = getPossibleMoves(board, algebraic, enPassantTargetSquare);
                setPossibleMoves(legalMovesForPlayer);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else { // Offline and not your piece
                setSelectedSquare(null);
                setPossibleMoves([]);
                setEnemySelectedSquare(algebraic);
                const enemyMoves = getPossibleMoves(board, algebraic, enPassantTargetSquare);
                setEnemyPossibleMoves(enemyMoves);
            }
        } else {
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
        setIsMoveProcessing(false);
        return;
      }
    } else if (clickedPiece && (!clickedItem || clickedItem.type === 'shroom')) {
        if (clickedPiece.color === currentPlayer) {
            setSelectedSquare(algebraic);
            const legalMovesForPlayer = getPossibleMoves(board, algebraic, enPassantTargetSquare);
            setPossibleMoves(legalMovesForPlayer);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else {
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic, enPassantTargetSquare);
            setEnemyPossibleMoves(enemyMoves);
      }
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    }


  }, [
    board, currentPlayer, selectedSquare, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, enPassantTargetSquare,
    saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, addEffect,
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks,
    setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing,
    setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo, setPlayerToPromote,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, processPawnSacrificeCheck,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    getPossibleMoves,
    isResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setIsResurrectionPromotionInProgress,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey,
    firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion, historyStack, isWhiteAI, isBlackAI,
    onlineStatus, localPlayerColor, promotionMoveWasCapture, setPromotionMoveWasCapture, promotionPawnOriginalLevel, setPromotionPawnOriginalLevel,
    setResurrectedSquares, user,
    isAwaitingAnvilDrop, playerToDropAnvil, anvilDropContext,
  ]);
  
  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isAwaitingCommanderPromotion) {
        console.log('[CLIENT] handlePromotionSelect rejected: no promotion square or awaiting commander promo.');
        return;
    }

    if (onlineStatus === 'connected') {
        const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({ type: 'finalize-promotion', payload: { square: promotionSquare, promoteTo: pieceType } });
          console.log('[CLIENT] > SENDING WS to server:', payload);
          ws.send(payload);
        }
        // Close the dialog and wait for server broadcast to update the game state
        setIsPromotingPawn(false);
        setPromotionSquare(null);
        setPlayerToPromote(null);
        setIsResurrectionPromotionInProgress(false);
        return;
    }

    // --- LOCAL GAME LOGIC ---
    let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = boardToUpdate[row]?.[col]?.piece;

    if (!pieceBeingPromoted || (pieceBeingPromoted.type !== 'pawn' && pieceBeingPromoted.type !== 'commander' && !isResurrectionPromotionInProgress) ) {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false);
      setPromotionMoveWasCapture(false);
      setPromotionPawnOriginalLevel(null);
      setIsResurrectionPromotionInProgress(false);
      setPlayerToPromote(null);
      return;
    }

    saveStateToHistory();

    const pawnColor = pieceBeingPromoted.color;
    const originalPieceId = pieceBeingPromoted.id;
    const promotingFromType = pieceBeingPromoted.type;
    const currentLevelOfPieceOnSquare = Number(boardToUpdate[row][col].piece!.level || 1);

    const moveThatLedToPromotion: Move = { from: lastMoveFrom!, to: promotionSquare, type: 'promotion', promoteTo: pieceType };


    boardToUpdate[row][col].piece = {
      ...pieceBeingPromoted,
      type: pieceType,
      level: currentLevelOfPieceOnSquare,
      id: isResurrectionPromotionInProgress ? `${originalPieceId}_resPromo_${pieceType}` : `${originalPieceId}_promo_${pieceType}`,
      hasMoved: true,
      invulnerableTurnsRemaining: 0,
    };
    if (pieceType === 'queen') {
        boardToUpdate[row][col].piece!.level = Math.min(currentLevelOfPieceOnSquare, 7);
    }


    setLastMoveTo(promotionSquare);
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);
    

    setBoard(boardToUpdate);

    setTimeout(() => {
      let currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;

      if (isResurrectionPromotionInProgress) {
        toast({ title: "Resurrected Piece Promoted!", description: `${getPlayerDisplayName(playerForPostResurrectionPromotion!)}'s ${promotingFromType} on ${promotionSquare} promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 8000 });
        currentStreakForPromotingPlayer = killStreaks[playerForPostResurrectionPromotion!] || 0;
        processMoveEnd(boardToUpdate, playerForPostResurrectionPromotion!, isExtraTurnForPostResurrectionPromotion || currentStreakForPromotingPlayer === 6, enPassantTargetSquare);
        setIsResurrectionPromotionInProgress(false);
        setPlayerForPostResurrectionPromotion(null);
        setIsExtraTurnForPostResurrectionPromotion(false);
      } else {
        toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 8000 });

        if (anvilDropAfterPromotion) {
            setAnvilDropAfterPromotion(false);
            const contextForAnvil = {
                boardForNextStep: boardToUpdate,
                playerWhoseTurnCompleted: pawnColor,
                isExtraTurn: anvilDropContext!.isExtraTurn,
                newEnPassantTarget: anvilDropContext!.newEnpassantTarget,
            };
            setAnvilDropContext(contextForAnvil);
            setIsAwaitingAnvilDrop(true);
            setPlayerToDropAnvil(pawnColor);
            setGameInfo(prev => ({...prev, message: `KILL STREAK OF 3! Place an anvil.`}));
        } else {
            const pieceLevelForExtraTurnCheck = promotionPawnOriginalLevel || 1;
            const pawnLevelGrantsExtraTurn = pieceLevelForExtraTurnCheck >= 5;
            const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;
            const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;

            let sacrificeNeededForQueen = false;

            if (pieceType === 'queen') {
              sacrificeNeededForQueen = processPawnSacrificeCheck(boardToUpdate, pawnColor, moveThatLedToPromotion, currentLevelOfPieceOnSquare, combinedExtraTurn, enPassantTargetSquare);
            } else if (pieceType === 'rook') {
              if (promotionMoveWasCapture) { // Only call if the promotion move was a capture
                const newRookLevel = Number(boardToUpdate[row][col].piece!.level || 1);
                if (newRookLevel >= 4) { // processRookResurrectionCheck handles if it *crossed* L4
                  const { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed: aiPromoRookResPerformed, resurrectedPieceData: aiPromoRookPieceData, resurrectedSquareAlg: aiPromoRookSquareAlg, newResurrectionIdCounter: aiPromoRookIdCounter } = processRookResurrectionCheck(
                    boardToUpdate, pawnColor, moveThatLedToPromotion, promotionSquare, 
                    0, // Original level of "rook" type is 0 for promotion
                    capturedPieces, globalServerUniqueIdCounter
                  );
                  if (aiPromoRookResPerformed) {
                    boardToUpdate = boardWithResurrection;
                    setCapturedPieces(capturedPiecesAfterResurrection);
                    setBoard(boardToUpdate);
                    globalUniqueIdCounter = aiPromoRookIdCounter!;
                    addEffect('light-beam', aiPromoRookSquareAlg!);
                    setResurrectedSquares(prev => [...prev, { square: aiPromoRookSquareAlg!, player: pawnColor }]);
                    toast({ title: "AI Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s new Rook resurrected their ${aiPromoRookPieceData!.type} to ${aiPromoRookSquareAlg!}! (L1)`, duration: 8000 });
                    if(aiPromoRookPieceData?.type === 'pawn' || aiPromoRookPieceData?.type === 'commander'){
                        const promoR_AI = currentPlayer === 'white' ? 0 : 7;
                        const {row: resRookPromoAIR, col: resRookPromoAIC} = algebraicToCoords(aiPromoRookSquareAlg!);
                        if (resRookPromoAIR === promoR_AI) {
                            const resurrectedPieceOnBoardAI = boardWithResurrection[resRookPromoAIR]?.[resRookPromoAIC]?.piece;
                            if (resurrectedPieceOnBoardAI) {
                                if (resurrectedPieceOnBoardAI.type === 'pawn') {
                                    resurrectedPieceOnBoardAI.type = 'queen';
                                    resurrectedPieceOnBoardAI.level = 1;
                                    resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_Q`;
                                    toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 8000 });
                                } else if (resurrectedPieceOnBoardAI.type === 'commander') {
                                    resurrectedPieceOnBoardAI.type = 'hero';
                                    resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_H_AI`;
                                    toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Commander promoted to Hero! (L1)`, duration: 8000 });
                                }
                            }
                        }
                    }
                  }
                }
              }
            }

            if (!sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isResurrectionPromotionInProgress && !isAwaitingCommanderPromotion) {
               processMoveEnd(boardToUpdate, pawnColor, combinedExtraTurn, enPassantTargetSquare);
            }
        }
      }

      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setPlayerToPromote(null);
      setPromotionMoveWasCapture(false);
      setPromotionPawnOriginalLevel(null);
      setIsMoveProcessing(false);
    }, 800);
  }, [
    board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, processRookResurrectionCheck,
    isMoveProcessing, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves,
    setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, capturedPieces, setCapturedPieces, setPlayerToPromote,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, processMoveEnd, setLastMoveTo,
    isAwaitingCommanderPromotion, enPassantTargetSquare,
    onlineStatus, currentPlayer, isWhiteAI, isBlackAI, localPlayerColor, promotionMoveWasCapture, setPromotionMoveWasCapture, promotionPawnOriginalLevel,
    setResurrectedSquares, addEffect, anvilDropAfterPromotion, anvilDropContext
  ]);


  const performAiMove = useCallback(async () => {
    let enPassantTargetForNextTurn: AlgebraicSquare | null = null;
    let levelFromAIApplyMove: number | undefined;

    const currentAiInstance = aiInstanceRef.current;
    
    // Capture the game state *before* the AI starts thinking
    const originalGameStateForMove = {
        board: board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))),
        currentPlayer,
        capturedPieces: {
            white: capturedPieces.white.map(p => ({ ...p })),
            black: capturedPieces.black.map(p => ({ ...p }))
        },
        killStreaks,
        gameMoveCounter,
        firstBloodAchieved,
        playerWhoGotFirstBlood,
        enPassantTargetSquare,
        shroomSpawnCounter,
        nextShroomSpawnTurn
    };

    if (!currentAiInstance) {
      toast({
        title: "AI Error",
        description: "AI engine is not ready or was lost. Please wait or reset the game.",
        variant: "destructive",
        duration: 8000,
      });
      setIsAiThinking(false);
      if(currentPlayer === 'white') setIsWhiteAI(false); else setIsBlackAI(false);
      return;
    }

    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isAwaitingAnvilDrop ) {
      setIsAiThinking(false);
      return;
    }
    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood !== currentPlayer) {
        setIsAiThinking(false);
        return;
    }
    
    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    
    try {
      let aiMoveDataFromVibeAI: AIMoveType | null = null;
      let aiExtraTurnFromAIMethod = false;
      let attemptCount = 0;
      const MAX_AI_ATTEMPTS = 3;
      let pieceOnFromSquareForAI: Piece | null = null;
      let isAiMoveActuallyLegal = false;
      let aiFromAlg: AlgebraicSquare | null = null;
      let aiToAlg: AlgebraicSquare | null = null;
      let originalPieceLevelForAI: number | undefined;
      let moveForApplyMoveAI: Move | null = null;
      let localAIAwaitingCommanderPromo = false;
      let selfCheckByAIPushBack = false;
      let aiAnvilPushedOff = false;
      let queenLevelReducedEventsAI: QueenLevelReducedEvent[] | null | undefined = null;
      let aiBecameInfiltrator = false;
      let aiGameWonByInfiltration = false;
      let aiExtraTurn = false;
      let rallyCryTriggeredByAI: RallyCryEvent | null = null;
      let aiSpecialCaptureSquare: AlgebraicSquare | null = null;
      


      let finalBoardStateForAI = board.map(r_fbs => r_fbs.map(s_fbs => ({ ...s_fbs, piece: s_fbs.piece ? { ...s_fbs.piece } : null, item: s_fbs.item ? {...s_fbs.item} : null })));
      let finalCapturedPiecesForAI = {
        white: capturedPieces.white.map(p_cap => ({ ...p_cap })),
        black: capturedPieces.black.map(p_cap => ({ ...p_cap }))
      };
      let capturedPieceDataForScoring: Piece | null = null; // To hold captured piece by AI's move
      let shroomConsumedByAIForEval = false;
      
      while (attemptCount < MAX_AI_ATTEMPTS && !isAiMoveActuallyLegal) {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 50 * attemptCount)); // Small delay, increasing
        const gameStateForAI = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, shroomSpawnCounter, nextShroomSpawnTurn);
        const aiResult = currentAiInstance.getBestMove(gameStateForAI, currentPlayer);
        aiMoveDataFromVibeAI = aiResult?.move;
        aiExtraTurnFromAIMethod = aiResult?.extraTurn || false;

        if (!aiMoveDataFromVibeAI || !aiMoveDataFromVibeAI.from || !aiMoveDataFromVibeAI.to ||
            !Array.isArray(aiMoveDataFromVibeAI.from) || aiMoveDataFromVibeAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromVibeAI.to) || aiMoveDataFromVibeAI.to.length !== 2) {
            continue; // Try again
        }

        aiFromAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.from[0], aiMoveDataFromVibeAI.from[1]);
        aiToAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.to[0], aiMoveDataFromVibeAI.to[1]);
        const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromVibeAI.from[0]]?.[aiMoveDataFromVibeAI.from[1]];
        pieceOnFromSquareForAI = pieceDataAtFromAI?.piece || null;
        originalPieceLevelForAI = Number(pieceOnFromSquareForAI?.level || 1);

        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
            continue; // Try again
        }

        const definitiveLegalMovesForPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg as AlgebraicSquare, enPassantTargetSquare);
        isAiMoveActuallyLegal = definitiveLegalMovesForPiece.includes(aiToAlg as AlgebraicSquare);
        
        if (!isAiMoveActuallyLegal && aiMoveDataFromVibeAI.type === 'self-destruct' && aiFromAlg === aiToAlg) {
            const tempStateAfterSelfDestruct = finalBoardStateForAI.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
            tempStateAfterSelfDestruct[aiMoveDataFromVibeAI.from[0]][aiMoveDataFromVibeAI.from[1]].piece = null;
            if (!isKingInCheck(tempStateAfterSelfDestruct, currentPlayer, enPassantTargetSquare)) {
              isAiMoveActuallyLegal = true;
            }
        }

      }


      if (!isAiMoveActuallyLegal) { // Fallback if all attempts failed
        toast({ title: "AI Recalibrating...", description: "AI suggested an invalid move, picking any valid move.", duration: 8000 });
        
        let foundFallbackMove = false;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const fbSquareState = finalBoardStateForAI[r]?.[c];
            if (fbSquareState?.piece?.color === currentPlayer) {
              const fromAlg = coordsToAlgebraic(r, c);
              const legalMoves = getPossibleMoves(finalBoardStateForAI, fromAlg, enPassantTargetSquare);
              
              if (legalMoves.length > 0) {
                const pieceOnFromSquareForAI = fbSquareState.piece;
                const chosenDefinitiveMoveAlg = legalMoves[0];
                const newToCoords = algebraicToCoords(chosenDefinitiveMoveAlg);
                let overrideMoveType: AIMoveType['type'] = 'move';
                const targetSquareForOverride = finalBoardStateForAI[newToCoords.row]?.[newToCoords.col];
                if (targetSquareForOverride?.piece) {
                    overrideMoveType = 'capture';
                }
                const promotionRankOverride = currentPlayer === 'white' ? 0 : 7;
                let promoteToOverrideType: PieceType | undefined = undefined;
                if ((pieceOnFromSquareForAI.type === 'pawn' || pieceOnFromSquareForAI.type === 'commander') && newToCoords.row === promotionRankOverride) {
                    overrideMoveType = 'promotion';
                    promoteToOverrideType = pieceOnFromSquareForAI.type === 'commander' ? 'hero' : 'queen';
                } else if (pieceOnFromSquareForAI.type === 'king' && Math.abs(c - newToCoords.col) === 2) {
                    overrideMoveType = 'castle';
                } else if (pieceOnFromSquareForAI.type === 'knight' || pieceOnFromSquareForAI.type === 'hero') {
                    if ((Number(pieceOnFromSquareForAI.level || 1) >= 5) && chosenDefinitiveMoveAlg === fromAlg) {
                        overrideMoveType = 'self-destruct';
                    } else if (Number(pieceOnFromSquareForAI.level || 1) >= 4 && targetSquareForOverride?.piece?.type === 'bishop' && targetSquareForOverride.piece.color === pieceOnFromSquareForAI.color) {
                        overrideMoveType = 'swap';
                    }
                } else if (pieceOnFromSquareForAI.type === 'bishop' && Number(pieceOnFromSquareForAI.level || 1) >= 4) {
                    if ((targetSquareForOverride?.piece?.type === 'knight' || targetSquareForOverride?.piece?.type === 'hero') && targetSquareForOverride.piece.color === pieceOnFromSquareForAI.color) {
                        overrideMoveType = 'swap';
                    }
                }

                aiFromAlg = fromAlg;
                aiToAlg = chosenDefinitiveMoveAlg;
                aiMoveDataFromVibeAI = { from: [r,c], to: [newToCoords.row, newToCoords.col], type: overrideMoveType, promoteTo: promoteToOverrideType };
                isAiMoveActuallyLegal = true;
                foundFallbackMove = true;
                break; // exit inner loop
              }
            }
          }
          if (foundFallbackMove) break; // exit outer loop
        }

        if (!foundFallbackMove) {
          aiErrorOccurredRef.current = true;
          console.error(`[AI_FALLBACK] FATAL: Fallback could not find any legal moves for ${currentPlayer}. Board state:`, boardToSimpleString(board, currentPlayer, enPassantTargetSquare));
        }
      }


      if (!aiErrorOccurredRef.current && aiMoveDataFromVibeAI && aiFromAlg && aiToAlg) {
        saveStateToHistory();
        let aiMoveType = (aiMoveDataFromVibeAI.type || 'move') as Move['type'];
        let aiPromoteTo = aiMoveDataFromVibeAI.promoteTo as PieceType | undefined;

        setLastMoveFrom(aiFromAlg as AlgebraicSquare);
        setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
        setIsMoveProcessing(true);
        setAnimatedSquareTo(aiToAlg as AlgebraicSquare);

        if (pieceOnFromSquareForAI?.type === 'king' && aiFromAlg && aiToAlg && Math.abs(algebraicToCoords(aiFromAlg).col - algebraicToCoords(aiToAlg).col) === 2 && aiMoveType !== 'self-destruct') {
            aiMoveType = 'castle';
        }

        moveForApplyMoveAI = {
            from: aiFromAlg as AlgebraicSquare,
            to: aiToAlg as AlgebraicSquare,
            type: aiMoveType as Move['type'],
            promoteTo: aiPromoteTo
        };
        
        if (moveForApplyMoveAI.type === 'self-destruct') addEffect('explosion', aiFromAlg as AlgebraicSquare);

        const applyMoveResult = applyMove(finalBoardStateForAI, moveForApplyMoveAI, enPassantTargetSquare);
        const { newBoard, capturedPiece, selfDestructCaptures, destroyedAnvils, ...restOfResult } = applyMoveResult;
        
        finalBoardStateForAI = newBoard;
        
        enPassantTargetForNextTurn = restOfResult.enPassantTargetSet;
        levelFromAIApplyMove = restOfResult.originalPieceLevel;
        selfCheckByAIPushBack = restOfResult.selfCheckByPushBack;
        aiAnvilPushedOff = restOfResult.anvilPushedOffBoard;
        queenLevelReducedEventsAI = restOfResult.queenLevelReducedEvents;
        aiBecameInfiltrator = restOfResult.promotedToInfiltrator || false;
        aiGameWonByInfiltration = restOfResult.infiltrationWin || false;
        aiExtraTurn = restOfResult.extraTurn || false;
        rallyCryTriggeredByAI = restOfResult.rallyCryTriggered;
        aiSpecialCaptureSquare = restOfResult.specialCaptureSquare;

        if (selfDestructCaptures && selfDestructCaptures.length > 0) {
            selfDestructCaptures.forEach(p => finalCapturedPiecesForAI[currentPlayer].push(p));
        }

        if (rallyCryTriggeredByAI) {
            addEffect('shockwave', rallyCryTriggeredByAI.square, rallyCryTriggeredByAI.color);
        }

        if (aiBecameInfiltrator) {
            toast({ title: "AI Infiltrator!", description: `AI's pawn promoted to an Infiltrator!`, duration: 8000 });
        }


        if (aiGameWonByInfiltration) {
            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);
            toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, duration: 8000 });
            setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
            setIsMoveProcessing(false); setIsAiThinking(false); return;
        }

        shroomConsumedByAIForEval = restOfResult.shroomConsumed || false;
        if (shroomConsumedByAIForEval) {
            const movedPieceDataAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
                if(movedPieceDataAI) {
                toast({ title: "AI Level Up!", description: `AI's ${movedPieceDataAI.type} consumed a Shroom 🍄 and leveled up to L${movedPieceDataAI.level}!`, duration: 8000 });
                }
        }


        if (queenLevelReducedEventsAI && queenLevelReducedEventsAI.length > 0) {
            queenLevelReducedEventsAI.forEach(event => {
                const queenOwnerName = getPlayerDisplayName(event.reducedByKingOfColor === 'white' ? 'black' : 'white');
                toast({
                    title: "King's Dominion!",
                    description: `${getPlayerDisplayName(event.reducedByKingOfColor)} (AI) King leveled up! ${queenOwnerName}'s Queen (ID: ...${event.queenId.slice(-4)}) level reduced by ${event.reductionAmount} from L${event.originalLevel} to L${event.newLevel}.`,
                    duration: 8000,
                });
            });
        }
        
        if (restOfResult.pieceCapturedByAnvil) {
            addEffect('poof', aiSpecialCaptureSquare || (aiToAlg as AlgebraicSquare));
            capturedPieceDataForScoring = restOfResult.pieceCapturedByAnvil;
            if (pieceOnFromSquareForAI?.type !== 'infiltrator') {
                finalCapturedPiecesForAI[currentPlayer].push({ ...restOfResult.pieceCapturedByAnvil, id: `${restOfResult.pieceCapturedByAnvil.id}_cap_anvil_ai_${globalUniqueIdCounter++}` });
            } else {
                toast({ title: "AI Obliterated by Anvil!", description: `AI's Pawn push made an Anvil obliterate a ${restOfResult.pieceCapturedByAnvil.type}!`, duration: 8000 });
            }
            toast({ title: "AI Anvil Crush!", description: `AI's Pawn push made an Anvil capture a ${restOfResult.pieceCapturedByAnvil.type}!`, duration: 8000 });
        }
        if (aiAnvilPushedOff) {
            toast({ title: "AI Anvil Removed!", description: "Anvil pushed off by AI.", duration: 8000 });
        }
        
        if (destroyedAnvils && destroyedAnvils > 0) {
             toast({ title: "AI Smashes Anvils!", description: `${destroyedAnvils} anvil${destroyedAnvils > 1 ? 's':''} destroyed.`, duration: 8000 });
        }


        if (selfCheckByAIPushBack) {
            const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            toast({
              title: "Auto-Checkmate!",
              description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
              variant: "destructive",
              duration: 8000,
            });
            setGameInfo(prev => ({
              ...prev,
              message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
              isCheck: true,
              playerWithKingInCheck: currentPlayer,
              isCheckmate: true, isStalemate: false, gameOver: true, winner: opponentPlayer
            }));
            setBoard(finalBoardStateForAI);
            setIsMoveProcessing(false);
            setIsAiThinking(false);
            setSelectedSquare(null); setPossibleMoves([]);
            setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
            if (onlineStatus === 'connected') {
              const ws = wsRef.current;
              if(ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: opponentPlayer, timedOutPlayer: currentPlayer, reason: 'self-check' }));
              }
            }
            return;
          }
          toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiFromAlg} to ${aiToAlg}`, duration: 1000 });

          if (capturedPiece) { // This is the direct capture by the moving piece
            addEffect('poof', aiSpecialCaptureSquare || (aiToAlg as AlgebraicSquare));
            const pieceThatMadeTheMoveAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
            if (pieceThatMadeTheMoveAI && pieceThatMadeTheMoveAI.type === 'infiltrator') {
                toast({ title: "Obliterated!", description: `${getPlayerDisplayName(currentPlayer)}'s Infiltrator obliterated ${capturedPiece.color} ${capturedPiece.type}!`, duration: 8000});
            } else {
                finalCapturedPiecesForAI[currentPlayer].push({ ...capturedPiece, id: `${capturedPiece.id}_cap_ai_${globalUniqueIdCounter++}` });
            }
          }
          if (restOfResult.conversionEvents && restOfResult.conversionEvents.length > 0) {
            restOfResult.conversionEvents.forEach(event => {
                toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 });
                addEffect('conversion', event.at, event.byPiece.color);
            });
          }

        if(!aiErrorOccurredRef.current) {
            const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            let capturesThisTurnAI = 0;
            if (capturedPiece) capturesThisTurnAI++;
            if (restOfResult.pieceCapturedByAnvil) capturesThisTurnAI++;
            if (selfDestructCaptures) capturesThisTurnAI += selfDestructCaptures.length;
            
            let newStreakForAI = killStreaks[currentPlayer] || 0;

            if (capturesThisTurnAI > 0) {
                newStreakForAI += capturesThisTurnAI;
                setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreakForAI, [opponentPlayer!]: 0 }));

                if (!firstBloodAchieved) {
                    setKillStreakFlashMessage("FIRST BLOOD!");
                    setKillStreakFlashMessageKey(k => k + 1);
                } else {
                    const streakMsg = getKillStreakToastMessage(newStreakForAI);
                    if (streakMsg) {
                        setKillStreakFlashMessage(streakMsg);
                        setKillStreakFlashMessageKey(k => k + 1);
                    }
                }
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
            } else {
                if (killStreaks[currentPlayer] > 0) {
                    setKillStreaks(prev => ({...prev, [currentPlayer]: 0}));
                }
                newStreakForAI = 0;
            }
            
            let isEnteringAnvilDropMode = false;
            if (newStreakForAI === 3) {
              isEnteringAnvilDropMode = true;
            }

            if (capturesThisTurnAI > 0) {
                if (!firstBloodAchieved) {
                    setFirstBloodAchieved(true);
                    setPlayerWhoGotFirstBlood(currentPlayer);
                    localAIAwaitingCommanderPromo = true;
                    toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(currentPlayer)} (AI) promotes a Pawn to Commander!`, duration: 8000 });
                } else if (newStreakForAI === 4) {
                  const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                  let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                  if (piecesOfAICapturedByOpponent.length > 0) {
                      const pieceToResurrectOriginalAI = piecesOfAICapturedByOpponent.pop();
                      if (pieceToResurrectOriginalAI) {
                      const emptySqAI: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForAI[r_idx]?.[c_idx]?.piece && !finalBoardStateForAI[r_idx]?.[c_idx]?.item) emptySqAI.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySqAI.length > 0) {
                          const randSqAI_alg = emptySqAI[Math.floor(Math.random() * emptySqAI.length)];
                          const { row: resRAI, col: resCAI } = algebraicToCoords(randSqAI_alg);
                          const newUniqueSuffixAI = globalUniqueIdCounter++;
                          const resurrectedAI: Piece = { ...pieceToResurrectOriginalAI, level: 1, id: `${pieceToResurrectOriginalAI.id}_res_${newUniqueSuffixAI}`, hasMoved: pieceToResurrectOriginalAI.type === 'king' || pieceToResurrectOriginalAI.type === 'rook' ? false : pieceToResurrectOriginalAI.hasMoved, invulnerableTurnsRemaining: 0 };

                          const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                          if (resurrectedAI.type === 'commander' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'hero';
                              resurrectedAI.id = `${resurrectedAI.id}_HeroPromo_Res_AI`;
                               toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander resurrected and promoted to Hero! (L1)`, duration: 8000 });
                          } else if (resurrectedAI.type === 'pawn' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'queen';
                              resurrectedAI.id = `${resurrectedPiece.id}_QueenPromo_Res_AI`;
                               toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 8000 });
                          } else {
                               toast({ title: "AI Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 8000 });
                          }
                          finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                          addEffect('light-beam', randSqAI_alg);
                          setResurrectedSquares(prev => [...prev, { square: randSqAI_alg, player: currentPlayer }]);
                          finalCapturedPiecesForAI[opponentColorAI] = piecesOfAICapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginalAI.id);
                      }
                      }
                  }
                }
            }

            if (localAIAwaitingCommanderPromo && currentAiInstance) {
                const gameStateForAICmdrSelect = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI, gameMoveCounter, true, currentPlayer, enPassantTargetSquare, shroomSpawnCounter, nextShroomSpawnTurn);
                const commanderPawnCoords = currentAiInstance.selectPawnForCommanderPromotion(gameStateForAICmdrSelect);
                if (commanderPawnCoords) {
                    const [pawnR, pawnC] = commanderPawnCoords;
                    if(finalBoardStateForAI[pawnR]?.[pawnC]?.piece?.type === 'pawn' && finalBoardStateForAI[pawnR]?.[pawnC]?.piece?.level === 1) {
                        finalBoardStateForAI[pawnR][pawnC].piece!.type = 'commander';
                        finalBoardStateForAI[pawnR][pawnC].piece!.id = `${finalBoardStateForAI[pawnR][pawnC].piece!.id}_CMD_AI`;
                    }
                }
            }


            const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
            const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            let aiRookResData: RookResurrectionResult | null = null;

            if (aiMovedPieceOnToSquare &&
                (aiMovedPieceOnToSquare.type === 'rook' || (moveForApplyMoveAI!.type === 'promotion' && moveForApplyMoveAI!.promoteTo === 'rook')) &&
                moveForApplyMoveAI!.type !== 'self-destruct' &&
                (capturedPiece || restOfResult.pieceCapturedByAnvil) // Rook resurrection only on capture
            ) {
              const oldLevelForAIResCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI;
              aiRookResData = processRookResurrectionCheck(
                  finalBoardStateForAI,
                  currentPlayer,
                  moveForApplyMoveAI as Move,
                  aiToAlg as AlgebraicSquare,
                  oldLevelForAIResCheck,
                  finalCapturedPiecesForAI,
                  globalUniqueIdCounter
              );
              if (aiRookResData.resurrectionPerformed) {
                  finalBoardStateForAI = aiRookResData.boardWithResurrection;
                  finalCapturedPiecesForAI = aiRookResData.capturedPiecesAfterResurrection;
                  globalUniqueIdCounter = aiRookResData.newResurrectionIdCounter!;
                  addEffect('light-beam', aiRookResData!.resurrectedSquareAlg!);
                  setResurrectedSquares(prev => [...prev, { square: aiRookResData!.resurrectedSquareAlg!, player: currentPlayer }]);
                  toast({ title: "AI Rook's Call!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Rook resurrected their ${aiRookResData.resurrectedPieceData!.type} to ${aiRookResData.resurrectedSquareAlg!}! (L1)`, duration: 8000 });
                  
                  if (aiRookResData.promotionRequiredForResurrectedPawn) {
                        const { row: promoR_AI, col: promoC_AI } = algebraicToCoords(aiRookResData.resurrectedSquareAlg!);
                        const resurrectedPawnOnBoardAI = finalBoardStateForAI[promoR_AI]?.[promoC_AI]?.piece;
                        if (resurrectedPawnOnBoardAI && resurrectedPawnOnBoardAI.type === 'pawn') {
                            resurrectedPawnOnBoardAI.type = 'queen'; // AI will just pick queen
                            resurrectedPawnOnBoardAI.id = `${resurrectedPawnOnBoardAI.id}_resPromo_Q_AI`;
                            toast({ title: "AI Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 8000 });
                        }
                  }
              }
            }

            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);

            setTimeout(() => {
              const pieceAtDestinationAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
              const promotionRankAI = currentPlayer === 'white' ? 'white' : 'black';
              const rankRowAI = currentPlayer === 'white' ? 0 : 7;
              const isAIPawnPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'pawn' && algebraicToCoords(aiToAlg as AlgebraicSquare).row === rankRowAI && moveForApplyMoveAI!.type !== 'self-destruct';
              const isAICommanderPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'commander' && algebraicToCoords(aiToAlg as AlgebraicSquare).row === rankRowAI && moveForApplyMoveAI!.type !== 'self-destruct';
              const streakGrantsExtraTurn = newStreakForAI === 6;

              let extraTurnForThisAIMove = aiExtraTurn || streakGrantsExtraTurn;
              let sacrificeNeededForAIQueen = false;

              const pieceOnFromSquareForAILevelCheck = finalBoardStateForAI[algebraicToCoords(aiFromAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiFromAlg as AlgebraicSquare).col]?.piece || pieceOnFromSquareForAI;
              const originalTypeOfAIMovedPiece = pieceOnFromSquareForAILevelCheck!.type;
              const originalLevelOfAIMovedPieceForPromoCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI || 1;


              if (isAIPawnPromoting) {
                  const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen'; 

                  const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                  if(finalBoardStateForAI[promoR][promoC].piece && finalBoardStateForAI[promoR][promoC].piece!.type === 'pawn') {
                      finalBoardStateForAI[promoR][promoC].piece!.type = promotedTypeAI;
                      finalBoardStateForAI[promoR][promoC].piece!.level = pieceAtDestinationAI!.level; 
                      finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_promo_${promotedTypeAI}`;
                      setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                  }
                  toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L${finalBoardStateForAI[promoR][promoC].piece!.level})`, duration: 8000 });

                  if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;
                  
                  if (isEnteringAnvilDropMode) {
                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_anvil = 0; r_anvil < 8; r_anvil++) for (let c_anvil = 0; c_anvil < 8; c_anvil++) if (!finalBoardStateForAI[r_anvil][c_anvil].piece && !finalBoardStateForAI[r_anvil][c_anvil].item) emptySquares.push(coordsToAlgebraic(r_anvil, c_anvil));
                    
                    if (emptySquares.length > 0) {
                      const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
                      const oppKingPos = findKing(finalBoardStateForAI, opponentColor);
                      let bestAnvilSquare: AlgebraicSquare;
                      if (oppKingPos) {
                        emptySquares.sort((a,b) => {
                          const { row: rA, col: cA } = algebraicToCoords(a);
                          const { row: rB, col: cB } = algebraicToCoords(b);
                          const distA = Math.abs(rA - oppKingPos.row) + Math.abs(cA - oppKingPos.col);
                          const distB = Math.abs(rB - oppKingPos.row) + Math.abs(cB - oppKingPos.col);
                          return distA - distB;
                        });
                        bestAnvilSquare = emptySquares[0];
                      } else {
                        bestAnvilSquare = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                      }
                      const { row: anvilR, col: anvilC } = algebraicToCoords(bestAnvilSquare);
                      finalBoardStateForAI[anvilR][anvilC].item = { type: 'anvil' };
                      addEffect('poof', bestAnvilSquare);
                      toast({ title: "AI Anvil Drop!", description: `AI placed an anvil on ${bestAnvilSquare}.`});
                    }
                  }


                  const pieceAfterAIPromo = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;

                  if (pieceAfterAIPromo?.type === 'queen') {
                    sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, finalBoardStateForAI[promoR][promoC].piece!.level, extraTurnForThisAIMove, enPassantTargetForNextTurn);
                  } else if (pieceAfterAIPromo?.type === 'rook') {
                      if ((!aiRookResData || !aiRookResData.resurrectionPerformed) && (capturedPieceDataForScoring || restOfResult.pieceCapturedByAnvil)) { // Rook resurrection only on capture
                        const newRookLevelCheck = Number(pieceAfterAIPromo.level || 1);
                        if (newRookLevelCheck >= 4) { // Check if newly promoted rook is L4+
                            const { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed: aiPromoRookResPerformed, resurrectedPieceData: aiPromoRookPieceData, resurrectedSquareAlg: aiPromoRookSquareAlg, newResurrectionIdCounter: aiPromoRookIdCounter, promotionRequiredForResurrectedPawn } = processRookResurrectionCheck(
                                finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, aiToAlg as AlgebraicSquare, 
                                0, // Original level of "rook" type is 0 for promotion
                                finalCapturedPiecesForAI, globalUniqueIdCounter
                            );
                            if (aiPromoRookResPerformed) {
                                finalBoardStateForAI = boardWithResurrection;
                                setCapturedPieces(capturedPiecesAfterResurrection);
                                setBoard(finalBoardStateForAI);
                                globalUniqueIdCounter = aiPromoRookIdCounter!;
                                addEffect('light-beam', aiPromoRookSquareAlg!);
                                setResurrectedSquares(prev => [...prev, { square: aiPromoRookSquareAlg!, player: currentPlayer }]);
                                toast({ title: "AI Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s new Rook resurrected their ${aiPromoRookPieceData!.type} to ${aiPromoRookSquareAlg!}! (L1)`, duration: 8000 });
                                
                                if (promotionRequiredForResurrectedPawn) {
                                    const {row: resRookPromoAIR, col: resRookPromoAIC} = algebraicToCoords(aiPromoRookSquareAlg!);
                                    const resurrectedPieceOnBoardAI = finalBoardStateForAI[resRookPromoAIR]?.[resRookPromoAIC]?.piece;
                                    if (resurrectedPieceOnBoardAI) {
                                        if (resurrectedPieceOnBoardAI.type === 'pawn') {
                                            resurrectedPieceOnBoardAI.type = 'queen';
                                            resurrectedPieceOnBoardAI.level = 1;
                                            resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_Q`;
                                            toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 8000 });
                                        } else if (resurrectedPieceOnBoardAI.type === 'commander') {
                                            resurrectedPieceOnBoardAI.type = 'hero';
                                            resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_H_AI`;
                                            toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Commander promoted to Hero! (L1)`, duration: 8000 });
                                        }
                                    }
                                }
                            }
                        }
                      }
                  }
              } else if (isAICommanderPromoting) {
                    const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                    if(finalBoardStateForAI[promoR]?.[promoC]?.piece?.type === 'commander') {
                        finalBoardStateForAI[promoR][promoC].piece!.type = 'hero';
                        finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_HeroPromo_AI`;
                        setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                    }
                    toast({ title: `AI Commander Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander promoted to Hero! (L${originalLevelOfAIMovedPieceForPromoCheck})`, duration: 8000 });
                    if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;
              } else if (isEnteringAnvilDropMode) {
                  const emptySquares: AlgebraicSquare[] = [];
                  for (let r_anvil = 0; r_anvil < 8; r_anvil++) for (let c_anvil = 0; c_anvil < 8; c_anvil++) if (!finalBoardStateForAI[r_anvil][c_anvil].piece && !finalBoardStateForAI[r_anvil][c_anvil].item) emptySquares.push(coordsToAlgebraic(r_anvil, c_anvil));
                  
                  if (emptySquares.length > 0) {
                    const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
                    const oppKingPos = findKing(finalBoardStateForAI, opponentColor);
                    let bestAnvilSquare: AlgebraicSquare;
                    if (oppKingPos) {
                      emptySquares.sort((a,b) => {
                        const { row: rA, col: cA } = algebraicToCoords(a);
                        const { row: rB, col: cB } = algebraicToCoords(b);
                        const distA = Math.abs(rA - oppKingPos.row) + Math.abs(cA - oppKingPos.col);
                        const distB = Math.abs(rB - oppKingPos.row) + Math.abs(cB - oppKingPos.col);
                        return distA - distB;
                      });
                      bestAnvilSquare = emptySquares[0];
                    } else {
                      bestAnvilSquare = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                    }
                    const { row: anvilR, col: anvilC } = algebraicToCoords(bestAnvilSquare);
                    finalBoardStateForAI[anvilR][anvilC].item = { type: 'anvil' };
                    addEffect('poof', bestAnvilSquare);
                    toast({ title: "AI Anvil Drop!", description: `AI placed an anvil on ${bestAnvilSquare}.`});
                  }
              } else if (pieceAtDestinationAI?.type === 'queen') {
                 sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, levelFromAIApplyMove, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              } else if (aiBecameInfiltrator) {
              }

              if (localAIAwaitingCommanderPromo) {
                processMoveEnd(finalBoardStateForAI, currentPlayer, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              } else if (!sacrificeNeededForAIQueen) {
                  processMoveEnd(finalBoardStateForAI, currentPlayer, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              }

              setIsMoveProcessing(false);
              setIsAiThinking(false);
            }, 800);
        } else {
          aiErrorOccurredRef.current = true;
        }
      } else { 
        aiErrorOccurredRef.current = true;
      }
    } catch (error) {
      aiErrorOccurredRef.current = true;
      console.error("[AI_PERFORM_MOVE] CATCH BLOCK ERROR:", error);
    }

    if (aiErrorOccurredRef.current) {
      console.error(`[AI_FORFEIT] AI is forfeiting for player ${currentPlayer}. Board state at time of forfeit:`, boardToSimpleString(board, currentPlayer, enPassantTargetSquare));
      toast({
        title: `AI (${getPlayerDisplayName(currentPlayer)}) Error/Forfeit`,
        description: "AI move forfeited due to an internal error or no legal moves.",
        variant: "destructive",
        duration: 8000,
      });
  
      const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
  
      if (!hasAnyLegalMoves(board, currentPlayer, enPassantTargetSquare)) {
          if (isKingInCheck(board, currentPlayer, enPassantTargetSquare)) {
              setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(opponentPlayer!)} wins!`, isCheck: true, playerWithKingInCheck: currentPlayer, isCheckmate: true, gameOver: true, winner: opponentPlayer }));
          } else {
              setGameInfo(prev => ({ ...prev, message: "Stalemate! It's a draw.", isCheck: false, isStalemate: true, gameOver: true, winner: 'draw' }));
          }
      } else {
          // If there are legal moves but the AI failed, it's a forfeit.
          setGameInfo(prev => ({ ...prev, message: `AI Forfeits. ${getPlayerDisplayName(opponentPlayer!)} wins!`, gameOver: true, winner: opponentPlayer }));
      }
  
      if (currentPlayer === 'white') setIsWhiteAI(false);
      else setIsBlackAI(false);
  
      setIsMoveProcessing(false);
      setIsAiThinking(false);
      return;
    }
  }, [
    board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing, killStreaks, capturedPieces, enPassantTargetSquare,
    isWhiteAI, isBlackAI, isAiThinking, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, addEffect,
    saveStateToHistory, toast, getPlayerDisplayName, hasAnyLegalMoves,
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
    setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo,
    setShowCaptureFlash, setCaptureFlashKey, setIsWhiteAI, setIsBlackAI,
    setLastMoveFrom, setLastMoveTo,
    processPawnSacrificeCheck,
    getPossibleMoves, isStalemate, isCheckmate,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey, gameMoveCounter,
    firstBloodAchieved, playerWhoGotFirstBlood,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, setResurrectedSquares
  ]);


  useEffect(() => {
    const currentAiInstance = aiInstanceRef.current;
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI && onlineStatus === 'disconnected') || (currentPlayer === 'black' && isBlackAI && onlineStatus === 'disconnected');
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isResurrectionPromotionInProgress && !isAwaitingAnvilDrop && currentAiInstance) {
        if (!isAwaitingCommanderPromotion || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)) {
             performAiMove();
        }
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, onlineStatus, isAwaitingAnvilDrop]);

  useEffect(() => {
    if (!board || positionHistory.length > 0) return;
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights, enPassantTargetSquare);
    if (initialHash) {
      setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory, enPassantTargetSquare]);

  useEffect(() => {
    if (gameInfo.gameOver && gameInfo.winner && localPlayerColor === null) {
      // Per user request, do not show the "You Lost" screen for offline games.
      // localPlayerColor is null in offline games.
    } else if (gameInfo.gameOver && gameInfo.winner && localPlayerColor !== null) {
        const isResignation = gameInfo.message.includes('resigned');
        const hasPrimaryAnnouncement = !isResignation && (gameInfo.isCheckmate || gameInfo.isInfiltrationWin || gameInfo.isStalemate || gameInfo.isThreefoldRepetitionDraw);
        const delay = hasPrimaryAnnouncement ? 2700 : (isResignation ? 1000 : 1500);
        const timerId = setTimeout(() => {
            if (gameInfo.winner === localPlayerColor) {
                setShowWinScreen(true);
            } else if (gameInfo.winner !== 'draw' && gameInfo.winner !== undefined) {
                setShowLossScreen(true);
            }
        }, delay);
        return () => clearTimeout(timerId);
    } else {
      setShowWinScreen(false);
      setShowLossScreen(false);
    }
  }, [gameInfo.gameOver, gameInfo.winner, gameInfo.isCheckmate, gameInfo.isInfiltrationWin, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, localPlayerColor, onlineStatus, gameInfo.message]);

  useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver) {
      if (gameInfo.winner === 'draw' || gameInfo.isStalemate || gameInfo.isThreefoldRepetitionDraw) {
        currentCheckStateString = 'draw';
      } else if (gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
        currentCheckStateString = `checkmate-${gameInfo.playerWithKingInCheck}`;
      } else if (gameInfo.isInfiltrationWin) {
        currentCheckStateString = `infiltration-${gameInfo.winner}`;
      }
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
        } else if (currentCheckStateString.startsWith('infiltration')) {
          setFlashMessage('INFILTRATION!');
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
      const duration = (flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!') ? 2500 : 1500;
      timerId = setTimeout(() => {
        setFlashMessage(null);
      }, duration);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [flashMessage, flashMessageKey]);

  useEffect(() => {
    const { white: prevWhite, black: prevBlack } = prevKillStreaksRef.current;
    const { white: currentWhite, black: currentBlack } = killStreaks;
    const firstBloodJustAchieved = firstBloodAchieved && !prevFirstBloodRef.current;

    let playerWithNewStreak: PlayerColor | null = null;
    let newStreakValue = 0;
    
    // Determine who made the move that changed the streak
    if (currentWhite > prevWhite) {
        playerWithNewStreak = 'white';
        newStreakValue = currentWhite;
    } else if (currentBlack > prevBlack) {
        playerWithNewStreak = 'black';
        newStreakValue = currentBlack;
    }
    
    if (firstBloodJustAchieved) {
        setKillStreakFlashMessage("FIRST BLOOD!");
        setKillStreakFlashMessageKey(k => k + 1);
    } else if (playerWithNewStreak) {
        const streakMsg = getKillStreakToastMessage(newStreakValue);
        if (streakMsg) {
            setKillStreakFlashMessage(streakMsg);
            setKillStreakFlashMessageKey(k => k + 1);
        }
    }

    prevKillStreaksRef.current = { ...killStreaks };
    prevFirstBloodRef.current = firstBloodAchieved;

  }, [killStreaks, firstBloodAchieved, getKillStreakToastMessage]);

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
    if (showTimerWarning) {
      timerId = setTimeout(() => {
        setShowTimerWarning(false);
      }, 1500);
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showTimerWarning, timerWarningKey]);

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
    if (onlineStatus === 'connected' && !gameInfo.gameOver) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({ type: 'resign', resigningPlayer: localPlayerColor });
          console.log('[CLIENT] > SENDING WS to server:', payload);
          ws.send(payload);
      }
      return;
    }
    fullGameReset();
    toast({ title: "Game Reset", description: "The board has been reset.", duration: 8000 });
  }, [onlineStatus, localPlayerColor, toast, fullGameReset, gameInfo.gameOver]);

  const handleUndo = useCallback(() => {
    if (onlineStatus !== 'disconnected' || (isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || isAwaitingAnvilDrop) {
      toast({ title: "Undo Failed", description: "Cannot undo during AI turn, processing, or pending actions. Undo is disabled in online games.", duration: 8000 });
      return;
    }
    if (historyStack.length === 0) {
      toast({ title: "Undo Failed", description: "No moves to undo.", duration: 8000 });
      setLastMoveFrom(null);
      setLastMoveTo(null);
      return;
    }

    const isAIGame = isWhiteAI || isBlackAI;
    let targetIndex = -1;
    let turnsToUndo = 1;

    if (isAIGame) {
        turnsToUndo = 2;
    }

    let playableStatesFound = 0;
    for (let i = historyStack.length - 1; i >= 0; i--) {
        const state = historyStack[i];
        if (state && !state.isAwaitingPawnSacrifice && !state.isAwaitingCommanderPromotion && !state.isResurrectionPromotionInProgress && !state.isAwaitingRookSacrifice && !state.isAwaitingAnvilDrop) {
            playableStatesFound++;
            if (playableStatesFound >= turnsToUndo) {
                targetIndex = i;
                break;
            }
        }
    }
    
    // If we want to undo 2 turns in an AI game but only found 1 playable state, undo just that 1.
    if (targetIndex === -1 && playableStatesFound > 0) {
        for (let i = historyStack.length - 1; i >= 0; i--) {
            const state = historyStack[i];
            if (state && !state.isAwaitingPawnSacrifice && !state.isAwaitingCommanderPromotion && !state.isResurrectionPromotionInProgress && !state.isAwaitingRookSacrifice && !state.isAwaitingAnvilDrop) {
                targetIndex = i;
                break;
            }
        }
    }


    if (targetIndex === -1) {
      toast({ title: "Undo Failed", description: "No playable state to undo to.", duration: 8000 });
      return;
    }

    const stateToRestore = historyStack[targetIndex];
    const newHistoryStack = historyStack.slice(0, targetIndex);

    if (stateToRestore) {
      setBoard(stateToRestore.board);
      setCurrentPlayer(stateToRestore.currentPlayer);
      setGameInfo(stateToRestore.gameInfo);
      setCapturedPieces(stateToRestore.capturedPieces);
      setKillStreaks(stateToRestore.killStreaks);
      setPositionHistory(stateToRestore.positionHistory || []);
      setLastMoveFrom(stateToRestore.lastMoveFrom || null);
      setLastMoveTo(stateToRestore.lastMoveTo || null);
      setGameMoveCounter(stateToRestore.gameMoveCounter || 0);
      setEnPassantTargetSquare(stateToRestore.enPassantTargetSquare || null);

      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation());

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
      setPlayerToPromote(null);
      setPromotionMoveWasCapture(stateToRestore.promotionMoveWasCapture || false);
      setPromotionPawnOriginalLevel(stateToRestore.promotionPawnOriginalLevel || null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false);
      aiErrorOccurredRef.current = false;
      setHistoryStack(newHistoryStack);
      setPieceForInfoDisplay(null);

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

      setFirstBloodAchieved(stateToRestore.firstBloodAchieved);
      setPlayerWhoGotFirstBlood(stateToRestore.playerWhoGotFirstBlood);
      setIsAwaitingCommanderPromotion(stateToRestore.isAwaitingCommanderPromotion);

      setShroomSpawnCounter(stateToRestore.shroomSpawnCounter || 0);
      setNextShroomSpawnTurn(stateToRestore.nextShroomSpawnTurn || (Math.floor(Math.random() * 6) + 5));

      setResurrectedSquares(stateToRestore.resurrectedSquares || []);
      
      setTurnTimer(stateToRestore.turnTimer || null);
      setActiveTimerPlayer(stateToRestore.activeTimerPlayer || null);
      setWhiteTimeouts(stateToRestore.whiteTimeouts || 0);
      setBlackTimeouts(stateToRestore.blackTimeouts || 0);
      setEffects([]);

      setIsAwaitingAnvilDrop(stateToRestore.isAwaitingAnvilDrop || false);
      setPlayerToDropAnvil(stateToRestore.playerToDropAnvil || null);
      setAnvilDropContext(stateToRestore.anvilDropContext || null);
      setAnvilDropAfterPromotion(stateToRestore.anvilDropAfterPromotion || false);

      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 8000 });
    } else {
      setLastMoveFrom(null);
      setLastMoveTo(null);
    }
  }, [
    historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing,
    isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress, isAwaitingCommanderPromotion,
    setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks,
    setPositionHistory, setLastMoveFrom, setLastMoveTo, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage,
    setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn,
    setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setKillStreakFlashMessage,
    setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove,
    setIsAwaitingRookSacrifice, setPlayerToSacrificeForRook, setRookToMakeInvulnerable, setBoardForRookSacrifice, originalTurnPlayerForRookSacrifice, setIsExtraTurnFromRookLevelUp,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setGameMoveCounter,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion,
    setShroomSpawnCounter, setNextShroomSpawnTurn,
    onlineStatus, setPromotionMoveWasCapture, setPromotionPawnOriginalLevel,
    setResurrectedSquares, playerWhoGotFirstBlood, setEnPassantTargetSquare, isAwaitingAnvilDrop,
  ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, []);


  const handleToggleWhiteAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing || onlineStatus !== 'disconnected') {
      if(onlineStatus !== 'disconnected') toast({ title: "AI Control Disabled", description: "Cannot enable/disable AI during an online game.", duration: 8000 });
      return;
    }
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1000 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, toast, gameInfo.gameOver, onlineStatus]); 

  const handleToggleBlackAI = useCallback(() => {
     if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing || onlineStatus !== 'disconnected') {
      if(onlineStatus !== 'disconnected') toast({ title: "AI Control Disabled", description: "Cannot enable/disable AI during an online game.", duration: 8000 });
      return;
    }
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1000 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, toast, gameInfo.gameOver, onlineStatus]);

  const isInteractionDisabled = gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood !== currentPlayer) || (isAwaitingAnvilDrop && playerToDropAnvil !== currentPlayer);

  const getButtonText = () => {
    if (onlineStatus === 'connecting') return 'Connecting...';
    if (onlineStatus === 'connected' || onlineStatus === 'waiting') return `Disconnect`;
    return 'Create Online Game';
  };

  const getRankedButtonText = () => {
    if(rankedQueueStatus === 'searching') return 'Searching...';
    return 'Ranked';
  }

  const handleRankedPlay = () => {
    if (rankedQueueStatus === 'searching') {
        // Cancel logic
        if(wsRef.current) {
            const payload = JSON.stringify({ type: 'leave-ranked-queue' });
            console.log('[CLIENT] > SENDING WS to server:', payload);
            wsRef.current.send(payload);
        }
        setRankedQueueStatus('idle');
        disconnectAndReset();
        toast({ title: "Search Cancelled", description: "You have left the ranked queue.", duration: 8000 });
    } else {
        handleOnlinePlay('ranked');
    }
  }


  const getStatusMessage = () => {
    if (rankedQueueStatus === 'searching') {
        return <p className="text-sm font-medium text-primary mt-1 animate-pulse">Searching for a ranked match...</p>;
    }
    if (onlineStatus === 'waiting' && roomId) {
      return (
        <p className="text-sm font-medium text-primary mt-1">
          Waiting... Share Room ID: <span className="font-bold bg-muted p-1 rounded-md select-all">{roomId}</span>
        </p>
      );
    }
    if (onlineStatus === 'connected' && localPlayerColor) {
      return <p className="text-sm font-medium text-primary mt-1">Connection established! You are playing as {localPlayerColor}.</p>;
    }
    if (onlineStatus === 'connecting') {
        return <p className="text-sm font-medium text-primary mt-1">Connecting...</p>;
    }
    return null;
  };

  const handlePieceHover = useCallback((piece: Piece | null) => {
    setPieceForInfoDisplay(piece);
  }, []);

  const isOnlineGameInProgress = onlineStatus === 'connected' && !gameInfo.gameOver;

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-1 lg:hidden">
      <div className="flex flex-col items-center justify-between flex-grow gap-1">
          <div className="w-full flex items-center justify-between">
              <div className="w-1/3"></div>
              <div className="w-1/3 flex items-center justify-center gap-0">
                   <Image
                      src="/images/rook-title.gif"
                      alt="Vibe Chess Rook"
                      width={40}
                      height={40}
                      unoptimized
                      className="transform scale-x-[-1] w-6 h-6 sm:w-10 sm:h-10"
                      data-ai-hint="chess rook"
                  />
                  <h1 className="text-xl md:text-3xl font-bold text-accent font-pixel text-center animate-pixel-title-flash px-1">VIBE CHESS</h1>
                  <Image
                      src="/images/rook-title.gif"
                      alt="Vibe Chess Rook"
                      width={40}
                      height={40}
                      unoptimized
                      className="w-10 h-10"
                      data-ai-hint="chess rook"
                  />
              </div>
               <div className="w-1/3 flex justify-end">
                  <AuthWidget />
              </div>
          </div>

          <div className={cn("text-center text-sm font-bold min-h-[1.25em]",
              gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse",
              (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse")
            )}>
             {gameInfo.message}
           </div>
          
          <div className="w-full">
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
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer}
              playerToPromoteCommander={playerWhoGotFirstBlood === currentPlayer ? currentPlayer : null}
              isEnPassantTarget={enPassantTargetSquare}
              resurrectedSquares={resurrectedSquares.map(rs => rs.square)}
              onPieceHover={handlePieceHover}
              effects={effects}
              promotingSquare={promotionSquare}
              isAwaitingAnvilDrop={isAwaitingAnvilDrop}
              playerToDropAnvil={playerToDropAnvil}
            />
          </div>
          
           <GameControls
              currentPlayer={currentPlayer}
              capturedPieces={capturedPieces}
              isGameOver={gameInfo.gameOver}
              killStreaks={killStreaks}
              pieceForInfoDisplay={pieceForInfoDisplay}
              localPlayerColor={localPlayerColor}
              getPlayerDisplayName={getPlayerDisplayName}
              onlineStatus={onlineStatus}
              turnTimer={turnTimer}
              activeTimerPlayer={activeTimerPlayer}
            />
          
          <div className="flex flex-wrap justify-center items-center gap-1 mt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label={isOnlineGameInProgress ? "Resign Game" : "Reset Game"} className="h-7 px-2 text-xs">
                  {isOnlineGameInProgress ? <Flag /> : <RefreshCw />} {isOnlineGameInProgress ? 'Resign' : 'Reset'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isOnlineGameInProgress ? "This will end the current online game and you will forfeit." : "This action will reset the game board to the starting position."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={resetGame}>
                    {isOnlineGameInProgress ? 'Yes, Resign' : 'Yes, Reset'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-7 px-2 text-xs">
              <BookOpen /> Rules
            </Button>
            <Link href="/leaderboard">
              <Button variant="outline" size="sm" aria-label="View Leaderboard" className="h-7 px-2 text-xs">
                <Trophy /> L.board
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || isAwaitingAnvilDrop} aria-label="Undo Move" className="h-7 px-2 text-xs">
              <Undo2 /> Undo
            </Button>
          </div>
           <div className="flex flex-wrap justify-center items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-7 px-2 text-xs">
                <Bot /> W:{isWhiteAI ? 'On' : 'Off'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-7 px-2 text-xs">
                <Bot /> B:{isBlackAI ? 'On' : 'Off'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} aria-label="Toggle Board View" className="h-7 px-2 text-xs">
                <View /> View
              </Button>
           </div>
           <div className="flex flex-wrap justify-center items-center gap-1">
              <Button
              variant="outline"
              size="sm"
              onClick={handleRankedPlay}
              disabled={!user || onlineStatus !== 'disconnected'}
              className="h-7 px-2 text-xs"
              aria-label="Play Ranked Match"
              >
              <Trophy />
              {getRankedButtonText()}
              </Button>
              <Button
              variant="outline"
              size="sm"
              onClick={() => handleOnlinePlay('create')}
              disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)}
              className="h-7 px-2 text-xs"
              aria-label={onlineStatus !== 'disconnected' ? "Disconnect" : "Create Online Game"}
              >
              {onlineStatus !== 'disconnected' ? <Link2Off /> : <Globe />}
              {getButtonText()}
              </Button>
              <div className="flex gap-1 items-center">
              <Input
                  type="text"
                  placeholder="Room ID"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value)}
                  className="h-7 px-2 text-xs w-20"
                  disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI}
              />
              <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOnlinePlay('join')}
                  disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI}
                  className="h-7 px-2 text-xs"
                  aria-label="Join Online Game"
              >
                  Join
              </Button>
              </div>
          </div>
           <div className="w-full text-center h-4 text-xs mt-1">
              {getStatusMessage()}
          </div>
        </div>
    </div>
  );

  const desktopLayout = (
    <div className="hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      {/* Left Column */}
      <div className="w-1/4 flex-shrink-0">
        <GameControls
            currentPlayer={currentPlayer}
            capturedPieces={capturedPieces}
            isGameOver={gameInfo.gameOver}
            killStreaks={killStreaks}
            pieceForInfoDisplay={pieceForInfoDisplay}
            localPlayerColor={localPlayerColor}
            getPlayerDisplayName={getPlayerDisplayName}
            onlineStatus={onlineStatus}
            turnTimer={turnTimer}
            activeTimerPlayer={activeTimerPlayer}
        />
      </div>

      {/* Center Column */}
      <div className="w-1/2 flex flex-col items-center gap-2">
        <div className="w-full flex items-center justify-center gap-0">
            <Image
                src="/images/rook-title.gif"
                alt="Vibe Chess Rook"
                width={40}
                height={40}
                unoptimized
                className="transform scale-x-[-1] w-10 h-10"
                data-ai-hint="chess rook"
            />
            <h1 className="text-3xl font-bold text-accent font-pixel text-center animate-pixel-title-flash px-1">VIBE CHESS</h1>
            <Image
                src="/images/rook-title.gif"
                alt="Vibe Chess Rook"
                width={40}
                height={40}
                unoptimized
                className="w-10 h-10"
                data-ai-hint="chess rook"
            />
        </div>
        <div className={cn("text-center text-sm font-bold min-h-[1.25em]",
            gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse",
            (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse")
          )}>
           {gameInfo.message}
        </div>
        <div className="w-full max-w-lg">
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
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer}
              playerToPromoteCommander={playerWhoGotFirstBlood === currentPlayer ? currentPlayer : null}
              isEnPassantTarget={enPassantTargetSquare}
              resurrectedSquares={resurrectedSquares.map(rs => rs.square)}
              onPieceHover={handlePieceHover}
              effects={effects}
              promotingSquare={promotionSquare}
              isAwaitingAnvilDrop={isAwaitingAnvilDrop}
              playerToDropAnvil={playerToDropAnvil}
          />
        </div>
      </div>

      {/* Right Column */}
      <div className="w-1/4 flex flex-col gap-4">
        <AuthWidget />
        <Card>
          <CardContent className="p-2 flex flex-col gap-2">
            <div className="flex flex-wrap justify-center items-center gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" aria-label={isOnlineGameInProgress ? "Resign Game" : "Reset Game"} className="h-7 px-2 text-xs">
                    {isOnlineGameInProgress ? <Flag /> : <RefreshCw />} {isOnlineGameInProgress ? 'Resign' : 'Reset'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isOnlineGameInProgress ? "This will end the current online game and you will forfeit." : "This action will reset the game board to the starting position."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={resetGame}>
                      {isOnlineGameInProgress ? 'Yes, Resign' : 'Yes, Reset'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-7 px-2 text-xs">
                <BookOpen /> Rules
              </Button>
              <Link href="/leaderboard">
                <Button variant="outline" size="sm" aria-label="View Leaderboard" className="h-7 px-2 text-xs">
                  <Trophy /> L.board
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || isAwaitingAnvilDrop} aria-label="Undo Move" className="h-7 px-2 text-xs">
                <Undo2 /> Undo
              </Button>
            </div>
             <div className="flex flex-wrap justify-center items-center gap-1">
                <Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-7 px-2 text-xs">
                  <Bot /> W:{isWhiteAI ? 'On' : 'Off'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-7 px-2 text-xs">
                  <Bot /> B:{isBlackAI ? 'On' : 'Off'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} aria-label="Toggle Board View" className="h-7 px-2 text-xs">
                  <View /> View
                </Button>
             </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2 flex flex-col gap-2">
             <div className="flex flex-col gap-1 items-center">
                <Button
                variant="outline"
                size="sm"
                onClick={handleRankedPlay}
                disabled={!user || onlineStatus !== 'disconnected'}
                className="h-7 px-2 text-xs w-full"
                aria-label="Play Ranked Match"
                >
                <Trophy />
                {getRankedButtonText()}
                </Button>
                <Button
                variant="outline"
                size="sm"
                onClick={() => handleOnlinePlay('create')}
                disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)}
                className="h-7 px-2 text-xs w-full"
                aria-label={onlineStatus !== 'disconnected' ? "Disconnect" : "Create Online Game"}
                >
                {onlineStatus !== 'disconnected' ? <Link2Off /> : <Globe />}
                {getButtonText()}
                </Button>
                <div className="flex gap-1 items-center w-full">
                <Input
                    type="text"
                    placeholder="Room ID"
                    value={inputRoomId}
                    onChange={(e) => setInputRoomId(e.target.value)}
                    className="h-7 px-2 text-xs flex-grow"
                    disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI}
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOnlinePlay('join')}
                    disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI}
                    className="h-7 px-2 text-xs"
                    aria-label="Join Online Game"
                >
                    Join
                </Button>
                </div>
            </div>
             <div className="w-full text-center h-4 text-xs mt-1">
                {getStatusMessage()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-full h-full w-full bg-background flex flex-col relative after:content-[''] after:fixed after:inset-0 after:bg-black after:opacity-0 after:-z-10 after:pointer-events-none", showLossScreen && "after:animate-fade-to-black")}>
      {/* Flash Messages & Overlays */}
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash pointer-events-none" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash pointer-events-none" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash pointer-events-none" />}
      {flashMessage && (<div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
      {killStreakFlashMessage && (<div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}
      
      {showTimerWarning && (
        <div key={`timer-warning-${timerWarningKey}`} className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="animate-flash-timer-warning">
                <p className="text-7xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>
                    10
                </p>
            </div>
        </div>
      )}

      {showWinScreen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ animation: 'flash-loss 3s forwards' }}>
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>
              YOU WON
            </p>
        </div>
      )}
      {showLossScreen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ animation: 'flash-loss 3s forwards' }}>
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>
              YOU LOST
            </p>
        </div>
      )}
      
      <div className="lg:hidden">
        {mobileLayout}
      </div>
      <div className="hidden lg:block h-full">
        {desktopLayout}
      </div>
      
      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={playerToPromote}
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}
