
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode, Piece, Effect } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';
import { algebraicToCoords } from '@/lib/chess-utils';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  enemySelectedSquare: AlgebraicSquare | null;
  enemyPossibleMoves: AlgebraicSquare[];
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
  resurrectedSquares: AlgebraicSquare[];
  onPieceHover: (piece: Piece | null) => void;
  effects: Effect[];
  promotingSquare: AlgebraicSquare | null;
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  enemySelectedSquare,
  enemyPossibleMoves,
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
  resurrectedSquares,
  onPieceHover,
  effects = [],
  promotingSquare,
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
        effectClass = "after:content-['💥'] after:text-2xl after:md:text-3xl after:text-foreground after:animate-[poof_0.4s_ease-out_forwards]";
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
        "grid grid-cols-8 w-full max-w-lg aspect-square overflow-hidden group shadow-lg mx-auto",
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
          const isPlayerPossibleMove = possibleMoves.includes(currentSquareData.algebraic);

          const isEnemySelectedFlag = enemySelectedSquare === currentSquareData.algebraic;
          const isEnemyPossibleMoveFlag = enemyPossibleMoves.includes(currentSquareData.algebraic);

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
          
          const isResurrectedSquare = resurrectedSquares.includes(currentSquareData.algebraic);


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
              isResurrectedSquare={isResurrectedSquare}
              onPieceHover={onPieceHover}
              effects={effects.filter(e => e.square === currentSquareData.algebraic)}
              isPromoting={promotingSquare === currentSquareData.algebraic}
            />
          );
        })
      )}
       {effects.map(effect => <EffectOverlay key={effect.id} effect={effect} />)}
    </div>
  );
}
