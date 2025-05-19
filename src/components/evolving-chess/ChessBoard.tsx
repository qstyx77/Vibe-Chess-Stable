
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: PlayerColor; // Logical orientation for the current turn
  isGameOver: boolean;
  playerInCheck: PlayerColor | null;
  viewMode: ViewMode;
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  onSquareClick,
  playerColor,
  isGameOver,
  playerInCheck,
  viewMode,
}: ChessBoardProps) {
  
  const visuallyFlipBoard = viewMode === 'flipping' && playerColor === 'black';

  const displayBoard = visuallyFlipBoard
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;

  return (
    <div className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border",
        isGameOver && "opacity-70 cursor-not-allowed"
      )}>
      {displayBoard.map((row, displayedRowIndex) =>
        row.map((squareDataFromDisplay, displayedColIndex) => {
          const actualRowIndex = visuallyFlipBoard ? 7 - displayedRowIndex : displayedRowIndex;
          const actualColIndex = visuallyFlipBoard ? 7 - displayedColIndex : displayedColIndex;
          
          const currentSquareData = boardState[actualRowIndex][actualColIndex]; 
          
          const isLightSquare = (actualRowIndex + actualColIndex) % 2 === 0;
          const isSelected = selectedSquare === currentSquareData.algebraic;
          const isPossible = possibleMoves.includes(currentSquareData.algebraic);
          const isThisKingInCheck = currentSquareData.piece?.type === 'king' && currentSquareData.piece?.color === playerInCheck;
          
          return (
            <ChessSquare
              key={currentSquareData.algebraic}
              squareData={currentSquareData}
              isLightSquare={isLightSquare}
              isSelected={isSelected}
              isPossibleMove={isPossible}
              onClick={onSquareClick}
              disabled={isGameOver}
              isKingInCheck={isThisKingInCheck}
              viewMode={viewMode} // Pass viewMode to ChessSquare
            />
          );
        })
      )}
    </div>
  );
}
