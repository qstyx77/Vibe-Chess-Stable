
import type { Piece, ViewMode } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
  isSacrificeTarget?: boolean;
}

export function ChessPieceDisplay({ piece, isKingInCheck = false, viewMode, isJustMoved = false, isSacrificeTarget = false }: ChessPieceDisplayProps) {
  const unicode = getPieceUnicode(piece);
  
  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPieceForTabletop = viewMode === 'tabletop' && piece.color === 'black';
  const isAnimating = isJustMoved;

  // The animation origin for the inner scaling div should always be its bottom.
  // The outer div handles the overall rotation for tabletop view.
  const animationOriginClass = "origin-bottom";

  return (
    <div // Outer div: handles static rotation for tabletop view
      className={cn(
        "w-full h-full",
        shouldRotateBlackPieceForTabletop && "rotate-180"
      )}
    >
      <div // Inner div: handles animation, color, and content positioning
        className={cn(
          "relative flex items-center justify-center w-full h-full",
          pieceColorClass,
          // Rotation is handled by the parent div
          isAnimating && !isSacrificeTarget && "animate-piece-slide-in transform-gpu",
          isAnimating && isSacrificeTarget && "animate-pulse", // Pulse for sacrifice targets
          animationOriginClass // Applied to this inner div, scaling from its bottom
        )}
      >
        <span className={cn("font-pixel select-none", piece.type === 'pawn' ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl' )}>{unicode}</span>
        {(piece.level || 1) > 1 && (
          <span
            className="absolute inset-0 flex items-center justify-center font-pixel text-sm text-accent pointer-events-none"
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
