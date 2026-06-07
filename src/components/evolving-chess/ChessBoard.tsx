'use client';

import type { BoardState, AlgebraicSquare, PlayerColor, ViewMode, Piece, Effect, InventoryItemType } from '@/types';
import { ChessSquare } from './ChessSquare';
import { cn } from '@/lib/utils';
import { algebraicToCoords } from '@/lib/chess-utils';
import { ExplosionIcon } from './IconLibrary';

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
  isInventoryOpen?: boolean;
  selectedInventoryItemType?: InventoryItemType | null;
  localPlayerColor?: PlayerColor | null;
}

const EffectOverlay = ({ effect, visuallyFlipBoardForLogic }: { effect: Effect, visuallyFlipBoardForLogic: boolean }) => {
  const { row, col } = algebraicToCoords(effect.square);
  const top = `${(visuallyFlipBoardForLogic ? 7 - row : row) * 12.5}%`;
  const left = `${(visuallyFlipBoardForLogic ? 7 - col : col) * 12.5}%`;
  
  switch (effect.type) {
    case 'poof':
      return (
        <div 
          className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[60]"
          style={{ top, left }}
        >
          <div className="w-4/5 h-4/5 animate-[poof_0.1s_ease-out_forwards]">
            <ExplosionIcon className="text-foreground" />
          </div>
        </div>
      );
    case 'explosion':
      return (
          <div 
              className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[70]"
              style={{ top, left }}
          >
              <div className="w-full h-full animate-[self-destruct-flicker_0.7s_ease-out_forwards]">
                <ExplosionIcon className="text-destructive" />
              </div>
          </div>
      );
    case 'shockwave':
      const shockwaveColor = effect.color === 'white' ? 'hsl(var(--foreground))' : 'hsl(var(--secondary))';
      return (
         <div
          className="absolute w-[12.5%] h-[12.5%] pointer-events-none"
          style={{ top, left }}
        >
          <div 
            className="absolute top-1/2 left-1/2 w-[300%] h-[300%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 animate-[shockwave-pulse_0.7s_ease-out_forwards]"
            style={{ borderColor: shockwaveColor }}
          />
        </div>
      );
     case 'light-beam':
      return (
        <div className="absolute overflow-hidden pointer-events-none" style={{ top, left, width: '12.5%', height: '12.5%', zIndex: 50 }}>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/4 h-[400%] bg-gradient-to-b from-transparent via-cyan-300/60 to-transparent animate-[light-beam-anim_1.5s_ease-in-out_forwards]" />
        </div>
      );
    case 'level-change':
      const val = effect.value || 0;
      const isPositive = val >= 0;
      const sign = isPositive ? '+' : '';
      const text = `${sign}${val}`;
      return (
          <div 
              className="absolute w-[12.5%] h-[12.5%] pointer-events-none flex items-center justify-center z-[60]"
              style={{ top, left }}
          >
              <span className="text-destructive font-bold text-xl md:text-2xl animate-[level-float_1s_ease-out_forwards]" style={{ textShadow: '2px 2px 0px black' }}>
                  {text}
              </span>
          </div>
      );
    default:
      return null;
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
  isInventoryOpen,
  selectedInventoryItemType,
  localPlayerColor
}: ChessBoardProps) {

  const visuallyFlipBoardForLogic = viewMode === 'flipping' && playerColor === 'black';

  const displayBoard = visuallyFlipBoardForLogic
    ? [...boardState].reverse().map(row => [...row].reverse())
    : boardState;

  const isLocalActionTurn = !localPlayerColor || localPlayerColor === currentPlayerColor;

  return (
    <div
      className={cn(
        "grid grid-cols-8 w-full max-w-lg aspect-square overflow-hidden group shadow-lg mx-auto relative",
        applyBoardOpacityEffect && "opacity-70",
        isInteractionDisabled && !(isAwaitingCommanderPromotion && playerToPromoteCommander === currentPlayerColor) && !(isAwaitingHolyShield && isLocalActionTurn) && !(isAwaitingArcherSnipe && isLocalActionTurn) && !(isAwaitingShieldScrollTarget && isLocalActionTurn) && !isInventoryOpen && "cursor-not-allowed",
        viewMode === 'tabletop' && "rotate-90 will-change-transform backface-hidden transform-style-preserve-3d"
      )}
      onMouseLeave={() => onPieceHover(null)}
    >
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

          const isSacrificeTarget = isLocalActionTurn && isAwaitingPawnSacrifice &&
                                    currentSquareData.piece &&
                                    (currentSquareData.piece.type === 'pawn' || currentSquareData.piece.type === 'commander') &&
                                    currentSquareData.piece.color === playerToSacrificePawn;

          const isCommanderPromoTarget = isLocalActionTurn && isAwaitingCommanderPromotion &&
                                         currentSquareData.piece?.type === 'pawn' &&
                                         currentSquareData.piece?.level === 1 &&
                                         currentSquareData.piece?.color === playerToPromoteCommander;
          
          let isShieldTarget = false;
          if (isLocalActionTurn && isAwaitingHolyShield && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor) {
              const capturingPieceId = lastMoveTo ? boardState[algebraicToCoords(lastMoveTo).row][algebraicToCoords(lastMoveTo).col].piece?.id : null;
              if (currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen' && currentSquareData.piece.id !== capturingPieceId) {
                  isShieldTarget = true;
              }
          }

          const isSnipeTarget = isLocalActionTurn && isAwaitingArcherSnipe && currentSquareData.piece && currentSquareData.piece.color !== currentPlayerColor && currentSquareData.piece.level === 1 && currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen';

          const isAnvilDropTarget = isLocalActionTurn && isAwaitingAnvilDrop && !currentSquareData.piece && !currentSquareData.item;

          const isShieldScrollTargetSelection = isLocalActionTurn && isAwaitingShieldScrollTarget && currentSquareData.piece && currentSquareData.piece.color === currentPlayerColor && currentSquareData.piece.type !== 'king' && currentSquareData.piece.type !== 'queen';

          const invOwnerColor = localPlayerColor || 'white';
          let isInvTarget = isInventoryOpen && currentSquareData.piece && currentSquareData.piece.color === invOwnerColor;
          
          if (isInvTarget && selectedInventoryItemType === 'swift_cloak') {
            const pType = currentSquareData.piece?.type;
            if (pType !== 'pawn' && pType !== 'commander') {
              isInvTarget = false;
            }
          }

          if (isInvTarget && selectedInventoryItemType === 'queens_peace') {
            if (currentSquareData.piece?.type !== 'queen') {
              isInvTarget = false;
            }
          }

          if (isInvTarget && selectedInventoryItemType === 'gnosis') {
              const pType = currentSquareData.piece?.type;
              if (pType === 'king' || pType === 'queen') {
                  isInvTarget = false;
              }
          }

          if (isInvTarget && selectedInventoryItemType === 'crossbow') {
              if (currentSquareData.piece?.type !== 'archer') {
                  isInvTarget = false;
              }
          }

          if (isInvTarget && selectedInventoryItemType === 'detonation_scroll') {
              if (currentSquareData.piece?.type === 'king') {
                  isInvTarget = false;
              }
          }
          
          const isConvertingSquare = effects.some(e => e.type === 'conversion' && e.square === currentSquareData.algebraic);

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
              disabled={isInteractionDisabled && !isSacrificeTarget && !isCommanderPromoTarget && !isShieldTarget && !isSnipeTarget && !isInvTarget && !isAnvilDropTarget && !isShieldScrollTargetSelection}
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
              selectedInventoryItemType={selectedInventoryItemType}
            />
          );
        })
      )}
       {effects.map(effect => (
         <EffectOverlay 
           key={effect.id} 
           effect={effect} 
           visuallyFlipBoardForLogic={visuallyFlipBoardForLogic} 
         />
       ))}
    </div>
  );
}
