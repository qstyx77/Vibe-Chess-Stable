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
  applyArchbishop,
  applyPalace,
  applyArcher,
  findKing,
  processPoisonDamage,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, ResurrectedSquareInfo, InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Swords, ArrowLeft, BrainCircuit, Package, Skull } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
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
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0 };
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
        // Three Level 2 Hydras
        board[0][3].piece = { id: 'boss-hydra-1', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-hydra-2', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        board[0][5].piece = { id: 'boss-hydra-3', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        // Two Level 2 Knight Guards
        board[1][3].piece = { id: 'hydra-guard-1', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        board[1][5].piece = { id: `hydra-guard-2`, type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        break;
      case 2: 
        board[0][2].piece = { id: 'boss-necro', type: 'archbishop', color: 'black', level: 8, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<4; i++) board[1][i+2].piece = { id: `skeleton-${i}`, type: 'pawn', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        break;
      case 3: 
        board[0][4].piece = { id: 'boss-colossus', type: 'king', color: 'black', level: 15, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) board[1][i].piece = { id: `shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        break;
      case 4: 
        board[0][3].piece = { id: 'boss-mirage', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) board[0][i].piece = board[0][i].piece || { id: `phantom-${i}`, type: 'bishop', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        break;
      case 5: 
        board[0][4].piece = { id: 'boss-entity', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) {
          const type: PieceType = i % 2 === 0 ? 'hero' : 'archbishop';
          board[0][i].piece = board[0][i].piece || { id: `aspect-${i}`, type, color: 'black', level: 6, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
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
      board[pos.r][pos.c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: pLevel, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, heldItem: null };
    });
  }
  return board;
}

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
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
  const [promotionPawnOriginalLevel, setPromotionPawnOriginalLevel] = useState<number | null>(null);
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);
  const [enemyStuckTurns, setEnemyStuckTurns] = useState(0);
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
  const [abilityChoiceDialog, setAbilityChoiceDialog] = useState<{ isOpen: boolean, onChoice: (choice: 'ability' | 'spell') => void } | null>(null);

  // --- Inventory States ---
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([
    { type: 'mirror_shield', count: 1 },
    { type: 'swift_cloak', count: 1 },
    { type: 'passive_armor', count: 1 },
    { type: 'cardinal_greaves', count: 1 },
    { type: 'drift_boots', count: 1 },
    { type: 'queens_peace', count: 1 },
    { type: 'wind_sword', count: 1 },
    { type: 'middle_way', count: 1 },
    { type: 'phoenix_down', count: 1 },
    { type: 'wind_scroll', count: 1 },
    { type: 'life_leach', count: 1 },
    { type: 'summon_anvil', count: 1 },
    { type: 'wind_cloak', count: 1 },
    { type: 'gnosis', count: 1 },
    { type: 'shield_scroll', count: 1 },
    { type: 'rally_scroll', count: 1 },
    { type: 'poison_dagger', count: 1 },
    { type: 'antidote', count: 1 },
    { type: 'crossbow', count: 1 },
    { type: 'poison_tunic', count: 1 },
    { type: 'detonation_scroll', count: 1 }
  ]);
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
    setPlayerArmy(survivorsFromLastBoard);
    const newBoard = generateDungeonFloor(nextLevel, survivorsFromLastBoard);
    setBoard(newBoard);
    setCapturedPieces(prev => ({ white: [], black: prev.black }));
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    setEnPassantTargetSquare(null);
    setEnemyStuckTurns(0);
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

    // --- POISON START OF TURN ---
    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(nextBoard, nextP);
    nextBoard = boardAfterPoison;
    if (poisonedCaptures.length > 0) {
        setCapturedPieces(prev => ({
            ...prev,
            [turnPlayer]: [...(prev[turnPlayer] || []), ...poisonedCaptures]
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

  const startRun = useCallback(() => {
    if (isUserLoading || !userData || !user) return;
    
    setIsMoveProcessing(false);
    clickGuard.current = false;
    
    let army: Piece[] = [];
    let initial = initializeBoard();
    if (userData) {
      if (userData.eloRating >= 1500) initial = applyArchbishop(initial, 'white');
      if (userData.eloRating >= 1800) initial = applyPalace(initial, 'white');
      if (userData.eloRating >= 2100) initial = applyArcher(initial, 'white');
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
    setEnemyStuckTurns(0);
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
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: `${pieceBeingPromoted.id}_promo_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0 };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(nextBoard[row][col].piece!.level, 7);
    audioManager.playLevelUp();
    setBoard(nextBoard);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    const extraTurnFromPromo = (promotionPawnOriginalLevel || 1) >= 5;
    const oldStreak = killStreaks['white'];
    const isExtra = extraTurnFromPromo || (oldStreak < 6 && killStreaks['white'] >= 6);

    let pendingCommander = isAwaitingCommanderPromotion;
    if (pendingCommander) {
        const hasL1Remaining = nextBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
        if (!hasL1Remaining) {
            setIsAwaitingCommanderPromotion(false);
            pendingCommander = false;
        }
    }

    if (pendingCommander) {
        setSpecialActionContext({ extra: isExtra });
        return;
    }

    processMoveEnd(nextBoard, 'white', isExtra, null);
  }, [board, promotionSquare, promotionPawnOriginalLevel, processMoveEnd, killStreaks, isAwaitingCommanderPromotion]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;

    const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget;
    const isLocalActionTurn = true; 
    if (isAnySpecialModeActive && !isLocalActionTurn) return;

    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    const piece = sq.piece;
    setPieceForInfoDisplay(piece || null);

    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (piece && !piece.heldItem && piece.color === 'white') {
          if (usedSlots >= attunementSlots) {
            toast({ title: "Attunement Limit", description: "You cannot equip any more pieces!", variant: "destructive" });
            return;
          }
          if (selectedInventoryItemType === 'swift_cloak' && piece.type !== 'pawn' && piece.type !== 'commander') {
            toast({ title: "Invalid Equipment", description: "Swift Cloak can only be equipped to Pawns or Commanders.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'queens_peace' && piece.type !== 'queen') {
            toast({ title: "Invalid Equipment", description: "Queen's Peace can only be equipped to a Queen.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'gnosis' && (piece.type === 'king' || piece.type === 'queen')) {
            toast({ title: "Invalid Equipment", description: "Gnosis can only be wielded by non-Royal pieces.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'crossbow' && piece.type !== 'archer') {
            toast({ title: "Invalid Equipment", description: "Crossbow can only be equipped to an Archer.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'detonation_scroll' && piece.type === 'king') {
            toast({ title: "Invalid Equipment", description: "Detonation Scroll cannot be equipped to the King.", variant: "destructive" });
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
        } else if (piece && piece.heldItem && piece.color === 'white') {
          if (selectedInventoryItemType === 'swift_cloak' && piece.type !== 'pawn' && piece.type !== 'commander') {
            toast({ title: "Invalid Equipment", description: "Swift Cloak can only be equipped to Pawns or Commanders.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'queens_peace' && piece.type !== 'queen') {
            toast({ title: "Invalid Equipment", description: "Queen's Peace can only be equipped to a Queen.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'gnosis' && (piece.type === 'king' || piece.type === 'queen')) {
            toast({ title: "Invalid Equipment", description: "Gnosis can only be wielded by non-Royal pieces.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'crossbow' && piece.type !== 'archer') {
            toast({ title: "Invalid Equipment", description: "Crossbow can only be equipped to an Archer.", variant: "destructive" });
            return;
          }

          if (selectedInventoryItemType === 'detonation_scroll' && piece.type === 'king') {
            toast({ title: "Invalid Equipment", description: "Detonation Scroll cannot be equipped to the King.", variant: "destructive" });
            return;
          }

          const oldItem = piece.heldItem;
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
        }
      } else {
        if (piece && piece.heldItem && piece.color === 'white') {
          const removedItem = piece.heldItem;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null;
          setBoard(nextBoard);
          setInventory(prev => {
            const nextInv = [...prev];
            const item = nextInv.find(i => i.type === removedItem);
            if (item) item.count++;
            else nextInv.push({ type: removedItem, count: 1 });
            return nextInv;
          });
          audioManager.playMove();
        }
      }
      return;
    }

    if (isAwaitingWindScrollTarget) {
      if (!sq.piece && !sq.item) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'wind-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare);
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
        const result = applyMove(board, move, enPassantTargetSquare);
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
        const result = applyMove(board, move, enPassantTargetSquare);
        setBoard(result.newBoard);
        audioManager.playShield();
        setIsAwaitingShieldScrollTarget(false); setSelectedSquare(null); setPossibleMoves([]);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, 'white', false, enPassantTargetSquare); }, 800);
      }
      return;
    }

    if (isAwaitingPawnSacrifice) {
        if (piece && piece.color === playerToSacrificePawn && (piece.type === 'pawn' || piece.type === 'commander')) {
            const nextBoard = (boardForPostSacrifice || board).map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sacrificed = nextBoard[row][col].piece!;
            nextBoard[row][col].piece = null;
            setCapturedPieces(prev => ({ ...prev, black: [...prev.black, sacrificed] }));
            setBoard(nextBoard);
            setIsAwaitingPawnSacrifice(false);
            setPlayerWhoMadeQueenMove(null);
            setBoardForPostSacrifice(null);
            audioManager.playCapture();

            const hasL1Remaining = nextBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (isAwaitingCommanderPromotion && !hasL1Remaining) {
              setIsAwaitingCommanderPromotion(false);
            }

            if (!isAwaitingCommanderPromotion) {
                processMoveEnd(nextBoard, 'white', isExtraTurnFromQueenMove, enPassantTargetSquare);
            }
        }
        return;
    }
    if (isAwaitingArcherSnipe) {
        if (piece && piece.color === 'black' && piece.level === 1 && piece.type !== 'king' && piece.type !== 'queen') {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece = null;
            setBoard(nextBoard);
            setCapturedPieces(prev => ({ ...prev, white: [...prev.white, piece] }));
            setIsAwaitingArcherSnipe(false);
            audioManager.playSnipe();
            
            const hasL1Remaining = nextBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (isAwaitingCommanderPromotion && !hasL1Remaining) {
              setIsAwaitingCommanderPromotion(false);
            }
            
            if (!isAwaitingCommanderPromotion) {
                processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
            }
        }
        return;
    }
    if (isAwaitingHolyShield) {
        if (piece && piece.color === 'white' && piece.type !== 'king') {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece!.isShielded = true;
            setBoard(nextBoard);
            setIsAwaitingHolyShield(false);
            audioManager.playShield();
            
            const hasL1Remaining = nextBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (isAwaitingCommanderPromotion && !hasL1Remaining) {
              setIsAwaitingCommanderPromotion(false);
            }

            if (!isAwaitingCommanderPromotion) {
                processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
            }
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
            
            // CROSSBOW SYNERGY IN DUNGEON
            const hasCrossbow = nextBoard.flat().some(sq => sq.piece?.heldItem === 'crossbow' && sq.piece.color === 'white');
            if (hasCrossbow) {
              const hasVictims = nextBoard.flat().some(sq => sq.piece && sq.piece.color === 'black' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
              if (hasVictims) {
                setIsAwaitingArcherSnipe(true);
                return;
              }
            }

            const hasL1Remaining = nextBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (isAwaitingCommanderPromotion && !hasL1Remaining) {
              setIsAwaitingCommanderPromotion(false);
            }

            if (!isAwaitingCommanderPromotion) {
                processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
            }
        }
        return;
    }
    if (isAwaitingCommanderPromotion) {
        if (piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            nextBoard[row][col].piece!.type = 'commander';
            nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_${Date.now()}`;
            nextBoard[row][col].piece!.isPoisoned = false; // Promo cures
            nextBoard[row][col].piece!.cooldownTurnsRemaining = 0;
            setBoard(nextBoard);
            setIsAwaitingCommanderPromotion(false);
            audioManager.playLevelUp();
            processMoveEnd(nextBoard, 'white', specialActionContext?.extra || false, enPassantTargetSquare);
        }
        return;
    }
    if (selectedSquare) {
      const { row: fromR, col: fromC } = algebraicToCoords(selectedSquare);
      const movingPiece = board[fromR][fromC].piece;
      if (!movingPiece) return;

      const hasSelfSelectionAbility = ((movingPiece.type === 'knight' || movingPiece.type === 'hero' || movingPiece.type === 'archer') && movingPiece.level >= 5);
      const hasMagicScroll = (movingPiece.heldItem === 'wind_scroll' || movingPiece.heldItem === 'life_leach' || movingPiece.heldItem === 'summon_anvil' || movingPiece.heldItem === 'shield_scroll' || movingPiece.heldItem === 'rally_scroll' || movingPiece.heldItem === 'antidote' || movingPiece.heldItem === 'detonation_scroll');

      if (selectedSquare === algebraic && (hasSelfSelectionAbility || hasMagicScroll)) {
        if (movingPiece.cooldownTurnsRemaining && movingPiece.cooldownTurnsRemaining > 0) {
            toast({ title: "Exhausted", description: "This piece is too weak to use abilities right now.", variant: "destructive" });
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
        const executeShieldScrollMode = () => { if(movingPiece.level < 2) return; setIsAwaitingShieldScrollTarget(true); setPossibleMoves([]); };
        const executeRallyScroll = () => {
          if(movingPiece.level < 3) return;
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
        const executeSelfDestruct = () => {
          const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare);
          audioManager.playExplosion();
          const { row: cR, col: cC } = algebraicToCoords(selectedSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          let nextBoard = result.newBoard;
          const oldStreak = killStreaks.white;
          if (result.selfDestructCaptures && result.selfDestructCaptures.length > 0) {
              setCapturedPieces(prev => ({ ...prev, white: [...prev.white, ...result.selfDestructCaptures!] }));
              setKillStreaks(prev => ({ ...prev, white: (prev.white || 0) + result.selfDestructCaptures!.length }));
              if (!firstBloodAchieved) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white'); }
          }
          setBoard(nextBoard); setSelectedSquare(null); setPossibleMoves([]);
          processMoveEnd(nextBoard, 'white', result.extraTurn || (oldStreak < 6 && (killStreaks.white + (result.selfDestructCaptures?.length || 0)) >= 6), enPassantTargetSquare);
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
              else if (movingPiece.heldItem === 'detonation_scroll') {
                  if (movingPiece.level >= 5) executeSelfDestruct();
                  else toast({ title: "Level Too Low", description: "Detonation Scroll requires Level 5+.", variant: "destructive" });
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
          else if (movingPiece.heldItem === 'detonation_scroll') {
              if (movingPiece.level >= 5) executeSelfDestruct();
              else toast({ title: "Level Too Low", description: "Detonation Scroll requires Level 5+.", variant: "destructive" });
          }
          else executeWindScrollMode();
        } else if (hasSelfSelectionAbility) executeSelfDestruct();
        return;
      }
      
      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare);
      let isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);

      if (isMoveInFreshList) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic); setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); moveCounter.current++;
        
        let moveType: Move['type'] = 'move';
        if (movingPiece?.type === 'king' && Math.abs(fromC - col) === 2) {
          moveType = 'castle';
        } else if ((movingPiece?.type === 'pawn' || movingPiece?.type === 'commander') && algebraic === enPassantTargetSquare) {
          moveType = 'enpassant';
        } else if (sq.piece && sq.piece.color !== movingPiece?.color) {
          moveType = 'capture';
        }

        const originalLevel = movingPiece?.level || 1; setPromotionPawnOriginalLevel(originalLevel);
        const result = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare);
        let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, phoenixResurrection, reflectionOccurred } = result;
        
        if (reflectionOccurred) {
            const victim = capturedPiece!;
            setCapturedPieces(prev => ({ ...prev, black: [...prev.black, { ...victim, id: `${victim.id}_refl_d_${Date.now()}` }] }));
            audioManager.playCapture();
            toast({ title: "REFLECTED!", description: "Enemy Mirror Shield reflected your attack!" });
            setKillStreaks(prev => ({ ...prev, black: (prev.black || 0) + 1 }));
            setKillStreaks(prev => ({ ...prev, white: 0 }));
            setBoard(newBoard);
            setTimeout(() => {
                setSelectedSquare(null); setPossibleMoves([]);
                setIsMoveProcessing(false); clickGuard.current = false;
                processMoveEnd(newBoard, 'white', false, null);
            }, 800);
            return;
        }

        if (phoenixResurrection) { addEffect('light-beam', phoenixResurrection.square); audioManager.playResurrect(); toast({ title: "Rebirth!", description: "Phoenix Down resurrected the unit!" }); }
        if (result.infiltrationWin) { setBoard(newBoard); const survivors = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!); advanceLevel(survivors); return; }
        if (shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); toast({ title: "Level Up!", description: `${newBoard[row][col].piece?.type} consumed a Shroom 🍄 and leveled up to L${newBoard[row][col].piece?.level}!` }); }
        if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); }
        if (result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); audioManager.playConversion(); }
        const landedPiece = newBoard[row][col].piece;
        const isInteractivePromo = landedPiece?.type === 'pawn' && (row === 0 || row === 7);
        let triggeredSpecial = false;
        if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && capturedPiece) {
            const resResult = processRookResurrectionCheck(newBoard, 'white', {from: selectedSquare, to: algebraic}, algebraic, originalLevel, capturedPieces, Date.now());
            if (resResult.resurrectionPerformed) {
                newBoard = resResult.boardWithResurrection; setCapturedPieces(resResult.capturedPiecesAfterResurrection);
                addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect();
                toast({ title: "Resurrection!", description: `Fallen ${resResult.resurrectedPieceData?.type} returns!` });
                if (resResult.promotionRequiredForResurrectedPawn) { setIsPromotingPawn(true); setPromotionSquare(resResult.resurrectedSquareAlg!); triggeredSpecial = true; }
            }
        }
        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
        const oldStreak = killStreaks['white'] || 0;
        const newStreak = streakGain > 0 ? oldStreak + streakGain : 0;
        setKillStreaks(prev => ({ ...prev, white: newStreak }));
        if (streakGain > 0) {
          audioManager.playCapture();
          if (capturedPiece) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, capturedPiece!] }));
          if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, result.pieceCapturedByAnvil!] }));
          
          if (!firstBloodAchieved) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white'); }
          if (newStreak === 2 && newBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'white')) {
              triggeredSpecial = true; setTimeout(() => { setIsAwaitingHolyShield(true); setSpecialActionContext({ extra: result.extraTurn || (oldStreak < 6 && newStreak >= 6) }); }, 800);
          } else if (newStreak === 3) {
              triggeredSpecial = true; setTimeout(() => { setIsAwaitingAnvilDrop(true); setSpecialActionContext({ extra: result.extraTurn || (oldStreak < 6 && newStreak >= 6) }); }, 800);
          } else if (newStreak === 4) {
              const graveyard = capturedPieces.black;
              if (graveyard.length > 0) {
                  const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, id: `res_H_${Date.now()}`, heldItem: null };
                  const empty = newBoard.flat().filter(sq => !sq.piece && !sq.item);
                  if (empty.length > 0) {
                      const chosenSq = empty[Math.floor(Math.random() * empty.length)];
                      const { row: rr, col: rc } = algebraicToCoords(chosenSq.algebraic);
                      newBoard[rr][rc].piece = pieceToRes; setCapturedPieces(prev => ({ ...prev, black: prev.black.slice(0, -1) }));
                      addEffect('light-beam', chosenSq.algebraic); audioManager.playResurrect();
                      if (pieceToRes.type === 'pawn' && rr === 0) { setIsPromotingPawn(true); setPromotionSquare(chosenSq.algebraic); triggeredSpecial = true; }
                      else if (pieceToRes.type === 'commander' && rr === 0) { newBoard[rr][rc].piece!.type = 'hero'; }
                  }
              }
          } else if (newStreak === 5 && newBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'white')) {
              const hasVictims = newBoard.flat().some(sq => 
                  sq.piece && 
                  sq.piece.color === 'black' && 
                  sq.piece.level === 1 && 
                  sq.piece.type !== 'king' && 
                  sq.piece.type !== 'queen'
              );
              if (hasVictims) {
                triggeredSpecial = true; setTimeout(() => { setIsAwaitingArcherSnipe(true); setSpecialActionContext({ extra: result.extraTurn || (oldStreak < 6 && newStreak >= 6) }); }, 800);
              }
          }
        } else if (moveType === 'castle') {
          audioManager.playMove();
        } else audioManager.playMove();

        if (landedPiece?.type === 'queen' && landedPiece.level === 7 && originalLevel < 7) {
            const hasPawns = newBoard.flat().some(sq => sq.piece?.color === 'white' && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
            if (hasPawns) { triggeredSpecial = true; setBoardForPostSacrifice(newBoard); setPlayerWhoMadeQueenMove('white'); setPlayerToSacrificePawn('white'); setIsExtraTurnFromQueenMove(result.extraTurn || (oldStreak < 6 && newStreak >= 6)); setTimeout(() => { setIsAwaitingPawnSacrifice(true); }, 800); }
        }
        setBoard(newBoard);
        setTimeout(() => {
          setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(false); clickGuard.current = false;
          if (isAwaitingPawnSacrifice) return;

          const hasL1Targets = newBoard.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
          if (!firstBloodAchieved && streakGain > 0) { 
              setFirstBloodAchieved(true); 
              setPlayerWhoGotFirstBlood('white'); 
              const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6);
              if (hasL1Targets) {
                  setSpecialActionContext({ extra: isExtra }); 
                  setIsAwaitingCommanderPromotion(true); 
                  if (isInteractivePromo) { setIsPromotingPawn(true); setPromotionSquare(algebraic); return; }
                  return;
              } else {
                  if (isInteractivePromo) { setIsPromotingPawn(true); setPromotionSquare(algebraic); return; }
                  processMoveEnd(newBoard, currentPlayer, isExtra, nextEp);
                  return;
              }
          }

          if (isInteractivePromo) { setIsPromotingPawn(true); setPromotionSquare(algebraic); return; }
          if (!triggeredSpecial) processMoveEnd(newBoard, currentPlayer, result.extraTurn || (oldStreak < 6 && newStreak >= 6), nextEp);
        }, 800);
        return;
      }
    }
    if (sq.piece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare)); }
    else { setSelectedSquare(null); setPossibleMoves([]); }
  };

  useEffect(() => {
    const isSpecialActionActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isPromotingPawn || isAwaitingPawnSacrifice || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget;
    if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAiThinking && !isSpecialActionActive && aiInstance.current) {
      const think = async () => {
        setIsAiThinking(true); setIsMoveProcessing(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        const stateForAi = {
          board: board.map(r => r.map(s => ({ piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))),
          currentPlayer: 'black' as PlayerColor, killStreaks: { ...killStreaks },
          capturedPieces: { white: capturedPieces.white.map(p => ({ ...p })), black: capturedPieces.black.map(p => ({ ...p })) },
          gameMoveCounter: 0, enPassantTargetSquare: enPassantTargetSquare, gameOver: false, firstBloodAchieved, playerWhoGotFirstBlood: playerWhoGotFirstBlood
        };
        try {
          const best = aiInstance.current!.getBestMove(stateForAi, 'black');
          if (best.move) {
             setEnemyStuckTurns(0);
             const from = coordsToAlgebraic(best.move.from[0], best.move.from[1]);
             const to = coordsToAlgebraic(best.move.to[0], best.move.to[1]);
             const originalP = board[best.move.from[0]][best.move.from[1]].piece;
             const originalLevel = originalP?.level || 1;
             setLastMoveFrom(from); setLastMoveTo(to); setAnimatedSquareTo(to);
             const result = applyMove(board, { from, to, type: best.move.type as any, promoteTo: best.move.type === 'promotion' ? (best.move.promoteTo || 'queen') : undefined }, enPassantTargetSquare);
             
             if (result.reflectionOccurred) {
                const victim = result.capturedPiece!;
                setCapturedPieces(prev => ({ ...prev, white: [...prev.white, { ...victim, id: `${victim.id}_refl_ai_d_${Date.now()}` }] }));
                audioManager.playCapture();
                toast({ title: "REFLECTED!", description: "Hero's Mirror Shield reflected the Dungeon attack!" });
                setKillStreaks(prev => ({ ...prev, white: (prev.white || 0) + 1 }));
                setKillStreaks(prev => ({ ...prev, black: 0 }));
                setBoard(result.newBoard);
                setTimeout(() => {
                    setIsAiThinking(false); setIsMoveProcessing(false);
                    processMoveEnd(result.newBoard, 'black', false, null);
                }, 800);
                return;
             }

             if (result.infiltrationWin) { 
                setIsAiThinking(false);
                setIsMoveProcessing(false);
                setBoard(result.newBoard); 
                setGameInfo({ message: "DUNGEON INFILTRATION! RUN OVER", gameOver: true, winner: 'black' }); 
                audioManager.playDefeat(); 
                return; 
             }
             let nextBoard = result.newBoard;
             if (result.phoenixResurrection) { addEffect('light-beam', result.phoenixResurrection.square); audioManager.playResurrect(); }
             if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); }
             if (result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); audioManager.playConversion(); }
             if (nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece && (nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece!.type === 'rook' || nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece!.type === 'palace') && result.capturedPiece) {
                const resResultAI = processRookResurrectionCheck(nextBoard, 'black', {from, to}, to, originalLevel, capturedPieces, Date.now());
                if (resResultAI.resurrectionPerformed) {
                    nextBoard = resResultAI.boardWithResurrection; setCapturedPieces(resResultAI.capturedPiecesAfterResurrection);
                    addEffect('light-beam', resResultAI.resurrectedSquareAlg!); audioManager.playResurrect();
                    if (resResultAI.promotionRequiredForResurrectedPawn) {
                        const { row: pr, col: pc } = algebraicToCoords(resResultAI.resurrectedSquareAlg!);
                        if (nextBoard[pr][pc].piece) { nextBoard[pr][pc].piece!.type = 'queen'; nextBoard[pr][pc].piece!.id += '_res_promo'; nextBoard[pr][pc].piece!.isPoisoned = false; nextBoard[pr][pc].piece!.cooldownTurnsRemaining = 0; }
                    }
                }
             }
             setBoard(nextBoard);
             if (result.shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); }
             const streakGain = (result.capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (result.selfDestructCaptures?.length || 0);
             const oldStreak = killStreaks.black || 0;
             const newStreak = oldStreak + streakGain;
             if (streakGain > 0 && !firstBloodAchieved) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(currentPlayer); }
             setKillStreaks(prev => ({ ...prev, black: streakGain > 0 ? newStreak : 0 }));
             if (streakGain > 0) {
               audioManager.playCapture();
               if (result.capturedPiece) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, result.capturedPiece!] }));
               if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, result.pieceCapturedByAnvil!] }));
               if (result.selfDestructCaptures) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, ...result.selfDestructCaptures!] }));
               const hasArchbishop = nextBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'black');
               const hasArcher = nextBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'black');
               if (newStreak === 2 && hasArchbishop) {
                   const allies = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && sq.piece.type !== 'king' && sq.piece.id !== nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece?.id).map(sq => sq.piece!);
                   if (allies.length > 0) { const player_sh_id = allies[Math.floor(Math.random() * allies.length)].id; nextBoard.flat().forEach(sq => { if (sq.piece?.id === player_sh_id) sq.piece.isShielded = true; }); audioManager.playShield(); }
               } else if (newStreak === 3) {
                   const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                   if (empty.length > 0) { const chosen = empty[Math.floor(Math.random() * empty.length)]; chosen.item = { type: 'anvil' }; audioManager.playAnvil(); }
                   // AI CROSSBOW SYNERGY
                   const hasCrossbow = nextBoard.flat().some(sq => sq.piece?.heldItem === 'crossbow' && sq.piece.color === 'black');
                   if (hasCrossbow) {
                     const victims = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                     if (victims.length > 0) {
                        const v = victims[Math.floor(Math.random()*victims.length)];
                        const cp = { ...v.piece! };
                        nextBoard.flat().forEach(row_v => row_v.forEach(sq_v => { if (sq_v.algebraic === v.algebraic) sq_v.piece = null; }));
                        setCapturedPieces(prev => ({ ...prev, black: [...prev.black, cp] }));
                        audioManager.playSnipe(); addEffect('poof', v.algebraic);
                     }
                   }
               } else if (newStreak === 4) {
                   const graveyard = capturedPieces.white;
                   if (graveyard.length > 0) {
                       const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, id: `res_D_${Date.now()}`, heldItem: null };
                       const empty = newBoard.flat().filter(sq => !sq.piece && !sq.item);
                       if (empty.length > 0) {
                           const chosenSq = empty[Math.floor(Math.random() * empty.length)];
                           const { row: rr, col: rc } = algebraicToCoords(chosenSq.algebraic);
                           nextBoard[rr][rc].piece = pieceToRes; setCapturedPieces(prev => ({ ...prev, white: prev.white.slice(0, -1) }));
                           addEffect('light-beam', chosenSq.algebraic); audioManager.playResurrect();
                           if (pieceToRes.type === 'pawn' && rr === 7) { nextBoard[rr][rc].piece!.type = 'queen'; nextBoard[rr][rc].piece!.id += '_streak_promo'; nextBoard[rr][rc].piece!.isPoisoned = false; nextBoard[rr][rc].piece!.cooldownTurnsRemaining = 0; }
                           else if (pieceToRes.type === 'commander' && rr === 7) { nextBoard[rr][rc].piece!.type = 'hero'; nextBoard[rr][rc].piece!.isPoisoned = false; nextBoard[rr][rc].piece!.cooldownTurnsRemaining = 0; }
                       }
                   }
               } else if (newStreak === 5 && hasArcher) {
                   const victims = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                   if (victims.length > 0) { const victimSq = victims[Math.floor(Math.random() * victims.length)]; const captured = { ...victimSq.piece! }; nextBoard.flat().forEach(row_v => row_v.forEach(sq_v => { if (sq_v.algebraic === victimSq.algebraic) sq_v.piece = null; })); setCapturedPieces(prev => ({ ...prev, black: [...prev.black, captured] })); audioManager.playSnipe(); addEffect('poof', victimSq.algebraic); }
               }
             } else if (best.move.type === 'castle') {
               audioManager.playMove();
             } else audioManager.playMove();
             setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(nextBoard, 'black', result.extraTurn || (oldStreak < 6 && newStreak >= 6), result.enPassantTargetSet); }, 800);
          } else {
            const nextStuck = enemyStuckTurns + 1;
            setEnemyStuckTurns(nextStuck);
            if (nextStuck >= 3) {
                const stuckPieces = board.flat().filter(sq => sq.piece && sq.piece.color === 'black');
                let currentBoard = board;
                stuckPieces.forEach(sq => {
                    const result = applyMove(currentBoard, { from: sq.algebraic, to: sq.algebraic, type: 'self-destruct' }, enPassantTargetSquare);
                    currentBoard = result.newBoard;
                    const { row: cR, col: cC } = algebraicToCoords(sq.algebraic);
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (isValidSquare(cR + dr, cC + dc)) {
                                addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
                            }
                        }
                    }
                });
                audioManager.playExplosion();
                setBoard(currentBoard);
                setEnemyStuckTurns(0);
                setTimeout(() => { 
                    setIsAiThinking(false); 
                    setIsMoveProcessing(false); 
                    processMoveEnd(currentBoard, 'black', false, enPassantTargetSquare); 
                }, 800);
                return;
            }
            setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(board, 'black', false, enPassantTargetSquare);
          }
        } catch (e) { setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(board, 'black', false, enPassantTargetSquare); }
      };
      think();
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, board, processMoveEnd, killStreaks, capturedPieces, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isPromotingPawn, isAwaitingPawnSacrifice, toast, enPassantTargetSquare, addEffect, enemyStuckTurns, firstBloodAchieved, playerWhoGotFirstBlood, isInventoryOpen, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget]);

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
      <div className="w-full max-w-4xl flex items-center justify-between shrink-0">
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
            {isInventoryOpen ? "SELECT AN ITEM TO EQUIP!" : isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isAwaitingWindScrollTarget ? "SELECT TARGET FOR WIND!" : isAwaitingAnvilScrollTarget ? "SELECT TARGET FOR ANVIL!" : isAwaitingShieldScrollTarget ? "SELECT TARGET FOR SHIELD!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
          </div>
          <div className="w-full aspect-square">
            <ChessBoard
              boardState={board}
              selectedSquare={(isInventoryOpen || isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingCommanderPromotion || isAwaitingHolyShield || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget) ? null : selectedSquare}
              possibleMoves={(isInventoryOpen || isAwaitingAnvilDrop || isAwaitingArcherSnipe || isAwaitingCommanderPromotion || isAwaitingHolyShield || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget) ? [] : possibleMoves}
              enemySelectedSquare={null}
              enemyPossibleMoves={[]}
              onSquareClick={handleSquareClick}
              playerColor="white"
              currentPlayerColor={currentPlayer}
              isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking || isInventoryOpen}
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
