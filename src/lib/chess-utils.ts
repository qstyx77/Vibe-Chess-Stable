
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
         if (piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) {
            hash += 'I';
        }
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
    checkKingSafety: boolean, 
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
            const toSquareAlg = coordsToAlgebraic(toR, toC);

            if (isMoveValid(board, fromSquare, toSquareAlg, piece)) {
                // For 2-square linear moves, check if intermediate square is attacked (if checkKingSafety is true)
                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                    const midR = fromRow + Math.sign(dr);
                    const midC = fromCol + Math.sign(dc);
                    // Path is physically blocked by a piece (already checked by isMoveValid for the final square)
                    // but if the intermediate square is attacked, it's not a valid safe path for the king
                    if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor)) {
                        // console.log(`VIBE_DEBUG: King L2+ move from ${fromSquare} to ${toSquareAlg} blocked. Intermediate square ${coordsToAlgebraic(midR, midC)} is attacked.`);
                        continue; 
                    }
                }
                possible.push(toSquareAlg);
            }
        }
    }
     // L5+ Knight moves for King
    if (level >= 5) {
        const knightDeltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of knightDeltas) {
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (isValidSquare(toR, toC)) {
                const targetPiece = board[toR]?.[toC]?.piece;
                if (!targetPiece || targetPiece.color !== pieceColor) { // Can move to empty or capture opponent
                     if (!isPieceInvulnerableToAttack(targetPiece, piece, board)) {
                        possible.push(coordsToAlgebraic(toR, toC));
                    }
                }
            }
        }
    }

    // Castling - only if checkKingSafety is true
    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        // Kingside Castling (O-O)
        if (fromRow === kingRow && fromCol === 4) { 
            const krSquare = board[kingRow]?.[7];
            if (krSquare?.piece && krSquare.piece.type === 'rook' && !krSquare.piece.hasMoved &&
                !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) { 
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor) && 
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor)) { 
                    possible.push(coordsToAlgebraic(kingRow, 6)); 
                }
            }
            // Queenside Castling (O-O-O)
            const qrSquare = board[kingRow]?.[0];
            if (qrSquare?.piece && qrSquare.piece.type === 'rook' && !qrSquare.piece.hasMoved &&
                !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) { 
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor) && 
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor)) { 
                    possible.push(coordsToAlgebraic(kingRow, 2)); 
                }
            }
        }
    }

  } else { // For pieces other than King
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const toSquare = coordsToAlgebraic(r,c);
          if (isMoveValid(board, fromSquare, toSquare, piece)) {
              possible.push(toSquare);
          }
        }
      }
  }
  
  // Knight/Bishop Swaps (Level 4+)
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
  return possible;
}

