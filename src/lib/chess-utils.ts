
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
  // Consider adding en passant square to hash if implemented
  return hash;
}


export function getPossibleMovesInternal(
    board: BoardState, 
    fromSquare: AlgebraicSquare, 
    piece: Piece, 
    checkKingSafety: boolean, // If true, check if the move puts own king in check
): AlgebraicSquare[] {
  if (!piece) return [];
  const possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';

  if (piece.type === 'king') {
    const level = piece.level || 1;
    const maxDistance = level >= 2 ? 2 : 1;

    // Standard 1 or 2 square moves
    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (!isValidSquare(toR, toC)) continue;

            // Path check for 2-square linear moves
            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                const midR = fromRow + Math.sign(dr);
                const midC = fromCol + Math.sign(dc);
                if (board[midR]?.[midC]?.piece) continue; // Path blocked by any piece
                if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor)) {
                    // console.log(`VIBE_DEBUG: King L2+ move from ${fromSquare} to ${coordsToAlgebraic(toR,toC)} blocked. Intermediate square ${coordsToAlgebraic(midR, midC)} is attacked.`);
                    continue; // Skip this 2-square move if intermediate square is attacked
                }
            }
            const targetPiece = board[toR]?.[toC]?.piece;
            if (!targetPiece || targetPiece.color !== pieceColor) { // Can move to empty or capture opponent
                 if (!isPieceInvulnerableToAttack(targetPiece, piece, board)) {
                    possible.push(coordsToAlgebraic(toR, toC));
                }
            }
        }
    }
    // Level 5+ Knight moves for King
    if (level >= 5) {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightDeltas) {
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (isValidSquare(toR, toC)) {
                const targetPiece = board[toR]?.[toC]?.piece;
                if (!targetPiece || targetPiece.color !== pieceColor) { 
                     if (!isPieceInvulnerableToAttack(targetPiece, piece, board)) {
                        possible.push(coordsToAlgebraic(toR, toC));
                    }
                }
            }
        }
    }
    // Castling - only if checkKingSafety is true because it involves checking for check
    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        if (fromRow === kingRow && fromCol === 4) { 
            // Kingside
            const krSquare = board[kingRow]?.[7];
            if (krSquare?.piece?.type === 'rook' && !krSquare.piece.hasMoved &&
                !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) { 
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor) && 
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor)) { 
                    possible.push(coordsToAlgebraic(kingRow, 6)); 
                }
            }
            // Queenside
            const qrSquare = board[kingRow]?.[0];
            if (qrSquare?.piece?.type === 'rook' && !qrSquare.piece.hasMoved &&
                !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) { 
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor) && 
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor)) { 
                    possible.push(coordsToAlgebraic(kingRow, 2)); 
                }
            }
        }
    }
  } else { 
    // For other pieces, generate all moves validated by isMoveValid
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const toSquare = coordsToAlgebraic(r,c);
          if (isMoveValid(board, fromSquare, toSquare, piece)) {
              possible.push(toSquare);
          }
        }
      }
  }
  
  // Knight L4+ Swap with Bishop
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
  // Bishop L4+ Swap with Knight
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
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        return true;
                    }
                } else if (attackingPiece.type === 'king') {
                    // Simplified king attack check for isSquareAttacked to avoid recursion with castling
                    const { row: kingR, col: kingC } = algebraicToCoords(coordsToAlgebraic(r, c));
                    const level = attackingPiece.level || 1;
                    const maxDistance = level >= 2 ? 2 : 1;
                    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
                        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const newRow = kingR + dr;
                            const newCol = kingC + dc;
                            if (newRow === targetR && newCol === targetC) {
                                if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                                    const midR = kingR + Math.sign(dr);
                                    const midC = kingC + Math.sign(dc);
                                    if (board[midR]?.[midC]?.piece) {
                                        continue;
                                    }
                                }
                                return true;
                            }
                        }
                    }
                     // L5+ Knight moves for King when checking attacks
                    if (level >= 5) {
                        const knightDeltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                        for (const [dr, dc] of knightDeltas) {
                            if (kingR + dr === targetR && kingC + dc === targetC) return true;
                        }
                    }
                } else { 
                    // For other pieces, use getPossibleMovesInternal with checkKingSafety = false
                    // This 'false' is crucial to prevent recursion when checking if King's castling path is attacked
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
    //   console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Invuln). Target ${targetPieceOnSquare.type} L${targetPieceOnSquare.level} at ${to} is invulnerable to ${piece.type} L${piece.level} from ${from}. Turns remaining: ${targetPieceOnSquare.invulnerableTurnsRemaining}`);
      return false;
    }
  }

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = piece.level || 1;
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true; 
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece))
      ) return true; 
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) { 
        if (targetPieceOnSquare.type === 'bishop' && (targetPieceOnSquare.level || 1) >= 3) { 
          return false;
        }
        return true; 
      }
      if (levelPawn >= 2) { 
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) { 
          return true;
        }
      }
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
      if ((dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2)) { 
        return true;
      }
      if (knightLevel >= 2) { 
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) { 
          return true;
        }
      }
      if (knightLevel >= 3) { 
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) { 
            return true;
        }
      }
      if (isKnightBishopSwap) return true; 
      if (knightLevel >=5 && from === to) return true; // Self-destruct move shape
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false; 
      if (fromRow === toRow) { 
        const step = toCol > fromCol ? 1 : -1;
        for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
          if (board[fromRow]?.[c_path]?.piece) return false; 
        }
      } else { 
        const step = toRow > fromRow ? 1 : -1;
        for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
          if (board[r_path]?.[fromCol]?.piece) return false; 
        }
      }
      return true;
    case 'bishop':
      const bishopLevel = piece.level || 1;
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false; 
      
      const dRowDirBishop = Math.sign(toRow - fromRow);
      const dColDirBishop = Math.sign(toCol - fromCol);
      let currRBishop = fromRow + dRowDirBishop;
      let currCBishop = fromCol + dColDirBishop;

      while (currRBishop !== toRow || currCBishop !== toCol) { 
          if (!isValidSquare(currRBishop, currCBishop)) return false;
          const pathPiece = board[currRBishop]?.[currCBishop]?.piece;
          if (pathPiece) {
            if (bishopLevel >= 2 && pathPiece.color === piece.color) {
              // Bishop L2+ phases through own piece
            } else {
              return false; 
            }
          }
          currRBishop += dRowDirBishop;
          currCBishop += dColDirBishop;
      }
      if (isBishopKnightSwap) return true; 
      return true;
    case 'queen':
      const isQueenRookMove = fromRow === toRow || fromCol === toCol;
      const isQueenBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isQueenRookMove && !isQueenBishopMove) return false;

      if (isQueenRookMove) { 
        if (fromRow === toRow) { 
          const step = toCol > fromCol ? 1 : -1;
          for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
            if (board[fromRow]?.[c_path]?.piece) return false;
          }
        } else { 
          const step = toRow > fromRow ? 1 : -1;
          for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
            if (board[r_path]?.[fromCol]?.piece) return false;
          }
        }
      } else { 
        const dRowDirQueen = Math.sign(toRow - fromRow);
        const dColDirQueen = Math.sign(toCol - fromCol);
        let currRQueen = fromRow + dRowDirQueen;
        let currCQueen = fromCol + dColDirQueen;

        while (currRQueen !== toRow || currCQueen !== toCol) { 
            if (!isValidSquare(currRQueen, currCQueen)) return false;
            if (board[currRQueen]?.[currCQueen]?.piece) {
                return false; 
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
      
      // Check L5+ Knight moves first
      if (kingLevel >= 5 && ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2))) {
        return true; 
      }
      // Then check 1 or 2 square standard moves
      if (dRowKing <= maxKingDistance && dColKing <= maxKingDistance) {
        // For 2-square linear moves, check intermediate square for blockage
        if (maxKingDistance === 2 && (dRowKing === 2 || dColKing === 2) && (dRowKing === 0 || dColKing === 0 || dRowKing === dColKing)) { 
           // Is a 2-square straight line move
            const midRow = fromRow + Math.sign(toRow - fromRow);
            const midCol = fromCol + Math.sign(toCol - fromCol);
            if (board[midRow]?.[midCol]?.piece) { 
                return false; // Path blocked
            }
        }
        return true; 
      }
      // Castling move shape validation is not needed here as getPossibleMovesInternal handles it.
      return false;
    default:
      return false;
  }
}

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece, board: BoardState): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = targetPiece.level || 1;
    const attackerLevel = attackingPiece.level || 1;

    // Queen Royal Guard
    if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
      return true;
    }
    // Bishop pawn immunity
    if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
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
    console.error("applyMove: No piece at source", move.from);
    return { newBoard: board, capturedPiece: null, conversionEvents, originalPieceLevel: undefined }; 
  }

  const originalPieceLevel = movingPieceOriginal.level || 1; 
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
    return { newBoard, capturedPiece: null, conversionEvents, originalPieceLevel };
  }

  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginal.color) ? { ...targetPieceOriginal } : null;
  const movingPieceCopyForMove = { ...movingPieceOriginal };
  newBoard[toRow][toCol].piece = movingPieceCopyForMove;
  newBoard[fromRow][fromCol].piece = null;

  const movingPieceRef = newBoard[toRow]?.[toCol]?.piece; 
  if (!movingPieceRef) {
    console.error("applyMove: Moving piece reference became null after move to", move.to);
    return { newBoard, capturedPiece, conversionEvents, originalPieceLevel }; 
  }

  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { 
    const kingStartCol = 4; 
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { 
      const rookOriginalCol = 7; 
      const rookTargetCol = 5;   
      const rookSquareData = board[fromRow]?.[rookOriginalCol]; 
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
    else if (fromCol === kingStartCol && toCol === kingStartCol - 2) { 
      const rookOriginalCol = 0; 
      const rookTargetCol = 3;   
      const rookSquareData = board[fromRow]?.[rookOriginalCol]; 
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
  }
  movingPieceRef.hasMoved = true;

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
    movingPieceRef.level = Math.min(6, (movingPieceRef.level || 1) + levelGain);
  }

  if (movingPieceRef.type === 'pawn' && (toRow === 0 || toRow === 7)) {
    if (move.promoteTo) {
      movingPieceRef.type = move.promoteTo;
      movingPieceRef.level = 1;
    }
  }

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
              }
            }
          }
        }
      }
    }
  }

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
            if (Math.random() < 0.5) { // 50% chance
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
                byPiece: { ...movingPieceRef }, 
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
    // console.warn(`isKingInCheck: No king found for ${kingColor}`);
    return true; // No king implies a lost game, effectively in check.
  }
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

      // Simulate castling rook move
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
    // When getting moves for UI display or primary validation, always check king safety
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
        // getPossibleMoves already calls filterLegalMoves internally via checkKingSafety=true in getPossibleMovesInternal
        const legalMoves = getPossibleMoves(board, pieceSquareAlgebraic);
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
    case 'pawn': return isWhite ? '♙' : '♟︎'; 
    default: return '';
  }
}

// This function is primarily for the Minimax AI's internal use if it differs from the main game's board state.
// For the main game, the board state is directly managed by React state.
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
                // No invulnerableTurnsRemaining in this version
                pieceStr += `)`;
                boardStr += pieceStr + " ";
            }
        }
    }
    boardStr += `ToMove:${forPlayer}`;
    // Add castling rights string from the main game's getCastlingRightsString for consistency
    boardStr += ` Castling:${getCastlingRightsString(board)}`;
    return boardStr.trim();
}

