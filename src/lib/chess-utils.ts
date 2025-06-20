
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, SquareState, Move, ConversionEvent, ApplyMoveResult, Item, QueenLevelReducedEvent } from '@/types';

const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export function initializeBoard(): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, item: null, algebraic, rowIndex: r, colIndex: c });
    }
    board.push(row);
  }

  for (let c = 0; c < 8; c++) {
    board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
    board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
    board[7][c].piece = { id: `w${pieceOrder[c][0].toUpperCase()}${c}`, type: pieceOrder[c], color: 'white', level: 1, hasMoved: false, invulnerableTurnsRemaining: 0 };
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
    case 'commander': char = 'P'; break;
    case 'knight': char = 'N'; break;
    case 'bishop': char = 'B'; break;
    case 'rook': char = 'R'; break;
    case 'queen': char = 'Q'; break;
    case 'king': char = 'K'; break;
    case 'hero': char = 'H'; break;
    case 'infiltrator': char = 'I'; break;
    default:
      return '??';
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

export function boardToPositionHash(board: BoardState, currentPlayer: PlayerColor, castlingRights: string, enPassantTargetSquare: AlgebraicSquare | null): string {
  let pieceHash = '';
  let itemHash = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = board[r]?.[c];
      const piece = square?.piece;
      const item = square?.item;
      if (piece) {
        pieceHash += `${getPieceChar(piece)}L${Number(piece.level || 1)}`;
      } else {
        pieceHash += '--';
      }
      if (item?.type === 'anvil') {
        itemHash += 'A';
      } else if (item?.type === 'shroom') {
        itemHash += 'S';
      }
      else {
        itemHash += '-';
      }
    }
  }
  const enPassantTargetStr = enPassantTargetSquare || '-';
  return `${pieceHash}_${itemHash}_${currentPlayer[0]}_${castlingRights}_${enPassantTargetStr}`;
}


export function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean,
    enPassantTargetSquare: AlgebraicSquare | null,
): AlgebraicSquare[] {
  if (!piece) return [];
  const possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';
  const currentLevel = Number(piece.level || 1);


  if (piece.type === 'king') {
    const maxDistance = (typeof currentLevel === 'number' && !isNaN(currentLevel) && currentLevel >= 2) ? 2 : 1;

    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                continue;
            }

            const toR = fromRow + dr;
            const toC = fromCol + dc;
            if (!isValidSquare(toR, toC) || (board[toR]?.[toC]?.item && board[toR]?.[toC]?.item?.type !== 'shroom')) continue;
            
            const finalTargetSquareAlgebraic = coordsToAlgebraic(toR, toC);
            const pieceOnFinalTarget = board[toR]?.[toC]?.piece;

            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) ) {
                const midR = fromRow + Math.sign(dr);
                const midC = fromCol + Math.sign(dc);
                if (!isValidSquare(midR, midC) || board[midR]?.[midC]?.piece || (board[midR]?.[midC]?.item && board[midR]?.[midC]?.item?.type !== 'shroom') ) continue;
                
                let isIntermediatePathSafe = true;
                if (checkKingSafety) {
                    if (isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor, true, pieceOnFinalTarget ? finalTargetSquareAlgebraic : null, enPassantTargetSquare )) {
                        isIntermediatePathSafe = false;
                    }
                }
                if (!isIntermediatePathSafe) {
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
    const actualKingLevelForKnightMove = Number(piece.level || 1);
    if (typeof actualKingLevelForKnightMove === 'number' && !isNaN(actualKingLevelForKnightMove) && actualKingLevelForKnightMove >= 5) {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr_n, dc_n] of knightDeltas) {
            const toR_n = fromRow + dr_n;
            const toC_n = fromCol + dc_n;
            if (isValidSquare(toR_n, toC_n) && (!board[toR_n]?.[toC_n]?.item || board[toR_n]?.[toC_n]?.item?.type === 'shroom')) {
                const targetPiece_n = board[toR_n]?.[toC_n]?.piece;
                if (!targetPiece_n || targetPiece_n.color !== pieceColor) {
                     if (!isPieceInvulnerableToAttack(targetPiece_n, piece)) {
                        possible.push(coordsToAlgebraic(toR_n, toC_n));
                    }
                }
            }
        }
    }

    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor, enPassantTargetSquare)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        if (fromRow === kingRow && fromCol === 4) {
            const krSquare = board[kingRow]?.[7];
            if (krSquare?.piece?.type === 'rook' && !krSquare.piece.hasMoved &&
                !board[kingRow]?.[5]?.piece && (!board[kingRow]?.[5]?.item || board[kingRow]?.[5]?.item?.type === 'shroom') &&
                !board[kingRow]?.[6]?.piece && (!board[kingRow]?.[6]?.item || board[kingRow]?.[6]?.item?.type === 'shroom')
                ) {
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, true, null, enPassantTargetSquare) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor, true, null, enPassantTargetSquare) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor, true, null, enPassantTargetSquare)) {
                    possible.push(coordsToAlgebraic(kingRow, 6));
                }
            }
            const qrSquare = board[kingRow]?.[0];
            if (qrSquare?.piece?.type === 'rook' && !qrSquare.piece.hasMoved &&
                !board[kingRow]?.[1]?.piece && (!board[kingRow]?.[1]?.item || board[kingRow]?.[1]?.item?.type === 'shroom') &&
                !board[kingRow]?.[2]?.piece && (!board[kingRow]?.[2]?.item || board[kingRow]?.[2]?.item?.type === 'shroom') &&
                !board[kingRow]?.[3]?.piece && (!board[kingRow]?.[3]?.item || board[kingRow]?.[3]?.item?.type === 'shroom')
                 ) {
                if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, true, null, enPassantTargetSquare) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor, true, null, enPassantTargetSquare) &&
                    !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor, true, null, enPassantTargetSquare)) {
                    possible.push(coordsToAlgebraic(kingRow, 2));
                }
            }
        }
    }
  } else if (piece.type === 'pawn' || piece.type === 'infiltrator') {
      for (let r_idx = 0; r_idx < 8; r_idx++) {
        for (let c_idx = 0; c_idx < 8; c_idx++) {
          const toSquare = coordsToAlgebraic(r_idx,c_idx);
          if (isMoveValid(board, fromSquare, toSquare, piece, enPassantTargetSquare)) {
              possible.push(toSquare);
          }
        }
      }
  } else {
    for (let r_idx = 0; r_idx < 8; r_idx++) {
        for (let c_idx = 0; c_idx < 8; c_idx++) {
          const toSquare = coordsToAlgebraic(r_idx,c_idx);
          if (isMoveValid(board, fromSquare, toSquare, piece, enPassantTargetSquare)) {
              possible.push(toSquare);
          }
        }
      }
  }

  const pieceActualLevelForSwap = Number(piece.level || 1);
  if (typeof pieceActualLevelForSwap === 'number' && !isNaN(pieceActualLevelForSwap)) {
    if ((piece.type === 'knight' || piece.type === 'hero') && pieceActualLevelForSwap >= 4) {
        for (let r_idx = 0; r_idx < 8; r_idx++) {
        for (let c_idx = 0; c_idx < 8; c_idx++) {
            const targetSquareState = board[r_idx]?.[c_idx];
            if (targetSquareState?.piece && targetSquareState.piece.color === piece.color && targetSquareState.piece.type === 'bishop' && (!targetSquareState.item || targetSquareState.item.type === 'shroom')) {
              possible.push(coordsToAlgebraic(r_idx, c_idx));
            }
        }
        }
    }
    if (piece.type === 'bishop' && pieceActualLevelForSwap >= 4) {
        for (let r_idx = 0; r_idx < 8; r_idx++) {
        for (let c_idx = 0; c_idx < 8; c_idx++) {
            const targetSquareState = board[r_idx]?.[c_idx];
            if (targetSquareState?.piece && targetSquareState.piece.color === piece.color && (targetSquareState.piece.type === 'knight' || targetSquareState.piece.type === 'hero') && (!targetSquareState.item || targetSquareState.item.type === 'shroom')) {
              possible.push(coordsToAlgebraic(r_idx, c_idx));
            }
        }
        }
    }
  }
  return possible;
}

