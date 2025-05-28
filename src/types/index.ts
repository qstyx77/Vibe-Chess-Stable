
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
  type?: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap'; // For AI move objects
  promoteTo?: PieceType; // For AI promotion
}

export interface GameStatus {
  message: string;
  isCheck: boolean;
  playerWithKingInCheck: PlayerColor | null;
  isCheckmate: boolean;
  isStalemate: boolean;
  isThreefoldRepetitionDraw?: boolean;
  winner?: PlayerColor | 'draw';
  gameOver: boolean;
  killStreaks?: { white: number, black: number }; 
  capturedPieces?: { white: Piece[], black: Piece[] }; 
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
  isWhiteAI: boolean;
  isBlackAI: boolean;
  enemySelectedSquare?: AlgebraicSquare | null; 
  enemyPossibleMoves?: AlgebraicSquare[];
  positionHistory: string[];
  lastMoveFrom: AlgebraicSquare | null;
  lastMoveTo: AlgebraicSquare | null;
  isAwaitingPawnSacrifice: boolean;
  playerToSacrificePawn: PlayerColor | null;
  // Add new fields for sacrifice context if they need to be part of undo
  boardForPostSacrifice: BoardState | null;
  playerWhoMadeQueenMove: PlayerColor | null;
  isExtraTurnFromQueenMove: boolean;
}
