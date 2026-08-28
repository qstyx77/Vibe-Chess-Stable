
import type { BoardState, Piece, PieceType, PlayerColor, AlgebraicSquare, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { FRONTLINE_TYPES } from './constants';

export function algebraicToCoords(algebraic: AlgebraicSquare): { row: number, col: number } {
  if (!algebraic || typeof algebraic !== 'string' || algebraic.length < 2) return { row: 0, col: 0 };
  const col = algebraic.charCodeAt(0) - 97;
  const row = 8 - parseInt(algebraic[1]);
  return { row, col };
}

export function coordsToAlgebraic(row: number, col: number): AlgebraicSquare {
  return (String.fromCharCode(97 + col) + (8 - row)) as AlgebraicSquare;
}

export function isValidSquare(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
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
  if (item === 'queens_peace' || item === 'kings_ransom') return (type === 'queen' || type === 'king');
  if (item === 'kings_conquest') return (type === 'king');
  if (item === 'power_glove') return type === 'grappler';
  if (item === 'chameleon_cloak') return type !== 'king';
  if (['gnosis', 'mirror_shield', 'berserkers_mask', 'blast_shield', 'training_weights', 'soul_harvest', 'knights_boots', 'aura_silence', 'grappling_hook', 'golden_chalice', 'smoke_bomb', 'cyanide_pill', 'mushroom_magnet', 'thieves_gloves', 'gamblers_coin', 'sweet_revenge'].includes(item)) {
    return (type !== 'king' && type !== 'queen');
  }
  if (item === 'war_drum' || item === 'dancers_ribbon') return type === 'dancer';
  if (item === 'battering_ram') return (type === 'rook' || type === 'palace');
  if (item === 'crossbow') return type === 'archer';
  if (item === 'shortbow') return type === 'knight';
  if (item === 'sclerotia') return type === 'myco_mage';
  if (item === 'detonation_scroll') return (type !== 'king');
  if (item === 'kings_decree') return (type === 'king');
  if (item === 'monks_robe') return (type === 'bishop' || type === 'archbishop');
  if (item === 'mimic_blade' || item === 'mirror_mask') return type === 'mimic';
  if (item === 'trap_net' || item === 'oil_slick') return true;
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

export function findKing(board: BoardState, color: PlayerColor): { row: number; col: number; piece: Piece; algebraic: AlgebraicSquare } | null {
    if (color === 'black') {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.id === 'boss-colossus-tl') return { row: r, col: c, piece: board[r][c].piece!, algebraic: board[r][c].algebraic };
    }
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c].piece?.type === 'king' && board[r][c].piece?.color === color) return { row: r, col: c, piece: board[r][c].piece!, algebraic: board[r][c].algebraic };
    return null;
}
