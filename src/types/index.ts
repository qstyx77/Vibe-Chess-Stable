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
  // Legacy support
  spriteIndex?: number;
}

/**
 * SNAP-TO-GRID METADATA (Panel 3 - Equipment):
 * Panel 3 Start X: 670px
 * Grid: 10px wide, 12px tall
 * Snap coordinates to multiples of 10 and 12 to avoid empty gutters.
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Potions (Row 36 - Y:432)
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 750, y: 432, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 740, y: 432, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Move twice.', x: 770, y: 432, isConsumable: true },
  
  // Food (Row 37 - Y:444)
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 680, y: 444, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 690, y: 444, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 700, y: 444, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 710, y: 444, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 720, y: 444, isConsumable: true },

  // Scrolls (Row 38 - Y:456)
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 720, y: 456, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 750, y: 456, isConsumable: true }, 
  
  // Tools (Row 39 - Y:468)
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 680, y: 468, isConsumable: false },
  'shovel': { name: 'Sturdy Shovel', description: 'For digging.', x: 690, y: 468, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 710, y: 468, isConsumable: false },

  // Bombs (Row 39 - adjacent)
  'grenade': { name: 'Grenade', description: 'Explosive.', x: 750, y: 468, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large blast.', x: 760, y: 468, isConsumable: true },

  // Portal Scrolls (Row 38 - Right)
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10.', x: 820, y: 456, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 830, y: 456, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 840, y: 456, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 850, y: 456, isConsumable: true },

  // Armor (Row 40 - Y:480)
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 680, y: 480, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 690, y: 480, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 730, y: 480, isConsumable: false },

  // Cloaks (Row 41 - Y:492)
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 720, y: 492, isConsumable: false },

  // Shields (Row 42 - Y:504)
  'wooden_shield': { name: 'Buckler', description: 'Light defense.', x: 680, y: 504, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 690, y: 504, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 700, y: 504, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 750, y: 504, isConsumable: true },

  // Helmets (Row 48 - Y:576)
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 680, y: 576, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy guard.', x: 690, y: 576, isConsumable: false },

  // Weapons (Row 43-45)
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 680, y: 516, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 690, y: 516, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 680, y: 528, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 680, y: 540, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crush.', x: 690, y: 540, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 680, y: 564, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 700, y: 564, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 680, y: 552, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 700, y: 552, isConsumable: false },

  // Jewelry (Row 49 - Y:588)
  'gold_ring': { name: 'Gold Ring', description: 'Valuable.', x: 750, y: 588, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resist.', x: 760, y: 588, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 790, y: 588, isConsumable: false },
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
