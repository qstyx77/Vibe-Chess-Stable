
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
  if (!piece) return '-';
  let char = '';
  switch (piece.type) {
    case 'pawn': char = 'P'; break;
    case 'knight': char = 'N'; break;
    case 'bishop': char = 'B'; break;
    case 'rook': char = 'R'; break;
    case 'queen': char = 'Q'; break;
    case 'king': char = 'K'; break;
  }
  return piece.color === 'white' ? char.toUpperCase() : char.toLowerCase();
}

export function getCastlingRightsString(board: BoardState): string {
  let rights = "";
  const wKsquare = board[7]?.[4];
  const wK = wKsquare?.piece;
  const wKRsquare = board[7]?.[7];
  const wKR = wKRsquare?.piece;
  if (wK && wK.type === 'king' && !wK.hasMoved && wKR && wKR.type === 'rook' && !wKR.hasMoved) {
    rights += "K";
  } else {
    rights += "-";
  }

  const wQRsquare = board[7]?.[0];
  const wQR = wQRsquare?.piece;
  if (wK && wK.type === 'king' && !wK.hasMoved && wQR && wQR.type === 'rook' && !wQR.hasMoved) {
    rights += "Q";
  } else {
    rights += "-";
  }

  const bKsquare = board[0]?.[4];
  const bK = bKsquare?.piece;
  const bKRsquare = board[0]?.[7];
  const bKR = bKRsquare?.piece;
  if (bK && bK.type === 'king' && !bK.hasMoved && bKR && bKR.type === 'rook' && !bKR.hasMoved) {
    rights += "k";
  } else {
    rights += "-";
  }

  const bQRsquare = board[0]?.[0];
  const bQR = bQRsquare?.piece;
  if (bK && bK.type === 'king' && !bK.hasMoved && bQR && bQR.type === 'rook' && !bQR.hasMoved) {
    rights += "q";
  } else {
    rights += "-";
  }
  return rights;
}


export function boardToPositionHash(board: BoardState, currentPlayer: PlayerColor, castlingRights: string): string {
  let hash = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = board[r]?.[c];
      const piece = square?.piece;
      if (piece) {
        hash += `${piece.color[0]}${getPieceChar(piece)}L${piece.level || 1}${piece.hasMoved ? 'M':''}${piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0 ? `I${piece.invulnerableTurnsRemaining}`:''}`;
      } else {
        hash += '--'; // Use two characters for empty to avoid collision with piece notations
      }
    }
  }
  hash += `_${currentPlayer[0]}`;
  hash += `_${castlingRights}`;
  return hash;
}


export function isSquareAttacked(board: BoardState, squareToAttack: AlgebraicSquare, attackerColor: PlayerColor): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareState = board[r]?.[c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;
            if (attackingPiece && attackingPiece.color === attackerColor) {
                // For pawn attacks, check directly without calling getPossibleMovesInternal
                if (attackingPiece.type === 'pawn') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        return true;
                    }
                } else {
                     // For other pieces, use getPossibleMovesInternal with checkKingSafety = false
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false, null); // No currentPlayerForCheck needed
                    if (pseudoMoves.includes(squareToAttack)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function getPossibleMovesInternal(
    board: BoardState, 
    fromSquare: AlgebraicSquare, 
    piece: Piece, 
    checkKingSafety: boolean, // If true, filter out moves that leave king in check
    currentPlayerForCheck: PlayerColor | null // Only needed if checkKingSafety is true
): AlgebraicSquare[] {
  if (!piece) return [];
  const possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);

  // Iterate all squares to find potential moves
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const toSquare = coordsToAlgebraic(r,c);
      if (isMoveValid(board, fromSquare, toSquare, piece)) {
          possible.push(toSquare);
      }
    }
  }

  // Add castling moves only if checkKingSafety is true and it's relevant
  if (piece.type === 'king' && !piece.hasMoved && checkKingSafety && currentPlayerForCheck === piece.color) {
    const kingColor = piece.color;
    const kingRow = kingColor === 'white' ? 7 : 0;
    const opponentColor = kingColor === 'white' ? 'black' : 'white';

    if (fromRow === kingRow && fromCol === 4 && !isKingInCheck(board, kingColor)) { // King must not be in check to castle
        // Kingside castling (O-O)
        const krSquare = board[kingRow]?.[7];
        if (krSquare?.piece && krSquare.piece.type === 'rook' && !krSquare.piece.hasMoved &&
            !board[kingRow]?.[5]?.piece && !board[kingRow]?.[6]?.piece) {
            if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor) &&
                !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor)) {
                possible.push(coordsToAlgebraic(kingRow, 6));
            }
        }
        // Queenside castling (O-O-O)
        const qrSquare = board[kingRow]?.[0];
        if (qrSquare?.piece && qrSquare.piece.type === 'rook' && !qrSquare.piece.hasMoved &&
            !board[kingRow]?.[1]?.piece && !board[kingRow]?.[2]?.piece && !board[kingRow]?.[3]?.piece) {
            if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor) &&
                !isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor)) {
                possible.push(coordsToAlgebraic(kingRow, 2));
            }
        }
    }
  }
  
  if (checkKingSafety && currentPlayerForCheck) {
    return filterLegalMoves(board, fromSquare, possible, currentPlayerForCheck);
  }
  return possible;
}


