
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';

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
  enPassantTargetSquare: AlgebraicSquare | null;
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
  enPassantTargetSquare,
}: ChessBoardProps) {

  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';

  const displayBoard = visuallyFlipBoardForLogic
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;

  return (
    <div
      className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border group",
        applyBoardOpacityEffect && "opacity-70",
        isInteractionDisabled && !(isAwaitingCommanderPromotion && playerToPromoteCommander === currentPlayerColor) && "cursor-not-allowed",
        viewMode === 'tabletop' && "rotate-90 will-change-transform backface-hidden transform-style-preserve-3d"
      )}
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

          const isEnPassantTargetDisplay = currentSquareData.algebraic === enPassantTargetSquare;


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
              currentPlayerColor={currentPlayerColor}
              isLastMoveFrom={isThisLastMoveFrom}
              isLastMoveTo={isThisLastMoveTo}
              isSacrificeTarget={isSacrificeTargetSquare}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
              isCommanderPromoTarget={isCommanderPromoTargetSquare}
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion}
              playerToPromoteCommander={playerToPromoteCommander}
              isEnPassantTarget={isEnPassantTargetDisplay}
            />
          );
        })
      )}
    </div>
  );
}

