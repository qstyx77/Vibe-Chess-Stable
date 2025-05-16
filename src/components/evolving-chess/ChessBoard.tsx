'use client';

import type { BoardState, AlgebraicSquare } from '@/types';
import { ChessSquare } from './ChessSquare';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  suggestedMovesCoords: { from: AlgebraicSquare, to: AlgebraicSquare }[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: 'white' | 'black'; // To orient the board
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  suggestedMovesCoords,
  onSquareClick,
  playerColor,
}: ChessBoardProps) {
  const displayBoard = playerColor === 'white' ? boardState : [...boardState].reverse().map(row => [...row].reverse());

  return (
    <div className="grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square shadow-2xl rounded-md overflow-hidden border-2 border-primary/50">
      {displayBoard.map((row, rowIndex) =>
        row.map((squareData, colIndex) => {
          const isLightSquare = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selectedSquare === squareData.algebraic;
          const isPossible = possibleMoves.includes(squareData.algebraic);
          const isSuggested = suggestedMovesCoords.some(m => m.to === squareData.algebraic || m.from === squareData.algebraic);
          
          return (
            <ChessSquare
              key={squareData.algebraic}
              squareData={squareData}
              isLightSquare={isLightSquare}
              isSelected={isSelected}
              isPossibleMove={isPossible}
              isSuggestedMove={isSuggested}
              onClick={onSquareClick}
            />
          );
        })
      )}
    </div>
  );
}
