
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType } from '@/types';
import { FRONTLINE_TYPES } from './constants';
import { getEffectiveLevel, algebraicToCoords, coordsToAlgebraic, isValidSquare } from './utils';
import { getPossibleMovesInternal, getPossibleMoves } from './move-rules';

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null, targetLevel: number, attackingLevel: number, board?: BoardState): boolean {
    if (!targetPiece || !attackingPiece) return false;

    if (targetPiece.id.startsWith('boss-colossus') && board) {
        const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
        if (otherMinions) return true; 
    }

    if (targetPiece.frozenTurnsRemaining && targetPiece.frozenTurnsRemaining > 0) return true;
    if (targetPiece.heldItem === 'queens_peace' && targetPiece.type === 'queen') return true;
    if (targetPiece.isShielded && attackingPiece.type !== 'self-destruct') return true;
    const hunters = ['commander', 'hero', 'infiltrator', 'dancer', 'mimic', 'grappler', 'self-destruct', 'myco_mage'];
    if (targetPiece.type === 'queen' && hunters.includes(attackingPiece.type)) return false;
    if (targetPiece.type === 'queen' && targetLevel >= 7 && attackingLevel < targetLevel) return true;
    if ((['bishop', 'archbishop'].includes(targetPiece.type)) && targetLevel >= 3 && FRONTLINE_TYPES.includes(attackingPiece.type)) return true;
    return (targetPiece.invulnerableTurnsRemaining || 0) > 0;
}

export function isSquareAttacked(
    board: BoardState,
    squareToAttack: AlgebraicSquare,
    attackerColor: PlayerColor,
    simplifyKingCheck: boolean = false,
    ignoreAttackerAtSquare?: AlgebraicSquare | null,
    enPassantTargetSquare?: AlgebraicSquare | null,
    lastMovedPieceType?: PieceType | null,
    lastMovedPieceHeldItem?: InventoryItemType | null,
    lastMovedPieceLevel?: number | null
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
                if (['pawn', 'dancer', 'commander', 'grappler', 'myco_mage'].includes(attackingPiece.type)) {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if (r + direction === targetR && Math.abs(c - targetC) === 1) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                } else if (attackingPiece.type === 'infiltrator') {
                    const direction = attackingPiece.color === 'white' ? -1 : 1;
                    if ( (r + direction === targetR && c === targetC) || (r + direction === targetR && Math.abs(c - targetC) === 1) ) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                } else if (attackingPiece.type === 'king') {
                    const maxDistance = effectiveLevel >= 2 && !simplifyKingCheck ? 2 : 1;
                    const dr = targetR - r; const dc = targetC - c;
                    if (Math.abs(dr) <= maxDistance && Math.abs(dc) <= maxDistance && (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) {
                        if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2)) {
                            const midR = r + Math.sign(dr); const midC = c + Math.sign(dc);
                            if (!board[midR][midC].piece && (!board[midR][midC].item || board[midR][midC].item?.type === 'anvil')) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                        } else if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                    }
                    if (effectiveLevel >= 5 && !simplifyKingCheck) {
                        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
                        for (const [dr_n, dc_n] of knightDeltas) if (r + dr_n === targetR && c + dc_n === targetC) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                    }
                } else {
                    const pseudoMoves = getPossibleMovesInternal(board, attackingSquareAlgebraic, attackingPiece, false, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
                    if (pseudoMoves.includes(squareToAttack)) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                }
            }
        }
    }
    return false;
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null): boolean {
  if (kingColor === 'black') {
      const colossusParts = board.flat().filter(sq => sq.piece?.id.startsWith('boss-colossus'));
      if (colossusParts.length > 0) {
          const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
          if (otherMinions) return false;
          return colossusParts.some(part => isSquareAttacked(board, part.algebraic, 'white', false, null, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel));
      }
  }
  let k = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === kingColor) k = coordsToAlgebraic(r,c);
  if (!k) return false;
  return isSquareAttacked(board, k, kingColor === 'white' ? 'black' : 'white', false, null, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
}

export function isCheckmate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null): boolean {
  return isKingInCheck(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel) && !hasAnyLegalMoves(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
}

export function isStalemate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null): boolean {
  return !isKingInCheck(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel) && !hasAnyLegalMoves(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
}

export function hasAnyLegalMoves(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.color === color && getPossibleMoves(board, board[r][c].algebraic, ep, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel).length > 0) return true;
  return false;
}
