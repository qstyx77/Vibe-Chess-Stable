'use client';

import type { Piece, PieceType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { ItemSprite } from './ItemSprite';

interface PieceAbilitiesInfoProps {
  piece: Piece;
}

const getPieceAbilities = (piece: Piece): string[] => {
  const { type, level } = piece;
  const abilities: string[] = [];
  const l = level || 1;

  switch (type) {
    case 'pawn':
    case 'commander':
      if (l >= 1) abilities.push("Standard pawn move/capture.");
      if (l >= 2) abilities.push("Can move 1 square backward.");
      if (l >= 3) abilities.push("Can move 1 square sideways.");
      if (l >= 4) abilities.push("Push-Back adjacent entities.");
      if (l >= 5) abilities.push("Promotion grants extra turn.");
      if (type === 'commander') {
          abilities.push("Rallying Cry on capture (levels up other pawns).");
          abilities.push("Promotes to Hero.");
          abilities.push("Queen Hunter.");
      }
      break;
    case 'infiltrator':
      abilities.push("Moves/captures 1 square forward or diagonally forward.");
      abilities.push("Obliterates captured pieces.");
      abilities.push("Wins game on back rank.");
      abilities.push("Queen Hunter.");
      break;
    case 'knight':
    case 'hero':
    case 'archer':
      if (l >= 1) abilities.push("Standard L-shape move.");
      if (l >= 2) abilities.push("Can move 1 square cardinally.");
      if (l >= 3) abilities.push("Can jump 3 squares cardinally.");
      if (l >= 4) abilities.push("Swap with friendly Bishop.");
      if (l >= 5) abilities.push("Self-Destruct ability.");
      if (type === 'hero') {
          abilities.push("Hero's Rallying Cry on capture (levels up all other pieces).");
          abilities.push("Queen Hunter.");
      }
      if (type === 'archer') {
          abilities.push("Archer Snipe: KS 5 grants global Level 1 capture.");
      }
      break;
    case 'bishop':
    case 'archbishop':
      if (l >= 1) abilities.push("Standard diagonal move.");
      if (l >= 2) abilities.push("Phase through friendly pieces.");
      if (l >= 3) abilities.push("Immune to Pawn/Commander/Infiltrator capture.");
      if (l >= 4) abilities.push("Swap with friendly Knight/Hero/Archer.");
      if (l >= 5) abilities.push("50% chance to Convert adjacent enemies.");
      if (type === 'archbishop') {
        abilities.push("Holy Shield: KS 2 grants protection to an ally.");
      }
      break;
    case 'rook':
    case 'palace':
      abilities.push("Standard horizontal/vertical move.");
      if (l >= 4) abilities.push("Resurrects piece on level up via capture.");
      if (type === 'palace') {
        abilities.push("Master Resurrector: Allies return at their original level.");
        abilities.push("Royal Sanctuary: Castling levels up the King.");
      }
      break;
    case 'queen':
      abilities.push("Standard Queen movement.");
      if (l >= 7) abilities.push("Invulnerable to lower-level attackers (except special units). Requires Pawn/Commander sacrifice.");
      break;
    case 'king':
      if (l >= 1) abilities.push("Standard king move/capture.");
      if (l >= 2) abilities.push("Can move/capture up to 2 squares.");
      if (l >= 5) abilities.push("Gains Knight's L-shape move.");
      abilities.push("Reduces enemy Queen levels on King level up.");
      break;
  }

  return abilities;
};

export function PieceAbilitiesInfo({ piece }: PieceAbilitiesInfoProps) {
  const abilities = getPieceAbilities(piece);
  const pieceName = piece.type.charAt(0).toUpperCase() + piece.type.slice(1);
  const item = piece.heldItem ? ITEM_METADATA[piece.heldItem] : null;

  return (
    <div className="text-center text-xs">
      <h3 className="font-bold text-primary text-sm">{pieceName} - Level {piece.level || 1}</h3>
      {item && (
        <div className="mb-2 p-1 border border-accent/30 bg-accent/5 rounded-sm">
          <div className="flex items-center justify-center gap-2 mb-1">
             <ItemSprite index={item.spriteIndex} size={14} />
             <p className="text-[0.65rem] font-bold text-accent uppercase leading-none">{item.name}</p>
             <ItemSprite index={item.spriteIndex} size={14} />
          </div>
          <p className="text-[0.6rem] text-muted-foreground italic leading-tight">{item.description}</p>
        </div>
      )}
      <ul className="list-none p-0 m-0 text-[0.7rem]">
        {abilities.map((ability, index) => (
          <li key={index}>{ability}</li>
        ))}
        {abilities.length === 0 && <li>No special abilities.</li>}
      </ul>
    </div>
  );
}
