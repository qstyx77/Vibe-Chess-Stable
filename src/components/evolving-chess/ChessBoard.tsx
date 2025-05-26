
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  enemySelectedSquare: AlgebraicSquare | null; // New prop
  enemyPossibleMoves: AlgebraicSquare[];   // New prop
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: PlayerColor; // Logical orientation for the current turn
  currentPlayerColor: PlayerColor; // Whose actual turn it is
  isInteractionDisabled: boolean; // Combined prop for disabling clicks
  playerInCheck: PlayerColor | null;
  viewMode: ViewMode;
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  enemySelectedSquare,
  enemyPossibleMoves,
  onSquareClick,
  playerColor, // Orientation
  currentPlayerColor, // Actual current player
  isInteractionDisabled,
  playerInCheck,
  viewMode,
}: ChessBoardProps) {
  
  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';

  const displayBoard = visuallyFlipBoardForLogic
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;

  return (
    <div 
      className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border",
        isInteractionDisabled && "opacity-70 cursor-not-allowed", // Use combined prop
        viewMode === 'tabletop' && "rotate-90"
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
              disabled={isInteractionDisabled} // Use combined prop
              isKingInCheck={isThisKingInCheck}
              viewMode={viewMode}
              // Pass currentPlayerColor if ChessSquare needs it to determine if an enemy capture is on one of the player's pieces
              // For enemyPossibleMove + piece, the styling can just check if piece exists and is of opposite color to enemySelectedSquare's piece
              // But the current logic in ChessSquare seems fine as it relies on `piece.color === currentPlayer` which it doesn't have.
              // Let's simplify the ChessSquare to just use piece.color for styling captures by enemy.
            />
          );
        })
      )}
    </div>
  );
}
