import type { BoardState, Piece, PlayerColor, AlgebraicSquare, ConversionEvent } from '@/types';
import { isValidSquare, coordsToAlgebraic, getEffectiveLevel, algebraicToCoords } from './utils';
import { FRONTLINE_TYPES } from './constants';

export function triggerPushBack(board: BoardState, r: number, c: number, color: PlayerColor, onlyAnvils: boolean = false): Piece | null {
  let crushed: Piece | null = null;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    if(dr===0 && dc===0) continue;
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const victim = board[nr][nc];
      
      if (onlyAnvils && victim.item?.type !== 'anvil') continue;

      if(victim.item?.type === 'anvil' || (victim.piece && (color === 'neutral' as any || victim.piece.color !== color))) {
        if(victim.piece?.heldItem === 'passive_armor' || victim.piece?.heldItem === 'lead_boots') continue;
        
        // Kinetic Coil logic: Gain level on push
        if (victim.piece?.heldItem === 'kinetic_coil') {
            victim.piece.level = Math.min(victim.piece.type === 'queen' ? 7 : 99, (victim.piece.level || 1) + 1);
            victim.piece.isPoisoned = false;
            victim.piece.isExhausted = false;
            victim.piece.cooldownTurnsRemaining = 0;
        }

        // Spiked Buckler logic: If victim has it, attacker (at r,c) becomes poisoned
        if (victim.piece?.heldItem === 'spiked_buckler') {
            const attacker = board[r][c].piece;
            if (attacker && attacker.heldItem !== 'filter_mask') {
                attacker.isPoisoned = true;
            }
        }

        // Frayed Rope logic: If victim has it, attacker (at r,c) becomes exhausted
        if (victim.piece?.heldItem === 'frayed_rope') {
            const attacker = board[r][c].piece;
            if (attacker) {
                attacker.cooldownTurnsRemaining = 2; // Exhausted
            }
        }

        const tr = nr+dr; const dc_dest = nc+dc;
        if(!isValidSquare(tr, dc_dest)) { if(victim.item) board[nr][nc].item = null; }
        else {
          const dest = board[tr][dc_dest];
          if (victim.item?.type === 'anvil') {
             const slideRes = applyOilSlide(board, nr, nc, dr, dc);
             if (slideRes.crushed) crushed = slideRes.crushed;
          } else if(!dest.piece && !dest.item) { 
             applyOilSlide(board, nr, nc, dr, dc);
          }
        }
      }
    }
  }
  return crushed;
}

export function applyRally(board: BoardState, color: PlayerColor, target: 'pawn' | 'all', origin: AlgebraicSquare): AlgebraicSquare[] {
  const rallied: AlgebraicSquare[] = [];
  const { row: or, col: oc } = algebraicToCoords(origin);
  board.forEach(row => row.forEach(sq => {
    if(sq.piece && sq.piece.color === color) {
      if (sq.rowIndex === or && sq.colIndex === oc) return;
      if(target === 'all' || FRONTLINE_TYPES.includes(sq.piece.type)) {
        if(sq.piece.type !== 'queen' || sq.piece.level < 7) {
            const oldLevel = sq.piece.level;
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, sq.piece.level + 1);
            if (sq.piece.level > oldLevel) {
                // Gaining a level clears Poison and Exhaustion
                sq.piece.isPoisoned = false;
                sq.piece.isExhausted = false;
                sq.piece.cooldownTurnsRemaining = 0;
                rallied.push(sq.algebraic);
            }
        }
      }
    }
  }));
  return rallied;
}

export function applyKingDominion(board: BoardState, color: PlayerColor, gain: number) {
  const opp = color === 'white' ? 'black' : 'white';
  board.forEach(row => row.forEach(sq => { if(sq.piece && sq.piece.color === opp && sq.piece.type === 'queen') sq.piece.level = Math.max(1, sq.piece.level - gain); }));
}

export function triggerPull(board: BoardState, r: number, c: number, color: PlayerColor) {
    const oppColor = color === 'white' ? 'black' : 'white';
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const targetR = r + (dr * 2); const targetC = c + (dc * 2);
        if (isValidSquare(targetR, targetC)) {
            const victimSq = board[targetR][targetC];
            if (victimSq.piece && victimSq.piece.color === oppColor) {
                if (victimSq.piece.heldItem === 'lead_boots') continue;
                
                // Kinetic Coil logic: Gain level on pull
                if (victimSq.piece.heldItem === 'kinetic_coil') {
                    victimSq.piece.level = Math.min(victimSq.piece.type === 'queen' ? 7 : 99, (victimSq.piece.level || 1) + 1);
                    victimSq.piece.isPoisoned = false;
                    victimSq.piece.isExhausted = false;
                    victimSq.piece.cooldownTurnsRemaining = 0;
                }

                if (victimSq.piece.heldItem === 'frayed_rope') {
                    const attacker = board[r][c].piece;
                    if (attacker) attacker.cooldownTurnsRemaining = 2;
                }

                const midR = r + dr, midC = c + dc;
                if (isValidSquare(midR, midC) && !board[midR][midC].piece && !board[midR][midC].item) { board[midR][midC].piece = victimSq.piece; victimSq.piece = null; }
            }
        }
    }
}

export function triggerPoisonSplash(board: BoardState, r: number, c: number, attackerColor: PlayerColor) {
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr = r+dr; const nc = c+dc;
        if(isValidSquare(nr, nc)) {
            const victim = board[nr][nc].piece;
            if(victim && victim.color !== attackerColor && victim.heldItem !== 'filter_mask') victim.isPoisoned = true;
        }
    }
}

