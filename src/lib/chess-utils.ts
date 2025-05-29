
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, SquareState, Move, ConversionEvent } from '@/types';

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
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
    // Black pawns
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };

    // White pieces
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
    // Black pieces
    board[0][c].piece = { id: `b${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'black', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
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

function getPieceChar(piece: Piece | null): string {
  if (!piece) return '--'; // Use two characters for empty to distinguish from single char if needed
  let char = '';
  switch (piece.type) {
    case 'pawn': char = 'P'; break;
    case 'knight': char = 'N'; break;
    case 'bishop': char = 'B'; break;
    case 'rook': char = 'R'; break;
    case 'queen': char = 'Q'; break;
    case 'king': char = 'K'; break;
    default: return '??'; // Should not happen
  }
  return piece.color === 'white' ? char.toUpperCase() : char.toLowerCase();
}

export function getCastlingRightsString(board: BoardState): string {
  let rights = "";
  const wKsquare = board[7]?.[4];
  const wK = wKsquare?.piece;
  if (wK && wK.type === 'king' && !wK.hasMoved) {
    const wKRsquare = board[7]?.[7];
    const wKR = wKRsquare?.piece;
    if (wKR && wKR.type === 'rook' && !wKR.hasMoved) {
      rights += "K";
    }
    const wQRsquare = board[7]?.[0];
    const wQR = wQRsquare?.piece;
    if (wQR && wQR.type === 'rook' && !wQR.hasMoved) {
      rights += "Q";
    }
  }

  const bKsquare = board[0]?.[4];
  const bK = bKsquare?.piece;
  if (bK && bK.type === 'king' && !bK.hasMoved) {
    const bKRsquare = board[0]?.[7];
    const bKR = bKRsquare?.piece;
    if (bKR && bKR.type === 'rook' && !bKR.hasMoved) {
      rights += "k";
    }
    const bQRsquare = board[0]?.[0];
    const bQR = bQRsquare?.piece;
    if (bQR && bQR.type === 'rook' && !bQR.hasMoved) {
      rights += "q";
    }
  }
  return rights.length === 0 ? "-" : rights;
}


export function boardToPositionHash(board: BoardState, currentPlayer: PlayerColor, castlingRights: string): string {
  let hash = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = board[r]?.[c];
      const piece = square?.piece;
      if (piece) {
        hash += `${getPieceChar(piece)}L${piece.level || 1}`;
      } else {
        hash += '--'; 
      }
    }
  }
  hash += `_${currentPlayer[0]}`;
  hash += `_${castlingRights}`;
  // Consider adding en passant square if it's part of your game state and relevant for repetition
  return hash;
}


/**
 * Generates pseudo-legal moves for a piece from a given square.
 * "Pseudo-legal" means it checks piece movement rules but NOT if the move leaves the king in check.
 * The checkKingSafety flag is crucial:
 * - true: Used when generating moves for the current player's turn. Includes complex checks like castling.
 * - false: Used by isSquareAttacked. Move generation is simplified, e.g., no castling checks.
 */
export function getPossibleMovesInternal(
    board: BoardState, 
    fromSquare: AlgebraicSquare, 
    piece: Piece, 
    checkKingSafety: boolean, // If true, performs more rigorous checks (like for castling)
): AlgebraicSquare[] {
  if (!piece) return [];
  const possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const toSquare = coordsToAlgebraic(r,c);
      if (isMoveValid(board, fromSquare, toSquare, piece)) {
          possible.push(toSquare);
      }
    }
  }

  // Castling: Only consider if checkKingSafety is true (i.e., generating moves for the actual player)
  if (piece.type === 'king' && checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor)) { 
    const kingRow = pieceColor === 'white' ? 7 : 0;

    if (fromRow === kingRow && fromCol === 4) { // King is on its starting square
        // Kingside Castling (O-O)
        const krSquare = board[kingRow]?.[7];
        if (krSquare?.piece && krSquare.piece.type === 'rook' && !krSquare.piece.hasMoved &&
            !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) { // Path clear
            if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor) && // e1/e8 to f1/f8
                !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor)) { // e1/e8 to g1/g8
                possible.push(coordsToAlgebraic(kingRow, 6)); // King's destination for O-O
            }
        }
        // Queenside Castling (O-O-O)
        const qrSquare = board[kingRow]?.[0];
        if (qrSquare?.piece && qrSquare.piece.type === 'rook' && !qrSquare.piece.hasMoved &&
            !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) { // Path clear
            if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor) && // e1/e8 to d1/d8
                !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor)) { // e1/e8 to c1/c8
                possible.push(coordsToAlgebraic(kingRow, 2)); // King's destination for O-O-O
            }
        }
    }
  }

  // Swap for Knight L4+ with friendly Bishop
  if (piece.type === 'knight' && (piece.level || 1) >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const targetPiece = board[r_idx]?.[c_idx]?.piece;
        if (targetPiece && targetPiece.color === piece.color && targetPiece.type === 'bishop') {
          possible.push(coordsToAlgebraic(r_idx, c_idx));
        }
      }
    }
  }

  // Swap for Bishop L4+ with friendly Knight
  if (piece.type === 'bishop' && (piece.level || 1) >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const targetPiece = board[r_idx]?.[c_idx]?.piece;
        if (targetPiece && targetPiece.color === piece.color && targetPiece.type === 'knight') {
          possible.push(coordsToAlgebraic(r_idx, c_idx));
        }
      }
    }
  }
  
  // This function returns pseudo-legal moves. filterLegalMoves will do the final check.
  return possible;
}

export function isSquareAttacked(board: BoardState, squareToAttack: AlgebraicSquare, attackerColor: PlayerColor): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareState = board[r]?.[c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;

            if (attackingPiece && attackingPiece.color === attackerColor) {
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        return true;
                    }
                } else if (attackingPiece.type === 'king') {
                    // Simplified king attack check for isSquareAttacked to avoid recursion
                    const { row: kingR, col: kingC } = algebraicToCoords(coordsToAlgebraic(r,c));
                    const level = attackingPiece.level || 1;
                    const maxDistance = level >= 2 ? 2 : 1;

                    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
                        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const newRow = kingR + dr;
                            const newCol = kingC + dc;
                            if (newRow === targetR && newCol === targetC) {
                                // For 2-square moves, need to check if intermediate is clear IF it's a straight line
                                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                                    const midR = kingR + Math.sign(dr);
                                    const midC = kingC + Math.sign(dc);
                                    if (board[midR]?.[midC]?.piece) { // Path physically blocked
                                        continue;
                                    }
                                }
                                return true; // King can attack this square
                            }
                        }
                    }
                } else { 
                    // For other pieces, use getPossibleMovesInternal with checkKingSafety = false
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false);
                    if (pseudoMoves.includes(squareToAttack)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to && !(piece.type === 'knight' && (piece.level || 1) >= 5)) return false; 

  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);

  if (toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7) return false; 

  const targetSquareState = board[toRow]?.[toCol];
  const targetPieceOnSquare = targetSquareState?.piece;

  const isKnightBishopSwap =
    piece.type === 'knight' &&
    (piece.level || 1) >= 4 &&
    targetPieceOnSquare &&
    targetPieceOnSquare.type === 'bishop' &&
    targetPieceOnSquare.color === piece.color;

  const isBishopKnightSwap =
    piece.type === 'bishop' &&
    (piece.level || 1) >= 4 &&
    targetPieceOnSquare &&
    targetPieceOnSquare.type === 'knight' &&
    targetPieceOnSquare.color === piece.color;
  
  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color && !isKnightBishopSwap && !isBishopKnightSwap) {
    return false;
  }

  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) { 
    if (isPieceInvulnerableToAttack(targetPieceOnSquare, piece, board)) {
      console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Invuln general). Target ${targetPieceOnSquare.type} (L${targetPieceOnSquare.level}, InvulnTurns: ${targetPieceOnSquare.invulnerableTurnsRemaining}) at ${to} is invulnerable to Attacker ${piece.type} (L${piece.level}) from ${from}.`);
      return false;
    }
  }

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = piece.level || 1;
      // Standard 1-square forward move
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      // Standard 2-square forward move from starting position
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece))
      ) return true;
      // Diagonal capture
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) {
        // Check for Bishop L3+ pawn immunity
        if (targetPieceOnSquare.type === 'bishop' && (targetPieceOnSquare.level || 1) >= 3) {
          console.log(`VIBE_DEBUG: Pawn capture BLOCKED. Target Bishop L${targetPieceOnSquare.level} is immune.`);
          return false;
        }
        return true; 
      }
      // Level 2+: Backward move
      if (levelPawn >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) {
          return true;
        }
      }
      // Level 3+: Sideways move
      if (levelPawn >= 3) {
        if (toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPieceOnSquare) {
          return true;
        }
      }
      return false;
    case 'knight':
      const dRowKnight = Math.abs(toRow - fromRow);
      const dColKnight = Math.abs(toCol - fromCol);
      const knightLevel = piece.level || 1;
      // Standard L-shape
      if ((dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2)) {
        return true;
      }
      // Level 2+: Cardinal 1-square
      if (knightLevel >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return true;
        }
      }
      // Level 3+: Cardinal 3-square jump
      if (knightLevel >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            return true;
        }
      }
      // Level 4+: Swap with friendly Bishop
      if (knightLevel >= 4 && targetPieceOnSquare && targetPieceOnSquare.type === 'bishop' && targetPieceOnSquare.color === piece.color) {
          return true; 
      }
      // Level 5+: Self-destruct (move to own square)
      if (knightLevel >=5 && from === to) {
          return true;
      }
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; 
      if (fromRow === toRow) { 
        const step = toCol > fromCol ? 1 : -1;
        for (let c = fromCol + step; c !== toCol; c += step) {
          if (board[fromRow]?.[c]?.piece) return false; 
        }
      } else { 
        const step = toRow > fromRow ? 1 : -1;
        for (let r = fromRow + step; r !== toRow; r += step) {
          if (board[r]?.[fromCol]?.piece) return false; 
        }
      }
      return true;
    case 'bishop':
      const bishopLevel = piece.level || 1;
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false; 
      const dRowBishop = toRow > fromRow ? 1 : -1;
      const dColBishop = toCol > fromCol ? 1 : -1;
      let rBishop = fromRow + dRowBishop;
      let cBishop = fromCol + dColBishop;
      while (rBishop !== toRow) {
        const pathPiece = board[rBishop]?.[cBishop]?.piece;
        if (pathPiece) {
          if (bishopLevel >= 2 && pathPiece.color === piece.color) {
            // Bishop L2+ jumps friendly
          } else {
            return false; 
          }
        }
        rBishop += dRowBishop;
        cBishop += dColBishop;
      }
       // Level 4+: Swap with friendly Knight
      if (bishopLevel >= 4 && targetPieceOnSquare && targetPieceOnSquare.type === 'knight' && targetPieceOnSquare.color === piece.color) {
        return true;
      }
      return true;
    case 'queen':
      const isRookMove = fromRow === toRow || fromCol === toCol;
      const isBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isRookMove && !isBishopMove) return false;

      if (isRookMove) { 
        if (fromRow === toRow) {
          const step = toCol > fromCol ? 1 : -1;
          for (let c = fromCol + step; c !== toCol; c += step) {
            if (board[fromRow]?.[c]?.piece) return false;
          }
        } else {
          const step = toRow > fromRow ? 1 : -1;
          for (let r = fromRow + step; r !== toRow; r += step) {
            if (board[r]?.[fromCol]?.piece) return false;
          }
        }
      } else { // Bishop-like move
        const dRowQueen = toRow > fromRow ? 1 : -1;
        const dColQueen = toCol > fromCol ? 1 : -1;
        let rQueen = fromRow + dRowQueen;
        let cQueen = fromCol + dColQueen;
        while (rQueen !== toRow) {
          if (board[rQueen]?.[cQueen]?.piece) return false;
          rQueen += dRowQueen;
          cQueen += dColQueen;
        }
      }
      return true;
    case 'king':
      const kingLevel = piece.level || 1;
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);

      // Level 1: Standard 1-square move
      if (dRowKing <= 1 && dColKing <= 1) {
        return true;
      }
      // Level 2-4: Adds 2-square straight line moves (intermediate must be empty)
      if (kingLevel >= 2 && kingLevel <= 4) {
        if ((dRowKing === 2 && dColKing === 0) || (dRowKing === 0 && dColKing === 2) || (dRowKing === 2 && dColKing === 2)) {
            const midRow = fromRow + Math.sign(toRow - fromRow);
            const midCol = fromCol + Math.sign(toCol - fromCol);
            if (board[midRow]?.[midCol]?.piece) {
              return false; // Path blocked
            }
            return true;
        }
      }
      // Level 5+: Adds L-shaped Knight moves
      if (kingLevel >= 5) {
          if ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2)) {
              return true;
          }
      }
      // Castling move shape basic check: if it's a 2-square horizontal move from King's start, allow. Full validation is in getPossibleMovesInternal.
      // This was removed to prevent "checkKingSafety is not defined error". Castling logic fully in getPossibleMovesInternal.
      return false;
    default:
      return false;
  }
}

