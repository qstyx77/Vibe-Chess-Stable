'use client';

import type { ReactNode } from 'react';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import { GameSummaryDialog } from '@/components/evolving-chess/GameSummaryDialog';
import { InventoryWindow } from '@/components/evolving-chess/InventoryWindow';
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
  isValidSquare,
  processRookResurrectionCheck,
  type RookResurrectionResult,
  findKing,
  isQueenSacrificeRequired,
  getEffectiveLevel,
  processPoisonDamage,
  getPromotionLevel,
  VAL_MAP,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, QueenLevelReducedEvent, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, ChatMessage, InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag, Trophy, Settings, Volume2, BrainCircuit, Swords, Package } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { AuthWidget } from '@/components/auth/AuthWidget';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import { audioManager } from '@/lib/audio-manager';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';


const initialGameStatus: GameStatus = {
  message: " ",
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
        const squareState = boardRow[c_idx];
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
      white: currentKillStreaks?.white ? currentCapturedPieces?.white?.map(p => ({ ...p })) || [] : [],
      black: currentKillStreaks?.black ? currentCapturedPieces?.black?.map(p => ({ ...p })) || [] : [],
    },
    gameOver: false,
    winner: undefined,
    extraTurn: false,
    gameMoveCounter: gameMoveCounter,
    firstBloodAchieved: firstBloodAchieved,
    playerWhoGotFirstBlood: playerWhoGotFirstBlood,
    enPassantTargetSquare: enPassantTargetSquare,
    shroomSpawnCounter: shroomSpawnCounter,
    nextShroomSpawnTurn: nextShroomSpawnTurn,
  };
}


