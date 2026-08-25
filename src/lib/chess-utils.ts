import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, SquareState, Move, ConversionEvent, ApplyMoveResult, Item, QueenLevelReducedEvent, RallyCryEvent, InventoryItemType, ItemType } from '@/types';

const pieceOrder: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export const VAL_MAP: Record<string, number> = {
  pawn: 1,
  dancer: 2,
  mimic: 2,
  grappler: 2,
  commander: 2,
  infiltrator: 2,
  myco_mage: 2,
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

export const FRONTLINE_TYPES: PieceType[] = ['pawn', 'dancer', 'mimic', 'grappler', 'commander', 'myco_mage', 'infiltrator'];

export function createEmptyBoard(): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row: SquareState[] = [];
    for (let c = 0; c < 8; c++) {
      const algebraic = String.fromCharCode(97 + c) + (8 - r) as AlgebraicSquare;
      row.push({ piece: null, item: null, algebraic, rowIndex: r, colIndex: c });
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

export function algebraicToCoords(algebraic: AlgebraicSquare): { row: number, col: number } {
  if (!algebraic || typeof algebraic !== 'string' || algebraic.length < 2) return { row: 0, col: 0 };
  const col = algebraic.charCodeAt(0) - 97;
  const row = 8 - parseInt(algebraic[1]);
  return { row, col };
}

export function coordsToAlgebraic(row: number, col: number): AlgebraicSquare {
  return (String.fromCharCode(97 + col) + (8 - row)) as AlgebraicSquare;
}

export function getPieceChar(piece: Piece | null): string {
  if (!piece) return '--';
  let char = '';
  switch (piece.type) {
    case 'pawn': char = 'P'; break;
    case 'dancer': char = 'D'; break;
    case 'mimic': char = 'M'; break;
    case 'grappler': char = 'G'; break;
    case 'myco_mage': char = 'Y'; break;
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
      if (piece) pieceHash += `${getPieceChar(piece)}L${Number(piece.level || 1)}${piece.isShielded ? 'S' : ''}${piece.isPoisoned ? 'Z' : ''}${piece.cooldownTurnsRemaining ? 'C' : ''}${piece.frozenTurnsRemaining ? 'F' : ''}${piece.heldItem || '-'}${piece.shroomMana || 0}`;
      else pieceHash += '--';
      
      if (item?.type === 'anvil') itemHash += 'A';
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

  if (piece.heldItem === 'middle_way') return 3;

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
  if (FRONTLINE_TYPES.includes(capturedPieceType)) return 2;
  if (capturedPieceType === 'queen') return 4;
  return 3;
}

export function isItemValidForPiece(item: InventoryItemType, type: PieceType): boolean {
  if (item === 'great_sword' || item === 'swift_cloak' || item === 'spore_pouch') return FRONTLINE_TYPES.includes(type);
  if (item === 'queens_peace') return (type === 'queen');
  if (item === 'kings_conquest') return (type === 'king');
  if (item === 'power_glove') return type === 'grappler';
  if (['gnosis', 'mirror_shield', 'berserkers_mask', 'blast_shield', 'training_weights', 'soul_harvest', 'knights_boots', 'aura_silence', 'grappling_hook', 'golden_chalice', 'smoke_bomb', 'cyanide_pill', 'mushroom_magnet', 'thieves_gloves'].includes(item)) {
    return (type !== 'king' && type !== 'queen');
  }
  if (item === 'war_drum') return type === 'dancer';
  if (item === 'battering_ram') return (type === 'rook' || type === 'palace');
  if (item === 'crossbow') return (type === 'archer');
  if (item === 'shortbow') return (type === 'knight');
  if (item === 'sclerotia') return (type === 'myco_mage');
  if (item === 'detonation_scroll') return (type !== 'king');
  if (item === 'kings_decree') return (type === 'king');
  if (item === 'monks_robe') return (type === 'bishop' || type === 'archbishop');
  if (item === 'mimic_blade') return type === 'mimic';
  if (item === 'trap_net') return true;
  return true;
}

export function isSilenced(board: BoardState, r: number, c: number, color: PlayerColor): boolean {
  const oppColor = color === 'white' ? 'black' : 'white';
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (isValidSquare(nr, nc)) {
        const p = board[nr][nc].piece;
        if (p && p.color === oppColor && p.heldItem === 'aura_silence') return true;
      }
    }
  }
  return false;
}

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

export function getPossibleMovesInternal(
    board: BoardState,
    fromSquare: AlgebraicSquare,
    piece: Piece,
    checkKingSafety: boolean,
    enPassantTargetSquare: AlgebraicSquare | null,
    lastMovedPieceType?: PieceType | null,
    lastMovedPieceHeldItem?: InventoryItemType | null
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
    if (piece.heldItem === 'mimic_blade' && lastMovedPieceHeldItem) {
        virtualPiece.heldItem = lastMovedPieceHeldItem;
    }
    return getPossibleMovesInternal(board, fromSquare, virtualPiece, checkKingSafety, enPassantTargetSquare, null, null);
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
        if (isValidSquare(nr, nc) && isValidSquare(nr+1, nc+1)) possible.push(coordsToAlgebraic(nr, nc));
    }
    return possible;
  }

  const hasMagicScroll = (piece.heldItem === 'wind_scroll' || piece.heldItem === 'life_leach' || piece.heldItem === 'summon_anvil' || piece.heldItem === 'shield_scroll' || piece.heldItem === 'rally_scroll' || piece.heldItem === 'antidote' || piece.heldItem === 'detonation_scroll' || piece.heldItem === 'swap_scroll' || piece.heldItem === 'ice_scroll' || piece.heldItem === 'resurrection_scroll' || piece.heldItem === 'faith_scroll' || piece.heldItem === 'kings_decree' || piece.heldItem === 'ice_blast' || piece.heldItem === 'soul_harvest' || piece.heldItem === 'earthquake_scroll' || piece.heldItem === 'demonic_possession' || piece.heldItem === 'heavy_rain' || piece.heldItem === 'trap_net');
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
                if (!board[kingRow][5].piece && (!board[kingRow][5].item || board[kingRow][5].item?.type === 'anvil') &&
                    !board[kingRow][6].piece && (!board[kingRow][6].item || board[kingRow][6].item?.type === 'anvil')) {
                    if (!isSquareAttacked(board, coordsToAlgebraic(kingRow, 4), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 5), opponentColor, false, null, enPassantTargetSquare) &&
                        !isSquareAttacked(board, coordsToAlgebraic(kingRow, 6), opponentColor, false, null, enPassantTargetSquare)) {
                        possible.push(coordsToAlgebraic(kingRow, 6));
                    }
                }
            }
            const qrSquare = board[kingRow][0];
            if ((qrSquare?.piece?.type === 'rook' || qrSquare?.piece?.type === 'palace') && !qrSquare.piece.hasMoved) {
                if (!board[kingRow][1].piece && (!board[kingRow][1].item || board[kingRow][1].item?.type === 'anvil') &&
                    !board[kingRow][2].piece && (!board[kingRow][2].item || board[kingRow][2].item?.type === 'anvil') &&
                    !board[kingRow][3].piece && (!board[kingRow][3].item || board[kingRow][3].item?.type === 'anvil')) {
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
          if (isMoveValid(board, fromSquare, to, piece, enPassantTargetSquare)) if(!possible.includes(to)) possible.push(to);
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
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (isMoveValid(board, fromSquare, coordsToAlgebraic(r,c), piece, enPassantTargetSquare)) possible.push(coordsToAlgebraic(r,c));
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

export function isValidSquare(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function isSquareAttacked(
    board: BoardState,
    squareToAttack: AlgebraicSquare,
    attackerColor: PlayerColor,
    simplifyKingCheck: boolean = false,
    ignoreAttackerAtSquare?: AlgebraicSquare | null,
    enPassantTargetSquare?: AlgebraicSquare | null,
    lastMovedPieceType?: PieceType | null,
    lastMovedPieceHeldItem?: InventoryItemType | null
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
                    const pseudoMoves = getPossibleMovesInternal(board, attackingSquareAlgebraic, attackingPiece, false, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem);
                    if (pseudoMoves.includes(squareToAttack)) if (!isPieceInvulnerableToAttack(pieceOnTargetSq, attackingPiece, targetLevel, effectiveLevel, board)) return true;
                }
            }
        }
    }
    return false;
}

