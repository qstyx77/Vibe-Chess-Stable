'use client';

import type { Piece } from '@/types';
import { ITEM_METADATA } from '@/types';
import { ItemSprite } from './ItemSprite';
import { cn } from '@/lib/utils';

interface PieceAbilitiesInfoProps {
  piece: Piece;
}

const getPieceAbilities = (piece: Piece): string[] => {
  const { type, level, heldItem } = piece;
  const abilities: string[] = [];
  const l = level || 1;

  // --- ITEM ABILITIES ---
  if (heldItem === 'cardinal_greaves') abilities.push(" cardinal: move (no capture) 1 space forward.");
  if (heldItem === 'drift_boots') abilities.push(" drift: move (no capture) 1 space diagonally forward.");
  if (heldItem === 'queens_peace') abilities.push(" invulnerable: cannot be captured or capture others.");
  if (heldItem === 'wind_sword') abilities.push(" wind edge: push-back adjacent entities on attack.");
  if (heldItem === 'middle_way') abilities.push(" equilibrium: level locked at 3.");
  if (heldItem === 'phoenix_down') abilities.push(" rebirth: auto-resurrect once on capture.");
  if (heldItem === 'passive_armor') abilities.push(" steady: immune to push-back.");
  if (heldItem === 'mirror_shield') abilities.push(" reflection: reflects capture attempts once.");
  if (heldItem === 'wind_scroll') abilities.push(" spell: push-back units from targeted empty space.");
  if (heldItem === 'life_leach') abilities.push(" spell: reduces all enemy levels by 1.");
  if (heldItem === 'summon_anvil') abilities.push(" spell: drop a solid anvil block.");
  if (heldItem === 'wind_cloak') abilities.push(" aero mantle: push-back ability triggered on move.");
  if (heldItem === 'gnosis') abilities.push(" insight: +1 extra level gain on every capture.");
  if (heldItem === 'shield_scroll') abilities.push(" spell (L2+): apply holy shield to an allied unit.");
  if (heldItem === 'rally_scroll') abilities.push(" spell (L3+): reset to L1 to trigger a global allied level-up.");
  if (heldItem === 'poison_dagger') abilities.push(" toxic: splash poison to adjacent enemies on capture.");
  if (heldItem === 'antidote') abilities.push(" cleanse: remove poison from all allied units.");
  if (heldItem === 'crossbow') abilities.push(" double shot: KS 3 triggers Archer Snipe in addition to Anvil.");
  if (heldItem === 'poison_tunic') abilities.push(" toxic skin: poisons any piece that captures this unit.");
  if (heldItem === 'detonation_scroll') abilities.push(" spell (L5+): sacrifice unit to cause a massive explosion.");
  if (heldItem === 'phase_boots') abilities.push(" phase (L2+): can jump over friendly units while moving.");
  if (heldItem === 'swap_scroll') abilities.push(" spell (L3+): trade places with any allied piece.");
  if (heldItem === 'grimoir') abilities.push(" dark wisdom: adjacent allies gain +2 effective levels.");
  if (heldItem === 'soul_link') abilities.push(" bound: shares level-ups and destruction with other linked allies.");
  if (heldItem === 'logas') abilities.push(" sacred capturing: adjacent allies gain +1 level on capture.");
  if (heldItem === 'swift_cloak') {
      if (type === 'pawn' || type === 'commander') {
          abilities.push(" swift: double move range for small units.");
      } else {
          abilities.push(" swift: inactive (only for small units).");
      }
  }

  // --- STANDARD ABILITIES ---
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
      if (l >= 3) abilities.push("Pawn Immunity: Cannot be captured by Pawns, Commanders, or Infiltrators.");
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
      if (l >= 7 && heldItem !== 'queens_peace') abilities.push("Invulnerable to lower-level attackers (except special units). Requires Pawn/Commander sacrifice.");
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
  const isExhausted = (piece.cooldownTurnsRemaining || 0) > 0;

  return (
    <div className="text-center text-xs">
      <h3 className="font-bold text-primary text-sm">{pieceName} - Level {piece.level || 1}</h3>
      <div className="flex flex-col gap-0.5 mt-1 mb-1">
        {piece.isPoisoned && (
          <p className="text-[#22C55E] font-bold text-[10px] animate-pulse uppercase">
            STATUS: POISONED
          </p>
        )}
        {isExhausted && (
          <p className="text-destructive font-bold text-[10px] animate-pulse uppercase">
            STATUS: EXHAUSTED
          </p>
        )}
      </div>
      {item && (
        <div className="mb-2 p-1 border border-accent/30 bg-accent/5 rounded-sm">
          <div className="flex items-center justify-center gap-2 mb-1">
             <ItemSprite type={piece.heldItem!} size={14} />
             <p className="text-[0.65rem] font-bold text-accent uppercase leading-none">{item.name}</p>
             <ItemSprite type={piece.heldItem!} size={14} />
          </div>
          <p className="text-[0.6rem] text-muted-foreground italic leading-tight">{item.description}</p>
        </div>
      )}
      <ul className="list-none p-0 m-0 text-[0.7rem] space-y-0.5">
        {abilities.map((ability, index) => (
          <li key={index} className={cn("leading-tight", (piece.isPoisoned || isExhausted) && "opacity-70")}>{ability}</li>
        ))}
      </ul>
    </div>
  );
}
