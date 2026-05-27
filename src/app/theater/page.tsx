
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { 
  initializeBoard, 
  algebraicToCoords, 
  coordsToAlgebraic,
  isValidSquare,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, PieceType, SquareState, Effect } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, MonitorPlay, ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const PIECE_TYPES: Record<string, PieceType> = {
  'C': 'commander', 'I': 'infiltrator', 'H': 'hero', 'AR': 'archer',
  'AB': 'archbishop', 'PL': 'palace', 'N': 'knight', 'B': 'bishop',
  'R': 'rook', 'Q': 'queen', 'K': 'king', '': 'pawn'
};

interface HistoryStep {
    board: BoardState;
    effect?: { type: Effect['type']; square: AlgebraicSquare; color?: PlayerColor };
    highlight?: string;
    token?: string;
}

export default function TheaterPage() {
  const [vcnInput, setVcnInput] = useState('');
  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [activeEffects, setActiveEffects] = useState<Effect[]>([]);
  const effectCounterRef = useRef(0);

  const currentStep = useMemo(() => {
    if (history.length === 0) return { board: initializeBoard() };
    return history[currentIndex];
  }, [history, currentIndex]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor) => {
    const id = `theatre-eff-${Date.now()}-${Math.random()}-${effectCounterRef.current++}`;
    const newEffect: Effect = { id, type, square, color };
    setActiveEffects(prev => [...prev, newEffect]);
    setTimeout(() => {
        setActiveEffects(current => current.filter(e => e.id !== id));
    }, 1500);
  }, []);

  // Trigger effects when step changes
  useEffect(() => {
    const step = history[currentIndex];
    if (step?.effect) {
        addEffect(step.effect.type, step.effect.square, step.effect.color);
    }
  }, [currentIndex, history, addEffect]);

  const loadGame = () => {
    const steps: HistoryStep[] = [{ board: initializeBoard(), highlight: 'START' }];
    let board = initializeBoard();
    
    // Clean notation: remove turn numbers and ellipses
    const cleaned = vcnInput.replace(/\d+\./g, ' ').replace(/\.\.\./g, ' ');
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);

    let player: PlayerColor = 'white';

    for (const token of tokens) {
      const nextBoard = board.map(row => row.map(sq => ({
        ...sq,
        piece: sq.piece ? { ...sq.piece } : null,
        item: sq.item ? { ...sq.item } : null
      })));

      let effect: HistoryStep['effect'] = undefined;
      let highlight: string = '';

      try {
        if (token.includes('[Spawn]🍄@')) {
          const match = token.match(/@([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].item = { type: 'shroom' };
            highlight = 'SHROOM SPAWNED';
          }
        } else if (token.includes('🛡️')) {
          const match = token.match(/>([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            if (nextBoard[row][col].piece) nextBoard[row][col].piece!.isShielded = true;
            highlight = 'HOLY SHIELD';
          }
        } else if (token.includes('[A]@')) {
          const match = token.match(/@([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].item = { type: 'anvil' };
            highlight = 'ANVIL DROPPED';
          }
        } else if (token.includes('+^')) {
          const match = token.match(/([A-Z]{0,2})\(L(\d)\)@([a-h][1-8])/);
          if (match) {
            const [_, typeKey, levelStr, dest] = match;
            const type = PIECE_TYPES[typeKey] || 'pawn';
            const level = parseInt(levelStr);
            const square = dest as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].piece = { id: `res_${Date.now()}_${Math.random()}`, type, color: player, level, hasMoved: true, isShielded: false };
            effect = { type: 'light-beam', square };
            highlight = 'RESURRECTION';
          }
        } else if (token.includes('[Sacrifice]@')) {
          const match = token.match(/@([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].piece = null;
            highlight = 'QUEEN\'S SACRIFICE';
          }
        } else if (token.includes('[Promo-C]@')) {
          const match = token.match(/@([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            if (nextBoard[row][col].piece) nextBoard[row][col].piece!.type = 'commander';
            highlight = 'COMMANDER PROMOTED';
          }
        } else if (token.includes('!!!')) {
          const match = token.match(/([a-h][1-8])!!!/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].piece = null;
            effect = { type: 'explosion', square };
            highlight = 'SELF-DESTRUCT';
            // Explosion radius removal
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (isValidSquare(row + dr, col + dc)) {
                  const target = nextBoard[row + dr][col + dc];
                  if (target.piece && target.piece.color !== player && target.piece.type !== 'king') {
                    nextBoard[row + dr][col + dc].piece = null;
                  }
                  if (target.item?.type === 'anvil') {
                    nextBoard[row + dr][col + dc].item = null;
                  }
                }
              }
            }
          }
        } else if (token.includes('O-O')) {
          const kingRow = player === 'white' ? 7 : 0;
          const isKingside = !token.includes('O-O-O');
          const oldKingCol = 4;
          const newKingCol = isKingside ? 6 : 2;
          const oldRookCol = isKingside ? 7 : 0;
          const newRookCol = isKingside ? 5 : 3;

          const king = nextBoard[kingRow][oldKingCol].piece;
          const rook = nextBoard[kingRow][oldRookCol].piece;
          if (king && rook) {
              nextBoard[kingRow][newKingCol].piece = { ...king, hasMoved: true };
              nextBoard[kingRow][oldKingCol].piece = null;
              nextBoard[kingRow][newRookCol].piece = { ...rook, hasMoved: true };
              nextBoard[kingRow][oldRookCol].piece = null;
          }
          highlight = isKingside ? 'KINGSIDE CASTLE' : 'QUEENSIDE CASTLE';
        } else if (token.includes('[AR-Snipe]')) {
          const match = token.match(/x([a-h][1-8])/);
          if (match) {
            const square = match[1] as AlgebraicSquare;
            const { row, col } = algebraicToCoords(square);
            nextBoard[row][col].piece = null;
            highlight = 'ARCHER SNIPE';
          }
        } else {
          // Deterministic Move Logic: Piece(Level)Source[x|-]Dest
          const match = token.match(/^([A-Z]{0,2})\(L(\d)\)([a-h][1-8])([x-])([a-h][1-8])/);
          if (match) {
            const [_, typeKey, levelStr, from, sep, to] = match;
            const level = parseInt(levelStr);
            const { row: fromR, col: fromC } = algebraicToCoords(from as AlgebraicSquare);
            const { row: toR, col: toC } = algebraicToCoords(to as AlgebraicSquare);

            const movingPiece = nextBoard[fromR][fromC].piece;
            if (movingPiece) {
              // Consume shroom if landing on one
              if (nextBoard[toR][toC].item?.type === 'shroom') {
                nextBoard[toR][toC].item = null;
                highlight = 'SHROOM CONSUMED';
              }
              // Set the state at destination
              nextBoard[toR][toC].piece = { ...movingPiece, level, hasMoved: true, isShielded: false };
              nextBoard[fromR][fromC].piece = null;
              
              if (sep === 'x') highlight = highlight ? `${highlight} & CAPTURE` : 'CAPTURE';
              if (token.includes('~')) highlight = 'CONVERSION';
              if (token.includes('📢')) highlight = 'RALLYING CRY';
            }
          }
        }
      } catch (e) {
        console.error("VCN Parse Error:", token, e);
      }

      board = nextBoard;
      steps.push({ board, effect, highlight, token });
      
      // Update player turn only if it's NOT an extra turn event or sequential action
      const nonSwitchingTokens = [
        '!!', '[Spawn]🍄@', '[A]@', '🛡️', '[Promo-C]@', '[Sacrifice]@', '+^', '!!!', '[AR-Snipe]'
      ];
      const shouldSwitch = !nonSwitchingTokens.some(t => token.includes(t));
      
      if (shouldSwitch) {
        player = player === 'white' ? 'black' : 'white';
      }
    }
    
    setHistory(steps);
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  useEffect(() => {
    if (isPlaying && currentIndex < history.length - 1) {
      playTimerRef.current = setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 1500);
    } else {
      setIsPlaying(false);
    }
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isPlaying, currentIndex, history.length]);

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-background p-4 gap-4">
      <div className="w-full max-w-4xl flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Exit Theater
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <MonitorPlay className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold font-pixel text-primary uppercase">Theater Mode</h1>
        </div>
        <div className="w-24"></div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl items-start justify-center">
        <div className="w-full lg:w-1/2 flex flex-col items-center gap-4">
          
          <div className="w-full text-center h-8 flex items-center justify-center">
            {currentStep.highlight && (
                <div className="px-3 py-1 bg-primary/20 border border-primary/50 text-primary font-pixel text-[10px] uppercase animate-pulse">
                    {currentStep.highlight}
                </div>
            )}
          </div>

          <ChessBoard
            boardState={currentStep.board}
            selectedSquare={null}
            possibleMoves={[]}
            enemySelectedSquare={null}
            enemyPossibleMoves={[]}
            onSquareClick={() => {}}
            playerColor="white"
            currentPlayerColor="white"
            isInteractionDisabled={true}
            playerInCheck={null}
            viewMode="flipping"
            animatedSquareTo={null}
            lastMoveFrom={null}
            lastMoveTo={null}
            isAwaitingPawnSacrifice={false}
            playerToSacrificePawn={null}
            isEnPassantTarget={null}
            onPieceHover={() => {}}
            promotingSquare={null}
            isAwaitingAnvilDrop={false}
            playerToDropAnvil={null}
            effects={activeEffects}
          />
          
          <div className="flex items-center gap-4 bg-card p-3 border rounded-none">
            <Button variant="outline" size="icon" onClick={() => setCurrentIndex(0)} disabled={currentIndex === 0}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button 
              variant="default" 
              size="icon" 
              className="h-12 w-12"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={history.length === 0}
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentIndex(prev => Math.min(history.length - 1, prev + 1))} disabled={currentIndex === history.length - 1}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="text-xs font-pixel text-muted-foreground w-20 text-center">
              {currentIndex} / {Math.max(0, history.length - 1)}
            </div>
          </div>
        </div>

        <Card className="w-full lg:w-1/3 rounded-none border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm font-pixel text-center uppercase">Load Game Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Paste Vibe Chess Notation (VCN) here..."
              className="h-64 font-mono text-[10px] resize-none leading-tight"
              value={vcnInput}
              onChange={(e) => setVcnInput(e.target.value)}
            />
            <Button className="w-full font-bold uppercase" onClick={loadGame}>
              <Send className="mr-2 h-4 w-4" /> Reconstruct Match
            </Button>
            <p className="text-[10px] text-muted-foreground text-center italic">
              Theater Mode now supports full mechanic tracking and visual effects.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
