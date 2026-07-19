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

const RuleSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="mb-4">
    <h4 className="font-pixel text-[10px] text-primary uppercase mb-2 tracking-tighter">{title}</h4>
    <div className="space-y-2">{children}</div>
  </div>
);

const RuleText = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-medium text-foreground/90 leading-relaxed pl-2 border-l-2 border-border/50">
    {children}
  </p>
);

const SubRule = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="ml-2 mb-2">
    <p className="text-xs font-bold text-accent uppercase mb-1">{title}</p>
    <div className="text-sm text-foreground/80 pl-2">{children}</div>
  </div>
);

export function RulesDialog({ isOpen, onOpenChange }: RulesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-card border-border text-foreground max-h-[90vh] font-sans overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <DialogTitle className="text-primary text-center text-xl font-medium uppercase font-pixel tracking-tighter">
            VIBE CHESS - COMPLETE RULEBOOK
          </DialogTitle>
          <DialogDescription className="text-center text-xs font-pixel uppercase opacity-70">
            Master the stack, level up your army, and conquer the dungeon.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow px-6 pb-6">
          <Accordion type="single" collapsible className="w-full">
            
            {/* I. GAME MODES */}
            <AccordionItem value="modes">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">I. Game Modes</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Main Lobby">
                  <RuleText>• Local Play: Practice against yourself or toggle AI for either side.</RuleText>
                  <RuleText>• Casual Online: Play with friends via private Room IDs.</RuleText>
                  <RuleText>• Ranked Matchmaking: Competitive play that adjusts your ELO. High ELO increases your item capacity and unlocks elite units.</RuleText>
                </RuleSection>
                <RuleSection title="Dungeon Mode (PvE)">
                  <RuleText>A single-player campaign through 50 floors of increasing difficulty. Clearing Floor 50 grants ultimate victory.</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* II. OBJECTIVES */}
            <AccordionItem value="objectives">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">II. Victory Conditions</AccordionTrigger>
              <AccordionContent>
                <RuleText>1. Checkmate: Standard chess victory. Trap the enemy King.</RuleText>
                <RuleText>2. Infiltration: Reach the opponent’s back rank with an Infiltrator for an instant win.</RuleText>
                <RuleText>3. Dungeon Conquest: Clear all enemy units or checkmate the Boss to descend.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* III. LEVELING & XP */}
            <AccordionItem value="leveling">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">III. Leveling & Experience</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Experience Values">
                  <RuleText>• Capture Front Line: +1 Level</RuleText>
                  <RuleText>• Capture Knight/Hero/Archer/Bishop/Rook: +2 Levels</RuleText>
                  <RuleText>• Capture Queen: +3 Levels</RuleText>
                  <RuleText>• Consume Shroom 🍄: +1 Level</RuleText>
                </RuleSection>
                <RuleText>Most units have no level cap. Queens are strictly capped at Level 7.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* IV. UNIT SKILLS */}
            <AccordionItem value="skills">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IV. Unit Skills by Class</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Front Line (Pawn, Dancer, Mimic, Grappler, Commander)">
                  <RuleText>L2: Move backward. L3: Move sideways. L4: Push-Back adjacent units/items on move. L5: Promotion grants an Extra Turn.</RuleText>
                </SubRule>
                <SubRule title="The Cavalry (Knight, Hero, Archer)">
                  <RuleText>L2: Cardinal movement. L3: 3-square long jumps. L4: Swap with allied Bishops. L5: Self-Destruct active ability.</RuleText>
                </SubRule>
                <SubRule title="The Clergy (Bishop, Archbishop)">
                  <RuleText>L2: Phase through allies. L3: Pawn Immunity (cannot be captured by Front Line). L4: Swap with allied Cavalry. L5: 50% Conversion chance.</RuleText>
                </SubRule>
                <SubRule title="The Fortress (Rook, Palace)">
                  <RuleText>L4: Resurrection Call (resurrects an ally at L1 on capture).</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* V. ELITE UNITS */}
            <AccordionItem value="elite">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">V. Specialized Elite Units</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Archbishop (Unlock: 1600 Elo)">
                  <RuleText>Elite Bishop. High Kill Streaks allow the Holy Shield ability.</RuleText>
                </RuleSection>
                <RuleSection title="Archer (Unlock: 1600 Elo)">
                  <RuleText>Elite Knight. Gains the Snipe skill: Global destruction of enemy non-royals that are the same level or lower as the Archer.</RuleText>
                </RuleSection>
                <RuleSection title="Palace (Unlock: 1600 Elo)">
                  <RuleText>Elite Rook. Resurrects allies at their original captured level. Castling with a Palace levels up the King.</RuleText>
                </RuleSection>
                <RuleSection title="Other Elites">
                  <RuleText>• Mimic: Shape-shift (copy the movement of the last piece moved).</RuleText>
                  <RuleText>• Dancer: Dance (Move or swap places with an adjacent ally or enemy piece).</RuleText>
                  <RuleText>• Grappler: Toss (Pick up and launch adjacent units up to dist=Level).</RuleText>
                  <RuleText>• Infiltrator: Obliteration (Captured pieces are removed from the game).</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* VI. BOARD ITEMS */}
            <AccordionItem value="items">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VI. Board Items</AccordionTrigger>
              <AccordionContent>
                <SubRule title="Shroom 🍄">
                  <RuleText>Spawns randomly every 5-10 turns. Does not block movement. Grants +1 level on consumption.</RuleText>
                </SubRule>
                <SubRule title="Anvil">
                  <RuleText>Placed via KS3 or Scrolls. Impassable. L4+ Front Line units can push Anvils to crush enemy units.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* VII. LOOT & EQUIPMENT */}
            <AccordionItem value="loot">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VII. Loot & Equipment</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Equipping: In Lobby, equip from bag before a match. In Dungeon, access bag before the first turn of every floor.</RuleText>
                <RuleText>• Attunement: Start with 2 slots. Gain +1 slot for every 400 Elo above 1200.</RuleText>
                <RuleText>• Items: Provide passive boosts or active "Scroll" spells.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* VIII. ROYAL GUARD */}
            <AccordionItem value="royal">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VIII. The Royal Guard</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="The Queen (L7)">
                  <RuleText>Invulnerable to all standard units. Only captured by Commanders, Heroes, Infiltrators, or units Level 8+.</RuleText>
                  <RuleText>Sacrifice: Reaching L7 requires the immediate sacrifice of one allied Front Line unit.</RuleText>
                </RuleSection>
                <RuleSection title="The King">
                  <RuleText>L2: 2-square range. L5: Knight move. Dominion: Capture reduces enemy Queen levels.</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* IX. KILL STREAKS */}
            <AccordionItem value="ks">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IX. The War Path (Kill Streaks)</AccordionTrigger>
              <AccordionContent>
                <RuleText>KS 1: Dance (Dancer only - move cardinal or swap).</RuleText>
                <RuleText>KS 2: Holy Shield (Targeted ally is invulnerable until they move).</RuleText>
                <RuleText>KS 3: Anvil Drop / Archer Snipe (with Crossbow).</RuleText>
                <RuleText>KS 4: Resurrection (Captured ally returns at L1 to a random open square).</RuleText>
                <RuleText>KS 5: Archer Snipe (Global targeting, level-restricted).</RuleText>
                <RuleText>KS 6: Extra Turn.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* X. THE STACK */}
            <AccordionItem value="stack">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">X. The Stack (Order of Operations)</AccordionTrigger>
              <AccordionContent>
                <RuleText>1. Impact: Capture or Mirror Shield reflection.</RuleText>
                <RuleText>2. Leveling: XP gain from capture/shroom.</RuleText>
                <RuleText>3. Dominion: Enemy Queen level reduction.</RuleText>
                <RuleText>4. Spatial: Push-Back, Pulling, or Anvil Crushing.</RuleText>
                <RuleText>5. Logic: Soul Link synchronization.</RuleText>
                <RuleText>6. Menus: Sacrifice -> Rank Promotion -> Kill Streak Rewards.</RuleText>
                <RuleText>7. Status: Poison damage application.</RuleText>
                <RuleText>8. Resolution: Checkmate/Infiltration check.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* XI. DUNGEON MECHANICS */}
            <AccordionItem value="dungeon">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">XI. Dungeon Mechanics</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Floor Collapse: If the enemy army has no legal moves 3 times in a row, they self-destruct, clearing the floor and progressing you automatically.</RuleText>
                <RuleText>• Boss Battles: Unique rule-breaking powers found every 10 floors.</RuleText>
                <RuleText>• Persistence: Casualties, levels, promotions, skills, and items all persist between floors.</RuleText>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </ScrollArea>
        
        <div className="p-4 bg-muted/20 border-t shrink-0">
          <DialogClose asChild>
            <Button type="button" variant="secondary" className="w-full text-xs font-pixel uppercase h-10">
              Return to Battle
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
