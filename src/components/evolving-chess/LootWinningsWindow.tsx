'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Package, Trophy } from 'lucide-react';
import { ItemSprite } from './ItemSprite';
import { ITEM_METADATA, type InventoryItemType } from '@/types';
import { cn } from '@/lib/utils';

interface LootWinningsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  loot: InventoryItemType[];
  floor: number;
}

export function LootWinningsWindow({ isOpen, onClose, loot, floor }: LootWinningsWindowProps) {
  const hasLoot = loot.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md bg-black border-4 border-primary font-pixel p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-primary/10 border-b-4 border-primary">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Trophy className="h-8 w-8 text-yellow-500 animate-bounce" />
            <DialogTitle className="text-xl text-white uppercase tracking-tighter text-center">
              BOSS VANQUISHED!
            </DialogTitle>
            <Trophy className="h-8 w-8 text-yellow-500 animate-bounce" />
          </div>
          <DialogDescription className="text-center text-[0.7rem] text-primary-foreground font-bold uppercase">
            Floor {floor} Cleared
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="relative min-h-[120px] flex flex-col items-center justify-center bg-muted/10 border-2 border-dashed border-primary/30 p-4">
             {/* Magic Beam Effect Simulation */}
             <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent pointer-events-none" />
             
             {hasLoot ? (
                <div className="grid grid-cols-3 gap-4 w-full relative z-10">
                   {loot.map((item, idx) => {
                       const meta = ITEM_METADATA[item];
                       const rarityCol = {
                           common: "border-slate-500 text-slate-300",
                           uncommon: "border-green-500 text-green-400",
                           rare: "border-purple-500 text-purple-400"
                       }[meta.rarity];

                       return (
                           <div key={idx} className="flex flex-col items-center gap-2 animate-in zoom-in-50 duration-300" style={{ animationDelay: `${idx * 150}ms` }}>
                               <div className={cn("bg-black p-2 border-2 relative", rarityCol.split(' ')[0])}>
                                   <ItemSprite type={item} size={48} />
                                   <div className="absolute -top-1 -right-1 bg-primary text-[0.4rem] px-1 font-bold">NEW!</div>
                               </div>
                               <p className={cn("text-[0.45rem] text-center uppercase leading-tight font-bold", rarityCol.split(' ')[1])}>
                                   {meta.name}
                               </p>
                           </div>
                       );
                   })}
                </div>
             ) : (
                <div className="text-center space-y-2 opacity-60">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-[0.6rem] uppercase leading-relaxed">
                        The vault was empty...<br/>but your legend grows!
                    </p>
                </div>
             )}
          </div>

          {hasLoot && (
              <p className="text-[0.55rem] text-muted-foreground text-center uppercase italic">
                Items have been added to your Loot Bag.
              </p>
          )}
        </div>

        <DialogFooter className="p-4 bg-muted/5 border-t-2 border-border/50">
          <Button 
            onClick={onClose} 
            className="w-full h-12 text-[0.7rem] uppercase font-pixel bg-primary hover:bg-primary/80 text-primary-foreground"
          >
            Claim & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
