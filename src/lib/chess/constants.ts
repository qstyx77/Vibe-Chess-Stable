
import type { PieceType } from '@/types';

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