export function isMoveValid(board: BoardState, from: AlgebraicSquare, to: AlgebraicSquare, piece: Piece, enPassantTargetSquare: AlgebraicSquare | null): boolean {
  const { row: fromRow, col: fromCol } = algebraicToCoords(from);
  const { row: toRow, col: toCol } = algebraicToCoords(to);
  if (!isValidSquare(toRow, toCol)) return false;
  
  const effectiveLevel = getEffectiveLevel(board, fromRow, fromCol);
  const silenced = isSilenced(board, fromRow, fromCol, piece.color);
  if (from === to && !silenced && !((piece.type === 'knight' || piece.type === 'hero' || piece.type === 'archer') && effectiveLevel >= 5) && !(['wind-scroll', 'life-leach', 'summon-anvil', 'shield-scroll', 'rally-scroll', 'antidote', 'swap-scroll', 'ice-scroll', 'resurrection-scroll', 'faith-scroll', 'kings-decree', 'ice-blast', 'soul-harvest', 'earthquake-scroll', 'myco-propagate', 'tele-portobello', 'spore-bomb', 'raise-mycelimen', 'demonic-possession', 'heavy-rain', 'trap-net'].includes(piece.heldItem || '')) && piece.type !== 'myco_mage') return false;

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
      
      const isHomeRank = (piece.color === 'white' && (fromRow === 6 || fromRow === 7)) || (piece.color === 'black' && (fromRow === 0 || fromRow === 1));
      const canJumpStart = (!piece.hasMoved && isHomeRank) || piece.heldItem === 'swift_cloak';
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

export function syncSoulLink(board: BoardState | any[][], color: PlayerColor) {
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
}

export function processPoisonDamage(board: BoardState, currentPlayer: PlayerColor): { newBoard: BoardState, poisonedCaptures: Piece[] } {
  const newBoard = board.map(row => row.map(sq => ({ ...sq, piece: sq.piece ? { ...sq.piece } : null, item: sq.item ? {...sq.item} : null })));
  const poisonedCaptures: Piece[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = newBoard[r][c].piece;
      if (p && p.color === currentPlayer && p.isPoisoned) {
        const currentL = p.level || 1;
        if (currentL > 1) {
          p.level = currentL - 1;
        } else {
          poisonedCaptures.push({ ...p });
          newBoard[r][c].piece = null;
        }
      }
    }
  }
  return { newBoard, poisonedCaptures };
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

export function applyMove(board: BoardState, move: Move, enPassantTargetSquare: AlgebraicSquare | null, graveyard?: { white: Piece[], black: Piece[] }, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null): ApplyMoveResult {
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
  let promotedToHero = false;
  let infiltrationWin = false;
  let shroomConsumed = false;
  let extraTurn = false;
  let specialCaptureSquare: AlgebraicSquare | null = null;
  const selfDestructCaptures: Piece[] = [];
  let destroyedAnvils = 0;
  let phoenixResurrection: { piece: Piece, square: AlgebraicSquare } | undefined = undefined;
  let reflectionOccurred = false;
  let resurrectionScrollEvent: { piece: Piece, square: AlgebraicSquare } | undefined = undefined;
  let itemReturned: InventoryItemType | null = null;
  const multiPromotions: { square: AlgebraicSquare, targetLevel: number }[] = [];
  let ralliedSquares: AlgebraicSquare[] = [];
  let winByKingsConquest = false;

  const movingPiece = newBoard[fromRow][fromCol].piece;
  if (!movingPiece) return { newBoard: board, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel: 0, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare };

  let effectiveHeldItem = movingPiece.heldItem;
  if (movingPiece.type === 'mimic' && movingPiece.heldItem === 'mimic_blade' && lastMovedPieceHeldItem) {
    effectiveHeldItem = lastMovedPieceHeldItem;
  }

  if (move.type === 'trap-net') {
      triggerExhaustion(newBoard, fromRow, fromCol, movingPiece.color);
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'demonic-possession') {
      movingPiece.level = Math.min(movingPiece.type === 'queen' ? 7 : 99, (movingPiece.level || 1) + 5);
      movingPiece.obliterationTurnsRemaining = 4;
      movingPiece.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'heavy-rain') {
      const empty = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) empty.push({r,c});
      const shuffled = empty.sort(() => Math.random() - 0.5).slice(0, 3);
      shuffled.forEach(pos => { newBoard[pos.r][pos.c].item = { type: 'anvil' }; });
      newBoard[fromRow][fromCol].piece!.heldItem = null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'myco-propagate') {
      const empty = [];
      for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (!newBoard[r][c].piece && !newBoard[r][c].item) empty.push({r,c});
      const shuffled = empty.sort(() => Math.random() - 0.5).slice(0, 5);
      shuffled.forEach(pos => { newBoard[pos.r][pos.c].item = { type: 'shroom' }; });
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color && sq.piece.type === 'myco_mage') sq.piece.shroomMana = Math.max(0, (sq.piece.shroomMana || 0) - 1); }));
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: true, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null, multiPromotions };
  }

  if (move.type === 'grapple-hook-swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: 0, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
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
      newBoard[toRow][toCol].item = anvilItem;
      newBoard[fromRow][fromCol].piece = null;
      newBoard[anvilRow][anvilCol].piece = { ...movingPiece, hasMoved: true };
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: movingPiece.level, originalPieceType: movingPiece.type, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn: false, specialCaptureSquare: null };
  }

  if (move.type === 'grapple-throw') {
      if (move.thrownItem === 'anvil') {
          newBoard[fromRow][fromCol].piece = { ...movingPiece, hasMoved: true };
          const victim = newBoard[toRow][toCol].piece;
          if (victim && victim.type !== 'king' && !victim.isShielded) {
              pieceCapturedByAnvil = { ...victim };
              newBoard[toRow][toCol].piece = null;
          }
          newBoard[toRow][toCol].item = { type: 'anvil' };
      } else {
          const thrown = move.thrownPiece!;
          newBoard[toRow][toCol].piece = { ...thrown, hasMoved: true };
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
    const p2 = newBoard[toRow][toCol].piece!;
    if (p1.heldItem === 'war_drum') {
        if (p2.color === p1.color) { if (p2.type !== 'queen' || p2.level < 7) p2.level = Math.min(p2.type === 'queen' ? 7 : 99, (p2.level || 1) + 1); }
        else { p2.cooldownTurnsRemaining = 2; }
    }
    newBoard[fromRow][fromCol].piece = p2; newBoard[toRow][toCol].piece = p1;
    return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: 0, originalPieceType: 'dancer', selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'kings-decree') {
    const { row: pr, col: pc } = algebraicToCoords(move.to);
    if (newBoard[pr][pc].piece && newBoard[pr][pc].piece!.type === 'pawn' && newBoard[pr][pc].piece!.level === 1) {
      newBoard[pr][pc].piece!.type = 'commander';
    }
    newBoard[fromRow][fromCol].piece!.heldItem = null;
    return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare, resurrectionScrollEvent };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'swap-scroll') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2;
      newBoard[toRow][toCol].piece = p1;
      if (newBoard[toRow][toCol].piece) newBoard[toRow][toCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'swap') {
      const p1 = newBoard[fromRow][fromCol].piece;
      const p2 = newBoard[toRow][toCol].piece;
      newBoard[fromRow][fromCol].piece = p2 ? { ...p2, hasMoved: true, isShielded: false } : null;
      newBoard[toRow][toCol].piece = p1 ? { ...p1, hasMoved: true, isShielded: false } : null;
      return { newBoard, capturedPiece: null, selfDestructCaptures: null, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel: 0, originalPieceType: originalPieceType, selfCheckByPushBack: false, queenLevelReducedEvents: null, promotedToInfiltrator: false, promotedToHero: false, infiltrationWin: false, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare: null };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'wind-scroll') {
      const crush = triggerPushBack(newBoard, toRow, toCol, movingPiece.color);
      if (crush) pieceCapturedByAnvil = crush;
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: crush, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: crush, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'summon-anvil') {
      newBoard[toRow][toCol].item = { type: 'anvil' };
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'shield-scroll') {
      const { row: tr, col: tc } = algebraicToCoords(move.to);
      if (newBoard[tr][tc].piece) newBoard[tr][tc].piece!.isShielded = true;
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
  }

  if (move.type === 'rally-scroll') {
      ralliedSquares = applyRally(newBoard, movingPiece.color, 'all', move.from);
      newBoard[fromRow][fromCol].piece!.level = 1; 
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare, ralliedSquares };
  }

  if (move.type === 'antidote') {
      newBoard.forEach(row => row.forEach(sq => { if (sq.piece && sq.piece.color === movingPiece.color) { sq.piece.isPoisoned = false; sq.piece.cooldownTurnsRemaining = 0; } }));
      newBoard[fromRow][fromCol].piece!.heldItem = null; 
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils: 0, pieceCapturedByAnvil: null, anvilPushedOffBoard, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
      return { newBoard, capturedPiece: null, selfDestructCaptures, destroyedAnvils, pieceCapturedByAnvil: null, anvilPushedOffBoard: false, conversionEvents, rallyCryTriggered, originalPieceLevel, originalPieceType, selfCheckByPushBack, queenLevelReducedEvents: null, promotedToInfiltrator, promotedToHero, infiltrationWin, shroomConsumed: false, enPassantTargetSet: null, extraTurn, specialCaptureSquare };
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
  const oppBackRankIdx = pieceToLand.color === 'white' ? 0 : 7;
  if (pieceToLand.type === 'commander' && toRow === oppBackRankIdx && move.type !== 'self-destruct') {
    pieceToLand.type = 'hero'; pieceToLand.id = `${pieceToLand.id}_hero_auto_${Date.now()}`;
    if (originalEffectiveLevelBeforeMove >= 5) extraTurn = true;
    promotedToHero = true;
  } else if (FRONTLINE_TYPES.includes(pieceToLand.type) && toRow === oppBackRankIdx && move.type !== 'self-destruct' && !promotedToInfiltrator) {
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
        if (sq.piece.type !== 'queen' || sq.piece.level < 7) sq.piece.level = Math.min(sq.piece.type === 'queen' ? 7 : 99, (sq.piece.level || 1) + levelGain);
      }
    }));
  }
  if (didLevelUp) { pieceToLand.isPoisoned = false; pieceToLand.cooldownTurnsRemaining = 0; pieceToLand.frozenTurnsRemaining = 0; }
  if (pieceToLand.isPoisoned && pieceToLand.level === 1) pieceToLand.cooldownTurnsRemaining = 2;
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

