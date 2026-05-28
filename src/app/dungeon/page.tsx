'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  getCastlingRightsString,
  boardToPositionHash,
  isValidSquare,
  processRookResurrectionCheck,
  type RookResurrectionResult,
  spawnShroom,
  applyArchbishop,
  applyPalace,
  applyArcher,
  findKing,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, ViewMode, Effect, ResurrectedSquareInfo } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Swords, ArrowLeft, Trophy, Skull, BrainCircuit } from 'lucide-react';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    const pieceCount = Math.min(16, 4 + Math.floor(level / 2));
    const avgLevel = Math.max(1, Math.floor(level / 5));
    for (let i = 0; i < pieceCount; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const types: PieceType[] = ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook'];
      const type = level < 5 ? 'pawn' : types[Math.floor(Math.random() * types.length)];
      board[r][c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: avgLevel + (Math.random() > 0.7 ? 1 : 0), hasMoved: false, isShielded: false };
    }
  }

  return board;
}

export default function DungeonPage() {
  const { userData } = useUser();
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
  
  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);

  const startRun = useCallback(() => {
    let army: Piece[] = [];
    const initial = initializeBoard();
    if (userData) {
      if (userData.eloRating >= 1500) applyArchbishop(initial, 'white');
      if (userData.eloRating >= 1800) applyPalace(initial, 'white');
      if (userData.eloRating >= 2100) applyArcher(initial, 'white');
    }
    initial.flat().forEach(sq => {
      if (sq.piece && sq.piece.color === 'white') army.push(sq.piece);
    });
    
    setPlayerArmy(army);
    setLevel(1);
    const newBoard = generateDungeonFloor(1, army);
    setBoard(newBoard);
    setGameInfo({ message: "Level 1 - Clear the board!", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    setCapturedPieces({ white: [], black: [] });
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    aiInstance.current = new VibeChessAI(4);
    audioManager.playStart();
  }, [userData]);

  useEffect(() => {
    if (!board.length) startRun();
  }, [startRun, board.length]);

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
    setCapturedPieces({ white: [], black: [] });
    setCurrentPlayer('white');
    setKillStreaks({ white: 0, black: 0 });
    setGameInfo({ message: `Level ${nextLevel} - Wipe them out!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    toast({ title: "Level Up!", description: `Descending to Floor ${nextLevel}...` });
    audioManager.playLevelUp();
  }, [board, level, toast]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number) => {
    const id = `eff-${Date.now()}-${Math.random()}`;
    setEffects(prev => [...prev, { id, type, square, color, value }]);
    setTimeout(() => setEffects(curr => curr.filter(e => e.id !== id)), 1500);
  }, []);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    return player === 'white' ? 'Hero' : 'Dungeon';
  }, []);

  const processMoveEnd = useCallback((boardAfter: BoardState, turnPlayer: PlayerColor, extra: boolean) => {
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    
    const enemyCount = boardAfter.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    if (enemyCount === 0) {
      advanceLevel();
      return;
    }

    const playerKing = findKing(boardAfter, 'white');
    if (!playerKing || isCheckmate(boardAfter, 'white', null)) {
      setGameInfo(prev => ({ ...prev, message: "YOUR KING HAS FALLEN", gameOver: true, winner: 'black' }));
      return;
    }

    setCurrentPlayer(nextP);
  }, [advanceLevel]);

  const handleSquareClick = (algebraic: AlgebraicSquare) => {
    if (clickGuard.current || gameInfo.gameOver || isPromotingPawn) return;

    const { row, col } = algebraicToCoords(algebraic);
    const sq = board[row][col];
    
    if (selectedSquare) {
      if (possibleMoves.includes(algebraic)) {
        setIsMoveProcessing(true);
        clickGuard.current = true;
        setAnimatedSquareTo(algebraic);
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);

        const result = applyMove(board, { from: selectedSquare, to: algebraic }, null);
        const { newBoard, capturedPiece } = result;

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

        if (currentPlayer === 'white' && level === 40) {
           const mirage = newBoard.flat().find(sq => sq.piece?.id === 'boss-mirage');
           if (mirage && Math.random() < 0.3) {
             const empty = [];
             for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!newBoard[r][c].piece) empty.push({r, c});
             if (empty.length) {
               const pos = empty[Math.floor(Math.random()*empty.length)];
               const {row: or, col: oc} = algebraicToCoords(mirage.algebraic);
               newBoard[pos.r][pos.c].piece = newBoard[or][oc].piece;
               newBoard[or][oc].piece = null;
               addEffect('poof', mirage.algebraic);
               addEffect('light-beam', coordsToAlgebraic(pos.r, pos.c));
               toast({ title: "Mirage Blink!", description: "The phantom Queen vanishes!" });
             }
           }
        }

        if (capturedPiece) {
          audioManager.playCapture();
          setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...prev[currentPlayer], capturedPiece] }));
          setKillStreaks(prev => ({ ...prev, [currentPlayer]: prev[currentPlayer] + 1 }));
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
          processMoveEnd(newBoard, currentPlayer, result.extraTurn);
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
    if (currentPlayer === 'black' && !gameInfo.gameOver && !isMoveProcessing && !isAiThinking && aiInstance.current) {
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
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, isAiThinking, board, processMoveEnd, killStreaks, capturedPieces]);

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
          <div className={cn("text-center text-sm font-bold min-h-[1.25em] uppercase font-pixel flex items-center gap-2", gameInfo.gameOver && "animate-pulse text-destructive", isAiThinking && "text-primary")}>
            {isAiThinking && <BrainCircuit className="h-4 w-4 animate-spin" />}
            {isAiThinking ? "Dungeon is thinking..." : gameInfo.message}
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
            isAwaitingAnvilDrop={false}
            playerToDropAnvil={null}
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
              F10: THE HYDRA<br/>
              F20: THE NECROMANCER<br/>
              F30: THE COLOSSUS<br/>
              F40: THE MIRAGE<br/>
              F50: THE ENTITY
            </p>
          </div>
        </div>
      </div>

      <RulesDialog isOpen={false} onOpenChange={() => {}} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={() => {}} pawnColor="white" />
    </div>
  );
}
