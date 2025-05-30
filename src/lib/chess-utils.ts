
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

  for (let c = 0; c < 8; c++) {
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, hasMoved: false };
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, hasMoved: false };
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1, hasMoved: false };
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

function getPieceChar(piece: Piece | null): string {
  if (!piece) return '--';
  let char = '';
  switch (piece.type) {
    case 'pawn': char = 'P'; break;
    case 'knight': char = 'N'; break;
    case 'bishop': char = 'B'; break;
    case 'rook': char = 'R'; break;
    case 'queen': char = 'Q'; break;
    case 'king': char = 'K'; break;
    default: return '??';
  }
  return piece.color === 'white' ? char.toUpperCase() : char.toLowerCase();
}

export function getCastlingRightsString(board: BoardState): string {
  let rights = "";
  const wKingSquare = board[7]?.[4];
  if (wKingSquare?.piece?.type === 'king' && wKingSquare.piece.color === 'white' && !wKingSquare.piece.hasMoved) {
    if (board[7]?.[7]?.piece?.type === 'rook' && !board[7][7].piece.hasMoved) rights += "K";
    if (board[7]?.[0]?.piece?.type === 'rook' && !board[7][0].piece.hasMoved) rights += "Q";
  }
  const bKingSquare = board[0]?.[4];
  if (bKingSquare?.piece?.type === 'king' && bKingSquare.piece.color === 'black' && !bKingSquare.piece.hasMoved) {
    if (board[0]?.[7]?.piece?.type === 'rook' && !board[0][7].piece.hasMoved) rights += "k";
    if (board[0]?.[0]?.piece?.type === 'rook' && !board[0][0].piece.hasMoved) rights += "q";
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
  return hash;
}


export function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean, // This flag is important
): AlgebraicSquare[] {
  if (!piece) return [];
  const possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';

  if (piece.type === 'king') {
    const level = piece.level || 1;
    const maxDistance = level >= 2 ? 2 : 1;

    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (!isValidSquare(toR, toC)) continue;

            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                const midR = fromRow + Math.sign(dr);
                const midC = fromCol + Math.sign(dc);
                if (!isValidSquare(midR, midC) || board[midR]?.[midC]?.piece) continue; // Path blocked or mid square invalid
                if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor)) {
                    continue; // Intermediate square is attacked
                }
            }
            const targetPiece = board[toR]?.[toC]?.piece;
            if (!targetPiece || targetPiece.color !== pieceColor) {
                 if (!isPieceInvulnerableToAttack(targetPiece, piece, board)) { // Pass full board
                    possible.push(coordsToAlgebraic(toR, toC));
                }
            }
        }
    }
    if (level >= 5) { // Knight moves for L5+ King
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightDeltas) {
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (isValidSquare(toR, toC)) {
                const targetPiece = board[toR]?.[toC]?.piece;
                if (!targetPiece || targetPiece.color !== pieceColor) {
                     if (!isPieceInvulnerableToAttack(targetPiece, piece, board)) { // Pass full board
                        possible.push(coordsToAlgebraic(toR, toC));
                    }
                }
            }
        }
    }
    // Castling logic
    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        // Check king is on its original square (e.g., e1 or e8)
        if (fromRow === kingRow && fromCol === 4) {
            // Kingside
            const krSquare = board[kingRow]?.[7];
            if (krSquare?.piece?.type === 'rook' && !krSquare.piece.hasMoved &&
                !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) { // Squares between king and rook are empty
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor)) { // King doesn't pass through or land on attacked square
                    possible.push(coordsToAlgebraic(kingRow, 6));
                }
            }
            // Queenside
            const qrSquare = board[kingRow]?.[0];
            if (qrSquare?.piece?.type === 'rook' && !qrSquare.piece.hasMoved &&
                !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) { // Squares between king and rook are empty
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor)) { // King doesn't pass through or land on attacked square
                    possible.push(coordsToAlgebraic(kingRow, 2));
                }
            }
        }
    }
  } else { // For pieces other than King
    // This is a fallback/general approach; specific piece logic is more efficient.
    // However, we need to ensure all special moves are generated here if not by isMoveValid.
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const toSquare = coordsToAlgebraic(r,c);
          if (isMoveValid(board, fromSquare, toSquare, piece)) { // isMoveValid should handle all basic moves and captures
              possible.push(toSquare);
          }
        }
      }
  }

  // Add special moves like Knight/Bishop swaps if applicable (not covered by generic isMoveValid)
  if (piece.type === 'knight' && (piece.level || 1) >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const targetPiece = board[r_idx]?.[c_idx]?.piece;
        if (targetPiece && targetPiece.color === piece.color && targetPiece.type === 'bishop') {
          possible.push(coordsToAlgebraic(r_idx, c_idx)); // The target square is the Bishop's square
        }
      }
    }
  }
  if (piece.type === 'bishop' && (piece.level || 1) >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const targetPiece = board[r_idx]?.[c_idx]?.piece;
        if (targetPiece && targetPiece.color === piece.color && targetPiece.type === 'knight') {
          possible.push(coordsToAlgebraic(r_idx, c_idx)); // The target square is the Knight's square
        }
      }
    }
  }
  // Knight L5 self-destruct is a "re-selection" action, not a move to a new square,
  // so it's handled differently in UI logic usually, not directly as a "possible move" here.

  return possible;
}

