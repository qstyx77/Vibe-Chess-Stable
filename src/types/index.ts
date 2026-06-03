
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
 * ITEM METADATA MAPPING (Calibrated to the 67x31 spritesheet.png)
 * Index = Row * 67 + Column (0-indexed)
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Row 10: Food (idx 9)
  'apple': { name: 'Crisp Apple', description: 'A refreshing snack.', spriteIndex: 9 * 67 + 0, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', spriteIndex: 9 * 67 + 2, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged to perfection.', spriteIndex: 9 * 67 + 3, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Strength-boosting meal.', spriteIndex: 9 * 67 + 4, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Stays fresh for weeks.', spriteIndex: 9 * 67 + 7, isConsumable: true },
  
  // Row 7: Potions (idx 6)
  'health_potion': { name: 'Health Potion', description: 'Restores health points.', spriteIndex: 6 * 67 + 13, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores magical energy.', spriteIndex: 6 * 67 + 14, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Temporarily increases movement.', spriteIndex: 6 * 67 + 15, isConsumable: true },
  
  // Row 11: Specials (idx 10)
  'grenade': { name: 'Black Powder Grenade', description: 'Explosive damage.', spriteIndex: 10 * 67 + 6, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large area destruction.', spriteIndex: 10 * 67 + 8, isConsumable: true },
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Consumable spell tome.', spriteIndex: 10 * 67 + 10, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit once.', spriteIndex: 10 * 67 + 1, isConsumable: true },
  'portal_scroll_10': { name: 'F10 Portal', description: 'Skip to Floor 10 Hydra.', spriteIndex: 10 * 67 + 11, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Skip to Floor 20 Necro.', spriteIndex: 10 * 67 + 11, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Skip to Floor 30 Colossus.', spriteIndex: 10 * 67 + 11, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Skip to Floor 40 Mirage.', spriteIndex: 10 * 67 + 11, isConsumable: true },

  // Row 13: Armor (idx 12)
  'iron_helmet': { name: 'Iron Helmet', description: 'Basic head protection.', spriteIndex: 2 * 67 + 0, isConsumable: false },
  'knight_helmet': { name: 'Knight\'s Greathelm', description: 'Heavy head protection.', spriteIndex: 2 * 67 + 1, isConsumable: false },
  'plate_armor': { name: 'Full Plate', description: 'Maximized body protection.', spriteIndex: 12 * 67 + 0, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Boosts magical potency.', spriteIndex: 12 * 67 + 4, isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Pawn can move 2 spaces from any rank.', spriteIndex: 12 * 67 + 5, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Immune to Push-Back effects.', spriteIndex: 12 * 67 + 1, isConsumable: false },
  
  // Row 14: Shields (idx 13)
  'wooden_shield': { name: 'Buckler', description: 'Lightweight defense.', spriteIndex: 13 * 67 + 0, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', spriteIndex: 13 * 67 + 1, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Deals damage when attacked.', spriteIndex: 13 * 67 + 4, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'One-time capture reflection.', spriteIndex: 13 * 67 + 5, isConsumable: true },

  // Row 16-17: Weapons (idx 15-16)
  'mace': { name: 'Iron Mace', description: 'Blunt force.', spriteIndex: 15 * 67 + 1, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crushing weapon.', spriteIndex: 15 * 67 + 2, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaves through armor.', spriteIndex: 15 * 67 + 8, isConsumable: false },
  'iron_sword': { name: 'Iron Sword', description: 'Standard infantry blade.', spriteIndex: 16 * 67 + 3, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Massive two-handed sword.', spriteIndex: 16 * 67 + 5, isConsumable: false },
  
  // Misc Tools & Accessories
  'shovel': { name: 'Sturdy Shovel', description: 'Useful for digging.', spriteIndex: 14 * 67 + 0, isConsumable: false },
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks through obstacles.', spriteIndex: 14 * 67 + 1, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Illuminates the dark.', spriteIndex: 14 * 67 + 15, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Standard ranged weapon.', spriteIndex: 17 * 67 + 0, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Armor-piercing.', spriteIndex: 17 * 67 + 1, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Magical focus.', spriteIndex: 18 * 67 + 0, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick-cast focus.', spriteIndex: 18 * 67 + 1, isConsumable: false },
  'gold_ring': { name: 'Gold Ring', description: 'A sign of wealth.', spriteIndex: 25 * 67 + 13, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', spriteIndex: 25 * 67 + 14, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', spriteIndex: 25 * 67 + 15, isConsumable: false },
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
