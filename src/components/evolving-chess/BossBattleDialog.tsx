'use client';

import React, { useState, useMemo } from 'react';
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
    PixelHydra,
    PixelNecromancer,
    PixelColossus,
    PixelMirage,
    PixelVoidEntity
} from './IconLibrary';
import { cn } from '@/lib/utils';
import { useUser, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { ITEM_METADATA } from '@/types';

interface BossMetadata {
    name: string;
    floor: number;
    icon: React.ReactNode;
    abilities: { title: string; desc: string }[];
    flavor: string;
    rarityColor: string;
}

const BOSS_DATA: Record<number, BossMetadata> = {
    10: {
        name: "THE HYDRA",
        floor: 10,
        icon: <div className="h-20 w-20 text-[#10B981] animate-hydra-idle"><PixelHydra className="w-full h-full ascii-shader" /></div>,
        rarityColor: "#10B981",
        abilities: [
            { title: "Hydra Split", desc: "When the Hydra is captured or sniped, its severed heads regrow into two Level 2 Knights on adjacent squares." },
            { title: "Regenerative Link", desc: "So long as any head remains, the guardian of the shallow deeps persists." }
        ],
        flavor: "A multi-headed guardian bound to the upper caves. It thrives on the energy of those who attempt to sever its connection to the surface."
    },
    20: {
        name: "THE NECROMANCER",
        floor: 20,
        icon: <div className="h-20 w-20 text-[#8B5CF6] animate-necro-hover"><PixelNecromancer className="w-full h-full ascii-shader" /></div>,
        rarityColor: "#8B5CF6",
        abilities: [
            { title: "Necromancy", desc: "Every 5 turns, the Necromancer raises a random fallen servant from the dungeon graveyard at Level 1." },
            { title: "Soul Shield", desc: "Protected by a phalanx of undead pawns that must be cleared to reach the master." }
        ],
        flavor: "Architect of the eternal graveyard. He harvests the tactical errors of travelers to build his tireless legion."
    },
    30: {
        name: "THE COLOSSUS",
        floor: 30,
        icon: <div className="h-20 w-24 text-[#64748B] animate-colossus-sleep-breath"><PixelColossus className="w-full h-full ascii-shader" /></div>,
        rarityColor: "#64748B",
        abilities: [
            { title: "Massive Entity", desc: "Occupies a full 2x2 area of the board. Vulnerable to Check and Mate across its entire footprint." },
            { title: "Iron Guard", desc: "The Colossus is invulnerable to all capture attempts until its perimeter guards are vanquished." },
            { title: "Crushing Stride", desc: "Moves 2 squares. Obliterates every unit and item in its 2x2 landing area." }
        ],
        flavor: "A monument of stone and masonry brought to life by ancient machinery. It does not move for the world; the world moves for it."
    },
    40: {
        name: "THE MIRAGE",
        floor: 40,
        icon: <div className="h-20 w-20 text-[#38BDF8] animate-mirage-shimmer"><PixelMirage className="w-full h-full ascii-shader" /></div>,
        rarityColor: "#38BDF8",
        abilities: [
            { title: "Light Refraction", desc: "Whenever an enemy unit moves adjacent to the Mirage, it teleports to a safe, distant square." },
            { title: "Prismatic Decoys", desc: "Spawns alongside mirrored duplicates. Striking a decoy results in immediate exhaustion." }
        ],
        flavor: "A shimmer in the humid air of the deep vaults. To fight the Mirage is to fight your own reflection in a shattered mirror."
    },
    50: {
        name: "THE VOID ENTITY",
        floor: 50,
        icon: <div className="h-24 w-24 text-[#4338CA] animate-void-vibe"><PixelVoidEntity className="w-full h-full animate-void-spin animate-void-color-cycle" /></div>,
        rarityColor: "#4338CA",
        abilities: [
            { title: "Void Shield", desc: "Protected by a permanent Holy Shield that regenerates instantly." },
            { title: "Singularity Pulse", desc: "At the start of its turn, it pulls distant foes closer and blasts adjacent ones, inflicting Poison and Exhaustion." },
            { title: "Time Lock", desc: "Capturing a unit freezes all adjacent enemy units for 2 turns." },
            { title: "The End", desc: "If the Void Entity breaches your back rank, reality collapses and the game is lost immediately." }
        ],
        flavor: "The final silence. A rupture in the fabric of the dungeon itself, seeking to consume every tactical thread of the upper world."
    }
};

const BossTitle = ({ text, suffix }: { text: string, suffix: string }) => (
    <svg viewBox="0 0 280 40" className="h-10 md:h-12 w-auto animate-title-shimmer" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={`boss-shader-${suffix}`} x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1" height="1" fill="white" />
        </pattern>
        <mask id={`boss-mask-${suffix}`}>
          <rect x="0" y="0" width="280" height="40" fill={`url(#boss-shader-${suffix})`} />
        </mask>
      </defs>
      <g mask={`url(#boss-mask-${suffix})`}>
         <text 
            x="50%" 
            y="70%" 
            textAnchor="middle" 
            className="font-pixel text-[24px] fill-primary uppercase tracking-tighter"
            style={{ fontFamily: 'var(--font-press-start-2p)' }}
         >
            {text}
         </text>
      </g>
    </svg>
);

interface BossBattleDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  floor: number;
}

