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
  | 'gold_ring' | 'ruby_ring' | 'emerald_pendant'
  | 'magic_staff' | 'wand'
  | 'long_bow' | 'crossbow';

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
 * RECALIBRATED COORDINATES (Panel 3 - Black)
 * Base X (Col 61): 671px
 * Base Y Offset: +468px (36 rows down from previous attempt)
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- ROW 54: POTIONS (Y: 54 * 13 = 702) ---
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 671, y: 702, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 682, y: 702, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 693, y: 702, isConsumable: true },
  
  // --- ROW 55: FOOD (Y: 55 * 13 = 715) ---
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 671, y: 715, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 682, y: 715, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 693, y: 715, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 704, y: 715, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 715, y: 715, isConsumable: true },

  // --- ROW 56: MAGIC SCROLLS (Y: 56 * 13 = 728) ---
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 671, y: 728, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 682, y: 728, isConsumable: true }, 
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10.', x: 704, y: 728, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 715, y: 728, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 726, y: 728, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 737, y: 728, isConsumable: true },

  // --- ROW 57: JEWELRY (Y: 57 * 13 = 741) ---
  'gold_ring': { name: 'Gold Ring', description: 'Valuable item.', x: 671, y: 741, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', x: 682, y: 741, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 693, y: 741, isConsumable: false },

  // --- ROW 58: TOOLS (Y: 58 * 13 = 754) ---
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 671, y: 754, isConsumable: false },
  'shovel': { name: 'Sturdy Shovel', description: 'For digging.', x: 682, y: 754, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 693, y: 754, isConsumable: false },

  // --- ROW 59: EXPLOSIVES (Y: 59 * 13 = 767) ---
  'grenade': { name: 'Grenade', description: 'Explosive item.', x: 671, y: 767, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large blast radius.', x: 682, y: 767, isConsumable: true },

  // --- ROW 60: HELMETS (Y: 60 * 13 = 780) ---
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 671, y: 780, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy guard.', x: 737, y: 780, isConsumable: false },

  // --- ROW 61: BODY ARMOR (Y: 61 * 13 = 793) ---
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 682, y: 793, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 693, y: 793, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 704, y: 793, isConsumable: false },

  // --- ROW 62: CLOAKS (Y: 62 * 13 = 806) ---
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 671, y: 806, isConsumable: false },

  // --- ROW 63: SHIELDS (Y: 63 * 13 = 819) ---
  'wooden_shield': { name: 'Buckler', description: 'Light defense.', x: 671, y: 819, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 682, y: 819, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 693, y: 819, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 704, y: 819, isConsumable: true },

  // --- ROWS 64+: WEAPONS (Y: 64*13 = 832, etc.) ---
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 671, y: 832, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 682, y: 832, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 693, y: 832, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 704, y: 832, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crush.', x: 715, y: 832, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 671, y: 858, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 682, y: 858, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 671, y: 871, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 682, y: 871, isConsumable: false },
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
