import type { BoardState, Piece, PlayerColor, AlgebraicSquare, Move, ApplyMoveResult, InventoryItemType, PieceType, ItemType, SquareState, RookResurrectionResult } from '@/types';
import { VAL_MAP, FRONTLINE_TYPES } from './constants';
import { algebraicToCoords, coordsToAlgebraic, isValidSquare, getEffectiveLevel, isSilenced, getPromotionLevel, findKing, isItemValidForPiece, getActiveSets } from './utils';
import { triggerPushBack, triggerConversion, applyRally, applyKingDominion, syncSoulLink, triggerPoisonSplash, triggerMushroomMagnet, triggerPull, triggerExhaustion, applyOilSlide } from './effects';

export function createEmptyBoard(): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, item: null, algebraic, rowIndex: r, colIndex: c, oilSlickTurnsRemaining: 0, phasedPiece: null, phasedTurnsRemaining: 0 });
    }
    board.push(row);
  }
  return board;
}

export function initializeBoard(
  whiteElo: number = 1200, 
  blackElo: number = 1200, 
  whiteUnlocks: string[] = [],
  blackUnlocks: string[] = [],
  whiteEquipment: Record<string, string> = {},
  blackEquipment: Record<string, string> = {}
): BoardState {
  const board = createEmptyBoard();

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

  const wBPos = [2, 5].sort(() => Math.random() - 0.5);
  const wNPos = [1, 6].sort(() => Math.random() - 0.5);
  const wRPos = [0, 7].sort(() => Math.random() - 0.5);

  board[7][wBPos[0]].piece = whiteBishops[0];
  board[7][wBPos[1]].piece = whiteBishops[1];
  board[7][wNPos[0]].piece = whiteKnights[0];
  board[7][wNPos[1]].piece = whiteKnights[1];
  board[7][wRPos[0]].piece = whiteRooks[0];
  board[7][wRPos[1]].piece = whiteRooks[1];
  board[7][3].piece = { id: 'wQ', type: 'queen', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  board[7][4].piece = { id: 'wK', type: 'king', color: 'white', level: 1, hasMoved: false, isShielded: false, heldItem: null };

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

  const bBPos = [2, 5].sort(() => Math.random() - 0.5);
  const bNPos = [1, 6].sort(() => Math.random() - 0.5);
  const bRPos = [0, 7].sort(() => Math.random() - 0.5);

  board[0][bBPos[0]].piece = blackBishops[0];
  board[0][bBPos[1]].piece = blackBishops[1];
  board[0][bNPos[0]].piece = blackKnights[0];
  board[0][bNPos[1]].piece = blackKnights[1];
  board[0][bRPos[0]].piece = blackRooks[0];
  board[0][bRPos[1]].piece = blackRooks[1];
  board[0][3].piece = { id: 'bQ', type: 'queen', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null };
  board[0][4].piece = { id: 'bK', type: 'king', color: 'black', level: 1, hasMoved: false, isShielded: false, heldItem: null };

  const assignFrontlineTypes = (color: PlayerColor, unlocks: string[]) => {
    const prefix = color === 'white' ? 'w' : 'b';
    const army: Piece[] = [];
    for (let i = 0; i < 8; i++) {
        army.push({ id: `${prefix}P${i}`, type: 'pawn', color, level: 1, hasMoved: false, isShielded: false, heldItem: null, shroomMana: 0 });
    }
    
    const specialPool = unlocks.filter(u => ['dancer', 'mimic', 'grappler', 'myco_mage'].includes(u));
    specialPool.forEach((type, idx) => {
        if (army[idx]) army[idx].type = type as PieceType;
    });
    return army;
  };

  const whiteArmy = assignFrontlineTypes('white', whiteUnlocks);
  const blackArmy = assignFrontlineTypes('black', blackUnlocks);

  const whitePositions = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
  const blackPositions = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);

  for (let i = 0; i < 8; i++) {
    board[6][whitePositions[i]].piece = whiteArmy[i];
    board[1][blackPositions[i]].piece = blackArmy[i];
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c].piece;
      if (p) {
        const gear = p.color === 'white' ? whiteEquipment : blackEquipment;
        if (gear && gear[p.id]) {
          p.heldItem = gear[p.id] as InventoryItemType;
        }
      }
    }
  }

  return board;
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

export function processRookResurrectionCheck(
  board: BoardState,
  player: PlayerColor,
  move: Move,
  toAlg: AlgebraicSquare,
  originalLevel: number,
  graveyard: { white: Piece[], black: Piece[] },
  idCounter: number
): RookResurrectionResult {
  const { row, col } = algebraicToCoords(toAlg);
  const piece = board[row][col].piece;
  if (!piece || (piece.type !== 'rook' && piece.type !== 'palace')) {
    return { resurrectionPerformed: false, boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard };
  }

  const effectiveLevel = getEffectiveLevel(board, row, col);
  if (effectiveLevel < 4) {
    return { resurrectionPerformed: false, boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard };
  }

  const myGraveyard = player === 'white' ? graveyard.white : graveyard.black;
  if (myGraveyard.length === 0) {
    return { resurrectionPerformed: false, boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard };
  }

  const sorted = [...myGraveyard].sort((a, b) => (VAL_MAP[b.type] || 0) - (VAL_MAP[a.type] || 0));
  const best = sorted[0];

  const adjacent: AlgebraicSquare[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (isValidSquare(nr, nc)) {
        const sq = board[nr][nc];
        if (!sq.piece && (!sq.item || sq.item.type === 'shroom')) {
          adjacent.push(coordsToAlgebraic(nr, nc));
        }
      }
    }
  }

  if (adjacent.length === 0) {
    return { resurrectionPerformed: false, boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard };
  }

  const targetAlg = adjacent[Math.floor(Math.random() * adjacent.length)];
  const { row: tr, col: tc } = algebraicToCoords(targetAlg);

  const newBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));
  
  let resLevel = 1;
  if (piece.type === 'palace') resLevel = (best.level || 1);
  else if (best.heldItem === 'soul_spark') resLevel = 2;

  const resPiece: Piece = {
    ...best,
    id: `res_${best.id}_${idCounter}`,
    level: resLevel,
    hasMoved: true,
    isShielded: false,
    isPoisoned: false,
    cooldownTurnsRemaining: 0,
    frozenTurnsRemaining: 0
  };

  newBoard[tr][tc].piece = resPiece;
  newBoard[tr][tc].item = null;

  const newGraveyard = {
    white: player === 'white' ? graveyard.white.filter(p => p.id !== best.id) : [...graveyard.white],
    black: player === 'black' ? graveyard.black.filter(p => p.id !== best.id) : [...graveyard.black]
  };

  const oppBackRank = player === 'white' ? 0 : 7;
  const promoRequired = (FRONTLINE_TYPES.includes(resPiece.type)) && tr === oppBackRank;

  return {
    resurrectionPerformed: true,
    boardWithResurrection: newBoard,
    capturedPiecesAfterResurrection: newGraveyard,
    resurrectedSquareAlg: targetAlg,
    resurrectedPieceData: resPiece,
    newResurrectionIdCounter: idCounter + 1,
    promotionRequiredForResurrectedPawn: promoRequired
  };
}

