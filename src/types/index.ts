export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' | 'commander' | 'hero' | 'infiltrator' | 'archbishop' | 'palace' | 'archer' | 'dancer' | 'mimic' | 'grappler' | 'myco_mage';
export type ItemType = 'anvil' | 'shroom';

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
  | 'lead_boots'
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
  | 'portal_scroll_50';

export interface InventoryItem {
  type: InventoryItemType;
  count: number;
}

export interface ItemMetadata {
  name: string;
  description: string;
  isConsumable: boolean;
}

export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  'passive_armor': { name: 'Blue Plate', description: 'Heavy chestplate. Push-Back immunity.', isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Non-Royal only. Reflects one capture attempt from a non-royal unit, then breaks.', isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Red cloak. Double move range for small units.', isConsumable: false },
  'cardinal_greaves': { name: 'Cardinal Greaves', description: 'Green boots. Move (no capture) 1 space cardinally forward.', isConsumable: false },
  'drift_boots': { name: 'Drift Boots', description: 'Blue boots. Move (no capture) 1 space diagonally forward.', isConsumable: false },
  'queens_peace': { name: 'Queen\'s Peace', description: 'Serene ring. Queen only. Invulnerable but cannot capture.', isConsumable: false },
  'wind_sword': { name: 'Wind Sword', description: 'Aero blade. Push-Back ability triggered on attack.', isConsumable: false },
  'middle_way': { name: 'The Middle Way', description: 'Balanced amulet. Locks piece level at 3 permanently.', isConsumable: false },
  'phoenix_down': { name: 'Phoenix Down', description: 'Magic feather. Auto-resurrection at L1 (Consumable).', isConsumable: true },
  'wind_scroll': { name: 'Wind Scroll', description: 'Consumable. Target an empty space to push back adjacent units.', isConsumable: true },
  'life_leach': { name: 'Life Leach', description: 'Consumable. Global: reduces all enemy levels by 1.', isConsumable: true },
  'summon_anvil': { name: 'Anvil Scroll', description: 'Consumable. Target an empty square to drop a solid Anvil.', isConsumable: true },
  'wind_cloak': { name: 'Wind Cloak', description: 'Aero mantle. L4+ pieces gain Push-Back ability.', isConsumable: false },
  'gnosis': { name: 'Gnosis', description: 'Golden blade. Non-King/Queen. Grants +1 extra level gain on every capture.', isConsumable: false },
  'shield_scroll': { name: 'Shield Scroll', description: 'Consumable (L2+). Target an allied unit to shield it.', isConsumable: true },
  'rally_scroll': { name: 'Rally Scroll', description: 'Consumable (L3+). Resets user level to trigger a global allied Rally.', isConsumable: true },
  'poison_sword': { name: 'Poison Sword', description: 'Toxic blade. Splashes poison to adjacent enemies on capture.', isConsumable: false },
  'antidote': { name: 'Antidote', description: 'Consumable. Cures all allied units of poison.', isConsumable: true },
  'crossbow': { name: 'Crossbow', description: 'Archer only. Snipe KS at 3. Targets equal/lower level enemies. Archer levels on capture.', isConsumable: false },
  'poison_tunic': { name: 'Poison Tunic', description: 'Hazardous vest. Poisons any piece that captures the wearer.', isConsumable: false },
  'getonation_scroll': { name: 'Detonation Scroll', description: 'Consumable (L5+). Causes the equipped piece to self-destruct.', isConsumable: true },
  'phase_boots': { name: 'Phase Boots', description: 'Ethereal boots (L2+). Jump over friendly pieces while moving.', isConsumable: false },
  'swap_scroll': { name: 'Swap Scroll', description: 'Consumable (L3+). Trade places with another allied piece.', isConsumable: true },
  'grimoir': { name: 'Grimoir', description: 'Dark book. Boosts adjacent non-Royal allies by +2 levels.', isConsumable: false },
  'soul_link': { name: 'Soul Link', description: 'Cursed amulet. Bound pieces share levels and shared destruction.', isConsumable: false },
  'logas': { name: 'Logas', description: 'Holy book. Grants adjacent allies +1 level on their captures.', isConsumable: false },
  'berserkers_mask': { name: 'Berserker\'s Mask', description: 'Fierce mask. +3 levels on capture, but must capture if able.', isConsumable: false },
  'ice_scroll': { name: 'Ice Scroll', description: 'Consumable (L2+). Freezes adjacent enemies for 2 turns (invulnerable).', isConsumable: true },
  'resurrection_scroll': { name: 'Resurrection Scroll', description: 'Consumable (L4+). Resurrects highest value ally to random adjacent square at L1.', isConsumable: true },
  'faith_scroll': { name: 'Faith Scroll', description: 'Consumable (L5+). 50% chance to convert adjacent enemy non-king pieces.', isConsumable: true },
  'tortoise_hammer': { name: 'Tortoise Hammer', description: 'Limits move/capture to 1 square forward. Captures enemies cardinally adjacent to target.', isConsumable: false },
  'leach_blade': { name: 'Leach Blade', description: 'Dark blade. Capturing reduces all adjacent enemies by 1 level.', isConsumable: false },
  'kings_decree': { name: 'King\'s Decree', description: 'Consumable. King only. Target an allied Level 1 Pawn to promote it to a Commander.', isConsumable: true },
  'gravity_stone': { name: 'Gravity Stone', description: 'Accessory. Capturing pieces pulls enemy units that are 2 squares away 1 square closer.', isConsumable: false },
  'lead_boots': { name: 'Lead Boots', description: 'Passive. Equipped unit cannot be moved by Push-Back or Gravity effects.', isConsumable: false },
  'blast_shield': { name: 'Blast Shield', description: 'Shield. Non-Royal only. Immune to self-destructs and explosions.', isConsumable: false },
  'monks_robe': { name: 'Monk\'s Robe', description: 'Robe. Bishops/Archbishops only. Increases conversion chance by 20%.', isConsumable: false },
  'training_weights': { name: 'Training Weights', description: 'Weights. Non-Royal only. Increases level by 1 every 3 turns.', isConsumable: false },
  'ice_tunic': { name: 'Ice Tunic', description: 'Frosty vest. Freezes any piece that captures the wearer for 1 turn.', isConsumable: false },
  'ice_sword': { name: 'Ice Sword', description: 'Crystalline blade. Capturing freezes cardinally adjacent enemies for 1 turn.', isConsumable: false },
  'ice_blast': { name: 'Ice Blast Scroll', description: 'Consumable. Freeze all adjacent enemy pieces for 2 turns.', isConsumable: true },
  'soul_harvest': { name: 'Soul Harvest Scroll', description: 'Consumable. Non-Royal. Reduces adjacent levels to 1; user gains all lost levels.', isConsumable: true },
  'aura_silence': { name: 'Silence Amulet', description: 'Passive. Adjacent enemy units cannot trigger active skills or use scrolls.', isConsumable: false },
  'grappling_hook': { name: 'Grappling Hook', description: 'Passive. Can swap positions with an allied piece up to 3 squares away (requires line of sight).', isConsumable: false },
  'battering_ram': { name: 'Battering Ram', description: 'Passive. Rook/Palace only. Move into an adjacent Anvil to push it up to 3 squares, crushing enemies.', isConsumable: false },
  'knights_boots': { name: 'Knight\'s Boots', description: 'Passive. Replaces this piece\'s movement with the standard Knight L-shape pattern.', isConsumable: false },
  'golden_chalice': { name: 'Golden Chalice', description: 'Passive. Increases the Experience Value of all captures by this unit by +1 Level.', isConsumable: false },
  'earthquake_scroll': { name: 'Earthquake Scroll', description: 'Consumable (L3+). Target a square to push all units in a 3x3 area 1 square away from the center.', isConsumable: true },
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10 (Boss).', isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20 (Boss).', isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30 (Boss).', isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40 (Boss).', isConsumable: true },
  'portal_scroll_50': { name: 'F50 Portal', description: 'Warp to Floor 50 (Final Boss).', isConsumable: true },
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
  type?: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll' | 'kings-decree' | 'ice-blast' | 'soul-harvest' | 'dance-move' | 'dance-swap' | 'grapple-throw' | 'grapple-hook-swap' | 'ram-push' | 'earthquake-scroll' | 'myco-propagate' | 'tele-portobello' | 'spore-bomb' | 'raise-mycelimen';
  promoteTo?: PieceType;
  thrownPiece?: Piece;
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
  type: 'poof' | 'explosion' | 'shockwave' | 'conversion' | 'light-beam' | 'level-change';
  square: AlgebraicSquare;
  color?: PlayerColor;
  value?: number;
  fromColor?: PlayerColor;
  toColor?: PlayerColor;
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
  type: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll' | 'kings-decree' | 'ice-blast' | 'soul-harvest' | 'earthquake-scroll' | 'myco-propagate' | 'tele-portobello' | 'spore-bomb' | 'raise-mycelimen';
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
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  color?: PlayerColor;
}