export function isValidSquare(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function isSquareAttacked(board: BoardState, squareToAttack: AlgebraicSquare, attackerColor: PlayerColor): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareState = board[r]?.[c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;

            if (attackingPiece && attackingPiece.color === attackerColor) {
                // For Pawn attacks, check directly without full move generation to avoid recursion
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        // Check invulnerability of potential piece on target square to this pawn attack
                        const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                        if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, board)) {
                             return true;
                        }
                    }
                } else if (attackingPiece.type === 'king') { // Simplified king attack check
                    const { row: kingR, col: kingC } = algebraicToCoords(coordsToAlgebraic(r, c));
                    const level = attackingPiece.level || 1;
                    const maxDistance = level >= 2 ? 2 : 1;

                    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
                        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const newRow = kingR + dr;
                            const newCol = kingC + dc;
                            if (newRow === targetR && newCol === targetC) {
                                // Check path for 2-square move
                                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                                    const midR = kingR + Math.sign(dr);
                                    const midC = kingC + Math.sign(dc);
                                    if (board[midR]?.[midC]?.piece) { // Path blocked
                                        continue;
                                    }
                                }
                                const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                                if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, board)) {
                                    return true;
                                }
                            }
                        }
                    }
                    if (level >= 5) { // Knight moves for L5+ King
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr, dc] of knightDeltas) {
                            if (kingR + dr === targetR && kingC + dc === targetC) {
                                const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                                if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, board)) {
                                    return true;
                                }
                            }
                        }
                    }

                } else {
                    // For other pieces, use a simplified pseudo-move generation that doesn't check king safety to avoid recursion
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false); // checkKingSafety = false
                    if (pseudoMoves.includes(squareToAttack)) {
                        const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                         if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, board)) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}


