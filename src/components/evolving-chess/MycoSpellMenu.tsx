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
import { ShroomIcon, ExplosionIcon, PrayerHandsIcon } from './IconLibrary';
import { Sparkles, Zap, Bomb, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MycoSpell = 'propagate' | 'teleport' | 'spore-bomb' | 'raise-mycelimen';

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
    icon: <Sparkles className="w-10 h-10 text-primary" />
  },
  { 
    id: 'teleport', 
    name: 'Tele-portobello', 
    cost: 2, 
    description: 'Teleport ally to a shroom.',
    icon: <Zap className="w-10 h-10 text-secondary" />
  },
  { 
    id: 'spore-bomb', 
    name: 'Spore Bomb', 
    cost: 4, 
    description: 'Target shroom explodes.',
    icon: <Bomb className="w-10 h-10 text-destructive" />
  },
  { 
    id: 'raise-mycelimen', 
    name: 'Raise Myceli-Men', 
    cost: 6, 
    description: 'Turn all shrooms into Pawns.',
    icon: <UserPlus className="w-10 h-10 text-accent" />
  },
];

export function MycoSpellMenu({ isOpen, onSelectSpell, mana }: MycoSpellMenuProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px] bg-card border-2 border-primary/50 font-pixel">
        <DialogHeader>
          <div className="flex items-center justify-center gap-2 mb-2">
              <ShroomIcon className="w-6 h-6 text-primary" />
              <DialogTitle className="text-primary text-center font-pixel uppercase text-sm">Myco Grimoire</DialogTitle>
              <ShroomIcon className="w-6 h-6 text-primary" />
          </div>
          <DialogDescription className="text-center text-muted-foreground font-pixel uppercase text-[10px]">
            Your Pool: {mana} Allied Shroom Essence
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-6">
          {spells.map((spell) => {
            const canAfford = mana >= spell.cost;
            return (
              <Button
                key={spell.id}
                variant="outline"
                disabled={!canAfford}
                className={cn(
                  "h-48 flex flex-col items-center justify-center gap-3 border-2 transition-all group bg-black/40 p-4 text-center",
                  canAfford ? "hover:bg-primary/10 hover:border-primary" : "opacity-40 grayscale cursor-not-allowed"
                )}
                onClick={() => onSelectSpell(spell.id)}
              >
                <div className="relative">
                    {spell.icon}
                    <div className="absolute -top-2 -right-6 bg-primary text-primary-foreground font-pixel text-[10px] px-1.5 py-0.5 rounded-none border border-black shadow-md">
                        {spell.cost}
                    </div>
                </div>
                <div>
                    <h3 className="font-pixel text-[11px] uppercase text-primary mb-1">{spell.name}</h3>
                    <p className="text-[9px] text-muted-foreground leading-tight italic">{spell.description}</p>
                </div>
              </Button>
            );
          })}
        </div>
        <div className="text-center">
            <Button variant="ghost" className="font-pixel text-[8px] uppercase" onClick={() => onSelectSpell(null as any)}>Cancel Casting</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
