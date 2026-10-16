import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType, ItemType, SquareState, RookResurrectionResult, LastMoveInfo, ApplyMoveResult, Move, LevelChangeEvent, ConversionEvent } from '@/types';
import { VAL_MAP, FRONTLINE_TYPES } from './constants';
import { algebraicToCoords, coordsToAlgebraic, isValidSquare, getEffectiveLevel, isSilenced, getPromotionLevel, findKing, isItemValidForPiece, getActiveSets } from './utils';
import { triggerPushBack, triggerConversion, applyRally, applyKingDominion, syncSoulLink, triggerPoisonSplash, triggerToxicCloud, triggerMushroomMagnet, triggerPull, triggerExhaustion, applyOilSlide, performExtendedDisplacement, applyReapersTithe } from './effects';

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

export function applyMove(
  board: BoardState, 
  move: Move, 
  enPassantTargetSquare: AlgebraicSquare | null, 
  graveyard?: { white: Piece[], black: Piece[] }, 
  lastMoveWhite?: LastMoveInfo | null,
  lastMoveBlack?: LastMoveInfo | null,
  lastMoveGlobal?: LastMoveInfo | null,
  didOpponentCaptureLastTurn?: boolean
): ApplyMoveResult {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null, phasedPiece: sq.phasedPiece ? { ...sq.phasedPiece } : null, oilSlickTurnsRemaining: sq.oilSlickTurnsRemaining, phasedTurnsRemaining: sq.phasedTurnsRemaining })));
  
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
  
  const targetSq = newBoard[toRow]?.[toCol];
  const targetPiece = targetSq?.piece || null;
  const targetItem = targetSq?.item || null;
  let captured: Piece | null = null;

  let enPassantTargetSet: AlgebraicSquare | null = null;
  const selfDestructCaptures: Piece[] = [];
  const obliteratedPieces: Piece[] = [];
  const conversionEvents: ConversionEvent[] = [];
  let rallyCryTriggered = null;
  let selfCheckByPushBack = false;
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
  let stolenItem: InventoryItemType | null = null;
  const multiPromotions: { square: AlgebraicSquare, targetLevel: number }[] = [];
  let ralliedSquares: AlgebraicSquare[] = [];
  let winByKingsConquest = false;
  let hydraSplitOccurred = false;
  let hydraSpawnSquares: AlgebraicSquare[] = [];
  let anvilDroppedSquares: AlgebraicSquare[] = [];
  const levelChanges: LevelChangeEvent[] = [];
  let smokeBombEvent = undefined;
  let glassShardTriggered = false;
  let signalHornEvent = undefined;

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed: false, enPassantTargetSquare: null, extraTurn, specialCaptureSquare, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };

  const isSafeKingMoveType = ['castle', 'swap', 'dance-swap', 'grapple-hook-swap', 'swap-scroll'].includes(move.type || '');
  if (targetPiece?.type === 'king' && !isSafeKingMoveType) {
    return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSquare: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  let effectiveHeldItem = movingPiece.heldItem;
  if (movingPiece.type === 'mimic') {
    let mimickedItem: InventoryItemType | null = null;
    if (movingPiece.heldItem === 'mirror_mask') {
        const enemyLast = movingPiece.color === 'white' ? lastMoveBlack : lastMoveWhite;
        mimickedItem = enemyLast?.item || null;
    } else if (movingPiece.heldItem === 'mimic_blade') {
        const allyLast = movingPiece.color === 'white' ? lastMoveWhite : lastMoveBlack;
        mimickedItem = allyLast?.item || null;
    }
    effectiveHeldItem = mimickedItem;
  }

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
                }
            }
        }
    }
  };

  if (targetItem?.type === 'anvil' && movingPiece.heldItem === 'crowbar') {
      newBoard[toRow][toCol].item = null;
      movingPiece.heldItem = null;
  }

  const isFrontlineAct = FRONTLINE_TYPES.includes(movingPiece.type);
  const effLevelBeforeMove = getEffectiveLevel(board, fromRow, fromCol);
  const actorSetsAct = getActiveSets(board, movingPiece.color);
  const isWindSetAct = actorSetsAct.includes('wind_set');
  const canPushEntry = (isFrontlineAct && (effLevelBeforeMove >= 4 || (effLevelBeforeMove >= 2 && isWindSetAct) || movingPiece.heldItem === 'grip_gloves'));
  const isRamPushMove = move.type === 'ram-push';

  if (targetItem?.type === 'anvil' && (canPushEntry || isRamPushMove)) {
      const dr = Math.sign(toRow - fromRow);
      const dc = Math.sign(toCol - fromCol);
      const isCardinal = dr === 0 || dc === 0;
      const dist = (isRamPushMove && isCardinal) ? 3 : 1;
      const obliterate = true; 
      
      const pushRes = performExtendedDisplacement(newBoard, toRow, toCol, dr, dc, dist, obliterate);
      if (pushRes.obliterated.length > 0) obliteratedPieces.push(...pushRes.obliterated);
      levelChanges.push(...pushRes.levelChanges);
  }

  if (move.type === 'lose-thy-faith') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      newBoard.forEach(row => row.forEach(sq => {
          if (sq.piece && sq.piece.color === oppColor) sq.piece.isShielded = false;
      }));
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
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
              if (tSq.piece.type === 'king') break;
              totalGain += (VAL_MAP[tSq.piece.type] || 1);
              triggerDefiantSparks(nr, nc, tSq.piece.color);
              obliteratedPieces.push({ ...tSq.piece, id: `${tSq.piece.id}_burn_${Date.now()}` });
              tSq.piece = null;
          }
          if (tSq.item?.type === 'anvil') tSq.item = null;
      }
      const oldRL = movingPiece.level;
      movingPiece.level += totalGain;
      if (movingPiece.type === 'queen') movingPiece.level = Math.min(7, movingPiece.level);
      if (movingPiece.level > oldRL) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: movingPiece.level - oldRL });
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: [], destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'oil-slick') {
      const { row: tr, col: tc } = algebraicToCoords(move.to);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (isValidSquare(tr + dr, tc + dc)) {
              newBoard[tr + dr][tc + dc].oilSlickTurnsRemaining = 3;
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'trap-net') {
      triggerExhaustion(newBoard, fromRow, fromCol, movingPiece.color);
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'demonic-possession') {
      const oldDL = movingPiece.level;
      movingPiece.level = Math.min(movingPiece.type === 'queen' ? 7 : 99, (movingPiece.level || 1) + 5);
      if (movingPiece.level > oldDL) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: movingPiece.level - oldDL });
      movingPiece.obliterationTurnsRemaining = 4;
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'heavy-rain') {
      const emptyCells = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) emptyCells.push({r,c});
      const shuffledCells = emptyCells.sort(() => Math.random() - 0.5).slice(0, 3);
      shuffledCells.forEach(pos => { 
        newBoard[pos.r][pos.c].item = { type: 'anvil' }; 
        anvilDroppedSquares.push(coordsToAlgebraic(pos.r, pos.c));
      });
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'myco-propagate') {
      const emptyCells = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) emptyCells.push({r,c});
      const shuffledCells = emptyCells.sort(() => Math.random() - 0.5).slice(0, 5);
      shuffledCells.forEach(pos => { newBoard[pos.r][pos.c].item = { type: 'shroom' }; });
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 1); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSquare: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: true, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'raise-mycelimen') {
      const oppBackRankIdx = movingPiece.color === 'white' ? 0 : 7;
      newBoard.forEach((row, rIdx) => row.forEach((sq, cIdx) => {
          if (sq.item?.type === 'shroom') {
              sq.item = null;
              sq.piece = { id: `myceliman_${sq.algebraic}_${Date.now()}_${rIdx}_${cIdx}`, type: 'pawn', color: movingPiece.color, level: 1, hasMoved: true, isShielded: false };
              if (sq.rowIndex === oppBackRankIdx) {
                multiPromotions.push({ square: sq.algebraic, targetLevel: 1 });
              }
          }
      }));
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 6); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, multiPromotions, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'grapple-hook-swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      if (p1?.heldItem === 'relay_ribbon') {
          const oldL = p1.level;
          p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
          if (p1.level > oldL) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: 1 });
      }
      if (p2?.heldItem === 'relay_ribbon') {
          const oldL = p2.level;
          p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
          if (p2.level > oldL) levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
      }
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'grapple-throw') {
      const drThrow = Math.sign(toRow - fromRow);
      const dcThrow = Math.sign(toCol - fromCol);
      if (move.grappledFrom) {
          const { row: gr, col: gc } = Array.isArray(move.grappledFrom) ? { row: move.grappledFrom[0], col: move.grappledFrom[1] } : algebraicToCoords(move.grappledFrom as AlgebraicSquare);
          newBoard[gr][gc].piece = null;
          newBoard[gr][gc].item = null;
      }
      if (move.thrownItem === 'anvil') {
          const pushResult = performExtendedDisplacement(newBoard, toRow, toCol, drThrow, dcThrow, 1, true);
          if (pushResult.obliterated.length > 0) obliteratedPieces.push(...pushResult.obliterated);
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true };
          newBoard[toRow][toCol].item = { type: 'anvil' };
          anvilDroppedSquares.push(coordsToAlgebraic(toRow, toCol));
      } else if (move.thrownPiece) {
          const thrown = move.thrownPiece!;
          newBoard[toRow][toCol].piece = { ...thrown, hasMoved: true };
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true }; 
          if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.type !== 'king') {
              captured = { ...targetPiece };
              triggerDefiantSparks(toRow, toCol, captured.color);
          }
      }
      return { newBoard, capturedPiece: captured, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares, levelChanges, obliteratedPieces };
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
                  if (victim.type !== 'king') {
                    triggerDefiantSparks(nr, nc, victim.color);
                    obliteratedPieces.push({ ...victim, id: `${victim.id}_colossus_crush_${Date.now()}` });
                    newBoard[nr][nc].piece = null;
                  }
              }
              newBoard[nr][nc].piece = { id: p.id, type: 'king', color: movingPiece.color, level: movingPiece.level, hasMoved: true };
          }
      });
      return { newBoard, capturedPiece: null, selfDestructCaptures: [], destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, anvilDroppedSquares: [], levelChanges, obliteratedPieces };
  }

  if (move.type === 'dance-swap') {
    const p1 = newBoard[fromRow][fromCol].piece!;
    const targetSq_ds = newBoard[toRow][toCol];
    const p2 = targetSq_ds.piece;
    const it2 = targetSq_ds.item;
    if (p1.heldItem === 'war_drum' && p2) {
        if (p2.color === p1.color) { 
            if (p2.type !== 'queen' || p2.level < 7) {
                const oldL = p2.level;
                p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1); 
                if (p2.level > oldL) levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
            }
        }
        else { p2.cooldownTurnsRemaining = 2; }
    }
    if (p1?.heldItem === 'relay_ribbon') {
        const oldL = p1.level;
        p1.level = Math.min(p1.type === 'queen' ? 7 : 99, (p1.level || 1) + 1);
        if (p1.level > oldL) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: 1 });
    }
    if (p2?.heldItem === 'relay_ribbon') {
        const oldL = p2.level;
        p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1);
        if (p2.level > oldL) levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
    }
    newBoard[toRow][toCol].piece = { ...p1, hasMoved: true };
    newBoard[toRow][toCol].item = null;
    newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
    newBoard[fromRow][fromCol].item = it2;
    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: 'dancer', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null, anvilDroppedSquares: [], levelChanges, obliteratedPieces: [] };
  }

  const originalLevelValue = Number(movingPiece.level || 1);
  const originalTypeIdentifier = movingPiece.type;
  const originalEffectiveLevelBefore = getEffectiveLevel(board, fromRow, fromCol);

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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, anvilDroppedSquares: [], levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'soul-harvest') {
      let totalLevelsDrained = 0;
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.level > 1) { 
              const drainVal = (victim.level - 1);
              totalLevelsDrained += drainVal; 
              victim.level = 1; 
              levelChanges.push({ square: coordsToAlgebraic(nr, nc), delta: -drainVal });
          }
        }
      }
      const consumer = newBoard[fromRow][fromCol].piece!;
      const oldLVal = consumer.level || 1;
      if (consumer.type === 'queen') consumer.level = Math.min(7, oldLVal + totalLevelsDrained);
      else consumer.level = oldLVal + totalLevelsDrained;
      if (consumer.level > oldLVal) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: consumer.level - oldLVal });
      consumer.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'kings-decree') {
    const { row: pr, col: pc } = algebraicToCoords(move.to);
    if (newBoard[pr][pc].piece && FRONTLINE_TYPES.includes(newBoard[pr][pc].piece!.type) && newBoard[pr][pc].piece!.level === 1) {
      newBoard[pr][pc].piece!.type = 'commander';
    }
    newBoard[fromRow][fromCol].piece!.heldItem = null;
    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'resurrection-scroll') {
      if (graveyard) {
          const myGrave = movingPiece.color;
          if (graveyard[myGrave].length > 0) {
              const bestInGrave = [...graveyard[myGrave]].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0))[0];
              const adjSpaces = [];
              for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                  if (dr===0 && dc===0) continue;
                  const nr=fromRow+dr; const nc=fromCol+dc;
                  if(isValidSquare(nr,nc) && !newBoard[nr][nc].piece && !newBoard[nr][nc].item) adjSpaces.push(coordsToAlgebraic(nr,nc));
              }
              if (adjSpaces.length > 0) {
                  const targetResAlg = adjSpaces[Math.floor(Math.random()*adjSpaces.length)];
                  const {row: rr, col: rc} = algebraicToCoords(targetResAlg);
                  let resLevelVal = 1;
                  if (bestInGrave.heldItem === 'soul_spark') resLevelVal = 2;
                  const resPieceObj = { ...bestInGrave, id: `res_scroll_${bestInGrave.id}_${Date.now()}`, level: resLevelVal, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                  newBoard[rr][rc].piece = resPieceObj;
                  resurrectionScrollEvent = { piece: bestInGrave, square: targetResAlg };
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, resurrectionScrollEvent, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'faith-scroll') {
      const convColor = movingPiece.color;
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
          if (dr===0 && dc===0) continue;
          const nr=fromRow+dr; const nc=fromCol+dc;
          if(isValidSquare(nr,nc)) {
              const vict = newBoard[nr][nc].piece;
              if (vict && vict.color !== convColor && vict.type !== 'king' && vict.heldItem !== 'get_faith') {
                  if (Math.random() < 0.5) {
                    const origVict = {...vict};
                    vict.color = convColor;
                    vict.id = `conv_${vict.id}_${Date.now()}`;
                    conversionEvents.push({ originalPiece: origVict, convertedPiece: {...vict}, byPiece: {...movingPiece}, at: coordsToAlgebraic(nr, nc) });
                  }
              }
          }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'ice-scroll') {
      const opColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const vict = newBoard[nr][nc].piece;
          if(vict && vict.color === opColor) {
              if (vict.heldItem === 'antifreeze') {
                  vict.heldItem = null;
              } else if (vict.heldItem !== 'thermal_socks') {
                  vict.frozenTurnsRemaining = 2; vict.cooldownTurnsRemaining = 2;
              }
          }
        }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'swap-scroll') {
      const p1Obj = newBoard[fromRow][fromCol].piece;
      const p2Obj = newBoard[toRow][toCol].piece;
      if (p1Obj?.heldItem === 'relay_ribbon') {
          const oldL = p1Obj.level;
          p1Obj.level = Math.min(p1Obj.type === 'queen' ? 7 : 99, (p1Obj.level || 1) + 1);
          if (p1Obj.level > oldL) levelChanges.push({ square: coordsToAlgebraic(fromRow, fromCol), delta: 1 });
      }
      if (p2Obj?.heldItem === 'relay_ribbon') {
          const oldL = p2Obj.level;
          p2Obj.level = Math.min(p2Obj.type === 'queen' ? 7 : 99, (p2Obj.level || 1) + 1);
          if (p2Obj.level > oldL) levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
      }
      newBoard[fromRow][fromCol].piece = p2Obj;
      newBoard[toRow][toCol].piece = p1Obj;
      if (newBoard[toRow][toCol].piece) newBoard[toRow][toCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, resurrectionScrollEvent, anvilDroppedSquares, levelChanges, obliteratedPieces: [] };
  }

  if (move.type === 'enpassant') {
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

  const pieceLanded = { ...movingPiece, isShielded: false, hasMoved: true };
  if (pieceLanded.type === 'mimic') {
    let mimItem: InventoryItemType | null = null;
    if (pieceLanded.heldItem === 'mirror_mask') {
        const enemyLast = pieceLanded.color === 'white' ? lastMoveBlack : lastMoveWhite;
        mimItem = enemyLast?.item || null;
    } else if (pieceLanded.heldItem === 'mimic_blade') {
        const allyLast = pieceLanded.color === 'white' ? lastMoveWhite : lastMoveBlack;
        mimItem = allyLast?.item || null;
    }
    pieceLanded.heldItem = mimItem;
  }

  const backRankIdxVal = pieceLanded.color === 'white' ? 0 : 7;
  const teamActiveSets = getActiveSets(newBoard, pieceLanded.color);
  const assassinAtBackRank = teamActiveSets.includes('assassin') && FRONTLINE_TYPES.includes(pieceLanded.type) && pieceLanded.level >= 5;

  if (pieceLanded.type === 'commander' && toRow === backRankIdxVal && move.type !== 'self-destruct') {
    pieceLanded.type = 'hero'; pieceLanded.id = `${pieceLanded.id}_hero_auto_${Date.now()}`;
    if (originalEffectiveLevelBefore >= 5) extraTurn = true;
    promotedToHero = true;
  } else if (FRONTLINE_TYPES.includes(pieceLanded.type) && toRow === backRankIdxVal && move.type !== 'self-destruct' && !promotedToInfiltrator && !assassinAtBackRank) {
    if (originalEffectiveLevelBefore >= 5) extraTurn = true;
  }

  if (promotedToInfiltrator) pieceLanded.type = 'infiltrator';
  if (pieceLanded.heldItem && !isItemValidForPiece(pieceLanded.heldItem, pieceLanded.type)) { 
      if (!itemReturned) itemReturned = pieceLanded.heldItem; 
      pieceLanded.heldItem = null; 
  }
  
  newBoard[toRow][toCol].piece = pieceLanded;
  if (fromRow !== toRow || fromCol !== toCol) {
    newBoard[fromRow][fromCol].piece = null;
  }

  const drS = Math.sign(toRow - fromRow);
  const dcS = Math.sign(toCol - fromCol);
  if ((drS !== 0 || dcS !== 0) && newBoard[toRow][toCol].oilSlickTurnsRemaining > 0) {
      const slideResult = applyOilSlide(newBoard, toRow, toCol, drS, dcS);
      if (slideResult.obliterated.length > 0) obliteratedPieces.push(...slideResult.obliterated);
  }

  if (FRONTLINE_TYPES.includes(pieceLanded.type) && Math.abs(fromRow - toRow) === 2) enPassantTargetSet = coordsToAlgebraic(fromRow + Math.sign(toRow - fromRow), fromCol);
  
  let didLevelUpFlag = false;
  let levelGainVal = 0;
  if (targetItem?.type === 'shroom') {
    shroomConsumed = true; newBoard[toRow][toCol].item = null;
    const oldLVal = pieceLanded.level || 1;
    if (pieceLanded.type === 'queen') { 
        if (oldLVal < 7) { 
            pieceLanded.level = Math.min(7, oldLVal + 1); 
            didLevelUpFlag = true; levelGainVal = pieceLanded.level - oldLVal; 
            levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
        } 
    }
    else { 
        pieceLanded.level = oldLVal + 1; 
        didLevelUpFlag = true; levelGainVal = 1; 
        levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
    }
    newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === pieceLanded.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = (sq.piece.shroomMana || 0) + 1; }));
  }

  if (pieceLanded.heldItem === 'spore_pouch' && (fromRow !== toRow || fromCol !== toCol)) {
      if (Math.random() < 0.25 && !newBoard[fromRow][fromCol].piece && !newBoard[fromRow][fromCol].item) {
          newBoard[fromRow][fromCol].item = { type: 'shroom' };
      }
  }

  if (pieceLanded.type === 'king' && move.type === 'castle') {
    const rookC = toCol > fromCol ? 7 : 0; const targetRookC = toCol > fromCol ? 5 : 3;
    const rookSqObj = newBoard[fromRow][rookC];
    if (rookSqObj.piece) {
        if (rookSqObj.piece.type === 'palace') { 
            pieceLanded.level++; didLevelUpFlag = true; levelGainVal = 1; 
            levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: 1 });
        }
        newBoard[fromRow][targetRookC].piece = { ...rookSqObj.piece, hasMoved: true, isShielded: false };
        rookSqObj.piece = null;
    }
  }

  if (captured) {
    const shardShatter = pieceLanded.heldItem === 'ice_breaker' && (captured.frozenTurnsRemaining || 0) > 0;
    
    if (captured.heldItem === 'glass_shard') {
        pieceLanded.isExhausted = true;
        captured.heldItem = null;
        glassShardTriggered = true;
    }

    if (captured.heldItem === 'signal_horn') {
        const myColor = captured.color;
        const myType = captured.type;
        const sameTypeAllies: SquareState[] = [];
        newBoard.forEach(row => row.forEach(sq => {
            if (sq.piece && sq.piece.color === myColor && sq.piece.type === myType && sq.piece.id !== captured!.id) {
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
                signalHornEvent = { piece: { ...tp }, square: hornTarget.algebraic };
            }
        }
    }

    if (captured.heldItem === 'soul_link') {
        newBoard.forEach(row => row.forEach(sq => {
            if (sq.piece && sq.piece.color === captured!.color && sq.piece.heldItem === 'soul_link') {
                obliteratedPieces.push({ ...sq.piece, id: `${sq.piece.id}_linked_${Date.now()}` });
                sq.piece = null;
            }
        }));
    }

    if (pieceLanded.heldItem === 'thieves_gloves' && captured.heldItem) {
        if (Math.random() < 0.5) {
            stolenItem = captured.heldItem;
        }
    }

    if (effectiveHeldItem === 'chameleon_cloak' && pieceLanded.type !== 'king') {
        pieceLanded.type = captured.type;
        pieceLanded.id = `${pieceLanded.id}_morph_${Date.now()}`;
    }
    if (captured.heldItem === 'ice_tunic' && pieceLanded.heldItem !== 'thermal_socks') {
        if (pieceLanded.heldItem === 'antifreeze') {
            pieceLanded.heldItem = null;
        } else {
            pieceLanded.frozenTurnsRemaining = 2; pieceLanded.cooldownTurnsRemaining = 2;
        }
    }
    if (captured.heldItem === 'trap_net') { triggerExhaustion(newBoard, toRow, toCol, pieceLanded.color); }
    if (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(pieceLanded.type) && captured.type === 'commander') pieceLanded.type = 'commander';
    
    let baseGain = effectiveHeldItem === 'berserkers_mask' ? 3 : ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[captured.type] || 0);
    
    if (effectiveHeldItem === 'great_sword') {
        const drG = toRow - fromRow;
        const dcG = toCol - fromCol;
        if (drG === 0 || dcG === 0) {
            const behindRow = toRow + Math.sign(drG);
            const behindCol = toCol + Math.sign(dcG);
            if (isValidSquare(behindRow, behindCol)) {
                const bSq = newBoard[behindRow][behindCol];
                if (bSq.piece && bSq.piece.color !== movingPiece.color && bSq.piece.type !== 'king') {
                    const extraG = ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[bSq.piece.type] || 0);
                    baseGain += extraG;
                    triggerDefiantSparks(behindRow, behindCol, bSq.piece.color);
                    obliteratedPieces.push({ ...bSq.piece, id: `${bSq.piece.id}_cleave_${Date.now()}` });
                    newBoard[behindRow][behindCol].piece = null;
                }
            }
        }
    }
    if (captured.heldItem === 'cyanide_pill') baseGain = 0;
    if (effectiveHeldItem === 'gnosis') baseGain += 1;
    if (effectiveHeldItem === 'golden_chalice') baseGain += 1;
    if (effectiveHeldItem === 'sweet_revenge' && didOpponentCaptureLastTurn) baseGain += 1;
    if (effectiveHeldItem === 'whetstone' && captured.level === 1) baseGain += 1;
    if (effectiveHeldItem === 'gamblers_coin') { if (Math.random() < 0.5) baseGain *= 2; else baseGain = 0; }
    
    const oldLVal = pieceLanded.level || 1;
    if (pieceLanded.type === 'queen') { if (oldLVal < 7) { pieceLanded.level = Math.min(7, oldLVal + baseGain); didLevelUpFlag = true; levelGainVal = pieceLanded.level - oldLVal; } }
    else { pieceLanded.level = oldLVal + baseGain; didLevelUpFlag = true; levelGainVal = baseGain; }
    
    if (levelGainVal > 0) levelChanges.push({ square: coordsToAlgebraic(toRow, toCol), delta: levelGainVal });

    if (originalTypeIdentifier === 'commander') { 
        const { ralliedSquares: rsq, levelChanges: rch } = applyRally(newBoard, pieceLanded.color, 'pawn', move.to); 
        ralliedSquares = rsq; levelChanges.push(...rch);
        rallyCryTriggered = { square: move.to, color: pieceLanded.color }; 
    }
    if (originalTypeIdentifier === 'hero') { 
        const { ralliedSquares: rsq1, levelChanges: rch1 } = applyRally(newBoard, pieceLanded.color, 'all', move.to); 
        const { ralliedSquares: rsq2, levelChanges: rch2 } = applyRally(newBoard, pieceLanded.color, 'all', move.to); 
        ralliedSquares = [...rsq1, ...rsq2]; levelChanges.push(...rch1, ...rch2);
        rallyCryTriggered = { square: move.to, color: pieceLanded.color }; 
    }
    if (pieceLanded.type === 'king') {
        const kingDrains = applyKingDominion(newBoard, pieceLanded.color, levelGainVal);
        levelChanges.push(...kingDrains);
    }
    if (effectiveHeldItem === 'poison_sword') triggerPoisonSplash(newBoard, toRow, toCol, pieceLanded.color);
    if (captured.heldItem === 'poison_tunic' && pieceLanded.heldItem !== 'filter_mask') pieceLanded.isPoisoned = true;
    if (effectiveHeldItem === 'ice_sword') {
        const opC = pieceLanded.color === 'white' ? 'black' : 'white';
        [[0,1], [0,-1], [1,0], [-1,0]].forEach(([dr, dc]) => {
            const nr = toRow + dr, nc = toCol + dc;
            if (isValidSquare(nr, nc)) {
                const vict = newBoard[nr][nc].piece;
                if (vict && vict.color === opC) {
                    if (vict.heldItem === 'antifreeze') {
                        vict.heldItem = null;
                    } else if (vict.heldItem !== 'thermal_socks') {
                        vict.frozenTurnsRemaining = 2; vict.cooldownTurnsRemaining = 2;
                    }
                }
            }
        });
    }
    if (effectiveHeldItem === 'leach_blade') {
        const opC = pieceLanded.color === 'white' ? 'black' : 'white';
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = toRow + dr, nc = toCol + dc;
            if (isValidSquare(nr, nc)) {
                const vict = newBoard[nr][nc].piece;
                if (vict && vict.color === opC) {
                    const oldVL = vict.level;
                    vict.level = Math.max(1, (vict.level || 1) - 1);
                    if (vict.level < oldVL) levelChanges.push({ square: coordsToAlgebraic(nr, nc), delta: -1 });
                }
            }
        }
    }
    if (effectiveHeldItem === 'gravity_stone') {
        const pullChanges = triggerPull(newBoard, toRow, toCol, pieceLanded.color);
        levelChanges.push(...pullChanges);
    }
    if (shardShatter) { promotedToInfiltrator = true; obliteratedPieces.push({ ...captured, id: `shattered_${captured.id}_${Date.now()}` }); captured = null; }

    if (captured && captured.heldItem === 'smoke_bomb') {
        const backRankIdx = captured.color === 'white' ? 7 : 0;
        const candidates: AlgebraicSquare[] = [];
        for (let c = 0; c < 8; c++) {
            if (!newBoard[backRankIdx][c].piece && !newBoard[backRankIdx][c].item) {
                candidates.push(coordsToAlgebraic(backRankIdx, c));
            }
        }
        if (candidates.length > 0) {
            const dest = candidates[Math.floor(Math.random() * candidates.length)];
            const { row: dr, col: dc } = algebraicToCoords(dest);
            newBoard[dr][dc].piece = { ...captured, id: `${captured.id}_smoke_${Date.now()}`, heldItem: null, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
            smokeBombEvent = { piece: captured, square: dest };
            captured = null; 
        }
    }

    if (captured && teamActiveSets.includes('reapers_tithe')) {
      applyReapersTithe(newBoard, pieceLanded.color, captured, levelChanges);
    }
  }

  if (didLevelUpFlag && effectiveHeldItem === 'soul_link') {
    newBoard.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === pieceLanded.color && sq.piece.heldItem === 'soul_link' && sq.piece.id !== pieceLanded.id) {
        if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
            const oldSLVal = sq.piece.level;
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, (sq.piece.level || 1) + levelGainVal);
            if (sq.piece.level > oldSLVal) levelChanges.push({ square: sq.algebraic, delta: sq.piece.level - oldSLVal });
            sq.piece.isPoisoned = false; sq.piece.isExhausted = false; sq.piece.cooldownTurnsRemaining = 0;
        }
      }
    }));
  }

  if (didLevelUpFlag && teamActiveSets.includes('luminous')) {
    let lowestP: SquareState | null = null;
    let minL = 100;
    newBoard.forEach(row => row.forEach(sq => {
        if (sq.piece && sq.piece.color === pieceLanded.color && sq.piece.type !== 'king') {
            const l = sq.piece.level || 1;
            if (l < minL) {
                minL = l;
                lowestP = sq;
            }
        }
    }));
    if (lowestP && lowestP.piece) {
        const p = lowestP.piece;
        const oldL = p.level;
        p.level = Math.min(p.type === 'queen' ? 7 : 99, p.level + 1);
        if (p.level > oldL) {
            levelChanges.push({ square: lowestP.algebraic, delta: 1 });
            p.isPoisoned = false; p.isExhausted = false; p.cooldownTurnsRemaining = 0;
        }
    }
  }

  if (didLevelUpFlag) { pieceLanded.isPoisoned = false; pieceLanded.isExhausted = false; pieceLanded.cooldownTurnsRemaining = 0; }
  if (pieceLanded.isExhausted) { 
      if (pieceLanded.heldItem === 'coffee_bean') {
          pieceLanded.isExhausted = false;
          pieceLanded.cooldownTurnsRemaining = 0;
          pieceLanded.heldItem = null;
      } else {
          pieceLanded.cooldownTurnsRemaining = 2; 
      }
  }
  if (pieceLanded.heldItem === 'training_weights') {
      pieceLanded.isExhausted = true;
      pieceLanded.cooldownTurnsRemaining = 2;
  }
  if (effectiveHeldItem === 'wind_sword' && (captured || obliteratedPieces.length > 0)) {
      const { levelChanges: pushDeltas, obliterated } = triggerPushBack(newBoard, toRow, toCol, pieceLanded.color, pieceLanded);
      levelChanges.push(...pushDeltas);
      if (obliterated.length > 0) obliteratedPieces.push(...obliterated);
  }
  if (effectiveHeldItem === 'mushroom_magnet') triggerMushroomMagnet(newBoard, toRow, toCol);
  if (pieceLanded.heldItem === 'middle_way') pieceLanded.level = 3;
  if (captured?.heldItem === 'phoenix_down') {
    const emptyCells = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(!newBoard[r][c].piece && !newBoard[r][c].item) emptyCells.push(coordsToAlgebraic(r,c));
    if(emptyCells.length > 0) {
      const targetResAlg = emptyCells[Math.floor(Math.random()*emptyCells.length)];
      const {row: rr, col: rc} = algebraicToCoords(targetResAlg);
      const resPiece = { ...captured, id: `res_phx_${captured.id}_${Date.now()}`, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
      newBoard[rr][rc].piece = resPiece; phoenixResurrection = { piece: resPiece, square: targetResAlg }; captured = null;
    }
  }

  const { levelChanges: landingPushDeltas, obliterated: landingObliterated } = triggerPushBack(newBoard, toRow, toCol, pieceLanded.color, pieceLanded);
  levelChanges.push(...landingPushDeltas);
  if (landingObliterated.length > 0) obliteratedPieces.push(...landingObliterated);

  triggerToxicCloud(newBoard, toRow, toCol, pieceLanded.color);

  if ((pieceLanded.type === 'infiltrator' || assassinAtBackRank) && toRow === (pieceLanded.color === 'white' ? 0 : 7)) infiltrationWin = true;

  const hSplitTarget = (captured?.id?.startsWith('boss-hydra') ? captured : (obliteratedPieces.find(p => p.id?.startsWith('boss-hydra'))));
  if (hSplitTarget) {
      hydraSplitOccurred = true;
      const { row: cr, col: cc } = algebraicToCoords(move.to);
      const hAdj = [];
      for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = cr + dr, nc = cc + dc;
              if (isValidSquare(nr, nc)) {
                  const s = newBoard[nr][nc];
                  if (!s.piece && (!s.item || s.item.type === 'shroom')) hAdj.push({ r: nr, col: cc });
              }
          }
      }
      const hCount = Math.min(hAdj.length, 2);
      const hShuffled = hAdj.sort(() => Math.random() - 0.5);
      for (let i = 0; i < hCount; i++) {
          const pos = hShuffled[i];
          hydraSpawnSquares.push(coordsToAlgebraic(pos.r, pos.col));
          newBoard[pos.r][pos.col].piece = {
              id: `hydra_spawn_${hSplitTarget.id}_${i}_${Date.now()}`,
              type: 'knight',
              color: hSplitTarget.color,
              level: 2,
              hasMoved: true,
              isShielded: false
          };
          newBoard[pos.r][pos.col].item = null;
      }
  }

  return { newBoard, capturedPiece: captured, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel: originalLevelValue, originalPieceType: originalTypeIdentifier, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare, phoenixResurrection, reflectionOccurred, resurrectionScrollEvent, itemReturned, stolenItem, multiPromotions, ralliedSquares, winByKingsConquest, hydraSplitOccurred, hydraSpawnSquares, anvilDroppedSquares, levelChanges, obliteratedPieces, smokeBombEvent, glassShardTriggered, signalHornEvent };
}
