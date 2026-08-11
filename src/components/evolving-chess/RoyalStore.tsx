'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Coins, Crown, Sparkles, Sword, UserPlus, Package, Zap } from 'lucide-react';
import { useUser, useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ITEM_METADATA, type InventoryItemType, type PieceType } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface RoyalStoreProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoyalStore({ isOpen, onOpenChange }: RoyalStoreProps) {
  const { userData, user } = useUser();
  const { toast } = useToast();
  const firestore = getFirestore();
  const [loading, setLoading] = useState<string | null>(null);

  const buyGold = async (amount: number, gold: number) => {
    setLoading(`gold-${gold}`);
    // Simulated Square SDK integration
    setTimeout(() => {
        if (!user) return;
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { goldBalance: (userData?.goldBalance || 0) + gold });
        toast({ title: "Purchase Success!", description: `${gold} Gold added to your coffers.` });
        setLoading(null);
    }, 1000);
  };

  const buyPiece = async (piece: PieceType) => {
    if (!user || (userData?.goldBalance || 0) < 100) {
        toast({ variant: 'destructive', title: "Insufficient Gold", description: "Purchase Gold or earn it in the Arena!" });
        return;
    }
    setLoading(piece);
    try {
        const userRef = doc(firestore, 'users', user.uid);
        await runTransaction(firestore, async (transaction) => {
            const snap = await transaction.get(userRef);
            const data = snap.data();
            if (!data || data.goldBalance < 100) throw new Error("Insufficient Gold.");
            const currentUnlocks = data.unlockedPieces || [];
            if (currentUnlocks.includes(piece)) throw new Error("Unit already recruited.");
            
            transaction.update(userRef, { 
                goldBalance: data.goldBalance - 100,
                unlockedPieces: [...currentUnlocks, piece]
            });
        });
        toast({ title: "Unit Recruited!", description: `${piece.toUpperCase()} is now available in your army.` });
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Recruitment Failed", description: e.message });
    }
    setLoading(null);
  };

  const dailyDeal = async () => {
    if (!user || (userData?.goldBalance || 0) < 200) {
        toast({ variant: 'destructive', title: "Insufficient Gold", description: "Mercenary Bundle costs 200 Gold ($2.00)." });
        return;
    }
    setLoading('daily');
    const items = Object.keys(ITEM_METADATA) as InventoryItemType[];
    const rares = items.filter(i => ITEM_METADATA[i].rarity === 'rare');
    const uncommons = items.filter(i => ITEM_METADATA[i].rarity === 'uncommon');
    const commons = items.filter(i => ITEM_METADATA[i].rarity === 'common');
    
    const roll = [
        rares[Math.floor(Math.random()*rares.length)],
        ...Array.from({length:2}, () => uncommons[Math.floor(Math.random()*uncommons.length)]),
        ...Array.from({length:3}, () => commons[Math.floor(Math.random()*commons.length)])
    ];

    try {
        const userRef = doc(firestore, 'users', user.uid);
        await runTransaction(firestore, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data();
            if (!data || data.goldBalance < 200) throw new Error("Insufficient Gold.");
            const inv = [...(data?.inventory || [])];
            roll.forEach(type => {
                const idx = inv.findIndex(i => i.type === type);
                if (idx > -1) inv[idx].count++; else inv.push({ type, count: 1 });
            });
            tx.update(userRef, { goldBalance: data.goldBalance - 200, inventory: inv });
        });
        toast({ title: "Bundle Claimed!", description: "6 random items delivered to your loot bag." });
    } catch (e: any) { toast({ variant: 'destructive', title: "Purchase Failed", description: e.message }); }
    setLoading(null);
  };

  const pieceList: { type: PieceType; name: string; desc: string; req: string; isElo?: boolean }[] = [
    { type: 'archbishop', name: 'Archbishop', desc: 'Elite Clergy. Grants Holy Shield at KS 2.', req: '1500 Elo', isElo: true },
    { type: 'palace', name: 'The Palace', desc: 'Living Fortress. High-level resurrections.', req: '1800 Elo', isElo: true },
    { type: 'archer', name: 'Archer', desc: 'Long-range Cavalry. Global Snipe at KS 5.', req: '2100 Elo', isElo: true },
    { type: 'dancer', name: 'The Dancer', desc: 'Mobile specialist. Free move/swap at KS 1.', req: 'Dungeon Floor 50 or $1' },
    { type: 'mimic', name: 'The Mimic', desc: 'Utility unit. Copies the last moved piece.', req: 'Dungeon Floor 50 or $1' },
    { type: 'grappler', name: 'The Grappler', desc: 'Area control. Throws adjacent units.', req: 'Dungeon Floor 50 or $1' },
    { type: 'myco_mage', name: 'Myco Mage', desc: 'Mushroomancer. Uses global fungal spells.', req: 'Dungeon Floor 50 or $1' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl bg-black border-2 border-primary font-pixel max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b border-border/50">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <Crown className="h-8 w-8 text-yellow-500 animate-pulse" />
                 <DialogTitle className="text-xl text-primary uppercase tracking-tighter">The Royal Store</DialogTitle>
              </div>
              <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 border border-primary/30">
                 <Coins className="h-4 w-4 text-yellow-500" />
                 <span className="text-sm text-white">{userData?.goldBalance || 0}G</span>
              </div>
           </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-8 pb-10">
            {/* GOLD PACKS */}
            <section>
                <h2 className="text-[0.7rem] text-primary uppercase mb-3 flex items-center gap-2"><Zap className="h-3 w-3" /> Gold Exchange</h2>
                <div className="grid grid-cols-2 gap-4">
                    <Button variant="outline" className="h-20 flex flex-col border-2 border-slate-700 hover:border-primary bg-black/40" onClick={() => buyGold(1, 100)} disabled={!!loading}>
                        <span className="text-[0.8rem] text-white">100 GOLD</span>
                        <span className="text-[0.5rem] text-muted-foreground mt-1">$1.00 USD</span>
                    </Button>
                    <Button variant="outline" className="h-20 flex flex-col border-2 border-yellow-700 hover:border-yellow-400 bg-black/40" onClick={() => buyGold(5, 600)} disabled={!!loading}>
                        <span className="text-[0.8rem] text-yellow-400">600 GOLD</span>
                        <span className="text-[0.5rem] text-muted-foreground mt-1">$5.00 USD (BONUS!)</span>
                    </Button>
                </div>
            </section>

            {/* DAILY DEAL */}
            <section>
                <h2 className="text-[0.7rem] text-accent uppercase mb-3 flex items-center gap-2"><Sparkles className="h-3 w-3" /> Daily Deal</h2>
                <Button variant="outline" className="w-full h-24 border-2 border-accent bg-accent/5 hover:bg-accent/10 flex items-center justify-between px-6" onClick={dailyDeal} disabled={!!loading}>
                    <div className="flex items-center gap-4">
                        <div className="bg-black p-3 border border-accent">
                            <Package className="h-8 w-8 text-accent" />
                        </div>
                        <div className="text-left">
                            <p className="text-[0.75rem] text-white uppercase">Mercenary Bundle</p>
                            <p className="text-[0.5rem] text-muted-foreground uppercase mt-1">1 Rare • 2 Uncommon • 3 Common</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[0.85rem] text-accent">200g</p>
                        <p className="text-[0.4rem] text-muted-foreground uppercase mt-1">Refreshes Daily</p>
                    </div>
                </Button>
            </section>

            {/* UNIT SHOWCASE */}
            <section>
                <h2 className="text-[0.7rem] text-secondary uppercase mb-3 flex items-center gap-2"><Sword className="h-3 w-3" /> Unit Recruitment</h2>
                <div className="space-y-3">
                    {pieceList.map(p => {
                        const isOwned = userData?.unlockedPieces?.includes(p.type);
                        return (
                            <Card key={p.type} className="border-2 border-border/50 bg-black/40 overflow-hidden">
                                <CardContent className="p-3 flex items-center justify-between gap-4">
                                    <div className="w-14 h-14 bg-muted/10 shrink-0 flex items-center justify-center border border-border/30">
                                        <div className="scale-[2.5]">
                                            <ChessPieceDisplay piece={{ id: 'preview', type: p.type, color: 'white', level: 1, hasMoved: false }} />
                                        </div>
                                    </div>
                                    <div className="flex-grow">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-[0.7rem] text-white uppercase">{p.name}</h3>
                                            <span className="text-[0.45rem] px-1 bg-muted text-muted-foreground uppercase">{p.isElo ? 'RANKED' : 'FRONTLINE'}</span>
                                        </div>
                                        <p className="text-[0.5rem] text-muted-foreground italic leading-tight mt-1">{p.desc}</p>
                                        <p className="text-[0.45rem] text-primary/80 uppercase mt-1">Unlock: {p.req}</p>
                                    </div>
                                    <div className="shrink-0">
                                        {isOwned ? (
                                            <span className="text-[0.55rem] text-green-500 uppercase font-bold">RECRUITED</span>
                                        ) : p.isElo ? (
                                            <span className="text-[0.45rem] text-muted-foreground uppercase border border-border px-2 py-1">LOCKED</span>
                                        ) : (
                                            <Button variant="secondary" size="sm" className="h-8 text-[0.5rem] uppercase" onClick={() => buyPiece(p.type)} disabled={!!loading}>
                                                {loading === p.type ? '...' : 'Hire ($1.00)'}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
