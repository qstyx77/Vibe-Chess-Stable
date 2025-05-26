
'use client';

import type { SquareState, ViewMode, PlayerColor } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface ChessSquareProps {
  squareData: SquareState;
  isLightSquare: boolean;
  isSelected: boolean; // For current player's selected piece
  isPossibleMove: boolean; // For current player's possible moves
  isEnemySelected?: boolean; // New: For selected enemy piece
  isEnemyPossibleMove?: boolean; // New: For enemy's possible moves
  onClick: (algebraic: SquareState['algebraic']) => void;
  disabled?: boolean;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
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
}: ChessSquareProps) {
  const piece = squareData.piece;
  const squareBgColor = isLightSquare ? 'bg-card' : 'bg-muted';

  // Determine if the enemy's possible move is a capture of the player's piece
  // This requires knowing the color of the piece on the enemySelectedSquare.
  // For now, we'll assume if isEnemyPossibleMove and 'piece' exists, it's a potential capture by enemy.
  // A more robust way would be to pass the enemy piece's color.

  return (
    <button
      onClick={() => !disabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center transition-colors duration-150 ease-in-out relative group rounded-none',
        squareBgColor,
        // Player's selection and moves
        isSelected && !disabled && 'ring-2 ring-inset ring-accent', // Player selected piece
        isPossibleMove && !piece && !disabled && 'bg-accent/40',  // Player move to empty
        isPossibleMove && piece && !disabled && 'bg-destructive/60', // Player capture

        // Enemy's selection and moves
        isEnemySelected && !disabled && 'ring-2 ring-inset ring-blue-600', // Enemy selected piece
        isEnemyPossibleMove && !piece && !disabled && 'bg-blue-600/30', // Enemy move to empty
        isEnemyPossibleMove && piece && !disabled && 'bg-yellow-500/50', // Enemy potential capture of any piece on square

        disabled && 'cursor-not-allowed'
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}${disabled ? ' (interaction disabled)' : ''}${isKingInCheck ? ' (King in check!)' : ''}`}
      disabled={disabled}
    >
      {piece && <ChessPieceDisplay piece={piece} isKingInCheck={isKingInCheck} viewMode={viewMode} />}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block">
        {squareData.algebraic}
      </span>
    </button>
  );
}
