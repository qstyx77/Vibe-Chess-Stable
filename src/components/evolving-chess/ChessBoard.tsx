
'use client';

import type { BoardState, AlgebraicSquare, PlayerColor } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: 'white' | 'black'; // To orient the board
  isGameOver: boolean;
  playerInCheck: PlayerColor | null;
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  onSquareClick,
  playerColor,
  isGameOver,
  playerInCheck,
}: ChessBoardProps) {
  const displayBoard = playerColor === 'white' ? boardState : [...boardState].reverse().map(row => [...row].reverse());

  return (
    <div className={cn(
        "grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border",
        isGameOver && "opacity-70 cursor-not-allowed"
      )}>
      {displayBoard.map((row, rowIndex) =>
        row.map((squareData, colIndex) => {
          const actualRowIndex = playerColor === 'white' ? rowIndex : 7 - rowIndex;
          const actualColIndex = playerColor === 'white' ? colIndex : 7 - colIndex;
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
            />
          );
        })
      )}
    </div>
  );
}
