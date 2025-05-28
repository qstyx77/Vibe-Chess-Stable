
'use client';

import type { SquareState, ViewMode, AlgebraicSquare, PlayerColor } from '@/types';
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
  animatedSquareTo?: AlgebraicSquare | null;
  currentPlayerColor?: PlayerColor;
  isLastMoveFrom?: boolean; // Added
  isLastMoveTo?: boolean;   // Added
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
  animatedSquareTo,
  currentPlayerColor,
  isLastMoveFrom, // Destructure
  isLastMoveTo,   // Destructure
}: ChessSquareProps) {
  const piece = squareData.piece;

  const isJustMoved = !!(animatedSquareTo && squareData.algebraic === animatedSquareTo && piece);

  let currentBgClass = isLightSquare ? 'bg-card' : 'bg-muted'; // Default

  if (isLastMoveFrom || isLastMoveTo) {
      currentBgClass = 'bg-yellow-300/40'; // Soft yellow highlight for last move
  }

  // Possible move highlights will override last move highlight if applicable
  if (isPossibleMove && !piece && !disabled) currentBgClass = 'bg-accent/40';
  if (isPossibleMove && piece && !disabled) currentBgClass = 'bg-destructive/60';
  if (isEnemyPossibleMove && !piece && !disabled) currentBgClass = 'bg-blue-600/30';
  if (isEnemyPossibleMove && piece && !disabled) currentBgClass = 'bg-yellow-500/50';


  const selectionRingClass = isSelected && !disabled ? 'ring-2 ring-inset ring-accent' 
                           : isEnemySelected && !disabled ? 'ring-2 ring-inset ring-blue-600' 
                           : '';

  return (
    <button
      onClick={() => !disabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center relative group rounded-none transform-style-preserve-3d transform-gpu',
        currentBgClass, 
        selectionRingClass,
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

