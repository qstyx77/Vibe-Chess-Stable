
'use client';

import React, { useState, useMemo } from 'react';
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
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Coins, Crown, Sparkles, Sword, Package, Zap, Landmark, CreditCard } from 'lucide-react';
import { useUser, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { ITEM_METADATA, type InventoryItemType, type PieceType } from '@/types';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { ItemSprite } from './ItemSprite';
import { cn } from '@/lib/utils';

interface RoyalStoreProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const rand = () => {
    h = (Math.imul(h, 48271) % 2147483647) | 0;
    return (h & 2147483647) / 2147483648;
  };
  return rand;
}

const getESTDateSeed = () => {
  const options = { timeZone: "America/New_York", year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  return new Intl.DateTimeFormat("en-US", options).format(new Date());
};

const getDailyItems = (seed: string): InventoryItemType[] => {
  const rand = seededRandom(seed);
  const items = Object.keys(ITEM_METADATA) as InventoryItemType[];
  const rares = items.filter(i => ITEM_METADATA[i].rarity === 'rare');
  const uncommons = items.filter(i => ITEM_METADATA[i].rarity === 'uncommon');
  const commons = items.filter(i => ITEM_METADATA[i].rarity === 'common');
  
  const pick = (list: any[]) => list[Math.floor(rand() * list.length)];

  return [
    pick(rares),
    pick(uncommons), pick(uncommons),
    pick(commons), pick(commons), pick(commons)
  ];
};

export function RoyalStore({ isOpen, onOpenChange }: RoyalStoreProps) {
  const { userData, user } = useUser();
  const { toast } = useToast();
  const firestore = getFirestore();
  const [loading, setLoading] = useState<string | null>(null);
  const [exchangeAmount, setExchangeAmount] = useState(2000);

  const dailySeed = useMemo(() => getESTDateSeed(), [isOpen]);
  const dailyItems = useMemo(() => getDailyItems(dailySeed), [dailySeed]);

  const buyGold = async (amount: number, gold: number) => {
    setLoading(`gold-${gold}`);
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

  const handleDailyDeal = async () => {
    const activeSeed = dailySeed;
    if (!user) return;
    
    setLoading('daily');
    try {
        const userRef = doc(firestore, 'users', user.uid);
        await runTransaction(firestore, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data();
            if (!data) throw new Error("User data not found.");
            
            const inv = [...(data?.inventory || [])];
            const verifiedItems = getDailyItems(activeSeed);
            verifiedItems.forEach(type => {
                const idx = inv.findIndex(i => i.type === type);
                if (idx > -1) inv[idx].count++; else inv.push({ type, count: 1 });
            });
            tx.update(userRef, { inventory: inv });
        });
        toast({ title: "Purchase Success!", description: "Daily items delivered to your loot bag." });
    } catch (e: any) { 
        toast({ variant: 'destructive', title: "Purchase Failed", description: e.message }); 
    }
    setLoading(null);
  };

  const requestCashOut = async () => {
    if (!userData || !user) return;
    
    if (exchangeAmount < 2000) {
        toast({ variant: 'destructive', title: "Minimum Not Met", description: "You need at least 2000 Gold ($20) to exchange." });
        return;
    }
    
    if (exchangeAmount > userData.goldBalance) {
        toast({ variant: 'destructive', title: "Error", description: "You cannot exchange more gold than you own." });
        return;
    }

    setLoading('exchange');
    try {
        const userRef = doc(firestore, 'users', user.uid);
        await runTransaction(firestore, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data();
            if (!data || data.goldBalance < exchangeAmount) throw new Error("Insufficient Gold.");
            
            tx.update(userRef, { goldBalance: data.goldBalance - exchangeAmount });
        });
        
        const val = (exchangeAmount * 0.01 * 0.67).toFixed(2);
        toast({ title: "Exchange Request Sent", description: `Processing $${val} via Square Payouts.` });
        setExchangeAmount(Math.min(2000, userData.goldBalance - exchangeAmount));
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Exchange Failed", description: e.message });
    }
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
      <DialogContent className="sm:max-w-3xl md:max-w-4xl bg-black border-2 border-primary font-pixel max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b border-border/50">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <Crown className="h-8 w-8 text-yellow-500 animate-pulse" />
                 <DialogTitle className="text-xl text-primary uppercase tracking-tighter">Store</DialogTitle>
              </div>
              <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 border border-primary/30">
                 <Coins className="h-4 w-4 text-yellow-500" />
                 <span className="text-sm text-white">{userData?.goldBalance || 0}G</span>
              </div>
           </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-8 pb-10 px-1">
            {/* GOLD PACKS */}
            <section>
                <h2 className="text-[0.7rem] text-primary uppercase mb-3 flex items-center gap-2"><Zap className="h-3 w-3" /> Gold Mint</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            {/* EXCHANGE */}
            <section>
               <h2 className="text-[0.7rem] text-primary uppercase mb-3 flex items-center gap-2"><Landmark className="h-3 w-3" /> Exchange</h2>
               <Card className="border-2 border-primary/40 bg-primary/5">
                  <CardContent className="p-4 space-y-4">
                     <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="w-full sm:w-1/2">
                            <p className="text-[0.65rem] uppercase text-muted-foreground mb-1">Gold to Exchange</p>
                            <div className="flex items-center gap-2 bg-black/40 border border-primary/20 p-2">
                                <input 
                                    type="number" 
                                    value={exchangeAmount} 
                                    onChange={(e) => setExchangeAmount(Math.min(Number(e.target.value), userData?.goldBalance || 0))}
                                    className="bg-transparent border-none w-full text-white font-pixel text-sm focus:outline-none"
                                    min="0"
                                    max={userData?.goldBalance || 0}
                                />
                                <span className="text-[0.5rem] text-primary">GOLD</span>
                            </div>
                        </div>
                        <div className="text-center sm:text-right flex-grow">
                            <p className="text-[0.65rem] uppercase text-muted-foreground">Exchange Value</p>
                            <p className="text-lg font-bold text-white mt-1">${(exchangeAmount * 0.01 * 0.67).toFixed(2)}</p>
                            <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase italic">Includes 33% Tax</p>
                        </div>
                     </div>
                     <Button 
                        className="w-full h-10 text-[0.55rem] uppercase px-6" 
                        onClick={requestCashOut} 
                        variant="outline"
                        disabled={exchangeAmount <= 0 || exchangeAmount > (userData?.goldBalance || 0) || !!loading}
                     >
                        <CreditCard className="h-3 w-3 mr-2" /> Withdraw
                     </Button>
                  </CardContent>
               </Card>
            </section>

            {/* DAILY DEAL */}
            <section>
                <h2 className="text-[0.7rem] text-accent uppercase mb-3 flex items-center gap-2"><Sparkles className="h-3 w-3" /> Daily Deal</h2>
                <div className="w-full border-2 border-accent bg-accent/5 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 w-full">
                        <div className="bg-black p-3 border border-accent shrink-0">
                            <Package className="h-8 w-8 text-accent" />
                        </div>
                        <div className="flex-grow space-y-4">
                            <div className="grid grid-cols-6 gap-2">
                                {dailyItems.map((type, idx) => {
                                    const meta = ITEM_METADATA[type];
                                    return (
                                        <Popover key={`${type}-${idx}`}>
                                            <PopoverTrigger asChild>
                                                <button className={cn(
                                                    "aspect-square border flex items-center justify-center bg-black cursor-help p-1 outline-none focus:ring-1 focus:ring-accent",
                                                    meta.rarity === 'rare' ? "border-purple-500 shadow-[0_0_5px_rgba(168,85,247,0.4)]" :
                                                    meta.rarity === 'uncommon' ? "border-green-500" : "border-slate-700"
                                                )}>
                                                    <ItemSprite type={type} size={32} />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent 
                                                className="bg-black border-2 border-accent font-pixel p-3 max-w-[200px] z-[150]"
                                                side="top"
                                                align="center"
                                            >
                                                <p className="text-[0.6rem] text-accent uppercase font-bold">{meta.name}</p>
                                                <p className="text-[0.5rem] text-white mt-1 leading-tight">{meta.description}</p>
                                                <p className={cn(
                                                    "text-[0.45rem] uppercase mt-2 font-bold",
                                                    meta.rarity === 'rare' ? "text-purple-400" : 
                                                    meta.rarity === 'uncommon' ? "text-green-400" : "text-slate-400"
                                                )}>{meta.rarity}</p>
                                            </PopoverContent>
                                        </Popover>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
                        <Button 
                            variant="outline" 
                            className="w-full sm:w-32 h-12 border-2 border-accent hover:bg-accent/10" 
                            onClick={handleDailyDeal} 
                            disabled={!!loading}
                        >
                            <span className="text-[0.8rem] text-accent">$2.00</span>
                        </Button>
                    </div>
                </div>
                <p className="text-[0.45rem] text-muted-foreground uppercase mt-2 text-right">Refreshed at midnight EST</p>
            </section>

            {/* UNIT SHOWCASE */}
            <section>
                <h2 className="text-[0.7rem] text-secondary uppercase mb-3 flex items-center gap-2"><Sword className="h-3 w-3" /> Unit Recruitment</h2>
                <div className="space-y-3">
                    {pieceList.map(p => {
                        const isOwned = userData?.unlockedPieces?.includes(p.type);
                        const elo = userData?.eloRating || 1200;
                        const isUnlockedByElo = 
                            (p.type === 'archbishop' && elo >= 1500) ||
                            (p.type === 'palace' && elo >= 1800) ||
                            (p.type === 'archer' && elo >= 2100);

                        return (
                            <Card key={p.type} className="border-2 border-border/50 bg-black/40 overflow-hidden w-full">
                                <CardContent className="p-3 flex items-center justify-between gap-4">
                                    <div className="w-12 h-12 bg-muted/10 shrink-0 flex items-center justify-center border border-border/30">
                                        <div className="scale-[1.25]">
                                            <ChessPieceDisplay piece={{ id: 'preview', type: p.type, color: 'white', level: 1, hasMoved: false }} />
                                        </div>
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-[0.7rem] text-white uppercase truncate">{p.name}</h3>
                                            <span className="text-[0.45rem] px-1 bg-muted text-muted-foreground uppercase shrink-0">{p.isElo ? 'RANKED' : 'FRONTLINE'}</span>
                                        </div>
                                        <p className="text-[0.5rem] text-muted-foreground italic leading-tight mt-1 line-clamp-2">{p.desc}</p>
                                        <p className="text-[0.45rem] text-primary/80 uppercase mt-1">Unlock: {p.req}</p>
                                    </div>
                                    <div className="shrink-0">
                                        {isOwned || isUnlockedByElo ? (
                                            <span className="text-[0.55rem] text-green-500 uppercase font-bold">UNLOCKED</span>
                                        ) : p.isElo ? (
                                            <span className="text-[0.45rem] text-muted-foreground uppercase border border-border px-2 py-1">LOCKED</span>
                                        ) : (
                                            <Button variant="secondary" size="sm" className="h-8 text-[0.5rem] uppercase px-2" onClick={() => buyPiece(p.type)} disabled={!!loading}>
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
