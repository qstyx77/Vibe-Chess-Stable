import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, SquareState, Move } from '@/types';

const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export function initializeBoard(): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, algebraic, rowIndex: r, colIndex: c });
    }
    board.push(row);
  }

  // Place pieces
  for (let c = 0; c < 8; c++) {
    // White pawns
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, experience: 0 };
    // Black pawns
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, experience: 0 };

    // White pieces
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1, experience: 0 };
    // Black pieces
    board[0][c].piece = { id: `b${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'black', level: 1, experience: 0 };
  }
  return board;
}

export function algebraicToCoords(algebraic: AlgebraicSquare): { row: number, col: number } {
  const col = algebraic.charCodeAt(0) - 97;
  const row = 8 - parseInt(algebraic[1]);
  return { row, col };
}

export function coordsToAlgebraic(row: number, col: number): AlgebraicSquare {
  return (String.fromCharCode(97 + col) + (8 - row)) as AlgebraicSquare;
}

// Basic move validation (very simplified)
export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to) return false;
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  const targetPiece = board[toRow][toCol].piece;

  if (targetPiece && targetPiece.color === piece.color) return false; // Cannot capture own piece

  // Piece-specific logic (highly simplified)
  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      // Move forward one square
      if (fromCol === toCol && toRow === fromRow + direction && !targetPiece) return true;
      // Move forward two squares (initial move)
      if (
        fromCol === toCol && !targetPiece &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5][fromCol].piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2][fromCol].piece))
      ) return true;
      // Capture
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPiece) return true;
      return false;
    case 'knight':
      const dRow = Math.abs(toRow - fromRow);
      const dCol = Math.abs(toCol - fromCol);
      return (dRow === 2 && dCol === 1) || (dRow === 1 && dCol === 2);
    case 'rook':
      return fromRow === toRow || fromCol === toCol; // Needs path checking
    case 'bishop':
      return Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol); // Needs path checking
    case 'queen':
      return fromRow === toRow || fromCol === toCol || Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol); // Needs path checking
    case 'king':
      return Math.abs(toRow - fromRow) <= 1 && Math.abs(toCol - fromCol) <= 1;
    default:
      return false;
  }
}

export function getPossibleMoves(board: BoardState, square: AlgebraicSquare): AlgebraicSquare[] {
  const { row, col } = algebraicToCoords(square);
  const piece = board[row][col].piece;
  if (!piece) return [];

  const possibleMoves: AlgebraicSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const targetSquare = coordsToAlgebraic(r, c);
      if (isMoveValid(board, square, targetSquare, piece)) {
        possibleMoves.push(targetSquare);
      }
    }
  }
  return possibleMoves;
}


export function applyMove(board: BoardState, move: Move): { newBoard: BoardState, capturedPiece: Piece | null } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null }; // Should not happen if move is validated

  const capturedPiece = newBoard[toRow][toCol].piece;
  newBoard[toRow][toCol].piece = movingPiece;
  newBoard[fromRow][fromCol].piece = null;

  // Handle capture & leveling
  if (capturedPiece) {
    movingPiece.experience += (capturedPiece.level * 10); // Example: 10 exp per level of captured piece
    const levelThreshold = movingPiece.level * 20; // Example: level up every level * 20 exp
    if (movingPiece.experience >= levelThreshold) {
      movingPiece.level += 1;
      movingPiece.experience = 0; // Reset experience or carry over
    }
  }
  
  // Simplified pawn promotion
  if (movingPiece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
    movingPiece.type = 'queen'; // Auto-queen for simplicity
  }


  return { newBoard, capturedPiece };
}

export function boardToStringForAI(board: BoardState): string {
  const pieceStrings: string[] = [];
  board.forEach(row => {
    row.forEach(square => {
      if (square.piece) {
        const colorChar = square.piece.color === 'white' ? 'w' : 'b';
        const typeChar = square.piece.type[0].toUpperCase();
        pieceStrings.push(`${colorChar}${typeChar}${square.algebraic}`);
      }
    });
  });
  return pieceStrings.join(' ');
}

export function getPieceUnicode(piece: Piece): string {
  if (!piece) return '';
  const isWhite = piece.color === 'white';
  switch (piece.type) {
    case 'king': return isWhite ? '♔' : '♚';
    case 'queen': return isWhite ? '♕' : '♛';
    case 'rook': return isWhite ? '♖' : '♜';
    case 'bishop': return isWhite ? '♗' : '♝';
    case 'knight': return isWhite ? '♘' : '♞';
    case 'pawn': return isWhite ? '♙' : '♟︎'; // Added variant selector for pawn
    default: return '';
  }
}
