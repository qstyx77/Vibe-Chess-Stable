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
 * GLOBAL DEFINITIVE PIXEL MAPPING
 * Every entry points to the EXACT top-left pixel (x, y) on the 1340px spritesheet.
 * Grid logic: 10px width, 12px height, 1px gutters.
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- DEFINITIVE EQUIPMENT (Panel 1 Bottom) ---
  'plate_armor': { name: 'Full Plate', description: 'Heavy protection.', x: 1, y: 274, isConsumable: false },
  'passive_armor': { name: 'Blue Plate', description: 'Push-Back immunity.', x: 1, y: 274, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 1, y: 287, isConsumable: true },
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 34, y: 287, isConsumable: false },

  // POTIONS & FLASKS (X: 1, 12, 23, 34 | Y: 222)
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 1, y: 222, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 12, y: 222, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 23, y: 222, isConsumable: true },
  'poison_flask': { name: 'Poison Flask', description: 'Toxic mixture.', x: 34, y: 222, isConsumable: true },

  // OTHER GEAR (X: 1, 12, 23, 34 | Y: 274 / 287)
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 23, y: 274, isConsumable: false },
  'leather_armor': { name: 'Leather Tunic', description: 'Light protection.', x: 34, y: 274, isConsumable: false },
  'buckler': { name: 'Buckler', description: 'Light defense.', x: 12, y: 287, isConsumable: false },
  'iron_shield': { name: 'Iron Shield', description: 'Solid defense.', x: 23, y: 287, isConsumable: false },

  // --- PANEL 3: MODERN & TECH (X: 695+) ---
  'fireball_scroll': { name: 'Fire Scroll', description: 'Explosive magic.', x: 706, y: 27, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 717, y: 27, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 728, y: 27, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 739, y: 27, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 750, y: 27, isConsumable: true },

  'apple': { name: 'Red Apple', description: 'Quick snack.', x: 695, y: 14, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 706, y: 14, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 717, y: 14, isConsumable: true },
  'steak': { name: 'T-Bone Steak', description: 'Power food.', x: 728, y: 14, isConsumable: true },

  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 706, y: 118, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 717, y: 118, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 728, y: 118, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 739, y: 118, isConsumable: false },

  'pickaxe': { name: 'Pickaxe', description: 'Breaks blocks.', x: 695, y: 144, isConsumable: false },
  'torch': { name: 'Torch', description: 'Lights the way.', x: 706, y: 144, isConsumable: false },

  // FALLBACKS
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 34, y: 287, isConsumable: false },
  'bread': { name: 'Bread', description: 'Daily bread.', x: 739, y: 14, isConsumable: true },
  'grapes': { name: 'Grapes', description: 'Fresh grapes.', x: 750, y: 14, isConsumable: true },
  'fire_book': { name: 'Fire Book', description: 'Forbidden lore.', x: 706, y: 27, isConsumable: false },
  'ice_book': { name: 'Ice Book', description: 'Frozen secrets.', x: 717, y: 27, isConsumable: false },
  'lightning_book': { name: 'Lightning Book', description: 'Shocking truth.', x: 728, y: 27, isConsumable: false },
  'iron_helmet': { name: 'Helm', description: 'Solid helm.', x: 1, y: 1, isConsumable: false },
  'long_bow': { name: 'Bow', description: 'Standard bow.', x: 706, y: 144, isConsumable: false },
  'crossbow': { name: 'Crossbow', description: 'Powerful crossbow.', x: 706, y: 144, isConsumable: false },
  'magic_staff': { name: 'Staff', description: 'Magic focus.', x: 695, y: 144, isConsumable: false },
  'wand': { name: 'Wand', description: 'Magic wand.', x: 695, y: 144, isConsumable: false },
  'gold_ring': { name: 'Ring', description: 'Shiny ring.', x: 1, y: 1, isConsumable: false },
  'ruby_ring': { name: 'Ring', description: 'Red gem ring.', x: 1, y: 1, isConsumable: false },
  'emerald_pendant': { name: 'Pendant', description: 'Green gem.', x: 1, y: 1, isConsumable: false },
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
