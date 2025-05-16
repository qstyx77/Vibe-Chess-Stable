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

  // For 8-bit, we want solid distinct colors.
  // Light squares: e.g., a lighter shade from the theme (card or muted foreground)
  // Dark squares: e.g., background or a darker muted color
  const squareBgColor = isLightSquare ? 'bg-card' : 'bg-muted'; // Muted is darker in new theme

  return (
    <button
      onClick={() => onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center transition-colors duration-150 ease-in-out relative group rounded-none', // ensure no rounding
        squareBgColor,
        isSelected && 'ring-2 ring-inset ring-accent', // Ring will be sharp due to 0rem radius
        isPossibleMove && !piece && 'bg-accent/40', // Lighter accent for empty possible squares
        isPossibleMove && piece && 'bg-destructive/60', // More prominent destructive for captures
        isSuggestedMove && 'outline outline-2 outline-offset-[-2px] outline-primary' // Use primary for suggestion outline
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}`}
    >
      {piece && <ChessPieceDisplay piece={piece} />}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
