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
  isItemValidForPiece,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, QueenLevelReducedEvent, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, ChatMessage, InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag, Trophy, Settings, Volume2, BrainCircuit, Swords, Package, Copy } from 'lucide-react';
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
import { VibeChessTitle, PixelAnvil, ShroomIcon } from '@/components/evolving-chess/IconLibrary';


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
  lastMovedPieceType?: PieceType | null,
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
      white: currentCapturedPieces?.white ? currentCapturedPieces.white.map(p => ({ ...p })) : [],
      black: currentCapturedPieces?.black ? currentCapturedPieces.black.map(p => ({ ...p })) : [],
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
    lastMovedPieceType: lastMovedPieceType
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
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [playerToPromote, setPlayerToPromote] = useState<PlayerColor | null>(null);
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef<VibeChessAI | null>(null);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [lastMovedPieceType, setLastMovedPieceType] = useState<PieceType | null>(null);
  const [gameMoveCounter, setGameMoveCounter] = useState(0);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);

  const clickGuardRef = useRef(false);
  const uniqueIdCounterRef = useRef(20000);

  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);

  const [isAwaitingDanceTarget, setIsAwaitingDanceTarget] = useState(false);
  const [dancerToDance, setDancerToDance] = useState<AlgebraicSquare | null>(null);

  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);

  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);

  const [resurrectedSquares, setResurrectedSquares] = useState<ResurrectedSquareInfo[]>([]);

  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);

  const [turnTimer, setTurnTimer] = useState<number | null>(null);
  const [activeTimerPlayer, setActiveTimerPlayer] = useState<PlayerColor | null>(null);
  const [whiteTimeouts, setWhiteTimeouts] = useState(0);
  const [blackTimeouts, setBlackTimeouts] = useState(0);
  const [effects, setEffects] = useState<Effect[]>([]);

  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [playerToDropAnvil, setPlayerToDropAnvil] = useState<PlayerColor | null>(null);
  const [anvilDropContext, setAnvilDropContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, oldStreak: number, newStreak: number, completedMilestones?: string[] } | null>(null);

  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [shieldContext, setShieldContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, capturingPieceId?: string, oldStreak?: number, newStreak?: number, completedMilestones?: string[] } | null>(null);

  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [archerSnipeContext, setArcherSnipeContext] = useState<{ boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, oldStreak?: number, newStreak?: number, completedMilestones?: string[] } | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const isMessengerOpenRef = useRef(isMessengerOpen);

  const [inputRoomId, setInputRoomId] = useState('');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'waiting'>('disconnected');
  const [gamePlayers, setGamePlayers] = useState<{white: {username?: string; userId?: string; elo?: number;} | null, black: {username?: string; userId?: string; elo?: number;} | null} | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [showLossScreen, setShowLossScreen] = useState(false);
  const [showWinScreen, setShowWinScreen] = useState(false);
  const [rankedQueueStatus, setRankedQueueStatus] = useState<'idle' | 'searching'>('idle');
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
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => {
        setEffects(current => current.filter(e => e.id !== id));
    }, 1500);
  }, []);

  useEffect(() => {
    aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  }, [aiDifficulty]);

  useEffect(() => {
    if (!isUserLoading && userData && !hasInitializedSession.current) {
      hasInitializedSession.current = true;
      const elo = userData.eloRating || 1200;
      let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []);
      
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
    
    let wsUrl = '';
    if (window.location.hostname.includes('cloudworkstations.dev')) {
      const parts = window.location.hostname.split('-');
      parts[0] = '8080';
      wsUrl = `${protocol}//${parts.join('-')}`;
    } else {
      wsUrl = `${protocol}//${window.location.hostname}:8080`;
    }
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to game server');
      setOnlineStatus('connected');
      if (onOpenCallback) onOpenCallback();
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      setOnlineStatus('disconnected');
      toast({ title: 'Connection Error', description: 'Could not connect to game server.', variant: 'destructive' });
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'room-created':
          setRoomId(data.roomId);
          setInputRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('waiting');
          setGamePlayers(data.gameState.players);
          toast({ title: 'Room Created', description: `Room ID: ${data.roomId}` });
          break;
        case 'room-joined':
          setRoomId(data.roomId);
          setInputRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('connected');
          setGamePlayers(data.gameState.players);
          toast({ title: 'Joined Room', description: `Connected to ${data.roomId}` });
          break;
        case 'ranked-match-found':
          setRoomId(data.roomId);
          setLocalPlayerColor(data.color);
          setBoard(data.gameState.board);
          setOnlineStatus('connected');
          setRankedQueueStatus('idle');
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
          setLastMovedPieceType(data.gameState.lastMovedPieceType);
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
            isCheckmate: data.reason === 'checkmate' || data.reason === 'auto-checkmate',
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
      setRoomId(null);
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
        initWebSocket(() => {
          const equipment: Record<string, string> = {};
          board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
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
    initWebSocket(() => {
        const equipment: Record<string, string> = {};
        board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
        if (action === 'create') {
            wsRef.current?.send(JSON.stringify({ type: 'create-room', user: { userId: user.uid, username: userData?.username || user.displayName || 'Host', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment } }));
        } else {
            wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: inputRoomId, user: { userId: user.uid, username: userData?.username || user.displayName || 'Guest', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment } }));
        }
    });
  }, [user, userData, inputRoomId, board, initWebSocket]);

  const handlePieceHover = useCallback((piece: Piece | null) => {
    setPieceForInfoDisplay(piece);
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text.trim()) {
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
      if (!(currentPlayer === 'white' ? isWhiteAI : isBlackAI)) {
        setBoardOrientation(currentPlayer);
      }
    }
  }, [currentPlayer, viewMode, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, gameInfo.gameOver]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    if (!player) return '...'; 
    if (onlineStatus === 'connected' || onlineStatus === 'waiting') {
        const username = gamePlayers?.[player]?.username;
        if (username) return player === localPlayerColor ? `${username} (You)` : username;
    }
    const base = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI && onlineStatus === 'disconnected') return `${base} (AI)`;
    if (player === 'black' && isBlackAI && onlineStatus === 'disconnected') return `${base} (AI)`;
    return base;
  }, [isWhiteAI, isBlackAI, onlineStatus, localPlayerColor, gamePlayers]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep;
    const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter);
    
    if (onlineStatus === 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
      let currentShroomCounter = shroomSpawnCounter + 1;
      setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= nextShroomSpawnTurn) {
          const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(currentBoardState);
          if (shroomSpawnedAt) {
              currentBoardState = boardAfterShroom;
              setBoard(currentBoardState);
              toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
              audioManager.playShroom();
              setShroomSpawnCounter(0);
              setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
          }
      }
    }
    
    const nextPlayer = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(currentBoardState, nextPlayer);
    setBoard(boardAfterPoison);
    setCurrentPlayer(nextPlayer);
    setEnPassantTargetSquare(newEnPassantTarget);
    
    const inCheck = isKingInCheck(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType);

    if (inCheck && isExtraTurn) {
        setGameInfo({
            message: `Auto-Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!`,
            isCheck: true,
            playerWithKingInCheck: nextPlayer,
            isCheckmate: true,
            isStalemate: false,
            gameOver: true,
            winner: playerWhoseTurnCompleted
        });
        return;
    }

    const mate = inCheck && isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType);
    const stale = !inCheck && isStalemate(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType);

    if (mate || stale) {
        setGameInfo({
            message: mate ? `Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!` : "Stalemate!",
            isCheck: inCheck,
            playerWithKingInCheck: inCheck ? nextPlayer : null,
            isCheckmate: mate,
            isStalemate: stale,
            gameOver: true,
            winner: mate ? playerWhoseTurnCompleted : 'draw'
        });
    } else {
        setGameInfo({
            message: inCheck ? "Check!" : (isExtraTurn ? `${getPlayerDisplayName(playerWhoseTurnCompleted)} gets an extra turn!` : " "),
            isCheck: inCheck,
            playerWithKingInCheck: inCheck ? nextPlayer : null,
            isCheckmate: false,
            isStalemate: false,
            gameOver: false
        });
    }
  }, [gameMoveCounter, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor, toast, getPlayerDisplayName, lastMovedPieceType]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = []) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);

    if (newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const hasDancers = boardToChain.flat().some(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
        if (hasDancers) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const aiDancer = nextBoard.flat().find(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
                if (aiDancer) {
                    const {row, col} = algebraicToCoords(aiDancer.algebraic);
                    const dir = actingPlayer === 'white' ? -1 : 1;
                    if (isValidSquare(row+dir, col) && !nextBoard[row+dir][col].piece && !nextBoard[row+dir][col].item) {
                        nextBoard[row+dir][col].piece = { ...nextBoard[row][col].piece!, hasMoved: true };
                        nextBoard[row][col].piece = null;
                    }
                }
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'dance']);
                return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'] });
                setIsAwaitingDanceTarget(true);
                return;
            }
        }
    }

    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true);
        setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (pawnSq) {
                const {row, col} = algebraicToCoords(pawnSq.algebraic);
                nextBoard[row][col].piece!.type = 'commander';
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

    if (newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === actingPlayer);
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const targets = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                if (targets.length > 0) targets[0].piece!.isShielded = true;
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield']);
                return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setShieldContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'] });
                setIsAwaitingHolyShield(true);
                return;
            }
        }
    }

    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const archers = pieces.filter(p => p.type === 'archer');
    const maxArcherLevel = archers.length > 0 ? Math.max(...archers.map(a => a.level || 1)) : 0;
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.color === actingPlayer && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && archers.length > 0 && !completedMilestones.includes('snipe')) || 
                        (newStreak >= 3 && oldStreak < 3 && hasCrossbow && !completedMilestones.includes('snipe'));

    if (isSnipeTime) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxArcherLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const v = victims[Math.floor(Math.random() * victims.length)];
                const {row, col} = algebraicToCoords(v.algebraic);
                const responsibleAIArcher = archers.find(a => a.level >= (v.piece?.level || 1));
                if (responsibleAIArcher) {
                    const gain = {pawn: 1, dancer: 1, mimic: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[v.piece!.type] || 0;
                    const arRow = nextBoard.findIndex(r => r.some(s => s.piece?.id === responsibleAIArcher.id));
                    const arCol = nextBoard[arRow].findIndex(s => s.piece?.id === responsibleAIArcher.id);
                    nextBoard[arRow][arCol].piece!.level += gain;
                }
                nextBoard[row][col].piece = null;
                audioManager.playSnipe();
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe']);
                return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setArcherSnipeContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'] });
                setIsAwaitingArcherSnipe(true);
                return;
            }
        }
    }

    if (newStreak >= 3 && oldStreak < 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) empty[0].item = { type: 'anvil' };
            triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'anvil']);
            return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            setAnvilDropContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'] });
            setPlayerToDropAnvil(actingPlayer);
            setIsAwaitingAnvilDrop(true);
            return;
        }
    }

    if (newStreak >= 4 && oldStreak < 4 && !completedMilestones.includes('resurrection')) {
        const myGraveyard = actingPlayer === 'white' ? capturedPieces.black : capturedPieces.white; 
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const choice = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random()*empty.length)];
                const {row: rr, col: rc} = algebraicToCoords(sq.algebraic);
                nextBoard[rr][rc].piece = { ...choice, level: 1, id: `${choice.id}_res_${Date.now()}`, hasMoved: true, isShielded: false };
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect();
                triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection']);
                return;
            }
        }
    }

    processMoveEnd(boardToChain, actingPlayer, isExtra, nextEp);
  }, [isWhiteAI, isBlackAI, firstBloodAchieved, capturedPieces, addEffect, processMoveEnd, localPlayerColor, toast]);

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingHolyShield || isAwaitingArcherSnipe || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingDecreeTarget || isAwaitingDanceTarget;

  const processPawnSacrificeCheck = useCallback((boardAfter: BoardState, player: PlayerColor, move: Move | null, oldL: number | undefined, oldT: PieceType | undefined, extra: boolean, ep: AlgebraicSquare | null, oldS: number, newS: number) => {
    if (!move) return false;
    const { row, col } = algebraicToCoords(move.to);
    const piece = boardAfter[row][col].piece;
    if (piece?.type === 'queen' && piece.level === 7 && oldT === 'queen' && (oldL || 0) < 7) {
      if (boardAfter.flat().some(sq => sq.piece && sq.piece.color === player && ['pawn', 'dancer', 'mimic', 'commander'].includes(sq.piece.type))) {
        const isAI = (player === 'white' && isWhiteAI) || (player === 'black' && isBlackAI);
        if (isAI) {
            const nextB = boardAfter.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextB.flat().find(sq => sq.piece && sq.piece.color === player && ['pawn', 'dancer', 'mimic', 'commander'].includes(sq.piece.type));
            if (pawnSq) {
                const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic);
                nextB[pr][pc].piece = null;
                audioManager.playCapture();
                triggerSpecialsChain(nextB, oldS, newS, extra, ep, player, []);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(player);
        setBoardForPostSacrifice(boardAfter);
        setPlayerWhoMadeQueenMove(player); setIsExtraTurnFromQueenMove(extra);
        setAnvilDropContext({ boardForNextStep: boardAfter, playerWhoseTurnCompleted: player, isExtraTurn: extra, newEnPassantTarget: ep, oldStreak: oldS, newStreak: newS, completedMilestones: [] }); 
        return true;
      }
    }
    triggerSpecialsChain(boardAfter, oldS, newS, extra, ep, player, []);
    return false;
  }, [isWhiteAI, isBlackAI, triggerSpecialsChain]);

  const performAiMove = useCallback(async () => {
    if (!aiInstanceRef.current || gameInfo.gameOver || isMoveProcessing || isAnySpecialModeActive) return;
    setIsAiThinking(true);
    try {
      const gameStateForAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, shroomSpawnCounter, nextShroomSpawnTurn);
      const aiResult = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);
      const aiMove = aiResult?.move;
      if (aiMove) {
        const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]);
        const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
        const piece = board[aiMove.from[0]][aiMove.from[1]].piece;
        if (!piece) throw new Error("AI Move Target Empty");
        const oldL = piece.level; const oldT = piece.type;
        setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(toAlg);
        setLastMovedPieceType(oldT);
        const applyResult = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces);
        let nextB = applyResult.newBoard;
        if (applyResult.itemReturned) {
          setInventory(prev => {
            const next = [...prev];
            const existing = next.find(i => i.type === applyResult.itemReturned);
            if (existing) existing.count++; else next.push({ type: applyResult.itemReturned!, count: 1 });
            return next;
          });
        }
        if (applyResult.reflectionOccurred) {
            const def = currentPlayer === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({ ...prev, [def]: [...(prev[def] || []), { ...applyResult.capturedPiece!, id: `refl_${Date.now()}` }] }));
            audioManager.playCapture(); setKillStreaks(prev => ({ ...prev, [def]: (prev[def] || 0) + 1, [currentPlayer]: 0 }));
            setBoard(nextB); setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, currentPlayer, false, null); }, 800);
            return;
        }
        if (applyResult.promotedToHero) { audioManager.playLevelUp(); addEffect('light-beam', algebraic); }
        const gain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0);
        const oldS = killStreaks[currentPlayer]; const newS = gain > 0 ? oldS + gain : 0;
        setKillStreaks(prev => ({ ...prev, [currentPlayer]: newS }));
        const isObliteration = applyResult.promotedToInfiltrator || (piece.type === 'infiltrator' && applyResult.capturedPiece);
        if (applyResult.capturedPiece && !isObliteration) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.capturedPiece!, id: `cap_${Date.now()}` }] }));
        setBoard(nextB);
        setTimeout(() => {
          setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false);
          processPawnSacrificeCheck(nextB, currentPlayer, {from: fromAlg, to: toAlg, type: aiMove.type as Move['type']}, oldL, oldT, applyResult.extraTurn || (oldS < 6 && newS >= 6), applyResult.enPassantTargetSet, oldS, newS);
        }, 800);
      }
    } catch (e) { setIsAiThinking(false); }
  }, [board, killStreaks, capturedPieces, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, processPawnSacrificeCheck, gameMoveCounter, enPassantTargetSquare, lastMovedPieceType]);

  useEffect(() => {
    if (((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI)) && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) {
      const timer = setTimeout(performAiMove, 500); return () => clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, performAiMove]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row]?.[col];
    const piece = sq?.piece;
    handlePieceHover(piece || null);
    
    if (isAnySpecialModeActive && localPlayerColor && currentPlayer !== localPlayerColor) return;
    if (onlineStatus === 'connected' && localPlayerColor !== currentPlayer && !isAnySpecialModeActive) return;

    if (isInventoryOpen) {
      if (selectedInventoryItemType && !selectedInventoryItemType.startsWith('portal_scroll_')) {
        if (piece && !piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          if (usedSlots >= attunementSlots) { toast({ title: "Attunement Limit", variant: "destructive" }); return; }
          if (selectedInventoryItemType === 'soul_harvest' && (piece.type === 'king' || piece.type === 'queen')) { toast({ title: "Royal Restriction", description: "Kings and Queens cannot harvest souls.", variant: "destructive" }); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
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

    if (isAwaitingDanceTarget) {
        if (!dancerToDance) {
            if (piece && piece.color === currentPlayer && piece.type === 'dancer') { setDancerToDance(algebraic); }
            return;
        }
        if (algebraic === dancerToDance) {
            setIsAwaitingDanceTarget(false); setDancerToDance(null);
            triggerSpecialsChain(board, anvilDropContext.oldS, anvilDropContext.newS, isExtraTurnFromQueenMove, anvilDropContext.newEnPassantTarget, currentPlayer, [...(anvilDropContext.completedMilestones || []), 'dance']);
            return;
        }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance);
        const isAdjacent = Math.abs(fr - row) <= 1 && Math.abs(fc - col) <= 1 && (fr !== row || fc !== col);
        const dir = currentPlayer === 'white' ? -1 : 1;
        const isOneForward = row === fr + dir && col === fc;
        if (isOneForward || isAdjacent) {
            let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const dancerPiece = nextBoard[fr][fc].piece!;
            if (isOneForward && !nextBoard[row][col].piece && !nextBoard[row][col].item) {
                nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = null;
            } else if (isAdjacent && nextBoard[row][col].piece) {
                const targetP = nextBoard[row][col].piece; nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = targetP;
            } else if (isOneForward && nextBoard[row][col].piece && nextBoard[row][col].piece!.color !== currentPlayer) {
                const victim = nextBoard[row][col].piece!; nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = null;
                setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...victim, id: `dance_${Date.now()}` }] }));
            } else { return; }
            setBoard(nextBoard); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove();
            triggerSpecialsChain(nextBoard, anvilDropContext.oldS, anvilDropContext.newS, isExtraTurnFromQueenMove, anvilDropContext.newEnPassantTarget, currentPlayer, [...(anvilDropContext.completedMilestones || []), 'dance']);
        }
        return;
    }

    if (isAwaitingPawnSacrifice) {
      if (piece && ['pawn', 'dancer', 'mimic', 'commander'].includes(piece.type) && piece.color === currentPlayer) {
        if (onlineStatus === 'connected') {
            wsRef.current?.send(JSON.stringify({ type: 'pawn-sacrifice', payload: { square: algebraic } }));
            setIsAwaitingPawnSacrifice(false);
        } else {
            let nextB = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            nextB[row][col].piece = null; setBoard(nextB); audioManager.playCapture();
            setIsAwaitingPawnSacrifice(false);
            triggerSpecialsChain(nextB, anvilDropContext?.oldStreak || 0, anvilDropContext?.newStreak || 0, isExtraTurnFromQueenMove, anvilDropContext?.newEnPassantTarget || null, currentPlayer, []);
        }
      }
      return;
    }

    if (isAwaitingAnvilDrop) {
      if (!sq?.piece && !sq?.item) {
        if (onlineStatus === 'connected') {
            wsRef.current?.send(JSON.stringify({ type: 'anvil-drop', square: algebraic }));
            setIsAwaitingAnvilDrop(false);
        } else {
            const nextB = anvilDropContext!.boardForNextStep.map(r => r.map(s => ({ ...s })));
            nextB[row][col].item = { type: 'anvil' };
            setBoard(nextB); audioManager.playAnvil(); setIsAwaitingAnvilDrop(false);
            triggerSpecialsChain(nextB, anvilDropContext!.oldStreak, anvilDropContext!.newStreak, anvilDropContext!.isExtraTurn, anvilDropContext!.newEnPassantTarget, currentPlayer, [...(anvilDropContext!.completedMilestones || []), 'anvil']);
        }
      }
      return;
    }

    if (isAwaitingHolyShield) {
        if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== shieldContext?.capturingPieceId) {
            if (onlineStatus === 'connected') {
                wsRef.current?.send(JSON.stringify({ type: 'holy-shield', square: algebraic }));
                setIsAwaitingHolyShield(false);
            } else {
                const nextB = shieldContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
                nextB[row][col].piece!.isShielded = true;
                setBoard(nextB); audioManager.playShield(); setIsAwaitingHolyShield(false);
                triggerSpecialsChain(nextB, shieldContext!.oldStreak!, shieldContext!.newStreak!, shieldContext!.isExtraTurn, shieldContext!.newEnPassantTarget, currentPlayer, [...(shieldContext!.completedMilestones || []), 'shield']);
            }
        }
        return;
    }

    if (isAwaitingArcherSnipe) {
        const oppColor = currentPlayer === 'white' ? 'black' : 'white';
        const myArchers = board.flat().filter(sq => sq.piece && sq.piece.color === currentPlayer && sq.piece.type === 'archer').map(sq => sq.piece!);
        if (piece && piece.color === oppColor && piece.type !== 'king' && piece.type !== 'queen') {
            const responsibleArcher = myArchers.find(a => a.level >= piece.level);
            if (responsibleArcher) {
                if (onlineStatus === 'connected') {
                    wsRef.current?.send(JSON.stringify({ type: 'archer-snipe', square: algebraic }));
                    setIsAwaitingArcherSnipe(false);
                } else {
                    const nextB = archerSnipeContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
                    const snipedPiece = nextB[row][col].piece!;
                    nextB[row][col].piece = null;
                    const arRow = nextB.findIndex(r => r.some(s => s.piece?.id === responsibleArcher.id));
                    const arCol = nextB[arRow].findIndex(s => s.piece?.id === responsibleArcher.id);
                    const gain = {pawn: 1, dancer: 1, mimic: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0;
                    nextB[arRow][arCol].piece!.level += gain;
                    setBoard(nextB); audioManager.playSnipe(); setIsAwaitingArcherSnipe(false);
                    triggerSpecialsChain(nextB, archerSnipeContext!.oldStreak!, archerSnipeContext!.newStreak!, archerSnipeContext!.isExtraTurn, archerSnipeContext!.newEnPassantTarget, currentPlayer, [...(archerSnipeContext!.completedMilestones || []), 'snipe']);
                }
            }
        }
        return;
    }

    if (selectedSquare) {
      const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
      const moving = board[fR][fC].piece; if (!moving) return;
      if (selectedSquare === algebraic && moving.heldItem === 'summon_anvil') { setIsAwaitingAnvilScrollTarget(true); return; }
      if (selectedSquare === algebraic) {
        if (moving.heldItem === 'ice_blast' || moving.heldItem === 'soul_harvest') {
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: moving.heldItem === 'ice_blast' ? 'ice-blast' : 'soul-harvest' } })); }
          else {
            clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: moving.heldItem === 'ice_blast' ? 'ice-blast' : 'soul-harvest' }, enPassantTargetSquare, capturedPieces);
            setBoard(applyResult.newBoard); audioManager.playLevelUp();
            setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(applyResult.newBoard, currentPlayer, false, null); }, 800);
          }
          return;
        }
      }
      const freshlyCalculated = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType);
      if (freshlyCalculated.includes(algebraic)) {
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'move' } })); }
        else {
            clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            const oldL = moving.level; const oldT = moving.type;
            setLastMovedPieceType(oldT);
            const applyResult = applyMove(board, { from: selectedSquare, to: algebraic }, enPassantTargetSquare, capturedPieces);
            let nextB = applyResult.newBoard;
            if (applyResult.itemReturned) {
              setInventory(prev => {
                const next = [...prev];
                const existing = next.find(i => i.type === applyResult.itemReturned);
                if (existing) existing.count++; else next.push({ type: applyResult.itemReturned!, count: 1 });
                return next;
              });
              toast({ title: "Equipment Returned", description: `${ITEM_METADATA[applyResult.itemReturned].name} unequipped.` });
            }
            if (applyResult.reflectionOccurred) {
                const def = currentPlayer === 'white' ? 'black' : 'white';
                setCapturedPieces(prev => ({ ...prev, [def]: [...(prev[def] || []), { ...applyResult.capturedPiece!, id: `refl_${Date.now()}` }] }));
                audioManager.playCapture(); setKillStreaks(prev => ({ ...prev, [def]: (prev[def] || 0) + 1, [currentPlayer]: 0 }));
                setBoard(nextB); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, currentPlayer, false, null); }, 800);
                return;
            }
            if (applyResult.promotedToHero) { audioManager.playLevelUp(); addEffect('light-beam', algebraic); toast({ title: "HERO ASCENDED!", description: "Your Commander has reached the back rank!" }); }
            const gain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0);
            const oldS = killStreaks[currentPlayer]; const newS = gain > 0 ? oldS + gain : 0;
            setKillStreaks(prev => ({ ...prev, [currentPlayer]: newS }));
            const isObliteration = applyResult.promotedToInfiltrator || (moving.type === 'infiltrator' && applyResult.capturedPiece);
            if (applyResult.capturedPiece && !isObliteration) setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), { ...applyResult.capturedPiece!, id: `cap_${Date.now()}` }] }));
            setBoard(nextB);
            setTimeout(() => {
                setIsMoveProcessing(false); clickGuardRef.current = false;
                const isExtra = applyResult.extraTurn || (oldS < 6 && newS >= 6);
                if (['pawn', 'dancer', 'mimic'].includes(nextB[row][col].piece?.type || '') && (row === 0 || row === 7)) {
                    setPlayerToPromote(currentPlayer); setPromotionTargetLevel(getPromotionLevel(applyResult.capturedPiece?.type || applyResult.pieceCapturedByAnvil?.type || null));
                    setIsPromotingPawn(true); setPromotionSquare(algebraic);
                    setAnvilDropContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: applyResult.enPassantTargetSet, oldS, newS });
                } else {
                    processPawnSacrificeCheck(nextB, currentPlayer, {from: selectedSquare, to: algebraic, type: 'move'}, oldL, oldT, isExtra, applyResult.enPassantTargetSet, oldS, newS);
                }
            }, 800);
        }
        return;
      }
    }
    if (piece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMovedPieceType)); }
    else { setSelectedSquare(null); setPossibleMoves([]); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, boardForPostSacrifice, anvilDropContext, isExtraTurnFromQueenMove, isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, toast, handlePieceHover, processPawnSacrificeCheck, triggerSpecialsChain, processMoveEnd, shieldContext, archerSnipeContext, dancerToDance, lastMovedPieceType]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'finalize-promotion', payload: { square: promotionSquare, promoteTo: pieceType } })); setIsPromotingPawn(false); setPromotionSquare(null); }
    else {
        let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        const { row, col } = algebraicToCoords(promotionSquare); const beingPromoted = boardToUpdate[row][col].piece; if (!beingPromoted) return;
        if (beingPromoted.heldItem && !isItemValidForPiece(beingPromoted.heldItem, pieceType)) {
          const item = beingPromoted.heldItem; setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === item); if (existing) existing.count++; else next.push({ type: item, count: 1 }); return next; });
          beingPromoted.heldItem = null; toast({ title: "Equipment Returned", description: `${ITEM_METADATA[item].name} unequipped.` });
        }
        boardToUpdate[row][col].piece = { ...beingPromoted, type: pieceType, level: promotionTargetLevel, hasMoved: true };
        setBoard(boardToUpdate); setIsPromotingPawn(false); setPromotionSquare(null); audioManager.playLevelUp();
        triggerSpecialsChain(boardToUpdate, anvilDropContext?.oldS || 0, anvilDropContext?.newS || 0, (boardToUpdate[row][col].piece!.level >= 5) || (anvilDropContext?.isExtraTurn || false), anvilDropContext?.newEnPassantTarget || null, currentPlayer, []);
    }
  }, [board, promotionSquare, promotionTargetLevel, anvilDropContext, triggerSpecialsChain, currentPlayer, onlineStatus, toast]);

  useEffect(() => {
    if (!board || !prevBoardRef.current) { prevBoardRef.current = board; return; }
    const prevPieceLevels = new Map<string, number>();
    prevBoardRef.current.forEach(row => row.forEach(sq => { if (sq.piece) prevPieceLevels.set(sq.piece.id, sq.piece.level); }));
    const currentPieceIds = new Set<string>(); board.forEach(row => row.forEach(currSq => { if (currSq.piece) currentPieceIds.add(currSq.piece.id); }));
    const newEffectsToAdd: {type: Effect['type'], square: AlgebraicSquare, val?: number}[] = [];
    board.forEach(row => row.forEach(currSq => {
      if (currSq.piece) {
        const prevLevel = prevPieceLevels.get(currSq.piece.id);
        if (prevLevel !== undefined && currSq.piece.level !== prevLevel) { const diff = currSq.piece.level - prevLevel; newEffectsToAdd.push({ type: 'level-change', square: currSq.algebraic, val: diff }); }
      }
    }));
    prevBoardRef.current.forEach(row => row.forEach(prevSq => { if (prevSq.piece && !currentPieceIds.has(prevSq.piece.id)) { newEffectsToAdd.push({ type: 'poof', square: prevSq.algebraic }); } }));
    if (newEffectsToAdd.length > 0) newEffectsToAdd.forEach(e => addEffect(e.type, e.square, undefined, e.val));
    prevBoardRef.current = board;
  }, [board, addEffect]);

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0.5 pb-1">
        <div className="w-full flex items-center justify-between">
          <div className="w-1/3 flex items-center justify-center"></div>
          <div className="w-1/3 flex items-center justify-center"> <div className="flex items-center gap-1.5 shrink-0"> <PixelAnvil className="h-5 w-5 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-8 w-auto" /> <ShroomIcon className="h-5 w-5 shrink-0" /> </div> </div>
          <div className="w-1/3 flex justify-end"> <AuthWidget /> </div>
        </div>
        <div className={cn("text-center text-[10px] font-bold min-h-[1.2em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}>
          {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? `${getPlayerDisplayName(currentPlayer)} is thinking...` : gameInfo.message}
        </div>
        <div className="w-full">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : null) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} />
        </div>
        <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={activeTimerPlayer} chatMessages={chatMessages} onSendMessage={sendMessage} isMessengerOpen={isMessengerOpen} onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)} hasUnreadMessages={hasUnreadMessages} />
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-6 px-1.5 text-[10px]"><BookOpen /> Rules</Button>
          <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || onlineStatus !== 'disconnected'} className="h-6 px-1.5 text-[10px]"><Package /> Loot</Button>
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]"><Settings /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-xs font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent></Popover>
          <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={onlineStatus !== 'disconnected' || !user}><Swords /> Dungeon</Button></Link>
          <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" disabled={onlineStatus !== 'disconnected'}><Trophy /> L.board</Button></Link>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
            <Button variant="outline" size="sm" onClick={() => setIsWhiteAI(!isWhiteAI)} className="h-6 px-1.5 text-[10px]"><Bot /> W:{isWhiteAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setIsBlackAI(!isBlackAI)} className="h-6 px-1.5 text-[10px]"><Bot /> B:{isBlackAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="h-6 px-1.5 text-[10px]"><View /> View</Button>
        </div>
        <Card className="w-full mt-1"> <CardContent className="p-1.5 flex flex-col gap-1.5"> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || rankedQueueStatus === 'searching'} className="h-6 px-1.5 text-[10px] w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Searching...' : 'Ranked Match'}</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-6 px-1.5 text-[10px] w-full"><Globe className="mr-1 h-3 w-3" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-6 px-1.5 text-[10px] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-6 px-1.5 text-[10px]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-1 items-center"> <div className="flex items-center gap-2 text-[10px] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); toast({ title: "Copied!" }); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-6 px-1.5 text-[10px] w-full"><Link2Off className="mr-1 h-3 w-3" /> Disconnect</Button> </div> )} <div className="w-full text-center h-3 text-[10px] text-muted-foreground uppercase font-pixel tracking-tighter">{onlineStatus}</div> </CardContent> </Card>
      </div>
    </div>
  );

  const desktopLayout = (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0"> <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={activeTimerPlayer} chatMessages={chatMessages} onSendMessage={sendMessage} isMessengerOpen={isMessengerOpen} onToggleMessenger={() => setIsMessengerOpen(!isMessengerOpen)} hasUnreadMessages={hasUnreadMessages} /> </div>
      <div className="w-1/2 flex flex-col items-center gap-2"> <div className="w-full flex items-center justify-center gap-6"> <PixelAnvil className="h-10 w-10 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-16 w-auto" /> <ShroomIcon className="h-10 w-10 shrink-0" /> </div> <div className={cn("text-center text-sm font-bold min-h-[1.25em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? `${getPlayerDisplayName(currentPlayer)} is thinking...` : gameInfo.message} </div> <div className="w-full max-w-lg"> <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : null) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} /> </div> </div>
      <div className="w-1/4 flex flex-col gap-4"> <AuthWidget /> <Card> <CardContent className="p-2 flex flex-col gap-2"> <div className="flex flex-wrap justify-center items-center gap-1"> <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-7 px-2 text-xs"><BookOpen /> Rules</Button> <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || onlineStatus !== 'disconnected'} className="h-7 px-2 text-xs"><Package /> Loot</Button> <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected' || !user}><Swords /> Dungeon</Button></Link> <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={onlineStatus !== 'disconnected'}><Trophy /> L.board</Button></Link> </div> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || rankedQueueStatus === 'searching'} className="h-7 px-2 text-xs w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Leave Queue' : 'Ranked Match'}</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-7 px-2 text-xs w-full"><Globe className="mr-1 h-3 w-3" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-xs flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-7 px-2 text-xs">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-2 items-center border-t pt-2"> <div className="flex items-center gap-2 text-xs font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); toast({ title: "Copied!" }); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-7 px-2 text-xs w-full">Disconnect</Button> </div> )} <div className="w-full text-center h-4 text-xs mt-1 text-muted-foreground uppercase font-pixel">{onlineStatus}</div> </CardContent> </Card> </div>
    </div>
  );

  return (
    <div className={cn("min-h-full h-full w-full bg-background flex flex-col relative", showLossScreen && "after:animate-fade-to-black")}>
      {showWinScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center">YOU WON</p></div>)}
      {showLossScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center">YOU LOST</p></div>)}
      <div className="lg:hidden h-full">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={(type) => { if (type.startsWith('portal_scroll_')) { toast({ title: "Portal Logic", description: "Use this in Dungeon Mode to skip floors!" }); } }} usedSlots={usedSlots} attunementSlots={attunementSlots} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor={playerToPromote} />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
      <GameSummaryDialog isOpen={showSummary} onClose={() => setShowSummary(false)} winner={gameInfo.winner} winnerName={getPlayerDisplayName(gameInfo.winner as PlayerColor)} loserName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'black' : 'white')} eloInfo={eloResult} moveCount={gameMoveCounter} onReset={() => fullGameReset()} />
      <AlertDialog open={abilityChoiceDialog?.isOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Select Action</AlertDialogTitle><AlertDialogDescription>This piece has multiple special actions available. Choose one to perform.</AlertDialogDescription></AlertDialogHeader><div className="flex flex-col gap-2"><Button onClick={() => abilityChoiceDialog?.onChoice('ability')}>Use Piece Ability</Button><Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}>Use Magic Item (Scroll)</Button></div><AlertDialogFooter><AlertDialogCancel onClick={() => setAbilityChoiceDialog(null)}>Cancel</AlertDialogCancel></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );

  function fullGameReset() {
    let initial = initializeBoard(userData?.eloRating || 1200, 1200, userData?.unlockedPieces || []);
    setBoard(initial); setCurrentPlayer('white'); setGameInfo({ ...initialGameStatus }); setCapturedPieces({ white: [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setHistoryStack([]); setPositionHistory([]); setSelectedSquare(null); setPossibleMoves([]); setLastMoveFrom(null); setLastMoveTo(null); setLastMovedPieceType(null); setGameMoveCounter(0); setEnPassantTargetSquare(null); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setShowLossScreen(false); setShowWinScreen(false); setShowSummary(false); audioManager.playStart();
    aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  }

  function saveLoadoutToFirestore(b: BoardState, inv: InventoryItem[]) {
      if (!user || !firestore) return;
      const equipment: Record<string, string> = {};
      b.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
      updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { inventory: inv, equipment });
  }
}
