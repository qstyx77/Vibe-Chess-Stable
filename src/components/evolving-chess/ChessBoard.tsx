'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode, Piece, Effect, InventoryItemType } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';
import { algebraicToCoords, getEffectiveLevel, isItemValidForPiece } from '@/lib/chess-utils';
import { ExplosionIcon, PixelColossus } from './IconLibrary';

interface ChessBoardProps {
  boardState: BoardState;
  selectedSquare: AlgebraicSquare | null;
  possibleMoves?: AlgebraicSquare[];
  enemySelectedSquare: AlgebraicSquare | null;
  enemyPossibleMoves?: AlgebraicSquare[];
  onSquareClick: (algebraic: AlgebraicSquare) => void;
  playerColor: PlayerColor;
  currentPlayerColor: PlayerColor;
  isInteractionDisabled: boolean;
  playerInCheck: PlayerColor | null;
  viewMode: ViewMode;
  animatedSquareTo: AlgebraicSquare | null;
  applyBoardOpacityEffect?: boolean;
  lastMoveFrom: AlgebraicSquare | null;
  lastMoveTo: AlgebraicSquare | null;
  isAwaitingPawnSacrifice: boolean;
  playerToSacrificePawn: PlayerColor | null;
  isAwaitingCommanderPromotion?: boolean;
  playerToPromoteCommander?: PlayerColor | null;
  isEnPassantTarget: AlgebraicSquare | null;
  onPieceHover: (piece: Piece | null) => void;
  effects?: Effect[];
  promotingSquare: AlgebraicSquare | null;
  isAwaitingAnvilDrop: boolean;
  playerToDropAnvil: PlayerColor | null;
  isAwaitingHolyShield?: boolean;
  isAwaitingArcherSnipe?: boolean;
  isAwaitingShieldScrollTarget?: boolean;
  isAwaitingSwapScrollTarget?: boolean;
  isAwaitingDecreeTarget?: boolean;
  isAwaitingWindScrollTarget?: boolean;
  isAwaitingAnvilScrollTarget?: boolean;
  isInventoryOpen?: boolean;
  selectedInventoryItemType?: InventoryItemType | null;
  localPlayerColor?: PlayerColor | null;
  isAwaitingDanceTarget?: boolean;
  dancerToDance?: AlgebraicSquare | null;
  isAwaitingGrappleThrow?: boolean;
  grappledPieceSubject?: { piece: Piece, from: AlgebraicSquare } | null;
}

const LargeEntityOverlay = ({ boardState, visuallyFlipBoardForLogic }: { boardState: BoardState, visuallyFlipBoardForLogic: boolean }) => {
  const colossusAnchor = boardState.flat().find(sq => sq.piece?.id === 'boss-colossus-tl');
  if (!colossusAnchor || !colossusAnchor.piece) return null;
  const { row, col } = algebraicToCoords(colossusAnchor.algebraic);
  const visualRow = visuallyFlipBoardForLogic ? 7 - (row + 1) : row;
  const visualCol = visuallyFlipBoardForLogic ? 7 - (col + 1) : col;
  const top = `${visualRow * 12.5}%`;
  const left = `${visualCol * 12.5}%`;
  return (
    <div className="absolute pointer-events-none z-[40]" style={{ top, left, width: '25%', height: '25%', color: '#64748B' }} >
       <PixelColossus className="w-full h-full drop-shadow-xl" />
       <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-pixel z-[60] text-[22px]" style={{ textShadow: '3px 3px 0 #000', color: 'hsl(var(--destructive))', marginTop: '8%' }} > {colossusAnchor.piece.level} </span>
       </div>
    </div>
  );
};