export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to && !(piece.type === 'knight' && (piece.level || 1) >= 5)) return false; // Knight L5 can "move" to same square for self-destruct

  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);

  if (!isValidSquare(toRow, toCol)) return false;

  const targetSquareState = board[toRow]?.[toCol];
  const targetPieceOnSquare = targetSquareState?.piece;

  // Check for Knight/Bishop swap first as it's a special move type
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

  if (isKnightBishopSwap || isBishopKnightSwap) return true; // Swap is a valid "move" to that square

  // Standard move/capture validation
  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color) {
    return false; // Cannot capture own piece (unless it's a swap, handled above)
  }
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) {
    // If it's a capture, check invulnerability
    if (isPieceInvulnerableToAttack(targetPieceOnSquare, piece, board)) {
      return false; // Target is invulnerable
    }
  }

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = piece.level || 1;
      // Standard 1-square forward move
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      // Initial 2-square forward move
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece))
      ) return true;
      // Diagonal capture
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) {
        // Invulnerability is already checked above for all captures
        return true;
      }
      // Backward L2+
      if (levelPawn >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) {
          return true;
        }
      }
      // Sideways L3+
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
      // Cardinal 1 (L2+)
      if (knightLevel >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return true;
        }
      }
      // Cardinal 3 Jump (L3+)
      if (knightLevel >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            // No path check needed for knight jumps
            return true;
        }
      }
      // Swap already handled. Self-destruct (L5+) is a special case not a typical move to 'to'.
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; // Must be horizontal or vertical
      // Path check
      if (fromRow === toRow) { // Horizontal move
        const step = toCol > fromCol ? 1 : -1;
        for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
          if (board[fromRow]?.[c_path]?.piece) return false; // Path blocked
        }
      } else { // Vertical move
        const step = toRow > fromRow ? 1 : -1;
        for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
          if (board[r_path]?.[fromCol]?.piece) return false; // Path blocked
        }
      }
      return true;
    case 'bishop':
      const bishopLevel = piece.level || 1;
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false; // Must be diagonal
      // Path check
      const dRowDirBishop = Math.sign(toRow - fromRow);
      const dColDirBishop = Math.sign(toCol - fromCol);
      let currRBishop = fromRow + dRowDirBishop;
      let currCBishop = fromCol + dColDirBishop;

      while (currRBishop !== toRow || currCBishop !== toCol) {
          if (!isValidSquare(currRBishop, currCBishop)) return false; // Should not happen if 'to' is valid
          const pathPiece = board[currRBishop]?.[currCBishop]?.piece;
          if (pathPiece) {
            if (bishopLevel >= 2 && pathPiece.color === piece.color) {
              // L2+ Bishop can phase through own piece
            } else {
              return false; // Path blocked by enemy or non-phasable friendly
            }
          }
          currRBishop += dRowDirBishop;
          currCBishop += dColDirBishop;
      }
      // Swap already handled
      return true;
    case 'queen':
      const isQueenRookMove = fromRow === toRow || fromCol === toCol;
      const isQueenBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isQueenRookMove && !isQueenBishopMove) return false; // Must be rook-like or bishop-like

      // Path check (Queen does not phase)
      if (isQueenRookMove) {
        if (fromRow === toRow) { // Horizontal
          const step = toCol > fromCol ? 1 : -1;
          for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
            if (board[fromRow]?.[c_path]?.piece) return false;
          }
        } else { // Vertical
          const step = toRow > fromRow ? 1 : -1;
          for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
            if (board[r_path]?.[fromCol]?.piece) return false;
          }
        }
      } else { // Diagonal
        const dRowDirQueen = Math.sign(toRow - fromRow);
        const dColDirQueen = Math.sign(toCol - fromCol);
        let currRQueen = fromRow + dRowDirQueen;
        let currCQueen = fromCol + dColDirQueen;

        while (currRQueen !== toRow || currCQueen !== toCol) {
            if (!isValidSquare(currRQueen, currCQueen)) return false;
            if (board[currRQueen]?.[currCQueen]?.piece) {
                return false; // Path blocked
            }
            currRQueen += dRowDirQueen;
            currCQueen += dColDirQueen;
        }
      }
      return true;
    case 'king':
      const kingLevel = piece.level || 1;
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);

      const maxKingDistance = kingLevel >= 2 ? 2 : 1;

      // L5+ Knight moves
      if (kingLevel >= 5 && ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2))) {
        return true;
      }
      // Standard/Extended Reach (1 or 2 squares)
      if (dRowKing <= maxKingDistance && dColKing <= maxKingDistance) {
        // If moving 2 squares linearly, check intermediate square
        if (maxKingDistance === 2 && (dRowKing === 2 || dColKing === 2) && (dRowKing === 0 || dColKing === 0 || dRowKing === dColKing)) {
            const midRow = fromRow + Math.sign(toRow - fromRow);
            const midCol = fromCol + Math.sign(toCol - fromCol);
            if (board[midRow]?.[midCol]?.piece) { // Intermediate square must be empty
                return false;
            }
            // The check for the intermediate square being attacked is handled by filterLegalMoves using isSquareAttacked.
        }
        return true;
      }
      // Castling: handled by getPossibleMovesInternal and filterLegalMoves due to complexity.
      // isMoveValid focuses on direct piece movement rules.
      return false;
    default:
      return false;
  }
}