export function triggerPushBack(board: BoardState, r: number, c: number, color: PlayerColor): Piece | null {
  let crushed: Piece | null = null;
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    if(dr===0 && dc===0) continue;
    const nr = r+dr; const nc = c+dc;
    if(isValidSquare(nr, nc)) {
      const victim = board[nr][nc];
      if(victim.item?.type === 'anvil' || (victim.piece && (color === 'neutral' as any || victim.piece.color !== color))) {
        if(victim.piece?.heldItem === 'passive_armor' || victim.piece?.heldItem === 'lead_boots') continue;
        const tr = nr+dr; const dc_dest = nc+dc;
        if(!isValidSquare(tr, dc_dest)) { if(victim.item) board[nr][nc].item = null; }
        else {
          const dest = board[tr][dc_dest];
          if (victim.item?.type === 'anvil') {
             if (dest.piece && dest.piece.type !== 'king' && !dest.piece.isShielded) { crushed = { ...dest.piece }; dest.piece = null; board[tr][dc_dest].item = victim.item; board[nr][nc].item = null; } 
             else if (!dest.piece && !dest.item) { board[tr][dc_dest].item = victim.item; board[nr][nc].item = null; }
          } else if(!dest.piece && !dest.item) { board[tr][dc_dest].piece = victim.piece; board[nr][nc].piece = null; }
        }
      }
    }
  }
  return crushed;
}

