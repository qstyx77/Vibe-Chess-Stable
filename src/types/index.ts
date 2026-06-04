
export type PlayerColor = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' | 'commander' | 'hero' | 'infiltrator' | 'archbishop' | 'palace' | 'archer';
export type ItemType = 'anvil' | 'shroom';

export interface Item {
  type: ItemType;
}

export type InventoryItemType = 
  | 'mirror_shield' 
  | 'swift_cloak' 
  | 'passive_armor' 
  | 'fireball_scroll' 
  | 'phoenix_down' 
  | 'portal_scroll_10' 
  | 'portal_scroll_20' 
  | 'portal_scroll_30' 
  | 'portal_scroll_40'
  | 'apple' | 'ham' | 'cheese' | 'steak' | 'bread'
  | 'health_potion' | 'mana_potion' | 'speed_potion'
  | 'pickaxe' | 'shovel' | 'torch'
  | 'grenade' | 'bomb'
  | 'iron_helmet' | 'knight_helmet' | 'plate_armor' | 'wizard_robe'
  | 'wooden_shield' | 'iron_shield' | 'spiked_shield'
  | 'iron_sword' | 'claymore' | 'battle_axe' | 'mace' | 'morning_star'
  | 'long_bow' | 'crossbow' | 'magic_staff' | 'wand'
  | 'gold_ring' | 'ruby_ring' | 'emerald_pendant';

export interface InventoryItem {
  type: InventoryItemType;
  count: number;
}

export interface ItemMetadata {
  name: string;
  description: string;
  spriteIndex: number;
  isConsumable: boolean;
}

/**
 * ITEM METADATA MAPPING (Recalibrated for 134-column sheet)
 * Neighborhood Logic: 
 * - Row 48 is Terrain (grey blobs)
 * - Row 35 is Entities (pigs)
 * - Row 32 is the start of the Item/Equipment neighborhood.
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Consumables & Potions (Row 32)
  'health_potion': { name: 'Health Potion', description: 'Restores health points.', spriteIndex: 32 * 134 + 0, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores magical energy.', spriteIndex: 32 * 134 + 1, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', spriteIndex: 32 * 134 + 2, isConsumable: true },
  
  // Food (Row 32)
  'apple': { name: 'Crisp Apple', description: 'A refreshing snack.', spriteIndex: 32 * 134 + 10, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', spriteIndex: 32 * 134 + 14, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged to perfection.', spriteIndex: 32 * 134 + 12, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Strength-boosting meal.', spriteIndex: 32 * 134 + 13, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Stays fresh for weeks.', spriteIndex: 32 * 134 + 11, isConsumable: true },
  
  // Armor (Row 33)
  'plate_armor': { name: 'Full Plate', description: 'Maximized protection.', spriteIndex: 33 * 134 + 0, isConsumable: false },
  'iron_helmet': { name: 'Iron Helmet', description: 'Basic head protection.', spriteIndex: 33 * 134 + 1, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy head protection.', spriteIndex: 33 * 134 + 2, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Boosts magical potency.', spriteIndex: 33 * 134 + 3, isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Pawn can move 2 spaces from any rank.', spriteIndex: 33 * 134 + 4, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Immune to Push-Back effects.', spriteIndex: 33 * 134 + 5, isConsumable: false },
  
  // Shields (Row 34)
  'wooden_shield': { name: 'Buckler', description: 'Lightweight defense.', spriteIndex: 34 * 134 + 0, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', spriteIndex: 34 * 134 + 1, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Deals damage when attacked.', spriteIndex: 34 * 134 + 2, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'One-time capture reflection.', spriteIndex: 34 * 134 + 3, isConsumable: true },

  // Weapons (Row 35)
  'iron_sword': { name: 'Iron Sword', description: 'Standard infantry blade.', spriteIndex: 35 * 134 + 0, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Massive two-handed sword.', spriteIndex: 35 * 134 + 1, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaves through armor.', spriteIndex: 35 * 134 + 2, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', spriteIndex: 35 * 134 + 3, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crushing weapon.', spriteIndex: 35 * 134 + 4, isConsumable: false },
  
  // Ranged & Magic (Row 37)
  'long_bow': { name: 'Long Bow', description: 'Standard ranged weapon.', spriteIndex: 37 * 134 + 2, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Armor-piercing.', spriteIndex: 37 * 134 + 3, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Magical focus.', spriteIndex: 37 * 134 + 0, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick-cast focus.', spriteIndex: 37 * 134 + 1, isConsumable: false },
  
  // Scrolls (Row 32)
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Consumable spell tome.', spriteIndex: 32 * 134 + 30, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit once.', spriteIndex: 32 * 134 + 31, isConsumable: true },
  'portal_scroll_10': { name: 'F10 Portal', description: 'Skip to Floor 10.', spriteIndex: 32 * 134 + 32, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Skip to Floor 20.', spriteIndex: 32 * 134 + 33, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Skip to Floor 30.', spriteIndex: 32 * 134 + 34, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Skip to Floor 40.', spriteIndex: 32 * 134 + 35, isConsumable: true },
  
  // Explosives (Row 36)
  'grenade': { name: 'Grenade', description: 'Explosive damage.', spriteIndex: 36 * 134 + 0, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large area destruction.', spriteIndex: 36 * 134 + 1, isConsumable: true },

  // Tools (Row 38)
  'shovel': { name: 'Sturdy Shovel', description: 'Useful for digging.', spriteIndex: 38 * 134 + 0, isConsumable: false },
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks through obstacles.', spriteIndex: 38 * 134 + 1, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Illuminates the dark.', spriteIndex: 38 * 134 + 2, isConsumable: false },
  
  // Jewelry (Row 39)
  'gold_ring': { name: 'Gold Ring', description: 'A sign of wealth.', spriteIndex: 39 * 134 + 0, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', spriteIndex: 39 * 134 + 1, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', spriteIndex: 39 * 134 + 2, isConsumable: false },
};

export interface Piece {
  id: string;
  type: PieceType;
  color: PlayerColor;
  level: number;
  hasMoved: boolean;
  invulnerableTurnsRemaining?: number;
  isShielded?: boolean;
  heldItem?: InventoryItemType | null;
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
  type?: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant';
  promoteTo?: PieceType;
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
  selfCheckByPushBack: boolean;
  queenLevelReducedEvents?: QueenLevelReducedEvent[] | null;
  promotedToInfiltrator?: boolean;
  infiltrationWin?: boolean;
  shroomConsumed?: boolean;
  enPassantTargetSet: AlgebraicSquare | null;
  extraTurn: boolean;
  specialCaptureSquare: AlgebraicSquare | null;
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
  shieldContext?: { boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, newEnPassantTarget: AlgebraicSquare | null } | null;
  
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
  type: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant';
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
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  color?: PlayerColor;
}
