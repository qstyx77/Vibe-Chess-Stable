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
 * GLOBAL SPRITE MAPPING (1340px width sheet)
 * Grid: 10x12 sprites with 1px gutters.
 * Panel 1 Starts: X=11 (after first purple bar)
 * Panel 2 Starts: X=353 (after second purple bar)
 * Panel 3 Starts: X=695 (after third purple bar)
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- ARMOR & CLOAKS (Panel 1) ---
  'plate_armor': { name: 'Full Plate', description: 'Heavy protection.', x: 11, y: 533, isConsumable: false },
  'passive_armor': { name: 'Blue Plate', description: 'Push-Back immunity.', x: 22, y: 533, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 55, y: 533, isConsumable: false },
  'leather_armor': { name: 'Leather Tunic', description: 'Light protection.', x: 44, y: 533, isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 11, y: 546, isConsumable: false },

  // --- SHIELDS (Panel 1, Row 43) ---
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 44, y: 559, isConsumable: true },
  'buckler': { name: 'Buckler', description: 'Light defense.', x: 11, y: 559, isConsumable: false },
  'iron_shield': { name: 'Blue Kite', description: 'Solid defense.', x: 22, y: 559, isConsumable: false },
  'spiked_shield': { name: 'Red Kite', description: 'Thorny defense.', x: 33, y: 559, isConsumable: false },

  // --- POTIONS (Panel 1, Row 36) ---
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 11, y: 468, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 22, y: 468, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 33, y: 468, isConsumable: true },
  'poison_flask': { name: 'Poison Flask', description: 'Toxic mixture.', x: 44, y: 468, isConsumable: true },

  // --- PROVISIONS (Panel 1, Row 37) ---
  'apple': { name: 'Red Apple', description: 'Quick snack.', x: 11, y: 481, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 22, y: 481, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 33, y: 481, isConsumable: true },
  'steak': { name: 'T-Bone Steak', description: 'Power food.', x: 44, y: 481, isConsumable: true },

  // --- SCROLLS & ARCANA (Panel 1, Row 38) ---
  'fireball_scroll': { name: 'Fire Scroll', description: 'Explosive magic.', x: 44, y: 494, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 397, y: 260, isConsumable: true }, // Feather in Panel 2
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 55, y: 494, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 66, y: 494, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 77, y: 494, isConsumable: true },

  // --- WEAPONS (Panel 1, Row 44+) ---
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 11, y: 572, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 22, y: 572, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 11, y: 585, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 11, y: 598, isConsumable: false },

  // --- TOOLS (Panel 3) ---
  'pickaxe': { name: 'Pickaxe', description: 'Breaks blocks.', x: 706, y: 260, isConsumable: false },
  'torch': { name: 'Torch', description: 'Lights the way.', x: 717, y: 260, isConsumable: false },

  // --- STUBS ---
  'fire_book': { name: 'Tome of Fire', description: 'Burning knowledge.', x: 11, y: 494, isConsumable: false },
  'ice_book': { name: 'Tome of Ice', description: 'Frozen secrets.', x: 22, y: 494, isConsumable: false },
  'lightning_book': { name: 'Tome of Storms', description: 'Electrifying power.', x: 33, y: 494, isConsumable: false },
  'bread': { name: 'Wheat Bread', description: 'Sustenance.', x: 55, y: 481, isConsumable: true },
  'grapes': { name: 'Grapes', description: 'Refreshing.', x: 66, y: 481, isConsumable: true },
  'iron_helmet': { name: 'Great Helm', description: 'Head guard.', x: 55, y: 559, isConsumable: false },
  'gold_ring': { name: 'Gold Ring', description: 'Valuable item.', x: 11, y: 507, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', x: 22, y: 507, isConsumable: false },
  'emerald_pendant': { name: 'Pendant', description: 'Nature blessing.', x: 33, y: 507, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 11, y: 611, isConsumable: false },
  'crossbow': { name: 'Crossbow', description: 'Piercing bolts.', x: 22, y: 611, isConsumable: false },
  'magic_staff': { name: 'Wood Staff', description: 'Mana focus.', x: 33, y: 611, isConsumable: false },
  'wand': { name: 'Ebony Wand', description: 'Quick cast.', x: 44, y: 611, isConsumable: false },
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
