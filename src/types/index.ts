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
 * COMPREHENSIVE EQUIPMENT CATALOG (Panel 3 - Black Background):
 * Panel 3 Start: X = 670px (Column 67)
 * Cell Size: 10px (W) x 12px (H)
 * All coordinates are absolute pixels on the 1340px spritesheet.
 */
export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  // --- ROW 0: POTIONS (Y: 0) ---
  'health_potion': { name: 'Health Potion', description: 'Restores vitality.', x: 670, y: 0, isConsumable: true },
  'mana_potion': { name: 'Mana Potion', description: 'Restores energy.', x: 680, y: 0, isConsumable: true },
  'speed_potion': { name: 'Haste Potion', description: 'Increases movement.', x: 690, y: 0, isConsumable: true },
  
  // --- ROW 1: FOOD (Y: 12) ---
  'apple': { name: 'Crisp Apple', description: 'Quick snack.', x: 670, y: 12, isConsumable: true },
  'ham': { name: 'Roasted Ham', description: 'Hearty meal.', x: 680, y: 12, isConsumable: true },
  'cheese': { name: 'Cave Cheese', description: 'Aged well.', x: 690, y: 12, isConsumable: true },
  'steak': { name: 'Grizzly Steak', description: 'Power food.', x: 700, y: 12, isConsumable: true },
  'bread': { name: 'Elven Bread', description: 'Sustenance.', x: 710, y: 12, isConsumable: true },

  // --- ROW 2: MAGIC SCROLLS (Y: 24) ---
  'fireball_scroll': { name: 'Fireball Scroll', description: 'Explosive magic.', x: 670, y: 24, isConsumable: true },
  'phoenix_down': { name: 'Phoenix Down', description: 'Resurrects unit.', x: 680, y: 24, isConsumable: true }, 
  'portal_scroll_10': { name: 'F10 Portal', description: 'Warp to Floor 10.', x: 700, y: 24, isConsumable: true },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', x: 710, y: 24, isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', x: 720, y: 24, isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', x: 730, y: 24, isConsumable: true },

  // --- ROW 3: JEWELRY (Y: 36) ---
  'gold_ring': { name: 'Gold Ring', description: 'Valuable item.', x: 670, y: 36, isConsumable: false },
  'ruby_ring': { name: 'Ruby Ring', description: 'Fire resistance.', x: 680, y: 36, isConsumable: false },
  'emerald_pendant': { name: 'Emerald Pendant', description: 'Nature blessing.', x: 690, y: 36, isConsumable: false },

  // --- ROW 4: TOOLS & EXPLOSIVES (Y: 48) ---
  'pickaxe': { name: 'Iron Pickaxe', description: 'Breaks blocks.', x: 670, y: 48, isConsumable: false },
  'shovel': { name: 'Sturdy Shovel', description: 'For digging.', x: 680, y: 48, isConsumable: false },
  'torch': { name: 'Everlasting Torch', description: 'Lights the way.', x: 690, y: 48, isConsumable: false },
  'grenade': { name: 'Grenade', description: 'Explosive item.', x: 700, y: 48, isConsumable: true },
  'bomb': { name: 'Mega Bomb', description: 'Large blast radius.', x: 710, y: 48, isConsumable: true },

  // --- ROW 5: BODY ARMOR (Y: 60) ---
  'plate_armor': { name: 'Full Plate', description: 'Solid protection.', x: 670, y: 60, isConsumable: false },
  'passive_armor': { name: 'Heavy Armor', description: 'Push-Back immunity.', x: 680, y: 60, isConsumable: false },
  'wizard_robe': { name: 'Arcane Robe', description: 'Magic boost.', x: 690, y: 60, isConsumable: false },

  // --- ROW 6: CLOAKS & BOOTS (Y: 72) ---
  'swift_cloak': { name: 'Swift Cloak', description: 'Move 2 spaces.', x: 670, y: 72, isConsumable: false },

  // --- ROW 7: SHIELDS & HELMETS (Y: 84) ---
  'wooden_shield': { name: 'Buckler', description: 'Light defense.', x: 670, y: 84, isConsumable: false },
  'iron_shield': { name: 'Kite Shield', description: 'Solid defense.', x: 680, y: 84, isConsumable: false },
  'spiked_shield': { name: 'Spiked Shield', description: 'Thorny defense.', x: 690, y: 84, isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Reflects captures.', x: 700, y: 84, isConsumable: true },
  'iron_helmet': { name: 'Iron Helmet', description: 'Head guard.', x: 720, y: 84, isConsumable: false },
  'knight_helmet': { name: 'Greathelm', description: 'Heavy guard.', x: 730, y: 84, isConsumable: false },

  // --- ROWS 8-15: WEAPONS LIBRARY (Y: 96-180) ---
  'iron_sword': { name: 'Iron Sword', description: 'Standard blade.', x: 670, y: 96, isConsumable: false },
  'claymore': { name: 'Claymore', description: 'Heavy blade.', x: 680, y: 96, isConsumable: false },
  'battle_axe': { name: 'Battle Axe', description: 'Cleaving edge.', x: 670, y: 108, isConsumable: false },
  'mace': { name: 'Iron Mace', description: 'Blunt force.', x: 670, y: 120, isConsumable: false },
  'morning_star': { name: 'Morning Star', description: 'Spiked crush.', x: 680, y: 120, isConsumable: false },
  'magic_staff': { name: 'Crystal Staff', description: 'Mana focus.', x: 670, y: 144, isConsumable: false },
  'wand': { name: 'Elder Wand', description: 'Quick cast.', x: 690, y: 144, isConsumable: false },
  'long_bow': { name: 'Long Bow', description: 'Ranged attack.', x: 670, y: 132, isConsumable: false },
  'crossbow': { name: 'Heavy Crossbow', description: 'Piercing bolts.', x: 690, y: 132, isConsumable: false },
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
