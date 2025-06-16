
'use client';

import type { SquareState, ViewMode, AlgebraicSquare, PlayerColor, Item } from '@/types';
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
  isCommanderPromoTarget?: boolean;
  isAwaitingCommanderPromotion?: boolean;
  playerToPromoteCommander?: PlayerColor | null;
  isEnPassantTarget?: boolean;
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
  isLastMoveFrom,
  isLastMoveTo,
  isSacrificeTarget = false,
  isAwaitingPawnSacrifice = false,
  playerToSacrificePawn = null,
  isCommanderPromoTarget = false,
  isAwaitingCommanderPromotion = false,
  playerToPromoteCommander = null,
  isEnPassantTarget = false,
}: ChessSquareProps) {
  const piece = squareData.piece;
  const item = squareData.item;

  const isJustMoved = !!(animatedSquareTo && squareData.algebraic === animatedSquareTo && piece);

  let currentBgClass = isLightSquare ? 'bg-card' : 'bg-muted';

  if (isLastMoveFrom || isLastMoveTo) {
      currentBgClass = 'bg-yellow-300/40';
  }

  if (isPossibleMove && (!piece || item?.type === 'shroom') && !disabled) {
    currentBgClass = 'bg-accent/40';
  }
  if (isPossibleMove && piece && item?.type !== 'shroom' && !disabled) {
    currentBgClass = 'bg-destructive/60';
  }

  if (isEnemyPossibleMove && !piece && !item && !disabled) currentBgClass = 'bg-blue-600/30';
  if (isEnemyPossibleMove && piece && !item && !disabled) currentBgClass = 'bg-yellow-500/50';

  if (isEnPassantTarget && isPossibleMove && !piece) { 
    currentBgClass = 'bg-purple-400/50';
  }


  let selectionRingClass = '';
  if (isCommanderPromoTarget) {
    selectionRingClass = 'ring-4 ring-inset ring-green-400 animate-pulse';
  } else if (isAwaitingPawnSacrifice && piece && (piece.type === 'pawn' || piece.type === 'commander') && piece.color === playerToSacrificePawn) {
    selectionRingClass = 'ring-4 ring-inset ring-cyan-400 animate-pulse';
  } else if (isSelected && !disabled) {
    selectionRingClass = 'ring-2 ring-inset ring-accent';
  } else if (isEnemySelected && !disabled) {
    selectionRingClass = 'ring-2 ring-inset ring-blue-600';
  }

  const effectiveDisabled = disabled && !isSacrificeTarget && !isCommanderPromoTarget;


  return (
    <button
      onClick={() => !effectiveDisabled && onClick(squareData.algebraic)}
      className={cn(
        'w-full aspect-square flex items-center justify-center relative group rounded-none transform-style-preserve-3d transform-gpu',
        currentBgClass,
        selectionRingClass,
        effectiveDisabled && 'cursor-not-allowed',
        item && item.type !== 'shroom' && 'cursor-not-allowed' 
      )}
      aria-label={`Square ${squareData.algebraic}${piece ? `, contains ${piece.color} ${piece.type}` : ''}${item ? `, contains ${item.type}` : ''}${effectiveDisabled || (item && item.type !== 'shroom') ? ' (interaction disabled)' : ''}${isKingInCheck ? ' (King in check!)' : ''}${isSacrificeTarget ? ' (Sacrifice target!)' : ''}${isCommanderPromoTarget ? ' (Commander promotion target!)' : ''}${isEnPassantTarget ? ' (En Passant target)' : ''}`}
      disabled={effectiveDisabled || (!!item && item.type !== 'shroom')}
    >
      {item && item.type === 'anvil' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span className="text-4xl md:text-5xl opacity-50" role="img" aria-label="anvil">🧱</span>
        </div>
      )}
      {item && item.type === 'shroom' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <span className="text-4xl md:text-5xl opacity-70" role="img" aria-label="shroom">🍄</span>
        </div>
      )}
      {piece && (
        <div className="relative z-10 w-full h-full">
          <ChessPieceDisplay
            piece={piece}
            isKingInCheck={isKingInCheck}
            viewMode={viewMode}
            isJustMoved={isJustMoved}
            isSacrificeTarget={isAwaitingPawnSacrifice && piece && (piece.type === 'pawn' || piece.type === 'commander') && piece.color === playerToSacrificePawn}
            isCommanderPromoTarget={isCommanderPromoTarget}
          />
        </div>
      )}
      <span className="absolute bottom-0.5 left-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 group-hover:opacity-100 md:hidden z-20">
        {squareData.algebraic}
      </span>
       <span className="absolute top-0.5 right-0.5 font-pixel text-[8px] text-muted-foreground/70 opacity-70 hidden md:block z-20">
        {squareData.algebraic}
      </span>
    </button>
  );
}
