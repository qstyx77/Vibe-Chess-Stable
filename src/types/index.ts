
export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' | 'commander' | 'hero' | 'infiltrator' | 'archbishop' | 'palace' | 'archer' | 'dancer' | 'mimic' | 'grappler' | 'myco_mage';
export type ItemType = 'anvil' | 'shroom';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Item {
  type: ItemType;
}

export type InventoryItemType = 
  | 'mirror_shield' 
  | 'swift_cloak' 
  | 'passive_armor' 
  | 'cardinal_greaves'
  | 'drift_boots'
  | 'queens_peace'
  | 'wind_sword'
  | 'middle_way'
  | 'phoenix_down'
  | 'wind_scroll'
  | 'life_leach'
  | 'summon_anvil'
  | 'great_sword'
  | 'shield_scroll'
  | 'rally_scroll'
  | 'poison_sword'
  | 'antidote'
  | 'crossbow'
  | 'poison_tunic'
  | 'detonation_scroll'
  | 'phase_boots'
  | 'swap_scroll'
  | 'grimoir'
  | 'soul_link'
  | 'logas'
  | 'berserkers_mask'
  | 'ice_scroll'
  | 'resurrection_scroll'
  | 'faith_scroll'
  | 'tortoise_hammer'
  | 'leach_blade'
  | 'kings_decree'
  | 'gravity_stone'
  | 'blast_shield'
  | 'monks_robe'
  | 'training_weights'
  | 'ice_tunic'
  | 'ice_sword'
  | 'ice_blast'
  | 'soul_harvest'
  | 'aura_silence'
  | 'grappling_hook'
  | 'battering_ram'
  | 'knights_boots'
  | 'golden_chalice'
  | 'earthquake_scroll'
  | 'portal_scroll_10'
  | 'portal_scroll_20' 
  | 'portal_scroll_30' 
  | 'portal_scroll_40' 
  | 'portal_scroll_50'
  | 'sclerotia'
  | 'shortbow'
  | 'smoke_bomb'
  | 'war_drum'
  | 'cyanide_pill'
  | 'demonic_possession'
  | 'mushroom_magnet'
  | 'mimic_blade'
  | 'thieves_gloves'
  | 'lead_boots'
  | 'heavy_rain'
  | 'kings_conquest'
  | 'power_glove'
  | 'trap_net'
  | 'spore_pouch'
  | 'kings_ransom'
  | 'dancers_ribbon'
  | 'mirror_mask';

export interface InventoryItem {
  type: InventoryItemType;
  count: number;
}

export interface ItemMetadata {
  name: string;
  description: string;
  isConsumable: boolean;
  rarity: Rarity;
}

