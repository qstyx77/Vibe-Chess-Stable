
export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface Piece {
  id: string; 
  type: PieceType;
  color: PlayerColor;
  level: number;
  hasMoved: boolean; 
  invulnerableTurnsRemaining?: number; 
}

export type AlgebraicSquare = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;

export interface SquareState {
  piece: Piece | null;
  algebraic: AlgebraicSquare;
  rowIndex: number; 
  colIndex: number; 
}

export type BoardState = SquareState[][]; 

export interface Move {
  from: AlgebraicSquare;
  to: AlgebraicSquare;
}

export interface GameStatus {
  message: string;
  isCheck: boolean;
  playerWithKingInCheck: PlayerColor | null;
  isCheckmate: boolean;
  isStalemate: boolean;
  winner?: PlayerColor | 'draw';
  gameOver: boolean;
}

export interface ConversionEvent {
  originalPiece: Piece;
  convertedPiece: Piece;
  byPiece: Piece;
  at: AlgebraicSquare;
}

export type ViewMode = 'flipping' | 'tabletop';

export interface GameSnapshot {
  board: BoardState;
  currentPlayer: PlayerColor;
  gameInfo: GameStatus;
  capturedPieces: { white: Piece[], black: Piece[] };
  killStreaks: { white: number, black: number };
  lastCapturePlayer: PlayerColor | null;
  boardOrientation: PlayerColor;
  viewMode: ViewMode;
  isWhiteAI: boolean; // Added for AI state
  isBlackAI: boolean; // Added for AI state
}

    