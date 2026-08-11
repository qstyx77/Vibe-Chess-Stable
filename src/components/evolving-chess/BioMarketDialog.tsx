
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
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Coins, Package } from 'lucide-react';
import { useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { ITEM_METADATA } from '@/types';
import { ItemSprite } from './ItemSprite';
import { useSocial } from '../social/SocialContext';
import { cn } from '@/lib/utils';

interface BioMarketDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  username: string;
}

export function BioMarketDialog({ isOpen, onOpenChange, sellerId, username }: BioMarketDialogProps) {
  const firestore = getFirestore();
  const { userData: buyerData } = useUser();
  const { buyItemFromMarket } = useSocial();
  
  const sellerRef = useMemoFirebase(() => {
    if (!sellerId) return null;
    return doc(firestore, `users/${sellerId}`);
  }, [firestore, sellerId]);

  const { data: sellerData, isLoading } = useDoc(sellerRef);

  const marketSlots = sellerData?.marketSlots || [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-black border-2 border-yellow-500 font-pixel">
        <DialogHeader>
          <div className="flex items-center justify-center gap-3">
             <ShoppingCart className="h-6 w-6 text-yellow-500" />
             <DialogTitle className="text-lg text-white uppercase tracking-tighter">{username}'S MARKET</DialogTitle>
          </div>
          <DialogDescription className="text-center text-[0.6rem] text-muted-foreground uppercase mt-2">
            Click an item to purchase with your Gold.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-3">
             {isLoading ? (
                 <p className="text-center text-[0.5rem] uppercase animate-pulse">Consulting the Merchant...</p>
             ) : marketSlots.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-6 opacity-40">
                    <Package className="h-10 w-10 mb-2" />
                    <p className="text-[0.6rem] uppercase">Merchant has no stock.</p>
                 </div>
             ) : (
                 marketSlots.map((slot: any) => {
                     const meta = ITEM_METADATA[slot.itemId];
                     const canAfford = (buyerData?.goldBalance || 0) >= slot.price;
                     return (
                        <Card key={slot.slot} className="border-2 border-border/50 bg-muted/5">
                            <CardContent className="p-3 flex items-center gap-4">
                                <div className="bg-black p-2 border border-border/30">
                                    <ItemSprite type={slot.itemId} size={32} />
                                </div>
                                <div className="flex-grow">
                                    <p className="text-[0.7rem] text-white uppercase">{meta.name}</p>
                                    <p className="text-[0.45rem] text-muted-foreground leading-tight italic mt-0.5">{meta.description}</p>
                                    <div className="flex items-center gap-1 mt-1.5">
                                        <Coins className="h-3 w-3 text-yellow-500" />
                                        <span className={cn("text-[0.65rem]", canAfford ? "text-yellow-400" : "text-destructive")}>{slot.price}G</span>
                                    </div>
                                </div>
                                <Button 
                                    size="sm" 
                                    variant={canAfford ? "default" : "outline"} 
                                    className="h-8 text-[0.5rem] uppercase"
                                    onClick={() => buyItemFromMarket(sellerId, slot.slot)}
                                    disabled={!canAfford}
                                >
                                    Buy
                                </Button>
                            </CardContent>
                        </Card>
                     );
                 })
             )}
          </div>
        </div>

        <div className="flex justify-between items-center px-2 py-3 bg-muted/10 border-t border-border/50">
            <span className="text-[0.5rem] text-muted-foreground uppercase">Your Purse:</span>
            <div className="flex items-center gap-1.5">
                <Coins className="h-3 w-3 text-yellow-500" />
                <span className="text-[0.7rem] text-white font-bold">{buyerData?.goldBalance || 0}G</span>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