export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  'passive_armor': { name: 'Blue Plate', description: 'Heavy chestplate. Push-Back immunity.', isConsumable: false, rarity: 'common' },
  'mirror_shield': { name: 'Mirror Shield', description: 'Non-Royal only. Reflects one capture attempt from a non-royal unit, then breaks.', isConsumable: false, rarity: 'rare' },
  'swift_cloak': { name: 'Swift Cloak', description: 'Red cloak. Double move range for frontline units.', isConsumable: false, rarity: 'rare' },
  'cardinal_greaves': { name: 'Cardinal Greaves', description: 'Green boots. Move (no capture) 1 space cardinally forward.', isConsumable: false, rarity: 'common' },
  'drift_boots': { name: 'Drift Boots', description: 'Blue boots. Move (no capture) 1 space diagonally forward.', isConsumable: false, rarity: 'common' },
  'queens_peace': { name: 'Queen\'s Peace', description: 'Serene ring. Queen only. Invulnerable but cannot capture.', isConsumable: false, rarity: 'rare' },
  'wind_sword': { name: 'Wind Sword', description: 'Aero blade. Push-Back ability triggered on attack.', isConsumable: false, rarity: 'rare' },
  'middle_way': { name: 'The Middle Way', description: 'Balanced amulet. Locks piece level at 3 permanently.', isConsumable: false, rarity: 'rare' },
  'phoenix_down': { name: 'Phoenix Down', description: 'Magic feather. Auto-resurrection at L1 (Consumable).', isConsumable: true, rarity: 'rare' },
  'wind_scroll': { name: 'Wind Scroll', description: 'Consumable. Target an empty space to push back adjacent units.', isConsumable: true, rarity: 'common' },
  'life_leach': { name: 'Life Leach', description: 'Consumable. Global: reduces all enemy levels by 1.', isConsumable: true, rarity: 'common' },
  'summon_anvil': { name: 'Anvil Scroll', description: 'Consumable. Target an empty square to drop a solid Anvil.', isConsumable: true, rarity: 'uncommon' },
  'great_sword': { name: 'Great Sword', description: 'Frontline only. Capture an enemy directly behind your primary target.', isConsumable: false, rarity: 'uncommon' },
  'wind_cloak': { name: 'Wind Cloak', description: 'Aero mantle. L4+ pieces gain Push-Back ability.', isConsumable: false, rarity: 'uncommon' },
  'gnosis': { name: 'Gnosis', description: 'Golden blade. Non-King/Queen. Grants +1 extra level gain on every capture.', isConsumable: false, rarity: 'rare' },
  'shield_scroll': { name: 'Shield Scroll', description: 'Consumable (L2+). Target an allied unit to shield it.', isConsumable: true, rarity: 'uncommon' },
  'rally_scroll': { name: 'Rally Scroll', description: 'Consumable (L3+). Resets user level to trigger a global allied Rally.', isConsumable: true, rarity: 'rare' },
  'poison_sword': { name: 'Poison Sword', description: 'Toxic blade. Splashes poison to adjacent enemies on capture.', isConsumable: false, rarity: 'uncommon' },
  'antidote': { name: 'Antidote', description: 'Consumable vial. Cures all allied units of poison and exhaustion.', isConsumable: true, rarity: 'common' },
  'crossbow': { name: 'Crossbow', description: 'Archer only. Snipe KS at 3. Targets equal/lower level enemies. Archer levels on capture.', isConsumable: false, rarity: 'uncommon' },
  'poison_tunic': { name: 'Poison Tunic', description: 'Hazardous vest. Poisons any piece that captures the wearer.', isConsumable: false, rarity: 'uncommon' },
  'detonation_scroll': { name: 'Detonation Scroll', description: 'Consumable (L5+). Causes the equipped piece to self-destruct.', isConsumable: true, rarity: 'uncommon' },
  'phase_boots': { name: 'Phase Boots', description: 'Ethereal boots (L2+). Jump over friendly pieces while moving.', isConsumable: false, rarity: 'rare' },
  'swap_scroll': { name: 'Swap Scroll', description: 'Consumable (L3+). Trade places with another allied piece.', isConsumable: true, rarity: 'uncommon' },
  'grimoir': { name: 'Grimoir', description: 'Dark book. Boosts adjacent non-Royal allies by +2 levels.', isConsumable: false, rarity: 'rare' },
  'soul_link': { name: 'Soul Link', description: 'Cursed amulet. Bound pieces share levels and shared destruction.', isConsumable: false, rarity: 'uncommon' },
  'logas': { name: 'Logas', description: 'Holy book. Grants adjacent allies +1 level on their captures.', isConsumable: false, rarity: 'uncommon' },
  'berserkers_mask': { name: 'Berserker\'s Mask', description: 'Fierce mask. +3 levels on capture, but must capture if able.', isConsumable: false, rarity: 'uncommon' },
  'ice_scroll': { name: 'Ice Scroll', description: 'Consumable (L2+). Freezes adjacent enemies for 2 turns.', isConsumable: true, rarity: 'uncommon' },
  'resurrection_scroll': { name: 'Resurrection Scroll', description: 'Consumable (L4+). Resurrects highest value ally to random adjacent square at L1.', isConsumable: true, rarity: 'uncommon' },
  'faith_scroll': { name: 'Faith Scroll', description: 'Consumable (L5+). 50% chance to convert adjacent enemy non-king pieces.', isConsumable: true, rarity: 'uncommon' },
  'tortoise_hammer': { name: 'Tortoise Hammer', description: 'Limits move/capture to 1 square forward. Captures enemies cardinally adjacent to target.', isConsumable: false, rarity: 'uncommon' },
  'leach_blade': { name: 'Leach Blade', description: 'Dark blade. Capturing reduces all adjacent enemies by 1 level.', isConsumable: false, rarity: 'rare' },
  'kings_decree': { name: 'King\'s Decree', description: 'Consumable. King only. Target an allied Level 1 Pawn to promote it to a Commander.', isConsumable: true, rarity: 'rare' },
  'gravity_stone': { name: 'Gravity Stone', description: 'Accessory. Capturing pieces pulls enemy units that are 2 squares away 1 square closer.', isConsumable: false, rarity: 'rare' },
  'lead_boots': { name: 'Lead Boots', description: 'Passive. Equipped unit cannot be moved by Push-Back or Gravity effects.', isConsumable: false, rarity: 'common' },
  'blast_shield': { name: 'Blast Shield', description: 'Shield. Non-Royal only. Immune to self-destructs and explosions.', isConsumable: false, rarity: 'uncommon' },
  'monks_robe': { name: 'Monk\'s Robe', description: 'Robe. Bishops/Archbishops only. Increases conversion chance by 20%.', isConsumable: false, rarity: 'uncommon' },
  'training_weights': { name: 'Training Weights', description: 'Weights. Non-Royal only. Increases level by 1 every 3 turns.', isConsumable: false, rarity: 'common' },
  'ice_tunic': { name: 'Ice Tunic', description: 'Frosty vest. Freezes any piece that captures the wearer for 2 turns.', isConsumable: false, rarity: 'uncommon' },
  'ice_sword': { name: 'Ice Sword', description: 'Crystalline blade. Capturing freezes cardinally adjacent enemies for 2 turns.', isConsumable: false, rarity: 'uncommon' },
  'ice_blast': { name: 'Ice Blast Scroll', description: 'Consumable. Freeze all adjacent enemy pieces for 2 turns.', isConsumable: true, rarity: 'uncommon' },
  'soul_harvest': { name: 'Soul Harvest Scroll', description: 'Consumable. Non-Royal. Reduces adjacent levels to 1; user gains all lost levels.', isConsumable: true, rarity: 'rare' },
  'aura_silence': { name: 'Silence Amulet', description: 'Passive. Adjacent enemy units cannot trigger active skills or use scrolls.', isConsumable: false, rarity: 'uncommon' },
  'grappling_hook': { name: 'Grappling Hook', description: 'Passive. Can swap positions with an allied piece up to 3 squares away (requires line of sight).', isConsumable: false, rarity: 'rare' },
  'battering_ram': { name: 'Battering Ram', description: 'Passive. Rook/Palace only. Move into an adjacent Anvil to push it up to 3 squares, crushing enemies.', isConsumable: false, rarity: 'rare' },
  'knights_boots': { name: 'Knight\'s Boots', description: 'Passive. Replaces this piece\'s movement with the standard Knight L-shape pattern.', isConsumable: false, rarity: 'uncommon' },
  'golden_chalice': { name: 'Golden Chalice', description: 'Passive. Increases the Experience Value of all captures by this unit by +1 Level.', isConsumable: false, rarity: 'rare' },
  'earthquake_scroll': { name: 'Earthquake Scroll', description: 'Consumable (L3+). Enemy units in 3x3 area lose 2 levels and are pushed back.', isConsumable: true, rarity: 'uncommon' },
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10 (Boss).', isConsumable: true, rarity: 'rare' },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20 (Boss).', isConsumable: true, rarity: 'rare' },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30 (Boss).', isConsumable: true, rarity: 'rare' },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40 (Boss).', isConsumable: true, rarity: 'rare' },
  'portal_scroll_50': { name: 'F50 Portal', description: 'Warp to Floor 50 (Final Boss).', isConsumable: true, rarity: 'rare' },
  'sclerotia': { name: 'Sclerotia', description: 'Mushroom amulet. Myco Mage only. Adds 1 Shroom Mana every 4 turns.', isConsumable: false, rarity: 'rare' },
  'shortbow': { name: 'Shortbow', description: 'Traditional bow. Knight only. Enables Archer Snipe (KS 5) if Level 3+.', isConsumable: false, rarity: 'rare' },
  'smoke_bomb': { name: 'Smoke Bomb', description: 'Escape tool. On capture, wearer escapes to random empty back rank square. Consumable.', isConsumable: true, rarity: 'uncommon' },
  'war_drum': { name: 'War Drum', description: 'Tribal drum. Dancer only. Allies swapped with gain +1 Level. Enemies swapped with become Exhausted.', isConsumable: false, rarity: 'rare' },
  'cyanide_pill': { name: 'Cyanide Pill', description: 'Suicide capsule. Capturing piece gains 0 levels. Consumed on capture.', isConsumable: true, rarity: 'common' },
  'demonic_possession': { name: 'Demonic Possession', description: 'Consumable scroll. Gain +5 Levels immediately, but piece is obliterated after 3 turns.', isConsumable: true, rarity: 'rare' },
  'mushroom_magnet': { name: 'Shroom Magnet', description: 'Accessory. On move/capture, pulls all Shrooms within 2 spaces 1 square closer.', isConsumable: false, rarity: 'common' },
  'mimic_blade': { name: 'Mimic Blade', description: 'Mimic only. Replicates the held item of the last piece that moved.', isConsumable: false, rarity: 'rare' },
  'thieves_gloves': { name: 'Thieves\' Gloves', description: 'Glove. 50% chance to steal an enemy\'s equipment upon capture.', isConsumable: false, rarity: 'uncommon' },
  'lead_boots': { name: 'Lead Boots', description: 'Passive. Equipped unit cannot be moved by Push-Back or Gravity effects.', isConsumable: false, rarity: 'common' },
  'heavy_rain': { name: 'Heavy Rain Scroll', description: 'Consumable (L3+). Randomly drops 3 Anvils on the board.', isConsumable: true, rarity: 'uncommon' },
  'kings_conquest': { name: 'Kings Conquest', description: 'Jeweled crown. Kings only. Reaching KS 8 results in an immediate win.', isConsumable: false, rarity: 'rare' },
  'power_glove': { name: 'Power Glove', description: 'Rare gauntlet. Grapplers only. Can pick up and throw Anvils. Thrown anvils crush units.', isConsumable: false, rarity: 'rare' },
  'trap_net': { name: 'Trap Net', description: 'Uncommon net. On capture or use, adjacent enemies become Exhausted for 1 turn.', isConsumable: false, rarity: 'uncommon' },
  'spore_pouch': { name: 'Spore Pouch', description: 'Common bag. Frontline only. 25% chance to spawn a Shroom on vacated square when moving.', isConsumable: false, rarity: 'common' },
  'kings_ransom': { name: 'King\'s Ransom', description: 'Rare amulet. King only. Saves King from Checkmate once by exiling him to back rank at L1.', isConsumable: true, rarity: 'rare' },
  'dancers_ribbon': { name: 'Dancer\'s Ribbon', description: 'Uncommon ribbon. Dancer only. The Dance (KS 1) can now swap places with Anvils.', isConsumable: false, rarity: 'uncommon' },
  'mirror_mask': { name: 'Mirror Mask', description: 'Rare mask. Mimic only. Mimic also copies the mimicked piece\'s Level and Item.', isConsumable: false, rarity: 'rare' },
};