export function isValidSquare(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function isSquareAttacked(
    board: BoardState,
    squareToAttack: AlgebraicSquare,
    attackerColor: PlayerColor,
    simplifyKingCheck: boolean = false,
    ignoreAttackerAtSquare?: AlgebraicSquare | null,
    enPassantTargetSquare?: AlgebraicSquare | null,
): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareAlgebraic = coordsToAlgebraic(r,c);
            if (ignoreAttackerAtSquare && attackingSquareAlgebraic === ignoreAttackerAtSquare) {
                continue;
            }

            const attackingSquareState = board[r]?.[c];
            if (!attackingSquareState) continue;
            const attackingPiece = attackingSquareState.piece;

            if (attackingPiece && attackingPiece.color === attackerColor) {
                const pieceOnTargetSq = board[targetR]?.[targetC]?.piece;
                if (attackingPiece.type === 'pawn' || attackingPiece.type === 'commander') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) {
                        if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                           return true;
                        }
                    }
                } else if (attackingPiece.type === 'infiltrator') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                     if ( (r + direction === targetR && c === targetC) || 
                          (r + direction === targetR && Math.abs(c - targetC) === 1)
                        ) {
                        if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                           return true;
                        }
                    }
                } else if (attackingPiece.type === 'king') {
                    const { row: kingR_from, col: kingC_from } = algebraicToCoords(coordsToAlgebraic(r, c));
                    const currentKingActualLevel = Number(attackingPiece.level || 1);
                    let maxDistance = (typeof currentKingActualLevel === 'number' && !isNaN(currentKingActualLevel) && currentKingActualLevel >= 2 && !simplifyKingCheck) ? 2 : 1;
                    let canKnightMove = (typeof currentKingActualLevel === 'number' && !isNaN(currentKingActualLevel) && currentKingActualLevel >= 5 && !simplifyKingCheck);

                    const dr_king = targetR - kingR_from;
                    const dc_king = targetC - kingC_from;

                    if (Math.abs(dr_king) <= maxDistance && Math.abs(dc_king) <= maxDistance && (dr_king === 0 || dc_king === 0 || Math.abs(dr_king) === Math.abs(dc_king))) {
                        if (maxDistance === 2 && (Math.abs(dr_king) === 2 || Math.abs(dc_king) === 2)) {
                            const midR = kingR_from + Math.sign(dr_king);
                            const midC = kingC_from + Math.sign(dc_king);
                            if (board[midR]?.[midC]?.piece || (board[midR]?.[midC]?.item && board[midR]?.[midC]?.item?.type !== 'shroom') ) {
                            } else if (board[targetR]?.[targetC]?.item && board[targetR]?.[targetC]?.item?.type !== 'shroom') {
                            } else if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                                return true;
                            }
                        } else {
                           if (board[targetR]?.[targetC]?.item && board[targetR]?.[targetC]?.item?.type !== 'shroom') {
                           } else if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                                return true;
                           }
                        }
                    }

                    if (canKnightMove) {
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr_n, dc_n] of knightDeltas) {
                            if (kingR_from + dr_n === targetR && kingC_from + dc_n === targetC) {
                                if (board[targetR]?.[targetC]?.item && board[targetR]?.[targetC]?.item?.type !== 'shroom') continue;
                                if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece)) {
                                    return true;
                                }
                            }
                        }
                    }
                } else {
                    const pseudoMoves = getPossibleMovesInternal(board, coordsToAlgebraic(r,c), attackingPiece, false, enPassantTargetSquare);
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


export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  if (from === to && !((piece.type === 'knight' || piece.type === 'hero') && (Number(piece.level || 1)) >= 5)) return false;

  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);

  if (!isValidSquare(toRow, toCol)) return false;

  const targetSquareState = board[toRow]?.[toCol];
  if (targetSquareState?.item && targetSquareState.item.type !== 'shroom') return false;

  const targetPieceOnSquare = targetSquareState?.piece;
  const pieceActualLevel = Number(piece.level || 1);


  const isKnightOrHeroBishopSwap =
    (piece.type === 'knight' || piece.type === 'hero') &&
    (typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4) &&
    targetPieceOnSquare &&
    targetPieceOnSquare.type === 'bishop' &&
    targetPieceOnSquare.color === piece.color;

  const isBishopKnightOrHeroSwap =
    piece.type === 'bishop' &&
    (typeof pieceActualLevel === 'number' && !isNaN(pieceActualLevel) && pieceActualLevel >= 4) &&
    targetPieceOnSquare &&
    (targetPieceOnSquare.type === 'knight' || targetPieceOnSquare.type === 'hero') &&
    targetPieceOnSquare.color === piece.color;


  if (isKnightOrHeroBishopSwap || isBishopKnightOrHeroSwap) {
    return true;
  }

  if (piece.type === 'pawn' && to === enPassantTargetSquare) {
    const { row: epRow, col: epCol } = algebraicToCoords(enPassantTargetSquare);
    const capturedPawnRow = piece.color === 'white' ? epRow + 1 : epRow - 1;
    if (fromCol !== epCol && Math.abs(fromCol - epCol) === 1 && fromRow === capturedPawnRow) {
      const capturedPawnSquareState = board[capturedPawnRow]?.[epCol];
      if (capturedPawnSquareState?.piece?.type === 'pawn' && capturedPawnSquareState.piece.color !== piece.color) {
         if (!board[toRow]?.[toCol]?.piece) { 
            return true;
         }
      }
    }
  }


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
    case 'commander':
      const direction = piece.color === 'white' ? -1 : 1;
      const levelPawn = Number(piece.level || 1);
      if (fromCol === toCol && toRow === fromRow + direction && !targetSquareState?.piece && (!targetSquareState?.item || targetSquareState.item.type === 'shroom')) {
        return true;
      }
      if (
        fromCol === toCol && !targetSquareState?.piece && (!targetSquareState?.item || targetSquareState.item.type === 'shroom') && !piece.hasMoved &&
        ((piece.color === 'white' && fromRow === 6 && toRow === 4 && !board[5]?.[fromCol]?.piece && (!board[5]?.[fromCol]?.item || board[5]?.[fromCol]?.item?.type === 'shroom')) ||
         (piece.color === 'black' && fromRow === 1 && toRow === 3 && !board[2]?.[fromCol]?.piece && (!board[2]?.[fromCol]?.item || board[2]?.[fromCol]?.item?.type === 'shroom')))
      ) {
        return true;
      }
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetSquareState?.piece && targetSquareState.piece.color !== piece.color && (!targetSquareState?.item || targetSquareState.item.type === 'shroom')) {
        return true;
      }
      if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 2) {
        const backwardDirection = direction * -1;
        if (fromCol === toCol && toRow === fromRow + backwardDirection && !targetSquareState?.piece && (!targetSquareState?.item || targetSquareState.item.type === 'shroom')) {
          return true;
        }
      }
      if (typeof levelPawn === 'number' && !isNaN(levelPawn) && levelPawn >= 3) {
        if (toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetSquareState?.piece && (!targetSquareState?.item || targetSquareState.item.type === 'shroom')) {
          return true;
        }
      }
      return false;
    case 'infiltrator':
      const infiltratorDir = piece.color === 'white' ? -1 : 1;
      if (toRow === fromRow + infiltratorDir && (fromCol === toCol || Math.abs(fromCol - toCol) === 1) && (!targetSquareState.item || targetSquareState.item.type === 'shroom')) {
        if (!targetSquareState.piece || (targetSquareState.piece.color !== piece.color && !isPieceInvulnerableToAttack(targetSquareState.piece, piece))) {
          return true;
        }
      }
      return false;
    case 'knight':
    case 'hero':
      const dRowKnight = Math.abs(toRow - fromRow);
      const dColKnight = Math.abs(toCol - fromCol);
      const knightLevel = Number(piece.level || 1);

      if ((dRowKnight === 2 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 2)) {
        return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
      }
      if (typeof knightLevel === 'number' && !isNaN(knightLevel) && knightLevel >= 2) {
        if ((dRowKnight === 0 && dColKnight === 1) || (dRowKnight === 1 && dColKnight === 0)) {
          return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
        }
      }
      if (typeof knightLevel === 'number' && !isNaN(knightLevel) && knightLevel >= 3) {
        if ((dRowKnight === 0 && dColKnight === 3) || (dRowKnight === 3 && dColKnight === 0)) {
            if (dRowKnight === 3) {
                if (board[fromRow + Math.sign(toRow - fromRow)]?.[fromCol]?.piece || (board[fromRow + Math.sign(toRow - fromRow)]?.[fromCol]?.item && board[fromRow + Math.sign(toRow - fromRow)]?.[fromCol]?.item?.type !== 'shroom') ||
                    board[fromRow + 2 * Math.sign(toRow - fromRow)]?.[fromCol]?.piece || (board[fromRow + 2 * Math.sign(toRow - fromRow)]?.[fromCol]?.item && board[fromRow + 2 * Math.sign(toRow - fromRow)]?.[fromCol]?.item?.type !== 'shroom')) return false;
            } else {
                if (board[fromRow]?.[fromCol + Math.sign(toCol - fromCol)]?.piece || (board[fromRow]?.[fromCol + Math.sign(toCol - fromCol)]?.item && board[fromRow]?.[fromCol + Math.sign(toCol - fromCol)]?.item?.type !== 'shroom') ||
                    board[fromRow]?.[fromCol + 2 * Math.sign(toCol - fromCol)]?.piece || (board[fromRow]?.[fromCol + 2 * Math.sign(toCol - fromCol)]?.item && board[fromRow]?.[fromCol + 2 * Math.sign(toCol - fromCol)]?.item?.type !== 'shroom')) return false;
            }
            return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
        }
      }
      return false;
    case 'rook':
      if (fromRow !== toRow && fromCol !== toCol) return false;
      if (fromRow === toRow) {
        const step = toCol > fromCol ? 1 : -1;
        for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
          if (board[fromRow]?.[c_path]?.piece || (board[fromRow]?.[c_path]?.item && board[fromRow]?.[c_path]?.item?.type !== 'shroom')) return false;
        }
      } else {
        const step = toRow > fromRow ? 1 : -1;
        for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
          if (board[r_path]?.[fromCol]?.piece || (board[r_path]?.[fromCol]?.item && board[r_path]?.[fromCol]?.item?.type !== 'shroom')) return false;
        }
      }
      return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
    case 'bishop':
      const bishopLevel = Number(piece.level || 1);
      if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false;
      const dRowDirBishop = Math.sign(toRow - fromRow);
      const dColDirBishop = Math.sign(toCol - fromCol);
      let currRBishop = fromRow + dRowDirBishop;
      let currCBishop = fromCol + dColDirBishop;

      while (currRBishop !== toRow || currCBishop !== toCol) {
          if (!isValidSquare(currRBishop, currCBishop)) return false;
          const pathSquare = board[currRBishop]?.[currCBishop];
          if (pathSquare?.item && pathSquare.item.type !== 'shroom') return false;
          const pathPiece = pathSquare?.piece;
          if (pathPiece) {
            if (typeof bishopLevel === 'number' && !isNaN(bishopLevel) && bishopLevel >= 2 && pathPiece.color === piece.color) {
            } else {
              return false;
            }
          }
          currRBishop += dRowDirBishop;
          currCBishop += dColDirBishop;
      }
      return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
    case 'queen':
      const isQueenRookMove = fromRow === toRow || fromCol === toCol;
      const isQueenBishopMove = Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol);
      if (!isQueenRookMove && !isQueenBishopMove) return false;

      if (isQueenRookMove) {
        if (fromRow === toRow) {
          const step = toCol > fromCol ? 1 : -1;
          for (let c_path = fromCol + step; c_path !== toCol; c_path += step) {
            if (board[fromRow]?.[c_path]?.piece || (board[fromRow]?.[c_path]?.item && board[fromRow]?.[c_path]?.item?.type !== 'shroom')) return false;
          }
        } else {
          const step = toRow > fromRow ? 1 : -1;
          for (let r_path = fromRow + step; r_path !== toRow; r_path += step) {
            if (board[r_path]?.[fromCol]?.piece || (board[r_path]?.[fromCol]?.item && board[r_path]?.[fromCol]?.item?.type !== 'shroom')) return false;
          }
        }
      } else { 
        const dRowDirQueen = Math.sign(toRow - fromRow);
        const dColDirQueen = Math.sign(toCol - fromCol);
        let currRQueen = fromRow + dRowDirQueen;
        let currCQueen = fromCol + dColDirQueen;

        while (currRQueen !== toRow || currCQueen !== toCol) {
            if (!isValidSquare(currRQueen, currCQueen)) return false;
            if (board[currRQueen]?.[currCQueen]?.piece || (board[currRQueen]?.[currCQueen]?.item && board[currRQueen]?.[currCQueen]?.item?.type !== 'shroom')) {
                return false;
            }
            currRQueen += dRowDirQueen;
            currCQueen += dColDirQueen;
        }
      }
      return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
    case 'king':
      const dRowKing = Math.abs(toRow - fromRow);
      const dColKing = Math.abs(toCol - fromCol);
      const kingActualLevelForValidity = Number(piece.level || 1);
      const maxKingDistance = (typeof kingActualLevelForValidity === 'number' && !isNaN(kingActualLevelForValidity) && kingActualLevelForValidity >= 2) ? 2 : 1;

      if (typeof kingActualLevelForValidity === 'number' && !isNaN(kingActualLevelForValidity) && kingActualLevelForValidity >= 5) {
        if ((dRowKing === 2 && dColKing === 1) || (dRowKing === 1 && dColKing === 2)) {
          return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
        }
      }
      if (dRowKing <= maxKingDistance && dColKing <= maxKingDistance && (dRowKing === 0 || dColKing === 0 || dRowKing === dColKing)) {
        if (maxKingDistance === 2 && (dRowKing === 2 || dColKing === 2)) { 
            const midRow = fromRow + Math.sign(toRow - fromRow);
            const midCol = fromCol + Math.sign(toCol - fromCol);
            if (board[midRow]?.[midCol]?.piece || (board[midRow]?.[midCol]?.item && board[midRow]?.[midCol]?.item?.type !== 'shroom')) {
                return false; 
            }
        }
        return !targetSquareState?.item || targetSquareState.item.type === 'shroom';
      }
      return false;
    default:
      return false;
  }
}

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null): boolean {
    if (!targetPiece || !attackingPiece) return false;
    const targetLevel = Number(targetPiece.level || 1);
    const attackerLevel = Number(attackingPiece.level || 1);

    if (typeof targetLevel !== 'number' || isNaN(targetLevel) || typeof attackerLevel !== 'number' || isNaN(attackerLevel)) {
        return false;
    }
    
    const specialQueenHunters: PieceType[] = ['commander', 'hero', 'infiltrator'];
    if (targetPiece.type === 'queen' && specialQueenHunters.includes(attackingPiece.type)) {
        return false; // These units can capture queens regardless of L7 or level diff
    }

    if (targetPiece.type === 'queen' && targetLevel >= 7) {
        if (attackerLevel < targetLevel) {
            return true;
        }
    }

    if (targetPiece.type === 'bishop' && targetLevel >= 3 && (attackingPiece.type === 'pawn' || attackingPiece.type === 'commander' || attackingPiece.type === 'infiltrator')) {
      return true;
    }
    if (targetPiece.invulnerableTurnsRemaining && targetPiece.invulnerableTurnsRemaining > 0) {
        return true;
    }
    return false;
}