export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece): boolean {
  if (from === to) return false; // Cannot move to the same square

  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);

  if (toRow < 0 || toRow > 7 || toCol < 0 || toCol > 7) return false; // Off board

  const targetSquareState = board[toRow]?.[toCol];
  const targetPieceOnSquare = targetSquareState?.piece;

  // General rule: cannot capture your own piece, except for swaps
  const isSwapMove = ( (piece.type === 'knight' && (piece.level || 1) >=4 && targetPieceOnSquare?.type === 'bishop') ||
                       (piece.type === 'bishop' && (piece.level || 1) >=4 && targetPieceOnSquare?.type === 'knight') );
  
  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color && !isSwapMove) {
    return false;
  }

  // Invulnerability checks
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) { // If it's a capture
    // Target Rook Invulnerability
    if (targetPieceOnSquare.type === 'rook' && (targetPieceOnSquare.level || 1) >= 3 && targetPieceOnSquare.invulnerableTurnsRemaining && targetPieceOnSquare.invulnerableTurnsRemaining > 0) {
      console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Rook Invuln). Target Rook ${targetPieceOnSquare.id} (L${targetPieceOnSquare.level}) at ${to} is invulnerable (Turns: ${targetPieceOnSquare.invulnerableTurnsRemaining}). Attacker: ${piece.type} (L${piece.level}) from ${from}.`);
      return false;
    }
    // Target Queen Invulnerability
    if (targetPieceOnSquare.type === 'queen' && (targetPieceOnSquare.level || 1) >= 5 && (piece.level || 1) < (targetPieceOnSquare.level || 1)) {
      console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Queen Invuln). Target Queen ${targetPieceOnSquare.id} (L${targetPieceOnSquare.level}) at ${to} is invulnerable to Attacker ${piece.type} (L${piece.level}) from ${from}.`);
      return false;
    }
    // Target Bishop (L3+) immunity from Pawn
    if (targetPieceOnSquare.type === 'bishop' && (targetPieceOnSquare.level || 1) >= 3 && piece.type === 'pawn') {
      return false;
    }
  }


  switch (piece.type) {
    case 'pawn':
      const direction = piece.color === 'white' ? -1 : 1;
      const level = piece.level || 1;
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
        return true; // Bishop immunity already checked above
      }
      // Level 2+: Backward move
      if (level >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) {
          return true;
        }
      }
      // Level 3+: Sideways move
      if (level >= 3) {
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
      // Level 2+: 1-square cardinal
      if (knightLevel >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return true;
        }
      }
      // Level 3+: 3-square cardinal jump
      if (knightLevel >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            return true;
        }
      }
      // Level 4+: Swap with friendly bishop (targetPieceOnSquare check is for this)
      if (knightLevel >= 4 && targetPieceOnSquare && targetPieceOnSquare.type === 'bishop' && targetPieceOnSquare.color === piece.color) {
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
            // Level 2+ Bishop can jump over friendly pieces
          } else {
            return false; 
          }
        }
        rBishop += dRowBishop;
        cBishop += dColBishop;
      }
       // Level 4+: Swap with friendly knight
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
      } else { // isBishopMove
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
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);
      const kingLevel = piece.level || 1;

      // Standard 1-square move
      if (dRowKing <= 1 && dColKing <= 1) {
        return true;
      }
      // Level 2+: 2-square move
      if (kingLevel >= 2 && dRowKing <= 2 && dColKing <= 2) {
          // Check for straight line 2-square moves needing clear path
          if ((dRowKing === 2 && dColKing === 0) ||   // Vertical 2-square
              (dRowKing === 0 && dColKing === 2) ||   // Horizontal 2-square
              (dRowKing === 2 && dColKing === 2)) {  // Diagonal 2-square
            const midRow = fromRow + (toRow - fromRow) / 2;
            const midCol = fromCol + (toCol - fromCol) / 2;
            if (board[midRow]?.[midCol]?.piece) {
              return false; 
            }
          }
          return true; 
      }
      // Castling (will be filtered by getPossibleMovesInternal based on checkKingSafety)
      if (!piece.hasMoved && fromCol === 4 && (toCol === 6 || toCol === 2) && fromRow === toRow) {
        // Basic check that it's a castling-like move; full validation happens in getPossibleMovesInternal
        return true;
      }
      return false;
    default:
      return false;
  }
}