export interface Piece {
  id: string;
  type: PieceType;
  color: PlayerColor;
  level: number;
  hasMoved: boolean;
  invulnerableTurnsRemaining?: number;
  isShielded?: boolean;
  isPoisoned?: boolean;
  heldItem?: InventoryItemType | null;
  cooldownTurnsRemaining?: number;
  frozenTurnsRemaining?: number;
  itemTurnCount?: number;
  shroomMana?: number;
  obliterationTurnsRemaining?: number;
}

export type AlgebraicSquare = `${'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'}${'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'}`;

export interface SquareState {
  piece: Piece | null;
  item: Item | null;
  algebraic: AlgebraicSquare;
  rowIndex: number;
  colIndex: number;
}

export type BoardState = SquareState[][];

export interface Move {
  from: AlgebraicSquare;
  to: AlgebraicSquare;
  type?: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll' | 'kings-decree' | 'ice-blast' | 'soul-harvest' | 'dance-move' | 'dance-swap' | 'grapple-throw' | 'grapple-hook-swap' | 'ram-push' | 'earthquake-scroll' | 'myco-propagate' | 'tele-portobello' | 'spore-bomb' | 'raise-mycelimen' | 'demonic-possession' | 'heavy-rain' | 'trap-net';
  promoteTo?: PieceType;
  thrownPiece?: Piece;
  thrownItem?: ItemType;
  teleportPieceId?: string;
}

