import type { BoardState, Piece, PlayerColor, AlgebraicSquare, ConversionEvent, LevelChangeEvent, SquareState } from '@/types';
import { isValidSquare, coordsToAlgebraic, getEffectiveLevel, algebraicToCoords, getActiveSets } from './utils';
import { FRONTLINE_TYPES } from './constants';

export function handleRemovalReactions(board: BoardState, r: number, c: number, victim: Piece, attackerColor: PlayerColor, levelChanges: LevelChangeEvent[]): Piece[] {
  const signalHornEventList: Piece[] = [];
  const myColor = victim.color;

  // Signal Horn Reaction
  if (victim.heldItem === 'signal_horn') {
    const myType = victim.type;
    const sameTypeAllies: SquareState[] = [];
    board.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === myColor && sq.piece.type === myType && sq.piece.id !== victim.id) {
        sameTypeAllies.push(sq);
      }
    }));
    if (sameTypeAllies.length > 0) {
      const hornTarget = sameTypeAllies[Math.floor(Math.random() * sameTypeAllies.length)];
      const tp = hornTarget.piece!;
      const oldHL = tp.level;
      tp.level = Math.min(tp.type === 'queen' ? 7 : 99, (tp.level || 1) + 1);
      if (tp.level > oldHL) {
        levelChanges.push({ square: hornTarget.algebraic, delta: 1 });
        tp.isPoisoned = false; tp.isExhausted = false; tp.cooldownTurnsRemaining = 0;
      }
    }
  }

  // Soul Link Reaction
  if (victim.heldItem === 'soul_link') {
    board.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === myColor && sq.piece.heldItem === 'soul_link' && sq.piece.id !== victim.id) {
        triggerDefiantSparks(board, sq.rowIndex, sq.colIndex, myColor);
        signalHornEventList.push({ ...sq.piece, id: `${sq.piece.id}_linked_${Date.now()}` });
        sq.piece = null;
      }
    }));
  }

  // Defiant Spark Reaction
  triggerDefiantSparks(board, r, c, myColor);

  return signalHornEventList;
}

export function triggerDefiantSparks(board: BoardState, targetR: number, targetC: number, victimColor: PlayerColor) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = targetR + dr; 
      const nc = targetC + dc;
      if (isValidSquare(nr, nc)) {
        const ally = board[nr][nc].piece;
        if (ally && ally.color === victimColor && ally.heldItem === 'defiant_spark') {
          ally.isShielded = true;
          ally.heldItem = null;
        }
      }
    }
  }
}

export function triggerPushBack(board: BoardState, r: number, c: number, color: PlayerColor, actor: Piece): { crushed: Piece | null, obliterated: Piece[], levelChanges: LevelChangeEvent[] } {
  let mainCrushed: Piece | null = null;
  const obliterated: Piece[] = [];
  const levelChanges: LevelChangeEvent[] = [];
  
  const actorLevel = getEffectiveLevel(board, r, c);
  const currentSets = getActiveSets(board, color);
  const isWindSet = currentSets.includes('wind_set');
  const isFrontline = FRONTLINE_TYPES.includes(actor.type);
  const isRookPalace = actor.type === 'rook' || actor.type === 'palace';
  
  const canPushGeneral = (isFrontline && (actorLevel >= 4 || (actorLevel >= 2 && isWindSet))) || actor.heldItem === 'wind_cloak';
  const hasGripGloves = isFrontline && actor.heldItem === 'grip_gloves';
  const hasBatteringRam = isRookPalace && actor.heldItem === 'battering_ram';

  if (!canPushGeneral && !hasGripGloves && !hasBatteringRam) return { crushed: null, obliterated: [], levelChanges: [] };

  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    if(dr===0 && dc===0) continue;
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const victimSq = board[nr][nc];
      const isCardinal = (dr === 0 || dc === 0);

      if (isCardinal && hasBatteringRam && victimSq.item?.type === 'anvil') {
          const pushResult = performExtendedDisplacement(board, nr, nc, dr, dc, 3, true, color);
          obliterated.push(...pushResult.obliterated);
          levelChanges.push(...pushResult.levelChanges);
          continue;
      }

      const isAnvil = victimSq.item?.type === 'anvil';
      const isEnemy = victimSq.piece && victimSq.piece.color !== color;
      
      if (isAnvil && (canPushGeneral || hasGripGloves)) {
          const pushResult = performExtendedDisplacement(board, nr, nc, dr, dc, 1, false, color);
          obliterated.push(...pushResult.obliterated);
          levelChanges.push(...pushResult.levelChanges);
      } else if (isEnemy && canPushGeneral) {
        const victim = victimSq.piece!;
        if(victim.heldItem === 'passive_armor' || victim.heldItem === 'lead_boots') continue;
        
        const victimSets = getActiveSets(board, victim.color);
        if (victimSets.includes('heavy_guard') && FRONTLINE_TYPES.includes(victim.type)) continue;

        if (victim.heldItem === 'spiked_buckler' && actor.heldItem !== 'filter_mask') actor.isPoisoned = true;
        if (victim.heldItem === 'frayed_rope') {
            actor.isExhausted = true;
            actor.cooldownTurnsRemaining = 2;
        }

        const pushResult = performExtendedDisplacement(board, nr, nc, dr, dc, 1, false, color);
        if (pushResult.crushed) mainCrushed = pushResult.crushed;
        obliterated.push(...pushResult.obliterated);
        levelChanges.push(...pushResult.levelChanges);
      }
    }
  }
  return { crushed: mainCrushed, obliterated, levelChanges };
}

