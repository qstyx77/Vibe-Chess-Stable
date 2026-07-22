
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShroomIcon } from './IconLibrary';
import { cn } from '@/lib/utils';

export type MycoSpell = 'propagate' | 'teleport' | 'spore-bomb' | 'raise-mycelimen';

/** REDESIGNED 8-BIT ICONS (SCALED TO FILL 24x24 VIEWBOX) **/

const PixelSparkles = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Central Large Magic Cluster */}
    <rect x="10" y="4" width="4" height="4" />
    <rect x="8" y="8" width="8" height="8" />
    <rect x="10" y="16" width="4" height="4" />
    <rect x="6" y="10" width="4" height="4" />
    <rect x="14" y="10" width="4" height="4" />
    
    {/* Floating Magical Particles */}
    <rect x="2" y="2" width="4" height="4" />
    <rect x="18" y="2" width="4" height="4" />
    <rect x="2" y="18" width="4" height="4" />
    <rect x="18" y="18" width="4" height="4" />
    
    {/* Accents for depth */}
    <rect x="11" y="6" width="2" height="2" fill="white" fillOpacity="0.4" />
    <rect x="9" y="11" width="2" height="2" fill="white" fillOpacity="0.4" />
  </svg>
);

const PixelZap = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="14" y="0" width="8" height="4" />
    <rect x="12" y="4" width="8" height="4" />
    <rect x="10" y="8" width="8" height="4" />
    <rect x="4" y="12" width="18" height="4" />
    <rect x="8" y="16" width="8" height="4" />
    <rect x="6" y="20" width="6" height="4" />
  </svg>
);

const PixelBomb = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="8" y="4" width="8" height="4" />
    <rect x="12" y="0" width="4" height="4" fill="#FDE047" />
    <rect x="4" y="8" width="16" height="4" />
    <rect x="2" y="12" width="20" height="10" />
    <rect x="4" y="22" width="16" height="2" />
    <rect x="6" y="14" width="4" height="4" fill="white" fillOpacity="0.3" />
  </svg>
);

const PixelUserPlus = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="2" width="8" height="8" />
    <rect x="2" y="11" width="16" height="4" />
    <rect x="4" y="15" width="12" height="9" />
    {/* Large Plus Sign */}
    <rect x="19" y="10" width="4" height="12" fill="#10B981" />
    <rect x="15" y="14" width="12" height="4" fill="#10B981" />
  </svg>
);

const BigShroom = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="2" width="12" height="4" />
    <rect x="2" y="6" width="20" height="4" />
    <rect x="0" y="10" width="24" height="6" />
    <rect x="8" y="16" width="8" height="6" />
    <rect x="6" y="22" width="12" height="2" />
    <rect x="11" y="6" width="4" height="4" fill="white" />
    <rect x="4" y="12" width="4" height="4" fill="white" />
    <rect x="16" y="12" width="4" height="4" fill="white" />
  </svg>
);

interface MycoSpellMenuProps {
  isOpen: boolean;
  onSelectSpell: (spell: MycoSpell) => void;
  mana: number;
}

const spells: { id: MycoSpell, name: string, cost: number, description: string, icon: any }[] = [
  { 
    id: 'propagate', 
    name: 'Propagate', 
    cost: 1, 
    description: 'Spawn 5 random shrooms.',
    icon: <PixelSparkles className="w-20 h-20 text-primary" />
  },
  { 
    id: 'teleport', 
    name: 'Tele-portobello', 
    cost: 2, 
    description: 'Teleport ally to a shroom.',
    icon: <PixelZap className="w-20 h-20 text-secondary" />
  },
  { 
    id: 'spore-bomb', 
    name: 'Spore Bomb', 
    cost: 4, 
    description: 'Target shroom explodes.',
    icon: <PixelBomb className="w-20 h-20 text-destructive" />
  },
  { 
    id: 'raise-mycelimen', 
    name: 'Raise Myceli-Men', 
    cost: 6, 
    description: 'Turn all shrooms into Pawns.',
    icon: <PixelUserPlus className="w-20 h-20 text-accent" />
  },
];

export function MycoSpellMenu({ isOpen, onSelectSpell, mana }: MycoSpellMenuProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[450px] bg-card border-2 border-primary/50 font-pixel p-4">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-center gap-2">
              <ShroomIcon className="w-5 h-5 text-primary" />
              <DialogTitle className="text-primary text-center font-pixel uppercase text-base">Mushroomancy</DialogTitle>
              <ShroomIcon className="w-5 h-5 text-primary" />
          </div>
          <DialogDescription className="text-center text-muted-foreground font-pixel uppercase text-[12px]">
            Shroom Pool: {mana}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-4">
          {spells.map((spell) => {
            const canAfford = mana >= spell.cost;
            return (
              <Button
                key={spell.id}
                variant="outline"
                disabled={!canAfford}
                className={cn(
                  "h-40 flex flex-col items-center justify-center gap-2 border-2 transition-all relative group bg-black/40 p-2 text-center whitespace-normal",
                  canAfford ? "hover:bg-primary/10 hover:border-primary" : "opacity-40 grayscale cursor-not-allowed"
                )}
                onClick={() => onSelectSpell(spell.id)}
              >
                {/* Cost Overlay in Top Right */}
                <div className="absolute top-2 right-2 flex items-center justify-center">
                    <BigShroom className="w-12 h-12 text-primary opacity-30" />
                    <span className="absolute font-pixel text-[10px] text-white" style={{ textShadow: '1px 1px 0px black' }}>
                        {spell.cost}
                    </span>
                </div>

                <div className="flex items-center justify-center mb-1">
                    {spell.icon}
                </div>
                
                <div className="space-y-1">
                    <h3 className="font-pixel text-[10px] uppercase text-primary leading-tight">{spell.name}</h3>
                    <p className="text-[8px] text-muted-foreground leading-tight italic px-1">{spell.description}</p>
                </div>
              </Button>
            );
          })}
        </div>
        <div className="text-center pt-2">
            <Button variant="ghost" className="font-pixel text-[10px] uppercase h-8" onClick={() => onSelectSpell(null as any)}>Cancel Casting</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
