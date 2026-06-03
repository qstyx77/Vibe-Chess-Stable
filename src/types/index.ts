
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
 * ITEM METADATA MAPPING (Calibrated to the 134x65 spritesheet.png - 10px tiles)
 * Index = Row * 134 + Column (0-indexed)
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Food & Consumables (Mapped to common food rows)
  'apple': { name: 'Crisp Apple', description: 'A refreshing snack.', spriteIndex: 18 * 134 + 0, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', spriteIndex: 18 * 134 + 4, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged to perfection.', spriteIndex: 18 * 134 + 6, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Strength-boosting meal.', spriteIndex: 18 * 134 + 8, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Stays fresh for weeks.', spriteIndex: 18 * 134 + 14, isConsumable: true },
  
  // Potions
  'health_potion': { name: 'Health Potion', description: 'Restores health points.', spriteIndex: 12 * 134 + 26, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores magical energy.', spriteIndex: 12 * 134 + 28, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Temporarily increases movement.', spriteIndex: 12 * 134 + 30, isConsumable: true },
  
  // Specials
  'grenade': { name: 'Black Powder Grenade', description: 'Explosive damage.', spriteIndex: 20 * 134 + 12, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large area destruction.', spriteIndex: 20 * 134 + 16, isConsumable: true },
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Consumable spell tome.', spriteIndex: 20 * 134 + 20, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit once.', spriteIndex: 20 * 134 + 2, isConsumable: true },
  'portal_scroll_10': { name: 'F10 Portal', description: 'Skip to Floor 10 Hydra.', spriteIndex: 20 * 134 + 22, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Skip to Floor 20 Necro.', spriteIndex: 20 * 134 + 22, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Skip to Floor 30 Colossus.', spriteIndex: 20 * 134 + 22, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Skip to Floor 40 Mirage.', spriteIndex: 20 * 134 + 22, isConsumable: true },

  // Armor (Rows 24+)
  'iron_helmet': { name: 'Iron Helmet', description: 'Basic head protection.', spriteIndex: 4 * 134 + 0, isConsumable: false },
  'knight_helmet': { name: 'Knight\'s Greathelm', description: 'Heavy head protection.', spriteIndex: 4 * 134 + 2, isConsumable: false },
  'plate_armor': { name: 'Full Plate', description: 'Maximized body protection.', spriteIndex: 24 * 134 + 0, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Boosts magical potency.', spriteIndex: 24 * 134 + 8, isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Pawn can move 2 spaces from any rank.', spriteIndex: 24 * 134 + 10, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Immune to Push-Back effects.', spriteIndex: 24 * 134 + 2, isConsumable: false },
  
  // Shields (Rows 26+)
  'wooden_shield': { name: 'Buckler', description: 'Lightweight defense.', spriteIndex: 26 * 134 + 0, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', spriteIndex: 26 * 134 + 2, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Deals damage when attacked.', spriteIndex: 26 * 134 + 8, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'One-time capture reflection.', spriteIndex: 26 * 134 + 10, isConsumable: true },

  // Weapons (Rows 30+)
  'mace': { name: 'Iron Mace', description: 'Blunt force.', spriteIndex: 30 * 134 + 2, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crushing weapon.', spriteIndex: 30 * 134 + 4, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaves through armor.', spriteIndex: 30 * 134 + 16, isConsumable: false },
  'iron_sword': { name: 'Iron Sword', description: 'Standard infantry blade.', spriteIndex: 32 * 134 + 6, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Massive two-handed sword.', spriteIndex: 32 * 134 + 10, isConsumable: false },
  
  // Misc Tools & Accessories
  'shovel': { name: 'Sturdy Shovel', description: 'Useful for digging.', spriteIndex: 28 * 134 + 0, isConsumable: false },
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks through obstacles.', spriteIndex: 28 * 134 + 2, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Illuminates the dark.', spriteIndex: 28 * 134 + 30, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Standard ranged weapon.', spriteIndex: 34 * 134 + 0, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Armor-piercing.', spriteIndex: 34 * 134 + 2, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Magical focus.', spriteIndex: 36 * 134 + 0, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick-cast focus.', spriteIndex: 36 * 134 + 2, isConsumable: false },
  'gold_ring': { name: 'Gold Ring', description: 'A sign of wealth.', spriteIndex: 50 * 134 + 26, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', spriteIndex: 50 * 134 + 28, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', spriteIndex: 50 * 134 + 30, isConsumable: false },
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
