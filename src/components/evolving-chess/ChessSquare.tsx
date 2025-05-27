
'use client';

import type { SquareState, ViewMode, PlayerColor, AlgebraicSquare } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface ChessSquareProps {
  squareData: SquareState;
  isLightSquare: boolean;
  isSelected: boolean;
  isPossibleMove: boolean;
  isEnemySelected?: boolean;
  isEnemyPossibleMove?: boolean;
  onClick: (algebraic: SquareState['algebraic']) => void;
  disabled?: boolean;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  animatedSquareTo?: AlgebraicSquare | null; // New prop for animation
}

export function ChessSquare({
  squareData,
  isLightSquare,
  isSelected,
  isPossibleMove,
  isEnemySelected = false,
  isEnemyPossibleMove = false,
  onClick,
  disabled = false,
  isKingInCheck = false,
  viewMode,
  animatedSquareTo, // Destructure new prop
}: ChessSquareProps) {
  const piece = squareData.piece;
  const squareBgColor = isLightSquare ? 'bg-card' : 'bg-muted';

  const isJustMoved = !!(animatedSquareTo && squareData.algebraic === animatedSquareTo && piece);

  return (
    <button
      onClick={() => !disabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center transition-colors duration-150 ease-in-out relative group rounded-none',
        squareBgColor,
        isSelected && !disabled && 'ring-2 ring-inset ring-accent', 
        isPossibleMove && !piece && !disabled && 'bg-accent/40',  
        isPossibleMove && piece && !disabled && 'bg-destructive/60', 
        isEnemySelected && !disabled && 'ring-2 ring-inset ring-blue-600', 
        isEnemyPossibleMove && !piece && !disabled && 'bg-blue-600/30', 
        isEnemyPossibleMove && piece && !disabled && 'bg-yellow-500/50', 
        disabled && 'cursor-not-allowed'
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}${disabled ? ' (interaction disabled)' : ''}${isKingInCheck ? ' (King in check!)' : ''}`}
      disabled={disabled}
    >
      {piece && <ChessPieceDisplay piece={piece} isKingInCheck={isKingInCheck} viewMode={viewMode} isJustMoved={isJustMoved} />}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
