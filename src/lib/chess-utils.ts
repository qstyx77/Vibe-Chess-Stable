import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, SquareState, Move, ConversionEvent, ApplyMoveResult, Item, QueenLevelReducedEvent, RallyCryEvent } from '@/types';

const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export const VAL_MAP: Record<string, number> = {
  pawn: 1,
  commander: 2,
  infiltrator: 2,
  knight: 3,
  bishop: 3,
  archbishop: 4,
  rook: 5,
  palace: 6,
  queen: 9,
  king: 0,
  hero: 4,
  archer: 3
};

/**
 * Initializes a standard board, optionally upgrading pieces based on ELO.
 * Assigns persistent IDs to pieces so equipment stays attached.
 */
export function initializeBoard(whiteElo: number = 1200, blackElo: number = 1200): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, item: null, algebraic, rowIndex: r, colIndex: c });
    }
    board.push(row);
  }

  // Define stable unit identities for White
  const whiteBishops: Piece[] = [
    { id: 'wB1', type: whiteElo >= 1500 ? 'archbishop' : 'bishop', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'wB2', type: 'bishop', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];
  const whiteRooks: Piece[] = [
    { id: 'wR1', type: whiteElo >= 1800 ? 'palace' : 'rook', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'wR2', type: 'rook', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];
  const whiteKnights: Piece[] = [
    { id: 'wN1', type: whiteElo >= 2100 ? 'archer' : 'knight', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'wN2', type: 'knight', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];

  // Define stable unit identities for Black
  const blackBishops: Piece[] = [
    { id: 'bB1', type: blackElo >= 1500 ? 'archbishop' : 'bishop', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'bB2', type: 'bishop', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];
  const blackRooks: Piece[] = [
    { id: 'bR1', type: blackElo >= 1800 ? 'palace' : 'rook', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'bR2', type: 'rook', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];
  const blackKnights: Piece[] = [
    { id: 'bN1', type: blackElo >= 2100 ? 'archer' : 'knight', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null },
    { id: 'bN2', type: 'knight', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null }
  ];

  // Randomize starting squares for paired pieces while maintaining stable IDs
  const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
  
  const wBPos = shuffle([2, 5]);
  const wNPos = shuffle([1, 6]);
  const wRPos = shuffle([0, 7]);

  const bBPos = shuffle([2, 5]);
  const bNPos = shuffle([1, 6]);
  const bRPos = shuffle([0, 7]);

  // Place White Pieces
  board[7][wBPos[0]].piece = whiteBishops[0];
  board[7][wBPos[1]].piece = whiteBishops[1];
  board[7][wNPos[0]].piece = whiteKnights[0];
  board[7][wNPos[1]].piece = whiteKnights[1];
  board[7][wRPos[0]].piece = whiteRooks[0];
  board[7][wRPos[1]].piece = whiteRooks[1];
  board[7][3].piece = { id: 'wQ', type: 'queen', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  board[7][4].piece = { id: 'wK', type: 'king', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  for (let c = 0; c < 8; c++) board[6][c].piece = { id: `wP${c}`, type: 'pawn', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null };

  // Place Black Pieces
  board[0][bBPos[0]].piece = blackBishops[0];
  board[0][bBPos[1]].piece = blackBishops[1];
  board[0][bNPos[0]].piece = blackKnights[0];
  board[0][bNPos[1]].piece = blackKnights[1];
  board[0][bRPos[0]].piece = blackRooks[0];
  board[0][bRPos[1]].piece = blackRooks[1];
  board[0][3].piece = { id: 'bQ', type: 'queen', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  board[0][4].piece = { id: 'bK', type: 'king', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  for (let c = 0; c < 8; c++) board[1][c].piece = { id: `bP${c}`, type: 'pawn', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null };

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

export function getPieceUnicode(piece: Piece): string {
  const isW = piece.color === 'white';
  switch (piece.type) {
    case 'king': return isW ? '♔' : '♚';
    case 'queen': return isW ? '♕' : '♛';
    case 'rook': case 'palace': return isW ? '♖' : '♜';
    case 'bishop': case 'archbishop': return isW ? '♗' : '♝';
    case 'knight': case 'hero': case 'archer': return isW ? '♘' : '♞';
    default: return isW ? '♙' : '♟︎';
  }
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
    case 'palace': char = 'R'; break;
    case 'queen': char = 'Q'; break;
    case 'king': char = 'K'; break;
    case 'hero': char = 'H'; break;
    case 'infiltrator': char = 'I'; break;
    case 'archbishop': char = 'A'; break;
    case 'archer': char = 'A'; break;
    default: return '??';
  }
  return piece.color === 'white' ? char.toUpperCase() : char.toLowerCase();
}

export function getCastlingRightsString(board: BoardState): string {
  let rights = "";
  const wKingSquare = board[7]?.[4];
  if (wKingSquare?.piece?.type === 'king' && wKingSquare.piece.color === 'white' && !wKingSquare.piece.hasMoved) {
    if ((board[7]?.[7]?.piece?.type === 'rook' || board[7]?.[7]?.piece?.type === 'palace') && !board[7][7].piece.hasMoved) rights += "K";
    if ((board[7]?.[0]?.piece?.type === 'rook' || board[7]?.[0]?.piece?.type === 'palace') && !board[7][0].piece.hasMoved) rights += "Q";
  }
  const bKingSquare = board[0]?.[4];
  if (bKingSquare?.piece?.type === 'king' && bKingSquare.piece.color === 'black' && !bKingSquare.piece.hasMoved) {
    if ((board[0]?.[7]?.piece?.type === 'rook' || board[0]?.[7]?.piece?.type === 'palace') && !board[0][7].piece.hasMoved) rights += "k";
    if ((board[0]?.[0]?.piece?.type === 'rook' || board[0]?.[0]?.piece?.type === 'palace') && !board[0][0].piece.hasMoved) rights += "q";
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
      if (piece) pieceHash += `${getPieceChar(piece)}L${Number(piece.level || 1)}${piece.isShielded ? 'S' : ''}${piece.isPoisoned ? 'Z' : ''}${piece.cooldownTurnsRemaining ? 'C' : ''}${piece.frozenTurnsRemaining ? 'F' : ''}${piece.heldItem || '-'}`;
      else pieceHash += '--';
      if (item?.type === 'anvil') itemHash += 'A';
      else if (item?.type === 'shroom') itemHash += 'S';
      else itemHash += '-';
    }
  }
  return `${pieceHash}_${itemHash}_${currentPlayer[0]}_${castlingRights}_${enPassantTargetSquare || '-'}`;
}

export function getEffectiveLevel(board: BoardState, r: number, c: number): number {
  if (!isValidSquare(r, c)) return 0;
  const square = board[r][c];
  if (!square || !square.piece) return 0;
  const piece = square.piece;
  let level = Number(piece.level || 1);
  
  if (piece.type === 'king' || piece.type === 'queen') return level;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (isValidSquare(nr, nc)) {
        const neighbor = board[nr][nc].piece;
        if (neighbor && neighbor.color === piece.color && neighbor.heldItem === 'grimoir') {
          return level + 2; 
        }
      }
    }
  }
  return level;
}

export function getPromotionLevel(capturedPieceType: PieceType | null): number {
  if (!capturedPieceType) return 1;
  if (['pawn', 'commander', 'infiltrator'].includes(capturedPieceType)) return 2;
  if (capturedPieceType === 'queen') return 4;
  return 3; // Knight, Bishop, Rook, Hero, Archbishop, Palace, Archer
}

function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean,
    enPassantTargetSquare: AlgebraicSquare | null
): AlgebraicSquare[] {
  if (!piece) return [];
  let possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';
  const currentLevel = getEffectiveLevel(board, fromRow, fromCol);

  const hasMagicScroll = (piece.heldItem === 'wind_scroll' || piece.heldItem === 'life_leach' || piece.heldItem === 'summon_anvil' || piece.heldItem === 'shield_scroll' || piece.heldItem === 'rally_scroll' || piece.heldItem === 'antidote' || piece.heldItem === 'detonation_scroll' || piece.heldItem === 'swap_scroll' || piece.heldItem === 'ice_scroll' || piece.heldItem === 'resurrection_scroll' || piece.heldItem === 'faith_scroll');
  const hasSelfAbility = ((piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') && currentLevel >= 5);
  
  if (hasMagicScroll || hasSelfAbility) {
    possible.push(fromSquare);
  }

  if (piece.heldItem === 'tortoise_hammer') {
    const dir = pieceColor === 'white' ? -1 : 1;
    const nr = fromRow + dir;
    if (isValidSquare(nr, fromCol)) {
        const targetSq = board[nr][fromCol];
        if (!targetSq.piece || targetSq.piece.color !== pieceColor) {
            if (!targetSq.item || targetSq.item.type === 'shroom') {
                const targetLevel = getEffectiveLevel(board, nr, fromCol);
                if (!targetSq.piece || !isPieceInvulnerableToAttack(targetSq.piece, piece, targetLevel, currentLevel)) {
                    possible.push(coordsToAlgebraic(nr, fromCol));
                }
            }
        }
    }
  } else if (piece.type === 'king') {
    const maxDistance = currentLevel >= 2 ? 2 : 1;
    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) continue;
            const toR = fromRow + dr; const toC = fromCol + dc;
            if (!isValidSquare(toR, toC) || (board[toR][toC].item && board[toR][toC].item?.type !== 'shroom')) continue;
            const finalTargetSquareAlgebraic = coordsToAlgebraic(toR, toC);
            const pieceOnFinalTarget = board[toR][toC].piece;
            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) ) {
                const midR = fromRow + Math.sign(dr); const midC = fromCol + Math.sign(dc);
                if (!isValidSquare(midR, midC) || board[midR][midC].piece || (board[midR][midC].item && board[midR][midC].item?.type !== 'shroom') ) continue;
                if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor, false, pieceOnFinalTarget ? finalTargetSquareAlgebraic : null, enPassantTargetSquare )) continue;
            }
            const targetPiece = board[toR][toC].piece;
            const targetLevel = getEffectiveLevel(board, toR, toC);
            if (!targetPiece || targetPiece.color !== pieceColor) {
                 if (!isPieceInvulnerableToAttack(targetPiece, piece, targetLevel, currentLevel)) possible.push(coordsToAlgebraic(toR, toC));
            }
        }
    }
    if (currentLevel >= 5) {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr_n, dc_n] of knightDeltas) {
            const toR_n = fromRow + dr_n; const toC_n = fromCol + dc_n;
            if (isValidSquare(toR_n, toC_n) && (!board[toR_n][toC_n].item || board[toR_n][toC_n].item?.type === 'shroom')) {
                const targetPiece_n = board[toR_n][toC_n].piece;
                const targetLevel_n = getEffectiveLevel(board, toR_n, toC_n);
                if (!targetPiece_n || targetPiece_n.color !== pieceColor) {
                     if (!isPieceInvulnerableToAttack(targetPiece_n, piece, targetLevel_n, currentLevel)) possible.push(coordsToAlgebraic(toR_n, toC_n));
                }
            }
        }
    }
    if (checkKingSafety && !piece.hasMoved && !isKingInCheck(board, pieceColor, enPassantTargetSquare)) {
        const kingRow = pieceColor === 'white' ? 7 : 0;
        if (fromRow === kingRow && fromCol === 4) {
            const krSquare = board[kingRow][7];
            if ((krSquare?.piece?.type === 'rook' || krSquare?.piece?.type === 'palace') && !krSquare.piece.hasMoved) {
                if (!board[kingRow][5].piece && (!board[kingRow][5].item || board[kingRow][5].item?.type === 'shroom') &&
                    !board[kingRow][6].piece && (!board[kingRow][6].item || board[kingRow][6].item?.type === 'shroom')) {
                    if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor, false, null, enPassantTargetSquare)) {
                        possible.push(coordsToAlgebraic(kingRow, 6));
                    }
                }
            }
            const qrSquare = board[kingRow][0];
            if ((qrSquare?.piece?.type === 'rook' || qrSquare?.piece?.type === 'palace') && !qrSquare.piece.hasMoved) {
                if (!board[kingRow][1].piece && (!board[kingRow][1].item || board[kingRow][1].item?.type === 'shroom') &&
                    !board[kingRow][2].piece && (!board[kingRow][2].item || board[kingRow][2].item?.type === 'shroom') &&
                    !board[kingRow][3].piece && (!board[kingRow][3].item || board[kingRow][3].item?.type === 'shroom')) {
                    if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 3), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 2), opponentColor, false, null, enPassantTargetSquare)) {
                        possible.push(coordsToAlgebraic(kingRow, 2));
                    }
                }
            }
        }
    }
  } else if (piece.type === 'pawn' || piece.type === 'commander' || piece.type === 'infiltrator') {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const to = coordsToAlgebraic(r,c);
          if (isMoveValid(board, fromSquare, to, piece, enPassantTargetSquare)) if(!possible.includes(to)) possible.push(to);
      }
  } else if (piece.type === 'bishop' || piece.type === 'archbishop') {
      const dirs: [number, number][] = [[1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item && targetSq.item.type !== 'shroom') break;
              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel)) possible.push(coordsToAlgebraic(R, C));
                      break;
                  } else {
                      const isSwapTarget = currentLevel >= 4 && (['knight', 'hero', 'archer'].includes(targetP.type));
                      if (isSwapTarget) possible.push(coordsToAlgebraic(R, C));
                      const hasPhase = piece.heldItem === 'phase_boots' && currentLevel >= 2;
                      if (hasPhase || currentLevel >= 2) continue; else break;
                  }
              }
          }
      });
  } else if (piece.type === 'rook' || piece.type === 'palace') {
      const dirs: [number, number][] = [[0,1], [0,-1], [1,0], [-1,0]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item && targetSq.item.type !== 'shroom') break;
              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel)) possible.push(coordsToAlgebraic(R, C));
                      break;
                  } else {
                      const hasPhase = piece.heldItem === 'phase_boots' && currentLevel >= 2;
                      if (hasPhase) continue; else break;
                  }
              }
          }
      });
  } else if (piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (isMoveValid(board, fromSquare, coordsToAlgebraic(r,c), piece, enPassantTargetSquare)) possible.push(coordsToAlgebraic(r,c));
  } else if (piece.type === 'queen') {
      const dirs: [number, number][] = [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item && targetSq.item.type !== 'shroom') break;
              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel)) possible.push(coordsToAlgebraic(R, C));
                      break;
                  } else {
                      const hasPhase = piece.heldItem === 'phase_boots' && currentLevel >= 2;
                      if (hasPhase) continue; else break;
                  }
              }
          }
      });
  }

  if (piece.heldItem === 'cardinal_greaves' && piece.heldItem !== 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    const nr = fromRow + dir;
    if (isValidSquare(nr, fromCol) && !board[nr][fromCol].piece && (!board[nr][fromCol].item || board[nr][fromCol].item?.type === 'shroom')) {
      possible.push(coordsToAlgebraic(nr, fromCol));
    }
  }
  if (piece.heldItem === 'drift_boots' && piece.heldItem !== 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    [-1, 1].forEach(dc => {
      const nr = fromRow + dir; const nc = fromCol + dc;
      if (isValidSquare(nr, nc) && !board[nr][nc].piece && (!board[nr][nc].item || board[nr][nc].item?.type === 'shroom')) {
        possible.push(coordsToAlgebraic(nr, nc));
      }
    });
  }

  if (piece.heldItem === 'berserkers_mask') {
    const captureMoves = possible.filter(to => {
        const {row, col} = algebraicToCoords(to);
        const target = board[row][col].piece;
        if (target && target.color !== piece.color) return true;
        if ((piece.type === 'pawn' || piece.type === 'commander') && to === enPassantTargetSquare) return true;
        return false;
    });
    if (captureMoves.length > 0) return captureMoves;
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
    enPassantTargetSquare?: AlgebraicSquare | null
): boolean {
    const { row: targetR, col: targetC } = algebraicToCoords(squareToAttack);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareAlgebraic = coordsToAlgebraic(r,c);
            if (ignoreAttackerAtSquare && attackingSquareAlgebraic === ignoreAttackerAtSquare) continue;
            const attackingPiece = board[r][c].piece;
            if (attackingPiece && attackingPiece.color === attackerColor) {
                const pieceOnTargetSq = board[targetR][targetC].piece;
                const targetLevel = getEffectiveLevel(board, targetR, targetC);
                const effectiveLevel = getEffectiveLevel(board, r, c);
                if (attackingPiece.type === 'pawn' || attackingPiece.type === 'commander') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                } else if (attackingPiece.type === 'infiltrator') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if ( (r + direction === targetR && c === targetC) || (r + direction === targetR && Math.abs(c - targetC) === 1) ) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                } else if (attackingPiece.type === 'king') {
                    const maxDistance = effectiveLevel >= 2 && !simplifyKingCheck ? 2 : 1;
                    const dr = targetR - r; const dc = targetC - c;
                    if (Math.abs(dr) <= maxDistance && Math.abs(dc) <= maxDistance && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                        if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2)) {
                            const midR = r + Math.sign(dr); const midC = c + Math.sign(dc);
                            if (!board[midR][midC].piece && (!board[midR][midC].item || board[midR][midC].item?.type === 'shroom')) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                        } else if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                    }
                    if (effectiveLevel >= 5 && !simplifyKingCheck) {
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr_n, dc_n] of knightDeltas) if (r + dr_n === targetR && c + dc_n === targetC) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                    }
                } else {
                    const pseudoMoves = getPossibleMovesInternal(board, attackingSquareAlgebraic, attackingPiece, false, enPassantTargetSquare);
                    if (pseudoMoves.includes(squareToAttack)) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel)) return true;
                }
            }
        }
    }
    return false;
}