export function applyMove(
  board: BoardState,
  move: Move,
  enPassantTargetSquare: AlgebraicSquare | null
): ApplyMoveResult {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));

  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  const conversionEvents: ConversionEvent[] = [];
  let selfCheckByPushBack = false;
  let pieceCapturedByAnvil: Piece | null = null;
  let anvilPushedOffBoard = false;
  let queenLevelReducedEventsInternal: QueenLevelReducedEvent[] | null = null;
  let isEnPassantCapture = false;
  let promotedToInfiltrator = false;
  let infiltrationWin = false;
  let newEnPassantTargetSet: AlgebraicSquare | null = null;
  let shroomConsumedThisMove = false;


  const movingPieceOriginalRef = newBoard[fromRow]?.[fromCol]?.piece;
  if (!movingPieceOriginalRef) {
    return { newBoard: board, capturedPiece: null, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, enPassantTargetSet: null, shroomConsumed: false };
  }

  const originalPieceLevel = Number(movingPieceOriginalRef.level || 1);
  const targetPieceOriginal = newBoard[toRow]?.[toCol]?.piece;
  const targetItemOriginal = newBoard[toRow]?.[toCol]?.item;

  if (targetItemOriginal && targetItemOriginal.type !== 'shroom') { 
    return { newBoard: board, capturedPiece: null, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel, selfCheckByPushBack, queenLevelReducedEvents: null, enPassantTargetSet: null, shroomConsumed: shroomConsumedThisMove };
  }

  const movingPieceActualLevelForSwap = Number(movingPieceOriginalRef.level || 1);
  if (typeof movingPieceActualLevelForSwap === 'number' && !isNaN(movingPieceActualLevelForSwap) &&
    (((movingPieceOriginalRef.type === 'knight' || movingPieceOriginalRef.type === 'hero') && movingPieceActualLevelForSwap >= 4 && targetPieceOriginal?.type === 'bishop' && targetPieceOriginal.color === movingPieceOriginalRef.color) ||
    (movingPieceOriginalRef.type === 'bishop' && movingPieceActualLevelForSwap >= 4 && (targetPieceOriginal?.type === 'knight' || targetPieceOriginal?.type === 'hero') && targetPieceOriginal.color === movingPieceOriginalRef.color))
  ) {
    if (targetItemOriginal?.type === 'shroom') {
        shroomConsumedThisMove = true;
        newBoard[toRow][col].item = null; 
        movingPieceOriginalRef.level = Math.min( (movingPieceOriginalRef.type === 'queen' ? 7 : Infinity) , (movingPieceOriginalRef.level || 1) + 1);
    }
    const movingPieceCopy = { ...movingPieceOriginalRef, hasMoved: true };
    const targetPieceCopy = { ...targetPieceOriginal!, hasMoved: targetPieceOriginal!.hasMoved || true };
    newBoard[toRow][toCol].piece = movingPieceCopy;
    newBoard[fromRow][fromCol].piece = targetPieceCopy;
    return { newBoard, capturedPiece: null, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel, selfCheckByPushBack, queenLevelReducedEvents: null, enPassantTargetSet: null, shroomConsumed: shroomConsumedThisMove };
  }

  let capturedPiece: Piece | null = null;
  if (move.type === 'enpassant' && enPassantTargetSquare === move.to) {
    isEnPassantCapture = true;
    const capturedPawnRow = movingPieceOriginalRef.color === 'white' ? toRow + 1 : toRow - 1;
    const capturedPawnCol = toCol;
    if (isValidSquare(capturedPawnRow, capturedPawnCol) && newBoard[capturedPawnRow]?.[capturedPawnCol]?.piece?.type === 'pawn') {
      capturedPiece = { ...newBoard[capturedPawnRow][capturedPawnCol].piece! };
      newBoard[capturedPawnRow][capturedPawnCol].piece = null;
    }
  } else if (targetPieceOriginal && targetPieceOriginal.color !== movingPieceOriginalRef.color) {
    capturedPiece = { ...targetPieceOriginal };
  }


  const movingPieceForToSquare = { ...movingPieceOriginalRef };
  newBoard[toRow][toCol].piece = movingPieceForToSquare;
  newBoard[fromRow][fromCol].piece = null;

  if (targetItemOriginal?.type === 'shroom') {
    shroomConsumedThisMove = true;
    newBoard[toRow][toCol].item = null; 
    movingPieceForToSquare.level = (movingPieceForToSquare.level || 1) + 1;
    if (movingPieceForToSquare.type === 'queen') {
      movingPieceForToSquare.level = Math.min(movingPieceForToSquare.level, 7);
    }
  }

  const pieceNowOnToSquare = newBoard[toRow]?.[toCol]?.piece;
  if (!pieceNowOnToSquare) { 
    return { newBoard, capturedPiece, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel, selfCheckByPushBack, queenLevelReducedEvents: null, enPassantTargetSet: null, shroomConsumed: shroomConsumedThisMove };
  }

  if (movingPieceOriginalRef.type === 'pawn' && Math.abs(fromRow - toRow) === 2) {
    newEnPassantTargetSet = coordsToAlgebraic(fromRow + (movingPieceOriginalRef.color === 'white' ? -1 : 1), fromCol);
  }


  if (pieceNowOnToSquare.type === 'king' && !movingPieceOriginalRef.hasMoved && move.type === 'castle') { 
    const kingStartCol = 4;
    if (fromCol === kingStartCol && Math.abs(fromCol - toCol) === 2) { 
      const kingRow = fromRow;
      const rookOriginalCol = toCol > fromCol ? 7 : 0;
      const rookTargetCol = toCol > fromCol ? 5 : 3;
      const rookSquareData = newBoard[kingRow]?.[rookOriginalCol]; // Use newBoard here
      if (rookSquareData?.piece && rookSquareData.piece.type === 'rook' && rookSquareData.piece.color === pieceNowOnToSquare.color) {
        const movedRookPiece = { ...rookSquareData.piece, hasMoved: true };
        newBoard[kingRow][rookTargetCol].piece = movedRookPiece;
        newBoard[kingRow][rookOriginalCol].piece = null;

        const rookLandingSquareState = newBoard[kingRow]?.[rookTargetCol];
        if (rookLandingSquareState?.item?.type === 'shroom') {
          shroomConsumedThisMove = true;
          rookLandingSquareState.item = null; 
          if (rookLandingSquareState.piece) { 
            rookLandingSquareState.piece.level = (rookLandingSquareState.piece.level || 1) + 1;
          }
        }
      }
    }
  }
  pieceNowOnToSquare.hasMoved = true;

  if (capturedPiece && !(movingPieceOriginalRef.type === 'pawn' && (toRow === 0 || toRow === 7) && !isEnPassantCapture)) {
    let levelGain = 0;
    switch (capturedPiece.type) {
      case 'pawn': levelGain = 1; break;
      case 'commander': levelGain = 1; break;
      case 'hero': levelGain = 2; break;
      case 'knight': levelGain = 2; break;
      case 'bishop': levelGain = 2; break;
      case 'rook': levelGain = 2; break;
      case 'queen': levelGain = 3; break;
      case 'king': levelGain = 1; break;
      case 'infiltrator': levelGain = 1; break;
      default: levelGain = 0; break;
    }
    let newLevelForPiece = (pieceNowOnToSquare.level || 1) + levelGain;
    if (pieceNowOnToSquare.type === 'queen') {
      newLevelForPiece = Math.min(newLevelForPiece, 7);
    }
    pieceNowOnToSquare.level = newLevelForPiece;

    if (movingPieceOriginalRef.type === 'pawn' && capturedPiece.type === 'commander') {
        pieceNowOnToSquare.type = 'commander';
        pieceNowOnToSquare.id = `${pieceNowOnToSquare.id}_CmdrByCapture`;
    }

    if (pieceNowOnToSquare.type === 'commander') {
      const commanderColor = pieceNowOnToSquare.color;
      for (let r_pawn = 0; r_pawn < 8; r_pawn++) {
        for (let c_pawn = 0; c_pawn < 8; c_pawn++) {
          const squarePawn = newBoard[r_pawn][c_pawn];
          if (squarePawn.piece && squarePawn.piece.color === commanderColor && squarePawn.piece.type === 'pawn' && squarePawn.piece.id !== pieceNowOnToSquare.id) {
            let newPawnLevel = (squarePawn.piece.level || 1) + 1;
            squarePawn.piece.level = newPawnLevel;
          }
        }
      }
    } else if (pieceNowOnToSquare.type === 'hero') {
      const heroColor = pieceNowOnToSquare.color;
      for (let r_ally = 0; r_ally < 8; r_ally++) {
        for (let c_ally = 0; c_ally < 8; c_ally++) {
          const allySquare = newBoard[r_ally][c_ally];
          if (allySquare.piece && allySquare.piece.color === heroColor && allySquare.piece.id !== pieceNowOnToSquare.id) {
            let newAllyLevel = (allySquare.piece.level || 1) + 1;
            if (allySquare.piece.type === 'queen') {
              newAllyLevel = Math.min(newAllyLevel, 7);
            }
            allySquare.piece.level = newAllyLevel;
          }
        }
      }
    }
  }


  // Promotion-specific leveling and typing
  if (isEnPassantCapture && movingPieceOriginalRef.type === 'pawn') {
    // pieceNowOnToSquare.level is already set by general capture logic for en passant
    pieceNowOnToSquare.type = 'infiltrator';
    pieceNowOnToSquare.id = `${pieceNowOnToSquare.id}_infiltrator`;
    promotedToInfiltrator = true;
  } else if (movingPieceOriginalRef.type === 'pawn' && (toRow === 0 || toRow === 7) && !promotedToInfiltrator) {
    let finalPromotionLevel = 1; 
    if (capturedPiece && capturedPiece.id === targetPieceOriginal?.id) {
        switch (capturedPiece.type) {
            case 'pawn':
            case 'commander':
            case 'infiltrator':
                finalPromotionLevel = 2; break;
            case 'queen':
                finalPromotionLevel = 4; break;
            case 'knight':
            case 'bishop':
            case 'rook':
            case 'hero':
                finalPromotionLevel = 3; break;
        }
    }
    pieceNowOnToSquare.level = finalPromotionLevel;
    if (move.promoteTo) {
        pieceNowOnToSquare.type = move.promoteTo;
        if (move.promoteTo === 'queen') {
            pieceNowOnToSquare.level = Math.min(pieceNowOnToSquare.level, 7);
        }
    }
  } else if (movingPieceOriginalRef.type === 'commander' && (toRow === 0 || toRow === 7)) {
    pieceNowOnToSquare.type = 'hero';
    pieceNowOnToSquare.id = `${pieceNowOnToSquare.id}_HeroPromo`;
  }


  if (pieceNowOnToSquare.type === 'infiltrator' && ( (pieceNowOnToSquare.color === 'white' && toRow === 0) || (pieceNowOnToSquare.color === 'black' && toRow === 7) ) ) {
    infiltrationWin = true;
  }


  if (
    pieceNowOnToSquare.type === 'king' &&
    pieceNowOnToSquare.level > originalPieceLevel 
  ) {
    let kingLevelGainFromCapture = 0;
    if (capturedPiece) {
        kingLevelGainFromCapture = (pieceNowOnToSquare.level || 1) - (originalPieceLevel + (shroomConsumedThisMove ? 1:0));
    }

    if (kingLevelGainFromCapture > 0) {
      queenLevelReducedEventsInternal = [];
      const kingColor = pieceNowOnToSquare.color;
      const opponentColor = kingColor === 'white' ? 'black' : 'white';

      for (let r_qlr = 0; r_qlr < 8; r_qlr++) {
        for (let c_qlr = 0; c_qlr < 8; c_qlr++) {
          const square_qlr = newBoard[r_qlr]?.[c_qlr];
          if (square_qlr?.piece && square_qlr.piece.type === 'queen' && square_qlr.piece.color === opponentColor) {
            const originalQueenLevel = square_qlr.piece.level;
            const newQueenLevel = Math.max(1, originalQueenLevel - kingLevelGainFromCapture);
            if (newQueenLevel < originalQueenLevel) {
              queenLevelReducedEventsInternal.push({
                queenId: square_qlr.piece.id,
                originalLevel: originalQueenLevel,
                newLevel: newQueenLevel,
                reductionAmount: kingLevelGainFromCapture,
                reducedByKingOfColor: kingColor,
              });
              square_qlr.piece.level = newQueenLevel;
            }
          }
        }
      }
      if (queenLevelReducedEventsInternal.length === 0) {
          queenLevelReducedEventsInternal = null;
      }
    }
  }


  const pieceNowOnToSquareActualLevel = Number(pieceNowOnToSquare.level || 1);
  let pushBackOccurredForSelfCheck = false;

  if (typeof pieceNowOnToSquareActualLevel === 'number' && !isNaN(pieceNowOnToSquareActualLevel)) {
    if ((pieceNowOnToSquare.type === 'pawn' || pieceNowOnToSquare.type === 'commander') && pieceNowOnToSquareActualLevel >= 4) {
        const pawnNewRow = toRow;
        const pawnNewCol = toCol;
        for (let dr_pb = -1; dr_pb <= 1; dr_pb++) {
        for (let dc_pb = -1; dc_pb <= 1; dc_pb++) {
            if (dr_pb === 0 && dc_pb === 0) continue;
            const adjRow_pb = pawnNewRow + dr_pb;
            const adjCol_pb = pawnNewCol + dc_pb;

            if (isValidSquare(adjRow_pb, adjCol_pb)) {
              const adjacentSquareState = newBoard[adjRow_pb][adjCol_pb];
              const entityToPush = adjacentSquareState.piece || adjacentSquareState.item;
              const isEntityAnvil = adjacentSquareState.item?.type === 'anvil';

              if (entityToPush && (isEntityAnvil || (adjacentSquareState.piece && adjacentSquareState.piece!.color !== pieceNowOnToSquare.color))) {
                const pushTargetRow_pb = adjRow_pb + dr_pb;
                const pushTargetCol_pb = adjCol_pb + dc_pb;

                if (isEntityAnvil) {
                  if (!isValidSquare(pushTargetRow_pb, pushTargetCol_pb)) {
                    newBoard[adjRow_pb][adjCol_pb].item = null;
                    anvilPushedOffBoard = true;
                  } else {
                    const destinationSquareState = newBoard[pushTargetRow_pb][pushTargetCol_pb];
                    if (destinationSquareState.item?.type === 'anvil') {
                    } else if (destinationSquareState.piece && destinationSquareState.piece.type !== 'king') {
                      pieceCapturedByAnvil = { ...destinationSquareState.piece };
                      destinationSquareState.piece = null;
                      destinationSquareState.item = { type: 'anvil' };
                      newBoard[adjRow_pb][adjCol_pb].item = null;
                    } else if (destinationSquareState.piece && destinationSquareState.piece.type === 'king') {
                    } else {
                      destinationSquareState.item = { type: 'anvil' };
                      newBoard[adjRow_pb][adjCol_pb].item = null;
                    }
                  }
                } else { 
                    if (isValidSquare(pushTargetRow_pb, pushTargetCol_pb)) {
                        const destinationSquareState = newBoard[pushTargetRow_pb][pushTargetCol_pb];
                        if (!destinationSquareState.piece && (!destinationSquareState.item || destinationSquareState.item.type === 'shroom')) {
                            destinationSquareState.piece = { ...adjacentSquareState.piece! };
                            if (destinationSquareState.item?.type === 'shroom') { 
                                destinationSquareState.item = null;
                                destinationSquareState.piece.level = (destinationSquareState.piece.level || 1) + 1;
                                if (destinationSquareState.piece.type === 'queen') {
                                    destinationSquareState.piece.level = Math.min(destinationSquareState.piece.level, 7);
                                }
                            }
                            newBoard[adjRow_pb][adjCol_pb].piece = null;
                            pushBackOccurredForSelfCheck = true;
                        }
                    }
                }
              }
            }
        }
        }
        if (pushBackOccurredForSelfCheck && isKingInCheck(newBoard, pieceNowOnToSquare.color, newEnPassantTargetSet)) {
            selfCheckByPushBack = true;
        }
    }

    if (pieceNowOnToSquare.type === 'bishop' && pieceNowOnToSquareActualLevel >= 5) {
        const bishopColor_conv = pieceNowOnToSquare.color;
        for (let dr_conv = -1; dr_conv <= 1; dr_conv++) {
        for (let dc_conv = -1; dc_conv <= 1; dc_conv++) {
            if (dr_conv === 0 && dc_conv === 0) continue;
            const adjRow_conv = toRow + dr_conv;
            const adjCol_conv = toCol + dc_conv;
            if (isValidSquare(adjRow_conv, adjCol_conv)) {
            const adjacentSquareState_conv = newBoard[adjRow_conv]?.[adjCol_conv];
            const pieceOnAdjSquare_conv = adjacentSquareState_conv?.piece;
            if (pieceOnAdjSquare_conv && pieceOnAdjSquare_conv.color !== bishopColor_conv && pieceOnAdjSquare_conv.type !== 'king' && (!adjacentSquareState_conv?.item || adjacentSquareState_conv.item.type === 'shroom')) {
                if (Math.random() < 0.5) {
                const originalPieceCopy_conv = { ...pieceOnAdjSquare_conv };
                const convertedPiece_conv: Piece = {
                    ...pieceOnAdjSquare_conv,
                    color: bishopColor_conv,
                    id: `conv_${pieceOnAdjSquare_conv.id}_${Date.now()}`
                };
                newBoard[adjRow_conv][adjCol_conv].piece = convertedPiece_conv;
                conversionEvents.push({
                    originalPiece: originalPieceCopy_conv,
                    convertedPiece: convertedPiece_conv,
                    byPiece: { ...pieceNowOnToSquare },
                    at: coordsToAlgebraic(adjRow_conv, adjCol_conv)
                });
                }
            }
            }
        }
        }
    }
  }
  return { newBoard, capturedPiece, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel, selfCheckByPushBack, queenLevelReducedEvents: queenLevelReducedEventsInternal, isEnPassantCapture, promotedToInfiltrator, infiltrationWin, enPassantTargetSet: newEnPassantTargetSet, shroomConsumed: shroomConsumedThisMove };
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean {
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
  return isSquareAttacked(board, kingPosAlg, opponentColor, false, null, enPassantTargetSquare);
}


