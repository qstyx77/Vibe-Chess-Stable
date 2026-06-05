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
 * GLOBAL ABSOLUTE MAPPING (Panel 3: Equipment)
 * Panel 3 Starts: X=695
 * Grid: 10x12 sprites with 1px gutters (11x13 step).
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- ARMOR & CLOAKS (Row 5 & 6) ---
  'plate_armor': { name: 'Full Plate', description: 'Heavy protection.', x: 706, y: 65, isConsumable: false },
  'passive_armor': { name: 'Blue Plate', description: 'Push-Back immunity.', x: 717, y: 65, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 750, y: 65, isConsumable: false },
  'leather_armor': { name: 'Leather Tunic', description: 'Light protection.', x: 739, y: 65, isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 706, y: 78, isConsumable: false },

  // --- SHIELDS (Row 7) ---
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 739, y: 91, isConsumable: true },
  'buckler': { name: 'Buckler', description: 'Light defense.', x: 706, y: 91, isConsumable: false },
  'iron_shield': { name: 'Blue Kite', description: 'Solid defense.', x: 717, y: 91, isConsumable: false },
  'spiked_shield': { name: 'Red Kite', description: 'Thorny defense.', x: 728, y: 91, isConsumable: false },

  // --- POTIONS (Row 0) ---
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 706, y: 0, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 717, y: 0, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 728, y: 0, isConsumable: true },
  'poison_flask': { name: 'Poison Flask', description: 'Toxic mixture.', x: 739, y: 0, isConsumable: true },

  // --- PROVISIONS (Row 1) ---
  'apple': { name: 'Red Apple', description: 'Quick snack.', x: 706, y: 13, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 717, y: 13, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 728, y: 13, isConsumable: true },
  'steak': { name: 'T-Bone Steak', description: 'Power food.', x: 739, y: 13, isConsumable: true },

  // --- SCROLLS & ARCANA (Row 2) ---
  'fireball_scroll': { name: 'Fire Scroll', description: 'Explosive magic.', x: 739, y: 26, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 750, y: 26, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 750, y: 26, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 761, y: 26, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 772, y: 26, isConsumable: true },

  // --- WEAPONS (Row 8+) ---
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 706, y: 104, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 717, y: 104, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 706, y: 117, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 706, y: 130, isConsumable: false },

  // --- JEWELRY (Row 3) ---
  'gold_ring': { name: 'Gold Ring', description: 'Valuable item.', x: 706, y: 39, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', x: 717, y: 39, isConsumable: false },
  'emerald_pendant': { name: 'Pendant', description: 'Nature blessing.', x: 728, y: 39, isConsumable: false },

  // --- TOOLS ---
  'pickaxe': { name: 'Pickaxe', description: 'Breaks blocks.', x: 706, y: 143, isConsumable: false },
  'torch': { name: 'Torch', description: 'Lights the way.', x: 717, y: 143, isConsumable: false },

  // --- STUBS ---
  'fire_book': { name: 'Tome of Fire', description: 'Burning knowledge.', x: 706, y: 26, isConsumable: false },
  'ice_book': { name: 'Tome of Ice', description: 'Frozen secrets.', x: 717, y: 26, isConsumable: false },
  'lightning_book': { name: 'Tome of Storms', description: 'Electrifying power.', x: 728, y: 26, isConsumable: false },
  'bread': { name: 'Wheat Bread', description: 'Sustenance.', x: 750, y: 13, isConsumable: true },
  'grapes': { name: 'Grapes', description: 'Refreshing.', x: 761, y: 13, isConsumable: true },
  'iron_helmet': { name: 'Great Helm', description: 'Head guard.', x: 750, y: 91, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 706, y: 156, isConsumable: false },
  'crossbow': { name: 'Crossbow', description: 'Piercing bolts.', x: 717, y: 156, isConsumable: false },
  'magic_staff': { name: 'Wood Staff', description: 'Mana focus.', x: 728, y: 156, isConsumable: false },
  'wand': { name: 'Ebony Wand', description: 'Quick cast.', x: 739, y: 156, isConsumable: false },
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
