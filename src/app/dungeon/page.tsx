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
    
    // Choose a procedural formation
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

    // Shuffle and pick squares
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
  
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);

  // Special action states
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [specialActionContext, setSpecialActionContext] = useState<any>(null);

  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);
  const moveCounter = useRef(0);

  const startRun = useCallback(() => {
    let army: Piece[] = [];
    let initial = initializeBoard();
    
    // Apply ELO pieces based on global profile stats
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
    setGameInfo({ message: "Level 1 - Wipe them out!", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    setCapturedPieces({ white: [], black: [] });
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    
    const hasCommander = army.some(p => p.type === 'commander' || p.type === 'hero');
    setFirstBloodAchieved(hasCommander);
    setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
    
    aiInstance.current = new VibeChessAI(4);
    audioManager.playStart();
  }, [userData]);

  useEffect(() => {
    if (!board.length && !isUserLoading) startRun();
  }, [startRun, board.length, isUserLoading]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => setEffects(curr => curr.filter(e => e.id !== id)), 1500);
  }, []);

  const advanceLevel = useCallback(() => {
    const survivors = board.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const nextLevel = level + 1;
    
    if (nextLevel > 50) {
      setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' }));
      return;
    }

    setLevel(nextLevel);
    setPlayerArmy(survivors);
    const newBoard = generateDungeonFloor(nextLevel, survivors);
    setBoard(newBoard);
    
    // Reset only the Enemy Captured Pieces (player's kills), keep the Allied Graveyard persistent
    setCapturedPieces(prev => ({ white: [], black: prev.black }));
    
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    
    const hasCommander = survivors.some(p => p.type === 'commander' || p.type === 'hero');
    setFirstBloodAchieved(hasCommander);
    setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);

    setGameInfo({ message: `Level ${nextLevel} - Wipe them out!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    toast({ title: "Level Up!", description: `Descending to Floor ${nextLevel}...` });
    audioManager.playLevelUp();
  }, [board, level, toast]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    return player === 'white' ? 'Hero' : 'Dungeon';
  }, []);

  const processMoveEnd = useCallback((boardAfter: BoardState, turnPlayer: PlayerColor, extra: boolean) => {
    let nextBoard = boardAfter;
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    
    // Check floor clear
    const enemyCount = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    if (enemyCount === 0) {
      advanceLevel();
      return;
    }

    // Mushroom Spawning
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

    // Necromancer (Floor 20) mechanic: resurrect every 5 turns
    if (nextP === 'black' && level === 20 && moveCounter.current % 10 === 0) {
        const necromancer = nextBoard.flat().find(sq => sq.piece?.id === 'boss-necro');
        if (necromancer) {
            const fallen = capturedPieces.white; 
            if (fallen.length > 0) {
                const empty = [];
                for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!nextBoard[r][c].piece && !nextBoard[r][c].item) empty.push({r,c});
                if (empty.length) {
                    const pos = empty[Math.floor(Math.random()*empty.length)];
                    const p = fallen[fallen.length-1];
                    nextBoard[pos.r][pos.c].piece = { ...p, color: 'black', level: 1, id: `nec-${Date.now()}` };
                    addEffect('light-beam', coordsToAlgebraic(pos.r, pos.c));
                    audioManager.playResurrect();
                    toast({ title: "Necromancy!", description: "The boss resurrects a minion!" });
                    setBoard([...nextBoard]);
                }
            }
        }
    }

    // Check player defeat
    const playerKing = findKing(nextBoard, 'white');
    if (!playerKing || isCheckmate(nextBoard, 'white', null)) {
      setGameInfo({ 
        message: "YOUR KING HAS FALLEN", 
        isCheck: true, 
        playerWithKingInCheck: 'white', 
        isCheckmate: true, 
        isStalemate: false, 
        gameOver: true, 
        winner: 'black' 
      });
      return;
    }

    // Recognize Check for the current turn player
    const inCheck = isKingInCheck(nextBoard, nextP, null);
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
  }, [advanceLevel, capturedPieces.white, level, toast, addEffect, shroomSpawnCounter, nextShroomSpawnTurn]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver) return;

    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    const piece = sq.piece;

    // Display piece info on click
    setPieceForInfoDisplay(piece || null);

    // Special Action Handlers
    if (isAwaitingArcherSnipe) {
        if (piece && piece.color === 'black' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            nextBoard[row][col].piece = null;
            setBoard(nextBoard);
            setCapturedPieces(prev => ({ ...prev, white: [...prev.white, piece] }));
            setIsAwaitingArcherSnipe(false);
            audioManager.playSnipe();
            processMoveEnd(nextBoard, 'white', specialActionContext.extra);
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
            processMoveEnd(nextBoard, 'white', specialActionContext.extra);
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
            processMoveEnd(nextBoard, 'white', specialActionContext.extra);
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
            processMoveEnd(nextBoard, 'white', false);
        }
        return;
    }

    if (selectedSquare) {
      if (possibleMoves.includes(algebraic)) {
        setIsMoveProcessing(true);
        clickGuard.current = true;
        setAnimatedSquareTo(algebraic);
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        moveCounter.current++;

        const result = applyMove(board, { from: selectedSquare, to: algebraic }, null);
        const { newBoard, capturedPiece, shroomConsumed } = result;

        if (shroomConsumed) {
            audioManager.playShroom();
            audioManager.playLevelUp();
            const movedP = newBoard[row][col].piece;
            toast({ title: "Level Up!", description: `${movedP?.type} consumed a Shroom 🍄 and leveled up to L${movedP?.level}!` });
        }

        if (result.rallyCryTriggered) addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color);
        if (result.conversionEvents.length > 0) result.conversionEvents.forEach(e => addEffect('conversion', e.at, e.byPiece.color));

        if (capturedPiece?.id === 'boss-hydra') {
           const empty = [];
           for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
             const nr = row+dr, nc = col+dc;
             if(isValidSquare(nr,nc) && !newBoard[nr][nc].piece) empty.push({r:nr, c:nc});
           }
           empty.slice(0,2).forEach((pos, i) => {
             newBoard[pos.r][pos.c].piece = { id: `hydra-child-${i}-${Date.now()}`, type: 'knight', color: 'black', level: 2, hasMoved: true, isShielded: false };
             addEffect('light-beam', coordsToAlgebraic(pos.r, pos.c));
           });
           toast({ title: "Hydra Split!", description: "The beast splits into two knights!" });
        }

        let firstBloodThisTurn = false;
        let triggeredStreakAction = false;

        if (capturedPiece) {
          audioManager.playCapture();
          setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...prev[currentPlayer], capturedPiece] }));
          
          const newStreak = (killStreaks[currentPlayer] || 0) + 1;
          setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreak }));
          
          if (currentPlayer === 'white') {
              if (!firstBloodAchieved) {
                  firstBloodThisTurn = true;
              }
              
              if (newStreak === 2 && newBoard.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === 'white')) {
                  triggeredStreakAction = true;
                  setTimeout(() => {
                      setIsAwaitingHolyShield(true);
                      setSpecialActionContext({ extra: result.extraTurn });
                  }, 800);
              } else if (newStreak === 3) {
                  triggeredStreakAction = true;
                  setTimeout(() => {
                      setIsAwaitingAnvilDrop(true);
                      setSpecialActionContext({ extra: result.extraTurn });
                  }, 800);
              } else if (newStreak === 5 && newBoard.flat().some(sq => sq.piece?.type === 'archer' && sq.piece.color === 'white')) {
                  triggeredStreakAction = true;
                  setTimeout(() => {
                      setIsAwaitingArcherSnipe(true);
                      setSpecialActionContext({ extra: result.extraTurn });
                  }, 800);
              }
          }
        } else {
          audioManager.playMove();
          setKillStreaks(prev => ({ ...prev, [currentPlayer]: 0 }));
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
              const hasLevel1Pawn = newBoard.flat().some(sq => sq.piece?.color === 'white' && sq.piece.type === 'pawn' && sq.piece.level === 1);
              if (hasLevel1Pawn) {
                  setIsAwaitingCommanderPromotion(true);
                  return;
              }
          }

          if (!triggeredStreakAction) {
              processMoveEnd(newBoard, currentPlayer, result.extraTurn);
          }
        }, 800);
        return;
      }
    }

    if (sq.piece?.color === currentPlayer) {
      setSelectedSquare(algebraic);
      setPossibleMoves(getPossibleMoves(board, algebraic, null));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  useEffect(() => {
    const isSpecialActionActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isAwaitingHolyShield || isAwaitingArcherSnipe;
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
          enPassantTargetSquare: null,
          gameOver: false,
          firstBloodAchieved: true,
          playerWhoGotFirstBlood: 'white'
        };
        
        try {
          const best = aiInstance.current!.getBestMove(stateForAi, 'black');
          if (best.move) {
             const from = coordsToAlgebraic(best.move.from[0], best.move.from[1]);
             const to = coordsToAlgebraic(best.move.to[0], best.move.to[1]);
             setLastMoveFrom(from);
             setLastMoveTo(to);
             setAnimatedSquareTo(to);
             
             const result = applyMove(board, { from, to, type: best.move.type as any, promoteTo: best.move.promoteTo }, null);
             setBoard(result.newBoard);
             
             if (result.shroomConsumed) {
                audioManager.playShroom();
                audioManager.playLevelUp();
                const movedP = result.newBoard[to[0]][to[1]].piece;
                toast({ title: "Enemy Level Up!", description: `Dungeon ${movedP?.type} consumed a Shroom 🍄!` });
             }

             if (result.capturedPiece) {
               audioManager.playCapture();
               setCapturedPieces(prev => ({ ...prev, black: [...prev.black, result.capturedPiece!] }));
               setKillStreaks(prev => ({ ...prev, black: prev.black + 1 }));
             } else {
               audioManager.playMove();
               setKillStreaks(prev => ({ ...prev, black: 0 }));
             }
             
             setTimeout(() => {
               setIsAiThinking(false);
               setIsMoveProcessing(false);
               processMoveEnd(result.newBoard, 'black', result.extraTurn);
             }, 800);
          } else {
            setIsAiThinking(false);
            setIsMoveProcessing(false);
            processMoveEnd(board, 'black', false);
          }
        } catch (e) {
          console.error("Dungeon AI Error:", e);
          setIsAiThinking(false);
          setIsMoveProcessing(false);
          processMoveEnd(board, 'black', false);
        }
      };
      think();
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, board, processMoveEnd, killStreaks, capturedPieces, isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield, isAwaitingArcherSnipe, toast]);

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
            isAwaitingPawnSacrifice={false}
            playerToSacrificePawn={null}
            isEnPassantTarget={null}
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
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={() => {}} pawnColor="white" />
    </div>
  );
}