export function processRookResurrectionCheck(board: BoardState, player: PlayerColor, move: Move, square: AlgebraicSquare, oldL: number, graveyard: { white: Piece[], black: Piece[] }, idCounter: number): RookResurrectionResult {
  const { row: r, col: c } = algebraicToCoords(square);
  const piece = board[r][c].piece;
  if (!piece || !['rook', 'palace'].includes(piece.type) || piece.color !== player) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
  const effectiveLevel = getEffectiveLevel(board, r, c);
  if (effectiveLevel >= 4 && effectiveLevel > oldL) {
    const myPile = player; 
    if (!graveyard[myPile] || graveyard[myPile].length === 0) return { boardWithResurrection: board, capturedPiecesAfterResurrection: graveyard, resurrectionPerformed: false, newResurrectionIdCounter: idCounter };
    const sorted = [...graveyard[myPile]].sort((a,b) => (VAL_MAP[b.type] || 0) - (VAL_MAP[a.type] || 0));
    const choice = sorted[0];
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
    if (color === 'black') {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.id === 'boss-colossus-tl') return { row: r, col: c, piece: board[r][c].piece! };
    }
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === color) return { row: r, col: c, piece: board[r][c].piece! };
    return null;
}

export function isQueenSacrificeRequired(board: BoardState, player: PlayerColor, move: Move, originalLevel: number, originalType: PieceType): boolean {
    const { row: toR, col: toC } = algebraicToCoords(move.to);
    const piece = board[toR]?.[toC]?.piece;
    if (!piece || piece.type !== 'queen' || piece.color !== player || originalType !== 'queen') return false;
    if (piece.level === 7 && originalLevel < 7) return board.flat().some(sq => sq.piece?.color === player && FRONTLINE_TYPES.includes(sq.piece.type));
    return false;
}

