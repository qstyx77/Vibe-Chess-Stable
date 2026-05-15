
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode, Piece, Effect } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';
import { algebraicToCoords } from '@/lib/chess-utils';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves?: AlgebraicSquare[];
  enemySelectedSquare: AlgebraicSquare | null;
  enemyPossibleMoves?: AlgebraicSquare[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: PlayerColor;
  currentPlayerColor: PlayerColor;
  isInteractionDisabled: boolean;
  playerInCheck: PlayerColor | null;
  viewMode: ViewMode;
  animatedSquareTo: AlgebraicSquare | null;
  applyBoardOpacityEffect?: boolean;
  lastMoveFrom: AlgebraicSquare | null;
  lastMoveTo: AlgebraicSquare | null;
  isAwaitingPawnSacrifice: boolean;
  playerToSacrificePawn: PlayerColor | null;
  isAwaitingCommanderPromotion?: boolean;
  playerToPromoteCommander?: PlayerColor | null;
  isEnPassantTarget: AlgebraicSquare | null;
  onPieceHover: (piece: Piece | null) => void;
  effects?: Effect[];
  promotingSquare: AlgebraicSquare | null;
  isAwaitingAnvilDrop: boolean;
  playerToDropAnvil: PlayerColor | null;
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves = [],
  enemySelectedSquare,
  enemyPossibleMoves = [],
  onSquareClick,
  playerColor,
  currentPlayerColor,
  isInteractionDisabled,
  playerInCheck,
  viewMode,
  animatedSquareTo,
  applyBoardOpacityEffect,
  lastMoveFrom,
  lastMoveTo,
  isAwaitingPawnSacrifice,
  playerToSacrificePawn,
  isAwaitingCommanderPromotion,
  playerToPromoteCommander,
  isEnPassantTarget,
  onPieceHover,
  effects = [],
  promotingSquare,
  isAwaitingAnvilDrop,
  playerToDropAnvil,
}: ChessBoardProps) {

  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';

  const displayBoard = visuallyFlipBoardForLogic
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;
  
  const EffectOverlay = ({ effect }: { effect: Effect }) => {
    const { row, col } = algebraicToCoords(effect.square);
    const top = `${(visuallyFlipBoardForLogic ? 7 - row : row) * 12.5}%`;
    const left = `${(visuallyFlipBoardForLogic ? 7 - col : col) * 12.5}%`;
    let effectClass = '';
    
    switch (effect.type) {
      case 'poof':
        effectClass = "after:content-['💥'] after:text-2xl after:md:text-3xl after:text-foreground after:animate-[poof_0.1s_ease-out_forwards]";
        break;
      case 'explosion':
        effectClass = "after:content-['✹'] after:text-5xl after:md:text-6xl after:text-destructive after:animate-[pixel-explosion_0.6s_ease-out_forwards]";
        break;
      case 'shockwave':
        const shockwaveColor = effect.color === 'white' ? 'hsl(var(--foreground))' : 'hsl(var(--secondary))';
        return (
           <div
            className="absolute w-[12.5%] h-[12.5%] pointer-events-none"
            style={{ top, left }}
          >
            <div 
              className="absolute top-1/2 left-1/2 w-[300%] h-[300%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 animate-[shockwave-pulse_0.7s_ease-out_forwards]"
              style={{ borderColor: shockwaveColor }}
            />
          </div>
        );
       case 'light-beam':
        return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ top, left, width: '12.5%', height: '100%'}}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/6 h-full bg-gradient-to-b from-transparent via-cyan-300/80 to-transparent animate-[light-beam-anim_1.5s_ease-in-out_forwards]" />
          </div>
        );
      case 'level-change':
        const val = effect.value || 0;
        const isPositive = val >= 0;
        const sign = isPositive ? '+' : '';
        const text = `${sign}${val}`;
        return (
            <div 
                className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[60]"
                style={{ top, left }}
            >
                <span className="text-destructive font-bold text-lg md:text-xl animate-[level-float_1s_ease-out_forwards]" style={{ textShadow: '2px 2px 0px black' }}>
                    {text}
                </span>
            </div>
        );
    }
  
    return (
      <div 
        className={cn("absolute w-[12.5%] h-[12.5%] pointer-events-none after:absolute after:inset-0 after:flex after:items-center after:justify-center", effectClass)}
        style={{ top, left }}
      />
    );
  };


  return (
    <div
      className={cn(
        "grid grid-cols-8 w-full max-w-lg aspect-square overflow-hidden group shadow-lg mx-auto relative",
        applyBoardOpacityEffect && "opacity-70",
        isInteractionDisabled && !(isAwaitingCommanderPromotion && playerToPromoteCommander === currentPlayerColor) && "cursor-not-allowed",
        viewMode === 'tabletop' && "rotate-90 will-change-transform backface-hidden transform-style-preserve-3d"
      )}
      onMouseLeave={() => onPieceHover(null)}
    >
      {displayBoard.map((row, displayedRowIndex) =>
        row.map((squareDataFromDisplay, displayedColIndex) => {
          const actualRowIndex = visuallyFlipBoardForLogic ? 7 - displayedRowIndex : displayedRowIndex;
          const actualColIndex = visuallyFlipBoardForLogic ? 7 - displayedColIndex : displayedColIndex;

          const currentSquareData = boardState[actualRowIndex][actualColIndex];

          const isLightSquare = (actualRowIndex + actualColIndex) % 2 === 0;

          const isPlayerSelected = selectedSquare === currentSquareData.algebraic;
          const isPlayerPossibleMove = (possibleMoves || []).includes(currentSquareData.algebraic);

          const isEnemySelectedFlag = enemySelectedSquare === currentSquareData.algebraic;
          const isEnemyPossibleMoveFlag = (enemyPossibleMoves || []).includes(currentSquareData.algebraic);

          const isThisKingInCheck = currentSquareData.piece?.type === 'king' && currentSquareData.piece?.color === playerInCheck;

          const isThisLastMoveFrom = currentSquareData.algebraic === lastMoveFrom;
          const isThisLastMoveTo = currentSquareData.algebraic === lastMoveTo;

          const isSacrificeTargetSquare = isAwaitingPawnSacrifice &&
                                          currentSquareData.piece &&
                                          (currentSquareData.piece.type === 'pawn' || currentSquareData.piece.type === 'commander') &&
                                          currentSquareData.piece.color === playerToSacrificePawn;

          const isCommanderPromoTargetSquare = isAwaitingCommanderPromotion &&
                                               currentSquareData.piece?.type === 'pawn' &&
                                               currentSquareData.piece?.level === 1 &&
                                               currentSquareData.piece?.color === playerToPromoteCommander;
          

          return (
            <ChessSquare
              key={currentSquareData.algebraic}
              squareData={currentSquareData}
              isLightSquare={isLightSquare}
              isSelected={isPlayerSelected}
              isPossibleMove={isPlayerPossibleMove}
              isEnemySelected={isEnemySelectedFlag}
              isEnemyPossibleMove={isEnemyPossibleMoveFlag}
              onClick={onSquareClick}
              disabled={isInteractionDisabled && !isSacrificeTargetSquare && !isCommanderPromoTargetSquare}
              isKingInCheck={isThisKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              isLastMoveFrom={isThisLastMoveFrom}
              isLastMoveTo={isThisLastMoveTo}
              isSacrificeTarget={isSacrificeTargetSquare}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
              isCommanderPromoTarget={isCommanderPromoTargetSquare}
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion}
              playerToPromoteCommander={playerToPromoteCommander}
              isEnPassantTarget={isEnPassantTarget === currentSquareData.algebraic}
              onPieceHover={onPieceHover}
              isPromoting={promotingSquare === currentSquareData.algebraic}
            />
          );
        })
      )}
       {effects.map(effect => <EffectOverlay key={effect.id} effect={effect} />)}
    </div>
  );
}
