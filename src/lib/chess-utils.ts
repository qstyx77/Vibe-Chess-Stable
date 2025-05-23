
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
            const attackingSquareState = board[r][c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;
            if (attackingPiece && attackingPiece.color === attackerColor) {
                // For pawn attacks, need to check specifically the pawn's attack pattern
                if (attackingPiece.type === 'pawn') {
                    const { row: fromR, col: fromC } = algebraicToCoords(coordsToAlgebraic(r,c));
                    const { row: toR, col: toC } = algebraicToCoords(squareToAttack);
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    // Pawn attacks diagonally
                    if (Math.abs(fromC - toC) === 1 && toR === fromR + direction) {
                        return true;
                    }
                } else if (isMoveValid(board, coordsToAlgebraic(r,c), squareToAttack, attackingPiece)) {
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
  const targetSquareState = board[toRow][toCol];
  const targetPieceOnSquare = targetSquareState.piece;

  // General rule: cannot capture your own piece
  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color) return false;

  // Invulnerability for level 5+ Queens against lower-level pieces
  if (targetPieceOnSquare && targetPieceOnSquare.type === 'queen' && targetPieceOnSquare.level >= 5 && piece.level < targetPieceOnSquare.level) {
    console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Queen Invuln). Target Queen ${targetPieceOnSquare.id} (L${targetPieceOnSquare.level}) at ${to} is invulnerable to Attacker ${piece.type} (L${piece.level}) from ${from}.`);
    return false; 
  }

  // Check for invulnerable rook capture attempt
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color &&
      targetPieceOnSquare.type === 'rook' &&
      targetPieceOnSquare.invulnerableTurnsRemaining && targetPieceOnSquare.invulnerableTurnsRemaining > 0) {
    console.log(`VIBE_DEBUG: CAPTURE BLOCKED (Rook Invuln). Target Rook ${targetPieceOnSquare.id} (L${targetPieceOnSquare.level}) at ${to} is invulnerable (Turns: ${targetPieceOnSquare.invulnerableTurnsRemaining}). Attacker: ${piece.type} (L${piece.level}) from ${from}.`);
    return false; 
  }

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
        // Check if target is a level 3+ Bishop (cannot be captured by pawn)
        if (targetPieceOnSquare.type === 'bishop' && targetPieceOnSquare.level >= 3) {
          return false;
        }
        return true;
      }
      // Level 2+: Backward move
      if (piece.level >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetPieceOnSquare) {
          return true;
        }
      }
      // Level 3+: Sideways move
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
      // Level 2+: 1-square cardinal
      if (piece.level >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return true;
        }
      }
      // Level 3+: 3-square cardinal jump
      if (piece.level >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            return true;
        }
      }
      return false;
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
      // Queen moves like a rook or a bishop
      const isRookMove = fromRow === toRow || fromCol === toCol;
      const isBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isRookMove && !isBishopMove) return false;

      if (isRookMove) { // Rook-like movement
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
      } else { // Bishop-like movement
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

      // Level 2+: 2-square move (including L-shape like moves within 2 squares)
      if (piece.level >= 2 && dRowKing <= 2 && dColKing <= 2) {
          // Check for straight line 2-square moves needing clear path
          if ((dRowKing === 2 && dColKing === 0) ||   // Vertical 2-square
              (dRowKing === 0 && dColKing === 2) ||   // Horizontal 2-square
              (dRowKing === 2 && dColKing === 2)) {  // Diagonal 2-square
            const midRow = fromRow + (toRow - fromRow) / 2;
            const midCol = fromCol + (toCol - fromCol) / 2;
            if (board[midRow][midCol].piece) {
              return false; // Path blocked for straight 2-square move
            }
          }
          return true; // Allows other 2-square moves like knight-like moves
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

  const movingPieceOriginal = newBoard[fromRow][fromCol].piece;
  if (!movingPieceOriginal) return { newBoard: board, capturedPiece: null, conversionEvents }; 

  const targetPieceOriginal = newBoard[toRow][toCol].piece; 

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
    const movingPieceCopy = { ...movingPieceOriginal, hasMoved: true };
    const targetPieceCopy = { ...targetPieceOriginal }; 

    newBoard[toRow][toCol].piece = movingPieceCopy; 
    newBoard[fromRow][fromCol].piece = targetPieceCopy; 
    return { newBoard, capturedPiece: null, conversionEvents };
  }

  const capturedPiece = targetPieceOriginal ? { ...targetPieceOriginal } : null;

  newBoard[toRow][toCol].piece = { ...movingPieceOriginal, invulnerableTurnsRemaining: movingPieceOriginal.invulnerableTurnsRemaining };
  newBoard[fromRow][fromCol].piece = null;

  const movingPieceRef = newBoard[toRow][toCol].piece!;

  if (movingPieceRef.type === 'king' && !movingPieceOriginal.hasMoved) { 
    const kingStartCol = 4; 
    if (fromCol === kingStartCol && toCol === kingStartCol + 2) { 
      const rookOriginalCol = 7; 
      const rookTargetCol = 5;   
      const rookSquareData = newBoard[fromRow][rookOriginalCol];
      if (rookSquareData && rookSquareData.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
    else if (fromCol === kingStartCol && toCol === kingStartCol - 2) { 
      const rookOriginalCol = 0; 
      const rookTargetCol = 3;   
      const rookSquareData = newBoard[fromRow][rookOriginalCol];
      if (rookSquareData && rookSquareData.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === movingPieceRef.color) {
        newBoard[fromRow][rookTargetCol].piece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[fromRow][rookOriginalCol].piece = null;
      }
    }
  }

  if (movingPieceRef.type === 'king' || movingPieceRef.type === 'rook' || (movingPieceRef.type === 'pawn' && !movingPieceOriginal.hasMoved && Math.abs(toRow-fromRow) === 2)) {
    movingPieceRef.hasMoved = true;
  }

  if (capturedPiece) {
    const levelBeforeCapture = movingPieceOriginal.level; // Store level before this specific capture
    switch (capturedPiece.type) {
      case 'pawn':
        movingPieceRef.level += 1;
        break;
      case 'queen':
        movingPieceRef.level += 3;
        break;
      default: 
        movingPieceRef.level += 2;
        break;
    }
    
    if (movingPieceRef.type === 'rook' && movingPieceRef.level >= 3 && movingPieceRef.level > levelBeforeCapture) {
        movingPieceRef.invulnerableTurnsRemaining = 1;
        console.log(`VIBE_DEBUG: Rook ${movingPieceRef.id} (L${movingPieceRef.level} from L${levelBeforeCapture}) at ${coordsToAlgebraic(toRow,toCol)} GAINED invulnerability from leveling up via capture.`);
    }
  }

  if (movingPieceRef.type === 'pawn' && movingPieceRef.level >= 4) {
    const pawnNewRow = toRow;
    const pawnNewCol = toCol;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 
        const adjRow = pawnNewRow + dr;
        const adjCol = pawnNewCol + dc;

        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const enemyPieceToPush = newBoard[adjRow][adjCol].piece;
          if (enemyPieceToPush && enemyPieceToPush.color !== movingPieceRef.color) {
            const pushTargetRow = adjRow + dr; 
            const pushTargetCol = adjCol + dc;

            if (pushTargetRow >= 0 && pushTargetRow < 8 && pushTargetCol >= 0 && pushTargetCol < 8) {
              if (!newBoard[pushTargetRow][pushTargetCol].piece) { 
                newBoard[pushTargetRow][pushTargetCol].piece = { ...enemyPieceToPush }; 
                newBoard[adjRow][adjCol].piece = null; 
              }
            }
          }
        }
      }
    }
  }

  if (movingPieceRef && movingPieceRef.type === 'bishop' && movingPieceRef.level >= 5) {
    const bishopColor = movingPieceRef.color;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; 

        const adjRow = toRow + dr;
        const adjCol = toCol + dc;

        if (adjRow >= 0 && adjRow < 8 && adjCol >= 0 && adjCol < 8) {
          const adjacentSquareState = newBoard[adjRow][adjCol];
          const pieceOnAdjSquare = adjacentSquareState.piece;

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
  const pieceData = board[algebraicToCoords(pieceOriginalSquare).row][algebraicToCoords(pieceOriginalSquare).col];
  if (!pieceData || !pieceData.piece || pieceData.piece.color !== playerColor) return [];

  return pseudoMoves.filter(targetSquare => {
    const tempBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null })));

    const { row: fromR, col: fromC } = algebraicToCoords(pieceOriginalSquare);
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);
    const pToMoveOriginal = tempBoard[fromR][fromC].piece; 

    if (!pToMoveOriginal) return false; 

    let boardAfterTempMove = tempBoard;
    const pOnTargetSquare = tempBoard[toR][toC].piece; 

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
      boardAfterTempMove[fromR][fromC].piece = { ...(pOnTargetSquare as Piece) }; // Ensure pOnTargetSquare is treated as Piece
    } else {
      boardAfterTempMove[toR][toC].piece = { ...pToMoveOriginal, hasMoved: pToMoveOriginal.hasMoved || pToMoveOriginal.type === 'king' || pToMoveOriginal.type === 'rook' }; 
      boardAfterTempMove[fromR][fromC].piece = null;

      if (pToMoveOriginal.type === 'king' && !pToMoveOriginal.hasMoved && Math.abs(fromC - toC) === 2) {
          const kingRow = pToMoveOriginal.color === 'white' ? 7 : 0;
          if (toC > fromC) { 
              const rookOriginalCol = 7; const rookTargetCol = 5;
              const originalRook = board[kingRow][rookOriginalCol].piece; 
              if (originalRook && originalRook.type === 'rook' && originalRook.color === pToMoveOriginal.color) {
                boardAfterTempMove[kingRow][rookTargetCol].piece = {...originalRook, hasMoved: true};
                boardAfterTempMove[kingRow][rookOriginalCol].piece = null;
              }
          } else { 
              const rookOriginalCol = 0; const rookTargetCol = 3;
               const originalRook = board[kingRow][rookOriginalCol].piece; 
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
  return !isKingInCheck(board, playerColor) && !hasAnyLegalMoves(board, playerColor);
}

export function getPossibleMoves(board: BoardState, fromSquare: AlgebraicSquare): AlgebraicSquare[] {
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceData = board[fromRow][fromCol];
  if (!pieceData || !pieceData.piece) return [];
  const piece = pieceData.piece;
  const possible: AlgebraicSquare[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const toSquare = coordsToAlgebraic(r, c);
      if (fromSquare === toSquare) continue;

      // Check for Knight-Bishop or Bishop-Knight swap
      if (piece.type === 'knight' && piece.level >= 4) {
        const targetPieceData = board[r][c];
        if (targetPieceData && targetPieceData.piece && targetPieceData.piece.type === 'bishop' && targetPieceData.piece.color === piece.color) {
          possible.push(toSquare);
          continue; 
        }
      }
      if (piece.type === 'bishop' && piece.level >= 4) {
        const targetPieceData = board[r][c];
        if (targetPieceData && targetPieceData.piece && targetPieceData.piece.type === 'knight' && targetPieceData.piece.color === piece.color) {
          possible.push(toSquare);
          continue;
        }
      }
      
      // Standard move validation
      if (isMoveValid(board, fromSquare, toSquare, piece)) {
        possible.push(toSquare);
      }
    }
  }

  // Castling for King
  if (piece.type === 'king' && !piece.hasMoved && !isKingInCheck(board, piece.color)) {
    const kingRow = piece.color === 'white' ? 7 : 0;
    // Kingside castling (O-O)
    if (
      !board[kingRow][5].piece && !board[kingRow][6].piece &&
      board[kingRow][7].piece && board[kingRow][7].piece?.type === 'rook' &&
      board[kingRow][7].piece?.color === piece.color && !board[kingRow][7].piece?.hasMoved &&
      !isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), piece.color === 'white' ? 'black' : 'white') &&
      !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), piece.color === 'white' ? 'black' : 'white')
    ) {
      possible.push(coordsToAlgebraic(kingRow, 6));
    }
    // Queenside castling (O-O-O)
    if (
      !board[kingRow][1].piece && !board[kingRow][2].piece && !board[kingRow][3].piece &&
      board[kingRow][0].piece && board[kingRow][0].piece?.type === 'rook' &&
      board[kingRow][0].piece?.color === piece.color && !board[kingRow][0].piece?.hasMoved &&
      !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), piece.color === 'white' ? 'black' : 'white') &&
      !isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), piece.color === 'white' ? 'black' : 'white')
    ) {
      possible.push(coordsToAlgebraic(kingRow, 2));
    }
  }
  return possible;
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