export interface GameStatus {
  message: string;
  isCheck: boolean;
  playerWithKingInCheck: PlayerColor | null;
  isCheckmate: boolean;
  isStalemate: boolean;
  isThreefoldRepetitionDraw?: boolean;
  isInfiltrationWin?: boolean;
  winner?: PlayerColor | 'draw';
  gameOver: boolean;
}

export interface Effect {
  id: string | number;
  type: 'poof' | 'explosion' | 'shockwave' | 'conversion' | 'light-beam' | 'level-change' | 'tremble' | 'magic-burst';
  square: AlgebraicSquare;
  color?: PlayerColor;
  value?: number;
  fromColor?: PlayerColor;
  toColor?: PlayerColor;
  itemType?: InventoryItemType;
}

export interface ConversionEvent {
  originalPiece: Piece;
  convertedPiece: Piece;
  byPiece: Piece;
  at: AlgebraicSquare;
}

export interface RallyCryEvent {
  square: AlgebraicSquare;
  color: PlayerColor;
}

export interface QueenLevelReducedEvent {
  queenId: string;
  originalLevel: number;
  newLevel: number;
  reductionAmount: number;
  reducedByKingOfColor: PlayerColor;
}

export interface ApplyMoveResult {
  newBoard: BoardState;
  capturedPiece: Piece | null;
  selfDestructCaptures: Piece[] | null;
  destroyedAnvils: number;
  pieceCapturedByAnvil: Piece | null;
  anvilPushedOffBoard: boolean;
  conversionEvents: ConversionEvent[];
  rallyCryTriggered: RallyCryEvent | null;
  originalPieceLevel?: number;
  originalPieceType?: PieceType;
  selfCheckByPushBack: boolean;
  queenLevelReducedEvents?: QueenLevelReducedEvent[] | null;
  promotedToInfiltrator?: boolean;
  promotedToHero?: boolean;
  infiltrationWin?: boolean;
  shroomConsumed?: boolean;
  enPassantTargetSet: AlgebraicSquare | null;
  extraTurn: boolean;
  specialCaptureSquare: AlgebraicSquare | null;
  phoenixResurrection?: { piece: Piece, square: AlgebraicSquare };
  reflectionOccurred?: boolean;
  resurrectionScrollEvent?: { piece: Piece, square: AlgebraicSquare };
  itemReturned?: InventoryItemType | null;
  multiPromotions?: { square: AlgebraicSquare, targetLevel: number }[];
  ralliedSquares?: AlgebraicSquare[];
  winByKingsConquest?: boolean;
  kingCapturedByColossus?: boolean;
}