export function isKingInCheck(board: BoardState, kingColor: PlayerColor, enPassantTargetSquare: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null): boolean {
  if (kingColor === 'black') {
      const colossusParts = board.flat().filter(sq => sq.piece?.id.startsWith('boss-colossus'));
      if (colossusParts.length > 0) {
          const otherMinions = board.flat().some(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
          if (otherMinions) return false;
          return colossusParts.some(part => isSquareAttacked(board, part.algebraic, 'white', false, null, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem));
      }
  }
  let k = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === kingColor) k = coordsToAlgebraic(r,c);
  if (!k) return false;
  return isSquareAttacked(board, k, kingColor === 'white' ? 'black' : 'white', false, null, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem);
}

export function hasAnyLegalMoves(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null): boolean {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.color === color && getPossibleMoves(board, board[r][c].algebraic, ep, lastMovedPieceType, lastMovedPieceHeldItem).length > 0) return true;
  return false;
}

export function isCheckmate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null): boolean {
  return isKingInCheck(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem) && !hasAnyLegalMoves(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem);
}

export function isStalemate(board: BoardState, color: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null): boolean {
  return !isKingInCheck(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem) && !hasAnyLegalMoves(board, color, ep, lastMovedPieceType, lastMovedPieceHeldItem);
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
            if(victim && victim.color !== attackerColor) victim.isPoisoned = true;
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
            if (sq.piece.level > oldLevel) rallied.push(sq.algebraic);
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

export interface RookResurrectionResult {
  boardWithResurrection: BoardState;
  capturedPiecesAfterResurrection: { white: Piece[], black: Piece[] };
  resurrectionPerformed: boolean;
  resurrectedPieceData?: Piece;
  resurrectedSquareAlg?: AlgebraicSquare;
  newResurrectionIdCounter?: number;
  promotionRequiredForResurrectedPawn?: boolean;
}

export function getPossibleMoves(board: BoardState, from: AlgebraicSquare, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, grappledItem?: ItemType | null): AlgebraicSquare[] {
    const { row, col } = algebraicToCoords(from);
    const piece = board[row][col].piece;
    if (!piece || (piece.cooldownTurnsRemaining || 0) > 0 || (piece.frozenTurnsRemaining || 0) > 0) return [];
    
    const pseudo = getPossibleMovesInternal(board, from, piece, true, ep, lastMovedPieceType, lastMovedPieceHeldItem);
    
    const filteredPseudo = pseudo.filter(to => {
        const {row: tr, col: tc} = algebraicToCoords(to);
        const target = board[tr][tc].piece;
        if (piece.id.startsWith('boss-colossus')) return true;
        if (grappledItem === 'anvil') return true; 
        return target?.type !== 'king';
    });

    const legalMoves = filterLegalMoves(board, from, filteredPseudo, piece.color, ep, lastMovedPieceType, lastMovedPieceHeldItem, grappledItem);
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

export function filterLegalMoves(board: BoardState, from: AlgebraicSquare, pseudo: AlgebraicSquare[], player: PlayerColor, ep: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, grappledItem?: ItemType | null): AlgebraicSquare[] {
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
                           const isSafe = !isKingInCheck(boardWithPickup, player, ep, lastMovedPieceType, lastMovedPieceHeldItem);
                           boardWithPickup[r][c].item = null; boardWithPickup[r][c].piece = oldPiece;
                           if (isSafe) return true;
                        } else if (pickedPieceData) {
                           boardWithPickup[r][c].piece = { ...pickedPieceData, hasMoved: true };
                           const isSafe = !isKingInCheck(boardWithPickup, player, ep, lastMovedPieceType, lastMovedPieceHeldItem);
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
    const applyResult = applyMove(board, { from, to, type }, ep);
    return !isKingInCheck(applyResult.newBoard, player, ep, lastMovedPieceType, lastMovedPieceHeldItem);
  });
}