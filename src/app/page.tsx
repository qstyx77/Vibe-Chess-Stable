
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
  spawnAnvil,
  spawnShroom,
  findKing,
  applyArchbishop,
  applyPalace,
  applyArcher,
  hasAnyLegalMoves,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, QueenLevelReducedEvent, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, ChatMessage, InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag, Trophy, MonitorPlay, Settings, Volume2, BrainCircuit, Swords, Package, Wand2 } from 'lucide-react';
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
  const [anvilDropContext, setAnvilDropContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null>(null);
  const [anvilDropAfterPromotion, setAnvilDropAfterPromotion] = useState(false);

  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [shieldContext, setShieldContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, capturingPieceId?: string } | null>(null);

  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [archerSnipeContext, setArcherSnipeContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null>(null);

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

  const [vcnLog, setVcnLog] = useState<string[]>([]);
  const [eloResult, setEloResult] = useState<any | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const [volume, setVolume] = useState(100);
  const [aiDifficulty, setAiDifficulty] = useState(4);

  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);

  // --- Inventory States ---
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([
    { type: 'mirror_shield', count: 1 },
    { type: 'swift_cloak', count: 1 },
    { type: 'passive_armor', count: 2 },
    { type: 'cardinal_greaves', count: 1 },
    { type: 'drift_boots', count: 1 },
    { type: 'queens_peace', count: 1 },
    { type: 'wind_sword', count: 1 },
    { type: 'middle_way', count: 1 },
    { type: 'phoenix_down', count: 1 },
    { type: 'wind_scroll', count: 1 },
    { type: 'life_leach', count: 1 },
    { type: 'summon_anvil', count: 1 },
    { type: 'wind_cloak', count: 1 }
  ]);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);

  const formattedNotation = useMemo(() => {
    return vcnLog.map((move, i) => {
      if (i % 2 === 0) return `${Math.floor(i / 2) + 1}. ${move}`;
      return move;
    }).join(' ');
  }, [vcnLog]);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

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

  const isLocalActionTurn = onlineStatus === 'disconnected' || localPlayerColor === currentPlayer;

  // Interaction Disabled Logic: includes inventory open and specialized selection modes
  const isInteractionDisabled = gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || (isAwaitingAnvilDrop && playerToDropAnvil === currentPlayer) || isAwaitingHolyShield || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget;
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn || isAwaitingCommanderPromotion || isAwaitingHolyShield || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget;
  const isOnlineGameInProgress = onlineStatus === 'connected' && !gameInfo.gameOver;
  const isAnyOnlineState = onlineStatus === 'connected' || onlineStatus === 'waiting';

  const getRankedButtonText = () => {
    if(rankedQueueStatus === 'searching') return 'Searching...';
    return 'Ranked';
  };

  const getStatusMessage = () => {
    if (rankedQueueStatus === 'searching') {
        return <p className="text-sm font-medium text-primary mt-1 animate-pulse">Searching for a ranked match...</p>;
    }
    if (onlineStatus === 'waiting' && roomId) {
      return (
        <p className="text-sm font-medium text-primary mt-1">
          Wait... Share Room ID: <span className="font-bold bg-muted p-1 rounded-md select-all">{roomId}</span>
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

  const getVCNChar = (type: PieceType) => {
    switch (type) {
      case 'commander': return 'C';
      case 'infiltrator': return 'I';
      case 'hero': return 'H';
      case 'archer': return 'AR';
      case 'archbishop': return 'AB';
      case 'palace': return 'PL';
      case 'knight': return 'N';
      case 'pawn': return '';
      default: return type.charAt(0).toUpperCase();
    }
  };

  useEffect(() => {
    isMessengerOpenRef.current = isMessengerOpen;
    if (isMessengerOpen) {
      setHasUnreadMessages(false);
    }
  }, [isMessengerOpen]);

  useEffect(() => { localPlayerColorRef.current = localPlayerColor; }, [localPlayerColor]);

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

  useEffect(() => {
    return () => {
        Object.values(effectCleanupTimersRef.current).forEach(clearTimeout);
    };
  }, []);

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

  const fullGameReset = useCallback(() => {
    let initialBoardState = initializeBoard();
    if (userData) {
      if (userData.eloRating >= 1500) {
          initialBoardState = applyArchbishop(initialBoardState, 'white');
          initialBoardState = applyArchbishop(initialBoardState, 'black');
      }
      if (userData.eloRating >= 1800) {
          initialBoardState = applyPalace(initialBoardState, 'white');
          initialBoardState = applyPalace(initialBoardState, 'black');
      }
      if (userData.eloRating >= 2100) {
          initialBoardState = applyArcher(initialBoardState, 'white');
          initialBoardState = applyArcher(initialBoardState, 'black');
      }
    }
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameMoveCounter(0);

    setIsWhiteAI(false);
    setIsBlackAI(false);

    setGameInfo({ ...initialGameStatus });
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights, null);
    if(initialHash) setPositionHistory([initialHash]); else setPositionHistory([]);

    setFlashMessage(null);
    setFlashMessageKey(0);
    setKillStreakFlashMessage(null);
    setKillStreakFlashMessageKey(0);
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
    clickGuardRef.current = false;

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
    firstBloodFlashedRef.current = false;
    signaledEventsRef.current.clear();

    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    
    setLocalPlayerColor(null);
    setRoomId(null);
    setOnlineStatus('disconnected');
    setGamePlayers(null);

    setResurrectedSquares([]);
    setPieceForInfoDisplay(null);
    setShowWinScreen(false);
    setShowLossScreen(false);
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

    setIsAwaitingHolyShield(false);
    setShieldContext(null);

    setIsAwaitingArcherSnipe(false);
    setArcherSnipeContext(null);

    setChatMessages([]);
    setIsMessengerOpen(false);
    setHasUnreadMessages(false);
    prevBoardRef.current = null;

    setVcnLog([]);
    setEloResult(null);
    setShowSummary(false);
    setIsInventoryOpen(false);
    setSelectedInventoryItemType(null);
    setIsAwaitingWindScrollTarget(false);
    setIsAwaitingAnvilScrollTarget(false);
    setAbilityChoiceDialog(null);
  }, [userData]);

  const loginResetRef = useRef(false);
  useEffect(() => {
    if (!isUserLoading && user && userData && !loginResetRef.current) {
      fullGameReset();
      loginResetRef.current = true;
    }
    if (!user) {
      loginResetRef.current = false;
    }
  }, [user, userData, isUserLoading, fullGameReset]);

  const disconnectAndReset = useCallback(() => {
    if (wsRef.current) {
        wsRef.current.onclose = null;
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
      isAwaitingHolyShield: isAwaitingHolyShield,
      shieldContext: shieldContext,
      isAwaitingArcherSnipe: isAwaitingArcherSnipe,
      archerSnipeContext: archerSnipeContext,
      inventory: [...inventory]
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
    isAwaitingHolyShield, shieldContext, isAwaitingArcherSnipe, archerSnipeContext,
    inventory
  ]);

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
                audioManager.playTick();
            } else if (currentTimerValue < 11 && currentTimerValue > 0) {
                audioManager.playTick();
            }
            return currentTimerValue - 1;
        });
    }, 1000);
  }, [stopTurnTimer]);

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
    let currentMessage = " ";

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
            ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: 'draw', reason: 'threefold-repetition' }));
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
    
    if (onlineStatus !== 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
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
                  audioManager.playShroom();
                  setShroomSpawnCounter(0);
                  setNextShroomSpawnTurn(newNextTurn);
                  setVcnLog(prev => [...prev, `[Spawn]🍄@${spawnedAt}`]);
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
    gameMoveCounter,
    getPlayerDisplayName, setCurrentPlayer, isWhiteAI, isBlackAI, 
    shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus,
    localPlayerColor
  ]);


  useEffect(() => {
    if (onlineStatus !== 'connected' || gameInfo.gameOver) {
      stopTurnTimer();
      return;
    }

    let timerStarted = false;

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === localPlayerColor) {
      startTurnTimer(playerWhoGotFirstBlood!, 15);
      timerStarted = true;
    } else if (isAwaitingAnvilDrop && playerToDropAnvil === localPlayerColor) {
      startTurnTimer(playerToDropAnvil!, 15);
      timerStarted = true;
    } else if (isPromotingPawn && playerToPromote === localPlayerColor) {
      startTurnTimer(playerToPromote!, 15);
      timerStarted = true;
    } else if (isAwaitingHolyShield && localPlayerColor === currentPlayer) {
      startTurnTimer(currentPlayer!, 15);
      timerStarted = true;
    } else if (isAwaitingArcherSnipe && localPlayerColor === currentPlayer) {
      startTurnTimer(currentPlayer!, 15);
      timerStarted = true;
    }
    
    const isAnySpecialAction = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget;

    if (!timerStarted && !isAnySpecialAction) {
      startTurnTimer(currentPlayer);
      timerStarted = true;
    }

    if (!timerStarted) {
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
    isAwaitingCommanderPromotion,
    playerWhoGotFirstBlood,
    isAwaitingAnvilDrop,
    playerToDropAnvil,
    isPromotingPawn,
    playerToPromote,
    isAwaitingPawnSacrifice,
    isAwaitingRookSacrifice,
    isResurrectionPromotionInProgress,
    isAwaitingHolyShield,
    isAwaitingArcherSnipe,
    isAwaitingWindScrollTarget,
    isAwaitingAnvilScrollTarget,
    startTurnTimer,
    stopTurnTimer,
  ]);

  const applyServerGameState = useCallback((gameState: any, lastPlayer?: PlayerColor) => {
    if (!gameState) return;

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

    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setIsMoveProcessing(false);
    clickGuardRef.current = false;

    setHistoryStack([]);
    const castlingRights = getCastlingRightsString(gameState.board);
    const initialHash = boardToPositionHash(gameState.board, gameState.currentPlayer, castlingRights, gameState.enPassantTargetSquare || null);
    if (initialHash) setPositionHistory([initialHash]); else setPositionHistory([]);
    
    if (gameState.lastMoveTo) {
      setAnimatedSquareTo(gameState.lastMoveTo);
    } else {
      setAnimatedSquareTo(null);
    }

    if (gameState.resurrectedSquare && lastPlayer) {
      addEffect('light-beam', gameState.resurrectedSquare);
      audioManager.playResurrect();
      setResurrectedSquares(prev => [...prev, { square: gameState.resurrectedSquare, player: lastPlayer }]);
    }
  }, [addEffect]);

  const addToVCN = useCallback((move: Move, result: ApplyMoveResult, player: PlayerColor, extraTurn: boolean, special?: string) => {
    const piece = result.newBoard[algebraicToCoords(move.to).row][algebraicToCoords(move.to).col].piece;
    if (!piece && move.type !== 'wind-scroll' && move.type !== 'life-leach' && move.type !== 'summon-anvil') return;

    let notation = "";
    if (move.type === 'wind-scroll') {
      notation = `[W-Spell]@${move.to}`;
    } else if (move.type === 'life-leach') {
      notation = `[L-Spell]`;
    } else if (move.type === 'summon-anvil') {
      notation = `[A-Spell]@${move.to}`;
    } else {
      const char = getVCNChar(piece!.type);
      const level = `(L${piece!.level})`;
      const sep = result.capturedPiece ? 'x' : '-';
      const dest = move.to;
      const from = move.from;
      notation = `${char}${level}${from}${sep}${dest}`;
      if (move.type === 'castle') notation = move.to.startsWith('g') ? 'O-O' : 'O-O-O';
      if (result.infiltrationWin) notation += '🚩';
      if (gameInfo.isCheckmate) notation += '#';
      else if (gameInfo.isCheck) notation += '+';
    }
    
    if (result.rallyCryTriggered) notation += '📢';
    if (result.conversionEvents.length > 0) notation += '~';
    if (result.pieceCapturedByAnvil) notation += '>>[A]';
    if (extraTurn) notation += '!!';
    if (special) notation += `[${special}]`;

    setVcnLog(prev => [...prev, notation]);
  }, [gameInfo.isCheck, gameInfo.isCheckmate]);


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
          let sacrificedPawnPos: AlgebraicSquare | null = null;

          for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
              const pieceAtSquare = boardCopyForAISacrifice[r_idx][c_idx].piece;
              if (pieceAtSquare && (pieceAtSquare.type === 'pawn' || pieceAtSquare.type === 'commander') && pieceAtSquare.color === playerWhoseQueenLeveled) {
                sacrificedAIPawn = { ...pieceAtSquare, id: `${pieceAtSquare.id}_sac_AI_${uniqueIdCounterRef.current++}` };
                sacrificedPawnPos = coordsToAlgebraic(r_idx, c_idx);
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
            audioManager.playCapture();
          }
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)} (AI) sacrificed a Pawn/Commander for L7 Queen!`, duration: 8000 });
          setVcnLog(prev => [...prev, `[Sacrifice]@${sacrificedPawnPos}`]);
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
    if (clickGuardRef.current) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;
    setPieceForInfoDisplay(clickedPiece || null);

    // Interaction Guard: If a specialized selection turn is active, only the acting local player can interact.
    const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget;
    if (isAnySpecialModeActive && !isLocalActionTurn) {
        return;
    }

    // --- Inventory Interaction Mode ---
    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (clickedPiece && !clickedPiece.heldItem) {
          if (usedSlots >= attunementSlots) {
            toast({ title: "Attunement Limit", description: "You cannot equip any more pieces!", variant: "destructive" });
            return;
          }
          // Swift Cloak restriction: Pawns/Commanders only
          if (selectedInventoryItemType === 'swift_cloak' && clickedPiece.type !== 'pawn' && clickedPiece.type !== 'commander') {
            toast({ title: "Invalid Equipment", description: "Swift Cloak can only be equipped to Pawns or Commanders.", variant: "destructive" });
            return;
          }

          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
          setInventory(prev => {
            const nextInv = [...prev];
            const item = nextInv.find(i => i.type === selectedInventoryItemType);
            if (item) {
              item.count--;
              if (item.count <= 0) return nextInv.filter(i => i.type !== selectedInventoryItemType);
            }
            return nextInv;
          });
          setSelectedInventoryItemType(null);
          audioManager.playLevelUp();
          toast({ title: "Equipped!", description: `${clickedPiece.type} is now using ${ITEM_METADATA[selectedInventoryItemType].name}.` });
        } else if (clickedPiece && clickedPiece.heldItem) {
          // Swift Cloak restriction on swap
          if (selectedInventoryItemType === 'swift_cloak' && clickedPiece.type !== 'pawn' && clickedPiece.type !== 'commander') {
            toast({ title: "Invalid Equipment", description: "Swift Cloak can only be equipped to Pawns or Commanders.", variant: "destructive" });
            return;
          }

          const oldItem = clickedPiece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
          setInventory(prev => {
            const nextInv = [...prev];
            const itemIn = nextInv.find(i => i.type === selectedInventoryItemType);
            if (itemIn) {
              itemIn.count--;
              if (itemIn.count <= 0) nextInv.splice(nextInv.indexOf(itemIn), 1);
            }
            const itemOut = nextInv.find(i => i.type === oldItem);
            if (itemOut) itemOut.count++;
            else nextInv.push({ type: oldItem, count: 1 });
            return nextInv;
          });
          setSelectedInventoryItemType(null);
          audioManager.playLevelUp();
          toast({ title: "Swapped!", description: `Swapped ${ITEM_METADATA[oldItem].name} for ${ITEM_METADATA[selectedInventoryItemType].name}.` });
        }
      } else {
        if (clickedPiece && clickedPiece.heldItem) {
          const removedItem = clickedPiece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null;
          setBoard(nextBoard);
          setInventory(prev => {
            const nextInv = [...prev];
            const item = nextInv.find(i => i.type === removedItem);
            if (item) item.count++;
            else nextInv.push({ type: oldItem, count: 1 });
            return nextInv;
          });
          audioManager.playMove();
          toast({ title: "Unequipped", description: `${ITEM_METADATA[removedItem].name} returned to bag.` });
        }
      }
      return;
    }

    if (isAwaitingWindScrollTarget && isLocalActionTurn) {
      if (!clickedSquareState?.piece && !clickedSquareState?.item) {
        saveStateToHistory();
        clickGuardRef.current = true;
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);
        
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'wind-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare);
        setBoard(result.newBoard);
        audioManager.playAnvil();
        toast({ title: "Wind Scroll Cast!", description: `Units pushed back from ${algebraic}.` });
        
        setIsAwaitingWindScrollTarget(false);
        setSelectedSquare(null);
        setPossibleMoves([]);
        addToVCN(move, result, currentPlayer, false);
        setTimeout(() => {
          setIsMoveProcessing(false);
          clickGuardRef.current = false;
          processMoveEnd(result.newBoard, currentPlayer, false, enPassantTargetSquare);
        }, 800);
      } else {
        toast({ title: "Invalid Target", description: "Target an empty space to cast the Wind Scroll.", variant: "destructive" });
      }
      return;
    }

    if (isAwaitingAnvilScrollTarget && isLocalActionTurn) {
      if (!clickedSquareState?.piece && !clickedSquareState?.item) {
        saveStateToHistory();
        clickGuardRef.current = true;
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);
        
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'summon-anvil' };
        const result = applyMove(board, move, enPassantTargetSquare);
        setBoard(result.newBoard);
        audioManager.playAnvil();
        toast({ title: "Anvil Summoned!", description: `Anvil dropped on ${algebraic}.` });
        
        setIsAwaitingAnvilScrollTarget(false);
        setSelectedSquare(null);
        setPossibleMoves([]);
        addToVCN(move, result, currentPlayer, false);
        setTimeout(() => {
          setIsMoveProcessing(false);
          clickGuardRef.current = false;
          processMoveEnd(result.newBoard, currentPlayer, false, enPassantTargetSquare);
        }, 800);
      } else {
        toast({ title: "Invalid Target", description: "Target an empty space to summon an Anvil.", variant: "destructive" });
      }
      return;
    }

    let moveBeingMade: Move | null = null;
    let humanPlayerAchievedFirstBloodThisTurn = false;
    let originalPieceLevelBeforeMove: number | undefined;
    let enteringSpecialMode = false;

    if (isAwaitingArcherSnipe && isLocalActionTurn) {
      if (clickedPiece && clickedPiece.color !== currentPlayer && clickedPiece.level === 1 && clickedPiece.type !== 'king' && clickedPiece.type !== 'queen') {
          saveStateToHistory();
          
          if (onlineStatus === 'connected') {
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'archer-snipe', square: algebraic }));
              }
              clickGuardRef.current = true;
              setIsMoveProcessing(true);
              return;
          }

          const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = archerSnipeContext!;
          const boardAfterSnipe = boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
          
          const archerOnBoard = boardAfterSnipe.flat().find(sq => sq.piece?.type === 'archer' && sq.piece.color === currentPlayer);
          if (archerOnBoard?.piece) {
              archerOnBoard.piece.level += 2;
          }

          const uniqueCapturedPiece = { ...clickedPiece, id: `${clickedPiece.id}_sniped_${uniqueIdCounterRef.current++}` };
          setCapturedPieces(prev => ({
              ...prev,
              [currentPlayer]: [...(prev[currentPlayer] || []), uniqueCapturedPiece]
          }));

          boardAfterSnipe[row][col].piece = null;
          setBoard(boardAfterSnipe);
          
          addEffect('poof', algebraic);
          audioManager.playSnipe();
          toast({ title: "Archer Snipe!", description: `${getPlayerDisplayName(currentPlayer)} sniped the ${clickedPiece.type}!` });
          
          setIsAwaitingArcherSnipe(false);
          setArcherSnipeContext(null);
          
          setVcnLog(prev => [...prev, `[AR-Snipe]x${algebraic}`]);
          
          processMoveEnd(boardAfterSnipe, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget);
      } else {
          if (isLocalActionTurn) {
            toast({ title: "Invalid Snipe Target", description: "Select an enemy Level 1 piece (not King/Queen).", variant: "destructive" });
          }
      }
      return;
    }

    if (isAwaitingHolyShield && isLocalActionTurn) {
      const capturingPieceId = lastMoveTo ? board[algebraicToCoords(lastMoveTo).row][algebraicToCoords(lastMoveTo).col].piece?.id : null;
      if (clickedPiece && clickedPiece.color === currentPlayer && clickedPiece.type !== 'king' && clickedPiece.type !== 'queen' && clickedPiece.id !== capturingPieceId) {
          saveStateToHistory();
          
          if (onlineStatus === 'connected') {
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'holy-shield', square: algebraic }));
              }
              clickGuardRef.current = true;
              setIsMoveProcessing(true);
              return;
          }

          const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = shieldContext!;
          const boardAfterShield = boardForNextStep.map(r => r.map(s => ({
              ...s,
              piece: s.piece ? { ...s.piece, isShielded: s.piece.id === clickedPiece.id ? true : s.piece.isShielded } : null
          })));
          setBoard(boardAfterShield);
          audioManager.playShield();
          toast({ title: "Holy Shield!", description: `${clickedPiece.type} is now shielded!` });
          setIsAwaitingHolyShield(false);
          setShieldContext(null);
          
          setVcnLog(prev => [...prev, `🛡️@${algebraic}`]);
          
          processMoveEnd(boardAfterShield, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget);
      } else {
          if (isLocalActionTurn) {
            toast({ title: "Invalid Shield Target", description: "Cannot shield Kings, Queens, or the piece that just captured.", variant: "destructive" });
          }
      }
      return;
    }

    if (onlineStatus === 'connected' && localPlayerColor !== currentPlayer) {
        if (clickedPiece) {
            if (clickedPiece.color === localPlayerColor) {
                setSelectedSquare(algebraic);
                setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare));
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else {
                setSelectedSquare(null);
                setPossibleMoves([]);
                setEnemySelectedSquare(algebraic);
                setEnemyPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare));
            }
        } else {
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
        return; 
    }

    if (isAwaitingAnvilDrop && playerToDropAnvil === currentPlayer) {
        if (!clickedSquareState?.piece && !clickedSquareState?.item) {
            if (onlineStatus === 'connected') {
                const ws = wsRef.current;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'anvil-drop', square: algebraic }));
                }
                clickGuardRef.current = true;
                setIsMoveProcessing(true); 
                return;
            }
    
            saveStateToHistory();
            const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget } = anvilDropContext!;
            const boardAfterAnvilDrop = boardForNextStep.map(r => r.map(s => ({ ...s })));
            boardAfterAnvilDrop[row][col].item = { type: 'anvil' };
            setBoard(boardAfterAnvilDrop);
            audioManager.playAnvil();
            
            toast({ title: "Anvil Dropped!", description: `Anvil placed on ${algebraic}.`, duration: 2000 });
        
            setVcnLog(prev => [...prev, `+[A]@${algebraic}`]);
            
            processMoveEnd(boardAfterAnvilDrop, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget);
        
            setIsAwaitingAnvilDrop(false);
            setPlayerToDropAnvil(null);
            setAnvilDropContext(null);
        } else {
            if (isLocalActionTurn) {
                toast({ title: "Invalid Placement", description: "Anvil must be placed on an empty square.", variant: "destructive" });
            }
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
                    ws.send(payload);
                }
                clickGuardRef.current = true;
                setIsAwaitingCommanderPromotion(false);
                setPlayerWhoGotFirstBlood(null);
                return;
            }

            const boardAfterCommanderPromo = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            boardAfterCommanderPromo[row][col].piece!.type = 'commander';
            boardAfterCommanderPromo[row][col].piece!.id = `${boardAfterCommanderPromo[row][col].piece!.id}_CMD_${uniqueIdCounterRef.current++}`;
            setBoard(boardAfterCommanderPromo);
            audioManager.playLevelUp();
            toast({ title: "Commander Promoted!", description: `${getPlayerDisplayName(currentPlayer)}'s Pawn on ${algebraic} is now a Commander!`, duration: 8000});
            
            setVcnLog(prev => [...prev, `[Promo-C]@${algebraic}`]);

            setIsAwaitingCommanderPromotion(false);
            const actingPlayerForComplete = playerWhoGotFirstBlood!;
            setPlayerWhoGotFirstBlood(null);
            
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);

            if (!isPromotingPawn && !isAwaitingHolyShield && !isAwaitingAnvilDrop && !isAwaitingArcherSnipe) {
                processMoveEnd(boardAfterCommanderPromo, actingPlayerForComplete, false, enPassantTargetSquare);
            }
            return;
        } else {
            if (isLocalActionTurn) {
                toast({title: "Invalid Commander Choice", description: "Select one of your own Level 1 Pawns to promote.", duration: 8000});
            }
        }
        return;
    }


    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
      if (clickedPiece && (clickedPiece.type === 'pawn' || clickedPiece.type === 'commander') && clickedPiece.color === currentPlayer) {
        saveStateToHistory();
        let boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
        const pawnToSacrificeBase = { ...boardAfterSacrifice[row][col].piece! };
        const pawnToSacrifice = { ...pawnToSacrificeBase, id: `${pawnToSacrificeBase.id}_sac_${uniqueIdCounterRef.current++}`};
        
        boardAfterSacrifice[row][col].piece = null;

        setBoard(boardAfterSacrifice);
        audioManager.playCapture();

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
                const payload = JSON.stringify({ type: 'pawn-sacrifice', square: algebraic });
                ws.send(payload);
            }
        }
        
        setVcnLog(prev => [...prev, `[Sacrifice]@${algebraic}`]);

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
        if (isLocalActionTurn) {
            toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns/Commanders to sacrifice for the Queen.", duration: 8000 });
        }
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
    let finalCapturedPiecesForTurn = {
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
        clickGuardRef.current = false;
        return;
      }

      const hasSelfSelectionAbility = ((pieceToMoveFromSelected.type === 'knight' || pieceToMoveFromSelected.type === 'hero' || pieceToMoveFromSelected.type === 'archer') && (Number(pieceToMoveFromSelected.level || 1)) >= 5);
      const hasMagicScroll = (pieceToMoveFromSelected.heldItem === 'wind_scroll' || pieceToMoveFromSelected.heldItem === 'life_leach' || pieceToMoveFromSelected.heldItem === 'summon_anvil');

      if (selectedSquare === algebraic && (hasSelfSelectionAbility || hasMagicScroll)) {
        const executeLifeLeach = () => {
          saveStateToHistory();
          clickGuardRef.current = true;
          setIsMoveProcessing(true);
          const move: Move = { from: selectedSquare, to: selectedSquare, type: 'life-leach' };
          const result = applyMove(board, move, enPassantTargetSquare);
          setBoard(result.newBoard);
          audioManager.playLevelUp();
          toast({ title: "Life Leach Cast!", description: "All enemy levels reduced by 1." });
          setSelectedSquare(null);
          setPossibleMoves([]);
          addToVCN(move, result, currentPlayer, false);
          setTimeout(() => {
            setIsMoveProcessing(false);
            clickGuardRef.current = false;
            processMoveEnd(result.newBoard, currentPlayer, false, enPassantTargetSquare);
          }, 800);
        };

        const executeWindScrollMode = () => {
          setIsAwaitingWindScrollTarget(true);
          setPossibleMoves([]); 
          toast({ title: "Targeting Mode", description: "Select an empty square to target with Wind Scroll." });
        };

        const executeSummonAnvilMode = () => {
          setIsAwaitingAnvilScrollTarget(true);
          setPossibleMoves([]); 
          toast({ title: "Targeting Mode", description: "Select an empty square to summon an Anvil." });
        };

        const executeSelfDestruct = () => {
          const tempBoardForCheck = board.map(r => r.map(s => ({...s})));
          tempBoardForCheck[fromR_selected][fromC_selected].piece = null;
          if (isKingInCheck(tempBoardForCheck, currentPlayer, enPassantTargetSquare)) {
            toast({ title: "Illegal Move", description: "Cannot self-destruct into check.", duration: 8000 });
            return;
          }

          saveStateToHistory();
          clickGuardRef.current = true;
          setLastMoveFrom(selectedSquare);
          setLastMoveTo(selectedSquare);
          setIsMoveProcessing(true);
          setAnimatedSquareTo(algebraic);
          
          const { row: cR, col: cC } = algebraicToCoords(selectedSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          audioManager.playExplosion();

          const move: Move = { from: selectedSquare, to: selectedSquare, type: 'self-destruct' };
          const applyMoveResult = applyMove(finalBoardStateForTurn, move, enPassantTargetSquare);
          let { newBoard, selfDestructCaptures, destroyedAnvils, enPassantTargetSet: nextEnPassantTarget, rallyCryTriggered } = applyMoveResult;
          
          finalBoardStateForTurn = newBoard;
          if (selfDestructCaptures) selfDestructCaptures.forEach(p => finalCapturedPiecesForTurn[currentPlayer].push(p));
          
          const selfDestructPlayer = currentPlayer;
          const oldStreak = killStreaks[selfDestructPlayer] || 0;
          let capturesThisTurnForSelfDestruct = selfDestructCaptures ? selfDestructCaptures.length : 0;
          const newStreakForSelfDestructPlayer = capturesThisTurnForSelfDestruct > 0 ? (oldStreak + capturesThisTurnForSelfDestruct) : 0;
          setKillStreaks(prev => ({...prev, [selfDestructPlayer]: newStreakForSelfDestructPlayer}));
          
          if (capturesThisTurnForSelfDestruct > 0) {
              setShowCaptureFlash(true);
              setCaptureFlashKey(k => k + 1);
          }

          if (capturesThisTurnForSelfDestruct > 0 && !firstBloodAchieved) {
              setFirstBloodAchieved(true);
              setPlayerWhoGotFirstBlood(selfDestructPlayer);
          }

          const streakGrantsExtraTurn = oldStreak < 6 && newStreakForSelfDestructPlayer >= 6;
          setBoard(finalBoardStateForTurn);
          setCapturedPieces(finalCapturedPiecesForTurn);
          addToVCN(move, applyMoveResult, currentPlayer, streakGrantsExtraTurn);

          setTimeout(() => {
            setSelectedSquare(null); setPossibleMoves([]);
            setIsMoveProcessing(false); clickGuardRef.current = false;
            processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn, nextEnPassantTarget);
          }, 800);
        };

        if (hasSelfSelectionAbility && hasMagicScroll) {
          setAbilityChoiceDialog({
            isOpen: true,
            onChoice: (choice) => {
              setAbilityChoiceDialog(null);
              if (choice === 'ability') executeSelfDestruct();
              else {
                if (pieceToMoveFromSelected.heldItem === 'life_leach') executeLifeLeach();
                else if (pieceToMoveFromSelected.heldItem === 'summon_anvil') executeSummonAnvilMode();
                else executeWindScrollMode();
              }
            }
          });
          return;
        }

        if (hasMagicScroll) {
          if (pieceToMoveFromSelected.heldItem === 'life_leach') executeLifeLeach();
          else if (pieceToMoveFromSelected.heldItem === 'summon_anvil') executeSummonAnvilMode();
          else executeWindScrollMode();
        } else if (hasSelfSelectionAbility) {
          executeSelfDestruct();
        }
        return;
      }

      originalPieceLevelBeforeMove = Number(pieceToMoveFromSelected.level || 1);
      setPromotionPawnOriginalLevel(originalPieceLevelBeforeMove);


      moveBeingMade = { from: selectedSquare, to: algebraic };
      
      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      let isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);

      if (isMoveInFreshList && moveBeingMade) {
        saveStateToHistory();
        clickGuardRef.current = true;
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                const payload = JSON.stringify({ type: 'game-move', payload: moveBeingMade });
                ws.send(payload);
            }
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
            shroomConsumed: shroomConsumedThisMove,
            rallyCryTriggered,
            extraTurn: extraTurnFromApplyMove,
            specialCaptureSquare,
            originalPieceLevel: levelFromApplyMoveInternal,
        } = applyMoveResult;
        
        finalBoardStateForTurn = boardAfterMove;
        let nextEnPassantTarget = applyMoveResult.enPassantTargetSet;

        if (becameInfiltratorFromApply) {
          toast({ title: "Infiltrator!", description: `${getPlayerDisplayName(currentPlayer)}'s pawn promoted to an Infiltrator!`, duration: 8000 });
        }


        if (gameWonByInfiltrationFromApply) {
          setBoard(finalBoardStateForTurn);
          setCapturedPieces(finalCapturedPiecesForTurn);
          toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, duration: 8000 });
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
          setIsMoveProcessing(false);
          clickGuardRef.current = false;
           if (onlineStatus === 'connected') {
             const ws = wsRef.current;
            if(ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: currentPlayer, reason: 'infiltration' }));
            }
           }
          
          addToVCN(moveBeingMade, applyMoveResult, currentPlayer, extraTurnFromApplyMove);
          return;
        }

        if (shroomConsumedThisMove) {
            const movedPieceData = finalBoardStateForTurn[algebraicToCoords(algebraic).row]?.[algebraicToCoords(algebraic).col]?.piece;
            if(movedPieceData) {
                audioManager.playShroom();
                audioManager.playLevelUp();
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
          clickGuardRef.current = false;
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
          if (onlineStatus === 'connected') {
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: opponentPlayer, timedOutPlayer: currentPlayer, reason: 'self-check' }));
            }
          }
          return;
        }

        const capturingPlayer = currentPlayer;
        const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
        
        const oldStreak = killStreaks[capturingPlayer] || 0;
        let capturesThisTurn = 0;
        if (capturedPieceFromApply) capturesThisTurn++;
        if (pieceCapturedByAnvilFromApply) capturesThisTurn++;

        const newStreak = capturesThisTurn > 0 ? (oldStreak + capturesThisTurn) : 0;
        if (capturesThisTurn > 0) {
            setKillStreaks(prev => ({
                ...prev,
                [capturingPlayer]: newStreak
            }));
        } else {
            if (killStreaks[capturingPlayer] > 0) {
                setKillStreaks(prev => ({...prev, [capturingPlayer]: 0}));
            }
        }
        
        const { row: toR_final_check_infiltrator, col: toC_final_check_infiltrator } = algebraicToCoords(algebraic);
        const pieceThatMadeTheMove = finalBoardStateForTurn[toR_final_check_infiltrator]?.[toC_final_check_infiltrator]?.piece;

        if (capturedPieceFromApply) {
          if (pieceThatMadeTheMove && pieceThatMadeTheMove.type === 'infiltrator') {
            audioManager.playObliterate();
            toast({ title: "Obliterated!", description: `${getPlayerDisplayName(capturingPlayer)}'s Infiltrator obliterated ${capturedPieceFromApply.color} ${capturedPieceFromApply.type}!`, duration: 8000});
          } else {
            audioManager.playCapture();
            audioManager.playLevelUp();
            const uniqueCapturedPiece = { ...capturedPieceFromApply, id: `${capturedPieceFromApply.id}_cap_${uniqueIdCounterRef.current++}` };
            finalCapturedPiecesForTurn[capturingPlayer].push(uniqueCapturedPiece);
          }
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else if (pieceCapturedByAnvilFromApply) {
          audioManager.playObliterate();
          finalCapturedPiecesForTurn[capturingPlayer].push({ ...pieceCapturedByAnvilFromApply, id: `${pieceCapturedByAnvilFromApply.id}_cap_anvil_${uniqueIdCounterRef.current++}` });
          toast({ title: "Anvil Crush!", description: `${getPlayerDisplayName(currentPlayer)}'s Pawn push made an Anvil capture a ${pieceCapturedByAnvilFromApply.type}!`, duration: 8000 });
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else if (moveBeingMade.type === 'castle') {
           audioManager.playMove();
        } else {
           audioManager.playMove();
        }

        if (anvilPushedOffBoardFromApply) {
            toast({ title: "Anvil Removed!", description: "Anvil pushed off the board.", duration: 8000 });
        }
        

        let humanRookResData: RookResurrectionResult | null = null;
        const { row: toR_final, col: toC_final } = algebraicToCoords(algebraic);
        const movedPieceOnToSquareHuman = finalBoardStateForTurn[toR_final]?.[toC_final]?.piece;

        if (movedPieceOnToSquareHuman && (movedPieceOnToSquareHuman.type === 'rook' || movedPieceOnToSquareHuman.type === 'palace' || (moveBeingMade.type === 'promotion' && (moveBeingMade.promoteTo === 'rook' || moveBeingMade.promoteTo === 'palace'))) ) {
           if (capturesThisTurn > 0) { 
            const oldLevelForResurrectionCheck = levelFromApplyMoveInternal !== undefined ? levelFromApplyMoveInternal : originalPieceLevelBeforeMove;
            humanRookResData = processRookResurrectionCheck(
              finalBoardStateForTurn,
              currentPlayer,
              moveBeingMade,
              algebraic,
              oldLevelForResurrectionCheck,
              finalCapturedPiecesForTurn,
              uniqueIdCounterRef.current
            );
            if (humanRookResData.resurrectionPerformed) {
              finalBoardStateForTurn = humanRookResData.boardWithResurrection;
              finalCapturedPiecesForTurn = humanRookResData.capturedPiecesAfterResurrection;
              uniqueIdCounterRef.current = humanRookResData.newResurrectionIdCounter!;
              addEffect('light-beam', humanRookResData!.resurrectedSquareAlg!);
              audioManager.playResurrect();
              setResurrectedSquares(prev => [...prev, { square: humanRookResData!.resurrectedSquareAlg!, player: currentPlayer }]);
              const resType = movedPieceOnToSquareHuman.type === 'palace' ? 'Master' : 'Rook\'s';
              toast({
                  title: `${resType} Call!`,
                  description: `${getPlayerDisplayName(currentPlayer)}'s ${movedPieceOnToSquareHuman.type} resurrected their ${humanRookResData.resurrectedPieceData!.type} to ${humanRookResData.resurrectedSquareAlg!}! (L${humanRookResData.resurrectedPieceData!.level})`,
                  duration: 8000,
              });

              setVcnLog(prev => [...prev, `+^${getVCNChar(humanRookResData!.resurrectedPieceData!.type)}(L${humanRookResData!.resurrectedPieceData!.level})@${humanRookResData!.resurrectedSquareAlg!}`]);

              if (humanRookResData.promotionRequiredForResurrectedPawn) {
                  const isExtraTurnForRookResPromo = oldStreak < 6 && newStreak >= 6;
                  setPlayerForPostResurrectionPromotion(currentPlayer);
                  setIsExtraTurnForPostResurrectionPromotion(isExtraTurnForRookResPromo);
                  setIsResurrectionPromotionInProgress(true);
                  setPlayerToPromote(currentPlayer);
                  setIsPromotingPawn(true);
                  setPromotionSquare(humanRookResData.resurrectedSquareAlg!);
                  setBoard(finalBoardStateForTurn);
                  setCapturedPieces(finalCapturedPiecesForTurn);
                  setIsMoveProcessing(false);
                  clickGuardRef.current = false;
                  return;
              }
            }
          }
        }

        if (capturesThisTurn > 0 && !firstBloodAchieved) {
            setFirstBloodAchieved(true);
            setPlayerWhoGotFirstBlood(capturingPlayer);
            const isHumanPlayer = !((capturingPlayer === 'white' && isWhiteAI && onlineStatus === 'disconnected') || (capturingPlayer === 'black' && isBlackAI && onlineStatus === 'disconnected'));
            if (isHumanPlayer) humanPlayerAchievedFirstBloodThisTurn = true;
        }
        
        const originalPieceDataFromBoard = board[algebraicToCoords(selectedSquare).row]?.[algebraicToCoords(selectedSquare).col]?.piece;
        const commanderHeroPromoExtraTurn = (originalPieceDataFromBoard?.type === 'commander' && (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 && pieceThatMadeTheMove?.type === 'hero');
        const isPawnPromotingMove = pieceThatMadeTheMove && pieceThatMadeTheMove.type === 'pawn' && (row === 0 || row === 7) && !becameInfiltratorFromApply;
        const pawnLevelGrantsExtraTurn = (originalPieceDataFromBoard?.type === 'pawn' && (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 && (row === 0 || row === 7) && !isPawnPromotingMove && !becameInfiltratorFromApply);
        const streakGrantsExtraTurn = oldStreak < 6 && newStreak >= 6;
        const combinedExtraTurn = commanderHeroPromoExtraTurn || pawnLevelGrantsExtraTurn || streakGrantsExtraTurn || extraTurnFromApplyMove;

        if (newStreak >= 2 && oldStreak < 2) {
            const hasArchbishop = finalBoardStateForTurn.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === capturingPlayer);
            if (hasArchbishop) {
                enteringSpecialMode = true;
                const shieldCtx = {
                    boardForNextStep: finalBoardStateForTurn,
                    playerWhoseTurnCompleted: capturingPlayer,
                    isExtraTurn: combinedExtraTurn,
                    newEnPassantTarget: enPassantTargetSquare,
                    capturingPieceId: pieceThatMadeTheMove?.id
                };
                setShieldContext(shieldCtx);
                if (isPawnPromotingMove) {
                } else {
                    setIsAwaitingHolyShield(true);
                    setGameInfo(prev => ({...prev, message: "HOLY SHIELD! Select an ally to protect."}));
                }
            }
        }

        if (!enteringSpecialMode && newStreak >= 3 && oldStreak < 3) {
            enteringSpecialMode = true;
            const anvilDropCtx = {
                boardForNextStep: finalBoardStateForTurn,
                playerWhoseTurnCompleted: capturingPlayer,
                isExtraTurn: combinedExtraTurn,
                newEnPassantTarget: enPassantTargetSquare,
            };
            setAnvilDropContext(anvilDropCtx);
            if (isPawnPromotingMove) {
                setAnvilDropAfterPromotion(true);
            } else {
                setIsAwaitingAnvilDrop(true);
                setPlayerToDropAnvil(capturingPlayer);
                setGameInfo(prev => ({...prev, message: `KILL STREAK REACHED! Place an anvil.`}));
            }
        } 

        if (!enteringSpecialMode && newStreak >= 5 && oldStreak < 5) {
            const hasArcher = finalBoardStateForTurn.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === capturingPlayer);
            if (hasArcher) {
                const hasLevel1Victims = finalBoardStateForTurn.flat().some(sq => 
                    sq.piece && 
                    sq.piece.color === opponentPlayer && 
                    sq.piece.level === 1 && 
                    sq.piece.type !== 'king' && 
                    sq.piece.type !== 'queen'
                );
                
                if (hasLevel1Victims) {
                  enteringSpecialMode = true;
                  const snipeCtx = {
                      boardForNextStep: finalBoardStateForTurn,
                      playerWhoseTurnCompleted: capturingPlayer,
                      isExtraTurn: combinedExtraTurn,
                      newEnPassantTarget: enPassantTargetSquare,
                  };
                  setArcherSnipeContext(snipeCtx);
                  if (isPawnPromotingMove) {
                  } else {
                      setIsAwaitingArcherSnipe(true);
                      setGameInfo(prev => ({...prev, message: "ARCHER SNIPE! Select Level 1 enemy to capture."}));
                  }
                }
            }
        }
        
        if (newStreak >= 4 && oldStreak < 4) {
              if (!humanRookResData?.resurrectionPerformed) {
                  let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesForTurn[opponentPlayer] || [])];
                  if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginalOriginalAI = piecesOfCurrentPlayerCapturedByOpponent.pop();
                    if (pieceToResurrectOriginalOriginalAI) {
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece && !finalBoardStateForTurn[r_idx][c_idx].item) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginalOriginalAI, level: 1, id: `${pieceToResurrectOriginalOriginalAI.id}_res_${uniqueIdCounterRef.current++}`, hasMoved: pieceToResurrectOriginalOriginalAI.type === 'king' || pieceToResurrectOriginalOriginalAI.type === 'rook' || pieceToResurrectOriginalOriginalAI.type === 'palace' ? false : pieceToResurrectOriginalOriginalAI.hasMoved, invulnerableTurnsRemaining: 0, isShielded: false, heldItem: null };

                        const promoRow = capturingPlayer === 'white' ? 0 : 7;
                        if (resurrectedPiece.type === 'commander' && resR === promoRow) {
                            resurrectedPiece.type = 'hero';
                            resurrectedPiece.id = `${resurrectedPiece.id}_HeroPromo_Res`;
                            toast({ title: "Resurrection & Promotion!", description: `${getPlayerDisplayName(capturingPlayer)}'s Commander resurrected and promoted to Hero! (L1)`, duration: 8000 });
                        } else {
                            toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${pieceToResurrectOriginalOriginalAI.type} returns! (L1)`, duration: 8000 });
                        }
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                        addEffect('light-beam', randomSquareAlg);
                        audioManager.playResurrect();
                        setResurrectedSquares(prev => [...prev, { square: randomSquareAlg, player: capturingPlayer }]);
                        finalCapturedPiecesForTurn[opponentPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginalOriginalAI.id);

                        setVcnLog(prev => [...prev, `+^${getVCNChar(resurrectedPiece.type)}(L${resurrectedPiece.level})@${randomSquareAlg}`]);

                        if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                            setPlayerForPostResurrectionPromotion(capturingPlayer);
                            setIsExtraTurnForPostResurrectionPromotion(oldStreak < 6 && newStreak >= 6);
                            setIsResurrectionPromotionInProgress(true);
                            setPlayerToPromote(capturingPlayer);
                            setIsPromotingPawn(true);
                            setPromotionSquare(randomSquareAlg);
                            setBoard(finalBoardStateForTurn);
                            setCapturedPieces(finalCapturedPiecesForTurn);
                            setIsMoveProcessing(false);
                            clickGuardRef.current = false;
                            return;
                        }
                      }
                    }
                  }
              }
        }


        if (conversionEventsFromApply && conversionEventsFromApply.length > 0) {
          conversionEventsFromApply.forEach(event => {
            addEffect('conversion', event.at, event.byPiece.color);
            if (event.originalPiece.color !== event.convertedPiece.color) {
              audioManager.playConversion();
              toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 });
            }
          });
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesForTurn);
        
        addToVCN(moveBeingMade, applyMoveResult, currentPlayer, combinedExtraTurn);

        if (enteringSpecialMode && !isPawnPromotingMove) {
            setIsMoveProcessing(false); 
            clickGuardRef.current = false;
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
                clickGuardRef.current = false;
              }
              return;
          }

          if (enteringSpecialMode) {
              setIsMoveProcessing(false); 
              clickGuardRef.current = false;
              return;
          }


          const isPendingResurrectionPromotion = isResurrectionPromotionInProgress;
          let sacrificeNeeded = false;

          if (!isPendingResurrectionPromotion && pieceOnBoardAfterMove?.type === 'queen' ) {
             sacrificeNeeded = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, levelFromApplyMoveInternal, combinedExtraTurn, nextEnPassantTarget);
          }

          if (isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeeded && !isPendingResurrectionPromotion) {
            setPlayerToPromote(currentPlayer);
            setIsPromotingPawn(true); 
            setPromotionSquare(algebraic);
          } else if (!isPawnPromotingMove && !sacrificeNeeded && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isPendingResurrectionPromotion && !becameInfiltratorFromApply) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnPassantTarget);
          } else if (humanRookResData?.resurrectionPerformed && !isPendingResurrectionPromotion) {
             processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnPassantTarget);
          } else if ((becameInfiltratorFromApply) && !isPendingResurrectionPromotion && !isAwaitingPawnSacrifice && !sacrificeNeeded) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, nextEnPassantTarget);
          }

          setIsMoveProcessing(false);
          clickGuardRef.current = false;
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
        setIsMoveProcessing(false);
        clickGuardRef.current = false;
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
    setGameInfo, setCapturedPieces, setKillStreaks,
    setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing,
    setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo, setPlayerToPromote,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoGotFirstBlood, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, processPawnSacrificeCheck,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    getPossibleMoves,
    isResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setIsResurrectionPromotionInProgress,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey,
    firstBloodAchieved, 
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, setResurrectedSquares, user,
    isAwaitingAnvilDrop, playerToDropAnvil, anvilDropContext,
    isAwaitingHolyShield, shieldContext, lastMoveTo, localPlayerColor, isLocalActionTurn,
    isAwaitingArcherSnipe, archerSnipeContext, addToVCN, isWhiteAI, isBlackAI,
    isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget
  ]);
  
  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isAwaitingCommanderPromotion) {
        return;
    }

    if (onlineStatus === 'connected') {
        const ws = wsRef.current;
        if(ws && ws.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({ type: 'finalize-promotion', payload: { square: promotionSquare, promoteTo: pieceType } });
          ws.send(payload);
        }
        setIsPromotingPawn(false);
        setPromotionSquare(null);
        setPlayerToPromote(null);
        setIsResurrectionPromotionInProgress(false);
        return;
    }

    let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = boardToUpdate[row]?.[col]?.piece;

    if (!pieceBeingPromoted || (pieceBeingPromoted.type !== 'pawn' && pieceBeingPromoted.type !== 'commander' && !isResurrectionPromotionInProgress) ) {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false);
      clickGuardRef.current = false;
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
      isShielded: false
    };
    if (pieceType === 'queen') {
        boardToUpdate[row][col].piece!.level = Math.min(currentLevelOfPieceOnSquare, 7);
    }


    setLastMoveTo(promotionSquare);
    setIsMoveProcessing(true);
    clickGuardRef.current = true;
    setAnimatedSquareTo(promotionSquare);
    
    audioManager.playLevelUp();

    setBoard(boardToUpdate);

    setTimeout(() => {
      const oldStreak = killStreaks[pawnColor] || 0;
      let currentStreakForPromotingPlayer = oldStreak;

      if (isResurrectionPromotionInProgress) {
        toast({ title: "Resurrected Piece Promoted!", description: `${getPlayerDisplayName(playerForPostResurrectionPromotion!)}'s ${promotingFromType} on ${promotionSquare} promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 8000 });
        currentStreakForPromotingPlayer = killStreaks[playerForPostResurrectionPromotion!] || 0;
        processMoveEnd(boardToUpdate, playerForPostResurrectionPromotion!, isExtraTurnForPostResurrectionPromotion, enPassantTargetSquare);
        setIsResurrectionPromotionInProgress(false);
        setPlayerForPostResurrectionPromotion(null);
        setIsExtraTurnForPostResurrectionPromotion(false);
      } else {
        toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 8000 });

        const pieceLevelForExtraTurnCheck = promotionPawnOriginalLevel || 1;
        const pawnLevelGrantsExtraTurn = pieceLevelForExtraTurnCheck >= 5;
        
        const hasTriggeredShield = shieldContext !== null;
        const hasTriggeredAnvil = anvilDropContext !== null;
        const hasTriggeredSnipe = archerSnipeContext !== null;

        const streakGrantsExtraTurn = currentStreakForPromotingPlayer >= 6;
        const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;

        let enteringSpecialMode = false;
        
        if (hasTriggeredShield) {
            enteringSpecialMode = true;
            const updatedShieldCtx = {
                boardForNextStep: boardToUpdate,
                playerWhoseTurnCompleted: pawnColor,
                isExtraTurn: combinedExtraTurn,
                newEnPassantTarget: enPassantTargetSquare,
                capturingPieceId: boardToUpdate[row][col].piece?.id
            };
            setShieldContext(updatedShieldCtx);
            if (isPawnPromotingMove) {
            } else {
                setIsAwaitingHolyShield(true);
                setGameInfo(prev => ({...prev, message: "HOLY SHIELD! Select an ally to protect."}));
            }
        }

        if (!enteringSpecialMode && hasTriggeredSnipe) {
            enteringSpecialMode = true;
            const updatedSnipeCtx = {
                boardForNextStep: boardToUpdate,
                playerWhoseTurnCompleted: pawnColor,
                isExtraTurn: combinedExtraTurn,
                newEnPassantTarget: enPassantTargetSquare,
            };
            setArcherSnipeContext(updatedSnipeCtx);
            setIsAwaitingArcherSnipe(true);
            setGameInfo(prev => ({...prev, message: "ARCHER SNIPE! Select Level 1 enemy to capture."}));
        }

        if (!enteringSpecialMode && (hasTriggeredAnvil || anvilDropAfterPromotion)) {
            setAnvilDropAfterPromotion(false);
            enteringSpecialMode = true;
            const updatedAnvilDropCtx = {
                boardForNextStep: boardToUpdate,
                playerWhoseTurnCompleted: pawnColor,
                isExtraTurn: combinedExtraTurn,
                newEnPassantTarget: enPassantTargetSquare,
            };
            setAnvilDropContext(updatedAnvilDropCtx);
            setIsAwaitingAnvilDrop(true);
            setPlayerToDropAnvil(pawnColor);
            setGameInfo(prev => ({...prev, message: `KILL STREAK REACHED! Place an anvil.`}));
        }

        if (!enteringSpecialMode) {
            let sacrificeNeeded = false;

            if (pieceType === 'queen') {
              sacrificeNeeded = processPawnSacrificeCheck(boardToUpdate, pawnColor, moveThatLedToPromotion, currentLevelOfPieceOnSquare, combinedExtraTurn, enPassantTargetSquare);
            } else if (pieceType === 'rook' || pieceType === 'palace') {
              if (promotionMoveWasCapture) { 
                const newRookLevel = Number(boardToUpdate[row][col].piece!.level || 1);
                if (newRookLevel >= 4) { 
                  const { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed: aiPromoRookResPerformed, resurrectedPieceData: aiPromoRookPieceData, resurrectedSquareAlg: aiPromoRookSquareAlg, newResurrectionIdCounter: aiPromoRookIdCounter } = processRookResurrectionCheck(
                    boardToUpdate, pawnColor, moveThatLedToPromotion, promotionSquare, 
                    0, 
                    capturedPieces, uniqueIdCounterRef.current
                  );
                  if (aiPromoRookResPerformed) {
                    boardToUpdate = boardWithResurrection;
                    setCapturedPieces(capturedPiecesAfterResurrection);
                    uniqueIdCounterRef.current = aiPromoRookIdCounter!;
                    setBoard(boardToUpdate);
                    addEffect('light-beam', aiPromoRookSquareAlg!);
                    audioManager.playResurrect();
                    setResurrectedSquares(prev => [...prev, { square: aiPromoRookSquareAlg!, player: pawnColor }]);
                    toast({ title: `AI ${pieceType === 'palace' ? 'Master' : 'Rook'}'s Call (Post-Promo)!`, description: `${getPlayerDisplayName(currentPlayer)} (AI)'s new ${pieceType} resurrected their ${aiPromoRookPieceData!.type} to ${aiPromoRookSquareAlg!}! (L${aiPromoRookPieceData!.level})`, duration: 8000 });
                    setVcnLog(prev => [...prev, `+^${getVCNChar(aiPromoRookPieceData!.type)}(L${aiPromoRookPieceData!.level})@${aiPromoRookSquareAlg!}`]);
                  }
                }
              }
            }

            if (!sacrificeNeeded && !isAwaitingPawnSacrifice && !isResurrectionPromotionInProgress && !isAwaitingCommanderPromotion) {
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
      clickGuardRef.current = false;
    }, 800);
  }, [
    board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, processRookResurrectionCheck,
    isMoveProcessing, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves,
    setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, capturedPieces, setCapturedPieces, setPlayerToPromote,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, processMoveEnd, setLastMoveTo,
    isAwaitingCommanderPromotion, enPassantTargetSquare,
    onlineStatus, currentPlayer, isWhiteAI, isBlackAI, localPlayerColor, promotionMoveWasCapture, setPromotionMoveWasCapture, promotionPawnOriginalLevel,
    setResurrectedSquares, addEffect, anvilDropAfterPromotion, anvilDropContext, isAwaitingHolyShield, isAwaitingArcherSnipe, shieldContext, archerSnipeContext
  ]);


  const performAiMove = async () => {
    let enPassantTargetForNextTurn: AlgebraicSquare | null = null;
    let levelFromAIApplyMove: number | undefined;

    const currentAiInstance = aiInstanceRef.current;
    
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

    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) {
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
      let sacrificeNeededForAIQueen = false;
      


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

        if (!aiMoveDataFromVibeAI || !aiMoveDataFromVibeAI.from || !aiMoveDataFromVibeAI.to ||
            !Array.isArray(aiMoveDataFromVibeAI.from) || aiMoveDataFromVibeAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromVibeAI.to) || aiMoveDataFromVibeAI.to.length !== 2) {
            continue; 
        }

        aiFromAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.from[0], aiMoveDataFromVibeAI.from[1]);
        aiToAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.to[0], aiMoveDataFromVibeAI.to[1]);
        const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromVibeAI.from[0]]?.[aiMoveDataFromVibeAI.from[1]];
        pieceOnFromSquareForAI = pieceDataAtFromAI?.piece || null;
        originalPieceLevelForAI = Number(pieceOnFromSquareForAI?.level || 1);

        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
            continue; 
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


      if (!isAiMoveActuallyLegal) { 
        toast({ title: "AI Recalibrating...", description: "AI suggested an invalid move, picking any valid move.", duration: 8000 });
        
        let foundFallbackMove = false;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const fbSquareState = finalBoardStateForAI[r]?.[c];
            if (fbSquareState?.piece?.color === currentPlayer) {
              const fromAlg = coordsToAlgebraic(r, c);
              const legalMoves = getPossibleMoves(finalBoardStateForAI, fromAlg, enPassantTargetSquare);
              
              if (legalMoves.length > 0) {
                const chosenDefinitiveMoveAlg = legalMoves[0];
                const newToCoords = algebraicToCoords(chosenDefinitiveMoveAlg);
                let overrideMoveType: AIMoveType['type'] = 'move';
                const targetSquareForOverride = finalBoardStateForAI[newToCoords.row]?.[newToCoords.col];
                if (targetSquareForOverride?.piece) {
                    overrideMoveType = 'capture';
                }
                let promoteToOverrideType: PieceType | undefined = undefined;
                if ((fbSquareState.piece!.type === 'pawn' || fbSquareState.piece!.type === 'commander') && newToCoords.row === (currentPlayer === 'white' ? 0 : 7)) {
                    overrideMoveType = 'promotion';
                    promoteToOverrideType = fbSquareState.piece!.type === 'commander' ? 'hero' : 'queen';
                }

                aiFromAlg = fromAlg;
                aiToAlg = chosenDefinitiveMoveAlg;
                aiMoveDataFromVibeAI = { from: [r,c], to: [newToCoords.row, newToCoords.col], type: overrideMoveType, promoteTo: promoteToOverrideType };
                isAiMoveActuallyLegal = true;
                foundFallbackMove = true;
                break; 
              }
            }
          }
          if (foundFallbackMove) break; 
        }

        if (!foundFallbackMove) {
          aiErrorOccurredRef.current = true;
        }
      }


      if (!aiErrorOccurredRef.current && aiMoveDataFromVibeAI && aiFromAlg && aiToAlg) {
        const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
        const { row: aiFromR, col: aiFromC } = algebraicToCoords(aiFromAlg as AlgebraicSquare);

        saveStateToHistory();
        let aiMoveType = (aiMoveDataFromVibeAI.type || 'move') as Move['type'];
        let aiPromoteTo = aiMoveDataFromVibeAI.promoteTo as PieceType | undefined;

        setLastMoveFrom(aiFromAlg as AlgebraicSquare);
        setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
        setIsMoveProcessing(true);
        clickGuardRef.current = true;
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
        
        if (moveForApplyMoveAI.type === 'self-destruct') {
          const { row: cR, col: cC } = algebraicToCoords(aiFromAlg as AlgebraicSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          audioManager.playExplosion();
        }

        const applyMoveResult = applyMove(finalBoardStateForAI, moveForApplyMoveAI, enPassantTargetSquare);
        const { newBoard, capturedPiece, selfDestructCaptures, destroyedAnvils, ...rest } = applyMoveResult;
        
        if (capturedPiece || (selfDestructCaptures && selfDestructCaptures.length > 0)) {
           const pieceThatMadeTheMoveAI = newBoard[aiToR]?.[aiToC]?.piece;
           if (pieceThatMadeTheMoveAI && pieceThatMadeTheMoveAI.type === 'infiltrator') audioManager.playObliterate();
           else audioManager.playCapture();
        } else if (moveForApplyMoveAI.type === 'castle') {
           audioManager.playMove();
        } else if (moveForApplyMoveAI.type !== 'self-destruct') {
           audioManager.playMove();
        }

        finalBoardStateForAI = newBoard;
        
        enPassantTargetForNextTurn = rest.enPassantTargetSet;
        levelFromAIApplyMove = rest.originalPieceLevel;
        selfCheckByAIPushBack = rest.selfCheckByPushBack;
        aiAnvilPushedOff = rest.anvilPushedOffBoard;
        queenLevelReducedEventsAI = rest.queenLevelReducedEvents;
        aiBecameInfiltrator = rest.promotedToInfiltrator || false;
        aiGameWonByInfiltration = rest.infiltrationWin || false;
        aiExtraTurn = rest.extraTurn || false;

        if (selfDestructCaptures && selfDestructCaptures.length > 0) {
            finalCapturedPiecesForAI[currentPlayer].push(...selfDestructCaptures);
        }

        if (rest.rallyCryTriggered) {
            addEffect('shockwave', rest.rallyCryTriggered.square, rest.rallyCryTriggered.color);
            audioManager.playRally();
        }

        if (aiBecameInfiltrator) {
            toast({ title: "AI Infiltrator!", description: `AI's pawn promoted to an Infiltrator!`, duration: 8000 });
        }


        if (aiGameWonByInfiltration) {
            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);
            toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, duration: 8000 });
            setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
            setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); 
            addToVCN(moveForApplyMoveAI, applyMoveResult, currentPlayer, aiExtraTurn);
            return;
        }

        if (rest.shroomConsumed) {
            const movedPieceDataAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
                if(movedPieceDataAI) {
                audioManager.playShroom();
                audioManager.playLevelUp();
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
        
        if (rest.pieceCapturedByAnvil) {
            if (pieceOnFromSquareForAI?.type !== 'infiltrator') {
                finalCapturedPiecesForAI[currentPlayer].push({ ...rest.pieceCapturedByAnvil, id: `${rest.pieceCapturedByAnvil.id}_cap_anvil_ai_${Date.now()}` });
            }
            audioManager.playObliterate();
            toast({ title: "AI Anvil Crush!", description: `AI's Pawn push made an Anvil capture a ${rest.pieceCapturedByAnvil.type}!`, duration: 8000 });
        }
        if (aiAnvilPushedOff) {
            toast({ title: "AI Anvil Removed!", description: "AI Anvil pushed off by AI.", duration: 8000 });
        }
        
        if (destroyedAnvils && destroyedAnvils > 0) {
             toast({ title: "AI Smashes Anvils!", description: `${destroyedAnvils} anvil${destroyedAnvils > 1 ? 's' : ''} destroyed.`, duration: 8000 });
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
            clickGuardRef.current = false;
            setIsAiThinking(false);
            setSelectedSquare(null); setPossibleMoves([]);
            setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
            if (onlineStatus === 'connected') {
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'forfeit-timeout', winner: opponentPlayer, timedOutPlayer: currentPlayer, reason: 'self-check' }));
              }
            }
            return;
          }
          toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiFromAlg} to ${aiToAlg}`, duration: 1000 });

          if (capturedPiece) { 
            const pieceThatMadeTheMoveAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            if (pieceThatMadeTheMoveAI && pieceThatMadeTheMoveAI.type === 'infiltrator') {
            } else {
                audioManager.playLevelUp();
                finalCapturedPiecesForAI[currentPlayer].push({ ...capturedPiece, id: `${capturedPiece.id}_cap_ai_${Date.now()}` });
            }
          }

          if (rest.conversionEvents && rest.conversionEvents.length > 0) {
            rest.conversionEvents.forEach(event => {
                addEffect('conversion', event.at, event.byPiece.color);
                if (event.originalPiece.color !== event.convertedPiece.color) {
                  audioManager.playConversion();
                  toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 });
                }
            });
          }

        if(!aiErrorOccurredRef.current) {
            const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            let capturesThisTurnAI = 0;
            if (capturedPiece) capturesThisTurnAI++;
            if (rest.pieceCapturedByAnvil) capturesThisTurnAI++;
            if (selfDestructCaptures) capturesThisTurnAI += selfDestructCaptures.length;
            
            const oldStreakForAI = killStreaks[currentPlayer] || 0;
            const newStreakForAI = capturesThisTurnAI > 0 ? (oldStreakForAI + capturesThisTurnAI) : 0;

            if (capturesThisTurnAI > 0) {
                setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreakForAI }));
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
            } else {
                if (killStreaks[currentPlayer] > 0) {
                    setKillStreaks(prev => ({...prev, [currentPlayer]: 0}));
                }
            }
            
            let enteringSpecialModeAI = false;
            
            if (newStreakForAI >= 2 && oldStreakForAI < 2) {
                 const hasArchbishopAI = finalBoardStateForAI.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === currentPlayer);
                 if (hasArchbishopAI) {
                     enteringSpecialModeAI = true;
                     const alliesToShield = [];
                     const capturingPieceIdAI = finalBoardStateForAI[aiToR][aiToC].piece?.id;
                     for (let r_sh = 0; r_sh < 8; r_sh++) {
                         for (let c_sh = 0; c_sh < 8; c_sh++) {
                             const sq_sh = finalBoardStateForAI[r_sh][c_sh];
                             if (sq_sh.piece && sq_sh.piece.color === currentPlayer && sq_sh.piece.type !== 'king' && sq_sh.piece.type !== 'queen' && sq_sh.piece.id !== capturingPieceIdAI) {
                                 alliesToShield.push({ piece: sq_sh.piece, r: r_sh, c: c_sh });
                             }
                         }
                     }
                     if (alliesToShield.length > 0) {
                         const shieldChoice = alliesToShield[Math.floor(Math.random() * alliesToShield.length)];
                         finalBoardStateForAI.forEach(row_sh => row_sh.forEach(sq_sh => {
                             if (sq_sh.piece?.id === shieldChoice.piece.id) sq_sh.piece.isShielded = true;
                         }));
                         const targetAlg = coordsToAlgebraic(shieldChoice.r, shieldChoice.c);
                         audioManager.playShield();
                         toast({ title: "AI Holy Shield!", description: `AI shielded their ${shieldChoice.piece.type}!` });
                         
                         setVcnLog(prev => [...prev, `🛡️@${targetAlg}`]);
                     }
                 }
            }

            if (!enteringSpecialModeAI && oldStreakForAI < 3 && newStreakForAI >= 3) {
                enteringSpecialModeAI = true;
                const emptySquares: [number, number][] = [];
                for (let r_anvil = 0; r_anvil < 8; r_anvil++) for (let c_anvil = 0; c_anvil < 8; c_anvil++) if (!finalBoardStateForAI[r_anvil][c_anvil].piece && !finalBoardStateForAI[r_anvil][c_anvil].item) emptySquares.push([r_anvil, c_anvil]);
                if (emptySquares.length > 0) {
                    const oppKingPos = findKing(finalBoardStateForAI, opponentPlayer);
                    let bestAnvilCoords: [number, number];
                    if (oppKingPos) {
                      emptySquares.sort((a,b) => {
                        return (Math.abs(a[0] - oppKingPos.row) + Math.abs(a[1] - oppKingPos.col)) - (Math.abs(b[0] - oppKingPos.row) + Math.abs(b[1] - oppKingPos.col));
                      });
                      bestAnvilCoords = emptySquares[0];
                    } else {
                      bestAnvilCoords = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                    }
                    finalBoardStateForAI[bestAnvilCoords[0]][bestAnvilCoords[1]].item = { type: 'anvil' };
                    const anvilAlg = coordsToAlgebraic(bestAnvilCoords[0], bestAnvilCoords[1]);
                    audioManager.playAnvil();
                    toast({ title: "AI Anvil Drop!", description: `AI placed an anvil on ${anvilAlg}.`});
                    setVcnLog(prev => [...prev, `+[A]@${anvilAlg}`]);
                }
            }

            if (capturesThisTurnAI > 0) {
                if (!firstBloodAchieved) {
                    setFirstBloodAchieved(true);
                    setPlayerWhoGotFirstBlood(currentPlayer);
                    localAIAwaitingCommanderPromo = true;
                }
                
                if (oldStreakForAI < 4 && newStreakForAI >= 4) {
                  const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                  let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                  if (piecesOfAICapturedByOpponent.length > 0) {
                      const pieceToResurrectOriginalOriginalAI = piecesOfAICapturedByOpponent.pop();
                      if (pieceToResurrectOriginalOriginalAI) {
                      const emptySqAI: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForAI[r_idx]?.[c_idx]?.piece && !finalBoardStateForAI[r_idx]?.[c_idx]?.item) emptySqAI.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySqAI.length > 0) {
                          const randSqAI_alg = emptySqAI[Math.floor(Math.random() * emptySqAI.length)];
                          const { row: resRAI, col: resCAI } = algebraicToCoords(randSqAI_alg);
                          const resurrectedAI: Piece = { ...pieceToResurrectOriginalOriginalAI, level: 1, id: `${pieceToResurrectOriginalOriginalAI.id}_res_${uniqueIdCounterRef.current++}`, hasMoved: pieceToResurrectOriginalOriginalAI.type === 'king' || pieceToResurrectOriginalOriginalAI.type === 'rook' || pieceToResurrectOriginalOriginalAI.type === 'palace' ? false : pieceToResurrectOriginalOriginalAI.hasMoved, invulnerableTurnsRemaining: 0, isShielded: false, heldItem: null };

                          const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                          if (resurrectedAI.type === 'commander' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'hero';
                              resurrectedAI.id = `${resurrectedAI.id}_HeroPromo_Res_AI`;
                               toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander resurrected and promoted to Hero! (L1)`, duration: 8000 });
                          } else if (resurrectedAI.type === 'pawn' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'queen'; 
                              resurrectedAI.id = `${resurrectedAI.id}_QueenPromo_Res_AI`;
                               toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 8000 });
                          } else {
                               toast({ title: "AI Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 8000 });
                          }
                          finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                          addEffect('light-beam', randSqAI_alg);
                          audioManager.playResurrect();
                          setResurrectedSquares(prev => [...prev, { square: randSqAI_alg, player: currentPlayer }]);
                          finalCapturedPiecesForAI[opponentColorAI] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginalOriginalAI.id);
                          setVcnLog(prev => [...prev, `+^${getVCNChar(resurrectedAI.type)}(L${resurrectedAI.level})@${randSqAI_alg}`]);
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
                        audioManager.playLevelUp();
                        setVcnLog(prev => [...prev, `[Promo-C]@${coordsToAlgebraic(pawnR, pawnC)}`]);
                    }
                }
            }


            const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            let aiRookResData: RookResurrectionResult | null = null;

            if (aiMovedPieceOnToSquare &&
                (aiMovedPieceOnToSquare.type === 'rook' || aiMovedPieceOnToSquare.type === 'palace' || (moveForApplyMoveAI!.type === 'promotion' && (moveForApplyMoveAI!.promoteTo === 'rook' || moveForApplyMoveAI!.promoteTo === 'palace'))) &&
                moveForApplyMoveAI!.type !== 'self-destruct' &&
                (capturedPiece || rest.pieceCapturedByAnvil) 
            ) {
              const oldLevelForAIResCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI;
              aiRookResData = processRookResurrectionCheck(
                  finalBoardStateForAI,
                  currentPlayer,
                  moveForApplyMoveAI as Move,
                  aiToAlg as AlgebraicSquare,
                  oldLevelForAIResCheck,
                  finalCapturedPiecesForAI,
                  uniqueIdCounterRef.current
              );
              if (aiRookResData.resurrectionPerformed) {
                  finalBoardStateForAI = aiRookResData.boardWithResurrection;
                  finalCapturedPiecesForAI = aiRookResData.capturedPiecesAfterResurrection;
                  uniqueIdCounterRef.current = aiRookResData.newResurrectionIdCounter!;
                  addEffect('light-beam', aiRookResData!.resurrectedSquareAlg!);
                  audioManager.playResurrect();
                  setResurrectedSquares(prev => [...prev, { square: aiRookResData!.resurrectedSquareAlg!, player: currentPlayer }]);
                  const resType = aiMovedPieceOnToSquare.type === 'palace' ? 'Master' : 'Rook\'s';
                  toast({ title: `AI ${resType} Call!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected their ${aiRookResData.resurrectedPieceData!.type} to ${aiRookResData.resurrectedSquareAlg!}! (L${aiRookResData.resurrectedPieceData!.level})`, duration: 8000 });
                  setVcnLog(prev => [...prev, `+^${getVCNChar(aiRookResData!.resurrectedPieceData!.type)}(L${aiRookResData!.resurrectedPieceData!.level})@${aiRookResData!.resurrectedSquareAlg!}`]);

                  if (aiRookResData.promotionRequiredForResurrectedPawn) {
                        const { row: promoR_AI, col: promoC_AI } = algebraicToCoords(aiRookResData.resurrectedSquareAlg!);
                        const resurrectedPawnOnBoardAI = finalBoardStateForAI[promoR_AI]?.[promoC_AI]?.piece;
                        if (resurrectedPawnOnBoardAI && resurrectedPawnOnBoardAI.type === 'pawn') {
                            resurrectedPawnOnBoardAI.type = 'queen'; 
                            resurrectedPawnOnBoardAI.id = `${resurrectedPawnOnBoardAI.id}_resPromo_Q_AI`;
                            toast({ title: "AI Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L${resurrectedPawnOnBoardAI.level})`, duration: 8000 });
                        }
                  }
              }
            }

            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);
            
            if (moveForApplyMoveAI!.type === 'self-destruct') {
              setVcnLog(prev => [...prev, `${getVCNChar(pieceOnFromSquareForAI!.type)}(L${pieceOnFromSquareForAI!.level})${aiFromAlg}!!!@${aiFromAlg}${aiExtraTurn ? '!!' : ''}`]);
            } else {
              addToVCN(moveForApplyMoveAI!, applyMoveResult, currentPlayer, aiExtraTurn);
            }

            setTimeout(() => {
              const pieceAtDestinationAI = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
              const rankCheckRowAI = currentPlayer === 'white' ? 0 : 7;
              const isAIPawnPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'pawn' && aiToR === rankCheckRowAI && moveForApplyMoveAI!.type !== 'self-destruct';
              const isAICommanderPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'commander' && aiToR === rankCheckRowAI && moveForApplyMoveAI!.type !== 'self-destruct';

              let extraTurnForThisAIMove = aiExtraTurn || (oldStreakForAI < 6 && newStreakForAI >= 6);

              const originalLevelOfAIMovedPieceForPromoCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI || 1;


              if (isAIPawnPromoting) {
                  const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen'; 

                  const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                  if(finalBoardStateForAI[promoR][promoC].piece && finalBoardStateForAI[promoR][promoC].piece!.type === 'pawn') {
                      finalBoardStateForAI[promoR][promoC].piece!.type = promotedTypeAI;
                      finalBoardStateForAI[promoR][promoC].piece!.level = pieceAtDestinationAI!.level; 
                      finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_promo_${promotedTypeAI}`;
                      audioManager.playLevelUp();
                      setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                  }
                  toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L${finalBoardStateForAI[promoR][promoC].piece!.level})`, duration: 8000 });

                  if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;
                  
                  const pieceAfterAIPromo = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;

                  if (pieceAfterAIPromo?.type === 'queen') {
                    sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, finalBoardStateForAI[promoR][promoC].piece!.level, extraTurnForThisAIMove, enPassantTargetForNextTurn);
                  }

              } else if (isAICommanderPromoting) {
                    const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                    if(finalBoardStateForAI[promoR]?.[promoC]?.piece?.type === 'commander') {
                        finalBoardStateForAI[promoR][promoC].piece!.type = 'hero';
                        finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_HeroPromo_AI`;
                        audioManager.playLevelUp();
                        setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                    }
                    toast({ title: `AI Commander Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander promoted to Hero! (L${originalLevelOfAIMovedPieceForPromoCheck})`, duration: 8000 });
                    if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;
              } else if (pieceAtDestinationAI?.type === 'queen') {
                 sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, levelFromAIApplyMove, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              } 

              if (localAIAwaitingCommanderPromo) {
                processMoveEnd(finalBoardStateForAI, currentPlayer, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              } else if (!sacrificeNeededForAIQueen) {
                  processMoveEnd(finalBoardStateForAI, currentPlayer, extraTurnForThisAIMove, enPassantTargetForNextTurn);
              }

              setIsMoveProcessing(false);
              clickGuardRef.current = false;
              setIsAiThinking(false);
            }, 800);
        }
      }
    } catch (error) {
      console.error("[AI_LOOP] Uncaught exception in performAiMove:", error);
      aiErrorOccurredRef.current = true;
    }

    if (aiErrorOccurredRef.current) {
      toast({
        title: `AI Error/Forfeit`,
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
          setGameInfo(prev => ({ ...prev, message: `AI Forfeits. ${getPlayerDisplayName(opponentPlayer!)} wins!`, gameOver: true, winner: opponentPlayer }));
      }
  
      if (currentPlayer === 'white') setIsWhiteAI(false);
      else setIsBlackAI(false);
  
      setIsMoveProcessing(false);
      clickGuardRef.current = false;
      setIsAiThinking(false);
      return;
    }
  };


  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI && onlineStatus === 'disconnected') || (currentPlayer === 'black' && isBlackAI && onlineStatus === 'disconnected');
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isResurrectionPromotionInProgress && !isAwaitingAnvilDrop && !isAwaitingHolyShield && !isAwaitingArcherSnipe && !isAwaitingWindScrollTarget && !isAwaitingAnvilScrollTarget) {
        if (!isAwaitingCommanderPromotion || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)) {
             performAiMove();
        }
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, onlineStatus, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget]);

  useEffect(() => {
    if (!board || positionHistory.length > 0) return;
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights, enPassantTargetSquare);
    if (initialHash) {
      setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory, enPassantTargetSquare]);

  useEffect(() => {
    if (gameInfo.gameOver && gameInfo.winner) {
        const isHumanWinner = () => {
          if (gameInfo.winner === 'draw') return false;
          if (onlineStatus !== 'disconnected') {
            return gameInfo.winner === localPlayerColor;
          }
          if (gameInfo.winner === 'white') return !isWhiteAI;
          if (gameInfo.winner === 'black') return !isBlackAI;
          return false;
        };

        if (isHumanWinner()) audioManager.playVictory();
        else if (gameInfo.winner !== 'draw') audioManager.playDefeat();

        const isResignation = gameInfo.message.includes('resigned');
        const hasPrimaryAnnouncement = !isResignation && (gameInfo.isCheckmate || gameInfo.isInfiltrationWin || gameInfo.isStalemate || gameInfo.isThreefoldRepetitionDraw);
        const delay = hasPrimaryAnnouncement ? 2700 : (isResignation ? 1000 : 1500);
        const timerId = setTimeout(() => {
             setShowSummary(true);
             if (localPlayerColor !== null) {
                if (gameInfo.winner === localPlayerColor) {
                    setShowWinScreen(true);
                } else if (gameInfo.winner !== 'draw' && gameInfo.winner !== undefined) {
                    setShowLossScreen(true);
                }
            }
        }, delay + 1000);
        return () => clearTimeout(timerId);
    } else {
      setShowWinScreen(false);
      setShowLossScreen(false);
      setShowSummary(false);
    }
  }, [gameInfo.gameOver, gameInfo.winner, gameInfo.message, localPlayerColor, onlineStatus, isWhiteAI, isBlackAI]);

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
          setShowCheckFlashBackground(true);
          setCheckFlashBackgroundKey(k => k + 1);
          audioManager.playCheck();
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
    const { white: currentWhite, black: currentBlack } = killStreaks;

    if (firstBloodAchieved && !firstBloodFlashedRef.current) {
        setFlashMessage("FIRST BLOOD!");
        setFlashMessageKey(k => k + 1);
        firstBloodFlashedRef.current = true;
        toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(playerWhoGotFirstBlood!)} can promote a Level 1 Pawn to Commander!`, duration: 8000 });
    } else {
        const { white: prevWhite, black: prevBlack } = prevKillStreaksRef.current;
        let playerWithNewStreak: PlayerColor | null = null;
        let newStreakValue = 0;
        
        if (currentWhite > prevWhite) { playerWithNewStreak = 'white'; newStreakValue = currentWhite; }
        else if (currentBlack > prevBlack) { playerWithNewStreak = 'black'; newStreakValue = currentBlack; }
        
        if (playerWithNewStreak) {
            const streakMsg = getKillStreakToastMessage(newStreakValue);
            if (streakMsg) {
                setKillStreakFlashMessage(streakMsg);
                setKillStreakFlashMessageKey(k => k + 1);
            }
        }
    }

    prevKillStreaksRef.current = { ...killStreaks };

  }, [killStreaks, firstBloodAchieved, getKillStreakToastMessage, playerWhoGotFirstBlood, getPlayerDisplayName, toast]);

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
          ws.send(payload);
      }
      return;
    }
    fullGameReset();
    toast({ title: "Game Reset", description: "The board has been reset.", duration: 8000 });
  }, [onlineStatus, localPlayerColor, toast, fullGameReset, gameInfo.gameOver]);

  const handleUndo = useCallback(() => {
    if (onlineStatus !== 'disconnected' || (isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) {
      toast({ title: "Undo Failed", description: "Undo is disabled in online games and during special turns.", duration: 8000 });
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
    let turnsToUndo = isAIGame ? 2 : 1;

    let playableStatesFound = 0;
    for (let i = historyStack.length - 1; i >= 0; i--) {
        const state = historyStack[i];
        if (state && !state.isAwaitingPawnSacrifice && !state.isAwaitingCommanderPromotion && !state.isResurrectionPromotionInProgress && !state.isAwaitingRookSacrifice && !state.isAwaitingAnvilDrop && !state.isAwaitingHolyShield && !state.isAwaitingArcherSnipe) {
            playableStatesFound++;
            if (playableStatesFound >= turnsToUndo) {
                targetIndex = i;
                break;
            }
        }
    }
    
    if (targetIndex === -1 && playableStatesFound > 0) {
        for (let i = historyStack.length - 1; i >= 0; i--) {
            const state = historyStack[i];
            if (state && !state.isAwaitingPawnSacrifice && !state.isAwaitingCommanderPromotion && !state.isResurrectionPromotionInProgress && !state.isAwaitingRookSacrifice && !state.isAwaitingAnvilDrop && !state.isAwaitingHolyShield && !state.isAwaitingArcherSnipe) {
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
      clickGuardRef.current = false;
      aiErrorOccurredRef.current = false;
      setHistoryStack(newHistoryStack);
      setPieceForInfoDisplay(null);

      setIsAwaitingPawnSacrifice(stateToRestore.isAwaitingPawnSacrifice);
      setPlayerToSacrificePawn(stateToRestore.playerToSacrificePawn);
      setBoardForPostSacrifice(stateToRestore.boardForPostSacrifice);
      setPlayerWhoGotFirstBlood(stateToRestore.playerWhoGotFirstBlood);
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

      setIsAwaitingHolyShield(stateToRestore.isAwaitingHolyShield || false);
      setShieldContext(stateToRestore.shieldContext || null);

      setIsAwaitingArcherSnipe(stateToRestore.isAwaitingArcherSnipe || false);
      setArcherSnipeContext(stateToRestore.archerSnipeContext || null);
      setInventory(stateToRestore.inventory || []);
      
      setVcnLog(prev => prev.slice(0, -turnsToUndo));

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
    setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, setIsExtraTurnFromQueenMove,
    setIsAwaitingRookSacrifice, setPlayerToSacrificeForRook, setRookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, setIsExtraTurnFromRookLevelUp,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setGameMoveCounter,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion,
    setShroomSpawnCounter, setNextShroomSpawnTurn,
    onlineStatus, setPromotionMoveWasCapture, setPromotionPawnOriginalLevel,
    setResurrectedSquares, playerWhoGotFirstBlood, setEnPassantTargetSquare, isAwaitingAnvilDrop,
    isAwaitingHolyShield, shieldContext, isAwaitingArcherSnipe, archerSnipeContext,
    isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget
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
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, toast, onlineStatus]); 

  const handleToggleBlackAI = useCallback(() => {
     if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing || onlineStatus !== 'disconnected') {
      if(onlineStatus !== 'disconnected') toast({ title: "AI Control Disabled", description: "Cannot enable/disable AI during an online game.", duration: 8000 });
      return;
    }
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(!isBlackAI);
    toast({ title: `Black AI ${!isBlackAI ? 'On' : 'Off'}`, duration: 1000 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, toast, onlineStatus]);

  const handlePieceHover = useCallback((piece: Piece | null) => {
    setPieceForInfoDisplay(piece);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payload = {
        type: 'chat-message',
        sender: userData?.username || user?.displayName || 'Anonymous',
        text,
        color: localPlayerColor
      };
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [userData, user, localPlayerColor]);

  const handleIncomingData = useCallback((data: any) => {
      switch (data.type) {
        case 'chat-message':
            setChatMessages(prev => [...prev, data.message]);
            if (!isMessengerOpenRef.current && data.message.color !== localPlayerColorRef.current) {
                setHasUnreadMessages(true);
            }
            break;
        case 'promotion-required': {
            const { square, player } = data;
            
            applyServerGameState(data.fullGameState);
            setIsMoveProcessing(false);
            clickGuardRef.current = false;

            if (player === localPlayerColor) {
                setPlayerToPromote(player);
                setIsPromotingPawn(true);
                setPromotionSquare(square);
                setIsResurrectionPromotionInProgress(!!data.fullGameState.promotionContext?.fromResurrection);
            }
            break;
        }
        case 'awaiting-archer-snipe': {
            const { fullGameState, player } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false); 
            clickGuardRef.current = false;

            setIsAwaitingArcherSnipe(true);
            if (player === localPlayerColor) {
              setGameInfo(prev => ({...prev, message: "ARCHER SNIPE! Select Level 1 enemy."}));
            } else {
              setGameInfo(prev => ({...prev, message: `ARCHER SNIPE! ${getPlayerDisplayName(player)} is aiming...`}));
            }
            break;
        }
        case 'awaiting-shield-selection': {
            const { fullGameState, player } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false); 
            clickGuardRef.current = false;

            setIsAwaitingHolyShield(true);
            if (player === localPlayerColor) {
              setGameInfo(prev => ({...prev, message: "HOLY SHIELD! Select an ally to protect."}));
            } else {
              setGameInfo(prev => ({...prev, message: `HOLY SHIELD! ${getPlayerDisplayName(player)} is shielding an ally...`}));
            }
            break;
        }
        case 'awaiting-anvil-drop': {
            const { fullGameState, player } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false); 
            clickGuardRef.current = false;

            setIsAwaitingAnvilDrop(true);
            setPlayerToDropAnvil(player);
            if (player === localPlayerColor) {
              setGameInfo(prev => ({...prev, message: "KILL STREAK REACHED! Place an anvil."}));
            } else {
              setGameInfo(prev => ({...prev, message: `KILL STREAK REACHED! ${getPlayerDisplayName(player)} is placing an anvil.`}));
            }
            break;
        }
        case 'commander-promo-finalized': {
            applyServerGameState(data.fullGameState, data.lastPlayer);
            break;
        }
        case 'game-move': {
            const lastLog = data.fullGameState?.lastVCNMove;
            if (lastLog) setVcnLog(prev => [...prev, lastLog]);
            
            applyServerGameState(data.fullGameState, data.lastPlayer);
            setIsAwaitingAnvilDrop(false);
            setPlayerToDropAnvil(null);
            setIsAwaitingArcherSnipe(false);
            setIsAwaitingHolyShield(false);
            
            if (data.conversionEvents && data.conversionEvents.length > 0) {
              data.conversionEvents.forEach((event: ConversionEvent) => {
                addEffect('conversion', event.at, event.byPiece.color);
                if (event.originalPiece.color !== event.convertedPiece.color) {
                  audioManager.playConversion();
                  toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 8000 });
                }
              });
            }
            break;
        }
        case 'awaiting-commander-promo': {
            const { fullGameState } = data;
            if (!fullGameState) return;

            applyServerGameState(fullGameState);
            setIsMoveProcessing(false);
            clickGuardRef.current = false;

            setIsAwaitingCommanderPromotion(true);
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
            audioManager.playShroom();
            toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
            setVcnLog(prev => [...prev, `[Spawn]🍄@${square}`]);
            break;
        }
        case 'forfeit-timeout':
        case 'game-over':
        case 'resign': {
            const { winner, reason, timedOutPlayer, resigningPlayer, eloChanges } = data;
            let message = "";
            let isResignation = data.type === 'resign';

            if (data.type === 'resign') {
                setVcnLog(prev => [...prev, '[RS]']);
            } else if (reason === 'timeout' || reason === 'self-check-timeout') {
                setVcnLog(prev => [...prev, '[TO]']);
            }

            if (reason === 'checkmate') message = `Checkmate! ${getPlayerDisplayName(winner)} wins!`;
            else if (reason === 'stalemate') message = "Stalemate! It's a draw.";
            else if (reason === 'threefold-repetition') message = `Draw by Threefold Repetition!`;
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
                    const newWins = winner === localPlayerColor ? (playerEloChange.wins || 0) + 1 : (playerEloChange.wins || 0);
                    const newLosses = winner !== localPlayerColor && winner !== 'draw' ? (playerEloChange.losses || 0) + 1 : (playerEloChange.losses || 0);

                    toast({
                        title: `Ranked Match Complete! ELO: ${playerEloChange.newElo} (${eloChange > 0 ? '+' : ''}${eloChange})`,
                        description: `Wins: ${newWins}, Losses: ${newLosses}`,
                        duration: 8000,
                    });
                    
                    const userDocRef = doc(firestore, 'users', user.uid);
                    updateDocumentNonBlocking(userDocRef, {
                        eloRating: playerEloChange.newElo,
                        wins: newWins,
                        losses: playerEloChange.losses
                    });
                }
            }
            setIsRankedGame(false);
            setIsMoveProcessing(false);
            clickGuardRef.current = false;
            setAnimatedSquareTo(null);
            break;
        }
    }
  }, [localPlayerColor, toast, getPlayerDisplayName, isRankedGame, user, firestore, applyServerGameState, addEffect]);

  const handleOnlinePlay = useCallback(async (action: 'create' | 'join' | 'ranked') => {
    if (wsRef.current) {
      disconnectAndReset();
      return;
    }
  
    fullGameReset();

    setOnlineStatus('connecting');
  
    const getWebSocketUrl = () => {
      if (typeof window === 'undefined') return '';
      const hostname = window.location.hostname;
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
      const userInfo = user ? { 
        userId: user.uid, 
        username: userData?.username || user.displayName || 'Anonymous',
        elo: userData?.eloRating || 1200,
        wins: userData?.wins || 0,
        losses: userData?.losses || 0
      } : null;
      
      let payload;
      if (action === 'create') {
        payload = { type: 'create-room', user: userInfo };
      } else if (action === 'join' && inputRoomId) {
        payload = { type: 'join-room', roomId: inputRoomId, user: userInfo };
      } else if (action === 'ranked') {
          if(user) {
              setRankedQueueStatus('searching');
              payload = { 
                type: 'join-ranked-queue', 
                userId: user.uid, 
                username: userData?.username || user.displayName || 'Anonymous', 
                elo: userData?.eloRating || 1200,
                wins: userData?.wins || 0,
                losses: userData?.losses || 0
              };
          }
      }
      if (payload) {
          ws.send(JSON.stringify(payload));
      }
    };
  
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
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
            audioManager.playStart();
            toast({ title: "Player Joined!", description: "Your game is starting.", duration: 8000 });
            break;
          case 'room-joined':
            setRoomId(data.roomId);
            setLocalPlayerColor(data.color);
            applyServerGameState(data.gameState);
            setOnlineStatus('connected');
            audioManager.playStart();
            toast({ title: "Joined Room!", description: `Successfully joined room ${data.roomId}.`, duration: 8000 });
            break;
          case 'ranked-match-found':
              setRankedQueueStatus('idle');
              setRoomId(data.roomId);
              setLocalPlayerColor(data.color);
              applyServerGameState(data.gameState);
              setIsRankedGame(true);
              setOnlineStatus('connected');
              audioManager.playStart();
              toast({ title: "Ranked Match Found!", description: "Your ranked game is starting.", duration: 8000 });
              break;
          case 'opponent-disconnected':
            if (gameInfo.gameOver) return;
            const winningPlayer = localPlayerColor || (gamePlayers?.white?.userId === user?.uid ? 'white' : 'black');
            toast({ title: "Opponent Left", description: "Your opponent has disconnected. You win!", duration: 8000 });
            setGameInfo(prev => ({ ...prev, gameOver: true, winner: winningPlayer, message: "Opponent disconnected. You win!" }));
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
  
    ws.onclose = () => {
        if (wsRef.current) {
            wsRef.current = null;
            if (onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle') {
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

  const handleRankedPlay = () => {
    if (rankedQueueStatus === 'searching') {
        if(wsRef.current) {
            const payload = JSON.stringify({ type: 'leave-ranked-queue' });
            wsRef.current.send(payload);
        }
        setRankedQueueStatus('idle');
        disconnectAndReset();
        toast({ title: "Search Cancelled", description: "You have left the ranked queue.", duration: 8000 });
    } else {
        handleOnlinePlay('ranked');
    }
  }

  const handleVolumeChange = (val: number[]) => {
    const newVol = val[0];
    setVolume(newVol);
    audioManager.setVolume(newVol);
  };

  useEffect(() => {
    const initializeAI = () => {
      try {
        aiInstanceRef.current = new VibeChessAI(aiDifficulty);
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
  }, [toast, aiDifficulty]);


  useEffect(() => {
    setBoardOrientation(determineBoardOrientation());
  }, [determineBoardOrientation]);


  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopTurnTimer();
    };
  }, [stopTurnTimer]);


  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-1 lg:hidden">
      <div className="flex flex-col items-center justify-between flex-grow gap-1">
          <div className="w-full flex items-center justify-between">
              <div className="w-1/3"></div>
              <div className="w-1/3 flex items-center justify-center">
                  <img
                      src="/images/Vibe_Title.gif"
                      alt="VIBE CHESS"
                      className="h-10 w-auto object-contain"
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
              selectedSquare={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : selectedSquare}
              possibleMoves={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? [] : possibleMoves}
              enemySelectedSquare={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : enemySelectedSquare}
              enemyPossibleMoves={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? [] : enemyPossibleMoves}
              onSquareClick={handleSquareClick}
              playerColor={boardOrientation}
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={isInteractionDisabled}
              applyBoardOpacityEffect={applyBoardOpacityEffect}
              playerInCheck={gameInfo.playerWithKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              lastMoveFrom={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : lastMoveFrom}
              lastMoveTo={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : lastMoveTo}
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
              isInventoryOpen={isInventoryOpen}
              selectedInventoryItemType={selectedInventoryItemType}
              localPlayerColor={localPlayerColor}
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
              activeTimerPlayer={playerToDropAnvil === 'white' ? 'white' : activeTimerPlayer}
              chatMessages={chatMessages}
              onSendMessage={sendMessage}
              isMessengerOpen={isMessengerOpen}
              onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)}
              hasUnreadMessages={hasUnreadMessages}
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
            <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user} className="h-7 px-2 text-xs">
              <Package /> Items
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <Settings /> Settings
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-card border-border">
                <div className="space-y-6 py-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-pixel uppercase">SFX Volume</span>
                      <Volume2 className="h-4 w-4 text-primary" />
                    </div>
                    <Slider
                      defaultValue={[volume]}
                      max={200}
                      step={1}
                      onValueChange={handleVolumeChange}
                    />
                  </div>
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-pixel uppercase">AI Depth</span>
                      <BrainCircuit className="h-4 w-4 text-primary" />
                    </div>
                    <Slider
                      defaultValue={[aiDifficulty]}
                      min={2}
                      max={8}
                      step={1}
                      onValueChange={(val) => setAiDifficulty(val[0])}
                    />
                    <p className="text-[9px] text-muted-foreground italic leading-tight text-center">
                      The smarter the AI setting, the longer the AI takes to move.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Link href="/theater">
              <Button variant="outline" size="sm" aria-label="Open Theater Mode" className="h-7 px-2 text-xs">
                <MonitorPlay /> Theater
              </Button>
            </Link>
            <Link href="/dungeon" className={cn(!user && "pointer-events-none")}>
              <Button variant="outline" size="sm" aria-label="Start Dungeon Mode" className="h-7 px-2 text-xs" disabled={isAnyOnlineState || !user}>
                <Swords /> Dungeon
              </Button>
            </Link>
            <Link href="/leaderboard">
              <Button variant="outline" size="sm" aria-label="View Leaderboard" className="h-7 px-2 text-xs" disabled={isAnyOnlineState}>
                <Trophy /> L.board
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget} aria-label="Undo Move" className="h-7 px-2 text-xs">
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
              {onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}
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
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
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
            activeTimerPlayer={playerToDropAnvil === 'white' ? 'white' : activeTimerPlayer}
            chatMessages={chatMessages}
            onSendMessage={sendMessage}
            isMessengerOpen={isMessengerOpen}
            onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)}
            hasUnreadMessages={hasUnreadMessages}
        />
      </div>

      <div className="w-1/2 flex flex-col items-center gap-2">
        <div className="w-full flex items-center justify-center">
            <img
                src="/images/Vibe_Title.gif"
                alt="VIBE CHESS"
                className="h-16 w-auto object-contain"
            />
        </div>
        <div className={cn("text-center text-sm font-bold min-h-[1.25em]",
            gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse",
            (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse")
          )}>
           {gameInfo.message}
        </div>
        <div className="w-full max-lg">
          <ChessBoard
              boardState={board}
              selectedSquare={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : selectedSquare}
              possibleMoves={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? [] : possibleMoves}
              enemySelectedSquare={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : enemySelectedSquare}
              enemyPossibleMoves={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? [] : enemyPossibleMoves}
              onSquareClick={handleSquareClick}
              playerColor={boardOrientation}
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={isInteractionDisabled}
              applyBoardOpacityEffect={applyBoardOpacityEffect}
              playerInCheck={gameInfo.playerWithKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              lastMoveFrom={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : lastMoveFrom}
              lastMoveTo={(isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget) ? null : lastMoveTo}
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
              isInventoryOpen={isInventoryOpen}
              selectedInventoryItemType={selectedInventoryItemType}
              localPlayerColor={localPlayerColor}
          />
        </div>
      </div>

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
              <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user} className="h-7 px-2 text-xs">
                <Package /> Items
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                    <Settings /> Settings
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-card border-border">
                  <div className="space-y-6 py-2">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-pixel uppercase">SFX Volume</span>
                        <Volume2 className="h-4 w-4 text-primary" />
                      </div>
                      <Slider
                        defaultValue={[volume]}
                        max={200}
                        step={1}
                        onValueChange={handleVolumeChange}
                      />
                    </div>
                    <div className="space-y-4 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-pixel uppercase">AI Depth</span>
                        <BrainCircuit className="h-4 w-4 text-primary" />
                      </div>
                      <Slider
                        defaultValue={[aiDifficulty]}
                        min={2}
                        max={8}
                        step={1}
                        onValueChange={(val) => setAiDifficulty(val[0])}
                      />
                      <p className="text-[9px] text-muted-foreground italic leading-tight text-center">
                        The smarter the AI setting, the longer the AI takes to move.
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Link href="/theater">
                <Button variant="outline" size="sm" aria-label="Open Theater Mode" className="h-7 px-2 text-xs">
                  <MonitorPlay /> Theater
                </Button>
              </Link>
              <Link href="/dungeon" className={cn(!user && "pointer-events-none")}>
                <Button variant="outline" size="sm" aria-label="Start Dungeon Mode" className="h-7 px-2 text-xs" disabled={isAnyOnlineState || !user}>
                  <Swords /> Dungeon
                </Button>
              </Link>
              <Link href="/leaderboard">
                <Button variant="outline" size="sm" aria-label="View Leaderboard" className="h-7 px-2 text-xs" disabled={isAnyOnlineState}>
                  <Trophy /> L.board
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstblood === currentPlayer) || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget} aria-label="Undo Move" className="h-7 px-2 text-xs">
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
                {onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}
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
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash pointer-events-none" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash pointer-events-none" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash pointer-events-none" />}
      {flashMessage && (<div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
      {killStreakFlashMessage && (<div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}
      
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
         <div 
           className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" 
           style={{ animation: 'flash-loss 3s forwards' }}
           onClick={() => fullGameReset()}
         >
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>
              YOU WON
            </p>
        </div>
      )}
      {showLossScreen && (
         <div 
           className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" 
           style={{ animation: 'flash-loss 3s forwards' }}
           onClick={() => fullGameReset()}
         >
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
      
      <InventoryWindow
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        inventory={inventory}
        selectedItemType={selectedInventoryItemType}
        onSelectItem={setSelectedInventoryItemType}
        attunementSlots={attunementSlots}
        usedSlots={usedSlots}
      />

      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={playerToPromote}
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
      <GameSummaryDialog
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        winner={gameInfo.winner}
        winnerName={getPlayerDisplayName(gameInfo.winner as PlayerColor)}
        loserName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'black' : 'white')}
        eloInfo={eloResult}
        moveCount={vcnLog.length}
        notation={formattedNotation}
        onReset={() => fullGameReset()}
      />

      <AlertDialog open={abilityChoiceDialog?.isOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Action</AlertDialogTitle>
            <AlertDialogDescription>
              This piece has multiple special actions available. Choose one to perform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={() => abilityChoiceDialog?.onChoice('ability')}>
              Use Piece Ability (Self-Destruct)
            </Button>
            <Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}>
              Use Magic Item (Scroll)
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAbilityChoiceDialog(null)}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