export default function EvolvingChessPage() {
  const { user, userData, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

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
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
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

  const clickGuardRef = useRef(false);
  const uniqueIdCounterRef = useRef(20000);
  const effectCounterRef = useRef(0);

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
  const effectCleanupTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [playerToDropAnvil, setPlayerToDropAnvil] = useState<PlayerColor | null>(null);
  const [anvilDropContext, setAnvilDropContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, oldStreak: number, newStreak: number, completedMilestones?: string[] } | null>(null);
  const [anvilDropAfterPromotion, setAnvilDropAfterPromotion] = useState(false);

  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [shieldContext, setShieldContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, capturingPieceId?: string, oldStreak?: number, newStreak?: number, completedMilestones?: string[] } | null>(null);

  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [archerSnipeContext, setArcherSnipeContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, oldStreak?: number, newStreak?: number, completedMilestones?: string[] } | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const isMessengerOpenRef = useRef(isMessengerOpen);
  const localPlayerColorRef = useRef<PlayerColor | null>(null);

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
  const firstBloodFlashedRef = useRef(false);
  const prevBoardRef = useRef<BoardState | null>(null);
  const signaledEventsRef = useRef<Set<string>>(new Set());

  const [eloResult, setEloResult] = useState<any | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const [volume, setVolume] = useState(100);
  const [aiDifficulty, setAiDifficulty] = useState(4);

  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);

  // --- Inventory States ---
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);

  const hasInitializedSession = useRef(false);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}-${effectCounterRef.current++}`;
    const newEffect: Effect = { id, type, square, color, value };

    setEffects(prev => [...prev, newEffect]);

    const timer = setTimeout(() => {
        setEffects(current => current.filter(e => e.id !== id));
        delete effectCleanupTimersRef.current[id];
    }, 1500);

    effectCleanupTimersRef.current[id] = timer;
  }, []);

  // Synchronize equipment and ELO from userData to board state on initial load
  useEffect(() => {
    if (!isUserLoading && userData && !hasInitializedSession.current) {
      hasInitializedSession.current = true;
      const elo = userData.eloRating || 1200;
      let initial = initializeBoard(elo, 1200);
      
      if (userData.equipment) {
        initial = initial.map(row => row.map(sq => {
          if (sq.piece && userData.equipment![sq.piece.id]) {
            return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } };
          }
          return sq;
        }));
      }
      setBoard(initial);
      if (userData.inventory) setInventory(userData.inventory);
    }
  }, [userData, isUserLoading]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    if (!player) return 'A player'; 
    if (onlineStatus === 'connected' || onlineStatus === 'waiting') {
        const username = gamePlayers?.[player]?.username;
        if (username) {
            if (player === localPlayerColor) {
                return `${username} (You)`;
            }
            return username;
        }
    }
    
    let baseName: string = player.charAt(0).toUpperCase() + player.slice(1);
    
    if (player === 'white' && isWhiteAI && onlineStatus === 'disconnected') return `${baseName} (AI)`;
    if (player === 'black' && isBlackAI && onlineStatus === 'disconnected') return `${baseName} (AI)`;

    return baseName;
  }, [isWhiteAI, isBlackAI, onlineStatus, localPlayerColor, gamePlayers]);

  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor, newEnPassantTarget: AlgebraicSquare | null) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(updatedBoard, nextPlayer);
    let finalizedBoard = boardAfterPoison;
    if (poisonedCaptures.length > 0) {
        setCapturedPieces(prev => ({ ...prev, [playerWhoseTurnEnded]: [...(prev[playerWhoseTurnEnded] || []), ...poisonedCaptures] }));
        setKillStreaks(prev => ({ ...prev, [playerWhoseTurnEnded]: (prev[playerWhoseTurnEnded] || 0) + poisonedCaptures.length }));
        audioManager.playCapture();
        toast({ title: "Poison Damage!", description: `${poisonedCaptures.length} piece(s) affected by poison!`, duration: 3000 });
    }
    setBoard(finalizedBoard);
    setCurrentPlayer(nextPlayer);
    setEnPassantTargetSquare(newEnPassantTarget);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    const inCheck = isKingInCheck(finalizedBoard, nextPlayer, newEnPassantTarget);
    let newPlayerWithKingInCheck: PlayerColor | null = null;
    let currentMessage = " ";
    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(finalizedBoard, nextPlayer, newEnPassantTarget);
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
      const stale = isStalemate(finalizedBoard, nextPlayer, newEnPassantTarget);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
        if (onlineStatus === 'connected') {
          const ws = wsRef.current;
          if(ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'threefold-repetition' }));
          }
        }
        return;
      }
    }
     setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: inCheck, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));
  }, [getPlayerDisplayName, onlineStatus, toast]);

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
          ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'threefold-repetition' }));
        }
      }
    } else {
      setGameInfo(prev => ({ ...prev, message, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [toast, getPlayerDisplayName, onlineStatus]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep;
    const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter);
    if (onlineStatus !== 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
      let currentShroomCounter = (shroomSpawnCounter || 0) + 1;
      setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= (nextShroomSpawnTurn || 5)) {
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
                  audioManager.playShroom();
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
      setGameInfo(prev => ({ ...prev, message: "Draw by Threefold Repetition!", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, isThreefoldRepetitionDraw: true, gameOver: true, winner: 'draw' }));
      if (onlineStatus === 'connected') {
        const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'threefold-repetition' }));
        }
      }
      return;
    }
    if (gameInfo.gameOver) return;
    if (isExtraTurn) setGameInfoBasedOnExtraTurn(currentBoardState, playerWhoseTurnCompleted);
    else completeTurn(currentBoardState, playerWhoseTurnCompleted, newEnPassantTarget);
  }, [positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, gameInfo.isInfiltrationWin, gameInfo.gameOver, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn, gameMoveCounter, getPlayerDisplayName, setCurrentPlayer, isWhiteAI, isBlackAI, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = []) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);

    // 1. First Blood -> Commander Promo
    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true);
        setPlayerWhoGotFirstBlood(actingPlayer);
        
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (pawnSq) {
                const {row, col} = algebraicToCoords(pawnSq.algebraic);
                nextBoard[row][col].piece!.type = 'commander';
                nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_AI_${Date.now()}`;
            }
            triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'firstBlood']);
            return;
        } else if (actingPlayer === (localPlayerColor || 'white')) {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (hasL1Targets) {
                setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'] });
                setIsAwaitingCommanderPromotion(true);
                return;
            }
        }
    }

    // 2. Killstreak: Holy Shield (Streak 2+ + Archbishop)
    if (newStreak >= 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === actingPlayer);
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const targets = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                if (targets.length > 0) {
                    const t = targets[Math.floor(Math.random() * targets.length)];
                    t.piece!.isShielded = true;
                }
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield']);
                return;
            } else if (actingPlayer === (localPlayerColor || 'white')) {
                setShieldContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'] });
                setIsAwaitingHolyShield(true);
                return;
            }
        }
    }

    // 3. Killstreak: Anvil (Streak 3+)
    if (newStreak >= 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) {
                const sq = empty[Math.floor(Math.random() * empty.length)];
                sq.item = { type: 'anvil' };
            }
            triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'anvil']);
            return;
        } else if (actingPlayer === (localPlayerColor || 'white')) {
            setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'] });
            setPlayerToDropAnvil(actingPlayer);
            setIsAwaitingAnvilDrop(true);
            return;
        }
    }

    // 4. Killstreak: Resurrection (Streak 4+)
    if (newStreak >= 4 && !completedMilestones.includes('resurrection')) {
        const opponentColor = (actingPlayer === 'white' ? 'black' : 'white');
        const myGraveyard = actingPlayer === 'white' ? capturedPieces.black : capturedPieces.white; 
        
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sorted = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0));
            const choice = sorted[0];
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random() * empty.length)];
                const {row, col} = algebraicToCoords(sq.algebraic);
                const res = { ...choice, level: 1, id: `${choice.id}_res_KS_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                
                const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (res.type === 'commander' && row === oppBackRank) res.type = 'hero';
                
                nextBoard[row][col].piece = res;
                setCapturedPieces(prev => {
                   const next = actingPlayer === 'white' ? { ...prev, black: prev.black.filter(p => p.id !== choice.id) } : { ...prev, white: prev.white.filter(p => p.id !== choice.id) };
                   return next;
                });
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect();

                if (!isAI && actingPlayer === (localPlayerColor || 'white') && res.type === 'pawn' && row === oppBackRank) {
                    setPromotionTargetLevel(1);
                    setPromotionSquare(sq.algebraic);
                    setIsPromotingPawn(true);
                    setAnvilDropContext({ boardForNextStep: nextBoard, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'resurrection'] });
                    return;
                }
                
                if (isAI && res.type === 'pawn' && row === oppBackRank) {
                    nextBoard[row][col].piece!.type = 'queen';
                }

                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection']);
                return;
            }
        }
    }

    // 5. Killstreak: Archer Snipe (Streak 5+ + Archer OR Streak 3+ + Crossbow)
    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const hasArcher = pieces.some(p => p.type === 'archer');
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && hasArcher) || (newStreak >= 3 && hasCrossbow);

    if (isSnipeTime && !completedMilestones.includes('snipe')) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const v = victims[Math.floor(Math.random() * victims.length)];
                const {row, col} = algebraicToCoords(v.algebraic);
                const sniped = { ...nextBoard[row][col].piece!, id: `${nextBoard[row][col].piece!.id}_sniped_AI_${Date.now()}` };
                setCapturedPieces(prev => {
                   const next = actingPlayer === 'white' ? { ...prev, white: [...(prev.white || []), sniped] } : { ...prev, black: [...(prev.black || []), sniped] };
                   return next;
                });
                nextBoard[row][col].piece = null;
                addEffect('poof', v.algebraic); audioManager.playSnipe();
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe']);
                return;
            } else if (actingPlayer === (localPlayerColor || 'white')) {
                setArcherSnipeContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'] });
                setIsAwaitingArcherSnipe(true);
                return;
            }
        }
    }

    processMoveEnd(boardToChain, actingPlayer, isExtra, nextEp);
  }, [firstBloodAchieved, capturedPieces, addEffect, processMoveEnd, isWhiteAI, isBlackAI, localPlayerColor]);

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || isAwaitingHolyShield || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget;

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    queenMovedWithThis: Move | null,
    originalPieceLevelIfKnown: number | undefined,
    originalPieceTypeIfKnown: PieceType | undefined,
    isExtraTurnFromOriginalMove: boolean,
    newEnPassantTarget: AlgebraicSquare | null,
    oldStreak: number,
    newStreak: number
  ): boolean => {
    if (!queenMovedWithThis) { triggerSpecialsChain(boardAfterPrimaryMove, oldStreak, newStreak, isExtraTurnFromOriginalMove, newEnPassantTarget, playerWhoseQueenLeveled, []); return false; }
    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenOnSquare = boardAfterPrimaryMove[toR]?.[toC]?.piece;
    if (!queenOnSquare || queenOnSquare.type !== 'queen' || queenOnSquare.color !== playerWhoseQueenLeveled || originalPieceTypeIfKnown !== 'queen') {
        triggerSpecialsChain(boardAfterPrimaryMove, oldStreak, newStreak, isExtraTurnFromOriginalMove, newEnPassantTarget, playerWhoseQueenLeveled, []);
        return false;
    }
    const currentQueenLevel = Number(queenOnSquare.level || 1);
    const previousLevelOfThisPiece = Number(originalPieceLevelIfKnown || 0);
    if (currentQueenLevel === 7 && previousLevelOfThisPiece < 7) {
      let hasPawnsToSacrifice = false;
      for (const row of boardAfterPrimaryMove) {
        for (const square of row) {
          if (square.piece && (square.piece.type === 'pawn' || square.piece.type === 'commander') && square.piece.color === playerWhoseQueenLeveled) {
            hasPawnsToSacrifice = true; break;
          }
        }
        if (hasPawnsToSacrifice) break;
      }
      if (hasPawnsToSacrifice) {
        setIsAwaitingPawnSacrifice(true);
        setPlayerToSacrificePawn(playerWhoseQueenLeveled);
        setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))));
        setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
        setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
        setEnPassantTargetSquare(newEnPassantTarget);
        setAnvilDropContext({ boardForNextStep: boardAfterPrimaryMove, playerWhoseTurnCompleted: playerWhoseQueenLeveled, isExtraTurn: isExtraTurnFromOriginalMove, newEnPassantTarget: newEnPassantTarget, oldStreak, newStreak, completedMilestones: [] }); 
        setKillStreaks(prev => {
            const next = {...prev};
            next[playerWhoseQueenLeveled] = newStreak;
            return next;
        });
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select Pawn/Commander to sacrifice for L7 Queen!` }));
        return true;
      }
    }
    triggerSpecialsChain(boardAfterPrimaryMove, oldStreak, newStreak, isExtraTurnFromOriginalMove, newEnPassantTarget, playerWhoseQueenLeveled, []);
    return false;
  }, [triggerSpecialsChain, getPlayerDisplayName]);

  const performAiMove = useCallback(async () => {
    let enPassantTargetForNextTurn: AlgebraicSquare | null = null;
    let levelFromAIApplyMove: number | undefined;
    let typeFromAIApplyMove: PieceType | undefined;
    const currentAiInstance = aiInstanceRef.current;
    if (!currentAiInstance) {
      toast({ title: "AI Error", description: "AI engine is not territory. Please wait or reset the game.", variant: "destructive", duration: 8000 });
      setIsAiThinking(false);
      if(currentPlayer === 'white') setIsWhiteAI(false); else setIsBlackAI(false);
      return;
    }
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAnySpecialModeActive) {
      setIsAiThinking(false); return;
    }
    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    try {
      let aiMoveDataFromVibeAI: AIMoveType | null = null;
      let attemptCount = 0;
      const MAX_AI_ATTEMPTS = 3;
      let pieceOnFromSquareForAI: Piece | null = null;
      let isAiMoveActuallyLegal = false;
      let aiFromAlg: AlgebraicSquare | null = null;
      let aiToAlg: AlgebraicSquare | null = null;
      let moveForApplyMoveAI: Move | null = null;
      let finalBoardStateForAI = board.map(r_fbs => r_fbs.map(s_fbs => ({ ...s_fbs, piece: s_fbs.piece ? { ...s_fbs.piece } : null, item: s_fbs.item ? {...s_fbs.item} : null })));
      let finalCapturedPiecesForAI = {
        white: capturedPieces.white.map(p_cap => ({ ...p_cap })),
        black: capturedPieces.black.map(p_cap => ({ ...p_cap }))
      };
      while (attemptCount < MAX_AI_ATTEMPTS && !isAiMoveActuallyLegal) {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 50 * attemptCount)); 
        const gameStateForAI = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, shroomSpawnCounter, nextShroomSpawnTurn);
        const aiResult = currentAiInstance.getBestMove(gameStateForAI, currentPlayer);
        aiMoveDataFromVibeAI = aiResult?.move;
        if (!aiMoveDataFromVibeAI || !aiMoveDataFromVibeAI.from || !aiMoveDataFromVibeAI.to || !Array.isArray(aiMoveDataFromVibeAI.from) || aiMoveDataFromVibeAI.from.length !== 2 || !Array.isArray(aiMoveDataFromVibeAI.to) || aiMoveDataFromVibeAI.to.length !== 2) continue; 
        aiFromAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.from[0], aiMoveDataFromVibeAI.from[1]);
        aiToAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.to[0], aiMoveDataFromVibeAI.to[1]);
        const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromVibeAI.from[0]]?.[aiMoveDataFromVibeAI.from[1]];
        pieceOnFromSquareForAI = pieceDataAtFromAI?.piece || null;
        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) continue; 
        const definitiveLegalMovesForPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg as AlgebraicSquare, enPassantTargetSquare);
        isAiMoveActuallyLegal = definitiveLegalMovesForPiece.includes(aiToAlg as AlgebraicSquare);
        if (!isAiMoveActuallyLegal && aiMoveDataFromVibeAI.type === 'self-destruct' && aiFromAlg === aiToAlg) {
            const tempStateAfterSelfDestruct = finalBoardStateForAI.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
            tempStateAfterSelfDestruct[aiMoveDataFromVibeAI.from[0]][aiMoveDataFromVibeAI.from[1]].piece = null;
            if (!isKingInCheck(tempStateAfterSelfDestruct, currentPlayer, enPassantTargetSquare)) isAiMoveActuallyLegal = true;
        }
      }
      if (!isAiMoveActuallyLegal) { 
        let foundFallbackMove = false;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const fbSquareState = finalBoardStateForAI[r]?.[c];
            if (fbSquareState?.piece?.color === currentPlayer && !(fbSquareState.piece.cooldownTurnsRemaining && fbSquareState.piece.cooldownTurnsRemaining > 0) && !(fbSquareState.piece.frozenTurnsRemaining && fbSquareState.piece.frozenTurnsRemaining > 0)) {
              const fromAlg = coordsToAlgebraic(r, c);
              const legalMoves = getPossibleMoves(finalBoardStateForAI, fromAlg, enPassantTargetSquare);
              if (legalMoves.length > 0) {
                const chosenDefinitiveMoveAlg = legalMoves[0];
                const newToCoords = algebraicToCoords(chosenDefinitiveMoveAlg);
                let overrideMoveType: AIMoveType['type'] = 'move';
                const targetSquareForOverride = finalBoardStateForAI[newToCoords.row]?.[newToCoords.col];
                if (targetSquareForOverride?.piece) overrideMoveType = targetSquareForOverride.piece.color === currentPlayer ? 'swap' : 'capture';
                let promoteToOverrideType: PieceType | undefined = undefined;
                if ((fbSquareState.piece!.type === 'pawn' || fbSquareState.piece!.type === 'commander') && newToCoords.row === (currentPlayer === 'white' ? 0 : 7)) {
                    overrideMoveType = (fbSquareState.piece!.type === 'commander') ? 'move' : 'promotion';
                    promoteToOverrideType = fbSquareState.piece!.type === 'commander' ? 'hero' : 'queen';
                }
                aiFromAlg = fromAlg; aiToAlg = chosenDefinitiveMoveAlg;
                aiMoveDataFromVibeAI = { from: [r,c], to: [newToCoords.row, newToCoords.col], type: overrideMoveType, promoteTo: promoteToOverrideType };
                isAiMoveActuallyLegal = true; foundFallbackMove = true; break; 
              }
            }
          }
          if (foundFallbackMove) break; 
        }
        if (!foundFallbackMove) aiErrorOccurredRef.current = true;
      }
      if (!aiErrorOccurredRef.current && aiMoveDataFromVibeAI && aiFromAlg && aiToAlg) {
        const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
        const { row: aiFromR, col: aiFromC } = algebraicToCoords(aiFromAlg as AlgebraicSquare);
        saveStateToHistory();
        let aiMoveType = (aiMoveDataFromVibeAI.type || 'move') as Move['type'];
        let aiPromoteTo = aiMoveDataFromVibeAI.promoteTo as PieceType | undefined;
        setLastMoveFrom(aiFromAlg as AlgebraicSquare);
        setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
        setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(aiToAlg as AlgebraicSquare);
        const isStandardStartingSquareAI = (currentPlayer === 'white' && aiFromAlg === 'e1') || (currentPlayer === 'black' && aiFromAlg === 'e8');
        const isStandardTargetSquareAI = (currentPlayer === 'white' && (aiToAlg === 'c1' || aiToAlg === 'g1')) || (currentPlayer === 'black' && (aiToAlg === 'c8' || aiToAlg === 'g8'));
        if (pieceOnFromSquareForAI?.type === 'king' && !pieceOnFromSquareForAI.hasMoved && isStandardStartingSquareAI && isStandardTargetSquareAI && aiFromR === aiToR && aiMoveType !== 'self-destruct' && !finalBoardStateForAI[aiToR][aiToC].piece) aiMoveType = 'castle';
        moveForApplyMoveAI = { from: aiFromAlg as AlgebraicSquare, to: aiToAlg as AlgebraicSquare, type: aiMoveType as Move['type'], promoteTo: aiPromoteTo };
        if (moveForApplyMoveAI.type === 'self-destruct') {
          const { row: cR, col: cC } = algebraicToCoords(aiFromAlg as AlgebraicSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          audioManager.playExplosion();
        }
        const applyMoveResult = applyMove(finalBoardStateForAI, moveForApplyMoveAI, enPassantTargetSquare, capturedPieces);
        const { newBoard, capturedPiece, selfDestructCaptures, destroyedAnvils, reflectionOccurred, ...rest } = applyMoveResult;
        if (capturedPiece || (selfDestructCaptures && selfDestructCaptures.length > 0)) {
           const pieceThatMadeTheMoveAI = newBoard[aiToR]?.[aiToC]?.piece;
           if (pieceThatMadeTheMoveAI && pieceThatMadeTheMoveAI.type === 'infiltrator') audioManager.playObliterate(); else audioManager.playCapture();
        } else if (moveForApplyMoveAI.type === 'castle' || moveForApplyMoveAI.type === 'swap') audioManager.playMove(); else if (moveForApplyMoveAI.type !== 'self-destruct') audioManager.playMove();
        finalBoardStateForAI = newBoard;
        enPassantTargetForNextTurn = rest.enPassantTargetSet;
        levelFromAIApplyMove = rest.originalPieceLevel;
        typeFromAIApplyMove = rest.originalPieceType;
        if (reflectionOccurred) {
            const defenderColor = currentPlayer === 'white' ? 'black' : 'white';
            const victim = capturedPiece!;
            finalCapturedPiecesForAI[defenderColor].push({ ...victim, id: `${victim.id}_refl_ai_${Date.now()}` });
            audioManager.playCapture();
            toast({ title: "REFLECTED!", description: `Your Mirror Shield reflected the AI's attack!` });
            setKillStreaks(prev => ({ ...prev, [defenderColor]: (prev[defenderColor] || 0) + 1, [currentPlayer]: 0 }));
            setBoard(finalBoardStateForAI); setCapturedPieces(finalCapturedPiecesForAI);
            setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(finalBoardStateForAI, currentPlayer, false, null); }, 800);
            return;
        }
        if (selfDestructCaptures && selfDestructCaptures.length > 0) finalCapturedPiecesForAI[currentPlayer].push(...selfDestructCaptures);
        if (rest.rallyCryTriggered) { addEffect('shockwave', rest.rallyCryTriggered.square, rest.rallyCryTriggered.color); audioManager.playRally(); }
        if (rest.infiltrationWin) {
            setBoard(finalBoardStateForAI); setCapturedPieces(finalCapturedPiecesForAI);
            toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, duration: 8000 });
            setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
            setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); return;
        }
        if (rest.shroomConsumed) {
            const movedPieceDataAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
                if(movedPieceDataAI) { audioManager.playShroom(); audioManager.playLevelUp(); toast({ title: "AI Level Up!", description: `AI's ${movedPieceDataAI.type} consumed a Shroom 🍄 and leveled up to L${movedPieceDataAI.level}!`, duration: 8000 }); }
        }
        if (rest.queenLevelReducedEvents && rest.queenLevelReducedEvents.length > 0) {
            rest.queenLevelReducedEvents.forEach(event => {
                const queenOwnerName = getPlayerDisplayName(event.reducedByKingOfColor === 'white' ? 'black' : 'white');
                toast({ title: "King's Dominion!", description: `${getPlayerDisplayName(event.reducedByKingOfColor)} (AI) King leveled up! ${queenOwnerName}'s Queen (ID: ...${event.queenId.slice(-4)}) level reduced by ${event.reductionAmount} from L${event.originalLevel} to L${event.newLevel}.`, duration: 8000 });
            });
        }
        if (rest.pieceCapturedByAnvil) {
            if (pieceOnFromSquareForAI?.type !== 'infiltrator') finalCapturedPiecesForAI[currentPlayer].push({ ...rest.pieceCapturedByAnvil, id: `${rest.pieceCapturedByAnvil.id}_cap_anvil_ai_${Date.now()}` });
            audioManager.playObliterate();
            toast({ title: "AI Anvil Crush!", description: `AI's Pawn push made an Anvil capture a ${rest.pieceCapturedByAnvil.type}!`, duration: 8000 });
        }
        if (rest.selfCheckByPushBack) {
            const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`, variant: "destructive", duration: 8000 });
            setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`, isCheck: true, playerWithKingInCheck: currentPlayer, isCheckmate: true, isStalemate: false, gameOver: true, winner: opponentPlayer }));
            setBoard(finalBoardStateForAI); setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); setSelectedSquare(null); setPossibleMoves([]); setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
            return;
          }
          if (capturedPiece) { 
            const pieceThatMadeTheMoveAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            if (pieceThatMadeTheMoveAI?.type !== 'infiltrator') { audioManager.playLevelUp(); finalCapturedPiecesForAI[currentPlayer].push({ ...capturedPiece, id: `${capturedPiece.id}_cap_ai_${Date.now()}` }); }
          }
          if (rest.conversionEvents && rest.conversionEvents.length > 0) {
            rest.conversionEvents.forEach(event => {
                addEffect('conversion', event.at, event.byPiece.color);
                if (event.originalPiece.color !== event.convertedPiece.color) { audioManager.playConversion(); toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 }); }
            });
          }
        if(!aiErrorOccurredRef.current) {
            let capturesThisTurnAI = (capturedPiece ? 1 : 0) + (rest.pieceCapturedByAnvil ? 1 : 0) + (selfDestructCaptures?.length || 0);
            const oldStreakForAI = killStreaks[currentPlayer] || 0;
            const newStreakForAI = capturesThisTurnAI > 0 ? (oldStreakForAI + capturesThisTurnAI) : 0;
            if (capturesThisTurnAI > 0) { setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreakForAI })); setShowCaptureFlash(true); setCaptureFlashKey(k => k + 1); }
            else if (aiMoveType !== 'swap') setKillStreaks(prev => ({...prev, [currentPlayer]: 0}));
            const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            if (aiMovedPieceOnToSquare && (['rook', 'palace'].includes(aiMovedPieceOnToSquare.type)) && aiMoveType !== 'self-destruct' && capturesThisTurnAI > 0) {
              const oldLevelForAIResCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevel;
              const aiRookResData = processRookResurrectionCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, aiToAlg as AlgebraicSquare, oldLevelForAIResCheck, finalCapturedPiecesForAI, uniqueIdCounterRef.current);
              if (aiRookResData.resurrectionPerformed) {
                  finalBoardStateForAI = aiRookResData.boardWithResurrection; finalCapturedPiecesForAI = aiRookResData.capturedPiecesAfterResurrection; uniqueIdCounterRef.current = aiRookResData.newResurrectionIdCounter!;
                  addEffect('light-beam', aiRookResData!.resurrectedSquareAlg!); audioManager.playResurrect(); setResurrectedSquares(prev => [...prev, { square: aiRookResData!.resurrectedSquareAlg!, player: currentPlayer }]);
                  if (aiRookResData.promotionRequiredForResurrectedPawn) {
                        const { row: pr_ai, col: pc_ai } = algebraicToCoords(aiRookResData.resurrectedSquareAlg!);
                        if (finalBoardStateForAI[pr_ai][pc_ai].piece) { finalBoardStateForAI[pr_ai][pc_ai].piece!.type = 'queen'; finalBoardStateForAI[pr_ai][pc_ai].piece!.level = 1; }
                  }
              }
            }
            setBoard(finalBoardStateForAI); setCapturedPieces(finalCapturedPiecesForAI);
            setTimeout(() => {
              const pieceAtDestinationAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
              const rankCheckRowAI = currentPlayer === 'white' ? 0 : 7;
              const isAIPawnPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'pawn' && aiToR === rankCheckRowAI && aiMoveType !== 'self-destruct';
              let extraTurnForThisAIMove = rest.extraTurn || (oldStreakForAI < 6 && newStreakForAI >= 6);
              if (isAIPawnPromoting) {
                  const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen'; 
                  pieceAtDestinationAI!.type = promotedTypeAI; pieceAtDestinationAI!.level = getPromotionLevel(capturedPiece?.type || rest.pieceCapturedByAnvil?.type || null);
                  if (pieceAtDestinationAI!.type === 'queen') pieceAtDestinationAI!.level = Math.min(pieceAtDestinationAI!.level, 7);
                  audioManager.playLevelUp();
              } 
              processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, levelFromAIApplyMove, typeFromAIApplyMove, extraTurnForThisAIMove, enPassantTargetForNextTurn, oldStreakForAI, newStreakForAI);
              setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false);
            }, 800);
        }
      }
    } catch (error) { aiErrorOccurredRef.current = true; }
    if (aiErrorOccurredRef.current) {
      const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
      setGameInfo(prev => ({ ...prev, message: `AI Forfeits. ${getPlayerDisplayName(opponentPlayer!)} wins!`, gameOver: true, winner: opponentPlayer }));
      setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); return;
    }
  }, [board, killStreaks, capturedPieces, enPassantTargetSquare, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, getPlayerDisplayName, processPawnSacrificeCheck, saveStateToHistory, toast, gameMoveCounter, addEffect, triggerSpecialsChain]);

  useEffect(() => {
    if (currentPlayer === 'white' && isWhiteAI && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) {
      const timer = setTimeout(performAiMove, 500);
      return () => clearTimeout(timer);
    }
    if (currentPlayer === 'black' && isBlackAI && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) {
      const timer = setTimeout(performAiMove, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, performAiMove]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;
    setPieceForInfoDisplay(clickedPiece || null);

    const isLocalActionTurn = !localPlayerColor || localPlayerColor === currentPlayer;
    if (isAnySpecialModeActive && !isLocalActionTurn) return;

    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (clickedPiece && !clickedPiece.heldItem && clickedPiece.color === (localPlayerColor || 'white')) {
          if (usedSlots >= attunementSlots) { toast({ title: "Attunement Limit", variant: "destructive" }); return; }
          const pType = clickedPiece.type;
          if (selectedInventoryItemType === 'swift_cloak' && pType !== 'pawn' && pType !== 'commander') return;
          if (selectedInventoryItemType === 'queens_peace' && pType !== 'queen') return;
          if ((selectedInventoryItemType === 'gnosis' || selectedInventoryItemType === 'mirror_shield' || selectedInventoryItemType === 'berserkers_mask') && (pType === 'king' || pType === 'queen')) return;
          if (selectedInventoryItemType === 'crossbow' && pType !== 'archer') return;
          if (selectedInventoryItemType === 'detonation_scroll' && pType === 'king') return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveLoadoutToFirestore(nextBoard, newInv); setSelectedInventoryItemType(null); audioManager.playLevelUp();
        } else if (clickedPiece && clickedPiece.heldItem && clickedPiece.color === (localPlayerColor || 'white')) {
          const oldItem = clickedPiece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          const nextInv = [...inventory]; const itemIn = nextInv.find(i => i.type === selectedInventoryItemType);
          if (itemIn) { itemIn.count--; if (itemIn.count <= 0) nextInv.splice(nextInv.indexOf(itemIn), 1); }
          const itemOut = nextInv.find(i => i.type === oldItem); if (itemOut) itemOut.count++; else nextInv.push({ type: oldItem, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); setSelectedInventoryItemType(null); audioManager.playLevelUp();
        }
      } else if (clickedPiece && clickedPiece.heldItem && clickedPiece.color === (localPlayerColor || 'white')) {
          const removedItem = clickedPiece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removedItem); if (item) item.count++; else nextInv.push({ type: removedItem, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); audioManager.playMove();
      }
      return;
    }

    if (isAwaitingPawnSacrifice && isLocalActionTurn) {
      if (clickedPiece && (clickedPiece.type === 'pawn' || clickedPiece.type === 'commander') && clickedPiece.color === currentPlayer) {
        saveStateToHistory(); let boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
        const pawnToSacrifice = { ...boardAfterSacrifice[row][col].piece!, id: `${boardAfterSacrifice[row][col].piece!.id}_sac_${uniqueIdCounterRef.current++}`};
        boardAfterSacrifice[row][col].piece = null; setBoard(boardAfterSacrifice); audioManager.playCapture();
        const opponentOfSacrificer = playerWhoMadeQueenMove! === 'white' ? 'black' : 'white';
        setCapturedPieces(prev => { const next = { ...prev }; next[opponentOfSacrificer] = [...(next[opponentOfSacrificer] || []), pawnToSacrifice]; return next; });
        if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'pawn-sacrifice', square: algebraic }));
        setIsAwaitingPawnSacrifice(false); setPlayerToSacrificePawn(null); setBoardForPostSacrifice(null); setPlayerWhoMadeQueenMove(null);
        triggerSpecialsChain(boardAfterSacrifice, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, isExtraTurnFromQueenMove, anvilDropContext?.newEnPassantTarget || null, actingPlayer, anvilDropContext?.completedMilestones || []);
      }
      return;
    }

    if (isAwaitingAnvilDrop && isLocalActionTurn) {
        if (!clickedSquareState?.piece && !clickedSquareState?.item) {
            if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'anvil-drop', square: algebraic })); clickGuardRef.current = true; setIsMoveProcessing(true); return; }
            saveStateToHistory(); const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = anvilDropContext!;
            const boardAfterAnvilDrop = boardForNextStep.map(r => r.map(s => ({ ...s }))); boardAfterAnvilDrop[row][col].item = { type: 'anvil' };
            setBoard(boardAfterAnvilDrop); audioManager.playAnvil(); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setAnvilDropContext(null);
            triggerSpecialsChain(boardAfterAnvilDrop, oldStreak, newStreak, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'anvil']);
        }
        return;
    }

    if (isAwaitingHolyShield && isLocalActionTurn) {
      if (clickedPiece && clickedPiece.color === currentPlayer && clickedPiece.type !== 'king' && clickedPiece.type !== 'queen' && clickedPiece.id !== shieldContext?.capturingPieceId) {
          saveStateToHistory(); if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'holy-shield', square: algebraic })); clickGuardRef.current = true; setIsMoveProcessing(true); return; }
          const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = shieldContext!;
          const boardAfterShield = boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece, isShielded: s.piece.id === clickedPiece.id ? true : s.piece.isShielded } : null })));
          setBoard(boardAfterShield); audioManager.playShield(); setIsAwaitingHolyShield(false); setShieldContext(null);
          triggerSpecialsChain(boardAfterShield, oldStreak!, newStreak!, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'shield']);
      }
      return;
    }

    if (isAwaitingArcherSnipe && isLocalActionTurn) {
      if (clickedPiece && clickedPiece.color !== currentPlayer && clickedPiece.level === 1 && clickedPiece.type !== 'king' && clickedPiece.type !== 'queen') {
          saveStateToHistory(); if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'archer-snipe', square: algebraic })); clickGuardRef.current = true; setIsMoveProcessing(true); return; }
          const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = archerSnipeContext!;
          const boardAfterSnipe = boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
          const uniqueCapturedPiece = { ...clickedPiece, id: `${clickedPiece.id}_sniped_${uniqueIdCounterRef.current++}` };
          setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), uniqueCapturedPiece] }));
          boardAfterSnipe[row][col].piece = null; setBoard(boardAfterSnipe); addEffect('poof', algebraic); audioManager.playSnipe();
          setIsAwaitingArcherSnipe(false); setArcherSnipeContext(null);
          triggerSpecialsChain(boardAfterSnipe, oldStreak!, 99, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'snipe']);
      }
      return;
    }

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) {
        if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer && clickedPiece.level === 1) {
            saveStateToHistory(); if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'commander-promo', square: algebraic })); clickGuardRef.current = true; setIsAwaitingCommanderPromotion(false); setPlayerWhoGotFirstBlood(null); return; }
            const boardAfterCmdr = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            boardAfterCmdr[row][col].piece!.type = 'commander'; boardAfterCmdr[row][col].piece!.id = `${boardAfterCmdr[row][col].piece!.id}_CMD_${uniqueIdCounterRef.current++}`;
            setBoard(boardAfterCmdr); audioManager.playLevelUp(); setIsAwaitingCommanderPromotion(false);
            triggerSpecialsChain(boardAfterCmdr, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, anvilDropContext?.isExtraTurn || false, anvilDropContext?.newEnPassantTarget || null, actingPlayer, anvilDropContext?.completedMilestones || []);
        }
        return;
    }

    if (selectedSquare) {
      const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
      const pieceToMove = board[fR][fC].piece; if (!pieceToMove) return;
      const freshlyCalculatedMoves = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      if (freshlyCalculatedMoves.includes(algebraic)) {
        saveStateToHistory(); clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
        if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'move' } })); return; }
        const originalL = pieceToMove.level || 1; const originalT = pieceToMove.type;
        const result = applyMove(board, { from: selectedSquare, to: algebraic, type: board[row][col].piece ? (board[row][col].piece!.color === pieceToMove.color ? 'swap' : 'capture') : (algebraic === enPassantTargetSquare ? 'enpassant' : 'move') }, enPassantTargetSquare, capturedPieces);
        let nextBoard = result.newBoard; let nextEp = result.enPassantTargetSet;
        if (result.reflectionOccurred) {
            const victim = result.capturedPiece!; setCapturedPieces(prev => ({ ...prev, [currentPlayer === 'white' ? 'black' : 'white']: [...(prev[currentPlayer === 'white' ? 'black' : 'white'] || []), { ...victim, id: `${victim.id}_refl_${Date.now()}` }] }));
            audioManager.playCapture(); setKillStreaks(prev => ({ ...prev, [currentPlayer === 'white' ? 'black' : 'white']: (prev[currentPlayer === 'white' ? 'black' : 'white'] || 0) + 1, [currentPlayer]: 0 }));
            setBoard(nextBoard); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextBoard, currentPlayer, false, null); }, 800);
            return;
        }
        if (result.infiltrationWin) { setBoard(nextBoard); setGameInfo(prev => ({ ...prev, gameOver: true, isInfiltrationWin: true, winner: currentPlayer })); return; }
        const oldStreak = killStreaks[currentPlayer] || 0; let caps = (result.capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
        const newStreak = caps > 0 ? (oldStreak + caps) : 0; setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreak }));
        if (result.capturedPiece) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...result.capturedPiece!, id: `${result.capturedPiece!.id}_cap_${uniqueIdCounterRef.current++}` }] }));
        if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...result.pieceCapturedByAnvil!, id: `${result.pieceCapturedByAnvil!.id}_anvil_${uniqueIdCounterRef.current++}` }] }));
        setBoard(nextBoard);
        setTimeout(() => {
          setIsMoveProcessing(false); clickGuardRef.current = false;
          const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
          const pieceAtDest = nextBoard[row][col].piece;
          if (pieceAtDest?.type === 'queen' && !processPawnSacrificeCheck(nextBoard, currentPlayer, {from: selectedSquare, to: algebraic, type: 'move'}, originalL, originalT, isExtra, nextEp, oldStreak, newStreak)) {
            if (pieceAtDest.type === 'pawn' && (row === 0 || row === 7)) { setPlayerToPromote(currentPlayer); setPromotionTargetLevel(getPromotionLevel(result.capturedPiece?.type || null)); setIsPromotingPawn(true); setPromotionSquare(algebraic); setAnvilDropContext({ boardForNextStep: nextBoard, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [] }); }
            else triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, []);
          }
        }, 800);
        return;
      }
    }
    if (clickedPiece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare)); }
    else { setSelectedSquare(null); setPossibleMoves([]); setEnemySelectedSquare(clickedPiece ? algebraic : null); setEnemyPossibleMoves(clickedPiece ? getPossibleMoves(board, algebraic, enPassantTargetSquare) : []); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, triggerSpecialsChain, processPawnSacrificeCheck, toast, localPlayerColor, usedSlots, attunementSlots, inventory, selectedInventoryItemType, saveLoadoutToFirestore, saveStateToHistory, addEffect, isInventoryOpen, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, isAwaitingAnvilDrop, playerToDropAnvil, anvilDropContext, isAwaitingHolyShield, shieldContext, isAwaitingArcherSnipe, archerSnipeContext, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isPromotingPawn, promotionSquare, promotionTargetLevel, onlineStatus, isMoveProcessing, isAiThinking, gameInfo.gameOver, isAnySpecialModeActive]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: 'finalize-promotion', payload: { square: promotionSquare, promoteTo: pieceType } })); setIsPromotingPawn(false); return; }
    let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = boardToUpdate[row][col].piece;
    if (!pieceBeingPromoted) return;
    boardToUpdate[row][col].piece = { ...pieceBeingPromoted, type: pieceType, level: promotionTargetLevel, id: `${pieceBeingPromoted.id}_promo_${pieceType}`, hasMoved: true, isShielded: false };
    if (pieceType === 'queen') boardToUpdate[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    setBoard(boardToUpdate); setIsPromotingPawn(false); setPromotionSquare(null); audioManager.playLevelUp();
    triggerSpecialsChain(boardToUpdate, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, (boardToUpdate[row][col].piece!.level >= 5) || (anvilDropContext?.isExtraTurn || false), anvilDropContext?.newEnPassantTarget || null, actingPlayer, anvilDropContext?.completedMilestones || []);
  }, [board, promotionSquare, promotionTargetLevel, anvilDropContext, triggerSpecialsChain, onlineStatus]);

  const handlePieceHover = useCallback((piece: Piece | null) => {
    setPieceForInfoDisplay(piece);
  }, []);

  const handleVolumeChange = useCallback((val: number[]) => {
    const v = val[0];
    setVolume(v);
    audioManager.setVolume(v);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (onlineStatus === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
            type: 'chat-message',
            sender: userData?.username || user?.displayName || 'Hero',
            text,
            color: localPlayerColor
        }));
    }
  }, [onlineStatus, user, userData, localPlayerColor]);

  useEffect(() => {
    if (!board || !prevBoardRef.current) {
        prevBoardRef.current = board;
        return;
    }

    const prevPieceLevels = new Map<string, number>();
    prevBoardRef.current.forEach(row => row.forEach(sq => {
      if (sq.piece) prevPieceLevels.set(sq.piece.id, sq.piece.level);
    }));

    const currentPieceIds = new Set<string>();
    board.forEach(row => row.forEach(currSq => { if (currSq.piece) currentPieceIds.add(currSq.piece.id); }));

    const newEffectsToAdd: {type: Effect['type'], square: AlgebraicSquare, val?: number}[] = [];
    const moveKey = `move-${gameMoveCounter}`;

    board.forEach(row => row.forEach(currSq => {
      if (currSq.piece) {
        const prevLevel = prevPieceLevels.get(currSq.piece.id);
        if (prevLevel !== undefined) {
          const diff = currSq.piece.level - prevLevel;
          if (diff !== 0) {
            const levelSig = `level-${currSq.piece.id}-${currSq.piece.level}-${moveKey}`;
            if (!signaledEventsRef.current.has(levelSig)) {
              newEffectsToAdd.push({ type: 'level-change', square: currSq.algebraic, val: diff });
              signaledEventsRef.current.add(levelSig);
            }
          }
        }
      }
    }));

    prevBoardRef.current.forEach(row => row.forEach(prevSq => {
      if (prevSq.piece && !currentPieceIds.has(prevSq.piece.id)) {
        const captureSig = `capture-${prevSq.piece.id}-${moveKey}`;
        if (!signaledEventsRef.current.has(captureSig)) {
          newEffectsToAdd.push({ type: 'poof', square: prevSq.algebraic });
          signaledEventsRef.current.add(captureSig);
        }
      }
    }));

    if (newEffectsToAdd.length > 0) {
        newEffectsToAdd.forEach(e => addEffect(e.type, e.square, undefined, e.val));
    }
    prevBoardRef.current = board;
  }, [board, gameMoveCounter, lastMoveFrom, lastMoveTo, addEffect]);

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-1 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-1 pb-4">
          <div className="w-full flex items-center justify-between">
              <div className="w-1/3"></div>
              <div className="w-1/3 flex items-center justify-center">
                  <img src="/images/Vibe_Title.gif" alt="VIBE CHESS" className="h-10 w-auto object-contain" />
              </div>
               <div className="w-1/3 flex justify-end">
                  <AuthWidget />
              </div>
          </div>
          <div className={cn("text-center text-sm font-bold min-h-[1.25em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse", (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse"))}>
             {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
           </div>
          <div className="w-full">
            <ChessBoard
              boardState={board}
              selectedSquare={isAnySpecialModeActive ? null : selectedSquare}
              possibleMoves={isAnySpecialModeActive ? [] : possibleMoves}
              enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare}
              enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves}
              onSquareClick={handleSquareClick}
              playerColor={boardOrientation}
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor) || isAiThinking}
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
              onPieceHover={handlePieceHover}
              effects={effects}
              promotingSquare={promotionSquare}
              isAwaitingAnvilDrop={isAwaitingAnvilDrop}
              playerToDropAnvil={playerToDropAnvil}
              isAwaitingHolyShield={isAwaitingHolyShield}
              isAwaitingArcherSnipe={isAwaitingArcherSnipe}
              isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget}
              isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget}
              isInventoryOpen={isInventoryOpen}
              selectedInventoryItemType={selectedInventoryItemType}
              localPlayerColor={localPlayerColor}
            />
          </div>
           <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={playerToDropAnvil === 'white' ? 'white' : activeTimerPlayer} chatMessages={chatMessages} onSendMessage={sendMessage} isMessengerOpen={isMessengerOpen} onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)} hasUnreadMessages={hasUnreadMessages} />
          <div className="flex flex-wrap justify-center items-center gap-1 mt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                  {onlineStatus === 'connected' ? <Flag /> : <RefreshCw />} {onlineStatus === 'connected' ? 'Resign' : 'Reset'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>{onlineStatus === 'connected' ? "This will end the current online game and you will forfeit." : "This action will reset the game board to the starting position."}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={resetGame}>{onlineStatus === 'connected' ? 'Yes, Resign' : 'Yes, Reset'}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-7 px-2 text-xs"><BookOpen /> Rules</Button>
            <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user} className="h-7 px-2 text-xs"><Package /> Items</Button>
            <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-xs"><Settings /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={handleVolumeChange} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /><p className="text-[9px] text-muted-foreground italic leading-tight text-center">The smarter the AI setting, the longer the AI takes to move.</p></div></div></PopoverContent></Popover>
            <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected' || !user}><Swords /> Dungeon</Button></Link>
            <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected'}><Trophy /> L.board</Button></Link>
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAnySpecialModeActive} className="h-7 px-2 text-xs"><Undo2 /> Undo</Button>
          </div>
           <div className="flex flex-wrap justify-center items-center gap-1"><Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> W:{isWhiteAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> B:{isBlackAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} className="h-7 px-2 text-xs"><View /> View</Button></div>
           <Card className="w-full mt-2"><CardContent className="p-2 flex flex-col gap-2"><div className="flex flex-col gap-1 items-center" ><Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || onlineStatus !== 'disconnected'} className="h-7 px-2 text-xs w-full"><Trophy className="mr-1 h-3 w-3" />Ranked Match</Button><Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)} className="h-7 px-2 text-xs w-full">{onlineStatus !== 'disconnected' ? <Link2Off className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}{onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}</Button><div className="flex gap-1 items-center w-full"><Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-xs flex-grow" disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI} /><Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI} className="h-7 px-2 text-xs">Join</Button></div></div><div className="w-full text-center h-4 text-xs mt-1">{onlineStatus}</div></CardContent></Card>
      </div>
    </div>
  );

  const desktopLayout = (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0"><GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={playerToDropAnvil === 'white' ? 'white' : activeTimerPlayer} chatMessages={chatMessages} onSendMessage={sendMessage} isMessengerOpen={isMessengerOpen} onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)} hasUnreadMessages={hasUnreadMessages} /></div>
      <div className="w-1/2 flex flex-col items-center gap-2"><div className="w-full flex items-center justify-center"><img src="/images/Vibe_Title.gif" alt="VIBE CHESS" className="h-16 w-auto object-contain" /></div><div className={cn("text-center text-sm font-bold min-h-[1.25em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse", (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse"))}>{isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}</div><div className="w-full max-lg"><ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? null : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer} playerToPromoteCommander={playerWhoGotFirstBlood === currentPlayer ? currentPlayer : null} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} /></div></div>
      <div className="w-1/4 flex flex-col gap-4"><AuthWidget /><Card><CardContent className="p-2 flex flex-col gap-2"><div className="flex flex-wrap justify-center items-center gap-1"><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-xs">{onlineStatus === 'connected' ? <Flag /> : <RefreshCw />} {onlineStatus === 'connected' ? 'Resign' : 'Reset'}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>{onlineStatus === 'connected' ? "This will end the current online game and you will forfeit." : "This action will reset the game board to the starting position."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={resetGame}>{onlineStatus === 'connected' ? 'Yes, Resign' : 'Yes, Reset'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-7 px-2 text-xs"><BookOpen /> Rules</Button><Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user} className="h-7 px-2 text-xs"><Package /> Items</Button><Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-xs"><Settings /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={handleVolumeChange} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /><p className="text-[9px] text-muted-foreground italic leading-tight text-center">The smarter the AI setting, the longer the AI takes to move.</p></div></div></PopoverContent></Popover><Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected' || !user}><Swords /> Dungeon</Button></Link><Link href="/leaderboard"><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected'}><Trophy /> L.board</Button></Link><Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAnySpecialModeActive} className="h-7 px-2 text-xs"><Undo2 /> Undo</Button></div><div className="flex flex-wrap justify-center items-center gap-1"><Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> W:{isWhiteAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> B:{isBlackAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} className="h-7 px-2 text-xs"><View /> View</Button></div></CardContent></Card><Card><CardContent className="p-2 flex flex-col gap-2"><div className="flex flex-col gap-1 items-center" ><Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || onlineStatus !== 'disconnected'} className="h-7 px-2 text-xs w-full"><Trophy className="mr-1 h-3 w-3" />Ranked Match</Button><Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)} className="h-7 px-2 text-xs w-full">{onlineStatus !== 'disconnected' ? <Link2Off className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}{onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}</Button><div className="flex gap-1 items-center w-full"><Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-xs flex-grow" disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI} /><Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI} className="h-7 px-2 text-xs">Join</Button></div></div><div className="w-full text-center h-4 text-xs mt-1">{onlineStatus}</div></CardContent></Card></div>
    </div>
  );

  return (
    <div className={cn("min-h-full h-full w-full bg-background flex flex-col relative after:content-[''] after:fixed after:inset-0 after:bg-black after:opacity-0 after:-z-10 after:pointer-events-none", showLossScreen && "after:animate-fade-to-black")}>
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash pointer-events-none" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash pointer-events-none" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash pointer-events-none" />}
      {flashMessage && (<div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
      {killStreakFlashMessage && (<div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}
      {showTimerWarning && (<div key={`timer-warning-${timerWarningKey}`} className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"><div className="animate-flash-timer-warning"><p className="text-7xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>10</p></div></div>)}
      {showWinScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>YOU WON</p></div>)}
      {showLossScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>YOU LOST</p></div>)}
      <div className="lg:hidden h-full">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} attunementSlots={attunementSlots} usedSlots={usedSlots} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor={playerToPromote} />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={isRulesDialogOpen ? () => setIsRulesDialogOpen(false) : undefined} />
      <GameSummaryDialog isOpen={showSummary} onClose={() => setShowSummary(false)} winner={gameInfo.winner} winnerName={getPlayerDisplayName(gameInfo.winner as PlayerColor)} loserName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'black' : 'white')} eloInfo={eloResult} moveCount={gameMoveCounter} onReset={() => fullGameReset()} />
      <AlertDialog open={abilityChoiceDialog?.isOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Select Action</AlertDialogTitle><AlertDialogDescription>This piece has multiple special actions available. Choose one to perform.</AlertDialogDescription></AlertDialogHeader><div className="flex flex-col gap-2"><Button onClick={() => abilityChoiceDialog?.onChoice('ability')}>Use Piece Ability</Button><Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}>Use Magic Item (Scroll)</Button></div><AlertDialogFooter><AlertDialogCancel onClick={() => setAbilityChoiceDialog(null)}>Cancel</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );

  function resetGame() {
    if (onlineStatus === 'connected') {
        wsRef.current?.send(JSON.stringify({ type: 'resign', resigningPlayer: localPlayerColor }));
    } else {
        fullGameReset();
    }
  }

  function fullGameReset() {
    let initial = initializeBoard(userData?.eloRating || 1200, 1200);
    if (userData?.equipment) {
      initial = initial.map(row => row.map(sq => {
        if (sq.piece && userData.equipment![sq.piece.id]) {
          return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } };
        }
        return sq;
      }));
    }
    setBoard(initial);
    setCurrentPlayer('white');
    setGameInfo({ ...initialGameStatus });
    setCapturedPieces({ white: [], black: [] });
    setKillStreaks({ white: 0, black: 0 });
    setHistoryStack([]);
    setPositionHistory([]);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setLastMoveFrom(null);
    setLastMoveTo(null);
    setGameMoveCounter(0);
    setEnPassantTargetSquare(null);
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    setShowLossScreen(false);
    setShowWinScreen(false);
    setShowSummary(false);
    audioManager.playStart();
  }

  function handleUndo() {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setBoard(last.board);
    setCurrentPlayer(last.currentPlayer);
    setGameInfo(last.gameInfo);
    setCapturedPieces(last.capturedPieces);
    setKillStreaks(last.killStreaks);
    setBoardOrientation(last.boardOrientation);
    setViewMode(last.viewMode);
    setIsWhiteAI(last.isWhiteAI);
    setIsBlackAI(last.isBlackAI);
    setEnemySelectedSquare(last.enemySelectedSquare);
    setEnemyPossibleMoves(last.enemyPossibleMoves || []);
    setPositionHistory(last.positionHistory);
    setLastMoveFrom(last.lastMoveFrom);
    setLastMoveTo(last.lastMoveTo);
    setGameMoveCounter(last.gameMoveCounter);
    setEnPassantTargetSquare(last.enPassantTargetSquare);
    setShroomSpawnCounter(last.shroomSpawnCounter);
    setNextShroomSpawnTurn(last.nextShroomSpawnTurn);
    setHistoryStack(prev => prev.slice(0, -1));
  }

  function saveStateToHistory() {
    const snapshot: GameSnapshot = {
        board: board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))),
        currentPlayer, gameInfo, capturedPieces: { white: capturedPieces.white.map(p => ({ ...p })), black: capturedPieces.black.map(p => ({ ...p })) },
        killStreaks: { ...killStreaks }, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves,
        positionHistory: [...positionHistory], lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare,
        isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove,
        isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
        isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion,
        promotionSquare, promotionMoveWasCapture, originalPromotionLevel: promotionTargetLevel, promotionPawnOriginalLevel: null,
        firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion,
        shroomSpawnCounter, nextShroomSpawnTurn, resurrectedSquares, turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts,
        isAwaitingAnvilDrop, playerToDropAnvil, anvilDropContext, anvilDropAfterPromotion, isAwaitingHolyShield, shieldContext,
        isAwaitingArcherSnipe, archerSnipeContext, inventory: [...inventory]
    };
    setHistoryStack(prev => [...prev, snapshot]);
  }

  function handleToggleWhiteAI() { setIsWhiteAI(!isWhiteAI); }
  function handleToggleBlackAI() { setIsBlackAI(!isBlackAI); }
  function handleToggleViewMode() { setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping'); }

  function handleRankedPlay() {}
  function handleOnlinePlay(mode: 'create' | 'join') {}
  function getRankedButtonText() { return "Ranked Match"; }
  function getStatusMessage() { return onlineStatus; }

  function saveLoadoutToFirestore(b: BoardState, inv: InventoryItem[]) {
      if (!user || !firestore) return;
      const equipment: Record<string, string> = {};
      b.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
      const ref = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(ref, { inventory: inv, equipment });
  }
}