export function applyMove(
  board: BoardState,
  move: Move
): { newBoard: BoardState, capturedPiece: Piece | null, conversionEvents: ConversionEvent[] } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  const conversionEvents: ConversionEvent[] = [];

  const movingPieceOriginal = newBoard[fromRow]?.[fromCol]?.piece;
  if (!movingPieceOriginal) return { newBoard: board, capturedPiece: null, conversionEvents }; 

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
    const targetPieceCopy = { ...targetPieceOriginal, hasMoved: targetPieceOriginal.hasMoved }; // Preserve target's hasMoved

    newBoard[toRow][toCol].piece = movingPieceCopy; 
    newBoard[fromRow][fromCol].piece = targetPieceCopy; 
    return { newBoard, capturedPiece: null, conversionEvents };
  }

  const capturedPiece = (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginal.color) ? { ...targetPieceOriginal } : null;

  newBoard[toRow][toCol].piece = { ...movingPieceOriginal, invulnerableTurnsRemaining: movingPieceOriginal.invulnerableTurnsRemaining || 0 };
  newBoard[fromRow][fromCol].piece = null;

  const movingPieceRef = newBoard[toRow]?.[toCol]?.piece;
  if (!movingPieceRef) return { newBoard, capturedPiece, conversionEvents }; // Should not happen if piece was just placed

  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { 
    const kingStartCol = 4; 
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { // Kingside
      const rookOriginalCol = 7; 
      const rookTargetCol = 5;   
      const rookSquareData = newBoard[fromRow]?.[rookOriginalCol];
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
    else if (fromCol === kingStartCol && toCol === kingStartCol - 2) { // Queenside
      const rookOriginalCol = 0; 
      const rookTargetCol = 3;   
      const rookSquareData = newBoard[fromRow]?.[rookOriginalCol];
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
      case 'queen': levelGain = 3; break;
      default: levelGain = 2; break;
    }
    movingPieceRef.level = Math.min(6, (movingPieceOriginal.level || 1) + levelGain);
    
    if (movingPieceRef.type === 'rook' && movingPieceRef.level >= 3 && movingPieceRef.level > levelBeforeCapture) {
        movingPieceRef.invulnerableTurnsRemaining = 1;
        console.log(`VIBE_DEBUG: Setting invulnerableTurnsRemaining=1 for Rook ${movingPieceRef.id} (L${movingPieceRef.level}) at ${coordsToAlgebraic(toRow,toCol)} due to LEVEL-UP.`);
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

  return { newBoard, capturedPiece, conversionEvents };
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

  if (!kingPosAlg) return false; // Or true, if no king means a loss state

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

  return pseudoMoves.filter(targetSquare => {
    // Simulate the move
    const tempBoardState = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));
    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    const pToMoveOriginal = { ...(tempBoardState[fromR]?.[fromC]?.piece) } as Piece; // Assert Piece type

    if (!pToMoveOriginal || Object.keys(pToMoveOriginal).length === 0) return false; // No piece to move
    
    let boardAfterTempMove = tempBoardState;
    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;

    // Special handling for swaps
    const isKnightBishopSwapSim =
      pToMoveOriginal.type === 'knight' && (pToMoveOriginal.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'bishop' && targetPieceForSim.color === pToMoveOriginal.color;
    const isBishopKnightSwapSim =
      pToMoveOriginal.type === 'bishop' && (pToMoveOriginal.level || 1) >= 4 &&
      targetPieceForSim && targetPieceForSim.type === 'knight' && targetPieceForSim.color === pToMoveOriginal.color;

    if (isKnightBishopSwapSim || isBishopKnightSwapSim) {
      boardAfterTempMove[toR][toC].piece = { ...pToMoveOriginal, hasMoved: true };
      boardAfterTempMove[fromR][fromC].piece = { ...(targetPieceForSim as Piece), hasMoved: (targetPieceForSim as Piece).hasMoved };
    } else {
      boardAfterTempMove[toR][toC].piece = { ...pToMoveOriginal, hasMoved: true };
      boardAfterTempMove[fromR][fromC].piece = null;

      // Handle castling rook move in simulation
      if (pToMoveOriginal.type === 'king' && !pToMoveOriginal.hasMoved && Math.abs(fromC - toC) === 2) {
          const kingRow = pToMoveOriginal.color === 'white' ? 7 : 0;
          if (toC > fromC) { // Kingside
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; 
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveOriginal.color) {
                boardAfterTempMove[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                boardAfterTempMove[kingRow][rookOriginalCol].piece = null;
              }
          } else { // Queenside
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow]?.[rookOriginalCol]?.piece; 
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

// Main function to get all truly legal moves for a piece on a square
export function getPossibleMoves(board: BoardState, fromSquare: AlgebraicSquare): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(fromSquare);
    const squareState = board[row]?.[col];
    if (!squareState || !squareState.piece) return [];
    
    const piece = squareState.piece;
    const currentPlayerForCheck = piece.color; // Moves are generated for the piece's owner

    // Get pseudo-legal moves (moves that are valid by piece movement rules)
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true, currentPlayerForCheck);
    
    // Filter these to ensure they don't leave the king in check
    // This call to filterLegalMoves is effectively the primary legality check.
    return filterLegalMoves(board, fromSquare, pseudoMoves, currentPlayerForCheck);
}


function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r]?.[c];
      if(!squareState) continue;
      const piece = squareState.piece;
      if (piece && piece.color === playerColor) {
        const pieceSquareAlgebraic = squareState.algebraic;
        const legalMoves = getPossibleMoves(board, pieceSquareAlgebraic); // getPossibleMoves already filters for legality
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

    