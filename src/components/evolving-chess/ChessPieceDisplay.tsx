
import type { Piece, ViewMode } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
  isSacrificeTarget?: boolean;
  isCommanderPromoTarget?: boolean;
}

export function ChessPieceDisplay({ 
  piece, 
  isKingInCheck = false, 
  viewMode, 
  isJustMoved = false, 
  isSacrificeTarget = false,
  isCommanderPromoTarget = false,
}: ChessPieceDisplayProps) {
  const unicode = getPieceUnicode(piece);
  
  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPieceForTabletop = viewMode === 'tabletop' && piece.color === 'black';
  const isAnimating = isJustMoved;

  const animationOriginClass = "origin-bottom";
  const isCommanderLike = piece.type === 'commander' || piece.type === 'hero';


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
          isAnimating && !isSacrificeTarget && !isCommanderPromoTarget && "animate-piece-slide-in transform-gpu",
          (isSacrificeTarget || isCommanderPromoTarget) && "animate-pulse",
          animationOriginClass
        )}
      >
        <span className={cn(
          "font-pixel select-none relative z-[1]", 
          piece.type === 'pawn' || piece.type === 'commander' ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl'
        )}>
          {unicode}
        </span>

        {isCommanderLike && (
          <span
            className="absolute text-sm leading-none z-[2]" 
            style={{ 
              top: '-0.1rem',  
              right: '-0.1rem', 
            }}
            aria-label={piece.type === 'hero' ? "Hero Star" : "Commander Star"}
          >
            🌟
          </span>
        )}
        
        {(piece.level || 1) > 1 && (
          <span
            className="absolute inset-0 flex items-center justify-center font-pixel text-sm text-destructive pointer-events-none z-[3]" 
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
