
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

  return (
    <div // Main container for the piece display
      className={cn(
        "w-full h-full",
        shouldRotateBlackPieceForTabletop && "rotate-180"
      )}
    >
      <div // Inner container for relative positioning of piece and star
        className={cn(
          "relative flex items-center justify-center w-full h-full",
          pieceColorClass,
          isAnimating && !isSacrificeTarget && !isCommanderPromoTarget && "animate-piece-slide-in transform-gpu",
          (isSacrificeTarget || isCommanderPromoTarget) && "animate-pulse",
          animationOriginClass
        )}
      >
        {/* Pawn/Piece Symbol */}
        <span className={cn(
          "font-pixel select-none relative z-[1]", // Ensure pawn symbol has a base z-index
          piece.type === 'pawn' || piece.type === 'commander' ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl'
        )}>
          {unicode}
        </span>

        {/* Commander Star - positioned absolutely relative to the inner container */}
        {piece.type === 'commander' && (
          <span
            className="absolute text-sm leading-none z-[2]" // Star has higher z-index
            style={{ 
              top: '-0.1rem',  // Fine-tune positioning
              right: '-0.1rem', // Fine-tune positioning
            }}
            aria-label="Commander Star"
          >
            🌟
          </span>
        )}
        
        {/* Level Display - should be on top of both pawn and star if they overlap */}
        {(piece.level || 1) > 1 && (
          <span
            className="absolute inset-0 flex items-center justify-center font-pixel text-sm text-destructive pointer-events-none z-[3]" // Level on top
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
