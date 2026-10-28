'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
    DungeonTitle,
    PixelHydra,
    PixelNecromancer,
    PixelWraith
} from './IconLibrary';
import { useUser, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';

interface DungeonWelcomeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DungeonWelcomeDialog({ isOpen, onOpenChange }: DungeonWelcomeDialogProps) {
  const { user } = useUser();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const firestore = getFirestore();

  const handleClose = () => {
    if (dontShowAgain && user) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { hideDungeonWelcome: true });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-4xl bg-black border-2 border-primary font-pixel p-0 overflow-hidden max-h-[95vh] flex flex-col shadow-[0_0_50px_rgba(var(--primary),0.3)]">
        <DialogHeader className="sr-only">
          <DialogTitle>The Dungeon Crawl</DialogTitle>
          <DialogDescription>Essential information about dungeon exploration, bosses, and survival.</DialogDescription>
        </DialogHeader>

        {/* 1:1 Lobby Header Style - Centered and Spaced */}
        <div className="pt-10 pb-4 px-6 border-b border-border/50 bg-black sticky top-0 z-20 overflow-visible">
            <div className="w-full flex items-center justify-center gap-3 overflow-visible"> 
               <div className="h-10 w-10 shrink-0 animate-hydra-idle text-[#10B981]">
                  <PixelHydra className="w-full h-full ascii-shader" />
               </div>
               <DungeonTitle className="h-12 md:h-16 w-auto overflow-visible" suffix="-dungeon" /> 
               <div className="h-10 w-10 shrink-0 animate-necro-hover text-[#8B5CF6]">
                  <PixelNecromancer className="w-full h-full ascii-shader" />
               </div>
            </div> 
        </div>

        <ScrollArea className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-8 pb-10 px-1">
            
            <section className="space-y-4">
                <div className="text-[0.6rem] md:text-[0.65rem] leading-relaxed space-y-4 text-foreground/90 uppercase pt-2">
                    <p>Welcome to the <span className="text-primary">Dungeon Crawl</span>. This is a 50-floor PvE challenge where your army evolves through constant battle.</p>
                    <p>Unlike standard matches, progress here is <span className="text-accent underline">persistent</span>. Your unit levels, items, and army composition are saved between sessions. Use this to build an unstoppable force.</p>
                </div>
            </section>

            {/* MECHANICS LIST - Gemstone Palette */}
            <section className="space-y-4">
                <h2 className="text-[#38BDF8] text-[0.75rem] uppercase tracking-tighter">Dungeon Protocols</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border-2 border-[#38BDF8]/40 bg-[#38BDF8]/5">
                        <p className="text-[#38BDF8] text-[0.65rem] mb-2 font-bold uppercase">Unit Unlocks</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">Defeating major bosses every 10 floors permanently unlocks elite units (Myco Mage, Grappler, Mimic, Dancer) for your army.</p>
                    </div>
                    <div className="p-4 border-2 border-[#C084FC]/40 bg-[#C084FC]/5">
                        <p className="text-[#C084FC] text-[0.65rem] mb-2 font-bold uppercase">Floor Collapse</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">If the Dungeon AI cannot make a legal move for 3 turns, the floor collapses. Foes self-destruct, and you advance automatically.</p>
                    </div>
                    <div className="p-4 border-2 border-destructive/40 bg-destructive/5 relative overflow-hidden">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-destructive text-[0.65rem] mb-2 font-bold uppercase">Spectral Balance</p>
                                <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">Beware the Wraiths. Overpowered Royals (Level 5+) draw them from the veil to drain your soul and steal levels.</p>
                            </div>
                            <div className="h-10 w-10 text-[#22D3EE] animate-pulse shrink-0">
                                <PixelWraith className="w-full h-full ascii-shader" />
                            </div>
                        </div>
                    </div>
                    <div className="p-4 border-2 border-[#4ADE80]/40 bg-[#4ADE80]/5">
                        <p className="text-[#4ADE80] text-[0.65rem] mb-2 font-bold uppercase">Persistence & Loot</p>
                        <div className="space-y-2">
                            <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">Items drop from defeated Bosses. Your odds scale with technical mastery:</p>
                            <ul className="text-[0.45rem] text-foreground/70 list-disc pl-4 uppercase space-y-1">
                                <li>Base Rates: 12% Common | 6% Uncommon | 3% Rare</li>
                                <li>Depth Bonus: +1% Drop Rate per 10 floors reached</li>
                                <li>Luck Bonus: +1% Drop Rate per equipped 'Clover' item</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section className="pt-6 border-t border-border/30">
                <p className="text-[0.6rem] text-center italic text-foreground uppercase leading-relaxed font-bold tracking-widest">
                    Descending to floor 50 is a journey of tactics and growth. Protect your King.
                </p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 bg-[#0a0a0a] border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-6">
          {user ? (
            <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setDontShowAgain(!dontShowAgain)}>
                <Checkbox 
                    id="dontShowDungeon" 
                    checked={dontShowAgain} 
                    onCheckedChange={(checked) => setDontShowAgain(!!checked)}
                    className="border-primary data-[state=checked]:bg-primary h-5 w-5 rounded-none"
                />
                <Label htmlFor="dontShowDungeon" className="text-[0.5rem] uppercase font-pixel cursor-pointer select-none group-hover:text-primary transition-colors">Don't show this again</Label>
            </div>
          ) : (
            <p className="text-[0.4rem] text-muted-foreground uppercase">Login to save your preferences</p>
          )}
          <Button 
            onClick={handleClose} 
            className="w-full sm:w-auto h-12 text-[0.7rem] uppercase font-pixel bg-primary hover:bg-primary/80 text-primary-foreground px-10 rounded-none shadow-[4px_4px_0_rgba(var(--primary),0.3)]"
          >
            Enter Dungeon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
