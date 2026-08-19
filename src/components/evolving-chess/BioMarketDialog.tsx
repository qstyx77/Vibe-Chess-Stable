'use client';

import React, { useState } from 'react';
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
  
  const [confirmBuy, setConfirmBuy] = useState<{ isOpen: boolean, slot: number, price: number, itemName: string } | null>(null);

  const sellerRef = useMemoFirebase(() => {
    if (!sellerId) return null;
    return doc(firestore, `users/${sellerId}`);
  }, [firestore, sellerId]);

  const { data: sellerData, isLoading } = useDoc(sellerRef);

  const marketSlots = sellerData?.marketSlots || [];

  const handleBuyClick = (slot: number, price: number, itemName: string) => {
    setConfirmBuy({ isOpen: true, slot, price, itemName });
  };

  const confirmPurchase = () => {
    if (confirmBuy) {
        buyItemFromMarket(sellerId, confirmBuy.slot);
        setConfirmBuy(null);
    }
  };

  return (
    <>
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
                                    onClick={() => handleBuyClick(slot.slot, slot.price, meta.name)}
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

    <AlertDialog open={!!confirmBuy} onOpenChange={(open) => !open && setConfirmBuy(null)}>
        <AlertDialogContent className="font-pixel border-2 border-yellow-500 bg-black">
            <AlertDialogHeader>
                <AlertDialogTitle className="text-yellow-500 uppercase text-sm">Confirm Purchase?</AlertDialogTitle>
                <AlertDialogDescription className="text-white text-[0.65rem] uppercase leading-relaxed">
                    Are you sure you want to spend <span className="text-yellow-400">{confirmBuy?.price} Gold</span> to buy <span className="text-primary">{confirmBuy?.itemName}</span> from {username}?
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="h-9 text-[0.6rem] uppercase">Cancel</AlertDialogCancel>
                <AlertDialogAction 
                    className="h-9 text-[0.6rem] uppercase bg-yellow-500 text-black"
                    onClick={confirmPurchase}
                >
                    Confirm Purchase
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}