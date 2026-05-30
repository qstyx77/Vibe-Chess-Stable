'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
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
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, ResurrectedSquareInfo } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Swords, ArrowLeft, BrainCircuit } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import Link from 'next/link';
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
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false };
        placedIds.add(p.id);
        return true;
    }
    return false;
  };

  // Place core pieces in standard home rank slots
  placePieceAt(king, 'e1');
  if (rooks[0]) placePieceAt(rooks[0], 'a1');
  if (rooks[1]) placePieceAt(rooks[1], 'h1');
  if (queens[0]) placePieceAt(queens[0], 'd1');
  if (knights[0]) placePieceAt(knights[0], 'b1');
  if (knights[1]) placePieceAt(knights[1], 'g1');
  if (bishops[0]) placePieceAt(bishops[0], 'c1');
  if (bishops[1]) placePieceAt(bishops[1], 'f1');

  // Strategic Frontline: Prioritize Guard Slots (d2, e2, f2) for King protection
  const guardSlots: AlgebraicSquare[] = ['d2', 'e2', 'f2'];
  const wingSlots: AlgebraicSquare[] = ['a2', 'b2', 'c2', 'g2', 'h2'].sort(() => Math.random() - 0.5) as AlgebraicSquare[];
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

  // Center-out backfill for elite units
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
    const bossLevel = level / 10;
    switch (bossLevel) {
      case 1: 
        board[0][4].piece = { id: 'boss-hydra', type: 'rook', color: 'black', level: 6, hasMoved: false, isShielded: false };
        board[0][3].piece = { id: 'hydra-guard-1', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false };
        board[0][5].piece = { id: 'hydra-guard-2', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false };
        break;
      case 2: 
        board[0][2].piece = { id: 'boss-necro', type: 'archbishop', color: 'black', level: 8, hasMoved: false, isShielded: false };
        for(let i=0; i<4; i++) board[1][i+2].piece = { id: `skeleton-${i}`, type: 'pawn', color: 'black', level: 3, hasMoved: false, isShielded: false };
        break;
      case 3: 
        board[0][4].piece = { id: 'boss-colossus', type: 'king', color: 'black', level: 15, hasMoved: false, isShielded: true };
        for(let i=0; i<8; i++) board[1][i].piece = { id: `shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false };
        break;
      case 4: 
        board[0][3].piece = { id: 'boss-mirage', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: false };
        for(let i=0; i<8; i++) board[0][i].piece = board[0][i].piece || { id: `phantom-${i}`, type: 'bishop', color: 'black', level: 4, hasMoved: false, isShielded: false };
        break;
      case 5: 
        board[0][4].piece = { id: 'boss-entity', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: true };
        for(let i=0; i<8; i++) {
          const type: PieceType = i % 2 === 0 ? 'hero' : 'archbishop';
          board[0][i].piece = board[0][i].piece || { id: `aspect-${i}`, type, color: 'black', level: 6, hasMoved: false, isShielded: false };
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false };
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
      board[pos.r][pos.c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: pLevel, hasMoved: false, isShielded: false };
    });
  }
  return board;
}

export default function DungeonPage() {
  const { userData, isUserLoading } = useUser();
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

  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);
  const moveCounter = useRef(0);
  const prevBoardRef = useRef<BoardState | null>(null);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => setEffects(curr => curr.filter(e => e.id !== id)), 1500);
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
    setGameInfo({ message: `Level ${nextLevel} - Wipe them out!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    toast({ title: "Level Up!", description: `Descending to Floor ${nextLevel}...` });
    audioManager.playLevelUp();
  }, [level, toast]);

  const processMoveEnd = useCallback((boardAfter: BoardState, turnPlayer: PlayerColor, extra: boolean, nextEpSquare: AlgebraicSquare | null = null) => {
    let nextBoard = boardAfter;
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    setEnPassantTargetSquare(nextEpSquare);
    const survivors = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const enemyCount = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    if (enemyCount === 0) {
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
    setGameInfo({ message: inCheck ? "Check!" : `Level ${level} - Wipe them out!`, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextP : null, isCheckmate: false, isStalemate: false, gameOver: false });
    setCurrentPlayer(nextP);
  }, [advanceLevel, level, toast, shroomSpawnCounter, nextShroomSpawnTurn]);

  const startRun = useCallback(() => {
    if (isUserLoading || !userData) return;
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
  }, [userData, isUserLoading]);

  useEffect(() => {
    if (!board.length && !isUserLoading && userData) startRun();
  }, [startRun, board.length, isUserLoading, userData]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = nextBoard[row][col].piece;
    if (!pieceBeingPromoted) return;
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: `${pieceBeingPromoted.id}_promo_${Date.now()}`, hasMoved: true, isShielded: false };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(nextBoard[row][col].piece!.level, 7);
    audioManager.playLevelUp();
    setBoard(nextBoard);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    const extraTurnFromPromo = (promotionPawnOriginalLevel || 1) >= 5;
    const oldStreak = killStreaks['white'];
    processMoveEnd(nextBoard, 'white', extraTurnFromPromo || (oldStreak < 6 && killStreaks['white'] >= 6), null);
  }, [board, promotionSquare, promotionPawnOriginalLevel, processMoveEnd, killStreaks]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;
    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    const piece = sq.piece;
    setPieceForInfoDisplay(piece || null);

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
            processMoveEnd(nextBoard, 'white', isExtraTurnFromQueenMove, enPassantTargetSquare);
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
            processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
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
            processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
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
            processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
        }
        return;
    }
    if (isAwaitingCommanderPromotion) {
        if (piece && piece.color === 'white' && piece.type === 'pawn' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece!.type = 'commander';
            nextBoard[row][col].piece!.id = `${nextBoard[row][col].piece!.id}_CMD_${Date.now()}`;
            setBoard(nextBoard);
            setIsAwaitingCommanderPromotion(false);
            audioManager.playLevelUp();
            processMoveEnd(nextBoard, 'white', false, enPassantTargetSquare);
        }
        return;
    }
    if (selectedSquare) {
      const { row: fromR, col: fromC } = algebraicToCoords(selectedSquare);
      const movingPiece = board[fromR][fromC].piece;
      if (selectedSquare === algebraic && movingPiece && (movingPiece.type === 'knight' || movingPiece.type === 'hero' || movingPiece.type === 'archer') && movingPiece.level >= 5) {
          const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare);
          audioManager.playExplosion();
          const { row: cR, col: cC } = algebraicToCoords(selectedSquare);
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc));
          let nextBoard = result.newBoard;
          const oldStreak = killStreaks.white;
          if (result.selfDestructCaptures && result.selfDestructCaptures.length > 0) {
              setCapturedPieces(prev => ({ ...prev, white: [...prev.white, ...result.selfDestructCaptures!] }));
              const streakGain = result.selfDestructCaptures.length;
              setKillStreaks(prev => ({ ...prev, white: (prev.white || 0) + streakGain }));
              if (!firstBloodAchieved) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white'); }
          }
          setBoard(nextBoard);
          setSelectedSquare(null);
          setPossibleMoves([]);
          processMoveEnd(nextBoard, 'white', result.extraTurn || (oldStreak < 6 && (killStreaks.white + (result.selfDestructCaptures?.length || 0)) >= 6), enPassantTargetSquare);
          return;
      }
      if (possibleMoves.includes(algebraic)) {
        setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic); setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); moveCounter.current++;
        const originalP = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece;
        
        let moveType: Move['type'] = 'move';
        if (originalP?.type === 'king' && Math.abs(fromC - col) === 2) {
          moveType = 'castle';
        } else if ((originalP?.type === 'pawn' || originalP?.type === 'commander') && algebraic === enPassantTargetSquare) {
          moveType = 'enpassant';
        } else if (sq.piece && sq.piece.color !== originalP?.color) {
          moveType = 'capture';
        }

        const originalLevel = originalP?.level || 1; setPromotionPawnOriginalLevel(originalLevel);
        const result = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare);
        let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, selfCheckByPushBack, infiltrationWin: pInfil } = result;
        if (selfCheckByPushBack) {
            setBoard(newBoard); setGameInfo({ message: "PUSH-BACK SELF-CHECK! RUN OVER", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, gameOver: true, winner: 'black' });
            audioManager.playDefeat(); return;
        }
        if (pInfil) { setBoard(newBoard); const survivors = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!); advanceLevel(survivors); return; }
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
        let firstBloodThisTurn = false;
        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
        const oldStreak = killStreaks[currentPlayer] || 0;
        const newStreak = oldStreak + streakGain;
        setKillStreaks(prev => ({ ...prev, [currentPlayer]: streakGain > 0 ? newStreak : 0 }));
        const milestoneExtraTurn = oldStreak < 6 && newStreak >= 6;

        if (streakGain > 0) {
          audioManager.playCapture();
          if (capturedPiece) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, capturedPiece!] }));
          if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, result.pieceCapturedByAnvil!] }));
          if (currentPlayer === 'white') {
              if (!firstBloodAchieved) {
                  const hasLevel1Pawn = newBoard.flat().some(sq => sq.piece?.color === 'white' && sq.piece.type === 'pawn' && sq.piece.level === 1);
                  if (hasLevel1Pawn) firstBloodThisTurn = true;
                  else { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white'); }
              }
              if (newStreak === 2 && newBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'white')) {
                  triggeredSpecial = true; setTimeout(() => { setIsAwaitingHolyShield(true); setSpecialActionContext({ extra: result.extraTurn || milestoneExtraTurn }); }, 800);
              } else if (newStreak === 3) {
                  triggeredSpecial = true; setTimeout(() => { setIsAwaitingAnvilDrop(true); setSpecialActionContext({ extra: result.extraTurn || milestoneExtraTurn }); }, 800);
              } else if (newStreak === 4) {
                  const graveyard = capturedPieces.black;
                  if (graveyard.length > 0) {
                      const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, id: `res_H_${Date.now()}` };
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
                    triggeredSpecial = true; setTimeout(() => { setIsAwaitingArcherSnipe(true); setSpecialActionContext({ extra: result.extraTurn || milestoneExtraTurn }); }, 800);
                  }
              }
          }
        } else audioManager.playMove();
        if (landedPiece?.type === 'queen' && landedPiece.level === 7 && originalLevel < 7) {
            const hasPawns = newBoard.flat().some(sq => sq.piece?.color === 'white' && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
            if (hasPawns) { triggeredSpecial = true; setBoardForPostSacrifice(newBoard); setPlayerWhoMadeQueenMove('white'); setPlayerToSacrificePawn('white'); setIsExtraTurnFromQueenMove(result.extraTurn || milestoneExtraTurn); setTimeout(() => { setIsAwaitingPawnSacrifice(true); }, 800); }
        }
        setBoard(newBoard);
        setTimeout(() => {
          setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(false); clickGuard.current = false;
          if (firstBloodAchieved && firstBloodThisTurn) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('white'); setIsAwaitingCommanderPromotion(true); return; }
          if (isInteractivePromo) { setIsPromotingPawn(true); setPromotionSquare(algebraic); return; }
          if (!triggeredSpecial) processMoveEnd(newBoard, currentPlayer, result.extraTurn || milestoneExtraTurn, nextEp);
        }, 800);
        return;
      }
    }
    if (sq.piece?.color === currentPlayer) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare)); }
    else { setSelectedSquare(null); setPossibleMoves([]); }
  };

  useEffect(() => {
    const isSpecialActionActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isPromotingPawn || isAwaitingPawnSacrifice;
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
             if (result.infiltrationWin) { setBoard(result.newBoard); setGameInfo({ message: "DUNGEON INFILTRATION! RUN OVER", gameOver: true, winner: 'black' }); audioManager.playDefeat(); return; }
             let nextBoard = result.newBoard;
             if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); }
             if (result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color)); audioManager.playConversion(); }
             if (nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece && (nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece!.type === 'rook' || nextBoard[algebraicToCoords(to).row][algebraicToCoords(to).col].piece!.type === 'palace') && result.capturedPiece) {
                const resResultAI = processRookResurrectionCheck(nextBoard, 'black', {from, to}, to, originalLevel, capturedPieces, Date.now());
                if (resResultAI.resurrectionPerformed) {
                    nextBoard = resResultAI.boardWithResurrection; setCapturedPieces(resResultAI.capturedPiecesAfterResurrection);
                    addEffect('light-beam', resResultAI.resurrectedSquareAlg!); audioManager.playResurrect();
                    if (resResultAI.promotionRequiredForResurrectedPawn) {
                        const { row: pr, col: pc } = algebraicToCoords(resResultAI.resurrectedSquareAlg!);
                        if (nextBoard[pr][pc].piece) { nextBoard[pr][pc].piece!.type = 'queen'; nextBoard[pr][pc].piece!.id += '_res_promo'; }
                    }
                }
             }
             setBoard(nextBoard);
             if (result.shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); }
             const streakGain = (result.capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (result.selfDestructCaptures?.length || 0);
             const oldStreak = killStreaks.black || 0;
             const newStreak = oldStreak + streakGain;
             const milestoneExtraTurn = oldStreak < 6 && newStreak >= 6;
             if (streakGain > 0 && !firstBloodAchieved) { setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood('black'); }
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
                   if (allies.length > 0) { const chosen = allies[Math.floor(Math.random() * allies.length)]; nextBoard.flat().forEach(sq => { if (sq.piece?.id === chosen.id) sq.piece.isShielded = true; }); audioManager.playShield(); }
               } else if (newStreak === 3) {
                   const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                   if (empty.length > 0) { const chosen = empty[Math.floor(Math.random() * empty.length)]; chosen.item = { type: 'anvil' }; audioManager.playAnvil(); }
               } else if (newStreak === 4) {
                   const graveyard = capturedPieces.white;
                   if (graveyard.length > 0) {
                       const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, id: `res_D_${Date.now()}` };
                       const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                       if (empty.length > 0) {
                           const chosenSq = empty[Math.floor(Math.random() * empty.length)];
                           const { row: rr, col: rc } = algebraicToCoords(chosenSq.algebraic);
                           nextBoard[rr][rc].piece = pieceToRes; setCapturedPieces(prev => ({ ...prev, white: prev.white.slice(0, -1) }));
                           addEffect('light-beam', chosenSq.algebraic); audioManager.playResurrect();
                           if (pieceToRes.type === 'pawn' && rr === 7) { nextBoard[rr][rc].piece!.type = 'queen'; nextBoard[rr][rc].piece!.id += '_streak_promo'; }
                           else if (pieceToRes.type === 'commander' && rr === 7) { nextBoard[rr][rc].piece!.type = 'hero'; }
                       }
                   }
               } else if (newStreak === 5 && hasArcher) {
                   const victims = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                   if (victims.length > 0) { const victimSq = victims[Math.floor(Math.random() * victims.length)]; const captured = { ...victimSq.piece! }; nextBoard.flat().forEach(sq => { if (sq.algebraic === victimSq.algebraic) sq.piece = null; }); setCapturedPieces(prev => ({ ...prev, black: [...prev.black, captured] })); audioManager.playSnipe(); addEffect('poof', victimSq.algebraic); }
               }
             } else audioManager.playMove();
             setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(nextBoard, 'black', result.extraTurn || milestoneExtraTurn, result.enPassantTargetSet); }, 800);
          } else {
            if (board.flat().filter(sq => sq.piece && sq.piece.color === 'black').length === 1) {
                const nextStuck = enemyStuckTurns + 1; setEnemyStuckTurns(nextStuck);
                if (nextStuck >= 3) {
                    const stuckPos = board.flat().find(sq => sq.piece && sq.piece.color === 'black')!.algebraic;
                    const result = applyMove(board, { from: stuckPos, to: stuckPos, type: 'self-destruct' }, enPassantTargetSquare);
                    audioManager.playExplosion(); setBoard(result.newBoard);
                    setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(result.newBoard, 'black', false, enPassantTargetSquare); }, 800);
                    return;
                }
            } else setEnemyStuckTurns(0);
            setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(board, 'black', false, enPassantTargetSquare);
          }
        } catch (e) { setIsAiThinking(false); setIsMoveProcessing(false); processMoveEnd(board, 'black', false, enPassantTargetSquare); }
      };
      think();
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, board, processMoveEnd, killStreaks, capturedPieces, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isPromotingPawn, isAwaitingPawnSacrifice, toast, enPassantTargetSquare, addEffect, enemyStuckTurns, firstBloodAchieved, playerWhoGotFirstBlood]);

  return (
    <div className="flex flex-col items-center justify-start h-[100dvh] bg-background p-2 md:p-4 gap-2 md:gap-4 overflow-hidden">
      <div className="w-full max-w-4xl flex items-center justify-between shrink-0">
        <Link href="/"><Button variant="ghost" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Exit Run</Button></Link>
        <div className="flex items-center gap-2"><Swords className="text-primary h-6 w-6" /><h1 className="text-base md:text-xl font-bold font-pixel text-primary uppercase">Floor {level}</h1></div>
        <div className="w-24"></div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full max-w-6xl items-start justify-center flex-1 overflow-hidden">
        <div className="w-full lg:w-1/2 flex flex-col items-center gap-2 md:gap-4 shrink-0">
          <div className={cn("text-center text-[10px] md:text-sm font-bold min-h-[1.25em] uppercase font-pixel flex items-center justify-center gap-2", gameInfo.isCheck && !gameInfo.gameOver && "animate-pulse text-destructive", isAiThinking && "text-primary")}>
            {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
            {isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" : isAwaitingAnvilDrop ? "PLACE AN ANVIL!" : isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" : isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" : isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" : isPromotingPawn ? "PROMOTE YOUR PAWN!" : isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
          </div>
          <div className="w-full max-w-lg aspect-square">
            <ChessBoard
              boardState={board} selectedSquare={selectedSquare} possibleMoves={possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor="white" currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode="flipping" animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={setPieceForInfoDisplay} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={currentPlayer === 'white' ? 'white' : null} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe}
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
            <div className="mt-2 space-y-2 shrink-0">
              <Button className="w-full font-bold uppercase h-8 text-xs" onClick={() => startRun()}><RefreshCw className="mr-2 h-4 w-4" /> Retry Run</Button>
              <Link href="/"><Button variant="outline" className="w-full font-bold uppercase h-8 text-xs">Back to Lobby</Button></Link>
            </div>
          )}
          <div className="mt-2 p-2 bg-primary/10 border border-primary/30 rounded-none shrink-0 mb-4 lg:mb-0">
            <p className="text-[8px] md:text-[9px] font-pixel leading-tight">
              <span className="text-primary font-bold">LEGENDARY BOSSES:</span><br/>
              F10: HYDRA (Splits) | F20: NECRO (Res) | F30: COLOSSUS (Shield)<br/>
              F40: MIRAGE (TP) | F50: ENTITY (God)
            </p>
          </div>
        </div>
      </div>
      <RulesDialog isOpen={false} onOpenChange={() => {}} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />
    </div>
  );
}
