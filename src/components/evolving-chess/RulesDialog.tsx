
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
          <DialogDescription className="sr-only">
            Revised Rulebook
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <Accordion type="single" collapsible className="w-full pb-6">
            
            {/* I. GAME MODES */}
            <AccordionItem value="modes">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">I. Game Modes</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Main Lobby">
                  <RuleText>• Local Play: Play against a friend on the same device or toggle the AI for practice.</RuleText>
                  <RuleText>• Casual Online: Create or join a private room using a Room ID to play with friends.</RuleText>
                  <RuleText>• Ranked Matchmaking: Winning or losing adjusts your ELO rating, leaderboard standing, and equipment capacity.</RuleText>
                </RuleSection>
                <RuleSection title="Dungeon Mode (PvE)">
                  <RuleText>• A single-player campaign through 50 floors of increasing difficulty. Clearing Floor 50 grants ultimate victory.</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* II. OBJECTIVE */}
            <AccordionItem value="objectives">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">II. Victory Conditions</AccordionTrigger>
              <AccordionContent>
                <RuleText>1. Checkmate: Standard chess victory. Trap the enemy King.</RuleText>
                <RuleText>2. Infiltration: Reach the opponent’s back rank with an Infiltrator for an instant win.</RuleText>
                <RuleText>3. Dungeon Conquest: Clear all enemy units or checkmate the Dungeon Boss to descend.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* III. LEVELING & SKILLS */}
            <AccordionItem value="leveling">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">III. Leveling & Skills</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Experience Values">
                  <RuleText>• Capture Front Line Unit: +1 Level</RuleText>
                  <RuleText>• Capture Knight, Hero, Archer, Bishop, Archbishop, Rook, or Palace: +2 Levels</RuleText>
                  <RuleText>• Capture Queen: +3 Levels</RuleText>
                  <RuleText>• Consume Shroom 🍄: +1 Level</RuleText>
                </RuleSection>
                <RuleText>Queens are strictly capped at Level 7. Most other units have no limit. Skill unlocks are determined by a piece's current level.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* IV. UNIT SKILLS */}
            <AccordionItem value="skills">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IV. Unit Skills by Class</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Front Line (Pawn, Dancer, Mimic, Grappler, Commander, Myco Mage)">
                  <RuleText>L2: Move backward. L3: Move sideways. L4: Push-Back adjacent units/items on move. L5: Master Promotion grants an Extra Turn.</RuleText>
                </SubRule>
                <SubRule title="The Cavalry (Knight, Hero, Archer)">
                  <RuleText>L2: Cardinal move. L3: 3-square Long Jump. L4: Swap with allied Bishops. L5: Self-Destruct active ability.</RuleText>
                </SubRule>
                <SubRule title="The Clergy (Bishop, Archbishop)">
                  <RuleText>L2: Phase through allies. L3: Pawn Immunity. L4: Swap with allied Cavalry. L5: 50% Conversion chance.</RuleText>
                </SubRule>
                <SubRule title="The Fortress (Rook, Palace)">
                  <RuleText>L4: Resurrection Call (Returns ally at L1 on capture).</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* V. SPECIALIZED ELITE UNITS */}
            <AccordionItem value="elite">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">V. Specialized Elite Units</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Archbishop (Unlock: 1500 Elo)">
                  <RuleText>Elite Bishop. Kill Streaks grant Holy Shield (Target becomes invulnerable until they move).</RuleText>
                </RuleSection>
                <RuleSection title="Palace (Unlock: 1800 Elo)">
                  <RuleText>Elite Rook. Resurrects allies at their original captured level. Castling levels up the King.</RuleText>
                </RuleSection>
                <RuleSection title="Archer (Unlock: 2100 Elo)">
                  <RuleText>Elite Knight. High Kill Streaks grant Archer Snipe: Destroy any non-royal enemy the same level or lower than your Archer.</RuleText>
                </RuleSection>
                <SubRule title="Unique Units">
                  <RuleText>• Myco Mage: Consumes shroom mana gathered by all allies to cast powerful fungal spells (Propagate, Teleport, Bomb, Army).</RuleText>
                  <RuleText>• Mimic: Shape-shift (copy the pattern of the last piece moved using your current level).</RuleText>
                  <RuleText>• Dancer: Dance (Achieving KS1 allows a cardinal move or adjacent swap with an ally or enemy).</RuleText>
                  <RuleText>• Grappler: Toss (Pick up and launch adjacent units in a straight line; Range = Level).</RuleText>
                  <RuleText>• Infiltrator: Obliteration (Captured pieces removed from the game). Instant win on back rank.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* VI. BOARD ITEMS */}
            <AccordionItem value="items">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VI. Board Items</AccordionTrigger>
              <AccordionContent>
                <SubRule title="Shroom 🍄">
                  <RuleText>Spawns randomly every 5-10 turns. Does not block paths. Consume for +1 Level and +1 Mana for allied Myco Mages.</RuleText>
                </SubRule>
                <SubRule title="Anvil">
                  <RuleText>Impassable obstacle placed via KS3 or Scrolls. L4+ Front Line can push Anvils to crush enemy units.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* VII. LOOT & EQUIPMENT */}
            <AccordionItem value="loot">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VII. Loot & Equipment</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Equipping: In Lobby, equip from bag before a match. In Dungeon, equip before the first turn of each floor.</RuleText>
                <RuleText>• Attunement: Start with 2 slots. Gain +1 slot for every 400 Elo above 1200.</RuleText>
                <RuleText>• Items: Provide passive boosts or active "Scroll" spells.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* VIII. ROYAL GUARD */}
            <AccordionItem value="royal">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VIII. The Royal Guard</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Queen (L7)">
                  <RuleText>Invulnerable to all except Commanders, Heroes, Infiltrators, Myco Mages, or units Level 8+.</RuleText>
                  <RuleText>Sacrifice: Reaching L7 requires the immediate sacrifice of one allied Front Line Unit.</RuleText>
                </SubRule>
                <SubRule title="The King">
                  <RuleText>L2: 2-square range. L5: Knight move. Dominion: Capture reduces enemy Queen levels.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* IX. KILL STREAKS */}
            <AccordionItem value="ks">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IX. The War Path (Kill Streaks)</AccordionTrigger>
              <AccordionContent>
                <RuleText>KS 1: Dance (Dancer only - Cardinal move to empty space or swap with adjacent ally/enemy).</RuleText>
                <RuleText>KS 2: Holy Shield (Archbishop - Target ally is invulnerable until they move).</RuleText>
                <RuleText>KS 3: Anvil Drop.</RuleText>
                <RuleText>KS 4: Resurrection (Captured ally returns to random open space at L1).</RuleText>
                <RuleText>KS 5: Archer Snipe (Target and destroy non-royal enemy level Archer or lower).</RuleText>
                <RuleText>KS 6: Extra Turn.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* X. THE STACK */}
            <AccordionItem value="stack">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">X. The Stack (Order of Operations)</AccordionTrigger>
              <AccordionContent>
                <RuleText>1. Impact: Capture or Mirror Shield reflection.</RuleText>
                <RuleText>2. Immediate Leveling: Experience gain from capture and target-square Shrooms.</RuleText>
                <RuleText>3. Royal Dominion: Enemy Queen level reduction via King capture.</RuleText>
                <RuleText>4. Spatial Disruptions: Push-Back, Pulling, or Anvil Crushing.</RuleText>
                <RuleText>5. Collective Logic: Soul Link level synchronization.</RuleText>
                <RuleText>6. Interactive Menus: Queen Sacrifice -> Rank Promotion -> Kill Streak Rewards.</RuleText>
                <RuleText>7. Status Check: Poison damage application.</RuleText>
                <RuleText>8. Resolution: Checkmate/Infiltration check.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* XI. DUNGEON MECHANICS */}
            <AccordionItem value="dungeon">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">XI. Dungeon Mechanics</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Floor Collapse: If the enemy army has no legal moves 3 times in a row, their remaining pieces self-destruct, destroying adjacent pieces, collapsing the floor, and progressing you.</RuleText>
                <RuleText>• Persistence: Your army's casualties, levels, promotions, skills, and items persist between floors.</RuleText>
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
