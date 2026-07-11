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
  spawnShroom,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from '@/components/ui/card';
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
  const [isAwaitingDecreeTarget, setIsAwaitingDecreeTarget] = useState(false);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);

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

  useEffect(() => {
    aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  }, [aiDifficulty]);

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

  const initWebSocket = useCallback((onOpenCallback?: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (onOpenCallback) onOpenCallback();
      return;
    }
    
    setOnlineStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to game server');
      setOnlineStatus('connected');
      if (onOpenCallback) onOpenCallback();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Server message:', data);

      switch (data.type) {
        case 'room-created':
          setRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('waiting');
          setGamePlayers(data.gameState.players);
          toast({ title: 'Room Created', description: `Room ID: ${data.roomId}` });
          break;
        case 'room-joined':
          setRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('connected');
          setGamePlayers(data.gameState.players);
          setIsRankedGame(data.isRanked || false);
          toast({ title: 'Joined Room', description: `Connected to ${data.roomId}` });
          break;
        case 'ranked-match-found':
          setRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('connected');
          setRankedQueueStatus('idle');
          setIsRankedGame(true);
          setGamePlayers(data.gameState.players);
          toast({ title: 'Match Found!', description: `Playing as ${data.color}` });
          break;
        case 'player-joined':
          setGamePlayers(data.gameState.players);
          setOnlineStatus('connected');
          setBoard(data.gameState.board);
          toast({ title: 'Player Joined', description: 'Game is starting!' });
          break;
        case 'chat-message':
          setChatMessages(prev => [...prev, data.message]);
          if (!isMessengerOpenRef.current) setHasUnreadMessages(true);
          break;
        case 'game-move':
          setBoard(data.gameState.board);
          setCurrentPlayer(data.gameState.currentPlayer);
          setEnPassantTargetSquare(data.gameState.enPassantTargetSquare);
          setKillStreaks(data.gameState.killStreaks);
          setCapturedPieces(data.gameState.capturedPieces);
          setGameInfo(data.gameState.gameInfo);
          setGameMoveCounter(data.gameState.gameMoveCounter);
          setLastMoveFrom(data.gameState.lastMoveFrom);
          setLastMoveTo(data.gameState.lastMoveTo);
          if (data.gameState.resurrectedSquare) addEffect('light-beam', data.gameState.resurrectedSquare);
          break;
        case 'awaiting-pawn-sacrifice':
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(data.player);
          setBoard(data.fullGameState.board);
          break;
        case 'awaiting-commander-promo':
          setIsAwaitingCommanderPromotion(true);
          setBoard(data.fullGameState.board);
          break;
        case 'awaiting-shield-selection':
          setIsAwaitingHolyShield(true);
          setShieldContext(data.fullGameState.shieldContext);
          setBoard(data.fullGameState.board);
          break;
        case 'awaiting-anvil-drop':
          setIsAwaitingAnvilDrop(true);
          setPlayerToDropAnvil(data.player);
          setAnvilDropContext(data.fullGameState.anvilDropContext);
          setBoard(data.fullGameState.board);
          break;
        case 'awaiting-archer-snipe':
          setIsAwaitingArcherSnipe(true);
          setArcherSnipeContext(data.fullGameState.archerSnipeContext);
          setBoard(data.fullGameState.board);
          break;
        case 'promotion-required':
          setPromotionSquare(data.square);
          setPromotionTargetLevel(data.targetLevel);
          setIsPromotingPawn(true);
          setPlayerToPromote(data.player);
          setBoard(data.fullGameState.board);
          break;
        case 'game-over':
          setGameInfo({
            gameOver: true,
            winner: data.winner,
            message: data.reason === 'timeout' ? 'Player Timed Out!' : (data.reason === 'resign' ? 'Opponent Resigned!' : 'Checkmate!'),
            isCheck: false,
            isCheckmate: data.reason === 'checkmate',
            isStalemate: data.reason === 'stalemate',
            playerWithKingInCheck: null
          });
          if (data.eloChanges) {
            setEloResult(data.eloChanges);
            setShowSummary(true);
          }
          break;
        case 'error':
          toast({ title: 'Error', description: data.message, variant: 'destructive' });
          break;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setOnlineStatus('disconnected');
      setRankedQueueStatus('idle');
    };

    wsRef.current = ws;
  }, [toast, addEffect]);

  const handleRankedPlay = useCallback(() => {
    if (!user || (onlineStatus !== 'disconnected' && rankedQueueStatus !== 'searching')) return;

    if (rankedQueueStatus === 'searching') {
        wsRef.current?.send(JSON.stringify({ type: 'leave-ranked-queue' }));
        setRankedQueueStatus('idle');
        setOnlineStatus('disconnected');
    } else {
        setRankedQueueStatus('searching');
        
        const equipment: Record<string, string> = {};
        board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });

        initWebSocket(() => {
          wsRef.current?.send(JSON.stringify({
              type: 'join-ranked-queue',
              userId: user.uid,
              username: userData?.username || user.displayName || 'Player',
              elo: userData?.eloRating || 1200,
              wins: userData?.wins || 0,
              losses: userData?.losses || 0,
              equipment
          }));
        });
    }
  }, [user, onlineStatus, rankedQueueStatus, userData, board, initWebSocket]);

  const handleOnlinePlay = useCallback((action: 'create' | 'join') => {
    if (!user) return;
    
    const sendPayload = () => {
        const equipment: Record<string, string> = {};
        board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
        
        if (action === 'create') {
            wsRef.current?.send(JSON.stringify({ type: 'create-room', user: { userId: user.uid, username: userData?.username || user.displayName || 'Host', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment } }));
        } else {
            wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: inputRoomId, user: { userId: user.uid, username: userData?.username || user.displayName || 'Guest', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment } }));
        }
    };

    initWebSocket(sendPayload);
  }, [user, userData, inputRoomId, board, initWebSocket]);

  const handlePieceHover = useCallback((piece: Piece | null) => {
    setPieceForInfoDisplay(piece);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && text.trim()) {
      wsRef.current.send(JSON.stringify({
        type: 'chat-message',
        sender: userData?.username || (localPlayerColor === 'white' ? 'White' : 'Black'),
        text: text.trim(),
        color: localPlayerColor
      }));
    }
  }, [userData, localPlayerColor]);

  useEffect(() => {
    if (onlineStatus === 'connected' && localPlayerColor) {
      setBoardOrientation(localPlayerColor);
      return;
    }

    if (viewMode === 'flipping' && onlineStatus === 'disconnected' && !gameInfo.gameOver) {
      const isAI = currentPlayer === 'white' ? isWhiteAI : isBlackAI;
      if (!isAI) {
        setBoardOrientation(currentPlayer);
      }
    }
  }, [currentPlayer, viewMode, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, gameInfo.gameOver]);

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
        return;
      } else {
        currentMessage = "Check!";
      }
    } else {
      const stale = isStalemate(finalizedBoard, nextPlayer, newEnPassantTarget);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
        return;
      }
    }
     setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: inCheck, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));
  }, [getPlayerDisplayName, toast]);

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
      return;
    }
    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;
    const opponentIsStalemated = isStalemate(currentBoard, opponentColor, null);
    if (opponentIsStalemated) {
      setGameInfo(prev => ({ ...prev, message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
    } else {
      setGameInfo(prev => ({ ...prev, message, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [toast, getPlayerDisplayName]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep;
    const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter);
    
    if (onlineStatus === 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
      let currentShroomCounter = (shroomSpawnCounter || 0) + 1;
      setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= (nextShroomSpawnTurn || 5)) {
          const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(currentBoardState);
          if (shroomSpawnedAt) {
              currentBoardState = boardAfterShroom;
              setBoard(currentBoardState);
              const newNextTurn = Math.floor(Math.random() * 6) + 5;
              toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
              audioManager.playShroom();
              setShroomSpawnCounter(0);
              setNextShroomSpawnTurn(newNextTurn);
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
      return;
    }
    if (gameInfo.gameOver) return;
    if (isExtraTurn) setGameInfoBasedOnExtraTurn(currentBoardState, playerWhoseTurnCompleted);
    else completeTurn(currentBoardState, playerWhoseTurnCompleted, newEnPassantTarget);
  }, [positionHistory, toast, gameInfo, setGameInfoBasedOnExtraTurn, completeTurn, gameMoveCounter, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = []) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);

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
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (hasL1Targets) {
                setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'] });
                setIsAwaitingCommanderPromotion(true);
                return;
            }
        }
    }

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
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setShieldContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'] });
                setIsAwaitingHolyShield(true);
                return;
            }
        }
    }

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
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'] });
            setPlayerToDropAnvil(actingPlayer);
            setIsAwaitingAnvilDrop(true);
            return;
        }
    }

    if (newStreak >= 4 && !completedMilestones.includes('resurrection')) {
        const myGraveyard = actingPlayer === 'white' ? capturedPieces.black : capturedPieces.white; 
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const choice = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random() * empty.length)];
                const {row, col} = algebraicToCoords(sq.algebraic);
                const res = { ...choice, level: 1, id: `${choice.id}_res_KS_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (res.type === 'commander' && row === oppBackRank) res.type = 'hero';
                nextBoard[row][col].piece = res;
                setCapturedPieces(prev => (actingPlayer === 'white' ? { ...prev, black: prev.black.filter(p => p.id !== choice.id) } : { ...prev, white: prev.white.filter(p => p.id !== choice.id) }));
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect();
                if (!isAI && (!localPlayerColor || actingPlayer === localPlayerColor) && res.type === 'pawn' && row === oppBackRank) {
                    setPromotionTargetLevel(1); setPromotionSquare(sq.algebraic); setIsPromotingPawn(true);
                    setAnvilDropContext({ boardForNextStep: nextBoard, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'resurrection'] });
                    return;
                }
                if (isAI && res.type === 'pawn' && row === oppBackRank) nextBoard[row][col].piece!.type = 'queen';
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection']);
                return;
            }
        }
    }

    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const hasArcher = pieces.some(p => p.type === 'archer');
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.heldItem === 'crossbow');
    if (((newStreak >= 5 && hasArcher) || (newStreak >= 3 && hasCrossbow)) && !completedMilestones.includes('snipe')) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const v = victims[Math.floor(Math.random() * victims.length)];
                const {row, col} = algebraicToCoords(v.algebraic);
                const sniped = { ...nextBoard[row][col].piece!, id: `${nextBoard[row][col].piece!.id}_sniped_AI_${Date.now()}` };
                setCapturedPieces(prev => (actingPlayer === 'white' ? { ...prev, white: [...(prev.white || []), sniped] } : { ...prev, black: [...(prev.black || []), sniped] }));
                nextBoard[row][col].piece = null; addEffect('poof', v.algebraic); audioManager.playSnipe();
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe']);
                return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setArcherSnipeContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'] });
                setIsAwaitingArcherSnipe(true);
                return;
            }
        }
    }

    processMoveEnd(boardToChain, actingPlayer, isExtra, nextEp);
  }, [firstBloodAchieved, capturedPieces, addEffect, processMoveEnd, isWhiteAI, isBlackAI, localPlayerColor, toast]);

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || isAwaitingHolyShield || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingDecreeTarget;

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
    if (Number(queenOnSquare.level || 1) === 7 && Number(originalPieceLevelIfKnown || 0) < 7) {
      const hasPawns = boardAfterPrimaryMove.flat().some(sq => sq.piece && (sq.piece.type === 'pawn' || sq.piece.type === 'commander') && sq.piece.color === playerWhoseQueenLeveled);
      if (hasPawns) {
        const isAI = (playerWhoseQueenLeveled === 'white' && isWhiteAI) || (playerWhoseQueenLeveled === 'black' && isBlackAI);
        if (isAI) {
            const nextB = boardAfterPrimaryMove.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextB.flat().find(sq => sq.piece && sq.piece.color === playerWhoseQueenLeveled && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
            if (pawnSq) {
                const {row, col} = algebraicToCoords(pawnSq.algebraic);
                const sac = { ...nextB[row][col].piece!, id: `${nextB[row][col].piece!.id}_sac_ai_${Date.now()}` };
                nextB[row][col].piece = null;
                const opp = playerWhoseQueenLeveled === 'white' ? 'black' : 'white';
                setCapturedPieces(prev => ({ ...prev, [opp]: [...(prev[opp] || []), sac] }));
                audioManager.playCapture();
                triggerSpecialsChain(nextB, oldStreak, newStreak, isExtraTurnFromOriginalMove, newEnPassantTarget, playerWhoseQueenLeveled, []);
            }
            return true;
        }

        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(playerWhoseQueenLeveled);
        setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))));
        setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled); setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
        setEnPassantTargetSquare(newEnPassantTarget);
        setAnvilDropContext({ boardForNextStep: boardAfterPrimaryMove, playerWhoseTurnCompleted: playerWhoseQueenLeveled, isExtraTurn: isExtraTurnFromOriginalMove, newEnPassantTarget: newEnPassantTarget, oldStreak, newStreak, completedMilestones: [] }); 
        setKillStreaks(prev => ({ ...prev, [playerWhoseQueenLeveled]: newStreak }));
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select Pawn/Commander to sacrifice for L7 Queen!` }));
        return true;
      }
    }
    triggerSpecialsChain(boardAfterPrimaryMove, oldStreak, newStreak, isExtraTurnFromOriginalMove, newEnPassantTarget, playerWhoseQueenLeveled, []);
    return false;
  }, [triggerSpecialsChain, getPlayerDisplayName, isWhiteAI, isBlackAI]);

  const performAiMove = useCallback(async () => {
    if (!aiInstanceRef.current || gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAnySpecialModeActive) { setIsAiThinking(false); return; }
    aiErrorOccurredRef.current = false; setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));
    try {
      const gameStateForAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, shroomSpawnCounter, nextShroomSpawnTurn);
      const aiResult = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);
      const aiMove = aiResult?.move;
      if (aiMove) {
        const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]);
        const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
        const piece = board[aiMove.from[0]][aiMove.from[1]].piece;
        if (!piece) throw new Error("AI tried to move nothing");
        const originalL = piece.level || 1; const originalT = piece.type;
        saveStateToHistory(); setLastMoveFrom(fromAlg); setLastMoveTo(aiMove.type === 'self-destruct' ? fromAlg : toAlg);
        setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(toAlg);
        const applyResult = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces);
        let finalizedBoard = applyResult.newBoard;
        if (applyResult.reflectionOccurred) {
            const defColor = currentPlayer === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({ ...prev, [defColor]: [...(prev[defColor] || []), { ...applyResult.capturedPiece!, id: `${applyResult.capturedPiece!.id}_refl_ai_${Date.now()}` }] }));
            audioManager.playCapture(); setKillStreaks(prev => ({ ...prev, [defColor]: (prev[defColor] || 0) + 1, [currentPlayer]: 0 }));
            setBoard(finalizedBoard); setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(finalizedBoard, currentPlayer, false, null); }, 800);
            return;
        }
        const streakGain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0);
        const oldStreak = killStreaks[currentPlayer]; const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
        setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreak }));
        if (applyResult.capturedPiece) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.capturedPiece!, id: `${applyResult.capturedPiece!.id}_cap_ai_${Date.now()}` }] }));
        if (applyResult.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.pieceCapturedByAnvil!, id: `${applyResult.pieceCapturedByAnvil!.id}_anvil_ai_${Date.now()}` }] }));
        if (applyResult.selfDestructCaptures) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), ...applyResult.selfDestructCaptures!.map(p => ({...p, id: `${p.id}_sd_ai_${Date.now()}`}))] }));
        setBoard(finalizedBoard);
        setTimeout(() => {
          setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false);
          const isExtra = applyResult.extraTurn || (oldStreak < 6 && newStreak >= 6);
          const pieceAtDest = finalizedBoard[aiMove.to[0]][aiMove.to[1]].piece;
          if (pieceAtDest?.type === 'pawn' && (aiMove.to[0] === (currentPlayer === 'white' ? 0 : 7))) {
            pieceAtDest.type = aiMove.promoteTo || 'queen'; pieceAtDest.level = getPromotionLevel(applyResult.capturedPiece?.type || null);
            if (pieceAtDest.type === 'queen') pieceAtDest.level = Math.min(pieceAtDest.level, 7);
          }
          processPawnSacrificeCheck(finalizedBoard, currentPlayer, {from: fromAlg, to: toAlg, type: aiMove.type as Move['type']}, originalL, originalT, isExtra, applyResult.enPassantTargetSet, oldStreak, newStreak);
        }, 800);
      }
    } catch (e) { aiErrorOccurredRef.current = true; }
    if (aiErrorOccurredRef.current) { const opponent = currentPlayer === 'white' ? 'black' : 'white'; setGameInfo(prev => ({ ...prev, message: `AI Forfeits. ${getPlayerDisplayName(opponent)} wins!`, gameOver: true, winner: opponent })); setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); }
  }, [board, killStreaks, capturedPieces, enPassantTargetSquare, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, getPlayerDisplayName, processPawnSacrificeCheck, saveStateToHistory, gameMoveCounter, addEffect]);

  useEffect(() => {
    if (((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI)) && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) {
      const timer = setTimeout(performAiMove, 500); return () => clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, performAiMove]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row]?.[col]; const piece = sq?.piece;
    handlePieceHover(piece || null);
    const isLocalTurn = !localPlayerColor || localPlayerColor === currentPlayer;
    if (isAnySpecialModeActive && !isLocalTurn) return;

    if (onlineStatus === 'connected' && localPlayerColor !== currentPlayer && !isAnySpecialModeActive) return;

    if (isInventoryOpen) {
      if (selectedInventoryItemType && !selectedInventoryItemType.startsWith('portal_scroll_')) {
        if (piece && !piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          if (usedSlots >= attunementSlots) { toast({ title: "Attunement Limit", variant: "destructive" }); return; }
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveLoadoutToFirestore(nextBoard, newInv); setSelectedInventoryItemType(null); audioManager.playLevelUp();
        }
      } else if (piece && piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          const removed = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removed);
          if (item) item.count++; else nextInv.push({ type: removed, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); audioManager.playMove();
      }
      return;
    }

    if (isAwaitingDecreeTarget && isLocalTurn) {
        if (piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
            if (onlineStatus === 'connected') {
                wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'kings-decree' } }));
            } else {
                setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(algebraic);
                const result = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'kings-decree' }, enPassantTargetSquare, capturedPieces);
                setBoard(result.newBoard); audioManager.playLevelUp(); setIsAwaitingDecreeTarget(false); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(result.newBoard, currentPlayer, false, enPassantTargetSquare); }, 800);
            }
        }
        return;
    }

    if (isAwaitingPawnSacrifice && isLocalTurn) {
      if (piece && (piece.type === 'pawn' || piece.type === 'commander') && piece.color === currentPlayer) {
        if (onlineStatus === 'connected') {
            wsRef.current?.send(JSON.stringify({ type: 'pawn-sacrifice', payload: { square: algebraic } }));
            setIsAwaitingPawnSacrifice(false);
        } else {
            saveStateToHistory(); let nextBoard = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            const sac = { ...nextBoard[row][col].piece!, id: `${nextBoard[row][col].piece!.id}_sac_${uniqueIdCounterRef.current++}`};
            nextBoard[row][col].piece = null; setBoard(nextBoard); audioManager.playCapture();
            const opp = playerWhoMadeQueenMove === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({ ...prev, [opp]: [...(prev[opp] || []), sac] }));
            setIsAwaitingPawnSacrifice(false); setPlayerToSacrificePawn(null); setBoardForPostSacrifice(null);
            triggerSpecialsChain(nextBoard, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, isExtraTurnFromQueenMove, anvilDropContext?.newEnPassantTarget || null, currentPlayer, anvilDropContext?.completedMilestones || []);
        }
      }
      return;
    }

    if (isAwaitingAnvilDrop && isLocalTurn) {
        if (!sq?.piece && !sq?.item) {
            if (onlineStatus === 'connected') {
                wsRef.current?.send(JSON.stringify({ type: 'anvil-drop', square: algebraic }));
                setIsAwaitingAnvilDrop(false);
            } else {
                saveStateToHistory(); const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = anvilDropContext!;
                const nextBoard = boardForNextStep.map(r => r.map(s => ({ ...s }))); nextBoard[row][col].item = { type: 'anvil' };
                setBoard(nextBoard); audioManager.playAnvil(); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setAnvilDropContext(null);
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'anvil']);
            }
        }
        return;
    }

    if (isAwaitingHolyShield && isLocalTurn) {
      if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== shieldContext?.capturingPieceId) {
          if (onlineStatus === 'connected') {
              wsRef.current?.send(JSON.stringify({ type: 'holy-shield', square: algebraic }));
              setIsAwaitingHolyShield(false);
          } else {
              saveStateToHistory(); const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = shieldContext!;
              const nextBoard = boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece, isShielded: s.piece.id === piece.id ? true : s.piece.isShielded } : null })));
              setBoard(nextBoard); audioManager.playShield(); setIsAwaitingHolyShield(false); setShieldContext(null);
              triggerSpecialsChain(nextBoard, oldStreak!, newStreak!, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'shield']);
          }
      }
      return;
    }

    if (isAwaitingArcherSnipe && isLocalTurn) {
      if (piece && piece.color !== currentPlayer && piece.level === 1 && piece.type !== 'king' && piece.type !== 'queen') {
          if (onlineStatus === 'connected') {
              wsRef.current?.send(JSON.stringify({ type: 'archer-snipe', square: algebraic }));
              setIsAwaitingArcherSnipe(false);
          } else {
              saveStateToHistory(); const { boardForNextStep, playerWhoseTurnCompleted, isExtraTurn, newEnPassantTarget, oldStreak, newStreak, completedMilestones } = archerSnipeContext!;
              const nextBoard = boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? {...s.piece} : null })));
              const sniped = { ...piece, id: `${piece.id}_sniped_${uniqueIdCounterRef.current++}` };
              setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), sniped] }));
              nextBoard[row][col].piece = null; setBoard(nextBoard); addEffect('poof', algebraic); audioManager.playSnipe();
              setIsAwaitingArcherSnipe(false); setArcherSnipeContext(null);
              triggerSpecialsChain(nextBoard, oldStreak!, 99, isExtraTurn, newEnPassantTarget, playerWhoseTurnCompleted, [...(completedMilestones || []), 'snipe']);
          }
      }
      return;
    }

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) {
        if (piece?.type === 'pawn' && piece.color === currentPlayer && piece.level === 1) {
            if (onlineStatus === 'connected') {
                wsRef.current?.send(JSON.stringify({ type: 'commander-promo', square: algebraic }));
                setIsAwaitingCommanderPromotion(false);
            } else {
                saveStateToHistory(); const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                nextBoard[row][col].piece!.type = 'commander'; nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_${uniqueIdCounterRef.current++}`;
                setBoard(nextBoard); audioManager.playLevelUp(); setIsAwaitingCommanderPromotion(false);
                triggerSpecialsChain(nextBoard, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, anvilDropContext?.isExtraTurn || false, anvilDropContext?.newEnPassantTarget || null, currentPlayer, anvilDropContext?.completedMilestones || []);
            }
        }
        return;
    }

    if (selectedSquare) {
      const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
      const moving = board[fR][fC].piece; if (!moving) return;
      const effectiveL = getEffectiveLevel(board, fR, fC);
      const hasScroll = moving.heldItem && ['wind_scroll', 'life_leach', 'summon_anvil', 'shield_scroll', 'rally_scroll', 'antidote', 'swap_scroll', 'ice_scroll', 'resurrection_scroll', 'faith_scroll', 'kings_decree'].includes(moving.heldItem);
      const hasAbility = ((moving.type === 'knight' || moving.type === 'hero' || moving.type === 'archer') && effectiveL >= 5);

      if (selectedSquare === algebraic && (hasScroll || hasAbility)) {
          if ((moving.cooldownTurnsRemaining || 0) > 0 || (moving.frozenTurnsRemaining || 0) > 0) { toast({ title: "Exhausted", variant: "destructive" }); return; }
          const execSelfDestruct = () => {
              if (onlineStatus === 'connected') {
                wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'self-destruct' } }));
              } else {
                saveStateToHistory(); const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare, capturedPieces);
                setBoard(result.newBoard); audioManager.playExplosion();
                const oldS = killStreaks[currentPlayer]; const caps = result.selfDestructCaptures?.length || 0; const newS = caps > 0 ? (oldS + caps) : 0;
                setKillStreaks(prev => ({ ...prev, [currentPlayer]: newS }));
                if (result.selfDestructCaptures) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), ...result.selfDestructCaptures!.map(p => ({ ...p, id: `${p.id}_sd_${Date.now()}` }))] }));
                setTimeout(() => { setSelectedSquare(null); setPossibleMoves([]); triggerSpecialsChain(result.newBoard, oldS, newS, result.extraTurn || (oldS < 6 && newS >= 6), enPassantTargetSquare, currentPlayer, []); }, 800);
              }
          };
          if (hasScroll && hasAbility) { setAbilityChoiceDialog({ isOpen: true, onChoice: (c) => { setAbilityChoiceDialog(null); if (c === 'ability') execSelfDestruct(); else if (moving.heldItem === 'kings_decree') setIsAwaitingDecreeTarget(true); else if (moving.heldItem === 'wind_scroll') setIsAwaitingWindScrollTarget(true); else if (moving.heldItem === 'summon_anvil') setIsAwaitingAnvilScrollTarget(true); }}); return; }
          if (hasAbility) execSelfDestruct(); else if (moving.heldItem === 'kings_decree') setIsAwaitingDecreeTarget(true); else if (moving.heldItem === 'wind_scroll') setIsAwaitingWindScrollTarget(true); else if (moving.heldItem === 'summon_anvil') setIsAwaitingAnvilScrollTarget(true);
          return;
      }

      const freshlyCalculated = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      if (freshlyCalculated.includes(algebraic)) {
        if (onlineStatus === 'connected') {
            const moveType = board[row][col].piece ? (board[row][col].piece!.color === moving.color ? 'swap' : 'capture') : (algebraic === enPassantTargetSquare ? 'enpassant' : 'move');
            wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: moveType } }));
        } else {
            saveStateToHistory(); clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            const originalL = moving.level || 1; const originalT = moving.type;
            const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: board[row][col].piece ? (board[row][col].piece!.color === moving.color ? 'swap' : 'capture') : (algebraic === enPassantTargetSquare ? 'enpassant' : 'move') }, enPassantTargetSquare, capturedPieces);
            let nextB = applyResult.newBoard; let nextEp = applyResult.enPassantTargetSet;
            if (applyResult.reflectionOccurred) {
                const victim = applyResult.capturedPiece!; const def = currentPlayer === 'white' ? 'black' : 'white';
                setCapturedPieces(prev => ({ ...prev, [def]: [...(prev[def] || []), { ...victim, id: `${victim.id}_refl_${Date.now()}` }] }));
                audioManager.playCapture(); setKillStreaks(prev => ({ ...prev, [def]: (prev[def] || 0) + 1, [currentPlayer]: 0 }));
                setBoard(nextB); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, currentPlayer, false, null); }, 800);
                return;
            }
            const oldS = killStreaks[currentPlayer] || 0; let caps = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0);
            const newS = caps > 0 ? (oldS + caps) : 0; setKillStreaks(prev => ({ ...prev, [currentPlayer]: newS }));
            if (applyResult.capturedPiece) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.capturedPiece!, id: `${applyResult.capturedPiece!.id}_cap_${uniqueIdCounterRef.current++}` }] }));
            if (applyResult.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.pieceCapturedByAnvil!, id: `${applyResult.pieceCapturedByAnvil!.id}_anvil_${uniqueIdCounterRef.current++}` }] }));
            setBoard(nextB);
            setTimeout(() => {
                setIsMoveProcessing(false); clickGuardRef.current = false;
                const isExtra = applyResult.extraTurn || (oldS < 6 && newS >= 6);
                const pieceAtDest = nextB[row][col].piece;
                let handled = false;
                if (pieceAtDest?.type === 'queen' && originalT === 'queen') handled = processPawnSacrificeCheck(nextB, currentPlayer, {from: selectedSquare, to: algebraic, type: 'move'}, originalL, originalT, isExtra, nextEp, oldS, newS);
                if (handled) return;
                if (pieceAtDest?.type === 'pawn' && (row === 0 || row === 7)) {
                    setPlayerToPromote(currentPlayer); setPromotionTargetLevel(getPromotionLevel(applyResult.capturedPiece?.type || null)); 
                    setIsPromotingPawn(true); setPromotionSquare(algebraic); setAnvilDropContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak: oldS, newStreak: newS, completedMilestones: [] });
                    handled = true;
                }
                if (!handled) triggerSpecialsChain(nextB, oldS, newS, isExtra, nextEp, currentPlayer, []);
            }, 800);
        }
        return;
      }
    }
    if (piece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare)); }
    else { setSelectedSquare(null); setPossibleMoves([]); setEnemySelectedSquare(piece ? algebraic : null); setEnemyPossibleMoves(piece ? getPossibleMoves(board, algebraic, enPassantTargetSquare) : []); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, triggerSpecialsChain, processPawnSacrificeCheck, toast, localPlayerColor, usedSlots, attunementSlots, inventory, selectedInventoryItemType, saveStateToHistory, isInventoryOpen, isAwaitingPawnSacrifice, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, isAwaitingAnvilDrop, anvilDropContext, isAwaitingHolyShield, shieldContext, isAwaitingArcherSnipe, archerSnipeContext, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isPromotingPawn, promotionSquare, promotionTargetLevel, isMoveProcessing, gameInfo.gameOver, isAnySpecialModeActive, isAwaitingDecreeTarget, handlePieceHover, saveLoadoutToFirestore, onlineStatus, inputRoomId, initWebSocket]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    if (onlineStatus === 'connected') {
        wsRef.current?.send(JSON.stringify({ type: 'finalize-promotion', payload: { square: promotionSquare, promoteTo: pieceType } }));
        setIsPromotingPawn(false); setPromotionSquare(null);
    } else {
        let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        const { row, col } = algebraicToCoords(promotionSquare);
        const beingPromoted = boardToUpdate[row][col].piece;
        if (!beingPromoted) return;
        boardToUpdate[row][col].piece = { ...beingPromoted, type: pieceType, level: promotionTargetLevel, id: `${beingPromoted.id}_promo_${pieceType}`, hasMoved: true, isShielded: false };
        if (pieceType === 'queen') boardToUpdate[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
        setBoard(boardToUpdate); setIsPromotingPawn(false); setPromotionSquare(null); audioManager.playLevelUp();
        triggerSpecialsChain(boardToUpdate, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, (boardToUpdate[row][col].piece!.level >= 5) || (anvilDropContext?.isExtraTurn || false), anvilDropContext?.newEnPassantTarget || null, currentPlayer, anvilDropContext?.completedMilestones || []);
    }
  }, [board, promotionSquare, promotionTargetLevel, anvilDropContext, triggerSpecialsChain, currentPlayer, onlineStatus]);

  const handleVolumeChange = useCallback((val: number[]) => { const v = val[0]; setVolume(v); audioManager.setVolume(v); }, []);

  useEffect(() => {
    if (!board || !prevBoardRef.current) { prevBoardRef.current = board; return; }
    const prevPieceLevels = new Map<string, number>();
    prevBoardRef.current.forEach(row => row.forEach(sq => { if (sq.piece) prevPieceLevels.set(sq.piece.id, sq.piece.level); }));
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
            if (!signaledEventsRef.current.has(levelSig)) { newEffectsToAdd.push({ type: 'level-change', square: currSq.algebraic, val: diff }); signaledEventsRef.current.add(levelSig); }
          }
        }
      }
    }));
    prevBoardRef.current.forEach(row => row.forEach(prevSq => {
      if (prevSq.piece && !currentPieceIds.has(prevSq.piece.id)) {
        const captureSig = `capture-${prevSq.piece.id}-${moveKey}`;
        if (!signaledEventsRef.current.has(captureSig)) { newEffectsToAdd.push({ type: 'poof', square: prevSq.algebraic }); signaledEventsRef.current.add(captureSig); }
      }
    }));
    if (newEffectsToAdd.length > 0) newEffectsToAdd.forEach(e => addEffect(e.type, e.square, undefined, e.val));
    prevBoardRef.current = board;
  }, [board, gameMoveCounter, addEffect]);

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0.5 pb-1">
        <div className="w-full flex items-center justify-between">
          <div className="w-1/3"></div>
          <div className="w-1/3 flex items-center justify-center">
            <img src="/images/Vibe_Title.gif" alt="VIBE CHESS" className="h-8 w-auto object-contain" />
          </div>
          <div className="w-1/3 flex justify-end">
            <AuthWidget />
          </div>
        </div>
        <div className={cn("text-center text-[10px] font-bold min-h-[1.2em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse", (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse"))}>
          {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingDecreeTarget ? "SELECT A PAWN TO PROMOTE!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
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
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]">
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
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-6 px-1.5 text-[10px]"><BookOpen /> Rules</Button>
          <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user} className="h-6 px-1.5 text-[10px]"><Package /> Items</Button>
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]"><Settings /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={handleVolumeChange} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /><p className="text-[9px] text-muted-foreground italic leading-tight text-center">The smarter the AI setting, the longer the AI takes to move.</p></div></div></PopoverContent></Popover>
          <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={onlineStatus !== 'disconnected' || !user}><Swords /> Dungeon</Button></Link>
          <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={onlineStatus !== 'disconnected'}><Trophy /> L.board</Button></Link>
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={onlineStatus !== 'disconnected' || isAiThinking || isMoveProcessing || isAnySpecialModeActive} className="h-6 px-1.5 text-[10px]"><Undo2 /> Undo</Button>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-0.5"><Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} className="h-6 px-1.5 text-[10px]"><Bot /> W:{isWhiteAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} className="h-6 px-1.5 text-[10px]"><Bot /> B:{isBlackAI ? 'On' : 'Off'}</Button><Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} className="h-6 px-1.5 text-[10px]"><View /> View</Button></div>
        <Card className="w-full mt-1">
          <CardContent className="p-1.5 flex flex-col gap-1.5">
            <div className="flex flex-col gap-1 items-center">
              <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || (onlineStatus !== 'disconnected' && rankedQueueStatus !== 'searching')} className="h-6 px-1.5 text-[10px] w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Leave Queue' : 'Ranked Match'}</Button>
              <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)} className="h-6 px-1.5 text-[10px] w-full">{onlineStatus !== 'disconnected' ? <Link2Off className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}{onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}</Button>
              <div className="flex gap-1 items-center w-full">
                <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-6 px-1.5 text-[10px] flex-grow" disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI} />
                <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI} className="h-6 px-1.5 text-[10px]">Join</Button>
              </div>
            </div>
            <div className="w-full text-center h-3 text-[10px]">{onlineStatus}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const desktopLayout = (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0">
        <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={playerToDropAnvil === 'white' ? 'white' : activeTimerPlayer} chatMessages={chatMessages} onSendMessage={sendMessage} isMessengerOpen={isMessengerOpen} onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)} hasUnreadMessages={hasUnreadMessages} />
      </div>
      <div className="w-1/2 flex flex-col items-center gap-2">
        <div className="w-full flex items-center justify-center">
          <img src="/images/Vibe_Title.gif" alt="VIBE CHESS" className="h-16 w-auto object-contain" />
        </div>
        <div className={cn("text-center text-sm font-bold min-h-[1.25em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse", (gameInfo.message.includes("(AI) is thinking...") && "text-primary animate-pulse"))}>
          {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingDecreeTarget ? "SELECT A PAWN TO PROMOTE!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
        </div>
        <div className="w-full max-w-lg">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? null : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer} playerToPromoteCommander={playerWhoGotFirstBlood === currentPlayer ? currentPlayer : null} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} />
        </div>
      </div>
      <div className="w-1/4 flex flex-col gap-4">
        <AuthWidget />
        <Card>
          <CardContent className="p-2 flex flex-col gap-2">
            <div className="flex flex-wrap justify-center items-center gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">{onlineStatus === 'connected' ? <Flag /> : <RefreshCw />} {onlineStatus === 'connected' ? 'Resign' : 'Reset'}</Button>
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
            <div className="flex flex-wrap justify-center items-center gap-1">
              <Button variant="outline" size="sm" onClick={handleToggleWhiteAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> W:{isWhiteAI ? 'On' : 'Off'}</Button>
              <Button variant="outline" size="sm" onClick={handleToggleBlackAI} disabled={onlineStatus !== 'disconnected' || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} className="h-7 px-2 text-xs"><Bot /> B:{isBlackAI ? 'On' : 'Off'}</Button>
              <Button variant="outline" size="sm" onClick={handleToggleViewMode} disabled={onlineStatus === 'connected'} className="h-7 px-2 text-xs"><View /> View</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2 flex flex-col gap-2">
            <div className="flex flex-col gap-1 items-center">
              <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || (onlineStatus !== 'disconnected' && rankedQueueStatus !== 'searching')} className="h-7 px-2 text-xs w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Leave Queue' : 'Ranked Match'}</Button>
              <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || (isWhiteAI || isBlackAI)} className="h-7 px-2 text-xs w-full">{onlineStatus !== 'disconnected' ? <Link2Off className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}{onlineStatus !== 'disconnected' ? 'Disconnect' : 'Create Online Game'}</Button>
              <div className="flex gap-1 items-center w-full">
                <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-xs flex-grow" disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || isWhiteAI || isBlackAI} />
                <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={onlineStatus !== 'disconnected' || rankedQueueStatus !== 'idle' || !inputRoomId || isWhiteAI || isBlackAI} className="h-7 px-2 text-xs">Join</Button>
              </div>
            </div>
            <div className="w-full text-center h-4 text-xs mt-1">{onlineStatus}</div>
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
      {showTimerWarning && (<div key={`timer-warning-${timerWarningKey}`} className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"><div className="animate-flash-timer-warning"><p className="text-7xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>10</p></div></div>)}
      {showWinScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>YOU WON</p></div>)}
      {showLossScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>YOU LOST</p></div>)}
      <div className="lg:hidden h-full">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <InventoryWindow
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        inventory={inventory}
        selectedItemType={selectedInventoryItemType}
        onSelectItem={setSelectedInventoryItemType}
        onUseItem={(type) => {}}
        attunementSlots={attunementSlots}
        usedSlots={usedSlots}
      />
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
    setBoard(initial); setCurrentPlayer('white'); setGameInfo({ ...initialGameStatus }); setCapturedPieces({ white: [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setHistoryStack([]); setPositionHistory([]); setSelectedSquare(null); setPossibleMoves([]); setLastMoveFrom(null); setLastMoveTo(null); setGameMoveCounter(0); setEnPassantTargetSquare(null); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setShowLossScreen(false); setShowWinScreen(false); setShowSummary(false); audioManager.playStart();
    aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  }

  function handleUndo() {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setBoard(last.board); setCurrentPlayer(last.currentPlayer); setGameInfo(last.gameInfo); setCapturedPieces(last.capturedPieces); setKillStreaks(last.killStreaks); setBoardOrientation(last.boardOrientation); setViewMode(last.viewMode); setIsWhiteAI(last.isWhiteAI); setIsBlackAI(last.isBlackAI); setEnemySelectedSquare(last.enemySelectedSquare); setEnemyPossibleMoves(last.enemyPossibleMoves || []); setPositionHistory(last.positionHistory); setLastMoveFrom(last.lastMoveFrom); setLastMoveTo(last.lastMoveTo); setGameMoveCounter(last.gameMoveCounter); setEnPassantTargetSquare(last.enPassantTargetSquare); setShroomSpawnCounter(last.shroomSpawnCounter); setNextShroomSpawnTurn(last.nextShroomSpawnTurn); setHistoryStack(prev => prev.slice(0, -1));
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
        promotionSquare, promotionMoveWasCapture: false, originalPromotionLevel: promotionTargetLevel, promotionPawnOriginalLevel: null,
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

  function saveLoadoutToFirestore(b: BoardState, inv: InventoryItem[]) {
      if (!user || !firestore) return;
      const equipment: Record<string, string> = {};
      b.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
      const ref = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(ref, { inventory: inv, equipment });
  }
}