export type ViewMode = 'flipping' | 'tabletop';

export interface ResurrectedSquareInfo {
  square: AlgebraicSquare;
  player: PlayerColor;
}

export interface GameSnapshot {
  board: BoardState;
  currentPlayer: PlayerColor;
  gameInfo: GameStatus;
  capturedPieces: { white: Piece[], black: Piece[] };
  killStreaks: { white: number, black: number };
  boardOrientation: PlayerColor;
  viewMode: ViewMode;
  isWhiteAI: boolean;
  isBlackAI: boolean;
  enemySelectedSquare?: AlgebraicSquare | null;
  enemyPossibleMoves?: AlgebraicSquare[];
  positionHistory: string[];
  lastMoveFrom: AlgebraicSquare | null;
  lastMoveTo: AlgebraicSquare | null;
  gameMoveCounter: number;
  enPassantTargetSquare: AlgebraicSquare | null;
  lastMovedPieceHeldItem?: InventoryItemType | null;
  lastMovedPieceLevel?: number | null;

  isAwaitingPawnSacrifice: boolean;
  playerToSacrificePawn: PlayerColor | null;
  boardForPostSacrifice: BoardState | null;
  playerWhoMadeQueenMove: PlayerColor | null;
  isExtraTurnFromQueenMove: boolean;

