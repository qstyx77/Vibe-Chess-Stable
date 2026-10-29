'use client';

import React from 'react';
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
import { PixelTome } from './IconLibrary';

interface RulesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const RuleSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="mb-4">
    <h4 className="font-pixel text-[0.65rem] text-primary uppercase mb-2 tracking-tighter">{title}</h4>
    <div className="space-y-2">{children}</div>
  </div>
);

const RuleText = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.8rem] font-medium text-foreground/90 leading-relaxed pl-2 border-l-2 border-primary/30">
    {children}
  </p>
);

const SubRule = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="ml-2 mb-2">
    <p className="text-[0.75rem] font-bold text-accent uppercase mb-1">{title}</p>
    <div className="text-[0.8rem] text-foreground/80 pl-2">{children}</div>
  </div>
);

export function RulesDialog({ isOpen, onOpenChange }: RulesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-black border-2 border-primary text-foreground max-h-[95vh] font-sans overflow-hidden flex flex-col p-0 shadow-[0_0_50px_rgba(var(--primary),0.3)] rounded-none">
        <DialogHeader className="p-8 pb-4 shrink-0 border-b border-border/50 flex flex-col items-center">
          <div className="flex items-center justify-center gap-4 mb-2">
             <PixelTome className="h-10 w-10 ascii-shader" />
             <DialogTitle className="text-primary text-center text-2xl font-medium uppercase font-pixel tracking-tighter">
                Rulebook 
             </DialogTitle>
             <PixelTome className="h-10 w-10 ascii-shader" />
          </div>
          <DialogTitle className="sr-only">
            Comprehensive Game Rules
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-6 font-pixel uppercase">
          <Accordion type="single" collapsible className="w-full pb-10">
            
            <AccordionItem value="overview" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">I. Overview & Modes</AccordionTrigger>
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

            <AccordionItem value="leveling" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">II. Leveling & Experience</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Experience Values">
                  <RuleText>Units gain levels immediately upon capturing an opponent:</RuleText>
                  <RuleText>• Capture Front Line (Pawn, Dancer, etc.): +1 Level</RuleText>
                  <RuleText>• Capture Cavalry/Clergy (Knight, Bishop, etc.): +2 Levels</RuleText>
                  <RuleText>• Capture Queen: +3 Levels</RuleText>
                  <RuleText>• Consume Shroom 🍄: +1 Level</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="specialized" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">III. Specialized Units</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Combat Specialists">
                  <SubRule title="First Blood">
                    <RuleText>The first player to capture an enemy unit in a match triggers First Blood. This grants the immediate opportunity to promote any Level 1 Front Line unit into a Commander.</RuleText>
                  </SubRule>
                  <SubRule title="Commander">
                    <RuleText>An elite front-line unit born from First Blood. They gain 'Rallying Cry' on capture (leveling up other pawns) and promoted into a Hero upon reaching the back rank. They are specialized 'Queen Hunters'.</RuleText>
                  </SubRule>
                  <SubRule title="Hero">
                    <RuleText>The pinnacle of the Commander's path. They trigger a global 'Heroic Rally' on capture, leveling up all allied units on the board.</RuleText>
                  </SubRule>
                  <SubRule title="Infiltrator">
                    <RuleText>A deadly assassin that moves and captures forward or diagonally. Captures by an Infiltrator 'Obliterate' the target, removing it from the game entirely (no resurrection). Reaching the back rank results in an instant win.</RuleText>
                  </SubRule>
                  <SubRule title="The Mimic">
                    <RuleText>Mimics replicate the movement pattern and skills of the absolute last piece that moved globally, scaled by the Mimic's current level. Special items allow Mimics to replicate equipment from specific history tracks.</RuleText>
                  </SubRule>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pieces" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">IV. Skill Tree</AccordionTrigger>
              <AccordionContent>
                <SubRule title="The Front Line (Pawn, Dancer, Mimic, Grappler, Commander, Myco Mage, Infiltrator)">
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
                  <RuleText>L3: Immunity: Cannot be captured by any Frontline units.</RuleText>
                  <RuleText>L4: Swap: Can trade places with an allied Knight/Hero/Archer.</RuleText>
                  <RuleText>L5: Faith: 50% chance to convert adjacent enemies to your side after moving.</RuleText>
                </SubRule>
                <SubRule title="The Fortress (Rook, Palace)">
                  <RuleText>L4: Resurrection Call: Capturing a unit triggers a resurrection of your strongest fallen ally at L1 to a random, adjacent space.</RuleText>
                </SubRule>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="unique" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">V. Elite Unlocks</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Ranked Unlocks">
                  <RuleText>• Archbishop (1500 Elo): Elite Clergy. Achieving KS 2 grants a Holy Shield to an ally.</RuleText>
                  <RuleText>• Palace (1800 Elo): Elite Fortress. Resurrects units at their original level. Castling levels up the King.</RuleText>
                  <RuleText>• Archer (2100 Elo): Elite Cavalry. KS 5 triggers Snipe: Instantly destroy any non-royal unit Level ≤ Archer.</RuleText>
                </RuleSection>
                <RuleSection title="Dungeon Unlocks">
                  <RuleText>• Myco Mage: Consumes shroom mana for global spells (Teleport, Spore Bomb, Pawn Army).</RuleText>
                  <RuleText>• Mimic: Replicates the movement pattern and item of the absolute last piece that moved (if itemless).</RuleText>
                  <RuleText>• Dancer: Achieving KS 1 grants 'The Dance': A free move forward or swap with an allied or enemy piece.</RuleText>
                  <RuleText>• Grappler: Can pick up adjacent units and launch them across the board (Range = Level).</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="royalty" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">VI. The Royal Guard</AccordionTrigger>
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

            <AccordionItem value="killstreaks" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">VII. The War Path</AccordionTrigger>
              <AccordionContent>
                <RuleText>Streaks are earned by capturing units in consecutive turns. Streaks reset if a turn ends without a capture.</RuleText>
                <RuleSection title="Milestones">
                  <RuleText>KS 1: Dance (Dancers only - Free move or swap).</RuleText>
                  <RuleText>KS 2: Holy Shield (Archbishop - target ally becomes invulnerable until they move).</RuleText>
                  <RuleText>KS 3: Anvil Drop (Drop an impassable obstacle on any empty square).</RuleText>
                  <RuleText>KS 4: Resurrection (Resurrects random captured ally at L1).</RuleText>
                  <RuleText>KS 5: Archer Snipe (Global targeting for Archers).</RuleText>
                  <RuleText>KS 6: Extra Turn (Take a second move immediately).</RuleText>
                  <RuleText>KS 8: Conquest Victory (Requires King's Conquest item).</RuleText>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="objects" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">VIII. Board Objects</AccordionTrigger>
              <AccordionContent>
                <RuleSection title="Entities">
                  <SubRule title="Anvils">
                    <RuleText>Impassable blocks. Can be pushed by level 4+ frontline units. Units crushed by a moving anvil are obliterated.</RuleText>
                  </SubRule>
                  <SubRule title="Shrooms 🍄">
                    <RuleText>Fungi that spawn periodically. Consuming a shroom grants +1 Level. For Myco Mages, shrooms also fuel their mana pool.</RuleText>
                  </SubRule>
                </RuleSection>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dungeon" className="border-primary/20">
              <AccordionTrigger className="text-[0.65rem] font-bold uppercase hover:text-accent">IX. Dungeon Survival</AccordionTrigger>
              <AccordionContent>
                <RuleText>• Persistence: Damage, levels, and items carry over between floors.</RuleText>
                <SubRule title="The Wraith">
                  <RuleText>• Manifestation: Spawned by high-level Royal presence (Level 5+).</RuleText>
                  <RuleText>• Soul Drain: They target the highest-level Royals, stealing 1 Level on impact.</RuleText>
                </SubRule>
                <RuleText>• Floor Collapse: If the enemy cannot move for 3 turns, the floor self-destructs and you advance.</RuleText>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </ScrollArea>
        
        <div className="p-6 bg-muted/10 border-t border-border/50 shrink-0">
          <DialogClose asChild>
            <Button type="button" className="w-full h-12 text-[0.7rem] uppercase font-pixel bg-primary hover:bg-primary/80 text-primary-foreground rounded-none shadow-[4px_4px_0_rgba(var(--primary),0.3)]">
              Return to Battle
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
