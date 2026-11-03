
'use client';

import React, { useState, useEffect } from 'react';
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
    VibeChessTitle, 
    PixelAnvil, 
    ShroomIcon, 
    PixelHydra,
    PixelNecromancer
} from './IconLibrary';
import { cn } from '@/lib/utils';
import { useUser, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { ItemSprite } from './ItemSprite';

interface BetaWelcomeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BetaWelcomeDialog({ isOpen, onOpenChange }: BetaWelcomeDialogProps) {
  const { user, userData } = useUser();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const firestore = getFirestore();

  const handleClose = () => {
    if (dontShowAgain && user) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { hideBetaWelcome: true });
    }
    onOpenChange(false);
  };

  const [headerIconsActive, setHeaderIconsActive] = useState(true);
  const [headerIconsOpacity, setHeaderIconsOpacity] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const cycle = () => {
      setTimeout(() => {
        setHeaderIconsOpacity(false);
        setTimeout(() => {
          setHeaderIconsActive(false);
          setTimeout(() => {
            setHeaderIconsActive(true);
            setHeaderIconsOpacity(true);
            cycle();
          }, 1500);
        }, 1200);
      }, 15000);
    };
    cycle();
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-4xl bg-black border-2 border-primary font-pixel p-0 overflow-hidden max-h-[95vh] flex flex-col shadow-[0_0_50px_rgba(var(--primary),0.3)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Welcome to Vibe Chess Closed Beta</DialogTitle>
          <DialogDescription>Essential information about game mechanics, economy, and beta rules.</DialogDescription>
        </DialogHeader>

        {/* 1:1 Lobby Header Recreation - Centered and Spaced */}
        <div className="pt-16 pb-14 px-6 border-b border-border/50 bg-black sticky top-0 z-20 overflow-visible">
            <div className="w-full flex items-center justify-center gap-3 overflow-visible"> 
               <div className={cn("w-16 h-16 flex items-center justify-center", headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
                  {headerIconsActive && (
                    <div className="h-12 w-12 shrink-0 animate-anvil-impact">
                      <PixelAnvil className="w-full h-full text-[#94A3B8] ascii-shader" />
                    </div>
                  )}
               </div>
               <VibeChessTitle className="h-12 md:h-16 w-auto overflow-visible" suffix="-welcome" /> 
               <div className={cn("w-16 h-16 flex items-center justify-center", headerIconsOpacity ? "opacity-100" : "opacity-0 transition-opacity duration-1000")}>
                  {headerIconsActive && (
                    <div className="h-12 w-12 shrink-0 animate-shroom-spring">
                      <ShroomIcon className="w-full h-full text-[#EF4444] ascii-shader" />
                    </div>
                  )}
               </div>
            </div> 
        </div>

        <ScrollArea className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-8 pb-10 px-1">
            
            {/* WELCOME SECTION */}
            <section className="space-y-4">
                <div className="text-[0.6rem] md:text-[0.65rem] leading-relaxed space-y-4 text-foreground/90 uppercase pt-2">
                    <p>Welcome to the Closed Beta of <span className="text-primary">VIBE CHESS</span>. You must create an account and log in to participate.</p>
                    <p className="text-accent">Closed Beta will cap the number of accounts at <span className="underline">200</span> to keep metrics and player communication manageable.</p>
                    <p>To ensure a balanced testing ground and a true simulation of the game’s economy, we have implemented the following rules for this phase:</p>
                </div>
            </section>

            {/* RULES GRID - Gemstone Palette */}
            <section className="space-y-4">
                <h2 className="text-[#38BDF8] text-[0.75rem] uppercase tracking-tighter">Phase 1 Protocols</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border-2 border-[#38BDF8]/40 bg-[#38BDF8]/5">
                        <p className="text-[#38BDF8] text-[0.65rem] mb-2 font-bold uppercase">Rank Parity</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">Every Hero is starting on equal footing. You begin your journey with a standard 1200 Elo Rating.</p>
                    </div>
                    <div className="p-4 border-2 border-[#C084FC]/40 bg-[#C084FC]/5">
                        <p className="text-[#C084FC] text-[0.65rem] mb-2 font-bold uppercase">Treasury Grant</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">To get the economy moving, your treasury has been granted 600 Gold. Use this wisely!</p>
                    </div>
                    <div className="p-4 border-2 border-destructive/40 bg-destructive/5">
                        <p className="text-destructive text-[0.65rem] mb-2 font-bold uppercase">Store Status</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">All real-currency functions are disabled. Mint, Exchange, and Special Unit purchases are greyed out.</p>
                    </div>
                    <div className="p-4 border-2 border-[#4ADE80]/40 bg-[#4ADE80]/5">
                        <p className="text-[#4ADE80] text-[0.65rem] mb-2 font-bold uppercase">Free Market</p>
                        <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">Merchant Stalls are fully operational. Trade, fight, and influence the economy via player stalls.</p>
                    </div>
                </div>
                <div className="p-3 bg-muted/10 border border-border/30 rounded-sm">
                    <p className="text-[0.55rem] text-muted-foreground uppercase leading-relaxed text-center italic">
                        Note that an account reset will occur before we move into Open Beta, at which point the full store functionality and permanent progression will be restored.
                    </p>
                </div>
            </section>

            {/* WHAT IS VIBE CHESS SECTION */}
            <section className="space-y-6">
                <h2 className="text-accent text-[0.75rem] uppercase tracking-tighter">What is VIBE CHESS?</h2>
                <div className="text-[0.65rem] leading-relaxed text-foreground/90 uppercase">
                    <p>Vibe Chess is a high-stakes, tactical strategy game that takes the classic foundation of Chess and injects it with RPG-style leveling, unique units, and a powerful equipment system.</p>
                </div>
                
                {/* Visual Showcase Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-2">
                    <div className="flex flex-col items-center gap-3 p-4 bg-black border-2 border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                        <div className="h-10 w-10 relative flex items-center justify-center">
                             <ChessPieceDisplay piece={{ id: 'show-hero', type: 'hero', color: 'white', level: 1, hasMoved: false }} isMini />
                             <span className="absolute font-pixel text-[#4ade80] text-sm animate-[level-float_2s_infinite] drop-shadow-[0_0_2px_black]">+1</span>
                        </div>
                        <div className="text-center">
                            <p className="text-[0.55rem] text-primary font-bold uppercase">Level Up</p>
                            <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase">Captures grant levels and skills.</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-3 p-4 bg-black border-2 border-destructive/20 shadow-[0_0_15px_rgba(var(--destructive),0.1)]">
                        <div className="h-10 w-full flex items-center justify-center gap-2">
                             <div className="h-10 w-10 text-[#10B981] animate-hydra-idle">
                                <PixelHydra className="w-full h-full ascii-shader" />
                             </div>
                             <div className="h-10 w-10 text-[#8B5CF6] animate-necro-hover">
                                <PixelNecromancer className="w-full h-full ascii-shader" />
                             </div>
                        </div>
                        <div className="text-center">
                            <p className="text-[0.55rem] text-destructive font-bold uppercase">Boss Foes</p>
                            <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase">Face world-warping entities.</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-3 p-4 bg-black border-2 border-accent/20 shadow-[0_0_15px_rgba(var(--accent),0.1)] overflow-hidden">
                        <div className="h-10 w-10 flex items-center justify-center">
                             <div className="h-7 w-7 text-[#94A3B8] animate-[anvil-impact_2s_infinite]">
                                <PixelAnvil className="w-full h-full ascii-shader" />
                             </div>
                        </div>
                        <div className="text-center">
                            <p className="text-[0.55rem] text-accent font-bold uppercase">Killstreaks</p>
                            <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase">Chain kills for global spells.</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-3 p-4 bg-black border-2 border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                        <div className="h-10 w-full flex items-center justify-center gap-3">
                             <ItemSprite type="wind_sword" size={24} />
                             <ItemSprite type="crossbow" size={24} />
                             <ItemSprite type="obsidian_blade" size={24} />
                        </div>
                        <div className="text-center">
                            <p className="text-[0.55rem] text-yellow-500 font-bold uppercase">Equipment</p>
                            <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase">Carry items found in the Dungeon.</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3 bg-muted/5 p-4 border border-border/20">
                    <div className="text-[0.55rem] uppercase leading-tight"><span className="text-foreground font-bold">Evolution:</span> When your piece captures a foe, it gains Levels and new abilities.</div>
                    <div className="text-[0.55rem] uppercase leading-tight"><span className="text-foreground font-bold">Equipment:</span> Units can carry Items found in the Dungeon or bought from other players.</div>
                    <div className="text-[0.55rem] uppercase leading-tight"><span className="text-foreground font-bold">Killstreaks:</span> Consecutive turns of combat allow you to alter the board state globally.</div>
                </div>
            </section>

            {/* GAME MODES SECTION */}
            <section className="space-y-4">
                <h2 className="text-[#C084FC] text-[0.75rem] uppercase tracking-tighter">Game Modes</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <div className="text-[0.65rem] text-primary font-bold uppercase flex items-center gap-2">
                           <div className="w-1.5 h-1.5 bg-primary" /> Local Lobby
                        </div>
                        <p className="text-[0.45rem] text-muted-foreground uppercase pl-3.5">Play against an A.I. or a friend on the same device.</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[0.65rem] text-accent font-bold uppercase flex items-center gap-2">
                           <div className="w-1.5 h-1.5 bg-accent" /> Online Play
                        </div>
                        <p className="text-[0.45rem] text-muted-foreground uppercase pl-3.5">Duel friends or climb the Ranked Leaderboard to increase your ELO and "Attunement". Attunement determines your army's total item limit; higher ranks unlock more slots for powerful equipment builds.</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[0.65rem] text-yellow-500 font-bold uppercase flex items-center gap-2">
                           <div className="w-1.5 h-1.5 bg-yellow-500" /> Arena
                        </div>
                        <p className="text-[0.45rem] text-muted-foreground uppercase pl-3.5">8-player elimination tournament. 100g buy-in / 500g prize.</p>
                    </div>
                    <div className="space-y-1">
                        <div className="text-[0.65rem] text-[#4ADE80] font-bold uppercase flex items-center gap-2">
                           <div className="w-1.5 h-1.5 bg-[#4ADE80]" /> The Dungeon
                        </div>
                        <p className="text-[0.45rem] text-muted-foreground uppercase pl-3.5">Massive 50-floor PvE crawl against boss entities and item drops.</p>
                    </div>
                </div>
            </section>

            <section className="pt-6 border-t border-border/30">
                <p className="text-[0.6rem] text-center italic text-foreground uppercase leading-relaxed font-bold tracking-widest">
                    Tactical positioning meets unit growth. A single Pawn can become a legendary Hero.
                </p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 bg-[#0a0a0a] border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-6">
          {user ? (
            <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setDontShowAgain(!dontShowAgain)}>
                <Checkbox 
                    id="dontShow" 
                    checked={dontShowAgain} 
                    onCheckedChange={(checked) => setDontShowAgain(!!checked)}
                    className="border-primary data-[state=checked]:bg-primary h-5 w-5 rounded-none"
                />
                <Label htmlFor="dontShow" className="text-[0.5rem] uppercase font-pixel cursor-pointer select-none group-hover:text-primary transition-colors">Don't show this again</Label>
            </div>
          ) : (
            <p className="text-[0.4rem] text-muted-foreground uppercase">Login to save your preferences</p>
          )}
          <Button 
            onClick={handleClose} 
            className="w-full sm:w-auto h-12 text-[0.7rem] uppercase font-pixel bg-primary hover:bg-primary/80 text-primary-foreground px-10 rounded-none shadow-[4px_4px_0_rgba(var(--primary),0.3)]"
          >
            Enter Lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
