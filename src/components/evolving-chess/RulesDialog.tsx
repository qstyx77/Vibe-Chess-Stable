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
            VIBE CHESS - RULEBOOK 
          </DialogTitle>
          <DialogDescription className="sr-only">
            Comprehensive Game Rules
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-6">
          <Accordion type="single" collapsible className="w-full pb-6">
            
            {/* I. OVERVIEW & MODES */}
            <AccordionItem value="overview">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">I. Overview & Game Modes</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="The Game">
                  <RuleText>Vibe Chess is a high-stakes, 8-bit tactical strategy game where every unit levels up through combat, unlocking powerful skills and global effects.</RuleText>
                </RuleSection>
                <RuleSection title="Modes">
                  <RuleText>• Local Play: Play against a friend on the same device or toggle the AI for practice.</RuleText>
                  <RuleText>• Casual Online: Play with friends via Room IDs.</RuleText>
                  <RuleText>• Ranked Matchmaking: Gain Elo and unlock elite units. High Elo increases your 'Attunement Slots' for equipment.</RuleText>
                  <RuleText>• Dungeon Mode (PvE): A 50-floor crawl against boss entities and scaling armies. Progress is persistent.</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* II. LEVELING & EXPERIENCE */}
            <AccordionItem value="leveling">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">II. Leveling & Experience</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Experience Values">
                  <RuleText>Units gain levels immediately upon capturing an opponent:</RuleText>
                  <RuleText>• Capture Front Line (Pawn, Dancer, etc.): +1 Level</RuleText>
                  <RuleText>• Capture Cavalry/Clergy (Knight, Bishop, etc.): +2 Levels</RuleText>
                  <RuleText>• Capture Queen: +3 Levels</RuleText>
                  <RuleText>• Consume Shroom 🍄: +1 Level</RuleText>
                </RuleSection>
                <RuleSection title="Master Promotion (L5+)">
                  <RuleText>Reaching the opponent's back rank with a Front Line unit triggers a Master Promotion. If that unit is Level 5 or higher, you are granted an immediate Extra Turn.</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* III. SPECIALIZED UNITS */}
            <AccordionItem value="specialized">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">III. Specialized Units</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Combat Specialists">
                  <SubRule title="First Blood">
                    <RuleText>The first player to capture an enemy unit in a match triggers First Blood. This grants the immediate opportunity to promote a Level 1 Pawn into a Commander.</RuleText>
                  </SubRule>
                  <SubRule title="Commander">
                    <RuleText>An elite front-line unit born from First Blood. They gain 'Rallying Cry' on capture (leveling up adjacent allies) and promoted into a Hero upon reaching the back rank. They are specialized 'Queen Hunters'.</RuleText>
                  </SubRule>
                  <SubRule title="Hero">
                    <RuleText>The pinnacle of the Commander's path. They trigger a global 'Heroic Rally' on capture, leveling up all allied units on the board.</RuleText>
                  </SubRule>
                  <SubRule title="Infiltrator">
                    <RuleText>A deadly assassin that moves and captures forward or diagonally. Captures by an Infiltrator 'Obliterate' the target, removing it from the game entirely (no resurrection). Reaching the back rank results in an instant win.</RuleText>
                  </SubRule>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* IV. PIECE INDEX & SKILL TREE */}
            <AccordionItem value="pieces">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IV. Piece Index & Skill Tree</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Front Line (Pawn, Dancer, Mimic, Grappler, Commander, Myco Mage)">
                  <RuleText>L2: Can move 1 square backward.</RuleText>
                  <RuleText>L3: Can move 1 square sideways.</RuleText>
                  <RuleText>L4: Push-Back: Moving adjacent to units/items pushes them away.</RuleText>
                  <RuleText>L5: Master Promotion grants an Extra Turn.</RuleText>
                </SubRule>
                <SubRule title="The Cavalry (Knight, Hero, Archer)">
                  <RuleText>L2: Cardinal move (1 square up/down/left/right).</RuleText>
                  <RuleText>L3: Long Jump (Jump 3 squares cardinally).</RuleText>
                  <RuleText>L4: Swap: Can trade places with an allied Bishop/Archbishop.</RuleText>
                  <RuleText>L5: Self-Destruct: Active skill. Detonates piece to destroy a 3x3 enemy area.</RuleText>
                </SubRule>
                <SubRule title="The Clergy (Bishop, Archbishop)">
                  <RuleText>L2: Phasing: Can move through friendly units.</RuleText>
                  <RuleText>L3: Pawn Immunity: Cannot be captured by Front Line units.</RuleText>
                  <RuleText>L4: Swap: Can trade places with an allied Knight/Hero/Archer.</RuleText>
                  <RuleText>L5: Faith: 50% chance to convert adjacent enemies to your side after moving.</RuleText>
                </SubRule>
                <SubRule title="The Fortress (Rook, Palace)">
                  <RuleText>L4: Resurrection Call: Capturing a unit triggers a random resurrection of your strongest fallen ally at L1.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* V. ELITE & UNIQUE UNITS */}
            <AccordionItem value="unique">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">V. Elite & Unique Units</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Ranked Unlocks">
                  <RuleText>• Archbishop (1500 Elo): Elite Clergy. Achieving KS 2 grants a Holy Shield to an ally.</RuleText>
                  <RuleText>• Palace (1800 Elo): Elite Fortress. Resurrects units at their original level. Castling levels up the King.</RuleText>
                  <RuleText>• Archer (2100 Elo): Elite Cavalry. KS 3/5 triggers Snipe: Instantly destroy any non-royal unit Level ≤ Archer.</RuleText>
                </RuleSection>
                <RuleSection title="Dungeon Unlocks">
                  <RuleText>• Myco Mage: Consumes shroom mana for global spells (Teleport, Spore Bomb, Pawn Army).</RuleText>
                  <RuleText>• Mimic: Replicates the movement pattern of the piece that moved before it.</RuleText>
                  <RuleText>• Dancer: Achieving KS 1 grants 'The Dance': A free move forward or swap with an allied or enemy piece.</RuleText>
                  <RuleText>• Grappler: Can pick up adjacent units and launch them across the board (Range = Level).</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* VI. THE ROYAL GUARD */}
            <AccordionItem value="royalty">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VI. The Royal Guard</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Queen (Max Level 7)">
                  <RuleText>Invulnerability: At L7, the Queen cannot be captured by units below Level 8, unless they are Hero, Commander, or Infiltrator classes.</RuleText>
                  <RuleText>Sacrifice: Reaching L7 requires the immediate sacrifice of one allied Front Line unit.</RuleText>
                </SubRule>
                <SubRule title="The King">
                  <RuleText>L2: Movement range increases to 2 squares.</RuleText>
                  <RuleText>L5: Gains the Knight's L-shape movement.</RuleText>
                  <RuleText>Dominion: Every time the King levels up, all enemy Queens lose levels equal to the gain.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            {/* VII. THE WAR PATH (KILL STREAKS) */}
            <AccordionItem value="killstreaks">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VII. The War Path (Kill Streaks)</AccordionTrigger>
              <AccordionContent>
                <RuleText>Streaks are earned by capturing units in consecutive turns. Streaks reset if a turn ends without a capture.</RuleText>
                <RuleSection title="Milestones">
                  <RuleText>KS 1: Dance (Dancers only - Allows a free move forward or swap with an allied or enemy piece).</RuleText>
                  <RuleText>KS 2: Holy Shield (Archbishop - target ally becomes invulnerable until they move).</RuleText>
                  <RuleText>KS 3: Anvil Drop (Drop an impassable obstacle on any empty square).</RuleText>
                  <RuleText>KS 4: Resurrection (Resurrects a random captured ally to a random open space on the board at L1).</RuleText>
                  <RuleText>KS 5: Archer Snipe (Global targeting for Archers).</RuleText>
                  <RuleText>KS 6: Extra Turn (Take a second move immediately).</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* VIII. BOARD OBJECTS */}
            <AccordionItem value="objects">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">VIII. Board Objects</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Entities">
                  <SubRule title="Anvils">
                    <RuleText>Impassable blocks that occupy a square. They cannot be captured or jumped over (except with Phase Boots). They can be crushed/destroyed by self-destructs or pushed by level 4+ frontline units (or Battering Rams).</RuleText>
                  </SubRule>
                  <SubRule title="Shrooms 🍄">
                    <RuleText>Mystical fungi that spawn periodically. Moving onto a shroom consumes it, granting the unit +1 Level. For Myco Mages, shrooms also fuel their global Mushroomancy pool.</RuleText>
                  </SubRule>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* IX. STATUS EFFECTS */}
            <AccordionItem value="status">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">IX. Status Effects</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Active Afflictions">
                  <SubRule title="Poisoned">
                    <RuleText>A unit loses 1 Level at the end of their turn. If a Level 1 unit is poisoned, they become 'Exhausted'.</RuleText>
                  </SubRule>
                  <SubRule title="Exhausted">
                    <RuleText>The unit is too tired to move or act. They must wait 2 turns for the effect to wear off.</RuleText>
                  </SubRule>
                  <SubRule title="Frozen">
                    <RuleText>The unit is encased in ice and cannot move, capture, or be captured. Typically lasts 2 turns.</RuleText>
                  </SubRule>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            {/* X. DUNGEON MECHANICS */}
            <AccordionItem value="dungeon">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">X. Dungeon Survival</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Persistence: Damage, levels, and items carry over between floors.</RuleText>
                <RuleText>• Shrooms 🍄: Spawn every 5-10 turns. Consume for +1 Level and +1 Mana for Myco Mages.</RuleText>
                <RuleText>• Bosses: Every 10 floors features a unique entity (Hydra, Necromancer, Colossus, etc.) with custom passive traits.</RuleText>
                <RuleText>• Floor Collapse: If the dungeon enemy cannot move any pieces for 3 turns in a row, all of their remaining pieces self destruct, destroying your adjacent pieces and advancing you to the next floor.</RuleText>
              </AccordionContent>
            </AccordionItem>

            {/* XI. THE STACK (ORDER OF OPERATIONS) */}
            <AccordionItem value="stack">
              <AccordionTrigger className="text-sm font-bold uppercase hover:text-accent">XI. The Stack</AccordionTrigger>
              <AccordionContent>
                <RuleText>Game events resolve in the following strict order:</RuleText>
                <RuleText>1. Movement & Capture (Impact)</RuleText>
                <RuleText>2. Level Gain & Shroom Consumption</RuleText>
                <RuleText>3. Push-Back / Pull / Anvil Crushing</RuleText>
                <RuleText>4. Soul Link Synchronization</RuleText>
                <RuleText>5. Queen Sacrifice -> Rank Promotion -> KS Rewards</RuleText>
                <RuleText>6. Poison Damage & Status Clear</RuleText>
                <RuleText>7. Win Condition Check (Mate/Infiltration)</RuleText>
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
