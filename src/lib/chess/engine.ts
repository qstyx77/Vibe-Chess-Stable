
import type { BoardState, Piece, PlayerColor, AlgebraicSquare, Move, ApplyMoveResult, InventoryItemType, PieceType, ItemType, SquareState } from '@/types';
import { VAL_MAP, FRONTLINE_TYPES } from './constants';
import { algebraicToCoords, coordsToAlgebraic, isValidSquare, getEffectiveLevel, isSilenced, getPromotionLevel, findKing, isItemValidForPiece } from './utils';
import { triggerPushBack, triggerConversion, applyRally, applyKingDominion, syncSoulLink, triggerPoisonSplash, triggerMushroomMagnet, triggerPull, triggerExhaustion, applyOilSlide } from './effects';

export function createEmptyBoard(): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, item: null, algebraic, rowIndex: r, colIndex: c, oilSlickTurnsRemaining: 0 });
    }
    board.push(row);
  }
  return board;
}

export function initializeBoard(
  whiteElo: number = 1200, 
  blackElo: number = 1200, 
  whiteUnlocks: string[] = [],
  blackUnlocks: string[] = []
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

export function applyMove(board: BoardState, move: Move, enPassantTargetSquare: AlgebraicSquare | null, graveyard?: { white: Piece[], black: Piece[] }, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, lastMovedPieceLevel?: number | null, didOpponentCaptureLastTurn?: boolean): ApplyMoveResult {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null })));
  let enPassantTargetSet: AlgebraicSquare | null = null;
  const { row: fromRow, col: fromCol } = algebraicToCoords(move.from);
  const { row: toRow, col: toCol } = algebraicToCoords(move.to);
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
  const selfDestructCaptures: Piece[] = [];
  let destroyedAnvils = 0;
  let phoenixResurrection = undefined;
  let reflectionOccurred = false;
  let resurrectionScrollEvent = undefined;
  let itemReturned: InventoryItemType | null = null;
  const multiPromotions: { square: AlgebraicSquare, targetLevel: number }[] = [];
  let ralliedSquares: AlgebraicSquare[] = [];
  let winByKingsConquest = false;

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare };

  let effectiveHeldItem = movingPiece.heldItem;
  if (movingPiece.type === 'mimic') {
    if (movingPiece.heldItem === 'mirror_mask' || (movingPiece.heldItem === 'mimic_blade' && lastMovedPieceHeldItem)) {
      effectiveHeldItem = lastMovedPieceHeldItem || null;
    }
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
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
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
              victimSq.piece = null;
          }
          if (stepR === toRow && stepC === toCol) break;
          stepR += dr; stepC += dc;
      }
      
      const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
      if (slideResult.crushed) pieceCapturedByAnvil = slideResult.crushed;
      newBoard[slideResult.r][slideResult.c].item = anvilItem;
      newBoard[fromRow][fromCol].piece = null;
      newBoard[anvilRow][anvilCol].piece = { ...movingPiece, hasMoved: true };
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'grapple-throw') {
      if (move.thrownItem === 'anvil') {
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true };
          const dr = Math.sign(toRow - fromRow);
          const dc = Math.sign(toCol - fromCol);
          const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
          const victim = newBoard[slideResult.r][slideResult.c].piece;
          if (victim && victim.type !== 'king' && !victim.isShielded) {
              pieceCapturedByAnvil = { ...victim };
              newBoard[slideResult.r][slideResult.c].piece = null;
          }
          newBoard[slideResult.r][slideResult.c].item = { type: 'anvil' };
      } else {
          const thrown = move.thrownPiece!;
          const dr = Math.sign(toRow - fromRow);
          const dc = Math.sign(toCol - fromCol);
          const slideResult = applyOilSlide(newBoard, toRow, toCol, dr, dc);
          newBoard[slideResult.r][slideResult.c].piece = { ...thrown, hasMoved: true };
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true }; 
      }
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: movingPiece.level, originalPieceType: 'grappler', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (movingPiece.id.startsWith('boss-colossus')) {
      const parts = [{ id: 'boss-colossus-tl', dr: 0, dc: 0 },{ id: 'boss-colossus-tr', dr: 0, dc: 1 },{ id: 'boss-colossus-bl', dr: 1, dc: 0 },{ id: 'boss-colossus-br', dr: 1, dc: 1 }];
      const opponentColor = movingPiece.color === 'white' ? 'black' : 'white';
      let curTL_R = -1, curTL_C = -1;
      for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(newBoard[r][c].piece?.id === 'boss-colossus-tl') { curTL_R = r; curTL_C = c; break; }
      parts.forEach(p => { if (isValidSquare(curTL_R + p.dr, curTL_C + p.dc)) newBoard[curTL_R + p.dr][curTL_C + p.dc].piece = null; });
      parts.forEach(p => {
          const nr = toRow + p.dr; const nc = toCol + p.dc;
          if (isValidSquare(nr, nc)) {
              const victim = newBoard[nr][nc].piece;
              if (victim && victim.color === opponentColor) {
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
    const targetSq = newBoard[toRow][toCol];
    const p2 = targetSq.piece;
    const it2 = targetSq.item;

    if (p1.heldItem === 'war_drum' && p2) {
        if (p2.color === p1.color) { if (p2.type !== 'queen' || p2.level < 7) p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1); }
        else { p2.cooldownTurnsRemaining = 2; }
    }
    
    newBoard[toRow][toCol].piece = { ...p1, hasMoved: true };
    newBoard[toRow][toCol].item = null;
    newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
    newBoard[fromRow][fromCol].item = it2;

    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: 'dancer', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  const originalPieceLevel = Number(movingPiece.level || 1);
  const originalPieceType = movingPiece.type;
  const originalEffectiveLevelBeforeMove = getEffectiveLevel(board, fromRow, fromCol);
  const targetPiece = newBoard[toRow][toCol].piece;
  const targetItem = newBoard[toRow][toCol].item;

  if (move.type === 'ice-blast') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.color === oppColor) { victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2; }
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'kings-decree') {
    const { row: pr, col: pc } = algebraicToCoords(move.to);
    if (newBoard[pr][pc].piece && newBoard[pr][pc].piece!.type === 'pawn' && newBoard[pr][pc].piece!.level === 1) {
      newBoard[pr][pc].piece!.type = 'commander';
    }
    newBoard[fromRow][fromCol].piece!.heldItem = null;
    return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare, resurrectionScrollEvent };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'ice-scroll') {
      const oppColor = movingPiece.color === 'white' ? 'black' : 'white';
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
        if(dr===0 && dc===0) continue;
        const nr=fromRow+dr; const nc=fromCol+dc;
        if(isValidSquare(nr,nc)) {
          const victim = newBoard[nr][nc].piece;
          if(victim && victim.color === oppColor) { victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2; }
        }
      }
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'swap-scroll') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      if (newBoard[toRow][toCol].piece) newBoard[toRow][toCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  if (move.type === 'swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
      newBoard[toRow][toCol].piece = p1 ? { ...p1, hasMoved: true, isShielded: false } : null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel: 0, originalPieceType: originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.heldItem === 'mirror_shield' && movingPiece.type !== 'king' && movingPiece.type !== 'queen') {
      const reflectedAttacker = { ...movingPiece };
      newBoard[fromRow][fromCol].piece = null; 
      newBoard[toRow][toCol].piece!.heldItem = null; 
      const defender = newBoard[toRow][toCol].piece!;
      let gain = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[reflectedAttacker.type] || 0;
      defender.level = Math.min(defender.type === 'queen' ? 7 : 99, (defender.level || 1) + gain);
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
      if (newBoard[tr][tc].piece) newBoard[tr][tc].piece!.isShielded = true;
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
                  selfDestructCaptures.push({ ...victim.piece, id: `${victim.piece.id}_sd_${Date.now()}` });
                  victim.piece = null;
              }
          }
      }
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents: [], rallyCryTriggered: null, originalPieceLevel, originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
  }

  let captured: Piece | null = null;
  if(move.type === 'enpassant') {
    const cpR = fromRow; const cpC = toCol;
    captured = newBoard[cpR][cpC].piece;
    if (captured && FRONTLINE_TYPES.includes(captured.type)) {
        newBoard[cpR][cpC].piece = null;
        specialCaptureSquare = coordsToAlgebraic(cpR, cpC);
    } else { captured = null; }
  } else if (targetPiece && targetPiece.color !== movingPiece.color && targetPiece.type !== 'king') { 
      captured = { ...targetPiece }; 
  }

  const pieceToLand = { ...movingPiece, isShielded: false, hasMoved: true };
  
  if (pieceToLand.type === 'mimic' && pieceToLand.heldItem === 'mirror_mask' && lastMovedPieceLevel) {
      pieceToLand.level = lastMovedPieceLevel;
      if (lastMovedPieceHeldItem) pieceToLand.heldItem = lastMovedPieceHeldItem;
  }

  const backRankIdx = pieceToLand.color === 'white' ? 0 : 7;
  if (pieceToLand.type === 'commander' && toRow === backRankIdx && move.type !== 'self-destruct') {
    pieceToLand.type = 'hero'; pieceToLand.id = `${pieceToLand.id}_hero_auto_${Date.now()}`;
    if (originalEffectiveLevelBeforeMove >= 5) extraTurn = true;
    promotedToHero = true;
  } else if (FRONTLINE_TYPES.includes(pieceToLand.type) && toRow === backRankIdx && move.type !== 'self-destruct' && !promotedToInfiltrator) {
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
    if (effectiveHeldItem === 'chameleon_cloak' && pieceToLand.type !== 'king') {
        pieceToLand.type = captured.type;
        pieceToLand.id = `${pieceToLand.id}_morph_${Date.now()}`;
    }
    if (captured.heldItem === 'ice_tunic') { pieceToLand.frozenTurnsRemaining = 2; pieceToLand.cooldownTurnsRemaining = 2; }
    if (captured.heldItem === 'trap_net') { triggerExhaustion(newBoard, toRow, toCol, pieceToLand.color); }
    if (['pawn', 'dancer', 'mimic', 'grappler', 'myco_mage'].includes(pieceToLand.type) && captured.type === 'commander') pieceToLand.type = 'commander';
    let gain = effectiveHeldItem === 'berserkers_mask' ? 3 : ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[captured.type] || 0);
    
    if (effectiveHeldItem === 'great_sword') {
        const dr = toRow - fromRow;
        const dc = toCol - fromCol;
        if (dr === 0 || dc === 0) {
            const behindR = toRow + Math.sign(dr);
            const behindC = toCol + Math.sign(dc);
            if (isValidSquare(behindR, behindC)) {
                const behindSq = newBoard[behindR][behindC];
                if (behindSq.piece && behindSq.piece.color !== movingPiece.color && behindSq.piece.type !== 'king') {
                    const cleaveGain = ({pawn: 1, dancer: 1, mimic: 1, grappler: 1, commander: 1, infiltrator: 1, myco_mage: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[behindSq.piece.type] || 0);
                    gain += cleaveGain;
                    selfDestructCaptures.push({ ...behindSq.piece, id: `${behindSq.piece.id}_cleave_${Date.now()}` });
                    newBoard[behindR][behindC].piece = null;
                }
            }
        }
    }

    if (captured.heldItem === 'cyanide_pill') gain = 0;
    if (effectiveHeldItem === 'gnosis') gain += 1;
    if (effectiveHeldItem === 'golden_chalice') gain += 1;
    if (effectiveHeldItem === 'sweet_revenge' && didOpponentCaptureLastTurn) gain += 1;

    if (effectiveHeldItem === 'gamblers_coin') {
        if (Math.random() < 0.5) gain *= 2;
        else gain = 0;
    }

    const oldL = pieceToLand.level || 1;
    if (pieceToLand.type === 'queen') { if (oldL < 7) { pieceToLand.level = Math.min(7, oldL + gain); didLevelUp = true; levelGain = pieceToLand.level - oldL; } }
    else { pieceToLand.level = oldL + gain; didLevelUp = true; levelGain = gain; }
    if (originalPieceType === 'commander') { ralliedSquares = applyRally(newBoard, pieceToLand.color, 'pawn', move.to); rallyCryTriggered = { square: move.to, color: pieceToLand.color }; }
    if (originalPieceType === 'hero') { ralliedSquares = applyRally(newBoard, pieceToLand.color, 'all', move.to); rallyCryTriggered = { square: move.to, color: pieceToLand.color }; }
    if (pieceToLand.type === 'king') applyKingDominion(newBoard, pieceToLand.color, gain);
    if (effectiveHeldItem === 'poison_sword') triggerPoisonSplash(newBoard, toRow, toCol, pieceToLand.color);
    if (captured.heldItem === 'poison_tunic') pieceToLand.isPoisoned = true;
    if (effectiveHeldItem === 'ice_sword') {
        const oppColor = pieceToLand.color === 'white' ? 'black' : 'white';
        [[0,1], [0,-1], [1,0], [-1,0]].forEach(([dr, dc]) => {
            const nr = toRow + dr, nc = toCol + dc;
            if (isValidSquare(nr, nc)) {
                const victim = newBoard[nr][nc].piece;
                if (victim && victim.color === oppColor) { victim.frozenTurnsRemaining = 2; victim.cooldownTurnsRemaining = 2; }
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
  }

  if (didLevelUp && effectiveHeldItem === 'soul_link') {
    newBoard.forEach(row => row.forEach(sq => {
      if (sq.piece && sq.piece.color === pieceToLand.color && sq.piece.heldItem === 'soul_link' && sq.piece.id !== pieceToLand.id) {
        if (sq.piece.type !== 'queen' || sq.piece.level < 7) {
            sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, (sq.piece.level || 1) + levelGain);
            // Levels gained via Soul Link also clear statuses (but NOT Frozen)
            sq.piece.isPoisoned = false;
            sq.piece.isExhausted = false;
            sq.piece.cooldownTurnsRemaining = 0;
        }
      }
    }));
  }

  if (didLevelUp) { 
    pieceToLand.isPoisoned = false; 
    pieceToLand.isExhausted = false;
    pieceToLand.cooldownTurnsRemaining = 0; 
  }

  // Exhaustion cadence: If exhausted, moving triggers a cooldown for the following turn cycle.
  if (pieceToLand.isExhausted) {
    pieceToLand.cooldownTurnsRemaining = 2; // Set to 2 so it is 1 at start of next turn (blocked)
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
  const effectiveLevelAfterMove = getEffectiveLevel(newBoard, toRow, toCol);
  if ((FRONTLINE_TYPES.includes(pieceToLand.type) || effectiveHeldItem === 'wind_cloak') && effectiveLevelAfterMove >= 4) {
    const crush = triggerPushBack(newBoard, toRow, toCol, pieceToLand.color);
    if (crush) pieceCapturedByAnvil = crush;
  }
  if ((['bishop', 'archbishop'].includes(pieceToLand.type)) && effectiveLevelAfterMove >= 5) triggerConversion(newBoard, toRow, toCol, pieceToLand.color, pieceToLand, conversionEvents);
  if (pieceToLand.type === 'infiltrator' && toRow === (pieceToLand.color === 'white' ? 0 : 7)) infiltrationWin = true;
  return { newBoard, capturedPiece: captured, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet, extraTurn, specialCaptureSquare, phoenixResurrection, reflectionOccurred, resurrectionScrollEvent, itemReturned, multiPromotions, ralliedSquares, winByKingsConquest };
}

export function processRookResurrectionCheck(board: BoardState, player: PlayerColor, move: Move, square: AlgebraicSquare, oldL: number, graveyard: { white: Piece[], black: Piece[] }, idCounter: number) {
  const { row: r, col: c } = algebraicToCoords(square);
  const piece = board[r][c].piece;
  if (!piece || !['rook', 'palace'].includes(piece.type) || piece.color !== player) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
  const effectiveLevel = getEffectiveLevel(board, r, c);
  if (effectiveLevel >= 4 && effectiveLevel > oldL) {
    const myPile = player; 
    if (!graveyard[myPile] || graveyard[myPile].length === 0) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
    const sorted = [...graveyard[myPile]].sort((a,b) => (VAL_MAP[b.type] || 0) - (VAL_MAP[a.type] || 0))[0];
    const choice = sorted;
    if (choice) {
      const adj = [];
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) if(dr!==0 || dc!==0) {
        const nr=r+dr; const nc=c+dc; if(isValidSquare(nr,nc) && !board[nr][nc].piece && !board[nr][nc].item) adj.push(coordsToAlgebraic(nr,nc));
      }
      if (adj.length > 0) {
        const target = adj[Math.floor(Math.random()*adj.length)];
        const {row: rr, col: rc} = algebraicToCoords(target);
        const res = { ...choice, level: piece.type === 'palace' ? choice.level : 1, id: `${choice.id}_res_${idCounter}`, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
        const oppBackRank = player === 'white' ? 0 : 7;
        if (res.type === 'commander' && rr === oppBackRank) { res.type = 'hero'; res.id = `${res.id}_hero_res_${Date.now()}`; }
        board[rr][rc].piece = res;
        const newG = { ...graveyard, [myPile]: graveyard[myPile].filter(p => p.id !== choice.id) };
        return { boardWithResurrection: board, capturedPiecesAfterResurrection: newG, resurrectionPerformed: true, resurrectedPieceData: res, resurrectedSquareAlg: target, newResurrectionIdCounter: idCounter+1, promotionRequiredForResurrectedPawn: FRONTLINE_TYPES.includes(res.type) && rr === oppBackRank };
      }
    }
  }
  return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
}
