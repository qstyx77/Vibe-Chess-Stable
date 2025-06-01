
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
        hash += `${getPieceChar(piece)}L${parseInt(String(piece.level || 1), 10)}`;
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
  const currentLevel = parseInt(String(piece.level || 1), 10);

  if (piece.type === 'king') {
    const maxDistance = currentLevel >= 2 ? 2 : 1;

    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (!isValidSquare(toR, toC)) continue;

            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                const midR = fromRow + Math.sign(dr);
                const midC = fromCol + Math.sign(dc);
                if (!isValidSquare(midR, midC) || board[midR]?.[midC]?.piece) continue;
                if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor, true)) {
                    continue;
                }
            }
            const targetPiece = board[toR]?.[toC]?.piece;
            if (!targetPiece || targetPiece.color !== pieceColor) {
                 if (!isPieceInvulnerableToAttack(targetPiece, piece)) {
                    possible.push(coordsToAlgebraic(toR, toC));
                }
            }
        }
    }
    // Knight moves for L5+ King
    if (currentLevel > 4) { // Changed from >= 5
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightDeltas) {
            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (isValidSquare(toR, toC)) {
                const targetPiece = board[toR]?.[toC]?.piece;
                if (!targetPiece || targetPiece.color !== pieceColor) {
                     if (!isPieceInvulnerableToAttack(targetPiece, piece)) {
                        possible.push(coordsToAlgebraic(toR, toC));
                    }
                }
            }
        }
    }

    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        if (fromRow === kingRow && fromCol === 4) {
            const krSquare = board[kingRow]?.[7];
            if (krSquare?.piece?.type === 'rook' && !krSquare.piece.hasMoved &&
                !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) {
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, true) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor, true) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor, true)) {
                    possible.push(coordsToAlgebraic(kingRow, 6));
                }
            }
            const qrSquare = board[kingRow]?.[0];
            if (qrSquare?.piece?.type === 'rook' && !qrSquare.piece.hasMoved &&
                !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) {
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, true) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor, true) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor, true)) {
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

  // Swap moves for Knight L4+ and Bishop L4+
  if (piece.type === 'knight' && currentLevel >= 4) {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const targetPiece = board[r_idx]?.[c_idx]?.piece;
        if (targetPiece && targetPiece.color === piece.color && targetPiece.type === 'bishop') {
          possible.push(coordsToAlgebraic(r_idx, c_idx));
        }
      }
    }
  }
  if (piece.type === 'bishop' && currentLevel >= 4) {
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

export function isSquareAttacked(board: BoardState, squareToAttack: AlgebraicSquare, attackerColor: PlayerColor, simplifyKingCheck: boolean = false): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareState = board[r]?.[c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;

            if (attackingPiece && attackingPiece.color === attackerColor) {
                const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                             return true;
                        }
                    }
                } else if (attackingPiece.type === 'king') {
                    const { row: kingR, col: kingC } = algebraicToCoords(coordsToAlgebraic(r, c));
                    let currentKingLevel = parseInt(String(attackingPiece.level || 1), 10);
                    let maxDistance = currentKingLevel >= 2 ? 2 : 1;
                    let canKnightMove = currentKingLevel > 4; // Changed from >= 5

                    if (simplifyKingCheck) {
                        maxDistance = 1;
                        canKnightMove = false;
                    }

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
                                    if (!simplifyKingCheck && isSquareAttacked(board, coordsToAlgebraic(midR, midC), attackingPiece.color === 'white' ? 'black' : 'white', true)) {
                                        continue;
                                    }
                                }
                                if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                                    return true;
                                }
                            }
                        }
                    }
                    if (canKnightMove) {
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr, dc] of knightDeltas) {
                            if (kingR + dr === targetR && kingC + dc === targetC) {
                                if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                                    return true;
                                }
                            }
                        }
                    }
                } else { 
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false); 
                    if (pseudoMoves.includes(squareToAttack)) {
                         if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
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
  if (from === to && !(piece.type === 'knight' && (parseInt(String(piece.level || 1), 10)) >= 5)) return false;

  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);

  if (!isValidSquare(toRow, toCol)) return false;

  const targetSquareState = board[toRow]?.[toCol];
  const targetPieceOnSquare = targetSquareState?.piece;
  const pieceLevel = parseInt(String(piece.level || 1), 10);


  const isKnightBishopSwap =
    piece.type === 'knight' &&
    pieceLevel >= 4 &&
    targetPieceOnSquare &&
    targetPieceOnSquare.type === 'bishop' &&
    targetPieceOnSquare.color === piece.color;

  const isBishopKnightSwap =
    piece.type === 'bishop' &&
    pieceLevel >= 4 &&
    targetPieceOnSquare &&
    targetPieceOnSquare.type === 'knight' &&
    targetPieceOnSquare.color === piece.color;

  if (isKnightBishopSwap || isBishopKnightSwap) return true;

  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color) {
    return false;
  }
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) {
    if (isPieceInvulnerableToAttack(targetPieceOnSquare, piece)) {
      return false;
    }
  }

  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = pieceLevel;
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      if (
        fromCol === toCol && !targetPieceOnSquare && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece))
      ) return true;
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) {
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
      const knightLevel = pieceLevel;
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
      const bishopLevel = pieceLevel;
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
            } else {
              return false;
            }
          }
          currRBishop += dRowDirBishop;
          currCBishop += dColDirBishop;
      }
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
      const kingLevelKing = parseInt(String(piece.level || 1), 10);
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);
      const maxKingDistance = kingLevelKing >= 2 ? 2 : 1;

      if (kingLevelKing > 4 && ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2))) { // Changed from >= 5
        return true;
      }
      if (dRowKing <= maxKingDistance && dColKing <= maxKingDistance) {
        if (maxKingDistance === 2 && (dRowKing === 2 || dColKing === 2) && (dRowKing === 0 || dColKing === 0 || dRowKing === dColKing)) {
            const midRow = fromRow + Math.sign(toRow - fromRow);
            const midCol = fromCol + Math.sign(toCol - fromCol);
            if (board[midRow]?.[midCol]?.piece) {
                return false;
            }
            const opponentColorKing = piece.color === 'white' ? 'black' : 'white';
            if (isSquareAttacked(board, coordsToAlgebraic(midRow, midCol), opponentColorKing, true)) {
                return false;
            }
        }
        return true;
      }
      return false;
    default:
      return false;
  }
}

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = parseInt(String(targetPiece.level || 1), 10);
    const attackerLevel = parseInt(String(attackingPiece.level || 1), 10);

    if (targetPiece.type === 'queen' && targetLevel >= 5 && attackerLevel < targetLevel) {
      return true;
    }
    if (targetPiece.type === 'bishop' && targetLevel >= 3 && attackingPiece.type === 'pawn') {
      return true;
    }
    if (targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
        return true;
    }
    return false;
}

