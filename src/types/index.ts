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
  // Legacy support
  spriteIndex?: number;
}

/**
 * RECALIBRATED METADATA (Panel 3 - Equipment Block):
 * X-Offset: Starts at X: 670
 * Nudge applied: +2px X, +5px Y to avoid purple bleeding and center within 10x12 window
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // Potions (Row 15 - Y:180)
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 752, y: 185, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 742, y: 185, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Move twice.', x: 772, y: 185, isConsumable: true },
  
  // Food (Row 11 - Y:132)
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 682, y: 137, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 692, y: 137, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 702, y: 137, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 712, y: 137, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 722, y: 137, isConsumable: true },

  // Scrolls (Row 25 - Y:300)
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 722, y: 305, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 752, y: 305, isConsumable: true }, 
  
  // Tools (Row 10 - Y:120)
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 682, y: 125, isConsumable: false },
  'shovel': { name: 'Sturdy Shovel', description: 'For digging.', x: 692, y: 125, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 712, y: 125, isConsumable: false },

  // Bombs (Row 9 - Y:108)
  'grenade': { name: 'Grenade', description: 'Explosive.', x: 682, y: 113, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large blast.', x: 692, y: 113, isConsumable: true },

  // Portal Scrolls (Row 25)
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10.', x: 822, y: 305, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 832, y: 305, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 842, y: 305, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 852, y: 305, isConsumable: true },

  // Weapons (Row 17-21)
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 682, y: 209, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 692, y: 209, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 682, y: 221, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 682, y: 233, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crush.', x: 692, y: 233, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 682, y: 257, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 702, y: 257, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 682, y: 245, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 702, y: 245, isConsumable: false },

  // Shields (Row 30 - Y:360)
  'wooden_shield': { name: 'Buckler', description: 'Light defense.', x: 682, y: 365, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 692, y: 365, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 702, y: 365, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 772, y: 365, isConsumable: true },

  // Armor (Row 23 - Y:276)
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 682, y: 281, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 692, y: 281, isConsumable: false },
  
  // Helmets (Row 22 - Y:264)
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 682, y: 269, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy guard.', x: 692, y: 269, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 732, y: 281, isConsumable: false },
  
  // Cloaks (Row 23)
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 722, y: 281, isConsumable: false },
  
  // Jewelry (Row 28 - Y:336)
  'gold_ring': { name: 'Gold Ring', description: 'Valuable.', x: 752, y: 341, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resist.', x: 762, y: 341, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 792, y: 341, isConsumable: false },
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
