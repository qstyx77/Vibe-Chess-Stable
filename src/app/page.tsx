
'use client';

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
  getActiveSets
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, GameSnapshot, ViewMode, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, AIMove as AIMoveType, ResurrectedSquareInfo, Effect, ChatMessage, InventoryItem, InventoryItemType, ItemType, PieceType, LastMoveInfo, LevelChangeEvent } from '@/types';
import { ITEM_METADATA, ITEM_SETS } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Link2Off, Copy, Landmark, Coins, MessageSquare, Sword, Users, ShoppingBag, ScrollText, Send, ArrowLeft, Skull, RotateCcw, Package, BookOpen } from 'lucide-react';
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
import { doc, getFirestore, increment } from 'firebase/firestore';
import { audioManager } from '@/lib/audio-manager';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { VibeChessTitle, PixelAnvil, ShroomIcon, PixelTome, PixelSack, PixelStall, PixelSwords, PixelTrophy, PixelRobotHead, PixelGear, PixelUndo, PixelReset, PixelUndo as PixelUndoIcon, PixelMonitor, PixelGemstoneMasonry } from '@/components/evolving-chess/IconLibrary';
import { useSocial } from '@/components/social/SocialContext';
import { Separator } from '@/components/ui/separator';
import { ChessPieceDisplay } from '@/components/evolving-chess/ChessPieceDisplay';
import { PieceAbilitiesInfo } from '@/components/evolving-chess/PieceAbilitiesInfo';
import { UserInteractionPopover } from '@/components/social/UserInteractionPopover';

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
  lastMoveWhite: LastMoveInfo | null,
  lastMoveBlack: LastMoveInfo | null,
  lastMoveGlobal: LastMoveInfo | null,
  shroomSpawnCounter?: number,
  nextShroomSpawnTurn?: number,
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
    lastMoveWhite,
    lastMoveBlack,
    lastMoveGlobal,
    didOpponentCaptureLastTurn: didOpponentCaptureLastTurn,
    positionHistory: positionHistory ? [...positionHistory] : []
  };
}

