
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

const whiteStartPositions: Record<PieceType, AlgebraicSquare[]> = {
  rook: ['a1', 'h1'],
  knight: ['b1', 'g1'],
  bishop: ['c1', 'f1'],
  queen: ['d1'],
  king: ['e1'],
  pawn: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
  commander: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
  hero: ['b1', 'g1'],
  infiltrator: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
  archbishop: ['c1', 'f1'],
  palace: ['a1', 'h1'],
  archer: ['b1', 'g1'],
};

function generateDungeonFloor(level: number, playerArmy: Piece[]): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      row.push({ piece: null, item: null, algebraic: coordsToAlgebraic(r, c), rowIndex: r, colIndex: c });
    }
    board.push(row);
  }

  // Place player army
  playerArmy.forEach(p => {
    const preferredSquares = whiteStartPositions[p.type] || [];
    let placed = false;
    for (const alg of preferredSquares) {
      const { row, col } = algebraicToCoords(alg);
      if (!board[row][col].piece) {
        board[row][col].piece = { ...p, hasMoved: false };
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let r = 7; r >= 6; r--) {
        for (let c = 0; c < 8; c++) {
          if (!board[r][c].piece) {
            board[r][c].piece = { ...p, hasMoved: false };
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
  });

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
      
      board[pos.r][pos.c].piece = { 
        id: `enemy-${level}-${i}`, 
        type, 
        color: 'black', 
        level: pLevel, 
        hasMoved: false, 
        isShielded: false 
      };
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

  // Special action states
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
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
        if (!currentPieceIds.has(prevSq.piece!.id)) {
            addEffect('poof', prevSq.algebraic);
        }
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

  const startRun = useCallback(() => {
    if (isUserLoading || !userData) return;
    
    let army: Piece[] = [];
    let initial = initializeBoard();
    
    if (userData) {
      if (userData.eloRating >= 1500) initial = applyArchbishop(initial, 'white');
      if (userData.eloRating >= 1800) initial = applyPalace(initial, 'white');
      if (userData.eloRating >= 2100) initial = applyArcher(initial, 'white');
    }
    
    initial.flat().forEach(sq => {
      if (sq.piece && sq.piece.color === 'white') army.push(sq.piece);
    });
    
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

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    return player === 'white' ? 'Hero' : 'Dungeon';
  }, []);

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
      toast({ title: "EXTRA TURN!", description: `${getPlayerDisplayName(turnPlayer)} gains another move!`, duration: 2000 });
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
      setGameInfo({ 
        message: "YOUR KING HAS FALLEN", 
        isCheck: true, 
        playerWithKingInCheck: 'white', 
        isCheckmate: true, 
        isStalemate: false, 
        gameOver: true, 
        winner: 'black' 
      });
      audioManager.playDefeat();
      return;
    }

    const inCheck = isKingInCheck(nextBoard, nextP, nextEpSquare);
    if (inCheck) audioManager.playCheck();
    
    const message = inCheck ? "Check!" : `Level ${level} - Wipe them out!`;

    setGameInfo({
      message,
      isCheck: inCheck,
      playerWithKingInCheck: inCheck ? nextP : null,
      isCheckmate: false,
      isStalemate: false,
      gameOver: false,
    });

    setCurrentPlayer(nextP);
  }, [advanceLevel, level, toast, shroomSpawnCounter, nextShroomSpawnTurn, getPlayerDisplayName]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;

    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = nextBoard[row][col].piece;

    if (!pieceBeingPromoted) return;

    nextBoard[row][col].piece = {
      ...pieceBeingPromoted,
      type: pieceType,
      id: `${pieceBeingPromoted.id}_promo_${Date.now()}`,
      hasMoved: true,
    };

    if (pieceType === 'queen') {
      nextBoard[row][col].piece!.level = Math.min(nextBoard[row][col].piece!.level, 7);
    }

    audioManager.playLevelUp();
    setBoard(nextBoard);
    setIsPromotingPawn(false);
    setPromotionSquare(null);

    const extraTurnFromPromo = (promotionPawnOriginalLevel || 1) >= 5;
    const finalStreak = killStreaks['white'];
    processMoveEnd(nextBoard, 'white', extraTurnFromPromo || finalStreak >= 6, null);
  }, [board, promotionSquare, promotionPawnOriginalLevel, processMoveEnd, killStreaks]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;

    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    const piece = sq.piece;

    setPieceForInfoDisplay(piece || null);

    if (isAwaitingPawnSacrifice) {
        if (piece && piece.color === 'white' && (piece.type === 'pawn' || piece.type === 'commander')) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sacrificed = nextBoard[row][col].piece!;
            nextBoard[row][col].piece = null;
            setCapturedPieces(prev => ({ ...prev, black: [...prev.black, sacrificed] }));
            setBoard(nextBoard);
            setIsAwaitingPawnSacrifice(false);
            audioManager.playCapture();
            processMoveEnd(nextBoard, 'white', specialActionContext.extra, enPassantTargetSquare);
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
          if (result.selfDestructCaptures && result.selfDestructCaptures.length > 0) {
              setCapturedPieces(prev => ({ ...prev, white: [...prev.white, ...result.selfDestructCaptures!] }));
              const streakGain = result.selfDestructCaptures.length;
              const newStreak = (killStreaks.white || 0) + streakGain;
              setKillStreaks(prev => ({ ...prev, white: newStreak }));
          }

          setBoard(nextBoard);
          setSelectedSquare(null);
          setPossibleMoves([]);
          processMoveEnd(nextBoard, 'white', result.extraTurn || (killStreaks.white + (result.selfDestructCaptures?.length || 0)) >= 6, enPassantTargetSquare);
          return;
      }

      if (possibleMoves.includes(algebraic)) {
        setIsMoveProcessing(true);
        clickGuard.current = true;
        setAnimatedSquareTo(algebraic);
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        moveCounter.current++;

        const originalP = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece;
        const originalLevel = originalP?.level || 1;
        setPromotionPawnOriginalLevel(originalLevel);

        const result = applyMove(board, { from: selectedSquare, to: algebraic }, enPassantTargetSquare);
        let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, selfCheckByPushBack, infiltrationWin: pInfil } = result;

        if (selfCheckByPushBack) {
            setBoard(newBoard);
            setGameInfo({ message: "PUSH-BACK SELF-CHECK! RUN OVER", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, gameOver: true, winner: 'black' });
            audioManager.playDefeat();
            return;
        }

        if (pInfil) {
            setBoard(newBoard);
            const survivors = newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
            advanceLevel(survivors);
            return;
        }

        if (shroomConsumed) {
            audioManager.playShroom();
            audioManager.playLevelUp();
            const movedP = newBoard[row][col].piece;
            toast({ title: "Level Up!", description: `${movedP?.type} consumed a Shroom 🍄 and leveled up to L${movedP?.level}!` });
        }

        if (result.rallyCryTriggered) {
          addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color);
          audioManager.playRally();
        }
        if (result.conversionEvents.length > 0) {
          result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color));
          audioManager.playConversion();
        }
        if (result.queenLevelReducedEvents) {
            toast({ title: "King's Dominion!", description: "Enemy Queen level reduced!" });
        }

        const landedPiece = newBoard[row][col].piece;
        const isInteractivePromo = landedPiece?.type === 'pawn' && (row === 0 || row === 7);
        const isHeroPromo = landedPiece?.type === 'hero' && originalP?.type === 'commander' && (row === 0 || row === 7);

        if (isHeroPromo) {
           toast({ title: "Hero Ascended!", description: "Your Commander has promoted to a Hero!" });
           audioManager.playLevelUp();
        }

        if (landedPiece && (landedPiece.type === 'rook' || landedPiece.type === 'palace') && capturedPiece) {
            const resResult = processRookResurrectionCheck(newBoard, 'white', {from: selectedSquare, to: algebraic}, algebraic, originalLevel, capturedPieces, Date.now());
            if (resResult.resurrectionPerformed) {
                newBoard = resResult.boardWithResurrection;
                setCapturedPieces(resResult.capturedPiecesAfterResurrection);
                addEffect('light-beam', resResult.resurrectedSquareAlg!);
                audioManager.playResurrect();
                toast({ title: "Resurrection!", description: `Fallen ${resResult.resurrectedPieceData?.type} returns!` });
            }
        }

        let firstBloodThisTurn = false;
        let triggeredSpecial = false;

        const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0);
        const newStreak = (killStreaks[currentPlayer] || 0) + streakGain;
        setKillStreaks(prev => ({ ...prev, [currentPlayer]: streakGain > 0 ? newStreak : 0 }));

        if (streakGain > 0) {
          audioManager.playCapture();
          if (capturedPiece) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, capturedPiece!] }));
          if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, white: [...prev.white, result.pieceCapturedByAnvil!] }));
          
          if (currentPlayer === 'white') {
              if (!firstBloodAchieved) {
                  const hasLevel1Pawn = newBoard.flat().some(sq => sq.piece?.color === 'white' && sq.piece.type === 'pawn' && sq.piece.level === 1);
                  if (hasLevel1Pawn) {
                      firstBloodThisTurn = true;
                  } else {
                      setFirstBloodAchieved(true);
                      setPlayerWhoGotFirstBlood('white');
                  }
              }
              
              if (newStreak === 2 && newBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'white')) {
                  triggeredSpecial = true;
                  setTimeout(() => { setIsAwaitingHolyShield(true); setSpecialActionContext({ extra: result.extraTurn || newStreak >= 6 }); }, 800);
              } else if (newStreak === 3) {
                  triggeredSpecial = true;
                  setTimeout(() => { setIsAwaitingAnvilDrop(true); setSpecialActionContext({ extra: result.extraTurn || newStreak >= 6 }); }, 800);
              } else if (newStreak === 4) {
                  const graveyard = capturedPieces.black;
                  if (graveyard.length > 0) {
                      const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, id: `res_H_${Date.now()}` };
                      const empty = newBoard.flat().filter(sq => !sq.piece && !sq.item);
                      if (empty.length > 0) {
                          const chosenSq = empty[Math.floor(Math.random() * empty.length)];
                          const { row: rr, col: rc } = algebraicToCoords(chosenSq.algebraic);
                          newBoard[rr][rc].piece = pieceToRes;
                          setCapturedPieces(prev => ({ ...prev, black: prev.black.slice(0, -1) }));
                          addEffect('light-beam', chosenSq.algebraic);
                          audioManager.playResurrect();
                          toast({ title: "Streak Resurrection!", description: `Fallen ${pieceToRes.type} restored!` });
                      }
                  }
              } else if (newStreak === 5 && newBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'white')) {
                  triggeredSpecial = true;
                  setTimeout(() => { setIsAwaitingArcherSnipe(true); setSpecialActionContext({ extra: result.extraTurn || newStreak >= 6 }); }, 800);
              }
          }
        } else {
          audioManager.playMove();
        }

        if (landedPiece?.type === 'queen' && landedPiece.level === 7 && originalLevel < 7) {
            const hasPawns = newBoard.flat().some(sq => sq.piece?.color === 'white' && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
            if (hasPawns) {
                triggeredSpecial = true;
                setTimeout(() => { setIsAwaitingPawnSacrifice(true); setSpecialActionContext({ extra: result.extraTurn || newStreak >= 6 }); }, 800);
            }
        }

        setBoard(newBoard);
        setTimeout(() => {
          setSelectedSquare(null);
          setPossibleMoves([]);
          setIsMoveProcessing(false);
          clickGuard.current = false;
          
          if (firstBloodThisTurn) {
              setFirstBloodAchieved(true);
              setPlayerWhoGotFirstBlood('white');
              setIsAwaitingCommanderPromotion(true);
              return;
          }

          if (isInteractivePromo) {
             setIsPromotingPawn(true);
             setPromotionSquare(algebraic);
             return;
          }

          if (!triggeredSpecial) {
              processMoveEnd(newBoard, currentPlayer, result.extraTurn || newStreak >= 6, nextEp);
          }
        }, 800);
        return;
      }
    }

    if (sq.piece?.color === currentPlayer) {
      setSelectedSquare(algebraic);
      setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  useEffect(() => {
    const isSpecialActionActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe || isPromotingPawn || isAwaitingPawnSacrifice;
    if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAiThinking && !isSpecialActionActive && aiInstance.current) {
      const think = async () => {
        setIsAiThinking(true);
        setIsMoveProcessing(true);
        
        await new Promise(resolve => setTimeout(resolve, 500));

        const stateForAi = {
          board: board.map(r => r.map(s => ({ piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))),
          currentPlayer: 'black' as PlayerColor,
          killStreaks: { ...killStreaks },
          capturedPieces: {
            white: capturedPieces.white.map(p => ({ ...p })),
            black: capturedPieces.black.map(p => ({ ...p }))
          },
          gameMoveCounter: 0,
          enPassantTargetSquare: enPassantTargetSquare,
          gameOver: false,
          firstBloodAchieved: true,
          playerWhoGotFirstBlood: 'white'
        };
        
        try {
          const enemyPieces = board.flat().filter(sq => sq.piece && sq.piece.color === 'black');
          const best = aiInstance.current!.getBestMove(stateForAi, 'black');
          
          if (best.move) {
             setEnemyStuckTurns(0);
             const from = coordsToAlgebraic(best.move.from[0], best.move.from[1]);
             const to = coordsToAlgebraic(best.move.to[0], best.move.to[1]);
             
             const originalP = board[best.move.from[0]][best.move.from[1]].piece;
             const originalLevel = originalP?.level || 1;

             setLastMoveFrom(from);
             setLastMoveTo(to);
             setAnimatedSquareTo(to);
             
             const promoteTo = best.move.type === 'promotion' ? (best.move.promoteTo || 'queen') : undefined;
             const result = applyMove(board, { from, to, type: best.move.type as any, promoteTo }, enPassantTargetSquare);
             
             if (result.infiltrationWin) {
                setBoard(result.newBoard);
                setGameInfo({ message: "DUNGEON INFILTRATION! RUN OVER", gameOver: true, winner: 'black' });
                audioManager.playDefeat();
                return;
             }

             let nextBoard = result.newBoard;
             const { row: toR, col: toC } = algebraicToCoords(to);
             const landedPieceAI = nextBoard[toR][toC].piece;

             if (best.move.type === 'promotion') {
                 toast({ title: "Enemy Promotion!", description: `Dungeon Pawn promoted to ${promoteTo} (L${landedPieceAI?.level})!` });
                 audioManager.playLevelUp();
             }
             if (landedPieceAI?.type === 'hero' && originalP?.type === 'commander') {
                 toast({ title: "Enemy Hero Ascended!", description: "Dungeon Commander has promoted to a Hero!" });
                 audioManager.playLevelUp();
             }

             if (result.rallyCryTriggered) {
               addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color);
               audioManager.playRally();
             }
             if (result.conversionEvents.length > 0) {
               result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color));
               audioManager.playConversion();
             }

             if (landedPieceAI && (landedPieceAI.type === 'rook' || landedPieceAI.type === 'palace') && result.capturedPiece) {
                const resResultAI = processRookResurrectionCheck(nextBoard, 'black', {from, to}, to, originalLevel, capturedPieces, Date.now());
                if (resResultAI.resurrectionPerformed) {
                    nextBoard = resResultAI.boardWithResurrection;
                    setCapturedPieces(resResultAI.capturedPiecesAfterResurrection);
                    addEffect('light-beam', resResultAI.resurrectedSquareAlg!);
                    audioManager.playResurrect();
                    toast({ title: "Dungeon Resurrection!", description: `Enemy ${resResultAI.resurrectedPieceData?.type} has been resurrected!` });
                }
             }

             setBoard(nextBoard);
             
             if (result.shroomConsumed) {
                audioManager.playShroom();
                audioManager.playLevelUp();
             }

             const streakGain = (result.capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (result.selfDestructCaptures?.length || 0);
             const newStreak = (killStreaks.black || 0) + streakGain;
             setKillStreaks(prev => ({ ...prev, black: streakGain > 0 ? newStreak : 0 }));

             if (streakGain > 0) {
               audioManager.playCapture();
               if (result.capturedPiece) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, result.capturedPiece!] }));
               if (result.pieceCapturedByAnvil) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, result.pieceCapturedByAnvil!] }));
               if (result.selfDestructCaptures) setCapturedPieces(prev => ({ ...prev, black: [...prev.black, ...result.selfDestructCaptures!] }));

               const hasArchbishop = nextBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'black');
               const hasArcher = nextBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'black');

               if (newStreak === 2 && hasArchbishop) {
                   const allies = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && sq.piece.type !== 'king' && sq.piece.id !== landedPieceAI?.id).map(sq => sq.piece!);
                   if (allies.length > 0) {
                       const chosen = allies[Math.floor(Math.random() * allies.length)];
                       nextBoard.flat().forEach(sq => { if (sq.piece?.id === chosen.id) sq.piece.isShielded = true; });
                       audioManager.playShield();
                   }
               } else if (newStreak === 3) {
                   const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                   if (empty.length > 0) {
                       const chosen = empty[Math.floor(Math.random() * empty.length)];
                       chosen.item = { type: 'anvil' };
                       audioManager.playAnvil();
                   }
               } else if (newStreak === 4) {
                   const graveyard = capturedPieces.white;
                   if (graveyard.length > 0) {
                       const pieceToRes = { ...graveyard[graveyard.length-1], level: 1, isShielded: false, id: `res_D_${Date.now()}` };
                       const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                       if (empty.length > 0) {
                           const chosenSq = empty[Math.floor(Math.random() * empty.length)];
                           chosenSq.piece = pieceToRes;
                           setCapturedPieces(prev => ({ ...prev, white: prev.white.slice(0, -1) }));
                           addEffect('light-beam', chosenSq.algebraic);
                           audioManager.playResurrect();
                       }
                   }
               } else if (newStreak === 5 && hasArcher) {
                   const victims = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white' && sq.piece.level === 1 && sq.piece.type !== 'king' && sq.piece.type !== 'queen');
                   if (victims.length > 0) {
                       const victimSq = victims[Math.floor(Math.random() * victims.length)];
                       const captured = { ...victimSq.piece! };
                       nextBoard.flat().forEach(sq => { if (sq.algebraic === victimSq.algebraic) sq.piece = null; });
                       setCapturedPieces(prev => ({ ...prev, black: [...prev.black, captured] }));
                       audioManager.playSnipe();
                       addEffect('poof', victimSq.algebraic);
                   }
               }
             } else {
               audioManager.playMove();
             }
             
             setTimeout(() => {
               setIsAiThinking(false);
               setIsMoveProcessing(false);
               processMoveEnd(nextBoard, 'black', result.extraTurn || newStreak >= 6, result.enPassantTargetSet);
             }, 800);
          } else {
            if (enemyPieces.length === 1) {
                const nextStuck = enemyStuckTurns + 1;
                setEnemyStuckTurns(nextStuck);
                
                if (nextStuck >= 3) {
                    const stuckPos = enemyPieces[0].algebraic;
                    const { row: sR, col: sC } = algebraicToCoords(stuckPos);
                    
                    toast({ title: "Desperate Detonation!", description: "Last enemy trapped! Self-destructing...", variant: "destructive" });
                    
                    const result = applyMove(board, { from: stuckPos, to: stuckPos, type: 'self-destruct' }, enPassantTargetSquare);
                    audioManager.playExplosion();
                    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(sR + dr, sC + dc)) addEffect('explosion', coordsToAlgebraic(sR + dr, sC + dc));
                    
                    setBoard(result.newBoard);
                    if (result.selfDestructCaptures) {
                        setCapturedPieces(prev => ({ ...prev, black: [...prev.black, ...result.selfDestructCaptures!] }));
                    }
                    
                    setTimeout(() => {
                        setIsAiThinking(false);
                        setIsMoveProcessing(false);
                        processMoveEnd(result.newBoard, 'black', false, enPassantTargetSquare);
                    }, 800);
                    return;
                }
            } else {
                setEnemyStuckTurns(0);
            }

            setIsAiThinking(false);
            setIsMoveProcessing(false);
            processMoveEnd(board, 'black', false, enPassantTargetSquare);
          }
        } catch (e) {
          console.error("Dungeon AI Error:", e);
          setIsAiThinking(false);
          setIsMoveProcessing(false);
          processMoveEnd(board, 'black', false, enPassantTargetSquare);
        }
      };
      think();
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, board, processMoveEnd, killStreaks, capturedPieces, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, isPromotingPawn, isAwaitingPawnSacrifice, toast, enPassantTargetSquare, addEffect, enemyStuckTurns]);

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-background p-4 gap-4 overflow-hidden">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Exit Run
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Swords className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold font-pixel text-primary uppercase">Floor {level}</h1>
        </div>
        <div className="w-24"></div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-start justify-center">
        <div className="w-full lg:w-1/2 flex flex-col items-center gap-4">
          <div className={cn("text-center text-sm font-bold min-h-[1.25em] uppercase font-pixel flex items-center justify-center gap-2", gameInfo.isCheck && !gameInfo.gameOver && "animate-pulse text-destructive", isAiThinking && "text-primary")}>
            {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
            {isAwaitingCommanderPromotion ? "SELECT A PAWN TO PROMOTE!" :
             isAwaitingAnvilDrop ? "PLACE AN ANVIL!" :
             isAwaitingHolyShield ? "SELECT AN ALLY TO SHIELD!" :
             isAwaitingArcherSnipe ? "SNIPE A LEVEL 1 ENEMY!" :
             isAwaitingPawnSacrifice ? "SACRIFICE A PAWN FOR THE QUEEN!" :
             isPromotingPawn ? "PROMOTE YOUR PAWN!" :
             isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
          </div>

          <ChessBoard
            boardState={board}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            enemySelectedSquare={null}
            enemyPossibleMoves={[]}
            onSquareClick={handleSquareClick}
            playerColor="white"
            currentPlayerColor={currentPlayer}
            isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking}
            playerInCheck={gameInfo.playerWithKingInCheck}
            viewMode="flipping"
            animatedSquareTo={animatedSquareTo}
            lastMoveFrom={lastMoveFrom}
            lastMoveTo={lastMoveTo}
            isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
            playerToSacrificePawn={playerToSacrificePawn}
            isEnPassantTarget={enPassantTargetSquare}
            onPieceHover={setPieceForInfoDisplay}
            effects={effects}
            promotingSquare={promotionSquare}
            isAwaitingAnvilDrop={isAwaitingAnvilDrop}
            playerToDropAnvil={currentPlayer === 'white' ? 'white' : null}
            isAwaitingHolyShield={isAwaitingHolyShield}
            isAwaitingArcherSnipe={isAwaitingArcherSnipe}
          />
        </div>

        <div className="w-full lg:w-1/4 h-full min-h-[400px]">
          <GameControls
            currentPlayer={currentPlayer}
            capturedPieces={capturedPieces}
            isGameOver={gameInfo.gameOver}
            killStreaks={killStreaks}
            pieceForInfoDisplay={pieceForInfoDisplay}
            localPlayerColor="white"
            getPlayerDisplayName={getPlayerDisplayName}
            onlineStatus="disconnected"
            turnTimer={null}
            activeTimerPlayer={null}
            chatMessages={[]}
            onSendMessage={() => {}}
            isMessengerOpen={false}
            onToggleMessenger={() => {}}
            hasUnreadMessages={false}
          />
          
          {gameInfo.gameOver && (
            <div className="mt-4 space-y-2">
              <Button className="w-full font-bold uppercase" onClick={() => startRun()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry Run
              </Button>
              <Link href="/">
                <Button variant="outline" className="w-full font-bold uppercase">
                  Back to Lobby
                </Button>
              </Link>
            </div>
          )}

          <div className="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-none">
            <p className="text-[9px] font-pixel leading-relaxed">
              <span className="text-primary font-bold">LEGENDARY BOSSES:</span><br/>
              F10: THE HYDRA (Splits)<br/>
              F20: THE NECROMANCER (Resurrects)<br/>
              F30: THE COLOSSUS (Shielded King)<br/>
              F40: THE MIRAGE (Teleports)<br/>
              F50: THE ENTITY (Godlike)
            </p>
          </div>
        </div>
      </div>

      <RulesDialog isOpen={false} onOpenChange={() => {}} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor="white" />
    </div>
  );
}