export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  const effectiveLevel = getEffectiveLevel(board, algebraicToCoords(from).row, algebraicToCoords(from).col);
  if (from === to && !((piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') && effectiveLevel >= 5) && !(['wind-scroll', 'life-leach', 'summon-anvil', 'shield-scroll', 'rally-scroll', 'antidote', 'swap-scroll', 'ice-scroll', 'resurrection-scroll', 'faith-scroll'].includes(piece.heldItem || ''))) return false;
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  if (!isValidSquare(toRow, toCol)) return false;
  const targetSquareState = board[toRow][toCol];
  if (targetSquareState.item && targetSquareState.item.type !== 'shroom') return false;
  const targetPieceOnSquare = targetSquareState.piece;
  const hasPhase = piece.heldItem === 'phase_boots' && effectiveLevel >= 2;

  if (piece.heldItem === 'queens_peace' && piece.type === 'queen' && targetPieceOnSquare) return false;

  const isSwap = (['knight', 'hero', 'archer'].includes(piece.type) && effectiveLevel >= 4 && targetPieceOnSquare && (['bishop', 'archbishop'].includes(targetPieceOnSquare.type)) && targetPieceOnSquare.color === piece.color) ||
                 ((['bishop', 'archbishop'].includes(piece.type)) && effectiveLevel >= 4 && targetPieceOnSquare && (['knight', 'hero', 'archer'].includes(targetPieceOnSquare.type)) && targetPieceOnSquare.color === piece.color);
  if (isSwap) return true;
  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color) return false;
  
  const targetLevel = getEffectiveLevel(board, toRow, toCol);
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color) if (isPieceInvulnerableToAttack(targetPieceOnSquare, piece, targetLevel, effectiveLevel)) return false;

  switch (piece.type) {
    case 'pawn':
    case 'commander':
      const direction = piece.color === 'white' ? -1 : 1;
      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare) return true;
      if (to === enPassantTargetSquare && Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction) return true;
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      const isHomeRank = (piece.color === 'white' && (fromRow === 6 || fromRow === 7)) || (piece.color === 'black' && (fromRow === 0 || fromRow === 1));
      const canJumpStart = (!piece.hasMoved && isHomeRank) || piece.heldItem === 'swift_cloak';
      if (fromCol === toCol && !targetPieceOnSquare && canJumpStart && ((piece.color === 'white' && toRow === fromRow - 2) || (piece.color === 'black' && toRow === fromRow + 2))) {
          const midR = fromRow + direction;
          if (!board[midR][fromCol].piece || (hasPhase && board[midR][fromCol].piece?.color === piece.color)) return true;
      }
      if (effectiveLevel >= 2 && fromCol === toCol && toRow === fromRow - direction && !targetPieceOnSquare) return true;
      if (effectiveLevel >= 3 && toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPieceOnSquare) return true;
      break;
    case 'infiltrator':
      const infiltratorDir = piece.color === 'white' ? -1 : 1;
      if (toRow === fromRow + infiltratorDir && (fromCol === toCol || Math.abs(fromCol - toCol) === 1)) return true;
      break;
    case 'knight':
    case 'hero':
    case 'archer':
      const dRowK = Math.abs(toRow - fromRow); const dColK = Math.abs(toCol - fromCol);
      if ((dRowK === 2 && dColK === 1) || (dRowK === 1 && dColK === 2)) return true;
      if (effectiveLevel >= 2 && ((dRowK === 0 && dColK === 1) || (dRowK === 1 && dColK === 0))) return true;
      if (effectiveLevel >= 3 && ((dRowK === 0 && dColK === 3) || (dRowK === 3 && dColK === 0))) {
          if (dRowK === 3) { const s = Math.sign(toRow - fromRow); if (board[fromRow+s][fromCol].piece || board[fromRow+2*s][fromCol].piece) return false; }
          else { const s = Math.sign(toCol - fromCol); if (board[fromRow][fromCol+s].piece || board[fromRow][fromCol+2*s].piece) return false; }
          return true;
      }
      break;
    case 'rook':
    case 'palace':
      if (fromRow === toRow || fromCol === toCol) {
        const dr = Math.sign(toRow - fromRow); const dc = Math.sign(toCol - fromCol);
        let r = fromRow + dr; let c = fromCol + dc;
        while (r !== toRow || c !== toCol) { 
            if (board[r][c].piece && (!hasPhase || board[r][c].piece?.color !== piece.color)) return false; 
            r += dr; c += dc; 
        }
        return true;
      }
      break;
    case 'bishop':
    case 'archbishop':
      if (Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol)) {
        const dr = Math.sign(toRow - fromRow); const dc = Math.sign(toCol - fromCol);
        let r = fromRow + dr; let c = fromCol + dc;
        while (r !== toRow || c !== toCol) { 
            if (board[r][c].piece && (effectiveLevel < 2 && !hasPhase || board[r][c].piece?.color !== piece.color)) return false; 
            r += dr; c += dc; 
        }
        return true;
      }
      break;
    case 'queen':
      if (fromRow === toRow || fromCol === toCol || Math.abs(toRow - fromRow) === Math.abs(toCol - fromCol)) {
        const dr = Math.sign(toRow - fromRow); const dc = Math.sign(toCol - fromCol);
        let r = fromRow + dr; let c = fromCol + dc;
        while (r !== toRow || c !== toCol) { 
            if (board[r][c].piece && (!hasPhase || board[r][c].piece?.color !== piece.color)) return false; 
            r += dr; c += dc; 
        }
        return true;
      }
      break;
    case 'king':
      const dRowKi = Math.abs(toRow - fromRow); const dColKi = Math.abs(toCol - fromCol);
      const maxD = effectiveLevel >= 2 ? 2 : 1;
      if (effectiveLevel >= 5 && ((dRowKi === 2 && dColKi === 1) || (dRowKi === 1 && dColKi === 2))) return true;
      if (dRowKi <= maxD && dColKi <= maxD && (dRowKi === 0 || dColKi === 0 || dRowKi === dColKi)) {
          if (maxD === 2 && (dRowKi === 2 || dColKi === 2)) if (board[fromRow + Math.sign(toRow - fromRow)][fromCol + Math.sign(toCol - fromCol)].piece) return false;
          return true;
      }
      break;
  }

  if (piece.heldItem === 'cardinal_greaves') {
    const dir = piece.color === 'white' ? -1 : 1;
    if (toRow === fromRow + dir && fromCol === toCol && !targetPieceOnSquare) return true;
  }
  if (piece.heldItem === 'drift_boots') {
    const dir = piece.color === 'white' ? -1 : 1;
    if (toRow === fromRow + dir && Math.abs(toCol - fromCol) === 1 && !targetPieceOnSquare) return true;
  }

  if (piece.heldItem === 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    return (toRow === fromRow + dir && toCol === fromCol);
  }

  return false;
}

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null, targetLevel: number, attackingLevel: number): boolean {
    if (!targetPiece || !attackingPiece) return false;
    if (targetPiece.frozenTurnsRemaining && targetPiece.frozenTurnsRemaining > 0) return true;
    if (targetPiece.heldItem === 'queens_peace' && targetPiece.type === 'queen') return true;
    if (targetPiece.isShielded && attackingPiece.type !== 'self-destruct') return true;
    const hunters = ['commander', 'hero', 'infiltrator', 'self-destruct'];
    if (targetPiece.type === 'queen' && hunters.includes(attackingPiece.type)) return false;
    if (targetPiece.type === 'queen' && targetLevel >= 7 && attackingLevel < targetLevel) return true;
    if ((['bishop', 'archbishop'].includes(targetPiece.type)) && targetLevel >= 3 && ['pawn', 'commander', 'infiltrator'].includes(attackingPiece.type)) return true;
    return (targetPiece.invulnerableTurnsRemaining || 0) > 0;
}

