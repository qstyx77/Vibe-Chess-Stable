
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
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1 };
    // Black pawns
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1 };

    // White pieces
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1 };
    // Black pieces
    board[0][c].piece = { id: `b${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'black', level: 1 };
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

export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to) return false;
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  const targetPiece = board[toRow][toCol].piece;

  if (targetPiece && targetPiece.color === piece.color) return false; // Cannot capture own piece

  // Piece-specific logic
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
      // Capture (forward diagonal)
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPiece) return true;
      
      if (piece.level >= 2) { // Level 2+ can move one square backward
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPiece) {
          return true;
        }
      }
      if (piece.level >= 3) { // Level 3+ can move one square sideways
        if (toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPiece) {
          return true;
        }
      }
      return false;
    case 'knight':
      const dRowKnight = Math.abs(toRow - fromRow);
      const dColKnight = Math.abs(toCol - fromCol);
      return (dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2);
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; // Must be horizontal or vertical
      if (fromRow === toRow) { // Horizontal move
        const step = toCol > fromCol ? 1 : -1;
        for (let c = fromCol + step; c !== toCol; c += step) {
          if (board[fromRow][c].piece) return false; // Path blocked
        }
      } else { // Vertical move
        const step = toRow > fromRow ? 1 : -1;
        for (let r = fromRow + step; r !== toRow; r += step) {
          if (board[r][fromCol].piece) return false; // Path blocked
        }
      }
      return true;
    case 'bishop':
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false; // Must be diagonal
      const dRowBishop = toRow > fromRow ? 1 : -1;
      const dColBishop = toCol > fromCol ? 1 : -1;
      let rBishop = fromRow + dRowBishop;
      let cBishop = fromCol + dColBishop;
      while (rBishop !== toRow) {
        if (board[rBishop][cBishop].piece) return false; // Path blocked
        rBishop += dRowBishop;
        cBishop += dColBishop;
      }
      return true;
    case 'queen':
      const isRookMove = fromRow === toRow || fromCol === toCol;
      const isBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isRookMove && !isBishopMove) return false;

      if (isRookMove) { // Check path like a rook
        if (fromRow === toRow) {
          const step = toCol > fromCol ? 1 : -1;
          for (let c = fromCol + step; c !== toCol; c += step) {
            if (board[fromRow][c].piece) return false;
          }
        } else {
          const step = toRow > fromRow ? 1 : -1;
          for (let r = fromRow + step; r !== toRow; r += step) {
            if (board[r][fromCol].piece) return false;
          }
        }
      } else { // Check path like a bishop
        const dRowQueen = toRow > fromRow ? 1 : -1;
        const dColQueen = toCol > fromCol ? 1 : -1;
        let rQueen = fromRow + dRowQueen;
        let cQueen = fromCol + dColQueen;
        while (rQueen !== toRow) {
          if (board[rQueen][cQueen].piece) return false;
          rQueen += dRowQueen;
          cQueen += dColQueen;
        }
      }
      return true;
    case 'king':
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);

      // Standard 1-square move (max delta is 1 for row and col)
      if (dRowKing <= 1 && dColKing <= 1) {
        return true;
      }

      // Level 2+ extended move
      if (piece.level >= 2) {
        // Target must be within 2 squares in row and col
        if (dRowKing <= 2 && dColKing <= 2) { 
          // If it's a linear 2-square move (where one delta is 2 and other is 0, or both are 2),
          // check the intermediate square for blockage.
          if ((dRowKing === 2 && dColKing === 0) ||   // Purely vertical 2-square move
              (dRowKing === 0 && dColKing === 2) ||   // Purely horizontal 2-square move
              (dRowKing === 2 && dColKing === 2)) {  // Purely diagonal 2-square move
            
            // Calculate intermediate square coordinates
            const midRow = fromRow + (toRow - fromRow) / 2;
            const midCol = fromCol + (toCol - fromCol) / 2;
            if (board[midRow][midCol].piece) {
              return false; // Path blocked for linear 2-square move
            }
          }
          // If it's a 2-square non-linear move (e.g., |2,1| or |1,2| not covered by linear check), or 
          // a linear 2-square move with a clear path, it's valid.
          return true;
        }
      }
      return false; // Not a valid 1-square move, or not level 2+ for extended move, or invalid extended move
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
  if (!movingPiece) return { newBoard: board, capturedPiece: null };

  const capturedPiece = newBoard[toRow][toCol].piece ? { ...newBoard[toRow][toCol].piece! } : null;
  newBoard[toRow][toCol].piece = { ...movingPiece }; 
  newBoard[fromRow][fromCol].piece = null;

  const currentMovingPieceRef = newBoard[toRow][toCol].piece!; 

  if (capturedPiece) {
    switch (capturedPiece.type) {
      case 'pawn':
        currentMovingPieceRef.level += 1;
        break;
      case 'queen':
        currentMovingPieceRef.level += 3;
        break;
      default: // Rook, Knight, Bishop, King
        currentMovingPieceRef.level += 2;
        break;
    }
  }
  
  if (currentMovingPieceRef.type === 'pawn' && currentMovingPieceRef.level >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;
        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const enemyPieceToPush = newBoard[adjRow][adjCol].piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== currentMovingPieceRef.color) {
            const pushTargetRow = adjRow + dr;
            const pushTargetCol = adjCol + dc;
            if (pushTargetRow >= 0 && pushTargetRow < 8 && pushTargetCol >= 0 && pushTargetCol < 8) {
              if (!newBoard[pushTargetRow][pushTargetCol].piece) {
                newBoard[pushTargetRow][pushTargetCol].piece = enemyPieceToPush;
                newBoard[adjRow][adjCol].piece = null;
              }
            }
          }
        }
      }
    }
  }
  return { newBoard, capturedPiece };
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor): boolean {
  let kingPos: { row: number, col: number } | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c].piece;
      if (p && p.type === 'king' && p.color === kingColor) {
        kingPos = { row: r, col: c };
        break;
      }
    }
    if (kingPos) break;
  }

  if (!kingPos) return false; 

  const kingSquareAlgebraic = coordsToAlgebraic(kingPos.row, kingPos.col);
  const opponentColor = kingColor === 'white' ? 'black' : 'white';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const attackerPiece = board[r][c].piece;
      if (attackerPiece && attackerPiece.color === opponentColor) {
        // Temporarily allow checking moves as if the target king square is empty to see if it's a valid attack path
        const originalKingPieceOnTarget = board[kingPos.row][kingPos.col].piece;
        // For validating an attack on the king, the king's square is considered the target.
        // isMoveValid checks if the attackerPiece can move from its current square to kingSquareAlgebraic.
        // The targetPiece (the king itself) is handled by isMoveValid (it allows capturing opponent's pieces).
        
        if (isMoveValid(board, coordsToAlgebraic(r, c), kingSquareAlgebraic, attackerPiece)) {
          return true;
        }
      }
    }
  }
  return false;
}

export function filterLegalMoves(
  board: BoardState,
  pieceOriginalSquare: AlgebraicSquare,
  pseudoMoves: AlgebraicSquare[],
  playerColor: PlayerColor
): AlgebraicSquare[] {
  const piece = board[algebraicToCoords(pieceOriginalSquare).row][algebraicToCoords(pieceOriginalSquare).col].piece;
  if (!piece || piece.color !== playerColor) return [];

  return pseudoMoves.filter(targetSquare => {
    // Create a deep copy of the board for simulation
    const tempBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    
    // Simulate the move without applying full applyMove side effects like leveling up.
    // Just move the piece for the check validation.
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    const pToMove = tempBoard[fromR][fromC].piece;
    tempBoard[toR][toC].piece = pToMove;
    tempBoard[fromR][fromC].piece = null;

    return !isKingInCheck(tempBoard, playerColor);
  });
}

function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r][c];
      const piece = squareState.piece;
      if (piece && piece.color === playerColor) {
        const pieceSquareAlgebraic = squareState.algebraic;
        const pseudoMoves = getPossibleMoves(board, pieceSquareAlgebraic);
        const legalMoves = filterLegalMoves(board, pieceSquareAlgebraic, pseudoMoves, playerColor);
        if (legalMoves.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

export function isCheckmate(board: BoardState, kingInCheckColor: PlayerColor): boolean {
  return isKingInCheck(board, kingInCheckColor) && !hasAnyLegalMoves(board, kingInCheckColor);
}

export function isStalemate(board: BoardState, playerColor: PlayerColor): boolean {
  return !isKingInCheck(board, playerColor) && !hasAnyLegalMoves(board, playerColor);
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
    case 'pawn': return isWhite ? '♟︎' : '♟︎'; // Fixed black pawn to use the filled variant
    default: return '';
  }
}