export function performExtendedDisplacement(board: BoardState, startR: number, startC: number, dr: number, dc: number, distance: number, obliterateInPath: boolean, actorColor: PlayerColor): { crushed: Piece | null, obliterated: Piece[], levelChanges: LevelChangeEvent[] } {
    let currentR = startR;
    let currentC = startC;
    const displacedItem = board[startR][startC].item;
    const displacedPiece = board[startR][startC].piece;
    
    board[startR][startC].item = null;
    board[startR][startC].piece = null;

    let mainCrushed: Piece | null = null;
    const obliterated: Piece[] = [];
    const levelChanges: LevelChangeEvent[] = [];

    for (let d = 1; d <= distance; d++) {
        const nextR = currentR + dr;
        const nextC = currentC + dc;

        if (!isValidSquare(nextR, nextC)) break;

        const targetSq = board[nextR][nextC];
        
        if (targetSq.item?.type === 'anvil' || targetSq.piece?.type === 'king') {
            break; 
        }

        if (targetSq.piece) {
            if (obliterateInPath || displacedItem?.type === 'anvil') {
                const victim = targetSq.piece;
                const extraOblits = handleRemovalReactions(board, nextR, nextC, victim, actorColor, levelChanges);
                obliterated.push({ ...victim }, ...extraOblits);
                targetSq.piece = null;
            } else {
                break;
            }
        }

        currentR = nextR;
        currentC = nextC;
    }

    board[currentR][currentC].item = displacedItem;
    board[currentR][currentC].piece = displacedPiece;

    const finalPiece = board[currentR][currentC].piece;
    if (finalPiece && finalPiece.heldItem === 'kinetic_coil' && (currentR !== startR || currentC !== startC)) {
        const oldL = finalPiece.level;
        finalPiece.level = Math.min(finalPiece.type === 'queen' ? 7 : 99, (finalPiece.level || 1) + 1);
        if (finalPiece.level > oldL) {
            levelChanges.push({ square: coordsToAlgebraic(currentR, currentC), delta: 1 });
            finalPiece.isPoisoned = false; finalPiece.isExhausted = false; finalPiece.cooldownTurnsRemaining = 0;
        }
    }

    if (board[currentR][currentC].oilSlickTurnsRemaining > 0) {
        const slideResult = applyOilSlide(board, currentR, currentC, dr, dc, actorColor);
        obliterated.push(...slideResult.obliterated);
        levelChanges.push(...slideResult.levelChanges);
    }

    return { crushed: mainCrushed, obliterated, levelChanges };
}

export function applyRally(board: BoardState, color: PlayerColor, target: 'pawn' | 'all', origin: AlgebraicSquare): { ralliedSquares: AlgebraicSquare[], levelChanges: LevelChangeEvent[] } {
  const rallied: AlgebraicSquare[] = [];
  const levelChanges: LevelChangeEvent[] = [];
  const { row: or, col: oc } = algebraicToCoords(origin);
  board.forEach(row => row.forEach(sq => {
    if(sq.piece && sq.piece.color === color) {
      if (sq.rowIndex === or && sq.colIndex === oc) return;
      if(target === 'all' || FRONTLINE_TYPES.includes(sq.piece.type)) {
        if(sq.piece.type !== 'queen' || sq.piece.level < 7) {
            const oldLevel = sq.piece.level;
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, sq.piece.level + 1);
            if (sq.piece.level > oldLevel) {
                sq.piece.isPoisoned = false;
                sq.piece.isExhausted = false;
                sq.piece.cooldownTurnsRemaining = 0;
                rallied.push(sq.algebraic);
                levelChanges.push({ square: sq.algebraic, delta: 1 });
            }
        }
      }
    }
  }));
  return { ralliedSquares: rallied, levelChanges };
}

