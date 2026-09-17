'use client';

import type { ReactNode } from 'react';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import { GameSummaryDialog } from '@/components/evolving-chess/GameSummaryDialog';
import { InventoryWindow } from '@/components/evolving-chess/InventoryWindow';
import { MycoSpellMenu, type MycoSpell } from '@/components/evolving-chess/MycoSpellMenu';
import { RoyalStore } from '@/components/evolving-chess/RoyalStore';
import {
  initializeBoard,
  createEmptyBoard,
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
  isSilenced,
  syncSoulLink,
  FRONTLINE_TYPES,
  processOilSlickTimers,
  isSquareAttacked,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, ChatMessage, InventoryItem, InventoryItemType, ItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag, Trophy, Settings, Volume2, BrainCircuit, Swords, Package, Copy, RotateCcw, Landmark, Coins } from 'lucide-react';
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
import { 
    Accordion, 
    AccordionContent, 
    AccordionItem, 
    AccordionTrigger 
} from "@/components/ui/accordion";
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AuthWidget } from '@/components/auth/AuthWidget';
import { useUser, useAuth, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import Link from 'next/link';
import { audioManager } from '@/lib/audio-manager';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { VibeChessTitle, PixelAnvil, ShroomIcon } from '@/components/evolving-chess/IconLibrary';
import { useSocial } from '@/components/social/SocialContext';

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

const DUNGEON_EXP_MAP: Record<string, number> = {
  pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, 
  knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2
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
  nextShroomSpawnTurn?: number,
  lastMovedPieceHeldItem?: InventoryItemType | null,
  lastMovedPieceLevel?: number | null,
  didOpponentCaptureLastTurn?: boolean,
  positionHistory?: string[]
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
      white: Array.isArray(currentCapturedPieces?.white) ? currentCapturedPieces.white.map(p => ({ ...p })) : [],
      black: Array.isArray(currentCapturedPieces?.black) ? currentCapturedPieces.black.map(p => ({ ...p })) : [],
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
    lastMovedPieceType: lastMovedPieceType,
    lastMovedPieceHeldItem: lastMovedPieceHeldItem,
    lastMovedPieceLevel: lastMovedPieceLevel,
    didOpponentCaptureLastTurn: didOpponentCaptureLastTurn,
    positionHistory: positionHistory ? [...positionHistory] : []
  };
}

