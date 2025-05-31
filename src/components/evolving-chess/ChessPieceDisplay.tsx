
import type { Piece, ViewMode } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
  // Added for sacrifice pawn animation
  isSacrificeTarget?: boolean; 
}

export function ChessPieceDisplay({ piece, isKingInCheck = false, viewMode, isJustMoved = false, isSacrificeTarget = false }: ChessPieceDisplayProps) {
  const unicode = getPieceUnicode(piece);
  
  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPiece = viewMode === 'tabletop' && piece.color === 'black';
  const isAnimating = isJustMoved;

  let animationOriginClass = "";
  if (isAnimating) {
    // If the piece is black AND in tabletop view (rotated 180deg), its visual "bottom" (relative to black player) is its original "top".
    // Otherwise (white piece, or black piece not rotated for tabletop), its visual "bottom" is its original "bottom".
    if (shouldRotateBlackPiece) {
      animationOriginClass = "origin-top"; 
    } else {
      animationOriginClass = "origin-bottom";
    }
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-full h-full",
        pieceColorClass,
        shouldRotateBlackPiece && "rotate-180",
        isAnimating && !isSacrificeTarget && "animate-piece-slide-in transform-gpu", // Don't animate if it's a sacrifice preview
        isAnimating && isSacrificeTarget && "animate-pulse", // Different animation for sacrifice target
        animationOriginClass 
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
  );
}

