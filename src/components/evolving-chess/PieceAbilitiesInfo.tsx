'use client';

import type { Piece, BoardState } from '@/types';
import { ITEM_METADATA, ITEM_SETS } from '@/types';
import { ItemSprite } from './ItemSprite';
import { cn } from '@/lib/utils';
import { FRONTLINE_TYPES, getActiveSets } from '@/lib/chess-utils';

interface PieceAbilitiesInfoProps {
  piece: Piece;
  board?: BoardState;
}

const getPieceName = (piece: Piece) => {
  const { id, type } = piece;
  if (id?.startsWith('boss-hydra')) return "The Hydra";
  if (id === 'boss-necro') return "The Necromancer";
  if (id?.startsWith('boss-colossus')) return "The Colossus";
  if (id === 'boss-mirage') return "The Mirage";
  if (id === 'boss-entity') return "The Void Entity";
  return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
};

const getPieceAbilities = (piece: Piece, board?: BoardState): string[] => {
  const { type, level, heldItem, id } = piece;
  const abilities: string[] = [];
  const l = level || 1;

  if (id?.startsWith('boss-hydra')) abilities.push("Hydra Split: When captured, its heads regrow into 2 Knights on adjacent squares.");
  else if (id === 'boss-necro') abilities.push("Necromancy: Resurrects a fallen ally every 5 turns.");
  else if (id?.startsWith('boss-colossus')) {
    abilities.push("Massive: Occupies 2x2 area. Vulnerable to Check.");
    abilities.push("Iron Guard: Invulnerable until minions are cleared.");
    abilities.push("Crushing: Moves 2 squares. Captures entire 2x2 landing area.");
  } else if (id === 'boss-entity') {
    abilities.push("Void Shield: Starts with a permanent Holy Shield.");
    abilities.push("Void Command: Surrounded by Hero/Infiltrator Aspects.");
    abilities.push("The End: Wins immediately if back rank is reached.");
  }

  // Set Bonuses
  if (board) {
    const activeSets = getActiveSets(board, piece.color);
    activeSets.forEach(setId => {
        const set = ITEM_SETS[setId];
        if (set && set.items.includes(heldItem as any)) {
            abilities.push(`SET: ${set.name} active! (${set.bonus})`);
        }
    });
  }

  if (heldItem === 'cardinal_greaves') abilities.push("cardinal: move (no capture) 1 space forward.");
  if (heldItem === 'drift_boots') abilities.push("drift: move (no capture) 1 space diagonally forward.");
  if (heldItem === 'queens_peace') abilities.push("invulnerable: cannot capture or be captured.");
  if (heldItem === 'wind_sword') abilities.push("wind edge: push-back triggered on attack.");
  if (heldItem === 'middle_way') abilities.push("equilibrium: level locked at 3.");
  if (heldItem === 'phoenix_down') abilities.push("rebirth: auto-resurrect once on capture.");
  if (heldItem === 'passive_armor') abilities.push("steady: immune to push-back.");
  if (heldItem === 'mirror_shield') abilities.push("reflection: reflects one capture from non-royal.");
  if (heldItem === 'wind_scroll') abilities.push("spell: push-back adjacent units.");
  if (heldItem === 'life_leach') abilities.push("spell: reduces all enemy levels by 1.");
  if (heldItem === 'summon_anvil') abilities.push("spell: drop a solid anvil block.");
  if (heldItem === 'great_sword') abilities.push("cleave: capture enemies behind primary target.");
  if (heldItem === 'wind_cloak') abilities.push("aero mantle: push-back triggered on move.");
  if (heldItem === 'gnosis') abilities.push("insight: +1 extra level gain on capture.");
  if (heldItem === 'shield_scroll') abilities.push("spell (L2+): apply holy shield to ally.");
  if (heldItem === 'rally_scroll') abilities.push("spell (L3+): trigger global allied level-up.");
  if (heldItem === 'poison_sword') abilities.push("toxic: splash poison on capture.");
  if (heldItem === 'antidote') abilities.push("cleanse: remove poison and exhaustion.");
  if (heldItem === 'crossbow') abilities.push("double shot: KS 3 triggers Archer Snipe.");
  if (heldItem === 'poison_tunic') abilities.push("toxic skin: poisons anyone who captures wearer.");
  if (heldItem === 'detonation_scroll') abilities.push("spell (L5+): sacrifice unit for explosion.");
  if (heldItem === 'phase_boots') abilities.push("phase (L2+): can jump over friendly units.");
  if (heldItem === 'swap_scroll') abilities.push("spell (L3+): trade places with allied piece.");
  if (heldItem === 'grimoir') abilities.push("dark wisdom: adjacent allies gain +2 levels.");
  if (heldItem === 'soul_link') abilities.push("bound: pieces share levels and shared destruction.");
  if (heldItem === 'logas') abilities.push("sacred: adjacent allies gain +1 level on their captures.");
  if (heldItem === 'berserkers_mask') abilities.push("frenzy: +3 levels on capture, but must capture.");
  if (heldItem === 'ice_scroll') abilities.push("spell (L2+): freeze adjacent enemies.");
  if (heldItem === 'resurrection_scroll') abilities.push("spell (L4+): resurrect strongest adjacent ally.");
  if (heldItem === 'faith_scroll') abilities.push("spell (L5+): chance to convert adjacent enemies.");
  if (heldItem === 'tortoise_hammer') abilities.push("heavy: 1 sq forward. Splash capture.");
  if (heldItem === 'leach_blade') abilities.push("leach: drain 1 level from adjacent enemies on capture.");
  if (heldItem === 'kings_decree') abilities.push("spell: promote L1 Pawn to Commander.");
  if (heldItem === 'gravity_stone') abilities.push("gravity: capture pulls distant enemies closer.");
  if (heldItem === 'lead_boots') abilities.push("anchored: immune to push/pull.");
  if (heldItem === 'blast_shield') abilities.push("blast guard: immune to explosions.");
  if (heldItem === 'monks_robe') abilities.push("devotions: +20% conversion chance.");
  if (heldItem === 'training_weights') abilities.push("conditioning: +1 level every 5 turns. Actions cause exhaustion.");
  if (heldItem === 'ice_tunic') abilities.push("cryo skin: freezes capturer for 2 turns.");
  if (heldItem === 'ice_sword') abilities.push("cryo blade: freezes adjacent enemies on capture.");
  if (heldItem === 'ice_blast') abilities.push("spell: freeze all adjacent enemies.");
  if (heldItem === 'soul_harvest') abilities.push("spell: absorb adjacent pieces' power.");
  if (heldItem === 'aura_silence') abilities.push("silence: enemies nearby cannot use skills.");
  if (heldItem === 'grappling_hook') abilities.push("grappling hook: swap with distant allies.");
  if (heldItem === 'battering_ram') abilities.push("ram: push adjacent anvils to crush enemies.");
  if (heldItem === 'knights_boots') abilities.push("boots: use Knight movement pattern.");
  if (heldItem === 'golden_chalice') abilities.push("experience: +1 extra level gain on capture.");
  if (heldItem === 'earthquake_scroll') abilities.push("spell (L3+): area push and level drain.");
  if (heldItem === 'war_drum') abilities.push("tempo: swapped allies level up; enemies exhausted.");
  if (heldItem === 'cyanide_pill') abilities.push("spite: capturer gains 0 levels.");
  if (heldItem === 'demonic_possession') abilities.push("demonic: +5 levels, but unit dies in 3 turns.");
  if (heldItem === 'mushroom_magnet') abilities.push("magnetic: pulls shrooms closer on move.");
  if (heldItem === 'mimic_blade') abilities.push("mimic: replicates last moved piece's item.");
  if (heldItem === 'thieves_gloves') abilities.push("plunder: 50% chance to steal equipment.");
  if (heldItem === 'heavy_rain') abilities.push("spell (L3+): drop 3 random anvils.");
  if (heldItem === 'kings_conquest') abilities.push("conquest: reaching KS 8 wins game.");
  if (heldItem === 'swift_cloak') { if (FRONTLINE_TYPES.includes(type)) abilities.push("swift: double movement range."); else abilities.push("swift: inactive (frontline only)."); }
  if (heldItem === 'power_glove') abilities.push("glove: can pick up and throw Anvils.");
  if (heldItem === 'trap_net') abilities.push("trap: capture/use exhausts adjacent enemies.");
  if (heldItem === 'spore_pouch') abilities.push("spores: 25% chance to drop Shroom on vacated square.");
  if (heldItem === 'kings_ransom') abilities.push("ransom: auto-save from checkmate (one-time).");
  if (heldItem === 'dancers_ribbon') abilities.push("ribbon: Dance skill can target Anvils.");
  if (heldItem === 'mirror_mask') abilities.push("mask: Mimic copies mimicked unit's level/item.");
  if (heldItem === 'oil_slick') abilities.push("spell: create sliding hazards for 3 turns.");
  if (heldItem === 'gamblers_coin') abilities.push("gambit: 50/50 chance for 2x or 0x level gain.");
  if (heldItem === 'sweet_revenge') abilities.push("revenge: +1 level gain if opponent captured last turn.");
  if (heldItem === 'chameleon_cloak') abilities.push("mimicry: unit transforms into its capture victim.");
  if (heldItem === 'phase_out') abilities.push("spell: phases out adjacent entities for 3 turns.");
  if (heldItem === 'ice_breaker') abilities.push("shatter: unit can capture and destroy Frozen entities.");
  if (heldItem === 'glacial_ray') abilities.push("spell: targets a line for total flash-freeze.");
  if (heldItem === 'burning_ray') abilities.push("spell: targets a line for total destruction.");
  if (heldItem === 'coffee_bean') abilities.push("pick-me-up: automatically clears Exhaustion on application.");
  if (heldItem === 'filter_mask') abilities.push("safety: piece is completely immune to Poison.");
  if (heldItem === 'thermal_socks') abilities.push("warmth: piece cannot be Frozen.");
  if (heldItem === 'spiked_buckler') abilities.push("spiked: Pushing this unit poisons the attacker.");
  if (heldItem === 'whetstone') abilities.push("sharpened: +1 extra level gain on L1 captures.");
  if (heldItem === 'grip_gloves') abilities.push("grip: can push Anvils at any level.");
  if (heldItem === 'clover') abilities.push("luck: +1% boss battle item drop rate.");
  if (heldItem === 'antifreeze') abilities.push("anti-freeze: automatically clears Frozen status.");
  if (heldItem === 'frayed_rope') abilities.push("reactive: pushing/pulling wearer exhausts attacker.");
  if (heldItem === 'kinetic_coil') abilities.push("kinetic: +1 Level gain whenever Pushed or Pulled.");
  if (heldItem === 'relay_ribbon') abilities.push("relay: +1 Level gain whenever target of Allied Swap.");
  if (heldItem === 'spiked_plate') abilities.push("thorns: poisons enemy capturer.");
  if (heldItem === 'traction_cleats') abilities.push("grip: immune to Oil Slick sliding.");
  if (heldItem === 'glass_shard') abilities.push("trap: exhausts enemy capturer (one-time).");
  if (heldItem === 'defiant_spark') abilities.push("defiance: if adjacent ally is taken, wearer gains Holy Shield.");
  if (heldItem === 'soul_spark') abilities.push("soul spark: return at L2 when resurrected.");
  if (heldItem === 'scouts_map') abilities.push("scouting: +1 move range if area is clear of foes.");
  if (heldItem === 'rosary') abilities.push("divine: targeted shields grant +1 level.");
  if (heldItem === 'obsidian_blade') abilities.push("pierce: can capture units with Holy Shields.");
  if (heldItem === 'lose_faith_scroll') abilities.push("spell: remove all opponent Holy Shields.");

  switch (type) {
    case 'pawn':
    case 'dancer':
    case 'mimic':
    case 'grappler':
    case 'commander':
    case 'myco_mage':
      if (l >= 1) abilities.push("Standard move/capture.");
      if (l >= 2) abilities.push("Can move 1 square backward.");
      if (l >= 3) abilities.push("Can move 1 square sideways.");
      if (l >= 4) abilities.push("Push-Back: Moving adjacent to units/items pushes them away.");
      if (l >= 5) abilities.push("Promotion grants extra turn.");
      if (type === 'commander') abilities.push("Rallying Cry on capture.");
      if (type === 'dancer') abilities.push("Dance: KS 1 free cardinal move/swap.");
      if (type === 'mimic') abilities.push("Shape-shift: Copies last moved piece.");
      if (type === 'grappler') abilities.push("Toss: Throw adjacent unit (Range = L).");
      if (type === 'myco_mage') abilities.push(`Mushroomancy: Use Shroom Pool (${piece.shroomMana || 0}).`);
      break;
    case 'infiltrator': abilities.push("Fast forward/diagonal move."); abilities.push("Obliterates targets."); abilities.push("Win at back rank."); break;
    case 'knight':
    case 'hero':
    case 'archer':
      if (l >= 1) abilities.push("Standard L-shape move.");
      if (l >= 2) abilities.push("Move 1 square cardinally.");
      if (l >= 3) abilities.push("Jump 3 squares cardinally.");
      if (l >= 4) abilities.push("Swap with allied Clergy.");
      if (l >= 5) abilities.push("Self-Destruct ability.");
      if (type === 'hero') abilities.push("Hero's Rally on capture.");
      if (type === 'archer') abilities.push("Archer Snipe: KS 5 global shot.");
      break;
    case 'bishop':
    case 'archbishop':
      if (l >= 1) abilities.push("Standard diagonal move.");
      if (l >= 2) abilities.push("Phase through friendly pieces.");
      if (l >= 3) abilities.push("Immunity to Frontline capture.");
      if (l >= 4) abilities.push("Swap with allied Cavalry.");
      if (l >= 5) abilities.push("Faith: Conversion chance on move.");
      if (type === 'archbishop') abilities.push("Holy Shield: KS 2 protection.");
      break;
    case 'rook':
    case 'palace':
      abilities.push("Standard horizontal/vertical move.");
      if (l >= 4) abilities.push("Resurrection Call on capture.");
      if (type === 'palace') abilities.push("Master Resurrector. Royal Sanctuary.");
      break;
    case 'queen':
      abilities.push("Standard Queen movement.");
      if (l >= 7) abilities.push("Royal Invulnerability. Needs Sacrifice.");
      break;
    case 'king':
      if (l >= 1) abilities.push("Standard king move.");
      if (l >= 2) abilities.push("Move range up to 2 squares.");
      if (l >= 5) abilities.push("Gains L-shape movement.");
      abilities.push("Dominion: Drain enemy Queens on level up.");
      break;
  }
  return abilities;
};

