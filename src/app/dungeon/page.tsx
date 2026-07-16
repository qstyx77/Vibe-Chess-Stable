'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import { InventoryWindow } from '@/components/evolving-chess/InventoryWindow';
import {
  initializeBoard,
  createEmptyBoard,
  applyMove,
  algebraicToCoords,
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
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
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, InventoryItem, InventoryItemType, AIGameState, AIBoardState, AISquareState, SquareState } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Swords, ArrowLeft, BrainCircuit, Package, Skull, RotateCcw } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
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
import { audioManager } from '@/lib/audio-manager';

function generateDungeonFloor(level: number, playerArmy: Piece[]): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      row.push({ piece: null, item: null, algebraic: coordsToAlgebraic(r, c), rowIndex: r, colIndex: c });
    }
    board.push(row);
  }

  const king = playerArmy.find(p => p.type === 'king');
  const queens = playerArmy.filter(p => p.type === 'queen');
  const rooks = playerArmy.filter(p => p.type === 'rook' || p.type === 'palace');
  const knights = playerArmy.filter(p => p.type === 'knight' || p.type === 'hero' || p.type === 'archer');
  const bishops = playerArmy.filter(p => p.type === 'bishop' || p.type === 'archbishop');
  const frontline = playerArmy.filter(p => ['pawn', 'dancer', 'mimic', 'grappler', 'commander', 'infiltrator'].includes(p.type));
  
  const placedIds = new Set<string>();

  const placePieceAt = (p: Piece | undefined, alg: AlgebraicSquare) => {
    if (!p) return false;
    const { row, col } = algebraicToCoords(alg);
    if (isValidSquare(row, col) && !board[row][col].piece) {
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
        placedIds.add(p.id);
        return true;
    }
    return false;
  };

  placePieceAt(king, 'e1');
  if (rooks[0]) placePieceAt(rooks[0], 'a1');
  if (rooks[1]) placePieceAt(rooks[1], 'h1');
  if (queens[0]) placePieceAt(queens[0], 'd1');
  if (knights[0]) placePieceAt(knights[0], 'b1');
  if (knights[1]) placePieceAt(knights[1], 'g1');
  if (bishops[0]) placePieceAt(bishops[0], 'c1');
  if (bishops[1]) placePieceAt(bishops[1], 'f1');

  const guardSlots: AlgebraicSquare[] = ['d2', 'e2', 'f2'];
  const wingSlots: AlgebraicSquare[] = (['a2', 'b2', 'c2', 'g2', 'h2'] as AlgebraicSquare[]).sort(() => Math.random() - 0.5);
  const frontlineOrder = [...guardSlots, ...wingSlots];

  let frontlineIdx = 0;
  for (const alg of frontlineOrder) {
    while (frontlineIdx < frontline.length && placedIds.has(frontline[frontlineIdx].id)) {
        frontlineIdx++;
    }
    if (frontlineIdx < frontline.length) {
        placePieceAt(frontline[frontlineIdx], alg);
        frontlineIdx++;
    }
  }

  const piecePriority = (type: PieceType) => {
    const values: Record<string, number> = {
        queen: 90, palace: 60, rook: 50, 
        archbishop: 40, hero: 35, archer: 35, bishop: 30, knight: 30,
        commander: 10, infiltrator: 10, dancer: 10, mimic: 10, grappler: 10, pawn: 10
    };
    return values[type] || 0;
  };

  const remainingPieces = playerArmy
    .filter(p => !placedIds.has(p.id))
    .sort((a, b) => piecePriority(b.type) - piecePriority(a.type));

  const fillOrder: AlgebraicSquare[] = [
    'd1', 'e1', 'c1', 'f1', 'b1', 'g1', 'a1', 'h1',
    'd2', 'e2', 'c2', 'f2', 'b2', 'g2', 'a2', 'h2',
    'd3', 'e3', 'c3', 'f3', 'b3', 'g3', 'a3', 'h3',
    'd4', 'e4', 'c4', 'f4', 'b4', 'g4', 'a4', 'h4',
  ];

  let fillIdx = 0;
  for (const p of remainingPieces) {
    while (fillIdx < fillOrder.length) {
        const alg = fillOrder[fillIdx] as AlgebraicSquare;
        const { row, col } = algebraicToCoords(alg);
        if (!board[row][col].piece) {
            placePieceAt(p, alg);
            break;
        }
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
        break;
      case 3: 
        const colL = 15;
        board[0][3].piece = { id: 'boss-colossus-tl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-colossus-tr', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][3].piece = { id: 'boss-colossus-bl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][4].piece = { id: 'boss-colossus-br', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) {
            if (i === 3 || i === 4) continue;
            board[1][i].piece = { id: `shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        }
        for(let i=0; i<8; i++) board[2][i].piece = { id: `front-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
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
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        }
        break;
    }
  } else {
    const pieceCount = Math.min(16, 2 + Math.floor(level / 3));
    const avgLevel = Math.max(1, Math.floor(level / 7) + 1);
    const formations = ['rank', 'diamond', 'triangle', 'scatter'];
    const formation = formations[Math.floor(Math.random() * formations.length)];
    const possibleSquares: {r: number, c: number}[] = [];
    if (formation === 'rank') { for(let r=0; r<2; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c}); }
    else if (formation === 'diamond') { for(let r=0; r<5; r++) for(let c=0; c<8; c++) { if (Math.abs(r - 2) + Math.abs(c - 3.5) <= 3) possibleSquares.push({r,c}); } }
    else if (formation === 'triangle') { for(let r=0; r<4; r++) for(let c=r; c<8-r; c++) possibleSquares.push({r,c}); }
    else { for(let r=0; r<4; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c}); }
    const chosenSquares = possibleSquares.sort(() => Math.random() - 0.5).slice(0, pieceCount);
    chosenSquares.forEach((pos, i) => {
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

function adaptBoardForAI(currentBoardState: BoardState, playerForAITurn: PlayerColor, currentKillStreaks: { white: number; black: number }, currentCapturedPieces: { white: Piece[]; black: Piece[] }, gameMoveCounter: number, firstBloodAchieved: boolean, playerWhoGotFirstBlood: PlayerColor | null, enPassantTargetSquare: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, shroomSpawnCounter?: number, nextShroomSpawnTurn?: number, necroResurrectionCounter?: number): AIGameState {
  const newAiBoard: AIBoardState = [];
  for (let r_idx = 0; r_idx < 8; r_idx++) {
    const boardRow = currentBoardState[r_idx];
    const newAiRow: AISquareState[] = [];
    if (boardRow) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const squareState = boardRow[c_idx];
        newAiRow.push({ piece: squareState?.piece ? { ...squareState.piece } : null, item: squareState?.item ? { ...squareState.item } : null });
      }
    } else { for (let c_idx = 0; c_idx < 8; c_idx++) newAiRow.push({ piece: null, item: null }); }
    newAiBoard.push(newAiRow);
  }
  return { board: newAiBoard, currentPlayer: playerForAITurn, killStreaks: { white: currentKillStreaks?.white || 0, black: currentKillStreaks?.black || 0 }, capturedPieces: { white: currentCapturedPieces?.white ? currentCapturedPieces.white.map(p => ({ ...p })) : [], black: currentCapturedPieces?.black ? currentCapturedPieces.black.map(p => ({ ...p })) : [] }, gameOver: false, winner: undefined, extraTurn: false, gameMoveCounter: gameMoveCounter, firstBloodAchieved: firstBloodAchieved, playerWhoGotFirstBlood: playerWhoGotFirstBlood, enPassantTargetSquare: enPassantTargetSquare, shroomSpawnCounter: shroomSpawnCounter, nextShroomSpawnTurn: nextShroomSpawnTurn, necroResurrectionCounter: necroResurrectionCounter, lastMovedPieceType: lastMovedPieceType };
}

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [playerArmy, setPlayerArmy] = useState<Piece[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({ message: "Welcome to the Dungeon", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [lastMovedPieceType, setLastMovedPieceType] = useState<PieceType | null>(null);
  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);
  const [necroResurrectionCounter, setNecroResurrectionCounter] = useState(0);
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [specialActionContext, setSpecialActionContext] = useState<{ extra: boolean, nextEp: AlgebraicSquare | null, oldStreak: number, newStreak: number, completedMilestones: string[], actingPlayer: PlayerColor, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number } } | null>(null);

  const [isAwaitingDanceTarget, setIsAwaitingDanceTarget] = useState(false);
  const [dancerToDance, setDancerToDance] = useState<AlgebraicSquare | null>(null);

  const [isAwaitingGrappleThrow, setIsAwaitingGrappleThrow] = useState(false);
  const [grappledPieceSubject, setGrappledPieceSubject] = useState<{ piece: Piece, from: AlgebraicSquare } | null>(null);

  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [isAwaitingDecreeTarget, setIsAwaitingDecreeTarget] = useState(false);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const [aiStalemateStrikes, setAiStalemateStrikes] = useState(0);
  const [hasMovedOnCurrentFloor, setHasMovedOnCurrentFloor] = useState(false);
  const [colossusAwakened, setColossusAwakened] = useState(false);
  const uniqueIdCounterRef = useRef(30000);

  const prevBoardRef = useRef<BoardState | null>(null);
  const moveCounter = useRef(0);
  const signaledEventsRef = useRef<Set<string>>(new Set());
  const isInitialized = useRef(false);

  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => board.flat().filter(sq => sq.piece?.heldItem).length, [board]);
  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => { setEffects(curr => curr.filter(e => e.id !== id)); }, 1500);
  }, []);

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingDecreeTarget || isAwaitingDanceTarget || isAwaitingGrappleThrow;
  const isLocalActionTurn = currentPlayer === 'white';

  const saveDungeonState = useCallback((currentLevel: number, currentBoard: BoardState, currentP: PlayerColor, ks: any, caps: any, shroomC: number, nextShroom: number, ep: AlgebraicSquare | null, nrc: number) => {
    if (!user || !firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userDocRef, { dungeonState: { level: currentLevel, board: currentBoard.flat(), currentPlayer: currentP, killStreaks: ks, capturedPieces: caps, shroomSpawnCounter: shroomC, nextShroomSpawnTurn: nextShroom, enPassantTargetSquare: ep, necroResurrectionCounter: nrc } });
  }, [user, firestore]);

  const advanceLevel = useCallback((survivorsFromLastBoard: Piece[], currentGraveyard: { white: Piece[], black: Piece[] }) => {
    const nextLevel = level + 1;
    if (nextLevel > 50) { setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' })); audioManager.playVictory(); return; }
    setIsMoveProcessing(false); clickGuard.current = false; setLastMoveFrom(null); setLastMoveTo(null); setAnimatedSquareTo(null); setSelectedSquare(null); setPossibleMoves([]);
    setLevel(nextLevel); setAiStalemateStrikes(0); setHasMovedOnCurrentFloor(false); setColossusAwakened(false); setPlayerArmy(survivorsFromLastBoard);
    const newBoard = generateDungeonFloor(nextLevel, survivorsFromLastBoard); setBoard(newBoard);
    const updatedGraveyard = { white: [], black: currentGraveyard.black }; setCapturedPieces(updatedGraveyard);
    const ks = { white: 0, black: 0 }; setKillStreaks(ks);
    const sC = 0; const nS = Math.floor(Math.random() * 6) + 5;
    setShroomSpawnCounter(sC); setNextShroomSpawnTurn(nS); setNecroResurrectionCounter(0); setEnPassantTargetSquare(null); setLastMovedPieceType(null);
    const hasCommander = survivorsFromLastBoard.some(p => ['commander', 'hero'].includes(p.type));
    setFirstBloodAchieved(hasCommander); setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
    
    // RESET SPECIAL ACTION STATES
    setIsAwaitingDanceTarget(false);
    setDancerToDance(null);
    setIsAwaitingCommanderPromotion(false);
    setIsAwaitingAnvilDrop(false);
    setIsAwaitingHolyShield(false);
    setIsAwaitingArcherSnipe(false);
    setIsAwaitingPawnSacrifice(false);
    setIsAwaitingGrappleThrow(false);
    setGrappledPieceSubject(null);
    setIsInventoryOpen(false);
    setSpecialActionContext(null);
    setIsAwaitingWindScrollTarget(false);
    setIsAwaitingAnvilScrollTarget(false);
    setIsAwaitingShieldScrollTarget(false);
    setIsAwaitingSwapScrollTarget(false);
    setIsAwaitingDecreeTarget(false);
    setAbilityChoiceDialog(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    saveDungeonState(nextLevel, newBoard, 'white', ks, updatedGraveyard, sC, nS, null, 0);
    const isBoss = nextLevel % 10 === 0;
    let welcomeMsg = isBoss ? `BOSS BATTLE: Floor ${nextLevel}` : `Level ${nextLevel} - Wipe them out!`;
    setGameInfo({ message: welcomeMsg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    toast({ title: "Level Up!", description: `Descending to Floor ${nextLevel}...` }); audioManager.playLevelUp();
  }, [level, toast, saveDungeonState]);

  const warpToLevel = useCallback((targetLevel: number, type: InventoryItemType) => {
    if (hasMovedOnCurrentFloor) return;
    const survivors = board.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    setIsMoveProcessing(false); clickGuard.current = false; setLastMoveFrom(null); setLastMoveTo(null); setAnimatedSquareTo(null); setSelectedSquare(null); setPossibleMoves([]);
    setLevel(targetLevel); setAiStalemateStrikes(0); setHasMovedOnCurrentFloor(false); setColossusAwakened(false); setPlayerArmy(survivors);
    const newBoard = generateDungeonFloor(targetLevel, survivors); setBoard(newBoard); setCapturedPieces(prev => ({ white: [], black: prev.black })); setCurrentPlayer('white');
    const ks = { white: 0, black: 0 }; setKillStreaks(ks);
    const sC = 0; const nS = Math.floor(Math.random() * 6) + 5;
    setShroomSpawnCounter(sC); setNextShroomSpawnTurn(nS); setNecroResurrectionCounter(0); setEnPassantTargetSquare(null); setLastMovedPieceType(null);
    setInventory(prev => { const next = [...prev]; const item = next.find(i => i.type === type); if (item) { item.count--; if (item.count <= 0) return next.filter(i => i.type !== type); } return next; });
    
    // RESET SPECIAL ACTION STATES
    setIsAwaitingDanceTarget(false);
    setDancerToDance(null);
    setIsAwaitingCommanderPromotion(false);
    setIsAwaitingAnvilDrop(false);
    setIsAwaitingHolyShield(false);
    setIsAwaitingArcherSnipe(false);
    setIsAwaitingPawnSacrifice(false);
    setIsAwaitingGrappleThrow(false);
    setGrappledPieceSubject(null);
    setIsInventoryOpen(false);
    setSpecialActionContext(null);
    setIsAwaitingWindScrollTarget(false);
    setIsAwaitingAnvilScrollTarget(false);
    setIsAwaitingShieldScrollTarget(false);
    setIsAwaitingSwapScrollTarget(false);
    setIsAwaitingDecreeTarget(false);
    setAbilityChoiceDialog(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    saveDungeonState(targetLevel, newBoard, 'white', ks, { white: [], black: capturedPieces.black }, sC, nS, null, 0);
    const isBoss = targetLevel % 10 === 0;
    let msg = isBoss ? `BOSS BATTLE: Floor ${targetLevel}` : `Level ${targetLevel} - Wipe them out!`;
    setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    toast({ title: "PORTAL ACTIVATED", description: `Warped to Floor ${targetLevel}!` }); audioManager.playResurrect();
  }, [board, hasMovedOnCurrentFloor, toast, saveDungeonState, capturedPieces.black]);

  const processMoveEnd = useCallback((boardAfter: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, turnPlayer: PlayerColor, extra: boolean, nextEpSquare: AlgebraicSquare | null = null) => {
    let nextBoard = boardAfter;
    let nextGraveyard = { white: [...currentGraveyard.white], black: [...currentGraveyard.black] };
    if (!extra && turnPlayer === 'white' && isKingInCheck(nextBoard, 'white', nextEpSquare, lastMovedPieceType)) {
      setGameInfo({ message: "SPLIT SELF-CHECK! AUTO-LOSS", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); audioManager.playDefeat(); return;
    }
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(nextBoard, nextP);
    nextBoard = boardAfterPoison;
    if (poisonedCaptures.length > 0) {
        poisonedCaptures.forEach(p => {
          const victim = { ...p, id: `${p.id}_psn_${Date.now()}` };
          const targetPile = victim.color === 'white' ? 'black' : 'white';
          nextGraveyard[targetPile].push(victim);
          currentKs[victim.color === 'white' ? 'black' : 'white'] += 1;
        });
        setCapturedPieces(nextGraveyard); setKillStreaks({ ...currentKs });
        audioManager.playCapture(); toast({ title: "Poison Damage!", description: `${poisonedCaptures.length} piece(s) affected by poison!` });
    }
    let finalNRC = necroResurrectionCounter;
    if (turnPlayer === 'white' && !extra) {
        const necroSq = nextBoard.flat().find(sq => sq.piece?.id === 'boss-necro');
        if (necroSq) {
            finalNRC++;
            if (finalNRC >= 5) {
                const myGraveyard = nextGraveyard.black; 
                if (myGraveyard.length > 0) {
                    const sorted = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0));
                    const choice = sorted[0];
                    const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                    if (choice && empty.length > 0) {
                        const sq = empty[Math.floor(Math.random() * empty.length)];
                        const {row, col} = algebraicToCoords(sq.algebraic);
                        const res = { ...choice, level: 1, id: `${choice.id}_necro_res_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                        if ((['pawn', 'dancer', 'mimic', 'grappler', 'commander'].includes(res.type)) && row === 7) res.type = 'queen';
                        nextBoard[row][col].piece = res; nextGraveyard.black = nextGraveyard.black.filter(p => p.id !== choice.id);
                        setCapturedPieces({ ...nextGraveyard }); addEffect('light-beam', sq.algebraic); audioManager.playResurrect();
                        toast({ title: "Necromancy!", description: "The Necromancer has brought back a fallen soul!", variant: "destructive" }); finalNRC = 0;
                    }
                }
            }
            setNecroResurrectionCounter(finalNRC);
        }
    }
    setBoard(nextBoard); setEnPassantTargetSquare(nextEpSquare); setCapturedPieces(nextGraveyard); setKillStreaks(currentKs);
    const survivors = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const enemyCount = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    const dungeonKing = findKing(nextBoard, 'black');
    const isDungeonCheckmated = dungeonKing && isCheckmate(nextBoard, 'black', nextEpSquare, lastMovedPieceType);
    
    if (level === 30 && isDungeonCheckmated) {
        const currentDefeats = userData?.colossusDefeats || 0;
        const nextDefeats = currentDefeats + 1;
        const ref = doc(firestore, 'users', user!.uid);
        const currentUnlocked = userData?.unlockedPieces || [];
        let update: any = { colossusDefeats: nextDefeats };
        if (nextDefeats >= 5 && !currentUnlocked.includes('grappler')) {
            update.unlockedPieces = [...currentUnlocked, 'grappler'];
            toast({ title: "PIECE UNLOCKED!", description: "You unlocked the Grappler! This powerful unit can pick up and toss other pieces.", duration: 10000 });
        }
        updateDocumentNonBlocking(ref, update);
    }

    if (level === 30) {
        const minions = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
        if (minions.length === 0 && !colossusAwakened) {
            setColossusAwakened(true); toast({ title: "COLOSSUS AWAKENS!", description: "He can now be checkmated! Watch out for his crushing stride!", duration: 5000 });
        }
    }
    if (enemyCount === 0 || isDungeonCheckmated) {
      if (level === 50) {
          const ref = doc(firestore, 'users', user!.uid);
          const currentUnlocked = userData?.unlockedPieces || [];
          let nextUnlocked = [...currentUnlocked];
          if (!currentUnlocked.includes('dancer')) {
              nextUnlocked.push('dancer');
              toast({ title: "PIECE UNLOCKED!", description: "You unlocked the Dancer! A graceful new unit joins your starting army.", duration: 10000 });
          } else if (!currentUnlocked.includes('mimic')) {
              nextUnlocked.push('mimic');
              toast({ title: "PIECE UNLOCKED!", description: "You unlocked the Mimic! This shifting box replicates moved pieces.", duration: 10000 });
          }
          if (nextUnlocked.length > currentUnlocked.length) {
              updateDocumentNonBlocking(ref, { unlockedPieces: nextUnlocked });
          }
      }
      advanceLevel(survivors, nextGraveyard); return;
    }
    if (extra) { toast({ title: "EXTRA TURN!", description: `${turnPlayer === 'white' ? 'Hero' : 'Dungeon'} gains another move!` }); audioManager.playLevelUp(); }
    
    let newShroomCounter = shroomSpawnCounter + 1; 
    let finalNextShroom = nextShroomSpawnTurn;
    if (newShroomCounter >= nextShroomSpawnTurn) {
        const { newBoard: boardWithShroom, spawnedAt } = spawnShroom(nextBoard);
        if (spawnedAt) {
            nextBoard = boardWithShroom; setBoard(nextBoard); 
            newShroomCounter = 0; 
            finalNextShroom = Math.floor(Math.random() * 6) + 5;
            toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 }); audioManager.playShroom();
        }
    }
    setShroomSpawnCounter(newShroomCounter);
    setNextShroomSpawnTurn(finalNextShroom);

    saveDungeonState(level, nextBoard, nextP, currentKs, nextGraveyard, newShroomCounter, finalNextShroom, nextEpSquare, finalNRC);
    const playerKing = findKing(nextBoard, 'white');
    if (!playerKing || isCheckmate(nextBoard, 'white', nextEpSquare, lastMovedPieceType)) {
      setGameInfo({ message: "YOUR KING HAS FALLEN", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); audioManager.playDefeat(); return;
    }
    const inCheck = isKingInCheck(nextBoard, nextP, nextEpSquare, lastMovedPieceType);
    if (inCheck && extra) {
        setGameInfo({ message: `Auto-Checkmate! ${turnPlayer === 'white' ? 'Hero' : 'Dungeon'} wins!`, isCheck: true, playerWithKingInCheck: nextP, isCheckmate: true, isStalemate: false, gameOver: true, winner: turnPlayer }); audioManager.playVictory(); return;
    }
    if (inCheck) audioManager.playCheck();
    const isBoss = level % 10 === 0;
    let gameMsg = inCheck ? "Check!" : (isBoss ? `BOSS BATTLE: Floor ${level}` : `Level ${level} - Wipe them out!`);
    setGameInfo({ message: gameMsg, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextP : null, isCheckmate: false, isStalemate: false, gameOver: false });
    setCurrentPlayer(nextP);
  }, [advanceLevel, level, toast, shroomSpawnCounter, nextShroomSpawnTurn, saveDungeonState, necroResurrectionCounter, addEffect, colossusAwakened, user, firestore, userData, lastMovedPieceType, setIsAwaitingDanceTarget, setDancerToDance, setIsAwaitingCommanderPromotion, setIsAwaitingAnvilDrop, setIsAwaitingHolyShield, setIsAwaitingArcherSnipe, setIsAwaitingPawnSacrifice, setIsAwaitingGrappleThrow, setGrappledPieceSubject, setIsInventoryOpen, setSpecialActionContext, setIsAwaitingWindScrollTarget, setIsAwaitingAnvilScrollTarget, setIsAwaitingShieldScrollTarget, setIsAwaitingSwapScrollTarget, setIsAwaitingDecreeTarget, setAbilityChoiceDialog, setIsPromotingPawn, setPromotionSquare]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = []) => {
    const isAI = actingPlayer === 'black';
    let nextGraveyard = { ...currentGraveyard };

    if (newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const hasDancers = boardToChain.flat().some(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
        if (hasDancers) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const aiDancer = nextBoard.flat().find(sq => sq.piece?.type === 'dancer' && sq.piece.color === 'black');
                if (aiDancer) {
                    const {row, col} = algebraicToCoords(aiDancer.algebraic);
                    if (isValidSquare(row+1, col) && !nextBoard[row+1][col].piece && !nextBoard[row+1][col].item) {
                        nextBoard[row+1][col].piece = { ...nextBoard[row][col].piece!, hasMoved: true };
                        nextBoard[row][col].piece = null;
                    }
                }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'dance']);
                return;
            } else {
                setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'], actingPlayer, currentGraveyard: nextGraveyard, currentKs });
                setIsAwaitingDanceTarget(true); return;
            }
        }
    }

    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'black' && sq.piece.level === 1);
            if (pawnSq) { const {row, col} = algebraicToCoords(pawnSq.algebraic); nextBoard[row][col].piece!.type = 'commander'; nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_AI_${Date.now()}`; }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'firstBlood']); return;
        } else {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (hasL1Targets) { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'], actingPlayer, currentGraveyard: nextGraveyard, currentKs }); setIsAwaitingCommanderPromotion(true); return; }
        }
    }
    if (newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === actingPlayer);
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const targets = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded);
                if (targets.length > 0) targets[Math.floor(Math.random() * targets.length)].piece!.isShielded = true;
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield']); return;
            } else { 
                const hasEligibleTargets = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded);
                if (hasEligibleTargets) {
                    setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'], actingPlayer, currentGraveyard: nextGraveyard, currentKs }); setIsAwaitingHolyShield(true); return; 
                } else {
                    triggerSpecialsChain(boardToChain, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield']); return;
                }
            }
        }
    }
    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const archers = pieces.filter(p => p.type === 'archer');
    const maxArcherLevel = archers.length > 0 ? Math.max(...archers.map(a => a.level || 1)) : 0;
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.color === actingPlayer && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && archers.length > 0 && !completedMilestones.includes('snipe')) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow && !completedMilestones.includes('snipe'));
    if (isSnipeTime) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxArcherLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.id.startsWith('boss-colossus'));
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const v = victims[Math.floor(Math.random() * victims.length)]; const {row, col} = algebraicToCoords(v.algebraic);
                const sniped = { ...nextBoard[row][col].piece!, id: `${nextBoard[row][col].piece!.id}_sniped_AI_${Date.now()}` };
                const aiArchers = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && sq.piece.type === 'archer').map(sq => sq.piece!);
                const responsibleAIArcher = aiArchers.find(a => a.level >= (v.piece?.level || 1));
                if (responsibleAIArcher) { const gain = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[v.piece!.type] || 0; responsibleAIArcher.level += gain; }
                const targetPile = sniped.color === 'white' ? 'black' : 'white';
                nextGraveyard[targetPile].push(sniped);
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe']); return;
            } else { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'], actingPlayer, currentGraveyard: nextGraveyard, currentKs }); setIsAwaitingArcherSnipe(true); return; }
        }
    }
    if (newStreak >= 3 && oldStreak < 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) empty[Math.floor(Math.random() * empty.length)].item = { type: 'anvil' };
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'anvil']); return;
        } else { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'], actingPlayer, currentGraveyard: nextGraveyard, currentKs }); setIsAwaitingAnvilDrop(true); return; }
    }
    if (newStreak >= 4 && oldStreak < 4 && !completedMilestones.includes('resurrection')) {
        const myGraveyard = actingPlayer === 'white' ? nextGraveyard.black : nextGraveyard.white; 
        if (myGraveyard.length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sorted = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
            const choice = sorted[0]; const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random() * empty.length)]; const {row, col} = algebraicToCoords(sq.algebraic);
                const res = { ...choice, level: 1, id: `${choice.id}_res_KS_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (res.type === 'commander' && row === oppBackRank) res.type = 'hero';
                nextBoard[row][col].piece = res; 
                const updatedG = { ...nextGraveyard };
                if (actingPlayer === 'white') updatedG.black = updatedG.black.filter(p => p.id !== choice.id); else updatedG.white = updatedG.white.filter(p => p.id !== choice.id);
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect();
                if (!isAI && (['pawn', 'dancer', 'mimic', 'grappler'].includes(res.type)) && row === oppBackRank) {
                    setPromotionTargetLevel(1); setPromotionSquare(sq.algebraic); setIsPromotingPawn(true);
                    setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'resurrection'], actingPlayer, currentGraveyard: updatedG, currentKs }); return;
                }
                if (isAI && (['pawn', 'dancer', 'mimic', 'grappler'].includes(res.type)) && row === oppBackRank) nextBoard[row][col].piece!.type = 'queen';
                triggerSpecialsChain(nextBoard, updatedG, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection']); return;
            }
        }
    }
    processMoveEnd(boardToChain, nextGraveyard, currentKs, actingPlayer, isExtra, nextEp);
  }, [firstBloodAchieved, addEffect, processMoveEnd, setCapturedPieces, setKillStreaks, setIsAwaitingDanceTarget, setDancerToDance, setIsAwaitingCommanderPromotion, setIsAwaitingAnvilDrop, setIsAwaitingHolyShield, setIsAwaitingArcherSnipe, setIsAwaitingPawnSacrifice, setIsAwaitingGrappleThrow, setGrappledPieceSubject, setIsInventoryOpen, setSpecialActionContext, setIsAwaitingWindScrollTarget, setIsAwaitingAnvilScrollTarget, setIsAwaitingShieldScrollTarget, setIsAwaitingSwapScrollTarget, setIsAwaitingDecreeTarget, setAbilityChoiceDialog, setIsPromotingPawn, setPromotionSquare]);

  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || isMoveProcessing || isAiThinking || currentPlayer !== 'black' || isAnySpecialModeActive) return;
    setIsAiThinking(true);
    try {
      const gameStateForAi = adaptBoardForAI(board, 'black', killStreaks, capturedPieces, moveCounter.current, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter);
      const aiResult = aiInstance.current?.getBestMove(gameStateForAi, 'black'); const aiMove = aiResult?.move;
      if (aiMove) {
        setHasMovedOnCurrentFloor(true); setAiStalemateStrikes(0);
        const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]); const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
        const movingPiece = board[aiMove.from[0]][aiMove.from[1]].piece; if (!movingPiece) throw new Error("AI tried to move non-existent piece");
        const originalL = movingPiece.level || 1; const originalT = movingPiece.type;
        setIsMoveProcessing(true); setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg); moveCounter.current++;
        setLastMovedPieceType(originalT);
        const result = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces);
        let { newBoard, capturedPiece, selfDestructCaptures, shroomConsumed, enPassantTargetSet: nextEp, reflectionOccurred, promotedToHero } = result;
        const updatedCapturedPieces = { white: [...capturedPieces.white], black: [...capturedPieces.black] };
        if (result.itemReturned) {
          setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === result.itemReturned); if (existing) existing.count++; else next.push({ type: result.itemReturned!, count: 1 }); return next; });
        }
        if (reflectionOccurred) {
            const victim = capturedPiece!; 
            const targetPile = victim.color === 'white' ? 'black' : 'white';
            updatedCapturedPieces[targetPile].push({ ...victim, id: `${victim.id}_refl_aj_${Date.now()}` }); setCapturedPieces(updatedCapturedPieces);
            audioManager.playCapture(); const newKs = { white: 0, black: 0 }; setKillStreaks(newKs); setBoard(newBoard);
            setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(newBoard, updatedCapturedPieces, newKs, 'black', false, null); }, 800); return;
        }
        if (shroomConsumed) audioManager.playShroom();
        if (capturedPiece || (selfDestructCaptures && selfDestructCaptures.length > 0)) audioManager.playCapture(); else audioManager.playMove();
        if (promotedToHero) { audioManager.playLevelUp(); addEffect('light-beam', toAlg); }
        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (selfDestructCaptures?.length || 0);
        const oldStreak = killStreaks.black; const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
        const currentKs = { ...killStreaks, black: newStreak }; setKillStreaks(currentKs);
        const isObliteration = result.promotedToInfiltrator || (movingPiece.type === 'infiltrator' && capturedPiece);
        
        if (capturedPiece && !isObliteration) {
            const targetPile = capturedPiece.color === 'white' ? 'black' : 'white';
            updatedCapturedPieces[targetPile].push({ ...capturedPiece!, id: `${capturedPiece!.id}_cap_ai_${Date.now()}` });
        }
        if (selfDestructCaptures) {
            selfDestructCaptures.forEach(p => {
                const targetPile = p.color === 'white' ? 'black' : 'white';
                updatedCapturedPieces[targetPile].push({ ...p, id: `${p.id}_sd_ai_${Date.now()}` });
            });
        }
        if (result.pieceCapturedByAnvil) {
            const targetPile = result.pieceCapturedByAnvil.color === 'white' ? 'black' : 'white';
            updatedCapturedPieces[targetPile].push({ ...result.pieceCapturedByAnvil!, id: `${result.pieceCapturedByAnvil!.id}_anvil_ai_${Date.now()}` });
        }
        
        setCapturedPieces(updatedCapturedPieces);
        if (result.infiltrationWin) { setBoard(newBoard); setGameInfo({ message: "INFILTRATION! DUNGEON OVERRUN", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: 'black' }); audioManager.playDefeat(); setIsAiThinking(false); setIsMoveProcessing(false); return; }
        if (result.conversionEvents && result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => { addEffect('conversion', e.at, e.byPiece.color); audioManager.playConversion(); }); }
        const aiLandedPieceOnToSquare = newBoard[aiMove.to[0]][aiMove.to[1]].piece;
        if (aiLandedPieceOnToSquare && (['rook', 'palace'].includes(aiLandedPieceOnToSquare.type)) && (streakGain > 0)) {
            const resResult = processRookResurrectionCheck(newBoard, 'black', {from: fromAlg, to: toAlg, type: 'move'} as Move, toAlg, originalL, updatedCapturedPieces, uniqueIdCounterRef.current);
            if (resResult.resurrectionPerformed) { uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!; newBoard = resResult.boardWithResurrection; setCapturedPieces(resResult.capturedPiecesAfterResurrection); updatedCapturedPieces.white = resResult.capturedPiecesAfterResurrection.white; updatedCapturedPieces.black = resResult.capturedPiecesAfterResurrection.black; addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect(); if (resResult.promotionRequiredForResurrectedPawn) { const {row: pr, col: pc} = algebraicToCoords(resResult.resurrectedSquareAlg!); newBoard[pr][pc].piece!.type = 'queen'; } }
        }
        setBoard(newBoard);
        setTimeout(() => {
            setIsAiThinking(false); setIsMoveProcessing(false); const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
            const landedPiece = newBoard[aiMove.to[0]][aiMove.to[1]].piece;
            if (landedPiece?.type === 'queen' && landedPiece.level === 7 && originalL < 7 && originalT === 'queen') {
                   const pawns = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && ['pawn', 'dancer', 'mimic', 'grappler', 'commander'].includes(sq.piece.type));
                   if (pawns.length > 0) { 
                       const sacPiece = pawns[0]; 
                       const {row: sr, col: sc} = algebraicToCoords(sacPiece.algebraic); 
                       const sacPieceData = { ...newBoard[sr][sc].piece! }; 
                       newBoard[sr][sc].piece = null; 
                       const targetPile = sacPieceData.color === 'white' ? 'black' : 'white';
                       updatedCapturedPieces[targetPile].push({ ...sacPieceData, id: `${sacPieceData.id}_sac_ai_${Date.now()}` }); 
                       setCapturedPieces({ ...updatedCapturedPieces }); 
                       audioManager.playCapture(); 
                   }
            }
            if ((['pawn', 'dancer', 'mimic', 'grappler'].includes(landedPiece?.type || '')) && (aiMove.to[0] === 7)) { landedPiece!.type = aiMove.promoteTo || 'queen'; landedPiece!.level = getPromotionLevel(capturedPiece?.type || result.pieceCapturedByAnvil?.type || null); if (landedPiece!.type === 'queen') landedPiece!.level = Math.min(landedPiece!.level, 7); audioManager.playLevelUp(); }
            triggerSpecialsChain(newBoard, updatedCapturedPieces, currentKs, oldStreak, newStreak, isExtra, nextEp, 'black');
        }, 800);
      } else {
        const nextStrikes = aiStalemateStrikes + 1; setAiStalemateStrikes(nextStrikes); const resetKs = { ...killStreaks, black: 0 }; setKillStreaks(resetKs);
        if (nextStrikes >= 3) {
            toast({ title: "DUNGEON COLLAPSE!", description: "The Dungeon forces have collapsed after failing to move 3 times!", variant: "destructive" }); audioManager.playExplosion();
            let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));
            const blackPieceSquares: {r: number, c: number}[] = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (nextBoard[r][c].piece?.color === 'black') blackPieceSquares.push({ r, c });
            const capturedByCollapse: Piece[] = [];
            blackPieceSquares.forEach(({ r, c }) => {
                addEffect('explosion', coordsToAlgebraic(r, c));
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = r + dr; const nc = c + dc; if (isValidSquare(nr, nc)) { const targetSq = nextBoard[nr][nc]; if (targetSq.item?.type === 'anvil') targetSq.item = null; if (targetSq.piece && targetSq.piece.color === 'white' && targetSq.piece.type !== 'king') { if (targetSq.piece.heldItem === 'blast_shield') continue; capturedByCollapse.push({ ...targetSq.piece, id: `${targetSq.piece.id}_collapse_${Date.now()}_${Math.random()}` }); targetSq.piece = null; } } }
                nextBoard[r][c].piece = null;
            });
            const updatedG = { ...capturedPieces }; 
            if (capturedByCollapse.length > 0) { 
                capturedByCollapse.forEach(p => {
                    const targetPile = p.color === 'white' ? 'black' : 'white';
                    updatedG[targetPile].push(p);
                });
                setCapturedPieces(updatedG); 
            }
            setBoard(nextBoard); setTimeout(() => { setIsAiThinking(false); processMoveEnd(nextBoard, updatedG, resetKs, 'black', false, null); }, 800);
        } else { toast({ title: "Dungeon Skip", description: `The Dungeon has no legal moves! Strike ${nextStrikes}/3` }); setTimeout(() => { setIsAiThinking(false); processMoveEnd(board, capturedPieces, resetKs, 'black', false, null); }, 800); }
      }
    } catch (e) { console.error("AI Error:", e); setIsAiThinking(false); }
  }, [board, killStreaks, capturedPieces, enPassantTargetSquare, gameInfo.gameOver, isMoveProcessing, isAiThinking, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, isAnySpecialModeActive, aiStalemateStrikes, addEffect, triggerSpecialsChain, toast, necroResurrectionCounter, level, lastMovedPieceType]);

  useEffect(() => { if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) { const timer = setTimeout(performAiMove, 500); return () => typeof window !== 'undefined' && clearTimeout(timer); } }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, performAiMove]);

  const saveLoadoutToFirestore = useCallback((currentBoard: BoardState, currentInv: InventoryItem[]) => {
    if (!user || !firestore) return;
    const equipment: Record<string, string> = {};
    currentBoard.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
    updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { inventory: currentInv, equipment });
  }, [user, firestore]);

  const startRun = useCallback((reset: boolean = false) => {
    if (isUserLoading || !userData || !user) return;
    setIsMoveProcessing(false); clickGuard.current = false; setHasMovedOnCurrentFloor(false); setColossusAwakened(false); setLastMoveFrom(null); setLastMoveTo(null); setAnimatedSquareTo(null); setSelectedSquare(null); setPossibleMoves([]); setLastMovedPieceType(null);
    
    setIsAwaitingDanceTarget(false);
    setDancerToDance(null);
    setIsAwaitingCommanderPromotion(false);
    setIsAwaitingAnvilDrop(false);
    setIsAwaitingHolyShield(false);
    setIsAwaitingArcherSnipe(false);
    setIsAwaitingPawnSacrifice(false);
    setIsAwaitingGrappleThrow(false);
    setGrappledPieceSubject(null);
    setIsInventoryOpen(false);
    setSpecialActionContext(null);
    setIsAwaitingWindScrollTarget(false);
    setIsAwaitingAnvilScrollTarget(false);
    setIsAwaitingShieldScrollTarget(false);
    setIsAwaitingSwapScrollTarget(false);
    setIsAwaitingDecreeTarget(false);
    setAbilityChoiceDialog(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    const saved = userData.dungeonState;
    if (!reset && saved && saved.board && saved.board.length > 0) {
      setLevel(saved.level); const loadedBoard: BoardState = []; const savedBoard1D = saved.board as SquareState[];
      if (savedBoard1D.length === 64) { for (let i = 0; i < 8; i++) { loadedBoard.push(savedBoard1D.slice(i * 8, i * 8 + 8)); } setBoard(loadedBoard); }
      else { const army: Piece[] = []; const elo = userData.eloRating || 1200; let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []); initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); }); setBoard(generateDungeonFloor(1, army)); setLevel(1); }
      setCurrentPlayer(saved.currentPlayer); setKillStreaks(saved.killStreaks); setCapturedPieces(saved.capturedPieces); setShroomSpawnCounter(saved.shroomSpawnCounter); setNextShroomSpawnTurn(saved.nextShroomSpawnTurn); setNecroResurrectionCounter(saved.necroResurrectionCounter || 0); setEnPassantTargetSquare(saved.enPassantTargetSquare);
      const currentBoard = loadedBoard.length === 8 ? loadedBoard : board; const survivors = currentBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
      setPlayerArmy(survivors); setFirstBloodAchieved(survivors.some(p => ['commander', 'hero'].includes(p.type)));
      setGameInfo({ message: `Floor ${saved.level} - Resume`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    } else {
      let army: Piece[] = []; const elo = userData.eloRating || 1200; let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []);
      if (userData.equipment) { initial = initial.map(row => row.map(sq => { if (sq.piece && userData.equipment![sq.piece.id]) return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } }; return sq; })); }
      initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); });
      setPlayerArmy(army); setLevel(1); const newBoard = generateDungeonFloor(1, army); setBoard(newBoard);
      setGameInfo({ message: "Welcome to the Dungeon", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
      setCapturedPieces({ white: [], black: [] }); setCurrentPlayer('white'); setKillStreaks({ white: 0, black: 0 }); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setNecroResurrectionCounter(0); setEnPassantTargetSquare(null);
      const hasCommander = army.some(p => ['commander', 'hero'].includes(p.type)); setFirstBloodAchieved(hasCommander); setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
      saveDungeonState(1, newBoard, 'white', { white: 0, black: 0 }, { white: [], black: [] }, 0, 5, null, 0);
    }
    if (userData.inventory) setInventory(userData.inventory); aiInstance.current = new VibeChessAI(4); audioManager.playStart();
  }, [userData, isUserLoading, user, saveDungeonState, board, setIsAwaitingDanceTarget, setDancerToDance, setIsAwaitingCommanderPromotion, setIsAwaitingAnvilDrop, setIsAwaitingHolyShield, setIsAwaitingArcherSnipe, setIsAwaitingPawnSacrifice, setIsAwaitingGrappleThrow, setGrappledPieceSubject, setIsInventoryOpen, setSpecialActionContext, setIsAwaitingWindScrollTarget, setIsAwaitingAnvilScrollTarget, setIsAwaitingShieldScrollTarget, setIsAwaitingSwapScrollTarget, setIsAwaitingDecreeTarget, setAbilityChoiceDialog, setIsPromotingPawn, setPromotionSquare]);

  useEffect(() => { if (!isInitialized.current && !isUserLoading && userData && user) { isInitialized.current = true; startRun(); } }, [startRun, isUserLoading, userData, user]);

  const handleResetRun = () => { setIsResetConfirmOpen(false); startRun(true); toast({ title: "Run Reset", description: "Returning to Floor 1..." }); };

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare); const pieceBeingPromoted = nextBoard[row][col].piece;
    if (!pieceBeingPromoted) return;
    if (pieceBeingPromoted.heldItem && !isItemValidForPiece(pieceBeingPromoted.heldItem, pieceType)) {
      const item = pieceBeingPromoted.heldItem; setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === item); if (existing) existing.count++; else next.push({ type: item, count: 1 }); return next; });
      pieceBeingPromoted.heldItem = null; toast({ title: "Equipment Returned", description: `${ITEM_METADATA[item].name} unequipped.` });
    }
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: `${pieceBeingPromoted.id}_promo_${Date.now()}`, level: promotionTargetLevel, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    audioManager.playLevelUp(); setBoard(nextBoard); setIsPromotingPawn(false); setPromotionSquare(null);
    const isExtra = (nextBoard[row][col].piece!.level >= 5) || specialActionContext?.extra;
    triggerSpecialsChain(nextBoard, specialActionContext?.currentGraveyard || capturedPieces, specialActionContext?.currentKs || killStreaks, specialActionContext?.oldStreak || 0, specialActionContext?.newStreak || 0, isExtra || false, enPassantTargetSquare, specialActionContext?.actingPlayer || 'white', specialActionContext?.completedMilestones || []);
  }, [board, promotionSquare, promotionTargetLevel, specialActionContext, enPassantTargetSquare, triggerSpecialsChain, capturedPieces, killStreaks, toast]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;
    const { row, col } = algebraicToCoords(algebraic); const sq = board[row][col]; let piece = sq.piece;
    if (piece?.id.startsWith('boss-colossus-')) { const tl = board.flat().find(s => s.piece?.id === 'boss-colossus-tl'); if (tl && tl.algebraic) { piece = tl.piece; algebraic = tl.algebraic; } }
    setPieceForInfoDisplay(piece || null);
    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (selectedInventoryItemType.startsWith('portal_scroll_')) return;
        if (piece && !piece.heldItem && piece.color === 'white') {
          if (usedSlots >= attunementSlots) { toast({ title: "Attunement Limit", variant: "destructive" }); return; }
          if (selectedInventoryItemType === 'soul_harvest' && (piece.type === 'king' || piece.type === 'queen')) { toast({ title: "Royal Restriction", description: "Kings and Queens cannot harvest souls.", variant: "destructive" }); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveLoadoutToFirestore(nextBoard, newInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter); setSelectedInventoryItemType(null); audioManager.playLevelUp();
        } else if (piece && piece.heldItem && piece.color === 'white') {
          const oldItem = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          const nextInv = [...inventory]; const itemIn = nextInv.find(i => i.type === selectedInventoryItemType);
          if (itemIn) { itemIn.count--; if (itemIn.count <= 0) nextInv.splice(nextInv.indexOf(itemIn), 1); }
          const itemOut = nextInv.find(i => i.type === oldItem); if (itemOut) itemOut.count++; else nextInv.push({ type: oldItem, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter); setSelectedInventoryItemType(null); audioManager.playLevelUp();
        }
      } else if (piece && piece.heldItem && piece.color === 'white') {
          const removedItem = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removedItem); if (item) item.count++; else nextInv.push({ type: removedItem, count: 1 });
          setInventory(nextInv); saveLoadoutToFirestore(nextBoard, nextInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter); audioManager.playMove();
      }
      return;
    }

    if (isAwaitingGrappleThrow) {
        if (!sq.piece && !sq.item) {
            const {row: fr, col: fc} = algebraicToCoords(selectedSquare!);
            const range = getEffectiveLevel(board, fr, fc);
            const isCardinal = fr === row || fc === col;
            const isDiagonal = Math.abs(fr - row) === Math.abs(fc - col);
            const dist = Math.max(Math.abs(fr-row), Math.abs(fc-col));
            if ((isCardinal || isDiagonal) && dist <= range && dist > 0) {
                setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
                const move: Move = { from: selectedSquare!, to: algebraic, type: 'grapple-throw', thrownPiece: grappledPieceSubject!.piece };
                const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
                setBoard(result.newBoard); audioManager.playMove();
                setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setSelectedSquare(null); setPossibleMoves([]);
                setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
            }
        }
        return;
    }

    if (isAwaitingDanceTarget) {
        if (!dancerToDance) {
            if (piece && piece.color === 'white' && piece.type === 'dancer') { setDancerToDance(algebraic); }
            return;
        }
        if (algebraic === dancerToDance) {
            setIsAwaitingDanceTarget(false); setDancerToDance(null); setSelectedSquare(null); setPossibleMoves([]);
            triggerSpecialsChain(board, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, 'white', specialActionContext!.completedMilestones);
            return;
        }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance);
        const isAdjacent = Math.abs(fr - row) <= 1 && Math.abs(fc - col) <= 1 && (fr !== row || fc !== col);
        const isOneForward = row === fr - 1 && col === fc; 
        if (isOneForward || isAdjacent) {
            let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const dancerPiece = nextBoard[fr][fc].piece!;
            const nextG = { ...specialActionContext!.currentGraveyard };
            if (isOneForward && !nextBoard[row][col].piece && !nextBoard[row][col].item) {
                nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = null;
            } else if (isAdjacent && nextBoard[row][col].piece) {
                const targetP = nextBoard[row][col].piece; nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = targetP;
            } else if (isOneForward && nextBoard[row][col].piece && nextBoard[row][col].piece!.color === 'black') {
                const captured = nextBoard[row][col].piece!; nextBoard[row][col].piece = { ...dancerPiece, hasMoved: true }; nextBoard[fr][fc].piece = null;
                const targetPile = captured.color === 'white' ? 'black' : 'white';
                nextG[targetPile].push({ ...captured, id: `${captured.id}_dance_${Date.now()}` });
            } else { return; }
            setBoard(nextBoard); setCapturedPieces(nextG); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove();
            triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, 'white', specialActionContext!.completedMilestones);
        }
        return;
    }
    if (isAwaitingDecreeTarget) {
        if (piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) {
            setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'kings-decree' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playLevelUp();
            setIsAwaitingDecreeTarget(false); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
        }
        return;
    }
    if (isAwaitingWindScrollTarget) {
      if (!sq.piece && !sq.item) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'wind-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); 
        
        const finalizedGraveyard = { ...capturedPieces };
        if (result.pieceCapturedByAnvil) {
            const victim = result.pieceCapturedByAnvil;
            const targetPile = victim.color === 'white' ? 'black' : 'white';
            finalizedGraveyard[targetPile].push(victim);
        }

        setBoard(result.newBoard); audioManager.playAnvil();
        setIsAwaitingWindScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, finalizedGraveyard, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingAnvilScrollTarget) {
      if (!sq.piece && !sq.item) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'summon-anvil' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playAnvil();
        setIsAwaitingAnvilScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingShieldScrollTarget) {
      if (piece && piece.color === 'white' && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'shield-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playShield();
        setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingSwapScrollTarget) {
        if (piece && piece.color === 'white' && algebraic !== selectedSquare) {
            setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'swap-scroll' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playMove();
            setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800);
        }
        return;
    }
    if (isAwaitingPawnSacrifice) {
        if (piece && piece.color === playerToSacrificePawn && ['pawn', 'dancer', 'mimic', 'grappler', 'commander'].includes(piece.type)) {
            const nextBoard = (boardForPostSacrifice || board).map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sacrificedPiece = nextBoard[row][col].piece; if (!sacrificedPiece) return;
            const sacrificed = { ...sacrificedPiece, id: `${sacrificedPiece.id}_sac_${Date.now()}` };
            nextBoard[row][col].piece = null; 
            const nextG = { ...specialActionContext!.currentGraveyard };
            const targetPile = sacrificed.color === 'white' ? 'black' : 'white';
            nextG[targetPile].push(sacrificed);
            setCapturedPieces(nextG); setBoard(nextBoard); setIsAwaitingPawnSacrifice(false); setPlayerWhoMadeQueenMove(null); setBoardForPostSacrifice(null); audioManager.playCapture();
            triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, specialActionContext!.actingPlayer || 'white', specialActionContext!.completedMilestones || []);
        }
        return;
    }
    if (isAwaitingArcherSnipe) {
        const myArchers = board.flat().filter(sq => sq.piece && sq.piece.color === currentPlayer && sq.piece.type === 'archer').map(sq => sq.piece!);
        if (piece && piece.color === 'black' && piece.type !== 'king' && piece.type !== 'queen' && !piece.id.startsWith('boss-colossus')) {
            const responsibleArcher = myArchers.find(a => a.level >= piece.level);
            if (responsibleArcher) {
                const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const {row: tr, col: tc} = algebraicToCoords(algebraic); const snipedPieceData = nextBoard[row][col].piece; if (!snipedPieceData) return;
                const snipedPiece = { ...snipedPieceData, id: `${snipedPieceData.id}_sniped_${Date.now()}` }; nextBoard[tr][tc].piece = null;
                const arRow = nextBoard.findIndex(r => r.some(s => s.piece?.id === responsibleArcher.id)); const arCol = nextBoard[arRow].findIndex(s => s.piece?.id === responsibleArcher.id);
                const gain = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0;
                nextBoard[arRow][arCol].piece!.level += gain;
                const nextG = { ...specialActionContext!.currentGraveyard };
                const targetPile = snipedPiece.color === 'white' ? 'black' : 'white';
                nextG[targetPile].push(snipedPiece);
                setBoard(nextBoard); setCapturedPieces(nextG); setIsAwaitingArcherSnipe(false); audioManager.playSnipe();
                triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, specialActionContext!.actingPlayer || 'white', [...(specialActionContext!.completedMilestones || []), 'snipe']); 
            }
        }
        return;
    }
    if (isAwaitingHolyShield) {
        if (piece && piece.color === 'white' && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); nextBoard[row][col].piece!.isShielded = true;
            setBoard(nextBoard); setIsAwaitingHolyShield(false); audioManager.playShield();
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, specialActionContext!.actingPlayer || 'white', [...(specialActionContext!.completedMilestones || []), 'shield']);
        }
        return;
    }
    if (isAwaitingAnvilDrop) {
        if (!sq.piece && !sq.item) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); nextBoard[row][col].item = { type: 'anvil' };
            setBoard(nextBoard); setIsAwaitingAnvilDrop(false); audioManager.playAnvil();
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, specialActionContext!.actingPlayer || 'white', specialActionContext!.completedMilestones || []);
        }
        return;
    }
    if (isAwaitingCommanderPromotion) {
        if (piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            nextBoard[row][col].piece!.type = 'commander'; nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_${Date.now()}`;
            nextBoard[row][col].piece!.isPoisoned = false; nextBoard[row][col].piece!.cooldownTurnsRemaining = 0; nextBoard[row][col].piece!.frozenTurnsRemaining = 0;
            setBoard(nextBoard); setIsAwaitingCommanderPromotion(false); audioManager.playLevelUp();
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, specialActionContext!.actingPlayer || 'white', specialActionContext!.completedMilestones || []);
        }
        return;
    }
    if (selectedSquare) {
      const { row: fromR, col: fromC } = algebraicToCoords(selectedSquare); const movingPiece = board[fromR][fromC].piece;
      
      if (movingPiece && movingPiece.color === currentPlayer) {
        const effectiveLevel = getEffectiveLevel(board, fromR, fromC);

        if (movingPiece.type === 'grappler') {
            if (piece && algebraic !== selectedSquare) {
                const {row: pr, col: pc} = algebraicToCoords(algebraic);
                const isAdj = Math.abs(fromR-pr) <=1 && Math.abs(fromC-pc) <= 1;
                if (isAdj) {
                  const dir = movingPiece.color === 'white' ? -1 : 1;
                  const isDiagForward = (pr === fromR + dir) && Math.abs(pc - fromC) === 1;
                  const isEnemy = piece.color !== movingPiece.color;

                  if (isEnemy && isDiagForward) {
                      // fallback to capture
                  } else {
                      if (piece.type === 'king') {
                        toast({ title: "Too Heavy!", description: "You cannot grapple a King." });
                      } else {
                        setGrappledPieceSubject({ piece: { ...piece }, from: algebraic });
                        let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                        nextBoard[pr][pc].piece = null;
                        setBoard(nextBoard);
                        setIsAwaitingGrappleThrow(true);
                        toast({ title: "PICKED UP!", description: `Launch the ${piece.type}!` });
                      }
                      return;
                  }
                }
            }
        }

        const hasSelfSelectionAbility = ((movingPiece.type === 'knight' || movingPiece.type === 'hero' || movingPiece.type === 'archer') && effectiveLevel >= 5);
        const hasMagicScroll = movingPiece.heldItem && ['wind_scroll', 'life_leach', 'summon_anvil', 'shield_scroll', 'rally_scroll', 'antidote', 'detonation_scroll', 'swap_scroll', 'ice_scroll', 'resurrection_scroll', 'faith_scroll', 'kings_decree', 'ice_blast', 'soul_harvest'].includes(movingPiece.heldItem);
        if (selectedSquare === algebraic && (hasSelfSelectionAbility || hasMagicScroll)) {
          if ((movingPiece.cooldownTurnsRemaining && movingPiece.cooldownTurnsRemaining > 0) || (movingPiece.frozenTurnsRemaining && movingPiece.frozenTurnsRemaining > 0)) { toast({ title: "Exhausted", variant: "destructive" }); return; }
          const executeLifeLeach = () => { setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'life-leach' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playLevelUp(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeWindScrollMode = () => { setIsAwaitingWindScrollTarget(true); setPossibleMoves([]); };
          const executeSummonAnvilMode = () => { setIsAwaitingAnvilScrollTarget(true); setPossibleMoves([]); };
          const executeShieldScrollMode = () => { if(effectiveLevel < 2) return; setIsAwaitingHolyShield(true); setPossibleMoves([]); };
          const executeRallyScroll = () => { if(effectiveLevel < 3) return; setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'rally-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playRally(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeAntidote = () => { setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'antidote' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playShield(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeSwapScrollMode = () => { if(effectiveLevel < 3) return; setIsAwaitingSwapScrollTarget(true); setPossibleMoves([]); };
          const executeIceScroll = () => { if (effectiveLevel < 2) return; setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'ice-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playShield(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeIceBlast = () => { setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'ice-blast' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playLevelUp(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeSoulHarvest = () => { setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'soul-harvest' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); audioManager.playLevelUp(); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeResurrectionScroll = () => { if (effectiveLevel < 4) return; setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'resurrection-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); const updatedGraveyard = { ...capturedPieces }; if (result.resurrectionScrollEvent) { const p = result.resurrectionScrollEvent.piece; const targetPile = p.color === 'white' ? 'black' : 'white'; updatedGraveyard[targetPile] = updatedGraveyard[targetPile].filter(pi => pi.id !== p.id); setCapturedPieces(updatedGraveyard); addEffect('light-beam', result.resurrectionScrollEvent.square); audioManager.playResurrect(); } setBoard(result.newBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, updatedGraveyard, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeFaithScroll = () => { if (effectiveLevel < 5) return; setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; const move: Move = { from: selectedSquare, to: selectedSquare, type: 'faith-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces); setBoard(result.newBoard); if (result.conversionEvents.length > 0) { audioManager.playConversion(); result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); } setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, 'white', false, enPassantTargetSquare); }, 800); };
          const executeSelfDestruct = () => { setHasMovedOnCurrentFloor(true); const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare, capturedPieces); audioManager.playExplosion(); const { row: cR, col: cC } = algebraicToCoords(selectedSquare); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc)); let nextBoard = result.newBoard; const oldStreak = killStreaks.white; let capturesThisTurn = result.selfDestructCaptures ? result.selfDestructCaptures.length : 0; const newStreak = (capturesThisTurn > 0 ? oldStreak + capturesThisTurn : 0); const currentKs = { ...killStreaks, white: newStreak }; setKillStreaks(currentKs); const updatedGraveyard = { ...capturedPieces }; if (result.selfDestructCaptures) { result.selfDestructCaptures.forEach(p => { const targetPile = p.color === 'white' ? 'black' : 'white'; updatedGraveyard[targetPile].push({ ...p, id: `${p.id}_sd_${Date.now()}` }); }); setCapturedPieces(updatedGraveyard); } const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6); setBoard(nextBoard); setSelectedSquare(null); setPossibleMoves([]); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; triggerSpecialsChain(nextBoard, updatedGraveyard, currentKs, oldStreak, newStreak, isExtra, enPassantTargetSquare); }, 800); };
          if (hasSelfSelectionAbility && hasMagicScroll) { setAbilityChoiceDialog({ isOpen: true, onChoice: (choice) => { setAbilityChoiceDialog(null); if (choice === 'ability') executeSelfDestruct(); else { if (movingPiece.heldItem === 'life_leach') executeLifeLeach(); else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode(); else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode(); else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll(); else if (movingPiece.heldItem === 'antidote') executeAntidote(); else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode(); else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll(); else if (movingPiece.heldItem === 'ice_blast') executeIceBlast(); else if (movingPiece.heldItem === 'soul_harvest') executeSoulHarvest(); else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll(); else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll(); else if (movingPiece.heldItem === 'detonation_scroll') { if (effectiveLevel >= 5) executeSelfDestruct(); else toast({ title: "Level Too Low", variant: "destructive" }); } else if (movingPiece.heldItem === 'kings_decree') { setIsAwaitingDecreeTarget(true); setPossibleMoves([]); } else executeWindScrollMode(); } }}); return; }
          if (hasMagicScroll) { if (movingPiece.heldItem === 'life_leach') executeLifeLeach(); else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode(); else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode(); else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll(); else if (movingPiece.heldItem === 'antidote') executeAntidote(); else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode(); else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll(); else if (movingPiece.heldItem === 'ice_blast') executeIceBlast(); else if (movingPiece.heldItem === 'soul_harvest') executeSoulHarvest(); else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll(); else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll(); else if (movingPiece.heldItem === 'detonation_scroll') { if (effectiveLevel >= 5) executeSelfDestruct(); else toast({ title: "Level Too Low", variant: "destructive" }); } else if (movingPiece.heldItem === 'kings_decree') { setIsAwaitingDecreeTarget(true); setPossibleMoves([]); } else executeWindScrollMode(); } else if (hasSelfSelectionAbility) executeSelfDestruct(); return;
        }
        const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType);
        const isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);
        if (isMoveInFreshList) {
          setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic); setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); moveCounter.current++;
          setLastMovedPieceType(movingPiece.type);
          let moveType: Move['type'] = 'move';
          if (movingPiece?.type === 'king' && !movingPiece.hasMoved && ((movingPiece.color === 'white' && selectedSquare === 'e1' && (algebraic === 'c1' || algebraic === 'g1')) || (movingPiece.color === 'black' && selectedSquare === 'e8' && (algebraic === 'c8' || algebraic === 'g8'))) && fromR === row && !sq.piece) { moveType = 'castle'; }
          else if (['pawn', 'dancer', 'mimic', 'grappler', 'commander'].includes(movingPiece?.type) && algebraic === enPassantTargetSquare) { moveType = 'enpassant'; }
          else if (sq.piece) { if (sq.piece.color !== movingPiece?.color) moveType = 'capture'; else moveType = 'swap'; }
          const originalLevel = movingPiece?.level || 1; const originalType = movingPiece?.type || 'pawn';
          const result = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare, capturedPieces);
          let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, phoenixResurrection, reflectionOccurred, promotedToHero } = result;
          const updatedGraveyard = { ...capturedPieces };
          if (result.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === result.itemReturned); if (existing) existing.count++; else next.push({ type: result.itemReturned!, count: 1 }); return next; }); toast({ title: "Equipment Returned", description: `${ITEM_METADATA[result.itemReturned].name} unequipped.` }); }
          if (reflectionOccurred) { 
              const victim = capturedPiece!; 
              const targetPile = victim.color === 'white' ? 'black' : 'white';
              updatedGraveyard[targetPile].push({ ...victim, id: `${victim.id}_refl_d_${Date.now()}` }); setCapturedPieces(updatedGraveyard); audioManager.playCapture(); toast({ title: "REFLECTED!", description: "Enemy Mirror Shield reflected your attack!" }); const newKs = { white: 0, black: 0 }; setKillStreaks(newKs); setBoard(newBoard); setTimeout(() => { setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(newBoard, updatedGraveyard, newKs, 'white', false, null); }, 800); return; 
          }
          if (capturedPiece?.id.startsWith('boss-hydra')) { toast({ title: "Hydra Split!", description: "The Hydra's heads regrow into Knights!", duration: 3000 }); }
          if (phoenixResurrection) { addEffect('light-beam', phoenixResurrection.square); audioManager.playResurrect(); toast({ title: "Rebirth!", description: "Phoenix Down resurrected the unit!" }); }
          if (result.infiltrationWin) { setBoard(newBoard); advanceLevel(newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!), capturedPieces); return; }
          if (shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); toast({ title: "Level Up!", description: `${newBoard[row][col].piece?.type} consumed a Shroom 🍄 and leveled up to L${newBoard[row][col].piece?.level}!` }); }
          if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); }
          if (result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); audioManager.playConversion(); }
          if (promotedToHero) { audioManager.playLevelUp(); addEffect('light-beam', algebraic); toast({ title: "HERO ASCENDED!", description: "Your Commander has reached the back rank!" }); }
          let resPromoRequired = false; let resResult_promo_level = 1; let resResult_promo_square = null;
          const landedPiece = newBoard[row][col].piece;
          const isInteractivePromo = (['pawn', 'dancer', 'mimic', 'grappler'].includes(landedPiece?.type || '')) && (row === 0 || row === 7);
          if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && capturedPiece) {
              const resResult = processRookResurrectionCheck(newBoard, 'white', {from: selectedSquare, to: algebraic, type: 'move'} as Move, algebraic, originalLevel, updatedGraveyard, uniqueIdCounterRef.current);
              if (resResult.resurrectionPerformed) { uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!; newBoard = resResult.boardWithResurrection; updatedGraveyard.white = resResult.capturedPiecesAfterResurrection.white; updatedGraveyard.black = resResult.capturedPiecesAfterResurrection.black; setCapturedPieces({ ...updatedGraveyard }); addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect(); if (resResult.promotionRequiredForResurrectedPawn) { resPromoRequired = true; resResult_promo_level = resResult.resurrectedPieceData?.level || 1; resResult_promo_square = resResult.resurrectedSquareAlg!; } }
          }
          const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
          const oldStreak = killStreaks['white'] || 0; const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
          const currentKs = { ...killStreaks, white: newStreak }; setKillStreaks(currentKs);
          if (streakGain > 0) { 
              audioManager.playCapture(); 
              if (capturedPiece) {
                  const targetPile = capturedPiece.color === 'white' ? 'black' : 'white';
                  updatedGraveyard[targetPile].push({ ...capturedPiece!, id: `${capturedPiece!.id}_cap_${Date.now()}` });
              }
              if (result.pieceCapturedByAnvil) {
                  const targetPile = result.pieceCapturedByAnvil.color === 'white' ? 'black' : 'white';
                  updatedGraveyard[targetPile].push({ ...result.pieceCapturedByAnvil!, id: `${result.pieceCapturedByAnvil!.id}_anvil_${Date.now()}` });
              }
              setCapturedPieces({ ...updatedGraveyard }); 
          } else audioManager.playMove();
          setBoard(newBoard);
          setTimeout(() => {
            setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(false); clickGuard.current = false; const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
            if (resPromoRequired) { setPromotionTargetLevel(resResult_promo_level); setPromotionSquare(resResult_promo_square); setIsPromotingPawn(true); setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, actingPlayer: 'white', completedMilestones: [], currentGraveyard: updatedGraveyard, currentKs }); return; }
            let sacrificeNeeded = false;
            if (landedPiece?.type === 'queen') sacrificeNeeded = processPawnSacrificeCheck(newBoard, updatedGraveyard, currentKs, 'white', { from: selectedSquare, to: algebraic, type: moveType }, originalLevel, originalType, isExtra, nextEp, oldStreak, newStreak);
            if (sacrificeNeeded) return;
            if (isInteractivePromo) { setPromotionTargetLevel(getPromotionLevel(capturedPiece?.type || null)); setIsPromotingPawn(true); setPromotionSquare(algebraic); setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, actingPlayer: 'white', completedMilestones: [], currentGraveyard: updatedGraveyard, currentKs }); return; }
            triggerSpecialsChain(newBoard, updatedGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, 'white', []);
          }, 800);
          return;
        }
      }
    }
    if (sq.piece) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMovedPieceType)); }
    else { setSelectedSquare(null); setPossibleMoves([]); }
  };

  useEffect(() => {
    if (!board || board.length === 0 || !prevBoardRef.current || prevBoardRef.current.length === 0) { prevBoardRef.current = board; return; }
    const prevPieceLevels = new Map<string, number>();
    prevBoardRef.current.forEach(row => row.forEach(sq => { if (sq.piece) prevPieceLevels.set(sq.piece.id, sq.piece.level); }));
    const currentPieceIds = new Set<string>(); board.forEach(row => row.forEach(currSq => { if (currSq.piece) currentPieceIds.add(currSq.piece.id); }));
    const newEffectsToAdd: {type: Effect['type'], square: AlgebraicSquare, val?: number}[] = [];
    board.forEach(row => row.forEach(currSq => {
      if (currSq.piece) {
        const prevLevel = prevPieceLevels.get(currSq.piece.id);
        if (prevLevel !== undefined && currSq.piece.level !== prevLevel) { 
          const diff = currSq.piece.level - prevLevel; 
          newEffectsToAdd.push({ type: 'level-change', square: currSq.algebraic, val: diff }); 
        }
      }
    }));
    prevBoardRef.current.forEach(row => row.forEach(prevSq => { if (prevSq.piece && !currentPieceIds.has(prevSq.piece.id)) { newEffectsToAdd.push({ type: 'poof', square: prevSq.algebraic }); } }));
    if (newEffectsToAdd.length > 0) newEffectsToAdd.forEach(e => addEffect(e.type, e.square, undefined, e.val));
    prevBoardRef.current = board;
  }, [board, addEffect]);

  const processPawnSacrificeCheck = useCallback((boardAfterPrimaryMove: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, playerWhoseQueenLeveled: PlayerColor, move: Move, originalLevel: number, originalType: PieceType, isExtra: boolean, nextEp: AlgebraicSquare | null, oldStreak: number, newStreak: number): boolean => {
    if (originalType !== 'queen') return false; const { row: tr, col: tc } = algebraicToCoords(move.to); const queen = boardAfterPrimaryMove[tr][tc].piece;
    if (queen && queen.type === 'queen' && queen.level === 7 && originalLevel < 7) {
      const hasPawns = boardAfterPrimaryMove.flat().some(sq => sq.piece && sq.piece.color === playerWhoseQueenLeveled && ['pawn', 'dancer', 'mimic', 'grappler', 'commander'].includes(sq.piece.type));
      if (hasPawns) { setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(playerWhoseQueenLeveled); setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled); setIsExtraTurnFromQueenMove(isExtra); setBoardForPostSacrifice(boardAfterPrimaryMove); setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, actingPlayer: playerWhoseQueenLeveled, completedMilestones: [], currentGraveyard, currentKs }); return true; }
    }
    return false;
  }, [triggerSpecialsChain]);

  if (!user) { return ( <div className="flex flex-col items-center justify-center h-[100dvh] bg-background p-4 text-center"> <Swords className="h-12 w-12 text-primary mb-4 animate-pulse" /> <h1 className="text-xl font-bold font-pixel text-primary uppercase mb-2">Authentication Required</h1> <p className="text-sm text-muted-foreground mb-6 max-w-xs">Please sign in to your profile to save items and start your dungeon descent.</p> <Link href="/login"><Button className="font-pixel uppercase px-8">Sign In</Button></Link> </div> ); }

  const isBossFloor = level % 10 === 0;
  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full p-0.5 lg:hidden overflow-y-auto scrollbar-hide">
      <div className="flex flex-col items-center justify-between gap-0.5 pb-1">
        <div className="w-full flex items-center justify-between">
          <Link href="/"><Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]"><ArrowLeft className="mr-1 h-3 w-3" /> Exit</Button></Link>
          <div className="flex items-center gap-1"> {isBossFloor ? <Skull className="text-destructive h-5 w-5 animate-pulse" /> : <Swords className="text-primary h-5 w-5" />} <h1 className={cn("text-[10px] md:text-xs font-bold font-pixel uppercase", isBossFloor ? "text-destructive" : "text-primary")}> {isBossFloor ? `BOSS: ${level}` : `Floor ${level}`} </h1> </div>
          <div className="flex gap-0.5"> <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-destructive" onClick={() => setIsResetConfirmOpen(true)}><RotateCcw className="h-3 w-3" /></Button> <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={hasMovedOnCurrentFloor} > <Package className="mr-1 h-3 w-3" /> Loot </Button> </div>
        </div>
        <div className={cn("text-center text-[10px] font-bold min-h-[1.2em] uppercase font-pixel flex items-center justify-center gap-1", (gameInfo.isCheck || isBossFloor) && !gameInfo.gameOver && "animate-pulse", isBossFloor ? "text-destructive" : "text-primary", isAiThinking && "text-primary")}>
          {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
          {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingGrappleThrow ? "THROW TO AN EMPTY SPACE!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingDecreeTarget ? "SELECT A PAWN TO PROMOTE!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
        </div>
        <div className="w-full">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && isLocalActionTurn) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood === 'white' ? 'white' : null} isEnPassantTarget={enPassantTargetSquare} onPieceHover={setPieceForInfoDisplay} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={currentPlayer === 'white' ? 'white' : null} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor="white" isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} isAwaitingGrappleThrow={isAwaitingGrappleThrow} grappledPieceSubject={grappledPieceSubject} />
        </div>
        <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor="white" getPlayerDisplayName={(p) => p === 'white' ? 'Hero' : 'Dungeon'} onlineStatus="disconnected" turnTimer={null} activeTimerPlayer={null} chatMessages={[]} onSendMessage={() => {}} isMessengerOpen={false} onToggleMessenger={() => {}} hasUnreadMessages={false} />
        {gameInfo.gameOver && ( <div className="mt-1 space-y-1 w-full shrink-0"> <Button className="w-full font-bold uppercase h-7 text-[10px]" onClick={() => startRun(true)}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button> <Link href="/"><Button variant="outline" className="w-full font-bold uppercase h-7 text-[10px]">Lobby</Button></Link> </div> )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-start h-[100dvh] bg-background p-1 md:p-4 gap-1 md:gap-4 overflow-hidden">
      <div className="lg:hidden h-full w-full">{mobileLayout}</div>
      <div className="hidden lg:flex flex-col items-center justify-start h-full w-full gap-4 shrink-0">
        <div className="w-full max-max-4xl flex items-center justify-between shrink-0">
          <div className="flex gap-2"> <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Run</Button></Link> <Button variant="outline" size="sm" className="text-destructive" onClick={() => setIsResetConfirmOpen(true)}><RotateCcw className="mr-2 h-4 w-4" /> Reset Run</Button> </div>
          <div className="flex items-center gap-2"> {isBossFloor ? <Skull className="text-destructive h-6 w-6 animate-pulse" /> : <Swords className="text-primary h-6 w-6" />} <h1 className={cn("text-base md:text-xl font-bold font-pixel uppercase", isBossFloor ? "text-destructive" : "text-primary")}> {isBossFloor ? `BOSS FLOOR: ${level}` : `Floor ${level}`} </h1> </div>
          <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={hasMovedOnCurrentFloor} > <Package className="mr-1 h-4 w-4" /> Loot </Button>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full max-w-6xl items-start justify-center flex-1 overflow-hidden">
          <div className="w-full lg:w-1/2 flex flex-col items-center gap-2 md:gap-4 shrink-0">
            <div className={cn("text-center text-[10px] md:text-sm font-bold min-h-[1.25em] uppercase font-pixel flex items-center justify-center gap-2", (gameInfo.isCheck || isBossFloor) && !gameInfo.gameOver && "animate-pulse", isBossFloor ? "text-destructive" : "text-primary", isAiThinking && "text-primary")}>
              {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
              {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingGrappleThrow ? "THROW TO AN EMPTY SPACE!" : isAwaitingDanceTarget ? (dancerToDance ? "MOVE OR SWAP!" : "SELECT A DANCER!") : isAwaitingDecreeTarget ? "SELECT A PAWN TO PROMOTE!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A TARGET!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
            </div>
            <div className="w-full aspect-square">
              <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && isLocalActionTurn) || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood === 'white' ? 'white' : null} isEnPassantTarget={enPassantTargetSquare} onPieceHover={setPieceForInfoDisplay} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={currentPlayer === 'white' ? 'white' : null} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} localPlayerColor="white" isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} isAwaitingGrappleThrow={isAwaitingGrappleThrow} grappledPieceSubject={grappledPieceSubject} />
            </div>
          </div>
          <div className="w-full lg:w-1/4 flex flex-col h-full min-h-0 overflow-y-auto scrollbar-hide">
            <div className="flex-1 min-h-0"> <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor="white" getPlayerDisplayName={(p) => p === 'white' ? 'Hero' : 'Dungeon'} onlineStatus="disconnected" turnTimer={null} activeTimerPlayer={null} chatMessages={[]} onSendMessage={() => {}} isMessengerOpen={false} onToggleMessenger={() => {}} hasUnreadMessages={false} /> </div>
            {gameInfo.gameOver && ( <div className="mt-2 space-y-2 shrink-0 mb-4 lg:mb-0"> <Button className="w-full font-bold uppercase h-8 text-xs" onClick={() => startRun(true)}><RefreshCw className="mr-2 h-4 w-4" /> Retry Run</Button> <Link href="/"><Button variant="outline" className="w-full font-bold uppercase h-8 text-xs">Back to Lobby</Button></Link> </div> )}
          </div>
        </div>
      </div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={(type) => { if (type.startsWith('portal_scroll_')) { const target = parseInt(type.split('_')[2]); warpToLevel(target, type); } }} attunementSlots={attunementSlots} usedSlots={usedSlots} />
      <RulesDialog isOpen={false} onOpenChange={() => {}} /> <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}> <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle className="font-pixel text-primary uppercase">Reset Run?</AlertDialogTitle> <AlertDialogDescription> This will erase your current floor progress and return you to Floor 1. All dungeon captures and streaks will be lost. </AlertDialogDescription> </AlertDialogHeader> <AlertDialogFooter> <AlertDialogCancel className="font-pixel text-[10px] uppercase">Cancel</AlertDialogCancel> <AlertDialogAction className="bg-destructive font-pixel text-[10px] uppercase" onClick={handleResetRun}>Confirm Reset</AlertDialogAction> </AlertDialogFooter> </AlertDialogContent> </AlertDialog>
      <AlertDialog open={abilityChoiceDialog?.isOpen} > <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Select Action</AlertDialogTitle> <AlertDialogDescription> This piece has multiple special actions available. Choose one to perform. </AlertDialogDescription> </AlertDialogHeader> <div className="flex flex-col gap-2"> <Button onClick={() => abilityChoiceDialog?.onChoice('ability')}> Use Piece Ability </Button> <Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}> Use Magic Item (Spell) </Button> </div> <AlertDialogFooter> <AlertDialogCancel onClick={() => setAbilityChoiceDialog(null)}>Cancel</AlertDialogCancel> </AlertDialogFooter> </AlertDialogContent> </AlertDialog>
    </div>
  );
}
