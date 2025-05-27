
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

  return (
    <div className={cn(
        "relative flex items-center justify-center w-full h-full",
        pieceColorClass,
        shouldRotateBlackPiece && "rotate-180",
        isJustMoved && "animate-piece-slide-in" 
      )}>
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
