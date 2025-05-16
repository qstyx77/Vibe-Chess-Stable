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
          className="absolute top-0.5 right-0.5 text-[8px] font-bold bg-primary text-primary-foreground rounded-none w-3 h-3 flex items-center justify-center"
          aria-label={`Level ${piece.level}`}
        >
          {piece.level}
        </span>
      )}
    </div>
  );
}