export function triggerConversion(board: BoardState, r: number, c: number, color: PlayerColor, converter: Piece, events: ConversionEvent[]) {
  const robeBonus = converter.heldItem === 'monks_robe' ? 0.2 : 0;
  const threshold = 0.5 + robeBonus;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const v = board[nr][nc].piece;
      if(v && v.color !== color && v.type !== 'king' && Math.random() < threshold) {
        const orig = {...v}; v.color = color; v.id = `conv_${v.id}_${Date.now()}`;
        events.push({ originalPiece: orig, convertedPiece: {...v}, byPiece: {...converter}, at: coordsToAlgebraic(nr, nc) });
      }
    }
  }
}

export function triggerMushroomMagnet(board: BoardState, r: number, c: number) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > 2) continue;
      const sr = r + dr; const sc = c + dc;
      if (isValidSquare(sr, sc) && board[sr][sc].item?.type === 'shroom') {
        const moveR = Math.sign(r - sr); const moveC = Math.sign(c - sc);
        const nr = sr + moveR; const nc = sc + moveC;
        if (isValidSquare(nr, nc) && !board[nr][nc].piece && !board[nr][nc].item) {
          board[nr][nc].item = board[sr][sc].item;
          board[sr][sc].item = null;
        }
      }
    }
  }
}

export function syncSoulLink(board: BoardState, color: PlayerColor): BoardState {
    let maxLevel = 0;
    let hasSoulLink = false;
    board.forEach(row => row.forEach(sq => {
        if (sq.piece && sq.piece.color === color && sq.piece.heldItem === 'soul_link') {
            hasSoulLink = true;
            maxLevel = Math.max(maxLevel, sq.piece.level || 1);
        }
    }));

    if (hasSoulLink) {
        board.forEach(row => row.forEach(sq => {
            if (sq.piece && sq.piece.color === color && sq.piece.heldItem === 'soul_link') {
                if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
                    sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, maxLevel);
                }
            }
        }));
    }
    return board;
}

export function processPoisonDamage(board: BoardState, currentPlayer: PlayerColor): { newBoard: BoardState, poisonedCaptures: Piece[] } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null })));
  const poisonedCaptures: Piece[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = newBoard[r][c];

      if (sq.phasedTurnsRemaining > 0) {
        sq.phasedTurnsRemaining--;
        if (sq.phasedTurnsRemaining === 0 && sq.phasedPiece) {
           if (sq.piece) {
             poisonedCaptures.push({ ...sq.piece });
             poisonedCaptures.push({ ...sq.phasedPiece });
             sq.piece = null;
             sq.phasedPiece = null;
           } else {
             sq.piece = sq.phasedPiece;
             sq.phasedPiece = null;
           }
        }
      }

      const p = sq.piece;
      if (p && p.color === currentPlayer) {
        // Filter Mask immunity
        if (p.isPoisoned && p.heldItem !== 'filter_mask') {
          const currentL = p.level || 1;
          if (currentL > 1) {
            p.level = currentL - 1;
          } else {
            p.isExhausted = true;
          }
        }
        
        if (p.cooldownTurnsRemaining && p.cooldownTurnsRemaining > 0) {
          p.cooldownTurnsRemaining--;
        }

        if (p.frozenTurnsRemaining && p.frozenTurnsRemaining > 0) {
          p.frozenTurnsRemaining--;
        }
      }
    }
  }
  return { newBoard, poisonedCaptures };
}

export function processOilSlickTimers(board: BoardState, player: PlayerColor): BoardState {
    const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null })));
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (newBoard[r][c].oilSlickTurnsRemaining > 0) {
                newBoard[r][c].oilSlickTurnsRemaining--;
            }
        }
    }
    return newBoard;
}

export function applyOilSlide(board: BoardState, row: number, col: number, dr: number, dc: number): { r: number, c: number, crushed: Piece | null } {
    let currentR = row;
    let currentC = col;
    let totalCrushed: Piece | null = null;

    while (isValidSquare(currentR + dr, currentC + dc) && board[currentR][currentC].oilSlickTurnsRemaining > 0) {
        const nr = currentR + dr;
        const nc = currentC + dc;
        const targetSq = board[nr][nc];
        const movingObjPiece = board[currentR][currentC].piece;
        const movingObjItem = board[currentR][currentC].item;

        if (movingObjPiece) {
            if (movingObjPiece.heldItem === 'traction_cleats') break;

            if (!targetSq.piece && (!targetSq.item || targetSq.item.type === 'shroom')) {
                board[nr][nc].piece = { ...movingObjPiece };
                board[currentR][currentC].piece = null;
                currentR = nr;
                currentC = nc;
            } else {
                break;
            }
        } else if (movingObjItem?.type === 'anvil') {
            if (!targetSq.piece && (!targetSq.item || targetSq.item.type === 'shroom')) {
                board[nr][nc].item = { ...movingObjItem };
                board[currentR][currentC].item = null;
                currentR = nr;
                currentC = nc;
            } else if (targetSq.piece && targetSq.piece.type !== 'king' && !targetSq.piece.isShielded) {
                totalCrushed = { ...targetSq.piece };
                board[nr][nc].piece = null;
                board[nr][nc].item = { ...movingObjItem };
                board[currentR][currentC].item = null;
                currentR = nr;
                currentC = nc;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    return { r: currentR, c: currentC, crushed: totalCrushed };
}

export function triggerExhaustion(board: BoardState, r: number, c: number, color: PlayerColor) {
    const oppColor = color === 'white' ? 'black' : 'white';
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr; const nc = c + dc;
            if (isValidSquare(nr, nc)) {
                const victim = board[nr][nc].piece;
                if (victim && victim.color === oppColor) {
                    victim.cooldownTurnsRemaining = 2;
                }
            }
        }
    }
}
