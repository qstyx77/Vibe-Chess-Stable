import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType, ItemType, Move } from '@/types';
import { FRONTLINE_TYPES } from './constants';
import { algebraicToCoords, coordsToAlgebraic, isValidSquare, getEffectiveLevel, isSilenced, getActiveSets } from './utils';
import { isPieceInvulnerableToAttack, isSquareAttacked, isKingInCheck } from './validation';
import { applyMove } from './engine';

export function getPossibleMoves(
  board: BoardState,
  fromSquare: AlgebraicSquare,
  enPassantTargetSquare: AlgebraicSquare | null,
  lastMovedPieceType?: PieceType | null,
  lastMovedPieceHeldItem?: InventoryItemType | null,
  lastPieceL?: number | null,
  lastMovedPieceLevel?: number | null
): AlgebraicSquare[] {
  const { row, col } = algebraicToCoords(fromSquare);
  const piece = board[row][col].piece;
  if (!piece) return [];

  const pseudoMoves = getPossibleMovesInternal(
    board,
    fromSquare,
    piece,
    true,
    enPassantTargetSquare,
    lastMovedPieceType,
    lastMovedPieceHeldItem,
    lastMovedPieceLevel,
    false // explicitly not simplified for UI move generation
  );

  return pseudoMoves.filter(to => {
    // Determine the type for the legality check simulation
    const targetP = board[algebraicToCoords(to).row][algebraicToCoords(to).col].piece;
    let moveType: Move['type'] = 'move';
    if (targetP && targetP.color === piece.color) moveType = 'swap';
    else if (to === enPassantTargetSquare && FRONTLINE_TYPES.includes(piece.type)) moveType = 'enpassant';
    else if (piece.type === 'king' && Math.abs(algebraicToCoords(to).col - col) === 2) moveType = 'castle';

    const { newBoard, enPassantTargetSet } = applyMove(
      board,
      { from: fromSquare, to, type: moveType },
      enPassantTargetSquare,
      undefined,
      lastMovedPieceType,
      lastMovedPieceHeldItem,
      lastMovedPieceLevel
    );
    
    return !isKingInCheck(
      newBoard,
      piece.color,
      enPassantTargetSet,
      piece.type,
      piece.heldItem,
      piece.level
    );
  });
}

