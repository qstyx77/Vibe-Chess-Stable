
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
  lastMovedPieceHeldItem?: InventoryItemType | null
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
    lastMovedPieceType: lastMovedPieceType,
    lastMovedPieceHeldItem: lastMovedPieceHeldItem
  };
}

export default function EvolvingChessPage() {
  const { user, userData, isUserLoading } = useUser();
  const { addLog, onlineStatus: socialOnlineStatus, sendMessage: sendSocialMessage, isMessengerOpen, setIsMessengerOpen, joinTournamentQueue, tournamentQueueCount } = useSocial();
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

  const isAnySpecialModeActive = isAwaitingPawnSacrifice || isAwaitingCommanderPromotion || isAwaitingHolyShield || isAwaitingAnvilDrop || isAwaitingArcherSnipe || isPromotingPawn || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingDecreeTarget || isAwaitingDanceTarget || isAwaitingDanceTarget || isAwaitingGrappleThrow || isAwaitingEarthquakeScrollTarget || isSelectingMycoSpell || isSelectingTeleportAlly || isSelectingTeleportShroom || isSelectingSporeBombShroom;

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const aiInstanceRef = useRef<VibeChessAI | null>(null);
  const clickGuardRef = useRef(false);
  const uniqueIdCounterRef = useRef(20000);
  const gameOverRef = useRef(false);
  const hasInitializedSession = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const addEffectCallback = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number, itemType?: InventoryItemType) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value, itemType }]);
    setTimeout(() => { setEffects(current => current.filter(e => e.id !== id)); }, 1500);
  }, []);

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

  const handlePieceHover = useCallback((piece: Piece | null) => { setPieceForInfoDisplay(piece); }, []);

  const sendSocialMessageWrapper = useCallback((text: string) => { sendSocialMessage(text, 'battle'); }, [sendSocialMessage]);

  const saveLoadoutToFirestore = useCallback((b: BoardState, inv: InventoryItem[]) => {
      if (!user || !firestore) return;
      const equipment: Record<string, string> = {};
      b.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
      updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { inventory: inv, equipment });
  }, [user, firestore]);

  const pushHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null }))),
      currentPlayer, gameInfo: { ...gameInfo }, capturedPieces: { white: [...capturedPieces.white], black: [...capturedPieces.black] }, killStreaks: { ...killStreaks }, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory: [...positionHistory], lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, lastMovedPieceHeldItem, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, isAwaitingRookSacrifice: false, playerToSacrificeForRook: null, rookToMakeInvulnerable: null, boardForRookSacrifice: null, originalTurnPlayerForRookSacrifice: null, isExtraTurnFromRookLevelUp: false, isResurrectionPromotionInProgress: false, playerForPostResurrectionPromotion: null, isExtraTurnForPostResurrectionPromotion: false, promotionSquare, promotionMoveWasCapture: false, originalPromotionLevel: null, promotionPawnOriginalLevel: null, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares: [...resurrectedSquares], turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil: playerToDropAnvil || null, anvilDropContext: specialActionContext ? { ...specialActionContext } as any : null, anvilDropAfterPromotion: false, inventory: [...inventory],
    };
    setHistoryStack(prev => [...prev, snapshot].slice(-40));
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, boardOrientation, viewMode, isWhiteAI, isBlackAI, positionHistory, lastMoveFrom, lastMoveTo, gameMoveCounter, enPassantTargetSquare, lastMovedPieceHeldItem, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, promotionSquare, firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion, resurrectedSquares, turnTimer, activeTimerPlayer, whiteTimeouts, blackTimeouts, isAwaitingAnvilDrop, playerToDropAnvil, specialActionContext, inventory]);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0 || isMoveProcessing || isAiThinking || onlineStatus !== 'disconnected' || gameInfo.gameOver) return;
    const prevState = historyStack[historyStack.length - 1]; setHistoryStack(prev => prev.slice(0, -1));
    setBoard(prevState.board); setCurrentPlayer(prevState.currentPlayer); setGameInfo(prevState.gameInfo); setCapturedPieces(prevState.capturedPieces); setKillStreaks(prevState.killStreaks); setBoardOrientation(prevState.boardOrientation); setViewMode(prevState.viewMode); setIsWhiteAI(prevState.isWhiteAI); setIsBlackAI(prevState.isBlackAI); setPositionHistory(prevState.positionHistory); setLastMoveFrom(prevState.lastMoveFrom); setLastMoveTo(prevState.lastMoveTo); setGameMoveCounter(prevState.gameMoveCounter); setEnPassantTargetSquare(prevState.enPassantTargetSquare); setLastMovedPieceHeldItem(prevState.lastMovedPieceHeldItem as any); setIsAwaitingPawnSacrifice(prevState.isAwaitingPawnSacrifice); setPlayerToSacrificePawn(prevState.playerToSacrificePawn); setBoardForPostSacrifice(prevState.boardForPostSacrifice); setPlayerWhoMadeQueenMove(prevState.boardOrientation as any); setIsExtraTurnFromQueenMove(prevState.isExtraTurnFromQueenMove); setFirstBloodAchieved(prevState.firstBloodAchieved); setPlayerWhoGotFirstBlood(prevState.playerWhoGotFirstBlood); setIsAwaitingCommanderPromotion(prevState.isAwaitingCommanderPromotion); setResurrectedSquares(prevState.resurrectedSquares); setWhiteTimeouts(prevState.whiteTimeouts); setBlackTimeouts(prevState.blackTimeouts); setIsAwaitingAnvilDrop(prevState.isAwaitingAnvilDrop); setPlayerToDropAnvil(prevState.playerToDropAnvil || null); setSpecialActionContext(prevState.anvilDropContext as any); if (prevState.inventory) setInventory(prevState.inventory);
    setSelectedSquare(null); setPossibleMoves([]); audioManager.playMove(); addLog("Move Undone.");
  }, [historyStack, isMoveProcessing, isAiThinking, onlineStatus, gameInfo.gameOver, addLog]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep; const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter); setCapturedPieces(currentGraveyard); setKillStreaks(currentKs);
    if (onlineStatus === 'disconnected' || localPlayerColor === playerWhoseTurnCompleted) {
      let currentShroomCounter = shroomSpawnCounter + 1; setShroomSpawnCounter(currentShroomCounter);
      if (currentShroomCounter >= nextShroomSpawnTurn) {
          const { newBoard: boardAfterShroom, spawnedAt: shroomSpawnedAt } = spawnShroom(currentBoardState);
          if (shroomSpawnedAt) { currentBoardState = boardAfterShroom; setBoard(currentBoardState); addLog("A mystical Shroom 🍄 has appeared!"); audioManager.playShroom(); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); }
      }
    }
    const nextPlayer = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison } = processPoisonDamage(currentBoardState, nextPlayer);
    setBoard(boardAfterPoison); setCurrentPlayer(nextPlayer); setEnPassantTargetSquare(newEnPassantTarget);
    const inCheck = isKingInCheck(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType, lastMovedPieceHeldItem);
    if (inCheck && isExtraTurn) {
        const msg = `Auto-Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!`;
        setGameInfo({ message: msg, isCheck: true, playerWithKingInCheck: nextPlayer, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnCompleted });
        addLog(msg); gameOverRef.current = true; return;
    }
    const mate = inCheck && isCheckmate(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType, lastMovedPieceHeldItem);
    const stale = !inCheck && isStalemate(boardAfterPoison, nextPlayer, newEnPassantTarget, lastMovedPieceType, lastMovedPieceHeldItem);
    if (mate || stale) {
        const msg = mate ? `Checkmate! ${getPlayerDisplayName(playerWhoseTurnCompleted)} wins!` : "Stalemate!";
        setGameInfo({ message: msg, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: mate, isStalemate: stale, gameOver: true, winner: mate ? playerWhoseTurnCompleted : 'draw' });
        addLog(msg); gameOverRef.current = true;
    } else {
        if (inCheck) addLog("Check!");
        setGameInfo({ message: inCheck ? "Check!" : (isExtraTurn ? `${getPlayerDisplayName(playerWhoseTurnCompleted)} gets an extra turn!` : " "), isCheck: inCheck, playerWithKingInCheck: inCheck ? nextPlayer : null, isCheckmate: false, isStalemate: false, gameOver: false });
    }
  }, [gameMoveCounter, shroomSpawnCounter, nextShroomSpawnTurn, onlineStatus, localPlayerColor, addLog, getPlayerDisplayName, lastMovedPieceType, lastMovedPieceHeldItem]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = [], capturingPieceId: string | null = null) => {
    const isAI = (actingPlayer === 'white' && isWhiteAI) || (actingPlayer === 'black' && isBlackAI);
    const silenced = boardToChain.flat().find(sq => sq.piece?.color === actingPlayer && isSilenced(boardToChain, sq.rowIndex, sq.colIndex, actingPlayer));
    let nextGraveyard = { ...currentGraveyard };
    if (newStreak >= 8 && !completedMilestones.includes('conquest')) {
        const actingKing = boardToChain.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer)?.piece;
        if (actingKing?.heldItem === 'kings_conquest') {
            const msg = `CONQUEST VICTORY! ${getPlayerDisplayName(actingPlayer)} reigns supreme!`;
            setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: actingPlayer });
            addLog(msg); gameOverRef.current = true; audioManager.playVictory(); return;
        }
    }
    if (!silenced && newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const hasDancers = boardToChain.flat().some(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
        if (hasDancers) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const aiDancerSq = nextBoard.flat().find(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
                if (aiDancerSq) {
                    const {rowIndex: r, colIndex: c} = aiDancerSq;
                    const dancerPiece = aiDancerSq.piece!;
                    const dancerDir = actingPlayer === 'white' ? -1 : 1;
                    const candidates: {r: number, c: number, priority: number}[] = [];
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                        if(dr===0 && dc===0) continue;
                        const nr = r+dr, nc = c+dc;
                        if (isValidSquare(nr, nc)) {
                            const targetSq = nextBoard[nr][nc];
                            if (!targetSq.piece && !targetSq.item) {
                                if (dr === dancerDir && dc === 0) candidates.push({r: nr, c: nc, priority: 1}); // Forward move
                            } else if (targetSq.piece) {
                                if (targetSq.piece.color !== actingPlayer && targetSq.piece.type !== 'king' && !targetSq.piece.isShielded) candidates.push({r: nr, c: nc, priority: 2}); // Enemy swap
                                else if (targetSq.piece.color === actingPlayer) candidates.push({r: nr, c: nc, priority: 0}); // Ally swap
                            }
                        }
                    }
                    candidates.sort((a,b) => b.priority - a.priority);
                    if (candidates.length > 0) {
                        const best = candidates[0];
                        const targetPiece = nextBoard[best.r][best.c].piece;
                        // SWAP
                        nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true };
                        nextBoard[r][c].piece = targetPiece ? { ...targetPiece, hasMoved: true } : null;
                        addLog(`${getPlayerDisplayName(actingPlayer)} Dancer performed a free ${targetPiece ? 'swap' : 'move'}!`);
                    }
                }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'dance'], capturingPieceId); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                setIsAwaitingDanceTarget(true); addLog("Dancer Skill: The Dance is ready!"); return;
            }
        }
    }
    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (pawnSq) { const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); nextBoard[pr][pc].piece!.type = 'commander'; addLog(`${getPlayerDisplayName(actingPlayer)} promoted a Commander via First Blood!`); }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'firstBlood'], capturingPieceId); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === actingPlayer && sq.piece.level === 1);
            if (hasL1Targets) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                setIsAwaitingCommanderPromotion(true); addLog("First Blood! Choose a Pawn to promote."); return;
            }
        }
    }
    if (!silenced && newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === actingPlayer);
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const targets = nextBoard.flat()
                    .filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId)
                    .sort((a, b) => (b.piece?.level || 0) - (a.piece?.level || 0));
                if (targets.length > 0) { targets[0].piece!.isShielded = true; addLog(`${getPlayerDisplayName(actingPlayer)} Archbishop applied a Holy Shield!`); }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                const hasUnshieldedTargets = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId);
                if (hasUnshieldedTargets) {
                    setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                    setIsAwaitingHolyShield(true); addLog("Holy Shield ready!"); return;
                } else { triggerSpecialsChain(boardToChain, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId); return; }
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
                const bestSq = empty[0];
                nextBoard[bestSq.rowIndex][bestSq.colIndex].item = { type: 'anvil' };
                addLog(`${getPlayerDisplayName(actingPlayer)} dropped a defensive Anvil!`);
            }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'anvil'], capturingPieceId); return;
        } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
            setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
            setPlayerToDropAnvil(actingPlayer); setIsAwaitingAnvilDrop(true); addLog("Anvil Drop ready!"); return;
        }
    }
    if (newStreak >= 4 && oldStreak < 4 && !completedMilestones.includes('resurrection')) {
        const myGraveyard = actingPlayer === 'white' ? nextGraveyard.white : nextGraveyard.black; 
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sorted = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0));
            const choice = sorted[0]; const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random()*empty.length)]; const {row: rr, col: rc} = algebraicToCoords(sq.algebraic);
                const resPiece = { ...choice, level: 1, id: `${choice.id}_res_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                nextBoard[rr][rc].piece = resPiece; const updatedG = { ...nextGraveyard };
                if (actingPlayer === 'white') updatedG.white = updatedG.white.filter(p => p.id !== choice.id); else updatedG.black = updatedG.black.filter(p => p.id !== choice.id);
                addEffectCallback('light-beam', sq.algebraic); audioManager.playResurrect(); addLog(`Resurrection! ${choice.type} has returned.`);
                const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (!isAI && (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(resPiece.type)) && rr === oppBackRank) {
                    setPromotionTargetLevel(1); setPromotionSquare(sq.algebraic); setIsPromotingPawn(true);
                    setSpecialActionContext({ boardForNextStep: nextBoard, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'resurrection'], currentGraveyard: updatedG, currentKs: currentKs, capturingPieceId: capturingPieceId }); return;
                }
                if (isAI && (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(resPiece.type)) && rr === oppBackRank) resPiece.type = 'queen';
                triggerSpecialsChain(nextBoard, updatedG, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection'], capturingPieceId); return;
            }
        }
    }
    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const snipers = pieces.filter(p => {
        if (p.type === 'archer') return true;
        const coords = boardToChain.flat().find(sq => sq.piece?.id === p.id);
        if (p.type === 'knight' && p.heldItem === 'shortbow' && coords && getEffectiveLevel(boardToChain, coords.rowIndex, coords.colIndex) >= 3) return true;
        return false;
    });
    const maxSniperLevel = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.color === actingPlayer && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && snipers.length > 0) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow);
    if (!silenced && isSnipeTime && !completedMilestones.includes('snipe')) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxSniperLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const victimsSorted = victims.sort((a,b) => (VAL_MAP[b.piece!.type]||0) - (VAL_MAP[a.piece!.type]||0));
                const v = victimsSorted[0]; const {rowIndex: row, colIndex: col} = v;
                const snipedPiece = { ...nextBoard[row][col].piece!, id: nextBoard[row][col].piece!.id };
                const responsibleAIArcher = snipers.find(a => a.level >= (v.piece?.level || 1));
                if (responsibleAIArcher) {
                    const gain = {pawn: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0;
                    const arSq = nextBoard.flat().find(s => s.piece?.id === responsibleAIArcher.id);
                    if (arSq && arSq.piece) arSq.piece.level += gain;
                }
                nextBoard[row][col].piece = null; addLog(`${getPlayerDisplayName(actingPlayer)} Sniper obliterated a Level ${snipedPiece.level} ${snipedPiece.type}!`);
                const targetPile = snipedPiece.color; nextGraveyard[targetPile].push(snipedPiece);
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe'], capturingPieceId); return;
            } else if (!localPlayerColor || actingPlayer === localPlayerColor) {
                setSpecialActionContext({ boardForNextStep: boardToChain, playerWhoseTurnCompleted: actingPlayer, isExtraTurn: isExtra, newEnPassantTarget: nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'], currentGraveyard: nextGraveyard, currentKs, capturingPieceId });
                setIsAwaitingArcherSnipe(true); addLog("Sniper active! Select a target."); return;
            }
        }
    }
    processMoveEnd(boardToChain, nextGraveyard, currentKs, actingPlayer, isExtra, nextEp);
  }, [isWhiteAI, isBlackAI, firstBloodAchieved, addEffectCallback, processMoveEnd, localPlayerColor, addLog, getPlayerDisplayName]);

  const processPawnSacrificeCheck = useCallback((boardAfter: BoardState, graveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, player: PlayerColor, move: Move | null, oldL: number | undefined, oldT: PieceType | undefined, extra: boolean, ep: AlgebraicSquare | null, oldS: number, newS: number, capturingPieceId: string | null = null) => {
    if (!move) return false;
    const { row: rowIdx, col: colIdx } = algebraicToCoords(move.to); 
    const piece = boardAfter[rowIdx][colIdx].piece;
    if (piece?.type === 'queen' && piece.level === 7 && oldT === 'queen' && (oldL || 0) < 7) {
      if (boardAfter.flat().some(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type))) {
        const isAI = (player === 'white' && isWhiteAI) || (player === 'black' && isBlackAI);
        if (isAI) {
            const nextB = boardAfter.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextB.flat().find(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type));
            if (pawnSq) {
                const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); const sacrificed = { ...nextB[pr][pc].piece!, id: nextB[pr][pc].piece!.id };
                nextB[pr][pc].piece = null; audioManager.playCapture(); addLog(`AI Sacrificed ${sacrificed.type} for the Queen!`);
                const nextG = { ...graveyard }; const targetPile = sacrificed.color; nextG[targetPile].push(sacrificed);
                triggerSpecialsChain(nextB, nextG, currentKs, oldS, newS, extra, ep, player, [], capturingPieceId);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(player); setBoardForPostSacrifice(boardAfter);
        setPlayerWhoMadeQueenMove(player); setIsExtraTurnFromQueenMove(extra);
        setSpecialActionContext({ boardForNextStep: boardAfter, playerWhoseTurnCompleted: player, isExtraTurn: extra, newEnPassantTarget: ep, oldStreak: oldS, newStreak: newS, currentGraveyard: graveyard, currentKs, capturingPieceId }); 
        addLog("Royal Sacrifice required! Select a Pawn to give up."); return true;
      }
    }
    triggerSpecialsChain(boardAfter, graveyard, currentKs, oldS, newS, extra, ep, player, [], capturingPieceId); return false;
  }, [isWhiteAI, isBlackAI, triggerSpecialsChain, addLog]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    const targetSquare = promotionSquare; const currentTargetLevel = promotionTargetLevel; const currentContext = specialActionContext; const currentQueue = [...promotionQueue];
    setIsPromotingPawn(false); setPromotionSquare(null);
    if (!targetSquare || !currentContext) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(targetSquare); const pieceBeingPromoted = nextBoard[row][col].piece;
    if (!pieceBeingPromoted) return;
    if (pieceBeingPromoted.heldItem && !isItemValidForPiece(pieceBeingPromoted.heldItem, pieceType)) {
      const item = pieceBeingPromoted.heldItem; setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === item); if (existing) existing.count++; else next.push({ type: item, count: 1 }); return next; });
      pieceBeingPromoted.heldItem = null; addLog(`Equipment Returned: ${ITEM_METADATA[item].name}`);
    }
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: pieceBeingPromoted.id, level: currentTargetLevel, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(currentTargetLevel, 7);
    audioManager.playLevelUp(); setBoard(nextBoard); addLog(`Pawn Promoted to ${pieceType}!`);
    let isExtra = (nextBoard[row][col].piece!.level >= 5) || currentContext.isExtraTurn;
    const remainingQueue = currentQueue.filter(p => p.square !== targetSquare);
    if (remainingQueue.length > 0) {
        setPromotionQueue(remainingQueue); setPromotionTargetLevel(remainingQueue[0].targetLevel); setIsPromotingPawn(true); setPromotionSquare(remainingQueue[0].square);
        setSpecialActionContext({ ...currentContext, isExtraTurn: isExtra });
    } else {
        setPromotionQueue([]); triggerSpecialsChain(nextBoard, currentContext.currentGraveyard, currentContext.currentKs, currentContext.oldStreak, currentContext.newStreak, isExtra, currentContext.newEnPassantTarget, currentContext.playerWhoseTurnCompleted, currentContext.completedMilestones || [], currentContext.capturingPieceId);
    }
  }, [board, promotionSquare, promotionTargetLevel, specialActionContext, triggerSpecialsChain, addLog, promotionQueue]);

  const performAiMove = useCallback(async () => {
    if (!aiInstanceRef.current || gameInfo.gameOver || gameOverRef.current || isMoveProcessing || isAnySpecialModeActive || isAiThinking) return;
    setSelectedSquare(null); setPossibleMoves([]);
    setIsAiThinking(true);
    try {
      const gameStateForAI = adaptBoardForAI(board, currentPlayer, killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, shroomSpawnCounter, nextShroomSpawnTurn, lastMovedPieceHeldItem);
      const aiResult = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer); 
      let aiMove = aiResult?.move;

      const freshlyCalculated = aiMove ? getPossibleMoves(board, coordsToAlgebraic(aiMove.from[0], aiMove.from[1]), enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem) : [];
      if (!aiMove || !freshlyCalculated.includes(coordsToAlgebraic(aiMove.to[0], aiMove.to[1]))) {
          const nextStrikes = aiStrikeCount + 1;
          setAiStrikeCount(nextStrikes);
          if (nextStrikes >= 3) {
              const allLegalMoves: Move[] = [];
              for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
                  const p = board[r][c].piece;
                  if (p && p.color === currentPlayer) {
                      const moves = getPossibleMoves(board, board[r][c].algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem);
                      moves.forEach(m => allLegalMoves.push({ from: board[r][c].algebraic, to: m, type: 'move' }));
                  }
              }
              if (allLegalMoves.length > 0) {
                  const fallback = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
                  const fC = algebraicToCoords(fallback.from);
                  const tC = algebraicToCoords(fallback.to);
                  aiMove = { from: [fC.row, fC.col], to: [tC.row, tC.col], type: 'move' };
                  setAiStrikeCount(0);
                  addLog("AI broke stall with a tactical adjustment.");
              }
          }
          if (!aiMove) { setIsAiThinking(false); return; }
      } else {
          setAiStrikeCount(0);
      }

      const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]); const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
      const piece = board[aiMove.from[0]][aiMove.from[1]].piece; if (!piece) { setIsAiThinking(false); return; }
      const oldL = piece.level; const oldT = piece.type; const oldH = piece.heldItem;
      
      setIsMoveProcessing(true); clickGuardRef.current = true; setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg); setLastMovedPieceType(oldT); setLastMovedPieceHeldItem(oldH || null);
      pushHistory();
      const applyResult = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
      let nextB = applyResult.newBoard; const updatedG = { ...capturedPieces };
      
      if (applyResult.winByKingsConquest) {
          const msg = `CONQUEST VICTORY! AI reigns supreme!`;
          setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: currentPlayer });
          addLog(msg); gameOverRef.current = true; audioManager.playVictory(); setIsAiThinking(false); setIsMoveProcessing(false); return;
      }
      if (applyResult.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === applyResult.itemReturned); if (existing) existing.count++; else next.push({ type: applyResult.itemReturned!, count: 1 }); return next; }); addLog(`AI returned equipment: ${ITEM_METADATA[applyResult.itemReturned].name}`); }
      if (applyResult.reflectionOccurred) {
          const victim = applyResult.capturedPiece!; const targetPile = victim.color; updatedG[targetPile].push({ ...victim, id: victim.id });
          audioManager.playCapture(); addLog("AI attack reflected!"); addEffectCallback('poof', toAlg);
          const newKs = { ...killStreaks, white: 0, black: 0 }; setBoard(nextB); setCapturedPieces(updatedG); setKillStreaks(newKs);
          setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, updatedG, newKs, currentPlayer, false, null); }, 800); return;
      }
      if (applyResult.shroomConsumed) { audioManager.playShroom(); addLog("AI consumed a Shroom!"); addEffectCallback('level-change', toAlg, currentPlayer, 1); }
      if (applyResult.promotedToHero) { audioManager.playLevelUp(); addLog("AI Hero Ascended!"); }
      if (applyResult.phoenixResurrection) { audioManager.playResurrect(); addLog("AI Phoenix Rebirth!"); }
      if (applyResult.conversionEvents?.length > 0) { audioManager.playConversion(); addLog("AI Conversion triggered!"); }
      if (applyResult.rallyCryTriggered) { addEffectCallback('shockwave', applyResult.rallyCryTriggered.square, applyResult.rallyCryTriggered.color); audioManager.playRally(); addLog("AI Rallying Cry!"); }
      if (applyResult.ralliedSquares) { applyResult.ralliedSquares.forEach(sq => { addEffectCallback('level-change', sq, currentPlayer, 1); }); }
      const isObliteration = applyResult.promotedToInfiltrator || (piece.type === 'infiltrator' && applyResult.capturedPiece);
      if (isObliteration) { audioManager.playObliterate(); addLog("AI Obliterated a unit!"); addEffectCallback('poof', toAlg); }
      else if (applyResult.capturedPiece || (applyResult.selfDestructCaptures && applyResult.selfDestructCaptures.length > 0)) { audioManager.playCapture(); addEffectCallback('poof', toAlg); if (applyResult.capturedPiece) addLog(`AI Captured ${applyResult.capturedPiece.type}!`); }
      else { audioManager.playMove(); addLog(`AI ${piece.type} to ${toAlg}`); }
      if (applyResult.capturedPiece && !isObliteration) { const targetPile = applyResult.capturedPiece.color; updatedG[targetPile].push({ ...applyResult.capturedPiece!, id: applyResult.capturedPiece!.id }); }
      if (applyResult.selfDestructCaptures && applyResult.selfDestructCaptures.length > 0) { applyResult.selfDestructCaptures.forEach(p => { const targetPile = p.color; updatedG[targetPile].push({ ...p, id: p.id }); addEffectCallback('poof', toAlg); }); if (applyResult.selfDestructCaptures.length > 0) { addLog(`AI collateral damage: ${applyResult.selfDestructCaptures.length} unit(s) destroyed!`); } }
      setBoard(nextB); setCapturedPieces(updatedG);
      const gain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0);
      if (gain > 0) addEffectCallback('level-change', toAlg, currentPlayer, gain);
      const oldS = killStreaks[currentPlayer]; const newS = gain > 0 ? oldS + gain : 0;
      const currentKs = { ...killStreaks, [currentPlayer]: newS }; setKillStreaks(currentKs);
      setTimeout(() => {
        setIsMoveProcessing(false); clickGuardRef.current = false; setIsAiThinking(false);
        if (gameOverRef.current) return;
        let isExtra = applyResult.extraTurn || (oldS < 6 && newS >= 6); const landedPiece = nextB[aiMove.to[0]][aiMove.to[1]].piece;
        const oppBackRank = currentPlayer === 'white' ? 0 : 7;
        if (landedPiece && FRONTLINE_TYPES.includes(landedPiece.type) && aiMove.to[0] === oppBackRank) {
            const promoType = aiMove.promoteTo || 'queen'; const targetLevel = getPromotionLevel(applyResult.capturedPiece?.type || applyResult.pieceCapturedByAnvil?.type || null);
            landedPiece.type = promoType; landedPiece.level = targetLevel; if (promoType === 'queen') landedPiece.level = Math.min(landedPiece.level, 7);
            if (landedPiece.heldItem && !isItemValidForPiece(landedPiece.heldItem, landedPiece.type)) landedPiece.heldItem = null;
            if (landedPiece.level >= 5) isExtra = true; addLog(`AI promoted to ${promoType}!`);
        }
        if (applyResult.multiPromotions && applyResult.multiPromotions.length > 0) { applyResult.multiPromotions.forEach(promo => { const { row: pr, col: pc } = algebraicToCoords(promo.square); if (nextB[pr][pc].piece) { nextB[pr][pc].piece!.type = 'queen'; nextB[pr][pc].piece!.level = promo.targetLevel; if (nextB[pr][pc].piece!.level >= 5) isExtra = true; addLog("AI multi-promotion!"); } }); }
        setBoard(nextB); processPawnSacrificeCheck(nextB, updatedG, currentKs, currentPlayer, {from: fromAlg, to: toAlg, type: aiMove.type as Move['type']}, oldL, oldT, isExtra, applyResult.enPassantTargetSet, oldS, newS, (gain > 0) ? landedPiece?.id || null : null);
      }, 800);
    } catch (e) { console.error(`[AI Error]`, e); setIsAiThinking(false); }
  }, [board, currentPlayer, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, isAiThinking, isWhiteAI, isBlackAI, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, processPawnSacrificeCheck, gameMoveCounter, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, addEffectCallback, pushHistory, addLog, killStreaks, capturedPieces, aiStrikeCount]);

  const handleMycoSpellSelect = useCallback((spell: MycoSpell) => {
      setIsSelectingMycoSpell(false);
      if (!spell) { setSelectedSquare(null); return; }
      if (spell === 'propagate') {
        const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'myco-propagate' };
        if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
        else {
            pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
            const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
            setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("Mushroomancy: Propagate!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
        }
      } else if (spell === 'teleport') { setIsSelectingTeleportAlly(true); addLog("Select an ally to teleport!");
      } else if (spell === 'spore-bomb') { setIsSelectingSporeBombShroom(true); addLog("Select a shroom to detonate!");
      } else if (spell === 'raise-mycelimen') {
          const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'raise-mycelimen' };
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); }
          else {
              pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
              const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
              const nextB = applyResult.newBoard; const updatedG = { ...capturedPieces };
              setBoard(nextB); audioManager.playLevelUp(); addLog("Mushroomancy: Myceli-Men Rise!");
              setTimeout(() => { 
                setIsMoveProcessing(false); clickGuardRef.current = false; setSelectedSquare(null);
                const queue: {square: AlgebraicSquare, targetLevel: number}[] = applyResult.multiPromotions || [];
                if (queue.length > 0) { setPromotionQueue(queue); const first = queue[0]; setPlayerToPromote(currentPlayer); setPromotionTargetLevel(first.targetLevel); setIsPromotingPawn(true); setPromotionSquare(first.square); setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: false, newEnPassantTarget: null, oldStreak: killStreaks[currentPlayer], newStreak: killStreaks[currentPlayer], currentGraveyard: updatedG, currentKs: killStreaks, capturingPieceId: null } as any); }
                else { processMoveEnd(nextB, updatedG, killStreaks, currentPlayer, false, null); }
              }, 800);
          }
      }
  }, [selectedSquare, onlineStatus, board, enPassantTargetSquare, capturedPieces, killStreaks, currentPlayer, processMoveEnd, addLog, lastMovedPieceType, lastMovedPieceHeldItem, pushHistory]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuardRef.current) return;
    const { row, col } = algebraicToCoords(algebraic); const sq = board[row]?.[col]; const piece = sq?.piece;
    handlePieceHover(piece || null);
    if (isInventoryOpen) {
      if (selectedInventoryItemType && !selectedInventoryItemType.startsWith('portal_scroll_')) {
        const itemMeta = ITEM_METADATA[selectedInventoryItemType];
        if (itemMeta.rarity === 'rare') {
            const alreadyEquipped = board.flat().some(sq => sq.piece?.heldItem === selectedInventoryItemType);
            if (alreadyEquipped) {
                addLog(`LIMIT REACHED: You can only have one ${itemMeta.name} active!`);
                return;
            }
        }
        if (piece && !piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          if (usedSlots >= attunementSlots) { addLog("Attunement Limit Reached!"); return; }
          if (selectedInventoryItemType === 'soul_harvest' && (piece.type === 'king' || piece.type === 'queen')) { addLog("Kings/Queens cannot harvest souls."); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveLoadoutToFirestore(nextBoard, newInv); setSelectedInventoryItemType(null); audioManager.playLevelUp(); addLog(`Equipped ${ITEM_METADATA[selectedInventoryItemType].name}`);
        }
      } else if (piece && piece.heldItem && piece.color === (localPlayerColor || 'white')) {
          const removed = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removed); if (item) item.count++; else nextInv.push({ type: removed, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); audioManager.playMove(); addLog(`Unequipped ${ITEM_METADATA[removed].name}`);
      }
      return;
    }
    if (isSelectingTeleportAlly) {
        if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== (selectedSquare ? board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.id : null)) {
            setTeleportAllyPieceId(piece.id); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(true); addLog("Select a destination shroom!");
        }
        return;
    }
    if (isSelectingTeleportShroom) {
        if (sq?.item?.type === 'shroom') {
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'tele-portobello', teleportPieceId: teleportAllyPieceId! };
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
                setBoard(applyResult.newBoard); audioManager.playMove();
                setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsSelectingTeleportShroom(false); setTeleportAllyPieceId(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
            }
        }
        return;
    }
    if (isSelectingSporeBombShroom) {
        if (sq?.item?.type === 'shroom') {
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'spore-bomb' };
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: move })); setSelectedSquare(null); setPossibleMoves([]); }
            else {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
                setBoard(applyResult.newBoard); audioManager.playExplosion();
                setSelectedSquare(null); setPossibleMoves([]);
                const { row: sR, col: sC } = algebraicToCoords(algebraic);
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (isValidSquare(sR + dr, sC + dc)) addEffectCallback('explosion', coordsToAlgebraic(sR + dr, sC + dc)); }
                setTimeout(() => { clickGuardRef.current = false; setIsMoveProcessing(false); setIsSelectingSporeBombShroom(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
            }
        }
        return;
    }
    if (isAwaitingGrappleThrow) {
        const canLand = (!sq?.piece && !sq?.item) || (grappledItemSubject?.type === 'anvil' && sq?.piece);
        if (canLand) {
            const {row: fr, col: fc} = algebraicToCoords(selectedSquare!); const range = getEffectiveLevel(board, fr, fc);
            const isCardinal = fr === row || fc === col; const isDiagonal = Math.abs(fr - row) === Math.abs(fc - col); const dist = Math.max(Math.abs(fr - row), Math.abs(fc - col));
            if ((isCardinal || isDiagonal) && dist <= range && dist > 0) {
                pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
                const move: Move = { from: selectedSquare!, to: algebraic, type: 'grapple-throw' };
                if (grappledItemSubject) move.thrownItem = grappledItemSubject.type;
                else move.thrownPiece = grappledPieceSubject!.piece;
                
                const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
                setBoard(applyResult.newBoard); 
                if (grappledItemSubject) audioManager.playAnvil(); else audioManager.playMove();
                addLog(`Threw ${grappledItemSubject ? 'anvil' : 'unit'} to ${algebraic}!`);
                setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
            }
        }
        return;
    }
    if (isAwaitingDanceTarget) {
        if (!dancerToDance) { if (piece && piece.color === currentPlayer && piece.type === 'dancer') { setDancerToDance(algebraic); } return; }
        if (algebraic === dancerToDance) { setIsAwaitingDanceTarget(false); setDancerToDance(null); if (specialActionContext) triggerSpecialsChain(board, specialActionContext.boardForNextStep, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, currentPlayer, specialActionContext.completedMilestones, specialActionContext.capturingPieceId); return; }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance); 
        const isAdjacent = Math.abs(row - fr) <= 1 && Math.abs(col - fc) <= 1;
        const dir = currentPlayer === 'white' ? -1 : 1;
        const isForward = (row === fr + dir) && (col === fc);
        
        if (isAdjacent) {
            let moveValid = false;
            if (piece) moveValid = true; // Swap with any adjacent piece (8-way)
            else if (!sq?.item && isForward) moveValid = true; // Move forward if empty
            
            if (moveValid) {
                pushHistory(); let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const dancerPiece = nextBoard[fr][fc].piece!; let nextG = { ...specialActionContext!.currentGraveyard };
                const targetP = nextBoard[row][col].piece;
                
                // EXECUTE SWAP
                nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true };
                nextBoard[fr][fc].piece = targetP ? { ...targetP, hasMoved: true } : null;
                
                addLog(`Dancer ${targetP ? 'Swapped' : 'Moved'}!`);
                setBoard(nextBoard); setCapturedPieces(nextG); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove(); 
                triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, currentPlayer, specialActionContext!.completedMilestones, specialActionContext.capturingPieceId);
            }
        }
        return;
    }
  if (isAwaitingPawnSacrifice) {
    if (piece && FRONTLINE_TYPES.includes(piece.type) && piece.color === currentPlayer) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'pawn-sacrifice', payload: { square: algebraic } })); setIsAwaitingPawnSacrifice(false); }
      else {
          pushHistory(); let nextB = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          const sacrificed = { ...nextB[row][col].piece!, id: nextB[row][col].piece!.id }; nextB[row][col].piece = null; const nextG = { ...specialActionContext!.currentGraveyard }; const targetPile = sacrificed.color; nextG[targetPile].push(sacrificed);
          setBoard(nextB); setCapturedPieces(nextG); audioManager.playCapture(); setIsAwaitingPawnSacrifice(false); addLog(`Sacrificed ${sacrificed.type} for the Queen.`); triggerSpecialsChain(nextB, nextG, specialActionContext?.currentKs || killStreaks, specialActionContext?.oldStreak || 0, specialActionContext?.oldStreak || 0, isExtraTurnFromQueenMove, specialActionContext?.newEnPassantTarget || null, currentPlayer, [], specialActionContext?.capturingPieceId || null);
      }
    }
    return;
  }
  if (isAwaitingCommanderPromotion) {
      if (piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
          pushHistory(); const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
          nextBoard[row][col].piece!.type = 'commander'; nextBoard[row][col].piece!.id = nextBoard[row][col].piece!.id;
          setBoard(nextBoard); setIsAwaitingCommanderPromotion(false); audioManager.playLevelUp(); addLog("Commander Ascended!"); processMoveEnd(nextBoard, capturedPieces, killStreaks, currentPlayer, false, null);
      }
      return;
  }
  if (isAwaitingAnvilDrop) {
    if (!sq?.piece && !sq?.item) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'anvil-drop', square: algebraic })); setIsAwaitingAnvilDrop(false); }
      else {
          pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s }))); nextB[row][col].item = { type: 'anvil' };
          setBoard(nextB); audioManager.playAnvil(); setIsAwaitingAnvilDrop(false); addLog("Kill Streak reward: Anvil Drop!"); triggerNextSpecialAction_Lobby(specialActionContext!, currentPlayer);
      }
    }
    return;
  }
  if (isAwaitingHolyShield) {
      if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== specialActionContext?.capturingPieceId) {
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'holy-shield', square: algebraic })); setIsAwaitingHolyShield(false); }
          else {
              pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); nextB[row][col].piece!.isShielded = true;
              setBoard(nextB); audioManager.playShield(); setIsAwaitingHolyShield(false); addLog("Kill Streak reward: Holy Shield applied!"); triggerNextSpecialAction_Lobby(specialActionContext!, currentPlayer);
          }
      }
      return;
  }
  if (isAwaitingArcherSnipe) {
      const oppColor = currentPlayer === 'white' ? 'black' : 'white';
      const snipers = board.flat().filter(sq => { const p = sq.piece; if (!p || p.color !== currentPlayer) return false; if (p.type === 'archer') return true; if (p.type === 'knight' && p.heldItem === 'shortbow' && getEffectiveLevel(board, sq.rowIndex, sq.colIndex) >= 3) return true; return false; }).map(sq => sq.piece!);
      if (piece && piece.color === oppColor && piece.type !== 'king' && piece.type !== 'queen') {
          const responsibleArcher = snipers.find(a => a.level >= piece.level);
          if (responsibleArcher) {
              if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'archer-snipe', square: algebraic })); setIsAwaitingArcherSnipe(false); }
              else {
                  pushHistory(); const nextB = specialActionContext!.boardForNextStep.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
                  const snipedPiece = { ...nextB[row][col].piece!, id: nextB[row][col].piece!.id }; nextB[row][col].piece = null; const nextG = { ...specialActionContext!.currentGraveyard }; const targetPile = snipedPiece.color; nextG[targetPile].push(snipedPiece);
                  const arRow = nextB.findIndex(r => r.some(s => s.piece?.id === responsibleArcher.id)); const arCol = nextB[arRow].findIndex(s => s.piece?.id === responsibleArcher.id);
                  const gain = {pawn: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0; nextB[arRow][arCol].piece!.level += gain;
                  setBoard(nextB); setCapturedPieces(nextG); audioManager.playSnipe(); setIsAwaitingArcherSnipe(false); addLog(`Archer Snipe: Destroyed ${snipedPiece.type}!`); addEffectCallback('poof', algebraic); addEffectCallback('level-change', coordsToAlgebraic(arRow, arCol), currentPlayer, gain); triggerNextSpecialAction_Lobby(specialActionContext!, currentPlayer);
              }
          }
      }
      return;
  }
  if (isAwaitingEarthquakeScrollTarget) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'earthquake-scroll' } })); setIsAwaitingEarthquakeScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
      else {
          pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
          const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'earthquake-scroll' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
          setBoard(applyResult.newBoard); audioManager.playExplosion(); addLog("Earthquake Scroll triggered!");
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingEarthquakeScrollTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
      }
      return;
  }
  if (isAwaitingWindScrollTarget) {
    if (!sq?.piece && !sq?.item) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'wind-scroll' } })); setIsAwaitingWindScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
      else {
          pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
          const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'wind-scroll' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
          setBoard(applyResult.newBoard); audioManager.playAnvil(); addLog("Wind Scroll triggered!");
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingWindScrollTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
      }
    }
    return;
  }
  if (isAwaitingAnvilScrollTarget) {
    if (!sq?.piece && !sq?.item) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'summon-anvil' } })); setIsAwaitingAnvilScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
      else {
          pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
          const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'summon-anvil' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
          setBoard(applyResult.newBoard); audioManager.playAnvil(); addLog("Anvil Scroll triggered!");
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingAnvilScrollTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
    }
    }
    return;
  }
  if (isAwaitingShieldScrollTarget) {
    if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded) {
      if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'shield-scroll' } })); setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
      else {
          pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
          const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'shield-scroll' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
          setBoard(applyResult.newBoard); audioManager.playShield(); addLog(`Shielded ${piece.type}!`);
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingShieldScrollTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
      }
    }
    return;
  }
  if (isAwaitingSwapScrollTarget) {
      if (piece && piece.color === currentPlayer && algebraic !== selectedSquare) {
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'swap-scroll' } })); setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
          else {
              pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
              const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'swap-scroll' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
              setBoard(applyResult.newBoard); audioManager.playMove(); setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]); addLog("Swap Scroll triggered!");
              setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingSwapScrollTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
          }
      }
      return;
  }
  if (isAwaitingDecreeTarget) {
      if (piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'kings-decree' } })); setIsAwaitingDecreeTarget(false); setSelectedSquare(null); setPossibleMoves([]); }
          else {
              pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
              const applyResult = applyMove(board, { from: selectedSquare!, to: algebraic, type: 'kings-decree' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
              setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("King's Decree: Pawn promoted!");
              setSelectedSquare(null); setPossibleMoves([]);
              setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; setIsAwaitingDecreeTarget(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800);
          }
      }
      return;
  }
  if (selectedSquare) {
    const { row: fR, col: fC } = algebraicToCoords(selectedSquare); const moving = board[fR][fC].piece; 
    const silenced = isSilenced(board, fR, fC, currentPlayer); const canCommitMove = !isMoveProcessing && !gameInfo.gameOver && !gameOverRef.current && !isAiThinking && (onlineStatus !== 'connected' || localPlayerColor === currentPlayer) && !isAnySpecialModeActive;
    if (canCommitMove && moving && moving.color === currentPlayer && (!localPlayerColor || moving.color === localPlayerColor)) {
        if (!silenced && moving.type === 'myco_mage' && selectedSquare === algebraic) { setIsSelectingMycoSpell(true); addLog("Mushroomancy active! Choose a spell."); return; }
        if (!silenced && moving.type === 'grappler') {
            if (piece && algebraic !== selectedSquare) {
                const {row: pr, col: pc} = algebraicToCoords(algebraic); const isAdj = Math.abs(fR - row) <= 1 && Math.abs(fC - col) <= 1;
                if (isAdj) {
                  const dir = moving.color === 'white' ? -1 : 1; const isDiagForward = (pr === fR + dir) && Math.abs(pc - fC) === 1; const isEnemy = piece.color !== moving.color;
                  if (isEnemy && isDiagForward) { } else { if (piece.type === 'king') { addLog("Too Heavy! Cannot grapple Kings."); } else { setGrappledPieceSubject({ piece: { ...piece }, from: algebraic }); let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); nextBoard[row][col].piece = null; setBoard(nextBoard); setIsAwaitingGrappleThrow(true); addLog(`Grappler picked up ${piece.type}!`); } return; }
                }
            } else if (sq?.item?.type === 'anvil' && moving.heldItem === 'power_glove' && algebraic !== selectedSquare) {
                const isAdj = Math.abs(fR - row) <= 1 && Math.abs(fC - col) <= 1;
                if (isAdj) {
                    setGrappledItemSubject({ type: 'anvil', from: algebraic });
                    let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                    nextBoard[row][col].item = null; setBoard(nextBoard); setIsAwaitingGrappleThrow(true); addLog("Grappler picked up an Anvil!"); return;
                }
            }
        }
        if (!silenced && selectedSquare === algebraic) {
          const hItem = moving.heldItem;
          if (hItem === 'trap_net') { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'trap-net' } })); setSelectedSquare(null); setPossibleMoves([]); } else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]); const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: 'trap-net' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem); setBoard(applyResult.newBoard); audioManager.playMove(); addLog("Trap Net deployed!"); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return; processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800); } return; }
          if (hItem === 'demonic_possession') { 
            addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem);
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'demonic-possession' } })); setSelectedSquare(null); setPossibleMoves([]); } else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]); const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: 'demonic-possession' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem); setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("Possession: Massive power gained, but unit is doomed!"); addEffectCallback('level-change', algebraic, currentPlayer, 5); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return; processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800); } return; }
          if (hItem === 'heavy_rain') { 
            if (getEffectiveLevel(board, fR, fC) < 3) { addLog("Level 3 required for Heavy Rain!"); return; } 
            addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem);
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: 'heavy-rain' } })); setSelectedSquare(null); setPossibleMoves([]); } else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]); const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: 'heavy-rain' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem); setBoard(applyResult.newBoard); audioManager.playAnvil(); addLog("Heavy Rain Scroll used! Anvils have fallen."); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return; processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800); } return; }
          if (hItem === 'summon_anvil') { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingAnvilScrollTarget(true); return; }
          if (hItem === 'wind_scroll') { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingWindScrollTarget(true); return; }
          if (hItem === 'shield_scroll' && getEffectiveLevel(board, fR, fC) >= 2) { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingShieldScrollTarget(true); return; }
          if (hItem === 'swap_scroll' && getEffectiveLevel(board, fR, fC) >= 3) { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingSwapScrollTarget(true); return; }
          if (hItem === 'earthquake_scroll' && getEffectiveLevel(board, fR, fC) >= 3) { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingEarthquakeScrollTarget(true); return; }
          if (hItem === 'kings_decree' && moving.type === 'king') { addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem); setIsAwaitingDecreeTarget(true); return; }
          if (hItem === 'ice_blast' || hItem === 'soul_harvest') { 
            addEffectCallback('magic-burst', selectedSquare, currentPlayer, 0, hItem);
            if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: hItem === 'ice_blast' ? 'ice-blast' : 'soul-harvest' } })); setSelectedSquare(null); setPossibleMoves([]); } else { pushHistory(); clickGuardRef.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setSelectedSquare(null); setPossibleMoves([]); const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: hItem === 'ice_blast' ? 'ice-blast' : 'soul-harvest' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem); setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog(`${ITEM_METADATA[hItem].name} triggered!`); if (hItem === 'soul_harvest') { const gained = (applyResult.originalPieceLevel || 0) - (moving.level || 1); addEffectCallback('level-change', algebraic, currentPlayer, gained); } setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return; processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null); }, 800); } return; }
        }
        const freshlyCalculated = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem);
        if (freshlyCalculated.includes(algebraic)) {
          const { row: toRow, col: toCol } = algebraicToCoords(algebraic); let moveType: Move['type'] = 'move';
          if (moving.heldItem === 'grappling_hook' && board[toRow][toCol].piece?.color === moving.color) { moveType = 'grapple-hook-swap'; } 
          else if (moving.heldItem === 'battering_ram' && (moving.type === 'rook' || moving.type === 'palace')) { const dr = Math.sign(toRow - fR); const dc = Math.sign(toCol - fC); if (isValidSquare(fR+dr, fC+dc) && board[fR+dr][fC+dc].item?.type === 'anvil') moveType = 'ram-push'; }
          if (moveType === 'move') {
            if (moving?.type === 'king' && !moving.hasMoved && ((moving.color === 'white' && selectedSquare === 'e1' && (algebraic === 'c1' || algebraic === 'g1')) || (moving.color === 'black' && selectedSquare === 'e8' && (algebraic === 'c8' || algebraic === 'g8'))) && fR === toRow && !board[toRow][toCol].piece) { moveType = 'castle'; }
            else if (FRONTLINE_TYPES.includes(moving?.type) && algebraic === enPassantTargetSquare) { moveType = 'enpassant'; }
            else if (board[toRow][toCol].piece) { if (board[toRow][toCol].piece!.color !== moving?.color) moveType = 'capture'; else moveType = 'swap'; }
          }
          if (onlineStatus === 'connected') { wsRef.current?.send(JSON.stringify({ type: 'game-move', payload: { from: selectedSquare, to: algebraic, type: moveType } })); setSelectedSquare(null); setPossibleMoves([]); }
          else {
              pushHistory(); clickGuardRef.current = true; setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); setIsMoveProcessing(true); setAnimatedSquareTo(algebraic);
              setSelectedSquare(null); setPossibleMoves([]);
              const oldL = moving.level; const oldT = moving.type; const oldH = moving.heldItem; setLastMovedPieceType(oldT); setLastMovedPieceHeldItem(oldH || null);
              const applyResult = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem);
              let nextB = applyResult.newBoard; const updatedG = { ...capturedPieces };
              if (applyResult.winByKingsConquest) { const msg = `CONQUEST VICTORY! ${getPlayerDisplayName(currentPlayer)} reigns supreme!`; setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: currentPlayer }); addLog(msg); gameOverRef.current = true; audioManager.playVictory(); setIsMoveProcessing(false); clickGuardRef.current = false; return; }
              if (applyResult.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === applyResult.itemReturned); if (existing) existing.count++; else next.push({ type: applyResult.itemReturned, count: 1 }); return next; }); addLog(`Item Returned: ${ITEM_METADATA[applyResult.itemReturned].name}`); }
              if (applyResult.reflectionOccurred) { const victim = applyResult.capturedPiece!; const targetPile = victim.color; updatedG[targetPile].push(victim); audioManager.playCapture(); addLog("REFLECTED! Target used Mirror Shield."); addEffectCallback('poof', algebraic); const newKs = { ...killStreaks, white: 0, black: 0 }; setBoard(nextB); setCapturedPieces(updatedG); setKillStreaks(newKs); setTimeout(() => { setIsMoveProcessing(false); clickGuardRef.current = false; processMoveEnd(nextB, updatedG, newKs, currentPlayer, false, null); }, 800); return; }
              if (applyResult.shroomConsumed) { audioManager.playShroom(); addLog("Consumed a Shroom!"); addEffectCallback('level-change', algebraic, currentPlayer, 1); }
              if (applyResult.promotedToHero) { audioManager.playLevelUp(); addLog("HERO ASCENDED!"); }
              if (applyResult.phoenixResurrection) { audioManager.playResurrect(); addLog("REBIRTH! Phoenix Down activated."); }
              if (applyResult.conversionEvents?.length > 0) { audioManager.playConversion(); applyResult.conversionEvents.forEach(e => addLog(`Unit converted to ${e.convertedPiece.color}!`)); }
              if (applyResult.rallyCryTriggered) { addEffectCallback('shockwave', applyResult.rallyCryTriggered.square, applyResult.rallyCryTriggered.color); audioManager.playRally(); addLog("Rallying Cry!"); }
              if (applyResult.ralliedSquares) { applyResult.ralliedSquares.forEach(sq => { addEffectCallback('level-change', sq, currentPlayer, 1); }); }
              const gain = (applyResult.capturedPiece ? 1 : 0) + (applyResult.pieceCapturedByAnvil ? 1 : 0) + (applyResult.selfDestructCaptures?.length || 0);
              const oldS = killStreaks[currentPlayer]; const newS = gain > 0 ? oldS + gain : 0; const currentKs = { ...killStreaks, [currentPlayer]: newS };
              const isObliteration = applyResult.promotedToInfiltrator || (moving.type === 'infiltrator' && applyResult.capturedPiece);
              if (isObliteration) { audioManager.playObliterate(); addLog("OBLITERATED! Unit removed from existence."); addEffectCallback('poof', algebraic); }
              else if (gain > 0) { audioManager.playCapture(); addEffectCallback('poof', algebraic); addEffectCallback('level-change', algebraic, currentPlayer, gain); if (applyResult.capturedPiece) addLog(`Captured ${applyResult.capturedPiece.type} at ${algebraic}!`); }
              else { audioManager.playMove(); addLog(`${moving.type} to ${algebraic}`); }
              if (applyResult.capturedPiece && !isObliteration) { const targetPile = applyResult.capturedPiece.color; updatedG[targetPile].push({ ...applyResult.capturedPiece!, id: applyResult.capturedPiece!.id }); }
              if (applyResult.selfDestructCaptures && applyResult.selfDestructCaptures.length > 0) { applyResult.selfDestructCaptures.forEach(p => { const targetPile = p.color; updatedG[targetPile].push({ ...p, id: p.id }); addEffectCallback('poof', algebraic); }); if (applyResult.selfDestructCaptures.length > 0) { addLog(`Collateral damage: ${applyResult.selfDestructCaptures.length} unit(s) destroyed!`); } }
              setBoard(nextB); setCapturedPieces(updatedG); setKillStreaks(currentKs);
              const landedPieceAtTo = nextB[toRow][toCol].piece;
              const capturerId = (gain > 0) ? landedPieceAtTo?.id || null : null;
              setTimeout(() => {
                  setIsMoveProcessing(false); clickGuardRef.current = false; if (gameOverRef.current) return;
                  const isExtra = applyResult.extraTurn || (oldS < 6 && newS >= 6); const oppBackRankIdx = currentPlayer === 'white' ? 0 : 7;
                  const queue: {square: AlgebraicSquare, targetLevel: number}[] = applyResult.multiPromotions || [];
                  if (FRONTLINE_TYPES.includes(nextB[toRow][toCol].piece?.type || '') && toRow === oppBackRankIdx) { queue.push({ square: algebraic, targetLevel: getPromotionLevel(applyResult.capturedPiece?.type || applyResult.pieceCapturedByAnvil?.type || null) }); }
                  if (queue.length > 0) { setPromotionQueue(queue); const first = queue[0]; setPlayerToPromote(currentPlayer); setPromotionTargetLevel(first.targetLevel); setIsPromotingPawn(true); setPromotionSquare(first.square); setSpecialActionContext({ boardForNextStep: nextB, playerWhoseTurnCompleted: currentPlayer, isExtraTurn: isExtra, newEnPassantTarget: applyResult.enPassantTargetSet, oldStreak: oldS, newStreak: newS, currentGraveyard: updatedG, currentKs, capturingPieceId: capturerId } as any); }
                  else {
                      let sacrificeNeeded = false;
                      if (landedPieceAtTo?.type === 'queen') sacrificeNeeded = processPawnSacrificeCheck(nextB, updatedG, currentKs, currentPlayer, { from: selectedSquare, to: algebraic, type: moveType }, oldL, oldT, isExtra, applyResult.enPassantTargetSet, oldS, newS, capturerId);
                      if (sacrificeNeeded) return;
                      triggerSpecialsChain(nextB, updatedG, currentKs, oldS, newS, isExtra, applyResult.enPassantTargetSet, currentPlayer, [], capturerId);
                  }
              }, 800);
          }
          return;
        }
    }
  }
  if (piece && piece.color === currentPlayer && (!localPlayerColor || piece.color === localPlayerColor)) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem)); } else { setSelectedSquare(null); setPossibleMoves([]); }
}, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, boardForPostSacrifice, specialActionContext, isExtraTurnFromQueenMove, isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, addLog, handlePieceHover, processPawnSacrificeCheck, triggerSpecialsChain, processMoveEnd, lastMovedPieceType, lastMovedPieceHeldItem, addEffectCallback, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, teleportAllyPieceId, isMoveProcessing, gameInfo.gameOver, isAiThinking, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingAnvilDrop, playerToDropAnvil, pushHistory, saveLoadoutToFirestore, getPlayerDisplayName, isAnySpecialModeActive, aiStrikeCount, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, grappledPieceSubject, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, playerToPromote, grappledItemSubject]);

  const triggerNextSpecialAction_Lobby = (context: any, player: PlayerColor) => {
     triggerSpecialsChain(board, context.currentGraveyard, context.currentKs, context.oldStreak, context.newStreak, context.isExtraTurn, context.newEnPassantTarget, player, context.completedMilestones || [], context.capturingPieceId);
  };

  const initWebSocket = useCallback((onOpenCallback?: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) { if (onOpenCallback) onOpenCallback(); return; }
    setOnlineStatus('connecting'); const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = ''; if (window.location.hostname.includes('cloudworkstations.dev')) { const parts = window.location.hostname.split('-'); parts[0] = '8080'; wsUrl = `${protocol}//${parts.join('-')}`; } else { wsUrl = `${protocol}//${window.location.hostname}:8080`; }
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { setOnlineStatus('connected'); if (onOpenCallback) onOpenCallback(); };
    ws.onerror = (err) => { setOnlineStatus('disconnected'); addLog('Could not connect to game server.'); };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'room-created': setRoomId(data.roomId); setInputRoomId(data.roomId); setLocalPlayerColor(data.color); setBoard(data.gameState.board); setOnlineStatus('waiting'); setGamePlayers(data.gameState.players); addLog(`Room Created ID: ${data.roomId}`); break;
        case 'room-joined': setRoomId(data.roomId); setInputRoomId(data.roomId); setLocalPlayerColor(data.color); setBoard(data.gameState.board); setOnlineStatus('connected'); setGamePlayers(data.gameState.players); addLog(`Connected to Room: ${data.roomId}`); break;
        case 'ranked-match-found': setRoomId(data.roomId); setLocalPlayerColor(data.color); setBoard(data.gameState.board); setOnlineStatus('connected'); setRankedQueueStatus('idle'); setGamePlayers(data.gameState.players); addLog(`Match Found! Playing as ${data.color}`); break;
        case 'player-joined': setGamePlayers(data.gameState.players); setOnlineStatus('connected'); setBoard(data.gameState.board); addLog('Opponent Joined. Game starting!'); break;
        case 'game-move':
          setSelectedSquare(null); setPossibleMoves([]);
          const prevCapsCount = (capturedPieces.white?.length || 0) + (capturedPieces.black?.length || 0);
          const nextCapsCount = (data.gameState.capturedPieces.white?.length || 0) + (data.gameState.capturedPieces.black?.length || 0);
          const isCap = nextCapsCount > prevCapsCount; const isObl = data.gameState.lastMovedPieceType === 'infiltrator' && isCap;
          if (isObl) { audioManager.playObliterate(); addLog("Unit Obliterated!"); addEffectCallback('poof', data.gameState.lastMoveTo); }
          else if (isCap) { audioManager.playCapture(); addLog(`Captured ${data.gameState.lastMovedPieceType || 'unit'} at ${data.gameState.lastMoveTo}!`); addEffectCallback('poof', data.gameState.lastMoveTo); }
          else { audioManager.playMove(); if (data.gameState.lastMovedPieceType && data.gameState.lastMoveTo) { addLog(`${data.gameState.lastMovedPieceType} to ${data.gameState.lastMoveTo}`); } }
          setBoard(data.gameState.board); setCurrentPlayer(data.gameState.currentPlayer); setEnPassantTargetSquare(data.gameState.enPassantTargetSquare); setKillStreaks(data.gameState.killStreaks); setCapturedPieces(data.gameState.capturedPieces); setGameInfo(data.gameState.gameInfo); setGameMoveCounter(data.gameState.gameMoveCounter); setLastMoveFrom(data.gameState.lastMoveFrom); setLastMoveTo(data.gameState.lastMoveTo); setLastMovedPieceType(data.gameState.lastMovedPieceType); setLastMovedPieceHeldItem(data.gameState.lastMovedPieceHeldItem);
          if (data.gameState.resurrectedSquare) { addEffectCallback('light-beam', data.gameState.resurrectedSquare); addLog("Resurrection Call!"); }
          if (data.gameState.gameInfo.isCheck) addLog("Check!"); break;
        case 'awaiting-pawn-sacrifice': setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(data.player); setBoard(data.fullGameState.board); addLog('A sacrifice is required for the Queen!'); break;
        case 'awaiting-commander-promo': setIsAwaitingCommanderPromotion(true); setBoard(data.fullGameState.board); addLog('Ascend your Commander!'); break;
        case 'awaiting-shield-selection': setIsAwaitingHolyShield(true); setSpecialActionContext(data.fullGameState.shieldContext); setBoard(data.fullGameState.board); addLog('Select an ally to shield!'); break;
        case 'awaiting-anvil-drop': setIsAwaitingAnvilDrop(true); setPlayerToDropAnvil(data.player); setSpecialActionContext(data.fullGameState.anvilDropContext); setBoard(data.fullGameState.board); addLog('Anvil Drop ready!'); break;
        case 'awaiting-archer-snipe': setIsAwaitingArcherSnipe(true); setSpecialActionContext(data.fullGameState.archerSnipeContext); setBoard(data.fullGameState.board); addLog('Select a target to Snipe!'); break;
        case 'promotion-required': setPromotionSquare(data.square); setPromotionTargetLevel(data.targetLevel); setIsPromotingPawn(true); setPlayerToPromote(data.player); setBoard(data.fullGameState.board); addLog('Pawn Promotion ready!'); break;
        case 'game-over':
          const overMsg = data.reason === 'timeout' ? 'Player Timed Out!' : (data.reason === 'resign' ? 'Opponent Resigned!' : 'Checkmate!');
          setGameInfo({ gameOver: true, winner: data.winner, message: overMsg, isCheck: false, isCheckmate: data.reason === 'checkmate' || data.reason === 'auto-checkmate', isStalemate: data.reason === 'stalemate', playerWithKingInCheck: null });
          addLog(`GAME OVER: ${overMsg}`); gameOverRef.current = true;
          if (data.winner !== 'draw' && data.winner === localPlayerColor) { setShowWinScreen(true); audioManager.playVictory(); } 
          else if (data.winner !== 'draw' && localPlayerColor && data.winner !== localPlayerColor) { setShowLossScreen(true); audioManager.playDefeat(); }
          if (data.winner === 'draw') { setShowLossScreen(true); }
          if (data.eloChanges) { setEloResult(data.eloChanges); setShowSummary(true); } break;
        case 'error': addLog(`Error: ${data.message}`); break;
      }
    };
    ws.onclose = () => { setOnlineStatus('disconnected'); setRankedQueueStatus('idle'); setRoomId(null); addLog("Disconnected from server."); };
    wsRef.current = ws;
  }, [addLog, localPlayerColor, capturedPieces, addEffectCallback, user, userData, firestore]);

  const handleRankedPlay = useCallback(() => {
    if (!user || (onlineStatus !== 'disconnected' && rankedQueueStatus !== 'searching')) return;
    if (rankedQueueStatus === 'searching') { wsRef.current?.send(JSON.stringify({ type: 'leave-ranked-queue' })); setRankedQueueStatus('idle'); setOnlineStatus('disconnected'); addLog("Left ranked queue."); } 
    else {
        setRankedQueueStatus('searching'); addLog("Searching for ranked match...");
        initWebSocket(() => {
          const equipment: Record<string, string> = {}; board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
          wsRef.current?.send(JSON.stringify({ type: 'join-ranked-queue', userId: user.uid, username: userData?.username || user.displayName || 'Player', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment, unlockedPieces: userData?.unlockedPieces || [], timestamp: Date.now() }));
        });
    }
  }, [user, onlineStatus, rankedQueueStatus, userData, board, initWebSocket, addLog]);

  const handleOnlinePlay = useCallback((action: 'create' | 'join') => {
    if (!user) return;
    if (action === 'create') addLog("Creating game room..."); else addLog(`Joining room: ${inputRoomId}`);
    initWebSocket(() => {
        const equipment: Record<string, string> = {}; board.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
        if (action === 'create') { wsRef.current?.send(JSON.stringify({ type: 'create-room', user: { userId: user.uid, username: userData?.username || user.displayName || 'Host', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment, unlockedPieces: userData?.unlockedPieces || [] } })); } 
        else { wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: inputRoomId, user: { userId: user.uid, username: userData?.username || user.displayName || 'Guest', elo: userData?.eloRating || 1200, wins: userData?.wins || 0, losses: userData?.losses || 0, equipment, unlockedPieces: userData?.unlockedPieces || [] } })); }
    });
  }, [user, userData, inputRoomId, board, initWebSocket, addLog]);

  useEffect(() => {
    if (onlineStatus === 'connected' && localPlayerColor) { setBoardOrientation(localPlayerColor); return; }
    if (viewMode === 'flipping' && onlineStatus === 'disconnected' && !gameInfo.gameOver) { if (!(currentPlayer === 'white' ? isWhiteAI : isBlackAI)) { setBoardOrientation(currentPlayer); } }
  }, [currentPlayer, viewMode, onlineStatus, localPlayerColor, isWhiteAI, isBlackAI, gameInfo.gameOver]);

  useEffect(() => {
    if (!isUserLoading && !hasInitializedSession.current) {
      hasInitializedSession.current = true; const elo = userData?.eloRating || 1200; const unlocks = userData?.unlockedPieces || []; let initial = initializeBoard(elo, elo, unlocks, unlocks);
      if (userData?.equipment) { initial = initial.map(row => row.map(sq => { if (sq.piece && userData.equipment![sq.piece.id]) { return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } }; } return sq; })); }
      setBoard(initial); if (userData?.inventory) setInventory(userData.inventory);
    }
  }, [userData, isUserLoading]);

  useEffect(() => { aiInstanceRef.current = new VibeChessAI(aiDifficulty); }, [aiDifficulty]);

  useEffect(() => {
    if (onlineStatus === 'disconnected' && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI)) && !gameInfo.gameOver && !gameOverRef.current && !isMoveProcessing && !isAnySpecialModeActive && !isAiThinking) {
      const timer = setTimeout(performAiMove, 500); return () => typeof window !== 'undefined' && clearTimeout(timer);
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isMoveProcessing, performAiMove, isAiThinking, gameMoveCounter, onlineStatus, isAnySpecialModeActive]);

  useEffect(() => {
    if (onlineStatus !== 'connected' || gameInfo.gameOver || !roomId) { setTurnTimer(null); return; }
    const isSpecialPhase = isAwaitingPawnSacrifice || isAwaitingCommanderPromotion || isAwaitingHolyShield || isAwaitingAnvilDrop || isAwaitingArcherSnipe || isPromotingPawn || isSelectingMycoSpell || isSelectingTeleportAlly || isSelectingTeleportShroom || isSelectingSporeBombShroom;
    const duration = isSpecialPhase ? 15 : 45; setTurnTimer(duration);
    const intervalId = setInterval(() => { setTurnTimer(prev => { if (prev === null || prev <= 0) { clearInterval(intervalId); return 0; } const next = prev - 1; if (next <= 10 && next > 0) audioManager.playTickDanger(); else if (next > 10) audioManager.playTick(); return next; }); }, 1000);
    return () => clearInterval(intervalId);
  }, [currentPlayer, gameInfo.gameOver, onlineStatus, roomId, gameMoveCounter, isAwaitingPawnSacrifice, isAwaitingCommanderPromotion, isAwaitingHolyShield, isAwaitingAnvilDrop, isAwaitingArcherSnipe, isPromotingPawn, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom]);

  useEffect(() => {
    const status = searchParams.get('checkout_status');
    const itemType = searchParams.get('item_type');
    const transactionId = searchParams.get('transactionId');

    if (status === 'success' && itemType && user && userData) {
        if (userData.processedTransactions?.includes(transactionId)) return;
        
        const userRef = doc(firestore, 'users', user.uid);
        let updates: any = {};
        const currentProcessed = userData.processedTransactions || [];
        updates.processedTransactions = [...currentProcessed, transactionId];

        if (itemType === 'gold_100') {
            updates.goldBalance = (userData.goldBalance || 0) + 100;
            addLog("PURCHASE SUCCESS: +100 Gold Recieved!");
        } else if (itemType === 'gold_600') {
            updates.goldBalance = (userData.goldBalance || 0) + 600;
            addLog("PURCHASE SUCCESS: +600 Gold Recieved!");
        } else if (itemType === 'daily_deal') {
            addLog("DAILY DEAL RECRUITED: Check your Loot Bag!");
        } else if (['dancer', 'mimic', 'grappler', 'myco_mage'].includes(itemType)) {
            const currentUnlocks = userData.unlockedPieces || [];
            if (!currentUnlocks.includes(itemType)) {
                updates.unlockedPieces = [...currentUnlocks, itemType];
                addLog(`UNIT RECRUITED: ${itemType.toUpperCase()} has joined your army!`);
            }
        }

        updateDocumentNonBlocking(userRef, updates);
        audioManager.playLevelUp();
        router.replace('/');
    }
  }, [searchParams, user, userData, firestore, addLog, router]);

  function fullGameReset() {
    const unlocks = userData?.unlockedPieces || []; const userElo = userData?.eloRating || 1200; let initial = initializeBoard(userElo, userElo, unlocks, unlocks);
    if (userData?.equipment) { initial = initial.map(row => row.map(sq => { if (sq.piece && userData.equipment![sq.piece.id]) { return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } }; } return sq; })); }
    setBoard(initial); if (userData?.inventory) setInventory(userData.inventory);
    setCurrentPlayer('white'); setGameInfo({ ...initialGameStatus }); setCapturedPieces({ white: [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setHistoryStack([]); setPositionHistory([]); setSelectedSquare(null); setPossibleMoves([]); setLastMoveFrom(null); setLastMoveTo(null); setLastMovedPieceType(null); setLastMovedPieceHeldItem(null); setGameMoveCounter(0); setEnPassantTargetSquare(null); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setShowLossScreen(false); setShowWinScreen(false); setShowSummary(false); audioManager.playStart();
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setSpecialActionContext(null); setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingShieldScrollTarget(false); setIsAwaitingSwapScrollTarget(false); setIsAwaitingDecreeTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setAbilityChoiceDialog(null); setIsSelectingMycoSpell(false); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(false); setIsSelectingSporeBombShroom(false); setIsAiThinking(false); setIsWhiteAI(false); setIsBlackAI(false); gameOverRef.current = false; addLog("Game Reset."); aiInstanceRef.current = new VibeChessAI(aiDifficulty);
  }

  const handleArenaClick = () => {
    if (userData && userData.goldBalance >= 100) {
      setIsArenaConfirmOpen(true);
    } else {
      toast({ variant: 'destructive', title: "Insufficient Gold", description: "Mint more gold to enter the Arena!" });
    }
  };

  const confirmArenaEntry = () => {
    setIsArenaConfirmOpen(false);
    joinTournamentQueue();
  };

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0.5 pb-1">
        <div className="w-full flex items-center justify-between">
          <div className="w-1/3 flex items-center justify-center"></div>
          <div className="w-1/3 flex items-center justify-center"> <div className="flex items-center gap-1.5 shrink-0"> <PixelAnvil className="h-5 w-5 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-8 w-auto" /> <ShroomIcon className="h-5 w-5 shrink-0 text-destructive" /> </div> </div>
          <div className="w-1/3 flex justify-end"> <AuthWidget /> </div>
        </div>
        <div className={cn("text-center text-[0.65rem] font-bold min-h-[1.2em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}>
          {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isSelectingTeleportAlly ? "SELECT ALLY TO TELEPORT!" : isSelectingTeleportShroom ? "SELECT DESTINATION SHROOM!" : isSelectingSporeBombShroom ? "SELECT SHROOM TO DETONATE!" : isAwaitingGrappleThrow ? "THROW TO AN EMPTY SPACE!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingEarthquakeScrollTarget ? "SELECT CENTER FOR EARTHQUAKE!" : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? `${getPlayerDisplayName(currentPlayer)} is thinking...` : gameInfo.message}
        </div>
        <div className="w-full">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} grappledItemSubject={grappledItemSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} />
        </div>
        <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} />
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
          <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-6 px-1.5 text-[0.65rem]"><BookOpen className="mr-1 h-3 w-3" /> Rules</Button>
          <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || onlineStatus !== 'disconnected'} className="h-6 px-1.5 text-[0.65rem]"><Package className="mr-1 h-3 w-3" /> Loot</Button>
          <Button variant="outline" size="sm" onClick={() => setIsRoyalStoreOpen(true)} className="h-6 px-1.5 text-[0.65rem]" disabled={!user}><Landmark className="mr-1 h-3 w-3" /> Store</Button>
          <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} disabled={onlineStatus !== 'disconnected'} className="h-6 px-1.5 text-[0.65rem]"><RotateCcw className="mr-1 h-3 w-3" /> Reset</Button>
          {onlineStatus === 'disconnected' && ( <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} className="h-6 px-1.5 text-[0.65rem]"><Undo2 className="mr-1 h-3 w-3" /> Undo</Button> )}
          <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]"><Settings className="mr-1 h-3 w-3" /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent></Popover>
          <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]" disabled={onlineStatus !== 'disconnected' || !user}><Swords className="mr-1 h-3 w-3" /> Dungeon</Button></Link>
          <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-6 px-1.5 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Trophy className="mr-1 h-3 w-3" /> L.board</Button></Link>
        </div>
        <div className="flex flex-wrap justify-center items-center gap-0.5 mt-0.5">
            <Button variant="outline" size="sm" onClick={() => setIsWhiteAI(!isWhiteAI)} className="h-6 px-1.5 text-[0.65rem]"><Bot className="mr-1 h-3 w-3" /> W:{isWhiteAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setIsBlackAI(!isBlackAI)} className="h-6 px-1.5 text-[0.65rem]"><Bot className="mr-1 h-3 w-3" /> B:{isBlackAI ? 'On' : 'Off'}</Button>
            <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="h-6 px-1.5 text-[0.65rem]"><View className="mr-1 h-3 w-3" /> View</Button>
        </div>
        <Card className="w-full mt-1"> <CardContent className="p-1.5 flex flex-col gap-1.5"> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={handleArenaClick} disabled={!user || rankedQueueStatus === 'searching'} className="h-6 px-1.5 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Arena <span className="text-yellow-500 ml-1">100g</span> <Coins className="h-3 w-3 text-yellow-500" /> ({tournamentQueueCount}/8)</Button> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || rankedQueueStatus === 'searching'} className="h-6 px-1.5 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Searching...' : 'Ranked Match'}</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-6 px-1.5 text-[0.65rem] w-full"><Globe className="mr-1 h-3 w-3" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-6 px-1.5 text-[0.65rem] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-6 px-1.5 text-[0.65rem]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-1 items-center"> <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-6 px-1.5 text-[0.65rem] w-full"><Link2Off className="mr-1 h-3 w-3" /> Disconnect</Button> </div> )} <div className="w-full text-center h-3 text-[0.65rem] text-muted-foreground uppercase font-pixel tracking-tighter">{onlineStatus}</div> </CardContent> </Card>
      </div>
      <GameSummaryDialog isOpen={showSummary} onClose={() => setShowSummary(false)} winner={gameInfo.winner} winnerName={getPlayerDisplayName(gameInfo.winner as PlayerColor)} loserName={getPlayerDisplayName(gameInfo.winner === 'white' ? 'black' : 'white')} eloInfo={eloResult} moveCount={gameMoveCounter} onReset={() => fullGameReset()} />
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}> 
        <AlertDialogContent> 
          <AlertDialogHeader> 
            <AlertDialogTitle className="font-pixel text-primary uppercase text-[0.75rem]">Reset Game?</AlertDialogTitle>
            <AlertDialogDescription className="text-[0.65rem]"> 
              This will clear the board and reset all streaks. Any unsaved online progress may be lost. 
            </AlertDialogDescription>
          </AlertDialogHeader> 
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-[0.65rem]">Details</AccordionTrigger>
              <AccordionContent className="text-[0.6rem]">This action will restore the board to floor 1 settings.</AccordionContent>
            </AccordionItem>
          </Accordion>
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
            <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed">
              Joining the Arena queue costs <span className="text-yellow-500">100 Gold</span>. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="h-9 text-[0.6rem] uppercase bg-primary text-primary-foreground"
              onClick={confirmArenaEntry}
            >
              Pay 100g & Join
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RoyalStore isOpen={isRoyalStoreOpen} onOpenChange={setIsRoyalStoreOpen} />
    </div>
  );

  const desktopLayout = (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0"> <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={localPlayerColor} getPlayerDisplayName={getPlayerDisplayName} onlineStatus={onlineStatus} turnTimer={turnTimer} activeTimerPlayer={null} /> </div>
      <div className="w-1/2 flex flex-col items-center gap-2"> <div className="w-full flex items-center justify-center gap-6"> <PixelAnvil className="h-10 w-10 text-muted-foreground/50 shrink-0" /> <VibeChessTitle className="h-16 w-auto" /> <ShroomIcon className="h-10 w-10 shrink-0 text-destructive" /> </div> <div className={cn("text-center text-[0.85rem] font-bold min-h-[1.25em]", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isSelectingTeleportAlly ? "SELECT ALLY TO TELEPORT!" : isSelectingTeleportShroom ? "SELECT DESTINATION SHROOM!" : isSelectingSporeBombShroom ? "SELECT SHROOM TO DETONATE!" : isAwaitingGrappleThrow ? "THROW TO AN EMPTY SPACE!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingEarthquakeScrollTarget ? "SELECT CENTER FOR EARTHQUAKE!" : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? `${getPlayerDisplayName(currentPlayer)} is thinking...` : gameInfo.message} </div> <div className="w-full"> <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={isAnySpecialModeActive ? null : enemySelectedSquare} enemyPossibleMoves={isAnySpecialModeActive ? [] : enemyPossibleMoves} onSquareClick={handleSquareClick} playerColor={boardOrientation} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === localPlayerColor)} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={viewMode} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor={localPlayerColor} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} grappledItemSubject={grappledItemSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} /> </div> </div>
      <div className="w-1/4 flex flex-col gap-4"> <AuthWidget /> <Card> <CardContent className="p-2 flex flex-col gap-2"> <div className="flex flex-wrap justify-center items-center gap-1"> <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} /> <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-7 px-2 text-[0.65rem]"><BookOpen className="mr-2 h-4 w-4" /> Rules</Button> <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={!user || onlineStatus !== 'disconnected'} className="h-7 px-2 text-[0.65rem]"><Package className="mr-2 h-4 w-4" /> Loot</Button> <Button variant="outline" size="sm" onClick={() => setIsRoyalStoreOpen(true)} className="h-7 px-2 text-[0.65rem]" disabled={!user}><Landmark className="mr-2 h-4 w-4" /> Store</Button> <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} disabled={onlineStatus !== 'disconnected'} className="h-7 px-2 text-[0.65rem]"><RotateCcw className="mr-1 h-3 w-3" /> Reset Game</Button> {onlineStatus === 'disconnected' && ( <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} className="h-7 px-2 text-[0.65rem]"><Undo2 className="mr-2 h-4 w-4" /> Undo Move</Button> )} <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]"><Settings className="mr-2 h-4 w-4" /> Settings</Button></PopoverTrigger><PopoverContent className="w-64 bg-card border-border"><div className="space-y-6 py-2"><div className="space-y-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">SFX Volume</span><Volume2 className="h-4 w-4 text-primary" /></div><Slider defaultValue={[volume]} max={200} step={1} onValueChange={(val) => { setVolume(val[0]); audioManager.setVolume(val[0]); }} /></div><div className="space-y-4 border-t pt-4"><div className="flex items-center justify-between"><span className="text-[0.75rem] font-pixel uppercase">AI Depth</span><BrainCircuit className="h-4 w-4 text-primary" /></div><Slider defaultValue={[aiDifficulty]} min={2} max={8} step={1} onValueChange={(val) => setAiDifficulty(val[0])} /></div></div></PopoverContent></Popover> <Link href="/dungeon" className={cn(!user && "pointer-events-none")}><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected' || !user}><Swords className="mr-2 h-4 w-4" /> Dungeon</Button></Link> <Link href="/leaderboard"><Button variant="outline" size="sm" className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Trophy className="mr-2 h-4 w-4" /> L.board</Button></Link> <Button variant="outline" size="sm" onClick={() => setIsWhiteAI(!isWhiteAI)} className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Bot className="mr-2 h-4 w-4" /> W-AI:{isWhiteAI ? 'On' : 'Off'}</Button> <Button variant="outline" size="sm" onClick={() => setIsBlackAI(!isBlackAI)} className="h-7 px-2 text-[0.65rem]" disabled={onlineStatus !== 'disconnected'}><Bot className="mr-2 h-4 w-4" /> B-AI:{isBlackAI ? 'On' : 'Off'}</Button> <Button variant="outline" size="sm" onClick={() => setViewMode(prev => prev === 'flipping' ? 'tabletop' : 'flipping')} className="h-7 px-2 text-[0.65rem]"><View className="mr-2 h-4 w-4" /> View Mode</Button> </div> {onlineStatus === 'disconnected' ? ( <div className="flex flex-col gap-1 items-center"> <Button variant="outline" size="sm" onClick={handleArenaClick} disabled={!user || rankedQueueStatus === 'searching'} className="h-7 px-2 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />Arena <span className="text-yellow-500 ml-1">100g</span> <Coins className="h-3 w-3 text-yellow-500" /> ({tournamentQueueCount}/8)</Button> <Button variant="outline" size="sm" onClick={handleRankedPlay} disabled={!user || rankedQueueStatus === 'searching'} className="h-7 px-2 text-[0.65rem] w-full"><Trophy className="mr-1 h-3 w-3" />{rankedQueueStatus === 'searching' ? 'Leave Queue' : 'Ranked Match'}</Button> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('create')} disabled={!user} className="h-7 px-2 text-[0.65rem] w-full"><Globe className="mr-2 h-4 w-4" /> Create Online Game</Button> <div className="flex gap-1 items-center w-full"> <Input type="text" placeholder="Room ID" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value)} className="h-7 px-2 text-[0.65rem] flex-grow" /> <Button variant="outline" size="sm" onClick={() => handleOnlinePlay('join')} disabled={!inputRoomId} className="h-7 px-2 text-[0.65rem]">Join</Button> </div> </div> ) : ( <div className="flex flex-col gap-2 items-center border-t pt-2"> <div className="flex items-center gap-2 text-[0.65rem] font-pixel text-primary uppercase"> <span>Room: {roomId || inputRoomId}</span> <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => { navigator.clipboard.writeText(roomId || inputRoomId); addLog("Room ID Copied!"); }}> <Copy className="h-3 w-3" /> </Button> </div> <Button variant="destructive" size="sm" onClick={() => wsRef.current?.close()} className="h-7 px-2 text-[0.65rem] w-full">Disconnect</Button> </div> )} <div className="w-full text-center h-4 text-[0.65rem] mt-1 text-muted-foreground uppercase font-pixel">{onlineStatus}</div> </CardContent> </Card> </div>
    </div>
  );

  return (
    <div className={cn("min-h-full h-full w-full bg-background flex flex-col relative", showLossScreen && "after:animate-fade-to-black")}>
      {showWinScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-primary font-sans text-center">YOU WON</p></div>)}
      {showLossScreen && (<div className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer" style={{ animation: 'flash-loss 3s forwards' }} onClick={() => fullGameReset()}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center">YOU LOST</p></div>)}
      <div className="lg:hidden h-full">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <div className="fixed bottom-4 left-4 z-50 pointer-events-none"> <PixelAnvil className="h-12 w-12 text-muted-foreground opacity-10" /> </div>
      <div className="fixed bottom-4 left-4 z-50 pointer-events-none"> <PixelAnvil className="h-12 w-12 text-muted-foreground opacity-10" /> </div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={(type) => { if (type.startsWith('portal_scroll_')) { addLog("Portal Logic: skip floors in Dungeon Mode!"); } }} usedSlots={usedSlots} attunementSlots={attunementSlots} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor={playerToPromote} />
      <MycoSpellMenu isOpen={isSelectingMycoSpell} mana={selectedSquare ? (board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.shroomMana || 0) : 0} onSelectSpell={handleMycoSpellSelect} onOpenChange={setIsSelectingMycoSpell} />
      <AlertDialog open={abilityChoiceDialog?.isOpen} onOpenChange={(open) => !open && setAbilityChoiceDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select Action</AlertDialogTitle>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Details</AccordionTrigger>
                <AccordionContent>This piece has multiple special actions available. Choose one to perform.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={() => abilityChoiceDialog?.onChoice('ability')}>Use Piece Ability</Button>
            <Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}>Use Magic Item (Scroll)</Button>
          </div>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}> 
        <AlertDialogContent> 
          <AlertDialogHeader> 
            <AlertDialogTitle className="font-pixel text-primary uppercase text-[0.75rem]">Reset Game?</AlertDialogTitle>
            <AlertDialogDescription className="text-[0.65rem]"> 
              This will clear the board and reset all streaks. Any unsaved online progress may be lost. 
            </AlertDialogDescription>
          </AlertDialogHeader> 
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-[0.65rem]">Details</AccordionTrigger>
              <AccordionContent className="text-[0.6rem]">This action will restore the board to floor 1 settings.</AccordionContent>
            </AccordionItem>
          </Accordion>
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
            <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed">
              Joining the Arena queue costs <span className="text-yellow-500">100 Gold</span>. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="h-9 text-[0.6rem] uppercase bg-primary text-primary-foreground"
              onClick={confirmArenaEntry}
            >
              Pay 100g & Join
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RoyalStore isOpen={isRoyalStoreOpen} onOpenChange={setIsRoyalStoreOpen} />
    </div>
  );
}
