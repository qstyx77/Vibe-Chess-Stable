import type { Piece } from '@/types';
import { getPieceUnicode } from '@/lib/chess-utils';
import { cn } from '@/lib/utils';

interface ChessPieceDisplayProps {
  piece: Piece;
}

export function ChessPieceDisplay({ piece }: ChessPieceDisplayProps) {
  const unicode = getPieceUnicode(piece);
  const pieceColorClass = piece.color === 'white' ? 'text-foreground' : 'text-primary'; // Or a dedicated piece color

  return (
    <div className={cn("relative flex items-center justify-center w-full h-full", pieceColorClass)}>
      <span className="text-3xl md:text-4xl select-none">{unicode}</span>
      {piece.level > 1 && (
        <span
          className="absolute top-0 right-0 text-xs font-bold bg-accent text-accent-foreground rounded-full w-4 h-4 flex items-center justify-center shadow-md"
          aria-label={`Level ${piece.level}`}
        >
          {piece.level}
        </span>
      )}
    </div>
  );
}