function isValidSquare(row: number, col: number): boolean {
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
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        return true;
                    }
                } else if (attackingPiece.type === 'king') {
                    const kingR = r;
                    const kingC = c;
                    const level = attackingPiece.level || 1;
                    const maxDistance = level >= 2 ? 2 : 1;

                    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
                        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const newRowK = kingR + dr;
                            const newColK = kingC + dc;
                            if (newRowK === targetR && newColK === targetC) { // Direct move to target square
                                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                                    const midR = kingR + Math.sign(dr);
                                    const midC = kingC + Math.sign(dc);
                                    if (board[midR]?.[midC]?.piece) {
                                        continue; // Path blocked for 2-square straight jump
                                    }
                                }
                                return true;
                            }
                        }
                    }
                     // L5+ King Knight-like attacks
                    if (level >= 5) {
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr, dc] of knightDeltas) {
                            if (kingR + dr === targetR && kingC + dc === targetC) return true;
                        }
                    }

                } else { 
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false); // checkKingSafety = false
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

  if (!isValidSquare(toRow, toCol)) return false;

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
      // console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Invuln general). Target ${targetPieceOnSquare.type} (L${targetPieceOnSquare.level}, InvulnTurns: ${targetPieceOnSquare.invulnerableTurnsRemaining}) at ${to} is invulnerable to Attacker ${piece.type} (L${piece.level}) from ${from}.`);
      return false;
    }
  }

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = piece.level || 1;
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true; // Standard 1-square forward
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece))
      ) return true; // 2-square from start
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) { // Diagonal capture
        if (targetPieceOnSquare.type === 'bishop' && (targetPieceOnSquare.level || 1) >= 3) { // Bishop L3+ immunity
          // console.log(`VIBE_DEBUG: Pawn capture blocked by Bishop L3+ immunity.`);
          return false;
        }
        return true; 
      }
      if (levelPawn >= 2) { // L2+ Pawn
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) { // Backward move
          return true;
        }
      }
      if (levelPawn >= 3) { // L3+ Pawn
        if (toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPieceOnSquare) { // Sideways move
          return true;
        }
      }
      return false;
    case 'knight':
      const dRowKnight = Math.abs(toRow - fromRow);
      const dColKnight = Math.abs(toCol - fromCol);
      const knightLevel = piece.level || 1;
      if ((dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2)) { // L-shape
        return true;
      }
      if (knightLevel >= 2) { // L2+ Knight
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) { // Cardinal 1-square
          return true;
        }
      }
      if (knightLevel >= 3) { // L3+ Knight
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) { // Cardinal 3-square jump
            return true;
        }
      }
      if (isKnightBishopSwap) return true; // L4+ Swap
      if (knightLevel >=5 && from === to) return true; // L5+ Self-destruct (re-click)
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; // Must be straight line
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
      
      const dRowDirBishop = Math.sign(toRow - fromRow);
      const dColDirBishop = Math.sign(toCol - fromCol);
      let currRBishop = fromRow + dRowDirBishop;
      let currCBishop = fromCol + dColDirBishop;

      while (currRBishop !== toRow || currCBishop !== toCol) { // Check squares *between* from and to
          if (!isValidSquare(currRBishop, currCBishop)) return false;
          const pathPiece = board[currRBishop]?.[currCBishop]?.piece;
          if (pathPiece) {
            if (bishopLevel >= 2 && pathPiece.color === piece.color) {
              // Bishop L2+ phases through own piece
            } else {
              return false; // Path blocked by other piece
            }
          }
          currRBishop += dRowDirBishop;
          currCBishop += dColDirBishop;
      }
      if (isBishopKnightSwap) return true; // L4+ Swap
      return true;
    case 'queen':
      const isQueenRookMove = fromRow === toRow || fromCol === toCol;
      const isQueenBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isQueenRookMove && !isQueenBishopMove) return false;

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
      } else { // Bishop move (diagonal)
        const dRowDirQueen = Math.sign(toRow - fromRow);
        const dColDirQueen = Math.sign(toCol - fromCol);
        let currRQueen = fromRow + dRowDirQueen;
        let currCQueen = fromCol + dColDirQueen;

        while (currRQueen !== toRow || currCQueen !== toCol) { // Check squares *between* from and to
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

      if (dRowKing <= maxKingDistance && dColKing <= maxKingDistance) { // Within 1 or 2 square box
        if (maxKingDistance === 2 && (dRowKing === 2 || dColKing === 2)) { // Potential 2-square straight move
           if ( (dRowKing === 2 && dColKing === 0) ||  // Vertical 2-square
                (dRowKing === 0 && dColKing === 2) ||  // Horizontal 2-square
                (dRowKing === 2 && dColKing === 2)     // Diagonal 2-square
              ) {
                const midRow = fromRow + Math.sign(toRow - fromRow);
                const midCol = fromCol + Math.sign(toCol - fromCol);
                if (board[midRow]?.[midCol]?.piece) { // Path physically blocked
                    return false; 
                }
           }
        }
        // L5+ King Knight moves
        if (kingLevel >= 5) {
           if ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2)) {
             return true; // It's a knight-like L-shape move for L5+ King
           }
        }
        // If it's not an L5+ Knight move, it must be within the 1 or 2 square straight/diagonal limit
        // And it must not be an L-shape if kingLevel < 5 (already handled as L-shape is not <= maxDistance 1)
        if (kingLevel < 5 && ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2))) {
            return false; // Not allowed L-shape for King < L5
        }
        return true; 
      }
      // Castling move shape is handled in getPossibleMovesInternal as it needs more context (hasMoved, check status)
      // Basic shape of castling (King moves 2 squares horizontally)
      if (!piece.hasMoved && fromCol === 4 && (toCol === 6 || toCol === 2) && fromRow === toRow) {
        // Further castling validation (path clear, not in/through/into check) is done in getPossibleMovesInternal
        return true; 
      }
      return false;
    default:
      return false;
  }
}

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece, board: BoardState): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = targetPiece.level || 1;
    const attackerLevel = attackingPiece.level || 1;

    // Rook temporary invulnerability
    if (targetPiece.type === 'rook' && targetLevel >= 3 && targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
    //   console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Rook Invuln). Target Rook ${targetPiece.id} (L${targetLevel}) at ${coordsToAlgebraic(algebraicToCoords(targetPiece.id.slice(-2) as AlgebraicSquare).row, algebraicToCoords(targetPiece.id.slice(-2) as AlgebraicSquare).col)} is invulnerable (Turns: ${targetPiece.invulnerableTurnsRemaining}). Attacker: ${attackingPiece.type} (L${attackerLevel}).`);
      return true;
    }
    // Queen Royal Guard (Level 5+)
    if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
    //   console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Queen Invuln). Target Queen ${targetPiece.id} (L${targetLevel}) is invulnerable to Attacker ${attackingPiece.type} (L${attackerLevel}).`);
      return true;
    }
    // Bishop pawn immunity (Level 3+)
    if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
    //    console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Bishop Pawn Immunity). Target Bishop ${targetPiece.id} (L${targetLevel}) is immune to Pawn Attacker.`);
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
  if (!movingPieceOriginal) {
    // console.error("VIBE_DEBUG: applyMove - No piece at source", move.from);
    return { newBoard: board, capturedPiece: null, conversionEvents, originalPieceLevel: undefined }; 
  }

  const originalPieceLevel = movingPieceOriginal.level; 
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
    const targetPieceCopy = { ...targetPieceOriginal!, hasMoved: targetPieceOriginal!.hasMoved || true }; 

    newBoard[toRow][toCol].piece = movingPieceCopy; 
    newBoard[fromRow][fromCol].piece = targetPieceCopy; 
    // console.log(`VIBE_DEBUG: Swap executed between ${movingPieceOriginal.type} at ${move.from} and ${targetPieceOriginal!.type} at ${move.to}`);
    return { newBoard, capturedPiece: null, conversionEvents, originalPieceLevel };
  }

  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginal.color) ? { ...targetPieceOriginal } : null;

  // Make a mutable copy of the moving piece for modification
  const movingPieceCopyForMove = { ...movingPieceOriginal, invulnerableTurnsRemaining: movingPieceOriginal.invulnerableTurnsRemaining || 0 };
  newBoard[toRow][toCol].piece = movingPieceCopyForMove;
  newBoard[fromRow][fromCol].piece = null;

  const movingPieceRef = newBoard[toRow]?.[toCol]?.piece; 
  if (!movingPieceRef) {
    // This should ideally not happen if movingPieceOriginal was valid
    // console.error("VIBE_DEBUG: applyMove - movingPieceRef became null unexpectedly after move.");
    return { newBoard, capturedPiece, conversionEvents, originalPieceLevel }; 
  }

  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { 
    const kingStartCol = 4; 
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { // Kingside castle
      const rookOriginalCol = 7; 
      const rookTargetCol = 5;   
      const rookSquareData = board[fromRow]?.[rookOriginalCol]; // Use original board to find rook
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
    // console.log(`VIBE_DEBUG: Piece ${capturedPiece.type} captured by ${movingPieceRef.type} (L${movingPieceRef.level || 1}).`);
    const levelBeforeCapture = movingPieceRef.level || 1; 
    let levelGain = 0;
    switch (capturedPiece.type) {
      case 'pawn': levelGain = 1; break;
      case 'knight': levelGain = 2; break;
      case 'bishop': levelGain = 2; break;
      case 'rook': levelGain = 2; break;
      case 'queen': levelGain = 3; break;
      default: levelGain = 0; break; // King capture ends game, no level up needed
    }
    movingPieceRef.level = Math.min(6, (movingPieceRef.level || 1) + levelGain);
    // console.log(`VIBE_DEBUG: ${movingPieceRef.type} new level: ${movingPieceRef.level}`);
    
    if (movingPieceRef.type === 'rook' && movingPieceRef.level >= 3 && levelBeforeCapture < 3) {
        movingPieceRef.invulnerableTurnsRemaining = 1;
        // console.log(`VIBE_DEBUG: Setting invulnerableTurnsRemaining=1 for Rook ${movingPieceRef.id} (L${movingPieceRef.level}) at ${coordsToAlgebraic(toRow,toCol)} due to LEVEL-UP via capture.`);
    }
  }

  // Pawn L4+ Push-Back
  if (movingPieceRef.type === 'pawn' && (movingPieceRef.level || 1) >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;

        if (isValidSquare(adjRow, adjCol)) {
          const enemyPieceToPushSquare = newBoard[adjRow]?.[adjCol];
          const enemyPieceToPush = enemyPieceToPushSquare?.piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== movingPieceRef.color) {
            const pushTargetRow = adjRow + dr; 
            const pushTargetCol = adjCol + dc;

            if (isValidSquare(pushTargetRow, pushTargetCol)) {
              if (!newBoard[pushTargetRow]?.[pushTargetCol]?.piece) { 
                newBoard[pushTargetRow][pushTargetCol].piece = { ...enemyPieceToPush }; 
                newBoard[adjRow][adjCol].piece = null; 
                // console.log(`VIBE_DEBUG: Pawn at ${coordsToAlgebraic(pawnNewRow, pawnNewCol)} pushed ${enemyPieceToPush.type} from ${coordsToAlgebraic(adjRow, adjCol)} to ${coordsToAlgebraic(pushTargetRow, pushTargetCol)}`);
              }
            }
          }
        }
      }
    }
  }

  // Bishop L5+ Conversion
  if (movingPieceRef.type === 'bishop' && (movingPieceRef.level || 1) >= 5) {
    const bishopColor = movingPieceRef.color;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 
        const adjRow = toRow + dr;
        const adjCol = toCol + dc;
        if (isValidSquare(adjRow, adjCol)) {
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
                byPiece: { ...movingPieceRef }, // Pass a copy
                at: coordsToAlgebraic(adjRow, adjCol)
              });
              // console.log(`VIBE_DEBUG: Bishop at ${coordsToAlgebraic(toRow, toCol)} converted ${originalPieceCopy.type} at ${coordsToAlgebraic(adjRow, adjCol)}`);
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
  const fromSquareState = board[algebraicToCoords(pieceOriginalSquare).row]?.[algebraicToCoords(pieceOriginalSquare).col];
  if (!fromSquareState || !fromSquareState.piece || fromSquareState.piece.color !== playerColor) return [];
  const originalMovingPiece = fromSquareState.piece;

  return pseudoMoves.filter(targetSquare => {
    const tempBoardState = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    
    const pToMoveCopy = { ...originalMovingPiece }; 

    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;

    const isKnightBishopSwapSim =
      pToMoveCopy.type === 'knight' && (pToMoveCopy.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'bishop' && targetPieceForSim.color === pToMoveCopy.color;
    const isBishopKnightSwapSim =
      pToMoveCopy.type === 'bishop' && (pToMoveCopy.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'knight' && targetPieceForSim.color === pToMoveCopy.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      tempBoardState[toR][toC].piece = { ...pToMoveCopy, hasMoved: true };
      tempBoardState[fromR][fromC].piece = targetPieceForSim ? { ...(targetPieceForSim as Piece), hasMoved: targetPieceForSim.hasMoved || true } : null;
    } else {
      tempBoardState[toR][toC].piece = { ...pToMoveCopy, hasMoved: true };
      tempBoardState[fromR][fromC].piece = null;

      // Simulate rook movement for castling
      if (pToMoveCopy.type === 'king' && !originalMovingPiece.hasMoved && Math.abs(fromC - toC) === 2) { 
          const kingRow = pToMoveCopy.color === 'white' ? 7 : 0;
          if (toC > fromC) { // Kingside
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; 
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveCopy.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
              }
          } else { // Queenside
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; 
               if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveCopy.color && !originalRook.hasMoved) {
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
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true); // checkKingSafety = true
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
        const pseudoPossibleMoves = getPossibleMovesInternal(board, pieceSquareAlgebraic, piece, true);
        const legalMoves = filterLegalMoves(board, pieceSquareAlgebraic, pseudoPossibleMoves, playerColor);
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

    
