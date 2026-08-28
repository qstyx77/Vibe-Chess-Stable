'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import { InventoryWindow } from '@/components/evolving-chess/InventoryWindow';
import { MycoSpellMenu, type MycoSpell } from '@/components/evolving-chess/MycoSpellMenu';
import {
  initializeBoard,
  createEmptyBoard,
  applyMove,
  algebraicToCoords,
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
  coordsToAlgebraic,
  isValidSquare,
  processRookResurrectionCheck,
  spawnShroom,
  findKing,
  processPoisonDamage,
  getEffectiveLevel,
  getPromotionLevel,
  VAL_MAP,
  isItemValidForPiece,
  isSilenced,
  FRONTLINE_TYPES,
  isSquareAttacked,
  processOilSlickTimers,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, Effect, InventoryItem, InventoryItemType, AIGameState, AIBoardState, AISquareState, SquareState, ItemType } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, Swords, ArrowLeft, BrainCircuit, Package, Skull, RotateCcw, BookOpen } from 'lucide-react';
import { VibeChessAI } from '@/lib/vibe-chess-ai';
import { cn } from '@/lib/utils';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { audioManager } from '@/lib/audio-manager';
import { useSocial } from '@/components/social/SocialContext';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ChessPieceDisplay } from '@/components/evolving-chess/ChessPieceDisplay';

