
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
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, hasMoved: false };
    // Black pawns
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, hasMoved: false };

    // White pieces
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1, hasMoved: false };
    // Black pieces
    board[0][c].piece = { id: `b${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'black', level: 1, hasMoved: false };
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

export function isSquareAttacked(board: BoardState, squareToAttack: AlgebraicSquare, attackerColor: PlayerColor): boolean {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingPieceData = board[r][c];
            if (!attackingPieceData) continue;
            const attackingPiece = attackingPieceData.piece;
            if (attackingPiece && attackingPiece.color === attackerColor) {
                // For pawns, we need to check their specific attack pattern, not just general isMoveValid
                if (attackingPiece.type === 'pawn') {
                    const { row: fromR, col: fromC } = algebraicToCoords(coordsToAlgebraic(r,c));
                    const { row: toR, col: toC } = algebraicToCoords(squareToAttack);
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (Math.abs(fromC - toC) === 1 && toR === fromR + direction) {
                        return true; // Pawn is attacking the square
                    }
                } else if (isMoveValid(board, coordsToAlgebraic(r,c), squareToAttack, attackingPiece)) {
                    // For other pieces, isMoveValid (which checks captures) is appropriate
                    // but ensure the target square for isMoveValid is the squareToAttack
                    return true;
                }
            }
        }
    }
    return false;
}

export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to) return false;
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  const targetPieceOnSquare = board[toRow][toCol].piece;

  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color) return false; // Can't capture own piece (standard move)

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      // Standard 1-square forward move
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      // Initial 2-square forward move
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5][fromCol].piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2][fromCol].piece))
      ) return true;
      // Diagonal capture
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare) {
        // Level 3+ Bishops cannot be captured by pawns
        if (targetPieceOnSquare.type === 'bishop' && targetPieceOnSquare.level >= 3) {
          return false; 
        }
        return true;
      }
      
      // Level 2+ backwards move
      if (piece.level >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) {
          return true;
        }
      }
      // Level 3+ sideways move
      if (piece.level >= 3) {
        if (toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPieceOnSquare) {
          return true;
        }
      }
      return false;
    case 'knight':
      const dRowKnight = Math.abs(toRow - fromRow);
      const dColKnight = Math.abs(toCol - fromCol);
      // Standard L-shape
      if ((dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2)) {
        return true;
      }
      // Level 2+: 1 space cardinal
      if (piece.level >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return true;
        }
      }
      // Level 3+: 3 spaces cardinal jump
      if (piece.level >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            return true;
        }
      }
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; 
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
      return true;
    case 'bishop':
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false; 
      const dRowBishop = toRow > fromRow ? 1 : -1;
      const dColBishop = toCol > fromCol ? 1 : -1;
      let rBishop = fromRow + dRowBishop;
      let cBishop = fromCol + dColBishop;
      while (rBishop !== toRow) {
        const pathPiece = board[rBishop][cBishop].piece;
        if (pathPiece) {
          if (piece.level >= 2 && pathPiece.color === piece.color) {
            // Level 2+ Bishop can jump over friendly pieces
          } else {
            return false; // Blocked by enemy piece or by friendly if level < 2
          }
        }
        rBishop += dRowBishop;
        cBishop += dColBishop;
      }
      return true;
    case 'queen':
      // Queen combines rook and bishop movement. Check path for selected type of move.
      const isRookMove = fromRow === toRow || fromCol === toCol;
      const isBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isRookMove && !isBishopMove) return false;

      if (isRookMove) { 
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
      } else { // Bishop move
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

      // Standard 1-square move
      if (dRowKing <= 1 && dColKing <= 1) {
        return true;
      }

      // Level 2+ King: 2-square move
      if (piece.level >= 2) {
        if (dRowKing <= 2 && dColKing <= 2) { 
            // Check for blocking pieces on linear 2-square moves
            if ((dRowKing === 2 && dColKing === 0) ||   // Vertical 2-square
                (dRowKing === 0 && dColKing === 2) ||   // Horizontal 2-square
                (dRowKing === 2 && dColKing === 2)) {  // Diagonal 2-square
              const midRow = fromRow + (toRow - fromRow) / 2;
              const midCol = fromCol + (toCol - fromCol) / 2;
              if (board[midRow][midCol].piece) { 
                return false; // Blocked
              }
            }
            return true; // Valid 2-square move (linear and unblocked, or non-linear)
        }
      }
      return false;
    default:
      return false;
  }
}

export function getPossibleMoves(board: BoardState, square: AlgebraicSquare): AlgebraicSquare[] {
  const { row, col } = algebraicToCoords(square);
  const pieceData = board[row][col];
  if (!pieceData || !pieceData.piece) return [];
  const piece = pieceData.piece;

  const possibleMoves: AlgebraicSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const targetSquare = coordsToAlgebraic(r, c);
      if (isMoveValid(board, square, targetSquare, piece)) {
        possibleMoves.push(targetSquare);
      }
    }
  }

  // Knight-Bishop Swap for Level 4+ Knights
  if (piece.type === 'knight' && piece.level >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const potentialSwapTargetPieceData = board[r_idx][c_idx].piece;
        if (
          potentialSwapTargetPieceData &&
          potentialSwapTargetPieceData.type === 'bishop' &&
          potentialSwapTargetPieceData.color === piece.color &&
          coordsToAlgebraic(r_idx,c_idx) !== square 
        ) {
          possibleMoves.push(coordsToAlgebraic(r_idx, c_idx));
        }
      }
    }
  }

  // Bishop-Knight Swap for Level 4+ Bishops
  if (piece.type === 'bishop' && piece.level >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const potentialSwapTargetPieceData = board[r_idx][c_idx].piece;
        if (
          potentialSwapTargetPieceData &&
          potentialSwapTargetPieceData.type === 'knight' &&
          potentialSwapTargetPieceData.color === piece.color &&
          coordsToAlgebraic(r_idx,c_idx) !== square
        ) {
          possibleMoves.push(coordsToAlgebraic(r_idx, c_idx));
        }
      }
    }
  }


  // Castling logic for King
  if (piece.type === 'king' && !piece.hasMoved && !isKingInCheck(board, piece.color)) {
    const opponentColor = piece.color === 'white' ? 'black' : 'white';
    const kingRow = piece.color === 'white' ? 7 : 0;

    // Kingside Castling (O-O)
    const kingsideRookCol = 7;
    const kingsideRookSquareData = board[kingRow][kingsideRookCol];
    if (kingsideRookSquareData && kingsideRookSquareData.piece && kingsideRookSquareData.piece.type === 'rook' && kingsideRookSquareData.piece.color === piece.color && !kingsideRookSquareData.piece.hasMoved) {
      const fCol = 5; // Square F1/F8
      const gCol = 6; // Square G1/G8
      const fSquareAlg = coordsToAlgebraic(kingRow, fCol);
      const gSquareAlg = coordsToAlgebraic(kingRow, gCol);

      if (!board[kingRow][fCol].piece && !board[kingRow][gCol].piece) { // Squares between King and Rook are empty
        // Check if King passes through or lands on attacked squares
        if (!isSquareAttacked(board, square, opponentColor) && // King's current square (already checked by !isKingInCheck)
            !isSquareAttacked(board, fSquareAlg, opponentColor) &&
            !isSquareAttacked(board, gSquareAlg, opponentColor)) {
          possibleMoves.push(gSquareAlg); // King moves to g1/g8
        }
      }
    }

    // Queenside Castling (O-O-O)
    const queensideRookCol = 0;
    const queensideRookSquareData = board[kingRow][queensideRookCol];
    if (queensideRookSquareData && queensideRookSquareData.piece && queensideRookSquareData.piece.type === 'rook' && queensideRookSquareData.piece.color === piece.color && !queensideRookSquareData.piece.hasMoved) {
      const dCol = 3; // Square D1/D8
      const cCol = 2; // Square C1/C8
      const bCol = 1; // Square B1/B8 (only for path clearance)
      const dSquareAlg = coordsToAlgebraic(kingRow, dCol);
      const cSquareAlg = coordsToAlgebraic(kingRow, cCol);

      if (!board[kingRow][dCol].piece && !board[kingRow][cCol].piece && !board[kingRow][bCol].piece) { // Squares between King and Rook are empty
         // Check if King passes through or lands on attacked squares
         if (!isSquareAttacked(board, square, opponentColor) && 
            !isSquareAttacked(board, dSquareAlg, opponentColor) &&
            !isSquareAttacked(board, cSquareAlg, opponentColor)) {
          possibleMoves.push(cSquareAlg); // King moves to c1/c8
        }
      }
    }
  }

  return possibleMoves;
}

export function applyMove(board: BoardState, move: Move): { newBoard: BoardState, capturedPiece: Piece | null } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);

  const movingPieceOriginal = newBoard[fromRow][fromCol].piece; 
  if (!movingPieceOriginal) return { newBoard: board, capturedPiece: null };

  const targetPieceOriginal = newBoard[toRow][toCol].piece; // Piece on the target square

  // Handle Knight-Bishop Swap OR Bishop-Knight Swap
  const isKnightBishopSwap = 
    movingPieceOriginal.type === 'knight' &&
    movingPieceOriginal.level >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'bishop' &&
    targetPieceOriginal.color === movingPieceOriginal.color;

  const isBishopKnightSwap =
    movingPieceOriginal.type === 'bishop' &&
    movingPieceOriginal.level >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'knight' &&
    targetPieceOriginal.color === movingPieceOriginal.color;

  if (isKnightBishopSwap || isBishopKnightSwap) {
    newBoard[toRow][toCol].piece = { ...movingPieceOriginal, hasMoved: true }; 
    newBoard[fromRow][fromCol].piece = { ...targetPieceOriginal }; // Keep original 'hasMoved' status of the swapped piece
    return { newBoard, capturedPiece: null }; // No capture in a swap
  }

  // Standard move/capture logic
  const capturedPiece = targetPieceOriginal ? { ...targetPieceOriginal } : null;
  
  newBoard[toRow][toCol].piece = { ...movingPieceOriginal };
  newBoard[fromRow][fromCol].piece = null;
  
  const movingPieceRef = newBoard[toRow][toCol].piece!; // Assert non-null as we just placed it

  // Castling: Move the rook
  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { // Check if it was a king and hadn't moved
    const kingStartCol = 4; // 'e' file
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { // Kingside castle (e.g., e1 to g1)
      const rookOriginalCol = 7; // 'h' file
      const rookTargetCol = 5;   // 'f' file
      const rookSquareData = newBoard[fromRow][rookOriginalCol];
      if (rookSquareData && rookSquareData.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
    else if (fromCol === kingStartCol && toCol === kingStartCol - 2) { // Queenside castle (e.g., e1 to c1)
      const rookOriginalCol = 0; // 'a' file
      const rookTargetCol = 3;   // 'd' file
      const rookSquareData = newBoard[fromRow][rookOriginalCol];
      if (rookSquareData && rookSquareData.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
  }
  
  // Update hasMoved for King, Rook, or initial Pawn move
  if (movingPieceRef.type === 'king' || movingPieceRef.type === 'rook' || (movingPieceRef.type === 'pawn' && !movingPieceOriginal.hasMoved && Math.abs(toRow-fromRow) === 2)) {
    movingPieceRef.hasMoved = true;
  }


  // Leveling up based on capture
  if (capturedPiece) {
    switch (capturedPiece.type) {
      case 'pawn':
        movingPieceRef.level += 1;
        break;
      case 'queen':
        movingPieceRef.level += 3;
        break;
      default: // Knight, Bishop, Rook, King
        movingPieceRef.level += 2;
        break;
    }
  }
  
  // Level 4+ Pawn push ability
  if (movingPieceRef.type === 'pawn' && movingPieceRef.level >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; // Skip the pawn's own square
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;

        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const enemyPieceToPush = newBoard[adjRow][adjCol].piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== movingPieceRef.color) {
            const pushTargetRow = adjRow + dr; // Push one step further in the same direction
            const pushTargetCol = adjCol + dc;

            if (pushTargetRow >= 0 && pushTargetRow < 8 && pushTargetCol >= 0 && pushTargetCol < 8) {
              if (!newBoard[pushTargetRow][pushTargetCol].piece) { // If the push-to square is empty
                newBoard[pushTargetRow][pushTargetCol].piece = { ...enemyPieceToPush }; 
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
  let kingPosAlg: AlgebraicSquare | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const pSquare = board[r][c];
      if (!pSquare) continue;
      const p = pSquare.piece;
      if (p && p.type === 'king' && p.color === kingColor) {
        kingPosAlg = coordsToAlgebraic(r,c);
        break;
      }
    }
    if (kingPosAlg) break;
  }

  if (!kingPosAlg) return false; // Should not happen in a normal game

  const opponentColor = kingColor === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPosAlg, opponentColor);
}

// Filters pseudo-legal moves to ensure they don't leave the king in check.
export function filterLegalMoves(
  board: BoardState,
  pieceOriginalSquare: AlgebraicSquare,
  pseudoMoves: AlgebraicSquare[],
  playerColor: PlayerColor
): AlgebraicSquare[] {
  const pieceData = board[algebraicToCoords(pieceOriginalSquare).row][algebraicToCoords(pieceOriginalSquare).col];
  if (!pieceData || !pieceData.piece || pieceData.piece.color !== playerColor) return [];

  return pseudoMoves.filter(targetSquare => {
    // Create a deep copy of the board for simulation
    const tempBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    const pToMoveOriginal = tempBoard[fromR][fromC].piece; 
    
    if (!pToMoveOriginal) return false; // Should not happen if called correctly

    let boardAfterTempMove = tempBoard;
    const pOnTargetSquare = tempBoard[toR][toC].piece;

    // Simulate Knight-Bishop OR Bishop-Knight Swap for legality check
    const isKnightBishopSwapSim = 
      pToMoveOriginal.type === 'knight' &&
      pToMoveOriginal.level >= 4 &&
      pOnTargetSquare &&
      pOnTargetSquare.type === 'bishop' &&
      pOnTargetSquare.color === pToMoveOriginal.color;

    const isBishopKnightSwapSim =
      pToMoveOriginal.type === 'bishop' &&
      pToMoveOriginal.level >= 4 &&
      pOnTargetSquare &&
      pOnTargetSquare.type === 'knight' &&
      pOnTargetSquare.color === pToMoveOriginal.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      boardAfterTempMove[toR][toC].piece = { ...pToMoveOriginal, hasMoved: true };
      boardAfterTempMove[fromR][fromC].piece = { ...pOnTargetSquare };
    } else {
      // Standard move simulation
      boardAfterTempMove[toR][toC].piece = { ...pToMoveOriginal, hasMoved: pToMoveOriginal.hasMoved || pToMoveOriginal.type === 'king' || pToMoveOriginal.type === 'rook' }; 
      boardAfterTempMove[fromR][fromC].piece = null;

      // Simulate rook move for castling legality check
      if (pToMoveOriginal.type === 'king' && !pToMoveOriginal.hasMoved && Math.abs(fromC - toC) === 2) {
          const kingRow = pToMoveOriginal.color === 'white' ? 7 : 0;
          if (toC > fromC) { // Kingside
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow][rookOriginalCol].piece; // Check original board for rook
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveOriginal.color) {
                boardAfterTempMove[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                boardAfterTempMove[kingRow][rookOriginalCol].piece = null;
              }
          } else { // Queenside
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow][rookOriginalCol].piece; // Check original board for rook
               if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveOriginal.color) {
                boardAfterTempMove[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                boardAfterTempMove[kingRow][rookOriginalCol].piece = null;
               }
          }
      }
    }
    return !isKingInCheck(boardAfterTempMove, playerColor);
  });
}


function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r][c];
      if(!squareState) continue;
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
  // Stalemate if not in check and no legal moves
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
    case 'pawn': return isWhite ? '♙' : '♟︎'; // White pawn is outline, black is filled
    default: return '';
  }
}


