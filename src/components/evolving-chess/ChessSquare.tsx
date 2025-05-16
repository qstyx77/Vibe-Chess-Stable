
'use client';

import type { SquareState } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface ChessSquareProps {
  squareData: SquareState;
  isLightSquare: boolean;
  isSelected: boolean;
  isPossibleMove: boolean;
  onClick: (algebraic: SquareState['algebraic']) => void;
  disabled?: boolean;
  isKingInCheck?: boolean;
}

export function ChessSquare({
  squareData,
  isLightSquare,
  isSelected,
  isPossibleMove,
  onClick,
  disabled = false,
  isKingInCheck = false,
}: ChessSquareProps) {
  const piece = squareData.piece;

  const squareBgColor = isLightSquare ? 'bg-card' : 'bg-muted';

  return (
    <button
      onClick={() => !disabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center transition-colors duration-150 ease-in-out relative group rounded-none',
        squareBgColor,
        isSelected && !disabled && 'ring-2 ring-inset ring-accent',
        isPossibleMove && !piece && !disabled && 'bg-accent/40', 
        isPossibleMove && piece && !disabled && 'bg-destructive/60',
        disabled && 'cursor-not-allowed'
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}${disabled ? ' (game over)' : ''}${isKingInCheck ? ' (King in check!)' : ''}`}
      disabled={disabled}
    >
      {piece && <ChessPieceDisplay piece={piece} isKingInCheck={isKingInCheck} />}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
