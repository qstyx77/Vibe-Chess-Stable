
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
  | 'cardinal_greaves'
  | 'drift_boots'
  | 'queens_peace'
  | 'wind_sword'
  | 'middle_way'
  | 'phoenix_down'
  | 'wind_scroll'
  | 'life_leach'
  | 'summon_anvil'
  | 'wind_cloak'
  | 'gnosis'
  | 'shield_scroll'
  | 'rally_scroll'
  | 'poison_dagger'
  | 'antidote'
  | 'crossbow'
  | 'poison_tunic'
  | 'detonation_scroll'
  | 'phase_boots'
  | 'swap_scroll'
  | 'grimoir'
  | 'soul_link'
  | 'logas'
  | 'berserkers_mask'
  | 'ice_scroll'
  | 'resurrection_scroll'
  | 'faith_scroll'
  | 'tortoise_hammer'
  | 'leach_blade'
  | 'portal_scroll_20' 
  | 'portal_scroll_30' 
  | 'portal_scroll_40';

export interface InventoryItem {
  type: InventoryItemType;
  count: number;
}

export interface ItemMetadata {
  name: string;
  description: string;
  isConsumable: boolean;
}

export const ITEM_METADATA: Record<InventoryItemType, ItemMetadata> = {
  'passive_armor': { name: 'Blue Plate', description: 'Heavy chestplate. Push-Back immunity.', isConsumable: false },
  'mirror_shield': { name: 'Mirror Shield', description: 'Non-Royal only. Reflects one capture attempt, then breaks.', isConsumable: false },
  'swift_cloak': { name: 'Swift Cloak', description: 'Red cloak. Double move range for small units.', isConsumable: false },
  'cardinal_greaves': { name: 'Cardinal Greaves', description: 'Green boots. Move (no capture) 1 space cardinally forward.', isConsumable: false },
  'drift_boots': { name: 'Drift Boots', description: 'Blue boots. Move (no capture) 1 space diagonally forward.', isConsumable: false },
  'queens_peace': { name: 'Queen\'s Peace', description: 'Serene ring. Queen only. Invulnerable but cannot capture.', isConsumable: false },
  'wind_sword': { name: 'Wind Sword', description: 'Aero blade. Push-Back ability triggered on attack.', isConsumable: false },
  'middle_way': { name: 'The Middle Way', description: 'Balanced amulet. Locks piece level at 3 permanently.', isConsumable: false },
  'phoenix_down': { name: 'Phoenix Down', description: 'Magic feather. Auto-resurrection at L1 (Consumable).', isConsumable: true },
  'wind_scroll': { name: 'Wind Scroll', description: 'Consumable. Target an empty space to push back adjacent units.', isConsumable: true },
  'life_leach': { name: 'Life Leach', description: 'Consumable. Global: reduces all enemy levels by 1.', isConsumable: true },
  'summon_anvil': { name: 'Anvil Scroll', description: 'Consumable. Target an empty square to drop a solid Anvil.', isConsumable: true },
  'wind_cloak': { name: 'Wind Cloak', description: 'Aero mantle. L4+ pieces gain Push-Back ability.', isConsumable: false },
  'gnosis': { name: 'Gnosis', description: 'Golden blade. Non-King/Queen. Grants +1 extra level gain on every capture.', isConsumable: false },
  'shield_scroll': { name: 'Shield Scroll', description: 'Consumable (L2+). Target an allied unit to shield it.', isConsumable: true },
  'rally_scroll': { name: 'Rally Scroll', description: 'Consumable (L3+). Resets user level to trigger a global allied Rally.', isConsumable: true },
  'poison_dagger': { name: 'Poison Dagger', description: 'Toxic blade. Splashes poison to adjacent enemies on capture.', isConsumable: false },
  'antidote': { name: 'Antidote', description: 'Consumable. Cures all allied units of poison.', isConsumable: true },
  'crossbow': { name: 'Crossbow', description: 'Archer only. Grants a Snipe Killstreak at 3 in addition to Anvil.', isConsumable: false },
  'poison_tunic': { name: 'Poison Tunic', description: 'Hazardous vest. Poisons any piece that captures the wearer.', isConsumable: false },
  'detonation_scroll': { name: 'Detonation Scroll', description: 'Consumable (L5+). Causes the equipped piece to self-destruct.', isConsumable: true },
  'phase_boots': { name: 'Phase Boots', description: 'Ethereal boots (L2+). Jump over friendly pieces while moving.', isConsumable: false },
  'swap_scroll': { name: 'Swap Scroll', description: 'Consumable (L3+). Trade places with another allied piece.', isConsumable: true },
  'grimoir': { name: 'Grimoir', description: 'Dark book. Boosts adjacent non-Royal allies by +2 levels.', isConsumable: false },
  'soul_link': { name: 'Soul Link', description: 'Cursed amulet. Bound pieces share levels and shared destruction.', isConsumable: false },
  'logas': { name: 'Logas', description: 'Holy book. Grants adjacent allies +1 level on their captures.', isConsumable: false },
  'berserkers_mask': { name: 'Berserker\'s Mask', description: 'Fierce mask. +3 levels on capture, but must capture if able.', isConsumable: false },
  'ice_scroll': { name: 'Ice Scroll', description: 'Consumable (L2+). Freezes adjacent enemies for 2 turns (invulnerable).', isConsumable: true },
  'resurrection_scroll': { name: 'Resurrection Scroll', description: 'Consumable (L4+). Resurrects highest value ally to random adjacent square at L1.', isConsumable: true },
  'faith_scroll': { name: 'Faith Scroll', description: 'Consumable (L5+). 50% chance to convert adjacent enemy non-king pieces.', isConsumable: true },
  'tortoise_hammer': { name: 'Tortoise Hammer', description: 'Limits move/capture to 1 square forward. Captures enemies cardinally adjacent to target.', isConsumable: false },
  'leach_blade': { name: 'Leach Blade', description: 'Dark blade. Capturing reduces all adjacent enemies by 1 level.', isConsumable: false },
  'portal_scroll_20': { name: 'F20 Portal', description: 'Warp to Floor 20.', isConsumable: true },
  'portal_scroll_30': { name: 'F30 Portal', description: 'Warp to Floor 30.', isConsumable: true },
  'portal_scroll_40': { name: 'F40 Portal', description: 'Warp to Floor 40.', isConsumable: true },
};

export interface Piece {
  id: string;
  type: PieceType;
  color: PlayerColor;
  level: number;
  hasMoved: boolean;
  invulnerableTurnsRemaining?: number;
  isShielded?: boolean;
  isPoisoned?: boolean;
  heldItem?: InventoryItemType | null;
  cooldownTurnsRemaining?: number;
  frozenTurnsRemaining?: number;
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
  type?: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll';
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
  phoenixResurrection?: { piece: Piece, square: AlgebraicSquare };
  reflectionOccurred?: boolean;
  resurrectionScrollEvent?: { piece: Piece, square: AlgebraicSquare };
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
  type: 'move' | 'capture' | 'castle' | 'promotion' | 'self-destruct' | 'swap' | 'enpassant' | 'wind-scroll' | 'life-leach' | 'summon-anvil' | 'shield-scroll' | 'rally-scroll' | 'antidote' | 'swap-scroll' | 'ice-scroll' | 'resurrection-scroll' | 'faith-scroll';
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