export function applyKingDominion(board: BoardState, color: PlayerColor, gain: number): LevelChangeEvent[] {
  const opp = color === 'white' ? 'black' : 'white';
  const changes: LevelChangeEvent[] = [];
  board.forEach(row => row.forEach(sq => { 
    if(sq.piece && sq.piece.color === opp && sq.piece.type === 'queen') {
        const oldL = sq.piece.level;
        sq.piece.level = Math.max(1, sq.piece.level - gain);
        if (sq.piece.level < oldL) {
            changes.push({ square: sq.algebraic, delta: sq.piece.level - oldL });
        }
    }
  }));
  return changes;
}

export function triggerPull(board: BoardState, r: number, c: number, color: PlayerColor): LevelChangeEvent[] {
    const oppColor = color === 'white' ? 'black' : 'white';
    const changes: LevelChangeEvent[] = [];
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const targetR = r + (dr * 2); const targetC = c + (dc * 2);
        if (isValidSquare(targetR, targetC)) {
            const victimSq = board[targetR][targetC];
            if (victimSq.piece && victimSq.piece.color === oppColor) {
                const activeSets = getActiveSets(board, victimSq.piece.color);
                const isHeavyGuard = activeSets.includes('heavy_guard');
                const isFrontline = victimSq.piece && FRONTLINE_TYPES.includes(victimSq.piece.type);

                if (victimSq.piece.heldItem === 'lead_boots' || (isHeavyGuard && isFrontline)) continue;
                
                if (victimSq.piece.heldItem === 'kinetic_coil') {
                    const oldL = victimSq.piece.level;
                    victimSq.piece.level = Math.min(victimSq.piece.type === 'queen' ? 7 : 99, (victimSq.piece.level || 1) + 1);
                    if (victimSq.piece.level > oldL) {
                        changes.push({ square: coordsToAlgebraic(targetR, targetC), delta: 1 });
                    }
                    victimSq.piece.isPoisoned = false;
                    victimSq.piece.isExhausted = false;
                    victimSq.piece.cooldownTurnsRemaining = 0;
                }

                if (victimSq.piece.heldItem === 'frayed_rope') {
                    const attacker = board[r][c].piece;
                    if (attacker) {
                        attacker.isExhausted = true;
                        attacker.cooldownTurnsRemaining = 2;
                    }
                }

                const midR = r + dr, midC = c + dc;
                if (isValidSquare(midR, midC) && !board[midR][midC].piece && !board[midR][midC].item) { board[midR][midC].piece = victimSq.piece; victimSq.piece = null; }
            }
        }
    }
    return changes;
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

export function triggerToxicCloud(board: BoardState, r: number, c: number, color: PlayerColor) {
  const actingPiece = board[r][c].piece;
  if (!actingPiece) return;

  const actingSets = getActiveSets(board, color);
  const isActingPoisonZone = actingSets.includes('toxic_cloud');
  const oppColor = color === 'white' ? 'black' : 'white';

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (isValidSquare(nr, nc)) {
        const victim = board[nr][nc].piece;
        if (victim && victim.color === oppColor) {
          if (isActingPoisonZone && victim.heldItem !== 'filter_mask') {
            victim.isPoisoned = true;
          }
          const victimSets = getActiveSets(board, victim.color);
          if (victimSets.includes('toxic_cloud') && actingPiece.heldItem !== 'filter_mask') {
            actingPiece.isPoisoned = true;
          }
        }
      }
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
      if(v && v.color !== color && v.type !== 'king' && v.heldItem !== 'get_faith' && Math.random() < threshold) {
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

export function syncSoulLink(board: BoardState, color: PlayerColor): { levelChanges: LevelChangeEvent[] } {
    let maxLevel = 0;
    let hasSoulLink = false;
    const changes: LevelChangeEvent[] = [];
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
                    const oldSLVal = sq.piece.level;
                    sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, maxLevel);
                    if (sq.piece.level > oldSLVal) {
                        changes.push({ square: sq.algebraic, delta: sq.piece.level - oldSLVal });
                        sq.piece.isPoisoned = false;
                        sq.piece.isExhausted = false;
                        sq.piece.cooldownTurnsRemaining = 0;
                    }
                }
            }
        }));
    }
    return { levelChanges: changes };
}