const EffectOverlay = ({ effect, visuallyFlipBoardForLogic }: { effect: Effect, visuallyFlipBoardForLogic: boolean }) => {
  const { row, col } = algebraicToCoords(effect.square);
  const top = `${(visuallyFlipBoardForLogic ? 7 - row : row) * 12.5}%`;
  const left = `${(visuallyFlipBoardForLogic ? 7 - col : col) * 12.5}%`;
  switch (effect.type) {
    case 'poof': return ( <div className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[60]" style={{ top, left }} > <div className="w-4/5 h-4/5 animate-[poof_0.1s_ease-out_forwards]"> <ExplosionIcon className="text-foreground" /> </div> </div> );
    case 'explosion': return ( <div className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[70]" style={{ top, left }} > <div className="w-full h-full animate-[self-destruct-flicker_0.7s_ease-out_forwards]"> <ExplosionIcon className="text-destructive" /> </div> </div> );
    case 'shockwave':
      const shockwaveColor = effect.color === 'white' ? 'hsl(var(--foreground))' : 'hsl(var(--secondary))';
      return ( <div className="absolute w-[12.5%] h-[12.5%] pointer-events-none" style={{ top, left }} > <div className="absolute top-1/2 left-1/2 w-[300%] h-[300%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 animate-[shockwave-pulse_0.7s_ease-out_forwards]" style={{ borderColor: shockwaveColor }} /> </div> );
    case 'light-beam': return ( <div className="absolute overflow-hidden pointer-events-none" style={{ top, left, width: '12.5%', height: '12.5%', zIndex: 50 }}> <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/4 h-[400%] bg-gradient-to-b from-transparent via-cyan-300/60 to-transparent animate-[light-beam-anim_1.5s_ease-in-out_forwards]" /> </div> );
    case 'level-change':
      const val = effect.value || 0;
      return ( <div className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[60]" style={{ top, left }} > <span className="text-destructive font-bold text-xl md:text-2xl animate-[level-float_1s_ease-out_forwards]" style={{ textShadow: '2px 2px 0px black' }}> {val >= 0 ? `+${val}` : val} </span> </div> );
    case 'conversion': return ( <div className="absolute overflow-hidden pointer-events-none" style={{ top, left, width: '12.5%', height: '12.5%', zIndex: 55 }}> <div className="absolute inset-0 bg-primary/30 animate-pulse" /> </div> );
    default: return null;
  }
};

export function ChessBoard({
  boardState,
  selectedSquare,
  possibleMoves = [],
  enemySelectedSquare,
  enemyPossibleMoves = [],
  onSquareClick,
  playerColor,
  currentPlayerColor,
  isInteractionDisabled,
  playerInCheck,
  viewMode,
  animatedSquareTo,
  applyBoardOpacityEffect,
  lastMoveFrom,
  lastMoveTo,
  isAwaitingPawnSacrifice,
  playerToSacrificePawn,
  isAwaitingCommanderPromotion,
  playerToPromoteCommander,
  isEnPassantTarget,
  onPieceHover,
  effects = [],
  promotingSquare,
  isAwaitingAnvilDrop,
  playerToDropAnvil,
  isAwaitingHolyShield,
  isAwaitingArcherSnipe,
  isAwaitingShieldScrollTarget,
  isAwaitingSwapScrollTarget,
  isAwaitingDecreeTarget,
  isAwaitingWindScrollTarget,
  isAwaitingAnvilScrollTarget,
  isInventoryOpen,
  selectedInventoryItemType,
  localPlayerColor,
  isAwaitingDanceTarget,
  dancerToDance,
  isAwaitingGrappleThrow,
  grappledPieceSubject
}: ChessBoardProps) {

  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';
  const displayBoard = visuallyFlipBoardForLogic ? [...boardState].reverse().map(row => [...row].reverse()) : boardState;
  const isLocalActionTurn = !localPlayerColor || localPlayerColor === currentPlayerColor;

  return (
    <div className={cn( "grid grid-cols-8 w-full max-w-lg aspect-square group shadow-lg mx-auto relative", applyBoardOpacityEffect && "opacity-70", isInteractionDisabled && !(isAwaitingCommanderPromotion && playerToPromoteCommander === currentPlayerColor) && !(isAwaitingHolyShield && isLocalActionTurn) && !(isAwaitingArcherSnipe && isLocalActionTurn) && !(isAwaitingShieldScrollTarget && isLocalActionTurn) && !(isAwaitingSwapScrollTarget && isLocalActionTurn) && !(isAwaitingDecreeTarget && isLocalActionTurn) && !(isAwaitingAnvilScrollTarget && isLocalActionTurn) && !(isAwaitingWindScrollTarget && isLocalActionTurn) && !(isAwaitingDanceTarget && isLocalActionTurn) && !(isAwaitingGrappleThrow && isLocalActionTurn) && !isInventoryOpen && "cursor-not-allowed", viewMode === 'tabletop' && "rotate-90 will-change-transform backface-hidden transform-style-preserve-3d" )} onMouseLeave={() => onPieceHover(null)} >
      {displayBoard.map((row, displayedRowIndex) =>
        row.map((squareDataFromDisplay, displayedColIndex) => {
          const actualRowIndex = visuallyFlipBoardForLogic ? 7 - displayedRowIndex : displayedRowIndex;
          const actualColIndex = visuallyFlipBoardForLogic ? 7 - displayedColIndex : displayedColIndex;
          const currentSquareData = boardState[actualRowIndex][actualColIndex];
          const isLightSquare = (actualRowIndex + actualColIndex) % 2 === 0;
          const isPlayerSelected = selectedSquare === currentSquareData.algebraic;
          const isPlayerPossibleMove = (possibleMoves || []).includes(currentSquareData.algebraic);
          const isEnemySelectedFlag = enemySelectedSquare === currentSquareData.algebraic;
          const isEnemyPossibleMoveFlag = (enemyPossibleMoves || []).includes(currentSquareData.algebraic);
          const isThisKingInCheck = currentSquareData.piece?.type === 'king' && currentSquareData.piece?.color === playerInCheck;
          const isThisLastMoveFrom = currentSquareData.algebraic === lastMoveFrom;
          const isThisLastMoveTo = currentSquareData.algebraic === lastMoveTo;
          const isSacrificeTarget = isLocalActionTurn && isAwaitingPawnSacrifice && currentSquareData.piece && ['pawn', 'dancer', 'commander', 'mimic', 'grappler'].includes(currentSquareData.piece.type) && currentSquareData.piece.color === playerToSacrificePawn;
          const isCommanderPromoTarget = isLocalActionTurn && isAwaitingCommanderPromotion && currentSquareData.piece?.type === 'pawn' && currentSquareData.piece?.level === 1 && currentSquareData.piece?.color === playerToPromoteCommander;
          let isShieldTarget = false;
          if (isLocalActionTurn && isAwaitingHolyShield && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor) {
              const capturingPieceId = lastMoveTo ? boardState[algebraicToCoords(lastMoveTo).row][algebraicToCoords(lastMoveTo).col].piece?.id : null;
              if (currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen' && currentSquareData.piece.id !== capturingPieceId && !currentSquareData.piece.isShielded) isShieldTarget = true;
          }
          const isSnipeTarget = isLocalActionTurn && isAwaitingArcherSnipe && currentSquareData.piece && currentSquareData.piece.color !== currentPlayerColor && currentSquareData.piece.level === 1 && currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen';
          const isAnvilDropTarget = isLocalActionTurn && (isAwaitingAnvilDrop || isAwaitingAnvilScrollTarget || isAwaitingWindScrollTarget) && !currentSquareData.piece && !currentSquareData.item;
          const isShieldScrollTargetSelection = isLocalActionTurn && isAwaitingShieldScrollTarget && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor && currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen' && !currentSquareData.piece.isShielded;
          const isSwapTargetSelection = isLocalActionTurn && isAwaitingSwapScrollTarget && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor && currentSquareData.algebraic !== selectedSquare;
          const isDecreeTarget = isLocalActionTurn && isAwaitingDecreeTarget && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor && currentSquareData.piece.type === 'pawn' && currentSquareData.piece.level === 1;
          
          let isDanceTarget = false;
          if (isLocalActionTurn && isAwaitingDanceTarget) {
            if (!dancerToDance) {
                if (currentSquareData.piece?.type === 'dancer' && currentSquareData.piece.color === currentPlayerColor) isDanceTarget = true;
            } else {
                const {row: fr, col: fc} = algebraicToCoords(dancerToDance);
                const isDancerSelf = actualRowIndex === fr && actualColIndex === fc;
                const dir = currentPlayerColor === 'white' ? -1 : 1;
                const isOneForward = actualRowIndex === fr + dir && actualColIndex === fc;
                const isAdjacentWithPiece = Math.abs(actualRowIndex - fr) <= 1 && Math.abs(actualColIndex - fc) <= 1 && currentSquareData.piece !== null && !isDancerSelf;
                if (isDancerSelf || isOneForward || isAdjacentWithPiece) isDanceTarget = true;
            }
          }
          
          let isThrowTarget = false;
          if (isLocalActionTurn && isAwaitingGrappleThrow && selectedSquare && !currentSquareData.piece && !currentSquareData.item) {
              const {row: fr, col: fc} = algebraicToCoords(selectedSquare);
              const range = getEffectiveLevel(boardState, fr, fc);
              const isCardinal = fr === actualRowIndex || fc === actualColIndex;
              const isDiagonal = Math.abs(fr - actualRowIndex) === Math.abs(fc - actualColIndex);
              const dist = Math.max(Math.abs(fr - actualRowIndex), Math.abs(fc - actualColIndex));
              if ((isCardinal || isDiagonal) && dist <= range && dist > 0) isThrowTarget = true;
          }

          const invOwnerColor = localPlayerColor || 'white';
          let isInvTarget = isInventoryOpen && currentSquareData.piece && currentSquareData.piece.color === invOwnerColor;
          if (isInvTarget && selectedInventoryItemType) {
              const pType = currentSquareData.piece?.type || 'pawn';
              if (!isItemValidForPiece(selectedInventoryItemType, pType)) isInvTarget = false;
          }
          const isConvertingSquare = effects.some(e => e.type === 'conversion' && e.square === currentSquareData.algebraic);
          const effectiveLevel = currentSquareData.piece ? getEffectiveLevel(boardState, actualRowIndex, actualColIndex) : 0;
          const isGrimoirBoosted = currentSquareData.piece ? (effectiveLevel > (currentSquareData.piece.level || 1)) : false;

          return (
            <ChessSquare
              key={currentSquareData.algebraic}
              squareData={currentSquareData}
              isLightSquare={isLightSquare}
              isSelected={isPlayerSelected}
              isPossibleMove={isPlayerPossibleMove}
              isEnemySelected={isEnemySelectedFlag}
              isEnemyPossibleMove={isEnemyPossibleMoveFlag}
              onClick={onSquareClick}
              disabled={isInteractionDisabled && !isSacrificeTarget && !isCommanderPromoTarget && !isShieldTarget && !isSnipeTarget && !isInvTarget && !isAnvilDropTarget && !isShieldScrollTargetSelection && !isSwapTargetSelection && !isDecreeTarget && !isDanceTarget && !isThrowTarget}
              isKingInCheck={isThisKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              isLastMoveFrom={isThisLastMoveFrom}
              isLastMoveTo={isThisLastMoveTo}
              isSacrificeTarget={isSacrificeTarget}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
              isCommanderPromoTarget={isCommanderPromoTarget}
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion}
              playerToPromoteCommander={playerToPromoteCommander}
              isEnPassantTarget={isEnPassantTarget === currentSquareData.algebraic}
              onPieceHover={onPieceHover}
              isPromoting={promotingSquare === currentSquareData.algebraic}
              isConverting={isConvertingSquare}
              isShieldTarget={isShieldTarget || isShieldScrollTargetSelection}
              isSnipeTarget={isSnipeTarget}
              isAnvilDropTarget={isAnvilDropTarget}
              isInvTarget={isInvTarget}
              isSwapTarget={isSwapTargetSelection}
              isDecreeTarget={isDecreeTarget}
              isDanceTarget={isDanceTarget}
              isThrowTarget={isThrowTarget}
              selectedInventoryItemType={selectedInventoryItemType}
              effectiveLevel={effectiveLevel}
              isGrimoirBoosted={isGrimoirBoosted}
            />
          );
        })
      )}
       <LargeEntityOverlay boardState={boardState} visuallyFlipBoardForLogic={visuallyFlipBoardForLogic} />
       {effects.map(effect => ( <EffectOverlay key={effect.id} effect={effect} visuallyFlipBoardForLogic={visuallyFlipBoardForLogic} /> ))}
    </div>
  );
}