export function applyMove(board: BoardState, move: Move, enPassantTargetSquare: AlgebraicSquare | null, graveyard?: { white: Piece[], black: Piece[] }, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null, didOpponentCaptureLastTurn?: boolean): ApplyMoveResult {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null })));
  
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  
  const targetSq = newBoard[toRow]?.[toCol];
  const targetPiece = targetSq?.piece || null;
  const targetItem = targetSq?.item || null;
  let captured: Piece | null = null;

  let enPassantTargetSet: AlgebraicSquare | null = null;
  const selfDestructCaptures: Piece[] = [];
  const conversionEvents: ConversionEvent[] = [];
  let rallyCryTriggered = null;
  let selfCheckByPushBack = false;
  let pieceCapturedByAnvil: Piece | null = null;
  let anvilPushedOffBoard = false;
  let promotedToInfiltrator = false;
  let promotedToHero = false;
  let infiltrationWin = false;
  let shroomConsumed = false;
  let extraTurn = false;
  let specialCaptureSquare: AlgebraicSquare | null = null;
  let destroyedAnvils = 0;
  let phoenixResurrection = undefined;
  let reflectionOccurred = false;
  let resurrectionScrollEvent = undefined;
  let itemReturned: InventoryItemType | null = null;
  const multiPromotions: { square: AlgebraicSquare, targetLevel: number }[] = [];
  let ralliedSquares: AlgebraicSquare[] = [];
  let winByKingsConquest = false;
  let hydraSplitOccurred = false;

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare };

  const triggerDefiantSparks = (targetR: number, targetC: number, victimColor: PlayerColor) => {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = targetR + dr; const nc = targetC + dc;
            if (isValidSquare(nr, nc)) {
                const ally = newBoard[nr][nc].piece;
                if (ally && ally.color === victimColor && ally.heldItem === 'defiant_spark') {
                    ally.isShielded = true;
                    ally.heldItem = null;
                    const rosaryArchbishop = newBoard.flat().find(sq => sq.piece && sq.piece.color === victimColor && sq.piece.heldItem === 'rosary');
                    if (rosaryArchbishop) {
                        ally.level = Math.min(ally.type === 'queen' ? 7 : 99, (ally.level || 1) + 1);
                    }
                }
            }
        }
    }
  };

  let effectiveHeldItem = movingPiece.heldItem;
  if (movingPiece.type === 'mimic') {
    if (movingPiece.heldItem === 'mirror_mask' || (movingPiece.heldItem === 'mimic_blade' && lastMovedPieceHeldItem)) {
      effectiveHeldItem = lastMovedPieceHeldItem || null;
    }
  }

  if (targetItem?.type === 'anvil' && movingPiece.heldItem === 'crowbar') {
      newBoard[toRow][toCol].item = null;
      movingPiece.heldItem = null;
  }

  if (move.type === 'lose-thy-faith') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === oppColor) sq.piece.isShielded = false;
      }));
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'burning-ray') {
      let totalGain = 0;
      const dr = Math.sign(toRow - fromRow);
      const dc = Math.sign(toCol - fromCol);
      for (let i = 1; i <= 4; i++) {
          const nr = fromRow + i * dr;
          const nc = fromCol + i * dc;
          if (!isValidSquare(nr, nc)) break;
          const tSq = newBoard[nr][nc];
          if (tSq.piece) {
              totalGain += (VAL_MAP[tSq.piece.type] || 1);
              triggerDefiantSparks(nr, nc, tSq.piece.color);
              selfDestructCaptures.push({ ...tSq.piece, id: `${tSq.piece.id}_burn_${Date.now()}` });
              tSq.piece = null;
          }
          if (tSq.item?.type === 'anvil') tSq.item = null;
      }
      movingPiece.level += totalGain;
      if (movingPiece.type === 'queen') movingPiece.level = Math.min(7, movingPiece.level);
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'glacial-ray') {
      const dr = Math.sign(toRow - fromRow);
      const dc = Math.sign(toCol - fromCol);
      for (let i = 1; i <= 4; i++) {
          const nr = fromRow + i * dr;
          const nc = fromCol + i * dc;
          if (!isValidSquare(nr, nc)) break;
          const tSq = newBoard[nr][nc];
          if (tSq.piece) {
              if (tSq.piece.heldItem === 'antifreeze') {
                  tSq.piece.heldItem = null;
              } else if (tSq.piece.heldItem !== 'thermal_socks') {
                  tSq.piece.frozenTurnsRemaining = 2;
              }
          }
      }
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'phase-out') {
      const { row: tr, col: tc } = algebraicToCoords(move.from);
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              const nr = tr + dr; const nc = tc + dc;
              if (isValidSquare(nr, nc)) {
                  const sq = newBoard[nr][nc];
                  if (sq.piece && sq.piece.type !== 'king') {
                      sq.phasedPiece = { ...sq.piece };
                      if (nr === tr && nc === tc) sq.phasedPiece.heldItem = null;
                      sq.piece = null;
                      sq.phasedTurnsRemaining = 4;
                  }
              }
          }
      }
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'oil-slick') {
      const { row: tr, col: tc } = algebraicToCoords(move.to);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (isValidSquare(tr + dr, tc + dc)) {
              newBoard[tr + dr][tc + dc].oilSlickTurnsRemaining = 3;
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'trap-net') {
      triggerExhaustion(newBoard, fromRow, fromCol, movingPiece.color);
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'demonic-possession') {
      movingPiece.level = Math.min(movingPiece.type === 'queen' ? 7 : 99, (movingPiece.level || 1) + 5);
      movingPiece.obliterationTurnsRemaining = 4;
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'heavy-rain') {
      const empty = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) empty.push({r,c});
      const shuffled = empty.sort(() => Math.random() - 0.5).slice(0, 3);
      shuffled.forEach(pos => { newBoard[pos.r][pos.c].item = { type: 'anvil' }; });
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'myco-propagate') {
      const empty = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) empty.push({r,c});
      const shuffled = empty.sort(() => Math.random() - 0.5).slice(0, 5);
      shuffled.forEach(pos => { newBoard[pos.r][pos.c].item = { type: 'shroom' }; });
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 1); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'tele-portobello') {
      const targetAlly = newBoard.flat().find(sq => sq.piece?.id === move.teleportPieceId)?.piece;
      if (targetAlly) {
        const allyCoords = newBoard.flat().find(sq => sq.piece?.id === move.teleportPieceId);
        if (allyCoords) newBoard[allyCoords.rowIndex][allyCoords.colIndex].piece = null;
        newBoard[toRow][toCol].piece = { ...targetAlly, hasMoved: true };
        newBoard[toRow][toCol].item = null;
      }
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 2); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: true, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'spore-bomb') {
      newBoard[toRow][toCol].item = null;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = toRow + dr; const nc = toCol + dc;
          if (isValidSquare(nr, nc)) {
              const victim = newBoard[nr][nc];
              if (victim.piece && victim.piece.color !== movingPiece.color && victim.piece.type !== 'king' && !victim.piece.isShielded) {
                  triggerDefiantSparks(nr, nc, victim.piece.color);
                  selfDestructCaptures.push({ ...victim.piece, id: `spore_${victim.piece.id}_${Date.now()}` });
                  victim.piece = null;
              }
          }
      }
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 4); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'raise-mycelimen') {
      const oppBackRank = movingPiece.color === 'white' ? 0 : 7;
      newBoard.forEach((row, rIdx) => row.forEach((sq, cIdx) => {
          if (sq.item?.type === 'shroom') {
              sq.item = null;
              sq.piece = { id: `myceliman_${sq.algebraic}_${Date.now()}_${rIdx}_${cIdx}`, type: 'pawn', color: movingPiece.color, level: 1, hasMoved: true, isShielded: false };
              if (sq.rowIndex === oppBackRank) {
                multiPromotions.push({ square: sq.algebraic, targetLevel: 1 });
              }
          }
      }));
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 6); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, multiPromotions };
  }

  if (move.type === 'grapple-hook-swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      if (p1?.heldItem === 'relay_ribbon') p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
      if (p2?.heldItem === 'relay_ribbon') p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'ram-push') {
      const dr = Math.sign(toRow - fromRow); const dc = Math.sign(toCol - fromCol);
      const anvilRow = fromRow + dr; const anvilCol = fromCol + dc;
      const anvilItem = newBoard[anvilRow][anvilCol].item;
      newBoard[anvilRow][anvilCol].item = null;
      let stepR = anvilRow + dr; let stepC = anvilCol + dc;
      while (isValidSquare(stepR, stepC)) {
          const victimSq = newBoard[stepR][stepC];
          if (victimSq.piece && victimSq.piece.color !== movingPiece.color && victimSq.piece.type !== 'king' && !victimSq.piece.isShielded) {
              pieceCapturedByAnvil = { ...victimSq.piece };
              triggerDefiantSparks(stepR, stepC, pieceCapturedByAnvil.color);
              victimSq.piece = null;
          }
          if (stepR === toRow && stepC === toCol) break;
          stepR += dr; stepC += dc;
      }
      const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
      if (slideResult.crushed) {
          pieceCapturedByAnvil = slideResult.crushed;
          triggerDefiantSparks(slideResult.r, slideResult.c, pieceCapturedByAnvil.color);
      }
      newBoard[slideResult.r][slideResult.c].item = anvilItem;
      newBoard[fromRow][fromCol].piece = null;
      newBoard[anvilRow][anvilCol].piece = { ...movingPiece, hasMoved: true };
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'grapple-throw') {
      if (move.grappledFrom) {
          const { row: gr, col: gc } = Array.isArray(move.grappledFrom) ? { row: move.grappledFrom[0], col: move.grappledFrom[1] } : algebraicToCoords(move.grappledFrom as AlgebraicSquare);
          newBoard[gr][gc].piece = null;
          newBoard[gr][gc].item = null;
      }
      if (move.thrownItem === 'anvil') {
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true };
          const dr = Math.sign(toRow - fromRow);
          const dc = Math.sign(toCol - fromCol);
          const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
          const victim = newBoard[slideResult.r][slideResult.c].piece;
          if (victim && victim.type !== 'king' && !victim.isShielded) {
              pieceCapturedByAnvil = { ...victim };
              triggerDefiantSparks(slideResult.r, slideResult.c, pieceCapturedByAnvil.color);
              newBoard[slideResult.r][slideResult.c].piece = null;
          }
          newBoard[slideResult.r][slideResult.c].item = { type: 'anvil' };
      } else if (move.thrownPiece) {
          const thrown = move.thrownPiece!;
          const dr = Math.sign(toRow - fromRow);
          const dc = Math.sign(toCol - fromCol);
          const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
          newBoard[slideResult.r][slideResult.c].piece = { ...thrown, hasMoved: true };
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true }; 
          if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.type !== 'king') {
            captured = { ...targetPiece };
            triggerDefiantSparks(toRow, toCol, captured.color);
          }
      }
      return { newBoard, capturedPiece: captured, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: 'grappler', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (movingPiece.id?.startsWith('boss-colossus')) {
      const parts = [{ id: 'boss-colossus-tl', dr: 0, dc: 0 },{ id: 'boss-colossus-tr', dr: 0, dc: 1 },{ id: 'boss-colossus-bl', dr: 1, dc: 0 },{ id: 'boss-colossus-br', dr: 1, dc: 1 }];
      const opponentColor = movingPiece.color === 'white' ? 'black' : 'white';
      let curTL_R = -1, curTL_C = -1;
      for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(newBoard[r][c].piece?.id === 'boss-colossus-tl') { curTL_R = r; curTL_C = c; break; }
      parts.forEach(p => { if (isValidSquare(curTL_R + p.dr, curTL_C + p.dc)) newBoard[curTL_R + p.dr][curTL_C + p.dc].piece = null; });
      parts.forEach(p => {
          const nr = toRow + p.dr; const nc = toCol + (p.dc || 0);
          if (isValidSquare(nr, nc)) {
              const victim = newBoard[nr][nc].piece;
              if (victim && victim.color === opponentColor) {
                  triggerDefiantSparks(nr, nc, victim.color);
                  selfDestructCaptures.push({ ...victim, id: `${victim.id}_colossus_crush_${Date.now()}` });
                  newBoard[nr][nc].piece = null;
              }
              newBoard[nr][nc].piece = { id: p.id, type: 'king', color: movingPiece.color, level: movingPiece.level, hasMoved: true };
          }
      });
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: 'king', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'dance-swap') {
    const p1 = newBoard[fromRow][fromCol].piece!;
    const tSq = newBoard[toRow][toCol];
    const p2 = tSq.piece;
    const it2 = tSq.item;
    if (p1.heldItem === 'war_drum' && p2) {
        if (p2.color === p1.color) { if (p2.type !== 'queen' || p2.level < 7) p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1); }
        else { p2.cooldownTurnsRemaining = 2; }
    }
    if (p1?.heldItem === 'relay_ribbon') p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
    if (p2?.heldItem === 'relay_ribbon') p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
    newBoard[toRow][toCol].piece = { ...p1, hasMoved: true };
    newBoard[toRow][toCol].item = null;
    newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
    newBoard[fromRow][fromCol].item = it2;
    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: 'dancer', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  const originalPieceLevel = Number(movingPiece.level || 1);
  const originalPieceType = movingPiece.type;
  const originalEffectiveLevelBeforeMove = getEffectiveLevel(board, fromRow, fromCol);

  if (move.type === 'ice-blast') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.color === oppColor) {
              if (victim.heldItem === 'antifreeze') {
                  victim.heldItem = null;
              } else if (victim.heldItem !== 'thermal_socks') {
                  victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2;
              }
          }
        }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'soul-harvest') {
      let totalLevelsGained = 0;
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.level > 1) { totalLevelsGained += (victim.level - 1); victim.level = 1; }
        }
      }
      const consumer = newBoard[fromRow][fromCol].piece!;
      const oldL = consumer.level || 1;
      if (consumer.type === 'queen') consumer.level = Math.min(7, oldL + totalLevelsGained);
      else consumer.level = oldL + totalLevelsGained;
      consumer.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'kings-decree') {
    const { row: pr, col: pc } = algebraicToCoords(move.to);
    if (newBoard[pr][pc].piece && newBoard[pr][pc].piece!.type === 'pawn' && newBoard[pr][pc].piece!.level === 1) {
      newBoard[pr][pc].piece!.type = 'commander';
    }
    newBoard[fromRow][fromCol].piece!.heldItem = null;
    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'resurrection-scroll') {
      if (graveyard) {
          const myGraveyard = movingPiece.color;
          if (graveyard[myGraveyard].length > 0) {
              const best = [...graveyard[myGraveyard]].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
              const adjacent = [];
              for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                  if (dr===0 && dc===0) continue;
                  const nr=fromRow+dr; const nc=fromCol+dc;
                  if(isValidSquare(nr,nc) && !newBoard[nr][nr].piece && !newBoard[nr][nc].item) adjacent.push(coordsToAlgebraic(nr,nc));
              }
              if (adjacent.length > 0) {
                  const target = adjacent[Math.floor(Math.random()*adjacent.length)];
                  const {row: rr, col: rc} = algebraicToCoords(target);
                  let resLevel = 1;
                  if (best.heldItem === 'soul_spark') resLevel = 2;
                  const resPiece = { ...best, id: `res_scroll_${best.id}_${Date.now()}`, level: resLevel, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                  newBoard[rr][rc].piece = resPiece;
                  resurrectionScrollEvent = { piece: best, square: target };
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, resurrectionScrollEvent };
  }

  if (move.type === 'faith-scroll') {
      const converterColor = movingPiece.color;
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
          if (dr===0 && dc===0) continue;
          const nr=fromRow+dr; const nc=fromCol+dc;
          if(isValidSquare(nr,nc)) {
              const victim = newBoard[nr][nc].piece;
              if (victim && victim.color !== converterColor && victim.type !== 'king') {
                  if (Math.random() < 0.5) {
                    const orig = {...victim};
                    victim.color = converterColor;
                    victim.id = `conv_${victim.id}_${Date.now()}`;
                    conversionEvents.push({ originalPiece: orig, convertedPiece: {...victim}, byPiece: {...movingPiece}, at: coordsToAlgebraic(nr, nc) });
                  }
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'ice-scroll') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.color === oppColor) {
              if (victim.heldItem === 'antifreeze') {
                  victim.heldItem = null;
              } else if (victim.heldItem !== 'thermal_socks') {
                  victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2;
              }
          }
        }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'swap-scroll') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      if (p1?.heldItem === 'relay_ribbon') p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
      if (p2?.heldItem === 'relay_ribbon') p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      if (newBoard[toRow][toCol].piece) newBoard[toRow][toCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      if (p1?.heldItem === 'relay_ribbon') p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
      if (p2?.heldItem === 'relay_ribbon') p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
      newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
      newBoard[toRow][toCol].piece = p1 ? { ...p1, hasMoved: true, isShielded: false } : null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.heldItem === 'mirror_shield' && movingPiece.type !== 'king' && movingPiece.type !== 'queen') {
      const reflectedAttacker = { ...movingPiece };
      newBoard[fromRow][fromCol].piece = null; 
      newBoard[toRow][toCol].piece!.heldItem = null; 
      const defender = newBoard[toRow][toCol].piece!;
      let g = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[reflectedAttacker.type] || 0;
      defender.level = Math.min(defender.type === 'queen' ? 7 : 99, (defender.level || 1) + g);
      return { newBoard, capturedPiece: reflectedAttacker, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, reflectionOccurred: true };
  }

  if (move.type === 'life-leach') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === oppColor) sq.piece.level = Math.max(1, (sq.piece.level || 1) - 1); }));
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'wind-scroll') {
      const crush = triggerPushBack(newBoard, toRow, toCol, movingPiece.color);
      if (crush) pieceCapturedByAnvil = crush;
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: crush, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'earthquake-scroll') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = toRow + dr; const nc = toCol + dc;
          if (isValidSquare(nr, nc)) {
              const p = newBoard[nr][nc].piece;
              if (p && p.color === oppColor) {
                  p.level = Math.max(1, (p.level || 1) - 2);
              }
          }
      }
      const crush = triggerPushBack(newBoard, toRow, toCol, movingPiece.color);
      if (crush) pieceCapturedByAnvil = crush;
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: crush, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'summon-anvil') {
      newBoard[toRow][toCol].item = { type: 'anvil' };
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'shield-scroll') {
      const { row: tr, col: tc } = algebraicToCoords(move.to);
      if (newBoard[tr][tc].piece) {
          const ally = newBoard[tr][tc].piece!;
          ally.isShielded = true;
          const rosaryArchbishop = newBoard.flat().find(sq => sq.piece && sq.piece.color === movingPiece.color && sq.piece.heldItem === 'rosary');
          if (rosaryArchbishop) {
              ally.level = Math.min(ally.type === 'queen' ? 7 : 99, (ally.level || 1) + 1);
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'rally-scroll') {
      ralliedSquares = applyRally(newBoard, movingPiece.color, 'all', move.from);
      newBoard[fromRow][fromCol].piece!.level = 1; 
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null, ralliedSquares };
  }

  if (move.type === 'antidote') {
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color) { sq.piece.isPoisoned = false; sq.piece.isExhausted = false; sq.piece.cooldownTurnsRemaining = 0; } }));
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'self-destruct') {
      const sdColor = movingPiece.color;
      newBoard[fromRow][fromCol].piece = null;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = fromRow + dr; const nc = fromCol + dc;
          if (isValidSquare(nr, nc)) {
              const victim = newBoard[nr][nc];
              if (victim.item?.type === 'anvil') { victim.item = null; destroyedAnvils++; }
              if (victim.piece && victim.piece.color !== sdColor && victim.piece.type !== 'king') {
                  if (victim.piece.heldItem === 'blast_shield') continue;
                  triggerDefiantSparks(nr, nc, victim.piece.color);
                  selfDestructCaptures.push({ ...victim.piece, id: `${victim.piece.id}_sd_${Date.now()}` });
                  victim.piece = null;
              }
          }
      }
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if(move.type === 'enpassant') {
    const cpR = fromRow; const cpC = toCol;
    captured = newBoard[cpR][cpC].piece;
    if (captured && FRONTLINE_TYPES.includes(captured.type)) {
        triggerDefiantSparks(cpR, cpC, captured.color);
        newBoard[cpR][cpC].piece = null;
        specialCaptureSquare = coordsToAlgebraic(cpR, cpC);
    } else { captured = null; }
  } else if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.type !== 'king') { 
      captured = { ...targetPiece }; 
      triggerDefiantSparks(toRow, toCol, captured.color);
  }

  const pieceToLand = { ...movingPiece, isShielded: false, hasMoved: true };
  if (pieceToLand.type === 'mimic' && pieceToLand.heldItem === 'mirror_mask' && lastMovedPieceHeldItem) {
      pieceToLand.heldItem = lastMovedPieceHeldItem;
  }

  const backRankIdx = pieceToLand.color === 'white' ? 0 : 7;
  const activeSetsAtBackRank = getActiveSets(newBoard, pieceToLand.color);
  const isAssassinAtBackRank = activeSetsAtBackRank.includes('assassin') && FRONTLINE_TYPES.includes(pieceToLand.type) && pieceToLand.level >= 5;

  if (pieceToLand.type === 'commander' && toRow === backRankIdx && move.type !== 'self-destruct') {
    pieceToLand.type = 'hero'; pieceToLand.id = `${pieceToLand.id}_hero_auto_${Date.now()}`;
    if (originalEffectiveLevelBeforeMove >= 5) extraTurn = true;
    promotedToHero = true;
  } else if (FRONTLINE_TYPES.includes(pieceToLand.type) && toRow === backRankIdx && move.type !== 'self-destruct' && !promotedToInfiltrator && !isAssassinAtBackRank) {
    if (originalEffectiveLevelBeforeMove >= 5) extraTurn = true;
  }

  if (promotedToInfiltrator) pieceToLand.type = 'infiltrator';
  if (pieceToLand.heldItem && !isItemValidForPiece(pieceToLand.heldItem, pieceToLand.type)) { 
      if (!itemReturned) itemReturned = pieceToLand.heldItem; 
      pieceToLand.heldItem = null; 
  }
  
  newBoard[toRow][toCol].piece = pieceToLand;
  if (fromRow !== toRow || fromCol !== toCol) {
    newBoard[fromRow][fromCol].piece = null;
  }

  const dr_slide = Math.sign(toRow - fromRow);
  const dc_slide = Math.sign(toCol - fromCol);
  if ((dr_slide !== 0 || dc_slide !== 0) && newBoard[toRow][toCol].oilSlickTurnsRemaining > 0) {
      applyOilSlide(newBoard, toRow, toCol, dr_slide, dc_slide);
  }

  if (FRONTLINE_TYPES.includes(pieceToLand.type) && Math.abs(fromRow - toRow) === 2) enPassantTargetSet = coordsToAlgebraic(fromRow + Math.sign(toRow - fromRow), fromCol);
  
  let didLevelUp = false;
  let levelGain = 0;
  if (targetItem?.type === 'shroom') {
    shroomConsumed = true; newBoard[toRow][toCol].item = null;
    const oldL = pieceToLand.level || 1;
    if (pieceToLand.type === 'queen') { if (oldL < 7) { pieceToLand.level = Math.min(7, oldL + 1); didLevelUp = true; levelGain = pieceToLand.level - oldL; } }
    else { pieceToLand.level = oldL + 1; didLevelUp = true; levelGain = 1; }
    newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = (sq.piece.shroomMana || 0) + 1; }));
  }

  if (pieceToLand.heldItem === 'spore_pouch' && (fromRow !== toRow || fromCol !== toCol)) {
      if (Math.random() < 0.25 && !newBoard[fromRow][fromCol].piece && !newBoard[fromRow][fromCol].item) {
          newBoard[fromRow][fromCol].item = { type: 'shroom' };
      }
  }

  if (pieceToLand.type === 'king' && move.type === 'castle') {
    const rC = toCol > fromCol ? 7 : 0; const tC = toCol > fromCol ? 5 : 3;
    const rookSq = newBoard[fromRow][rC];
    if (rookSq.piece) {
        if (rookSq.piece.type === 'palace') { pieceToLand.level++; didLevelUp = true; levelGain = 1; }
        newBoard[fromRow][tC].piece = { ...rookSq.piece, hasMoved: true, isShielded: false };
        rookSq.piece = null;
    }
  }

  if (captured) {
    const activeSets = getActiveSets(newBoard, pieceToLand.color);
    if (activeSets.includes('reapers_tithe')) {
        const extraLevels = (captured.level || 1) - 1;
        captured.level = 1;
        if (extraLevels > 0) {
            const setUnits: {p: Piece, r: number, c: number}[] = [];
            const setItems = ITEM_SETS['reapers_tithe'].items;
            newBoard.forEach((row, ri) => row.forEach((sq, ci) => {
                if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.heldItem && setItems.includes(sq.piece.heldItem)) {
                    setUnits.push({p: sq.piece, r: ri, c: ci});
                }
            }));
            if (setUnits.length > 0) {
                for (let i = 0; i < extraLevels; i++) {
                    const target = setUnits[Math.floor(Math.random() * setUnits.length)];
                    const p = target.p;
                    if (p.type !== 'queen' || p.level < 7) {
                        p.level++;
                        p.isPoisoned = false;
                        p.isExhausted = false;
                        p.cooldownTurnsRemaining = 0;
                        const alg = coordsToAlgebraic(target.r, target.c);
                        if (!ralliedSquares.includes(alg)) ralliedSquares.push(alg);
                    }
                }
            }
        }
    }

    if (captured.heldItem === 'spiked_plate' && pieceToLand.heldItem !== 'filter_mask') {
        pieceToLand.isPoisoned = true;
    }
    if (captured.heldItem === 'glass_shard') {
        pieceToLand.isExhausted = true;
        pieceToLand.cooldownTurnsRemaining = 2;
    }
    if (captured.heldItem === 'signal_horn') {
        const alliesSameType = newBoard.flat()
            .filter(sq => sq.piece && sq.piece.color === captured!.color && sq.piece.type === captured!.type)
            .map(sq => sq.piece!);
        if (alliesSameType.length > 0) {
            const recruit = alliesSameType[Math.floor(Math.random() * alliesSameType.length)];
            if (recruit.type !== 'queen' || recruit.level < 7) {
                recruit.level++;
                recruit.isPoisoned = false;
                recruit.isExhausted = false;
                recruit.cooldownTurnsRemaining = 0;
            }
        }
    }
    const isShatter = pieceToLand.heldItem === 'ice_breaker' && (captured.frozenTurnsRemaining || 0) > 0;
    if (effectiveHeldItem === 'chameleon_cloak' && pieceToLand.type !== 'king') {
        pieceToLand.type = captured.type;
        pieceToLand.id = `${pieceToLand.id}_morph_${Date.now()}`;
    }
    if (captured.heldItem === 'ice_tunic' && pieceToLand.heldItem !== 'thermal_socks') {
        if (pieceToLand.heldItem === 'antifreeze') {
            pieceToLand.heldItem = null;
        } else {
            pieceToLand.frozenTurnsRemaining = 2; pieceToLand.cooldownTurnsRemaining = 2;
        }
    }
    if (captured.heldItem === 'trap_net') { triggerExhaustion(newBoard, toRow, toCol, pieceToLand.color); }
    if (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(pieceToLand.type) && captured.type === 'commander') pieceToLand.type = 'commander';
    let g = effectiveHeldItem === 'berserkers_mask' ? 3 : ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[captured.type] || 0);
    if (effectiveHeldItem === 'great_sword') {
        const dr = toRow - fromRow;
        const dc = toCol - fromCol;
        if (dr === 0 || dc === 0) {
            const behindR = toRow + Math.sign(dr);
            const behindC = toCol + Math.sign(dc);
            if (isValidSquare(behindR, behindC)) {
                const bSq = newBoard[behindR][behindC];
                if (bSq.piece && bSq.piece.color !== movingPiece.color && bSq.piece.type !== 'king') {
                    const cGain = ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[bSq.piece.type] || 0);
                    g += cGain;
                    triggerDefiantSparks(behindR, behindC, bSq.piece.color);
                    selfDestructCaptures.push({ ...bSq.piece, id: `${bSq.piece.id}_cleave_${Date.now()}` });
                    newBoard[behindR][behindC].piece = null;
                }
            }
        }
    }
    if (captured.heldItem === 'cyanide_pill') g = 0;
    if (effectiveHeldItem === 'gnosis') g += 1;
    if (effectiveHeldItem === 'golden_chalice') g += 1;
    if (effectiveHeldItem === 'sweet_revenge' && didOpponentCaptureLastTurn) g += 1;
    if (effectiveHeldItem === 'whetstone' && captured.level === 1) g += 1;
    if (effectiveHeldItem === 'gamblers_coin') { if (Math.random() < 0.5) g *= 2; else g = 0; }
    const oldL = pieceToLand.level || 1;
    if (pieceToLand.type === 'queen') { if (oldL < 7) { pieceToLand.level = Math.min(7, oldL + g); didLevelUp = true; levelGain = pieceToLand.level - oldL; } }
    else { pieceToLand.level = oldL + g; didLevelUp = true; levelGain = g; }
    if (originalPieceType === 'commander') { ralliedSquares = applyRally(newBoard, pieceToLand.color, 'pawn', move.to); rallyCryTriggered = { square: move.to, color: pieceToLand.color }; }
    if (originalPieceType === 'hero') { ralliedSquares = applyRally(newBoard, pieceToLand.color, 'all', move.to); ralliedSquares = applyRally(newBoard, pieceToLand.color, 'all', move.to); rallyCryTriggered = { square: move.to, color: pieceToLand.color }; }
    if (pieceToLand.type === 'king') applyKingDominion(newBoard, pieceToLand.color, g);
    if (effectiveHeldItem === 'poison_sword') triggerPoisonSplash(newBoard, toRow, toCol, pieceToLand.color);
    if (captured.heldItem === 'poison_tunic' && pieceToLand.heldItem !== 'filter_mask') pieceToLand.isPoisoned = true;
    if (effectiveHeldItem === 'ice_sword') {
        const oppColor = pieceToLand.color === 'white' ? 'black' : 'white';
        [[0,1], [0,-1], [1,0], [-1,0]].forEach(([dr, dc]) => {
            const nr = toRow + dr, nc = toCol + dc;
            if (isValidSquare(nr, nc)) {
                const victim = newBoard[nr][nc].piece;
                if (victim && victim.color === oppColor) {
                    if (victim.heldItem === 'antifreeze') {
                        victim.heldItem = null;
                    } else if (victim.heldItem !== 'thermal_socks') {
                        victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2;
                    }
                }
            }
        });
    }
    if (effectiveHeldItem === 'leach_blade') {
        const oppColor = pieceToLand.color === 'white' ? 'black' : 'white';
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = toRow + dr; const nc = toCol + dc;
            if (isValidSquare(nr, nc)) {
                const victim = newBoard[nr][nc].piece;
                if (victim && victim.color === oppColor) victim.level = Math.max(1, (victim.level || 1) - 1);
            }
        }
    }
    if (effectiveHeldItem === 'gravity_stone') triggerPull(newBoard, toRow, toCol, pieceToLand.color);
    if (isShatter) { promotedToInfiltrator = true; captured = { ...captured, id: `shattered_${captured.id}_${Date.now()}` }; }
  }

  if (didLevelUp && effectiveHeldItem === 'soul_link') {
    newBoard.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.heldItem === 'soul_link' && sq.piece.id !== pieceToLand.id) {
        if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, (sq.piece.level || 1) + levelGain);
            sq.piece.isPoisoned = false; sq.piece.isExhausted = false; sq.piece.cooldownTurnsRemaining = 0;
        }
      }
    }));
  }

  if (didLevelUp) {
    const activeSets = getActiveSets(newBoard, pieceToLand.color);
    if (activeSets.includes('luminous')) {
      let minLevel = 999;
      newBoard.forEach(row => row.forEach(sq => {
        if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.id !== pieceToLand.id) {
           minLevel = Math.min(minLevel, sq.piece.level || 1);
        }
      }));
      const candidates: Piece[] = [];
      newBoard.forEach(row => row.forEach(sq => {
        if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.id !== pieceToLand.id && (sq.piece.level || 1) === minLevel) {
           if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
             candidates.push(sq.piece);
           }
        }
      }));
      if (candidates.length > 0) {
        const lucky = candidates[0];
        lucky.level = (lucky.level || 1) + 1;
        lucky.isPoisoned = false;
        lucky.isExhausted = false;
        lucky.cooldownTurnsRemaining = 0;
        const coords = newBoard.flat().find(sq => sq.piece?.id === lucky.id);
        if (coords) ralliedSquares.push(coords.algebraic);
      }
    }
  }

  if (didLevelUp) { pieceToLand.isPoisoned = false; pieceToLand.isExhausted = false; pieceToLand.cooldownTurnsRemaining = 0; }
  if (pieceToLand.isExhausted) { 
      if (pieceToLand.heldItem === 'coffee_bean') {
          pieceToLand.isExhausted = false;
          pieceToLand.cooldownTurnsRemaining = 0;
          pieceToLand.heldItem = null;
      } else {
          pieceToLand.cooldownTurnsRemaining = 2; 
      }
  }
  if (pieceToLand.heldItem === 'training_weights') {
      pieceToLand.isExhausted = true;
      pieceToLand.cooldownTurnsRemaining = 2;
  }
  if (effectiveHeldItem === 'wind_sword' && (captured || pieceCapturedByAnvil)) {
      const crush = triggerPushBack(newBoard, toRow, toCol, pieceToLand.color);
      if (crush) pieceCapturedByAnvil = crush;
  }
  if (effectiveHeldItem === 'mushroom_magnet') triggerMushroomMagnet(newBoard, toRow, toCol);
  if (pieceToLand.heldItem === 'middle_way') pieceToLand.level = 3;
  if (captured?.heldItem === 'phoenix_down') {
    const empty = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!newBoard[r][c].piece && !newBoard[r][c].item) empty.push(coordsToAlgebraic(r,c));
    if(empty.length > 0) {
      const sq = empty[Math.floor(Math.random()*empty.length)];
      const {row: rr, col: rc} = algebraicToCoords(sq);
      const res = { ...captured, id: `res_${captured.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
      newBoard[rr][rc].piece = res; phoenixResurrection = { piece: res, square: sq }; captured = null;
    }
  }

  const currentSets = getActiveSets(newBoard, pieceToLand.color);
  const effectiveLevelAfterMove = getEffectiveLevel(newBoard, toRow, toCol);
  const isFrontline = FRONTLINE_TYPES.includes(pieceToLand.type);
  const hasGripGloves = effectiveHeldItem === 'grip_gloves' && isFrontline;
  const hasWindSetBonus = isFrontline && effectiveLevelAfterMove >= 2 && currentSets.includes('wind_set');

  if ((isFrontline || effectiveHeldItem === 'wind_cloak') && (effectiveLevelAfterMove >= 4 || hasGripGloves || hasWindSetBonus)) {
    const onlyAnvils = hasGripGloves && effectiveLevelAfterMove < 4;
    const crush = triggerPushBack(newBoard, toRow, toCol, pieceToLand.color, onlyAnvils);
    if (crush) pieceCapturedByAnvil = crush;
  }
  if ((['bishop', 'archbishop'].includes(pieceToLand.type)) && effectiveLevelAfterMove >= 5) triggerConversion(newBoard, toRow, toCol, pieceToLand.color, pieceToLand, conversionEvents);
  
  // Toxic Cloud Set Bonus logic
  const opponentColor_TC = pieceToLand.color === 'white' ? 'black' : 'white';
  const opponentSets_TC = getActiveSets(newBoard, opponentColor_TC);
  if (opponentSets_TC.includes('toxic_cloud') && pieceToLand.heldItem !== 'filter_mask') {
      let isAdjacentToSetPiece = false;
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = toRow + dr; const nc = toCol + dc;
              if (isValidSquare(nr, nc)) {
                  const neighborPiece = newBoard[nr][nc].piece;
                  if (neighborPiece && neighborPiece.color === opponentColor_TC) {
                      isAdjacentToSetPiece = true;
                      break;
                  }
              }
          }
          if (isAdjacentToSetPiece) break;
      }
      if (isAdjacentToSetPiece) {
          pieceToLand.isPoisoned = true;
      }
  }

  const isAssassinActive = currentSets.includes('assassin') && isFrontline && pieceToLand.level >= 5;
  if ((pieceToLand.type === 'infiltrator' || isAssassinActive) && toRow === (pieceToLand.color === 'white' ? 0 : 7)) infiltrationWin = true;

  const hydraToSplit = (captured?.id?.startsWith('boss-hydra') ? captured : (pieceCapturedByAnvil?.id?.startsWith('boss-hydra') ? pieceCapturedByAnvil : null));
  if (hydraToSplit) {
      hydraSplitOccurred = true;
      const { row: cr, col: cc } = algebraicToCoords(move.to);
      const adj = [];
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = cr + dr, nc = cc + dc;
              if (isValidSquare(nr, nc)) {
                  const s = newBoard[nr][nc];
                  if (!s.piece && (!s.item || s.item.type === 'shroom')) adj.push({ r: nr, c: nc });
              }
          }
      }
      const spawnCount = Math.min(adj.length, 2);
      const shuffled = adj.sort(() => Math.random() - 0.5);
      for (let i = 0; i < spawnCount; i++) {
          const pos = shuffled[i];
          newBoard[pos.r][pos.c].piece = {
              id: `hydra_spawn_${hydraToSplit.id}_${i}_${Date.now()}`,
              type: 'knight',
              color: hydraToSplit.color,
              level: 2,
              hasMoved: true,
              isShielded: false
          };
          newBoard[pos.r][pos.c].item = null;
      }
  }

  return { newBoard, capturedPiece: captured, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare, phoenixResurrection, reflectionOccurred, resurrectionScrollEvent, itemReturned, multiPromotions, ralliedSquares, winByKingsConquest, hydraSplitOccurred };
}