export function applyReapersTithe(board: BoardState, color: PlayerColor, victim: Piece, levelChanges: LevelChangeEvent[]) {
  const extraLevels = (victim.level || 1) - 1;
  victim.level = 1; // Return to graveyard at level 1
  if (extraLevels <= 0) return;

  const titheItems = ['soul_harvest', 'leach_blade', 'grimoir'];
  const collectors: SquareState[] = [];
  board.forEach(row => row.forEach(sq => {
    if (sq.piece && sq.piece.color === color && titheItems.includes(sq.piece.heldItem || '')) {
      collectors.push(sq);
    }
  }));

  if (collectors.length === 0) return;

  for (let i = 0; i < extraLevels; i++) {
    const target = collectors[Math.floor(Math.random() * collectors.length)];
    const p = target.piece!;
    if (p.type !== 'queen' || p.level < 7) {
      p.level++;
      levelChanges.push({ square: target.algebraic, delta: 1 });
      p.isPoisoned = false; p.isExhausted = false; p.cooldownTurnsRemaining = 0;
    }
  }
}

export function processPoisonDamage(board: BoardState, currentPlayer: PlayerColor): { newBoard: BoardState, poisonedCaptures: Piece[], levelChanges: LevelChangeEvent[] } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null, oilSlickTurnsRemaining: sq.oilSlickTurnsRemaining, phasedTurnsRemaining: sq.phasedTurnsRemaining })));
  const poisonedCaptures: Piece[] = [];
  const levelChanges: LevelChangeEvent[] = [];

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
        // Demonic Possession Countdown
        if (p.obliterationTurnsRemaining && p.obliterationTurnsRemaining > 0) {
          p.obliterationTurnsRemaining--;
          if (p.obliterationTurnsRemaining === 0) {
            poisonedCaptures.push({ ...p });
            sq.piece = null;
            continue; // Piece is obliterated, skip other logic
          }
        }

        if (p.heldItem === 'training_weights' || p.heldItem === 'sclerotia') {
            p.itemTurnCount = (p.itemTurnCount || 0) + 1;
            if (p.itemTurnCount % 5 === 0) {
                if (p.heldItem === 'training_weights') {
                    if (p.type !== 'queen' || p.level < 7) {
                        p.level = (p.level || 1) + 1;
                        levelChanges.push({ square: sq.algebraic, delta: 1 });
                        p.isPoisoned = false;
                        p.isExhausted = false;
                        p.cooldownTurnsRemaining = 0;
                    }
                } else if (p.heldItem === 'sclerotia' && p.type === 'myco_mage') {
                    p.shroomMana = (p.shroomMana || 0) + 1;
                }
            }
        }

        if (p.isPoisoned && p.heldItem !== 'filter_mask') {
          const currentL = p.level || 1;
          if (currentL > 1) {
            p.level = currentL - 1;
            levelChanges.push({ square: sq.algebraic, delta: -1 });
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
  return { newBoard, poisonedCaptures, levelChanges };
}

export function processOilSlickTimers(board: BoardState, player: PlayerColor): BoardState {
    const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null, oilSlickTurnsRemaining: sq.oilSlickTurnsRemaining, phasedTurnsRemaining: sq.phasedTurnsRemaining })));
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (newBoard[r][c].oilSlickTurnsRemaining > 0) {
                newBoard[r][c].oilSlickTurnsRemaining--;
            }
        }
    }
    return newBoard;
}

export function applyOilSlide(board: BoardState, row: number, col: number, dr: number, dc: number, actorColor: PlayerColor): { r: number, c: number, obliterated: Piece[], levelChanges: LevelChangeEvent[] } {
    let currentR = row;
    let currentC = col;
    const obliterated: Piece[] = [];
    const levelChanges: LevelChangeEvent[] = [];

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
                if (movingObjPiece.heldItem === 'kinetic_coil') {
                    const oldL = movingObjPiece.level;
                    movingObjPiece.level = Math.min(movingObjPiece.type === 'queen' ? 7 : 99, (movingObjPiece.level || 1) + 1);
                    if (movingObjPiece.level > oldL) {
                        levelChanges.push({ square: coordsToAlgebraic(currentR, currentC), delta: 1 });
                        movingObjPiece.isPoisoned = false; movingObjPiece.isExhausted = false; movingObjPiece.cooldownTurnsRemaining = 0;
                    }
                }
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
                const victim = targetSq.piece;
                const extraOblits = handleRemovalReactions(board, nr, nc, victim, actorColor, levelChanges);
                obliterated.push({ ...victim }, ...extraOblits);
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
    return { r: currentR, c: currentC, obliterated, levelChanges };
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
                    victim.isExhausted = true;
                    victim.cooldownTurnsRemaining = 2;
                }
            }
        }
    }
}
