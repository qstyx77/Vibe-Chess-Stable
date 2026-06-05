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
  | 'portal_scroll_20' 
  | 'portal_scroll_30' 
  | 'portal_scroll_40'
  | 'health_potion' | 'mana_potion' | 'speed_potion' | 'poison_flask'
  | 'apple' | 'ham' | 'cheese' | 'steak' | 'bread' | 'grapes'
  | 'fire_book' | 'ice_book' | 'lightning_book'
  | 'iron_helmet' | 'plate_armor' | 'wizard_robe' | 'leather_armor'
  | 'buckler' | 'iron_shield' | 'spiked_shield'
  | 'iron_sword' | 'claymore' | 'battle_axe' | 'mace'
  | 'long_bow' | 'crossbow'
  | 'magic_staff' | 'wand'
  | 'gold_ring' | 'ruby_ring' | 'emerald_pendant'
  | 'pickaxe' | 'torch';

export interface InventoryItem {
  type: InventoryItemType;
  count: number;
}

export interface ItemMetadata {
  name: string;
  description: string;
  x: number;
  y: number;
  isConsumable: boolean;
}

/**
 * SYSTEMATIC PANEL 3 MAPPING (Black Background)
 * Grid: 10x12 | Gutter: 1px | Panel 3 Base Offset: X=672
 * Item Neighborhood: Rows 18-30
 * Calibration: X = 672 + (Col * 11) | Y = 1 + (Row * 13)
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- ROW 18: POTIONS (Y: 235) ---
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 672, y: 235, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 683, y: 235, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 694, y: 235, isConsumable: true },
  'poison_flask': { name: 'Poison Flask', description: 'Toxic mixture.', x: 705, y: 235, isConsumable: true },

  // --- ROW 19: PROVISIONS (Y: 248) ---
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 672, y: 248, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 683, y: 248, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 694, y: 248, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 705, y: 248, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 716, y: 248, isConsumable: true },
  'grapes': { name: 'Vine Grapes', description: 'Refreshing.', x: 727, y: 248, isConsumable: true },

  // --- ROW 20: ARCANA (Y: 261) ---
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 672, y: 261, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 683, y: 261, isConsumable: true }, 
  'fire_book': { name: 'Tome of Fire', description: 'Burning knowledge.', x: 694, y: 261, isConsumable: false },
  'ice_book': { name: 'Tome of Ice', description: 'Frozen secrets.', x: 705, y: 261, isConsumable: false },
  'lightning_book': { name: 'Tome of Storms', description: 'Electrifying power.', x: 716, y: 261, isConsumable: false },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 727, y: 261, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 738, y: 261, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 749, y: 261, isConsumable: true },

  // --- ROW 21: JEWELRY (Y: 274) ---
  'gold_ring': { name: 'Gold Ring', description: 'Valuable item.', x: 672, y: 274, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', x: 683, y: 274, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 694, y: 274, isConsumable: false },

  // --- ROW 22: TOOLS (Y: 287) ---
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 672, y: 287, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 683, y: 287, isConsumable: false },

  // --- ROW 23: ARMOR (Y: 300) ---
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 672, y: 300, isConsumable: false },
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 683, y: 300, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 683, y: 300, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 694, y: 300, isConsumable: false },
  'leather_armor': { name: 'Leather Tunic', description: 'Light protection.', x: 705, y: 300, isConsumable: false },

  // --- ROW 24: CLOAKS (Y: 313) ---
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 672, y: 313, isConsumable: false },

  // --- ROW 25: SHIELDS (Y: 326) ---
  'buckler': { name: 'Buckler', description: 'Light defense.', x: 672, y: 326, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 683, y: 326, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 694, y: 326, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 705, y: 326, isConsumable: true },

  // --- ROW 26: BLADES (Y: 339) ---
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 672, y: 339, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 683, y: 339, isConsumable: false },
  
  // --- ROW 27: HEAVY WEAPONS (Y: 352) ---
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 672, y: 352, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 683, y: 352, isConsumable: false },

  // --- ROW 29: RANGED (Y: 378) ---
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 672, y: 378, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 683, y: 378, isConsumable: false },

  // --- ROW 30: STAFF (Y: 391) ---
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 672, y: 391, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 683, y: 391, isConsumable: false },
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
