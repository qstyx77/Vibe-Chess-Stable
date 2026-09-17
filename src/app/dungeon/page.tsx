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
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, InventoryItem, InventoryItemType, AIGameState, AIBoardState, AISquareState, SquareState, ItemType, ChatMessage, MessageCategory, RookResurrectionResult } from '@/types';
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
import { Card, CardContent } from '@/components/ui/card';
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

const DUNGEON_EXP_MAP: Record<string, number> = {
  pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, 
  knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2
};

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
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false };
        placedIds.add(p.id); return true;
    }
    return false;
  };
  placePieceAt(king, 'e1');
  if (rooks[0]) placePieceAt(rooks[0], 'a1'); if (rooks[1]) placePieceAt(rooks[1], 'h1');
  if (queens[0]) placePieceAt(queens[0], 'd1'); if (knights[0]) placePieceAt(knights[0], 'b1'); if (knights[1]) placePieceAt(knights[1], 'g1');
  if (bishops[0]) placePieceAt(bishops[0], 'c1'); if (bishops[1]) placePieceAt(bishops[1], 'f1');
  const gSlots: AlgebraicSquare[] = ['d2', 'e2', 'f2'];
  const wSlots: AlgebraicSquare[] = (['a2', 'b2', 'c2', 'g2', 'h2'] as AlgebraicSquare[]).sort(() => Math.random() - 0.5);
  const flOrder = [...gSlots, ...wSlots];
  let flIdx = 0;
  for (const alg of flOrder) {
    while (flIdx < frontline.length && placedIds.has(frontline[flIdx].id)) { flIdx++; }
    if (flIdx < frontline.length) { placePieceAt(frontline[flIdx], alg); flIdx++; }
  }
  const piecePri = (type: PieceType) => {
    const values: Record<string, number> = { queen: 90, palace: 60, rook: 50, archbishop: 40, hero: 35, archer: 35, bishop: 30, knight: 30, commander: 10, infiltrator: 10, dancer: 10, mimic: 10, grappler: 10, myco_mage: 10, pawn: 10 };
    return values[type] || 0;
  };
  const remainingP = playerArmy.filter(p => !placedIds.has(p.id)).sort((a, b) => piecePri(b.type) - piecePri(a.type));
  const fillOrder: AlgebraicSquare[] = [ 'd1', 'e1', 'c1', 'f1', 'b1', 'g1', 'a1', 'h1', 'd2', 'e2', 'c2', 'f2', 'b2', 'g2', 'a2', 'h2', 'd3', 'e3', 'c3', 'f3', 'b3', 'g3', 'a3', 'h3', 'd4', 'e4', 'c4', 'f4', 'b4', 'g4', 'a4', 'h4' ];
  let fIdx = 0;
  for (const p of remainingP) {
    while (fIdx < fillOrder.length) {
        const alg = fillOrder[fIdx]; const { row, col } = algebraicToCoords(alg);
        if (!board[row][col].piece) { placePieceAt(p, alg); break; }
        fIdx++;
    }
  }
  const isB = level % 10 === 0;
  if (isB) {
    const bIdx = Math.floor(level / 10);
    switch (bIdx) {
      case 1: 
        board[0][3].piece = { id: 'boss-hydra-1', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, heldItem: null };
        board[0][4].piece = { id: 'boss-hydra-2', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, heldItem: null };
        board[0][5].piece = { id: 'boss-hydra-3', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, heldItem: null };
        board[1][3].piece = { id: 'hydra-guard-1', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, heldItem: null };
        board[1][5].piece = { id: 'hydra-guard-2', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, heldItem: null };
        break;
      case 2: 
        board[0][2].piece = { id: 'boss-necro', type: 'archbishop', color: 'black', level: 8, hasMoved: false, isShielded: false, heldItem: null };
        for(let i=0; i<4; i++) board[1][i+2].piece = { id: `skeleton-${i}`, type: 'pawn', color: 'black', level: 3, hasMoved: false, isShielded: false, heldItem: null };
        board[0][1].piece = { id: 'necro-knight-1', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, heldItem: null };
        board[0][6].piece = { id: 'necro-knight-2', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, heldItem: null };
        break;
      case 3: 
        const colL = 15;
        board[0][3].piece = { id: 'boss-colossus-tl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, heldItem: null };
        board[0][4].piece = { id: 'boss-colossus-tr', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, heldItem: null };
        board[1][3].piece = { id: 'boss-colossus-bl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, heldItem: null };
        board[1][4].piece = { id: 'boss-colossus-br', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, heldItem: null };
        for(let i=0; i<8; i++) { if (i === 3 || i === 4) continue; board[1][i].piece = { id: `skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: true, heldItem: null }; }
        for(let i=0; i<8; i++) board[2][i].piece = { id: `front-skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, heldItem: null };
        break;
      case 4: 
        board[0][3].piece = { id: 'boss-mirage', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: false, heldItem: null };
        for(let i=0; i<8; i++) board[0][i].piece = board[0][i].piece || { id: `phantom-${i}`, type: 'bishop', color: 'black', level: 4, hasMoved: false, isShielded: false, heldItem: null };
        break;
      case 5: 
        board[0][4].piece = { id: 'boss-entity', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: true, heldItem: null };
        for(let i=0; i<8; i++) {
          const t: PieceType = i % 2 === 0 ? 'hero' : 'archbishop';
          board[0][i].piece = board[0][i].piece || { id: `aspect-${i}`, type: t, color: 'black', level: 6, hasMoved: false, isShielded: false, heldItem: null };
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false, heldItem: null };
        }
        break;
    }
  } else {
    const pCount = Math.min(16, 2 + Math.floor(level / 3));
    const avgL = Math.max(1, Math.floor(level / 7) + 1);
    const squares = [];
    for(let r=0; r<4; r++) for(let c=0; c<8; c++) squares.push({r,c});
    squares.sort(() => Math.random() - 0.5).slice(0, pCount).forEach((pos, i) => {
      const types: PieceType[] = ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook'];
      if (level > 15) types.push('commander', 'infiltrator');
      if (level > 25) types.push('queen', 'archbishop', 'archer');
      const type = types[Math.floor(Math.random() * types.length)];
      const pL = avgL + (Math.random() > 0.6 ? 1 : 0);
      board[pos.r][pos.c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: pL, hasMoved: false, isShielded: false, heldItem: null };
    });
  }
  return board;
}

function adaptBoardForAI(currentBoardState: BoardState, pColor: PlayerColor, ks: { white: number; black: number }, caps: { white: Piece[]; black: Piece[] }, moveC: number, fb: boolean, fbP: PlayerColor | null, ep: AlgebraicSquare | null, lmT?: PieceType | null, lmH?: InventoryItemType | null, sC?: number, nsT?: number, nrC?: number, lmL?: number | null, oppC?: boolean, posH?: string[]): AIGameState {
  const aiBoard: AIBoardState = [];
  for (let r = 0; r < 8; r++) {
    const row = currentBoardState[r]; const aiRow: AISquareState[] = [];
    if (row) { for (let c = 0; c < 8; c++) aiRow.push({ piece: row[c]?.piece ? { ...row[c].piece } : null, item: row[c]?.item ? { ...row[c].item } : null }); } 
    else { for (let c = 0; c < 8; c++) aiRow.push({ piece: null, item: null }); }
    aiRow.push(...[]); 
    aiBoard.push(aiRow);
  }
  return { board: aiBoard, currentPlayer: pColor, killStreaks: { ...ks }, capturedPieces: { white: Array.isArray(caps?.white) ? caps.white.map(p => ({ ...p })) : [], black: Array.isArray(caps?.black) ? caps.black.map(p => ({ ...p })) : [] }, gameOver: false, winner: undefined, extraTurn: false, gameMoveCounter: moveC, firstBloodAchieved: fb, playerWhoGotFirstBlood: fbP, enPassantTargetSquare: ep, shroomSpawnCounter: sC, nextShroomSpawnTurn: nsT, necroResurrectionCounter: nrC, lastMovedPieceType: lmT, lastMovedPieceHeldItem: lmH, lastMovedPieceLevel: lmL, didOpponentCaptureLastTurn: oppC, positionHistory: posH ? [...posH] : [] };
}

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
  const { addLog, messages, sendMessage, isMessengerOpen, setIsMessengerOpen, hasUnread, clearUnread, visibleCategories, setVisibleCategories, chatInput, setChatInput } = useSocial();
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
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
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
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(5);
  const [necroResurrectionCounter, setNecroResurrectionCounter] = useState(0);
  const [aiNoMoveCounter, setAiNoMoveCounter] = useState(0);
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

  const saveDungeonState = useCallback((curL: number, curB: BoardState, curP: PlayerColor, ks: any, caps: any, sC: number, nS: number, ep: AlgebraicSquare | null, nrC: number, curInv: InventoryItem[]) => {
    if (!user || !firestore) return;
    const userRef = doc(firestore, 'users', user.uid); const eq: Record<string, string> = {};
    curB.flat().forEach(sq => { if (sq.piece?.heldItem) eq[sq.piece.id] = sq.piece.heldItem; });
    updateDocumentNonBlocking(userRef, { inventory: curInv, equipment: eq, dungeonState: { level: curL, board: curB.flat(), currentPlayer: curP, killStreaks: ks, capturedPieces: caps, shroomSpawnCounter: sC, nextShroomSpawnTurn: nS, enPassantTargetSquare: ep, necroResurrectionCounter: nrC } });
  }, [user, firestore]);

  const handlePieceHover = useCallback((p: Piece | null) => { setPieceForInfoDisplay(p); }, []);

  const advanceLevel = useCallback((survivors: Piece[], graveyard: any) => {
    const nextL = level + 1;
    if (nextL > 50) { setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' })); gameOverRef.current = true; audioManager.playVictory(); return; }
    setLevel(nextL); setBoard(generateDungeonFloor(nextL, survivors)); setPlayerArmy(survivors); setCapturedPieces({ white: Array.isArray(graveyard.white) ? graveyard.white : [], black: [] }); setKillStreaks({ white: 0, black: 0 }); setPositionHistory([]); setEnPassantTargetSquare(null); setLastMovedPieceType(null); setLastMovedPieceLevel(null); setLastMovedPieceHeldItem(null); setLastMoveFrom(null); setLastMoveTo(null); setNecroResurrectionCounter(0); setAiNoMoveCounter(0);
    saveDungeonState(nextL, generateDungeonFloor(nextL, survivors), 'white', { white: 0, black: 0 }, { white: graveyard.white, black: [] }, 0, 5, null, 0, inventory);
    audioManager.playLevelUp(); addLog(`Descending to Floor ${nextL}...`);
  }, [level, inventory, saveDungeonState, addLog]);

  const handleUsePortalScroll = useCallback((type: InventoryItemType) => {
    if (!type.startsWith('portal_scroll_')) return;
    const targetFloor = parseInt(type.split('_')[2]);
    if (isNaN(targetFloor)) return;

    // Consume the item
    const newInv = inventory.map(item => {
        if (item.type === type) return { ...item, count: item.count - 1 };
        return item;
    }).filter(item => item.count > 0);
    setInventory(newInv);

    // Warp logic
    setLevel(targetFloor);
    const whiteArmy = board.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const newB = generateDungeonFloor(targetFloor, whiteArmy);
    setBoard(newB);
    setCapturedPieces({ white: [], black: [] });
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setEnPassantTargetSquare(null);
    setLastMovedPieceType(null);
    setLastMovedPieceLevel(null);
    setLastMovedPieceHeldItem(null);
    setLastMoveFrom(null);
    setLastMoveTo(null);
    setNecroResurrectionCounter(0);
    setAiNoMoveCounter(0);
    
    saveDungeonState(targetFloor, newB, 'white', { white: 0, black: 0 }, { white: [], black: [] }, 0, 5, null, 0, newInv);
    
    audioManager.playStart();
    addLog(`Warped to Floor ${targetFloor}!`);
    setIsInventoryOpen(false);
    setSelectedInventoryItemType(null);
  }, [inventory, board, saveDungeonState, addLog]);

  const processMoveEnd = useCallback((boardAfter: BoardState, nG: any, curKs: any, turnP: PlayerColor, extra: boolean, nEp: AlgebraicSquare | null = null, wasCap: boolean = false, movedT?: PieceType | null) => {
    let nB = boardAfter; setDidCaptureLastTurn(prev => ({ ...prev, [turnP]: wasCap }));
    nB = processOilSlickTimers(nB, turnP);
    const cCounter = shroomSpawnCounter + 1;
    if (cCounter >= nextShroomSpawnTurn) {
        const { newBoard: bW, spawnedAt } = spawnShroom(nB);
        if (spawnedAt) { nB = bW; addLog("A mystical Shroom 🍄 has appeared!"); audioManager.playShroom(); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); } else { setShroomSpawnCounter(cCounter); }
    } else { setShroomSpawnCounter(cCounter); }

    const actT = movedT || lastMovedPieceType;
    const nxtP = extra ? turnP : (turnP === 'white' ? 'black' : 'white');
    const necro = nB.flat().find(sq => sq.piece?.id === 'boss-necro');
    if (necro && nxtP === 'black') {
      const nNrc = necroResurrectionCounter + 1;
      if (nNrc >= 5) {
        const gArr = Array.isArray(nG.black) ? nG.black : [];
        if (gArr.length > 0) {
            const { rowIndex: nr, colIndex: nc } = necro; const adj = [];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const rr = nr + dr, cc = nc + dc;
                if (isValidSquare(rr, cc) && !nB[rr][cc].piece && !nB[rr][cc].item) adj.push({ r: rr, c: cc });
            }
            if (adj.length > 0) {
                const target = adj[Math.floor(Math.random() * adj.length)]; const resP = gArr[Math.floor(Math.random() * gArr.length)];
                nB[target.r][target.c].piece = { ...resP, level: 1, hasMoved: true, id: `necro_res_${Date.now()}`, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                nG.black = gArr.filter((p: Piece) => p.id !== resP.id); setNecroResurrectionCounter(0); addLog("The Necromancer raises a fallen servant!"); audioManager.playResurrect(); addEffect('light-beam', coordsToAlgebraic(target.r, target.c));
            } else { setNecroResurrectionCounter(nNrc); }
        } else { setNecroResurrectionCounter(nNrc); }
      } else { setNecroResurrectionCounter(nNrc); }
    }

    const cHash = boardToPositionHash(nB, nxtP, nEp); let nHist = [...positionHistory];
    if (wasCap || (actT && FRONTLINE_TYPES.includes(actT))) { nHist = [cHash]; } else { nHist.push(cHash); }
    setPositionHistory(nHist);
    if (nHist.filter(h => h === cHash).length >= 3) { setGameInfo({ message: "Draw by Repetition!", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }); addLog("Draw by Repetition!"); gameOverRef.current = true; return; }

    const { newBoard: bP, poisonedCaptures } = processPoisonDamage(nB, nxtP);
    nB = bP;
    if (poisonedCaptures.length > 0) { poisonedCaptures.forEach(p => { const pile = p.color; nG[pile] = [...(nG[pile]||[]), p]; }); audioManager.playCapture(); addLog(`${poisonedCaptures.length} units decayed.`); }

    const isBoss = level % 10 === 0; const eKing = findKing(nB, 'black');
    const mated = eKing && isCheckmate(nB, 'black', nEp, actT, lastMovedPieceHeldItem, lastMovedPieceLevel);
    const stalled = (nxtP === 'black') && isStalemate(nB, 'black', nEp, actT, lastMovedPieceHeldItem, lastMovedPieceLevel);
    const cleared = nB.flat().filter(sq => sq.piece?.color === 'black').length === 0;

    if (cleared || (isBoss && mated) || stalled) {
        const sur = nB.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
        addLog(cleared ? "ALL FOES VANQUISHED!" : (isBoss && mated ? "BOSS ENTITY DEFEATED!" : "DUNGEON FORCES STALEMATED!"));
        advanceLevel(sur, nG); return;
    }

    const pKing = findKing(nB, 'white');
    const pMated = pKing && isCheckmate(nB, 'white', nEp, actT, lastMovedPieceHeldItem, lastMovedPieceLevel);
    const pStale = (nxtP === 'white') && isStalemate(nB, 'white', nEp, actT, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (!pKing || pMated || pStale) {
      setGameInfo({ message: !pKing || pMated ? "YOUR KING HAS FALLEN" : "STALEMATE - RUN OVER", isCheck: !!pMated, playerWithKingInCheck: 'white', isCheckmate: !!pMated, isStalemate: !!pStale, gameOver: true, winner: 'black' }); 
      gameOverRef.current = true; audioManager.playDefeat(); return;
    }

    setBoard(nB); setCapturedPieces(nG); setKillStreaks(curKs); setEnPassantTargetSquare(nEp); setCurrentPlayer(nxtP);
    const inC = isKingInCheck(nB, nxtP, nEp, actT, lastMovedPieceHeldItem, lastMovedPieceLevel);
    setGameInfo({ message: inC ? "Check!" : " ", isCheck: inC, playerWithKingInCheck: inC ? nxtP : null, isCheckmate: false, isStalemate: false, gameOver: false });
    if (inC) addLog("Check!");
    saveDungeonState(level, nB, nxtP, curKs, nG, shroomSpawnCounter, nextShroomSpawnTurn, nEp, necroResurrectionCounter, inventory);
  }, [level, inventory, advanceLevel, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addLog, positionHistory, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter, saveDungeonState, addEffect, getPlayerDisplayName]);

  const triggerSpecialsChain = useCallback((bCh: BoardState, cG: { white: Piece[], black: Piece[] }, cKs: { white: number, black: number }, oldS: number, newS: number, isEx: boolean, nEp: AlgebraicSquare | null, actP: PlayerColor = 'white', compM: string[] = [], capId: string | null = null, wasCap: boolean = false, movedT?: PieceType | null) => {
    const isAI = actP === 'black'; const sil = bCh.flat().find(sq => sq.piece?.color === actP && isSilenced(bCh, sq.rowIndex, sq.colIndex, actP));
    let nG = { white: Array.isArray(cG.white) ? [...cG.white] : [], black: Array.isArray(cG.black) ? [...cG.black] : [] };
    if (newS >= 8 && !compM.includes('conquest')) {
        const aK = bCh.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actP)?.piece;
        if (aK?.heldItem === 'kings_conquest') { setGameInfo({ message: `CONQUEST! ${getPlayerDisplayName(actP)} wins!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: actP }); audioManager.playVictory(); return; }
    }
    if (!sil && newS >= 1 && oldS < 1 && !compM.includes('dance')) {
        const hasD = bCh.flat().some(sq => { const p = sq.piece; if (!p || p.color !== actP) return false; return p.type === 'dancer' || (p.type === 'mimic' && lastMovedPieceType === 'dancer'); });
        if (hasD) {
            if (isAI) {
                const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const aiDSq = nxtB.flat().find(sq => (sq.piece?.type === 'dancer' || (sq.piece?.type === 'mimic' && lastMovedPieceType === 'dancer')) && sq.piece?.color === actP);
                if (aiDSq) {
                    const {rowIndex: r, colIndex: c} = aiDSq; const dP = aiDSq.piece!; const dDir = actP === 'white' ? -1 : 1; const cands: any[] = [];
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                        if(dr===0 && dc===0) continue; const nr=r+dr, nc=c+dc;
                        if (isValidSquare(nr, nc)) {
                            const tSq = nxtB[nr][nc];
                            if (!tSq.piece && (!tSq.item || tSq.item.type === 'shroom')) { if (dr === dDir && dc === 0) cands.push({r: nr, c: nc, pri: 1}); }
                            else if (tSq.piece) { if (tSq.piece.color !== actP && tSq.piece.type !== 'king' && !tSq.piece.isShielded) cands.push({r: nr, c: nc, pri: 2}); else if (tSq.piece.color === actP) cands.push({r: nr, c: nc, pri: 0}); }
                            else if (tSq.item?.type === 'anvil' && dP.heldItem === 'dancers_ribbon') cands.push({r: nr, c: nc, pri: 3});
                        }
                    }
                    cands.sort((a,b) => b.pri - a.pri);
                    if (cands.length > 0) {
                        const best = cands[0]; const tSq = nxtB[best.r][best.c]; const tP = tSq.piece; const tI = tSq.item;
                        if (tI?.type === 'shroom') { nxtB[best.r][best.c].piece = { ...dP, hasMoved: true, level: (dP.level || 1) + 1 }; } else { nxtB[best.r][best.c].piece = { ...dP, hasMoved: true }; }
                        nxtB[best.r][best.c].item = null; nxtB[r][c].piece = tP ? { ...tP, hasMoved: true, isShielded: false } : null; nxtB[r][c].item = tI?.type === 'shroom' ? null : tI;
                        addLog(`${getPlayerDisplayName(actP)} Dancer performed a free ${tP ? 'swap' : (tI ? 'anvil swap' : 'move')}!`);
                    }
                }
                triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'dance'], capId, wasCap, movedT); return;
            } else {
                setSpecialActionContext({ boardForNextStep: bCh, playerWhoseTurnCompleted: actP, isExtraTurn: isEx, newEnPassantTarget: nEp, oldStreak: oldS, newStreak: newS, completedMilestones: [...compM, 'dance'], currentGraveyard: nG, currentKs: cKs, capturingPieceId: capId });
                setIsAwaitingDanceTarget(true); addLog("Dancer Skill: The Dance is ready!"); return;
            }
        }
    }
    if (!firstBloodAchieved && newS > 0 && !compM.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actP);
        if (isAI) {
            const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const pSq = nxtB.flat().find(sq => sq.piece && sq.piece.color === actP && sq.piece.level === 1 && FRONTLINE_TYPES.includes(sq.piece.type) && sq.piece.type !== 'commander');
            if (pSq) { const {row: pr, col: pc} = algebraicToCoords(pSq.algebraic); nxtB[pr][pc].piece!.type = 'commander'; addLog(`${getPlayerDisplayName(actP)} promoted a Commander!`); }
            triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'firstBlood'], capId, wasCap, movedT); return;
        } else {
            const hasL1 = bCh.flat().some(sq => sq.piece && sq.piece.color === actP && sq.piece.type === 'pawn' && sq.piece.level === 1);
            if (hasL1) {
                setSpecialActionContext({ boardForNextStep: bCh, playerWhoseTurnCompleted: actP, isExtraTurn: isEx, newEnPassantTarget: nEp, oldStreak: oldS, newStreak: newS, completedMilestones: [...compM, 'firstBlood'], currentGraveyard: nG, currentKs: cKs, capturingPieceId: capId });
                setIsAwaitingCommanderPromotion(true); addLog("First Blood! Choose a Pawn to promote."); return;
            }
        }
    }
    if (!sil && newS >= 2 && oldS < 2 && !compM.includes('shield')) {
        const hasA = bCh.flat().some(sq => { const p = sq.piece; if (!p || p.color !== actP) return false; return p.type === 'archbishop' || (p.type === 'mimic' && lastMovedPieceType === 'archbishop'); });
        if (hasA) {
            if (isAI) {
                const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const targs = nxtB.flat().filter(sq => sq.piece && sq.piece.color === actP && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capId).sort((a, b) => (b.piece?.level || 0) - (a.piece?.level || 0));
                if (targs.length > 0) { targs[0].piece!.isShielded = true; addLog(`${getPlayerDisplayName(actP)} Archbishop applied a Holy Shield!`); }
                triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'shield'], capId, wasCap, movedT); return;
            } else {
                const hasElig = bCh.flat().some(sq => sq.piece && sq.piece.color === actP && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capId);
                if (hasElig) {
                    setSpecialActionContext({ boardForNextStep: bCh, playerWhoseTurnCompleted: actP, isExtraTurn: isEx, newEnPassantTarget: nEp, oldStreak: oldS, newStreak: newS, completedMilestones: [...compM, 'shield'], currentGraveyard: nG, currentKs: cKs, capturingPieceId: capId });
                    setIsAwaitingHolyShield(true); addLog("Holy Shield ready!"); return;
                } else { triggerSpecialsChain(bCh, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'shield'], capId, wasCap, movedT); return; }
            }
        }
    }
    if (!sil && newS >= 3 && oldS < 3 && !compM.includes('anvil')) {
        if (isAI) {
            const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const mKing = nxtB.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actP);
            const kR = mKing ? mKing.rowIndex : 0; const kC = mKing ? mKing.colIndex : 4;
            const emp = nxtB.flat().filter(sq => !sq.piece && !sq.item);
            if (emp.length > 0) {
                emp.sort((a, b) => (Math.abs(a.rowIndex - kR) + Math.abs(a.colIndex - kC)) - (Math.abs(b.rowIndex - kR) + Math.abs(b.colIndex - kC)));
                nxtB[emp[0].rowIndex][emp[0].colIndex].item = { type: 'anvil' }; addLog(`${getPlayerDisplayName(actP)} dropped a defensive Anvil!`);
            }
            triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'anvil'], capId, wasCap, movedT); return;
        } else {
            setSpecialActionContext({ boardForNextStep: bCh, playerWhoseTurnCompleted: actP, isExtraTurn: isEx, newEnPassantTarget: nEp, oldStreak: oldS, newStreak: newS, completedMilestones: [...compM, 'anvil'], currentGraveyard: nG, currentKs: cKs, capturingPieceId: capId });
            setPlayerToDropAnvil(actP); setIsAwaitingAnvilDrop(true); addLog("Anvil Drop ready!"); return;
        }
    }
    if (newS >= 4 && oldS < 4 && !compM.includes('resurrection')) {
        const mG = actP === 'white' ? nG.white : nG.black; 
        if (mG.length > 0) {
            const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const srt = [...mG].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0)); const choice = srt[0]; const emp = nxtB.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && emp.length > 0) {
                const sq = emp[Math.floor(Math.random()*emp.length)]; const {row: rr, col: rc} = algebraicToCoords(sq.algebraic);
                nxtB[rr][rc].piece = { ...choice, level: 1, id: `res_${choice.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 }; 
                if (actP === 'white') nG.white = nG.white.filter(p => p.id !== choice.id); else nG.black = nG.black.filter(p => p.id !== choice.id);
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect(); addLog(`${actP === 'white' ? "Hero" : "Dungeon"} resurrected a ${choice.type}!`);
                triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'resurrection'], capId, wasCap, movedT); return;
            }
        }
    }
    const pieces = bCh.flat().filter(sq => sq.piece && sq.piece.color === actP).map(sq => sq.piece!);
    const snipers = pieces.filter(p => { 
        if (p.type === 'archer') return true; if (p.type === 'mimic' && lastMovedPieceType === 'archer') return true;
        const coords = bCh.flat().find(sq => sq.piece?.id === p.id); 
        if ((p.type === 'knight' || (p.type === 'mimic' && lastMovedPieceType === 'knight')) && p.heldItem === 'shortbow' && coords && getEffectiveLevel(bCh, coords.rowIndex, coords.colIndex) >= 3) return true; 
        return false; 
    });
    const maxSL = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
    const hasCB = pieces.some(p => (p.type === 'archer' || (p.type === 'mimic' && lastMovedPieceType === 'archer')) && p.color === actP && p.heldItem === 'crossbow');
    if (!sil && ((newS >= 5 && oldS < 5 && snipers.length > 0) || (newS >= 3 && oldS < 3 && hasCB)) && !compM.includes('snipe')) {
        const oppC = actP === 'white' ? 'black' : 'white';
        const vics = bCh.flat().filter(sq => sq.piece && sq.piece.color === oppC && sq.piece.level <= maxSL && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (vics.length > 0) {
            if (isAI) {
                const nxtB = bCh.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const vSrt = vics.sort((a,b) => { if ((b.piece?.level || 0) !== (a.piece?.level || 0)) return (b.piece?.level || 0) - (a.piece?.level || 0); return (VAL_MAP[b.piece!.type]||0) - (VAL_MAP[a.piece!.type]||0); });
                const v = vSrt[0]; const {rowIndex: row, colIndex: col} = v; const sniped = { ...nxtB[row][col].piece!, id: nxtB[row][col].piece!.id }; nxtB[row][col].piece = null; 
                
                if (sniped.id?.startsWith('boss-hydra')) {
                    const adj = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue; const nr = row + dr, nc = col + dc;
                        if (isValidSquare(nr, nc) && !nxtB[nr][nc].piece && (!nxtB[nr][nc].item || nxtB[nr][nc].item?.type === 'shroom')) adj.push({ r: nr, c: nc });
                    }
                    const sc = Math.min(adj.length, 2); const sh = adj.sort(() => Math.random() - 0.5);
                    for (let i = 0; i < sc; i++) {
                        const pos = sh[i]; nxtB[pos.r][pos.c].piece = { id: `hydra_spawn_snipe_${sniped.id}_${i}_${Date.now()}`, type: 'knight', color: sniped.color, level: 2, hasMoved: true, isShielded: false };
                        nxtB[pos.r][pos.c].item = null;
                    }
                    audioManager.playResurrect(); addLog("The Hydra regrows its heads!");
                }

                addLog(`${actP === 'white' ? "Hero" : "Dungeon"} sniped a Level ${sniped.level} ${sniped.type}!`); audioManager.playSnipe(); addEffect('poof', coordsToAlgebraic(row, col));
                const targetP = sniped.color; nG[targetP] = [...(nG[targetP]||[]), sniped];
                triggerSpecialsChain(nxtB, nG, cKs, oldS, newS, isEx, nEp, actP, [...compM, 'snipe'], capId, wasCap, movedT); return;
            } else {
                setSpecialActionContext({ boardForNextStep: bCh, playerWhoseTurnCompleted: actP, isExtraTurn: isEx, newEnPassantTarget: nEp, oldStreak: oldS, newStreak: newS, completedMilestones: [...compM, 'snipe'], currentGraveyard: nG, currentKs: cKs, capturingPieceId: capId });
                setIsAwaitingArcherSnipe(true); addLog("Sniper active! Select a target to snipe."); return;
            }
        }
    }
    processMoveEnd(bCh, nG, cKs, actP, isEx, nEp, wasCap, movedT);
  }, [advanceLevel, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addLog, getPlayerDisplayName, addEffect]);

  const processPawnSacrificeCheck = useCallback((bAf: BoardState, g: { white: Piece[], black: Piece[] }, cKs: { white: number, black: number }, p: PlayerColor, m: Move | null, oL: number | undefined, oT: PieceType | undefined, isEx: boolean, ep: AlgebraicSquare | null, oS: number, nS: number, cId: string | null = null, wC: boolean = false, mT?: PieceType | null) => {
    if (!m) return false; const { row, col } = algebraicToCoords(m.to); const piece = bAf[row][col].piece;
    if (piece?.type === 'queen' && piece.level === 7 && oT === 'queen' && (oL || 0) < 7) {
      if (bAf.flat().some(sq => sq.piece && sq.piece.color === p && FRONTLINE_TYPES.includes(sq.piece.type))) {
        if (p === 'black') {
            const nxtB = bAf.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const pSq = nxtB.flat().find(sq => sq.piece && sq.piece.color === p && FRONTLINE_TYPES.includes(sq.piece.type));
            if (pSq) {
                const {row: pr, col: pc} = algebraicToCoords(pSq.algebraic); const sacrificed = { ...nxtB[pr][pc].piece! };
                nxtB[pr][pc].piece = null; audioManager.playCapture(); addLog(`AI Sacrificed ${sacrificed.type} for the Queen!`);
                const nG = { white: Array.isArray(g.white) ? [...g.white] : [], black: Array.isArray(g.black) ? [...g.black] : [] }; nG[sacrificed.color] = [...nG[sacrificed.color], sacrificed];
                triggerSpecialsChain(nxtB, nG, cKs, oS, nS, isEx, ep, p, [], cId, wC, mT);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(p); setBoardForPostSacrifice(bAf);
        setSpecialActionContext({ boardForNextStep: bAf, playerWhoseTurnCompleted: p, isExtraTurn: isEx, newEnPassantTarget: ep, oldStreak: oS, newStreak: nS, currentGraveyard: g, currentKs: cKs, capturingPieceId: cId }); 
        addLog("Royal Sacrifice required! Select a Pawn to give up."); return true;
      }
    }
    triggerSpecialsChain(bAf, g, cKs, oS, nS, isEx, ep, p, [], cId, wC, mT); return false;
  }, [triggerSpecialsChain, addLog]);

  const handlePromotionSelect = useCallback((t: PieceType) => {
    setIsPromotingPawn(false); setPromotionSquare(null);
    let nB = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare!); const p = nB[row][col].piece; if (!p) return;
    nB[row][col].piece = { ...p, type: t, hasMoved: true, level: promotionTargetLevel };
    if (t === 'queen') nB[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    setBoard(nB); audioManager.playLevelUp(); addLog(`${getPlayerDisplayName(p.color)}: Pawn promoted to ${t}!`);
    const remQ = promotionQueue.slice(1);
    if (remQ.length > 0) { setPromotionQueue(remQ); const nxt = remQ[0]; setPromotionSquare(nxt.square); setPromotionTargetLevel(nxt.targetLevel); setIsPromotingPawn(true); } 
    else { setPromotionQueue([]);
        if (specialActionContext) triggerSpecialsChain(nB, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false, t);
        else processMoveEnd(nB, capturedPieces, killStreaks, 'white', false, null, false, t);
    }
  }, [board, promotionSquare, promotionTargetLevel, capturedPieces, killStreaks, triggerSpecialsChain, addLog, specialActionContext, processMoveEnd, promotionQueue, getPlayerDisplayName]);

  const handleSquareClick = useCallback((alg: AlgebraicSquare) => {
    if (clickGuard.current) return; const { row, col } = algebraicToCoords(alg); const sq = board[row][col]; const piece = sq.piece; handlePieceHover(piece);

    if (isAwaitingGrappleThrow) {
        const {row: fr, col: fc} = algebraicToCoords(selectedSquare!); const range = getEffectiveLevel(board, fr, fc); const d = Math.max(Math.abs(fr - row), Math.abs(fc - col));
        if (((fr === row || fc === col) || Math.abs(fr - row) === Math.abs(fc - col)) && d <= range && d > 0 && (!sq?.piece && !sq?.item)) {
            clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(alg);
            const move: Move = { from: selectedSquare!, to: alg, type: 'grapple-throw', thrownPiece: grappledPieceSubject?.piece, thrownItem: grappledItemSubject?.type, grappledFrom: (grappledPieceSubject?.from || grappledItemSubject?.from) };
            const res = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(res.newBoard); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
        }
        return;
    }

    if (isInventoryOpen) { if (selectedInventoryItemType && piece && piece.color === 'white') { const nB = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))); nB[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nB); setSelectedInventoryItemType(null); audioManager.playLevelUp(); } return; }

    if (isAwaitingRayTarget && selectedSquare) {
        const { row: fR, col: fC } = algebraicToCoords(selectedSquare);
        if ((row === fR || col === fC) && alg !== selectedSquare) {
            const type = isAwaitingRayTarget === 'glacial' ? 'glacial-ray' : 'burning-ray';
            clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(alg);
            const result = applyMove(board, { from: selectedSquare!, to: alg, type }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsAwaitingRayTarget(null); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
        }
        return;
    }

    if (isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingEarthquakeScrollTarget || isAwaitingOilSlickTarget || isAwaitingAnvilDrop) {
        if (!sq.piece && !sq.item) {
            clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(alg);
            let moveType: Move['type'] = 'move';
            if (isAwaitingWindScrollTarget) moveType = 'wind-scroll';
            else if (isAwaitingAnvilScrollTarget) moveType = 'summon-anvil';
            else if (isAwaitingEarthquakeScrollTarget) moveType = 'earthquake-scroll';
            else if (isAwaitingOilSlickTarget) moveType = 'oil-slick';
            else if (isAwaitingAnvilDrop) {
                clickGuard.current = false; setIsMoveProcessing(false); setAnimatedSquareTo(null);
                const nextB = specialActionContext!.boardForNextStep.map((r:any) => r.map((s:any) => ({ ...s }))); 
                nextB[row][col].item = { type: 'anvil' }; setBoard(nextB); setIsAwaitingAnvilDrop(false); 
                triggerSpecialsChain(nextB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, 'white', [...(specialActionContext!.completedMilestones || []), 'anvil'], specialActionContext!.capturingPieceId, false, lastMovedPieceType);
                return;
            }

            const res = applyMove(board, { from: selectedSquare!, to: alg, type: moveType }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(res.newBoard); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setIsAwaitingOilSlickTarget(false); processMoveEnd(res.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false, lastMovedPieceType); }, 800);
        }
        return;
    }

    if (isAwaitingPawnSacrifice && piece && FRONTLINE_TYPES.includes(piece.type) && piece.color === 'white') {
        let nB = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
        const sac = { ...nB[row][col].piece! }; nB[row][col].piece = null; const nG = { white: Array.isArray(specialActionContext.currentGraveyard.white) ? [...specialActionContext.currentGraveyard.white] : [], black: Array.isArray(specialActionContext.currentGraveyard.black) ? [...specialActionContext.currentGraveyard.black] : [] }; nG[sac.color] = [...nG[sac.color], sac];
        setBoard(nB); setCapturedPieces(nG); setIsAwaitingPawnSacrifice(false); triggerSpecialsChain(nB, nG, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.oldStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', [], specialActionContext.capturingPieceId, false, lastMovedPieceType);
        return;
    }

    if (isAwaitingCommanderPromotion && piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) { const nxtB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null}))); nxtB[row][col].piece!.type = 'commander'; setBoard(nxtB); setIsAwaitingCommanderPromotion(false); triggerSpecialsChain(nxtB, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', [...(specialActionContext.completedMilestones || []), 'firstBlood'], specialActionContext.capturingPieceId, false, lastMovedPieceType); return; }

    if (isAwaitingHolyShield && piece && piece.color === 'white' && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== specialActionContext?.capturingPieceId) { const nxtB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null}))); nxtB[row][col].piece!.isShielded = true; setBoard(nxtB); setIsAwaitingHolyShield(false); triggerSpecialsChain(nxtB, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', [...(specialActionContext.completedMilestones || []), 'shield'], specialActionContext.capturingPieceId, false, lastMovedPieceType); return; }

    if (isAwaitingArcherSnipe && piece && piece.color === 'black' && piece.type !== 'king' && piece.type !== 'queen') {
        const ps = board.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
        const snips = ps.filter(p => { if (p.type === 'archer') return true; if (p.type === 'mimic' && lastMovedPieceType === 'archer') return true; const crds = board.flat().find(sq => sq.piece?.id === p.id); if ((p.type === 'knight' || (p.type === 'mimic' && lastMovedPieceType === 'knight')) && p.heldItem === 'shortbow' && crds && getEffectiveLevel(board, crds.rowIndex, crds.colIndex) >= 3) return true; return false; });
        if (snips.find(a => a.level >= piece.level)) {
            let nxtB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null}))); const sniped = { ...nxtB[row][col].piece! }; nxtB[row][col].piece = null; 
            
            if (sniped.id?.startsWith('boss-hydra')) {
                const adj = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue; const nr = row + dr, nc = col + dc;
                    if (isValidSquare(nr, nc) && !nxtB[nr][nc].piece && (!nxtB[nr][nc].item || nxtB[nr][nc].item?.type === 'shroom')) adj.push({ r: nr, c: nc });
                }
                const sc = Math.min(adj.length, 2); const sh = adj.sort(() => Math.random() - 0.5);
                for (let i = 0; i < sc; i++) {
                    const pos = sh[i]; nxtB[pos.r][pos.c].piece = { id: `hydra_spawn_snipe_${sniped.id}_${i}_${Date.now()}`, type: 'knight', color: sniped.color, level: 2, hasMoved: true, isShielded: false };
                    nxtB[pos.r][pos.c].item = null;
                }
                audioManager.playResurrect(); addLog("The Hydra regrows its heads!");
            }

            const nG = { white: Array.isArray(specialActionContext.currentGraveyard.white) ? [...specialActionContext.currentGraveyard.white] : [], black: Array.isArray(specialActionContext.currentGraveyard.black) ? [...specialActionContext.currentGraveyard.black] : [] }; nG[sniped.color] = [...nG[sniped.color], sniped];
            addLog(`Hero sniped a Level ${sniped.level} ${sniped.type}!`); audioManager.playSnipe(); addEffect('poof', coordsToAlgebraic(row, col));
            setBoard(nxtB); setCapturedPieces(nG); setIsAwaitingArcherSnipe(false); 
            triggerSpecialsChain(nxtB, nG, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', [...(specialActionContext.completedMilestones || []), 'snipe'], specialActionContext.capturingPieceId, false, lastMovedPieceType);
        }
        return;
    }

    if (isAwaitingDanceTarget) {
        const dP = dancerToDance ? board[algebraicToCoords(dancerToDance).row][algebraicToCoords(dancerToDance).col].piece : null;
        if (!dancerToDance) { if (piece && piece.color === 'white' && (piece.type === 'dancer' || (piece.type === 'mimic' && lastMovedPieceType === 'dancer'))) { setDancerToDance(alg); } return; }
        if (alg === dancerToDance) { setIsAwaitingDanceTarget(false); setDancerToDance(null); triggerSpecialsChain(board, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.isExtraTurn, specialActionContext.newEnPassantTarget, 'white', specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false, lastMovedPieceType); return; }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance); const isAdj = Math.abs(row - fr) <= 1 && Math.abs(col - fc) <= 1;
        if (isAdj && (piece || (sq?.item?.type === 'anvil' && dP?.heldItem === 'dancers_ribbon') || (!sq?.item && row === fr - 1))) {
            let nxtB = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const activeD = nxtB[fr][fc].piece!; const tP = nxtB[row][col].piece; const tI = nxtB[row][col].item;
            if (tI?.type === 'shroom') { activeD.level = Math.min(activeD.type === 'queen' ? 7 : 99, (activeD.level || 1) + 1); nxtB[row][col].item = null; }
            nxtB[row][col].piece = activeD; nxtB[fr][fc].piece = tP ? { ...tP, hasMoved: true } : null; nxtB[fr][fc].item = tI?.type === 'shroom' ? null : tI;
            setBoard(nxtB); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove(); 
            triggerSpecialsChain(nxtB, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.isExtraTurn, specialActionContext!.newEnPassantTarget, 'white', specialActionContext!.completedMilestones, specialActionContext.capturingPieceId, false, lastMovedPieceType);
        }
        return;
    }

    if (selectedSquare) {
       const { row: fR, col: fC } = algebraicToCoords(selectedSquare); const moving = board[fR][fC].piece;
       if (moving?.type === 'grappler' && !isSilenced(board, fR, fC, 'white')) {
           const tSq = board[row][col]; const tP = tSq.piece; const tA = tSq.item?.type === 'anvil' && moving.heldItem === 'power_glove';
           if ((tP && tP.type !== 'king') || tA) {
               if (possibleMoves.includes(alg)) {
                   if (tP) setGrappledPieceSubject({ piece: { ...tP }, from: alg }); else setGrappledItemSubject({ type: 'anvil', from: alg });
                   setIsAwaitingGrappleThrow(true); const range = getEffectiveLevel(board, fR, fC); const tT: AlgebraicSquare[] = [];
                   for(let tr=0; tr<8; tr++) for(let tc=0; tc<8; tc++) {
                       const d = Math.max(Math.abs(tr-fR), Math.abs(tc-fC));
                       if (d>0 && d<=range && (tr===fR||tc===fC||Math.abs(tr-fR)===Math.abs(tc-fC)) && !board[tr][tc].piece && !board[tr][tc].item) tT.push(coordsToAlgebraic(tr,tc));
                   }
                   setPossibleMoves(tT); addLog("Grappler: Select destination to throw!"); return;
               }
           }
       }
       const moves = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
       if (moves.includes(alg)) {
          const movingP = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece; if (!movingP) return;
          const tP = board[row][col].piece; let mType: Move['type'] = 'move';
          if (tP && tP.color === movingP.color) mType = 'swap';
          else if (alg === enPassantTargetSquare && FRONTLINE_TYPES.includes(movingP.type)) mType = 'enpassant';
          else if (movingP.type === 'king' && Math.abs(col - fC) === 2) mType = 'castle';
          setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(alg); setLastMoveFrom(selectedSquare); setLastMoveTo(alg);
          const oL = movingP.level, oT = movingP.type, oH = movingP.heldItem; setLastMovedPieceType(oT); setLastMovedPieceLevel(oL); setLastMovedPieceHeldItem(oH || null);
          const res = applyMove(board, { from: selectedSquare, to: alg, type: mType }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
          
          if (res.capturedPiece || res.pieceCapturedByAnvil || res.selfDestructCaptures?.length) { audioManager.playCapture(); addEffect('poof', alg); if (res.capturedPiece) addLog(`Hero: Captured ${res.capturedPiece.type}!`); }
          if (res.shroomConsumed) { audioManager.playShroom(); addLog("Hero: Consumed a Shroom!"); addEffect('level-change', alg, 'white', 1); }
          if (res.hydraSplitOccurred) { audioManager.playResurrect(); addLog("The Hydra regrows its heads! 2 Knights appear!"); }
          
          const captureGain = res.capturedPiece ? (DUNGEON_EXP_MAP[res.capturedPiece.type] || 1) : 0;
          if (captureGain > 0) addEffect('level-change', alg, 'white', captureGain);
          if (res.ralliedSquares) res.ralliedSquares.forEach(sq => addEffect('level-change', sq, 'white', 1));

          let nextBoardState = res.newBoard;
          const nxtG = { white: Array.isArray(capturedPieces.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces.black) ? [...capturedPieces.black] : [] }; 
          if (res.capturedPiece) { const pile = res.capturedPiece.color; nxtG[pile] = [...nxtG[pile], res.capturedPiece]; }

          const wasCap = !!(res.capturedPiece || res.pieceCapturedByAnvil || res.selfDestructCaptures?.length);
          let rookResResult: RookResurrectionResult | null = null;
          if ((oT === 'rook' || oT === 'palace') && wasCap) {
              const resRes = processRookResurrectionCheck(nextBoardState, 'white', {from: selectedSquare, to: alg, type: mType}, alg, oL, nxtG, Date.now());
              if (resRes.resurrectionPerformed) {
                  nextBoardState = resRes.boardWithResurrection;
                  nxtG.white = resRes.capturedPiecesAfterResurrection.white;
                  nxtG.black = resRes.capturedPiecesAfterResurrection.black;
                  rookResResult = resRes;
                  addEffect('light-beam', resRes.resurrectedSquareAlg!);
                  audioManager.playResurrect();
                  addLog(`Resurrection! ${resRes.resurrectedPieceData?.type} has returned.`);
              }
          }

          setBoard(nextBoardState); setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { 
            setIsMoveProcessing(false); clickGuard.current = false; 

            const oS = killStreaks['white'], nS = (captureGain > 0) ? oS + captureGain : 0, isEx = res.extraTurn || (oS < 6 && nS >= 6);
            const cKs = { ...killStreaks, white: nS }; setKillStreaks(cKs);
            const q = res.multiPromotions || []; const oppRank = movingP.color === 'white' ? 0 : 7;
            if (FRONTLINE_TYPES.includes(nextBoardState[row][col].piece?.type || '') && row === oppRank) { q.push({ square: alg, targetLevel: getPromotionLevel(res.capturedPiece?.type || null) }); }
            if (rookResResult?.promotionRequiredForResurrectedPawn) {
                q.push({ square: rookResResult.resurrectedSquareAlg!, targetLevel: 1 });
            }

            if (q.length > 0) { setPromotionQueue(q); setIsPromotingPawn(true); setPromotionSquare(q[0].square); setPromotionTargetLevel(q[0].targetLevel); setSpecialActionContext({ boardForNextStep: nextBoardState, playerWhoseTurnCompleted: 'white', isExtraTurn: isEx, newEnPassantTarget: res.enPassantTargetSet, oldStreak: oS, newStreak: nS, currentGraveyard: nxtG, currentKs: cKs, capturingPieceId: nextBoardState[row][col].piece?.id || null }); } 
            else { processPawnSacrificeCheck(nextBoardState, nxtG, cKs, 'white', {from: selectedSquare, to: alg, type: mType}, oL, oT, isEx, res.enPassantTargetSet, oS, nS, nextBoardState[row][col].piece?.id || null, wasCap, oT); }
          }, 800);
          return;
       }
    }
    if (piece && piece.color === currentPlayer) { setSelectedSquare(alg); setPossibleMoves(getPossibleMoves(board, alg, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel)); } 
    else { setSelectedSquare(null); setPossibleMoves([]); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, capturedPieces, killStreaks, isInventoryOpen, selectedInventoryItemType, handlePieceHover, triggerSpecialsChain, addLog, boardForPostSacrifice, specialActionContext, isAwaitingPawnSacrifice, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, dancerToDance, isAwaitingDanceTarget, processPawnSacrificeCheck, didCaptureLastTurn, addEffect, promotionQueue, promotionTargetLevel, isAwaitingGrappleThrow, grappledPieceSubject, grappledItemSubject, isSelectingMycoSpell, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingEarthquakeScrollTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, playerToDropAnvil, playerWhoGotFirstBlood, playerToSacrificePawn, teleportAllyPieceId]);

  const startRun = useCallback((reset: boolean = false) => {
    if (isUserLoading || !userData || !user) return;
    setIsMoveProcessing(false); clickGuard.current = false; setSelectedSquare(null); setPossibleMoves([]); setPositionHistory([]); gameOverRef.current = false; setLastMoveFrom(null); setLastMoveTo(null);
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setIsSelectingMycoSpell(false); setIsAiThinking(false); setPromotionQueue([]); setDidCaptureLastTurn({ white: false, black: false }); setNecroResurrectionCounter(0); setAiNoMoveCounter(0);
    const saved = userData.dungeonState;
    if (!reset && saved && saved.board && saved.board.length > 0) {
      setLevel(saved.level); const loadedB: BoardState = []; const savedB1D = saved.board as SquareState[];
      for (let i = 0; i < 8; i++) loadedB.push(savedB1D.slice(i * 8, i * 8 + 8)); 
      setBoard(loadedB); setCurrentPlayer(saved.currentPlayer); setKillStreaks(saved.killStreaks); setCapturedPieces({ white: Array.isArray(saved.capturedPieces?.white) ? saved.capturedPieces.white : [], black: Array.isArray(saved.capturedPieces?.black) ? saved.capturedPieces.black : [] }); setEnPassantTargetSquare(saved.enPassantTargetSquare);
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
    const gs = adaptBoardForAI(board, 'black', killStreaks, capturedPieces, 0, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, shroomSpawnCounter, nextShroomSpawnTurn, lastMovedPieceHeldItem, lastMovedPieceLevel, didCaptureLastTurn.white, positionHistory);
    const res = aiInstance.current?.getBestMove(gs, 'black');
    if (res?.move) {
        setAiNoMoveCounter(0); const move = res.move; const fromAlg = coordsToAlgebraic(move.from[0], move.from[1]); const toAlg = coordsToAlgebraic(move.to[0], move.to[1]);
        const mP = board[move.from[0]][move.from[1]].piece; if (!mP) { setIsAiThinking(false); return; }
        setIsMoveProcessing(true); setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg);
        const oL = mP.level, oT = mP.type, oH = mP.heldItem; setLastMovedPieceType(oT); setLastMovedPieceLevel(oL); setLastMovedPieceHeldItem(oH || null);
        const appRes = applyMove(board, { from: fromAlg, to: toAlg, type: move.type as Move['type'], grappledFrom: move.grappledFrom ? coordsToAlgebraic(move.grappledFrom[0], move.grappledFrom[1]) : undefined }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, didCaptureLastTurn.white);
        
        const wasCap = !!(appRes.capturedPiece || appRes.pieceCapturedByAnvil || appRes.selfDestructCaptures?.length);
        if (wasCap) { audioManager.playCapture(); addEffect('poof', toAlg); }
        if (appRes.shroomConsumed) { audioManager.playShroom(); addEffect('level-change', toAlg, 'black', 1); }
        if (appRes.hydraSplitOccurred) { audioManager.playResurrect(); addLog("The Hydra regrows its heads!"); }
        
        const captureGain = appRes.capturedPiece ? (DUNGEON_EXP_MAP[appRes.capturedPiece.type] || 1) : 0;
        if (captureGain > 0) addEffect('level-change', toAlg, 'black', captureGain);
        if (appRes.ralliedSquares) appRes.ralliedSquares.forEach(sq => addEffect('level-change', sq, 'black', 1));

        let nextB = appRes.newBoard;
        const nxtG = { white: Array.isArray(capturedPieces.white) ? [...capturedPieces.white] : [], black: Array.isArray(capturedPieces.black) ? [...capturedPieces.black] : [] }; 
        if (appRes.capturedPiece) { const pile = appRes.capturedPiece.color; nxtG[pile] = [...nxtG[pile], appRes.capturedPiece]; }

        let rookResResult: RookResurrectionResult | null = null;
        if ((oT === 'rook' || oT === 'palace') && wasCap) {
            const resRes = processRookResurrectionCheck(nextB, 'black', {from: fromAlg, to: toAlg, type: 'move'}, toAlg, oL, nxtG, Date.now());
            if (resRes.resurrectionPerformed) {
                nextB = resRes.boardWithResurrection;
                nxtG.white = resRes.capturedPiecesAfterResurrection.white;
                nxtG.black = resRes.capturedPiecesAfterResurrection.black;
                rookResResult = resRes;
                addEffect('light-beam', resRes.resurrectedSquareAlg!);
                audioManager.playResurrect();
                addLog(`Dungeon: Resurrection Call!`);
            }
        }

        if (appRes.multiPromotions) { appRes.multiPromotions.forEach(promo => { const {row: pr, col: pc} = algebraicToCoords(promo.square); const p = nextB[pr][pc].piece; if (p) { p.type = 'queen'; p.level = promo.targetLevel; } }); }
        if (rookResResult?.promotionRequiredForResurrectedPawn) {
            const {row: rr, col: rc} = algebraicToCoords(rookResResult.resurrectedSquareAlg!);
            const rp = nextB[rr][rc].piece; if (rp) { rp.type = 'queen'; }
        }

        setBoard(nextB);
        addLog(`Dungeon: ${mP.type} to ${toAlg}`);
        setTimeout(() => { 
          setIsMoveProcessing(false); setIsAiThinking(false); 

          const oS = killStreaks['black'], nS = (captureGain > 0) ? oS + captureGain : 0, isEx = appRes.extraTurn || (oS < 6 && nS >= 6);
          const cKs = { ...killStreaks, black: nS }; setKillStreaks(cKs);
          processPawnSacrificeCheck(nextB, nxtG, cKs, 'black', {from: fromAlg, to: toAlg, type: move.type as Move['type']}, oL, oT, isEx, appRes.enPassantTargetSet, oS, nS, nextB[move.to[0]][move.to[1]].piece?.id || null, wasCap, oT);
        }, 800);
    } else {
        const nextNo = aiNoMoveCounter + 1; setAiNoMoveCounter(nextNo);
        if (nextNo >= 3) { addLog("FLOOR COLLAPSE! THE DUNGEON TREMBLES!"); audioManager.playExplosion(); const sur = board.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!); advanceLevel(sur, capturedPieces); }
        setIsAiThinking(false);
    }
  }, [board, currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, killStreaks, capturedPieces, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter, aiNoMoveCounter, lastMovedPieceLevel, didCaptureLastTurn, positionHistory, processPawnSacrificeCheck, addLog, addEffect, advanceLevel]);

  useEffect(() => { if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAiThinking) { const t = setTimeout(performAiMove, 1000); return () => currentPlayer === 'black' && clearTimeout(t); } }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, performAiMove]);

  const isSpec = useMemo(() => 
    isInventoryOpen || isPromotingPawn || isAwaitingAnvilDrop || isAwaitingHolyShield || 
    isAwaitingArcherSnipe || isAwaitingPawnSacrifice || isAwaitingCommanderPromotion || 
    isSelectingMycoSpell || isAwaitingGrappleThrow || isAwaitingDanceTarget || 
    isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || 
    isAwaitingSwapScrollTarget || isAwaitingSwapScrollTarget || isAwaitingDecreeTarget || 
    isAwaitingEarthquakeScrollTarget || isAwaitingOilSlickTarget || !!isAwaitingRayTarget || isSelectingTeleportAlly || 
    isSelectingTeleportShroom || isSelectingSporeBombShroom, 
  [isInventoryOpen, isPromotingPawn, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingPawnSacrifice, isAwaitingCommanderPromotion, isSelectingMycoSpell, isAwaitingGrappleThrow, isAwaitingDanceTarget, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingEarthquakeScrollTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom]);

  const statMsg = useMemo(() => {
    if (isAiThinking) return "DUNGEON IS THINKING..."; if (isAwaitingPawnSacrifice) return "ROYAL SACRIFICE REQUIRED!"; if (isPromotingPawn) return "PROMOTE YOUR PAWN!";
    if (isAwaitingCommanderPromotion) return "SELECT PAWN TO BE PROMOTED TO COMMANDER!"; if (isAwaitingAnvilDrop) return "PLACE AN ANVIL!"; if (isAwaitingHolyShield) return "SELECT ALLY TO SHIELD!";
    if (isAwaitingArcherSnipe) return "SELECT TARGET TO SNIPE!"; if (isAwaitingDanceTarget) return dancerToDance ? "PERFORM YOUR DANCE!" : "SELECT A DANCER!";
    if (isAwaitingAnvilScrollTarget) return "PLACE AN ANVIL!";
    if (isAwaitingWindScrollTarget) return "SELECT WIND PUSH AREA!";
    if (isAwaitingEarthquakeScrollTarget) return "SELECT EARTHQUAKE AREA!";
    if (isAwaitingOilSlickTarget) return "SELECT OIL SLICK AREA!";
    if (isAwaitingRayTarget) return "SELECT RAY DIRECTION!";
    if (gameInfo.message !== " ") return gameInfo.message; return "";
  }, [isAiThinking, gameInfo.message, isAwaitingPawnSacrifice, isPromotingPawn, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingDanceTarget, dancerToDance, isAwaitingAnvilScrollTarget, isAwaitingWindScrollTarget, isAwaitingEarthquakeScrollTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget]);

  const getMsgCol = (msg: ChatMessage) => { if (msg.category === 'log' || msg.sender === 'SYSTEM') return 'text-primary'; if (msg.category === 'social') return 'text-accent'; if (msg.category === 'market') return 'text-yellow-500'; if (msg.color === 'white') return 'text-foreground'; if (msg.color === 'black') return 'text-secondary'; return 'text-muted-foreground'; };
  const handleSend = (e: React.FormEvent) => { e.preventDefault(); if (chatInput.trim()) { sendMessage(chatInput.trim(), 'battle'); setChatInput(''); } };
  const toggleCat = (cat: MessageCategory) => { const next = new Set(visibleCategories); if (next.has(cat)) { next.delete(cat); } else { next.add(cat); clearUnread(cat); } setVisibleCategories(next); };
  const hasUn = hasUnread.battle || hasUnread.social || hasUnread.log || hasUnread.market;

  const cPanel = (
    <Card className="w-full shadow-lg h-full flex flex-col relative overflow-hidden">
      {isMessengerOpen ? (
        <div className="p-2 flex flex-col h-full space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <button onClick={() => setIsMessengerOpen(false)} className="p-1 hover:bg-muted transition-colors rounded-sm"> <MessageSquare className="h-4 w-4 text-primary" /> </button>
            <div className="flex gap-1">
                <Button variant={visibleCategories.has('battle') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCat('battle')}><Sword className="h-3 w-3 mr-0.5" /> Battle</Button>
                <Button variant={visibleCategories.has('social') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCat('social')}><Users className="h-3 w-3 mr-0.5" /> Social</Button>
                <Button variant={visibleCategories.has('market') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCat('market')}><ShoppingBag className="h-3 w-3 mr-0.5" /> Trade</Button>
                <Button variant={visibleCategories.has('log') ? 'default' : 'outline'} size="sm" className="h-6 text-[0.5rem] px-1" onClick={() => toggleCat('log')}><ScrollText className="h-3 w-3 mr-0.5" /> Log</Button>
            </div>
          </div>
          <ScrollArea className="flex-grow bg-background/50 border rounded-sm p-2">
            <div className="space-y-2">
              {messages.filter(m => visibleCategories.has(m.category)).map((msg) => (
                <div key={msg.id} className="flex flex-col">
                  <div className="flex items-start gap-1">
                    <span className={cn("text-[0.6rem] font-bold uppercase", getMsgCol(msg))}>{msg.sender}:</span>
                    <span className={cn("text-[0.6rem] break-words flex-1", getMsgCol(msg))}>{msg.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <form onSubmit={handleSend} className="flex gap-1"> <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message..." className="h-7 text-[0.6rem] bg-background" /> <Button type="submit" size="sm" variant="secondary" className="h-7 px-2"><Send className="h-3 w-3" /></Button> </form>
        </div>
      ) : (
        <div className="space-y-0.5 flex-grow flex flex-col p-1.5 pt-8">
            <button onClick={() => setIsMessengerOpen(true)} className={cn( "absolute top-2 left-2 z-30 p-1 hover:bg-muted transition-colors", hasUn && "animate-chat-notify" )} > <MessageSquare className="h-5 w-5" /> </button>
            <div className="flex justify-around items-center text-center">
                <div> <p className="text-[0.6rem] font-medium text-muted-foreground uppercase leading-none mb-1">Player</p> <p className={cn("text-[0.7rem] font-bold uppercase font-pixel leading-none", currentPlayer === 'white' ? 'text-foreground' : 'text-secondary')}> {getPlayerDisplayName(currentPlayer)} </p> </div>
                <div className="space-y-0.5"> <p className="text-[0.55rem] font-bold text-destructive leading-none uppercase">W-Streak: {killStreaks.white}</p> <p className="text-[0.55rem] font-bold text-destructive interleaved uppercase">B-Streak: {killStreaks.black}</p> </div>
            </div>
            <Separator className="my-1" />
            <div className="w-full mb-1"> <h3 className="text-[0.6rem] font-bold text-muted-foreground uppercase mb-0.5 leading-none">Captured Black</h3> <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[1.5rem] p-0.5 border border-border/20"> {capturedPieces.black.length === 0 ? <span className="text-[0.5rem] text-muted-foreground">None</span> : capturedPieces.black.map(p => <div key={p.id} className="w-5 h-5"><ChessPieceDisplay piece={p} isMini /></div>)} </div> </div>
            <div className="w-full mb-1"> <h3 className="text-[0.6rem] font-bold text-muted-foreground uppercase mb-0.5 leading-none">Captured White</h3> <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[1.5rem] p-0.5 border border-border/20"> {capturedPieces.white.length === 0 ? <span className="text-[0.5rem] text-muted-foreground">None</span> : capturedPieces.white.map(p => <div key={p.id} className="w-5 h-5"><ChessPieceDisplay piece={p} isMini /></div>)} </div> </div>
            <Separator className="my-1 bg-border/30" />
            <div className="flex-grow flex flex-col justify-center min-h-[4.5rem] pt-1"> {pieceForInfoDisplay ? ( <PieceAbilitiesInfo piece={pieceForInfoDisplay} /> ) : ( <div className="text-center text-[0.6rem] text-muted-foreground leading-tight uppercase font-pixel opacity-50"> Hover for Info </div> )} </div>
        </div>
      )}
    </Card>
  );

  const mobLayout = useMemo(() => (
    <div className="lg:hidden flex flex-col h-full overflow-hidden">
      <div className="px-4 py-1 flex items-center justify-between shrink-0"> <Link href="/" className="flex items-center gap-1 text-[10px] hover:text-primary transition-colors"> <ArrowLeft className="h-4 w-4" /> LOBBY </Link> <div className="flex items-center gap-2"> {level % 10 === 0 ? <Skull className="h-4 w-4 text-destructive" /> : <Sword className="h-4 w-4 text-primary" />} <h1 className="text-sm font-bold tracking-tighter uppercase">FLOOR {level}</h1> </div> <Button variant="outline" size="sm" className="h-8 text-[10px] uppercase gap-1 border-2" onClick={() => setIsResetConfirmOpen(true)}> <RotateCcw className="h-3 w-3" /> RESET </Button> </div>
      <div className="text-center py-0 shrink-0 min-h-[0.75rem]"> <p className="text-[10px] font-bold text-primary uppercase animate-pulse"> {statMsg} </p> </div>
      <div className="w-full flex justify-center py-0.5 shrink-0"> <div className="w-full relative"> <ChessBoard boardState={board} selectedSquare={selectedSquare} possibleMoves={possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking || (isSpec && currentPlayer === 'white')} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget} playerToDropAnvil={playerToDropAnvil} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor="white" isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} /> </div> </div>
      <div className="flex-grow min-h-0 flex flex-col p-0.5"> {cPanel} </div>
      <div className="px-4 pb-4 grid grid-cols-2 gap-2 shrink-0"> <Button variant="outline" className="h-10 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted" onClick={() => setIsInventoryOpen(true)}> <Package className="h-4 w-4 text-yellow-500" /> LOOT BAG </Button> <Button variant="outline" className="h-10 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted" onClick={() => setIsRulesDialogOpen(true)}> <BookOpen className="h-4 w-4 text-yellow-500" /> RULES </Button> </div>
    </div>
  ), [level, statMsg, board, selectedSquare, possibleMoves, handleSquareClick, currentPlayer, isMoveProcessing, gameInfo.gameOver, isAiThinking, isSpec, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, enPassantTargetSquare, handlePieceHover, effects, promotionSquare, isAwaitingAnvilDrop, isAwaitingAnvilScrollTarget, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingGrappleThrow, isAwaitingDanceTarget, dancerToDance, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget, cPanel]);

  const deskLayout = useMemo(() => (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4">
      <div className="w-1/4 flex-shrink-0 flex flex-col gap-2 h-full"> <Link href="/" className="flex items-center gap-1 text-[12px] hover:text-primary transition-colors uppercase font-pixel px-1 mb-1"> <ArrowLeft className="h-4 w-4" /> Lobby </Link> {cPanel} </div>
      <div className="w-1/2 flex flex-col items-center gap-2">
        <div className="flex items-center gap-4 justify-center py-2 shrink-0 h-16"> <div className="flex items-center gap-2"> {level % 10 === 0 ? <Skull className="h-8 w-8 text-destructive" /> : <Sword className="h-8 w-8 text-primary" />} <h1 className="text-xl font-bold tracking-tighter uppercase font-pixel">FLOOR {level}</h1> </div> </div>
        <div className={cn("text-center text-[0.8rem] font-bold min-h-[1.5rem] uppercase w-full", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {statMsg} </div>
        <div className="w-full"> <ChessBoard boardState={board} selectedSquare={selectedSquare} possibleMoves={possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking || (isSpec && currentPlayer === 'white')} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget} playerToDropAnvil={playerToDropAnvil} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor="white" isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingOilSlickTarget={isAwaitingOilSlickTarget} isAwaitingRayTarget={isAwaitingRayTarget} /> </div>
      </div>
      <div className="w-1/4 flex flex-col gap-4"> <AuthWidget /> <Card className="border-2 border-border/50 bg-card"> <CardContent className="p-4 flex flex-col gap-3"> <Button variant="outline" className="h-12 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted w-full" onClick={() => setIsInventoryOpen(true)}> <Package className="h-5 w-5 text-yellow-500" /> LOOT BAG </Button> <Button variant="outline" className="h-12 text-[10px] uppercase gap-2 border-2 text-yellow-500 border-border/50 hover:bg-muted w-full" onClick={() => setIsRulesDialogOpen(true)}> <BookOpen className="h-5 h-5 text-yellow-500" /> RULES </Button> <Button variant="outline" className="h-12 text-[10px] uppercase gap-2 border-2 border-border/50 hover:bg-muted w-full" onClick={() => setIsResetConfirmOpen(true)}> <RotateCcw className="h-5 w-5" /> RESET RUN </Button> </CardContent> </Card> </div>
    </div>
  ), [level, statMsg, board, selectedSquare, possibleMoves, handleSquareClick, currentPlayer, isMoveProcessing, gameInfo.gameOver, isAiThinking, isSpec, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, enPassantTargetSquare, handlePieceHover, effects, promotionSquare, isAwaitingAnvilDrop, isAwaitingAnvilScrollTarget, playerToDropAnvil, isInventoryOpen, selectedInventoryItemType, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingGrappleThrow, isAwaitingDanceTarget, dancerToDance, grappledPieceSubject, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingOilSlickTarget, isAwaitingRayTarget, cPanel]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-pixel uppercase overflow-hidden p-0.5">
      {mobLayout} {deskLayout}
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />
      <MycoSpellMenu isOpen={isSelectingMycoSpell} mana={selectedSquare ? (board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.shroomMana || 0) : 0} onSelectSpell={null as any} onOpenChange={setIsSelectingMycoSpell} />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent className="font-pixel bg-black border-2 border-primary">
          <AlertDialogHeader> <AlertDialogTitle className="text-primary uppercase">Reset Dungeon Run?</AlertDialogTitle> <AlertDialogDescription className="text-white text-[10px] uppercase">All progress will be LOST.</AlertDialogDescription> </AlertDialogHeader>
          <AlertDialogFooter> <AlertDialogCancel className="h-10 text-[10px] uppercase">Cancel</AlertDialogCancel> <AlertDialogAction className="h-10 text-[10px] uppercase bg-destructive text-white" onClick={() => { startRun(true); setIsResetConfirmOpen(false); }}>Reset Now</AlertDialogAction> </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={handleUsePortalScroll} attunementSlots={attunementSlots} usedSlots={usedSlots} />
    </div>
  );
}
