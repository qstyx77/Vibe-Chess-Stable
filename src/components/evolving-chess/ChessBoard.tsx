
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
  viewMode: ViewMode; // New prop for view mode
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
  
  // Determine if the board should be visually flipped
  const visuallyFlipBoard = viewMode === 'flipping' && playerColor === 'black';

  // Create the board for display based on whether it's visually flipped
  const displayBoard = visuallyFlipBoard
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState; // If flipping for white, or tabletop view, boardState is as-is (white at bottom)

  return (
    <div className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border",
        isGameOver && "opacity-70 cursor-not-allowed"
      )}>
      {displayBoard.map((row, displayedRowIndex) =>
        row.map((squareDataFromDisplay, displayedColIndex) => {
          // Calculate actual indices based on visual flip for consistent data access from original boardState
          const actualRowIndex = visuallyFlipBoard ? 7 - displayedRowIndex : displayedRowIndex;
          const actualColIndex = visuallyFlipBoard ? 7 - displayedColIndex : displayedColIndex;
          
          // Always fetch data from the original boardState using actual indices
          const currentSquareData = boardState[actualRowIndex][actualColIndex]; 
          
          const isLightSquare = (actualRowIndex + actualColIndex) % 2 === 0;
          const isSelected = selectedSquare === currentSquareData.algebraic;
          const isPossible = possibleMoves.includes(currentSquareData.algebraic);
          // playerInCheck is the color of the king that is actually in check
          const isThisKingInCheck = currentSquareData.piece?.type === 'king' && currentSquareData.piece?.color === playerInCheck;
          
          return (
            <ChessSquare
              key={currentSquareData.algebraic}
              squareData={currentSquareData} // Pass data derived from actual indices
              isLightSquare={isLightSquare}
              isSelected={isSelected}
              isPossibleMove={isPossible}
              onClick={onSquareClick}
              disabled={isGameOver}
              isKingInCheck={isThisKingInCheck}
            />
          );
        })
      )}
    </div>
  );
}
