export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface Piece {
  id: string; // Unique ID, e.g., 'wP1', 'bRk2'
  type: PieceType;
  color: PlayerColor;
  level: number;
  // Stats can be derived, e.g., attack: level * baseAttack
}

export type AlgebraicSquare = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;

export interface SquareState {
  piece: Piece | null;
  algebraic: AlgebraicSquare;
  rowIndex: number; // 0-7 (from white's perspective, row '1' is 7, row '8' is 0)
  colIndex: number; // 0-7 (col 'a' is 0, col 'h' is 7)
}

export type BoardState = SquareState[][]; // 8x8 grid, board[rowIndex][colIndex]

export interface Move {
  from: AlgebraicSquare;
  to: AlgebraicSquare;
}

export interface SuggestedMoveAI {
  move: string; // e.g., "e2-e4" or other format the AI returns
  boardStateValueChangeEstimate: number;
  reason: string;
}

export interface GameStatus {
  message: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  winner?: PlayerColor;
}
