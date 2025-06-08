
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

interface RulesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const PieceRule = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="mb-2">
    <h4 className="font-semibold text-primary">{title}</h4>
    <div className="text-sm text-foreground/90 pl-2">{children}</div>
  </div>
);

const LevelRule = ({ level, description }: { level?: string | number, description: string }) => (
  <li className="text-sm text-foreground/90 ml-4 list-disc list-inside">{ level ? `Level ${level}: ` : '' }${description}</li>
);

export function RulesDialog({ isOpen, onOpenChange }: RulesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-card border-border font-pixel text-foreground max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-primary text-center text-xl">VIBE CHESS - Game Rules</DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            Understand the special abilities and mechanics.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="general">
              <AccordionTrigger className="text-base hover:text-accent">General Gameplay</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Objective">Checkmate the opponent's King.</PieceRule>
                <PieceRule title="Piece Levels">
                  Pieces level up by capturing opponent pieces and do not have a maximum level. Each piece type gains different abilities as it levels up. (See individual piece sections for details).
                </PieceRule>
                <PieceRule title="Pawn Promotion (Rank)">
                  When a Pawn (not a Commander) reaches the opponent's back rank, it must be promoted to a Queen, Rook, Bishop, or Knight of the same color. The promoted piece starts at Level 1. If the promotion move also captured an opponent's piece, the promoted piece gains levels accordingly.
                  If the Pawn was Level 5 or higher before promoting, its player gets an extra turn immediately after promotion.
                </PieceRule>
                <PieceRule title="Castling">Standard chess castling rules apply (King and Rook must not have moved, path clear, King not in check, and King doesn't pass through or land on an attacked square).</PieceRule>
                <PieceRule title="Auto-Checkmate on Extra Turn">
                  If a player delivers check to the opponent's King AND earns an extra turn (either through a Level 5+ pawn promotion or a streak of 6) on the same move, it is an immediate checkmate, and that player wins.
                </PieceRule>
                <PieceRule title="Threefold Repetition">
                  If the same board position (including piece and item locations, current player, and castling rights) occurs three times during a game, the game is a draw.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="firstblood">
              <AccordionTrigger className="text-base hover:text-accent">First Blood & Commander</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="First Blood">
                  The first player to capture an enemy piece during the game achieves "First Blood". This capture can be a standard piece capture or a capture resulting from an Anvil being pushed by a Pawn.
                </PieceRule>
                <PieceRule title="Commander Promotion (First Blood)">
                  The player who achieves First Blood immediately gets to select one of their own Level 1 Pawns currently on the board. This chosen Pawn is instantly promoted to a "Commander".
                  The Commander is visually distinct (it appears as a Pawn with a star overlay).
                </PieceRule>
                <PieceRule title="Commander Promotion (Pawn Captures Commander)">
                  If a standard Pawn (not already a Commander) captures an enemy Commander, that Pawn is immediately promoted to a Commander. It retains its current level. This promotion happens automatically and does not use the "First Blood" selection process.
                </PieceRule>
                <PieceRule title="Commander Abilities">
                  <ul className="list-none pl-0">
                    <li className="text-sm text-foreground/90 mb-1">
                      <strong>Movement & Standard Abilities:</strong> A Commander moves, captures, and gains leveled abilities exactly like a standard Pawn of its current level (see Pawn Abilities section). Commanders do not promote further by reaching the opponent's back rank.
                    </li>
                    <li className="text-sm text-foreground/90">
                      <strong>Rallying Cry (Special):</strong> When the Commander captures an enemy piece, all of its player's other Pawns (not Commanders) currently on the board immediately level up by 1. This does not affect the Commander itself. If a Pawn promoted from this ability becomes a Queen, its level is still capped at 7.
                    </li>
                  </ul>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="anvils">
              <AccordionTrigger className="text-base hover:text-accent">Anvil Mechanic</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Spawning">Every 9 game moves (after the 9th, 18th, 27th, etc. move is completed), an anvil 🧱 drops onto a random empty square on the board.</PieceRule>
                <PieceRule title="Blocking">
                  Anvils block movement and attacks for all pieces. Pieces cannot move to or through a square occupied by an anvil. Line of sight for attacks is blocked by anvils.
                </PieceRule>
                <PieceRule title="Interaction">Anvils cannot be captured or destroyed by normal piece moves.</PieceRule>
                <PieceRule title="Pawn Push-Back (L4+ Pawn/Commander)">
                  <div>A Level 4+ Pawn or Commander's Push-Back ability can interact with anvils:
                    <ul className="list-disc list-inside pl-4 mt-1">
                      <li className="text-sm">If a pawn/commander pushes an adjacent anvil: The anvil moves one square in the push direction.
                        <ul className="list-circle list-inside pl-4">
                          <li className="text-sm">If the anvil lands on a square occupied by another piece (not a King, not another anvil), that piece is "captured" by the anvil and removed from the game (it does not go to the captured pieces display). This still counts towards kill streaks.</li>
                          <li className="text-sm">If the anvil is pushed off the board, it is removed from the game.</li>
                          <li className="text-sm">An anvil cannot push another anvil; the push fails.</li>
                        </ul>
                      </li>
                      <li className="text-sm">If a pawn/commander pushes an adjacent piece towards a square occupied by an anvil, the push fails (a piece cannot push an anvil).</li>
                    </ul>
                  </div>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="killstreaks">
              <AccordionTrigger className="text-base hover:text-accent">Kill Streaks</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Activation">Achieved by capturing enemy pieces (including anvil captures). A player's streak only resets if that player makes a non-capturing move.</PieceRule>
                <PieceRule title="Streak of 3 (Resurrection)">
                  One of your previously captured pieces (if any) is resurrected. It returns to a random empty square on the board at Level 1.
                </PieceRule>
                <PieceRule title="Streak of 6 (Extra Turn)">
                  You gain an extra turn immediately.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pawn">
              <AccordionTrigger className="text-base hover:text-accent">Pawn & Commander Abilities</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground mb-2">(Commanders gain these abilities as they level up, just like Pawns. Commanders do not promote further by reaching the back rank.)</p>
                <ul>
                  <LevelRule level="1" description="Standard forward move (1 or 2 squares from start), diagonal capture." />
                  <LevelRule level="2+" description="Can also move 1 square directly backward (if empty)." />
                  <LevelRule level="3+" description="Can also move 1 square sideways (left or right, if empty)." />
                  <LevelRule level="4+" description="Push-Back: If the Pawn/Commander moves to a square adjacent (horizontally, vertically, or diagonally) to an enemy piece OR an anvil, that entity is pushed 1 square further in the same direction from the Pawn/Commander, if possible. See Anvil Mechanic for details on anvil interaction." />
                  <LevelRule level="5+" description="Promotion Bonus: If a Level 5+ Pawn (not a Commander) is promoted by reaching the back rank, its player gets an extra turn." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="knight">
              <AccordionTrigger className="text-base hover:text-accent">Knight Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard L-shape move/capture." />
                  <LevelRule level="2+" description="Can also move/capture 1 square cardinally (forward, backward, left, right)." />
                  <LevelRule level="3+" description="Can also move/capture by jumping 3 squares cardinally (forward, backward, left, right, clearing intermediate squares)." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Bishop on the board." />
                  <LevelRule level="5+" description="Self-Destruct: Instead of moving, the Knight can be re-selected to self-destruct. The Knight is removed from the board, and all adjacent enemy pieces (except Kings) are captured. This counts towards kill streaks." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bishop">
              <AccordionTrigger className="text-base hover:text-accent">Bishop Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard diagonal move/capture (blocked by any piece or item in its path)." />
                  <LevelRule level="2+" description="Phase: Can jump over friendly pieces (still blocked by enemy pieces or items in its path)." />
                  <LevelRule level="3+" description="Pawn Immunity: Cannot be captured by Pawns or Commanders." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Knight on the board." />
                  <LevelRule level="5+" description="Conversion: After moving, has a 50% chance for each adjacent enemy piece (non-King, on a square without an item) to convert that piece to its own color (level and type preserved)." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="rook">
              <AccordionTrigger className="text-base hover:text-accent">Rook Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1-3" description="Standard horizontal/vertical move/capture (blocked by any piece or item in its path)." />
                  <LevelRule level="4+" description="Resurrection Call: Whenever a Rook's level increases to 4 or higher (from a lower level), it attempts to resurrect one of its player's own captured pieces. The resurrected piece (highest value available) is placed on a random empty square (no piece or item) adjacent (horizontally, vertically, or diagonally) to this Rook. The resurrected piece returns at Level 1. If no captured pieces are available or no empty adjacent squares exist, this ability has no effect." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="queen">
              <AccordionTrigger className="text-base hover:text-accent">Queen Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1-6" description="Standard Queen movement (horizontal, vertical, diagonal; blocked by any piece or item in her path)." />
                  <LevelRule level="7" description="Royal Guard & Pawn Sacrifice: The Queen's maximum level is 7. At Level 7, she is invulnerable to attacks from any enemy piece of a lower level. Additionally, every time a Queen's level becomes 7 due to a leveling event (capture or promotion-capture), if the Queen's player has any Pawns or Commanders on the board, they must select and sacrifice one of their Pawns or Commanders. If none are available, no sacrifice is made." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="king">
              <AccordionTrigger className="text-base hover:text-accent">King Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard 1-square move/capture in any direction. Can castle (if not in check, path is clear, and neither King nor Rook has moved; King cannot pass through an attacked square or square with an item)." />
                  <LevelRule level="2-4" description="Extended Reach: Can move/capture up to 2 squares in any straight direction (horizontal, vertical, or diagonal). If this 2-square move is linear, the intermediate square must be empty (no piece or item) and not under attack by an opponent's piece." />
                  <LevelRule level="5+" description="Knight's Agility: Gains the ability to move/capture in an L-shape like a Knight, in addition to all previous abilities." />
                  <LevelRule description="King's Dominion: Whenever the King levels up (due to a capture), all of the opponent's Queens on the board have their levels reduced by the same amount the King gained (minimum level 1)." />
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