export default function EvolvingChessPage() {
  const { user, userData, isUserLoading } = useUser();
  const { addLog, onlineStatus: socialOnlineStatus, sendMessage: sendSocialMessage, isMessengerOpen, setIsMessengerOpen, hasUnread, clearUnread, visibleCategories, setVisibleCategories, chatInput, setChatInput, onlineUserIds, joinTournamentQueue, tournamentQueueCount } = useSocial();
  const firestore = getFirestore();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
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
  const [isRoyalStoreOpen, setIsRoyalStoreOpen] = useState(false);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [lastMovedPieceType, setLastMovedPieceType] = useState<PieceType | null>(null);
  const [lastMovedPieceHeldItem, setLastMovedPieceHeldItem] = useState<InventoryItemType | null>(null);
  const [lastMovedPieceLevel, setLastMovedPieceLevel] = useState<number | null>(null);
  const [gameMoveCounter, setGameMoveCounter] = useState(0);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);
  const [isAwaitingDanceTarget, setIsAwaitingDanceTarget] = useState(false);
  const [dancerToDance, setDancerToDance] = useState<AlgebraicSquare | null>(null);
  const [isAwaitingGrappleThrow, setIsAwaitingGrappleThrow] = useState(false);
  const [grappledPieceSubject, setGrappledPieceSubject] = useState<{ piece: Piece, from: AlgebraicSquare } | null>(null);
  const [grappledItemSubject, setGrappledItemSubject] = useState<{ type: ItemType, from: AlgebraicSquare } | null>(null);
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
  const [specialActionContext, setSpecialActionContext] = useState<{ 
    boardForNextStep: BoardState, 
    playerWhoseTurnCompleted: PlayerColor, 
    isExtraTurn: boolean, 
    newEnPassantTarget: AlgebraicSquare | null, 
    oldStreak: number, 
    newStreak: number, 
    completedMilestones?: string[], 
    currentGraveyard: { white: Piece[], black: Piece[] }, 
    currentKs: { white: number, black: number },
    capturingPieceId: string | null
  } | null>(null);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [inputRoomId, setInputRoomId] = useState('');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'waiting'>('disconnected');
  const [gamePlayers, setGamePlayers] = useState<{white: {username?: string; userId?: string; elo?: number;} | null, black: {username?: string; userId?: string; elo?: number;} | null} | null>(null);
  const [showLossScreen, setShowLossScreen] = useState(false);
  const [showWinScreen, setShowWinScreen] = useState(false);
  const [rankedQueueStatus, setRankedQueueStatus] = useState<'idle' | 'searching'>('idle');
  const [eloResult, setEloResult] = useState<any | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [volume, setVolume] = useState(100);
  const [aiDifficulty, setAiDifficulty] = useState(4);
  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [isAwaitingDecreeTarget, setIsAwaitingDecreeTarget] = useState(false);
  const [isAwaitingEarthquakeScrollTarget, setIsAwaitingEarthquakeScrollTarget] = useState(false);
  const [isAwaitingOilSlickTarget, setIsAwaitingOilSlickTarget] = useState(false);
  const [isAwaitingRayTarget, setIsAwaitingRayTarget] = useState<'glacial' | 'burning' | null>(null);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);
  const [isSelectingMycoSpell, setIsSelectingMycoSpell] = useState(false);
  const [isSelectingTeleportAlly, setIsSelectingTeleportAlly] = useState(false);
  const [isSelectingTeleportShroom, setIsSelectingTeleportShroom] = useState(false);
  const [teleportAllyPieceId, setTeleportAllyPieceId] = useState<string | null>(null);
  const [isSelectingSporeBombShroom, setIsSelectingSporeBombShroom] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isArenaConfirmOpen, setIsArenaConfirmOpen] = useState(false);
  const [promotionQueue, setPromotionQueue] = useState<{ square: AlgebraicSquare, targetLevel: number }[]>([]);
  const [aiStrikeCount, setAiStrikeCount] = useState(0);
  const [didCaptureLastTurn, setDidCaptureLastTurn] = useState<{ white: boolean, black: boolean }>({ white: false, black: false });

  const aiInstanceRef = useRef<VibeChessAI | null>(null);
  const clickGuardRef = useRef(false);
  const uniqueIdCounterRef = useRef(20000);
  const gameOverRef = useRef(false);
  const hasInitializedSession = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const handlePieceHover = useCallback((p: Piece | null) => { setPieceForInfoDisplay(p); }, []);

  const addEffectCallback = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number, itemType?: InventoryItemType) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value, itemType }]);
    setTimeout(() => { setEffects(current => current.filter(e => e.id !== id)); }, 1500);
  }, []);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const isAnySpecialModeActive = useMemo(() => {
    return isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingDanceTarget || !!dancerToDance || isAwaitingGrappleThrow || isAwaitingEarthquakeScrollTarget || isSelectingMycoSpell || isSelectingTeleportAlly || isSelectingTeleportShroom || isSelectingSporeBombShroom || isAwaitingOilSlickTarget || !!isAwaitingRayTarget || isAwaitingDecreeTarget;
  }, [
    isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isPromotingPawn, isAwaitingPawnSacrifice, 
    isInventoryOpen, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, 
    isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingHolyShield, 
    isAwaitingArcherSnipe, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, 
    isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, 
    isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingOilSlickTarget, 
    isAwaitingRayTarget, isAwaitingDecreeTarget
  ]);

  const statusMessage = useMemo(() => {
    if (isInventoryOpen) return "SELECT ITEM TO EQUIP!";
    if (isAiThinking) return (currentPlayer === 'white' ? "WHITE (AI) THINKING..." : "BLACK (AI) THINKING...");
    if (isAwaitingPawnSacrifice) return "ROYAL SACRIFICE REQUIRED!";
    if (isPromotingPawn) return "PROMOTE YOUR PAWN!";
    if (isAwaitingCommanderPromotion) return "SELECT PAWN TO BE PROMOTED TO COMMANDER!";
    if (isAwaitingAnvilDrop) return "PLACE AN ANVIL!";
    if (isAwaitingHolyShield) return "SELECT ALLY TO SHIELD!";
    if (isAwaitingArcherSnipe) return "SELECT TARGET TO SNIPE!";
    if (isAwaitingDanceTarget) return dancerToDance ? "PERFORM YOUR DANCE!" : "SELECT A DANCER!";
    if (isAwaitingGrappleThrow) return "THROW TO AN EMPTY SPACE!";
    if (isSelectingMycoSpell) return "CHOOSE MUSHROOMANCY SPELL";
    if (isAwaitingWindScrollTarget) return "SELECT WIND PUSH TARGET";
    if (isAwaitingAnvilScrollTarget) return "SELECT ANVIL DROP TARGET";
    if (isAwaitingShieldScrollTarget) return "SELECT ALLY TO SHIELD";
    if (isAwaitingSwapScrollTarget) return "SELECT ALLY TO SWAP";
    if (isAwaitingDecreeTarget) return "SELECT PAWN TO PROMOTE";
    if (isAwaitingEarthquakeScrollTarget) return "SELECT EARTHQUAKE TARGET";
    if (isAwaitingOilSlickTarget) return "SELECT 3X3 AREA FOR OIL SLICK!";
    if (isAwaitingRayTarget) return "SELECT RAY DIRECTION!";
    return gameInfo.message || " ";
  }, [
    isInventoryOpen, isAiThinking, isAwaitingPawnSacrifice, isPromotingPawn,
    isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield,
    isAwaitingArcherSnipe, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow,
    isSelectingMycoSpell, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget,
    isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget,
    isAwaitingEarthquakeScrollTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget,
    gameInfo.message, currentPlayer
  ]);

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

  const saveLoadoutToFirestore = useCallback((b: BoardState, inv: InventoryItem[]) => {
      if (!user || !firestore) return;
      const equipment: Record<string, string> = {};
      b.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
      updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { inventory: inv, equipment });
  }, [user, firestore]);

  const pushHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null }))),
      currentPlayer, gameInfo: { ...gameInfo }, capturedPieces: { white: [...capturedPieces.white], black: [...capturedPieces.black] }, killStreaks: { ...killStreaks }, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory: [...positionHistory], lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, lastMovedPieceHeldItem, lastMovedPieceLevel, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, isAwaitingRookSacrifice: false, playerToSacrificeForRook: null, rookToMakeInvulnerable: null, boardForRookSacrifice: null, originalTurnPlayerForRookSacrifice: null, isExtraTurnFromRookLevelUp: false, isResurrectionPromotionInProgress: false, playerForPostResurrectionPromotion: null, isExtraTurnForPostResurrectionPromotion: false, promotionSquare, promotionMoveWasCapture: false, originalPromotionLevel: null, promotionPawnOriginalLevel: null, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares: [...resurrectedSquares], turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil: playerToDropAnvil || null, anvilDropContext: specialActionContext ? { ...specialActionContext } as any : null, anvilDropAfterPromotion: false, inventory: [...inventory], didOpponentCaptureLastTurn: didCaptureLastTurn[currentPlayer === 'white' ? 'black' : 'white']
    };
    setHistoryStack(prev => [...prev, snapshot].slice(-40));
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory, lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, lastMovedPieceHeldItem, lastMovedPieceLevel, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, promotionSquare, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares, turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil, specialActionContext, inventory, didCaptureLastTurn]);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0 || isMoveProcessing || isAiThinking || onlineStatus !== 'disconnected' || gameInfo.gameOver) return;
    const prevState = historyStack[historyStack.length - 1]; setHistoryStack(prev => prev.slice(0, -1));
    setBoard(prevState.board); setCurrentPlayer(prevState.currentPlayer); setGameInfo(prevState.gameInfo); setCapturedPieces(prevState.capturedPieces); setKillStreaks(prevState.killStreaks); setBoardOrientation(prevState.boardOrientation); setViewMode(prevState.viewMode); setIsWhiteAI(prevState.isWhiteAI); setIsBlackAI(prevState.isBlackAI); setPositionHistory(prevState.positionHistory); setLastMoveFrom(prevState.lastMoveFrom); setLastMoveTo(prevState.lastMoveTo); setGameMoveCounter(prevState.gameMoveCounter); setEnPassantTargetSquare(prevState.enPassantTargetSquare); setLastMovedPieceHeldItem(prevState.lastMovedPieceHeldItem as any); setLastMovedPieceLevel(prevState.lastMovedPieceLevel as any); setIsAwaitingPawnSacrifice(prevState.isAwaitingPawnSacrifice); setPlayerToSacrificePawn(prevState.playerToSacrificePawn); setBoardForPostSacrifice(prevState.boardForPostSacrifice); setPlayerWhoMadeQueenMove(prevState.boardOrientation as any); setIsExtraTurnFromQueenMove(prevState.isExtraTurnFromQueenMove); setFirstBloodAchieved(prevState.firstBloodAchieved); setPlayerWhoGotFirstBlood(prevState.playerWhoGotFirstBlood); setIsAwaitingCommanderPromotion(prevState.isAwaitingCommanderPromotion); setResurrectedSquares(prevState.resurrectedSquares); setWhiteTimeouts(prevState.whiteTimeouts); setBlackTimeouts(prevState.blackTimeouts); setIsAwaitingAnvilDrop(prevState.isAwaitingAnvilDrop); setPlayerToDropAnvil(prevState.playerToDropAnvil || null); setSpecialActionContext(prevState.anvilDropContext as any); if (prevState.inventory) setInventory(prevState.inventory);
    setSelectedSquare(null); setPossibleMoves([]); audioManager.playMove(); addLog("Move Undone.");
  }, [historyStack, isMoveProcessing, isAiThinking, onlineStatus, gameInfo.gameOver, addLog]);

  const handleUsePortalScroll = useCallback((type: InventoryItemType) => {
    if (!user || !type.startsWith('portal_scroll_')) return;
    const targetFloor = parseInt(type.split('_')[2]);
    if (isNaN(targetFloor)) return;

    // Consume item
    const newInv = inventory.map(item => {
        if (item.type === type) return { ...item, count: item.count - 1 };
        return item;
    }).filter(item => item.count > 0);
    setInventory(newInv);

    // Prepare Dungeon State and Redirect
    const userRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userRef, { 
        inventory: newInv,
        dungeonState: {
            level: targetFloor,
            board: [], 
            currentPlayer: 'white',
            killStreaks: { white: 0, black: 0 },
            capturedPieces: { white: [], black: [] },
            shroomSpawnCounter: 0,
            nextShroomSpawnTurn: 5,
            enPassantTargetSquare: null
        }
    });

    toast({ title: "Warp Active!", description: `Traveling to Floor ${targetFloor}...` });
    router.push('/dungeon');
  }, [user, inventory, firestore, router, toast]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null) => {
    let currentBoardState = boardForNextStep; const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter); setCapturedPieces(currentGraveyard); setKillStreaks(currentKs);
    setDidCaptureLastTurn(prev => ({ ...prev, [playerWhoseTurnCompleted]: wasCaptureThisTurn }));
    currentBoardState = processOilSlickTimers(currentBoardState, playerWhoseTurnCompleted);

    if (onlineStatus === 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
      let currentShroomCounter = shroomSpawnCounter + 1; setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= nextShroomSpawnTurn) {
          const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(currentBoardState);
          if (shroomSpawnedAt) { currentBoardState = boardAfterShroom; setBoard(currentBoardState); addLog("A mystical Shroom 🍄 has appeared!"); audioManager.playShroom(); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); }
      }
    }

    const nextPlayer = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison } = processPoisonDamage(currentBoardState, nextPlayer);
    
    const actualMovedType = movedPieceType || lastMovedPieceType;
    const isSelfInCheck = isKingInCheck(boardAfterPoison, playerWhoseTurnCompleted, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (isSelfInCheck) {
        const msg = `AUTO-CHECKMATE! ${getPlayerDisplayName(playerWhoseTurnCompleted)} exposed their own King!`;
        const winner = playerWhoseTurnCompleted === 'white' ? 'black' : 'white';
        setGameInfo({ message: msg, isCheck: true, playerWithKingInCheck: playerWhoseTurnCompleted, isCheckmate: true, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner, isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true; audioManager.playDefeat(); return;
    }

    const inCheck = isKingInCheck(boardAfterPoison, nextPlayer, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    const currentHash = boardToPositionHash(boardAfterPoison, nextPlayer, newEnPassantTarget);
    let newHistory = [...positionHistory];
    const isFrontlineMove = actualMovedType && FRONTLINE_TYPES.includes(actualMovedType);
    if (wasCaptureThisTurn || isFrontlineMove) { newHistory = [currentHash]; } else { newHistory.push(currentHash); }
    setPositionHistory(newHistory);
    const repetitionCount = newHistory.filter(h => h === currentHash).length;
    const isRepetition = repetitionCount >= 3;

    let mate = inCheck && isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (mate) {
        const kingInfo = findKing(boardAfterPoison, nextPlayer);
        if (kingInfo && kingInfo.piece.heldItem === 'kings_ransom') {
            const backRank = nextPlayer === 'white' ? 7 : 0;
            const safeSquares: AlgebraicSquare[] = [];
            for (let c = 0; c < 8; c++) {
                const alg = coordsToAlgebraic(backRank, c);
                if (!boardAfterPoison[backRank][c].piece && !boardAfterPoison[backRank][c].item) {
                    if (!isSquareAttacked(boardAfterPoison, alg, playerWhoseTurnCompleted, false, null, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel)) { safeSquares.push(alg); }
                }
            }
            if (safeSquares.length > 0) {
                const dest = safeSquares[Math.floor(Math.random() * safeSquares.length)];
                const { row: dr, col: dc } = algebraicToCoords(dest);
                const { row: kr, col: kc } = algebraicToCoords(kingInfo.algebraic);
                boardAfterPoison[kr][kc].piece = null;
                boardAfterPoison[dr][dc].piece = { ...kingInfo.piece, heldItem: null, level: 1, hasMoved: true };
                addEffectCallback('light-beam', dest); audioManager.playResurrect(); addLog(`${getPlayerDisplayName(nextPlayer)} saved by King's Ransom!`);
                mate = isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel);
            }
        }
    }
    
    setBoard(boardAfterPoison); setCurrentPlayer(nextPlayer); setEnPassantTargetSquare(newEnPassantTarget);
    if (inCheck && isExtraTurn) {
        const msg = `Auto-Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!`;
        setGameInfo({ message: msg, isCheck: true, playerWithKingInCheck: nextPlayer, isCheckmate: true, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: playerWhoseTurnCompleted, isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true; return;
    }
    
    const stale = !inCheck && isStalemate(boardAfterPoison, nextPlayer, newEnPassantTarget, actualMovedType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (mate || stale || isRepetition) {
        const msg = mate ? `Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!` : (isRepetition ? "Draw by Repetition!" : "Stalemate!");
        setGameInfo({ message: msg, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: mate, isStalemate: stale, isThreefoldRepetitionDraw: isRepetition, gameOver: true, winner: mate ? playerWhoseTurnCompleted : 'draw', isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true;
    } else {
        if (inCheck) { addLog("Check!"); audioManager.playCheck(); }
        setGameInfo({ message: inCheck ? "Check!" : (isExtraTurn ? `${getPlayerDisplayName(playerWhoseTurnCompleted)} gets an extra turn!` : " "), isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: false, isInfiltrationWin: false });
    }
    if (onlineStatus === 'disconnected' && viewMode === 'flipping') {
      const isNextAI = nextPlayer === 'white' ? isWhiteAI : isBlackAI;
      if (!isNextAI) setBoardOrientation(nextPlayer);
    }
  }, [gameMoveCounter, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor, addLog, getPlayerDisplayName, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addEffectCallback, didCaptureLastTurn, viewMode, isWhiteAI, isBlackAI, positionHistory]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, oldStreak: number, newStreak: number, isExtraTurn: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = [], capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);
    const silenced = boardToChain.flat().find(sq => sq.piece?.color === actingPlayer && isSilenced(boardToChain, sq.rowIndex, sq.colIndex, actingPlayer));
    let nextGraveyard = { 
        white: Array.isArray(currentGraveyard.white) ? [...currentGraveyard.white] : [],
        black: Array.isArray(currentGraveyard.black) ? [...currentGraveyard.black] : []
    };
    if (newStreak >= 8 && !completedMilestones.includes('conquest')) {
        const actingKing = boardToChain.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer)?.piece;
        if (actingKing?.heldItem === 'kings_conquest') {
            const msg = `CONQUEST VICTORY! ${getPlayerDisplayName(actingPlayer)} reigns supreme!`;
            setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: actingPlayer });
            addLog(msg); gameOverRef.current = true; audioManager.playVictory(); return;
        }
    }
    if (!silenced && newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const hasDancers = boardToChain.flat().some(sq => {
          const p = sq.piece;
          if (!p || p.color !== actingPlayer) return false;
          if (p.type === 'dancer') return true;
          if (p.type === 'mimic' && lastMovedPieceType === 'dancer') return true;
          return false;
        });
        if (hasDancers) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const aiDancerSq = nextBoard.flat().find(sq => (sq.piece?.type === 'dancer' || (sq.piece?.type === 'mimic' && lastMovedPieceType === 'dancer')) && sq.piece?.color === actingPlayer);
                if (aiDancerSq) {
                    const {rowIndex: r, colIndex: c} = aiDancerSq;
                    const dancerPiece = aiDancerSq.piece!;
                    const dancerDir = actingPlayer === 'white' ? -1 : 1;
                    const candidates: {r: number, c: number, priority: number}[] = [];
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                        if(dr===0 && dc===0) continue;
                        const nr = r+dr, nc = c+dc;
                        if (isValidSquare(nr, nc)) {
                            const tSq = nextBoard[nr][nc];
                            if (!tSq.piece && (!tSq.item || tSq.item.type === 'shroom')) {
                                if (dr === dancerDir && dc === 0) candidates.push({r: nr, c: nc, priority: 1}); 
                            } else if (tSq.piece) {
                                if (tSq.piece.color !== actingPlayer && tSq.piece.type !== 'king' && !tSq.piece.isShielded) candidates.push({r: nr, c: nc, priority: 2}); 
                                else if (tSq.piece.color === actingPlayer) candidates.push({r: nr, c: nc, priority: 0}); 
                            } else if (tSq.item?.type === 'anvil' && dancerPiece.heldItem === 'dancers_ribbon') {
                                candidates.push({r: nr, c: nc, priority: 3}); 
                            }
                        }
                    }
                    candidates.sort((a,b) => b.priority - a.priority);
                    if (candidates.length > 0) {
                        const best = candidates[0];
                        const tSq = nextBoard[best.r][best.c];
                        const tP = tSq.piece;
                        const targetItem = tSq.item;
                        if (targetItem?.type === 'shroom') {
                            nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true, level: (dancerPiece.level || 1) + 1 };
                            if (nextBoard[best.r][best.c].piece!.level > 7 && nextBoard[best.r][best.c].piece!.type === 'queen') nextBoard[best.r][best.c].piece!.level = 7;
                        } else { nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true }; }
                        nextBoard[best.r][best.c].item = null;
                        nextBoard[r][c].piece = tP ? { ...tP, hasMoved: true, isShielded: false } : null;
                        nextBoard[r][c].item = targetItem?.type === 'shroom' ? null : targetItem;
                        const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                        if (best.r === oppBackRank) {
                           const landed = nextBoard[best.r][best.c].piece!;
                           landed.type = 'queen'; landed.level = getPromotionLevel(tP?.type || null);
                           if (landed.level >= 5) isExtraTurn = true;
                           addLog(`${getPlayerDisplayName(actingPlayer)} Dancer promoted to Queen!`);
                        }
                        addLog(`${getPlayerDisplayName(actingPlayer)} Dancer performed a free ${tP ? 'swap' : (targetItem ? 'anvil swap' : 'move')}!`);
                    }
                }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'dance'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                setIsAwaitingDanceTarget(true); addLog("Dancer Skill: The Dance is ready!"); return;
            }
        }
    }
    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.level === 1 && FRONTLINE_TYPES.includes(sq.piece.type) && sq.piece.type !== 'commander' && sq.piece.type !== 'infiltrator');
            if (pawnSq) { const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); nextBoard[pr][pc].piece!.type = 'commander'; addLog(`${getPlayerDisplayName(actingPlayer)} promoted a Commander via First Blood!`); }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'firstBlood'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type === 'pawn' && sq.piece.level === 1);
            if (hasL1Targets) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                setIsAwaitingCommanderPromotion(true); addLog("First Blood! Choose a Pawn to promote."); return;
            }
        }
    }
    if (!silenced && newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => {
          const p = sq.piece;
          if (!p || p.color !== actingPlayer) return false;
          if (p.type === 'archbishop') return true;
          if (p.type === 'mimic' && lastMovedPieceType === 'archbishop') return true;
          return false;
        });
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const targets = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId).sort((a, b) => (b.piece?.level || 0) - (a.piece?.level || 0));
                if (targets.length > 0) { targets[0].piece!.isShielded = true; addLog(`${getPlayerDisplayName(actingPlayer)} Archbishop applied a Holy Shield!`); }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                const hasEligible = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId);
                if (hasEligible) {
                    setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                    setIsAwaitingHolyShield(true); addLog("Holy Shield ready!"); return;
                } else { triggerSpecialsChain(boardToChain, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return; }
            }
        }
    }
    if (!silenced && newStreak >= 3 && oldStreak < 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const myKingSq = nextBoard.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer);
            const kR = myKingSq ? myKingSq.rowIndex : (actingPlayer === 'white' ? 7 : 0);
            const kC = myKingSq ? myKingSq.colIndex : 4;
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) {
                empty.sort((a, b) => (Math.abs(a.rowIndex - kR) + Math.abs(a.colIndex - kC)) - (Math.abs(b.rowIndex - kR) + Math.abs(b.colIndex - kC)));
                nextBoard[empty[0].rowIndex][empty[0].colIndex].item = { type: 'anvil' };
                addLog(`${getPlayerDisplayName(actingPlayer)} dropped a defensive Anvil!`);
            }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'anvil'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
            setPlayerToDropAnvil(actingPlayer); setIsAwaitingAnvilDrop(true); addLog("Anvil Drop ready!"); return;
        }
    }
    if (newStreak >= 4 && oldStreak < 4 && !completedMilestones.includes('resurrection')) {
        const myGraveyard = actingPlayer === 'white' ? nextGraveyard.white : nextGraveyard.black; 
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const sorted = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
            const choice = sorted; const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random()*empty.length)]; const {row: rr, col: rc} = algebraicToCoords(sq.algebraic);
                const resPiece = { ...choice, level: 1, id: `res_ks_${choice.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                if (onlineStatus === 'connected' && actingPlayer === localPlayerColor) { wsRef.current?.send(JSON.stringify({ type: 'ks-resurrection', payload: { pieceId: choice.id, square: sq.algebraic } })); }
                nextBoard[rr][rc].piece = resPiece; 
                const updatedG = { 
                    white: Array.isArray(nextGraveyard.white) ? [...nextGraveyard.white] : [],
                    black: Array.isArray(nextGraveyard.black) ? [...nextGraveyard.black] : []
                };
                if (actingPlayer === 'white') updatedG.white = updatedG.white.filter(p => p.id !== choice.id); else updatedG.black = updatedG.black.filter(p => p.id !== choice.id);
                addEffectCallback('light-beam', sq.algebraic); audioManager.playResurrect(); addLog(`Resurrection! ${choice.type} has returned.`);
                const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (!isAI && (FRONTLINE_TYPES.includes(resPiece.type)) && rr === oppBackRank) {
                    setPromotionTargetLevel(1); setPromotionSquare(sq.algebraic); setIsPromotingPawn(true);
                    setSpecialActionContext({ boardForNextStep: nextBoard, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'resurrection'], currentGraveyard: updatedG, currentKs: currentKs, capturingPieceId: capturingPieceId }); return;
                }
                if (isAI && (FRONTLINE_TYPES.includes(resPiece.type)) && rr === oppBackRank) { resPiece.type = 'queen'; addLog(`${getPlayerDisplayName(actingPlayer)} resurrected unit auto-promoted!`); }
                triggerSpecialsChain(nextBoard, updatedG, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'resurrection'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
            }
        }
    }
    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const snipers = pieces.filter(p => { 
        if (p.type === 'archer') return true; 
        if (p.type === 'mimic' && lastMovedPieceType === 'archer') return true;
        const coords = boardToChain.flat().find(sq => sq.piece?.id === p.id); 
        if ((p.type === 'knight' || (p.type === 'mimic' && lastMovedPieceType === 'knight')) && p.heldItem === 'shortbow' && coords && getEffectiveLevel(boardToChain, coords.rowIndex, coords.colIndex) >= 3) return true; 
        return false; 
    });
    const maxSniperLevel = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
    const hasCrossbow = pieces.some(p => (p.type === 'archer' || (p.type === 'mimic' && lastMovedPieceType === 'archer')) && p.color === actingPlayer && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && snipers.length > 0) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow);
    if (!silenced && isSnipeTime && !completedMilestones.includes('snipe')) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxSniperLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const victimsSorted = victims.sort((a,b) => (VAL_MAP[b.piece!.type]||0) - (VAL_MAP[a.piece!.type]||0));
                const v = victimsSorted[0]; const {rowIndex: row, colIndex: col} = v;
                const snipedPiece = { ...nextBoard[row][col].piece!, id: nextBoard[row][col].piece!.id }; nextBoard[row][col].piece = null; addLog(`${getPlayerDisplayName(actingPlayer)} Sniper sniped a Level ${snipedPiece.level} ${snipedPiece.type}!`);
                const targetPile = snipedPiece.color; 
                nextGraveyard[targetPile] = Array.isArray(nextGraveyard[targetPile]) ? [...nextGraveyard[targetPile], snipedPiece] : [snipedPiece];
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'snipe'], capturingPieceId, wasCaptureThisTurn, movedPieceType); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'snipe'], currentGraveyard: nextGraveyard, currentKs: currentKs, capturingPieceId: capturingPieceId });
                setIsAwaitingArcherSnipe(true); addLog("Sniper active! Select a target."); return;
            }
        }
    }
    processMoveEnd(boardToChain, nextGraveyard, currentKs, actingPlayer, isExtraTurn, nextEp, wasCaptureThisTurn, movedPieceType);
  }, [isWhiteAI, isBlackAI, firstBloodAchieved, addEffectCallback, processMoveEnd, localPlayerColor, addLog, getPlayerDisplayName, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, onlineStatus]);

  const processPawnSacrificeCheck = useCallback((boardAfter: BoardState, graveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, player: PlayerColor, move: Move | null, oldL: number | undefined, oldT: PieceType | undefined, isExtraTurn: boolean, ep: AlgebraicSquare | null, oldS: number, newS: number, capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null) => {
    if (!move) return false;
    const { row: rowIdx, col: colIdx } = algebraicToCoords(move.to); const piece = boardAfter[rowIdx][colIdx].piece;
    if (piece?.type === 'queen' && piece.level === 7 && oldT === 'queen' && (oldL || 0) < 7) {
      if (boardAfter.flat().some(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type))) {
        const isAI = (player === 'white' && isWhiteAI) || (player === 'black' && isBlackAI);
        if (isAI) {
            const nextB = boardAfter.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const pawnSq = nextB.flat().find(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type));
            if (pawnSq) {
                const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); const sacrificed = { ...nextB[pr][pc].piece!, id: nextB[pr][pc].piece!.id };
                nextB[pr][pc].piece = null; audioManager.playCapture(); addLog(`AI Sacrificed ${sacrificed.type} for the Queen!`);
                const nextG = { white: Array.isArray(graveyard.white) ? [...graveyard.white] : [], black: Array.isArray(graveyard.black) ? [...graveyard.black] : [] }; 
                const targetPile = sacrificed.color; nextG[targetPile] = [...nextG[targetPile], sacrificed];
                triggerSpecialsChain(nextB, nextG, currentKs, oldS, newS, isExtraTurn, ep, player, [], capturingPieceId, wasCaptureThisTurn, movedPieceType);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(player); setBoardForPostSacrifice(boardAfter); setPlayerWhoMadeQueenMove(player); setIsExtraTurnFromQueenMove(isExtraTurn);
        setSpecialActionContext({ boardForNextStep: boardAfter, playerWhoseTurnCompleted: player, isExtraTurn: isExtraTurn, newEnPassantTarget: ep, oldStreak: oldS, newStreak: newS, currentGraveyard: graveyard, currentKs, capturingPieceId }); 
        addLog("Royal Sacrifice required! Select a Pawn to give up."); return true;
      }
    }
    triggerSpecialsChain(boardAfter, graveyard, currentKs, oldS, newS, isExtraTurn, ep, player, [], capturingPieceId, wasCaptureThisTurn, movedPieceType); return false;
  }, [isWhiteAI, isBlackAI, triggerSpecialsChain, addLog]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    if (!promotionSquare) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const piece = nextBoard[row][col].piece;
    if (!piece) return;
    if (piece.heldItem && !isItemValidForPiece(piece.heldItem, pieceType)) {
        const item = piece.heldItem; setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === item); if (existing) existing.count++; else next.push({ type: item, count: 1 }); return next; });
        piece.heldItem = null; addLog(`Equipment Returned: ${ITEM_METADATA[item].name}`);
    }
    nextBoard[row][col].piece = { ...piece, type: pieceType, level: promotionTargetLevel, hasMoved: true };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    setBoard(nextBoard); audioManager.playLevelUp(); addLog(`${getPlayerDisplayName(piece.color)}: Pawn Promoted to ${pieceType}!`);

    const remainingQueue = promotionQueue.slice(1);
    if (remainingQueue.length > 0) {
        setPromotionQueue(remainingQueue);
        const nxt = remainingQueue[0]; setPromotionSquare(nxt.square); setPromotionTargetLevel(nxt.targetLevel); setIsPromotingPawn(true);
    } else {
        setPromotionQueue([]);
        const ctx = specialActionContext;
        if (ctx) {
            const isExtra = (nextBoard[row][col].piece!.level >= 5) || ctx.isExtraTurn;
            triggerSpecialsChain(nextBoard, ctx.currentGraveyard, ctx.currentKs, ctx.oldStreak, ctx.newStreak, isExtra, ctx.newEnPassantTarget, currentPlayer, ctx.completedMilestones, ctx.capturingPieceId, false, pieceType);
        } else { processMoveEnd(nextBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, pieceType); }
    }
  }, [board, promotionSquare, promotionTargetLevel, specialActionContext, currentPlayer, triggerSpecialsChain, addLog, inventory, promotionQueue, getPlayerDisplayName, capturedPieces, killStreaks, processMoveEnd]);

  const performAiMove = useCallback(async () => {
    if (!aiInstanceRef.current || gameInfo.gameOver || gameOverRef.current || isMoveProcessing || isAnySpecialModeActive || isAiThinking) return;
    setSelectedSquare(null); setPossibleMoves([]); setIsAiThinking(true);
    try {
      const oppCapLastTurn = didCaptureLastTurn[currentPlayer === 'white' ? 'black' : 'white'];
      const gsAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, shroomSpawnCounter, nextShroomSpawnTurn, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn, positionHistory);
      const resAI = aiInstanceRef.current.getBestMove(gsAI, currentPlayer); 
      let aiMove = resAI?.move;
      const freshlyCalculated = aiMove ? getPossibleMoves(board, coordsToAlgebraic(aiMove.from[0], aiMove.from[1]), enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel) : [];
      if (!aiMove || !freshlyCalculated.includes(coordsToAlgebraic(aiMove.to[0], aiMove.to[1]))) {
          const nextStrikes = aiStrikeCount + 1; setAiStrikeCount(nextStrikes);
          if (nextStrikes >= 3) {
              const allLegal: Move[] = [];
              for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (board[r][c].piece?.color === currentPlayer) {
                  const moves = getPossibleMoves(board, board[r][c].algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
                  moves.forEach(m => allLegal.push({ from: board[r][c].algebraic, to: m, type: 'move' }));
              }
              if (allLegal.length > 0) { const fb = allLegal[Math.floor(Math.random() * allLegal.length)]; const fC = algebraicToCoords(fb.from); const tC = algebraicToCoords(fb.to); aiMove = { from: [fC.row, fC.col], to: [tC.row, tC.col], type: 'move' }; setAiStrikeCount(0); }
          }
          if (!aiMove) { setIsAiThinking(false); return; }
      } else { setAiStrikeCount(0); }
      const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]); const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
      const p = board[aiMove.from[0]][aiMove.from[1]].piece; if (!p) { setIsAiThinking(false); return; }
      const oldL = p.level, oldT = p.type, oldH = p.heldItem;
      setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg); setLastMovedPieceType(oldT); setLastMovedPieceHeldItem(oldH || null); setLastMovedPieceLevel(oldL);
      pushHistory();
      const applyResult = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo, grappledFrom: aiMove.grappledFrom }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn);
      let nextB = applyResult.newBoard; 
      const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] };
      if (applyResult.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === applyResult.itemReturned); if (existing) existing.count++; else next.push({ type: applyResult.itemReturned!, count: 1 }); return next; }); addLog(`AI returned equipment: ${ITEM_METADATA[applyResult.itemReturned].name}`); }
      if (applyResult.reflectionOccurred) { 
          const victim = applyResult.capturedPiece!; const targetPile = victim.color; 
          updatedG[targetPile] = [...updatedG[targetPile], { ...victim }];
          audioManager.playCapture(); addLog("AI attack reflected!"); addEffectCallback('poof', toAlg); 
          const newKs = { ...killStreaks, white: 0, black: 0 }; setBoard(nextB); setCapturedPieces(updatedG); setKillStreaks(newKs); 
          setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, updatedG, newKs, currentPlayer, false, null, false, oldT); }, 800); return; 
      }
      
      const expGain = (applyResult.capturedPiece ? (DUNGEON_EXP_MAP[applyResult.capturedPiece.type] || 1) : 0) + 
                     (applyResult.pieceCapturedByAnvil ? 1 : 0) + 
                     (applyResult.selfDestructCaptures?.reduce((acc, vic) => acc + (DUNGEON_EXP_MAP[vic.type] || 1), 0) || 0);
      const streakGain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0);

      if (applyResult.shroomConsumed) { audioManager.playShroom(); addLog("AI consumed a Shroom!"); addEffectCallback('level-change', toAlg, currentPlayer, 1); }
      if (applyResult.promotedToHero) { audioManager.playLevelUp(); addLog("AI Hero Ascended!"); }
      if (applyResult.conversionEvents?.length > 0) { audioManager.playConversion(); addLog("AI Conversion triggered!"); }
      if (applyResult.rallyCryTriggered) { addEffectCallback('shockwave', applyResult.rallyCryTriggered.square, applyResult.rallyCryTriggered.color); audioManager.playRally(); addLog("AI Rallying Cry!"); }
      const isObliteration = applyResult.promotedToInfiltrator || (p.type === 'infiltrator' && applyResult.capturedPiece);
      if (isObliteration) { audioManager.playObliterate(); addLog("AI Obliterated a unit!"); addEffectCallback('poof', toAlg); }
      else if (applyResult.capturedPiece || (applyResult.selfDestructCaptures && applyResult.selfDestructCaptures.length > 0)) { audioManager.playCapture(); addEffectCallback('poof', toAlg); if (applyResult.capturedPiece) addLog(`AI Captured ${applyResult.capturedPiece.type}!`); }
      else { audioManager.playMove(); addLog(`AI ${p.type} to ${toAlg}`); }
      if (applyResult.hydraSplitOccurred) { audioManager.playResurrect(); addLog("The Hydra regrows its heads!"); }
      if (applyResult.capturedPiece && !isObliteration) { const pile = applyResult.capturedPiece.color; updatedG[pile] = [...updatedG[pile], { ...applyResult.capturedPiece }]; }
      if (applyResult.selfDestructCaptures) { applyResult.selfDestructCaptures.forEach(vic => { const pile = vic.color; updatedG[pile] = [...updatedG[pile], { ...vic }]; }); }
      
      if (expGain > 0) addEffectCallback('level-change', toAlg, currentPlayer, expGain);
      if (applyResult.ralliedSquares) applyResult.ralliedSquares.forEach(sq => addEffectCallback('level-change', sq, currentPlayer, 1));
      
      const oldS = killStreaks[currentPlayer], newS = streakGain > 0 ? oldS + streakGain : 0, currentKs = { ...killStreaks, [currentPlayer]: newS }; setKillStreaks(currentKs);

      // Check for Rook/Palace Resurrection Call (AI)
      let rookResResult: RookResurrectionResult | null = null;
      const wasCap = streakGain > 0;
      if ((oldT === 'rook' || oldT === 'palace') && wasCap) {
          const resRes = processRookResurrectionCheck(nextB, currentPlayer, {from: fromAlg, to: toAlg, type: 'move'}, toAlg, oldL, updatedG, uniqueIdCounterRef.current);
          if (resRes.resurrectionPerformed) {
              nextB = resRes.boardWithResurrection;
              updatedG.white = resRes.capturedPiecesAfterResurrection.white;
              updatedG.black = resRes.capturedPiecesAfterResurrection.black;
              uniqueIdCounterRef.current = resRes.newResurrectionIdCounter!;
              rookResResult = resRes;
              addEffectCallback('light-beam', resRes.resurrectedSquareAlg!);
              audioManager.playResurrect();
              addLog(`AI Resurrection Call! ${resRes.resurrectedPieceData?.type} returns.`);
          }
      }

      setBoard(nextB); setCapturedPieces(updatedG);
      setTimeout(() => {
        setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false); if (gameOverRef.current) return;
        if (applyResult.infiltrationWin) {
            const msg = `INFILTRATION WIN! AI has breached the back rank!`;
            setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: currentPlayer, isInfiltrationWin: true });
            addLog(msg); gameOverRef.current = true; audioManager.playVictory(); return;
        }
        let isExtraTurn = applyResult.extraTurn || (oldS < 6 && newS >= 6); 
        const landed = nextB[aiMove!.to[0]][aiMove!.to[1]].piece; const oppBackRank = currentPlayer === 'white' ? 0 : 7;
        if (landed && FRONTLINE_TYPES.includes(landed.type) && aiMove!.to[0] === oppBackRank) { 
            const promoType = aiMove!.promoteTo || 'queen'; const targetL = getPromotionLevel(applyResult.capturedPiece?.type || applyResult.pieceCapturedByAnvil?.type || null); 
            landed.type = promoType; landed.level = targetL; if (promoType === 'queen') landed.level = Math.min(landed.level, 7); 
            if (landed.level >= 5) isExtraTurn = true; addLog(`AI promoted to ${promoType}!`); 
        }
        if (rookResResult?.promotionRequiredForResurrectedPawn) {
            const {row: rr, col: rc} = algebraicToCoords(rookResResult.resurrectedSquareAlg!);
            const rp = nextB[rr][rc].piece; if (rp) { rp.type = 'queen'; addLog("AI resurrected unit auto-promoted!"); }
        }
        setBoard(nextB); processPawnSacrificeCheck(nextB, updatedG, currentKs, currentPlayer, {from: fromAlg, to: toAlg, type: aiMove!.type as AIMoveType['type']}, oldL, oldT, isExtraTurn, applyResult.enPassantTargetSet, oldS, newS, wasCap ? landed?.id || null : null, wasCap, oldT);
      }, 800);
    } catch (e) { console.error(`[AI Error]`, e); setIsAiThinking(false); }
  }, [board, currentPlayer, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, isAiThinking, isWhiteAI, isBlackAI, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, processPawnSacrificeCheck, gameMoveCounter, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addEffectCallback, pushHistory, addLog, killStreaks, capturedPieces, aiStrikeCount, didCaptureLastTurn, positionHistory]);

  const handleMycoSpellSelect = useCallback((spell: MycoSpell) => {
      setIsSelectingMycoSpell(false); if (!spell) { setSelectedSquare(null); return; }
      if (spell === 'propagate') {
        const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'myco-propagate' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
        else {
            pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
            const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("Mushroomancy: Propagate!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
        }
      } else if (spell === 'teleport') { setIsSelectingTeleportAlly(true); addLog("Select an ally to teleport!");
      } else if (spell === 'spore-bomb') { setIsSelectingSporeBombShroom(true); addLog("Select a shroom to detonate!");
      } else if (spell === 'raise-mycelimen') {
          const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'raise-mycelimen' };
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
          else {
              pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
              const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
              const nextB = applyResult.newBoard; const updatedG = { white: Array.isArray(capturedPieces.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces.black) ? [...capturedPieces.black] : [] }; setBoard(nextB); audioManager.playLevelUp(); addLog("Mushroomancy: Myceli-Men Rise!");
              setTimeout(() => { 
                setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null);
                const queue: {square: AlgebraicSquare, targetLevel: number}[] = applyResult.multiPromotions || [];
                if (queue.length > 0) { 
                    setPromotionQueue(queue); const fst = queue[0]; setPlayerToPromote(currentPlayer); setPromotionTargetLevel(fst.targetLevel); setIsPromotingPawn(true); setPromotionSquare(fst.square); 
                    setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: false, newEnPassantTarget: null, oldStreak: killStreaks[currentPlayer], newStreak: killStreaks[currentPlayer], currentGraveyard: updatedG, currentKs: killStreaks, capturingPieceId: null } as any); 
                } else { processMoveEnd(nextB, updatedG, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }
              }, 800);
          }
      }
  }, [selectedSquare, onlineStatus, board, enPassantTargetSquare, capturedPieces, killStreaks, currentPlayer, processMoveEnd, addLog, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, pushHistory]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic); const sq = board[row]?.[col]; const piece = sq?.piece;
    handlePieceHover(piece || null);
    
    if (isAwaitingGrappleThrow) {
        const {row: fr, col: fc} = algebraicToCoords(selectedSquare!); const range = getEffectiveLevel(board, fr, fc);
        const dist = Math.max(Math.abs(fr - row), Math.abs(fc - col));
        if (((fr === row || fc === col) || Math.abs(fr - row) === Math.abs(fc - col)) && dist <= range && dist > 0 && (!sq?.piece && !sq?.item)) {
            pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'grapple-throw', thrownPiece: grappledPieceSubject?.piece, thrownItem: grappledItemSubject?.type, grappledFrom: (grappledPieceSubject?.from || grappledItemSubject?.from) };
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
                setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
            }
        }
        return;
    }

    if (isInventoryOpen) {
      if (selectedInventoryItemType && !selectedInventoryItemType.startsWith('portal_scroll_')) {
        const itemMeta = ITEM_METADATA[selectedInventoryItemType];
        if (itemMeta.rarity === 'rare' && board.flat().some(sq => sq.piece?.heldItem === selectedInventoryItemType)) { addLog(`LIMIT REACHED: Only one ${itemMeta.name} allowed!`); return; }
        if (piece && !piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          if (usedSlots >= attunementSlots) { addLog("Attunement Limit Reached!"); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null, phasedPiece: s.phasedPiece ? { ...s.phasedPiece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveLoadoutToFirestore(nextBoard, newInv); setSelectedInventoryItemType(null); audioManager.playLevelUp(); addLog(`Equipped ${ITEM_METADATA[selectedInventoryItemType].name}`);
        }
      } else if (piece && piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          const removed = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null, phasedPiece: s.phasedPiece ? { ...s.phasedPiece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removed); if (item) item.count++; else nextInv.push({ type: removed, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); audioManager.playMove(); addLog(`Unequipped ${ITEM_METADATA[removed].name}`);
      }
      return;
    }
    if (isAwaitingRayTarget && selectedSquare) {
        const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
        if ((row === fR || col === fC) && algebraic !== selectedSquare) {
            const type = isAwaitingRayTarget === 'glacial' ? 'glacial-ray' : 'burning-ray';
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type } })); setIsAwaitingRayTarget(null); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                const result = applyMove(board, { from: selectedSquare!, to: algebraic, type }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
                setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingRayTarget(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
            }
        }
        return;
    }
    if (isSelectingTeleportAlly) { if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== (selectedSquare ? board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.id : null)) { setTeleportAllyPieceId(piece.id); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(true); addLog("Select an ally to teleport!"); } return; }
    if (isSelectingTeleportShroom && sq?.item?.type === 'shroom') {
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'tele-portobello', teleportPieceId: teleportAllyPieceId! };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
        else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsSelectingTeleportShroom(false); setTeleportAllyPieceId(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800); }
        return;
    }
    if (isSelectingSporeBombShroom && sq?.item?.type === 'shroom') {
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'spore-bomb' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
        else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsSelectingSporeBombShroom(false); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800); }
        return;
    }

    if (isAwaitingDanceTarget) {
        const dp = dancerToDance ? board[algebraicToCoords(dancerToDance).row][algebraicToCoords(dancerToDance).col].piece : null;
        if (!dancerToDance) { 
          if (piece && piece.color === currentPlayer && (piece.type === 'dancer' || (piece.type === 'mimic' && lastMovedPieceType === 'dancer'))) { setDancerToDance(algebraic); }
          return; 
        }
        if (algebraic === dancerToDance) { setIsAwaitingDanceTarget(false); setDancerToDance(null); if (specialActionContext) triggerSpecialsChain(board, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, currentPlayer, specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false, lastMovedPieceType); return; }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance); const isAdjacent = Math.abs(row - fr) <= 1 && Math.abs(col - fc) <= 1;
        if (isAdjacent && (piece || (sq?.item?.type === 'anvil' && dp?.heldItem === 'dancers_ribbon') || (!sq?.item && row === fr + (currentPlayer === 'white' ? -1 : 1)))) {
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: dancerToDance, to: algebraic, type: 'dance-swap' } })); setIsAwaitingDanceTarget(false); setDancerToDance(null); }
            else {
                pushHistory(); let nextB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const activeD = nextB[fr][fc].piece!; const tP = nextB[row][col].piece; const targetItem = nextB[row][col].item;
                if (targetItem?.type === 'shroom') { activeD.level = Math.min(activeD.type === 'queen' ? 7 : 99, (activeD.level || 1) + 1); nextB[row][col].item = null; }
                nextB[row][col].piece = activeD; nextB[fr][fc].piece = tP ? { ...tP, hasMoved: true } : null; nextB[fr][fc].item = targetItem?.type === 'shroom' ? null : targetItem;
                setBoard(nextB); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove(); 
                triggerSpecialsChain(nextB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext.capturingPieceId, false, lastMovedPieceType);
            }
        }
        return;
    }
  if (isAwaitingPawnSacrifice && piece && FRONTLINE_TYPES.includes(piece.type) && piece.color === currentPlayer) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'pawn-sacrifice', payload: { square: algebraic } })); setIsAwaitingPawnSacrifice(false); }
      else { pushHistory(); let nextB = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); const sacrificed = { ...nextB[row][col].piece! }; nextB[row][col].piece = null; 
        const nG = { white: Array.isArray(specialActionContext?.currentGraveyard.white) ? [...specialActionContext!.currentGraveyard.white] : [], black: Array.isArray(specialActionContext?.currentGraveyard.black) ? [...specialActionContext!.currentGraveyard.black] : [] }; 
        const targetPile = sacrificed.color; nG[targetPile] = [...nG[targetPile], sacrificed];
        setBoard(nextB); setCapturedPieces(nG); setIsAwaitingPawnSacrifice(false); triggerSpecialsChain(nextB, nG, specialActionContext?.currentKs || killStreaks, specialActionContext?.oldStreak || 0, specialActionContext?.oldStreak || 0, isExtraTurnFromQueenMove, specialActionContext?.newEnPassantTarget || null, currentPlayer, [], specialActionContext?.capturingPieceId || null, false, lastMovedPieceType); }
      return;
  }
  if (isAwaitingCommanderPromotion && piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
      pushHistory(); const nextB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); nextB[row][col].piece!.type = 'commander'; setBoard(nextB); setIsAwaitingCommanderPromotion(false); processMoveEnd(nextB, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); return;
  }
  if ((isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget || isAwaitingWindScrollTarget || isAwaitingEarthquakeScrollTarget || isAwaitingOilSlickTarget) && !sq?.piece && !sq?.item) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'anvil-drop', square: algebraic })); setIsAwaitingAnvilDrop(false); }
      else { pushHistory(); if (isAwaitingOilSlickTarget) { setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); const res = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'oil-slick' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(res.newBoard); setTimeout(() => { setIsMoveProcessing(false); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800); } else { const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s }))); nextB[row][col].item = { type: 'anvil' }; setBoard(nextB); setIsAwaitingAnvilDrop(false); triggerSpecialsChain(nextB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false, lastMovedPieceType); } }
      return;
  }
  if (isAwaitingHolyShield && piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== specialActionContext?.capturingPieceId) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'holy-shield', square: algebraic })); setIsAwaitingHolyShield(false); }
      else { pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); nextB[row][col].piece!.isShielded = true; setBoard(nextB); setIsAwaitingHolyShield(false); triggerSpecialsChain(nextB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false, lastMovedPieceType); }
      return;
  }
  if (isAwaitingArcherSnipe) {
      const pArr = board.flat().filter(sq => sq.piece && sq.piece.color === currentPlayer).map(sq => sq.piece!);
      const snipers = pArr.filter(pt => { 
        if (pt.type === 'archer') return true; 
        if (pt.type === 'mimic' && lastMovedPieceType === 'archer') return true;
        const coords = board.flat().find(sq => sq.piece?.id === pt.id); 
        if ((pt.type === 'knight' || (pt.type === 'mimic' && lastMovedPieceType === 'knight')) && pt.heldItem === 'shortbow' && coords && getEffectiveLevel(board, coords.rowIndex, coords.colIndex) >= 3) return true; 
        return false; 
      });
      if (piece && piece.color !== currentPlayer && piece.type !== 'king' && piece.type !== 'queen') {
          const resp = snipers.find(a => a.level >= piece.level);
          if (resp) {
              if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'archer-snipe', square: algebraic })); setIsAwaitingArcherSnipe(false); }
              else { pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); const sniped = { ...nextB[row][col].piece! }; nextB[row][col].piece = null; 
                const nG = { white: Array.isArray(specialActionContext?.currentGraveyard.white) ? [...specialActionContext!.currentGraveyard.white] : [], black: Array.isArray(specialActionContext?.currentGraveyard.black) ? [...specialActionContext!.currentGraveyard.black] : [] };
                const targetPile = sniped.color; nG[targetPile] = [...nG[targetPile], sniped]; setBoard(nextB); setCapturedPieces(nG); setIsAwaitingArcherSnipe(false); triggerSpecialsChain(nextB, nG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, [...(specialActionContext!.completedMilestones || []), 'snipe'], specialActionContext!.capturingPieceId, false, lastMovedPieceType); }
          }
      }
      return;
  }
  if (selectedSquare) {
    const { row: fR, col: fC } = algebraicToCoords(selectedSquare); const moving = board[fR][fC].piece; 
    const canCommit = !isMoveProcessing && !gameInfo.gameOver && !gameOverRef.current && !isAiThinking && (onlineStatus !== 'connected' || localPlayerColor === currentPlayer) && !isAnySpecialModeActive;
    if (canCommit && moving && moving.color === currentPlayer && (!localPlayerColor || moving.color === localPlayerColor)) {
        if (!isAnySpecialModeActive && moving.type === 'grappler' && !isSilenced(board, fR, fC, currentPlayer)) {
            const tSq = board[row][col]; const tP = tSq.piece; const tA = tSq.item?.type === 'anvil' && moving.heldItem === 'power_glove';
            if ((tP && tP.type !== 'king') || tA) {
                if (possibleMoves.includes(algebraic)) {
                    setGrappledPieceSubject(tP ? { piece: { ...tP }, from: algebraic } : null); setGrappledItemSubject(tA ? { type: 'anvil', from: algebraic } : null); setIsAwaitingGrappleThrow(true);
                    const range = getEffectiveLevel(board, fR, fC); const throwT: AlgebraicSquare[] = [];
                    for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                        const dist = Math.max(Math.abs(tr-fR), Math.abs(tc-fC));
                        if (dist > 0 && dist <= range && (tr === fR || tc === fC || Math.abs(tr-fR) === Math.abs(tc-fC))) { if (!board[tr][tc].piece && !board[tr][tc].item) throwT.push(coordsToAlgebraic(tr, tc)); }
                    }
                    setPossibleMoves(throwT); addLog("Grappler: Picked up! Now select destination."); return;
                }
            }
        }
        if (selectedSquare === algebraic && moving.type === 'myco_mage') { setIsSelectingMycoSpell(true); return; }
        const freshlyCalculated = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
        if (freshlyCalculated.includes(algebraic)) {
          const tP = board[row][col].piece; let mType: Move['type'] = 'move';
          if (tP && tP.color === moving.color) mType = 'swap';
          else if (algebraic === enPassantTargetSquare && FRONTLINE_TYPES.includes(moving.type)) mType = 'enpassant';
          else if (moving.type === 'king' && Math.abs(col - fC) === 2) mType = 'castle';
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: mType } })); setSelectedSquare(null); setPossibleMoves([]); }
          else {
              pushHistory(); clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]);
              const oldL = moving.level, oldT = moving.type, oldH = moving.heldItem; setLastMovedPieceType(oldT); setLastMovedPieceHeldItem(oldH || null); setLastMovedPieceLevel(oldL);
              const applyRes = applyMove(board, { from: selectedSquare, to: algebraic, type: mType }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
              let nextB = applyRes.newBoard; const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] }; setBoard(nextB); setCapturedPieces(updatedG);
              
              const expGain = (applyRes.capturedPiece ? (DUNGEON_EXP_MAP[applyRes.capturedPiece.type] || 1) : 0) + 
                             (applyRes.pieceCapturedByAnvil ? 1 : 0) + 
                             (applyRes.selfDestructCaptures?.reduce((acc: number, vic: any) => acc + (DUNGEON_EXP_MAP[vic.type] || 1), 0) || 0);
              const streakGain = (applyRes.capturedPiece ? 1 : 0) + (applyRes.pieceCapturedByAnvil ? 1 : 0) + (applyRes.selfDestructCaptures?.length || 0);

              if (expGain > 0) addEffectCallback('level-change', algebraic, currentPlayer, expGain);
              if (applyRes.shroomConsumed) addEffectCallback('level-change', algebraic, currentPlayer, 1);
              if (applyRes.ralliedSquares) applyRes.ralliedSquares.forEach(sq => addEffectCallback('level-change', sq, currentPlayer, 1));
              if (applyRes.hydraSplitOccurred) { audioManager.playResurrect(); addLog("The Hydra regrows its heads! 2 Knights appear!"); }

              // Rook/Palace Resurrection Call (Lobby)
              let rookResResult: RookResurrectionResult | null = null;
              const wasCap = streakGain > 0;
              if ((oldT === 'rook' || oldT === 'palace') && wasCap) {
                  const resRes = processRookResurrectionCheck(nextB, currentPlayer, {from: selectedSquare, to: algebraic, type: mType}, algebraic, oldL, updatedG, uniqueIdCounterRef.current);
                  if (resRes.resurrectionPerformed) {
                      nextB = resRes.boardWithResurrection;
                      updatedG.white = resRes.capturedPiecesAfterResurrection.white;
                      updatedG.black = resRes.capturedPiecesAfterResurrection.black;
                      uniqueIdCounterRef.current = resRes.newResurrectionIdCounter!;
                      rookResResult = resRes;
                      addEffectCallback('light-beam', resRes.resurrectedSquareAlg!);
                      audioManager.playResurrect();
                      addLog(`Resurrection! ${resRes.resurrectedPieceData?.type} has returned.`);
                  }
              }

              setBoard(nextB); setCapturedPieces(updatedG);

              setTimeout(() => {
                  setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return;
                  if (applyRes.infiltrationWin) {
                      const msg = `INFILTRATION WIN! ${getPlayerDisplayName(currentPlayer)} has breached the back rank!`;
                      setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: currentPlayer, isInfiltrationWin: true });
                      addLog(msg); gameOverRef.current = true; audioManager.playVictory(); return;
                  }
                  
                  const oldS = killStreaks[currentPlayer];
                  const newS = wasCap ? oldS + streakGain : 0;
                  const updatedKs = { ...killStreaks, [currentPlayer]: newS };
                  const isExtra = applyRes.extraTurn || (oldS < 6 && newS >= 6);

                  const q = applyRes.multiPromotions || []; const oppBackRank = currentPlayer === 'white' ? 0 : 7;
                  if (FRONTLINE_TYPES.includes(nextB[row][col].piece?.type || '') && row === oppBackRank) q.push({ square: algebraic, targetLevel: getPromotionLevel(applyRes.capturedPiece?.type || null) });
                  
                  if (rookResResult?.promotionRequiredForResurrectedPawn) {
                      q.push({ square: rookResResult.resurrectedSquareAlg!, targetLevel: 1 });
                  }

                  if (q.length > 0) { 
                      setPromotionQueue(q); setIsPromotingPawn(true); setPromotionSquare(q[0].square); setPromotionTargetLevel(q[0].targetLevel);
                      setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: applyRes.enPassantTargetSet, oldStreak: oldS, newStreak: newS, currentGraveyard: updatedG, currentKs: updatedKs, capturingPieceId: nextB[row][col].piece?.id || null } as any); 
                  } else { triggerSpecialsChain(nextB, updatedG, updatedKs, oldS, newS, isExtra, applyRes.enPassantTargetSet, currentPlayer, [], nextB[row][col].piece?.id || null, wasCap, oldT); }
              }, 800);
          }
          return;
        }
    }
  }
  if (piece && piece.color === currentPlayer && (!localPlayerColor || piece.color === localPlayerColor)) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel)); } else { setSelectedSquare(null); setPossibleMoves([]); }
}, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, boardForPostSacrifice, specialActionContext, isExtraTurnFromQueenMove, isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, addLog, handlePieceHover, processPawnSacrificeCheck, triggerSpecialsChain, processMoveEnd, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addEffectCallback, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, teleportAllyPieceId, isMoveProcessing, gameInfo.gameOver, isAiThinking, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, playerToDropAnvil, pushHistory, saveLoadoutToFirestore, getPlayerDisplayName, isAnySpecialModeActive, aiStrikeCount, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, grappledPieceSubject, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingRayTarget, playerToPromote, grappledItemSubject, isAwaitingOilSlickTarget, didCaptureLastTurn, positionHistory, promotionQueue]);

  const fullGameReset = () => {
    const unlocks = userData?.unlockedPieces || []; const uElo = userData?.eloRating || 1200; let initial = initializeBoard(uElo, uElo, unlocks, unlocks);
    if (userData?.equipment) { initial = initial.map(row => row.map(sq => { if (sq.piece && userData.equipment![sq.piece.id]) { return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } }; } return sq; })); }
    setBoard(initial); if (userData?.inventory) setInventory(userData.inventory);
    setCurrentPlayer('white'); setBoardOrientation('white'); setGameInfo({ ...initialGameStatus }); setCapturedPieces({ white: [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setHistoryStack([]); setPositionHistory([]); setSelectedSquare(null); setPossibleMoves([]); setLastMoveFrom(null); setLastMoveTo(null); setLastMovedPieceType(null); setLastMovedPieceHeldItem(null); setLastMovedPieceLevel(null); setGameMoveCounter(0); setEnPassantTargetSquare(null); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setShowLossScreen(false); setShowWinScreen(false); setShowSummary(false); audioManager.playStart();
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setSpecialActionContext(null); setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingShieldScrollTarget(false); setIsAwaitingSwapScrollTarget(false); setIsAwaitingDecreeTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setAbilityChoiceDialog(null); setIsSelectingMycoSpell(false); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(false); setIsSelectingSporeBombShroom(false); setIsAwaitingRayTarget(null); setIsAiThinking(false); setIsWhiteAI(false); setIsBlackAI(false); gameOverRef.current = false; addLog("Game Reset."); aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  };

  const initWebSocket = useCallback((onOpenCallback?: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) { if (onOpenCallback) onOpenCallback(); return; }
    setOnlineStatus('connecting'); const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = ''; if (window.location.hostname.includes('cloudworkstations.dev')) { const pts = window.location.hostname.split('-'); pts[0] = '8080'; wsUrl = `${protocol}//${pts.join('-')}`; } else { wsUrl = `${protocol}//${window.location.hostname}:8080`; }
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { setOnlineStatus('connected'); if (onOpenCallback) onOpenCallback(); };
    ws.onmessage = (event) => {
      const d = JSON.parse(event.data);
      switch (d.type) {
        case 'room-created': setRoomId(d.roomId); setLocalPlayerColor(d.color); setBoard(d.gameState.board); setOnlineStatus('waiting'); break;
        case 'game-move': {
            const { gameState: nextGs, move: remoteMove, events: remoteEvents } = d;
            
            if (remoteMove) {
                setLastMoveFrom(remoteMove.from);
                setLastMoveTo(remoteMove.to);
                setAnimatedSquareTo(remoteMove.to);
                setIsMoveProcessing(true);
            }
            
            setBoard(nextGs.board);
            setCurrentPlayer(nextGs.currentPlayer);
            setEnPassantTargetSquare(nextGs.enPassantTargetSquare);
            setKillStreaks(nextGs.killStreaks);
            setCapturedPieces(nextGs.capturedPieces);
            
            if (remoteEvents && remoteMove) {
                const actingColor = nextGs.currentPlayer === 'white' ? 'black' : 'white';
                
                if (remoteEvents.captured) {
                    audioManager.playCapture();
                    addEffectCallback('poof', remoteMove.to);
                    const expGain = DUNGEON_EXP_MAP[remoteEvents.capturedType] || 1;
                    addEffectCallback('level-change', remoteMove.to, actingColor, expGain);
                    addLog(`${getPlayerDisplayName(actingColor)} captured a ${remoteEvents.capturedType}!`);
                }
                if (remoteEvents.shroom) {
                    audioManager.playShroom();
                    addEffectCallback('level-change', remoteMove.to, actingColor, 1);
                    addLog(`${getPlayerDisplayName(actingColor)} consumed a Shroom!`);
                }
                if (remoteEvents.hero) {
                    audioManager.playLevelUp();
                    addLog(`${getPlayerDisplayName(actingColor)} Hero Ascended!`);
                }
                if (remoteEvents.rally && remoteEvents.rallyPos) {
                    audioManager.playRally();
                    addEffectCallback('shockwave', remoteEvents.rallyPos, actingColor);
                }
                if (remoteEvents.conversions?.length > 0) {
                    audioManager.playConversion();
                    remoteEvents.conversions.forEach((pos: AlgebraicSquare) => {
                        addEffectCallback('conversion', pos);
                    });
                }
                if (remoteEvents.reflection) {
                    audioManager.playCapture();
                    addEffectCallback('poof', remoteMove.to);
                    addLog("Attack reflected!");
                }
                if (remoteEvents.ralliedSquares?.length > 0) {
                    remoteEvents.ralliedSquares.forEach((pos: AlgebraicSquare) => {
                        addEffectCallback('level-change', pos, actingColor, 1);
                    });
                }
                if (remoteEvents.anvilDrop) {
                    audioManager.playAnvil();
                    addLog(`${getPlayerDisplayName(actingColor)} dropped an Anvil!`);
                }
                if (remoteEvents.shield) {
                    audioManager.playShield();
                    addLog(`${getPlayerDisplayName(actingColor)} applied a Holy Shield!`);
                }
                if (remoteEvents.snipe) {
                    audioManager.playSnipe();
                    addLog(`${getPlayerDisplayName(actingColor)} Snipe triggered!`);
                }
                if (remoteEvents.resurrection && remoteEvents.resPos) {
                    audioManager.playResurrect();
                    addEffectCallback('light-beam', remoteEvents.resPos);
                    addLog(`${getPlayerDisplayName(actingColor)} triggered Resurrection Call!`);
                }
                if (remoteEvents.hydraSplit) {
                    audioManager.playResurrect();
                    addLog("The Hydra regrows its heads!");
                }
                
                const isCheck = isKingInCheck(nextGs.board, nextGs.currentPlayer, nextGs.enPassantTargetSquare, nextGs.lastMovedPieceType, nextGs.lastMovedPieceHeldItem, nextGs.lastMovedPieceLevel);
                if (isCheck) {
                    audioManager.playCheck();
                    addLog("Check!");
                    setGameInfo(prev => ({ ...prev, isCheck: true, playerWithKingInCheck: nextGs.currentPlayer }));
                } else {
                    setGameInfo(prev => ({ ...prev, isCheck: false, playerWithKingInCheck: null }));
                }
            } else if (!remoteEvents) {
                audioManager.playMove();
            }

            setTimeout(() => {
                setIsMoveProcessing(false);
                setAnimatedSquareTo(null);
            }, 800);
            break;
        }
        case 'game-over': 
            const winnerN = getPlayerDisplayName(d.winner);
            let vMsg = "";
            if (d.reason === 'repetition') vMsg = "Draw by Repetition";
            else if (d.reason === 'infiltration') vMsg = `INFILTRATION WIN! ${winnerN} reigns supreme!`;
            else if (d.reason === 'conquest') vMsg = `CONQUEST VICTORY! ${winnerN} reigns supreme!`;
            else vMsg = `Game Over: ${winnerN} wins by ${d.reason}!`;
            setGameInfo({ gameOver: true, winner: d.winner, message: vMsg, isCheck: false, isCheckmate: d.reason === 'checkmate', isStalemate: d.winner === 'draw' && d.reason !== 'repetition', isThreefoldRepetitionDraw: d.reason === 'repetition', playerWithKingInCheck: null });
            gameOverRef.current = true;
            if (d.winner === localPlayerColor) audioManager.playVictory(); else audioManager.playDefeat();
            break;
      }
    };
    ws.onclose = () => { setOnlineStatus('disconnected'); };
    wsRef.current = ws;
  }, [addLog, localPlayerColor, getPlayerDisplayName, addEffectCallback]);

  const handleOnlinePlay = useCallback((action: 'create' | 'join') => {
    if (!user) return;
    initWebSocket(() => {
        const eq: Record<string, string> = {}; board.flat().forEach(sq => { if (sq.piece?.heldItem) eq[sq.piece.id] = sq.piece.heldItem; });
        if (action === 'create') { wsRef.current?.send(JSON.stringify({ type: 'create-room', user: { userId: user.uid, username: userData?.username || user.displayName || 'Host', elo: userData?.eloRating || 1200, wins: userData?.unlockedPieces || [], equipment: eq, unlockedPieces: userData?.unlockedPieces || [] } })); } 
        else { wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: inputRoomId, user: { userId: user.uid, username: userData?.username || user.displayName || 'Guest', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment: eq, unlockedPieces: userData?.unlockedPieces || [] } })); }
    });
  }, [user, userData, inputRoomId, board, addLog, initWebSocket]);

  const handleRankedPlay = useCallback(() => {
    if (!user) return;
    initWebSocket(() => {
        const eq: Record<string, string> = {}; board.flat().forEach(sq => { if (sq.piece?.heldItem) eq[sq.piece.id] = sq.piece.heldItem; });
        wsRef.current?.send(JSON.stringify({ type: 'join-ranked-queue', userId: user.uid, username: userData?.username || 'Player', elo: userData?.eloRating || 1200, equipment: eq }));
    });
  }, [user, userData, board, initWebSocket]);

  useEffect(() => { if (!hasInitializedSession.current && !isUserLoading) { hasInitializedSession.current = true; fullGameReset(); } }, [isUserLoading, userData, user, aiDifficulty]);

  useEffect(() => {
    const isAiT = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isAiT && onlineStatus === 'disconnected' && !gameInfo.gameOver && !gameOverRef.current && !isMoveProcessing && !isAnySpecialModeActive && !isAiThinking) {
      const timer = setTimeout(performAiMove, 1000); return () => clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, onlineStatus, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, isAiThinking, gameMoveCounter, performAiMove]);

  const mobileLayout = useMemo(() => (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0.5 pb-1">
        <div className="w-full flex items-center justify-between">
          <div className="w-1/3 flex items-center justify-center"></div>
          <div className="w-1/3 flex items-center justify-center"> <div className="flex items-center gap-1.5 shrink-0"> <PixelAnvil className="h-5 w-5 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-8 w-auto" /> <ShroomIcon className="h-5 w-5 shrink-0 text-destructive" /> </div> </div>
          <div className="w-1/3 flex justify-end"> <AuthWidget /> </div>
        </div>
        <div className={cn("text-center text-[0.6rem] font-bold min-h-[1rem] uppercase w-full", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {statusMessage} </div>
        <div className="w-full">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : (isAwaitingRayTarget ? selectedSquare : null))) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} />
        </div>
        <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} />
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
          <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-6 px-1.5 text-[0.65rem]"><BookOpen className="mr-1 h-3 w-3" /> Rules</Button>
          <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || socialOnlineStatus !== 'disconnected'} className="h-6 px-1.5 text-[0.65rem]"><Package className="mr-1 h-3 w-3" /> Loot</Button>
          <Button variant="outline" size="sm" onClick={() => setIsRoyalStoreOpen(true)} className="h-6 px-1.5 text-[0.65rem]" disabled={!user}><Landmark className="mr-1 h-3 w-3" /> Store</Button>
          <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} className="h-6 px-1.5 text-[0.65rem]"><RotateCcw className="mr-1 h-3 w-3" /> Reset Game</Button>
          {onlineStatus === 'disconnected' && ( <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} className="h-6 px-1.5 text-[0.65rem]"><Undo2 className="mr-1 h-3 w-3" /> Undo</Button> )}
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]"><Settings className="mr-1 h-3 w-3" /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent></Popover>
          <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]" disabled={socialOnlineStatus !== 'disconnected' || !user}><Swords className="mr-1 h-3 w-3" /> Dungeon</Button></Link>
          <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]" disabled={socialOnlineStatus !== 'disconnected'}><Trophy className="mr-1 h-3 w-3" /> L.board</Button></Link>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
            <Button variant="outline" size="sm" onClick={() => setIsWhiteAI(!isWhiteAI)} className="h-6 px-1.5 text-[0.65rem]"><Bot className="mr-1 h-3 w-3" /> W:{isWhiteAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setIsBlackAI(!isBlackAI)} className="h-6 px-1.5 text-[0.65rem]"><Bot className="mr-1 h-3 w-3" /> B:{isBlackAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="h-6 px-1.5 text-[0.65rem]"><View className="mr-1 h-3 w-3" /> View</Button>
        </div>
        <Card className="w-full mt-1"> <CardContent className="p-1.5 flex flex-col gap-1.5"> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={() => setIsArenaConfirmOpen(true)} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Arena <span className="text-yellow-500 ml-1">100g</span> <Coins className="h-3 w-3 text-yellow-500" /> ({tournamentQueueCount}/8)</Button> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Ranked Match</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><Globe className="mr-1 h-3 w-3" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-6 px-1.5 text-[0.65rem] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-6 px-1.5 text-[0.65rem]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-1 items-center"> <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-6 px-1.5 text-[0.65rem] w-full"><Link2Off className="mr-1 h-3 w-3" /> Disconnect</Button> </div> )} <div className="w-full text-center h-3 text-[0.65rem] text-muted-foreground uppercase font-pixel tracking-tighter">{onlineStatus}</div> </CardContent> </Card>
      </div>
    </div>
  ), [gameInfo, statusMessage, board, isAnySpecialModeActive, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, selectedSquare, isAwaitingRayTarget, possibleMoves, enemySelectedSquare, enemyPossibleMoves, handleSquareClick, boardOrientation, currentPlayer, isMoveProcessing, isAiThinking, localPlayerColor, enPassantTargetSquare, handlePieceHover, effects, promotionSquare, isAwaitingAnvilDrop, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, capturedPieces, killStreaks, pieceForInfoDisplay, getPlayerDisplayName, onlineStatus, turnTimer, isRulesDialogOpen, userData?.goldBalance, user, volume, aiDifficulty, isWhiteAI, isBlackAI, viewMode, tournamentQueueCount, handleOnlinePlay, handleRankedPlay, inputRoomId, roomId, lastMovedPieceType, socialOnlineStatus, handleUsePortalScroll]);

  const desktopLayout = useMemo(() => (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0"> <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} /> </div>
      <div className="w-1/2 flex flex-col items-center gap-2"> 
        <div className="w-full flex items-center justify-center gap-6"> <PixelAnvil className="h-10 w-10 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-16 w-auto" /> <ShroomIcon className="h-10 w-10 shrink-0 text-destructive" /> </div> 
        <div className={cn("text-center text-[0.8rem] font-bold min-h-[1.5rem] uppercase w-full", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {statusMessage} </div>
        <div className="w-full"> <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : (isAwaitingRayTarget ? selectedSquare : null))) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} /> </div> 
      </div>
      <div className="w-1/4 flex flex-col gap-4"> <AuthWidget /> <Card> <CardContent className="p-2 flex flex-col gap-2"> <div className="flex flex-wrap justify-center items-center gap-1"> <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} /> <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-7 px-2 text-[0.65rem]"><BookOpen className="mr-2 h-4 w-4" /> Rules</Button> <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || socialOnlineStatus !== 'disconnected'} className="h-7 px-2 text-[0.65rem]"><Package className="mr-2 h-4 w-4" /> Loot</Button> <Button variant="outline" size="sm" onClick={() => setIsRoyalStoreOpen(true)} className="h-7 px-2 text-[0.65rem]" disabled={!user}><Landmark className="mr-2 h-4 w-4" /> Store</Button> <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} disabled={socialOnlineStatus !== 'disconnected'} className="h-7 px-2 text-[0.65rem]"><RotateCcw className="mr-2 h-4 w-4" /> Reset Game</Button> {onlineStatus === 'disconnected' && ( <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} className="h-7 px-2 text-[0.65rem]"><Undo2 className="mr-2 h-4 w-4" /> Undo Move</Button> )} <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]"><Settings className="mr-2 h-4 w-4" /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent></Popover> <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]" disabled={socialOnlineStatus !== 'disconnected' || !user}><Swords className="mr-2 h-4 w-4" /> Dungeon</Button></Link> <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]" disabled={socialOnlineStatus !== 'disconnected'}><Trophy className="mr-2 h-4 w-4" /> L.board</Button></Link> <Button variant="outline" size="sm" onClick={() => setIsWhiteAI(!isWhiteAI)} className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Bot className="mr-2 h-4 w-4" /> W-AI:{isWhiteAI ? 'On' : 'Off'}</Button> <Button variant="outline" size="sm" onClick={() => setIsBlackAI(!isBlackAI)} className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Bot className="mr-2 h-4 w-4" /> B-AI:{isBlackAI ? 'On' : 'Off'}</Button> <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="h-7 px-2 text-[0.65rem]"><View className="mr-2 h-4 w-4" /> View Mode</Button> </div> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={() => setIsArenaConfirmOpen(true)} disabled={!user} className="h-7 px-2 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Arena <span className="text-yellow-500 ml-1">100g</span> <Coins className="h-3 w-3 text-yellow-500" /> ({tournamentQueueCount}/8)</Button> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user} className="h-7 px-2 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Ranked Match</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-7 px-2 text-[0.65rem] w-full"><Globe className="mr-2 h-4 w-4" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-[0.65rem] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-7 px-2 text-[0.65rem]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-2 items-center border-t pt-2"> <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-7 px-2 text-[0.65rem] w-full">Disconnect</Button> </div> )} <div className="w-full text-center h-4 text-[0.65rem] mt-1 text-muted-foreground uppercase font-pixel">{onlineStatus}</div> </CardContent> </Card> </div>
    </div>
  ), [currentPlayer, capturedPieces, gameInfo, killStreaks, pieceForInfoDisplay, localPlayerColor, getPlayerDisplayName, onlineStatus, turnTimer, statusMessage, board, isAnySpecialModeActive, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, selectedSquare, isAwaitingRayTarget, possibleMoves, enemySelectedSquare, enemyPossibleMoves, handleSquareClick, boardOrientation, isMoveProcessing, viewMode, animatedSquareTo, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, enPassantTargetSquare, handlePieceHover, effects, promotionSquare, isAwaitingAnvilDrop, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, isRulesDialogOpen, user, volume, aiDifficulty, isWhiteAI, isBlackAI, tournamentQueueCount, handleOnlinePlay, handleRankedPlay, inputRoomId, roomId, lastMovedPieceType, promotionQueue, socialOnlineStatus, handleUsePortalScroll]);

  return (
    <div className={cn("min-h-full h-full w-full bg-background flex flex-col relative", showLossScreen && "after:animate-fade-to-black")}>
      {showWinScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center">YOU WON</p></div>)}
      {showLossScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center">YOU LOST</p></div>)}
      <div className="lg:hidden h-full flex flex-col">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={handleUsePortalScroll} usedSlots={usedSlots} attunementSlots={attunementSlots} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor={playerToPromote} />
      <MycoSpellMenu isOpen={isSelectingMycoSpell} mana={selectedSquare ? (board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.shroomMana || 0) : 0} onSelectSpell={handleMycoSpellSelect} onOpenChange={setIsSelectingMycoSpell} />
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}> 
        <AlertDialogContent> 
          <AlertDialogHeader> 
            <AlertDialogTitle className="font-pixel text-primary uppercase text-[0.75rem]">Reset Game?</AlertDialogTitle>
            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1" className="border-none">
                    <AccordionTrigger className="font-pixel text-primary uppercase text-[0.75rem] hover:no-underline">Details</AccordionTrigger>
                    <AccordionContent className="font-pixel text-white text-[0.6rem] leading-relaxed"> This will clear the board and reset all streaks. Any unsaved online progress may be lost. </AccordionContent>
                </AccordionItem>
            </Accordion>
          </AlertDialogHeader> 
          <AlertDialogFooter>
            <AlertDialogCancel className="font-pixel text-[0.65rem] uppercase">Cancel</AlertDialogCancel> 
            <AlertDialogAction className="bg-destructive font-pixel text-[0.65rem] uppercase" onClick={() => { setIsResetConfirmOpen(false); fullGameReset(); }}>Confirm Reset</AlertDialogAction> 
          </AlertDialogFooter> 
        </AlertDialogContent> 
      </AlertDialog>
      <AlertDialog open={isArenaConfirmOpen} onOpenChange={setIsArenaConfirmOpen}>
        <AlertDialogContent className="font-pixel border-2 border-primary bg-black">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary uppercase text-sm">Enter Arena?</AlertDialogTitle>
            <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed"> Joining the Arena queue costs <span className="text-yellow-500">100 Gold</span>. Are you sure you want to proceed? </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 text-[0.6rem] uppercase bg-primary text-primary-foreground" onClick={() => { setIsArenaConfirmOpen(false); joinTournamentQueue(); }}> Pay 100g & Join </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RoyalStore isOpen={isRoyalStoreOpen} onOpenChange={setIsRoyalStoreOpen} />
    </div>
  );
}