export default function EvolvingChessPage() {
  const { user, userData, isUserLoading } = useUser();
  const { addLog, onlineStatus: socialOnlineStatus, sendMessage: sendSocialMessage, isMessengerOpen, setIsMessengerOpen, hasUnread, clearUnread, visibleCategories, setVisibleCategories, chatInput, setChatInput, onlineUserIds, joinTournamentQueue, tournamentQueueCount, isTournamentIntermission, tournamentRound } = useSocial();
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
  const [clickedEnemySquare, setClickedEnemySquare] = useState<AlgebraicSquare | null>(null);
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
  
  const [lastMoveWhite, setLastMoveWhite] = useState<LastMoveInfo | null>(null);
  const [lastMoveBlack, setLastMoveBlack] = useState<LastMoveInfo | null>(null);
  const [lastMoveGlobal, setLastMoveGlobal] = useState<LastMoveInfo | null>(null);

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
    capturingPieceId: string | null,
    trackWhite: LastMoveInfo | null,
    trackBlack: LastMoveInfo | null,
    trackGlobal: LastMoveInfo | null
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
  const [didCaptureLastTurn, setDidCaptureLastTurn] = useState<{ white: boolean, black: boolean }>({ white: false, black: false });
  const [eloInfo, setEloInfo] = useState<any | null>(null);
  const [isGameSummaryOpen, setIsGameSummaryOpen] = useState(false);

  // Persistence Snapshot
  const [initialSnapshot, setInitialSnapshot] = useState<{ 
    inventory: InventoryItem[], 
    whiteEquipment: Record<string, string>, 
    blackEquipment: Record<string, string> 
  } | null>(null);

  const gameOverRef = useRef(false);
  const isInitialized = useRef(false);
  const aiInstanceRef = useRef<VibeChessAI | null>(null);
  const clickGuardRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const uniqueIdCounterRef = useRef(0);
  const lastInitializedUid = useRef<string | null>(null);

  const [headerIconsActive, setHeaderIconsActive] = useState(true);
  const [headerIconsOpacity, setHeaderIconsOpacity] = useState(true);

  useEffect(() => {
    const cycle = () => {
      setTimeout(() => {
        setHeaderIconsOpacity(false);
        setTimeout(() => {
          setHeaderIconsActive(false);
          setTimeout(() => {
            setHeaderIconsActive(true);
            setHeaderIconsOpacity(true);
            cycle();
          }, 1500);
        }, 1200);
      }, 15000);
    };
    cycle();
  }, []);

  const addEffectCallback = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number, itemType?: InventoryItemType) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value, itemType }]);
    setTimeout(() => {
      setEffects(curr => curr.filter(e => e.id !== id));
    }, 1500);
  }, []);

  const playOutcomeSound = useCallback((winner: PlayerColor | 'draw') => {
    if (winner === 'draw') {
        audioManager.playDraw();
        return;
    }
    if (onlineStatus !== 'disconnected') {
        if (winner === localPlayerColor) audioManager.playVictory();
        else audioManager.playDefeat();
    } else {
        const isAIPlaying = isWhiteAI || isBlackAI;
        if (isAIPlaying) {
            const aiColor = isWhiteAI ? 'white' : 'black';
            if (winner === aiColor) audioManager.playDefeat();
            else audioManager.playVictory();
        } else {
            audioManager.playVictory();
        }
    }
  }, [onlineStatus, localPlayerColor, isWhiteAI, isBlackAI]);

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

  const handlePieceHover = useCallback((p: Piece | null) => {
    setPieceForInfoDisplay(p);
    if (p && p.color !== currentPlayer && !isAnySpecialModeActive) {
      const coords = board.flat().find(sq => sq.piece?.id === p.id);
      if (coords) {
        const moves = getPossibleMoves(board, coords.algebraic, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
        setEnemySelectedSquare(coords.algebraic);
        setEnemyPossibleMoves(moves);
      }
    } else {
      if (clickedEnemySquare) {
        const coords = board.flat().find(sq => sq.algebraic === clickedEnemySquare);
        if (coords && coords.piece) {
            const moves = getPossibleMoves(board, clickedEnemySquare, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
            setEnemySelectedSquare(clickedEnemySquare);
            setEnemyPossibleMoves(moves);
        } else {
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
      } else {
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
      }
    }
  }, [board, currentPlayer, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, isAnySpecialModeActive, clickedEnemySquare]);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    return 3 + Math.floor((Math.max(0, elo - 1200)) / 400);
  }, [userData]);

  // Track Attunement and Unlocks for Alerts
  const prevAttunementRef = useRef<number | null>(null);
  const prevUnlockedRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (isUserLoading || !userData) return;

    // Check Attunement changes
    if (prevAttunementRef.current !== null && attunementSlots !== prevAttunementRef.current) {
        if (attunementSlots > prevAttunementRef.current) {
            const msg = `ATTUNEMENT INCREASED! You now have ${attunementSlots} equipment slots.`;
            toast({ title: "Power Up!", description: msg });
            addLog(msg);
            audioManager.playLevelUp();
        } else {
            const msg = `ATTUNEMENT DECREASED. You now have ${attunementSlots} equipment slots.`;
            toast({ variant: 'destructive', title: "Power Drained", description: msg });
            addLog(msg);
        }
    }
    prevAttunementRef.current = attunementSlots;

    // Check Unlock changes
    const currentUnlocked = userData.unlockedPieces || [];
    if (prevUnlockedRef.current !== null) {
        const newPieces = currentUnlocked.filter(p => !prevUnlockedRef.current?.includes(p));
        newPieces.forEach(p => {
            const name = p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ');
            const msg = `NEW UNIT UNLOCKED: The ${name} is now available!`;
            toast({ title: "Recruitment Complete", description: msg });
            addLog(msg);
            audioManager.playLevelUp();
        });
    }
    prevUnlockedRef.current = currentUnlocked;
  }, [userData, isUserLoading, attunementSlots, toast, addLog]);

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const statusMessage = useMemo(() => {
    if (isTournamentIntermission) return `QUALIFIED! ROUND ${tournamentRound + 1} PREPARATION...`;
    if (isInventoryOpen) return "SELECT ITEM TO EQUIP!";
    if (isAiThinking) return (currentPlayer === 'white' ? "WHITE (AI) THINKING..." : "BLACK (AI) THINKING...");
    if (isAwaitingPawnSacrifice) return "ROYAL SACRIFICE REQUIRED!";
    if (isPromotingPawn) return "PROMOTE YOUR PAWN!";
    if (isAwaitingCommanderPromotion) return "SELECT FRONTLINE UNIT TO PROMOTE!";
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
    isTournamentIntermission, tournamentRound, isInventoryOpen, isAiThinking, isAwaitingPawnSacrifice, isPromotingPawn,
    isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield,
    isAwaitingArcherSnipe, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow,
    isSelectingMycoSpell, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget,
    isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget,
    isAwaitingEarthquakeScrollTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget,
    gameInfo.message, currentPlayer
  ]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    if (!player) return '...'; 
    if (onlineStatus === 'connected' || onlineStatus === 'waiting' || onlineStatus === 'connecting') {
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
      const whiteEq: Record<string, string> = {};
      const blackEq: Record<string, string> = {};
      b.flat().forEach(sq => { 
          if (sq.piece?.heldItem) {
              if (sq.piece.color === 'white') whiteEq[sq.piece.id] = sq.piece.heldItem;
              else blackEq[sq.piece.id] = sq.piece.heldItem;
          }
      });
      // Only sync to Firestore in the Lobby (setup phase)
      if (gameMoveCounter === 0 && onlineStatus === 'disconnected') {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { 
            inventory: inv, 
            equipment: whiteEq,
            blackEquipment: blackEq
        });
      }
  }, [user, firestore, gameMoveCounter, onlineStatus]);

  const pushHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null }))),
      currentPlayer, gameInfo: { ...gameInfo }, capturedPieces: { white: [...capturedPieces.white], black: [...capturedPieces.black] }, killStreaks: { ...killStreaks }, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory: [...positionHistory], lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, 
      lastMoveWhite, lastMoveBlack, lastMoveGlobal, 
      isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, isAwaitingRookSacrifice: false, playerToSacrificeForRook: null, rookToMakeInvulnerable: null, boardForRookSacrifice: null, originalTurnPlayerForRookSacrifice: null, isExtraTurnFromRookLevelUp: false, isResurrectionPromotionInProgress: false, playerForPostResurrectionPromotion: null, isExtraTurnForPostResurrectionPromotion: false, promotionSquare, promotionMoveWasCapture: false, originalPromotionLevel: null, promotionPawnOriginalLevel: null, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares: [...resurrectedSquares], turnTimer, activeTimerPlayer: null, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil: playerToDropAnvil || null, anvilDropContext: specialActionContext ? { ...specialActionContext } as any : null, anvilDropAfterPromotion: false, inventory: [...inventory], didOpponentCaptureLastTurn: didCaptureLastTurn[currentPlayer === 'white' ? 'black' : 'white']
    };
    setHistoryStack(prev => [...prev, snapshot].slice(-40));
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory, lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, promotionSquare, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares, turnTimer, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil, specialActionContext, inventory, didCaptureLastTurn]);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0 || isMoveProcessing || isAiThinking || onlineStatus !== 'disconnected' || gameInfo.gameOver) return;
    const prevState = historyStack[historyStack.length - 1]; setHistoryStack(prev => prev.slice(0, -1));
    setBoard(prevState.board); setCurrentPlayer(prevState.currentPlayer); setGameInfo(prevState.gameInfo); setCapturedPieces(prevState.capturedPieces); setKillStreaks(prevState.killStreaks); setBoardOrientation(prevState.boardOrientation); setViewMode(prevState.viewMode); setIsWhiteAI(prevState.isWhiteAI); setIsBlackAI(prevState.isBlackAI); setPositionHistory(prevState.positionHistory); setLastMoveFrom(prevState.lastMoveFrom); setLastMoveTo(prevState.lastMoveTo); setGameMoveCounter(prevState.gameMoveCounter); setEnPassantTargetSquare(prevState.enPassantTargetSquare); 
    setLastMoveWhite(prevState.lastMoveWhite); setLastMoveBlack(prevState.lastMoveBlack); setLastMoveGlobal(prevState.lastMoveGlobal);
    setIsAwaitingPawnSacrifice(prevState.isAwaitingPawnSacrifice); setPlayerToSacrificePawn(prevState.playerToSacrificePawn); setBoardForPostSacrifice(prevState.boardForPostSacrifice); setPlayerWhoMadeQueenMove(prevState.boardOrientation as any); setIsExtraTurnFromQueenMove(prevState.isExtraTurnFromQueenMove); setFirstBloodAchieved(prevState.firstBloodAchieved); setPlayerWhoGotFirstBlood(prevState.playerWhoGotFirstBlood); setIsAwaitingCommanderPromotion(prevState.isAwaitingCommanderPromotion); setResurrectedSquares(prevState.resurrectedSquares); setWhiteTimeouts(prevState.whiteTimeouts); setBlackTimeouts(prevState.blackTimeouts); setIsAwaitingAnvilDrop(prevState.isAwaitingAnvilDrop); setPlayerToDropAnvil(prevState.playerToDropAnvil || null); setSpecialActionContext(prevState.anvilDropContext as any); if (prevState.inventory) setInventory(prevState.inventory);
    setSelectedSquare(null); setPossibleMoves([]); audioManager.playMove(); addLog("Move Undone.");
  }, [historyStack, isMoveProcessing, isAiThinking, onlineStatus, gameInfo.gameOver, addLog]);

  const handleUsePortalScroll = useCallback((type: InventoryItemType) => {
    if (!user || !type.startsWith('portal_scroll_')) return;
    const targetFloor = parseInt(type.split('_')[2]);
    if (isNaN(targetFloor)) return;
    const newInv = inventory.map(item => {
        if (item.type === type) return { ...item, count: item.count - 1 };
        return item;
    }).filter(item => item.count > 0);
    setInventory(newInv);
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

  const handleGameEndCleanup = useCallback(async (winner: PlayerColor | 'draw') => {
      if (!user || !firestore) return;
      const userRef = doc(firestore, 'users', user.uid);
      const isCompetitive = onlineStatus === 'connected' && (roomId?.startsWith('arena_') || !!eloInfo); 
      
      if (!isCompetitive && initialSnapshot) {
          // SAFE RETURN: Restore inventory and equipment
          updateDocumentNonBlocking(userRef, { 
              inventory: initialSnapshot.inventory,
              equipment: initialSnapshot.whiteEquipment,
              blackEquipment: initialSnapshot.blackEquipment
          });
          setInventory(initialSnapshot.inventory);
          addLog("Training complete. Used items returned to ranks.");
      } else if (isCompetitive) {
          // Competitive deduction is handled incrementally by sync logic
          // but we can enforce final piece control here (conversion results)
          const currentInv = [...inventory];
          board.flat().forEach(sq => {
              if (sq.piece && sq.piece.heldItem && sq.piece.color === localPlayerColor) {
                  const wasOpponentOriginal = (localPlayerColor === 'white' && sq.piece.id.startsWith('b')) || (localPlayerColor === 'black' && sq.piece.id.startsWith('w'));
                  if (wasOpponentOriginal) {
                      // Piece was converted to us - we keep the item in our loot bag
                      const itemIdx = currentInv.findIndex(i => i.type === sq.piece!.heldItem);
                      if (itemIdx > -1) currentInv[itemIdx].count++;
                      else currentInv.push({ type: sq.piece.heldItem, count: 1 });
                      addLog(`CONVERTED LOOT: Captured ${ITEM_METADATA[sq.piece.heldItem].name}!`);
                  }
              }
          });

          // Sync final equipment state for competitive reciprocal stakes
          const finalEq: Record<string, string> = {};
          board.flat().forEach(sq => {
              if (sq.piece?.heldItem && sq.piece.color === localPlayerColor) {
                  finalEq[sq.piece.id] = sq.piece.heldItem;
              }
          });
          const updateObj: any = { inventory: currentInv };
          if (localPlayerColor === 'white') updateObj.equipment = finalEq;
          else if (localPlayerColor === 'black') updateObj.blackEquipment = finalEq;

          updateDocumentNonBlocking(userRef, updateObj);
          setInventory(currentInv);
      }
      setInitialSnapshot(null);
  }, [user, firestore, onlineStatus, initialSnapshot, board, localPlayerColor, inventory, addLog, eloInfo, roomId]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null, trackWhite?: LastMoveInfo | null, trackBlack?: LastMoveInfo | null, trackGlobal?: LastMoveInfo | null) => {
    let currentBoardState = boardForNextStep; const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter); setCapturedPieces(currentGraveyard); setKillStreaks(currentKs);
    setDidCaptureLastTurn(prev => ({ ...prev, [playerWhoseTurnCompleted]: wasCaptureThisTurn }));
    
    const effWhite = trackWhite !== undefined ? trackWhite : lastMoveWhite;
    const effBlack = trackBlack !== undefined ? trackBlack : lastMoveBlack;
    const effGlobal = trackGlobal !== undefined ? trackGlobal : lastMoveGlobal;

    // Snapshot on first move
    if (newGameMoveCounter === 1 && onlineStatus === 'disconnected' && !initialSnapshot) {
        setInitialSnapshot({
            inventory: JSON.parse(JSON.stringify(inventory)),
            whiteEquipment: userData?.equipment || {},
            blackEquipment: userData?.blackEquipment || {}
        });
    }

    const prevFrozenIds = board.flat().filter(sq => (sq.piece?.frozenTurnsRemaining || 0) > 0).map(sq => sq.piece!.id);
    const midFrozenIds = currentBoardState.flat().filter(sq => (sq.piece?.frozenTurnsRemaining || 0) > 0).map(sq => sq.piece!.id);
    if (midFrozenIds.length > prevFrozenIds.length) audioManager.playFreeze();

    currentBoardState = processOilSlickTimers(currentBoardState, playerWhoseTurnCompleted);

    if (onlineStatus === 'disconnected') {
      let currentShroomCounter = shroomSpawnCounter + 1; 
      const activeSets = getActiveSets(currentBoardState, playerWhoseTurnCompleted);
      const isAlchemist = activeSets.includes('alchemist');
      if (isAlchemist) currentShroomCounter += 1;
      setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= nextShroomSpawnTurn) {
          const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(currentBoardState);
          if (shroomSpawnedAt) { currentBoardState = boardAfterShroom; setBoard(currentBoardState); addLog("A mystical Shroom 🍄 has appeared!"); audioManager.playShroom(); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); }
      }
    }

    const nextPlayer = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison, levelChanges: poisonChanges } = processPoisonDamage(currentBoardState, nextPlayer);
     poisonChanges?.forEach(lc => {
        addEffectCallback('level-change', lc.square, nextPlayer, lc.delta, undefined);
        if (lc.reason) addLog(`${getPlayerDisplayName(nextPlayer)}: ${lc.reason} (${lc.delta > 0 ? '+' : ''}${lc.delta})`);
    });
    
    const postPoisonPieces = boardAfterPoison.flat().filter(sq => sq.piece).map(sq => sq.piece!);
    anyShatteredLoop: for (const id of midFrozenIds) {
        const p = postPoisonPieces.find(piece => piece.id === id);
        if (p && (p.frozenTurnsRemaining || 0) === 0) {
            audioManager.playShatter();
            break anyShatteredLoop;
        }
    }

    const isSelfInCheck = isKingInCheck(boardAfterPoison, playerWhoseTurnCompleted, newEnPassantTarget, effWhite, effBlack, effGlobal);
    if (isSelfInCheck) {
        const msg = `AUTO-CHECKMATE! ${getPlayerDisplayName(playerWhoseTurnCompleted)} exposed their own King!`;
        const winner = playerWhoseTurnCompleted === 'white' ? 'black' : 'white';
        setGameInfo({ message: msg, isCheck: true, playerWithKingInCheck: playerWhoseTurnCompleted, isCheckmate: true, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner, isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true; playOutcomeSound(winner); 
        handleGameEndCleanup(winner);
        return;
    }

    const inCheck = isKingInCheck(boardAfterPoison, nextPlayer, newEnPassantTarget, effWhite, effBlack, effGlobal);
    const currentHash = boardToPositionHash(boardAfterPoison, nextPlayer, newEnPassantTarget);
    let newHistory = [...positionHistory];
    const isFrontlineMove = movedPieceType && FRONTLINE_TYPES.includes(movedPieceType);
    if (wasCaptureThisTurn || isFrontlineMove) { newHistory = [currentHash]; } else { newHistory.push(currentHash); }
    setPositionHistory(newHistory);
    const repetitionCount = newHistory.filter(h => h === currentHash).length;
    const isRepetition = repetitionCount >= 3;

    let mate = inCheck && isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, effWhite, effBlack, effGlobal);
    if (mate) {
        const kingInfo = findKing(boardAfterPoison, nextPlayer);
        if (kingInfo && kingInfo.piece.heldItem === 'kings_ransom') {
            const backRank = nextPlayer === 'white' ? 7 : 0;
            const safeSquares: AlgebraicSquare[] = [];
            for (let c = 0; c < 8; c++) {
                const alg = coordsToAlgebraic(backRank, c);
                if (!boardAfterPoison[backRank][c].piece && !boardAfterPoison[backRank][c].item) {
                    if (!isSquareAttacked(boardAfterPoison, alg, playerWhoseTurnCompleted, false, null, newEnPassantTarget, effWhite, effBlack, effGlobal)) { safeSquares.push(alg); }
                }
            }
            if (safeSquares.length > 0) {
                const dest = safeSquares[Math.floor(Math.random() * safeSquares.length)];
                const { row: dr, col: dc } = algebraicToCoords(dest);
                const { row: kr, col: kc } = algebraicToCoords(kingInfo.algebraic);
                boardAfterPoison[kr][kc].piece = null;
                boardAfterPoison[dr][dc].piece = { ...kingInfo.piece, heldItem: null, level: 1, hasMoved: true };
                addEffectCallback('light-beam', dest); audioManager.playResurrect(); addLog(`${getPlayerDisplayName(nextPlayer)} saved by King's Ransom!`);
                mate = isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, effWhite, effBlack, effGlobal);
            }
        }
    }
    
    setBoard(boardAfterPoison); setCurrentPlayer(nextPlayer); setEnPassantTargetSquare(newEnPassantTarget);
    if (inCheck && isExtraTurn) {
        const msg = `Auto-Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!`;
        setGameInfo({ message: msg, isCheck: true, playerWithKingInCheck: nextPlayer, isCheckmate: true, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: playerWhoseTurnCompleted, isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true; playOutcomeSound(playerWhoseTurnCompleted); 
        handleGameEndCleanup(playerWhoseTurnCompleted);
        return;
    }
    
    const stale = !inCheck && isStalemate(boardAfterPoison, nextPlayer, newEnPassantTarget, effWhite, effBlack, effGlobal);
    if (mate || stale || isRepetition) {
        const msg = mate ? `Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!` : (isRepetition ? "Draw by Repetition!" : "Stalemate!");
        const winner = mate ? playerWhoseTurnCompleted : 'draw';
        setGameInfo({ message: msg, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: mate, isStalemate: stale, isThreefoldRepetitionDraw: isRepetition, gameOver: true, winner, isInfiltrationWin: false });
        addLog(msg); gameOverRef.current = true; playOutcomeSound(winner);
        handleGameEndCleanup(winner);
    } else {
        if (inCheck) { addLog("Check!"); audioManager.playCheck(); }
        setGameInfo({ message: inCheck ? "Check!" : (isExtraTurn ? `${getPlayerDisplayName(playerWhoseTurnCompleted)} gets an extra turn!` : " "), isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: false, isInfiltrationWin: false });
    }
    if (onlineStatus === 'disconnected' && viewMode === 'flipping') {
      const isNextAI = nextPlayer === 'white' ? isWhiteAI : isBlackAI;
      if (!isNextAI) setBoardOrientation(nextPlayer);
    }
  }, [board, gameMoveCounter, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor, addLog, getPlayerDisplayName, lastMoveWhite, lastMoveBlack, lastMoveGlobal, addEffectCallback, viewMode, isWhiteAI, isBlackAI, positionHistory, playOutcomeSound, handleGameEndCleanup, initialSnapshot, inventory, userData, toast]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, oldStreak: number, newStreak: number, isExtraTurn: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = [], capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null, trackWhite?: LastMoveInfo | null, trackBlack?: LastMoveInfo | null, trackGlobal?: LastMoveInfo | null) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);
    
    let nextGraveyard = { 
        white: Array.isArray(currentGraveyard.white) ? [...currentGraveyard.white] : [],
        black: Array.isArray(currentGraveyard.black) ? [...currentGraveyard.black] : []
    };
    
    const effWhite = trackWhite !== undefined ? trackWhite : lastMoveWhite;
    const effBlack = trackBlack !== undefined ? trackBlack : lastMoveBlack;
    const effGlobal = trackGlobal !== undefined ? trackGlobal : lastMoveGlobal;

    if (newStreak >= 8 && !completedMilestones.includes('conquest')) {
        const actingKing = boardToChain.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer)?.piece;
        if (actingKing?.heldItem === 'kings_conquest') {
            const msg = `CONQUEST VICTORY! ${getPlayerDisplayName(actingPlayer)} reigns supreme!`;
            setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: actingPlayer });
            addLog(msg); gameOverRef.current = true; playOutcomeSound(actingPlayer); 
            handleGameEndCleanup(actingPlayer);
            return;
        }
    }
    if (newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const dancerSq = boardToChain.flat().find(sq => sq.piece?.color === actingPlayer && sq.piece?.type === 'dancer');
        const isDancerSilenced = dancerSq ? isSilenced(boardToChain, dancerSq.rowIndex, dancerSq.colIndex, actingPlayer) : false;
        
        if (dancerSq && !isDancerSilenced) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const aiDancerSq = nextBoard.flat().find(sq => sq.piece?.color === actingPlayer && sq.piece?.type === 'dancer');
                if (aiDancerSq) {
                    const {rowIndex: r, colIndex: c} = aiDancerSq;
                    const dancerPiece = aiDancerSq.piece!;
                    const dancerDir = actingPlayer === 'white' ? -1 : 1;
                    const candidates: {r: number, c: number, priority: number}[] = [];
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                        if(dr===0 && dc===0) continue;
                        const nr = r+dr; const nc = c+dc;
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
                        const dancerMoveInfo: LastMoveInfo = { type: dancerPiece.type, level: dancerPiece.level, item: dancerPiece.heldItem || null };
                        const nextAITracks = {
                            white: actingPlayer === 'white' ? dancerMoveInfo : effWhite,
                            black: actingPlayer === 'black' ? dancerMoveInfo : effBlack,
                            global: dancerMoveInfo
                        };
                        if (actingPlayer === 'white') setLastMoveWhite(dancerMoveInfo); else setLastMoveBlack(dancerMoveInfo);
                        setLastMoveGlobal(dancerMoveInfo);
                        
                        if (targetItem?.type === 'shroom') {
                            const oldDancerL = dancerPiece.level;
                            nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true, level: (dancerPiece.level || 1) + 1 };
                            if (nextBoard[best.r][best.c].piece!.level > 7 && nextBoard[best.r][best.c].piece!.type === 'queen') nextBoard[best.r][best.c].piece!.level = 7;
                            if (nextBoard[best.r][best.c].piece!.level > oldDancerL) {
                                addEffectCallback('level-change', coordsToAlgebraic(best.r, best.c), actingPlayer, 1, undefined);
                            }
                        } else { nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true }; }
                        nextBoard[best.r][best.c].item = null;
                        nextBoard[r][c].piece = tP ? { ...tP, hasMoved: true, isShielded: false } : null;
                        nextBoard[r][c].item = targetItem?.type === 'shroom' ? null : targetItem;
                        addLog(`${getPlayerDisplayName(actingPlayer)} Dancer performed a free ${tP ? 'swap' : (targetItem ? 'anvil swap' : 'move')}!`);
                        triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'dance'], capturingPieceId, wasCaptureThisTurn, movedPieceType, nextAITracks.white, nextAITracks.black, nextAITracks.global); return;
                    }
                }
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal });
                setIsAwaitingDanceTarget(true); addLog("Dancer Skill: The Dance is ready!"); return;
            }
        }
    }
    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const flSq = nextBoard.flat().find(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.level === 1 && FRONTLINE_TYPES.includes(sq.piece.type) && sq.piece.type !== 'commander' && sq.piece.type !== 'infiltrator');
            if (flSq) { const {row: pr, col: pc} = algebraicToCoords(flSq.algebraic); nextBoard[pr][pc].piece!.type = 'commander'; addLog(`${getPlayerDisplayName(actingPlayer)} promoted a Commander via First Blood!`); }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'firstBlood'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && FRONTLINE_TYPES.includes(sq.piece.type) && sq.piece.type !== 'commander' && sq.piece.type !== 'infiltrator' && sq.piece.level === 1);
            if (hasL1Targets) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'firstBlood'], currentGraveyard: nextGraveyard, currentKs: currentKs, capturingPieceId: capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal });
                setIsAwaitingCommanderPromotion(true); addLog("First Blood! Choose a unit to promote to Commander."); return;
            }
        }
    }
    if (newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const archbishops = boardToChain.flat().filter(sq => {
          const p = sq.piece;
          if (!p || p.color !== actingPlayer) return false;
          if (p.type === 'archbishop') return true;
          if (p.type === 'mimic') {
             let lastInfo = effGlobal;
             if (p.heldItem === 'mirror_mask') lastInfo = actingPlayer === 'white' ? effBlack : effWhite;
             else if (p.heldItem === 'mimic_blade') lastInfo = actingPlayer === 'white' ? effWhite : effBlack;
             return lastInfo?.type === 'archbishop';
          }
          return false;
        });
        
        const allArchbishopsSilenced = archbishops.length > 0 && archbishops.every(sq => isSilenced(boardToChain, sq.rowIndex, sq.colIndex, actingPlayer));

        if (archbishops.length > 0 && !allArchbishopsSilenced) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const targets = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId).sort((a, b) => (b.piece?.level || 0) - (a.piece?.level || 0));
                if (targets.length > 0) { 
                    const ally = targets[0].piece!;
                    ally.isShielded = true; 
                    const rosaryArchbishop = nextBoard.flat().find(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.heldItem === 'rosary');
                    if (rosaryArchbishop) {
                        const oldTargetL = ally.level;
                        ally.level = Math.min(ally.type === 'queen' ? 7 : 99, (ally.level || 1) + 1);
                        if (ally.level > oldTargetL) {
                            addEffectCallback('level-change', targets[0].algebraic, actingPlayer, 1, undefined);
                        }
                    }
                    addLog(`${getPlayerDisplayName(actingPlayer)} Archbishop applied a Holy Shield!`); 
                }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                const hasEligible = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId);
                if (hasEligible) {
                    setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'shield'], currentGraveyard: nextGraveyard, currentKs: currentKs, capturingPieceId: capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal });
                    setIsAwaitingHolyShield(true); addLog("Holy Shield ready!"); return;
                } else { triggerSpecialsChain(boardToChain, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return; }
            }
        }
    }
    if (newStreak >= 3 && oldStreak < 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const myKingSq = nextBoard.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer);
            const kR = myKingSq ? myKingSq.rowIndex : (actingPlayer === 'white' ? 7 : 0);
            const kC = myKingSq ? myKingSq.colIndex : 4;
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) {
                empty.sort((a, b) => (Math.abs(a.rowIndex - kR) + Math.abs(a.colIndex - kC)) - (Math.abs(b.rowIndex - kR) + Math.abs(b.colIndex - kC)));
                const target = empty[0];
                nextBoard[target.rowIndex][target.colIndex].item = { type: 'anvil' };
                setTimeout(() => {
                  addEffectCallback('poof', target.algebraic);
                  audioManager.playAnvil();
                }, 300);
                addLog(`${getPlayerDisplayName(actingPlayer)} dropped a defensive Anvil!`);
            }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'anvil'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtraTurn, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'anvil'], currentGraveyard: nextGraveyard, currentKs: currentKs, capturingPieceId: capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal });
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
                let resLevel = 1;
                if (choice.heldItem === 'soul_spark') resLevel = 2;
                const resPiece: Piece = { ...choice, level: resLevel, id: `res_ks_${choice.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                if (onlineStatus === 'connected' && actingPlayer === localPlayerColor) { wsRef.current?.send(JSON.stringify({ type: 'ks-resurrection', payload: { pieceId: choice.id, square: sq.algebraic } })); }
                nextBoard[rr][rc].piece = resPiece; 
                const updatedG = { 
                    white: Array.isArray(nextGraveyard.white) ? [...nextGraveyard.white] : [],
                    black: Array.isArray(nextGraveyard.black) ? [...nextGraveyard.black] : []
                };
                if (actingPlayer === 'white') updatedG.white = updatedG.white.filter(p => p.id !== choice.id); else updatedG.black = updatedG.black.filter(p => p.id !== choice.id);
                addEffectCallback('light-beam', sq.algebraic); audioManager.playResurrect(); addLog(`${getPlayerDisplayName(actingPlayer)} resurrected a ${choice.type}!`);
                triggerSpecialsChain(nextBoard, updatedG, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'resurrection'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return;
            }
        }
    }
    
    if (newStreak >= 5 && oldStreak < 5 && !completedMilestones.includes('snipe')) {
        const pArr = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
        const snipers = pArr.filter(pt => { 
            if (pt.heldItem === 'weighted_helm') return false; 
            if (pt.type === 'archer') return true; 
            if (pt.type === 'mimic') {
               let lastInfo = effGlobal;
               if (pt.heldItem === 'mirror_mask') lastInfo = actingPlayer === 'white' ? effBlack : effWhite;
               else if (pt.heldItem === 'mimic_blade') lastInfo = actingPlayer === 'white' ? effWhite : effBlack;
               if (lastInfo?.type === 'archer') return true;
            }
            const coords = boardToChain.flat().find(sq => sq.piece?.id === pt.id); 
            if ((pt.type === 'knight' || pt.type === 'mimic') && pt.heldItem === 'shortbow' && coords && getEffectiveLevel(boardToChain, coords.rowIndex, coords.colIndex) >= 3) return true; 
            return false; 
        });
        
        const allSnipersSilenced = snipers.length > 0 && snipers.every(p => {
            const coords = boardToChain.flat().find(sq => sq.piece?.id === p.id);
            return coords ? isSilenced(boardToChain, coords.rowIndex, coords.colIndex, actingPlayer) : false;
        });

        const hasCrossbow = pArr.some(p => p.heldItem === 'crossbow' && (p.type === 'archer' || (p.type === 'mimic' && effGlobal?.type === 'archer')));
        const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && snipers.length > 0 && !allSnipersSilenced) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow);

        if (isSnipeTime) {
            const oppColor = actingPlayer === 'white' ? 'black' : 'white';
            const maxSniperLevel = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
            const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxSniperLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && sq.piece.heldItem !== 'weighted_helm');
            
            if (victims.length > 0) {
                if (isAI) {
                    const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                    const victimsSorted = victims.sort((a,b) => (VAL_MAP[b.piece!.type]||0) - (VAL_MAP[a.piece!.type]||0));
                    const v = victimsSorted[0]; const {rowIndex: row, colIndex: col} = v;
                    const snipedPiece = { ...nextBoard[row][col].piece!, id: nextBoard[row][col].piece!.id }; nextBoard[row][col].piece = null; addLog(`${getPlayerDisplayName(actingPlayer)} Sniper sniped a Level ${snipedPiece.level} ${snipedPiece.type}!`);
                    const targetPile = snipedPiece.color; 
                    nextGraveyard[targetPile] = Array.isArray(nextGraveyard[targetPile]) ? [...nextGraveyard[targetPile], snipedPiece] : [snipedPiece];
                    triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtraTurn, nextEp, actingPlayer, [...completedMilestones, 'snipe'], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return;
                } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                    setSpecialActionContext({ boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal } as any);
                    setIsAwaitingArcherSnipe(true); addLog("Sniper active! Select a target."); return;
                }
            }
        }
    }
    processMoveEnd(boardToChain, nextGraveyard, currentKs, actingPlayer, isExtraTurn, nextEp, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal);
  }, [board, isWhiteAI, isBlackAI, firstBloodAchieved, addEffectCallback, processMoveEnd, localPlayerColor, addLog, getPlayerDisplayName, lastMoveWhite, lastMoveBlack, lastMoveGlobal, onlineStatus, playOutcomeSound, handleGameEndCleanup]);

  const processPawnSacrificeCheck = useCallback((boardAfter: BoardState, graveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, player: PlayerColor, move: Move | null, oldL: number | undefined, oldT: PieceType | undefined, isExtraTurn: boolean, ep: AlgebraicSquare | null, oldS: number, newS: number, capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false, movedPieceType?: PieceType | null, trackWhite?: LastMoveInfo | null, trackBlack?: LastMoveInfo | null, trackGlobal?: LastMoveInfo | null) => {
    if (!move) return false;
    const { row: rowIdx, col: colIdx } = algebraicToCoords(move.to); const piece = boardAfter[rowIdx][colIdx].piece;
    const effWhite = trackWhite !== undefined ? trackWhite : lastMoveWhite;
    const effBlack = trackBlack !== undefined ? trackBlack : lastMoveBlack;
    const effGlobal = trackGlobal !== undefined ? trackGlobal : lastMoveGlobal;
    if (piece?.type === 'queen' && piece.level === 7 && oldT === 'queen' && (oldL || 0) < 7) {
      if (boardAfter.flat().some(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type))) {
        const isAI = (player === 'white' && isWhiteAI) || (player === 'black' && isBlackAI);
        if (isAI) {
            const nextB = boardAfter.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const flSq = nextB.flat().find(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type));
            if (flSq) {
                const {row: pr, col: pc} = algebraicToCoords(flSq.algebraic); const sacrificed = { ...nextB[pr][pc].piece!, id: nextB[pr][pc].piece!.id };
                nextB[pr][pc].piece = null; audioManager.playCapture(); addLog(`AI Sacrificed ${sacrificed.type} for the Queen!`);
                const nextG = { white: Array.isArray(graveyard.white) ? [...graveyard.white] : [], black: Array.isArray(graveyard.black) ? [...graveyard.black] : [] }; 
                const targetPile = sacrificed.color; nextG[targetPile] = [...nextG[targetPile], sacrificed];
                triggerSpecialsChain(nextB, nextG, currentKs, oldS, newS, isExtraTurn, ep, player, [], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(player); setBoardForPostSacrifice(boardAfter); setPlayerWhoMadeQueenMove(player); setIsExtraTurnFromQueenMove(isExtraTurn);
        setSpecialActionContext({ boardForNextStep: boardAfter, playerWhoseTurnCompleted: player, isExtraTurn: isExtraTurn, newEnPassantTarget: ep, oldStreak: oldS, newStreak: nS, currentGraveyard: graveyard, currentKs: currentKs, capturingPieceId, trackWhite: effWhite, trackBlack: effBlack, trackGlobal: effGlobal }); 
        addLog("Royal Sacrifice required! Select a Frontline unit to give up."); return true;
      }
    }
    triggerSpecialsChain(boardAfter, graveyard, currentKs, oldS, newS, isExtraTurn, ep, player, [], capturingPieceId, wasCaptureThisTurn, movedPieceType, effWhite, effBlack, effGlobal); return false;
  }, [isWhiteAI, isBlackAI, triggerSpecialsChain, addLog, lastMoveWhite, lastMoveBlack, lastMoveGlobal]);

  const handlePromotionSelect = useCallback((t: PieceType) => {
    setIsPromotingPawn(false); setPromotionSquare(null);
    let nB = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare!); const p = nB[row][col].piece; if (!p) return;
    nB[row][col].piece = { ...p, type: t, hasMoved: true, level: promotionTargetLevel };
    if (t === 'queen') nB[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    setBoard(nB); audioManager.playLevelUp(); addLog(`${getPlayerDisplayName(p.color)}: Pawn promoted to ${t}!`);
    const remQ = promotionQueue.slice(1);
    if (remQ.length > 0) { 
        setPromotionQueue(remQ); 
        const nxt = remQ[0]; 
        setPromotionSquare(nxt.square); 
        setPromotionTargetLevel(nxt.targetLevel); 
        setIsPromotingPawn(true); 
    } else { 
        setPromotionQueue([]);
        if (specialActionContext) triggerSpecialsChain(nB, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, currentPlayer, specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false, t, specialActionContext.trackWhite, specialActionContext.trackBlack, specialActionContext.trackGlobal);
        else processMoveEnd(nB, capturedPieces, killStreaks, currentPlayer, false, null, false, t);
    }
  }, [board, promotionSquare, promotionTargetLevel, capturedPieces, killStreaks, triggerSpecialsChain, addLog, specialActionContext, processMoveEnd, promotionQueue, getPlayerDisplayName, currentPlayer]);

  const performAiMove = useCallback(async () => {
    if (!aiInstanceRef.current || gameInfo.gameOver || gameOverRef.current || isMoveProcessing || isAnySpecialModeActive || isAiThinking) return;
    setSelectedSquare(null); setPossibleMoves([]); setIsAiThinking(true);
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const oppCapLastTurn = didCaptureLastTurn[currentPlayer === 'white' ? 'black' : 'white'];
      const gsAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, shroomSpawnCounter, nextShroomSpawnTurn, oppCapLastTurn, positionHistory);
      const resAI = aiInstanceRef.current.getBestMove(gsAI, currentPlayer); 
      let aiMove = resAI?.move;
      if (!aiMove) { setIsAiThinking(false); return; }
      const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]); const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
      const p = board[aiMove.from[0]][aiMove.from[1]].piece; if (!p) { setIsAiThinking(false); return; }
      const oldL = p.level, oldT = p.type, oldH = p.heldItem;
      setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg);
      const newMoveInfo: LastMoveInfo = { type: oldT, level: oldL, item: oldH || null };
      const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
      if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
      setLastMoveGlobal(newMoveInfo);
      pushHistory();
      const applyResult = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo, grappledFrom: aiMove.grappledFrom }, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, oppCapLastTurn);
      let nextB = applyResult.newBoard; const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] };
      applyResult.levelChanges?.forEach(lc => addEffectCallback('level-change', lc.square, currentPlayer, lc.delta, undefined));
      if (applyResult.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === applyResult.itemReturned); if (existing) existing.count++; else next.push({ type: applyResult.itemReturned!, count: 1 }); return next; }); addLog(`AI returned equipment: ${ITEM_METADATA[applyResult.itemReturned].name}`); }
      if (applyResult.reflectionOccurred) { 
          const victim = applyResult.capturedPiece!; const targetPile = victim.color; 
          updatedG[targetPile] = [...updatedG[targetPile], { ...victim }];
          audioManager.playCapture(); addLog("AI attack reflected!"); addEffectCallback('poof', toAlg); 
          const newKs = { ...killStreaks, white: 0, black: 0 }; setBoard(nextB); setCapturedPieces(updatedG); setKillStreaks(newKs); 
          setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, updatedG, newKs, currentPlayer, false, null, false, oldT, nextTracks.white, nextTracks.black, nextTracks.global); }, 800); return; 
      }
      const streakGain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0) + (applyResult.obliteratedPieces?.length || 0);
      if (applyResult.shroomConsumed) { audioManager.playShroom(); addLog("AI consumed a Shroom!"); }
      if (applyResult.promotedToHero) { audioManager.playLevelUp(); addLog("AI Hero Ascended!"); }
      if (applyResult.conversionEvents?.length > 0) { audioManager.playConversion(); applyResult.conversionEvents.forEach((e: ConversionEvent) => { addEffectCallback('conversion', e.at); }); }
      if (applyResult.rallyCryTriggered) { addEffectCallback('shockwave', applyResult.rallyCryTriggered.square, applyResult.rallyCryTriggered.color); audioManager.playRally(); addLog("AI Rallying Cry!"); }
      const isObliteration = applyResult.promotedToInfiltrator || (p.type === 'infiltrator' && applyResult.capturedPiece);
      if (isObliteration) { audioManager.playObliterate(); addLog("AI Obliterated a unit!"); addEffectCallback('poof', toAlg); }
      else if (applyResult.capturedPiece || (applyResult.selfDestructCaptures && applyResult.selfDestructCaptures.length > 0)) { audioManager.playCapture(); addEffectCallback('poof', toAlg); if (applyResult.capturedPiece) addLog(`AI Captured ${applyResult.capturedPiece.type}!`); }
      else { 
        // Descriptive skill-based logging for AI
        let aiLogMsg = `AI ${p.type} to ${toAlg}`;
        if (aiMove.type === 'grapple-throw') aiLogMsg = `AI Grappler tossed piece to ${toAlg}`;
        else if (aiMove.type === 'self-destruct') aiLogMsg = `AI Knight self-destructed at ${toAlg}`;
        else if (aiMove.type === 'swap') aiLogMsg = `AI swapped with ally at ${toAlg}`;
        else if (aiMove.type === 'myco-propagate') aiLogMsg = `AI used Propagate!`;
        else if (aiMove.type === 'tele-portobello') aiLogMsg = `AI used Tele-Portobello to ${toAlg}`;
        else if (aiMove.type === 'spore-bomb') aiLogMsg = `AI used Spore Bomb at ${toAlg}`;
        else if (aiMove.type === 'raise-mycelimen') aiLogMsg = `AI used Raise Myceli-men!`;
        audioManager.playMove(); 
        addLog(aiLogMsg); 
      }
      
      if (applyResult.glassShardTriggered) addLog("Glass Shard! AI is exhausted.");

      if (applyResult.smokeBombEvent) {
          addLog(`Smoke Bomb! ${applyResult.smokeBombEvent.piece.type} escaped to back rank!`);
          addEffectCallback('poof', applyResult.smokeBombEvent.square);
      } else if (applyResult.capturedPiece && !isObliteration) { 
          const pile = applyResult.capturedPiece.color; updatedG[pile] = [...updatedG[pile], { ...applyResult.capturedPiece }]; 
      }
      
      if (applyResult.selfDestructCaptures) { applyResult.selfDestructCaptures.forEach(vic => { const pile = vic.color; updatedG[pile] = [...updatedG[pile], { ...vic }]; }); }
      if (applyResult.ralliedSquares) applyResult.ralliedSquares.forEach(sq => addEffectCallback('level-change', sq, currentPlayer, 1, undefined));
      if (applyResult.anvilDroppedSquares) applyResult.anvilDroppedSquares.forEach(sq => {
          setTimeout(() => { addEffectCallback('poof', sq); audioManager.playAnvil(); }, 300);
      });
      const oS = killStreaks[currentPlayer], nS = streakGain > 0 ? oS + streakGain : 0, currentKs = { ...killStreaks, [currentPlayer]: nS }; setKillStreaks(currentKs);
      let rookResResult: RookResurrectionResult | null = null;
      const wasCap = streakGain > 0;
      if ((oldT === 'rook' || oldT === 'palace') && wasCap) {
          const resRes = processRookResurrectionCheck(nextB, currentPlayer, {from: fromAlg, to: toAlg, type: 'move'}, toAlg, oldL, updatedG, uniqueIdCounterRef.current);
          if (resRes.resurrectionPerformed) {
              nextB = resRes.boardWithResurrection; updatedG.white = resRes.capturedPiecesAfterResurrection.white; updatedG.black = resRes.capturedPiecesAfterResurrection.black; uniqueIdCounterRef.current = resRes.newResurrectionIdCounter!; rookResResult = resRes;
              addEffectCallback('light-beam', resRes.resurrectedSquareAlg!); audioManager.playResurrect(); addLog(`AI Resurrection Call! ${resRes.resurrectedPieceData?.type} returns.`);
          }
      }
      if (applyResult.multiPromotions) { applyResult.multiPromotions.forEach(promo => { const {row: pr, col: pc} = algebraicToCoords(promo.square); const p = nextB[pr][pc].piece; if (p) { p.type = 'queen'; p.level = promo.targetLevel; } }); }
      if (rookResResult?.promotionRequiredForResurrectedPawn) {
          const {row: rr, col: rc} = algebraicToCoords(rookResResult.resurrectedSquareAlg!);
          const rp = nextB[rr][rc].piece; if (rp) { rp.type = 'queen'; addLog("AI resurrected unit auto-promoted!"); }
      }
      setBoard(nextB); setCapturedPieces(updatedG);
      setTimeout(() => {
        setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return;
        if (applyResult.infiltrationWin) {
            const msg = `INFILTRATION WIN! AI has breached the back rank!`;
            setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: currentPlayer, isInfiltrationWin: true });
            addLog(msg); gameOverRef.current = true; playOutcomeSound(currentPlayer); 
            handleGameEndCleanup(currentPlayer);
            return;
        }
        let isExtraTurn = applyResult.extraTurn || (oS < 6 && nS >= 6); 
        const landed = nextB[aiMove!.to[0]][aiMove!.to[1]].piece; const oppBackRank = currentPlayer === 'white' ? 0 : 7;
        if (landed && FRONTLINE_TYPES.includes(landed.type) && aiMove!.to[0] === oppBackRank) { 
            const promoType = aiMove!.promoteTo || 'queen'; const targetL = getPromotionLevel(applyResult.capturedPiece?.type || applyResult.pieceCapturedByAnvil?.type || null); 
            landed.type = promoType; landed.level = targetL; if (promoType === 'queen') landed.level = Math.min(landed.level, 7); 
            if (landed.level >= 5) isExtraTurn = true; addLog(`AI promoted to ${promoType}!`); 
        }
        setBoard(nextB); processPawnSacrificeCheck(nextB, updatedG, currentKs, currentPlayer, {from: fromAlg, to: toAlg, type: aiMove!.type as AIMoveType['type']}, oldL, oldT, isExtraTurn, applyResult.enPassantTargetSet, oS, nS, wasCap ? landed?.id || null : null, wasCap, oldT, nextTracks.white, nextTracks.black, nextTracks.global);
      }, 800);
    } catch (e) { console.error(`[AI Error]`, e); setIsAiThinking(false); }
  }, [board, currentPlayer, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, isAiThinking, isWhiteAI, isBlackAI, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, processPawnSacrificeCheck, gameMoveCounter, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, addEffectCallback, pushHistory, addLog, killStreaks, capturedPieces, didCaptureLastTurn, positionHistory, playOutcomeSound, handleGameEndCleanup, initialSnapshot, userData]);

  const handleMycoSpellSelect = useCallback((spell: MycoSpell) => {
      setIsSelectingMycoSpell(false); if (!spell) { setSelectedSquare(null); return; }
      const { row: fr, col: fc } = algebraicToCoords(selectedSquare!);
      const mage = board[fr][fc].piece;
      if (!mage) return;

      const newMoveInfo: LastMoveInfo = { type: mage.type, level: mage.level, item: mage.heldItem || null };
      const nextTracks = { 
          white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, 
          black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, 
          global: newMoveInfo 
      };

      if (spell === 'propagate') {
        const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'myco-propagate' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
        else {
            pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
            setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("Mushroomancy: Propagate!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, 'myco_mage', nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
        }
      } else if (spell === 'teleport') { setIsSelectingTeleportAlly(true); addLog("Select an ally to teleport!");
      } else if (spell === 'spore-bomb') { setIsSelectingSporeBombShroom(true); addLog("Select a shroom to detonate!");
      } else if (spell === 'raise-mycelimen') {
          const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'raise-mycelimen' };
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
          else {
              pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
              if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
              setLastMoveGlobal(newMoveInfo);
              const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
              const nextB = applyResult.newBoard; const updatedG = { white: Array.isArray(capturedPieces.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces.black) ? [...capturedPieces.black] : [] }; setBoard(nextB); audioManager.playLevelUp(); addLog("Mushroomancy: Myceli-Men Rise!");
              setTimeout(() => { 
                setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null);
                const queue: {square: AlgebraicSquare, targetLevel: number}[] = applyResult.multiPromotions || [];
                if (queue.length > 0) { 
                    setPromotionQueue(queue); const fst = queue[0]; setPlayerToPromote(currentPlayer); setPromotionTargetLevel(fst.targetLevel); setIsPromotingPawn(true); setPromotionSquare(fst.square); 
                    setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, trackWhite: nextTracks.white, trackBlack: nextTracks.black, trackGlobal: nextTracks.global } as any); 
                } else { processMoveEnd(nextB, updatedG, killStreaks, currentPlayer, false, null, false, 'myco_mage', nextTracks.white, nextTracks.black, nextTracks.global); }
              }, 800);
          }
      }
  }, [selectedSquare, onlineStatus, board, enPassantTargetSquare, capturedPieces, killStreaks, currentPlayer, processMoveEnd, addLog, lastMoveWhite, lastMoveBlack, lastMoveGlobal, pushHistory]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic); const sq = board[row]?.[col]; const piece = sq?.piece;
    handlePieceHover(piece || null);

    const silencedUnit = isSilenced(board, row, col, currentPlayer);

    if (isAwaitingShieldScrollTarget && piece && piece.color === currentPlayer) {
        if (piece.type === 'king' || piece.type === 'queen' || piece.isShielded) return;
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'shield-scroll' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
        else {
            pushHistory(); const movingP = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
            const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
            const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            addEffectCallback('magic-burst', selectedSquare!, undefined, undefined, movingP.heldItem as InventoryItemType);
            const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
            setBoard(res.newBoard);
            setTimeout(() => { setIsMoveProcessing(false); setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movingP.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
        }
        return;
    }
    if (isAwaitingSwapScrollTarget && piece && piece.color === currentPlayer && algebraic !== selectedSquare) {
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'swap-scroll' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
        else {
            pushHistory(); const movingP = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
            const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
            const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            addEffectCallback('magic-burst', selectedSquare!, undefined, undefined, movingP.heldItem as InventoryItemType);
            const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
            setBoard(res.newBoard);
            setTimeout(() => { setIsMoveProcessing(false); setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movingP.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
        }
        return;
    }
    if (isAwaitingDecreeTarget && piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'kings-decree' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setIsAwaitingDecreeTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
        else {
            pushHistory(); const movingP = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
            const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
            const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            addEffectCallback('magic-burst', selectedSquare!, undefined, undefined, movingP.heldItem as InventoryItemType);
            const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
            setBoard(res.newBoard);
            setTimeout(() => { setIsMoveProcessing(false); setIsAwaitingDecreeTarget(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, 'king', nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
        }
        return;
    }

    if (isAwaitingGrappleThrow) {
        const {row: fr, col: fc} = algebraicToCoords(selectedSquare!); const range = getEffectiveLevel(board, fr, fc);
        const movingP = board[fr][fc].piece!;
        const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
        const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

        const dist = Math.max(Math.abs(fr - row), Math.abs(fc - col));
        if (algebraic === (grappledPieceSubject?.from || grappledItemSubject?.from) && grappledPieceSubject?.piece.color !== currentPlayer) {
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'capture' };
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
                setLastMoveGlobal(newMoveInfo);
                const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] };
                
                if (result.stolenItem && user) {
                    const newInv = [...inventory];
                    const existing = newInv.find(i => i.type === result.stolenItem);
                    if (existing) existing.count++;
                    else newInv.push({ type: result.stolenItem, count: 1 });
                    setInventory(newInv);
                    saveLoadoutToFirestore(result.newBoard, newInv);
                    addLog(`STOLEN: ${ITEM_METADATA[result.stolenItem].name}!`);
                }

                if (result.glassShardTriggered) addLog("Glass Shard! Capturer is exhausted.");

                if (result.smokeBombEvent) {
                    addLog(`Smoke Bomb! ${result.smokeBombEvent.piece.type} escaped to back rank!`);
                    addEffectCallback('poof', result.smokeBombEvent.square);
                } else if (result.capturedPiece) {
                    updatedG[result.capturedPiece.color].push(result.capturedPiece);
                }
                
                setBoard(result.newBoard); setCapturedPieces(updatedG); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { 
                    setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); 
                    const wasCap = !!(result.capturedPiece || result.smokeBombEvent);
                    const oS = killStreaks[currentPlayer], nS = wasCap ? oS + 1 : 0, cKs = { ...killStreaks, [currentPlayer]: nS }; 
                    setKillStreaks(cKs);
                    processPawnSacrificeCheck(result.newBoard, updatedG, cKs, currentPlayer, move, grappledPieceSubject!.piece.level, grappledPieceSubject!.piece.type, result.extraTurn, result.enPassantTargetSet, oS, nS, result.newBoard[row][col].piece?.id || null, wasCap, grappledPieceSubject!.piece.type, nextTracks.white, nextTracks.black, nextTracks.global);
                }, 800);
            }
            return;
        }
        if (((fr === row || fc === col) || Math.abs(fr - row) === Math.abs(fc - col)) && dist <= range && dist > 0) {
          if (!sq?.piece && !sq?.item) {
            pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'grapple-throw', thrownPiece: grappledPieceSubject?.piece, thrownItem: grappledItemSubject?.type, grappledFrom: (grappledPieceSubject?.from || grappledItemSubject?.from) };
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movingP.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
            }
          }
        }
        return;
    }
    if (isInventoryOpen) {
      if (selectedInventoryItemType && !selectedInventoryItemType.startsWith('portal_scroll_')) {
        const itemMeta = ITEM_METADATA[selectedInventoryItemType];
        if (itemMeta.rarity === 'rare' && board.flat().some(sq => sq.piece?.color === piece?.color && sq.piece?.heldItem === selectedInventoryItemType)) {
            if (piece?.heldItem !== selectedInventoryItemType) {
                addLog(`LIMIT REACHED: One ${itemMeta.name} per side allowed!`); return;
            }
        }
        if (piece && (onlineStatus === 'disconnected' || piece.color === (localPlayerColor || 'white'))) {
          if (piece.heldItem === selectedInventoryItemType) { setSelectedInventoryItemType(null); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          
          // --- PER-COLOR ATTUNEMENT LIMIT (LOBBY ONLY) ---
          const colorUsedSlots = board.flat().filter(sq => sq.piece?.heldItem && sq.piece.color === piece.color).length;
          if (!piece.heldItem && colorUsedSlots >= attunementSlots) { 
              addLog(`${piece.color.toUpperCase()} Attunement Limit Reached!`); 
              return; 
          }
          
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null, phasedPiece: s.phasedPiece ? { ...s.phasedPiece } : null })));
          const targetP = nextBoard[row][col].piece!;
          const oldItem = targetP.heldItem;
          targetP.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
          let newInv = [...inventory];
          if (oldItem) {
              const existingOld = newInv.find(i => i.type === oldItem);
              if (existingOld) existingOld.count++;
              else newInv.push({ type: oldItem, count: 1 });
              addLog(`Swapped: ${ITEM_METADATA[oldItem].name} returned to bag.`);
          }
          const itemInBag = newInv.find(i => i.type === selectedInventoryItemType);
          if (itemInBag) { 
              itemInBag.count--; 
              if (itemInBag.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); 
          }
          setInventory(newInv); 
          saveLoadoutToFirestore(nextBoard, newInv); 
          setSelectedInventoryItemType(null); 
          audioManager.playLevelUp(); 
          addLog(`Equipped ${ITEM_METADATA[selectedInventoryItemType].name}`);
        }
      } else if (piece && piece.heldItem && (onlineStatus === 'disconnected' || piece.color === (localPlayerColor || 'white'))) {
          const removed = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null, phasedPiece: s.phasedPiece ? { ...s.phasedPiece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removed); if (item) item.count++; else nextInv.push({ type: removed, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); audioManager.playMove(); addLog(`Unequipped ${ITEM_METADATA[removed].name}`);
      }
      return;
    }
    if (isAwaitingRayTarget && selectedSquare) {
        const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
        const movingP = board[fR][fC].piece!;
        const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
        const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

        if ((row === fR || col === fC) && algebraic !== selectedSquare) {
            const type = isAwaitingRayTarget === 'glacial' ? 'glacial-ray' : 'burning-ray';
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type } })); setIsAwaitingRayTarget(null); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
                setLastMoveGlobal(newMoveInfo);
                addEffectCallback('magic-burst', selectedSquare!, undefined, undefined, movingP.heldItem as InventoryItemType);
                const result = applyMove(board, { from: selectedSquare!, to: algebraic, type }, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingRayTarget(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movingP.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
            }
        }
        return;
    }
    if (isSelectingTeleportAlly) { if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== (selectedSquare ? boardState[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.id : null)) { setTeleportAllyPieceId(piece.id); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(true); addLog("Select a shroom to teleport to!"); } return; }
    if (isSelectingTeleportShroom && sq?.item?.type === 'shroom') {
        const mage = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
        const newMoveInfo: LastMoveInfo = { type: mage.type, level: mage.level, item: mage.heldItem || null };
        const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

        const move: Move = { from: selectedSquare!, to: algebraic, type: 'tele-portobello', teleportPieceId: teleportAllyPieceId! };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
        else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); 
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false); setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsSelectingTeleportShroom(false); setTeleportAllyPieceId(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, 'myco_mage', nextTracks.white, nextTracks.black, nextTracks.global); }, 800); }
        return;
    }
    if (isSelectingSporeBombShroom && sq?.item?.type === 'shroom') {
        const mage = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
        const newMoveInfo: LastMoveInfo = { type: mage.type, level: mage.level, item: mage.heldItem || null };
        const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

        const move: Move = { from: selectedSquare!, to: algebraic, type: 'spore-bomb' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
        else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); 
            if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
            setLastMoveGlobal(newMoveInfo);
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false); setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsSelectingSporeBombShroom(false); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, 'myco_mage', nextTracks.white, nextTracks.black, nextTracks.global); }, 800); }
        return;
    }
    if (isAwaitingDanceTarget) {
        const dp = dancerToDance ? board[algebraicToCoords(dancerToDance).row][algebraicToCoords(dancerToDance).col].piece : null;
        if (!dancerToDance) { 
          if (piece && piece.color === currentPlayer && piece.type === 'dancer') { setDancerToDance(algebraic); }
          return; 
        }
        if (algebraic === dancerToDance) { setIsAwaitingDanceTarget(false); setDancerToDance(null); if (specialActionContext) triggerSpecialsChain(board, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, currentPlayer, specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false, lastMoveGlobal?.type, specialActionContext.trackWhite, specialActionContext.trackBlack, specialActionContext.trackGlobal); return; }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance); const isAdjacent = Math.abs(row - fr) <= 1 && Math.abs(col - fc) <= 1;
        const targetP = board[row][col].piece;
        const targetItem = board[row][col].item;
        const activeD = board[fr][fc].piece!;
        
        const dancerMoveInfo: LastMoveInfo = { type: activeD.type, level: activeD.level, item: activeD.heldItem || null };
        const nextTracks = {
            white: currentPlayer === 'white' ? dancerMoveInfo : specialActionContext!.trackWhite,
            black: currentPlayer === 'black' ? dancerMoveInfo : specialActionContext!.trackBlack,
            global: dancerMoveInfo
        };

        const dir = currentPlayer === 'white' ? -1 : 1;
        const isForward = (row === fr + dir) && (col === fc);
        if (isAdjacent && (targetP || (targetItem?.type === 'anvil' && dp?.heldItem === 'dancers_ribbon') || ((!targetItem || targetItem.type === 'shroom') && isForward))) {
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: dancerToDance, to: algebraic, type: 'dance-swap' } })); setIsAwaitingDanceTarget(false); setDancerToDance(null); }
            else {
                pushHistory(); 
                if (currentPlayer === 'white') setLastMoveWhite(dancerMoveInfo); else setLastMoveBlack(dancerMoveInfo);
                setLastMoveGlobal(dancerMoveInfo);

                let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const activeD_next = nextBoard[fr][fc].piece!; const tP = nextBoard[row][col].piece; const targetItem = nextBoard[row][col].item;
                if (targetItem?.type === 'shroom') { activeD_next.level = Math.min(activeD_next.type === 'queen' ? 7 : 99, (activeD_next.level || 1) + 1); nextBoard[row][col].item = null; }
                nextBoard[row][col].piece = activeD_next; nextBoard[fr][fc].piece = tP ? { ...tP, hasMoved: true } : null; nextBoard[fr][fc].item = targetItem?.type === 'shroom' ? null : targetItem;
                setBoard(nextBoard); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove(); 
                triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext.capturingPieceId, false, dancerMoveInfo.type, nextTracks.white, nextTracks.black, nextTracks.global);
            }
        }
        return;
    }
  if (isAwaitingPawnSacrifice && piece && FRONTLINE_TYPES.includes(piece.type) && piece.color === currentPlayer) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'pawn-sacrifice', payload: { square: algebraic } })); setIsAwaitingPawnSacrifice(false); }
      else { pushHistory(); let nextBoard = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))); const sacrificed = { ...nextBoard[row][col].piece! }; nextBoard[row][col].piece = null; 
        const nG = { white: Array.isArray(specialActionContext?.currentGraveyard.white) ? [...specialActionContext!.currentGraveyard.white] : [], black: Array.isArray(specialActionContext?.currentGraveyard.black) ? [...specialActionContext!.currentGraveyard.black] : [] }; 
        const targetPile = sacrificed.color; nG[targetPile] = [...nG[targetPile], sacrificed];
        setBoard(nextBoard); setCapturedPieces(nG); setIsAwaitingPawnSacrifice(false); triggerSpecialsChain(nextBoard, nG, specialActionContext?.currentKs || killStreaks, specialActionContext?.oldStreak || 0, specialActionContext?.oldStreak || 0, isExtraTurnFromQueenMove, specialActionContext?.newEnPassantTarget || null, currentPlayer, [], specialActionContext?.capturingPieceId || null, false, specialActionContext?.trackGlobal?.type || null, specialActionContext?.trackWhite || lastMoveWhite, specialActionContext?.trackBlack || lastMoveBlack, specialActionContext?.trackGlobal || lastMoveGlobal); }
      return;
  }
  if (isAwaitingCommanderPromotion && piece && piece.color === currentPlayer && FRONTLINE_TYPES.includes(piece.type) && piece.type !== 'commander' && piece.type !== 'infiltrator' && piece.level === 1) {
      pushHistory();
      const nxtB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
      nxtB[row][col].piece!.type = 'commander';
      setBoard(nxtB);
      setIsAwaitingCommanderPromotion(false);
      triggerSpecialsChain(nxtB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, [...(specialActionContext!.completedMilestones || []), 'firstBlood'], specialActionContext!.capturingPieceId, false, specialActionContext!.trackGlobal?.type || null, specialActionContext!.trackWhite, specialActionContext!.trackBlack, specialActionContext!.trackGlobal);
      return;
  }
  if ((isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget || isAwaitingWindScrollTarget || isAwaitingEarthquakeScrollTarget || isAwaitingOilSlickTarget) && !sq?.piece && !sq?.item) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: isAwaitingWindScrollTarget ? 'wind-scroll' : (isAwaitingAnvilScrollTarget ? 'summon-anvil' : (isAwaitingEarthquakeScrollTarget ? 'earthquake-scroll' : (isAwaitingOilSlickTarget ? 'oil-slick' : 'anvil-drop'))) } })); setIsAwaitingAnvilDrop(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingWindScrollTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setIsAwaitingOilSlickTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
      else { 
          pushHistory(); 

          let nextTracks = { white: lastMoveWhite, black: lastMoveBlack, global: lastMoveGlobal };
          let movedType: PieceType | null = specialActionContext?.trackGlobal?.type || null;

          if (isAwaitingAnvilScrollTarget || isAwaitingWindScrollTarget || isAwaitingEarthquakeScrollTarget || isAwaitingOilSlickTarget) {
              const movingP = board[algebraicToCoords(selectedSquare!).row][algebraicToCoords(selectedSquare!).col].piece!;
              const newMoveInfo: LastMoveInfo = { type: movingP.type, level: movingP.level, item: movingP.heldItem || null };
              nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
              if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
              setLastMoveGlobal(newMoveInfo);
              movedType = movingP.type;
              addEffectCallback('magic-burst', selectedSquare!, undefined, undefined, movingP.heldItem as InventoryItemType);
          }

          if (isAwaitingOilSlickTarget) { 
              setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); const res = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'oil-slick' }, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false); setBoard(res.newBoard); setTimeout(() => { setIsMoveProcessing(false); setIsAwaitingOilSlickTarget(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movedType, nextTracks.white, nextTracks.black, nextTracks.global); }, 800); 
          } else { 
              const moveType = isAwaitingWindScrollTarget ? 'wind-scroll' : (isAwaitingAnvilScrollTarget ? 'summon-anvil' : (isAwaitingEarthquakeScrollTarget ? 'earthquake-scroll' : 'move'));
              const contextBoard = (specialActionContext?.boardForNextStep || board);
              const nextBoard = contextBoard.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))); 
              
              if (isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget) {
                  nextBoard[row][col].item = { type: 'anvil' }; 
                  if (isAwaitingAnvilScrollTarget && selectedSquare) {
                      const {row: fr, col: fc} = algebraicToCoords(selectedSquare);
                      if (nextBoard[fr][fc].piece) nextBoard[fr][fc].piece!.heldItem = null;
                  }
              }

              if (isAwaitingWindScrollTarget || isAwaitingEarthquakeScrollTarget) {
                  const res = applyMove(board, { from: selectedSquare!, to: algebraic, type: moveType }, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                  setBoard(res.newBoard);
                  setTimeout(() => { setIsMoveProcessing(false); setIsAwaitingWindScrollTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movedType, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
                  return;
              }

              setBoard(nextBoard); 
              setTimeout(() => { addEffectCallback('poof', algebraic); audioManager.playAnvil(); }, 300);
              setIsAwaitingAnvilDrop(false); 
              setIsAwaitingAnvilScrollTarget(false);
              if (specialActionContext) {
                  triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false, movedType, nextTracks.white, nextTracks.black, nextTracks.global); 
              } else {
                  processMoveEnd(nextBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, movedType, nextTracks.white, nextTracks.black, nextTracks.global);
              }
          } 
      }
      return;
  }
  if (isAwaitingHolyShield && piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== specialActionContext?.capturingPieceId) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'holy-shield', square: algebraic })); setIsAwaitingHolyShield(false); }
      else { pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))); 
        const ally = nextB[row][col].piece!;
        ally.isShielded = true; 
        const rosaryArchbishop = nextB.flat().find(sq => sq.piece && sq.piece.color === currentPlayer && sq.piece.heldItem === 'rosary');
        if (rosaryArchbishop) {
            const oldAL = ally.level;
            ally.level = Math.min(ally.type === 'queen' ? 7 : 99, (ally.level || 1) + 1);
            if (ally.level > oldAL) addEffectCallback('level-change', algebraic, currentPlayer, 1, undefined);
        }
        setBoard(nextB); setIsAwaitingHolyShield(false); triggerSpecialsChain(nextB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false, specialActionContext!.trackGlobal?.type || null, specialActionContext!.trackWhite, specialActionContext!.trackBlack, specialActionContext!.trackGlobal); }
      return;
  }
  if (isAwaitingArcherSnipe) {
      const pArr = board.flat().filter(sq => sq.piece && sq.piece.color === currentPlayer).map(sq => sq.piece!);
      const snipers = pArr.filter(pt => { 
        if (pt.heldItem === 'weighted_helm') return false;
        if (pt.type === 'archer') return true; 
        if (pt.type === 'mimic') {
           let lastInfo = lastMoveGlobal;
           if (pt.heldItem === 'mirror_mask') lastInfo = currentPlayer === 'white' ? lastMoveBlack : lastMoveWhite;
           else if (pt.heldItem === 'mimic_blade') lastInfo = currentPlayer === 'white' ? lastMoveWhite : lastMoveBlack;
           if (lastInfo?.type === 'archer') return true;
        }
        const coords = board.flat().find(sq => sq.piece?.id === pt.id); 
        if ((pt.type === 'knight' || pt.type === 'mimic') && pt.heldItem === 'shortbow' && coords && getEffectiveLevel(board, coords.rowIndex, coords.colIndex) >= 3) return true; 
        return false; 
      });
      if (piece && piece.color !== currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.heldItem !== 'weighted_helm') {
          const resp = snipers.find(a => a.level >= piece.level);
          if (resp) {
              if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'archer-snipe', square: algebraic })); setIsAwaitingArcherSnipe(false); }
              else { pushHistory(); const nextB = specialActionContext?.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))); const sniped = { ...nextB[row][col].piece! }; nextB[row][col].piece = null; 
                const nG = { white: Array.isArray(specialActionContext?.currentGraveyard.white) ? [...specialActionContext!.currentGraveyard.white] : [], black: Array.isArray(specialActionContext?.currentGraveyard.black) ? [...specialActionContext!.currentGraveyard.black] : [] };
                const targetPile = sniped.color; nG[targetPile] = [...nG[targetPile], sniped]; setBoard(nextB); setCapturedPieces(nG); setIsAwaitingArcherSnipe(false); triggerSpecialsChain(nextB, nG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, [...(specialActionContext!.completedMilestones || []), 'snipe'], specialActionContext!.capturingPieceId, false, specialActionContext!.trackGlobal?.type || null, specialActionContext!.trackWhite, specialActionContext!.trackBlack, specialActionContext!.trackGlobal); }
          }
      }
      return;
  }
  if (selectedSquare) {
    const { row: fR, col: fC } = algebraicToCoords(selectedSquare); const moving = board[fR][fC].piece; 
    const canCommit = !isMoveProcessing && !gameInfo.gameOver && !gameOverRef.current && !isAiThinking && (onlineStatus !== 'connected' || localPlayerColor === currentPlayer) && !isAnySpecialModeActive;
    
    if (canCommit && moving && moving.color === currentPlayer) {
        const patternType = (moving.type === 'mimic' && lastMoveGlobal?.type && lastMoveGlobal.type !== 'mimic') ? lastMoveGlobal.type : moving.type;
        let effItem = moving.heldItem;
        if (moving.type === 'mimic') {
            if (moving.heldItem === 'mirror_mask') effItem = (moving.color === 'white' ? lastMoveBlack : lastMoveWhite)?.item || null;
            else if (moving.heldItem === 'mimic_blade') effItem = (moving.color === 'white' ? lastMoveWhite : lastMoveBlack)?.item || null;
        }

        if (selectedSquare === algebraic) {
           if (moving.type === 'myco_mage') { setIsSelectingMycoSpell(true); return; }
           
           if (moving.heldItem && (ITEM_METADATA[moving.heldItem].isConsumable || moving.heldItem === 'trap_net')) {
               const item = moving.heldItem;
               const level = getEffectiveLevel(board, fR, fC);
               if (silencedUnit) { addLog("Unit is silenced!"); return; }

               if (item === 'shield_scroll' && level < 2) { addLog("L2 required for Shield Scroll!"); return; }
               if (item === 'rally_scroll' && level < 3) { addLog("L3 required for Rally Scroll!"); return; }
               if (item === 'detonation_scroll' && level < 2) { addLog("L2 required for Detonation Scroll!"); return; }
               if (item === 'swap_scroll' && level < 3) { addLog("L3 required for Swap Scroll!"); return; }
               if (item === 'ice_scroll' && level < 2) { addLog("L2 required for Ice Scroll!"); return; }
               if (item === 'resurrection_scroll' && level < 4) { addLog("L4 required for Res. Scroll!"); return; }
               if (item === 'faith_scroll' && level < 5) { addLog("L5 required for Faith Scroll!"); return; }
               if (item === 'earthquake_scroll' && level < 3) { addLog("L3 required for Earthquake Scroll!"); return; }
               if (item === 'heavy_rain' && level < 3) { addLog("L3 required for Heavy Rain!"); return; }
               if (item === 'phase_out' && level < 2) { addLog("L2 required for Phase Out!"); return; }
               if (item === 'lose_faith_scroll' && level < 2) { addLog("L2 required for Lose Thy Faith!"); return; }
               if (item === 'kings_decree' && moving.type !== 'king') { addLog("King only!"); return; }

               const immediateItems = ['life_leach', 'antidote', 'ice_scroll', 'resurrection_scroll', 'faith_scroll', 'ice_blast', 'soul_harvest', 'demonic_possession', 'heavy_rain', 'lose_faith_scroll', 'phase_out', 'rally_scroll', 'trap_net'];
               if (immediateItems.includes(item)) {
                   let type = item.replace(/_/g, '-') as Move['type'];
                   if (item === 'lose_faith_scroll') type = 'lose-thy-faith';
                   if (item === 'phase_out') type = 'phase-out';
                   
                   const move: Move = { from: selectedSquare, to: selectedSquare, type };
                   const newMoveInfo: LastMoveInfo = { type: moving.type, level: moving.level, item: moving.heldItem || null };
                   const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

                   if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
                   else {
                       pushHistory(); setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
                       if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
                       setLastMoveGlobal(newMoveInfo);
                       addEffectCallback('magic-burst', selectedSquare, undefined, undefined, item);
                       const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                       setBoard(res.newBoard);
                       setTimeout(() => { setIsMoveProcessing(false); setSelectedSquare(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, moving.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
                   }
                   return;
               }

               if (item === 'detonation_scroll') {
                   const move: Move = { from: selectedSquare, to: selectedSquare, type: 'self-destruct' };
                   const newMoveInfo: LastMoveInfo = { type: moving.type, level: moving.level, item: moving.heldItem || null };
                   const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

                   if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
                   else {
                       pushHistory(); setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
                       if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
                       setLastMoveGlobal(newMoveInfo);
                       addEffectCallback('magic-burst', selectedSquare, undefined, undefined, item);
                       const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                       setBoard(res.newBoard); 
                       const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] };
                       if (res.selfDestructCaptures) res.selfDestructCaptures.forEach(vic => updatedG[vic.color].push(vic));
                       setCapturedPieces(updatedG);
                       setTimeout(() => { setIsMoveProcessing(false); setSelectedSquare(null); processMoveEnd(res.newBoard, updatedG, killStreaks, currentPlayer, false, null, false, moving.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
                   }
                   return;
               }

               if (item === 'wind_scroll') { setIsAwaitingWindScrollTarget(true); addLog("Wind Scroll: Select target square."); return; }
               if (item === 'summon_anvil') { setIsAwaitingAnvilScrollTarget(true); addLog("Anvil Scroll: Select square."); return; }
               if (item === 'shield_scroll') { setIsAwaitingShieldScrollTarget(true); addLog("Shield Scroll: Select ally."); return; }
               if (item === 'swap_scroll') { setIsAwaitingSwapScrollTarget(true); addLog("Swap Scroll: Select ally."); return; }
               if (item === 'kings_decree') { setIsAwaitingDecreeTarget(true); addLog("King's Decree: Select Pawn."); return; }
               if (item === 'earthquake_scroll') { setIsAwaitingEarthquakeScrollTarget(true); addLog("Earthquake: Select center."); return; }
               if (item === 'oil_slick') { setIsAwaitingOilSlickTarget(true); addLog("Oil Slick: Select area."); return; }
               if (item === 'glacial_ray') { setIsAwaitingRayTarget('glacial'); addLog("Glacial Ray: Select direction."); return; }
               if (item === 'burning_ray') { setIsAwaitingRayTarget('burning'); addLog("Burning Ray: Select direction."); return; }
           }

           if (!silencedUnit && (moving.type === 'knight' || moving.type === 'hero' || moving.type === 'archer') && getEffectiveLevel(board, fR, fC) >= 5) {
               const move: Move = { from: selectedSquare, to: selectedSquare, type: 'self-destruct' };
               const newMoveInfo: LastMoveInfo = { type: moving.type, level: moving.level, item: moving.heldItem || null };
               const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };

               if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
               else {
                   pushHistory(); setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
                   if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
                   setLastMoveGlobal(newMoveInfo);
                   addEffectCallback('magic-burst', selectedSquare, undefined, undefined, item);
                   const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
                   setBoard(res.newBoard);
                   const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] };
                   if (res.selfDestructCaptures) res.selfDestructCaptures.forEach(vic => updatedG[vic.color].push(vic));
                   setCapturedPieces(updatedG);
                   setTimeout(() => { setIsMoveProcessing(false); setSelectedSquare(null); processMoveEnd(res.newBoard, updatedG, killStreaks, currentPlayer, false, null, false, moving.type, nextTracks.white, nextTracks.black, nextTracks.global); }, 800);
               }
               return;
           }
        }

        const isGrappler = (patternType === 'grappler' || (moving.type === 'mimic' && lastMoveGlobal?.type === 'grappler')) && !silencedUnit;
        if (!isAnySpecialModeActive && isGrappler) {
            const tSq = board[row][col]; const tP = tSq.piece; const tA = tSq.item?.type === 'anvil' && effItem === 'power_glove';
            if ((tP && tP.type !== 'king') || tA) {
                if (possibleMoves.includes(algebraic)) {
                    setGrappledPieceSubject(tP ? { piece: { ...tP }, from: algebraic } : null); setGrappledItemSubject(tA ? { type: 'anvil', from: algebraic } : null); setIsAwaitingGrappleThrow(true);
                    const range = getEffectiveLevel(board, fR, fC); const throwT: AlgebraicSquare[] = [];
                    for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                        const dist = Math.max(Math.abs(tr-row), Math.abs(tc-col));
                        if (dist > 0 && dist <= range && (tr === row || tc === col || Math.abs(tr-row) === Math.abs(tc-col))) { if (!board[tr][tc].piece && !board[tr][tc].item) throwT.push(coordsToAlgebraic(tr, tc)); }
                    }
                    if (tP && tP.color !== currentPlayer) throwT.push(algebraic);
                    setPossibleMoves(throwT); addLog("Grappler: Select landing, or click enemy again to capture."); return;
                }
            }
        }
        const freshlyCalculated = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
        if (freshlyCalculated.includes(algebraic)) {
          const tP = board[row][col].piece; let mType: Move['type'] = 'move';
          if (tP && tP.color === moving.color) mType = 'swap';
          else if (algebraic === enPassantTargetSquare && FRONTLINE_TYPES.includes(patternType)) mType = 'enpassant';
          else if (moving.type === 'king' && Math.abs(col - fC) === 2) mType = 'castle';
          
          if ((patternType === 'rook' || patternType === 'palace') && effItem === 'battering_ram') {
              const dr = Math.sign(row - fR); const dc = Math.sign(col - fC);
              const nr = fR + dr; const nc = fC + dc;
              if (isValidSquare(nr, nc) && board[nr][nc].item?.type === 'anvil') mType = 'ram-push';
          }

          const newMoveInfo: LastMoveInfo = { type: moving.type, level: moving.level, item: moving.heldItem || null };
          const nextTracks = { white: currentPlayer === 'white' ? newMoveInfo : lastMoveWhite, black: currentPlayer === 'black' ? newMoveInfo : lastMoveBlack, global: newMoveInfo };
          if (onlineStatus === 'connected') { 
              wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: mType } })); 
              setSelectedSquare(null); setPossibleMoves([]); 
          } else {
              pushHistory(); clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]);
              if (currentPlayer === 'white') setLastMoveWhite(newMoveInfo); else setLastMoveBlack(newMoveInfo);
              setLastMoveGlobal(newMoveInfo);
              const applyRes = applyMove(board, { from: selectedSquare, to: algebraic, type: mType }, enPassantTargetSquare, capturedPieces, nextTracks.white, nextTracks.black, nextTracks.global, false);
              let nextB = applyRes.newBoard; 
              const updatedG = { white: Array.isArray(capturedPieces?.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces?.black) ? [...capturedPieces.black] : [] }; 
              
              if (applyRes.smokeBombEvent) {
                  addLog(`Smoke Bomb! ${applyRes.smokeBombEvent.piece.type} escaped to back rank!`);
                  addEffectCallback('poof', applyRes.smokeBombEvent.square);
              } else if (applyRes.capturedPiece) {
                  updatedG[applyRes.capturedPiece.color].push(applyRes.capturedPiece);
              }

              if (applyRes.glassShardTriggered) addLog("Glass Shard! Capturer is exhausted.");
              
              if (applyRes.selfDestructCaptures) applyRes.selfDestructCaptures.forEach(vic => updatedG[vic.color].push(vic));

              if (applyRes.stolenItem && user) {
                  const newInv = [...inventory];
                  const existing = newInv.find(i => i.type === applyRes.stolenItem);
                  if (existing) existing.count++;
                  else newInv.push({ type: applyRes.stolenItem, count: 1 });
                  setInventory(newInv);
                  saveLoadoutToFirestore(nextB, newInv);
                  addLog(`STOLEN: ${ITEM_METADATA[applyRes.stolenItem].name}!`);
              }

              setBoard(nextB); setCapturedPieces(updatedG);
              const streakGain = (applyRes.capturedPiece ? 1 : 0) + (applyRes.selfDestructCaptures?.length || 0) + (applyRes.obliteratedPieces?.length || 0) + (applyRes.smokeBombEvent ? 1 : 0);
              
              applyRes.levelChanges?.forEach(lc => {
                  addEffectCallback('level-change', lc.square, currentPlayer, lc.delta, undefined);
                  if (lc.reason) addLog(`${getPlayerDisplayName(currentPlayer)}: ${lc.reason} (${lc.delta > 0 ? '+' : ''}${lc.delta})`);
              });

              if (applyRes.shroomConsumed) addLog(`${getPlayerDisplayName(currentPlayer)} consumed a Shroom!`);
              if (applyRes.ralliedSquares) applyRes.ralliedSquares.forEach(sq => addEffectCallback('level-change', sq, currentPlayer, 1, undefined));
              if (applyRes.hydraSplitOccurred) { audioManager.playResurrect(); addLog("The Hydra regrows its heads!"); if (applyRes.hydraSpawnSquares) applyRes.hydraSpawnSquares.forEach(sq => addEffectCallback('level-change', sq, currentPlayer, 1, undefined)); }
              if (applyRes.phoenixResurrection) { addEffectCallback('light-beam', applyRes.phoenixResurrection.square); audioManager.playResurrect(); }
              if (applyRes.resurrectionScrollEvent) { addEffectCallback('light-beam', applyRes.resurrectionScrollEvent.square); audioManager.playResurrect(); }
              if (applyRes.signalHornEvent) { addLog(`Signal Horn! ${applyRes.signalHornEvent.piece.type} gains a level.`); }
              if (applyRes.anvilDroppedSquares) applyRes.anvilDroppedSquares.forEach(sq => { setTimeout(() => { addEffectCallback('poof', sq); audioManager.playAnvil(); }, 300); });
              let rookResResult: RookResurrectionResult | null = null;
              const wasCap = streakGain > 0;
              if ((moving.type === 'rook' || moving.type === 'palace') && wasCap) {
                  const resRes = processRookResurrectionCheck(nextB, currentPlayer, {from: selectedSquare, to: algebraic, type: mType}, algebraic, moving.level, updatedG, uniqueIdCounterRef.current);
                  if (resRes.resurrectionPerformed) {
                      nextB = resRes.boardWithResurrection; updatedG.white = resRes.capturedPiecesAfterResurrection.white; updatedG.black = resRes.capturedPiecesAfterResurrection.black; uniqueIdCounterRef.current = resRes.newResurrectionIdCounter!; rookResResult = resRes;
                      addEffectCallback('light-beam', resRes.resurrectedSquareAlg!); audioManager.playResurrect(); addLog(`Resurrection! ${resRes.resurrectedPieceData?.type} has returned.`);
                  }
              }
              setBoard(nextB); setCapturedPieces(updatedG);
              setTimeout(() => {
                  setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return;
                  if (applyRes.infiltrationWin) {
                      const msg = `INFILTRATION WIN! ${getPlayerDisplayName(currentPlayer)} has breached the back rank!`;
                      setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, isThreefoldRepetitionDraw: false, gameOver: true, winner: currentPlayer, isInfiltrationWin: true });
                      addLog(msg); gameOverRef.current = true; playOutcomeSound(currentPlayer); 
                      handleGameEndCleanup(currentPlayer);
                      return;
                  }
                  const oS = killStreaks[currentPlayer]; const nS = wasCap ? oS + streakGain : 0; const updatedKs = { ...killStreaks, [currentPlayer]: nS }; const isExtra = applyRes.extraTurn || (oS < 6 && nS >= 6); const q = applyRes.multiPromotions || []; const oppBackRank = currentPlayer === 'white' ? 0 : 7;
                  if (FRONTLINE_TYPES.includes(nextB[row][col].piece?.type || '') && row === oppBackRank) q.push({ square: algebraic, targetLevel: getPromotionLevel(applyRes.capturedPiece?.type || null) });
                  if (rookResResult?.promotionRequiredForResurrectedPawn) q.push({ square: rookResResult.resurrectedSquareAlg!, targetLevel: 1 });
                  if (q.length > 0) { 
                      setPromotionQueue(q); setPlayerToPromote(currentPlayer); setIsPromotingPawn(true); setPromotionSquare(q[0].square); setPromotionTargetLevel(q[0].targetLevel);
                      setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: applyRes.enPassantTargetSet, oldStreak: oS, newStreak: nS, currentGraveyard: updatedG, currentKs: updatedKs, capturingPieceId: nextB[row][col].piece?.id || null, trackWhite: nextTracks.white, trackBlack: nextTracks.black, trackGlobal: nextTracks.global } as any); 
                  } else { triggerSpecialsChain(nextB, updatedG, updatedKs, oS, nS, isExtra, applyRes.enPassantTargetSet, currentPlayer, [], nextB[row][col].piece?.id || null, wasCap, moving.type, nextTracks.white, nextTracks.black, nextTracks.global); }
              }, 800);
          }
          return;
        }
    }
  }
  if (piece && piece.color === currentPlayer && (!localPlayerColor || piece.color === localPlayerColor)) { 
    setClickedEnemySquare(null); setEnemySelectedSquare(null); setEnemyPossibleMoves([]); setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal)); 
  } else if (piece && piece.color !== currentPlayer && !isAnySpecialModeActive) {
    setSelectedSquare(null); setPossibleMoves([]); const moves = getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal); setClickedEnemySquare(algebraic); setEnemySelectedSquare(algebraic); setEnemyPossibleMoves(moves);
  } else { 
    setSelectedSquare(null); setPossibleMoves([]); setClickedEnemySquare(null); setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }
}, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, boardForPostSacrifice, specialActionContext, isExtraTurnFromQueenMove, isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, addLog, handlePieceHover, processPawnSacrificeCheck, triggerSpecialsChain, processMoveEnd, lastMoveWhite, lastMoveBlack, lastMoveGlobal, addEffectCallback, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, teleportAllyPieceId, isMoveProcessing, gameInfo.gameOver, isAiThinking, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, playerToDropAnvil, pushHistory, saveLoadoutToFirestore, getPlayerDisplayName, isAnySpecialModeActive, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, grappledPieceSubject, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingRayTarget, playerToPromote, grappledItemSubject, isAwaitingOilSlickTarget, didCaptureLastTurn, positionHistory, promotionQueue, clickedEnemySquare, playOutcomeSound, isAwaitingAnvilScrollTarget, isAwaitingWindScrollTarget, isAwaitingEarthquakeScrollTarget, user, handleGameEndCleanup, initialSnapshot, userData, toast]);

  const fullGameReset = () => {
    const unlocks = userData?.unlockedPieces || []; const uElo = userData?.eloRating || 1200; let initial = initializeBoard(uElo, uElo, unlocks, unlocks);
    if (userData?.equipment || userData?.blackEquipment) { 
        initial = initial.map(row => row.map(sq => { 
            if (sq.piece) {
                const equipment = sq.piece.color === 'white' ? userData.equipment : userData.blackEquipment;
                if (equipment && equipment[sq.piece.id]) { 
                    return { ...sq, piece: { ...sq.piece, heldItem: equipment[sq.piece.id] as InventoryItemType } }; 
                }
            }
            return sq; 
        })); 
    }
    setBoard(initial); if (userData?.inventory) setInventory(userData.inventory);
    setCurrentPlayer('white'); setBoardOrientation('white'); setGameInfo({ ...initialGameStatus }); setCapturedPieces({ white: [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setHistoryStack([]); setPositionHistory([]); setSelectedSquare(null); setPossibleMoves([]); setLastMoveFrom(null); setLastMoveTo(null); setLastMoveWhite(null); setLastMoveBlack(null); setLastMoveGlobal(null); setGameMoveCounter(0); setEnPassantTargetSquare(null); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setShowLossScreen(false); setShowWinScreen(false); audioManager.playStart();
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setSpecialActionContext(null); setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingShieldScrollTarget(false); setIsAwaitingSwapScrollTarget(false); setIsAwaitingDecreeTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setIsSelectingMycoSpell(false); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(false); setIsSelectingSporeBombShroom(false); setIsAwaitingRayTarget(null); setIsAiThinking(false); setIsWhiteAI(false); setIsBlackAI(false); gameOverRef.current = false; addLog("Game Reset."); aiInstanceRef.current = new VibeChessAI(aiDifficulty);
    setClickedEnemySquare(null); setEnemySelectedSquare(null); setEnemyPossibleMoves([]); setEloInfo(null); setIsGameSummaryOpen(false);
    setInitialSnapshot(null);
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
        case 'room-created': setRoomId(d.roomId); setLocalPlayerColor(d.color); setBoard(d.gameState.board); setGamePlayers(d.gameState.players); setOnlineStatus('waiting'); break;
        case 'room-joined': setRoomId(d.roomId); setLocalPlayerColor(d.color); setBoard(d.gameState.board); setGamePlayers(d.gameState.players); setOnlineStatus('connected'); break;
        case 'player-joined': setOnlineStatus('connected'); setBoard(d.gameState.board); setGamePlayers(d.gameState.players); addLog("A challenger has entered!"); break;
        case 'game-move': {
            const { gameState: nextGs, move: remoteMove, events: remoteEvents } = d;
            if (remoteMove) { 
              setLastMoveFrom(remoteMove.from); setLastMoveTo(remoteMove.to); setAnimatedSquareTo(remoteMove.to); setIsMoveProcessing(true); 
              const actingColor = nextGs.currentPlayer === 'white' ? 'black' : 'white';
              const moveInfo: LastMoveInfo = { type: remoteEvents?.movedType || 'pawn', item: remoteEvents?.movedItem || null, level: remoteEvents?.movedLevel || 1 };
              if (actingColor === 'white') setLastMoveWhite(moveInfo); else setLastMoveBlack(moveInfo);
              setLastMoveGlobal(moveInfo);
            }
            setBoard(nextGs.board); setCurrentPlayer(nextGs.currentPlayer); setEnPassantTargetSquare(nextGs.enPassantTargetSquare); setKillStreaks(nextGs.killStreaks); setCapturedPieces(nextGs.capturedPieces);
            
            // Sync shroom state from server
            setShroomSpawnCounter(nextGs.shroomSpawnCounter);
            setNextShroomSpawnTurn(nextGs.nextShroomSpawnTurn);

            if (remoteEvents && remoteMove) {
                const actingColor = nextGs.currentPlayer === 'white' ? 'black' : 'white';
                if (remoteEvents.captured) { audioManager.playCapture(); addEffectCallback('poof', remoteMove.to); addLog(`${getPlayerDisplayName(actingColor)} captured a ${remoteEvents.capturedType}!`); }
                if (remoteEvents.obliterated) { audioManager.playObliterate(); addEffectCallback('poof', remoteMove.to); addLog(`${getPlayerDisplayName(actingColor)}'s unit was OBLITERATED!`); }
                if (remoteEvents.shroom) { audioManager.playShroom(); addLog(`${getPlayerDisplayName(actingColor)} consumed a Shroom!`); }
                if (remoteEvents.hero) { audioManager.playLevelUp(); addLog(`${getPlayerDisplayName(actingColor)} Hero Ascended!`); }
                if (remoteEvents.rally) { audioManager.playRally(); addEffectCallback('shockwave', remoteEvents.rallyPos, actingColor); }
                if (remoteEvents.conversions?.length > 0) { audioManager.playConversion(); remoteEvents.conversions.forEach((pos: AlgebraicSquare) => { addEffectCallback('conversion', pos); }); }
                if (remoteEvents.reflection) { audioManager.playCapture(); addEffectCallback('poof', remoteMove.to); addLog("Attack reflected by Mirror Shield!"); }
                if (remoteEvents.ralliedSquares?.length > 0) { remoteEvents.ralliedSquares.forEach((pos: AlgebraicSquare) => { addEffectCallback('level-change', pos, actingColor, 1, undefined); }); }
                if (remoteEvents.anvilDrop) { setTimeout(() => { audioManager.playAnvil(); addEffectCallback('poof', remoteEvents.dropPos); }, 300); addLog(`${getPlayerDisplayName(actingColor)} dropped an Anvil!`); }
                if (remoteEvents.shield) { audioManager.playShield(); addLog(`${getPlayerDisplayName(actingColor)} applied a Holy Shield!`); }
                if (remoteEvents.snipe) { audioManager.playSnipe(); addLog(`${getPlayerDisplayName(actingColor)} Snipe triggered!`); }
                if (remoteEvents.resurrection && remoteEvents.resPos) { audioManager.playResurrect(); addEffectCallback('light-beam', remoteEvents.resPos); addLog(`${getPlayerDisplayName(actingColor)} triggered Resurrection Call!`); }
                if (remoteEvents.hydraSplit) { audioManager.playResurrect(); addLog("The Hydra regrows its heads!"); if (remoteEvents.hydraSpawnSquares) remoteEvents.hydraSpawnSquares.forEach((pos: AlgebraicSquare) => addEffectCallback('light-beam', pos)); }
                if (remoteEvents.resScroll) { audioManager.playResurrect(); addEffectCallback('light-beam', remoteEvents.resScrollPos); }
                if (remoteEvents.stolen) { addLog(`Opponent STOLE: ${ITEM_METADATA[remoteEvents.stolenItem as InventoryItemType].name}!`); }
                if (remoteEvents.smokeBomb && remoteEvents.smokePos) { audioManager.playResurrect(); addEffectCallback('poof', remoteEvents.smokePos); addLog(`${getPlayerDisplayName(actingColor)}'s unit escaped via Smoke Bomb!`); }
                if (remoteEvents.glassShard) { addLog("Glass Shard! Capturer is exhausted."); }
                if (remoteEvents.signal_horn) { addLog(`Signal Horn! ${remoteEvents.signalHornTargetType} gains a level.`); }
                if (remoteEvents.soulLink) { addLog(`Soul Link! ${remoteEvents.soulLinkCount} bound units collapsed.`); }
                if (remoteEvents.shroomSpawned) { audioManager.playShroom(); addLog("A mystical Shroom 🍄 has appeared!"); }
                
                remoteEvents.levelChanges?.forEach((lc: any) => {
                    addEffectCallback('level-change', lc.square, actingColor, lc.delta, undefined);
                    if (lc.reason) addLog(`${getPlayerDisplayName(actingColor)}: ${lc.reason} (${lc.delta > 0 ? '+' : ''}${lc.delta})`);
                });

                const isCheck = isKingInCheck(nextGs.board, nextGs.currentPlayer, nextGs.enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
                if (isCheck) { audioManager.playCheck(); addLog("Check!"); setGameInfo(prev => ({ ...prev, isCheck: true, playerWithKingInCheck: nextGs.currentPlayer })); }
                else { setGameInfo(prev => ({ ...prev, isCheck: false, playerWithKingInCheck: null })); }
            } else if (!remoteEvents) { audioManager.playMove(); }
            setTimeout(() => { setIsMoveProcessing(false); setAnimatedSquareTo(null); }, 800);
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
            gameOverRef.current = true; playOutcomeSound(d.winner);
            
            if (d.eloInfo) setEloInfo(d.eloInfo);
            if (d.goldEarned && user && d.goldEarned[user.uid]) {
                addLog(`You earned ${d.goldEarned[user.uid]} Gold!`);
                if (firestore) {
                    const userRef = doc(firestore, 'users', user.uid);
                    updateDocumentNonBlocking(userRef, { goldBalance: increment(d.goldEarned[user.uid]) });
                }
            }
            setIsGameSummaryOpen(true);
            handleGameEndCleanup(d.winner);
            break;
      }
    };
    ws.onclose = () => { setOnlineStatus('disconnected'); };
    wsRef.current = ws;
  }, [addLog, getPlayerDisplayName, addEffectCallback, playOutcomeSound, lastMoveWhite, lastMoveBlack, lastMoveGlobal, user, inventory, saveLoadoutToFirestore, localPlayerColor, firestore, handleGameEndCleanup, eloInfo, roomId, toast]);

  const handleOnlinePlay = useCallback((action: 'create' | 'join') => {
    if (!user) return;
    initWebSocket(() => {
        const eq: Record<string, string> = {}; 
        // Always use White Equipment loadout for Online Play
        if (userData?.equipment) Object.assign(eq, userData.equipment);
        
        if (action === 'create') { wsRef.current?.send(JSON.stringify({ type: 'create-room', user: { userId: user.uid, username: userData?.username || user.displayName || 'Host', elo: userData?.eloRating || 1200, wins: userData?.unlockedPieces || [], equipment: eq, unlockedPieces: userData?.unlockedPieces || [] } })); } 
        else { wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: inputRoomId, color: action === 'join' ? (localPlayerColor || 'black') : 'black', user: { userId: user.uid, username: userData?.username || user.displayName || 'Guest', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment: eq, unlockedPieces: userData?.unlockedPieces || [] } })); }
    });
  }, [user, userData, inputRoomId, localPlayerColor, initWebSocket]);

  const handleRankedPlay = useCallback(() => {
    if (!user) return;
    initWebSocket(() => {
        const eq: Record<string, string> = {}; 
        if (userData?.equipment) Object.assign(eq, userData.equipment);
        wsRef.current?.send(JSON.stringify({ type: 'join-ranked-queue', userId: user.uid, username: userData?.username || 'Player', elo: userData?.eloRating || 1200, equipment: eq }));
    });
  }, [user, userData, initWebSocket]);

  useEffect(() => {
    const roomIdFromUrl = searchParams.get('roomId');
    if (roomIdFromUrl && user && onlineStatus === 'disconnected' && !isMoveProcessing) {
        setInputRoomId(roomIdFromUrl);
        setTimeout(() => {
            initWebSocket(() => {
                const eq: Record<string, string> = {}; 
                if (userData?.equipment) Object.assign(eq, userData.equipment);
                wsRef.current?.send(JSON.stringify({ 
                    type: 'join-room', 
                    roomId: roomIdFromUrl, 
                    user: { userId: user.uid, username: userData?.username || user.displayName || 'Player', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment: eq, unlockedPieces: userData?.unlockedPieces || [] } 
                }));
            });
        }, 100);
    }
  }, [searchParams, user, onlineStatus, isMoveProcessing, userData, initWebSocket]);

  useEffect(() => {
    if (!isUserLoading) {
      const currentUid = user?.uid || 'guest';
      if (lastInitializedUid.current !== currentUid) {
        lastInitializedUid.current = currentUid;
        fullGameReset();
      }
    }
  }, [isUserLoading, user, aiDifficulty, userData]);

  useEffect(() => {
    const isAiT = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isAiT && onlineStatus === 'disconnected' && !gameInfo.gameOver && !gameOverRef.current && !isMoveProcessing && !isAnySpecialModeActive && !isAiThinking) {
      const timer = setTimeout(performAiMove, 1000); return () => clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, onlineStatus, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, isAiThinking, gameMoveCounter, performAiMove]);

  const isLootBagDisabled = useMemo(() => {
    if (!user) return true;
    if (isTournamentIntermission) return false;
    if (onlineStatus !== 'disconnected') return true;
    // In casual mode, allow looting during setup only
    if (gameMoveCounter > 0) return true;
    return false;
  }, [user, isTournamentIntermission, onlineStatus, gameMoveCounter]);

  const mobileLayout = useMemo(() => (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0 pb-0.5">
        <div className="w-full flex items-center justify-between">
          <div className="w-1/3"></div>
          <div className="w-1/3 flex items-center justify-center"> 
            <div className="flex items-center gap-1.5 shrink-0"> 
               <div className={cn(headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
                  {headerIconsActive && (
                    <div className="h-5 w-5 shrink-0 animate-anvil-impact">
                      <PixelAnvil className="w-full h-full text-[#94A3B8] ascii-shader" />
                    </div>
                  )}
               </div>
               <VibeChessTitle className="h-8 w-auto" suffix="-mob" /> 
               <div className={cn(headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
                  {headerIconsActive && (
                    <div className="h-5 w-5 shrink-0 animate-shroom-spring">
                      <ShroomIcon className="w-full h-full text-[#EF4444] ascii-shader" />
                    </div>
                  )}
               </div>
            </div> 
          </div>
          <div className="w-1/3 flex justify-end"> <AuthWidget /> </div>
        </div>
        <div className={cn("text-center text-[0.6rem] font-bold min-h-[0.75rem] uppercase w-full", (gameInfo.isCheck || isTournamentIntermission) && !gameInfo.gameOver && "text-primary animate-pulse")}> {statusMessage} </div>
        <div className="w-full">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : (isAwaitingRayTarget ? selectedSquare : null))) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} lastMoveWhite={lastMoveWhite} lastMoveBlack={lastMoveBlack} lastMoveGlobal={lastMoveGlobal} />
        </div>
        <div className="flex-grow w-full mt-0.5">
           <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} board={board} />
        </div>
        <div className="flex flex-nowrap justify-center items-end gap-x-2 gap-y-1 mt-1 w-full px-1">
          <button onClick={() => setIsRulesDialogOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
             <PixelTome className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Rules</span>
          </button>
          <button onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={isLootBagDisabled} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30">
             <PixelSack className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Loot</span>
          </button>
          <button onClick={() => setIsRoyalStoreOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30" disabled={!user}>
             <PixelStall className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Store</span>
          </button>
          <button onClick={() => router.push('/leaderboard')} className="flex flex-col items-center gap-0.5 group">
             <PixelTrophy className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Leaders</span>
          </button>
          <button onClick={() => { if(user) router.push('/dungeon'); }} className={cn(!user && "pointer-events-none opacity-30", "flex flex-col items-center gap-0.5 group")}>
             <PixelSwords className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Dungeon</span>
          </button>
          <button onClick={() => setIsResetConfirmOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
             <PixelReset className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
             <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Reset</span>
          </button>
          {onlineStatus === 'disconnected' && (
            <button onClick={handleUndo} disabled={historyStack.length === 0} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30">
               <PixelUndoIcon className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
               <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Undo</span>
            </button>
          )}
        </div>
        <div className="flex justify-center items-end gap-x-2 gap-y-1 mt-1 w-full pt-1">
            <button onClick={() => setIsWhiteAI(!isWhiteAI)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group" disabled={onlineStatus !== 'disconnected'}>
               <PixelRobotHead className="h-10 w-10 text-foreground ascii-shader transition-transform group-hover:scale-110" />
               <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">W-AI:{isWhiteAI ? 'ON' : 'OFF'}</span>
            </button>
            <button onClick={() => setIsBlackAI(!isBlackAI)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group" disabled={onlineStatus !== 'disconnected'}>
               <PixelRobotHead className="h-10 w-10 text-secondary ascii-shader transition-transform group-hover:scale-110" />
               <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">B-AI:{isBlackAI ? 'ON' : 'OFF'}</span>
            </button>
            <button onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
               <PixelMonitor className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
               <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">View</span>
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
                  <PixelGear className="h-10 w-10 ascii-shader transition-transform group-hover:scale-110" />
                  <span className="text-[0.4rem] font-pixel uppercase tracking-tighter">Settings</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><PixelGear className="h-4 w-4 text-primary ascii-shader" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><PixelMonitor className="h-4 w-4 text-primary ascii-shader" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent>
            </Popover>
        </div>
        <Card className="w-full mt-1 bg-black/40 border-none shadow-none"> <CardContent className="p-1 flex flex-col gap-1"> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={() => setIsArenaConfirmOpen(true)} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><PixelTrophy className="mr-1 h-3 w-3 ascii-shader" />Arena <span className="text-yellow-500 ml-1">100g</span> <Coins className="h-3 w-3 text-yellow-500" /> ({tournamentQueueCount}/8)</Button> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><PixelTrophy className="mr-1 h-3 w-3 ascii-shader" />Ranked Match</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><Globe className="mr-1 h-3 w-3" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-6 px-1.5 text-[0.65rem] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-6 px-1.5 text-[0.65rem]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-1 items-center"> <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-6 px-1.5 text-[0.65rem] w-full"><Link2Off className="mr-1 h-3 w-3" /> Disconnect</Button> </div> )} <div className="w-full text-center h-3 text-[0.65rem] text-muted-foreground uppercase font-pixel tracking-tighter">{onlineStatus}</div> </CardContent> </Card>
      </div>
    </div>
  ), [statusMessage, board, selectedSquare, possibleMoves, enemySelectedSquare, enemyPossibleMoves, handleSquareClick, boardOrientation, currentPlayer, isMoveProcessing, gameInfo.gameOver, isAiThinking, localPlayerColor, enPassantTargetSquare, handlePieceHover, effects, promotionSquare, isAwaitingAnvilDrop, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget, lastMoveWhite, lastMoveBlack, lastMoveGlobal, capturedPieces, killStreaks, pieceForInfoDisplay, getPlayerDisplayName, onlineStatus, turnTimer, isRulesDialogOpen, userData, user, volume, aiDifficulty, isWhiteAI, isBlackAI, viewMode, tournamentQueueCount, handleOnlinePlay, handleRankedPlay, inputRoomId, roomId, socialOnlineStatus, handleUsePortalScroll, gameMoveCounter, isLootBagDisabled, isTournamentIntermission, headerIconsActive, headerIconsOpacity, router, attunementSlots]);

  const desktopLayout = useMemo(() => (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0"> <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} board={board} /> </div>
      <div className="w-1/2 flex flex-col items-center gap-0.5"> 
        <div className="w-full flex items-center justify-center gap-6"> 
           <div className={cn(headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
              {headerIconsActive && (
                <div className="h-10 w-10 shrink-0 animate-anvil-impact">
                  <PixelAnvil className="w-full h-full text-[#94A3B8] ascii-shader" />
                </div>
              )}
           </div>
           <VibeChessTitle className="h-16 w-auto ascii-shader" suffix="-desk" /> 
           <div className={cn(headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
              {headerIconsActive && (
                <div className="h-10 w-10 shrink-0 animate-shroom-spring">
                  <ShroomIcon className="w-full h-full text-[#EF4444] ascii-shader" />
                </div>
              )}
           </div>
        </div> 
        <div className={cn("text-center text-[0.8rem] font-bold min-h-[1.5rem] uppercase w-full", (gameInfo.isCheck || isTournamentIntermission) && !gameInfo.gameOver && "text-primary animate-pulse")}> {statusMessage} </div>
        <div className="w-full"> <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : (isAwaitingRayTarget ? selectedSquare : null))) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} lastMoveWhite={lastMoveWhite} lastMoveBlack={lastMoveBlack} lastMoveGlobal={lastMoveGlobal} /> </div> 
      </div>
      <div className="w-1/4 flex flex-col gap-1.5"> 
         <AuthWidget /> 
         <Card className="bg-black/40 border-none shadow-none"> 
           <CardContent className="p-1 flex flex-col gap-2"> 
             <div className="flex flex-wrap justify-center items-end gap-x-5 gap-y-1 pb-1">
                <button onClick={() => setIsRulesDialogOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
                   <PixelTome className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Rules</span>
                </button>
                <button onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={isLootBagDisabled} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30">
                   <PixelSack className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Loot</span>
                </button>
                <button onClick={() => setIsRoyalStoreOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30" disabled={!user}>
                   <PixelStall className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Store</span>
                </button>
                <button onClick={() => router.push('/leaderboard')} className="flex flex-col items-center gap-0.5 group">
                   <PixelTrophy className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Leaders</span>
                </button>
                <button onClick={() => { if(user) router.push('/dungeon'); }} className={cn(!user && "pointer-events-none opacity-30", "flex flex-col items-center gap-0.5 group")}>
                   <PixelSwords className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Dungeon</span>
                </button>
                <button onClick={() => setIsResetConfirmOpen(true)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
                   <PixelReset className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Reset</span>
                </button>
                {onlineStatus === 'disconnected' && (
                  <button onClick={handleUndo} disabled={historyStack.length === 0} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30">
                     <PixelUndoIcon className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                     <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Undo</span>
                  </button>
                )}
             </div>
             <div className="flex flex-wrap justify-center items-end gap-x-5 gap-y-1 pt-1 border-t border-border/20">
                <button onClick={() => setIsWhiteAI(!isWhiteAI)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30" disabled={onlineStatus !== 'disconnected'}>
                   <PixelRobotHead className="h-12 w-12 text-foreground ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">W-AI:{isWhiteAI ? 'ON' : 'OFF'}</span>
                </button>
                <button onClick={() => setIsBlackAI(!isBlackAI)} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group disabled:opacity-30" disabled={onlineStatus !== 'disconnected'}>
                   <PixelRobotHead className="h-12 w-12 text-secondary ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">B-AI:{isBlackAI ? 'ON' : 'OFF'}</span>
                </button>
                <button onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
                   <PixelMonitor className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                   <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Camera</span>
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex flex-col items-center gap-0.5 h-auto p-0 bg-transparent border-none outline-none group">
                      <PixelGear className="h-12 w-12 ascii-shader transition-transform group-hover:scale-110" />
                      <span className="text-[0.45rem] font-pixel uppercase tracking-tighter">Settings</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><PixelGear className="h-4 w-4 text-primary ascii-shader" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><PixelMonitor className="h-4 w-4 text-primary ascii-shader" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent>
                </Popover>
             </div>
             {onlineStatus === 'disconnected' ? ( 
               <div className="flex flex-col gap-1.5 items-center border-t border-border/20 pt-1.5"> 
                 <Button variant="outline" size="sm" onClick={() => setIsArenaConfirmOpen(true)} disabled={!user} className="h-8 px-2 text-[0.65rem] w-full"><PixelTrophy className="mr-1 h-3 w-3 ascii-shader" />Arena Entry <span className="text-yellow-500 ml-1">100g</span></Button> 
                 <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user} className="h-8 px-2 text-[0.65rem] w-full">Ranked Matchmaking</Button> 
                 <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-8 px-2 text-[0.65rem] w-full">Create Private Room</Button> 
                 <div className="flex gap-1 items-center w-full"> 
                   <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-8 px-2 text-[0.65rem] flex-grow" /> 
                   <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-8 px-2 text-[0.65rem]">Join</Button> 
                 </div> 
               </div> 
             ) : ( 
               <div className="flex flex-col gap-1.5 items-center border-t border-border/20 pt-1.5"> 
                 <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> 
                   <span>Room: {roomId || inputRoomId}</span> 
                   <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> 
                 </div> 
                 <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-8 px-2 text-[0.65rem] w-full">Terminate Connection</Button> 
               </div> 
             )} 
             <div className="w-full text-center h-4 text-[0.55rem] mt-0 text-muted-foreground uppercase font-pixel tracking-widest">{onlineStatus}</div> 
           </CardContent> 
         </Card> 
      </div>
    </div>
  ), [statusMessage, board, selectedSquare, possibleMoves, enemySelectedSquare, enemyPossibleMoves, handleSquareClick, boardOrientation, currentPlayer, isMoveProcessing, isAiThinking, localPlayerColor, enPassantTargetSquare, handlePieceHover, effects, promotionQueue, isAwaitingAnvilDrop, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, user, volume, aiDifficulty, isWhiteAI, isBlackAI, tournamentQueueCount, handleOnlinePlay, handleRankedPlay, inputRoomId, roomId, socialOnlineStatus, handleUsePortalScroll, gameMoveCounter, isLootBagDisabled, isTournamentIntermission, headerIconsActive, headerIconsOpacity, turnTimer, capturedPieces, killStreaks, pieceForInfoDisplay, getPlayerDisplayName, onlineStatus, isAnySpecialModeActive, dancerToDance, isAwaitingRayTarget, gameInfo.gameOver, gameInfo.isCheck, lastMoveWhite, lastMoveBlack, lastMoveGlobal, router, initialSnapshot, userData, attunementSlots]);

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
        <AlertDialogContent className="font-pixel bg-black border-2 border-primary"> 
          <AlertDialogHeader> 
            <AlertDialogTitle className="text-primary uppercase text-[0.75rem]">Reset Game?</AlertDialogTitle>
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
            <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed"> Joining the Arena battle queue costs <span className="text-yellow-500">100 Gold</span>. Are you sure you want to proceed? </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <Accordion type="single" collapsible className="w-full mb-2">
              <AccordionItem value="entry-fee" className="border-border/30">
                <AccordionTrigger className="text-[0.6rem] uppercase py-2">View Queue Details</AccordionTrigger>
                <AccordionContent className="text-[0.55rem] text-muted-foreground uppercase leading-tight"> Arena battles use your current Elo and Equipment. Matches are 8-player bracketed tournaments. </AccordionContent>
              </AccordionItem>
            </Accordion>
            <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 text-[0.6rem] uppercase bg-primary text-primary-foreground" onClick={() => { setIsArenaConfirmOpen(false); joinTournamentQueue(); }}> Pay 100g & Join </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent> 
      </AlertDialog>
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
      <RoyalStore isOpen={isRoyalStoreOpen} onOpenChange={setIsRoyalStoreOpen} />
      <GameSummaryDialog isOpen={isGameSummaryOpen} onClose={() => setIsGameSummaryOpen(false)} winner={gameInfo.winner} winnerName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'white' : 'black')} loserName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'black' : 'white')} eloInfo={eloInfo} moveCount={gameMoveCounter} onReset={fullGameReset} />
    </div>
  );
}
