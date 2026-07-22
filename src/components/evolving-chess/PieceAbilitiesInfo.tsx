'use client';

import type { Piece } from '@/types';
import { ITEM_METADATA } from '@/types';
import { ItemSprite } from './ItemSprite';
import { cn } from '@/lib/utils';

interface PieceAbilitiesInfoProps {
  piece: Piece;
}

const getPieceAbilities = (piece: Piece): string[] => {
  const { type, level, heldItem, id, shroomMana } = piece;
  const abilities: string[] = [];
  const l = level || 1;

  if (id.startsWith('boss-hydra')) {
    abilities.push(" Hydra Split: When captured, its heads regrow into 2 Knights on adjacent squares.");
  } else if (id === 'boss-necro') {
    abilities.push(" Pawn Immunity: Cannot be captured by Pawns, Commanders, or Infiltrators.");
    abilities.push(" Ethereal Phasing: Can move through friendly units.");
    abilities.push(" Dark Conversion: 50% chance to convert adjacent enemy units after moving.");
    abilities.push(" Necromancy: Automatically resurrects the strongest fallen ally every 5 turns.");
  } else if (id.startsWith('boss-colossus')) {
    abilities.push(" Massive Entity: Occupies a 2x2 area. Vulnerable to Check on any part.");
    abilities.push(" Heavyweight: Immune to Push-Back and Gravity effects.");
    abilities.push(" Iron Guard: Invulnerable until all minions are cleared.");
    abilities.push(" Crushing Stride: Moves 2 squares at a time. Captures all enemy units in its 2x2 area of arrival.");
  } else if (id === 'boss-mirage') {
    abilities.push(" Phantom Mirror: Summons a phalanx of Phantom Bishops.");
    abilities.push(" Illusionist: Can jump over any unit while moving.");
  } else if (id === 'boss-entity') {
    abilities.push(" Void Shield: Starts with a permanent Holy Shield.");
    abilities.push(" Void Command: Surrounds itself with elite Hero and Infiltrator Aspects.");
    abilities.push(" The End: Wins immediately if it reaches your back rank.");
  }

  if (heldItem === 'cardinal_greaves') abilities.push(" cardinal: move (no capture) 1 space forward.");
  if (heldItem === 'drift_boots') abilities.push(" drift: move (no capture) 1 space diagonally forward.");
  if (heldItem === 'queens_peace') abilities.push(" invulnerable: cannot be captured or capture others.");
  if (heldItem === 'wind_sword') abilities.push(" wind edge: push-back ability triggered on attack.");
  if (heldItem === 'middle_way') abilities.push(" equilibrium: level locked at 3.");
  if (heldItem === 'phoenix_down') abilities.push(" rebirth: auto-resurrect once on capture.");
  if (heldItem === 'passive_armor') abilities.push(" steady: immune to push-back.");
  if (heldItem === 'mirror_shield') abilities.push(" reflection: reflects one capture attempt from a non-royal unit.");
  if (heldItem === 'wind_scroll') abilities.push(" spell: push-back units from targeted empty space.");
  if (heldItem === 'life_leach') abilities.push(" spell: reduces all enemy levels by 1.");
  if (heldItem === 'summon_anvil') abilities.push(" spell: drop a solid anvil block.");
  if (heldItem === 'wind_cloak') abilities.push(" aero mantle: push-back ability triggered on move.");
  if (heldItem === 'gnosis') abilities.push(" insight: +1 extra level gain on every capture.");
  if (heldItem === 'shield_scroll') abilities.push(" spell (L2+): apply holy shield to an allied unit.");
  if (heldItem === 'rally_scroll') abilities.push(" spell (L3+): reset to L1 to trigger a global allied level-up.");
  if (heldItem === 'poison_sword') abilities.push(" toxic: splash poison to adjacent enemies on capture.");
  if (heldItem === 'antidote') abilities.push(" cleanse: remove poison from all allied units.");
  if (heldItem === 'crossbow') abilities.push(" double shot: KS 3 triggers Archer Snipe in addition to Anvil.");
  if (heldItem === 'poison_tunic') abilities.push(" toxic skin: poisons any piece that captures the wearer.");
  if (heldItem === 'detonation_scroll') abilities.push(" spell (L5+): sacrifice unit to cause a massive explosion.");
  if (heldItem === 'phase_boots') abilities.push(" phase (L2+): can jump over friendly units while moving.");
  if (heldItem === 'swap_scroll') abilities.push(" spell (L3+): trade places with any allied piece.");
  if (heldItem === 'grimoir') abilities.push(" dark wisdom: adjacent allies gain +2 effective levels.");
  if (heldItem === 'soul_link') abilities.push(" bound: shares level-ups and destruction with other linked allies.");
  if (heldItem === 'logas') abilities.push(" sacred capturing: adjacent allies gain +1 level on capture.");
  if (heldItem === 'berserkers_mask') abilities.push(" frenzy: +3 levels on capture, but must capture if possible.");
  if (heldItem === 'ice_scroll') abilities.push(" spell (L2+): freeze adjacent enemies for 2 turns.");
  if (heldItem === 'resurrection_scroll') abilities.push(" spell (L4+): resurrect highest value ally adjacent to you.");
  if (heldItem === 'faith_scroll') abilities.push(" spell (L5+): 50% chance to convert adjacent enemies.");
  if (heldItem === 'tortoise_hammer') abilities.push(" heavy: limits move to 1 square forward. Captures enemies cardinally adjacent to target.");
  if (heldItem === 'leach_blade') abilities.push(" leach: capturing an enemy reduces adjacent enemies by 1 level.");
  if (heldItem === 'kings_decree') abilities.push(" spell: promote an allied Level 1 Pawn to a Commander.");
  if (heldItem === 'gravity_stone') abilities.push(" gravity: capturing pulls enemies 2 squares away 1 square closer.");
  if (heldItem === 'lead_boots') abilities.push(" anchored: immune to push-back and gravity pull effects.");
  if (heldItem === 'blast_shield') abilities.push(" blast guard: immune to self-destructs and explosions.");
  if (heldItem === 'monks_robe') abilities.push(" devotions: conversion success chance increased by 20%.");
  if (heldItem === 'training_weights') abilities.push(" conditioning: gain +1 level every 3 turns.");
  if (heldItem === 'ice_tunic') abilities.push(" cryo skin: freezes any piece that captures the wearer for 1 turn.");
  if (heldItem === 'ice_sword') abilities.push(" cryo blade: capturing freezes cardinally adjacent enemies for 1 turn.");
  if (heldItem === 'ice_blast') abilities.push(" spell: freeze all adjacent enemies for 2 turns.");
  if (heldItem === 'soul_harvest') abilities.push(" spell: reduce adjacent pieces to L1 to absorb their power.");
  if (heldItem === 'aura_silence') abilities.push(" silent aura: adjacent enemies cannot trigger active skills.");
  if (heldItem === 'grappling_hook') abilities.push(" grappling hook: swap positions with distant allies.");
  if (heldItem === 'battering_ram') abilities.push(" battering ram: push adjacent anvils to crush enemies.");
  if (heldItem === 'knights_boots') abilities.push(" knight's boots: movement replaced by Knight pattern.");
  if (heldItem === 'golden_chalice') abilities.push(" experience: +1 extra level gain on every capture.");
  if (heldItem === 'earthquake_scroll') abilities.push(" spell (L3+): target a square to push units in a 3x3 area away.");
  if (heldItem === 'swift_cloak') { if (['pawn', 'dancer', 'mimic', 'grappler', 'commander', 'myco_mage'].includes(type)) abilities.push(" swift: double move range for small units."); else abilities.push(" swift: inactive (only for small units)."); }

  switch (type) {
    case 'pawn':
    case 'dancer':
    case 'mimic':
    case 'grappler':
    case 'commander':
    case 'myco_mage':
      if (l >= 1) abilities.push("Standard pawn move/capture.");
      if (l >= 2) abilities.push("Can move 1 square backward.");
      if (l >= 3) abilities.push("Can move 1 square sideways.");
      if (l >= 4) abilities.push("Push-Back adjacent entities.");
      if (l >= 5) abilities.push("Promotion grants extra turn.");
      if (type === 'commander') { abilities.push("Rallying Cry on capture (levels up other pawns)."); abilities.push("Promotes to Hero."); abilities.push("Queen Hunter."); }
      if (type === 'dancer') { abilities.push("Dance: KS 1 allows an immediate 1-square cardinal move or an adjacent swap with an ally."); }
      if (type === 'mimic') { abilities.push("Shape-shift: Replicates the move/capture pattern of the last piece to move, using the Mimic's current Level."); }
      if (type === 'grappler') { abilities.push("Toss: Can pick up an adjacent piece (except Kings) and throw it to an empty space cardinally or diagonally (Range = Level)."); }
      if (type === 'myco_mage') { abilities.push(`Myco Grimoire: Spend Shroom Mana (${shroomMana || 0}) for global fungal spells.`); }
      break;
    case 'infiltrator': abilities.push("Moves/captures 1 square forward or diagonally forward."); abilities.push("Obliterates captured pieces."); abilities.push("Wins game on back rank."); abilities.push("Queen Hunter."); break;
    case 'knight':
    case 'hero':
    case 'archer':
      if (l >= 1) abilities.push("Standard L-shape move.");
      if (l >= 2) abilities.push("Can move 1 square cardinally.");
      if (l >= 3) abilities.push("Can jump 3 squares cardinally.");
      if (l >= 4) abilities.push("Swap with friendly Bishop.");
      if (l >= 5) abilities.push("Self-Destruct ability.");
      if (type === 'hero') { abilities.push("Hero's Rallying Cry on capture (levels up all other pieces)."); abilities.push("Queen Hunter."); }
      if (type === 'archer') { abilities.push("Archer Snipe: KS 3 grants global targeting (Non-Royals only)."); }
      break;
    case 'bishop':
    case 'archbishop':
      if (l >= 1) abilities.push("Standard diagonal move.");
      if (l >= 2) abilities.push("Phase through friendly pieces.");
      if (l >= 3) abilities.push("Pawn Immunity: Cannot be captured by Pawns, Commanders, or Infiltrators.");
      if (l >= 4) abilities.push("Swap with friendly Knight/Hero/Archer.");
      if (l >= 5) abilities.push("50% chance to Convert adjacent enemies.");
      if (type === 'archbishop') abilities.push("Holy Shield: KS 2 grants protection to an ally.");
      break;
    case 'rook':
    case 'palace':
      abilities.push("Standard horizontal/vertical move.");
      if (l >= 4) abilities.push("Resurrection Call: Triggers if the Rook levels up to 4 or higher by capturing an enemy piece.");
      if (type === 'palace') { abilities.push("Master Resurrector: Allies return at their original level."); abilities.push("Royal Sanctuary: Castling levels up the King."); }
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
  let pieceName = piece.type.charAt(0).toUpperCase() + piece.type.slice(1);
  const isBoss = piece.id.startsWith('boss-');
  if (piece.id.startsWith('boss-hydra')) pieceName = "The Hydra";
  else if (piece.id === 'boss-necro') pieceName = "The Necromancer";
  else if (piece.id.startsWith('boss-colossus')) pieceName = "The Colossus";
  else if (piece.id === 'boss-mirage') pieceName = "The Mirage";
  else if (piece.id === 'boss-entity') pieceName = "The Void Entity";
  else if (piece.type === 'myco_mage') pieceName = "Myco Mage";
  const item = piece.heldItem ? ITEM_METADATA[piece.heldItem] : null;
  const isExhausted = (piece.cooldownTurnsRemaining || 0) > 0;
  const isFrozen = (piece.frozenTurnsRemaining || 0) > 0;
  return (
    <div className="text-center text-[10px]">
      <h3 className={cn("font-bold text-xs leading-none", isBoss ? "text-destructive" : "text-primary")}> {pieceName} - Level {piece.level || 1} </h3>
      <div className="flex flex-col gap-0.5 mt-0.5 mb-0.5">
        {piece.isPoisoned && <p className="text-[#22C55E] font-bold text-[8px] animate-pulse uppercase leading-none"> STATUS: POISONED </p>}
        {isFrozen && <p className="text-sky-400 font-bold text-[8px] animate-pulse uppercase leading-none"> STATUS: FROZEN </p>}
        {!isFrozen && isExhausted && <p className="text-destructive font-bold text-[8px] animate-pulse uppercase leading-none"> STATUS: EXHAUSTED </p>}
        {piece.heldItem === 'training_weights' && <p className="text-muted-foreground font-bold text-[8px] uppercase leading-none"> CONDITIONING: {(piece.itemTurnCount || 0)}/3 TURNS </p>}
      </div>
      {item && ( <div className="mb-1 p-0.5 border border-accent/30 bg-accent/5 rounded-sm"> <div className="flex items-center justify-center gap-1 mb-0.5"> <ItemSprite type={piece.heldItem!} size={10} /> <p className="text-[0.55rem] font-bold text-accent uppercase leading-none">{item.name}</p> <ItemSprite type={piece.heldItem!} size={10} /> </div> <p className="text-[0.55rem] text-muted-foreground italic leading-none">{item.description}</p> </div> )}
      <ul className="list-none p-0 m-0 text-[0.65rem] space-y-0"> {abilities.map((ability, index) => ( <li key={index} className={cn("leading-tight", (piece.isPoisoned || isExhausted || isFrozen) && "opacity-70")}>{ability}</li> ))} </ul>
    </div>
  );
}
