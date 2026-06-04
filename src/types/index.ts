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
  x: number;
  y: number;
  isConsumable: boolean;
}

/**
 * RECALIBRATED METADATA (10px Grid):
 * Panel 1 (x: 0-330): Potions, Food, Tools, Bombs, Portals.
 * Panel 2 (x: 340-670): Weapons, Shields, Armor, Helmets, Cloaks, Jewelry.
 * Divider columns at 330, 670, 1010.
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Potions (Panel 1, Row 2)
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 0, y: 10, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 10, y: 10, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Move twice.', x: 20, y: 10, isConsumable: true },
  
  // Food (Panel 1, Row 3)
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 0, y: 20, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 10, y: 20, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 20, y: 20, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 30, y: 20, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 40, y: 20, isConsumable: true },

  // Scrolls (Panel 1, Row 4)
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 0, y: 30, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 10, y: 30, isConsumable: true },
  
  // Tools (Panel 1, Row 5)
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 0, y: 40, isConsumable: false },
  'shovel': { name: 'Sturdy Shovel', description: 'For digging.', x: 10, y: 40, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 20, y: 40, isConsumable: false },

  // Bombs (Panel 1, Row 6)
  'grenade': { name: 'Grenade', description: 'Explosive.', x: 0, y: 50, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large blast.', x: 10, y: 50, isConsumable: true },

  // Portal Scrolls (Panel 1, Row 7)
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10.', x: 0, y: 60, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 10, y: 60, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 20, y: 60, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 30, y: 60, isConsumable: true },

  // Weapons (Panel 2, Rows 2-6)
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 340, y: 10, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 350, y: 10, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 340, y: 20, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 340, y: 30, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crush.', x: 350, y: 30, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 340, y: 40, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 350, y: 40, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 340, y: 50, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 350, y: 50, isConsumable: false },

  // Shields (Panel 2, Row 7)
  'wooden_shield': { name: 'Buckler', description: 'Light defense.', x: 340, y: 60, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 350, y: 60, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 360, y: 60, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 370, y: 60, isConsumable: true },

  // Armor (Panel 2, Row 8)
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 340, y: 70, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 350, y: 70, isConsumable: false },
  
  // Helmets (Panel 2, Row 9)
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 340, y: 80, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy guard.', x: 350, y: 80, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 360, y: 80, isConsumable: false },
  
  // Cloaks (Panel 2, Row 10)
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 340, y: 90, isConsumable: false },
  
  // Jewelry (Panel 2, Row 11)
  'gold_ring': { name: 'Gold Ring', description: 'Valuable.', x: 340, y: 100, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resist.', x: 350, y: 100, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 360, y: 100, isConsumable: false },
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