export function filterLegalMoves(
  board: BoardState,
  pieceOriginalSquare: AlgebraicSquare,
  pseudoMoves: AlgebraicSquare[],
  playerColor: PlayerColor,
  enPassantTargetSquare: AlgebraicSquare | null
): AlgebraicSquare[] {
  const fromSquareState = board[algebraicToCoords(pieceOriginalSquare).row]?.[algebraicToCoords(pieceOriginalSquare).col];
  if (!fromSquareState || !fromSquareState.piece || fromSquareState.piece.color !== playerColor) return [];

  const originalMovingPiece = fromSquareState.piece;

  return pseudoMoves.filter(targetSquare => {
    const tempBoardState = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
    const { row: toR, col: toC } = algebraicToCoords(targetSquare);

    if (tempBoardState[toR]?.[toC]?.item && tempBoardState[toR]?.[toC]?.item?.type !== 'shroom') return false;

    const pieceToMoveCopy = { ...originalMovingPiece };
    const targetPieceForSim = tempBoardState[toR]?.[toC]?.piece;
    const pieceToMoveActualLevelForSwap = Number(pieceToMoveCopy.level || 1);

    let moveTypeForApply: Move['type'] = 'move';
    if (targetPieceForSim && targetPieceForSim.color !== pieceToMoveCopy.color) {
        moveTypeForApply = 'capture';
    }

    if (originalMovingPiece.type === 'pawn' && targetSquare === enPassantTargetSquare && !targetPieceForSim) {
        moveTypeForApply = 'enpassant';
    }


    if (typeof pieceToMoveActualLevelForSwap === 'number' && !isNaN(pieceToMoveActualLevelForSwap) &&
        (((pieceToMoveCopy.type === 'knight' || pieceToMoveCopy.type === 'hero') && pieceToMoveActualLevelForSwap >= 4 && targetPieceForSim?.type === 'bishop' && targetPieceForSim.color === pieceToMoveCopy.color) ||
         (pieceToMoveCopy.type === 'bishop' && pieceToMoveActualLevelForSwap >= 4 && (targetPieceForSim?.type === 'knight' || targetPieceForSim?.type === 'hero') && targetPieceForSim.color === pieceToMoveCopy.color))
    ) {
        moveTypeForApply = 'swap';
    } else if (pieceToMoveCopy.type === 'king' && Math.abs(algebraicToCoords(pieceOriginalSquare).col - toC) === 2) {
        moveTypeForApply = 'castle';
    } else if ((pieceToMoveCopy.type === 'pawn' || pieceToMoveCopy.type === 'commander') && (toR === 0 || toR === 7) && moveTypeForApply !== 'enpassant') {
        moveTypeForApply = 'promotion';
    }


    const simulatedMove: Move = {
      from: pieceOriginalSquare,
      to: targetSquare,
      type: moveTypeForApply,
      promoteTo: (moveTypeForApply === 'promotion' && pieceToMoveCopy.type === 'pawn') ? 'queen' : undefined
    };

    const { newBoard: boardAfterSimulatedMove, enPassantTargetSet: newEpTargetAfterSim } = applyMove(tempBoardState, simulatedMove, enPassantTargetSquare);

    return !isKingInCheck(boardAfterSimulatedMove, playerColor, newEpTargetAfterSim);
  });
}