export function applyMove(board: BoardState, move: Move, enPassantTargetSquare: AlgebraicSquare | null, graveyard?: { white: Piece[], black: Piece[] }): ApplyMoveResult {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
  let enPassantTargetSet: AlgebraicSquare | null = null;
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  const conversionEvents: ConversionEvent[] = [];
  let rallyCryTriggered: RallyCryEvent | null = null;
  let selfCheckByPushBack = false;
  let pieceCapturedByAnvil: Piece | null = null;
  let anvilPushedOffBoard = false;
  let queenLevelReducedEvents: QueenLevelReducedEvent[] | null = null;
  let promotedToInfiltrator = false;
  let infiltrationWin = false;
  let shroomConsumed = false;
  let extraTurn = false;
  let specialCaptureSquare: AlgebraicSquare | null = null;
  const selfDestructCaptures: Piece[] = [];
  let destroyedAnvils = 0;
  let phoenixResurrection: { piece: Piece, square: AlgebraicSquare } | undefined = undefined;
  let reflectionOccurred = false;
  let resurrectionScrollEvent: { piece: Piece, square: AlgebraicSquare } | undefined = undefined;

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, shroomConsumed: false, enPassantTargetSet, extraTurn, specialCaptureSquare };

  const originalPieceLevel = Number(movingPiece.level || 1);
  const originalPieceType = movingPiece.type;
  const originalEffectiveLevelBeforeMove = getEffectiveLevel(board, fromRow, fromCol);
  const targetPiece = newBoard[toRow][toCol].piece;
  const targetItem = newBoard[toRow][toCol].item;

  const handleHydraSplit = (victim: Piece, r: number, c: number, targetBoard: BoardState) => {
    if (victim.id.startsWith('boss-hydra')) {
        let spawned = 0;
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1], [1,-1],[1,0],[1,1]].sort(() => Math.random() - 0.5);
        for (const [dr, dc] of dirs) {
            if (spawned >= 2) break;
            const nr = r + dr; const nc = c + dc;
            if (isValidSquare(nr, nc) && !targetBoard[nr][nc].piece && !targetBoard[nr][nc].item) {
                targetBoard[nr][nc].piece = {
                    id: `hydra-head-${Date.now()}-${spawned}-${victim.id}`,
                    type: 'knight',
                    color: 'black',
                    level: 2,
                    hasMoved: true,
                    isShielded: false,
                    isPoisoned: false,
                    cooldownTurnsRemaining: 0,
                    frozenTurnsRemaining: 0,
                    heldItem: null
                };
                spawned++;
            }
        }
    }
  };

  if (move.type === 'resurrection-scroll') {
      if (graveyard) {
          const myGraveyard = movingPiece.color === 'white' ? graveyard.black : graveyard.white;
          if (myGraveyard.length > 0) {
              const best = [...myGraveyard].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
              const adjacent = [];
              for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                  if (dr===0 && dc===0) continue;
                  const nr=fromRow+dr; const nc=fromCol+dc;
                  if(isValidSquare(nr,nc) && !newBoard[nr][nc].piece && !newBoard[nr][nc].item) adjacent.push(coordsToAlgebraic(nr,nc));
              }
              if (adjacent.length > 0) {
                  const target = adjacent[Math.floor(Math.random()*adjacent.length)];
                  const {row: rr, col: rc} = algebraicToCoords(target);
                  const resPiece = { ...best, id: `res_scroll_${best.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                  newBoard[rr][rc].piece = resPiece;
                  resurrectionScrollEvent = { piece: best, square: target };
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare, resurrectionScrollEvent };
  }

  if (move.type === 'faith-scroll') {
      const converterColor = movingPiece.color;
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
          if (dr===0 && dc===0) continue;
          const nr=fromRow+dr; const nc=fromCol+dc;
          if(isValidSquare(nr,nc)) {
              const victim = newBoard[nr][nc].piece;
              if (victim && victim.color !== converterColor && victim.type !== 'king' && Math.random() < 0.5) {
                  const orig = {...victim};
                  victim.color = converterColor;
                  victim.id = `conv_${victim.id}_${Date.now()}`;
                  conversionEvents.push({ originalPiece: orig, convertedPiece: {...victim}, byPiece: {...movingPiece}, at: coordsToAlgebraic(nr, nc) });
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'ice-scroll') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.color === oppColor) {
            victim.frozenTurnsRemaining = 2;
            victim.cooldownTurnsRemaining = 2;
          }
        }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'swap-scroll') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      if (newBoard[toRow][toCol].piece) newBoard[toRow][toCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
      newBoard[toRow][toCol].piece = p1 ? { ...p1, hasMoved: true, isShielded: false } : null;
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.heldItem === 'mirror_shield') {
      const reflectedAttacker = { ...movingPiece };
      newBoard[fromRow][fromCol].piece = null; 
      newBoard[toRow][toCol].piece!.heldItem = null; 
      
      const defender = newBoard[toRow][toCol].piece!;
      let gain = {pawn: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[reflectedAttacker.type] || 0;
      defender.level = Math.min(defender.type === 'queen' ? 7 : 99, (defender.level || 1) + gain);
      defender.isPoisoned = false; 
      defender.cooldownTurnsRemaining = 0;

      if (reflectedAttacker.heldItem === 'soul_link') {
        newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === reflectedAttacker.color && sq.piece.heldItem === 'soul_link') {
            sq.piece = null;
          }
        }));
      }

      return {
          newBoard,
          capturedPiece: reflectedAttacker,
          selfDestructCaptures: null,
          destroyedAnvils: 0,
          pieceCapturedByAnvil: null,
          anvilPushedOffBoard: false,
          conversionEvents: [],
          rallyCryTriggered: null,
          originalPieceLevel,
          originalPieceType,
          selfCheckByPushBack: false,
          queenLevelReducedEvents: null,
          promotedToInfiltrator: false,
          infiltrationWin: false,
          shroomConsumed: false,
          enPassantTargetSet: null,
          extraTurn: false,
          specialCaptureSquare: null,
          reflectionOccurred: true
      };
  }

  if (move.type === 'life-leach') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === oppColor) {
              sq.piece.level = Math.max(1, (sq.piece.level || 1) - 1);
          }
      }));
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'wind-scroll') {
      const crush = triggerPushBack(newBoard, toRow, toCol, 'neutral' as any); 
      if (crush) pieceCapturedByAnvil = crush;
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'summon-anvil') {
      newBoard[toRow][toCol].item = { type: 'anvil' };
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'shield-scroll') {
      const { row: tr, col: tc } = algebraicToCoords(move.to);
      if (newBoard[tr][tc].piece) {
          newBoard[tr][tc].piece!.isShielded = true;
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'rally-scroll') {
      applyRally(newBoard, movingPiece.color, 'all', move.from);
      newBoard[fromRow][fromCol].piece!.level = 1; 
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'antidote') {
      newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === movingPiece.color) {
            sq.piece.isPoisoned = false;
            sq.piece.cooldownTurnsRemaining = 0;
          }
      }));
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'self-destruct') {
      const sdColor = movingPiece.color;
      const hadSoulLink = movingPiece.heldItem === 'soul_link';
      newBoard[fromRow][fromCol].piece = null;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = fromRow + dr; const nc = fromCol + dc;
          if (isValidSquare(nr, nc)) {
              const victim = newBoard[nr][nc];
              if (victim.item?.type === 'anvil') { victim.item = null; destroyedAnvils++; }
              if (victim.piece && victim.piece.color !== sdColor && victim.piece.type !== 'king') {
                  const vp = { ...victim.piece, id: `${victim.piece.id}_sd_${Date.now()}` };
                  handleHydraSplit(victim.piece, nr, nc, newBoard);
                  selfDestructCaptures.push(vp);
                  if (vp.heldItem === 'soul_link') {
                    newBoard.forEach(r => r.forEach(s => {
                      if (s.piece && s.piece.color === vp.color && s.piece.heldItem === 'soul_link') s.piece = null;
                    }));
                  }
                  victim.piece = null;
              }
          }
      }
      if (hadSoulLink) {
        newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === sdColor && sq.piece.heldItem === 'soul_link') sq.piece = null;
        }));
      }
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, infiltrationWin, shroomConsumed: false, enPassantTargetSet, extraTurn, specialCaptureSquare, phoenixResurrection: undefined };
  }

  let captured: Piece | null = null;
  if(move.type === 'enpassant') {
    const cpR = fromRow; const cpC = toCol;
    captured = newBoard[cpR][cpC].piece;
    newBoard[cpR][cpC].piece = null;
    specialCaptureSquare = coordsToAlgebraic(cpR, cpC);
    promotedToInfiltrator = true;
  } else if (targetPiece && targetPiece.color !== movingPiece.color) {
    captured = { ...targetPiece };
  }

  if (captured && captured.heldItem === 'soul_link') {
    newBoard.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === captured.color && sq.piece.heldItem === 'soul_link' && sq.piece.id !== captured.id) {
        sq.piece = null;
      }
    }));
  }

  const pieceToLand = { ...movingPiece, isShielded: false, hasMoved: true };
  
  const opponentBackRank = pieceToLand.color === 'white' ? 0 : 7;
  if (pieceToLand.type === 'commander' && toRow === opponentBackRank && move.type !== 'self-destruct') {
    pieceToLand.type = 'hero';
    pieceToLand.id = `${pieceToLand.id}_hero_auto_${Date.now()}`;
    if (originalEffectiveLevelBeforeMove >= 5) {
      extraTurn = true;
    }
  } else if (pieceToLand.type === 'pawn' && toRow === opponentBackRank && move.type !== 'self-destruct' && !promotedToInfiltrator) {
    if (originalEffectiveLevelBeforeMove >= 5) {
      extraTurn = true;
    }
  }

  newBoard[toRow][toCol].piece = pieceToLand;
  newBoard[fromRow][fromCol].piece = null;

  if ((pieceToLand.type === 'pawn' || pieceToLand.type === 'commander' || pieceToLand.type === 'infiltrator') && Math.abs(fromRow - toRow) === 2) enPassantTargetSet = coordsToAlgebraic(fromRow + Math.sign(toRow - fromRow), fromCol);
  
  let didLevelUp = false;
  let levelGain = 0;
  if (targetItem?.type === 'shroom') {
    shroomConsumed = true; newBoard[toRow][toCol].item = null;
    const oldL = pieceToLand.level || 1;
    if (pieceToLand.type === 'queen') {
        if (oldL < 7) {
            pieceToLand.level = Math.min(7, oldL + 1);
            didLevelUp = true;
            levelGain = pieceToLand.level - oldL;
        }
    } else {
        pieceToLand.level = oldL + 1;
        didLevelUp = true;
        levelGain = 1;
    }
  }

  if (pieceToLand.type === 'king' && move.type === 'castle') {
    const rC = toCol > fromCol ? 7 : 0; const tC = toCol > fromCol ? 5 : 3;
    const rookSq = newBoard[fromRow][rC];
    if (rookSq.piece) {
        if (rookSq.piece.type === 'palace') { 
          pieceToLand.level++; 
          didLevelUp = true; 
          levelGain = 1;
        }
        newBoard[fromRow][tC].piece = { ...rookSq.piece, hasMoved: true, isShielded: false };
        rookSq.piece = null;
    }
  }

  if (captured) {
    handleHydraSplit(captured, toRow, toCol, newBoard);

    // Rule: Pawn Capturing a Commander promotes to a Commander
    if (pieceToLand.type === 'pawn' && captured.type === 'commander') {
      pieceToLand.type = 'commander';
    }

    let gain = pieceToLand.heldItem === 'berserkers_mask' ? 3 : ({pawn: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[captured.type] || 0);
    
    if (pieceToLand.heldItem === 'gnosis') gain += 1;
    
    let hasLogasBoost = false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = toRow + dr, nc = toCol + dc;
        if (isValidSquare(nr, nc)) {
          const neighbor = newBoard[nr][nc].piece;
          if (neighbor && neighbor.color === pieceToLand.color && neighbor.heldItem === 'logas') {
            hasLogasBoost = true;
            break;
          }
        }
      }
      if (hasLogasBoost) break;
    }
    if (hasLogasBoost) gain += 1;

    const oldL = pieceToLand.level || 1;
    if (pieceToLand.type === 'queen') {
        if (oldL < 7) {
            pieceToLand.level = Math.min(7, oldL + gain);
            didLevelUp = true;
            levelGain = pieceToLand.level - oldL;
        }
    } else {
        pieceToLand.level = oldL + gain;
        didLevelUp = true;
        levelGain = gain;
    }

    if (pieceToLand.type === 'commander') applyRally(newBoard, pieceToLand.color, 'pawn', move.to);
    if (pieceToLand.type === 'hero') applyRally(newBoard, pieceToLand.color, 'all', move.to);
    if (pieceToLand.type === 'king') applyKingDominion(newBoard, pieceToLand.color, gain);

    if (pieceToLand.heldItem === 'poison_dagger') {
        triggerPoisonSplash(newBoard, toRow, toCol, pieceToLand.color);
    }
    if (captured.heldItem === 'poison_tunic') {
        pieceToLand.isPoisoned = true;
    }

    if (pieceToLand.heldItem === 'leach_blade') {
        const oppColor = pieceToLand.color === 'white' ? 'black' : 'white';
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = toRow + dr, nc = toCol + dc;
                if (isValidSquare(nr, nc)) {
                    const victim = newBoard[nr][nc].piece;
                    if (victim && victim.color === oppColor) {
                        victim.level = Math.max(1, (victim.level || 1) - 1);
                    }
                }
            }
        }
    }

    if (pieceToLand.heldItem === 'tortoise_hammer') {
        const oppColor = pieceToLand.color === 'white' ? 'black' : 'white';
        const forwardDir = pieceToLand.color === 'white' ? -1 : 1;
        const splashTargets = [
            { r: toRow, c: toCol - 1 }, // West
            { r: toRow, c: toCol + 1 }, // East
            { r: toRow + forwardDir, c: toCol } // Forward
        ];

        splashTargets.forEach(target => {
            if (isValidSquare(target.r, target.c)) {
                const victim = newBoard[target.r][target.c].piece;
                if (victim && victim.color === oppColor && victim.type !== 'king') {
                    const capturedSplash = { ...victim, id: `${victim.id}_splash_${Date.now()}` };
                    handleHydraSplit(victim, target.r, target.c, newBoard);
                    if (graveyard) graveyard[pieceToLand.color === 'white' ? 'white' : 'black'].push(capturedSplash);
                    if (victim.heldItem === 'soul_link') {
                        newBoard.forEach(row => row.forEach(sq => {
                            if (sq.piece && sq.piece.color === oppColor && sq.piece.heldItem === 'soul_link') sq.piece = null;
                        }));
                    }
                    newBoard[target.r][target.c].piece = null;
                }
            }
        });
    }
  }

  if (didLevelUp && pieceToLand.heldItem === 'soul_link') {
    newBoard.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.heldItem === 'soul_link' && sq.piece.id !== pieceToLand.id) {
        if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
          sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, (sq.piece.level || 1) + levelGain);
          sq.piece.isPoisoned = false;
          sq.piece.cooldownTurnsRemaining = 0;
          sq.piece.frozenTurnsRemaining = 0;
        }
      }
    }));
  }

  if (didLevelUp) {
    pieceToLand.isPoisoned = false;
    pieceToLand.cooldownTurnsRemaining = 0;
    pieceToLand.frozenTurnsRemaining = 0;
  }

  if (pieceToLand.isPoisoned && pieceToLand.level === 1) {
    pieceToLand.cooldownTurnsRemaining = 1;
  }

  if (movingPiece.heldItem === 'wind_sword' && captured) {
      const crush = triggerPushBack(newBoard, toRow, toCol, pieceToLand.color);
      if (crush) pieceCapturedByAnvil = crush;
  }

  if (pieceToLand.heldItem === 'middle_way') pieceToLand.level = 3;

  if (captured?.heldItem === 'phoenix_down') {
    const empty = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!newBoard[r][c].piece && !newBoard[r][c].item) empty.push(coordsToAlgebraic(r,c));
    if(empty.length > 0) {
      const sq = empty[Math.floor(Math.random()*empty.length)];
      const {row: rr, col: rc} = algebraicToCoords(sq);
      const res = { ...captured, id: `res_${captured.id}_${Date.now()}` };
      newBoard[rr][rc].piece = res;
      phoenixResurrection = { piece: res, square: sq };
      // Prevent duplication: If we resurrect via Phoenix Down, nullify the capture so it's not added to the graveyard pile.
      captured = null;
    }
  }

  const effectiveLevelAfterMove = getEffectiveLevel(newBoard, toRow, toCol);
  const hasInherentPushBack = (pieceToLand.type === 'pawn' || pieceToLand.type === 'commander') && effectiveLevelAfterMove >= 4;
  const hasCloakPushBack = pieceToLand.heldItem === 'wind_cloak' && effectiveLevelAfterMove >= 4;

  if (hasInherentPushBack || hasCloakPushBack) {
    const crush = triggerPushBack(newBoard, toRow, toCol, pieceToLand.color);
    if (crush) pieceCapturedByAnvil = crush;
  }
  
  if ((['bishop', 'archbishop'].includes(pieceToLand.type)) && effectiveLevelAfterMove >= 5) {
    triggerConversion(newBoard, toRow, toCol, pieceToLand.color, pieceToLand, conversionEvents);
  }

  if (pieceToLand.type === 'infiltrator' && toRow === (pieceToLand.color === 'white' ? 0 : 7)) infiltrationWin = true;

  return { newBoard, capturedPiece: captured, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare, phoenixResurrection, reflectionOccurred, resurrectionScrollEvent };
}

export function triggerPushBack(board: BoardState, r: number, c: number, color: PlayerColor): Piece | null {
  let crushed: Piece | null = null;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    if(dr===0 && dc===0) continue;
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const victim = board[nr][nc];
      if(victim.item?.type === 'anvil' || (victim.piece && (color === 'neutral' as any || victim.piece.color !== color))) {
        if(victim.piece?.heldItem === 'passive_armor') continue;
        const tr = nr+dr; const tc = nc+dc;
        if(!isValidSquare(tr, tc)) { if(victim.item) board[nr][nc].item = null; }
        else {
          const dest = board[tr][tc];
          if (victim.item?.type === 'anvil') {
             if (dest.piece && dest.piece.type !== 'king') {
                crushed = { ...dest.piece };
                dest.piece = null;
                board[tr][tc].item = victim.item;
                board[nr][nc].item = null;
             } else if (!dest.piece && !dest.item) {
                board[tr][tc].item = victim.item;
                board[nr][nc].item = null;
             }
          } else if(!dest.piece && !dest.item) {
             board[tr][tc].piece = victim.piece;
             board[nr][nc].piece = null;
          }
        }
      }
    }
  }
  return crushed;
}

export function triggerPoisonSplash(board: BoardState, r: number, c: number, attackerColor: PlayerColor) {
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr = r+dr; const nc = c+dc;
        if(isValidSquare(nr, nc)) {
            const victim = board[nr][nc].piece;
            if(victim && victim.color !== attackerColor) victim.isPoisoned = true;
        }
    }
}

export function triggerConversion(board: BoardState, r: number, c: number, color: PlayerColor, converter: Piece, events: ConversionEvent[]) {
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const v = board[nr][nc].piece;
      if(v && v.color !== color && v.type !== 'king' && Math.random() < 0.5) {
        const orig = {...v};
        v.color = color; v.id = `conv_${v.id}_${Date.now()}`;
        events.push({ originalPiece: orig, convertedPiece: {...v}, byPiece: {...converter}, at: coordsToAlgebraic(nr, nc) });
      }
    }
  }
}

export function applyRally(board: BoardState, color: PlayerColor, target: 'pawn' | 'all', origin: AlgebraicSquare) {
  const { row: or, col: oc } = algebraicToCoords(origin);
  board.forEach(row => row.forEach(sq => {
    if(sq.piece && sq.piece.color === color) {
      if (sq.rowIndex === or && sq.colIndex === oc) return;
      
      if(target === 'all' || sq.piece.type === 'pawn') {
        if(sq.piece.type !== 'queen' || sq.piece.level < 7) {
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, sq.piece.level + 1);
            sq.piece.isPoisoned = false; 
            sq.piece.cooldownTurnsRemaining = 0;
            sq.piece.frozenTurnsRemaining = 0;
        }
      }
    }
  }));
}

export function applyKingDominion(board: BoardState, color: PlayerColor, gain: number) {
  const opp = color === 'white' ? 'black' : 'white';
  board.forEach(row => row.forEach(sq => {
    if(sq.piece && sq.piece.color === opp && sq.piece.type === 'queen') sq.piece.level = Math.max(1, sq.piece.level - gain);
  }));
}

export function processPoisonDamage(board: BoardState, player: PlayerColor): { newBoard: BoardState, poisonedCaptures: Piece[] } {
    const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
    const poisonedCaptures: Piece[] = [];
    
    newBoard.forEach(row => row.forEach(sq => {
        const p = sq.piece;
        if (p && p.color === player) {
          if (p.cooldownTurnsRemaining && p.cooldownTurnsRemaining > 0) {
            p.cooldownTurnsRemaining--;
          }
          if (p.frozenTurnsRemaining && p.frozenTurnsRemaining > 0) {
            p.frozenTurnsRemaining--;
          }

          if (p.isPoisoned) {
            if (p.level > 1) {
              p.level--;
            }
          }
        }
    }));
    
    return { newBoard, poisonedCaptures };
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  let k = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === kingColor) k = coordsToAlgebraic(r,c);
  if (!k) return false;
  return isSquareAttacked(board, k, kingColor === 'white' ? 'black' : 'white', false, null, enPassantTargetSquare);
}

function filterLegalMoves(board: BoardState, from: AlgebraicSquare, pseudo: AlgebraicSquare[], player: PlayerColor, ep: AlgebraicSquare | null): AlgebraicSquare[] {
  const p = board[algebraicToCoords(from).row][algebraicToCoords(from).col].piece;
  if (!p) return [];
  return pseudo.filter(to => {
    const fromCoords = algebraicToCoords(from);
    const toCoords = algebraicToCoords(to);
    
    let type: Move['type'] = 'move';
    
    const isStandardStartingSquare = (p.color === 'white' && from === 'e1') || (p.color === 'black' && from === 'e8');
    const isStandardTargetSquare = (p.color === 'white' && (to === 'c1' || to === 'g1')) || (p.color === 'black' && (to === 'c8' || to === 'g8'));
    
    if (p.type === 'king' && !p.hasMoved && isStandardStartingSquare && isStandardTargetSquare && fromCoords.row === toCoords.row && !board[toCoords.row][toCoords.col].piece) {
      type = 'castle';
    } else if ((p.type === 'pawn' || p.type === 'commander') && to === ep) {
      type = 'enpassant';
    } else if (board[toCoords.row][toCoords.col].piece) {
      const targetP = board[toCoords.row][toCoords.col].piece!;
      if (targetP.color === p.color) {
          type = 'swap';
      } else {
          type = 'capture';
      }
    }

    const {newBoard} = applyMove(board, { from, to, type }, ep);
    return !isKingInCheck(newBoard, player, null);
  });
}

export function getPossibleMoves(board: BoardState, from: AlgebraicSquare, ep: AlgebraicSquare | null): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(from);
    const piece = board[row][col].piece;
    if (!piece || (piece.cooldownTurnsRemaining || 0) > 0 || (piece.frozenTurnsRemaining || 0) > 0) return [];
    
    const pseudo = getPossibleMovesInternal(board, from, piece, true, ep);
    const legalMoves = filterLegalMoves(board, from, pseudo, piece.color, ep);

    const player = piece.color;
    let anyBerserkerCanCapture = false;
    const allBerserkerForcedMoves: {from: AlgebraicSquare, to: AlgebraicSquare}[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c].piece;
        if (p && p.color === player && p.heldItem === 'berserkers_mask') {
          const bFrom = coordsToAlgebraic(r, c);
          const bPseudo = getPossibleMovesInternal(board, bFrom, p, true, ep);
          const bLegal = filterLegalMoves(board, bFrom, bPseudo, player, ep);
          
          const bCaptures = bLegal.filter(to => {
            const tCoords = algebraicToCoords(to);
            const targetP = board[tCoords.row][tCoords.col].piece;
            if (targetP && targetP.color !== player) return true;
            if ((p.type === 'pawn' || p.type === 'commander') && to === ep) return true;
            return false;
          });

          if (bCaptures.length > 0) {
            anyBerserkerCanCapture = true;
            bCaptures.forEach(to => allBerserkerForcedMoves.push({from: bFrom, to}));
          }
        }
      }
    }

    if (anyBerserkerCanCapture) {
      return legalMoves.filter(to => 
        allBerserkerForcedMoves.some(bc => bc.from === from && bc.to === to)
      );
    }

    return legalMoves;
}

export function hasAnyLegalMoves(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.color === color && getPossibleMoves(board, board[r][c].algebraic, ep).length > 0) return true;
  return false;
}

export function isCheckmate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null): boolean {
  return isKingInCheck(board, color, ep) && !hasAnyLegalMoves(board, color, ep);
}

export function isStalemate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null): boolean {
  return !isKingInCheck(board, color, ep) && !hasAnyLegalMoves(board, color, ep);
}

export function processRookResurrectionCheck(board: BoardState, player: PlayerColor, move: Move, square: AlgebraicSquare, oldL: number, graveyard: { white: Piece[], black: Piece[] }, idCounter: number): RookResurrectionResult {
  const { row: r, col: c } = algebraicToCoords(square);
  const piece = board[r][c].piece;
  if (!piece || !['rook', 'palace'].includes(piece.type) || piece.color !== player) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
  
  const effectiveLevel = getEffectiveLevel(board, r, c);
  if (effectiveLevel >= 4 && effectiveLevel > oldL) {
    const opp = player === 'white' ? 'black' : 'white';
    if (!graveyard[opp] || graveyard[opp].length === 0) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
    
    // Sort graveyard by value, then by level (highest first)
    const sortedGraveyard = [...graveyard[opp]].sort((a,b) => {
        const valDiff = (VAL_MAP[b.type] || 0) - (VAL_MAP[a.type] || 0);
        if (valDiff !== 0) return valDiff;
        return (b.level || 1) - (a.level || 1);
    });
    
    const choice = sortedGraveyard[0];
    if (choice) {
      const adj = [];
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) if(dr!==0 || dc!==0) {
        const nr=r+dr; const nc=c+dc; if(isValidSquare(nr,nc) && !board[nr][nc].piece && !board[nr][nc].item) adj.push(coordsToAlgebraic(nr,nc));
      }
      if (adj.length > 0) {
        const target = adj[Math.floor(Math.random()*adj.length)];
        const {row: rr, col: rc} = algebraicToCoords(target);
        
        // Determine level based on Rook type (Palace retains level, Rook resets to 1)
        const resLevel = piece.type === 'palace' ? choice.level : 1;
        
        // Retain original piece properties but reset temporary state
        const res = { ...choice, level: resLevel, id: `${choice.id}_res_${idCounter}`, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
        
        const oppBackRank = player === 'white' ? 0 : 7;
        
        // Automatic Commander -> Hero promotion if landing on opponent back rank
        if (res.type === 'commander' && rr === oppBackRank) {
            res.type = 'hero';
            res.id = `${res.id}_hero_res_auto_${Date.now()}`;
        }

        board[rr][rc].piece = res;
        const newG = { ...graveyard, [opp]: graveyard[opp].filter(p => p.id !== choice.id) };
        
        return { 
          boardWithResurrection: board, 
          capturedPiecesAfterResurrection: newG, 
          resurrectionPerformed: true, 
          resurrectedPieceData: res, 
          resurrectedSquareAlg: target, 
          newResurrectionIdCounter: idCounter+1, 
          promotionRequiredForResurrectedPawn: res.type === 'pawn' && rr === oppBackRank 
        };
      }
    }
  }
  return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
}

export function spawnShroom(board: BoardState): { newBoard: BoardState; spawnedAt: AlgebraicSquare | null } {
  const empty = [];
  for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!board[r][c].piece && !board[r][c].item) empty.push(coordsToAlgebraic(r,c));
  if (empty.length > 0) {
    const target = empty[Math.floor(Math.random()*empty.length)];
    const {row: r, col: c} = algebraicToCoords(target);
    board[r][c].item = { type: 'shroom' };
    return { newBoard: board, spawnedAt: target };
  }
  return { newBoard: board, spawnedAt: null };
}

export function findKing(board: BoardState, color: PlayerColor): { row: number; col: number; piece: Piece } | null {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === color) return { row: r, col: c, piece: board[r][c].piece! };
    return null;
}

export function isQueenSacrificeRequired(board: BoardState, player: PlayerColor, move: Move, originalLevel: number, originalType: PieceType): boolean {
    const { row: toR, col: toC } = algebraicToCoords(move.to);
    const piece = board[toR]?.[toC]?.piece;
    if (!piece || piece.type !== 'queen' || piece.color !== player) return false;
    
    // Only existing Queens leveling to 7 require sacrifice. Promotion doesn't trigger it.
    if (originalType !== 'queen') return false;

    if (piece.level === 7 && originalLevel < 7) {
        return board.flat().some(sq => sq.piece?.color === player && (sq.piece.type === 'pawn' || sq.piece.type === 'commander'));
    }
    return false;
}

export interface RookResurrectionResult {
  boardWithResurrection: BoardState;
  capturedPiecesAfterResurrection: { white: Piece[], black: Piece[] };
  resurrectionPerformed: boolean;
  resurrectedPieceData?: Piece;
  resurrectedSquareAlg?: AlgebraicSquare;
  newResurrectionIdCounter?: number;
  promotionRequiredForResurrectedPawn?: boolean;
}
