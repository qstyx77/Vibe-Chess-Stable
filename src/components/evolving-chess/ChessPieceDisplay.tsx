
import type { Piece, ViewMode } from '@/types'; 
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
  isKingInCheck?: boolean;
  viewMode?: ViewMode;
  isJustMoved?: boolean;
}

export function ChessPieceDisplay({ piece, isKingInCheck = false, viewMode, isJustMoved = false }: ChessPieceDisplayProps) { 
  const unicode = getPieceUnicode(piece);
  
  let pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';

  if (piece.type === 'king' && isKingInCheck) {
    pieceColorClass = 'text-destructive animate-pulse';
  }

  const shouldRotateBlackPiece = viewMode === 'tabletop' && piece.color === 'black';

  const justMovedStyle = isJustMoved 
    ? { 
        backgroundColor: 'rgba(0, 255, 0, 0.7)', // Bright semi-transparent green
        border: '4px solid red',
        transform: 'scale(1.3)', // Make it noticeably larger
        transition: 'transform 0.3s ease-out, backgroundColor 0.3s ease-out, border 0.3s ease-out' 
      } 
    : {};

  return (
    <div 
      className={cn(
        "relative flex items-center justify-center w-full h-full",
        pieceColorClass,
        shouldRotateBlackPiece && "rotate-180"
        // isJustMoved && "animate-piece-slide-in" // Temporarily removed custom animation class
      )}
      style={justMovedStyle} // Apply direct inline style for diagnostics
    >
      <span className={cn("font-pixel select-none", piece.type === 'pawn' ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl' )}>{unicode}</span>
      {piece.level > 1 && (
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