export function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean,
    enPassantTargetSquare: AlgebraicSquare | null,
    lastMovedPieceType?: PieceType | null,
    lastMovedPieceHeldItem?: InventoryItemType | null,
    lastMovedPieceLevel?: number | null,
    simplified: boolean = false
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
    
    return getPossibleMovesInternal(board, fromSquare, virtualPiece, checkKingSafety, enPassantTargetSquare, null, null, null, simplified);
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
        const nr = fromRow + i * dr; const nc = fromCol + dc;
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

  const activeSets = getActiveSets(board, piece.color);
  const isAssassinSet = activeSets.includes('assassin');
  const dir = piece.color === 'white' ? -1 : 1;

  if (isAssassinSet && FRONTLINE_TYPES.includes(piece.type) && currentLevel >= 5) {
      [-1, 0, 1].forEach(dc => {
          const nr = fromRow + dir; const nc = fromCol + dc;
          if (isValidSquare(nr, nc)) {
              const targetSq = board[nr][nc];
              if (targetSq.item?.type === 'anvil') return; 
              const target = targetSq.piece;
              if (!target) possible.push(coordsToAlgebraic(nr, nc));
              else if (target.color !== pieceColor) {
                  const targetLevel = getEffectiveLevel(board, nr, nc);
                  if (!isPieceInvulnerableToAttack(target, piece, targetLevel, currentLevel, board)) {
                      possible.push(coordsToAlgebraic(nr, nc));
                  }
              }
          }
      });
  } else if (piece.type === 'grappler') {
    if (isValidSquare(fromRow + dir, fromCol)) {
        const tSq = board[fromRow + dir][fromCol];
        if (!tSq.piece || (tSq.item?.type === 'anvil' && piece.heldItem === 'crowbar')) {
            possible.push(coordsToAlgebraic(fromRow + dir, fromCol));
            const startRank = pieceColor === 'white' ? 6 : 1;
            const jumpTarget = fromRow + 2 * dir;
            const canJumpStart = (!piece.hasMoved && fromRow === startRank) || piece.heldItem === 'swift_cloak';
            if (canJumpStart && isValidSquare(jumpTarget, fromCol) && !board[jumpTarget][fromCol].piece && !board[jumpTarget][fromCol].item && !board[fromRow + dir][fromCol].piece && !board[fromRow + dir][fromCol].item) {
                possible.push(coordsToAlgebraic(jumpTarget, fromCol));
            }
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
    
    if (!simplified && !silenced) {
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = fromRow + dr, nc = fromCol + dc;
              if (isValidSquare(nr, nc)) {
                  const targetPiece = board[nr][nc].piece;
                  const targetAnvil = board[nr][nc].item?.type === 'anvil' && piece.heldItem === 'power_glove';
                  if ((targetPiece && targetPiece.type !== 'king') || targetAnvil) {
                      possible.push(coordsToAlgebraic(nr, nc));
                  }
              }
          }
      }
    }
  } else if (piece.heldItem === 'tortoise_hammer') {
    const nr = fromRow + dir;
    if (isValidSquare(nr, fromCol)) {
        const targetSq = board[nr][fromCol];
        if (!targetSq.piece || targetSq.piece.color !== pieceColor || (targetSq.item?.type === 'anvil' && piece.heldItem === 'crowbar')) {
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
            if (!isValidSquare(toR, toC)) continue;
            const targetSq = board[toR][toC];
            if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') continue;
            
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
                 if (!targetPiece || !isPieceInvulnerableToAttack(targetPiece, piece, targetLevel, currentLevel, board)) possible.push(coordsToAlgebraic(toR, toC));
            }
        }
    }
    if (currentLevel >= 5) {
        const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr_n, dc_n] of knightDeltas) {
            const toR_n = fromRow + dr_n; const toC_n = fromCol + dc_n;
            if (isValidSquare(toR_n, toC_n)) {
                const targetSq = board[toR_n][toC_n];
                if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') continue;
                const targetPiece_n = board[toR_n][toC_n].piece;
                const targetLevel_n = getEffectiveLevel(board, toR_n, toC_n);
                if (!targetPiece_n || targetPiece_n.color !== pieceColor) {
                     if (!targetPiece_n || !isPieceInvulnerableToAttack(targetPiece_n, piece, targetLevel_n, currentLevel, board)) possible.push(coordsToAlgebraic(toR_n, toC_n));
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
      let rangeBonus = 0;
      if (piece.heldItem === 'scouts_map') {
        let enemyNearby = false;
        for (let dr = -3; dr <= 3; dr++) {
          for (let dc = -3; dc <= 3; dc++) {
            if (isValidSquare(fromRow + dr, fromCol + dc)) {
              const p = board[fromRow + dr][fromCol + dc].piece;
              if (p && p.color === opponentColor) { enemyNearby = true; break; }
            }
          }
          if (enemyNearby) break;
        }
        if (!enemyNearby) rangeBonus = 1;
      }

      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const to = coordsToAlgebraic(r,c);
          if (isMoveValidInternal(board, fromSquare, to, piece, enPassantTargetSquare, rangeBonus)) if(!possible.includes(to)) possible.push(to);
      }
  } else if (piece.type === 'bishop' || piece.type === 'archbishop') {
      const dirs: [number, number][] = [[1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item?.type === 'anvil') {
                  if (piece.heldItem === 'crowbar') possible.push(coordsToAlgebraic(R, C));
                  break; 
              }
              
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
      if (!simplified && !silenced && currentLevel >= 4) {
          board.forEach(row => row.forEach(sq => {
              if (sq.piece && sq.piece.color === pieceColor && (['knight', 'hero', 'archer'].includes(sq.piece.type))) {
                  if (!possible.includes(sq.algebraic)) possible.push(sq.algebraic);
              }
          }));
      }
  } else if (piece.type === 'rook' || piece.type === 'palace') {
      const dirs: [number, number][] = [[0,1], [0,-1], [1,0], [-1,0]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item?.type === 'anvil') {
                  if (piece.heldItem === 'crowbar') possible.push(coordsToAlgebraic(R, C));
                  break;
              }

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
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        const nr = fromRow + dr; const nc = fromCol + dc;
        if (isValidSquare(nr, nc)) {
          const targetSq = board[nr][nc];
          if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') return;
          const targetP = targetSq.piece;
          if (!targetP || targetP.color !== pieceColor) {
             const targetLevel = getEffectiveLevel(board, nr, nc);
             if (!targetP || !isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) {
               possible.push(coordsToAlgebraic(nr, nc));
             }
          }
        }
      });

      if (currentLevel >= 2) {
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr, dc]) => {
          const nr = fromRow + dr; const nc = fromCol + dc;
          if (isValidSquare(nr, nc)) {
            const targetSq = board[nr][nc];
            if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') return;
            const targetP = targetSq.piece;
            if (!targetP || targetP.color !== pieceColor) {
              const targetLevel = getEffectiveLevel(board, nr, nc);
              if (!targetP || !isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) {
                possible.push(coordsToAlgebraic(nr, nc));
              }
            }
          }
        });
      }

      if (currentLevel >= 3) {
        [[3,0],[-3,0],[0,3],[0,-3]].forEach(([dr, dc]) => {
          const nr = fromRow + dr; const nc = fromCol + dc;
          if (isValidSquare(nr, nc)) {
            const targetSq = board[nr][nc];
            if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') return;
            const targetP = targetSq.piece;
            if (!targetP || (targetP.color !== pieceColor && !isPieceInvulnerableToAttack(targetP, piece, getEffectiveLevel(board, nr, nc), currentLevel, board))) {
              const sR = Math.sign(dr); const sC = Math.sign(dc);
              let clear = true;
              for (let i = 1; i < 3; i++) {
                const ir = fromRow + i * sR; const ic = fromCol + i * sC;
                if (isValidSquare(ir, ic) && (board[ir][ic].piece || board[ir][ic].item?.type === 'anvil')) {
                  clear = false; break;
                }
              }
              if (clear) {
                const targetLevel = getEffectiveLevel(board, nr, nc);
                if (!targetP || !isPieceInvulnerableToAttack(targetP, piece, targetLevel, currentLevel, board)) {
                  possible.push(coordsToAlgebraic(nr, nc));
                }
              }
            }
          }
        });
      }
      if (!simplified && !silenced && currentLevel >= 4) {
          board.forEach(row => row.forEach(sq => {
              if (sq.piece && sq.piece.color === pieceColor && (sq.piece.type === 'bishop' || sq.piece.type === 'archbishop')) {
                  if (!possible.includes(sq.algebraic)) possible.push(sq.algebraic);
              }
          }));
      }
      if (currentLevel >= 5 && !silenced) possible.push(fromSquare);
  } else if (piece.type === 'queen') {
      const dirs: [number, number][] = [[0,1], [0,-1], [1,0], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1]];
      dirs.forEach(([dr, dc]) => {
          for (let i = 1; i < 8; i++) {
              const R = fromRow + i * dr; const C = fromCol + i * dc;
              if (!isValidSquare(R, C)) break;
              const targetSq = board[R][C];
              if (targetSq.item?.type === 'anvil') {
                  if (piece.heldItem === 'crowbar') possible.push(coordsToAlgebraic(R, C));
                  break;
              }

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
    if (isValidSquare(nr, fromCol)) {
        const tSq = board[nr][fromCol];
        if (!tSq.piece || (tSq.item?.type === 'anvil' && piece.heldItem === 'crowbar')) {
            possible.push(coordsToAlgebraic(nr, fromCol));
        }
    }
  }
  if (piece.heldItem === 'drift_boots' && piece.heldItem !== 'tortoise_hammer') {
    const dir = piece.color === 'white' ? -1 : 1;
    [-1, 1].forEach(dc => {
      const nr = fromRow + dir; const nc = fromCol + dc;
      if (isValidSquare(nr, nc)) {
          const tSq = board[nr][nc];
          if (!tSq.piece || (tSq.item?.type === 'anvil' && piece.heldItem === 'crowbar')) {
              possible.push(coordsToAlgebraic(nr, nc));
          }
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

function isMoveValidInternal(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece, ep: AlgebraicSquare | null, rangeBonus: number = 0): boolean {
  const { row: fR, col: fC } = algebraicToCoords(from);
  const { row: tR, col: tC } = algebraicToCoords(to);
  const dr = tR - fR;
  const dc = tC - fC;
  const color = piece.color;
  const opp = color === 'white' ? 'black' : 'white';
  const targetSq = board[tR][tC];
  const targetP = targetSq.piece;

  if (targetSq.item?.type === 'anvil' && piece.heldItem !== 'crowbar') return false;

  if (FRONTLINE_TYPES.includes(piece.type)) {
    const forward = color === 'white' ? -1 : 1;
    const effL = getEffectiveLevel(board, fR, fC);
    if (dc === 0 && (!targetP || (targetSq.item?.type === 'anvil' && piece.heldItem === 'crowbar'))) {
      if (dr === forward) return true;
      if (rangeBonus > 0 && dr === (1 + rangeBonus) * forward) return true;
      if (dr === 2 * forward && !piece.hasMoved && !board[fR + forward][fC].piece && !board[fR + forward][fC].item) return true;
      if (dr === -forward && effL >= 2) return true;
      if (rangeBonus > 0 && dr === -(1 + rangeBonus) * forward && effL >= 2) return true;
    }
    if (dr === 0 && Math.abs(dc) <= (1 + rangeBonus) && effL >= 3 && (!targetP || (targetSq.item?.type === 'anvil' && piece.heldItem === 'crowbar'))) return true;
    if (dr === forward && Math.abs(dc) === 1) {
       if (targetP && targetP.color === opp) return true;
       if (!targetP && to === ep) return true;
    }
    return false;
  }

  if (['knight', 'hero', 'archer'].includes(piece.type)) {
    const isKnightMove = (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
    if (isKnightMove) return !targetP || targetP.color === opp || (targetSq.item?.type === 'anvil' && piece.heldItem === 'crowbar');
    return false;
  }
  
  return false;
}
