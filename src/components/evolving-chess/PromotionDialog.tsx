
'use client';

import type { PieceType, PlayerColor } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { getPieceUnicode } from '@/lib/chess-utils';
import { ChessPieceDisplay } from './ChessPieceDisplay';

interface PromotionDialogProps {
  isOpen: boolean;
  onSelectPiece: (pieceType: PieceType) => void;
  pawnColor: PlayerColor | null;
}

const promotionOptions: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];

export function PromotionDialog({ isOpen, onSelectPiece, pawnColor }: PromotionDialogProps) {
  if (!pawnColor) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => { /* Controlled externally */ }}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border font-pixel">
        <DialogHeader>
          <DialogTitle className="text-primary text-center">Promote Pawn</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Select a piece to promote your pawn to.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          {promotionOptions.map((type) => (
            <Button
              key={type}
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 text-lg hover:bg-accent hover:text-accent-foreground"
              onClick={() => onSelectPiece(type)}
            >
              <div className="w-10 h-10">
                <ChessPieceDisplay piece={{ id: `promo-${type}`, type, color: pawnColor, level: 1 }} />
              </div>
              <span className="capitalize">{type}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
