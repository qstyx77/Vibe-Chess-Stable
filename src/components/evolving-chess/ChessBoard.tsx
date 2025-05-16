
'use client';

import type { BoardState, AlgebraicSquare } from '@/types';
import { ChessSquare } from './ChessSquare';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves: AlgebraicSquare[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: 'white' | 'black'; // To orient the board
}

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves,
  onSquareClick,
  playerColor,
}: ChessBoardProps) {
  const displayBoard = playerColor === 'white' ? boardState : [...boardState].reverse().map(row => [...row].reverse());

  return (
    <div className="grid grid-cols-8 w-full max-w-md md:max-w-xl aspect-square overflow-hidden border-4 border-border">
      {displayBoard.map((row, rowIndex) =>
        row.map((squareData, colIndex) => {
          const isLightSquare = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selectedSquare === squareData.algebraic;
          const isPossible = possibleMoves.includes(squareData.algebraic);
          
          return (
            <ChessSquare
              key={squareData.algebraic}
              squareData={squareData}
              isLightSquare={isLightSquare}
              isSelected={isSelected}
              isPossibleMove={isPossible}
              onClick={onSquareClick}
            />
          );
        })
      )}
    </div>
  );
}
