
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameSummaryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  winner: string | 'draw' | undefined;
  winnerName: string;
  loserName: string;
  eloInfo: any | null;
  moveCount: number;
  onReset: () => void;
}

export function GameSummaryDialog({
  isOpen,
  onClose,
  winner,
  winnerName,
  loserName,
  eloInfo,
  moveCount,
  onReset,
}: GameSummaryDialogProps) {
  const isDraw = winner === 'draw';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20 font-sans text-foreground">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-primary tracking-tighter uppercase font-pixel">
            Game Over
          </DialogTitle>
          <DialogDescription className="text-center text-lg font-medium text-foreground/90">
            {isDraw ? "It's a Stalemate!" : `${winnerName} Wins!`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-muted/30 border border-border rounded-none">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Total Turns</p>
              <p className="text-2xl font-bold">{moveCount}</p>
            </div>
            <div className="p-3 bg-muted/30 border border-border rounded-none flex flex-col justify-center">
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Result</p>
              <p className={cn("text-xl font-bold truncate", isDraw ? "text-muted-foreground" : "text-primary")}>
                {isDraw ? "DRAW" : "VICTORY"}
              </p>
            </div>
          </div>

          <div className="p-4 bg-muted/10 border border-border/50 rounded-none space-y-3">
             <div className="space-y-2">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold text-primary uppercase border border-primary/30 px-1">Winner</span>
                   <span className="text-sm font-bold truncate ml-4">{isDraw ? "---" : winnerName}</span>
                </div>
                <div className="flex justify-between items-center opacity-70">
                   <span className="text-[10px] font-bold text-destructive uppercase border border-destructive/30 px-1">Loser</span>
                   <span className="text-sm font-bold truncate ml-4">{isDraw ? "---" : loserName}</span>
                </div>
             </div>
          </div>

          {eloInfo && (
            <div className="p-3 bg-primary/5 border border-primary/10 space-y-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Updated ELO Ratings</h4>
              <div className="space-y-2">
                {Object.entries(eloInfo).map(([uid, info]: [string, any]) => (
                  <div key={uid} className="flex justify-between items-center text-sm">
                    <span className="font-medium text-xs opacity-70">Player stats</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground line-through decoration-destructive/50 text-[10px]">{info.oldElo}</span>
                      <span className="text-primary font-bold text-base">→ {info.newElo}</span>
                      <span className={cn("text-[10px] px-1 rounded", (info.newElo - info.oldElo) >= 0 ? "bg-green-500/20 text-green-400" : "bg-destructive/20 text-destructive")}>
                        {(info.newElo - info.oldElo) >= 0 ? '+' : ''}{info.newElo - info.oldElo}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-center gap-2">
          <Button onClick={onReset} className="w-full font-bold uppercase tracking-wider h-11">
            <RefreshCw className="w-4 h-4 mr-2" /> Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