export function applyMove(
  board: BoardState,
  move: Move
): { newBoard: BoardState, capturedPiece: Piece | null, conversionEvents: ConversionEvent[], originalPieceLevel: number } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  const conversionEvents: ConversionEvent[] = [];

  const movingPieceOriginalRef = newBoard[fromRow]?.[fromCol]?.piece;
  if (!movingPieceOriginalRef) {
    console.error("applyMove: No piece at source", move.from);
    return { newBoard: board, capturedPiece: null, conversionEvents, originalPieceLevel: 0 };
  }

  const originalPieceLevel = parseInt(String(movingPieceOriginalRef.level || 1), 10);
  const targetPieceOriginal = newBoard[toRow]?.[toCol]?.piece;

  if (
    (movingPieceOriginalRef.type === 'knight' && (parseInt(String(movingPieceOriginalRef.level || 1), 10)) >= 4 && targetPieceOriginal?.type === 'bishop' && targetPieceOriginal.color === movingPieceOriginalRef.color) ||
    (movingPieceOriginalRef.type === 'bishop' && (parseInt(String(movingPieceOriginalRef.level || 1), 10)) >= 4 && targetPieceOriginal?.type === 'knight' && targetPieceOriginal.color === movingPieceOriginalRef.color)
  ) {
    const movingPieceCopy = { ...movingPieceOriginalRef, hasMoved: true };
    const targetPieceCopy = { ...targetPieceOriginal!, hasMoved: targetPieceOriginal!.hasMoved || true };
    newBoard[toRow][toCol].piece = movingPieceCopy;
    newBoard[fromRow][fromCol].piece = targetPieceCopy;
    return { newBoard, capturedPiece: null, conversionEvents, originalPieceLevel };
  }

  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginalRef.color) ? { ...targetPieceOriginal } : null;
  const movingPieceForToSquare = { ...movingPieceOriginalRef };
  newBoard[toRow][toCol].piece = movingPieceForToSquare;
  newBoard[fromRow][fromCol].piece = null;

  const pieceNowOnToSquare = newBoard[toRow]?.[toCol]?.piece;
  if (!pieceNowOnToSquare) {
    console.error("applyMove: Piece became null after placing on 'to' square", move.to);
    return { newBoard, capturedPiece, conversionEvents, originalPieceLevel };
  }

  if (pieceNowOnToSquare.type === 'king' && !movingPieceOriginalRef.hasMoved) {
    const kingStartCol = 4;
    if (fromCol === kingStartCol && Math.abs(fromCol - toCol) === 2) {
      const kingRow = fromRow;
      const rookOriginalCol = toCol > fromCol ? 7 : 0;
      const rookTargetCol = toCol > fromCol ? 5 : 3;
      const rookSquareData = board[kingRow]?.[rookOriginalCol];
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === pieceNowOnToSquare.color) {
        newBoard[kingRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[kingRow][rookOriginalCol].piece = null;
      }
    }
  }
  pieceNowOnToSquare.hasMoved = true;

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
    pieceNowOnToSquare.level = Math.min(6, originalPieceLevel + levelGain);
  }

  if (pieceNowOnToSquare.type === 'pawn' && (toRow === 0 || toRow === 7)) {
    if (move.promoteTo) {
      const promotedPieceBaseLevel = 1;
      let finalPromotedLevel = promotedPieceBaseLevel;
      if (capturedPiece) { 
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
    }
  }


  if (pieceNowOnToSquare.type === 'pawn' && (parseInt(String(pieceNowOnToSquare.level || 1), 10)) >= 4) {
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
          if (enemyPieceToPush && enemyPieceToPush.color !== pieceNowOnToSquare.color) {
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

  if (pieceNowOnToSquare.type === 'bishop' && (parseInt(String(pieceNowOnToSquare.level || 1), 10)) >= 5) {
    const bishopColor = pieceNowOnToSquare.color;
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
                byPiece: { ...pieceNowOnToSquare },
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
    return true;
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
    const pieceToMoveCopy = { ...originalMovingPiece };
    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;

    const isKnightBishopSwapSim =
      pieceToMoveCopy.type === 'knight' && (parseInt(String(pieceToMoveCopy.level || 1), 10)) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'bishop' && targetPieceForSim.color === pieceToMoveCopy.color;
    const isBishopKnightSwapSim =
      pieceToMoveCopy.type === 'bishop' && (parseInt(String(pieceToMoveCopy.level || 1), 10)) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'knight' && targetPieceForSim.color === pieceToMoveCopy.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      tempBoardState[toR][toC].piece = { ...pieceToMoveCopy, hasMoved: true };
      tempBoardState[fromR][fromC].piece = targetPieceForSim ? { ...(targetPieceForSim as Piece), hasMoved: targetPieceForSim.hasMoved || true } : null;
    } else {
      tempBoardState[toR][toC].piece = { ...pieceToMoveCopy, hasMoved: true };
      tempBoardState[fromR][fromC].piece = null;
      if (pieceToMoveCopy.type === 'king' && !originalMovingPiece.hasMoved && Math.abs(fromC - toC) === 2) {
          const kingRow = pieceToMoveCopy.color === 'white' ? 7 : 0;
          if (toC > fromC) {
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow]?.[rookOriginalCol]?.piece;
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pieceToMoveCopy.color && !originalRook.hasMoved) {
                tempBoardState[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                tempBoardState[kingRow][rookOriginalCol].piece = null;
              }
          } else {
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow]?.[rookOriginalCol]?.piece;
               if (originalRook && originalRook.type === 'rook' && originalRook.color === pieceToMoveCopy.color && !originalRook.hasMoved) {
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
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true);
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
                pieceStr += `(L${parseInt(String(piece.level || 1), 10)}`;
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

export interface RookResurrectionResult {
  boardWithResurrection: BoardState;
  capturedPiecesAfterResurrection: { white: Piece[]; black: Piece[] };
  resurrectionPerformed: boolean;
  resurrectedPieceData?: Piece;
  resurrectedSquareAlg?: AlgebraicSquare;
  newResurrectionIdCounter?: number;
}


export function processRookResurrectionCheck(
  boardAfterPrimaryMove: BoardState,
  playerWhosePieceLeveled: PlayerColor,
  rookMove: Move | null,
  rookSquareAfterMove: AlgebraicSquare | null,
  originalLevelOfPiece: number | undefined,
  currentCapturedPiecesState: { white: Piece[]; black: Piece[] },
  currentResurrectionIdCounter: number
): RookResurrectionResult {
  let boardWithResurrection = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
  let capturedPiecesAfterResurrection = {
    white: currentCapturedPiecesState.white.map(p => ({ ...p })),
    black: currentCapturedPiecesState.black.map(p => ({ ...p }))
  };
  let resurrectionPerformed = false;
  let resurrectedPieceResultData: Piece | undefined = undefined;
  let resurrectedSquareResultAlg: AlgebraicSquare | undefined = undefined;
  let nextResurrectionIdCounter = currentResurrectionIdCounter;

  if (!rookMove || !rookSquareAfterMove) {
    return { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed, newResurrectionIdCounter: nextResurrectionIdCounter };
  }

  const { row: rookR, col: rookC } = algebraicToCoords(rookSquareAfterMove);
  const rookOnBoard = boardWithResurrection[rookR]?.[rookC]?.piece;

  if (!rookOnBoard || rookOnBoard.type !== 'rook' || rookOnBoard.color !== playerWhosePieceLeveled) {
    return { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed, newResurrectionIdCounter: nextResurrectionIdCounter };
  }

  const newRookLevel = parseInt(String(rookOnBoard.level || 1), 10);
  const oldLevelOfThisPieceType = (rookMove?.type === 'promotion' && rookMove?.promoteTo === 'rook')
    ? 0 
    : (parseInt(String(originalLevelOfPiece || 0), 10)); 

  if (newRookLevel >= 3 && newRookLevel > oldLevelOfThisPieceType) {
    const opponentColor = playerWhosePieceLeveled === 'white' ? 'black' : 'white';
    const piecesToChooseFrom = capturedPiecesAfterResurrection[opponentColor] ? [...capturedPiecesAfterResurrection[opponentColor]] : [];

    if (piecesToChooseFrom.length > 0) {
      piecesToChooseFrom.sort((a, b) => {
        const valueA = {pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0}[a.type] || 0;
        const valueB = {pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0}[b.type] || 0;
        return valueB - valueA;
      });
      const pieceToResurrectOriginal = piecesToChooseFrom[0]; 

      const emptyAdjacentSquares: AlgebraicSquare[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const adjR = rookR + dr;
          const adjC = rookC + dc;
          if (isValidSquare(adjR, adjC) && !boardWithResurrection[adjR][adjC].piece) {
            emptyAdjacentSquares.push(coordsToAlgebraic(adjR, adjC));
          }
        }
      }

      if (emptyAdjacentSquares.length > 0) {
        const targetSquareAlg = emptyAdjacentSquares[Math.floor(Math.random() * emptyAdjacentSquares.length)];
        const { row: resR, col: resC } = algebraicToCoords(targetSquareAlg);
        
        const resurrectedPieceData: Piece = {
          ...pieceToResurrectOriginal,
          level: 1,
          id: `${pieceToResurrectOriginal.id}_res_${nextResurrectionIdCounter}_${Date.now()}`,
          hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved,
        };
        nextResurrectionIdCounter++; 
        boardWithResurrection[resR][resC].piece = resurrectedPieceData;
        capturedPiecesAfterResurrection[opponentColor] = capturedPiecesAfterResurrection[opponentColor].filter(p => p.id !== pieceToResurrectOriginal.id);
        
        resurrectionPerformed = true;
        resurrectedPieceResultData = resurrectedPieceData;
        resurrectedSquareResultAlg = targetSquareAlg;
      }
    }
  }
  return { 
    boardWithResurrection, 
    capturedPiecesAfterResurrection, 
    resurrectionPerformed, 
    resurrectedPieceData: resurrectedPieceResultData, 
    resurrectedSquareAlg: resurrectedSquareResultAlg,
    newResurrectionIdCounter: nextResurrectionIdCounter
  };
}

