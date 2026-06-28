'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
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
  isValidSquare,
  processRookResurrectionCheck,
  spawnShroom,
  findKing,
  processPoisonDamage,
  getEffectiveLevel,
  getPromotionLevel,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, ResurrectedSquareInfo, InventoryItem, InventoryItemType, AIGameState, AIBoardState, AISquareState, AIMove as AIMoveType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Swords, ArrowLeft, BrainCircuit, Package, Skull } from 'lucide-react';
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
  const frontline = playerArmy.filter(p => p.type === 'pawn' || p.type === 'commander' || p.type === 'infiltrator');
  
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
        commander: 10, infiltrator: 10, pawn: 10
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
        board[0][4].piece = { id: 'boss-colossus', type: 'king', color: 'black', level: 15, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) board[1][i].piece = { id: `shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
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
    if (formation === 'rank') {
       for(let r=0; r<2; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c});
    } else if (formation === 'diamond') {
       for(let r=0; r<5; r++) for(let c=0; c<8; c++) {
         if (Math.abs(r - 2) + Math.abs(c - 3.5) <= 3) possibleSquares.push({r,c});
       }
    } else if (formation === 'triangle') {
       for(let r=0; r<4; r++) for(let c=r; c<8-r; c++) possibleSquares.push({r,c});
    } else {
       for(let r=0; r<4; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c});
    }
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

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<BoardState>([]);
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
  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [specialActionContext, setSpecialActionContext] = useState<any>(null);

  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);

  const [aiStalemateStrikes, setAiStalemateStrikes] = useState(0);

  const uniqueIdCounterRef = useRef(30000);

  // --- Inventory States ---
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200;
    if (elo <= 1200) return 2;
    return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);
  const moveCounter = useRef(0);
  const prevBoardRef = useRef<BoardState | null>(null);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => {
      setEffects(curr => curr.filter(e => e.id !== id));
    }, 1500);
  }, []);

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingHolyShield || isAwaitingArcherSnipe;

  useEffect(() => {
    if (!board.length || !prevBoardRef.current) {
        prevBoardRef.current = board;
        return;
    }
    const currentPieceIds = new Set(board.flat().filter(sq => sq.piece).map(sq => sq.piece!.id));
    const prevPieces = prevBoardRef.current.flat().filter(sq => sq.piece);
    prevPieces.forEach(prevSq => {
        if (!currentPieceIds.has(prevSq.piece!.id)) addEffect('poof', prevSq.algebraic);
    });
    board.flat().forEach(currSq => {
        if (currSq.piece) {
            const prevSq = prevBoardRef.current!.flat().find(ps => ps.piece?.id === currSq.piece!.id);
            if (prevSq && prevSq.piece!.level !== currSq.piece!.level) {
                addEffect('level-change', currSq.algebraic, undefined, currSq.piece!.level - prevSq.piece!.level);
            }
        }
    });
    prevBoardRef.current = board;
  }, [board, addEffect]);

  const advanceLevel = useCallback((survivorsFromLastBoard: Piece[]) => {
    const nextLevel = level + 1;
    if (nextLevel > 50) {
      setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' }));
      audioManager.playVictory();
      return;
    }
    
    setIsMoveProcessing(false);
    clickGuard.current = false;
    
    setLevel(nextLevel);
    setAiStalemateStrikes(0);
    setPlayerArmy(survivorsFromLastBoard);
    const newBoard = generateDungeonFloor(nextLevel, survivorsFromLastBoard);
    setBoard(newBoard);
    setCapturedPieces(prev => ({ white: [], black: prev.black }));
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    setEnPassantTargetSquare(null);
    const hasCommander = survivorsFromLastBoard.some(p => p.type === 'commander' || p.type === 'hero');
    setFirstBloodAchieved(hasCommander);
    setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);

    const isBoss = nextLevel % 10 === 0;
    setGameInfo({ 
        message: isBoss ? `BOSS BATTLE: Floor ${nextLevel}` : `Level ${nextLevel} - Wipe them out!`, 
        isCheck: false, 
        playerWithKingInCheck: null, 
        isCheckmate: false, 
        isStalemate: false, 
        gameOver: false 
    });

    toast({ title: "Level Up!", description: `Descending to Floor ${nextLevel}...` });
    audioManager.playLevelUp();
  }, [level, toast]);

  const processMoveEnd = useCallback((boardAfter: BoardState, turnPlayer: PlayerColor, extra: boolean, nextEpSquare: AlgebraicSquare | null = null) => {
    let nextBoard = boardAfter;
    
    if (!extra && turnPlayer === 'white' && isKingInCheck(nextBoard, 'white', nextEpSquare)) {
      setGameInfo({ message: "SPLIT SELF-CHECK! AUTO-LOSS", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' });
      audioManager.playDefeat();
      return;
    }

    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');

    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(nextBoard, nextP);
    nextBoard = boardAfterPoison;
    if (poisonedCaptures.length > 0) {
        setCapturedPieces(prev => ({
            ...prev,
            [turnPlayer]: [...(prev[turnPlayer] || []), ...poisonedCaptures.map(p => ({ ...p, id: `${p.id}_psn_${Date.now()}` }))]
        }));
        setKillStreaks(prev => ({
            ...prev,
            [turnPlayer]: (prev[turnPlayer] || 0) + poisonedCaptures.length
        }));
        audioManager.playCapture();
        toast({ title: "Poison Damage!", description: `${poisonedCaptures.length} piece(s) affected by poison!`, duration: 3000 });
    }
    setBoard(nextBoard);

    setEnPassantTargetSquare(nextEpSquare);
    const survivors = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const enemyCount = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    
    const dungeonKing = findKing(nextBoard, 'black');
    const isDungeonCheckmated = dungeonKing && isCheckmate(nextBoard, 'black', nextEpSquare);
    
    if (enemyCount === 0 || isDungeonCheckmated) {
      if (level % 10 === 0) {
        const dropMap: Record<number, InventoryItemType> = {
          10: 'portal_scroll_20',
          20: 'portal_scroll_30',
          30: 'portal_scroll_40',
          40: 'phoenix_down',
          50: 'mirror_shield'
        };
        const drop = dropMap[level];
        if (drop) {
          setInventory(prev => {
            const next = [...prev];
            const existing = next.find(i => i.type === drop);
            if (existing) existing.count++;
            else next.push({ type: drop, count: 1 });
            return next;
          });
          toast({ title: "Boss Loot!", description: `Found a ${ITEM_METADATA[drop].name}!`, duration: 5000 });
        }
      }
      advanceLevel(survivors);
      return;
    }

    if (extra) {
      toast({ title: "EXTRA TURN!", description: `${turnPlayer === 'white' ? 'Hero' : 'Dungeon'} gains another move!`, duration: 2000 });
      audioManager.playLevelUp();
    }
    const newCounter = shroomSpawnCounter + 1;
    setShroomSpawnCounter(newCounter);
    if (newCounter >= nextShroomSpawnTurn) {
        const { newBoard: boardWithShroom, spawnedAt } = spawnShroom(nextBoard);
        if (spawnedAt) {
            nextBoard = boardWithShroom;
            setBoard(nextBoard);
            setShroomSpawnCounter(0);
            setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
            toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 1000 });
            audioManager.playShroom();
        }
    }
    const playerKing = findKing(nextBoard, 'white');
    if (!playerKing || isCheckmate(nextBoard, 'white', nextEpSquare)) {
      setGameInfo({ message: "YOUR KING HAS FALLEN", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' });
      audioManager.playDefeat();
      return;
    }
    const inCheck = isKingInCheck(nextBoard, nextP, nextEpSquare);
    if (inCheck) audioManager.playCheck();
    
    const isBoss = level % 10 === 0;
    setGameInfo({ 
        message: inCheck ? "Check!" : (isBoss ? `BOSS BATTLE: Floor ${level}` : `Level ${level} - Wipe them out!`), 
        isCheck: inCheck, 
        playerWithKingInCheck: inCheck ? nextP : null, 
        isCheckmate: false, 
        isStalemate: false, 
        gameOver: false 
    });
    setCurrentPlayer(nextP);
  }, [advanceLevel, level, toast, shroomSpawnCounter, nextShroomSpawnTurn]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null) => {
    // 1. First Blood -> Commander Promo
    if (!firstBloodAchieved && newStreak > oldStreak) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white');
        const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
        if (hasL1Targets) {
            setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
            setIsAwaitingCommanderPromotion(true);
            return;
        }
    }

    // 2. Killstreak: Holy Shield (Streak 2 + Archbishop)
    if (newStreak >= 2 && oldStreak < 2 && boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'white')) {
        setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
        setIsAwaitingHolyShield(true);
        return;
    }

    // 3. Killstreak: Anvil (Streak 3)
    if (newStreak >= 3 && oldStreak < 3) {
        setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
        setIsAwaitingAnvilDrop(true);
        return;
    }

    // 4. Killstreak: Resurrection (Streak 4)
    if (newStreak >= 4 && oldStreak < 4 && capturedPieces.black.length > 0) {
        const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
        const resResult = processRookResurrectionCheck(nextBoard, 'white', {from: 'e1', to: 'e1'} as any, 'e1', 0, capturedPieces, uniqueIdCounterRef.current);
        if (resResult.resurrectionPerformed) {
            uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!;
            const nextBoardRes = resResult.boardWithResurrection;
            setCapturedPieces(resResult.capturedPiecesAfterResurrection);
            setBoard(nextBoardRes);
            addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect();
            
            if (resResult.promotionRequiredForResurrectedPawn) { 
                setPromotionTargetLevel(resResult.resurrectedPieceData?.level || 1);
                setPromotionSquare(resResult.resurrectedSquareAlg!);
                setIsPromotingPawn(true);
                setSpecialActionContext({ extra: isExtra, nextEp, oldStreak: 4, newStreak: 4 }); 
                return;
            }
            triggerSpecialsChain(nextBoardRes, 4, 4, isExtra, nextEp);
            return;
        }
    }

    // 5. Killstreak: Archer Snipe (Streak 5 + Archer)
    if (newStreak >= 5 && oldStreak < 5 && boardToChain.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'white')) {
        const hasLevel1Enemies = boardToChain.flat().some(sq => sq.piece && sq.piece.color === 'black' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
        if (hasLevel1Enemies) {
            setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
            setIsAwaitingArcherSnipe(true);
            return;
        }
    }

    processMoveEnd(boardToChain, 'white', isExtra, nextEp);
  }, [firstBloodAchieved, capturedPieces.black, addEffect, processMoveEnd]);

  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || isMoveProcessing || isAiThinking || currentPlayer !== 'black' || isAnySpecialModeActive) return;

    setIsAiThinking(true);
    try {
      const gameStateForAi = adaptBoardForAI(
        board,
        'black',
        killStreaks,
        capturedPieces,
        moveCounter.current,
        firstBloodAchieved,
        playerWhoGotFirstBlood,
        enPassantTargetSquare,
        shroomSpawnCounter,
        nextShroomSpawnTurn
      );

      const aiResult = aiInstance.current?.getBestMove(gameStateForAi, 'black');
      const aiMove = aiResult?.move;

      if (aiMove) {
        setAiStalemateStrikes(0);
        const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]);
        const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
        const movingPiece = board[aiMove.from[0]][aiMove.from[1]].piece;
        
        if (!movingPiece) throw new Error("AI tried to move non-existent piece");

        const originalL = movingPiece.level || 1;
        const originalT = movingPiece.type;

        setIsMoveProcessing(true);
        setAnimatedSquareTo(toAlg);
        setLastMoveFrom(fromAlg);
        setLastMoveTo(toAlg);
        moveCounter.current++;

        let mType: Move['type'] = aiMove.type as Move['type'];
        const targetSq = board[aiMove.to[0]][aiMove.to[1]];
        if (mType === 'move' && targetSq.piece) {
            mType = targetSq.piece.color === 'black' ? 'swap' : 'capture';
        }

        const result = applyMove(board, { from: fromAlg, to: toAlg, type: mType, promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces);
        let { newBoard, capturedPiece, selfDestructCaptures, shroomConsumed, enPassantTargetSet: nextEp, reflectionOccurred } = result;

        if (reflectionOccurred) {
            const victim = capturedPiece!;
            setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...victim, id: `${victim.id}_refl_ai_${Date.now()}` }] }));
            audioManager.playCapture();
            setKillStreaks(prev => ({ ...prev, white: (prev.white || 0) + 1, black: 0 }));
            setBoard(newBoard);
            setTimeout(() => {
                setIsAiThinking(false); setIsMoveProcessing(false); clickGuard.current = false;
                processMoveEnd(newBoard, 'black', false, null);
            }, 800);
            return;
        }

        if (shroomConsumed) audioManager.playShroom();
        if (capturedPiece || (selfDestructCaptures && selfDestructCaptures.length > 0)) audioManager.playCapture();
        else audioManager.playMove();

        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (selfDestructCaptures?.length || 0);
        const oldStreak = killStreaks.black;
        const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
        setKillStreaks(prev => ({ ...prev, black: newStreak }));

        if (capturedPiece) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, { ...capturedPiece!, id: `${capturedPiece!.id}_cap_ai_${Date.now()}` }] }));
        if (selfDestructCaptures) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, ...selfDestructCaptures.map(p => ({...p, id: `${p.id}_sd_ai_${Date.now()}`}))] }));

        setBoard(newBoard);

        setTimeout(() => {
            setIsAiThinking(false); setIsMoveProcessing(false);
            const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
            
            const landedPiece = newBoard[aiMove.to[0]][aiMove.to[1]].piece;
            if (landedPiece?.type === 'queen') {
                if (landedPiece.level === 7 && originalL < 7 && originalT === 'queen') {
                   const pawns = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
                   if (pawns.length > 0) {
                       const sac = pawns[0];
                       const {row: sr, col: sc} = algebraicToCoords(sac.algebraic);
                       newBoard[sr][sc].piece = null;
                       setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...sac.piece!, id: `${sac.piece!.id}_sac_ai_${Date.now()}` }] }));
                       audioManager.playCapture();
                   }
                }
            }

            if (landedPiece?.type === 'pawn' && (aiMove.to[0] === 7)) {
                landedPiece.type = aiMove.promoteTo || 'queen';
                landedPiece.level = getPromotionLevel(capturedPiece?.type || null);
                if (landedPiece.type === 'queen') landedPiece.level = Math.min(landedPiece.level, 7);
                audioManager.playLevelUp();
            }

            processMoveEnd(newBoard, 'black', isExtra, nextEp);
        }, 800);
      } else {
        // AI NO MOVES CASE
        const nextStrikes = aiStalemateStrikes + 1;
        setAiStalemateStrikes(nextStrikes);
        setKillStreaks(prev => ({ ...prev, black: 0 }));

        if (nextStrikes >= 3) {
            toast({ title: "DUNGEON COLLAPSE!", description: "The Dungeon forces have collapsed after failing to move 3 times!", variant: "destructive" });
            audioManager.playExplosion();
            const collapsedBoard = board.map(r => r.map(s => ({...s, piece: s.piece?.color === 'black' ? null : (s.piece ? {...s.piece} : null)})));
            setBoard(collapsedBoard);
            setTimeout(() => {
                setIsAiThinking(false);
                processMoveEnd(collapsedBoard, 'black', false, null);
            }, 800);
        } else {
            toast({ title: "Dungeon Skip", description: `The Dungeon has no legal moves! Strike ${nextStrikes}/3` });
            setTimeout(() => {
                setIsAiThinking(false);
                processMoveEnd(board, 'black', false, null);
            }, 800);
        }
      }
    } catch (e) {
      console.error("AI Error:", e);
      setIsAiThinking(false);
    }
  }, [board, killStreaks, capturedPieces, enPassantTargetSquare, gameInfo.gameOver, isMoveProcessing, isAiThinking, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, isAnySpecialModeActive, aiStalemateStrikes]);

  useEffect(() => {
    if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAnySpecialModeActive) {
      const timer = setTimeout(performAiMove, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAnySpecialModeActive, performAiMove]);

  const saveLoadoutToFirestore = useCallback((currentBoard: BoardState, currentInv: InventoryItem[]) => {
    if (!user || !firestore) return;
    const equipment: Record<string, string> = {};
    currentBoard.flat().forEach(sq => {
      if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem;
    });
    const userDocRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userDocRef, { inventory: currentInv, equipment });
  }, [user, firestore]);

  const startRun = useCallback(() => {
    if (isUserLoading || !userData || !user) return;
    
    setIsMoveProcessing(false);
    clickGuard.current = false;
    
    let army: Piece[] = [];
    const elo = userData.eloRating || 1200;
    let initial = initializeBoard(elo, 1200);
    
    if (userData) {
      if (userData.equipment) {
        initial = initial.map(row => row.map(sq => {
          if (sq.piece && userData.equipment![sq.piece.id]) {
            return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } };
          }
          return sq;
        }));
      }
      if (userData.inventory) setInventory(userData.inventory);
    }
    initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); });
    setPlayerArmy(army);
    setLevel(1);
    const newBoard = generateDungeonFloor(1, army);
    setBoard(newBoard);
    setGameInfo({ message: "Welcome to the Dungeon", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    setCapturedPieces({ white: [], black: [] });
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    setEnPassantTargetSquare(null);
    const hasCommander = army.some(p => p.type === 'commander' || p.type === 'hero');
    setFirstBloodAchieved(hasCommander);
    setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
    aiInstance.current = new VibeChessAI(4);
    audioManager.playStart();
  }, [userData, isUserLoading, user]);

  useEffect(() => {
    if (!board.length && !isUserLoading && userData && user) startRun();
  }, [startRun, board.length, isUserLoading, userData, user]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = nextBoard[row][col].piece;
    if (!pieceBeingPromoted) return;
    
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: `${pieceBeingPromoted.id}_promo_${Date.now()}`, level: promotionTargetLevel, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(promotionTargetLevel, 7);
    
    audioManager.playLevelUp();
    setBoard(nextBoard);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    const isExtra = (nextBoard[row][col].piece!.level >= 5) || specialActionContext?.extra;
    triggerSpecialsChain(nextBoard, specialActionContext?.oldStreak || 0, specialActionContext?.newStreak || 0, isExtra, enPassantTargetSquare);
  }, [board, promotionSquare, promotionTargetLevel, specialActionContext, enPassantTargetSquare, triggerSpecialsChain]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;

    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    const piece = sq.piece;
    setPieceForInfoDisplay(piece || null);

    const isLocalActionTurn = currentPlayer === 'white';

    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (piece && !piece.heldItem && piece.color === 'white') {
          if (usedSlots >= attunementSlots) { toast({ title: "Attunement Limit", variant: "destructive" }); return; }
          const pType = piece.type;
          if (selectedInventoryItemType === 'swift_cloak' && pType !== 'pawn' && pType !== 'commander') return;
          if (selectedInventoryItemType === 'queens_peace' && pType !== 'queen') return;
          if ((selectedInventoryItemType === 'gnosis' || selectedInventoryItemType === 'mirror_shield' || selectedInventoryItemType === 'berserkers_mask') && (pType === 'king' || pType === 'queen')) return;
          if (selectedInventoryItemType === 'crossbow' && pType !== 'archer') return;
          if (selectedInventoryItemType === 'detonation_scroll' && pType === 'king') return;

          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
          let newInv = [...inventory];
          const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv);
          saveLoadoutToFirestore(nextBoard, newInv);
          setSelectedInventoryItemType(null);
          audioManager.playLevelUp();
        } else if (piece && piece.heldItem && piece.color === 'white') {
          const oldItem = piece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType;
          setBoard(nextBoard);
          const nextInv = [...inventory];
          const itemIn = nextInv.find(i => i.type === selectedInventoryItemType);
          if (itemIn) { itemIn.count--; if (itemIn.count <= 0) nextInv.splice(nextInv.indexOf(itemIn), 1); }
          const itemOut = nextInv.find(i => i.type === oldItem);
          if (itemOut) itemOut.count++; else nextInv.push({ type: oldItem, count: 1 });
          setInventory(nextInv);
          saveLoadoutToFirestore(nextBoard, nextInv);
          setSelectedInventoryItemType(null);
          audioManager.playLevelUp();
        }
      } else {
        if (piece && piece.heldItem && piece.color === 'white') {
          const removedItem = piece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null;
          setBoard(nextBoard);
          const nextInv = [...inventory];
          const item = nextInv.find(i => i.type === removedItem);
          if (item) item.count++; else nextInv.push({ type: removedItem, count: 1 });
          setInventory(nextInv);
          saveLoadoutToFirestore(nextBoard, nextInv);
          audioManager.playMove();
        }
      }
      return;
    }

    if (isAwaitingWindScrollTarget) {
      if (!sq.piece && !sq.item) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'wind-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
        setBoard(result.newBoard);
        audioManager.playAnvil();
        setIsAwaitingWindScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingAnvilScrollTarget) {
      if (!sq.piece && !sq.item) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'summon-anvil' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
        setBoard(result.newBoard);
        audioManager.playAnvil();
        setIsAwaitingAnvilScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingShieldScrollTarget) {
      if (piece && piece.color === 'white' && piece.type !== 'king' && piece.type !== 'queen') {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'shield-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
        setBoard(result.newBoard);
        audioManager.playShield();
        setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }
    if (isAwaitingSwapScrollTarget) {
        if (piece && piece.color === 'white' && algebraic !== selectedSquare) {
            setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'swap-scroll' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
            setBoard(result.newBoard);
            audioManager.playMove();
            setIsAwaitingSwapScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        }
        return;
    }

    if (isAwaitingPawnSacrifice) {
        if (piece && piece.color === playerToSacrificePawn && (piece.type === 'pawn' || piece.type === 'commander')) {
            const nextBoard = (boardForPostSacrifice || board).map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sacrificed = { ...nextBoard[row][col].piece!, id: `${nextBoard[row][col].piece!.id}_sac_${Date.now()}` };
            nextBoard[row][col].piece = null;
            setCapturedPieces(prev => ({ ...prev, black: [...prev.black, sacrificed] }));
            setBoard(nextBoard);
            setIsAwaitingPawnSacrifice(false);
            setPlayerWhoMadeQueenMove(null);
            setBoardForPostSacrifice(null);
            audioManager.playCapture();
            triggerSpecialsChain(nextBoard, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.extra, enPassantTargetSquare);
        }
        return;
    }
    if (isAwaitingArcherSnipe) {
        if (piece && piece.color === 'black' && piece.level === 1 && piece.type !== 'king' && piece.type !== 'queen') {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece = null;
            setBoard(nextBoard);
            setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...piece, id: `${piece.id}_sniped_${Date.now()}` }] }));
            setIsAwaitingArcherSnipe(false);
            audioManager.playSnipe();
            triggerSpecialsChain(nextBoard, specialActionContext.oldStreak, 99, specialActionContext.extra, enPassantTargetSquare); 
        }
        return;
    }
    if (isAwaitingHolyShield) {
        if (piece && piece.color === 'white' && piece.type !== 'king' && piece.type !== 'queen') {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece!.isShielded = true;
            setBoard(nextBoard);
            setIsAwaitingHolyShield(false);
            audioManager.playShield();
            triggerSpecialsChain(nextBoard, 2, specialActionContext.newStreak, specialActionContext.extra, enPassantTargetSquare);
        }
        return;
    }
    if (isAwaitingAnvilDrop) {
        if (!sq.piece && !sq.item) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].item = { type: 'anvil' };
            setBoard(nextBoard);
            setIsAwaitingAnvilDrop(false);
            audioManager.playAnvil();
            triggerSpecialsChain(nextBoard, 3, specialActionContext.newStreak, specialActionContext.extra, enPassantTargetSquare);
        }
        return;
    }
    if (isAwaitingCommanderPromotion) {
        if (piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            nextBoard[row][col].piece!.type = 'commander';
            nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_${Date.now()}`;
            nextBoard[row][col].piece!.isPoisoned = false; 
            nextBoard[row][col].piece!.cooldownTurnsRemaining = 0;
            nextBoard[row][col].piece!.frozenTurnsRemaining = 0;
            setBoard(nextBoard);
            setIsAwaitingCommanderPromotion(false);
            audioManager.playLevelUp();
            triggerSpecialsChain(nextBoard, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.extra, enPassantTargetSquare);
        }
        return;
    }
    if (selectedSquare) {
      const { row: fromR, col: fromC } = algebraicToCoords(selectedSquare);
      const movingPiece = board[fromR][fromC].piece;
      if (!movingPiece) return;

      const effectiveLevel = getEffectiveLevel(board, fromR, fromC);
      const hasSelfSelectionAbility = ((movingPiece.type === 'knight' || movingPiece.type === 'hero' || movingPiece.type === 'archer') && effectiveLevel >= 5);
      const hasMagicScroll = movingPiece.heldItem && ['wind_scroll', 'life_leach', 'summon_anvil', 'shield_scroll', 'rally_scroll', 'antidote', 'detonation_scroll', 'swap_scroll', 'ice_scroll', 'resurrection_scroll', 'faith_scroll'].includes(movingPiece.heldItem);

      if (selectedSquare === algebraic && (hasSelfSelectionAbility || hasMagicScroll)) {
        if ((movingPiece.cooldownTurnsRemaining && movingPiece.cooldownTurnsRemaining > 0) || (movingPiece.frozenTurnsRemaining && movingPiece.frozenTurnsRemaining > 0)) {
            toast({ title: "Exhausted", variant: "destructive" });
            return;
        }

        const executeLifeLeach = () => {
          setIsMoveProcessing(true); clickGuard.current = true;
          const move: Move = { from: selectedSquare, to: selectedSquare, type: 'life-leach' };
          const result = applyMove(board, move, enPassantTargetSquare);
          setBoard(result.newBoard);
          audioManager.playLevelUp();
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeWindScrollMode = () => { setIsAwaitingWindScrollTarget(true); setPossibleMoves([]); };
        const executeSummonAnvilMode = () => { setIsAwaitingAnvilScrollTarget(true); setPossibleMoves([]); };
        const executeShieldScrollMode = () => { if(effectiveLevel < 2) return; setIsAwaitingShieldScrollTarget(true); setPossibleMoves([]); };
        const executeRallyScroll = () => {
          if(effectiveLevel < 3) return;
          setIsMoveProcessing(true); clickGuard.current = true;
          const move: Move = { from: selectedSquare, to: selectedSquare, type: 'rally-scroll' };
          const result = applyMove(board, move, enPassantTargetSquare);
          setBoard(result.newBoard);
          audioManager.playRally();
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeAntidote = () => {
            setIsMoveProcessing(true); clickGuard.current = true;
            const move: Move = { from: selectedSquare, to: selectedSquare, type: 'antidote' };
            const result = applyMove(board, move, enPassantTargetSquare);
            setBoard(result.newBoard);
            audioManager.playShield();
            setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeSwapScrollMode = () => { if(effectiveLevel < 3) return; setIsAwaitingSwapScrollTarget(true); setPossibleMoves([]); };
        const executeIceScroll = () => {
          if (effectiveLevel < 2) return;
          setIsMoveProcessing(true); clickGuard.current = true;
          const move: Move = { from: selectedSquare, to: selectedSquare, type: 'ice-scroll' };
          const result = applyMove(board, move, enPassantTargetSquare);
          setBoard(result.newBoard);
          audioManager.playShield();
          setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeResurrectionScroll = () => {
            if (effectiveLevel < 4) return;
            setIsMoveProcessing(true); clickGuard.current = true;
            const move: Move = { from: selectedSquare, to: selectedSquare, type: 'resurrection-scroll' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
            if (result.resurrectionScrollEvent) {
                setCapturedPieces(prev => ({ ...prev, black: prev.black.filter(pi => pi.id !== result.resurrectionScrollEvent!.piece.id) }));
                addEffect('light-beam', result.resurrectionScrollEvent.square);
                audioManager.playResurrect();
            }
            setBoard(result.newBoard);
            setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeFaithScroll = () => {
            if (effectiveLevel < 5) return;
            setIsMoveProcessing(true); clickGuard.current = true;
            const move: Move = { from: selectedSquare, to: selectedSquare, type: 'faith-scroll' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces);
            setBoard(result.newBoard);
            if (result.conversionEvents.length > 0) {
                audioManager.playConversion();
                result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color));
            }
            setSelectedSquare(null); setPossibleMoves([]);
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
        };
        const executeSelfDestruct = () => {
          const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare);
          audioManager.playExplosion();
          const { row: cR, col: cC } = algebraicToCoords(selectedSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          let nextBoard = result.newBoard;
          const oldStreak = killStreaks.white;
          let capturesThisTurn = result.selfDestructCaptures ? result.selfDestructCaptures.length : 0;
          const newStreak = (capturesThisTurn > 0 ? oldStreak + capturesThisTurn : 0);
          setKillStreaks(prev => ({ ...prev, white: newStreak }));

          if (capturesThisTurn > 0) {
              setCapturedPieces(prev => ({ ...prev, white: [...prev.white, ...result.selfDestructCaptures!.map(p => ({ ...p, id: `${p.id}_sd_${Date.now()}` }))] }));
          }
          const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
          setBoard(nextBoard); setSelectedSquare(null); setPossibleMoves([]);
          setTimeout(() => {
              setIsMoveProcessing(false); clickGuard.current = false;
              triggerSpecialsChain(nextBoard, oldStreak, newStreak, isExtra, enPassantTargetSquare);
          }, 800);
        };

        if (hasSelfSelectionAbility && hasMagicScroll) {
          setAbilityChoiceDialog({ isOpen: true, onChoice: (choice) => {
            setAbilityChoiceDialog(null);
            if (choice === 'ability') executeSelfDestruct();
            else {
              if (movingPiece.heldItem === 'life_leach') executeLifeLeach();
              else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode();
              else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode();
              else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll();
              else if (movingPiece.heldItem === 'antidote') executeAntidote();
              else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode();
              else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll();
              else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll();
              else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll();
              else if (movingPiece.heldItem === 'detonation_scroll') {
                  if (effectiveLevel >= 5) executeSelfDestruct();
                  else toast({ title: "Level Too Low", variant: "destructive" });
              }
              else executeWindScrollMode();
            }
          }});
          return;
        }
        if (hasMagicScroll) {
          if (movingPiece.heldItem === 'life_leach') executeLifeLeach();
          else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode();
          else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode();
          else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll();
          else if (movingPiece.heldItem === 'antidote') executeAntidote();
          else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode();
          else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll();
          else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll();
          else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll();
          else if (movingPiece.heldItem === 'detonation_scroll') {
              if (effectiveLevel >= 5) executeSelfDestruct();
              else toast({ title: "Level Too Low", variant: "destructive" });
          }
          else executeWindScrollMode();
        } else if (hasSelfSelectionAbility) executeSelfDestruct();
        return;
      }
      
      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      const isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);

      if (isMoveInFreshList) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic); setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); moveCounter.current++;
        let moveType: Move['type'] = 'move';
        const isStandardStartingSquare = (movingPiece.color === 'white' && selectedSquare === 'e1') || (movingPiece.color === 'black' && selectedSquare === 'e8');
        const isStandardTargetSquare = (movingPiece.color === 'white' && (algebraic === 'c1' || algebraic === 'g1')) || (movingPiece.color === 'black' && (algebraic === 'c8' || algebraic === 'g8'));
        
        if (movingPiece?.type === 'king' && !movingPiece.hasMoved && isStandardStartingSquare && isStandardTargetSquare && fromR === row && !sq.piece) {
          moveType = 'castle';
        } else if ((movingPiece?.type === 'pawn' || movingPiece?.type === 'commander') && algebraic === enPassantTargetSquare) {
          moveType = 'enpassant';
        } else if (sq.piece) {
            if (sq.piece.color !== movingPiece?.color) {
                moveType = 'capture';
            } else {
                moveType = 'swap';
            }
        }

        const originalLevel = movingPiece?.level || 1; 
        const originalType = movingPiece?.type || 'pawn';
        const result = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare, capturedPieces);
        let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, phoenixResurrection, reflectionOccurred } = result;
        
        if (reflectionOccurred) {
            const victim = capturedPiece!;
            setCapturedPieces(prev => ({ ...prev, black: [...prev.black, { ...victim, id: `${victim.id}_refl_d_${Date.now()}` }] }));
            audioManager.playCapture();
            toast({ title: "REFLECTED!", description: "Enemy Mirror Shield reflected your attack!" });
            setKillStreaks(prev => ({ ...prev, black: (prev.black || 0) + 1, white: 0 }));
            setBoard(newBoard);
            setTimeout(() => {
                setSelectedSquare(null); setPossibleMoves([]);
                setIsMoveProcessing(false); clickGuard.current = false;
                processMoveEnd(newBoard, 'white', false, null);
            }, 800);
            return;
        }

        if (capturedPiece?.id.startsWith('boss-hydra')) {
            toast({ title: "Hydra Split!", description: "The Hydra's heads regrow into Knights!", duration: 3000 });
        }

        if (phoenixResurrection) { addEffect('light-beam', phoenixResurrection.square); audioManager.playResurrect(); toast({ title: "Rebirth!", description: "Phoenix Down resurrected the unit!" }); }
        if (result.infiltrationWin) { setBoard(newBoard); const survivors = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!); advanceLevel(survivors); return; }
        if (shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); toast({ title: "Level Up!", description: `${newBoard[row][col].piece?.type} consumed a Shroom 🍄 and leveled up to L${newBoard[row][col].piece?.level}!` }); }
        if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); }
        if (result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); audioManager.playConversion(); }
        
        let resPromoRequired = false;
        let resResult_promo_level = 1;
        let resResult_promo_square = null;

        const landedPiece = newBoard[row][col].piece;
        const isInteractivePromo = landedPiece?.type === 'pawn' && (row === 0 || row === 7);

        if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && capturedPiece) {
            const resResult = processRookResurrectionCheck(newBoard, 'white', {from: selectedSquare, to: algebraic, type: 'move'} as Move, algebraic, originalLevel, capturedPieces, uniqueIdCounterRef.current);
            if (resResult.resurrectionPerformed) {
                uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!;
                newBoard = resResult.boardWithResurrection; setCapturedPieces(resResult.capturedPiecesAfterResurrection);
                addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect();
                toast({ title: "Resurrection!", description: `Fallen ${resResult.resurrectedPieceData?.type} returns!` });
                if (resResult.promotionRequiredForResurrectedPawn) { 
                    resPromoRequired = true;
                    resResult_promo_level = resResult.resurrectedPieceData?.level || 1;
                    resResult_promo_square = resResult.resurrectedSquareAlg!;
                }
            }
        }
        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
        const oldStreak = killStreaks['white'] || 0;
        const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
        setKillStreaks(prev => ({ ...prev, white: newStreak }));
        if (streakGain > 0) {
          audioManager.playCapture();
          if (capturedPiece) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...capturedPiece!, id: `${capturedPiece!.id}_cap_${Date.now()}` }] }));
          if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...result.pieceCapturedByAnvil!, id: `${result.pieceCapturedByAnvil!.id}_anvil_${Date.now()}` }] }));
        } else if (moveType === 'castle' || moveType === 'swap') {
          audioManager.playMove();
        } else audioManager.playMove();

        setBoard(newBoard);
        setTimeout(() => {
          setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(false); clickGuard.current = false;
          const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
          
          if (resPromoRequired) {
              setPromotionTargetLevel(resResult_promo_level);
              setPromotionSquare(resResult_promo_square);
              setIsPromotingPawn(true);
              setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
              return;
          }

          let sacrificeNeeded = false;
          if (landedPiece?.type === 'queen') {
              sacrificeNeeded = processPawnSacrificeCheck(newBoard, 'white', { from: selectedSquare, to: algebraic, type: moveType }, originalLevel, originalType, isExtra, nextEp, oldStreak, newStreak);
          }
          if (sacrificeNeeded) return;

          if (isInteractivePromo) {
              setPromotionTargetLevel(getPromotionLevel(capturedPiece?.type || null));
              setIsPromotingPawn(true);
              setPromotionSquare(algebraic);
              setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
              return;
          }
          
          triggerSpecialsChain(newBoard, oldStreak, newStreak, isExtra, nextEp);
        }, 800);
        return;
      }
    }
    if (sq.piece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare)); }
    else { setSelectedSquare(null); setPossibleMoves([]); }
  };

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    move: Move,
    originalLevel: number,
    originalType: PieceType,
    isExtra: boolean,
    nextEp: AlgebraicSquare | null,
    oldStreak: number,
    newStreak: number
  ): boolean => {
    if (originalType !== 'queen') return false;
    const { row: tr, col: tc } = algebraicToCoords(move.to);
    const queen = boardAfterPrimaryMove[tr][tc].piece;
    if (queen && queen.type === 'queen' && queen.level === 7 && originalLevel < 7) {
      const hasPawns = boardAfterPrimaryMove.flat().some(sq => sq.piece && sq.piece.color === playerWhoseQueenLeveled && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
      if (hasPawns) {
        setIsAwaitingPawnSacrifice(true);
        setPlayerToSacrificePawn(playerWhoseQueenLeveled);
        setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
        setIsExtraTurnFromQueenMove(isExtra);
        setBoardForPostSacrifice(boardAfterPrimaryMove);
        setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak });
        return true;
      }
    }
    return false;
  }, [triggerSpecialsChain]);

  if (!user) {
    return (
        <div className="flex flex-col items-center justify-center h-[100dvh] bg-background p-4 text-center">
            <Swords className="h-12 w-12 text-primary mb-4 animate-pulse" />
            <h1 className="text-xl font-bold font-pixel text-primary uppercase mb-2">Authentication Required</h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">Please sign in to your profile to save items and start your dungeon descent.</p>
            <Link href="/login"><Button className="font-pixel uppercase px-8">Sign In</Button></Link>
        </div>
    );
  }

  const isBossFloor = level % 10 === 0;

  return (
    <div className="flex flex-col items-center justify-start h-[100dvh] bg-background p-2 md:p-4 gap-2 md:gap-4 overflow-hidden">
      <div className="w-full max-max-4xl flex items-center justify-between shrink-0">
        <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Run</Button></Link>
        <div className="flex items-center gap-2">
          {isBossFloor ? <Skull className="text-destructive h-6 w-6 animate-pulse" /> : <Swords className="text-primary h-6 w-6" />}
          <h1 className={cn("text-base md:text-xl font-bold font-pixel uppercase", isBossFloor ? "text-destructive" : "text-primary")}>
            {isBossFloor ? `BOSS FLOOR: ${level}` : `Floor ${level}`}
          </h1>
        </div>
        <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)}>
          <Package className="mr-1 h-4 w-4" /> Items
        </Button>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full max-w-6xl items-start justify-center flex-1 overflow-hidden">
        <div className="w-full lg:w-1/2 flex flex-col items-center gap-2 md:gap-4 shrink-0">
          <div className={cn("text-center text-[10px] md:text-sm font-bold min-h-[1.25em] uppercase font-pixel flex items-center justify-center gap-2", (gameInfo.isCheck || isBossFloor) && !gameInfo.gameOver && "animate-pulse", isBossFloor ? "text-destructive" : "text-primary", isAiThinking && "text-primary")}>
            {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
            {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isAwaitingSwapScrollTarget ? "SELECT ALLY TO SWAP!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
          </div>
          <div className="w-full aspect-square">
            <ChessBoard
              boardState={board}
              selectedSquare={isAnySpecialModeActive ? null : selectedSquare}
              possibleMoves={isAnySpecialModeActive ? [] : possibleMoves}
              enemySelectedSquare={null}
              enemyPossibleMoves={[]}
              onSquareClick={handleSquareClick}
              playerColor="white"
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || (isAnySpecialModeActive && currentPlayer === 'white') || isAiThinking}
              playerInCheck={gameInfo.playerWithKingInCheck}
              viewMode="flipping"
              animatedSquareTo={animatedSquareTo}
              lastMoveFrom={lastMoveFrom}
              lastMoveTo={lastMoveTo}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion}
              playerToPromoteCommander={playerWhoGotFirstBlood === 'white' ? 'white' : null}
              isEnPassantTarget={enPassantTargetSquare}
              onPieceHover={setPieceForInfoDisplay}
              effects={effects}
              promotingSquare={promotionSquare}
              isAwaitingAnvilDrop={isAwaitingAnvilDrop}
              playerToDropAnvil={currentPlayer === 'white' ? 'white' : null}
              isAwaitingHolyShield={isAwaitingHolyShield}
              isAwaitingArcherSnipe={isAwaitingArcherSnipe}
              isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget}
              isInventoryOpen={isInventoryOpen}
              selectedInventoryItemType={selectedInventoryItemType}
              localPlayerColor="white"
              isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget}
            />
          </div>
        </div>
        <div className="w-full lg:w-1/4 flex flex-col h-full min-h-0 overflow-y-auto scrollbar-hide">
          <div className="flex-1 min-h-0">
            <GameControls
              currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor="white" getPlayerDisplayName={(p) => p === 'white' ? 'Hero' : 'Dungeon'} onlineStatus="disconnected" turnTimer={null} activeTimerPlayer={null} chatMessages={[]} onSendMessage={() => {}} isMessengerOpen={false} onToggleMessenger={() => {}} hasUnreadMessages={false}
            />
          </div>
          {gameInfo.gameOver && (
            <div className="mt-2 space-y-2 shrink-0 mb-4 lg:mb-0">
              <Button className="w-full font-bold uppercase h-8 text-xs" onClick={() => startRun()}><RefreshCw className="mr-2 h-4 w-4" /> Retry Run</Button>
              <Link href="/"><Button variant="outline" className="w-full font-bold uppercase h-8 text-xs">Back to Lobby</Button></Link>
            </div>
          )}
        </div>
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

      <RulesDialog isOpen={false} onOpenChange={() => {}} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />

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
              Use Piece Ability
            </Button>
            <Button variant="secondary" onClick={() => abilityChoiceDialog?.onChoice('spell')}>
              Use Magic Item (Spell)
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
