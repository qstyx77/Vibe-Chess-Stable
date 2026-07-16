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
import Image from 'next/image';

interface RulesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const PieceRule = ({ title, children }: { title: React.ReactNode, children: React.ReactNode }) => (
  <div className="mb-2">
    <h4 className="font-semibold text-primary text-sm font-medium flex items-center gap-2">{title}</h4>
    <div className="text-sm font-medium text-foreground/90 pl-2">{children}</div>
  </div>
);

const LevelRule = ({ level, description }: { level?: string | number, description: string }) => (
  <li className="text-sm font-medium text-foreground/90 ml-4 list-disc list-inside">{ level ? `Level ${level}: ` : '' }${description}</li>
);

export function RulesDialog({ isOpen, onOpenChange }: RulesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-card border-border text-foreground max-h-[80vh] font-sans">
        <DialogHeader>
          <DialogTitle className="text-primary text-center text-base font-medium uppercase font-pixel tracking-tighter">VIBE CHESS - Game Rules</DialogTitle>
          <DialogDescription className="text-center text-sm font-medium text-muted-foreground">
            Understand the special abilities and elite units.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="general">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">General Gameplay</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Objective">Checkmate the opponent's King, or achieve an Infiltration Win.</PieceRule>
                <PieceRule title="Piece Levels">
                  Pieces level up by capturing opponent pieces or consuming Shrooms 🍄 and do not have a maximum level (except Queens, capped at L7). Each piece type gains different abilities as it levels up.
                </PieceRule>
                <PieceRule title="Pawn Promotion (Rank)">
                  When a Pawn (not a Commander, Hero, or Infiltrator) reaches the opponent's back rank, it must be promoted to a Queen, Rook, Bishop, or Knight.
                  <ul className="list-none pl-0 space-y-1 mt-1">
                    <li className="text-sm font-medium text-foreground/90 ml-2">&bull; Promotion move without capture: Level 1.</li>
                    <li className="text-sm font-medium text-foreground/90 ml-2">&bull; Promotion with capture: Level 2 (if Pawn/Cmd captured), Level 3 (if Knight/Bishop/Rook/Hero captured), or Level 4 (if Queen captured).</li>
                  </ul>
                </PieceRule>
                 <PieceRule title="Commander Promotion to Hero (Rank)">
                  When a Commander reaches the opponent's back rank, it is automatically promoted to a "Hero". If the Commander was Level 5+, its player receives an extra turn.
                </PieceRule>
                <PieceRule title="Castling">Standard chess castling rules apply. King and Rook must not have moved, and path must be clear.</PieceRule>
                <PieceRule title="Draw Conditions">
                  <ul className="list-disc list-inside pl-4 mt-1">
                    <li className="text-sm font-medium">Stalemate: Current player has no legal moves and is not in check.</li>
                    <li className="text-sm font-medium">Threefold Repetition: The same board position occurs three times.</li>
                  </ul>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="special-units">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">Special &amp; Elite Units</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground mb-3 italic">These units have unique mechanics that differ from their base piece types.</p>
                
                <PieceRule title="Mimic">
                  <strong>Shape-shift:</strong> Replicates the movement and capture pattern of the very last piece that moved (regardless of color).
                  <em> Crucially, the Mimic uses its OWN current Level to determine which abilities within that pattern are unlocked.</em>
                </PieceRule>
                
                <PieceRule title="Dancer">
                  <strong>Dance:</strong> Achieving a Kill Streak of 1 (or any multiple thereof) allows the Dancer to perform an immediate bonus move: either one square cardinally to an empty space, or swapping places with an adjacent ally.
                </PieceRule>
                
                <PieceRule title="Grappler">
                  <strong>Toss:</strong> Can pick up an adjacent piece (except Kings) and launch it to any empty square in a cardinal or diagonal line. Max distance = Grappler's current Level.
                </PieceRule>

                <PieceRule title="Archbishop (Elite Bishop)">
                  <strong>Holy Shield:</strong> If an Archbishop is on the board, reaching a Kill Streak of 2 allows you to grant a Holy Shield to an ally, protecting them from one capture attempt.
                </PieceRule>

                <PieceRule title="Archer (Elite Knight)">
                  <strong>Snipe:</strong> Reaching a Kill Streak of 5 (or 3 with a Crossbow) allows the Archer to target and destroy any Level 1 enemy unit globally. The Archer levels up based on the value of the target.
                </PieceRule>

                <PieceRule title="Palace (Elite Rook)">
                  <strong>Master Resurrector:</strong> Unlike a standard Rook (which resurrects allies at Level 1), the Palace returns fallen allies at their original captured level.
                  <br/><strong>Royal Sanctuary:</strong> Castling with a Palace levels up the King.
                </PieceRule>

                <PieceRule title="Infiltrator">
                  <strong>Obliteration:</strong> Pieces captured by an Infiltrator are removed from the game entirely.
                  <br/><strong>Win:</strong> Reaching the back rank with an Infiltrator results in an immediate Infiltration Win.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="items">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">Board Items: Anvils &amp; Shrooms</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Anvil">
                  <ul className="list-none pl-0 space-y-1">
                    <li><strong>Spawning:</strong> Awarded on a Kill Streak of 3.</li>
                    <li><strong>Blocking:</strong> Anvils block movement and line-of-sight for all pieces.</li>
                    <li><strong>Pushing:</strong> L4+ Pawns/Commanders can push anvils. If an anvil is pushed into a piece (non-King), that piece is crushed and removed.</li>
                  </ul>
                </PieceRule>
                 <PieceRule title="Shroom 🍄">
                  <ul className="list-none pl-0 space-y-1">
                    <li><strong>Consumption:</strong> Moving onto a Shroom 🍄 removes it and grants the piece +1 Level (Queen cap 7).</li>
                  </ul>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="killstreaks">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">Kill Streaks</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm font-medium text-muted-foreground mb-2">Streaks reset only if a player makes a non-capturing move.</p>
                <ul className="space-y-2">
                  <LevelRule level="2" description="Holy Shield (Requires Archbishop): Shield an allied piece." />
                  <LevelRule level="3" description="Anvil Drop: Place an Anvil on any empty square." />
                  <LevelRule level="4" description="Resurrection: One captured ally returns at Level 1." />
                  <LevelRule level="5" description="Archer Snipe (Requires Archer): Destroy a L1 enemy unit." />
                  <LevelRule level="6" description="Extra Turn: Gain another move immediately." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="royal-rules">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">Royal Mechanics (King &amp; Queen)</AccordionTrigger>
              <AccordionContent>
                 <PieceRule title="Queen (Invulnerability)">
                  At Level 7, the Queen is invulnerable to standard pieces of a lower level. However, **Commanders**, **Heroes**, and **Infiltrators** can capture her regardless of level.
                </PieceRule>
                <PieceRule title="Queen (Pawn Sacrifice)">
                  Every time a Queen reaches Level 7, the player must select and sacrifice one of their Pawns or Commanders to satisfy the Royal Guard.
                </PieceRule>
                <PieceRule title="King (Dominion)">
                  Whenever your King levels up via capture, all opponent Queens on the board have their levels reduced by the amount the King gained.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dungeon">
              <AccordionTrigger className="text-sm font-medium hover:text-accent">Dungeon Mode Specials</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Dungeon Collapse">
                  If your forces have no legal moves for 3 consecutive attempts (Stalemate Strikes), the dungeon collapses, triggering explosions on all enemy squares.
                </PieceRule>
                 <PieceRule title="Boss Loot">
                  Defeating a boss (Floor 10, 20, 30, etc.) grants rare consumable items like Portal Scrolls or Mirror Shields.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
        <DialogClose asChild>
            <Button type="button" variant="secondary" className="mt-4 w-full text-xs font-pixel uppercase">
                Back to Battle
            </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
