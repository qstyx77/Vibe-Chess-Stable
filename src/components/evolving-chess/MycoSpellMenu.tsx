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
    icon: <Sparkles className="w-8 h-8 text-primary" />
  },
  { 
    id: 'teleport', 
    name: 'Tele-portobello', 
    cost: 2, 
    description: 'Teleport ally to a shroom.',
    icon: <Zap className="w-8 h-8 text-secondary" />
  },
  { 
    id: 'spore-bomb', 
    name: 'Spore Bomb', 
    cost: 4, 
    description: 'Target shroom explodes.',
    icon: <Bomb className="w-8 h-8 text-destructive" />
  },
  { 
    id: 'raise-mycelimen', 
    name: 'Raise Myceli-Men', 
    cost: 6, 
    description: 'Turn all shrooms into Pawns.',
    icon: <UserPlus className="w-8 h-8 text-accent" />
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
                  "h-36 flex flex-col items-center justify-center gap-2 border-2 transition-all group bg-black/40 p-2 text-center whitespace-normal",
                  canAfford ? "hover:bg-primary/10 hover:border-primary" : "opacity-40 grayscale cursor-not-allowed"
                )}
                onClick={() => onSelectSpell(spell.id)}
              >
                <div className="relative">
                    {spell.icon}
                    <div className="absolute -top-1 -right-4 bg-primary text-primary-foreground font-pixel text-[8px] px-1 py-0.5 rounded-none border border-black shadow-md">
                        {spell.cost}
                    </div>
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