export function getPossibleMoves(board: BoardState, fromSquare: AlgebraicSquare, enPassantTargetSquare: AlgebraicSquare | null): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(fromSquare);
    const squareState = board[row]?.[col];
    if (!squareState || !squareState.piece) return [];
    const piece = squareState.piece;
    const pseudoMoves = getPossibleMovesInternal(board, fromSquare, piece, true, enPassantTargetSquare);
    return filterLegalMoves(board, fromSquare, pseudoMoves, piece.color, enPassantTargetSquare);
}


function hasAnyLegalMoves(board: BoardState, playerColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const squareState = board[r]?.[c];
      if(!squareState) continue;
      const piece = squareState.piece;
      if (piece && piece.color === playerColor) {
        const pieceSquareAlgebraic = squareState.algebraic;
        const legalMoves = getPossibleMoves(board, pieceSquareAlgebraic, enPassantTargetSquare);
        if (legalMoves.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}


export function isCheckmate(board: BoardState, kingInCheckColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  return isKingInCheck(board, kingInCheckColor, enPassantTargetSquare) && !hasAnyLegalMoves(board, kingInCheckColor, enPassantTargetSquare);
}

export function isStalemate(board: BoardState, playerColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  return !isKingInCheck(board, playerColor, enPassantTargetSquare) && !hasAnyLegalMoves(board, playerColor, enPassantTargetSquare);
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
    case 'hero': return isWhite ? '♘' : '♞';
    case 'pawn':
    case 'commander':
    case 'infiltrator':
      return isWhite ? '♙' : '♟︎';
    default: return '';
  }
}

export function boardToSimpleString(board: BoardState, forPlayer: PlayerColor, enPassantTarget: AlgebraicSquare | null): string {
    let boardStr = "";
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = board[r]?.[c];
            if (!square) continue;
            const piece = square.piece;
            const item = square.item;
            if (piece) {
                let pieceStr = piece.color === 'white' ? 'w' : 'b';
                pieceStr += getPieceChar(piece).toUpperCase();
                pieceStr += `@${square.algebraic}`;
                pieceStr += `(L${Number(piece.level || 1)}`;
                if (piece.hasMoved) pieceStr += `,M`;
                if (piece.invulnerableTurnsRemaining && piece.invulnerableTurnsRemaining > 0) pieceStr += `,I${piece.invulnerableTurnsRemaining}`;
                pieceStr += `)`;
                boardStr += pieceStr + " ";
            } else if (item) {
                 boardStr += `ITM@${square.algebraic}(${item.type}) `;
            }
        }
    }
    boardStr += `ToMove:${forPlayer}`;
    boardStr += ` Castling:${getCastlingRightsString(board)}`;
    boardStr += ` EP:${enPassantTarget || '-'}`;
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
  let boardWithResurrection = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
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

  const newRookLevel = Number(rookOnBoard.level || 1);
  const oldLevelOfThisPieceType = (rookMove?.type === 'promotion' && rookMove?.promoteTo === 'rook')
    ? 0
    : (Number(originalLevelOfPiece || 0));

  if (typeof newRookLevel === 'number' && !isNaN(newRookLevel) && newRookLevel >= 4 && newRookLevel > oldLevelOfThisPieceType) {
    const opponentColor = playerWhosePieceLeveled === 'white' ? 'black' : 'white';
    const piecesToChooseFrom = capturedPiecesAfterResurrection[opponentColor] ? [...capturedPiecesAfterResurrection[opponentColor]] : [];

    if (piecesToChooseFrom.length > 0) {
      piecesToChooseFrom.sort((a, b) => {
        const valueA = {pawn: 1, commander: 1, hero: 3, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0, infiltrator: 1}[a.type] || 0;
        const valueB = {pawn: 1, commander: 1, hero: 3, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0, infiltrator: 1}[b.type] || 0;
        return valueB - valueA;
      });
      const pieceToResurrectOriginal = piecesToChooseFrom[0];

      const emptyAdjacentSquares: AlgebraicSquare[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const adjR = rookR + dr;
          const adjC = rookC + dc;
          if (isValidSquare(adjR, adjC) && !boardWithResurrection[adjR][adjC].piece && !boardWithResurrection[adjR][adjC].item ) {
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
          invulnerableTurnsRemaining: 0,
        };
        nextResurrectionIdCounter++;

        const promotionRank = playerWhosePieceLeveled === 'white' ? 0 : 7;
        if (resurrectedPieceData.type === 'pawn' && resR === promotionRank) {
          resurrectedPieceData.type = 'queen'; 
          resurrectedPieceData.id = `${resurrectedPieceData.id}_resPromo_Q`;
        } else if (resurrectedPieceData.type === 'commander' && resR === promotionRank) {
          resurrectedPieceData.type = 'hero';
          resurrectedPieceData.id = `${resurrectedPieceData.id}_HeroPromo_Res`;
        } else if (resurrectedPieceData.type === 'infiltrator' && resR === promotionRank) {
           // Infiltration win if an infiltrator is resurrected onto the back rank
        }

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

export function spawnAnvil(board: BoardState): BoardState {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
  const emptySquares: AlgebraicSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!newBoard[r][c].piece && !newBoard[r][c].item) {
        emptySquares.push(newBoard[r][c].algebraic);
      }
    }
  }

  if (emptySquares.length > 0) {
    const randomIndex = Math.floor(Math.random() * emptySquares.length);
    const randomSquareAlg = emptySquares[randomIndex];
    const { row, col } = algebraicToCoords(randomSquareAlg);
    newBoard[row][col].item = { type: 'anvil' };
  }
  return newBoard;
}

export function spawnShroom(board: BoardState): BoardState {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
  const emptySquares: AlgebraicSquare[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!newBoard[r][c].piece && !newBoard[r][c].item) { 
        emptySquares.push(newBoard[r][c].algebraic);
      }
    }
  }

  if (emptySquares.length > 0) {
    const randomIndex = Math.floor(Math.random() * emptySquares.length);
    const randomSquareAlg = emptySquares[randomIndex];
    const { row, col } = algebraicToCoords(randomSquareAlg);
    newBoard[row][col].item = { type: 'shroom' };
  }
  return newBoard;
}