export function PieceAbilitiesInfo({ piece, board }: PieceAbilitiesInfoProps) {
  const abilities = getPieceAbilities(piece, board);
  const pieceName = getPieceName(piece);
  const item = piece.heldItem ? ITEM_METADATA[piece.heldItem] : null;
  const isExhausted = (piece.cooldownTurnsRemaining || 0) > 0;
  const isFrozen = (piece.frozenTurnsRemaining || 0) > 0;

  return (
    <div className="text-center text-[0.55rem] font-pixel">
      <h3 className={cn("font-bold text-[0.7rem] uppercase leading-tight mb-1", piece.id?.startsWith('boss-') ? "text-destructive" : "text-primary")}>
          {pieceName} - Level {piece.level}
      </h3>
      <div className="flex flex-col gap-0.5 mb-1">
        {piece.isPoisoned && <p className="text-[#22C55E] text-[0.45rem] animate-pulse uppercase">STATUS: POISONED</p>}
        {isFrozen && <p className="text-sky-400 text-[0.45rem] animate-pulse uppercase">STATUS: FROZEN</p>}
        {!isFrozen && isExhausted && <p className="text-destructive text-[0.45rem] animate-pulse uppercase">STATUS: EXHAUSTED</p>}
      </div>
      {item && (
        <div className="mb-1 p-0.5 border border-accent/30 bg-accent/5 rounded-none">
          <p className="text-[0.45rem] font-bold text-accent uppercase leading-none mb-0.5">{item.name}</p>
          <p className="text-[0.4rem] text-muted-foreground italic leading-none">{item.description}</p>
        </div>
      )}
      <ul className="list-none p-0 m-0 space-y-0.5">
        {abilities.map((ability, index) => (
          <li key={index} className={cn("leading-tight uppercase text-[0.45rem]", (piece.isPoisoned || isExhausted || isFrozen) && "opacity-70", ability.startsWith('SET:') && "text-yellow-400 font-bold")}>
            {ability}
          </li>
        ))}
      </ul>
    </div>
  );
}
