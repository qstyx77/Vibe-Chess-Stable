
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const PIECE_TYPES: Record<string, PieceType> = {
  'C': 'commander', 'I': 'infiltrator', 'H': 'hero', 'AR': 'archer',
  'AB': 'archbishop', 'PL': 'palace', 'N': 'knight', 'B': 'bishop',
  'R': 'rook', 'Q': 'queen', 'K': 'king', '': 'pawn'
};

export default function TheaterPage() {
  const [vcnInput, setVcnInput] = useState('');
  const [history, setHistory] = useState<BoardState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentBoard = useMemo(() => {
    if (history.length === 0) return initializeBoard();
    return history[currentIndex];
  }, [history, currentIndex]);

  const loadGame = () => {
    const snapshots: BoardState[] = [initializeBoard()];
    let board = initializeBoard();
    
    // Clean notation: remove turn numbers and "..." markers
    const cleaned = vcnInput.replace(/\d+\./g, '').replace(/\.\.\./g, '');
    const tokens = cleaned.split(/\s+/).filter(t => t.length > 0);

    let player: PlayerColor = 'white';

    for (const token of tokens) {
      const nextBoard = board.map(row => row.map(sq => ({
        ...sq,
        piece: sq.piece ? { ...sq.piece } : null,
        item: sq.item ? { ...sq.item } : null
      })));

      try {
        if (token.startsWith('🛡️')) {
          const dest = token.slice(2) as AlgebraicSquare;
          const { row, col } = algebraicToCoords(dest);
          if (nextBoard[row][col].piece) nextBoard[row][col].piece!.isShielded = true;
        } else if (token.includes('[A]@')) {
          const dest = token.split('@')[1] as AlgebraicSquare;
          const { row, col } = algebraicToCoords(dest);
          nextBoard[row][col].item = { type: 'anvil' };
        } else if (token.includes('+^')) {
          const parts = token.split(' ');
          const dest = parts[parts.length-1] as AlgebraicSquare;
          const { row, col } = algebraicToCoords(dest);
          nextBoard[row][col].piece = { id: `res_${Date.now()}`, type: 'pawn', color: player, level: 1, hasMoved: true };
        } else if (token.includes('!!!')) {
          const dest = token.split('@')[1] as AlgebraicSquare;
          const { row, col } = algebraicToCoords(dest);
          nextBoard[row][col].piece = null;
        } else {
          // Move logic: [Piece](L#)[x]Dest
          const match = token.match(/^([A-Z]{0,2})\(L(\d)\)(x?)([a-h][1-8])/);
          if (match) {
            const [_, typeKey, levelStr, isCapture, dest] = match;
            const type = PIECE_TYPES[typeKey] || 'pawn';
            const level = parseInt(levelStr);
            const { row: toR, col: toC } = algebraicToCoords(dest as AlgebraicSquare);
            
            // Find most likely piece
            let fromR = -1, fromC = -1;
            for (let r = 0; r < 8; r++) {
              for (let c = 0; c < 8; c++) {
                const p = nextBoard[r][c].piece;
                if (p && p.color === player && p.type === type && p.level === level) {
                  fromR = r; fromC = c; break; 
                }
              }
              if (fromR !== -1) break;
            }

            if (fromR !== -1) {
              const movingPiece = nextBoard[fromR][fromC].piece!;
              nextBoard[toR][toC].piece = { ...movingPiece, hasMoved: true, isShielded: false };
              nextBoard[fromR][fromC].piece = null;
            }
          }
        }
      } catch (e) {
        console.error("VCN Parse Error:", token, e);
      }

      board = nextBoard;
      snapshots.push(board);
      
      // Turn alternation (unless extra turn marker found)
      if (!token.includes('!!')) {
        player = player === 'white' ? 'black' : 'white';
      }
    }
    
    setHistory(snapshots);
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
          <ChessBoard
            boardState={currentBoard}
            selectedSquare={null}
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
              Theater Mode uses a simplified rendering engine. Some visual effects may be approximated.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
