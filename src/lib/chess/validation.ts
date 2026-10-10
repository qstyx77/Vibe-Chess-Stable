
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType, LastMoveInfo } from '@/types';
import { FRONTLINE_TYPES } from './constants';
import { getEffectiveLevel, algebraicToCoords, coordsToAlgebraic, isValidSquare, getActiveSets } from './utils';
import { getPossibleMovesInternal, getPossibleMoves } from './move-rules';

export function isPieceInvulnerableToAttack(targetPiece: Piece | null, attackingPiece: Piece | null, targetLevel: number, attackingLevel: number, board?: BoardState, ignoreDefensiveAbilities: boolean = false): boolean {
    if (!targetPiece || !attackingPiece) return false;

    // Boss Colossus logic (minions must be cleared first)
    if (targetPiece.id?.startsWith('boss-colossus') && board) {
        const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id?.startsWith('boss-colossus'));
        if (otherMinions) return true; 
    }

    if (targetPiece.frozenTurnsRemaining && targetPiece.frozenTurnsRemaining > 0) {
        if (attackingPiece.heldItem === 'ice_breaker') return false;
        return true;
    }
    
    // Obsidian Blade bypasses Holy Shields
    if (targetPiece.isShielded && attackingPiece.heldItem === 'obsidian_blade') return false;

    // Level-based core invulnerability rules (Checked before general shield shortcut)
    const hunters = ['commander', 'hero', 'infiltrator', 'dancer', 'mimic', 'grappler', 'self-destruct', 'myco_mage'];
    if (targetPiece.type === 'queen' && hunters.includes(attackingPiece.type)) return false;
    if (targetPiece.type === 'queen' && targetLevel >= 7 && attackingLevel < targetLevel) return true;
    if ((['bishop', 'archbishop'].includes(targetPiece.type)) && targetLevel >= 3 && FRONTLINE_TYPES.includes(attackingPiece.type)) return true;

    // Standard defensive abilities (like Shields) are ignored during check-detection to prevent "invincible kings" from moving into fire
    if (ignoreDefensiveAbilities) return false;

    if (targetPiece.heldItem === 'queens_peace' && targetPiece.type === 'queen') return true;
    if (targetPiece.isShielded && attackingPiece.type !== 'self-destruct') return true;
    
    return (targetPiece.invulnerableTurnsRemaining || 0) > 0;
}

export function isSquareAttacked(
    board: BoardState,
    squareToAttack: AlgebraicSquare,
    attackerColor: PlayerColor,
    simplifyKingCheck: boolean = false,
    ignoreAttackerAtSquare?: AlgebraicSquare | null,
    enPassantTargetSquare?: AlgebraicSquare | null,
    lastMoveWhite?: LastMoveInfo | null,
    lastMoveBlack?: LastMoveInfo | null,
    lastMoveGlobal?: LastMoveInfo | null,
    ignoreDefensiveAbilities: boolean = true 
): boolean {
    const coords = algebraicToCoords(squareToAttack);
    const targetR = coords.row;
    const targetC = coords.col;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const attackingSquareAlgebraic = coordsToAlgebraic(r,c);
            if (ignoreAttackerAtSquare && attackingSquareAlgebraic === ignoreAttackerAtSquare) continue;
            
            const attackingPiece = board[r][c].piece;
            if (attackingPiece && attackingPiece.color === attackerColor) {
                const pieceOnTargetSq = board[targetR][targetC]?.piece || null;
                const targetLevel = getEffectiveLevel(board, targetR, targetC);
                const effectiveLevel = getEffectiveLevel(board, r, c);
                
                // Use authoritative move generation to check for attacks
                const pseudoMoves = getPossibleMovesInternal(
                  board, 
                  attackingSquareAlgebraic, 
                  attackingPiece, 
                  false, 
                  enPassantTargetSquare, 
                  lastMoveWhite || null, 
                  lastMoveBlack || null, 
                  lastMoveGlobal || null, 
                  true // simplified = true for threat detection
                );
                
                if (pseudoMoves.includes(squareToAttack)) {
                    if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board, ignoreDefensiveAbilities)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null, lastMoveWhite?: LastMoveInfo | null, lastMoveBlack?: LastMoveInfo | null, lastMoveGlobal?: LastMoveInfo | null): boolean {
  if (kingColor === 'black') {
      const colossusParts = board.flat().filter(sq => sq.piece?.id?.startsWith('boss-colossus'));
      if (colossusParts.length > 0) {
          const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id?.startsWith('boss-colossus'));
          if (otherMinions) return false;
          return colossusParts.some(part => isSquareAttacked(board, part.algebraic, 'white', false, null, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, true));
      }
  }
  let k = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === kingColor) k = coordsToAlgebraic(r,c);
  if (!k) return false;
  return isSquareAttacked(board, k, kingColor === 'white' ? 'black' : 'white', false, null, enPassantTargetSquare, lastMoveWhite, lastMoveBlack, lastMoveGlobal, true);
}

export function isCheckmate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMoveWhite?: LastMoveInfo | null, lastMoveBlack?: LastMoveInfo | null, lastMoveGlobal?: LastMoveInfo | null): boolean {
  return isKingInCheck(board, color, ep, lastMoveWhite, lastMoveBlack, lastMoveGlobal) && !hasAnyLegalMoves(board, color, ep, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
}

export function isStalemate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMoveWhite?: LastMoveInfo | null, lastMoveBlack?: LastMoveInfo | null, lastMoveGlobal?: LastMoveInfo | null): boolean {
  return !isKingInCheck(board, color, ep, lastMoveWhite, lastMoveBlack, lastMoveGlobal) && !hasAnyLegalMoves(board, color, ep, lastMoveWhite, lastMoveBlack, lastMoveGlobal);
}

export function hasAnyLegalMoves(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMoveWhite?: LastMoveInfo | null, lastMoveBlack?: LastMoveInfo | null, lastMoveGlobal?: LastMoveInfo | null): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.color === color && getPossibleMoves(board, board[r][c].algebraic, ep, lastMoveWhite, lastMoveBlack, lastMoveGlobal).length > 0) return true;
  return false;
}
