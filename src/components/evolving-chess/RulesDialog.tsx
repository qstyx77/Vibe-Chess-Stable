
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
                <PieceRule title="Objective">Checkmate the opponent's King, or achieve an Infiltration Win.</PieceRule>
                <PieceRule title="Piece Levels">
                  Pieces level up by capturing opponent pieces or consuming Shrooms 🍄 and do not have a maximum level (except Queens, capped at L7). Each piece type gains different abilities as it levels up. (See individual piece sections for details).
                </PieceRule>
                <PieceRule title="Pawn Promotion (Rank)">
                  When a Pawn (not a Commander, Hero, or Infiltrator) reaches the opponent's back rank, it must be promoted to a Queen, Rook, Bishop, or Knight of the same color. The promoted piece starts at Level 1. If the promotion move also captured an opponent's piece, the promoted piece gains levels accordingly.
                </PieceRule>
                 <PieceRule title="Commander Promotion to Hero (Rank)">
                  When a Commander reaches the opponent's back rank, it is automatically promoted to a Hero. The Hero retains the Commander's current level. If the Commander was Level 5 or higher, its player receives an extra turn.
                </PieceRule>
                <PieceRule title="Castling">Standard chess castling rules apply (King and Rook must not have moved, path clear, King not in check, and King doesn't pass through or land on an attacked square).</PieceRule>
                <PieceRule title="Auto-Checkmate on Extra Turn">
                  If a player delivers check to the opponent's King AND earns an extra turn (either through a Level 5+ pawn/commander promotion or a streak of 6) on the same move, it is an immediate checkmate, and that player wins.
                </PieceRule>
                <PieceRule title="Push-Back Self-Check (Auto-Loss)">
                  If a Level 4+ Pawn or Commander uses its Push-Back ability, and this push directly results in its own King being put into check, it is an immediate loss for the player who made the push. The opponent wins by auto-checkmate.
                </PieceRule>
                <PieceRule title="Threefold Repetition">
                  If the same board position (including piece and item locations, current player, castling rights, and en passant target square) occurs three times during a game, the game is a draw.
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="enpassant">
              <AccordionTrigger className="text-base hover:text-accent">En Passant &amp; Infiltrator</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="En Passant Capture">
                  If an opponent's pawn moves two squares forward from its starting position and lands on a square adjacent (same rank, different file) to one of your pawns, your pawn may capture the opponent's pawn "en passant" (in passing).
                  This capture must be made on the very next turn. Your pawn moves to the square the opponent's pawn *skipped over*. The opponent's pawn is removed from the board.
                </PieceRule>
                <PieceRule title="Promotion to Infiltrator">
                  When one of your pawns successfully captures an opponent's pawn via En Passant, your pawn is immediately promoted to an "Infiltrator". It retains the level it had as a pawn (including any level gained from the en passant capture itself).
                  The Infiltrator is visually distinct (it appears as a Pawn with a skull 💀 overlay).
                </PieceRule>
                <PieceRule title="Infiltrator Abilities">
                  <ul className="list-none pl-0 space-y-1">
                    <li>
                      <strong>Movement & Capture:</strong> An Infiltrator can move one square directly forward OR one square diagonally forward. It captures in the same manner (one square forward or one square diagonally forward).
                    </li>
                     <li>
                      <strong>Obliteration:</strong> Pieces captured by an Infiltrator are removed from the game entirely and do not go to the captured pieces pile.
                    </li>
                    <li>
                      <strong>Winning Condition - Infiltration:</strong> If an Infiltrator reaches the opponent's back rank, its player immediately wins the game by "Infiltration". This win condition overrides checkmate or stalemate.
                    </li>
                     <li>
                      <strong>Queen Hunter:</strong> Can capture an enemy Queen regardless of the Queen's level or L7 invulnerability.
                    </li>
                  </ul>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="firstblood">
              <AccordionTrigger className="text-base hover:text-accent">First Blood, Commander &amp; Hero</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="First Blood">
                  The first player to capture an enemy piece during the game achieves "First Blood".
                </PieceRule>
                <PieceRule title="Commander Promotion (First Blood)">
                  The player who achieves First Blood immediately gets to select one of their own Level 1 Pawns currently on the board. This chosen Pawn is instantly promoted to a "Commander".
                  The Commander is visually distinct (it appears as a Pawn with a star 🌟 overlay).
                </PieceRule>
                <PieceRule title="Commander Promotion (Pawn Captures Commander)">
                  If a standard Pawn (not already a Commander) captures an enemy Commander, that Pawn is immediately promoted to a Commander. It retains its current level. This promotion happens automatically and does not use the "First Blood" selection process.
                </PieceRule>
                <PieceRule title="Commander Abilities">
                  <ul className="list-none pl-0 space-y-1">
                    <li>
                      <strong>Movement & Standard Abilities:</strong> A Commander moves, captures, and gains leveled abilities exactly like a standard Pawn of its current level (see Pawn & Commander Abilities section).
                    </li>
                     <li>
                      <strong>Rallying Cry (Special):</strong> When the Commander captures an enemy piece, all of its player's other Pawns (not Commanders, Heroes, or Infiltrators) currently on the board immediately level up by 1. This does not affect the Commander itself. If a Pawn leveled up by this ability would promote to a Queen, its level is still capped at 7.
                    </li>
                    <li>
                      <strong>Promotion to Hero:</strong> When a Commander reaches the opponent's back rank, it is automatically promoted to a "Hero". The Hero retains the Commander's current level. If the Commander was Level 5 or higher, its player receives an extra turn. A Hero is visually represented as a Knight with a star 🌟 overlay.
                    </li>
                     <li>
                      <strong>Queen Hunter:</strong> Can capture an enemy Queen regardless of the Queen's level or L7 invulnerability.
                    </li>
                  </ul>
                </PieceRule>
                 <PieceRule title="Hero Abilities">
                   <p className="text-sm text-foreground/90">A Hero moves and gains leveled abilities identically to Knights (see Knight & Hero Abilities). Heroes also have the following special abilities:</p>
                  <ul className="list-none pl-0 space-y-1 mt-1">
                    <li>
                      <strong>Hero's Rallying Cry (Special):</strong> When the Hero captures an enemy piece, all of its player's other allied pieces (Pawns, Knights, Bishops, Rooks, Queens, Commanders, Infiltrators and other Heroes) currently on the board immediately level up by 1. This does not affect the Hero that made the capture. If a Queen levels up from this ability, its level is still capped at 7.
                    </li>
                    <li>
                      <strong>Queen Hunter:</strong> Can capture an enemy Queen regardless of the Queen's level or L7 invulnerability.
                    </li>
                  </ul>
                </PieceRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="items">
              <AccordionTrigger className="text-base hover:text-accent">Board Items: Anvils &amp; Shrooms</AccordionTrigger>
              <AccordionContent>
                <PieceRule title="Anvil 🧱">
                  <ul className="list-none pl-0 space-y-1">
                    <li><strong>Spawning:</strong> Every 9 game moves (after the 9th, 18th, 27th, etc. move is completed), an anvil drops onto a random empty square on the board.</li>
                    <li><strong>Blocking:</strong> Anvils block movement and attacks for all pieces. Pieces cannot move to or through a square occupied by an anvil. Line of sight for attacks is blocked by anvils.</li>
                    <li><strong>Interaction:</strong> Anvils cannot be captured or destroyed by normal piece moves, but can be destroyed by a Knight/Hero's self-destruct ability.</li>
                    <li><strong>Pawn Push-Back (L4+ Pawn/Commander):</strong>
                      <ul className="list-disc list-inside pl-4 mt-1">
                        <li className="text-sm">If a pawn/commander pushes an adjacent anvil: The anvil moves one square in the push direction.
                          <ul className="list-circle list-inside pl-4">
                            <li className="text-sm">If the anvil lands on a square occupied by another piece (not a King, not another anvil), that piece is "captured" by the anvil and removed from the game. This still counts towards kill streaks.</li>
                            <li className="text-sm">If the anvil is pushed off the board, it is removed from the game.</li>
                            <li className="text-sm">An anvil cannot push another anvil; the push fails.</li>
                          </ul>
                        </li>
                        <li className="text-sm">If a pawn/commander pushes an adjacent piece towards a square occupied by an anvil, the push fails.</li>
                      </ul>
                    </li>
                  </ul>
                </PieceRule>
                 <PieceRule title="Shroom 🍄">
                  <ul className="list-none pl-0 space-y-1">
                    <li><strong>Spawning:</strong> Every 5 to 10 game moves (randomly determined), a Shroom 🍄 appears on a random empty square (no piece or other item).</li>
                    <li><strong>Consumption:</strong> If any piece (friendly or enemy) moves onto a square containing a Shroom, the Shroom disappears, and that piece immediately gains 1 level. A Queen's level is still capped at 7.</li>
                  </ul>
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
              <AccordionTrigger className="text-base hover:text-accent">Pawn &amp; Commander Abilities</AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground mb-2">(Commanders gain these abilities as they level up, just like Pawns. Commanders promote to Hero at the opponent's back rank. Pawns can promote to Infiltrator via En Passant. Both Commanders and Infiltrators can capture L7 Queens.)</p>
                <ul>
                  <LevelRule level="1" description="Standard forward move (1 or 2 squares from start), diagonal capture. Can perform En Passant." />
                  <LevelRule level="2+" description="Can also move 1 square directly backward (if empty)." />
                  <LevelRule level="3+" description="Can also move 1 square sideways (left or right, if empty)." />
                  <LevelRule level="4+" description="Push-Back: If the Pawn/Commander moves to a square adjacent (horizontally, vertically, or diagonally) to an enemy piece OR an anvil, that entity is pushed 1 square further in the same direction from the Pawn/Commander, if possible. See Anvil Mechanic for details on anvil interaction and General Gameplay for Push-Back Self-Check." />
                  <LevelRule level="5+" description="Promotion Bonus: If a Level 5+ Pawn (promoting to Queen, Rook, Bishop, or Knight) or a Level 5+ Commander (promoting to Hero) reaches the opponent's back rank, its player gets an extra turn." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="knight">
              <AccordionTrigger className="text-base hover:text-accent">Knight &amp; Hero Abilities</AccordionTrigger>
              <AccordionContent>
                 <p className="text-xs text-muted-foreground mb-2">(Heroes move and gain leveled abilities identically to Knights. See "First Blood, Commander & Hero" for Hero origin, special Rallying Cry, and their Queen Hunter ability.)</p>
                <ul>
                  <LevelRule level="1" description="Standard L-shape move/capture." />
                  <LevelRule level="2+" description="Can also move/capture 1 square cardinally (forward, backward, left, right)." />
                  <LevelRule level="3+" description="Can also move/capture by jumping 3 squares cardinally (forward, backward, left, right, clearing intermediate squares)." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Bishop on the board." />
                  <LevelRule level="5+" description="Self-Destruct: Instead of moving, the Knight/Hero can be re-selected to self-destruct. The piece is removed from the board. All adjacent enemy pieces (except Kings) and all adjacent anvils are destroyed. This ability WILL capture enemy Queens regardless of their normal invulnerability or level. This counts towards kill streaks for pieces destroyed." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bishop">
              <AccordionTrigger className="text-base hover:text-accent">Bishop Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard diagonal move/capture (blocked by any piece or item in its path)." />
                  <LevelRule level="2+" description="Phase: Can jump over friendly pieces (still blocked by enemy pieces or items in its path)." />
                  <LevelRule level="3+" description="Pawn Immunity: Cannot be captured by Pawns, Commanders, or Infiltrators." />
                  <LevelRule level="4+" description="Swap: Can move by swapping places with any friendly Knight or Hero on the board." />
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
                  <LevelRule level="7" description="Royal Guard &amp; Pawn Sacrifice: The Queen's maximum level is 7. At Level 7, she is invulnerable to attacks from any enemy piece of a lower level, *except* for Commanders, Heroes, and Infiltrators, which can capture her regardless of their level. Additionally, every time a Queen's level becomes 7 due to a leveling event (capture or promotion-capture), if the Queen's player has any Pawns or Commanders on the board, they must select and sacrifice one of their Pawns or Commanders. If none are available, no sacrifice is made." />
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="king">
              <AccordionTrigger className="text-base hover:text-accent">King Abilities</AccordionTrigger>
              <AccordionContent>
                <ul>
                  <LevelRule level="1" description="Standard 1-square move/capture in any direction. Can castle (if not in check, path is clear, and neither King nor Rook has moved; King cannot pass through an attacked square or square with an item)." />
                  <LevelRule level="2-4" description="Extended Reach: Can move/capture up to 2 squares in any straight direction (horizontal, vertical, or diagonal). The intermediate square must be empty (no piece or item). If moving 2 squares to capture a piece that is checking the King, the King can pass through an intermediate square even if that intermediate square is attacked *only by the piece being captured*." />
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