  isAwaitingRookSacrifice: boolean;
  playerToSacrificeForRook: PlayerColor | null;
  rookToMakeInvulnerable: AlgebraicSquare | null;
  boardForRookSacrifice: BoardState | null;
  originalTurnPlayerForRookSacrifice: PlayerColor | null;
  isExtraTurnFromRookLevelUp: boolean;

  isResurrectionPromotionInProgress: boolean;
  playerForPostResurrectionPromotion: PlayerColor | null;
  isExtraTurnForPostResurrectionPromotion: boolean;
  promotionSquare: AlgebraicSquare | null;
  promotionMoveWasCapture: boolean;
  originalPromotionLevel: number | null;
  promotionPawnOriginalLevel: number | null;

  promotionQueue?: { square: AlgebraicSquare, targetLevel: number }[];

  firstBloodAchieved: boolean;
  playerWhoGotFirstBlood: PlayerColor | null;
  isAwaitingCommanderPromotion: boolean;

  shroomSpawnCounter?: number;
  nextShroomSpawnTurn?: number;
  resurrectedSquares: ResurrectedSquareInfo[];

  turnTimer: number | null;
  activeTimerPlayer: PlayerColor | null;
  whiteTimeouts: number;
  blackTimeouts: number;

  isAwaitingAnvilDrop: boolean;
  playerToDropAnvil: PlayerColor | null;
  anvilDropContext: { boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null;
  anvilDropAfterPromotion: boolean;
  isAwaitingHolyShield?: boolean;
  shieldContext?: { boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null, capturingPieceId?: string } | null;
  
  isAwaitingArcherSnipe?: boolean;
  archerSnipeContext?: { boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null;
  inventory?: InventoryItem[];
}

export interface AISquareState {
  piece: Piece | null;
  item: Item | null;
}
export type AIBoardState = AISquareState[][];

export interface AIMove {
  from: [number, number];
  to: [number, number];
  type: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll' | 'kings-decree' | 'ice-blast' | 'soul-harvest' | 'dance-move' | 'dance-swap' | 'grapple-throw' | 'grapple-hook-swap' | 'ram-push' | 'earthquake-scroll' | 'myco-propagate' | 'tele-portobello' | 'spore-bomb' | 'raise-mycelimen' | 'demonic-possession' | 'heavy-rain' | 'trap-net';
  promoteTo?: PieceType;
}

export interface AIGameState {
  board: AIBoardState;
  currentPlayer: PlayerColor;
  killStreaks: { white: number; black: number };
  capturedPieces: { white: Piece[]; black: Piece[] };
  gameMoveCounter: number;
  gameOver?: boolean;
  winner?: PlayerColor | 'draw';
  extraTurn?: boolean;
  autoCheckmate?: boolean;
  firstBloodAchieved?: boolean;
  playerWhoGotFirstBlood?: PlayerColor | null;
  enPassantTargetSquare: AlgebraicSquare | null;
  shroomSpawnCounter?: number;
  nextShroomSpawnTurn?: number;
  necroResurrectionCounter?: number;
  lastMovedPieceType?: PieceType | null;
  lastMovedPieceHeldItem?: InventoryItemType | null;
  lastMovedPieceLevel?: number | null;
}

export type MessageCategory = 'battle' | 'social' | 'log' | 'market';

export interface ChatMessage {
  id: string;
  sender: string;
  senderId?: string;
  text: string;
  timestamp: number;
  color?: PlayerColor;
  category: MessageCategory;
  isChallenge?: boolean;
  challengeRoomId?: string;
}

export interface Friend {
  id: string;
  username: string;
  status: 'accepted' | 'pending' | 'blocked';
  lastActive?: number;
}

export interface MarketListing {
  itemId: InventoryItemType;
  price: number;
  slot: number;
}