function generateDungeonFloor(level: number, playerArmy: Piece[]): BoardState {
  const board: BoardState = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      row.push({ piece: null, item: null, algebraic: coordsToAlgebraic(r, c), rowIndex: r, colIndex: c, oilSlickTurnsRemaining: 0 });
    }
    board.push(row);
  }
  const king = playerArmy.find(p => p.type === 'king');
  const queens = playerArmy.filter(p => p.type === 'queen');
  const rooks = playerArmy.filter(p => p.type === 'rook' || p.type === 'palace');
  const knights = playerArmy.filter(p => p.type === 'knight' || p.type === 'hero' || p.type === 'archer');
  const bishops = playerArmy.filter(p => p.type === 'bishop' || p.type === 'archbishop');
  const frontline = playerArmy.filter(p => FRONTLINE_TYPES.includes(p.type)).sort(() => Math.random() - 0.5);
  const placedIds = new Set<string>();
  const placePieceAt = (p: Piece | undefined, alg: AlgebraicSquare) => {
    if (!p) return false;
    const { row, col } = algebraicToCoords(alg);
    if (isValidSquare(row, col) && !board[row][col].piece) {
        board[row][col].piece = { ...p, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
        placedIds.add(p.id); return true;
    }
    return false;
  };
  placePieceAt(king, 'e1');
  if (rooks[0]) placePieceAt(rooks[0], 'a1'); if (rooks[1]) placePieceAt(rooks[1], 'h1');
  if (queens[0]) placePieceAt(queens[0], 'd1'); if (knights[0]) placePieceAt(knights[0], 'b1'); if (knights[1]) placePieceAt(knights[1], 'g1');
  if (bishops[0]) placePieceAt(bishops[0], 'c1'); if (bishops[1]) placePieceAt(bishops[1], 'f1');
  const guardSlots: AlgebraicSquare[] = ['d2', 'e2', 'f2'];
  const wingSlots: AlgebraicSquare[] = (['a2', 'b2', 'c2', 'g2', 'h2'] as AlgebraicSquare[]).sort(() => Math.random() - 0.5);
  const frontlineOrder = [...guardSlots, ...wingSlots];
  let frontlineIdx = 0;
  for (const alg of frontlineOrder) {
    while (frontlineIdx < frontline.length && placedIds.has(frontline[frontlineIdx].id)) { frontlineIdx++; }
    if (frontlineIdx < frontline.length) { placePieceAt(frontline[frontlineIdx], alg); frontlineIdx++; }
  }
  const piecePriority = (type: PieceType) => {
    const values: Record<string, number> = { queen: 90, palace: 60, rook: 50, archbishop: 40, hero: 35, archer: 35, bishop: 30, knight: 30, commander: 10, infiltrator: 10, dancer: 10, mimic: 10, grappler: 10, myco_mage: 10, pawn: 10 };
    return values[type] || 0;
  };
  const remainingPieces = playerArmy.filter(p => !placedIds.has(p.id)).sort((a, b) => piecePriority(b.type) - piecePriority(a.type));
  const fillOrder: AlgebraicSquare[] = [ 'd1', 'e1', 'c1', 'f1', 'b1', 'g1', 'a1', 'h1', 'd2', 'e2', 'c2', 'f2', 'b2', 'g2', 'a2', 'h2', 'd3', 'e3', 'c3', 'f3', 'b3', 'g3', 'a3', 'h3', 'd4', 'e4', 'c4', 'f4', 'b4', 'g4', 'a4', 'h4' ];
  let fillIdx = 0;
  for (const p of remainingPieces) {
    while (fillIdx < fillOrder.length) {
        const alg = fillOrder[fillIdx] as AlgebraicSquare; const { row, col } = algebraicToCoords(alg);
        if (!board[row][col].piece) { placePieceAt(p, alg); break; }
        fillIdx++;
    }
  }
  const isBossLevel = level % 10 === 0;
  if (isBossLevel) {
    const bossLevelIndex = Math.floor(level / 10);
    switch (bossLevelIndex) {
      case 1: 
        board[0][3].piece = { id: 'boss-hydra-1', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-hydra-2', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][5].piece = { id: 'boss-hydra-3', type: 'rook', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][3].piece = { id: 'hydra-guard-1', type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][5].piece = { id: `hydra-guard-2`, type: 'knight', color: 'black', level: 2, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 2: 
        board[0][2].piece = { id: 'boss-necro', type: 'archbishop', color: 'black', level: 8, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<4; i++) board[1][i+2].piece = { id: `skeleton-${i}`, type: 'pawn', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][1].piece = { id: 'necro-knight-1', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][6].piece = { id: 'necro-knight-2', type: 'knight', color: 'black', level: 3, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 3: 
        const colL = 15;
        board[0][3].piece = { id: 'boss-colossus-tl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[0][4].piece = { id: 'boss-colossus-tr', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][3].piece = { id: 'boss-colossus-bl', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        board[1][4].piece = { id: 'boss-colossus-br', type: 'king', color: 'black', level: colL, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) { if (i === 3 || i === 4) continue; board[1][i].piece = { id: `skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null }; }
        for(let i=0; i<8; i++) board[2][i].piece = { id: `front-skeleton-shield-${i}`, type: 'pawn', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 4: 
        board[0][3].piece = { id: 'boss-mirage', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) board[0][i].piece = board[0][i].piece || { id: `phantom-${i}`, type: 'bishop', color: 'black', level: 4, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        break;
      case 5: 
        board[0][4].piece = { id: 'boss-entity', type: 'queen', color: 'black', level: 7, hasMoved: false, isShielded: true, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        for(let i=0; i<8; i++) {
          const type: PieceType = i % 2 === 0 ? 'hero' : 'archbishop';
          board[0][i].piece = board[0][i].piece || { id: `aspect-${i}`, type, color: 'black', level: 6, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
          board[1][i].piece = { id: `void-pawn-${i}`, type: 'infiltrator', color: 'black', level: 5, hasMoved: false, isShielded: false, poisonedTurnsRemaining: 0, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
        }
        break;
    }
  } else {
    const pieceCount = Math.min(16, 2 + Math.floor(level / 3));
    const avgLevel = Math.max(1, Math.floor(level / 7) + 1);
    const formations = ['rank', 'diamond', 'triangle', 'scatter'];
    const formation = formations[Math.floor(Math.random() * formations.length)];
    const possibleSquares: {r: number, c: number}[] = [];
    if (formation === 'rank') { for(let r=0; r<2; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c}); }
    else if (formation === 'diamond') { for(let r=0; r<5; r++) for(let c=0; c<8; c++) { if (Math.abs(r - 2) + Math.abs(c - 3.5) <= 3) possibleSquares.push({r,c}); } }
    else if (formation === 'triangle') { for(let r=0; r<4; r++) for(let c=r; c<8-r; c++) possibleSquares.push({r,c}); }
    else { for(let r=0; r<4; r++) for(let c=0; c<8; c++) possibleSquares.push({r,c}); }
    const chosenSquares = possibleSquares.sort(() => Math.random() - 0.5).slice(0, pieceCount);
    chosenSquares.forEach((pos, i) => {
      const types: PieceType[] = ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook'];
      if (level > 15) types.push('commander', 'infiltrator');
      if (level > 25) types.push('queen', 'archbishop', 'archer');
      const type = types[Math.floor(Math.random() * types.length)];
      const pLevel = avgLevel + (Math.random() > 0.6 ? 1 : 0);
      board[pos.r][pos.c].piece = { id: `enemy-${level}-${i}`, type, color: 'black', level: pLevel, hasMoved: false, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0, heldItem: null };
    });
  }
  return board;
}

function adaptBoardForAI(currentBoardState: BoardState, playerForAITurn: PlayerColor, currentKillStreaks: { white: number; black: number }, currentCapturedPieces: { white: Piece[]; black: Piece[] }, gameMoveCounter: number, firstBloodAchieved: boolean, playerWhoGotFirstBlood: PlayerColor | null, enPassantTargetSquare: AlgebraicSquare | null, lastMovedPieceType?: PieceType | null, lastMovedPieceHeldItem?: InventoryItemType | null, shroomSpawnCounter?: number, nextShroomSpawnTurn?: number, necroResurrectionCounter?: number, lastMovedPieceLevel?: number | null, didOpponentCaptureLastTurn?: boolean): AIGameState {
  const newAiBoard: AIBoardState = [];
  for (let r_idx = 0; r_idx < 8; r_idx++) {
    const boardRow = currentBoardState[r_idx]; const newAiRow: AISquareState[] = [];
    if (boardRow) { for (let c_idx = 0; c_idx < 8; c_idx++) { const squareState = boardRow[c_idx]; newAiRow.push({ piece: squareState?.piece ? { ...squareState.piece } : null, item: squareState?.item ? { ...squareState.item } : null }); } } 
    else { for (let c_idx = 0; c_idx < 8; c_idx++) newAiRow.push({ piece: null, item: null }); }
    newAiBoard.push(newAiRow);
  }
  return { board: newAiBoard, currentPlayer: playerForAITurn, killStreaks: { white: currentKillStreaks?.white || 0, black: currentKillStreaks?.black || 0 }, capturedPieces: { white: currentCapturedPieces?.white ? currentCapturedPieces.white.map(p => ({ ...p })) : [], black: currentCapturedPieces?.black ? currentCapturedPieces.black.map(p => ({ ...p })) : [] }, gameOver: false, winner: undefined, extraTurn: false, gameMoveCounter: gameMoveCounter, firstBloodAchieved: firstBloodAchieved, playerWhoGotFirstBlood: playerWhoGotFirstBlood, enPassantTargetSquare: enPassantTargetSquare, shroomSpawnCounter: shroomSpawnCounter, nextShroomSpawnTurn: nextShroomSpawnTurn, necroResurrectionCounter: necroResurrectionCounter, lastMovedPieceType: lastMovedPieceType, lastMovedPieceHeldItem: lastMovedPieceHeldItem, lastMovedPieceLevel: lastMovedPieceLevel, didOpponentCaptureLastTurn };
}

export default function DungeonPage() {
  const { userData, isUserLoading, user } = useUser();
  const { addLog, onlineStatus: socialOnlineStatus } = useSocial();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [playerArmy, setPlayerArmy] = useState<Piece[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({ message: " ", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [lastMovedPieceType, setLastMovedPieceType] = useState<PieceType | null>(null);
  const [lastMovedPieceHeldItem, setLastMovedPieceHeldItem] = useState<InventoryItemType | null>(null);
  const [lastMovedPieceLevel, setLastMovedPieceLevel] = useState<number | null>(null);
  const [pieceForInfoDisplay, setPieceForInfoDisplay] = useState<Piece | null>(null);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);
  const [promotionTargetLevel, setPromotionTargetLevel] = useState<number>(1);
  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);
  const [necroResurrectionCounter, setNecroResurrectionCounter] = useState(0);
  const [isAwaitingAnvilDrop, setIsAwaitingAnvilDrop] = useState(false);
  const [playerToDropAnvil, setPlayerToDropAnvil] = useState<PlayerColor | null>(null);
  const [isAwaitingHolyShield, setIsAwaitingHolyShield] = useState(false);
  const [isAwaitingArcherSnipe, setIsAwaitingArcherSnipe] = useState(false);
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [specialActionContext, setSpecialActionContext] = useState<{ extra: boolean, nextEp: AlgebraicSquare | null, oldStreak: number, newStreak: number, completedMilestones: string[], actingPlayer: PlayerColor, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, capturingPieceId: string | null } | null>(null);
  const [isAwaitingDanceTarget, setIsAwaitingDanceTarget] = useState(false);
  const [dancerToDance, setDancerToDance] = useState<AlgebraicSquare | null>(null);
  const [isAwaitingGrappleThrow, setIsAwaitingGrappleThrow] = useState(false);
  const [grappledPieceSubject, setGrappledPieceSubject] = useState<{ piece: Piece, from: AlgebraicSquare } | null>(null);
  const [grappledItemSubject, setGrappledItemSubject] = useState<{ type: any, from: AlgebraicSquare } | null>(null);
  const [isAwaitingWindScrollTarget, setIsAwaitingWindScrollTarget] = useState(false);
  const [isAwaitingAnvilScrollTarget, setIsAwaitingAnvilScrollTarget] = useState(false);
  const [isAwaitingShieldScrollTarget, setIsAwaitingShieldScrollTarget] = useState(false);
  const [isAwaitingSwapScrollTarget, setIsAwaitingSwapScrollTarget] = useState(false);
  const [isAwaitingDecreeTarget, setIsAwaitingDecreeTarget] = useState(false);
  const [isAwaitingEarthquakeScrollTarget, setIsAwaitingEarthquakeScrollTarget] = useState(false);
  const [isSelectingMycoSpell, setIsSelectingMycoSpell] = useState(false);
  const [isSelectingTeleportAlly, setIsSelectingTeleportAlly] = useState(false);
  const [isSelectingTeleportShroom, setIsSelectingTeleportShroom] = useState(false);
  const [teleportAllyPieceId, setTeleportAllyPieceId] = useState<string | null>(null);
  const [isSelectingSporeBombShroom, setIsSelectingSporeBombShroom] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [promotionQueue, setPromotionQueue] = useState<{ square: AlgebraicSquare, targetLevel: number }[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedInventoryItemType, setSelectedInventoryItemType] = useState<InventoryItemType | null>(null);
  const [aiStalemateStrikes, setAiStalemateStrikes] = useState(0);
  const [hasMovedOnCurrentFloor, setHasMovedOnCurrentFloor] = useState(false);
  const [colossusAwakened, setColossusAwakened] = useState(false);
  const [gameMoveCounter, setGameMoveCounter] = useState(0);
  const [aiPanicCount, setAiPanicCount] = useState(0);
  const [didCaptureLastTurn, setDidCaptureLastTurn] = useState<{ white: boolean, black: boolean }>({ white: false, black: false });

  const isAnySpecialModeActive = isAwaitingCommanderPromotion || isAwaitingAnvilDrop || isPromotingPawn || isAwaitingPawnSacrifice || isInventoryOpen || isAwaitingWindScrollTarget || isAwaitingAnvilScrollTarget || isAwaitingShieldScrollTarget || isAwaitingSwapScrollTarget || isAwaitingHolyShield || isAwaitingArcherSnipe || isAwaitingDanceTarget || dancerToDance || isAwaitingGrappleThrow || isAwaitingEarthquakeScrollTarget || isSelectingMycoSpell || isSelectingTeleportAlly || isSelectingTeleportShroom || isSelectingSporeBombShroom;

  const usedSlots = useMemo(() => {
    return board.flat().filter(sq => sq.piece?.heldItem).length;
  }, [board]);

  const statusMessage = useMemo(() => {
    if (isInventoryOpen) return "SELECT ITEM TO EQUIP!";
    if (isAiThinking) return "DUNGEON IS THINKING...";
    if (isAwaitingPawnSacrifice) return "ROYAL SACRIFICE REQUIRED!";
    if (isPromotingPawn) return "PROMOTE YOUR PAWN!";
    if (isAwaitingCommanderPromotion) return "SELECT PAWN TO BE PROMOTED TO COMMANDER!";
    if (isAwaitingAnvilDrop) return "PLACE AN ANVIL!";
    if (isAwaitingHolyShield) return "SELECT ALLY TO SHIELD!";
    if (isAwaitingArcherSnipe) return "SELECT TARGET TO SNIPE!";
    if (isAwaitingDanceTarget) return dancerToDance ? "PERFORM YOUR DANCE!" : "SELECT A DANCER!";
    if (isAwaitingGrappleThrow) return "THROW TO AN EMPTY SPACE!";
    if (isSelectingMycoSpell) return "CHOOSE MUSHROOMANCY SPELL";
    if (isSelectingTeleportAlly) return "SELECT ALLY TO TELEPORT";
    if (isSelectingTeleportShroom) return "SELECT DESTINATION SHROOM";
    if (isSelectingSporeBombShroom) return "SELECT SHROOM TO DETONATE";
    if (isAwaitingWindScrollTarget) return "SELECT WIND PUSH TARGET";
    if (isAwaitingAnvilScrollTarget) return "SELECT ANVIL DROP TARGET";
    if (isAwaitingShieldScrollTarget) return "SELECT ALLY TO SHIELD";
    if (isAwaitingSwapScrollTarget) return "SELECT ALLY TO SWAP";
    if (isAwaitingDecreeTarget) return "SELECT PAWN TO PROMOTE";
    if (isAwaitingEarthquakeScrollTarget) return "SELECT EARTHQUAKE TARGET";
    return gameInfo.message;
  }, [
    isInventoryOpen, isAiThinking, isAwaitingPawnSacrifice, isPromotingPawn,
    isAwaitingCommanderPromotion, isAwaitingAnvilDrop, isAwaitingHolyShield,
    isAwaitingArcherSnipe, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow,
    isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom,
    isSelectingSporeBombShroom, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget,
    isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget,
    isAwaitingEarthquakeScrollTarget, gameInfo.message
  ]);

  const uniqueIdCounterRef = useRef(30000);
  const gameOverRef = useRef(false);
  const isInitialized = useRef(false);
  const aiInstance = useRef<VibeChessAI | null>(null);
  const clickGuard = useRef(false);

  const handlePieceHover = useCallback((p: Piece | null) => { setPieceForInfoDisplay(p); }, []);

  const attunementSlots = useMemo(() => {
    const elo = userData?.eloRating || 1200; if (elo <= 1200) return 2; return 2 + Math.floor((elo - 1200) / 400);
  }, [userData]);

  const addEffect = useCallback((type: Effect['type'], square: AlgebraicSquare, color?: PlayerColor, value?: number, itemType?: InventoryItemType) => {
    const id = `eff-${Date.now()}-${Math.random()}`; setEffects(prev => [...prev, { id, type, square, color, value, itemType }]);
    setTimeout(() => { setEffects(curr => curr.filter(e => e.id !== id)); }, 1500);
  }, []);

  const saveDungeonState = useCallback((currentLevel: number, currentBoard: BoardState, currentP: PlayerColor, ks: any, caps: any, shroomC: number, nextShroom: number, ep: AlgebraicSquare | null, nrc: number, currentInv: InventoryItem[]) => {
    if (!user || !firestore) return;
    const userDocRef = doc(firestore, 'users', user.uid); const equipment: Record<string, string> = {};
    currentBoard.flat().forEach(sq => { if (sq.piece?.heldItem) equipment[sq.piece.id] = sq.piece.heldItem; });
    updateDocumentNonBlocking(userDocRef, { inventory: currentInv, equipment, dungeonState: { level: currentLevel, board: currentBoard.flat(), currentPlayer: currentP, killStreaks: ks, capturedPieces: caps, shroomSpawnCounter: shroomC, nextShroomSpawnTurn: nextShroom, enPassantTargetSquare: ep, necroResurrectionCounter: nrc } });
  }, [user, firestore]);

  function findPieceCoords(b: BoardState, id: string): AlgebraicSquare | null {
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(b[r][c].piece?.id === id) return b[r][c].algebraic; return null;
  }

  const advanceLevel = useCallback((survivorsFromLastBoard: Piece[], currentGraveyard: { white: Piece[], black: Piece[] }) => {
    const nextLevelNum = level + 1;
    if (nextLevelNum > 50) { 
        const msg = "DUNGEON CONQUERED! You are the champion!"; setGameInfo(prev => ({ ...prev, message: "DUNGEON CONQUERED!", gameOver: true, winner: 'white' })); gameOverRef.current = true; audioManager.playVictory(); addLog(msg); return; 
    }
    setIsMoveProcessing(false); clickGuard.current = false; setLastMoveFrom(null); setLastMoveTo(null); setAnimatedSquareTo(null); setSelectedSquare(null); setPossibleMoves([]); setLevel(nextLevelNum); setAiStalemateStrikes(0); setHasMovedOnCurrentFloor(false); setColossusAwakened(false); setPlayerArmy(survivorsFromLastBoard);
    const newBoard = generateDungeonFloor(nextLevelNum, survivorsFromLastBoard); setBoard(newBoard);
    const updatedGraveyard = { white: currentGraveyard.white, black: [] }; setCapturedPieces(updatedGraveyard);
    const ks = { white: 0, black: 0 }; setKillStreaks(ks);
    const sC = 0; const nS = Math.floor(Math.random() * 6) + 5; setShroomSpawnCounter(sC); setNextShroomSpawnTurn(nS); setNecroResurrectionCounter(0); setEnPassantTargetSquare(null); setLastMovedPieceType(null); setLastMovedPieceLevel(null); setGameMoveCounter(0);
    const hasCommander = survivorsFromLastBoard.some(p => ['commander', 'hero'].includes(p.type)); setFirstBloodAchieved(hasCommander); setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setSpecialActionContext(null); setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingShieldScrollTarget(false); setIsAwaitingSwapScrollTarget(false); setIsAwaitingDecreeTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setIsPromotingPawn(false); setPromotionSquare(null); setIsSelectingMycoSpell(false); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(false); setIsSelectingSporeBombShroom(false); setIsAiThinking(false); setPromotionQueue([]); setDidCaptureLastTurn({ white: false, black: false });
    saveDungeonState(nextLevelNum, newBoard, 'white', ks, updatedGraveyard, sC, nS, null, 0, inventory);
    const isBoss = nextLevelNum % 10 === 0; 
    let welcomeMsg = isBoss ? `BOSS BATTLE` : `Wipe them out!`; 
    setGameInfo({ message: welcomeMsg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }); 
    gameOverRef.current = false; audioManager.playLevelUp(); addLog(`Descending to Floor ${nextLevelNum}...`);
  }, [level, addLog, saveDungeonState, inventory]);

  const processMoveEnd = useCallback((boardAfter: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, turnPlayer: PlayerColor, extra: boolean, nextEpSquare: AlgebraicSquare | null = null, wasCaptureThisTurn: boolean = false) => {
    let nextBoard = boardAfter; let nextGraveyard = { white: [...currentGraveyard.white], black: [...currentGraveyard.black] };
    const nextCounter = gameMoveCounter + 1; setGameMoveCounter(nextCounter);
    
    setDidCaptureLastTurn(prev => ({ ...prev, [turnPlayer]: wasCaptureThisTurn }));
    nextBoard = processOilSlickTimers(nextBoard, turnPlayer);

    if (!extra && turnPlayer === 'white' && isKingInCheck(nextBoard, 'white', nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel)) {
      const msg = "SPLIT SELF-CHECK! Auto-loss."; setGameInfo({ message: "SPLIT SELF-CHECK! AUTO-LOSS", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); gameOverRef.current = true; audioManager.playDefeat(); addLog(msg); return;
    }
    const nextP = extra ? turnPlayer : (turnPlayer === 'white' ? 'black' : 'white');
    const { newBoard: boardAfterPoison, poisonedCaptures } = processPoisonDamage(nextBoard, nextP);
    nextBoard = boardAfterPoison;
    if (poisonedCaptures.length > 0) {
        poisonedCaptures.forEach(p => { const victim = { ...p, id: p.id }; const targetPile = victim.color; nextGraveyard[targetPile].push(victim); addEffect('poof', findPieceCoords(nextBoard, p.id) || 'e1'); });
        setCapturedPieces(nextGraveyard); setKillStreaks({ ...currentKs }); audioManager.playCapture(); addLog(`${poisonedCaptures.length} unit(s) decayed from Poison!`);
    }
    let finalNRC = necroResurrectionCounter;
    if (turnPlayer === 'white' && !extra) {
        const necroSq = nextBoard.flat().find(sq => sq.piece?.id === 'boss-necro');
        if (necroSq) {
            finalNRC++;
            if (finalNRC >= 5) {
                const myPile = 'black'; 
                if (nextGraveyard[myPile].length > 0) {
                    const sorted = [...nextGraveyard[myPile]].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0));
                    const choice = sorted[0]; const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
                    if (choice && empty.length > 0) {
                        const sq = empty[Math.floor(Math.random() * empty.length)]; const {row, col} = algebraicToCoords(sq.algebraic);
                        const res = { ...choice, level: 1, id: choice.id, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
                        if (FRONTLINE_TYPES.includes(res.type) && row === 7) res.type = 'queen';
                        nextBoard[row][col].piece = res; nextGraveyard[myPile] = nextGraveyard[myPile].filter(p => p.id !== choice.id);
                        setCapturedPieces({ ...nextGraveyard }); addEffect('light-beam', sq.algebraic); audioManager.playResurrect(); addLog("Necromancy! A fallen soul has been brought back!"); finalNRC = 0;
                    }
                }
            }
            setNecroResurrectionCounter(finalNRC);
        }
    }
    setBoard(nextBoard); setEnPassantTargetSquare(nextEpSquare); setCapturedPieces(nextGraveyard); setKillStreaks(currentKs);
    const survivors = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
    const enemyCount = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black').length;
    
    const dungeonKing = findKing(nextBoard, 'black');
    let isDungeonCheckmated = dungeonKing && isCheckmate(nextBoard, 'black', nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    
    if (isDungeonCheckmated && dungeonKing && dungeonKing.piece.heldItem === 'kings_ransom') {
         const backRank = 0;
         const safeSquares: AlgebraicSquare[] = [];
         for (let c = 0; c < 8; c++) {
             const alg = coordsToAlgebraic(backRank, c);
             if (!nextBoard[backRank][c].piece && !nextBoard[backRank][c].item) {
                 if (!isSquareAttacked(nextBoard, alg, 'white', false, null, nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel)) {
                     safeSquares.push(alg);
                 }
             }
         }
         if (safeSquares.length > 0) {
             const dest = safeSquares[Math.floor(Math.random() * safeSquares.length)];
             const { row: dr, col: dc } = algebraicToCoords(dest);
             const { row: kr, col: kc } = algebraicToCoords(dungeonKing.algebraic);
             nextBoard[kr][kc].piece = null;
             nextBoard[dr][dc].piece = { ...dungeonKing.piece, heldItem: null, level: 1, hasMoved: true };
             addEffect('light-beam', dest);
             audioManager.playResurrect();
             addLog("The Dungeon used King's Ransom! EXILED to safety.");
             isDungeonCheckmated = isCheckmate(nextBoard, 'black', nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
         }
    }

    if (level === 30 && isDungeonCheckmated) {
        const currentDefeats = userData?.colossusDefeats || 0; const nextDefeats = currentDefeats + 1; const ref = doc(firestore, 'users', user!.uid); const currentUnlocked = userData?.unlockedPieces || []; let update: any = { colossusDefeats: nextDefeats };
        if (nextDefeats >= 5 && !currentUnlocked.includes('grappler')) { update.unlockedPieces = [...currentUnlocked, 'grappler']; addLog("PIECE UNLOCKED! You unlocked the Grappler!"); }
        updateDocumentNonBlocking(ref, update);
    }
    if (level === 30) {
        const minions = nextBoard.flat().filter(sq => sq.piece && sq.piece.color === 'black' && !sq.piece.id.startsWith('boss-colossus'));
        if (minions.length === 0 && !colossusAwakened) { setColossusAwakened(true); addLog("COLOSSUS AWAKENS! He can now be checkmated."); }
    }
    const inCheck = isKingInCheck(nextBoard, nextP, nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel);
    if (inCheck && extra) {
        if (turnPlayer === 'white') { addLog("Boss vanquished in extra turn!"); advanceLevel(survivors, nextGraveyard); } 
        else { const msg = "YOUR KING HAS FALLEN! Dungeon Victory."; setGameInfo({ message: "DUNGEON VICTORIOUS! YOUR KING HAS FALLEN", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); gameOverRef.current = true; audioManager.playDefeat(); addLog(msg); }
        return;
    }
    if (enemyCount === 0 || isDungeonCheckmated) {
      if (level === 50) {
          const ref = doc(firestore, 'users', user!.uid); const currentUnlocked = userData?.unlockedPieces || []; let nextUnlocked = [...currentUnlocked];
          if (!currentUnlocked.includes('dancer')) { nextUnlocked.push('dancer'); addLog("PIECE UNLOCKED! You unlocked the Dancer!"); } 
          else if (!currentUnlocked.includes('mimic')) { nextUnlocked.push('mimic'); addLog("PIECE UNLOCKED! You unlocked the Mimic!"); } 
          else if (!currentUnlocked.includes('myco_mage')) { nextUnlocked.push('myco_mage'); addLog("PIECE UNLOCKED! You unlocked the Myco Mage!"); }
          if (nextUnlocked.length > currentUnlocked.length) updateDocumentNonBlocking(ref, { unlockedPieces: nextUnlocked });
      }
      addLog(isDungeonCheckmated ? "CHECKMATE! Floor Vanquished." : "ALL ENEMIES OBLITERATED! Advancing..."); advanceLevel(survivors, nextGraveyard); return;
    }
    if (extra) { addLog(`${(userData?.username || 'Hero')} gains another move!`); audioManager.playLevelUp(); }
    let newShroomCounter = shroomSpawnCounter + 1; let finalNextShroom = nextShroomSpawnTurn;
    if (newShroomCounter >= nextShroomSpawnTurn) {
        const { newBoard: boardWithShroom, spawnedAt: spawnedAtAlg } = spawnShroom(nextBoard);
        if (spawnedAtAlg) { nextBoard = boardWithShroom; setBoard(nextBoard); newShroomCounter = 0; finalNextShroom = Math.floor(Math.random() * 6) + 5; addLog("A mystical Shroom 🍄 has appeared!"); audioManager.playShroom(); }
    }
    setShroomSpawnCounter(newShroomCounter); setNextShroomSpawnTurn(finalNextShroom);
    saveDungeonState(level, nextBoard, nextP, currentKs, nextGraveyard, newShroomCounter, finalNextShroom, nextEpSquare, finalNRC, inventory);
    const playerKing = findKing(nextBoard, 'white');
    if (!playerKing || isCheckmate(nextBoard, 'white', nextEpSquare, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel)) {
      const msg = "DEFEAT! Your King has fallen."; setGameInfo({ message: "YOUR KING HAS FALLEN", isCheck: true, playerWithKingInCheck: 'white', isCheckmate: true, isStalemate: false, gameOver: true, winner: 'black' }); gameOverRef.current = true; audioManager.playDefeat(); addLog(msg); return;
    }
    if (inCheck) { audioManager.playCheck(); addLog("Check!"); }
    const isBoss = level % 10 === 0; 
    let gameMsg = inCheck ? "Check!" : (isBoss ? `BOSS BATTLE` : `Wipe them out!`); 
    setGameInfo({ message: gameMsg, isCheck: inCheck, playerWithKingInCheck: inCheck ? nextP : null, isCheckmate: false, isStalemate: false, gameOver: false }); setCurrentPlayer(nextP);
  }, [advanceLevel, level, addLog, shroomSpawnCounter, nextShroomSpawnTurn, saveDungeonState, necroResurrectionCounter, addEffect, colossusAwakened, user, firestore, userData, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, gameMoveCounter, inventory]);

  const triggerSpecialsChain = useCallback((boardToChain: BoardState, currentGraveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, oldStreak: number, newStreak: number, isExtra: boolean, nextEp: AlgebraicSquare | null, actingPlayer: PlayerColor = 'white', completedMilestones: string[] = [], capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false) => {
    const isAI = actingPlayer === 'black'; let nextGraveyard = { ...currentGraveyard };
    if (newStreak >= 8 && !completedMilestones.includes('conquest')) {
        const actingKing = boardToChain.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer)?.piece;
        if (actingKing?.heldItem === 'kings_conquest') {
            const msg = `CONQUEST VICTORY! Dungeon reigns supreme!`; setGameInfo({ message: msg, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: actingPlayer }); addLog(msg); gameOverRef.current = true; audioManager.playDefeat(); return;
        }
    }
    if (newStreak >= 1 && oldStreak < 1 && !completedMilestones.includes('dance')) {
        const hasDancers = boardToChain.flat().some(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
        if (hasDancers) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const aiDancerSq = nextBoard.flat().find(sq => sq.piece?.type === 'dancer' && sq.piece.color === actingPlayer);
                if (aiDancerSq) {
                    const {rowIndex: r, colIndex: c} = aiDancerSq;
                    const dancerPiece = aiDancerSq.piece!;
                    const dancerDir = actingPlayer === 'white' ? -1 : 1;
                    const candidates: {r: number, c: number, priority: number}[] = [];
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                        if(dr===0 && dc===0) continue;
                        const nr = r+dr, nc = c+dc;
                        if (isValidSquare(nr, nc)) {
                            const targetSq = nextBoard[nr][nc];
                            if (!targetSq.piece && !targetSq.item) {
                                if (dr === dancerDir && dc === 0) candidates.push({r: nr, c: nc, priority: 1}); // Forward move
                            } else if (targetSq.piece) {
                                if (targetSq.piece.color !== actingPlayer && targetSq.piece.type !== 'king' && !targetSq.piece.isShielded) candidates.push({r: nr, c: nc, priority: 2}); // Enemy swap
                                else if (targetSq.piece.color === actingPlayer) candidates.push({r: nr, c: nc, priority: 0}); // Ally swap
                            } else if (targetSq.item?.type === 'anvil' && dancerPiece.heldItem === 'dancers_ribbon') {
                                candidates.push({r: nr, c: nc, priority: 3}); // Obstacle swap
                            }
                        }
                    }
                    candidates.sort((a,b) => b.priority - a.priority);
                    if (candidates.length > 0) {
                        const best = candidates[0];
                        const targetPiece = nextBoard[best.r][best.c].piece;
                        const targetItem = nextBoard[best.r][best.c].item;
                        nextBoard[best.r][best.c].piece = { ...dancerPiece, hasMoved: true };
                        nextBoard[best.r][best.c].item = null;
                        nextBoard[r][c].piece = targetPiece ? { ...targetPiece, hasMoved: true } : null;
                        nextBoard[r][c].item = targetItem;
                        addLog(`Dungeon Dancer performed a free ${targetPiece ? 'swap' : (targetItem ? 'anvil swap' : 'move')}!`);
                    }
                }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'dance'], capturingPieceId, wasCaptureThisTurn); return;
            } else { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'dance'], actingPlayer, currentGraveyard: nextGraveyard, currentKs, capturingPieceId }); setIsAwaitingDanceTarget(true); addLog("Dancer Skill: The Dance is ready!"); return; }
        }
    }
    if (!firstBloodAchieved && newStreak > 0 && !completedMilestones.includes('firstBlood')) {
        setFirstBloodAchieved(true); setPlayerWhoGotFirstBlood(actingPlayer);
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextBoard.flat().find(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'black' && sq.piece.level === 1);
            if (pawnSq) { const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); nextBoard[pr][pc].piece!.type = 'commander'; }
            addLog("First Blood! Dungeon has promoted a Commander."); triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'firstBlood'], capturingPieceId, wasCaptureThisTurn); return;
        } else {
            const hasL1Targets = boardToChain.flat().some(sq => sq.piece?.type === 'pawn' && sq.piece.color === 'white' && sq.piece.level === 1);
            if (hasL1Targets) { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'firstBlood'], actingPlayer, currentGraveyard: nextGraveyard, currentKs, capturingPieceId }); setIsAwaitingCommanderPromotion(true); addLog("First Blood! Choose a Pawn to promote."); return; }
        }
    }
    if (newStreak >= 2 && oldStreak < 2 && !completedMilestones.includes('shield')) {
        const hasArchbishop = boardToChain.flat().some(sq => sq.piece?.type === 'archbishop' && sq.piece.color === actingPlayer);
        if (hasArchbishop) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const targets = nextBoard.flat()
                    .filter(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId)
                    .sort((a, b) => (b.piece?.level || 0) - (a.piece?.level || 0));
                if (targets.length > 0) { targets[0].piece!.isShielded = true; addLog("Archbishop Skill: Dungeon shielded its highest level unit!"); }
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn); return;
            } else { 
                const hasEligibleTargets = boardToChain.flat().some(sq => sq.piece && sq.piece.color === actingPlayer && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.isShielded && sq.piece.id !== capturingPieceId);
                if (hasEligibleTargets) { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'shield'], actingPlayer, currentGraveyard: nextGraveyard, currentKs, capturingPieceId }); setIsAwaitingHolyShield(true); addLog("Holy Shield ready!"); return; } 
                else { triggerSpecialsChain(boardToChain, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'shield'], capturingPieceId, wasCaptureThisTurn); return; }
            }
        }
    }
    const pieces = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === actingPlayer).map(sq => sq.piece!);
    const snipers = pieces.filter(p => { if (p.type === 'archer') return true; const coords = boardToChain.flat().find(sq => sq.piece?.id === p.id); if (p.type === 'knight' && p.heldItem === 'shortbow' && coords && getEffectiveLevel(boardToChain, coords.rowIndex, coords.colIndex) >= 3) return true; return false; });
    const maxSniperLevel = snipers.length > 0 ? Math.max(...snipers.map(a => a.level || 1)) : 0;
    const hasCrossbow = pieces.some(p => p.type === 'archer' && p.color === actingPlayer && p.heldItem === 'crossbow');
    const isSnipeTime = (newStreak >= 5 && oldStreak < 5 && snipers.length > 0 && !completedMilestones.includes('snipe')) || (newStreak >= 3 && oldStreak < 3 && hasCrossbow && !completedMilestones.includes('snipe'));
    if (isSnipeTime) {
        const oppColor = actingPlayer === 'white' ? 'black' : 'white';
        const victims = boardToChain.flat().filter(sq => sq.piece && sq.piece.color === oppColor && sq.piece.level <= maxSniperLevel && sq.piece.type !== 'king' && sq.piece.type !== 'queen' && !sq.piece.id.startsWith('boss-colossus'));
        if (victims.length > 0) {
            if (isAI) {
                const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const victimsSorted = victims.sort((a,b) => (VAL_MAP[b.piece!.type]||0) - (VAL_MAP[a.piece!.type]||0));
                const v = victimsSorted[0]; const {rowIndex: row, colIndex: col} = v;
                const snipedPiece = { ...nextBoard[row][col].piece!, id: nextBoard[row][col].piece!.id };
                const responsibleAIArcher = snipers.find(a => a.level >= (v.piece?.level || 1));
                if (responsibleAIArcher) { 
                    const gain = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, myco_mage: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0; 
                    const arSq = nextBoard.flat().find(s => s.piece?.id === responsibleAIArcher.id);
                    if (arSq && arSq.piece) { arSq.piece.level += gain; addEffect('level-change', coordsToAlgebraic(arSq.rowIndex, arSq.colIndex), 'black', gain); }
                }
                const targetPile = snipedPiece.color; nextGraveyard[targetPile].push(snipedPiece); addEffect('poof', coordsToAlgebraic(row, col)); addLog(`Dungeon Sniper destroyed your Level ${snipedPiece.level} ${snipedPiece.type}!`);
                triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'snipe'], capturingPieceId, wasCaptureThisTurn); return;
            } else { setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'snipe'], actingPlayer, currentGraveyard: nextGraveyard, currentKs, capturingPieceId }); setIsAwaitingArcherSnipe(true); addLog("Sniper Skill: Select a target!"); return; }
        }
    }
    if (newStreak >= 3 && oldStreak < 3 && !completedMilestones.includes('anvil')) {
        if (isAI) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
            const myKingSq = nextBoard.flat().find(sq => sq.piece?.type === 'king' && sq.piece.color === actingPlayer);
            const kR = myKingSq ? myKingSq.rowIndex : 0;
            const kC = myKingSq ? myKingSq.colIndex : 4;
            const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (empty.length > 0) {
                empty.sort((a, b) => (Math.abs(a.rowIndex - kR) + Math.abs(a.colIndex - kC)) - (Math.abs(b.rowIndex - kR) + Math.abs(b.colIndex - kC)));
                empty[0].item = { type: 'anvil' };
                addLog("Dungeon dropped a defensive Anvil!");
            }
            triggerSpecialsChain(nextBoard, nextGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'anvil'], capturingPieceId, wasCaptureThisTurn); return;
        } else { 
            setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, completedMilestones: [...completedMilestones, 'anvil'], actingPlayer, currentGraveyard: nextGraveyard, currentKs, capturingPieceId }); 
            setPlayerToDropAnvil(actingPlayer);
            setIsAwaitingAnvilDrop(true); 
            addLog("Anvil Drop ready!"); 
            return; 
        }
    }
    if (newStreak >= 4 && oldStreak < 4 && !completedMilestones.includes('resurrection')) {
        const myPile = actingPlayer; 
        if (nextGraveyard[myPile].length > 0) {
            const nextBoard = boardToChain.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sorted = [...nextGraveyard[myPile]].sort((a,b) => (VAL_MAP[b.type]||0) - (VAL_MAP[a.type]||0));
            const choice = sorted[0]; const empty = nextBoard.flat().filter(sq => !sq.piece && !sq.item);
            if (choice && empty.length > 0) {
                const sq = empty[Math.floor(Math.random() * empty.length)]; const {row: rr, col: rc} = algebraicToCoords(sq.algebraic);
                const res = { ...choice, level: 1, id: choice.id, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 }; const oppBackRank = actingPlayer === 'white' ? 0 : 7;
                if (res.type === 'commander' && rr === oppBackRank) res.type = 'hero';
                nextBoard[rr][rc].piece = res; const updatedG = { ...nextGraveyard }; updatedG[myPile] = updatedG[myPile].filter(p => p.id !== choice.id);
                addEffect('light-beam', sq.algebraic); audioManager.playResurrect(); addLog(`Resurrection! ${choice.type} has returned.`);
                if (!isAI && FRONTLINE_TYPES.includes(res.type) && rr === oppBackRank) {
                    setPromotionTargetLevel(1); setPromotionSquare(sq.algebraic); setIsPromotingPawn(true); setSpecialActionContext({ extra: isExtra, nextEp, oldStreak: oldStreak, newStreak: newStreak, completedMilestones: [...completedMilestones, 'resurrection'], actingPlayer, currentGraveyard: updatedG, currentKs: currentKs, capturingPieceId: capturingPieceId }); return;
                }
                if (isAI && FRONTLINE_TYPES.includes(res.type) && rr === oppBackRank) nextBoard[rr][rc].piece!.type = 'queen';
                triggerSpecialsChain(nextBoard, updatedG, currentKs, oldStreak, newStreak, isExtra, nextEp, actingPlayer, [...completedMilestones, 'resurrection'], capturingPieceId, wasCaptureThisTurn); return;
            }
        }
    }
    processMoveEnd(boardToChain, nextGraveyard, currentKs, actingPlayer, isExtra, nextEp, wasCaptureThisTurn);
  }, [firstBloodAchieved, addEffect, processMoveEnd, addLog]);

  const processPawnSacrificeCheck = useCallback((boardAfter: BoardState, graveyard: { white: Piece[], black: Piece[] }, currentKs: { white: number, black: number }, player: PlayerColor, move: Move | null, oldL: number | undefined, oldT: PieceType | undefined, extra: boolean, ep: AlgebraicSquare | null, oldS: number, newS: number, capturingPieceId: string | null = null, wasCaptureThisTurn: boolean = false) => {
    if (!move) return false;
    const { row, col } = algebraicToCoords(move.to); const piece = boardAfter[row][col].piece;
    if (piece?.type === 'queen' && piece.level === 7 && oldT === 'queen' && (oldL || 0) < 7) {
      if (boardAfter.flat().some(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type))) {
        const isAI = player === 'black'; 
        if (isAI) {
            const nextB = boardAfter.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const pawnSq = nextB.flat().find(sq => sq.piece && sq.piece.color === player && FRONTLINE_TYPES.includes(sq.piece.type));
            if (pawnSq) {
                const {row: pr, col: pc} = algebraicToCoords(pawnSq.algebraic); const sacrificed = { ...nextB[pr][pc].piece!, id: nextB[pr][pc].piece!.id };
                nextB[pr][pc].piece = null; audioManager.playCapture(); addLog(`Dungeon sacrificed ${sacrificed.type} for the Queen!`); addEffect('poof', pawnSq.algebraic);
                const nextG = { ...graveyard }; const targetPile = sacrificed.color; nextG[targetPile].push(sacrificed);
                triggerSpecialsChain(nextB, nextG, currentKs, oldS, newS, extra, ep, player, [], capturingPieceId, wasCaptureThisTurn);
            }
            return true;
        }
        setIsAwaitingPawnSacrifice(true); setPlayerToSacrificePawn(player); setBoardForPostSacrifice(boardAfter); setPlayerWhoMadeQueenMove(player); setIsExtraTurnFromQueenMove(extra); setSpecialActionContext({ extra, nextEp: ep, oldStreak: oldS, newStreak: newS, completedMilestones: [], actingPlayer: player, currentGraveyard: graveyard, currentKs, capturingPieceId: capturingPieceId }); addLog("Royal Sacrifice required! Select a Pawn to give up."); return true;
      }
    }
    triggerSpecialsChain(boardAfter, graveyard, currentKs, oldS, newS, extra, ep, player, [], capturingPieceId, wasCaptureThisTurn); return false;
  }, [triggerSpecialsChain, addLog, addEffect]);

  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || gameOverRef.current || isMoveProcessing || isAiThinking || currentPlayer !== 'black' || isAnySpecialModeActive) return;
    setIsAiThinking(true);
    try {
      const oppCapLastTurn = didCaptureLastTurn.white;
      const gameStateForAi = adaptBoardForAI(board, 'black', killStreaks, capturedPieces, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, shroomSpawnCounter, nextShroomSpawnTurn, necroResurrectionCounter, lastMovedPieceLevel, oppCapLastTurn);
      const aiResult = aiInstance.current?.getBestMove(gameStateForAi, 'black'); 
      let aiMove = aiResult?.move;

      const freshlyCalculated = aiMove ? getPossibleMoves(board, coordsToAlgebraic(aiMove.from[0], aiMove.from[1]), enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel) : [];
      if (!aiMove || !freshlyCalculated.includes(coordsToAlgebraic(aiMove.to[0], aiMove.to[1]))) {
          const nextPanic = aiPanicCount + 1;
          setAiPanicCount(nextPanic);
          if (nextPanic >= 3) {
              const allMoves: Move[] = [];
              for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
                  const p = board[r][c].piece;
                  if (p && p.color === 'black') {
                      const moves = getPossibleMoves(board, board[r][c].algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
                      moves.forEach(m => allMoves.push({ from: board[r][c].algebraic, to: m, type: 'move' }));
                  }
              }
              if (allMoves.length > 0) {
                  const fallback = allMoves[Math.floor(Math.random() * allMoves.length)];
                  const fC = algebraicToCoords(fallback.from);
                  const tC = algebraicToCoords(fallback.to);
                  aiMove = { from: [fC.row, fC.col], to: [tC.row, tC.col], type: 'move' };
                  setAiPanicCount(0);
              }
          }
          if (!aiMove) { setIsAiThinking(false); return; }
      } else {
          setAiPanicCount(0);
      }

      setHasMovedOnCurrentFloor(true); setAiStalemateStrikes(0);
      const fromAlg = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]); const toAlg = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);
      const movingPiece = board[aiMove.from[0]][aiMove.from[1]].piece; if (!movingPiece) { setIsAiThinking(false); return; }
      const originalL = movingPiece.level || 1; const originalT = movingPiece.type;
      
      setIsMoveProcessing(true); setAnimatedSquareTo(toAlg); setLastMoveFrom(fromAlg); setLastMoveTo(toAlg); setLastMovedPieceType(originalT); setLastMovedPieceLevel(originalL);
      
      if (movingPiece.id.startsWith('boss-colossus')) {
          addEffect('tremble', toAlg);
      }

      const result = applyMove(board, { from: fromAlg, to: toAlg, type: aiMove.type as Move['type'], promoteTo: aiMove.promoteTo }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn);
      let { newBoard, capturedPiece, selfDestructCaptures, shroomConsumed, enPassantTargetSet: nextEp, reflectionOccurred } = result;
      const updatedCapturedPieces = { white: [...capturedPieces.white], black: [...capturedPieces.black] };
      
      if (result.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === result.itemReturned); if (existing) existing.count++; else next.push({ type: result.itemReturned!, count: 1 }); return next; }); addLog(`Dungeon Item Dropped: ${ITEM_METADATA[result.itemReturned].name}`); }
      if (reflectionOccurred) {
          const victim = { ...capturedPiece!, id: capturedPiece!.id }; const targetPile = victim.color; updatedCapturedPieces[targetPile].push(victim); setCapturedPieces(updatedCapturedPieces);
          audioManager.playCapture(); const newKs = { white: 0, black: 0 }; setKillStreaks(newKs); setBoard(newBoard); addLog("Dungeon reflected your attack!"); addEffect('poof', toAlg);
          setTimeout(() => { setIsAiThinking(false); setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(newBoard, updatedCapturedPieces, newKs, 'black', false, null, false); }, 800); return;
      }
      if (shroomConsumed) { audioManager.playShroom(); addLog("Dungeon piece consumed a Shroom!"); addEffect('level-change', toAlg, 'black', 1); }
      if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); addLog("Dungeon Rallying Cry!"); }
      if (result.ralliedSquares) { result.ralliedSquares.forEach(sq => { addEffect('level-change', sq, 'black', 1); }); }
      const isObliteration = result.promotedToInfiltrator || (movingPiece.type === 'infiltrator' && capturedPiece);
      if (isObliteration) { audioManager.playObliterate(); addLog("Dungeon Obliterated your piece!"); addEffect('poof', toAlg); }
      else if (capturedPiece || (selfDestructCaptures && selfDestructCaptures.length > 0)) { audioManager.playCapture(); addEffect('poof', toAlg); if (capturedPiece) addLog(`Dungeon captured your ${capturedPiece.type}!`); }
      else { audioManager.playMove(); addLog(`Dungeon ${movingPiece.type} to ${toAlg}`); }
      if (capturedPiece && !isObliteration) { const targetPile = capturedPiece.color; updatedCapturedPieces[targetPile].push({ ...capturedPiece!, id: capturedPiece!.id }); }
      if (selfDestructCaptures && selfDestructCaptures.length > 0) { selfDestructCaptures.forEach(p => { const targetPile = p.color; updatedCapturedPieces[targetPile].push({ ...p, id: p.id }); addEffect('poof', toAlg); }); if (selfDestructCaptures.length > 0) { addLog(`Dungeon collateral damage: ${selfDestructCaptures.length} unit(s) destroyed!`); } }
      setCapturedPieces(updatedCapturedPieces);
      if (result.infiltrationWin) { setBoard(newBoard); setGameInfo({ message: "INFILTRATION! DUNGEON OVERRUN", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, winner: 'black' }); gameOverRef.current = true; audioManager.playDefeat(); setIsAiThinking(false); setIsMoveProcessing(false); addLog("INFILTRATION! The dungeon has overrun your position."); return; }
      if (result.conversionEvents && result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => { addEffect('conversion', e.at, e.byPiece.color); audioManager.playConversion(); addLog(`Dungeon converted ${e.originalPiece.type} to its side!`); }); }
      
      const aiLandedPieceOnToSquare = newBoard[aiMove.to[0]][aiMove.to[1]].piece;
      const capturerId = aiLandedPieceOnToSquare?.id || null;
      
      if (aiLandedPieceOnToSquare && (['rook', 'palace'].includes(aiLandedPieceOnToSquare.type)) && (capturedPiece || result.pieceCapturedByAnvil)) {
          const resResult = processRookResurrectionCheck(newBoard, 'black', {from: fromAlg, to: toAlg, type: 'move'} as Move, toAlg, originalL, updatedCapturedPieces, uniqueIdCounterRef.current);
          if (resResult.resurrectionPerformed) { uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!; newBoard = resResult.boardWithResurrection; setCapturedPieces(resResult.capturedPiecesAfterResurrection); updatedCapturedPieces.white = resResult.capturedPiecesAfterResurrection.white; updatedCapturedPieces.black = resResult.capturedPiecesAfterResurrection.black; addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect(); addLog(`Dungeon resurrected a ${resResult.resurrectedPieceData?.type}!`); if (resResult.promotionRequiredForResurrectedPawn) { const {row: pr, col: pc} = algebraicToCoords(resResult.resurrectedSquareAlg!); newBoard[pr][pc].piece!.type = 'queen'; } }
      }
      const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (selfDestructCaptures ? selfDestructCaptures.length : 0);
      const oldStreakLocal = killStreaks['black'] || 0; const newStreakLocal = streakGain > 0 ? oldStreakLocal + streakGain : 0;
      const currentKs = { ...killStreaks, black: newStreakLocal }; setKillStreaks(currentKs);
      if (streakGain > 0) addEffect('level-change', toAlg, 'black', streakGain);
      setBoard(newBoard);
      const wasCap = streakGain > 0;
      setTimeout(() => {
          setIsAiThinking(false); setIsMoveProcessing(false); if (gameOverRef.current) return;
          let isExtra = result.extraTurn || (oldStreakLocal < 6 && newStreakLocal >= 6); const landedPiece = newBoard[aiMove.to[0]][aiMove.to[1]].piece;
          const oppBackRankIdx = 7;
          if (landedPiece && FRONTLINE_TYPES.includes(landedPiece.type) && (aiMove.to[0] === oppBackRankIdx)) { 
            const promoTo = aiMove.promoteTo || 'queen'; landedPiece!.type = promoTo; landedPiece!.level = getPromotionLevel(capturedPiece?.type || result.pieceCapturedByAnvil?.type || null); if (landedPiece!.type === 'queen') landedPiece!.level = Math.min(landedPiece!.level, 7); audioManager.playLevelUp(); addLog(`Dungeon promoted to ${promoTo}!`); if (landedPiece!.level >= 5) isExtra = true;
          }
          if (result.multiPromotions && result.multiPromotions.length > 0) { result.multiPromotions.forEach(promo => { const { row: pr, col: pc } = algebraicToCoords(promo.square); if (newBoard[pr][pc].piece) { newBoard[pr][pc].piece!.type = 'queen'; newBoard[pr][pc].piece!.level = promo.targetLevel; if (newBoard[pr][pc].piece!.level >= 5) isExtra = true; addLog("Dungeon multi-promotion!"); } }); }
          processPawnSacrificeCheck(newBoard, updatedCapturedPieces, currentKs, 'black', {from: fromAlg, to: toAlg, type: 'move'} as Move, originalL, originalT, isExtra, nextEp, oldStreakLocal, newStreakLocal, capturerId, wasCap);
      }, 800);
    } catch (e) { console.error("AI Error:", e); setIsAiThinking(false); }
  }, [board, killStreaks, capturedPieces, enPassantTargetSquare, gameInfo.gameOver, isMoveProcessing, isAiThinking, currentPlayer, shroomSpawnCounter, nextShroomSpawnTurn, firstBloodAchieved, playerWhoGotFirstBlood, processMoveEnd, addEffect, addLog, necroResurrectionCounter, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, processPawnSacrificeCheck, userData, gameMoveCounter, level, isAnySpecialModeActive, aiPanicCount, didCaptureLastTurn]);

  const startRun = useCallback((reset: boolean = false) => {
    if (isUserLoading || !userData || !user) return;
    setIsMoveProcessing(false); clickGuard.current = false; setHasMovedOnCurrentFloor(false); setColossusAwakened(false); setLastMoveFrom(null); setLastMoveTo(null); setAnimatedSquareTo(null); setSelectedSquare(null); setPossibleMoves([]); setLastMovedPieceType(null); setLastMovedPieceLevel(null); setGameMoveCounter(0); gameOverRef.current = false;
    setIsAwaitingDanceTarget(false); setDancerToDance(null); setIsAwaitingCommanderPromotion(false); setIsAwaitingAnvilDrop(false); setPlayerToDropAnvil(null); setIsAwaitingHolyShield(false); setIsAwaitingArcherSnipe(false); setIsAwaitingPawnSacrifice(false); setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null); setIsInventoryOpen(false); setSpecialActionContext(null); setIsAwaitingWindScrollTarget(false); setIsAwaitingAnvilScrollTarget(false); setIsAwaitingShieldScrollTarget(false); setIsAwaitingSwapScrollTarget(false); setIsAwaitingDecreeTarget(false); setIsAwaitingEarthquakeScrollTarget(false); setIsPromotingPawn(false); setPromotionSquare(null); setIsSelectingMycoSpell(false); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(false); setIsSelectingSporeBombShroom(false); setIsAiThinking(false); setPromotionQueue([]); setDidCaptureLastTurn({ white: false, black: false });
    const saved = userData.dungeonState;
    if (!reset && saved && saved.board && saved.board.length > 0) {
      setLevel(saved.level); const loadedBoard: BoardState = []; const savedBoard1D = saved.board as SquareState[];
      if (savedBoard1D.length === 64) { for (let i = 0; i < 8; i++) { loadedBoard.push(savedBoard1D.slice(i * 8, i * 8 + 8)); } setBoard(loadedBoard); }
      else { const army: Piece[] = []; const elo = userData.eloRating || 1200; let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []); initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); }); setBoard(generateDungeonFloor(1, army)); setLevel(1); }
      setCurrentPlayer(saved.currentPlayer); setKillStreaks(saved.killStreaks); setCapturedPieces(saved.capturedPieces); setShroomSpawnCounter(saved.shroomSpawnCounter); setNextShroomSpawnTurn(saved.nextShroomSpawnTurn); setNecroResurrectionCounter(saved.necroResurrectionCounter || 0); setEnPassantTargetSquare(saved.enPassantTargetSquare);
      const currentBoard = loadedBoard.length === 8 ? loadedBoard : board; const survivors = currentBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!);
      setPlayerArmy(survivors); setFirstBloodAchieved(survivors.some(p => ['commander', 'hero'].includes(p.type)));
      setGameInfo({ message: `RESUME BATTLE`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
      addLog(`Resuming Floor ${saved.level}.`);
    } else {
      let army: Piece[] = []; const elo = userData.eloRating || 1200; let initial = initializeBoard(elo, 1200, userData.unlockedPieces || []);
      if (userData.equipment) { initial = initial.map(row => row.map(sq => { if (sq.piece && userData.equipment![sq.piece.id]) return { ...sq, piece: { ...sq.piece, heldItem: userData.equipment![sq.piece.id] as InventoryItemType } }; return sq; })); }
      initial.flat().forEach(sq => { if (sq.piece && sq.piece.color === 'white') army.push(sq.piece); });
      setPlayerArmy(army); setLevel(1); const newBoard = generateDungeonFloor(1, army); setBoard(newBoard);
      setGameInfo({ message: " ", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
      setCapturedPieces({ white: [], black: [] }); setCurrentPlayer('white'); setKillStreaks({ white: 0, black: 0 }); setShroomSpawnCounter(0); setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5); setNecroResurrectionCounter(0); setEnPassantTargetSquare(null);
      const hasCommander = army.some(p => ['commander', 'hero'].includes(p.type)); setFirstBloodAchieved(hasCommander); setPlayerWhoGotFirstBlood(hasCommander ? 'white' : null);
      saveDungeonState(1, newBoard, 'white', { white: 0, black: 0 }, { white: [], black: [] }, 0, 5, null, 0, userData.inventory || []);
      addLog("New Dungeon Run Started!");
    }
    if (userData.inventory) setInventory(userData.inventory); aiInstance.current = new VibeChessAI(4); audioManager.playStart();
  }, [userData, isUserLoading, user, saveDungeonState, board, addLog]);

  useEffect(() => { if (!isInitialized.current && !isUserLoading && userData && user) { isInitialized.current = true; startRun(); } }, [startRun, isUserLoading, userData, user]);

  useEffect(() => {
    if (currentPlayer === 'black' && !gameInfo.gameOver && !gameOverRef.current && !isMoveProcessing && !isAnySpecialModeActive && !isAiThinking) {
      const timer = setTimeout(performAiMove, 1000); return () => clearTimeout(timer);
    }
  }, [currentPlayer, gameInfo.gameOver, isMoveProcessing, performAiMove, isAiThinking, gameMoveCounter, isAnySpecialModeActive]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    const targetSquare = promotionSquare; const currentTargetLevel = promotionTargetLevel; const currentContext = specialActionContext; const currentQueue = [...promotionQueue];
    setIsPromotingPawn(false); setPromotionSquare(null); setSpecialActionContext(null);
    if (!targetSquare) return;
    let nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(targetSquare); const pieceBeingPromoted = nextBoard[row][col].piece;
    if (!pieceBeingPromoted) return;
    if (pieceBeingPromoted.heldItem && !isItemValidForPiece(pieceBeingPromoted.heldItem, pieceType)) {
      const item = pieceBeingPromoted.heldItem; setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === item); if (existing) existing.count++; else next.push({ type: item, count: 1 }); return next; });
      pieceBeingPromoted.heldItem = null; addLog(`Equipment Returned: ${ITEM_METADATA[item].name}`);
    }
    nextBoard[row][col].piece = { ...pieceBeingPromoted, type: pieceType, id: pieceBeingPromoted.id, level: currentTargetLevel, hasMoved: true, isShielded: false, isPoisoned: false, cooldownTurnsRemaining: 0, frozenTurnsRemaining: 0 };
    if (pieceType === 'queen') nextBoard[row][col].piece!.level = Math.min(currentTargetLevel, 7);
    audioManager.playLevelUp(); setBoard(nextBoard); addLog(`Pawn Promoted to ${pieceType}!`);
    let isExtra = (nextBoard[row][col].piece?.level >= 5) || currentContext?.extra;
    const remainingQueue = currentQueue.filter(p => p.square !== targetSquare);
    if (remainingQueue.length > 0) { setPromotionQueue(remainingQueue); setPromotionTargetLevel(remainingQueue[0].targetLevel); setIsPromotingPawn(true); setPromotionSquare(remainingQueue[0].square); setSpecialActionContext({ ...currentContext, extra: isExtra } as any); } 
    else { setPromotionQueue([]); triggerSpecialsChain(nextBoard, currentContext?.currentGraveyard || capturedPieces, currentContext?.currentKs || killStreaks, currentContext?.oldStreak || 0, currentContext?.newStreak || 0, isExtra || false, currentContext?.nextEp || enPassantTargetSquare, currentContext?.actingPlayer || 'white', currentContext?.completedMilestones || [], currentContext?.capturingPieceId || null, false); }
  }, [board, promotionSquare, promotionTargetLevel, specialActionContext, enPassantTargetSquare, triggerSpecialsChain, capturedPieces, killStreaks, addLog, promotionQueue, inventory]);

  const handleMycoSpellSelect = useCallback((spell: MycoSpell) => {
      setIsSelectingMycoSpell(false); if (!spell) { setSelectedSquare(null); return; }
      if (spell === 'propagate') {
        const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'myco-propagate' };
        clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
        setSelectedSquare(null); setPossibleMoves([]);
        const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
        setBoard(applyResult.newBoard); audioManager.playLevelUp(); addLog("Mushroomancy: Propagate!");
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false); }, 800);
      } else if (spell === 'teleport') { setIsSelectingTeleportAlly(true); addLog("Mushroomancy: Teleport! Select an allied piece.");
      } else if (spell === 'spore-bomb') { setIsSelectingSporeBombShroom(true); addLog("Mushroomancy: Spore Bomb! Select a shroom to detonate.");
      } else if (spell === 'raise-mycelimen') {
          const move: Move = { from: selectedSquare!, to: selectedSquare!, type: 'raise-mycelimen' };
          clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(selectedSquare);
          setSelectedSquare(null); setPossibleMoves([]);
          const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
          const nextB = applyResult.newBoard; const updatedG = { ...capturedPieces }; setBoard(nextB); audioManager.playLevelUp(); addLog("Mushroomancy: Raise Myceli-Men!");
          setTimeout(() => { 
            setIsMoveProcessing(false); clickGuard.current = false; const queue: {square: AlgebraicSquare, targetLevel: number}[] = applyResult.multiPromotions || [];
            if (queue.length > 0) { setPromotionQueue(queue); setPromotionTargetLevel(queue[0].targetLevel); setIsPromotingPawn(true); setPromotionSquare(queue[0].square); setSpecialActionContext({ extra: false, nextEp: null, oldStreak: killStreaks.white, newStreak: killStreaks.white, completedMilestones: [], actingPlayer: 'white', currentGraveyard: updatedG, currentKs: killStreaks, capturingPieceId: null }); } 
            else { processMoveEnd(nextB, updatedG, killStreaks, currentPlayer, false, null, false); }
          }, 800);
      }
  }, [selectedSquare, board, enPassantTargetSquare, capturedPieces, killStreaks, currentPlayer, processMoveEnd, addLog, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (clickGuard.current) return;
    const { row, col } = algebraicToCoords(algebraic); const sq = board[row][col]; let piece = sq.piece;
    if (piece?.id.startsWith('boss-colossus-')) { const tl = board.flat().find(s => s.piece?.id === 'boss-colossus-tl'); if (tl && tl.algebraic) { piece = tl.piece; algebraic = tl.algebraic; } }
    handlePieceHover(piece || null);
    if (isInventoryOpen) {
      if (selectedInventoryItemType) {
        if (selectedInventoryItemType.startsWith('portal_scroll_')) return;
        const itemMeta = ITEM_METADATA[selectedInventoryItemType];
        if (itemMeta.rarity === 'rare') {
            const alreadyEquipped = board.flat().some(sq => sq.piece?.heldItem === selectedInventoryItemType);
            if (alreadyEquipped) {
                addLog(`LIMIT REACHED: You can only have one ${itemMeta.name} active!`);
                return;
            }
        }
        if (piece && !piece.heldItem && piece.color === 'white') {
          if (usedSlots >= attunementSlots) { addLog("Attunement Limit Reached!"); return; }
          if (selectedInventoryItemType === 'soul_harvest' && (piece.type === 'king' || piece.type === 'queen')) { addLog("Kings/Queens cannot harvest souls."); return; }
          if (!isItemValidForPiece(selectedInventoryItemType, piece.type)) return;
          const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          let newInv = [...inventory]; const item = newInv.find(i => i.type === selectedInventoryItemType);
          if (item) { item.count--; if (item.count <= 0) newInv = newInv.filter(i => i.type !== selectedInventoryItemType); }
          setInventory(newInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter, newInv); 
          setSelectedInventoryItemType(null); audioManager.playLevelUp(); addLog(`Equipped ${ITEM_METADATA[selectedInventoryItemType].name}`);
        } else if (piece && piece.heldItem && piece.color === 'white') {
          const oldItem = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = selectedInventoryItemType; setBoard(nextBoard);
          const nextInv = [...inventory]; const itemIn = nextInv.find(i => i.type === selectedInventoryItemType);
          if (itemIn) { itemIn.count--; if (itemIn.count <= 0) nextInv.splice(nextInv.indexOf(itemIn), 1); }
          const itemOut = nextInv.find(i => i.type === oldItem); if (itemOut) itemOut.count++; else nextInv.push({ type: oldItem, count: 1 });
          setInventory(nextInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter, nextInv); 
          setSelectedInventoryItemType(null); audioManager.playLevelUp(); addLog(`Swapped equipment to ${ITEM_METADATA[selectedInventoryItemType].name}`);
        }
      } else if (piece && piece.heldItem && piece.color === 'white') {
          const removedItem = piece.heldItem; const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          nextBoard[row][col].piece!.heldItem = null; setBoard(nextBoard);
          const nextInv = [...inventory]; const item = nextInv.find(i => i.type === removedItem); if (item) item.count++; else nextInv.push({ type: removedItem, count: 1 });
          setInventory(nextInv); saveDungeonState(level, nextBoard, currentPlayer, killStreaks, capturedPieces, shroomSpawnCounter, nextShroomSpawnTurn, enPassantTargetSquare, necroResurrectionCounter, nextInv); 
          audioManager.playMove(); addLog(`Unequipped ${ITEM_METADATA[removedItem].name}`);
      }
      return;
    }
    if (isSelectingTeleportAlly) {
        if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && piece.id !== (selectedSquare ? board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.id : null)) {
            setTeleportAllyPieceId(piece.id); setIsSelectingTeleportAlly(false); setIsSelectingTeleportShroom(true); addLog(`Teleporting ${piece.type}! Select a destination shroom.`);
        }
        return;
    }
    if (isSelectingTeleportShroom) {
        if (sq?.item?.type === 'shroom') {
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'tele-portobello', teleportPieceId: teleportAllyPieceId! };
            clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setHasMovedOnCurrentFloor(true);
            setSelectedSquare(null); setPossibleMoves([]);
            const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(applyResult.newBoard); audioManager.playMove(); addLog("Teleportation complete!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsSelectingTeleportShroom(false); setTeleportAllyPieceId(null); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false); }, 800);
        }
        return;
    }
    if (isSelectingSporeBombShroom) {
        if (sq?.item?.type === 'shroom') {
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'spore-bomb' };
            clickGuard.current = true; setIsMoveProcessing(true); setAnimatedSquareTo(algebraic); setHasMovedOnCurrentFloor(true);
            setSelectedSquare(null); setPossibleMoves([]);
            const applyResult = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
            setBoard(applyResult.newBoard); audioManager.playExplosion();
            const { row: sR, col: sC } = algebraicToCoords(algebraic);
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { 
                if (isValidSquare(sR + dr, sC + dc)) addEffect('explosion', coordsToAlgebraic(sR + dr, sC + dc)); 
            }
            addLog("Mushroomancy: Spore Bomb detontated!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsSelectingSporeBombShroom(false); processMoveEnd(applyResult.newBoard, capturedPieces, killStreaks, currentPlayer, false, null, false); }, 800);
        }
        return;
    }
    if (isAwaitingGrappleThrow) {
        const canLand = (!sq?.piece && !sq?.item) || (grappledItemSubject?.type === 'anvil' && sq?.piece);
        if (canLand) {
            const {row: fr, col: fc} = algebraicToCoords(selectedSquare!); const range = getEffectiveLevel(board, fr, fc);
            const isCardinal = fr === row || fc === col; const isDiagonal = Math.abs(fr - row) === Math.abs(fc - col); const dist = Math.max(Math.abs(fr-row), Math.abs(fc-col));
            if ((isCardinal || isDiagonal) && dist <= range && dist > 0) {
                setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
                setSelectedSquare(null); setPossibleMoves([]);
                const move: Move = { from: selectedSquare!, to: algebraic, type: 'grapple-throw' };
                if (grappledItemSubject) move.thrownItem = grappledItemSubject.type;
                else move.thrownPiece = grappledPieceSubject!.piece;

                const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false);
                setBoard(result.newBoard); 
                if (grappledItemSubject) audioManager.playAnvil(); else audioManager.playMove();
                addLog(`Threw ${grappledItemSubject ? 'anvil' : 'unit'} to ${algebraic}!`);
                setIsAwaitingGrappleThrow(false); setGrappledPieceSubject(null); setGrappledItemSubject(null);
                setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
            }
        }
        return;
    }
    if (isAwaitingDanceTarget) {
        const activeDancer = dancerToDance ? board[algebraicToCoords(dancerToDance).row][algebraicToCoords(dancerToDance).col].piece : null;
        if (!dancerToDance) { if (piece && piece.color === currentPlayer && piece.type === 'dancer') { setDancerToDance(algebraic); } return; }
        if (algebraic === dancerToDance) { setIsAwaitingDanceTarget(false); setDancerToDance(null); setSelectedSquare(null); setPossibleMoves([]); if (specialActionContext) triggerSpecialsChain(board, specialActionContext.currentGraveyard, specialActionContext.currentKs, specialActionContext.oldStreak, specialActionContext.newStreak, specialActionContext.extra, enPassantTargetSquare, currentPlayer, specialActionContext.completedMilestones, specialActionContext.capturingPieceId, false); return; }
        const {row: fr, col: fc} = algebraicToCoords(dancerToDance); 
        const isAdjacent = Math.abs(row - fr) <= 1 && Math.abs(col - fc) <= 1;
        const dir = currentPlayer === 'white' ? -1 : 1;
        const isForward = (row === fr + dir) && (col === fc);
        
        if (isAdjacent) {
            let moveValid = false;
            if (piece) moveValid = true; // Swap with any adjacent piece (8-way)
            else if (sq?.item?.type === 'anvil' && activeDancer?.heldItem === 'dancers_ribbon') moveValid = true; // Ribbon bonus
            else if (!sq.item && isForward) moveValid = true; // Move forward if empty
            
            if (moveValid) {
                let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                const dancerP = nextBoard[fr][fc].piece!; const nextG = { ...specialActionContext!.currentGraveyard };
                const targetP = nextBoard[row][col].piece;
                const targetI = nextBoard[row][col].item;
                
                // EXECUTE SWAP
                nextBoard[row][col].piece = { ...dancerP, hasMoved: true };
                nextBoard[row][col].item = null;
                nextBoard[fr][fc].piece = targetP ? { ...targetP, hasMoved: true } : null;
                nextBoard[fr][fc].item = targetI;
                
                addLog(`Dancer ${targetP ? 'Swapped' : (targetI ? 'Anvil Swapped' : 'Moved')}!`);
                setBoard(nextBoard); setCapturedPieces(nextG); setIsAwaitingDanceTarget(false); setDancerToDance(null); audioManager.playMove(); 
                triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false);
            }
        }
        return;
    }
    if (isAwaitingDecreeTarget) {
        if (piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
            setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
            setSelectedSquare(null); setPossibleMoves([]);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'kings-decree' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); audioManager.playLevelUp();
            setIsAwaitingDecreeTarget(false); addLog("King's Decree: Pawn promoted!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
        }
        return;
    }
    if (isAwaitingWindScrollTarget) {
      if (!sq.piece && !sq.item) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        setSelectedSquare(null); setPossibleMoves([]);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'wind-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); const finalizedGraveyard = { ...capturedPieces }; setBoard(result.newBoard); audioManager.playAnvil();
        setIsAwaitingWindScrollTarget(false); addLog("Wind Scroll triggered!");
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, finalizedGraveyard, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
      }
      return;
    }
    if (isAwaitingEarthquakeScrollTarget) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        setSelectedSquare(null); setPossibleMoves([]);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'earthquake-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); const finalizedGraveyard = { ...capturedPieces }; setBoard(result.newBoard); audioManager.playExplosion();
        setIsAwaitingEarthquakeScrollTarget(false); addLog("Earthquake Scroll triggered!");
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, finalizedGraveyard, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
        return;
    }
    if (isAwaitingAnvilScrollTarget) {
      if (!sq.piece && !sq.item) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        setSelectedSquare(null); setPossibleMoves([]);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'summon-anvil' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); audioManager.playAnvil();
        setIsAwaitingAnvilScrollTarget(false); addLog("Anvil Scroll triggered!");
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
      }
      return;
    }
    if (isAwaitingShieldScrollTarget) {
      if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded) {
        setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
        setSelectedSquare(null); setPossibleMoves([]);
        const move: Move = { from: selectedSquare!, to: algebraic, type: 'shield-scroll' };
        const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); audioManager.playShield();
        setIsAwaitingShieldScrollTarget(false); addLog(`Shielded ${piece.type}!`);
        setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
      }
      return;
    }
    if (isAwaitingSwapScrollTarget) {
        if (piece && piece.color === currentPlayer && algebraic !== selectedSquare) {
            setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic);
            setSelectedSquare(null); setPossibleMoves([]);
            const move: Move = { from: selectedSquare!, to: algebraic, type: 'swap-scroll' };
            const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, false); setBoard(result.newBoard); audioManager.playMove();
            setIsAwaitingSwapScrollTarget(false); addLog("Swap Scroll triggered!");
            setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; setIsAwaitingSwapScrollTarget(false); processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800);
        }
        return;
    }
    if (isAwaitingPawnSacrifice) {
        if (piece && piece.color === playerToSacrificePawn && FRONTLINE_TYPES.includes(piece.type)) {
            const nextBoard = (boardForPostSacrifice || board).map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
            const sacrificedPiece = nextBoard[row][col].piece; if (!sacrificedPiece) return;
            const sacrificed = { ...sacrificedPiece, id: sacrificedPiece.id }; nextBoard[row][col].piece = null; const nextG = { ...specialActionContext!.currentGraveyard }; const targetPile = sacrificed.color; nextG[targetPile].push(sacrificed);
            addEffect('poof', algebraic); setCapturedPieces(nextG); setBoard(nextBoard); setIsAwaitingPawnSacrifice(false); setBoardForPostSacrifice(null); audioManager.playCapture(); addLog(`Sacrificed ${sacrificed.type} for the Queen.`);
            triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, specialActionContext!.completedMilestones, specialActionContext!.capturingPieceId, false);
        }
        return;
    }
    if (isAwaitingArcherSnipe) {
        const snipers = board.flat().filter(sq => { const p = sq.piece; if (!p || p.color !== currentPlayer) return false; if (p.type === 'archer') return true; if (p.type === 'knight' && p.heldItem === 'shortbow' && getEffectiveLevel(board, sq.rowIndex, sq.colIndex) >= 3) return true; return false; }).map(sq => sq.piece!);
        if (piece && piece.color === 'black' && piece.type !== 'king' && piece.type !== 'queen' && !piece.id.startsWith('boss-colossus')) {
            const responsibleArcher = snipers.find(a => a.level >= piece.level);
            if (responsibleArcher) {
                const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                const {row: tr, col: tc} = algebraicToCoords(algebraic); const snipedPieceData = nextBoard[row][col].piece; if (!snipedPieceData) return;
                const snipedPiece = { ...snipedPieceData, id: snipedPieceData.id }; nextBoard[tr][tc].piece = null;
                const arRow = nextBoard.findIndex(r => r.some(s => s.piece?.id === responsibleArcher.id)); const arCol = nextBoard[arRow].findIndex(s => s.piece?.id === responsibleArcher.id);
                const gain = {pawn: 1, dancer: 1, mimic: 1, grappler: 1, myco_mage: 1, commander: 1, infiltrator: 1, knight: 2, bishop: 2, rook: 2, palace: 2, queen: 3, king: 1, hero: 2, archer: 2, archbishop: 2}[snipedPiece.type] || 0; nextBoard[arRow][arCol].piece!.level += gain;
                const nextG = { ...specialActionContext!.currentGraveyard }; const targetPile = snipedPiece.color; nextG[targetPile].push(snipedPiece);
                addEffect('poof', algebraic); addEffect('level-change', coordsToAlgebraic(arRow, arCol), currentPlayer, gain); setBoard(nextBoard); setCapturedPieces(nextG); setIsAwaitingArcherSnipe(false); audioManager.playSnipe(); addLog(`Archer Snipe: Destroyed ${snipedPiece.type}!`);
                triggerSpecialsChain(nextBoard, nextG, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, [...(specialActionContext!.completedMilestones || []), 'snipe'], specialActionContext!.capturingPieceId, false); 
            }
        }
        return;
    }
    if (isAwaitingHolyShield) {
        if (piece && piece.color === currentPlayer && piece.type !== 'king' && piece.type !== 'queen' && !piece.isShielded && piece.id !== specialActionContext?.capturingPieceId) {
            const nextBoard = board.map(rowArr => rowArr.map(sq => ({...sq, piece: sq.piece ? {...sq.piece} : null}))); nextBoard[row][col].piece!.isShielded = true;
            setBoard(nextBoard); setIsAwaitingHolyShield(false); audioManager.playShield(); addLog("Kill Streak reward: Holy Shield applied!");
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, [...(specialActionContext!.completedMilestones || []), 'shield'], specialActionContext!.capturingPieceId, false);
        }
        return;
    }
    if (isAwaitingAnvilDrop) {
        if (!sq.piece && !sq.item) {
            const nextBoard = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); nextBoard[row][col].item = { type: 'anvil' };
            setBoard(nextBoard); 
            setIsAwaitingAnvilDrop(false); 
            setPlayerToDropAnvil(null);
            audioManager.playAnvil(); 
            addLog("Kill Streak reward: Anvil Drop!");
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, specialActionContext!.completedMilestones || [], specialActionContext!.capturingPieceId, false);
        }
        return;
    }
    if (isAwaitingCommanderPromotion) {
        if (piece && piece.color === currentPlayer && piece.type === 'pawn' && piece.level === 1) {
            const nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
            nextBoard[row][col].piece!.type = 'commander'; nextBoard[row][col].piece!.id = nextBoard[row][col].piece!.id;
            nextBoard[row][col].piece!.isPoisoned = false; nextBoard[row][col].piece!.cooldownTurnsRemaining = 0; nextBoard[row][col].piece!.frozenTurnsRemaining = 0;
            setBoard(nextBoard); setIsAwaitingCommanderPromotion(false); audioManager.playLevelUp(); addLog("First Blood: Commander Ascended!");
            triggerSpecialsChain(nextBoard, specialActionContext!.currentGraveyard, specialActionContext!.currentKs, specialActionContext!.oldStreak, specialActionContext!.newStreak, specialActionContext!.extra, enPassantTargetSquare, currentPlayer, specialActionContext!.completedMilestones || [], specialActionContext!.capturingPieceId, false);
        }
        return;
    }
    if (selectedSquare) {
      const { row: fromR, col: fromC } = algebraicToCoords(selectedSquare); const movingPiece = board[fromR][fromC].piece;
      const oppCapLastTurn = didCaptureLastTurn.black;
      const isExecutionAllowed = !isMoveProcessing && !gameInfo.gameOver && !gameOverRef.current && !isAiThinking && currentPlayer === 'white' && !isAnySpecialModeActive;
      if (isExecutionAllowed && movingPiece && movingPiece.color === currentPlayer) {
        const effectiveLevel = getEffectiveLevel(board, fromR, fromC); const silenced = isSilenced(board, fromR, fromC, currentPlayer);
        if (!silenced && movingPiece.type === 'myco_mage' && selectedSquare === algebraic) { setIsSelectingMycoSpell(true); addLog("Mushroomancy active! Choose a spell."); return; }
        if (!silenced && movingPiece.type === 'grappler') {
            if (piece && algebraic !== selectedSquare) {
                const {row: pr, col: pc} = algebraicToCoords(algebraic); const isAdj = Math.abs(fromR-pr) <=1 && Math.abs(fromC-pc) <= 1;
                if (isAdj) {
                  const dir = movingPiece.color === 'white' ? -1 : 1; const isDiagForward = (pr === fromR + dir) && Math.abs(pc - fromC) === 1; const isEnemy = piece.color !== movingPiece.color;
                  if (isEnemy && isDiagForward) { } else { if (piece.type === 'king') { addLog("Too Heavy! Cannot grapple Kings."); } else { setGrappledPieceSubject({ piece: { ...piece }, from: algebraic }); let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); nextBoard[pr][pc].piece = null; setBoard(nextBoard); setIsAwaitingGrappleThrow(true); addLog(`Grappler picked up ${piece.type}!`); } return; }
                }
            } else if (sq?.item?.type === 'anvil' && movingPiece.heldItem === 'power_glove' && algebraic !== selectedSquare) {
                const isAdj = Math.abs(fromR - row) <= 1 && Math.abs(fromC - col) <= 1;
                if (isAdj) {
                    setGrappledItemSubject({ type: 'anvil', from: algebraic });
                    let nextBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null})));
                    nextBoard[row][col].item = null; setBoard(nextBoard); setIsAwaitingGrappleThrow(true); addLog("Grappler picked up an Anvil!"); return;
                }
            }
        }
        const hasMagicScroll = movingPiece.heldItem && ['wind_scroll', 'life_leach', 'summon_anvil', 'shield_scroll', 'rally_scroll', 'antidote', 'detonation_scroll', 'swap_scroll', 'ice_scroll', 'resurrection_scroll', 'faith_scroll', 'kings_decree', 'ice_blast', 'soul_harvest', 'earthquake_scroll', 'demonic_possession', 'heavy_rain', 'trap_net', 'oil_slick'].includes(movingPiece.heldItem);
        if (selectedSquare === algebraic && (effectiveLevel >= 5 || hasMagicScroll)) {
          if ((movingPiece.cooldownTurnsRemaining && movingPiece.cooldownTurnsRemaining > 0) || (movingPiece.frozenTurnsRemaining && movingPiece.frozenTurnsRemaining > 0)) { addLog("Piece is too exhausted to use skills."); return; }
          
          const executeOilSlick = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'oil_slick'); setIsAwaitingOilSlickTarget(true); setPossibleMoves([]); addLog("Select 3x3 area for Oil Slick!"); };
          const executeTrapNet = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'trap_net'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'trap-net' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playMove(); addLog("Trap Net deployed!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeLifeLeach = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'life_leach'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'life-leach' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playLevelUp(); addLog("Life Leach triggered!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeWindScrollMode = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'wind_scroll'); setIsAwaitingWindScrollTarget(true); setPossibleMoves([]); addLog("Select a square for Wind push!"); };
          const executeEarthquakeScrollMode = () => { if(effectiveLevel < 3) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'earthquake_scroll'); setIsAwaitingEarthquakeScrollTarget(true); setPossibleMoves([]); addLog("Select a square for Earthquake!"); };
          const executeSummonAnvilMode = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'summon_anvil'); setIsAwaitingAnvilScrollTarget(true); setPossibleMoves([]); addLog("Select a square for Anvil Drop!"); };
          const executeShieldScrollMode = () => { if(effectiveLevel < 2) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'shield_scroll'); setIsAwaitingHolyShield(true); setPossibleMoves([]); addLog("Select an ally for Holy Shield!"); };
          const executeRallyScroll = () => { if(effectiveLevel < 3) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'rally_scroll'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'rally-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playRally(); if (result.ralliedSquares) { result.ralliedSquares.forEach(sq => addEffect('level-change', sq, currentPlayer, 1)); } addLog("Global Rally triggered!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeAntidote = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'antidote'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'antidote' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playShield(); addLog("Antidote used: All allies cured of Poison."); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeSwapScrollMode = () => { if(effectiveLevel < 3) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'swap_scroll'); setIsAwaitingSwapScrollTarget(true); setPossibleMoves([]); addLog("Select an ally for Swap Scroll!"); };
          const executeIceScroll = () => { if (effectiveLevel < 2) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'ice_scroll'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'ice-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playShield(); addLog("Ice Scroll triggered!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeIceBlast = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'ice_blast'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'ice-blast' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playLevelUp(); addLog("Ice Blast: Adjacent enemies frozen!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeSoulHarvest = () => { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'soul_harvest'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'soul-harvest' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); audioManager.playLevelUp(); addLog("Soul Harvest: Absorbed adjacent power!"); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeResurrectionScroll = () => { if (effectiveLevel < 4) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'resurrection_scroll'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'resurrection-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); const updatedGraveyard = { ...capturedPieces }; if (result.resurrectionScrollEvent) { const p = result.resurrectionScrollEvent.piece; const targetPile = p.color; updatedGraveyard[targetPile] = updatedGraveyard[targetPile].filter(pi => pi.id !== p.id); setCapturedPieces(updatedGraveyard); addEffect('light-beam', result.resurrectionScrollEvent.square); audioManager.playResurrect(); addLog(`Resurrected ${p.type}!`); } setBoard(result.newBoard); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, updatedGraveyard, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeFaithScroll = () => { if (effectiveLevel < 5) return; addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'faith_scroll'); setHasMovedOnCurrentFloor(true); setIsMoveProcessing(true); clickGuard.current = true; setSelectedSquare(null); setPossibleMoves([]); const move: Move = { from: selectedSquare, to: selectedSquare, type: 'faith-scroll' }; const result = applyMove(board, move, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); setBoard(result.newBoard); if (result.conversionEvents.length > 0) { audioManager.playConversion(); result.conversionEvents.forEach(e => { addEffect('conversion', e.at, e.byPiece.color); addLog(`${e.originalPiece.type} converted to your side!`); }); } setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; processMoveEnd(result.newBoard, capturedPieces, killStreaks, currentPlayer, false, enPassantTargetSquare, false); }, 800); };
          const executeSelfDestruct = () => { setHasMovedOnCurrentFloor(true); setSelectedSquare(null); setPossibleMoves([]); const result = applyMove(board, { from: selectedSquare, to: algebraic, type: 'self-destruct' }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn); audioManager.playExplosion(); addLog("BOOM! Self-destruct triggered."); const { row: cR, col: cC } = algebraicToCoords(selectedSquare); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isValidSquare(cR + dr, cC + dc)) addEffect('explosion', coordsToAlgebraic(cR + dr, cC + dc)); let nextBoard = result.newBoard; const oldStreak = killStreaks.white; let capturesThisTurn = result.selfDestructCaptures ? result.selfDestructCaptures.length : 0; const newStreak = (capturesThisTurn > 0 ? oldStreak + capturesThisTurn : 0); const currentKs = { ...killStreaks, white: newStreak }; setKillStreaks(currentKs); const updatedGraveyard = { ...capturedPieces }; if (result.selfDestructCaptures && result.selfDestructCaptures.length > 0) { result.selfDestructCaptures.forEach(p => { const targetPile = p.color; updatedGraveyard[targetPile].push({ ...p, id: p.id }); addEffect('poof', algebraic); }); setCapturedPieces(updatedGraveyard); addLog(`Explosion destroyed ${result.selfDestructCaptures.length} unit(s)!`); } const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6); setBoard(nextBoard); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return; triggerSpecialsChain(nextBoard, updatedGraveyard, currentKs, oldStreak, newStreak, isExtra, enPassantTargetSquare, currentPlayer, [], null, capturesThisTurn > 0); }, 800); };
          
          if (movingPiece.heldItem === 'oil_slick') executeOilSlick();
          else if (movingPiece.heldItem === 'trap_net') executeTrapNet();
          else if (effectiveLevel >= 5) {
             const choice = window.confirm("Use piece ability (OK) or magic scroll (Cancel)?"); 
             if (choice) executeSelfDestruct();
             else { if (movingPiece.heldItem === 'life_leach') executeLifeLeach(); else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode(); else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode(); else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll(); else if (movingPiece.heldItem === 'antidote') executeAntidote(); else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode(); else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll(); else if (movingPiece.heldItem === 'ice_blast') executeIceBlast(); else if (movingPiece.heldItem === 'soul_harvest') executeSoulHarvest(); else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll(); else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll(); else if (movingPiece.heldItem === 'earthquake_scroll') executeEarthquakeScrollMode(); else if (movingPiece.heldItem === 'detonation_scroll') { if (effectiveLevel >= 5) executeSelfDestruct(); else addLog("Level Too Low!"); } else if (movingPiece.heldItem === 'kings_decree') { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'kings_decree'); setIsAwaitingDecreeTarget(true); setPossibleMoves([]); } else executeWindScrollMode(); }
          } else {
             if (movingPiece.heldItem === 'life_leach') executeLifeLeach(); else if (movingPiece.heldItem === 'summon_anvil') executeSummonAnvilMode(); else if (movingPiece.heldItem === 'shield_scroll') executeShieldScrollMode(); else if (movingPiece.heldItem === 'rally_scroll') executeRallyScroll(); else if (movingPiece.heldItem === 'antidote') executeAntidote(); else if (movingPiece.heldItem === 'swap_scroll') executeSwapScrollMode(); else if (movingPiece.heldItem === 'ice_scroll') executeIceScroll(); else if (movingPiece.heldItem === 'ice_blast') executeIceBlast(); else if (movingPiece.heldItem === 'soul_harvest') executeSoulHarvest(); else if (movingPiece.heldItem === 'resurrection_scroll') executeResurrectionScroll(); else if (movingPiece.heldItem === 'faith_scroll') executeFaithScroll(); else if (movingPiece.heldItem === 'earthquake_scroll') executeEarthquakeScrollMode(); else if (movingPiece.heldItem === 'detonation_scroll') { if (effectiveLevel >= 5) executeSelfDestruct(); else addLog("Level Too Low!"); } else if (movingPiece.heldItem === 'kings_decree') { addEffect('magic-burst', selectedSquare, currentPlayer, 0, 'kings_decree'); setIsAwaitingDecreeTarget(true); setPossibleMoves([]); } else executeWindScrollMode();
          }
          return;
        }
        const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel);
        const isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);
        if (isMoveInFreshList) {
          setHasMovedOnCurrentFloor(true); setSelectedSquare(null); setPossibleMoves([]); setIsMoveProcessing(true); clickGuard.current = true; setAnimatedSquareTo(algebraic); setLastMoveFrom(selectedSquare); setLastMoveTo(algebraic); 
          const originalL = movingPiece.level || 1; const originalT = movingPiece.type; setLastMovedPieceType(originalT); setLastMovedPieceHeldItem(movingPiece.heldItem || null); setLastMovedPieceLevel(originalL);
          let moveType: Move['type'] = 'move';
          if (movingPiece?.type === 'king' && !movingPiece.hasMoved && ((movingPiece.color === 'white' && selectedSquare === 'e1' && (algebraic === 'c1' || algebraic === 'g1')) || (movingPiece.color === 'black' && selectedSquare === 'e8' && (algebraic === 'c8' || algebraic === 'g8'))) && fromR === row && !sq.piece) { moveType = 'castle'; }
          else if (FRONTLINE_TYPES.includes(movingPiece?.type) && algebraic === enPassantTargetSquare) { moveType = 'enpassant'; }
          else if (sq.piece) { if (sq.piece.color !== movingPiece?.color) moveType = 'swap'; else moveType = 'capture'; }
          const result = applyMove(board, { from: selectedSquare, to: algebraic, type: moveType }, enPassantTargetSquare, capturedPieces, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, oppCapLastTurn);
          let { newBoard, capturedPiece, shroomConsumed, enPassantTargetSet: nextEp, phoenixResurrection, reflectionOccurred, promotedToHero } = result;
          const updatedGraveyard = { ...capturedPieces };
          if (result.itemReturned) { setInventory(prev => { const next = [...prev]; const existing = next.find(i => i.type === result.itemReturned); if (existing) existing.count++; else next.push({ type: result.itemReturned!, count: 1 }); return next; }); addLog(`Dungeon Item Dropped: ${ITEM_METADATA[result.itemReturned].name}`); }
          if (reflectionOccurred) { const victim = { ...capturedPiece!, id: capturedPiece!.id }; const targetPile = victim.color; updatedGraveyard[targetPile].push(victim); updatedGraveyard.black = updatedGraveyard.black.filter(p => p.id !== victim.id); setCapturedPieces(updatedGraveyard); audioManager.playCapture(); addLog("REFLECTED! Dungeon target used Mirror Shield."); addEffect('poof', algebraic); const newKs = { white: 0, black: 0 }; setBoard(newBoard); setTimeout(() => { setIsMoveProcessing(false); clickGuard.current = false; processMoveEnd(newBoard, updatedGraveyard, newKs, currentPlayer, false, null, false, false); }, 800); return; }
          if (phoenixResurrection) { addEffect('light-beam', phoenixResurrection.square); audioManager.playResurrect(); addLog("Rebirth! Phoenix Down triggered."); }
          if (result.infiltrationWin) { setBoard(newBoard); addLog("INFILTRATION WIN! Floor Vanquished."); advanceLevel(newBoard.flat().filter(sq => sq.piece && sq.piece.color === 'white').map(sq => sq.piece!), capturedPieces); return; }
          if (shroomConsumed) { audioManager.playShroom(); audioManager.playLevelUp(); addLog(`${newBoard[row][col].piece?.type} consumed a Shroom 🍄!`); addEffect('level-change', algebraic, currentPlayer, 1); }
          if (result.rallyCryTriggered) { addEffect('shockwave', result.rallyCryTriggered.square, result.rallyCryTriggered.color); audioManager.playRally(); addLog("Rallying Cry!"); }
          if (result.ralliedSquares) { result.ralliedSquares.forEach(sq => addEffect('level-change', sq, currentPlayer, 1)); }
          if (result.conversionEvents && result.conversionEvents.length > 0) { result.conversionEvents.forEach(e => { addEffect('conversion', e.at, e.byPiece.color); addLog(`${e.originalPiece.type} converted to your side!`); }); audioManager.playConversion(); }
          if (promotedToHero) { audioManager.playLevelUp(); addEffect('light-beam', algebraic); addLog("HERO ASCENDED! Your Commander has reached the back rank."); }
          let resPromoRequired = false; let resResult_promo_level = 1; let resResult_promo_square = null; 
          
          const landedPieceAtTo = newBoard[row][col].piece; 
          const oppBackRankIdx = movingPiece.color === 'white' ? 0 : 7;
          
          if (landedPieceAtTo && (landedPieceAtTo.type === 'rook' || landedPieceAtTo.type === 'palace') && capturedPiece) {
              const resResult = processRookResurrectionCheck(newBoard, currentPlayer, {from: selectedSquare, to: algebraic, type: 'move'} as Move, algebraic, originalL, updatedGraveyard, uniqueIdCounterRef.current);
              if (resResult.resurrectionPerformed) { uniqueIdCounterRef.current = resResult.newResurrectionIdCounter!; newBoard = resResult.boardWithResurrection; updatedGraveyard.white = resResult.capturedPiecesAfterResurrection.white; updatedGraveyard.black = resResult.capturedPiecesAfterResurrection.black; setCapturedPieces({ ...updatedGraveyard }); addEffect('light-beam', resResult.resurrectedSquareAlg!); audioManager.playResurrect(); addLog(`Resurrected a ${resResult.resurrectedPieceData?.type}!`); if (resResult.promotionRequiredForResurrectedPawn) { resPromoRequired = true; resResult_promo_level = resResult.resurrectedPieceData?.level || 1; resResult_promo_square = resResult.resurrectedSquareAlg!; } }
          }
          const streakGain = (capturedPiece ? 1 : 0) + (result.pieceCapturedByAnvil ? 1 : 0) + (result.selfDestructCaptures?.length || 0);
          const oldStreak = killStreaks[currentPlayer] || 0; const newStreak = streakGain > 0 ? oldStreak + streakGain : 0; const currentKs = { ...killStreaks, [currentPlayer]: newStreak }; setKillStreaks(currentKs);
          const isObliteration = result.promotedToInfiltrator || (movingPiece?.type === 'infiltrator' && capturedPiece);
          if (isObliteration) { audioManager.playObliterate(); addLog("OBLITERATED! Dungeon target removed from the game."); addEffect('poof', algebraic); }
          else if (streakGain > 0) { audioManager.playCapture(); addEffect('poof', algebraic); addEffect('level-change', algebraic, currentPlayer, streakGain); if (capturedPiece) addLog(`Captured ${capturedPiece.type} at ${algebraic}!`); }
          else { audioManager.playMove(); addLog(`${movingPiece.type} to ${algebraic}`); }
          if (streakGain > 0) { 
              if (capturedPiece && !isObliteration) { const targetPile = capturedPiece.color; updatedGraveyard[targetPile].push({ ...capturedPiece!, id: capturedPiece!.id }); }
              if (result.selfDestructCaptures && result.selfDestructCaptures.length > 0) { result.selfDestructCaptures.forEach(p => { const targetPile = p.color; updatedGraveyard[targetPile].push({ ...p, id: p.id }); addEffect('poof', algebraic); }); if (result.selfDestructCaptures.length > 0) addLog(`Collateral damage: ${result.selfDestructCaptures.length} unit(s) destroyed!`); }
              setCapturedPieces({ ...updatedGraveyard }); 
          }
          setBoard(newBoard);
          const wasCap = streakGain > 0;
          const capturerId = (streakGain > 0) ? landedPieceAtTo?.id || null : null;
          setTimeout(() => {
            setIsMoveProcessing(false); clickGuard.current = false; if (gameOverRef.current) return;
            const isExtra = result.extraTurn || (oldStreak < 6 && newStreak >= 6); const queue: {square: AlgebraicSquare, targetLevel: number}[] = result.multiPromotions || [];
            if (resPromoRequired) queue.push({ square: resResult_promo_square!, targetLevel: resResult_promo_level });
            if (FRONTLINE_TYPES.includes(newBoard[row][col].piece?.type || '') && row === oppBackRankIdx) { queue.push({ square: algebraic, targetLevel: getPromotionLevel(capturedPiece?.type || result.pieceCapturedByAnvil?.type || null) }); }
            if (queue.length > 0) { setPromotionQueue(queue); setPromotionTargetLevel(queue[0].targetLevel); setIsPromotingPawn(true); setPromotionSquare(queue[0].square); setSpecialActionContext({ extra: isExtra, nextEp, oldStreak, newStreak, actingPlayer: currentPlayer, completedMilestones: [], currentGraveyard: updatedGraveyard, currentKs, capturingPieceId, wasCaptureThisTurn: wasCap } as any); addLog("Pawn Promotion ready!"); } 
            else {
                let sacrificeNeeded = false;
                if (landedPieceAtTo?.type === 'queen') sacrificeNeeded = processPawnSacrificeCheck(newBoard, updatedGraveyard, currentKs, currentPlayer, { from: selectedSquare, to: algebraic, type: moveType }, originalL, originalT, isExtra, nextEp, oldStreak, newStreak, capturerId, wasCap);
                if (sacrificeNeeded) return;
                triggerSpecialsChain(newBoard, updatedGraveyard, currentKs, oldStreak, newStreak, isExtra, nextEp, currentPlayer, [], capturerId, wasCap);
            }
          }, 800); return;
        }
      }
    }
    if (sq.piece) { setSelectedSquare(algebraic); setPossibleMoves(getPossibleMoves(board, algebraic, enPassantTargetSquare, lastMovedPieceType, lastMovedPieceHeldItem, null, lastMovedPieceLevel)); } 
    else { setSelectedSquare(null); setPossibleMoves([]); }
  }, [board, currentPlayer, selectedSquare, enPassantTargetSquare, killStreaks, capturedPieces, specialActionContext, isExtraTurnFromQueenMove, isInventoryOpen, selectedInventoryItemType, usedSlots, attunementSlots, inventory, addLog, handlePieceHover, processPawnSacrificeCheck, triggerSpecialsChain, processMoveEnd, lastMovedPieceType, lastMovedPieceHeldItem, lastMovedPieceLevel, addEffect, isAwaitingDanceTarget, dancerToDance, isAwaitingGrappleThrow, grappledPieceSubject, grappledItemSubject, isAwaitingPawnSacrifice, playerToSacrificePawn, isAwaitingHolyShield, isAwaitingArcherSnipe, isAwaitingAnvilDrop, playerToDropAnvil, isAnySpecialModeActive, isMoveProcessing, gameInfo.gameOver, isAiThinking, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, isAwaitingWindScrollTarget, isAwaitingAnvilScrollTarget, isAwaitingShieldScrollTarget, isAwaitingSwapScrollTarget, isAwaitingDecreeTarget, isAwaitingEarthquakeScrollTarget, isSelectingMycoSpell, isSelectingTeleportAlly, isSelectingTeleportShroom, isSelectingSporeBombShroom, teleportAllyPieceId, level, didCaptureLastTurn]);

  const mobileLayout = (
    <div className="relative z-20 flex flex-col flex-grow w-full max-h-screen p-0.5 overflow-hidden font-pixel">
      <Card className="w-full bg-background border-none rounded-none shrink-0">
        <CardContent className="p-1 flex items-center justify-between">
          <div className="flex-1 flex justify-start">
             {level % 10 === 0 ? <Skull className="h-4 w-4 text-destructive animate-pulse" /> : <Swords className="h-4 w-4 text-primary" />}
          </div>
          <h1 className="text-[0.65rem] font-bold text-primary uppercase tracking-tighter">DUNGEON Floor {level}</h1>
          <div className="flex-1 flex justify-end">
            <AuthWidget />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center justify-start gap-1 p-1 flex-grow overflow-hidden">
        <div className="w-full max-w-[100vw] aspect-square max-h-[55vh] flex-shrink-0">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor={'white'} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={'flipping'} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} grappledItemSubject={grappledItemSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} />
        </div>

        <div className="w-full flex-grow overflow-hidden flex flex-col min-h-0">
          <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={'white'} getPlayerDisplayName={(p) => p === 'white' ? (userData?.username || 'Hero') : 'Dungeon'} onlineStatus={'disconnected'} turnTimer={null} activeTimerPlayer={null} />
        </div>

        <div className="w-full flex justify-center items-center gap-1 py-1 shrink-0">
           <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
           <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="h-8 px-2 text-[0.6rem] uppercase"><BookOpen className="mr-1 h-3 w-3" /> Rules</Button>
           <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} disabled={isMoveProcessing || gameInfo.gameOver} className="h-8 px-2 text-[0.6rem] uppercase"><Package className="mr-1 h-3 w-3" /> Loot</Button>
           <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} className="h-8 px-2 text-[0.6rem] uppercase border-destructive/50 text-destructive hover:bg-destructive/10"><RotateCcw className="mr-1 h-3 w-3" /> Abandon</Button>
        </div>
      </div>
    </div>
  );

  const desktopLayout = (
    <div className="relative z-20 hidden lg:flex flex-row items-start justify-center gap-4 w-full h-full p-4 font-pixel">
      <div className="w-1/4 h-full">
         <GameControls currentPlayer={currentPlayer} capturedPieces={capturedPieces} isGameOver={gameInfo.gameOver} killStreaks={killStreaks} pieceForInfoDisplay={pieceForInfoDisplay} localPlayerColor={'white'} getPlayerDisplayName={(p) => p === 'white' ? (userData?.username || 'Hero') : 'Dungeon'} onlineStatus={'disconnected'} turnTimer={null} activeTimerPlayer={null} />
      </div>
      <div className="w-1/2 flex flex-col items-center gap-4">
        <div className="w-full flex items-center justify-between px-4">
           <Link href="/"><Button variant="ghost" size="sm" className="h-8 text-[0.6rem] uppercase"><ArrowLeft className="mr-1 h-4 w-4" /> Lobby</Button></Link>
           <div className="flex items-center gap-3">
              {level % 10 === 0 ? <Skull className="h-6 w-6 text-destructive animate-pulse" /> : <Swords className="h-6 w-6 text-primary" />}
              <h1 className="text-xl font-bold text-primary uppercase tracking-tighter">DUNGEON Floor {level}</h1>
              {level % 10 === 0 ? <Skull className="h-6 w-6 text-destructive animate-pulse" /> : <Swords className="h-6 w-6 text-primary" />}
           </div>
           <div className="w-20"></div>
        </div>
        <div className={cn("text-center text-[0.8rem] font-bold min-h-[1.5em] uppercase", gameInfo.isCheck && !gameInfo.gameOver && "text-destructive animate-pulse")}> {statusMessage} </div>
        <div className="w-full max-w-2xl aspect-square shadow-2xl">
          <ChessBoard boardState={board} selectedSquare={isAnySpecialModeActive ? (isAwaitingDanceTarget ? dancerToDance : (isAwaitingGrappleThrow ? selectedSquare : null)) : selectedSquare} possibleMoves={isAnySpecialModeActive ? [] : possibleMoves} enemySelectedSquare={null} enemyPossibleMoves={[]} onSquareClick={handleSquareClick} playerColor={'white'} currentPlayerColor={currentPlayer} isInteractionDisabled={isMoveProcessing || gameInfo.gameOver || isAiThinking} playerInCheck={gameInfo.playerWithKingInCheck} viewMode={'flipping'} animatedSquareTo={animatedSquareTo} lastMoveFrom={lastMoveFrom} lastMoveTo={lastMoveTo} isAwaitingPawnSacrifice={isAwaitingPawnSacrifice} playerToSacrificePawn={playerToSacrificePawn} isEnPassantTarget={enPassantTargetSquare} onPieceHover={handlePieceHover} effects={effects} promotingSquare={promotionSquare} isAwaitingAnvilDrop={isAwaitingAnvilDrop} playerToDropAnvil={playerToDropAnvil || null} isInventoryOpen={isInventoryOpen} selectedInventoryItemType={selectedInventoryItemType} isAwaitingHolyShield={isAwaitingHolyShield} isAwaitingArcherSnipe={isAwaitingArcherSnipe} isAwaitingGrappleThrow={isAwaitingGrappleThrow} isAwaitingDanceTarget={isAwaitingDanceTarget} dancerToDance={dancerToDance} grappledPieceSubject={grappledPieceSubject} grappledItemSubject={grappledItemSubject} isAwaitingEarthquakeScrollTarget={isAwaitingEarthquakeScrollTarget} isSelectingMycoSpell={isSelectingMycoSpell} isSelectingTeleportAlly={isSelectingTeleportAlly} isSelectingTeleportShroom={isSelectingTeleportShroom} isSelectingSporeBombShroom={isSelectingSporeBombShroom} isAwaitingCommanderPromotion={isAwaitingCommanderPromotion} playerToPromoteCommander={playerWhoGotFirstBlood} isAwaitingWindScrollTarget={isAwaitingWindScrollTarget} isAwaitingAnvilScrollTarget={isAwaitingAnvilScrollTarget} isAwaitingShieldScrollTarget={isAwaitingShieldScrollTarget} isAwaitingSwapScrollTarget={isAwaitingSwapScrollTarget} isAwaitingDecreeTarget={isAwaitingDecreeTarget} />
        </div>
      </div>
      <div className="w-1/4 flex flex-col gap-4">
        <AuthWidget />
        <Card className="bg-card/50 border-border">
          <CardContent className="p-4 flex flex-col gap-3">
            <h2 className="text-[0.7rem] text-primary uppercase border-b border-primary/20 pb-1 mb-1">Dungeon Actions</h2>
            <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
            <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} className="w-full text-[0.65rem] uppercase justify-start h-10"><BookOpen className="mr-2 h-4 w-4" /> Rules & Abilities</Button>
            <Button variant={isInventoryOpen ? "default" : "outline"} size="sm" onClick={() => setIsInventoryOpen(!isInventoryOpen)} className="w-full text-[0.65rem] uppercase justify-start h-10"><Package className="mr-2 h-4 w-4" /> Loot Bag</Button>
            <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} className="w-full text-[0.65rem] uppercase justify-start h-10 border-destructive/30 text-destructive hover:bg-destructive/10"><RotateCcw className="mr-2 h-4 w-4" /> Abandon Run</Button>
            <div className="mt-2 p-2 bg-black/40 rounded-sm border border-primary/10">
               <p className="text-[0.55rem] text-muted-foreground uppercase leading-relaxed">Persistent Run: Your pieces and items are saved between sessions.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-full h-full w-full bg-background flex flex-col relative overflow-hidden">
      <div className="lg:hidden h-full flex flex-col">{mobileLayout}</div>
      <div className="hidden lg:block h-full">{desktopLayout}</div>
      <InventoryWindow isOpen={isInventoryOpen} onClose={() => setIsInventoryOpen(false)} inventory={inventory} selectedItemType={selectedInventoryItemType} onSelectItem={setSelectedInventoryItemType} onUseItem={(type) => { if (type.startsWith('portal_scroll_')) { addLog("Portal Logic: skip floors in Dungeon Mode!"); } }} usedSlots={usedSlots} attunementSlots={attunementSlots} />
      <PromotionDialog isOpen={isPromotingPawn} onSelectPiece={handlePromotionSelect} pawnColor={'white'} />
      <MycoSpellMenu isOpen={isSelectingMycoSpell} mana={selectedSquare ? (board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece?.shroomMana || 0) : 0} onSelectSpell={handleMycoSpellSelect} onOpenChange={setIsSelectingMycoSpell} />
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}> 
        <AlertDialogContent className="font-pixel bg-black border-2 border-destructive"> 
          <AlertDialogHeader> 
            <AlertDialogTitle className="text-destructive uppercase text-sm">Abandon Dungeon Run?</AlertDialogTitle>
            <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed"> 
              Your current progress and equipment will be lost. You will start over from Floor 1.
            </AlertDialogDescription>
          </AlertDialogHeader> 
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel> 
            <AlertDialogAction className="bg-destructive text-white h-9 text-[0.6rem] uppercase" onClick={() => { setIsResetConfirmOpen(false); startRun(true); }}>Abandon Run</AlertDialogAction> 
          </AlertDialogFooter> 
        </AlertDialogContent> 
      </AlertDialog>
    </div>
  );
}
