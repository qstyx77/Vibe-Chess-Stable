
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface RulesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const PieceRule = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="mb-2">
    <h4 className="font-semibold text-primary">{title}</h4>
    <p className="text-sm text-foreground/90 pl-2">{children}</p>
  </div>
);

const LevelRule = ({ level, description }: { level: string | number, description: string }) => (
  <li className="text-sm text-foreground/90 ml-4 list-disc list-inside">{`Level ${level}: ${description}`}</li>
);

export function RulesDialog({ isOpen, onOpenChange }: RulesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-card border-border font-pixel text-foreground max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-primary text-center text-2xl">VIBE CHESS - Game Rules</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Understand the special abilities and mechanics.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[40vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="general">
              <AccordionTrigger className="text-lg hover:text-accent">General Gameplay</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Objective">Checkmate the opponent's King.</PieceRule>
                <PieceRule title="Pawn Promotion">
                  When a Pawn reaches the opponent's back rank, it must be promoted to a Queen, Rook, Bishop, or Knight of the same color. The promoted piece starts at Level 1.
                  If the Pawn was Level 5 or higher before promoting, its player gets an extra turn immediately after promotion.
                </PieceRule>
                <PieceRule title="Castling">Standard chess castling rules apply (King and Rook must not have moved, path clear, King not in/through/into check). Castling is not allowed if the King is in check.</PieceRule>
                <PieceRule title="Auto-Checkmate on Extra Turn">
                  If a player delivers check to the opponent's King AND earns an extra turn (either through a Level 5+ pawn promotion or a streak of 6) on the same move, it is an immediate checkmate, and that player wins.
                </PieceRule>
                <PieceRule title="Threefold Repetition">
                  If the same board position (including piece locations, current player, and castling rights) occurs three times during a game, the game is a draw.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="killstreaks">
              <AccordionTrigger className="text-lg hover:text-accent">Kill Streaks</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Activation">Achieved by capturing enemy pieces on consecutive turns by the same player.</PieceRule>
                <PieceRule title="Streak of 3 (Resurrection)">
                  One of your previously captured pieces (if any) is resurrected. It returns to a random empty square on the board at Level 1.
                </PieceRule>
                <PieceRule title="Streak of 6 (Extra Turn)">
                  You gain an extra turn immediately.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pawn">
              <AccordionTrigger className="text-lg hover:text-accent">Pawn Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard forward move (1 or 2 squares from start), diagonal capture." />
                  <LevelRule level="2+" description="Can also move 1 square directly backward (if empty)." />
                  <LevelRule level="3+" description="Can also move 1 square sideways (left or right, if empty)." />
                  <LevelRule level="4+" description="Push-Back: If the Pawn moves to a square adjacent (horizontally, vertically, or diagonally) to an enemy piece, that enemy piece is pushed 1 square further in the same direction from the Pawn, provided the destination square is empty." />
                  <LevelRule level="5+" description="Promotion Bonus: If a Level 5+ Pawn is promoted, its player gets an extra turn." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="knight">
              <AccordionTrigger className="text-lg hover:text-accent">Knight Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard L-shape move/capture." />
                  <LevelRule level="2+" description="Can also move/capture 1 square cardinally (forward, backward, left, right)." />
                  <LevelRule level="3+" description="Can also move/capture by jumping 3 squares cardinally (forward, backward, left, right)." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Bishop on the board." />
                  <LevelRule level="5+" description="Self-Destruct: Instead of moving, the Knight can be re-selected to self-destruct. The Knight is removed from the board, and all adjacent enemy pieces (except Kings, invulnerable Rooks, and higher-level invulnerable Queens) are captured. This counts towards kill streaks." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bishop">
              <AccordionTrigger className="text-lg hover:text-accent">Bishop Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard diagonal move/capture (blocked by any piece in its path)." />
                  <LevelRule level="2+" description="Phase: Can jump over friendly pieces (still blocked by enemy pieces in its path)." />
                  <LevelRule level="3+" description="Pawn Immunity: Cannot be captured by Pawns." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Knight on the board." />
                  <LevelRule level="5+" description="Conversion: After moving, has a 50% chance for each adjacent enemy piece (non-King) to convert that piece to its own color (level and type preserved)." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="rook">
              <AccordionTrigger className="text-lg hover:text-accent">Rook Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1-2" description="Standard horizontal/vertical move/capture (blocked by any piece in its path)." />
                  <LevelRule level="3+" description="Upon leveling up to Level 3 (or any higher level through capture), it becomes invulnerable for the opponent's next turn." />
                  <LevelRule level="Promotion" description="If a Pawn is promoted to a Rook (starts at Level 1), the Rook is invulnerable for the opponent's next turn." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="queen">
              <AccordionTrigger className="text-lg hover:text-accent">Queen Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard Queen movement (horizontal, vertical, diagonal; blocked by any piece in her path)." />
                  <LevelRule level="5+" description="Royal Guard: Invulnerable to attacks from any enemy piece of a lower level." />
                  <LevelRule level="5" description="Pawn Sacrifice: Upon reaching Level 5 for the first time (and not already Level 5+), if the Queen's player has any pawns on the board, they must select and sacrifice one of their pawns. If no pawns are available, no sacrifice is made." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="king">
              <AccordionTrigger className="text-lg hover:text-accent">King Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard 1-square move/capture in any direction. Can castle." />
                  <LevelRule level="2+" description="Extended Reach: Can move/capture up to 2 squares in any direction. If this 2-square move is in a straight line (horizontal, vertical, or diagonal), the intermediate square must be empty." />
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
        <DialogClose asChild>
            <Button type="button" variant="secondary" className="mt-4 w-full">
                Close
            </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
