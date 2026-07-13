
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
      <DialogContent className="sm:max-w-[425px] bg-card border-border font-sans">
        <DialogHeader>
          <DialogTitle className="text-primary text-center font-pixel uppercase text-xs">Promote Pawn</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground font-pixel uppercase text-[9px] mt-1">
            Select a piece to promote your pawn to.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-6">
          {promotionOptions.map((type) => (
            <Button
              key={type}
              variant="outline"
              className="h-40 flex flex-col items-center justify-center gap-4 hover:bg-accent/10 hover:border-accent border-2 transition-all group bg-black/40"
              onClick={() => onSelectPiece(type)}
            >
              <div className="w-24 h-24 flex items-center justify-center relative">
                {/* 
                  The 8-bit icons have significant padding in their viewBox.
                  Scaling by 2.8x ensures they fill the selection button correctly.
                */}
                <div className="w-full h-full scale-[2.8] transform-gpu flex items-center justify-center">
                  <ChessPieceDisplay piece={{ id: `promo-${type}`, type, color: pawnColor, level: 1 }} />
                </div>
              </div>
              <span className="capitalize text-xs font-pixel tracking-tighter group-hover:text-accent">{type}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
