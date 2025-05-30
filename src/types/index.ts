
export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface Piece {
  id: string; 
  type: PieceType;
  color: PlayerColor;
  level: number;
  hasMoved: boolean; 
  // invulnerableTurnsRemaining?: number; // Removed for Rook simplification
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
  // States for Queen's pawn sacrifice
  isAwaitingPawnSacrifice: boolean;
  playerToSacrificePawn: PlayerColor | null;
  boardForPostSacrifice: BoardState | null; // Board state after Queen's move but before pawn sacrifice
  playerWhoMadeQueenMove: PlayerColor | null; // Player whose Queen leveled up
  isExtraTurnFromQueenMove: boolean; // If the Queen's move itself granted an extra turn

  // Removed Rook sacrifice states
  // isAwaitingRookSacrifice: boolean;
  // playerToSacrificeForRook: PlayerColor | null;
  // rookToMakeInvulnerable: AlgebraicSquare | null;
  // boardForRookSacrifice: BoardState | null;
  // originalTurnPlayerForRookSacrifice: PlayerColor | null;
  // isExtraTurnFromRookLevelUp: boolean;
}
