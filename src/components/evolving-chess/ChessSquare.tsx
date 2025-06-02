
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
  isLastMoveFrom?: boolean;
  isLastMoveTo?: boolean;
  isSacrificeTarget?: boolean;
  isAwaitingPawnSacrifice?: boolean;
  playerToSacrificePawn?: PlayerColor | null;
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
  isLastMoveFrom,
  isLastMoveTo,
  isSacrificeTarget = false,
  isAwaitingPawnSacrifice = false,
  playerToSacrificePawn = null,
}: ChessSquareProps) {
  const piece = squareData.piece;
  // Item rendering logic removed

  const isJustMoved = !!(animatedSquareTo && squareData.algebraic === animatedSquareTo && piece);

  let currentBgClass = isLightSquare ? 'bg-card' : 'bg-muted';

  if (isLastMoveFrom || isLastMoveTo) {
      currentBgClass = 'bg-yellow-300/40';
  }

  if (isPossibleMove && !piece && !disabled) currentBgClass = 'bg-accent/40';
  if (isPossibleMove && piece && !disabled) currentBgClass = 'bg-destructive/60';
  if (isEnemyPossibleMove && !piece && !disabled) currentBgClass = 'bg-blue-600/30';
  if (isEnemyPossibleMove && piece && !disabled) currentBgClass = 'bg-yellow-500/50';


  let selectionRingClass = '';
  if (isAwaitingPawnSacrifice && piece?.type === 'pawn' && piece?.color === playerToSacrificePawn) {
    selectionRingClass = 'ring-4 ring-inset ring-cyan-400 animate-pulse';
  } else if (isSelected && !disabled) {
    selectionRingClass = 'ring-2 ring-inset ring-accent';
  } else if (isEnemySelected && !disabled) {
    selectionRingClass = 'ring-2 ring-inset ring-blue-600';
  }

  const effectiveDisabled = disabled && !(isAwaitingPawnSacrifice && piece?.type === 'pawn' && piece?.color === playerToSacrificePawn);


  return (
    <button
      onClick={() => !effectiveDisabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center relative group rounded-none transform-style-preserve-3d transform-gpu',
        currentBgClass,
        selectionRingClass,
        effectiveDisabled && 'cursor-not-allowed'
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}${effectiveDisabled ? ' (interaction disabled)' : ''}${isKingInCheck ? ' (King in check!)' : ''}${isSacrificeTarget ? ' (Sacrifice target!)' : ''}`}
      disabled={effectiveDisabled}
    >
      {piece && <ChessPieceDisplay
                  piece={piece}
                  isKingInCheck={isKingInCheck}
                  viewMode={viewMode}
                  isJustMoved={isJustMoved}
                  isSacrificeTarget={isAwaitingPawnSacrifice && piece.type === 'pawn' && piece.color === playerToSacrificePawn}
                />}
      {/* Item rendering removed from here */}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
