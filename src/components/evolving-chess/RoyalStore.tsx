'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { createSquarePayment, initiateSquarePayout } from '@/app/actions/square';

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
  const [exchangeAmount, setExchangeAmount] = useState(0);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({ isOpen: false, title: '', description: '', action: () => {} });

  const dailySeed = useMemo(() => getESTDateSeed(), [isOpen]);
  const dailyItems = useMemo(() => getDailyItems(dailySeed), [dailySeed]);

  const triggerConfirmation = (title: string, description: string, action: () => void) => {
    setConfirmDialog({ isOpen: true, title, description, action });
  };

  const buyGold = async (amount: number, gold: number) => {
    triggerConfirmation(
      "Purchase Gold?",
      `Are you sure you want to spend $${amount}.00 for ${gold} Gold? This will redirect you to a secure Square payment page.`,
      async () => {
        if (!user) return;
        setLoading(`gold-${gold}`);
        const url = await createSquarePayment(amount * 100, `${gold} Gold Pack`, user.uid, `gold_${gold}`);
        if (url) {
          window.location.href = url;
        } else {
          toast({ variant: 'destructive', title: "Purchase Error", description: "Could not connect to Square." });
          setLoading(null);
        }
      }
    );
  };

  const handleDailyDeal = async () => {
    triggerConfirmation(
      "Purchase Daily Deal?",
      "Are you sure you want to spend $2.00 for today's item bundle? This will redirect you to a secure Square payment page.",
      async () => {
        if (!user) return;
        setLoading('daily');
        const url = await createSquarePayment(200, "Daily Mercenary Bundle", user.uid, 'daily_deal');
        if (url) {
          window.location.href = url;
        } else {
          toast({ variant: 'destructive', title: "Purchase Error", description: "Could not connect to Square." });
          setLoading(null);
        }
      }
    );
  };

  const buyPiece = async (piece: PieceType) => {
    triggerConfirmation(
      "Recruit Unit?",
      `Recruiting the ${piece.toUpperCase()} costs $1.00 USD. Are you sure? This will redirect you to a secure Square payment page.`,
      async () => {
        if (!user) return;
        setLoading(piece);
        try {
            const url = await createSquarePayment(100, `Recruit ${piece.toUpperCase()}`, user.uid, piece);
            if (url) {
                window.location.href = url;
            } else {
                toast({ variant: 'destructive', title: "Purchase Error", description: "Could not connect to Square." });
                setLoading(null);
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Recruitment Failed", description: e.message });
            setLoading(null);
        }
      }
    );
  };

  const requestCashOut = async () => {
    triggerConfirmation(
      "Exchange Gold?",
      `Are you sure you want to exchange ${exchangeAmount} Gold for $${(exchangeAmount * 0.01 * 0.67).toFixed(2)}? Your balance will be deducted immediately.`,
      async () => {
        if (!userData || !user) return;
        
        if (exchangeAmount < 2000) {
            toast({ variant: 'destructive', title: "Minimum Not Met", description: "You need at least 2000 Gold ($20) to exchange." });
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
            
            await initiateSquarePayout(exchangeAmount, user.uid);
            toast({ title: "Exchange Request Sent", description: `Withdrawal of $${(exchangeAmount * 0.01 * 0.67).toFixed(2)} initiated via Square.` });
            setExchangeAmount(0);
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Exchange Failed", description: e.message });
        }
        setLoading(null);
      }
    );
  };

  const pieceList: { type: PieceType; name: string; desc: string; req: string; isElo?: boolean }[] = [
    { type: 'archbishop', name: 'Archbishop', desc: 'Elite Clergy. Grants Holy Shield at KS 2.', req: '1500 Elo', isElo: true },
    { type: 'palace', name: 'The Palace', desc: 'Living Fortress. High-level resurrections.', req: '1800 Elo', isElo: true },
    { type: 'archer', name: 'Archer', desc: 'Long-range Cavalry. Global Snipe at KS 5.', req: '2100 Elo', isElo: true },
    { type: 'dancer', name: 'The Dancer', desc: 'Mobile specialist. Free move/swap at KS 1.', req: 'Dungeon Floor 50 or $1.00' },
    { type: 'mimic', name: 'The Mimic', desc: 'Utility unit. Copies the last moved piece.', req: 'Dungeon Floor 50 or $1.00' },
    { type: 'grappler', name: 'The Grappler', desc: 'Area control. Throws adjacent units.', req: 'Dungeon Floor 50 or $1.00' },
    { type: 'myco_mage', name: 'Myco Mage', desc: 'Mushroomancer. Uses global fungal spells.', req: 'Dungeon Floor 50 or $1.00' },
  ];

  return (
    <>
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
                            <p className="text-[0.65rem] uppercase text-muted-foreground mb-1">Gold to Exchange <span className="text-destructive font-bold ml-1">(2000G MIN)</span></p>
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
                        disabled={exchangeAmount < 2000 || exchangeAmount > (userData?.goldBalance || 0) || !!loading}
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

    <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
        <AlertDialogContent className="font-pixel border-2 border-primary bg-black">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-primary uppercase text-sm">{confirmDialog.title}</AlertDialogTitle>
                <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed">
                    {confirmDialog.description}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                    className="h-9 text-[0.6rem] uppercase bg-primary text-primary-foreground"
                    onClick={() => {
                        confirmDialog.action();
                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    }}
                >
                    Confirm Transaction
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