export function isPieceInvulnerableToAttack(targetPiece: Piece, attackingPiece: Piece, board: BoardState): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = targetPiece.level || 1;
    const attackerLevel = attackingPiece.level || 1;

    // Rook temporary invulnerability (L3+)
    if (targetPiece.type === 'rook' && targetLevel >= 3 && targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
      console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Rook Invuln). Target Rook ${targetPiece.id} (L${targetLevel}) at some square is invulnerable (Turns: ${targetPiece.invulnerableTurnsRemaining}). Attacker: ${attackingPiece.type} (L${attackerLevel}).`);
      return true;
    }
    // Queen Royal Guard (L5+ vs lower level)
    if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
      console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Queen Invuln). Target Queen ${targetPiece.id} (L${targetLevel}) at some square is invulnerable to Attacker ${attackingPiece.type} (L${attackerLevel}).`);
      return true;
    }
    // Bishop Pawn Immunity (L3+)
    if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
       console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Bishop Pawn Immunity). Target Bishop ${targetPiece.id} (L${targetLevel}) at some square is immune to Pawn Attacker ${attackingPiece.id} (L${attackerLevel}).`);
      return true;
    }
    return false;
}


export function applyMove(
  board: BoardState,
  move: Move
): { newBoard: BoardState, capturedPiece: Piece | null, conversionEvents: ConversionEvent[], originalPieceLevel?: number } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  const conversionEvents: ConversionEvent[] = [];

  const movingPieceOriginal = newBoard[fromRow]?.[fromCol]?.piece;
  if (!movingPieceOriginal) return { newBoard: board, capturedPiece: null, conversionEvents, originalPieceLevel: undefined }; 

  const originalPieceLevel = movingPieceOriginal.level; // Store original level before modification
  const targetPieceOriginal = newBoard[toRow]?.[toCol]?.piece; 

  const isKnightBishopSwap =
    movingPieceOriginal.type === 'knight' &&
    (movingPieceOriginal.level || 1) >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'bishop' &&
    targetPieceOriginal.color === movingPieceOriginal.color;

  const isBishopKnightSwap =
    movingPieceOriginal.type === 'bishop' &&
    (movingPieceOriginal.level || 1) >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'knight' &&
    targetPieceOriginal.color === movingPieceOriginal.color;

  if (isKnightBishopSwap || isBishopKnightSwap) {
    const movingPieceCopy = { ...movingPieceOriginal, hasMoved: true };
    const targetPieceCopy = { ...targetPieceOriginal, hasMoved: targetPieceOriginal.hasMoved || false }; 

    newBoard[toRow][toCol].piece = movingPieceCopy; 
    newBoard[fromRow][fromCol].piece = targetPieceCopy; 
    return { newBoard, capturedPiece: null, conversionEvents, originalPieceLevel };
  }

  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginal.color) ? { ...targetPieceOriginal } : null;

  // Apply move to newBoard (use a copy of movingPieceOriginal to avoid modifying it before level checks)
  const movingPieceCopyForMove = { ...movingPieceOriginal, invulnerableTurnsRemaining: movingPieceOriginal.invulnerableTurnsRemaining || 0 };
  newBoard[toRow][toCol].piece = movingPieceCopyForMove;
  newBoard[fromRow][fromCol].piece = null;

  const movingPieceRef = newBoard[toRow]?.[toCol]?.piece; // This is now the piece on the 'to' square
  if (!movingPieceRef) return { newBoard, capturedPiece, conversionEvents, originalPieceLevel }; 

  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { 
    const kingStartCol = 4; 
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { // Kingside castle
      const rookOriginalCol = 7; 
      const rookTargetCol = 5;   
      const rookSquareData = board[fromRow]?.[rookOriginalCol]; // Use original board to find the rook
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
    else if (fromCol === kingStartCol && toCol === kingStartCol - 2) { // Queenside castle
      const rookOriginalCol = 0; 
      const rookTargetCol = 3;   
      const rookSquareData = board[fromRow]?.[rookOriginalCol]; // Use original board
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
  }

  movingPieceRef.hasMoved = true;

  if (capturedPiece) {
    const levelBeforeCapture = movingPieceOriginal.level || 1; 
    let levelGain = 0;
    switch (capturedPiece.type) {
      case 'pawn': levelGain = 1; break;
      case 'knight': levelGain = 2; break;
      case 'bishop': levelGain = 2; break;
      case 'rook': levelGain = 2; break;
      case 'queen': levelGain = 3; break;
      default: levelGain = 0; break;
    }
    movingPieceRef.level = Math.min(6, (movingPieceOriginal.level || 1) + levelGain);
    
    if (movingPieceRef.type === 'rook' && movingPieceRef.level >= 3 && movingPieceRef.level > levelBeforeCapture) {
        movingPieceRef.invulnerableTurnsRemaining = 1;
        console.log(`VIBE_DEBUG: Setting invulnerableTurnsRemaining=1 for Rook ${movingPieceRef.id} (L${movingPieceRef.level}) at ${coordsToAlgebraic(toRow,toCol)} due to LEVEL-UP via capture.`);
    }
  }

  // Pawn Push-Back (L4+)
  if (movingPieceRef.type === 'pawn' && (movingPieceRef.level || 1) >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;

        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const enemyPieceToPushSquare = newBoard[adjRow]?.[adjCol];
          const enemyPieceToPush = enemyPieceToPushSquare?.piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== movingPieceRef.color) {
            const pushTargetRow = adjRow + dr; 
            const pushTargetCol = adjCol + dc;

            if (pushTargetRow >= 0 && pushTargetRow < 8 && pushTargetCol >= 0 && pushTargetCol < 8) {
              if (!newBoard[pushTargetRow]?.[pushTargetCol]?.piece) { 
                newBoard[pushTargetRow][pushTargetCol].piece = { ...enemyPieceToPush }; 
                newBoard[adjRow][adjCol].piece = null; 
              }
            }
          }
        }
      }
    }
  }

  // Bishop Conversion (L5+)
  if (movingPieceRef.type === 'bishop' && (movingPieceRef.level || 1) >= 5) {
    const bishopColor = movingPieceRef.color;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 
        const adjRow = toRow + dr;
        const adjCol = toCol + dc;
        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const adjacentSquareState = newBoard[adjRow]?.[adjCol];
          const pieceOnAdjSquare = adjacentSquareState?.piece;
          if (pieceOnAdjSquare && pieceOnAdjSquare.color !== bishopColor && pieceOnAdjSquare.type !== 'king') {
            if (Math.random() < 0.5) { 
              const originalPieceCopy = { ...pieceOnAdjSquare };
              const convertedPiece: Piece = {
                ...pieceOnAdjSquare, 
                color: bishopColor, 
                id: `conv_${pieceOnAdjSquare.id}_${Date.now()}` 
              };
              newBoard[adjRow][adjCol].piece = convertedPiece;
              conversionEvents.push({
                originalPiece: originalPieceCopy,
                convertedPiece: convertedPiece,
                byPiece: movingPieceRef,
                at: coordsToAlgebraic(adjRow, adjCol)
              });
            }
          }
        }
      }
    }
  }

  return { newBoard, capturedPiece, conversionEvents, originalPieceLevel };
}


export function isKingInCheck(board: BoardState, kingColor: PlayerColor): boolean {
  let kingPosAlg: AlgebraicSquare | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const pSquare = board[r]?.[c];
      if (!pSquare) continue;
      const p = pSquare.piece;
      if (p && p.type === 'king' && p.color === kingColor) {
        kingPosAlg = coordsToAlgebraic(r,c);
        break;
      }
    }
    if (kingPosAlg) break;
  }

  if (!kingPosAlg) return false; 

  const opponentColor = kingColor === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPosAlg, opponentColor);
}

export function filterLegalMoves(
  board: BoardState,
  pieceOriginalSquare: AlgebraicSquare,
  pseudoMoves: AlgebraicSquare[],
  playerColor: PlayerColor
): AlgebraicSquare[] {
  const pieceData = board[algebraicToCoords(pieceOriginalSquare).row]?.[algebraicToCoords(pieceOriginalSquare).col];
  if (!pieceData || !pieceData.piece || pieceData.piece.color !== playerColor) return [];
  const originalMovingPiece = pieceData.piece;

  return pseudoMoves.filter(targetSquare => {
    const tempBoardState = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    
    const pToMove = { ...originalMovingPiece }; 

    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;

    const isKnightBishopSwapSim =
      pToMove.type === 'knight' && (pToMove.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'bishop' && targetPieceForSim.color === pToMove.color;
    const isBishopKnightSwapSim =
      pToMove.type === 'bishop' && (pToMove.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'knight' && targetPieceForSim.color === pToMove.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      tempBoardState[toR][toC].piece = { ...pToMove, hasMoved: true };
      tempBoardState[fromR][fromC].piece = targetPieceForSim ? { ...(targetPieceForSim as Piece), hasMoved: targetPieceForSim.hasMoved || false } : null;
    } else {
      tempBoardState[toR][toC].piece = { ...pToMove, hasMoved: true };
      tempBoardState[fromR][fromC].piece = null;

      // Simulate Rook movement for castling
      if (pToMove.type === 'king' && !originalMovingPiece.hasMoved && Math.abs(fromC - toC) === 2) { 
          const kingRow = pToMove.color === 'white' ? 7 : 0;
          if (toC > fromC) { // Kingside
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; // Check original board for rook
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMove.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
              }
          } else { // Queenside
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; // Check original board
               if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMove.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
               }
          }
      }
    }
    return !isKingInCheck(tempBoardState, playerColor);
  });
}

export function getPossibleMoves(board: BoardState, fromSquare: AlgebraicSquare): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(fromSquare);
    const squareState = board[row]?.[col];
    if (!squareState || !squareState.piece) return [];
    
    const piece = squareState.piece;
    // When generating moves for the current player, we want full safety checks, including castling validation.
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true); 
    return pseudoMoves;
}

function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r]?.[c];
      if(!squareState) continue;
      const piece = squareState.piece;
      if (piece && piece.color === playerColor) {
        const pieceSquareAlgebraic = squareState.algebraic;
        const legalMoves = filterLegalMoves(board, pieceSquareAlgebraic, getPossibleMovesInternal(board, pieceSquareAlgebraic, piece, true), playerColor);
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
    case 'knight': return isWhite ? '♘' : '♞'; // Corrected Black Knight
    case 'pawn': return isWhite ? '♙' : '♟︎'; 
    default: return '';
  }
}

    