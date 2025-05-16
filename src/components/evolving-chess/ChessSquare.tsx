'use client';

import type { SquareState, Piece } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface ChessSquareProps {
  squareData: SquareState;
  isLightSquare: boolean;
  isSelected: boolean;
  isPossibleMove: boolean;
  isSuggestedMove: boolean;
  onClick: (algebraic: SquareState['algebraic']) => void;
}

export function ChessSquare({
  squareData,
  isLightSquare,
  isSelected,
  isPossibleMove,
  isSuggestedMove,
  onClick,
}: ChessSquareProps) {
  const piece = squareData.piece;

  return (
    <button
      onClick={() => onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center transition-colors duration-150 ease-in-out relative group',
        isLightSquare ? 'bg-muted/50' : 'bg-secondary/30',
        isSelected && 'ring-2 ring-accent ring-inset shadow-inner',
        isPossibleMove && !piece && 'bg-accent/30',
        isPossibleMove && piece && 'bg-destructive/30',
        isSuggestedMove && 'outline outline-2 outline-offset-[-2px] outline-blue-500'
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}`}
    >
      {piece && <ChessPieceDisplay piece={piece} />}
      <span className="absolute bottom-0 left-0.5 text-xs text-muted-foreground opacity-50 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 text-[0.6rem] text-muted-foreground opacity-30 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