// This function is used by the main game logic, not the AI directly for its invulnerability checks.
// The AI has its own isPieceInvulnerableToAttack method.
export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece, board: BoardState): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = targetPiece.level || 1;
    const attackerLevel = attackingPiece.level || 1;

    // Rule: Queen L5+ vs. lower level attacker
    if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
      return true;
    }
    // Rule: Bishop L3+ vs. Pawn attacker
    if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
      return true;
    }
    // Note: Rook L3+ invulnerability (if it existed) would be a state on the piece (e.g. invulnerableTurnsRemaining)
    // The current rules have Rook L3+ as resurrection.
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

  const movingPieceOriginalRef = newBoard[fromRow]?.[fromCol]?.piece;
  if (!movingPieceOriginalRef) {
    console.error("applyMove: No piece at source", move.from);
    return { newBoard: board, capturedPiece: null, conversionEvents, originalPieceLevel: undefined };
  }

  const originalPieceLevel = movingPieceOriginalRef.level || 1;
  const targetPieceOriginal = newBoard[toRow]?.[toCol]?.piece; // Piece on the 'to' square before move

  // Handle Knight/Bishop Swaps
  const isKnightBishopSwap =
    movingPieceOriginalRef.type === 'knight' &&
    (movingPieceOriginalRef.level || 1) >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'bishop' &&
    targetPieceOriginal.color === movingPieceOriginalRef.color;

  const isBishopKnightSwap =
    movingPieceOriginalRef.type === 'bishop' &&
    (movingPieceOriginalRef.level || 1) >= 4 &&
    targetPieceOriginal &&
    targetPieceOriginal.type === 'knight' &&
    targetPieceOriginal.color === movingPieceOriginalRef.color;

  if (isKnightBishopSwap || isBishopKnightSwap) {
    const movingPieceCopy = { ...movingPieceOriginalRef, hasMoved: true };
    const targetPieceCopy = { ...targetPieceOriginal!, hasMoved: targetPieceOriginal!.hasMoved || true }; // Ensure target also marked as moved if not already
    newBoard[toRow][toCol].piece = movingPieceCopy;
    newBoard[fromRow][fromCol].piece = targetPieceCopy;
    return { newBoard, capturedPiece: null, conversionEvents, originalPieceLevel };
  }

  // Standard move/capture
  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginalRef.color) ? { ...targetPieceOriginal } : null;
  
  // Take a fresh copy of the moving piece for modification
  const movingPieceForToSquare = { ...movingPieceOriginalRef };

  newBoard[toRow][toCol].piece = movingPieceForToSquare; // Place piece on 'to' square
  newBoard[fromRow][fromCol].piece = null; // Clear 'from' square

  const pieceNowOnToSquare = newBoard[toRow]?.[toCol]?.piece; // Get reference to the piece that just moved
  if (!pieceNowOnToSquare) {
     // This should not happen if movingPieceForToSquare was valid
    console.error("applyMove: Piece became null after placing on 'to' square", move.to);
    return { newBoard, capturedPiece, conversionEvents, originalPieceLevel };
  }


  // Handle Castling: Update Rook position
  if (pieceNowOnToSquare.type === 'king' && !movingPieceOriginalRef.hasMoved) { // Check original hasMoved for castling eligibility
    const kingStartCol = 4;
    if (fromCol === kingStartCol && Math.abs(fromCol - toCol) === 2) { // King moved 2 squares from start
      const kingRow = fromRow; // King's row
      const rookOriginalCol = toCol > fromCol ? 7 : 0; // Kingside or Queenside rook
      const rookTargetCol = toCol > fromCol ? 5 : 3;  // Rook's new column
      
      const rookSquareData = board[kingRow]?.[rookOriginalCol]; // Check original board for rook
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === pieceNowOnToSquare.color) {
        newBoard[kingRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[kingRow][rookOriginalCol].piece = null;
      }
    }
  }
  pieceNowOnToSquare.hasMoved = true; // Mark piece as moved


  // Level up on capture
  if (capturedPiece) {
    let levelGain = 0;
    switch (capturedPiece.type) {
      case 'pawn': levelGain = 1; break;
      case 'knight': levelGain = 2; break;
      case 'bishop': levelGain = 2; break;
      case 'rook': levelGain = 2; break;
      case 'queen': levelGain = 3; break;
      default: levelGain = 0; break;
    }
    // Use originalPieceLevel (level from 'from' square before this move) as base
    pieceNowOnToSquare.level = Math.min(6, originalPieceLevel + levelGain);
  }


  // Handle Pawn Promotion
  if (pieceNowOnToSquare.type === 'pawn' && (toRow === 0 || toRow === 7)) {
    if (move.promoteTo) { // Promotion type should be specified in the move object
      const promotedPieceBaseLevel = 1; // Promoted pieces start at L1
      let finalPromotedLevel = promotedPieceBaseLevel;

      // If promotion involved a capture, and it's to a Rook, level up the new Rook immediately
      // This is specific for Rook resurrection synergy. Other promotions just become L1.
      if (capturedPiece && move.promoteTo === 'rook') {
        let levelGainFromCapture = 0;
        switch (capturedPiece.type) {
          case 'pawn': levelGainFromCapture = 1; break;
          case 'knight': levelGainFromCapture = 2; break;
          case 'bishop': levelGainFromCapture = 2; break;
          case 'rook': levelGainFromCapture = 2; break;
          case 'queen': levelGainFromCapture = 3; break;
        }
        finalPromotedLevel = Math.min(6, promotedPieceBaseLevel + levelGainFromCapture);
      }
      
      pieceNowOnToSquare.type = move.promoteTo;
      pieceNowOnToSquare.level = finalPromotedLevel;
      // ID update can happen in page.tsx to include promo type
    }
    // If move.promoteTo is not set, it remains a pawn (though this shouldn't happen for a valid promotion)
  }


  // Pawn L4+ Push-Back
  if (pieceNowOnToSquare.type === 'pawn' && (pieceNowOnToSquare.level || 1) >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; // Skip the pawn's own square
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;
        if (isValidSquare(adjRow, adjCol)) {
          const enemyPieceToPushSquare = newBoard[adjRow]?.[adjCol];
          const enemyPieceToPush = enemyPieceToPushSquare?.piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== pieceNowOnToSquare.color) {
            const pushTargetRow = adjRow + dr; // Push in the same direction from the pawn
            const pushTargetCol = adjCol + dc;
            if (isValidSquare(pushTargetRow, pushTargetCol)) {
              if (!newBoard[pushTargetRow]?.[pushTargetCol]?.piece) { // If destination is empty
                newBoard[pushTargetRow][pushTargetCol].piece = { ...enemyPieceToPush }; // Move piece
                newBoard[adjRow][adjCol].piece = null; // Vacate original square
              }
            }
          }
        }
      }
    }
  }

  // Bishop L5+ Conversion
  if (pieceNowOnToSquare.type === 'bishop' && (pieceNowOnToSquare.level || 1) >= 5) {
    const bishopColor = pieceNowOnToSquare.color;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const adjRow = toRow + dr;
        const adjCol = toCol + dc;
        if (isValidSquare(adjRow, adjCol)) {
          const adjacentSquareState = newBoard[adjRow]?.[adjCol];
          const pieceOnAdjSquare = adjacentSquareState?.piece;
          if (pieceOnAdjSquare && pieceOnAdjSquare.color !== bishopColor && pieceOnAdjSquare.type !== 'king') { // Cannot convert Kings
            if (Math.random() < 0.5) { // 50% chance
              const originalPieceCopy = { ...pieceOnAdjSquare }; // For the event
              const convertedPiece: Piece = {
                ...pieceOnAdjSquare, // Keep type, level, hasMoved status from original
                color: bishopColor, // Change color
                id: `conv_${pieceOnAdjSquare.id}_${Date.now()}` // New unique ID
              };
              newBoard[adjRow][adjCol].piece = convertedPiece;
              conversionEvents.push({
                originalPiece: originalPieceCopy,
                convertedPiece: convertedPiece,
                byPiece: { ...pieceNowOnToSquare }, // The Bishop that caused conversion
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
  if (!kingPosAlg) {
    // If king is not on the board, effectively means it's captured/game over, so treat as "in check" for game state evaluation.
    return true;
  }
  const opponentColor = kingColor === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPosAlg, opponentColor);
}


export function filterLegalMoves(
  board: BoardState,
  pieceOriginalSquare: AlgebraicSquare, // The square the piece is currently on
  pseudoMoves: AlgebraicSquare[], // List of squares the piece *could* move to based on its pattern
  playerColor: PlayerColor // The color of the player whose piece is being moved
): AlgebraicSquare[] {
  const fromSquareState = board[algebraicToCoords(pieceOriginalSquare).row]?.[algebraicToCoords(pieceOriginalSquare).col];
  if (!fromSquareState || !fromSquareState.piece || fromSquareState.piece.color !== playerColor) return [];
  
  const originalMovingPiece = fromSquareState.piece;

  return pseudoMoves.filter(targetSquare => {
    // Create a deep copy of the board for simulation
    const tempBoardState = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);

    // Simulate the move on the temporary board
    const pieceToMoveCopy = { ...originalMovingPiece };
    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;

    // Handle special moves like Knight/Bishop swaps for simulation
    const isKnightBishopSwapSim =
      pieceToMoveCopy.type === 'knight' && (pieceToMoveCopy.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'bishop' && targetPieceForSim.color === pieceToMoveCopy.color;
    const isBishopKnightSwapSim =
      pieceToMoveCopy.type === 'bishop' && (pieceToMoveCopy.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'knight' && targetPieceForSim.color === pieceToMoveCopy.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      tempBoardState[toR][toC].piece = { ...pieceToMoveCopy, hasMoved: true };
      // Ensure the swapped piece retains its original 'hasMoved' status or becomes true
      tempBoardState[fromR][fromC].piece = targetPieceForSim ? { ...(targetPieceForSim as Piece), hasMoved: targetPieceForSim.hasMoved || true } : null;
    } else {
      // Standard move simulation
      tempBoardState[toR][toC].piece = { ...pieceToMoveCopy, hasMoved: true };
      tempBoardState[fromR][fromC].piece = null;

      // Simulate Rook movement for Castling
      if (pieceToMoveCopy.type === 'king' && !originalMovingPiece.hasMoved && Math.abs(fromC - toC) === 2) { // Castling move
          const kingRow = pieceToMoveCopy.color === 'white' ? 7 : 0;
          if (toC > fromC) { // Kingside
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; // Check original board for rook
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pieceToMoveCopy.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
              }
          } else { // Queenside
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; // Check original board for rook
               if (originalRook && originalRook.type === 'rook' && originalRook.color === pieceToMoveCopy.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
               }
          }
      }
    }
    // After simulating the move, check if the player's king is in check
    return !isKingInCheck(tempBoardState, playerColor);
  });
}


export function getPossibleMoves(board: BoardState, fromSquare: AlgebraicSquare): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(fromSquare);
    const squareState = board[row]?.[col];
    if (!squareState || !squareState.piece) return [];
    const piece = squareState.piece;
    // Generate pseudo-legal moves (moves based on piece's pattern, not checking for self-check yet)
    // The `checkKingSafety` flag in `getPossibleMovesInternal` is crucial for King's special moves like castling and 2-square jump.
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true); 
    // Filter these moves to ensure they don't leave the king in check
    return filterLegalMoves(board, fromSquare, pseudoMoves, piece.color);
}


function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r]?.[c];
      if(!squareState) continue;
      const piece = squareState.piece;
      if (piece && piece.color === playerColor) {
        const pieceSquareAlgebraic = squareState.algebraic;
        const legalMoves = getPossibleMoves(board, pieceSquareAlgebraic); // This now uses filterLegalMoves
        if (legalMoves.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}


export function isCheckmate(board: BoardState, kingInCheckColor: PlayerColor): boolean {
  // King must be in check AND have no legal moves
  return isKingInCheck(board, kingInCheckColor) && !hasAnyLegalMoves(board, kingInCheckColor);
}

export function isStalemate(board: BoardState, playerColor: PlayerColor): boolean {
  // King must NOT be in check AND have no legal moves
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
    case 'pawn': return isWhite ? '♙' : '♟︎';
    default: return '';
  }
}

export function boardToSimpleString(board: BoardState, forPlayer: PlayerColor): string {
    let boardStr = "";
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = board[r][c];
            const piece = square.piece;
            if (piece) {
                let pieceStr = piece.color === 'white' ? 'w' : 'b';
                pieceStr += piece.type.charAt(0).toUpperCase();
                pieceStr += `@${square.algebraic}`;
                pieceStr += `(L${piece.level || 1}`;
                if (piece.hasMoved) pieceStr += `,M`;
                pieceStr += `)`;
                boardStr += pieceStr + " ";
            }
        }
    }
    boardStr += `ToMove:${forPlayer}`;
    boardStr += ` Castling:${getCastlingRightsString(board)}`;
    return boardStr.trim();
}

      