
import type { Piece } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
}

export function ChessPieceDisplay({ piece }: ChessPieceDisplayProps) {
  const unicode = getPieceUnicode(piece);
  // In 8-bit, piece colors are often just stark foreground/primary or similar.
  // Using foreground for white, and secondary or a different vibrant color for black.
  const pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-secondary';

  return (
    <div className={cn("relative flex items-center justify-center w-full h-full", pieceColorClass)}>
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
