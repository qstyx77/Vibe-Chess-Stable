'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import { InventoryWindow } from '@/components/evolving-chess/InventoryWindow';
import { MycoSpellMenu, type MycoSpell } from '@/components/evolving-chess/MycoSpellMenu';
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
  isValidSquare,
  processRookResurrectionCheck,
  spawnShroom,
  findKing,
  processPoisonDamage,
  getEffectiveLevel,
  getPromotionLevel,
  VAL_MAP,
  isItemValidForPiece,
  isSilenced,
  FRONTLINE_TYPES,
  isSquareAttacked,
  processOilSlickTimers,
  boardToPositionHash,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, InventoryItem, InventoryItemType, AIGameState, AIBoardState, AISquareState, SquareState, ItemType, ChatMessage, MessageCategory } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Skull, RotateCcw, Package, BookOpen, MessageSquare, Send, Sword, Users, ShoppingBag, ScrollText, ChevronDown } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { AuthWidget } from '@/components/auth/AuthWidget';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import {
  Card,
  CardContent
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { audioManager } from '@/lib/audio-manager';
import { useSocial } from '@/components/social/SocialContext';
import { ChessPieceDisplay } from '@/components/evolving-chess/ChessPieceDisplay';
import { PieceAbilitiesInfo } from '@/components/evolving-chess/PieceAbilitiesInfo';
import { Separator } from '@/components/ui/separator';

function generateDungeonFloor(level: number, playerArmy: Piece[]): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      row.push({ piece: null, item: null, algebraic: coordsToAlgebraic(r, c), rowIndex: r, colIndex: c, oilSlickTurnsRemaining: 0, phasedPiece: null, phasedTurnsRemaining: 0 });
    }
    board.push(row);
  }
  const king = playerArmy.find(p => p.type === 'king');
  const queens = playerArmy.filter(p => p.type === 'queen');
  const rooks = playerArmy.filter(p => p.type === 'rook' || p.type === 'palace');
  const knights = playerArmy.filter(p => p.type === 'knight' || p.type === 'hero' || p.type === 'archer');
  const bishops = playerArmy.filter(p => p.type === 'bishop' || p.type === 'archbishop');
  const frontline = playerArmy.filter(p => FRONTLINE_TYPES.includes(p.type)).sort(() => Math.random() - 0.5);
  const placedIds = new Set<string>();
  const placePieceAt = (p: Piece | undefined, alg: AlgebraicSquare) => {
    if (!p) return false;
    const { row, col } = algebraicToCoords(alg);
    if (isValidSquare(row, col) && !board[row][col].piece) {
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
        placedIds.add(p.id); return true;
    }
    return false;
  };
  placePieceAt(king, 'e1');
  if (rooks[0]) placePieceAt(rooks[0], 'a1'); if (rooks[1]) placePieceAt(rooks[1], 'h1');
  if (queens[0]) placePieceAt(queens[0], 'd1'); if (knights[0]) placePieceAt(knights[0], 'b1'); if (knights[1]) placePieceAt(knights[1], 'g1');
  if (bishops[0]) placePieceAt(bishops[0], 'c1'); if (bishops[1]) placePieceAt(bishops[1], 'f1');
  const guardSlots: AlgebraicSquare[] = ['d2', 'e2', 'f2'];
  const wingSlots: AlgebraicSquare[] = (['a2', 'b2', 'c2', 'g2', 'h2'] as AlgebraicSquare[]).sort(() => Math.random() - 0.5);
  const frontlineOrder = [...guardSlots, ...wingSlots];
  let frontlineIdx = 0;
  for (const alg of frontlineOrder) {
    while (frontlineIdx < frontline.length && placedIds.has(frontline[frontlineIdx].id)) { frontlineIdx++; }
    if (frontlineIdx < frontline.length) { placePieceAt(frontline[frontlineIdx], alg); frontlineIdx++; }
  }
  const piecePriority = (type: PieceType) => {
    const values: Record<string, number> = { queen: 90, palace: 60, rook: 50, archbishop: 40, hero: 35, archer: 35, bishop: 30, knight: 30, commander: 10, infiltrator: 10, dancer: 10, mimic: 10, grappler: 10, myco_mage: 10, pawn: 10 };
    return values[type] || 0;
  };
  const remainingPieces = playerArmy.filter(p => !placedIds.has(p.id)).sort((a, b) => piecePriority(b.type) - piecePriority(a.type));
  const fillOrder: AlgebraicSquare[] = [ 'd1', 'e1', 'c1', 'f1', 'b1', 'g1', 'a1', 'h1', 'd2', 'e2', 'c2', 'f2', 'b2', 'g2', 'a2', 'h2', 'd3', 'e3', 'c3', 'f3', 'b3', 'g3', 'a3', 'h3', 'd4', 'e4', 'c4', 'f4', 'b4', 'g4', 'a4', 'h4' ];
  let fillIdx = 0;
  for (const p of remainingPieces) {
    while (fillIdx < fillOrder.length) {
        const alg = fillOrder[fillIdx] as AlgebraicSquare; const { row, col } = algebraicToCoords(alg);
        if (!board[row][col].piece) { placePieceAt(p, alg); break; }
        fillIdx++;
    }
  }
  const isBossLevel = level % 10 === 0;
  if (isBossLevel) {
    const bossLevelIndex = Math.floor(level / 10);
    switch (bossLevelIndex) {
      case 1: 
        board[0][3].piece = { id: 'boss-hydra-1', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-hydra-2', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][5].piece = { id: 'boss-hydra-3', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][3].piece = { id: 'hydra-guard-1', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][5].piece = { id: `hydra-guard-2`, type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 2: 
        board[0][2].piece = { id: 'boss-necro', type: 'archbishop', color: 'black', level: 8, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<4; i++) board[1][i+2].piece = { id: `skeleton-${i}`, type: 'pawn', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][1].piece = { id: 'necro-knight-1', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][6].piece = { id: 'necro-knight-2', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 3: 
        const colL = 15;
        board[0][3].piece = { id: 'boss-colossus-tl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-colossus-tr', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][3].piece = { id: 'boss-colossus-bl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][4].piece = { id: 'boss-colossus-br', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) { if (i === 3 || i === 4) continue; board[1][i].piece = { id: `skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null }; }
        for(let i=0; i<8; i++) board[2][i].piece = { id: `front-skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 4: 
        board[0][3].piece = { id: 'boss-mirage', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) board[0][i].piece = board[0][i].piece || { id: `phantom-${i}`, type: 'bishop', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 5: 
        board[0][4].piece = { id: 'boss-entity', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) {
          const type: PieceType = i % 2 === 0 ? 'hero' : 'archbishop';
          board[0][i].piece = board[0][i].piece || { id: `aspect-${i}`, type, color: 'black', level: 6, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        }
        break;
    }
  } else {
    const pieceCount = Math.min(16, 2 + Math.floor(level / 3));
    const avgLevel = Math.max(1, Math.floor(level / 7) + 1);
    const chosenSquares = [];
    for(let r=0; r<4; r++) for(let c=0; c<8; c++) chosenSquares.push({r,c});
    chosenSquares.sort(() => Math.random() - 0.5).slice(0, pieceCount).forEach((pos, i) => {
      const types: PieceType[] = ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook'];
      if (level > 15) types.push('commander', 'infiltrator');
      if (level > 25) types.push('queen', 'archbishop', 'archer');
      const type = types[Math.floor(Math.random() * types.length)];
      const pLevel = avgLevel + (Math.random() > 0.6 ? 1 : 0);
      board[pos.r][pos.c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: pLevel, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
    });
  }
  return board;
}

function adaptBoardForAI(currentBoardState: BoardState, playerForAITurn: PlayerColor, currentKillStreaks: { white: number; black: number }, currentCapturedPieces: { white: Piece[]; black: Piece[] }, gameMoveCounter: number, firstBloodAchieved: boolean, playerWhoGotFirstBlood: PlayerColor | null, enPassantTargetSquare: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, shroomSpawnCounter?: number, nextShroomSpawnTurn?: number, necroResurrectionCounter?: number, lastMovedPieceLevel?: number | null, didOpponentCaptureLastTurn?: boolean, positionHistory?: string[]): AIGameState {
  const newAiBoard: AIBoardState = [];
  for (let r_idx = 0; r_idx < 8; r_idx++) {
    const boardRow = currentBoardState[r_idx]; const newAiRow: AISquareState[] = [];
    if (boardRow) { for (let c_idx = 0; c_idx < 8; c_idx++) { const squareState = boardRow[c_idx]; newAiRow.push({ piece: squareState?.piece ? { ...squareState.piece } : null, item: squareState?.item ? { ...squareState.item } : null }); } } 
    else { for (let c_idx = 0; c_idx < 8; c_idx++) newAiRow.push({ piece: null, item: null }); }
    newAiBoard.push(newAiRow);
  }
  return { board: newAiBoard, currentPlayer: playerForAITurn, killStreaks: { white: currentKillStreaks?.white || 0, black: currentKillStreaks?.black || 0 }, capturedPieces: { white: currentCapturedPieces?.white ? currentCapturedPieces.white.map(p => ({ ...p })) : [], black: currentCapturedPieces?.black ? currentCapturedPieces.black.map(p => ({ ...p })) : [] }, gameOver: false, winner: undefined, extraTurn: false, gameMoveCounter: gameMoveCounter, firstBloodAchieved: firstBloodAchieved, playerWhoGotFirstBlood: playerWhoGotFirstBlood, enPassantTargetSquare: enPassantTargetSquare, shroomSpawnCounter: shroomSpawnCounter, nextShroomSpawnTurn: nextShroomSpawnTurn, necroResurrectionCounter: necroResurrectionCounter, lastMovedPieceType: lastMovedPieceType, lastMovedPieceHeldItem: lastMovedPieceHeldItem, lastMovedPieceLevel: lastMovedPieceLevel, didOpponentCaptureLastTurn: didOpponentCaptureLastTurn, positionHistory: positionHistory ? [...positionHistory] : [] };
}

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
  const { 
    addLog, 
    messages, 
    sendMessage, 
    isMessengerOpen, 
    setIsMessengerOpen, 
    hasUnread, 
    clearUnread, 
    visibleCategories, 
    setVisibleCategories, 
    chatInput, 
    setChatInput 
  } = useSocial();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [playerArmy, setPlayerArmy] = useState<Piece[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({ message: " ", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [positionHistory, setPositionHistory] = useState<string[]>([]);
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [lastMovedPieceType, setLastMovedPieceType] = useState<PieceType | null>(null);
  const [lastMovedPieceHeldItem, setLastMovedPieceHeldItem] = useState<InventoryItemType | null>(null);
  const [lastMovedPieceLevel, setLastMovedPieceLevel] = useState<number | null>(null);
  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(5);
  const [necroResurrectionCounter, setNecroResurrectionCounter] = useState(0);
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [playerToDropAnvil, setPlayerToDropAnvil] = useState<PlayerColor | null>(null);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [promotionQueue, setPromotionQueue] = useState<{ square: AlgebraicSquare, targetLevel: number }[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);
  const [didCaptureLastTurn, setDidCaptureLastTurn] = useState<{ white: boolean, black: boolean }>({ white: false, black: false });
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);

  const [specialActionContext, setSpecialActionContext] = useState<any>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [isAwaitingDanceTarget, setIsAwaitingDanceTarget] = useState(false);
  const [dancerToDance, setDancerToDance] = useState<AlgebraicSquare | null>(null);
  const [isAwaitingGrappleThrow, setIsAwaitingGrappleThrow] = useState(false);
  const [grappledPieceSubject, setGrappledPieceSubject] = useState<any>(null);
  const [grappledItemSubject, setGrappledItemSubject] = useState<any>(null);
  const [isSelectingMycoSpell, setIsSelectingMycoSpell] = useState(false);
  const [isSelectingTeleportAlly, setIsSelectingTeleportAlly] = useState(false);
  const [isSelectingTeleportShroom, setIsSelectingTeleportShroom] = useState(false);
  const [teleportAllyPieceId, setTeleportAllyPieceId] = useState<string | null>(null);
  const [isSelectingSporeBombShroom, setIsSelectingSporeBombShroom] = useState(false);
  const [isAwaitingOilSlickTarget, setIsAwaitingOilSlickTarget] = useState(false);
  const [isAwaitingRayTarget, setIsAwaitingRayTarget] = useState<'glacial' | 'burning' | null>(null);
  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [isAwaitingDecreeTarget, setIsAwaitingDecreeTarget] = useState(false);
  const [isAwaitingEarthquakeScrollTarget, setIsAwaitingEarthquakeScrollTarget] = useState(false);

  const uniqueIdCounterRef = useRef(30000);
  const gameOverRef = useRef(false);
  const isInitialized = useRef(false);
  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    if (player === 'white') return userData?.username || 'Hero';
    return 'Dungeon';
  }, [userData]);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200; return elo <= 1200 ? 2 : 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => board.flat().filter(sq => sq.piece?.heldItem).length, [board]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number, itemType?: InventoryItemType) => {
    const id = `eff-${Date.now()}-${Math.random()}`; setEffects(prev => [...prev, { id, type, square, color, value, itemType }]);
    setTimeout(() => { setEffects(curr => curr.filter(e => e.id !== id)); }, 1500);
  }, []);

  const saveDungeonState = useCallback((currentLevel: number, currentBoard: BoardState, currentP: PlayerColor, ks: any, caps: any, shroomC: number, nextShroom: number, ep: AlgebraicSquare | null, nrc: number, currentInv: InventoryItem[]) => {
    if (!user || !firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid); const equipment: Record<string, string> = {};
    currentBoard.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
    updateDocumentNonBlocking(userDocRef, { inventory: currentInv, equipment, dungeonState: { level: currentLevel, board: currentBoard.flat(), currentPlayer: currentP, killStreaks: ks, capturedPieces: caps, shroomSpawnCounter: shroomC, nextShroomSpawnTurn: nextShroom, enPassantTargetSquare: ep, necroResurrectionCounter: nrc } });
  }, [user, firestore]);

  const handlePieceHover = useCallback((p: Piece | null) => { setPieceForInfoDisplay(p); }, []);

  const advanceLevel = useCallback((survivors: Piece[], graveyard: any) => {
    const nextLevelNum = level + 1;
    if (nextLevelNum > 50) { 
        setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' })); gameOverRef.current = true; audioManager.playVictory(); return; 
    }
    setLevel(nextLevelNum); setBoard(generateDungeonFloor(nextLevelNum, survivors)); setPlayerArmy(survivors); setCapturedPieces({ white: graveyard.white, black: [] }); setKillStreaks({ white: 0, black: 0 }); setPositionHistory([]); setEnPassantTargetSquare(null); setLastMovedPieceType(null); setLastMovedPieceLevel(null); setLastMoveFrom(null); setLastMoveTo(null);
    saveDungeonState(nextLevelNum, generateDungeonFloor(nextLevelNum, survivors), 'white', { white: 0, black: 0 }, { white: graveyard.white, black: [] }, 0, 5, null, 0, inventory);
    audioManager.playLevelUp(); addLog(`Descending to Floor ${nextLevelNum}...`);
  }, [level, inventory, saveDungeonState, addLog]);

  const processMoveEnd = useCallback((boardAfter: BoardState, nextGraveyard: any, currentKs: any, turnPlayer: PlayerColor, extra: boolean, nextEpSquare: AlgebraicSquare | null = null, wasCapture: boolean = false, movedType?: PieceType | null) => {
    let nextBoard = boardAfter;
    setDidCaptureLastTurn(prev => ({ ...prev, [turnPlayer]: wasCapture }));
    nextBoard = processOilSlickTimers(nextBoard, turnPlayer);
    
    const actualType = movedType || lastMovedPieceType;
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    
    const currentHash = boardToPositionHash(nextBoard, nextP, nextEpSquare);
    let newHistory = [...positionHistory];
    const isFrontlineMove = actualType && FRONTLINE_TYPES.includes(actualType);
    if (wasCapture || isFrontlineMove) {
        newHistory = [currentHash];
    } else {
        newHistory.push(currentHash);
    }
    setPositionHistory(newHistory);
    const repetitionCount = newHistory.filter(h => h === currentHash).length;
    const isRepetition = repetitionCount >= 3;

    const { newBoard: boardPoisoned, poisonedCaptures } = processPoisonDamage(nextBoard, nextP);
    nextBoard = boardPoisoned;
    if (poisonedCaptures.length > 0) {
        poisonedCaptures.forEach(p => { nextGraveyard[p.color].push({ ...p }); });
        audioManager.playCapture(); addLog(`${poisonedCaptures.length} units decayed.`);
    }
    setBoard(nextBoard); setCapturedPieces(nextGraveyard); setKillStreaks(currentKs); setEnPassantTargetSquare(nextEpSquare); setCurrentPlayer(nextP);
    
    const dungeonKing = findKing(nextBoard, 'black');
    const isDungeonMated = dungeonKing && isCheckmate(nextBoard, 'black', nextEpSquare, actualType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (isDungeonMated) { advanceLevel(nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!), nextGraveyard); return; }
    
    const playerKing = findKing(nextBoard, 'white');
    if (!playerKing || isCheckmate(nextBoard, 'white', nextEpSquare, actualType, lastMovedPieceHeldItem, lastMovedPieceLevel)) {
      setGameInfo({ message: "YOUR KING HAS FALLEN", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); gameOverRef.current = true; audioManager.playDefeat(); return;
    }
    
    const inCheck = isKingInCheck(nextBoard, nextP, nextEpSquare, actualType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    const stale = !inCheck && isStalemate(nextBoard, nextP, nextEpSquare, actualType, lastMovedPieceHeldItem, lastMovedPieceLevel);

    if (stale || isRepetition) {
        const msg = isRepetition ? "Draw by Repetition!" : "Stalemate!";
        setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
        addLog(msg); gameOverRef.current = true; return;
    }

    setGameInfo({ message: inCheck ? "Check!" : " ", isCheck: inCheck, playerWithKingInCheck: inCheck ? nextP : null, isCheckmate: false, isStalemate: false, gameOver: false });
    if (inCheck) addLog("Check!");
  }, [advanceLevel, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addLog, positionHistory]);

  const triggerSpecialsChain = useCallback((b: BoardState, g: any, ks: any, os: number, ns: number, ex: boolean, ep: any, pl: any, m: any = [], cid: any = null, wc: boolean = false, mt: any = null) => {
    processMoveEnd(b, g, ks, pl, ex, ep, wc, mt);
  }, [processMoveEnd]);

  const handlePromotionSelect = useCallback((type: PieceType) => {
    setIsPromotingPawn(false); setPromotionSquare(null);
    let nextB = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare!);
    nextB[row][col].piece = { ...nextB[row][col].piece!, type, hasMoved: true };
    setBoard(nextB); audioManager.playLevelUp();
    addLog(`Hero: Pawn promoted to ${type}!`);
    triggerSpecialsChain(nextB, capturedPieces, killStreaks, 0, 0, false, null, 'white', [], null, false, type);
  }, [board, promotionSquare, capturedPieces, killStreaks, triggerSpecialsChain, addLog]);

  const handleSquareClick = useCallback((alg: AlgebraicSquare) => {
    if (clickGuard.current) return;
    const { row, col } = algebraicToCoords(alg); const sq = board[row][col]; const piece = sq.piece;
    handlePieceHover(piece);
    if (isInventoryOpen) {
       if (selectedInventoryItemType && piece && piece.color === 'white') {
           const nextB = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
           nextB[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextB);
           setSelectedInventoryItemType(null); audioManager.playLevelUp();
       }
       return;
    }

    if (selectedSquare) {
       const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
       const moving = board[fR][fC].piece;
       
       if (moving?.type === 'grappler' && !isSilenced(board, fR, fC, 'white')) {
           const tSq = board[row][col];
           const tP = tSq.piece;
           const tA = tSq.item?.type === 'anvil' && moving.heldItem === 'power_glove';
           if ((tP && tP.type !== 'king') || tA) {
               if (possibleMoves.includes(alg)) {
                   if (tP) setGrappledPieceSubject({ piece: { ...tP }, from: alg });
                   else setGrappledItemSubject({ type: 'anvil', from: alg });
                   
                   setIsAwaitingGrappleThrow(true);
                   const range = getEffectiveLevel(board, fR, fC);
                   const tT: AlgebraicSquare[] = [];
                   for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                       const d = Math.max(Math.abs(tr-fR), Math.abs(tc-fC));
                       if (d>0 && d<=range && (tr===fR||tc===fC||Math.abs(tr-fR)===Math.abs(tc-fC)) && !board[tr][tc].piece && !board[tr][tc].item) tT.push(coordsToAlgebraic(tr,tc));
                   }
                   setPossibleMoves(tT);
                   addLog("Grappler: Select destination to throw!");
                   return;
               }
           }
       }

       const moves = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
       if (moves.includes(alg)) {
          const movingPiece = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece;
          setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(alg);
          setLastMoveFrom(selectedSquare); setLastMoveTo(alg);
          const result = applyMove(board, { from: selectedSquare, to: alg, type: 'move' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
          setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
          addLog(`Hero: ${movingPiece?.type} to ${alg}`);
          setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', result.extraTurn, result.enPassantTargetSet, !!result.capturedPiece, movingPiece?.type); }, 800);
          return;
       }
    }
    if (piece && piece.color === currentPlayer) { setSelectedSquare(alg); setPossibleMoves(getPossibleMoves(board, alg, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel)); } 
    else { setSelectedSquare(null); setPossibleMoves([]); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, capturedPieces, killStreaks, isInventoryOpen, selectedInventoryItemType, handlePieceHover, processMoveEnd, addLog]);

  const startRun = useCallback((reset: boolean = false) => {
    if (isUserLoading || !userData || !user) return;
    setIsMoveProcessing(false); clickGuard.current = false; setSelectedSquare(null); setPossibleMoves([]); setPositionHistory([]); gameOverRef.current = false;
    setLastMoveFrom(null); setLastMoveTo(null);
    setIsAwaitingDanceTarget(false); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setIsInventoryOpen(false); setIsSelectingMycoSpell(false); setIsAiThinking(false); setPromotionQueue([]); setDidCaptureLastTurn({ white: false, black: false });
    const saved = userData.dungeonState;
    if (!reset && saved && saved.board && saved.board.length > 0) {
      setLevel(saved.level); const loadedBoard: BoardState = []; const savedBoard1D = saved.board as SquareState[];
      for (let i = 0; i < 8; i++) loadedBoard.push(savedBoard1D.slice(i * 8, i * 8 + 8)); 
      setBoard(loadedBoard); setCurrentPlayer(saved.currentPlayer); setKillStreaks(saved.killStreaks); setCapturedPieces(saved.capturedPieces); setEnPassantTargetSquare(saved.enPassantTargetSquare);
    } else {
      let army: Piece[] = []; const elo = userData.eloRating || 1200; let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []);
      initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); });
      setPlayerArmy(army); setLevel(1); const newB = generateDungeonFloor(1, army); setBoard(newB);
      setCapturedPieces({ white: [], black: [] }); setCurrentPlayer('white'); setKillStreaks({ white: 0, black: 0 });
      saveDungeonState(1, newB, 'white', { white: 0, black: 0 }, { white: [], black: [] }, 0, 5, null, 0, userData.inventory || []);
    }
    aiInstance.current = new VibeChessAI(4); audioManager.playStart();
  }, [userData, isUserLoading, user, saveDungeonState]);

  useEffect(() => { if (!isInitialized.current && !isUserLoading) { isInitialized.current = true; startRun(); } }, [isUserLoading, startRun]);
  useEffect(() => { if (userData?.inventory) setInventory(userData.inventory); }, [userData]);

  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || isMoveProcessing || isAiThinking || currentPlayer !== 'black') return;
    setIsAiThinking(true);
    const gameState = adaptBoardForAI(board, 'black', killStreaks, capturedPieces, 0, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter, lastMovedPieceLevel, didCaptureLastTurn.white, positionHistory);
    const aiResult = aiInstance.current?.getBestMove(gameState, 'black');
    if (aiResult?.move) {
        const move = aiResult.move;
        const fromAlg = coordsToAlgebraic(move.from[0], move.from[1]);
        const toAlg = coordsToAlgebraic(move.to[0], move.to[1]);
        const movingPiece = board[move.from[0]][move.from[1]].piece;
        setIsMoveProcessing(true); setAnimatedSquareTo(toAlg);
        setLastMoveFrom(fromAlg); setLastMoveTo(toAlg);
        const result = applyMove(board, { from: fromAlg, to: toAlg, type: 'move' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
        setBoard(result.newBoard);
        addLog(`Dungeon: ${movingPiece?.type} to ${toAlg}`);
        setTimeout(() => { setIsMoveProcessing(false); setIsAiThinking(false); processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'black', result.extraTurn, result.enPassantTargetSet, !!result.capturedPiece, movingPiece?.type); }, 800);
    } else { setIsAiThinking(false); }
  }, [board, currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, killStreaks, capturedPieces, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter, lastMovedPieceLevel, didCaptureLastTurn, positionHistory, processMoveEnd, addLog]);

  useEffect(() => {
    if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAiThinking) {
      const timer = setTimeout(performAiMove, 1000); return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, performAiMove]);

  const isAnySpecialModeActive = useMemo(() => isInventoryOpen || isPromotingPawn || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingPawnSacrifice || isAwaitingCommanderPromotion || isSelectingMycoSpell || isAwaitingGrappleThrow, [isInventoryOpen, isPromotingPawn, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingPawnSacrifice, isAwaitingCommanderPromotion, isSelectingMycoSpell, isAwaitingGrappleThrow]);

  const statusMessage = useMemo(() => {
    if (isAiThinking) return "DUNGEON IS THINKING...";
    if (gameInfo.message !== " ") return gameInfo.message;
    return "";
  }, [isAiThinking, gameInfo.message]);

  const getMessageColor = (msg: ChatMessage) => {
      if (msg.category === 'log' || msg.sender === 'SYSTEM') return 'text-primary'; 
      if (msg.category === 'social') return 'text-accent'; 
      if (msg.category === 'market') return 'text-yellow-500';
      if (msg.color === 'white') return 'text-foreground'; 
      if (msg.color === 'black') return 'text-secondary'; 
      return 'text-muted-foreground';
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput.trim(), 'battle');
      setChatInput('');
    }
  };

  const toggleCategory = (cat: MessageCategory) => {
    const next = new Set(visibleCategories);
    if (next.has(cat)) {
        next.delete(cat);
    } else {
        next.add(cat);
        clearUnread(cat);
    }
    setVisibleCategories(next);
  };

  const hasAnyUnread = hasUnread.battle || hasUnread.social || hasUnread.log || hasUnread.market;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-pixel uppercase overflow-hidden p-0.5">
      {/* HEADER */}
      <div className="px-4 py-1 flex items-center justify-between shrink-0">
        <Link href="/" className="flex items-center gap-1 text-[10px] hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> LOBBY
        </Link>
        <div className="flex items-center gap-2">
          {level % 10 === 0 ? <Skull className="h-4 w-4 text-destructive" /> : <Sword className="h-4 w-4 text-primary" />}
          <h1 className="text-sm font-bold tracking-tighter uppercase">FLOOR {level}</h1>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase gap-1 border-2" onClick={() => setIsResetConfirmOpen(true)}>
          <RotateCcw className="h-3 w-3" /> RESET
        </Button>
      </div>

      {/* STATUS LINE */}
      <div className="text-center py-0 shrink-0 min-h-[0.75rem]">
        <p className="text-[10px] font-bold text-primary uppercase animate-pulse">
           {statusMessage}
        </p>
      </div>

      {/* BOARD */}
      <div className="w-full flex justify-center py-0.5 shrink-0">
        <div className="w-full max-w-[min(95vw,70vh)] aspect-square relative">
          <ChessBoard boardState={board} selectedSquare={selectedSquare} possibleMoves={possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking || isAnySpecialModeActive} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor="white" isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} />
        </div>
      </div>

      {/* INTEGRATED PANEL */}
      <div className="flex-grow min-h-0 flex flex-col p-0.5">
        <Card className="mx-1 mb-1 flex-grow border-2 border-border/50 bg-card flex flex-col overflow-hidden relative">
          {isMessengerOpen ? (
              <div className="p-2 flex flex-col h-full space-y-2">
                  <div className="flex items-center justify-between">
                      <button 
                          onClick={() => setIsMessengerOpen(false)}
                          className="p-1 hover:bg-muted transition-colors rounded-sm"
                      >
                          <MessageSquare className="h-4 w-4 text-primary" />
                      </button>
                      <div className="flex gap-1">
                          <Button variant={visibleCategories.has('battle') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCategory('battle')}><Sword className="h-3 w-3 mr-0.5" /> Battle</Button>
                          <Button variant={visibleCategories.has('social') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCategory('social')}><Users className="h-3 w-3 mr-0.5" /> Social</Button>
                          <Button variant={visibleCategories.has('market') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCategory('market')}><ShoppingBag className="h-3 w-3 mr-0.5" /> Trade</Button>
                          <Button variant={visibleCategories.has('log') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCategory('log')}><ScrollText className="h-3 w-3 mr-0.5" /> Log</Button>
                      </div>
                  </div>

                  <ScrollArea className="flex-grow bg-background/50 border rounded-sm p-2">
                      <div className="space-y-2">
                          {messages.filter(m => visibleCategories.has(m.category)).map((msg) => (
                              <div key={msg.id} className="flex flex-col">
                                  <div className="flex items-start gap-1">
                                      <span className={cn("text-[0.6rem] font-bold uppercase", getMessageColor(msg))}>{msg.sender}:</span>
                                      <span className={cn("text-[0.6rem] break-words flex-1", getMessageColor(msg))}>{msg.text}</span>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </ScrollArea>
                  
                  <form onSubmit={handleSend} className="flex gap-1">
                      <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message..." className="h-7 text-[0.6rem] bg-background" />
                      <Button type="submit" size="sm" variant="secondary" className="h-7 px-2"><Send className="h-3 w-3" /></Button>
                  </form>
              </div>
          ) : (
              <div className="space-y-0 flex-grow flex flex-col p-2">
                  {/* Row 1: Messenger Icon, Current Player, Streaks */}
                  <div className="flex items-center justify-between mb-2">
                      <button 
                          onClick={() => setIsMessengerOpen(true)}
                          className={cn("p-1 hover:bg-muted transition-colors rounded-sm", hasAnyUnread && "animate-chat-notify")}
                      >
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </button>
                      
                      <div className="text-center">
                          <p className="text-[0.6rem] font-medium text-muted-foreground uppercase leading-none mb-1">Current Player</p>
                          <p className={cn("text-[0.75rem] font-bold uppercase font-pixel leading-none", currentPlayer === 'white' ? 'text-white' : 'text-secondary')}>
                              {getPlayerDisplayName(currentPlayer)}
                          </p>
                      </div>

                      <div className="text-right flex flex-col gap-0.5">
                          <p className="text-[0.55rem] font-bold text-destructive leading-none uppercase">W-Streak: {killStreaks.white}</p>
                          <p className="text-[0.55rem] font-bold text-destructive leading-none uppercase">B-Streak: {killStreaks.black}</p>
                      </div>
                  </div>
                  
                  {/* Captured Pieces Rows */}
                  <div className="w-full mb-1">
                      <h3 className="text-[0.6rem] font-bold text-muted-foreground uppercase mb-0.5 leading-none">Captured Black</h3>
                      <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[1.5rem] p-0.5 border border-border/20">
                          {capturedPieces.black.length === 0 ? <span className="text-[0.5rem] text-muted-foreground">None</span> : capturedPieces.black.map(p => <div key={p.id} className="w-5 h-5"><ChessPieceDisplay piece={p} isMini /></div>)}
                      </div>
                  </div>

                  <div className="w-full mb-2">
                      <h3 className="text-[0.6rem] font-bold text-muted-foreground uppercase mb-0.5 leading-none">Captured White</h3>
                      <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[1.5rem] p-0.5 border border-border/20">
                          {capturedPieces.white.length === 0 ? <span className="text-[0.5rem] text-muted-foreground">None</span> : capturedPieces.white.map(p => <div key={p.id} className="w-5 h-5"><ChessPieceDisplay piece={p} isMini /></div>)}
                      </div>
                  </div>

                  <Separator className="my-1 bg-border/30" />

                  {/* Info Area */}
                  <div className="flex-grow flex flex-col justify-center min-h-[4.5rem] pt-1">
                      {pieceForInfoDisplay ? (
                          <div className="text-center">
                              <h3 className={cn("font-bold text-[0.7rem] uppercase leading-tight mb-1", pieceForInfoDisplay.id.startsWith('boss-') ? "text-destructive" : "text-primary")}>
                                  {pieceForInfoDisplay.id.startsWith('boss-hydra') ? "The Hydra" : 
                                  pieceForInfoDisplay.id === 'boss-necro' ? "The Necromancer" : 
                                  pieceForInfoDisplay.id.startsWith('boss-colossus') ? "The Colossus" : 
                                  pieceForInfoDisplay.id === 'boss-mirage' ? "The Mirage" : 
                                  pieceForInfoDisplay.id === 'boss-entity' ? "The Void Entity" : 
                                  pieceForInfoDisplay.type} - Level {pieceForInfoDisplay.level}
                              </h3>
                              <PieceAbilitiesInfo piece={pieceForInfoDisplay} />
                          </div>
                      ) : (
                          <div className="text-center text-[0.6rem] text-muted-foreground leading-tight uppercase font-pixel opacity-50">
                              Select a piece for info
                          </div>
                      )}
                  </div>
              </div>
          )}
        </Card>
      </div>

      {/* BOTTOM BUTTONS */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2 shrink-0">
        <Button variant="outline" className="h-10 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted" onClick={() => setIsInventoryOpen(true)}>
          <Package className="h-4 w-4 text-yellow-500" /> LOOT BAG
        </Button>
        <Button variant="outline" className="h-10 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted" onClick={() => setIsRulesDialogOpen(true)}>
          <BookOpen className="h-4 w-4 text-yellow-500" /> RULES
        </Button>
      </div>

      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />
      <MycoSpellMenu isOpen={isSelectingMycoSpell} mana={selectedSquare ? (board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.shroomMana || 0) : 0} onSelectSpell={null as any} onOpenChange={setIsSelectingMycoSpell} />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />

      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent className="font-pixel bg-black border-2 border-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-primary uppercase">Reset Dungeon Run?</AlertDialogTitle>
            <AlertDialogDescription className="text-white text-[10px] uppercase">All floor progress, piece levels, and items will be LOST.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 text-[10px] uppercase">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-10 text-[10px] uppercase bg-destructive text-white" onClick={() => { startRun(true); setIsResetConfirmOpen(false); }}>Reset Now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} attunementSlots={attunementSlots} usedSlots={usedSlots} />
    </div>
  );
}