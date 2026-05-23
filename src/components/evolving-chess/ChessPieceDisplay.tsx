import type { Piece, ViewMode, PlayerColor } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';
import { StarIcon, SkullIcon, PrayerHandsIcon, CastleIcon } from './IconLibrary';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
  isSacrificeTarget?: boolean;
  isCommanderPromoTarget?: boolean;
  isPromoting?: boolean;
  isConverting?: boolean;
}

export function ChessPieceDisplay({
  piece,
  isKingInCheck = false,
  viewMode,
  isJustMoved = false,
  isSacrificeTarget = false,
  isCommanderPromoTarget = false,
  isPromoting = false,
  isConverting = false,
}: ChessPieceDisplayProps) {
  let unicode = getPieceUnicode(piece);
  
  if (piece.type === 'archbishop') {
    unicode = piece.color === 'white' ? '♗' : '♝';
  } else if (piece.type === 'palace') {
    unicode = piece.color === 'white' ? '♖' : '♜';
  }

  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';
  
  let animationClass = '';
  if (isConverting) {
    animationClass = piece.color === 'white' ? 'animate-color-flash-wtb' : 'animate-color-flash-btw';
  }


  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPieceForTabletop = viewMode === 'tabletop' && piece.color === 'black';

  const isCommanderLike = piece.type === 'commander' || piece.type === 'hero';
  const isInfiltrator = piece.type === 'infiltrator';


  return (
    <div
      className={cn(
        "w-full h-full",
        shouldRotateBlackPieceForTabletop && "rotate-180"
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center w-full h-full",
          pieceColorClass,
          (isSacrificeTarget || isCommanderPromoTarget) && "animate-pulse",
          isPromoting && "animate-ping",
          animationClass,
          "origin-bottom"
        )}
      >
        {piece.isShielded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[110%] h-[110%] border-2 border-white rounded-full animate-pulse shadow-[0_0_10px_white]" />
          </div>
        )}

        <span className={cn(
          "font-sans select-none relative z-[1]",
          piece.type === 'pawn' || piece.type === 'commander' || piece.type === 'infiltrator' ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl'
        )}>
          {unicode}
        </span>

        {piece.type === 'archbishop' && (
          <span
            className="absolute text-sm leading-none z-[2]"
            style={{
              top: '0.1rem',
              left: '0.1rem',
            }}
          >
            <PrayerHandsIcon className="w-4 h-4 text-primary" />
          </span>
        )}

        {piece.type === 'palace' && (
          <span
            className="absolute text-sm leading-none z-[2]"
            style={{
              top: '0.1rem',
              left: '0.1rem',
            }}
          >
            <CastleIcon className="w-4 h-4 text-primary" />
          </span>
        )}

        {isCommanderLike && (
          <span
            className="absolute text-sm leading-none z-[2]"
            style={{
              top: '-0.1rem',
              right: '-0.1rem',
            }}
            aria-label={piece.type === 'hero' ? "Hero Star" : "Commander Star"}
          >
            <StarIcon className="w-4 h-4 text-yellow-400" />
          </span>
        )}

        {isInfiltrator && (
          <span
            className="absolute text-sm leading-none z-[2]"
            style={{
              top: '-0.1rem',
              right: '-0.1rem',
            }}
            aria-label="Infiltrator Skull"
          >
            <SkullIcon className="w-4 h-4 text-destructive" />
          </span>
        )}

        {(piece.level || 1) > 1 && (
          <span
            className="absolute inset-0 flex items-center justify-center text-sm font-medium text-destructive pointer-events-none z-[3]"
            style={{ textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000' }}
            aria-label={`Level ${piece.level}`}
          >
            {piece.level}
          </span>
        )}
      </div>
    </div>
  );
}