export function BossBattleDialog({ isOpen, onOpenChange, floor }: BossBattleDialogProps) {
  const { user, userData } = useUser();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const firestore = getFirestore();

  const data = BOSS_DATA[floor];

  const dropRates = useMemo(() => {
    // Calculate clover bonus from persistent dungeon state
    let cloverCount = 0;
    if (userData?.dungeonState?.board) {
        cloverCount = (userData.dungeonState.board as any[]).filter(sq => sq.piece?.color === 'white' && sq.piece?.heldItem === 'clover').length;
    }
    
    // Depth bonus: +1% per 10 floors
    const depthBonus = Math.floor(floor / 10) - 1;
    const totalBonus = depthBonus + cloverCount;
    
    return {
        common: 12 + totalBonus,
        uncommon: 6 + totalBonus,
        rare: 3 + totalBonus,
        cloverCount,
        depthBonus
    };
  }, [floor, userData]);

  const handleClose = () => {
    if (dontShowAgain && user) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { [`hideBossDialog_${floor}`]: true });
    }
    onOpenChange(false);
  };

  if (!data) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-3xl bg-black border-2 border-destructive font-pixel p-0 overflow-hidden max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(239,68,68,0.3)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Boss Encounter: {data.name}</DialogTitle>
          <DialogDescription>Abilities and drop rates for {data.name}.</DialogDescription>
        </DialogHeader>

        <div className="pt-10 pb-6 px-6 border-b border-destructive/30 bg-black flex flex-col items-center gap-4">
            <BossTitle text={data.name} suffix={data.name.replace(/\s/g, '-')} />
            {data.icon}
        </div>

        <ScrollArea className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6 pb-10">
            
            {/* LORE SECTION */}
            <section className="p-4 bg-muted/5 border border-border/20 italic">
                <p className="text-[0.55rem] md:text-[0.6rem] text-foreground/80 leading-relaxed text-center uppercase">
                    "{data.flavor}"
                </p>
            </section>

            {/* ABILITIES SECTION */}
            <section className="space-y-3">
                <h2 className="text-primary text-[0.7rem] uppercase tracking-tighter flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary" /> Master Abilities
                </h2>
                <div className="grid grid-cols-1 gap-3">
                    {data.abilities.map((abil, idx) => (
                        <div key={idx} className="p-3 border border-primary/20 bg-primary/5">
                            <p className="text-primary text-[0.6rem] mb-1 font-bold uppercase">{abil.title}</p>
                            <p className="text-[0.5rem] text-muted-foreground uppercase leading-tight">{abil.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* LOOT SECTION */}
            <section className="space-y-3">
                <h2 className="text-yellow-500 text-[0.7rem] uppercase tracking-tighter flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-500" /> Calculated Drop Rates
                </h2>
                <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 border border-slate-700 bg-black text-center">
                        <p className="text-[0.45rem] text-slate-400 uppercase mb-1">Common</p>
                        <p className="text-sm text-white font-bold">{dropRates.common}%</p>
                    </div>
                    <div className="p-3 border border-[#4ade80] bg-[#4ade80]/5 text-center">
                        <p className="text-[0.45rem] text-[#4ade80] uppercase mb-1">Uncommon</p>
                        <p className="text-sm text-white font-bold">{dropRates.uncommon}%</p>
                    </div>
                    <div className="p-3 border border-purple-500 bg-purple-500/5 text-center">
                        <p className="text-[0.45rem] text-purple-400 uppercase mb-1">Rare</p>
                        <p className="text-sm text-white font-bold">{dropRates.rare}%</p>
                    </div>
                </div>
                <div className="p-2 bg-muted/10 border border-border/20 text-center space-y-1">
                    <p className="text-[0.45rem] text-muted-foreground uppercase">
                        Current Bonuses: +{dropRates.depthBonus}% Depth | +{dropRates.cloverCount}% Luck
                    </p>
                    <p className="text-[0.4rem] text-muted-foreground/70 uppercase leading-tight">
                        Depth Bonus: +1% per 10 floors | Luck Bonus: +1% per equipped Clover 🍀
                    </p>
                </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 bg-[#0a0a0a] border-t border-destructive/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setDontShowAgain(!dontShowAgain)}>
              <Checkbox 
                  id="dontShowBoss" 
                  checked={dontShowAgain} 
                  onCheckedChange={(checked) => setDontShowAgain(!!checked)}
                  className="border-destructive data-[state=checked]:bg-destructive h-5 w-5 rounded-none"
              />
              <Label htmlFor="dontShowBoss" className="text-[0.5rem] uppercase font-pixel cursor-pointer select-none group-hover:text-destructive transition-colors">Don't show for this Boss again</Label>
          </div>
          <Button 
            onClick={handleClose} 
            variant="destructive"
            className="w-full sm:w-auto h-10 text-[0.6rem] uppercase font-pixel rounded-none"
          >
            Engage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
