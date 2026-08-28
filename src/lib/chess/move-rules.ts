
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType, ItemType } from '@/types';
import { FRONTLINE_TYPES } from './constants';
import { algebraicToCoords, coordsToAlgebraic, isValidSquare, getEffectiveLevel, isSilenced } from './utils';
import { isPieceInvulnerableToAttack, isSquareAttacked, isKingInCheck } from './validation';
import { applyMove } from './engine';

export function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean,
    enPassantTargetSquare: AlgebraicSquare | null,
    lastMovedPieceType?: PieceType | null,
    lastMovedPieceHeldItem?: InventoryItemType | null,
    lastMovedPieceLevel?: number | null
): AlgebraicSquare[] {
  if (!piece) return [];
  let possible: AlgebraicSquare[] = [];
  const { row: fromRow, col: fromCol } = algebraicToCoords(fromSquare);
  const pieceColor = piece.color;
  const opponentColor = pieceColor === 'white' ? 'black' : 'white';
  const currentLevel = getEffectiveLevel(board, fromRow, fromCol);
  const silenced = isSilenced(board, fromRow, fromCol, pieceColor);

  if (piece.type === 'mimic') {
    const patternType = (lastMovedPieceType && lastMovedPieceType !== 'mimic') ? lastMovedPieceType : 'pawn';
    const virtualPiece = { ...piece, type: patternType };
    
    if (piece.heldItem === 'mirror_mask' || (piece.heldItem === 'mimic_blade' && lastMovedPieceHeldItem)) {
        virtualPiece.heldItem = lastMovedPieceHeldItem || null;
    }
    
    if (piece.heldItem === 'mirror_mask' && lastMovedPieceLevel) {
        virtualPiece.level = lastMovedPieceLevel;
    }

    return getPossibleMovesInternal(board, fromSquare, virtualPiece, checkKingSafety, enPassantTargetSquare, null, null, null);
  }

  if (piece.id.startsWith('boss-colossus')) {
    const isMaster = piece.id === 'boss-colossus-tl';
    if (!isMaster) return []; 
    const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === pieceColor && !sq.piece.id.startsWith('boss-colossus'));
    if (otherMinions) return []; 
    const strideDeltas = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [-2, 2], [2, -2], [2, 2]];
    const knightDeltas = [[-4, -2], [-4, 2], [-2, -4], [-2, 4], [2, -4], [2, 4], [4, -2], [4, 2]];
    const allDeltas = [...strideDeltas, ...knightDeltas];
    for (const [dr, dc] of allDeltas) {
        const nr = fromRow + dr; const nc = fromCol + dc;
        if (isValidSquare(nr, nc) && isValidSquare(nr+1, nc+1)) {
            let pathBlocked = false;
            const stepR = Math.sign(dr); const stepC = Math.sign(dc);
            for (let i = 1; i <= Math.max(Math.abs(dr), Math.abs(dc)); i++) {
                const checkR = fromRow + i * stepR; const checkC = fromCol + i * stepC;
                if (!isValidSquare(checkR, checkC) || !isValidSquare(checkR+1, checkC+1)) { pathBlocked = true; break; }
                const block1 = board[checkR][checkC]; const block2 = board[checkR+1][checkC]; const block3 = board[checkR][checkC+1]; const block4 = board[checkR+1][checkC+1];
                const parts = ['boss-colossus-tl','boss-colossus-tr','boss-colossus-bl','boss-colossus-br'];
                const isPart = (p: Piece|null) => p && parts.includes(p.id);
                if ((block1.piece && !isPart(block1.piece)) || (block2.piece && !isPart(block2.piece)) || (block3.piece && !isPart(block3.piece)) || (block4.piece && !isPart(block4.piece))) {
                    if (i < Math.max(Math.abs(dr), Math.abs(dc))) { pathBlocked = true; break; }
                }
                if (block1.item?.type === 'anvil' || block2.item?.type === 'anvil' || block3.item?.type === 'anvil' || block4.item?.type === 'anvil') { pathBlocked = true; break; }
            }
            if (!pathBlocked) possible.push(coordsToAlgebraic(nr, nc));
        }
    }
    return possible;
  }

  const hasMagicScroll = (piece.heldItem === 'wind_scroll' || piece.heldItem === 'life_leach' || piece.heldItem === 'summon_anvil' || piece.heldItem === 'shield_scroll' || piece.heldItem === 'rally_scroll' || piece.heldItem === 'antidote' || piece.heldItem === 'detonation_scroll' || piece.heldItem === 'swap_scroll' || piece.heldItem === 'ice_scroll' || piece.heldItem === 'resurrection_scroll' || piece.heldItem === 'faith_scroll' || piece.heldItem === 'kings_decree' || piece.heldItem === 'ice_blast' || piece.heldItem === 'soul_harvest' || piece.heldItem === 'earthquake_scroll' || piece.heldItem === 'demonic_possession' || piece.heldItem === 'heavy_rain' || piece.heldItem === 'trap_net' || piece.heldItem === 'oil_slick');
  const hasSelfAbility = ((piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') && currentLevel >= 5);
  
  if (!silenced && (hasMagicScroll || hasSelfAbility || piece.type === 'myco_mage')) possible.push(fromSquare);

  if (piece.heldItem === 'grappling_hook') {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    dirs.forEach(([dr, dc]) => {
      for (let i = 1; i <= 3; i++) {
        const nr = fromRow + i * dr; const nc = fromCol + i * dc;
        if (!isValidSquare(nr, nc) || board[nr][nc].item?.type === 'anvil') break;
        const sq = board[nr][nc];
        if (sq.piece) {
          if (sq.piece.color === pieceColor) possible.push(coordsToAlgebraic(nr, nc));
          break;
        }
      }
    });
  }

  if (piece.heldItem === 'battering_ram' && (piece.type === 'rook' || piece.type === 'palace')) {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    dirs.forEach(([dr, dc]) => {
      const ar = fromRow + dr; const ac = fromCol + dc;
      if (isValidSquare(ar, ac) && board[ar][ac].item?.type === 'anvil') {
        for (let dist = 1; dist <= 3; dist++) {
          const nr = ar + dist * dr; const nc = ac + dist * dc;
          if (!isValidSquare(nr, nc)) break;
          const targetSq = board[nr][nc];
          if (targetSq.item?.type === 'anvil') break;
          if (!targetSq.piece || targetSq.piece.color !== pieceColor) {
            possible.push(coordsToAlgebraic(nr, nc));
          }
          if (targetSq.piece && targetSq.piece.color === pieceColor) break;
        }
      }
    });
  }

  if (piece.heldItem === 'knights_boots') {
    const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    knightDeltas.forEach(([dr, dc]) => {
      const nr = fromRow + dr; const nc = fromCol + dc;
      if (isValidSquare(nr, nc)) {
        const targetSq = board[nr][nc];
        if (targetSq.item?.type === 'anvil') return; 
        const targetP = targetSq.piece;
        if (!targetP || targetP.color !== pieceColor) {
          if (!targetP || !isPieceInvulnerableToAttack(targetP, piece, getEffectiveLevel(board, nr, nc), currentLevel, board)) {
            possible.push(coordsToAlgebraic(nr, nc));
          }
        }
      }
    });
    return possible;
  }

  if (piece.type === 'grappler') {
    const dir = pieceColor === 'white' ? -1 : 1;
    if (isValidSquare(fromRow + dir, fromCol) && !board[fromRow + dir][fromCol].piece) {
        possible.push(coordsToAlgebraic(fromRow + dir, fromCol));
        const startRank = pieceColor === 'white' ? 6 : 1;
        const jumpTarget = fromRow + 2 * dir;
        const canJumpStart = (!piece.hasMoved && fromRow === startRank) || piece.heldItem === 'swift_cloak';
        if (canJumpStart && isValidSquare(jumpTarget, fromCol) && !board[jumpTarget][fromCol].piece && !board[fromRow + dir][fromCol].piece) {
            possible.push(coordsToAlgebraic(jumpTarget, fromCol));
        }
    }
    [-1, 1].forEach(dc => {
        const nr = fromRow + dir, nc = fromCol + dc;
        if (isValidSquare(nr, nc)) {
            const target = board[nr][nc].piece;
            if (target && target.color !== pieceColor) {
               const targetLevel = getEffectiveLevel(board, nr, nc);
               if (!isPieceInvulnerableToAttack(target, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(nr, nc));
            }
            if (!target && coordsToAlgebraic(nr, nc) === enPassantTargetSquare) possible.push(coordsToAlgebraic(nr, nc));
        }
    });
    if (!silenced) {
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = fromRow + dr, nc = fromCol + dc;
              if (isValidSquare(nr, nc)) {
                  const targetPiece = board[nr][nc].piece;
                  const targetAnvil = board[nr][nc].item?.type === 'anvil' && piece.heldItem === 'power_glove';
                  if (targetPiece && targetPiece.type !== 'king') {
                    const isDiagForward = (nr === fromRow + dir) && Math.abs(nc - fromCol) === 1;
                    const isEnemy = targetPiece.color !== pieceColor;
                    if (!(isEnemy && isDiagForward)) possible.push(coordsToAlgebraic(nr, nc));
                  } else if (targetAnvil) {
                      possible.push(coordsToAlgebraic(nr, nc));
                  }
              }
          }
      }
    }
    return possible;
  }

  if (piece.heldItem === 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    const nr = fromRow + dir;
    if (isValidSquare(nr, fromCol)) {
        const targetSq = board[nr][fromCol];
        if (!targetSq.piece || targetSq.piece.color !== pieceColor) {
            const targetLevel = getEffectiveLevel(board, nr, fromCol);
            if (!targetSq.piece || !isPieceInvulnerableToAttack(targetSq.piece, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(nr, fromCol));
        }
    }
  } else if (piece.type === 'king') {
    const maxDistance = currentLevel >= 2 ? 2 : 1;
    for (let dr = -maxDistance; dr <= maxDistance; dr++) {
        for (let dc = -maxDistance; dc <= maxDistance; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) continue;
            const toR = fromRow + dr; const toC = fromCol + dc;
            if (!isValidSquare(toR, toC) || (board[toR][toC].item && board[toR][toC].item?.type === 'anvil')) continue;
            const finalTargetSquareAlgebraic = coordsToAlgebraic(toR, toC);
            if (maxDistance === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2) ) {
                const midR = fromRow + Math.sign(dr); const midC = fromCol + Math.sign(dc);
                if (!isValidSquare(midR, midC) || board[midR][midC].piece || (board[midR][midC].item && board[midR][midC].item?.type === 'anvil') ) continue;
                const targetPieceAtDest = board[toR][toC].piece;
                const isCheckCapture = targetPieceAtDest && targetPieceAtDest.color === opponentColor;
                if (checkKingSafety && isSquareAttacked(board, coordsToAlgebraic(midR, midC), opponentColor, false, isCheckCapture ? finalTargetSquareAlgebraic : null, enPassantTargetSquare )) continue;
            }
            const targetPiece = board[toR][toC].piece;
            const targetLevel = getEffectiveLevel(board, toR, toC);
            if (!targetPiece || targetPiece.color !== pieceColor) {
                 if (!isPieceInvulnerableToAttack(targetPiece, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(toR, toC));
            }
        }
    }
    if (currentLevel >= 5) {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr_n, dc_n] of knightDeltas) {
            const toR_n = fromRow + dr_n; const toC_n = fromCol + dc_n;
            if (isValidSquare(toR_n, toC_n) && (!board[toR_n][toC_n].item || board[toR_n][toC_n].item?.type !== 'anvil')) {
                const targetPiece_n = board[toR_n][toC_n].piece;
                const targetLevel_n = getEffectiveLevel(board, toR_n, toC_n);
                if (!targetPiece_n || targetPiece_n.color !== pieceColor) {
                     if (!isPieceInvulnerableToAttack(targetPiece_n, piece, targetLevel_n, currentLevel, board)) possible.push(coordsToAlgebraic(toR_n, toC_n));
                }
            }
        }
    }
    if (checkKingSafety && !piece.hasMoved) {
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
  } else if (FRONTLINE_TYPES.includes(piece.type)) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const to = coordsToAlgebraic(r,c);
          if (isMoveValidInternal(board, fromSquare, to, piece, enPassantTargetSquare)) if(!possible.includes(to)) possible.push(to);
      }
  } else if (piece.type === 'bishop' || piece.type === 'archbishop') {
      const dirs: [number, number][] = [[1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item?.type === 'anvil') break; 
              
              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(R, C));
                      break;
                  } else {
                      const isSwapTarget = currentLevel >= 4 && (['knight', 'hero', 'archer'].includes(targetP.type));
                      if (isSwapTarget) possible.push(coordsToAlgebraic(R, C));
                      if (currentLevel >= 2) continue; else break;
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
              if (targetSq.item?.type === 'anvil') break;

              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(R, C));
                      break;
                  } else {
                      const hasPhase = piece.heldItem === 'phase_boots' && currentLevel >= 2;
                      if (hasPhase) continue; else break;
                  }
              }
          }
      });
  } else if (['knight', 'hero', 'archer'].includes(piece.type)) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (isMoveValidInternal(board, fromSquare, coordsToAlgebraic(r,c), piece, enPassantTargetSquare)) possible.push(coordsToAlgebraic(r,c));
  } else if (piece.type === 'queen') {
      const dirs: [number, number][] = [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item?.type === 'anvil') break;

              const targetP = targetSq.piece;
              if (!targetP) possible.push(coordsToAlgebraic(R, C));
              else {
                  const targetLevel = getEffectiveLevel(board, R, C);
                  if (targetP.color !== pieceColor) {
                      if (!isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(R, C));
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
    if (isValidSquare(nr, fromCol) && !board[nr][fromCol].piece) {
      possible.push(coordsToAlgebraic(nr, fromCol));
    }
  }
  if (piece.heldItem === 'drift_boots' && piece.heldItem !== 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    [-1, 1].forEach(dc => {
      const nr = fromRow + dir; const nc = fromCol + dc;
      if (isValidSquare(nr, nc) && !board[nr][nc].piece) {
        possible.push(coordsToAlgebraic(nr, nc));
      }
    });
  }

  if (piece.heldItem === 'berserkers_mask') {
    const captureMoves = possible.filter(to => {
        const {row, col} = algebraicToCoords(to);
        const target = board[row][col].piece;
        if (target && target.color !== piece.color) return true;
        if (FRONTLINE_TYPES.includes(piece.type) && to === enPassantTargetSquare) return true;
        return false;
    });
    if (captureMoves.length > 0) return captureMoves;
  }

  return possible;
}

export function isMoveValidInternal(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  if (!isValidSquare(toRow, toCol)) return false;
  
  const effectiveLevel = getEffectiveLevel(board, fromRow, fromCol);
  const silenced = isSilenced(board, fromRow, fromCol, piece.color);
  if (from === to && !silenced && !((piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') && effectiveLevel >= 5) && !(['wind-scroll', 'life-leach', 'summon-anvil', 'shield-scroll', 'rally-scroll', 'antidote', 'swap-scroll', 'ice-scroll', 'resurrection-scroll', 'faith-scroll', 'kings-decree', 'ice-blast', 'soul-harvest', 'earthquake-scroll', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen', 'demonic-possession', 'heavy-rain', 'trap-net', 'oil-slick'].includes(piece.heldItem || '')) && piece.type !== 'myco_mage') return false;

  const targetSquareState = board[toRow][toCol];
  if (targetSquareState.item && targetSquareState.item.type === 'anvil' && piece.heldItem !== 'battering_ram') return false;
  const targetPieceOnSquare = targetSquareState.piece;
  const hasPhase = piece.heldItem === 'phase_boots' && effectiveLevel >= 2;

  if (piece.heldItem === 'queens_peace' && piece.type === 'queen' && targetPieceOnSquare) return false;

  const isSwap = (['knight', 'hero', 'archer'].includes(piece.type) && effectiveLevel >= 4 && targetPieceOnSquare && (['bishop', 'archbishop'].includes(targetPieceOnSquare.type)) && targetPieceOnSquare.color === piece.color) ||
                 ((['bishop', 'archbishop'].includes(piece.type)) && effectiveLevel >= 4 && targetPieceOnSquare && (['knight', 'hero', 'archer'].includes(targetPieceOnSquare.type)) && targetPieceOnSquare.color === piece.color);
  if (isSwap) return true;
  
  if (piece.heldItem === 'grappling_hook' && targetPieceOnSquare && targetPieceOnSquare.color === piece.color) return true;

  if (targetPieceOnSquare && targetPieceOnSquare.color === piece.color && piece.type !== 'grappler') return false;

  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color && targetPieceOnSquare.type === 'king' && !piece.id.startsWith('boss-colossus')) return false;
  
  const targetLevel = getEffectiveLevel(board, toRow, toCol);
  if (targetPieceOnSquare && targetPieceOnSquare.color !== piece.color && piece.type !== 'grappler') if (isPieceInvulnerableToAttack(targetPieceOnSquare, piece, targetLevel, effectiveLevel, board)) return false;

  const direction = piece.color === 'white' ? -1 : 1;

  if (FRONTLINE_TYPES.includes(piece.type)) {
      if (to === enPassantTargetSquare && Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction) {
          const targetSq = board[fromRow][toCol];
          if (targetSq.piece && FRONTLINE_TYPES.includes(targetSq.piece.type)) {
              if (targetSq.piece.color !== piece.color) return true;
          }
          return false;
      }

      if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && targetPieceOnSquare) return true;
      if (fromCol === toCol && toRow === fromRow + direction && !targetPieceOnSquare) return true;
      
      const startRank = piece.color === 'white' ? 6 : 1;
      const canJumpStart = (!piece.hasMoved && fromRow === startRank) || piece.heldItem === 'swift_cloak';
      if (fromCol === toCol && !targetPieceOnSquare && canJumpStart && ((piece.color === 'white' && toRow === fromRow - 2) || (piece.color === 'black' && toRow === fromRow + 2))) {
          const midR = fromRow + direction;
          if (!board[midR][fromCol].piece || (hasPhase && board[midR][fromCol].piece?.color === piece.color)) return true;
      }
      if (effectiveLevel >= 2 && fromCol === toCol && toRow === fromRow - direction && !targetPieceOnSquare) return true;
      if (effectiveLevel >= 3 && toRow === fromRow && Math.abs(fromCol - toCol) === 1 && !targetPieceOnSquare) return true;
      if (piece.type === 'grappler' && !silenced) {
          const isDiagForward = (toRow === fromRow + direction) && Math.abs(toCol - fromCol) === 1;
          const isEnemy = targetPieceOnSquare && targetPieceOnSquare.color !== piece.color;
          if (Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1 && (fromRow !== toRow || fromCol !== toCol) && targetPieceOnSquare) {
              if (!(isEnemy && isDiagForward)) return true;
          }
      }
      return false;
  }

  switch (piece.type) {
    case 'knight':
    case 'hero':
    case 'archer':
      const dRowK = Math.abs(toRow - fromRow); const dColK = Math.abs(toCol - fromCol);
      if ((dRowK === 2 && dColK === 1) || (dRowK === 1 && dColK === 2)) return true;
      if (effectiveLevel >= 2 && ((dRowK === 0 && dColK === 1) || (dRowK === 1 && dColK === 0))) return true;
      if (effectiveLevel >= 3 && ((dRowK === 0 && dColK === 3) || (dRowK === 3 && dColK === 0))) {
          if (dRowK === 3) { const s = Math.sign(toRow - fromRow); if (board[fromRow+s][fromCol].piece || board[fromRow+s][fromCol].item?.type === 'anvil' || board[fromRow+2*s][fromCol].piece || board[fromRow+2*s][fromCol].item?.type === 'anvil') return false; }
          else { const s = Math.sign(toCol - fromCol); if (board[fromRow][fromCol+s].piece || board[fromRow][fromCol+s].item?.type === 'anvil' || board[fromRow][fromCol+2*s].piece || board[fromRow][fromCol+2*s].item?.type === 'anvil') return false; }
          return true;
      }
      break;
    case 'rook':
    case 'palace':
      if (fromRow === toRow || fromCol === toCol) {
        const dr = Math.sign(toRow - fromRow); const dc = Math.sign(toCol - fromCol);
        let r = fromRow + dr; let c = fromCol + dc;
        while (r !== toRow || c !== toCol) { 
            if (board[r][c].item?.type === 'anvil') return false; 
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
            if (board[r][c].item?.type === 'anvil') return false; 
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
            if (board[r][c].item?.type === 'anvil') return false; 
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
          if (maxD === 2 && (dRowKi === 2 || dColKi === 2)) {
             const midR = fromRow + Math.sign(toRow - fromRow);
             const midC = fromCol + Math.sign(toCol - fromCol);
             if (board[midR][midC].piece || board[midR][midC].item?.type === 'anvil') return false;
          }
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

export function getPossibleMoves(board: BoardState, from: AlgebraicSquare, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, grappledItem?: ItemType | null, lastMovedPieceLevel?: number | null): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(from);
    const piece = board[row][col].piece;
    if (!piece || (piece.cooldownTurnsRemaining || 0) > 0 || (piece.frozenTurnsRemaining || 0) > 0) return [];
    
    const pseudo = getPossibleMovesInternal(board, from, piece, true, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    
    const filteredPseudo = pseudo.filter(to => {
        const {row: tr, col: tc} = algebraicToCoords(to);
        const target = board[tr][tc].piece;
        if (piece.id.startsWith('boss-colossus')) return true;
        if (grappledItem === 'anvil') return true; 
        return target?.type !== 'king';
    });

    const legalMoves = filterLegalMoves(board, from, filteredPseudo, piece.color, ep, lastMovedPieceType, lastMovedPieceHeldItem, grappledItem, lastMovedPieceLevel);
    if (piece.heldItem === 'berserkers_mask') {
      const captures = legalMoves.filter(to => {
        const {row, col} = algebraicToCoords(to);
        const target = board[row][col].piece;
        return (target && target.color !== piece.color) || (FRONTLINE_TYPES.includes(piece.type) && to === ep);
      });
      if (captures.length > 0) return captures;
    }
    return legalMoves;
}

export function filterLegalMoves(board: BoardState, from: AlgebraicSquare, pseudo: AlgebraicSquare[], player: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, grappledItem?: ItemType | null, lastMovedPieceLevel?: number | null): AlgebraicSquare[] {
  const fromCoords = algebraicToCoords(from);
  const p = board[fromCoords.row][fromCoords.col].piece;
  if (!p) return [];

  const silenced = isSilenced(board, fromCoords.row, fromCoords.col, p.color);
  const direction = p.color === 'white' ? -1 : 1;

  return pseudo.filter(to => {
    const toCoords = algebraicToCoords(to);
    const targetPiece = board[toCoords.row][toCoords.col].piece;

    if (p.type === 'grappler' && !silenced && (targetPiece || (board[toCoords.row][toCoords.col].item?.type === 'anvil' && p.heldItem === 'power_glove')) && Math.abs(fromCoords.row - toCoords.row) <= 1 && Math.abs(fromCoords.col - toCoords.col) <= 1) {
        const isDiagForward = (toCoords.row === fromCoords.row + direction) && Math.abs(toCoords.col - fromCoords.col) === 1;
        const isEnemy = targetPiece && targetPiece.color !== p.color;
        
        if (!(isEnemy && isDiagForward)) {
            if (targetPiece?.type === 'king' && !grappledItem) return false; 
            const boardWithPickup = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? { ...sq.item } : null })));
            const isAnvil = boardWithPickup[toCoords.row][toCoords.col].item?.type === 'anvil' && p.heldItem === 'power_glove';
            const pickedPieceData = boardWithPickup[toCoords.row][toCoords.col].piece ? { ...boardWithPickup[toCoords.row][toCoords.col].piece! } : null;
            
            if (isAnvil) boardWithPickup[toCoords.row][toCoords.col].item = null;
            else boardWithPickup[toCoords.row][toCoords.col].piece = null;
            
            const range = getEffectiveLevel(board, fromCoords.row, fromCoords.col);
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (!isAnvil && (boardWithPickup[r][c].piece || (boardWithPickup[r][c].item && boardWithPickup[r][c].item?.type === 'anvil'))) continue;
                    
                    const dr = Math.abs(r - fromCoords.row); const dc = Math.abs(c - fromCoords.col);
                    const dist = Math.max(dr, dc);
                    if (dist > 0 && dist <= range && (r === fromCoords.row || c === fromCoords.col || dr === dc)) {
                        if (isAnvil) {
                           const oldPiece = boardWithPickup[r][c].piece;
                           boardWithPickup[r][c].piece = null; 
                           boardWithPickup[r][c].item = { type: 'anvil' };
                           const isSafe = !isKingInCheck(boardWithPickup, player, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
                           boardWithPickup[r][c].item = null; boardWithPickup[r][c].piece = oldPiece;
                           if (isSafe) return true;
                        } else if (pickedPieceData) {
                           boardWithPickup[r][c].piece = { ...pickedPieceData, hasMoved: true };
                           const isSafe = !isKingInCheck(boardWithPickup, player, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
                           boardWithPickup[r][c].piece = null;
                           if (isSafe) return true;
                        }
                    }
                }
            }
            return false;
        }
    }

    let type: Move['type'] = 'move';
    if (p.heldItem === 'grappling_hook' && board[toCoords.row][toCoords.col].piece?.color === p.color) type = 'grapple-hook-swap';
    else if (p.heldItem === 'battering_ram' && (p.type === 'rook' || p.type === 'palace')) {
      const dr = Math.sign(toCoords.row - fromCoords.row); const dc = Math.sign(toCoords.col - fromCoords.col);
      if (isValidSquare(fromCoords.row+dr, fromCoords.col+dc) && board[fromCoords.row+dr][fromCoords.col+dc].item?.type === 'anvil') type = 'ram-push';
    }
    if (type === 'move') {
      const isStandardStartingSquare = (p.color === 'white' && from === 'e1') || (p.color === 'black' && from === 'e8');
      const isStandardTargetSquare = (p.color === 'white' && (to === 'c1' || to === 'g1')) || (p.color === 'black' && (to === 'c8' || to === 'g8'));
      if (p.type === 'king' && !p.hasMoved && isStandardStartingSquare && isStandardTargetSquare && fromCoords.row === toCoords.row && !board[toCoords.row][toCoords.col].piece) type = 'castle';
      else if (FRONTLINE_TYPES.includes(p.type) && to === ep) type = 'enpassant';
      else if (board[toCoords.row][toCoords.col].piece) type = board[toCoords.row][toCoords.col].piece!.color === p.color ? 'swap' : 'capture';
    }
    const applyResult = applyMove(board, { from, to, type }, ep, undefined, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
    return !isKingInCheck(applyResult.newBoard, player, ep, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
  });
}
