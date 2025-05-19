
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
  
  // This variable determines if the board's internal array structure should be reversed for display.
  // It's true only in 'flipping' mode when it's black's turn.
  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';

  // The displayBoard determines the visual order of rows and squares based on the flipping logic.
  const displayBoard = visuallyFlipBoardForLogic
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;

  return (
    <div 
      className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border",
        isGameOver && "opacity-70 cursor-not-allowed",
        viewMode === 'tabletop' && "rotate-90" // Apply 90-degree rotation for tabletop view
      )}
      // Note: Further style adjustments might be needed here if the 90-degree rotation causes layout issues
      // with surrounding elements or the board's own container.
    >
      {displayBoard.map((row, displayedRowIndex) =>
        row.map((squareDataFromDisplay, displayedColIndex) => {
          // Determine the actual row and column indices in the original boardState
          // based on whether the board logic was flipped for display.
          const actualRowIndex = visuallyFlipBoardForLogic ? 7 - displayedRowIndex : displayedRowIndex;
          const actualColIndex = visuallyFlipBoardForLogic ? 7 - displayedColIndex : displayedColIndex;
          
          // Fetch the current square data from the original boardState using these actual indices.
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
              viewMode={viewMode} // Pass viewMode to ChessSquare for piece orientation
            />
          );
        })
      )}
    </div>
  );
}
