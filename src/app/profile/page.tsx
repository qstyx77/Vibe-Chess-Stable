
'use client';

import { useUser, useDoc, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserInteractionPopover } from '@/components/social/UserInteractionPopover';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { Coins, Package, Store, ArrowRight, CreditCard, Landmark, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { ITEM_METADATA, type InventoryItemType, type MarketListing } from '@/types';
import { ItemSprite } from '@/components/evolving-chess/ItemSprite';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSocial } from '@/components/social/SocialContext';

export default function ProfilePage() {
  const { user, userData, isUserLoading, userError } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get('userId');
  const targetId = queryUserId || user?.uid;
  const { toast } = useToast();
  const { ws } = useSocial();

  const firestore = getFirestore();
  const [isListingItem, setIsListingItem] = useState<number | null>(null);
  const [listingPrice, setListingPrice] = useState(100);

  const userProfileRef = useMemoFirebase(() => {
    if (!targetId) return null;
    return doc(firestore, `users/${targetId}`);
  }, [firestore, targetId]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc(userProfileRef);

  useEffect(() => {
    if (!isUserLoading && !user && !queryUserId) {
      router.push('/');
    }
  }, [user, isUserLoading, router, queryUserId]);

  const listItemsForMarket = (slot: number) => {
    setIsListingItem(slot);
  };

  const handleListing = (type: InventoryItemType) => {
    if (!user || isListingItem === null) return;
    const currentMarket = [...(userData?.marketSlots || [])];
    const newListing: MarketListing = { itemId: type, price: listingPrice, slot: isListingItem };
    
    const newMarket = [...currentMarket.filter(s => s.slot !== isListingItem), newListing];
    
    const newInv = [...(userData?.inventory || [])];
    const idx = newInv.findIndex(i => i.type === type);
    if (idx > -1) {
        newInv[idx].count--;
        if (newInv[idx].count <= 0) newInv.splice(idx, 1);
    }

    const userRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userRef, { marketSlots: newMarket, inventory: newInv });
    
    // Notify Server to Ticker
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'market-listing-broadcast', item: type, price: listingPrice }));
    }

    setIsListingItem(null);
    toast({ title: "Stall Updated", description: `${ITEM_METADATA[type].name} listed for ${listingPrice}g.` });
  };

  const cancelListing = (slot: number) => {
    if (!user) return;
    const listing = userData?.marketSlots?.find(s => s.slot === slot);
    if (!listing) return;

    const newMarket = userData?.marketSlots?.filter(s => s.slot !== slot) || [];
    const newInv = [...(userData?.inventory || [])];
    const idx = newInv.findIndex(i => i.type === listing.itemId);
    if (idx > -1) newInv[idx].count++;
    else newInv.push({ type: listing.itemId, count: 1 });

    const userRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userRef, { marketSlots: newMarket, inventory: newInv });
    toast({ title: "Listing Removed", description: "Item returned to loot bag." });
  };

  const requestCashOut = () => {
    if (!userData || userData.goldBalance < 2000) {
        toast({ variant: 'destructive', title: "Minimum Not Met", description: "You need at least 2000 Gold ($20) to cash out." });
        return;
    }
    const val = (userData.goldBalance * 0.01 * 0.67).toFixed(2);
    toast({ title: "Cash Out Request Sent", description: `Processing $${val} via Square Payouts.` });
  };

  if (isUserLoading || isProfileLoading) {
    return <div className="flex justify-center items-center h-screen font-pixel uppercase text-xs"><p>Loading profile...</p></div>;
  }

  if (userError) {
    return <div className="flex justify-center items-center h-screen"><p>Error loading user: {userError.message}</p></div>;
  }

  if (!userProfile) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p>Profile not found.</p>
            <Link href="/">
                <Button>Go Home</Button>
            </Link>
        </div>
    );
  }

  const isMe = user?.uid === targetId;

  return (
    <div className="container mx-auto p-4 max-w-4xl font-pixel space-y-6">
      <Card className="border-2 border-primary/30">
        <CardHeader className="text-center border-b border-border/50">
          <CardTitle className="uppercase tracking-tighter">{userProfile.username}&apos;S HALL OF RECORDS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24 border-4 border-accent shadow-[0_0_15px_rgba(255,0,255,0.3)]">
              <AvatarFallback className="bg-muted text-3xl">{userProfile.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            
            {!isMe ? (
                <UserInteractionPopover userId={targetId!} username={userProfile.username}>
                    <h2 className="text-xl font-bold text-primary uppercase hover:text-accent transition-colors cursor-pointer">{userProfile.username}</h2>
                </UserInteractionPopover>
            ) : (
                <h2 className="text-xl font-bold text-primary uppercase">{userProfile.username}</h2>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted/30 border border-border rounded-none">
              <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">ELO RATING</p>
              <p className="text-2xl font-bold text-primary">{userProfile.eloRating || 1200}</p>
            </div>
            <div className="p-4 bg-muted/30 border border-border rounded-none">
                <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">ARENA VICTORIES</p>
                <p className="text-2xl font-bold text-green-500">{userProfile.wins || 0}</p>
            </div>
            <div className="p-4 bg-muted/30 border border-border rounded-none">
                <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">ARENA DEFEATS</p>
                <p className="text-2xl font-bold text-destructive">{userProfile.losses || 0}</p>
            </div>
          </div>

          {/* BANKING SECTION */}
          {isMe && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
               <Card className="border-2 border-yellow-600 bg-yellow-500/5">
                  <CardContent className="p-4 flex flex-col items-center text-center">
                     <Coins className="h-8 w-8 text-yellow-500 mb-2" />
                     <p className="text-[0.65rem] uppercase text-muted-foreground">Gold Reserve</p>
                     <p className="text-2xl font-bold text-yellow-400 mt-1">{userData?.goldBalance || 0}G</p>
                     <p className="text-[0.45rem] text-muted-foreground mt-1">Sovereign Value: ${( (userData?.goldBalance || 0) * 0.01).toFixed(2)}</p>
                  </CardContent>
               </Card>
               <Card className="border-2 border-primary/40 bg-primary/5">
                  <CardContent className="p-4 flex flex-col items-center text-center justify-between h-full">
                     <Landmark className="h-8 w-8 text-primary mb-2" />
                     <div>
                        <p className="text-[0.65rem] uppercase text-muted-foreground">Redemption Vault</p>
                        <p className="text-lg font-bold text-white mt-1">${( (userData?.goldBalance || 0) * 0.01 * 0.67).toFixed(2)}</p>
                        <p className="text-[0.4rem] text-muted-foreground mt-1 uppercase italic">Includes 33% Sovereign Tax</p>
                     </div>
                     <Button className="mt-3 w-full h-8 text-[0.55rem] uppercase" onClick={requestCashOut} variant="outline">
                        <CreditCard className="h-3 w-3 mr-2" /> Withdraw
                     </Button>
                  </CardContent>
               </Card>
            </div>
          )}

          {/* MARKET STALL */}
          <div className="mt-8">
             <h3 className="text-[0.7rem] text-primary uppercase mb-4 flex items-center gap-2"><Store className="h-4 w-4" /> Merchant Stall</h3>
             <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map(slot => {
                    const listing = userProfile.marketSlots?.find((s: any) => s.slot === slot);
                    return (
                        <div key={slot} className="aspect-[10/12] border-2 border-dashed border-border/50 flex flex-col items-center justify-center relative bg-black/40">
                           {listing ? (
                               <div className="w-full h-full p-1 flex flex-col items-center justify-between animate-in zoom-in-95 duration-200">
                                  <ItemSprite type={listing.itemId} size={40} />
                                  <p className="text-[0.5rem] text-yellow-400 font-bold">{listing.price}G</p>
                                  {isMe && (
                                      <button className="absolute -top-1 -right-1 bg-destructive text-white p-0.5" onClick={() => cancelListing(slot)}>
                                          <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                  )}
                               </div>
                           ) : isMe ? (
                               <button className="w-full h-full flex flex-col items-center justify-center hover:bg-primary/5 transition-colors" onClick={() => listItemsForMarket(slot)}>
                                  <UserPlus className="h-6 w-6 text-muted-foreground/40" />
                                  <span className="text-[0.4rem] text-muted-foreground uppercase mt-2">Rent Slot</span>
                               </button>
                           ) : (
                               <div className="opacity-20 flex flex-col items-center">
                                  <Package className="h-6 w-6" />
                                  <span className="text-[0.4rem] uppercase mt-2">Empty</span>
                               </div>
                           )}
                        </div>
                    );
                })}
             </div>
          </div>

          <div className="text-center pt-6">
             <Link href="/">
                <Button variant="ghost" className="text-[10px] uppercase">Return to Battle</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* LISTING OVERLAY */}
      {isListingItem && isMe && (
          <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-2 border-primary bg-black">
                  <CardHeader className="p-4 border-b">
                      <CardTitle className="text-sm uppercase text-primary">List Item for Sale</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                      <div className="flex items-center gap-4 bg-muted/20 p-3">
                          <Coins className="h-6 w-6 text-yellow-500" />
                          <div className="flex-grow">
                             <p className="text-[0.6rem] uppercase text-muted-foreground">Asking Price (Gold)</p>
                             <input 
                                type="number" 
                                value={listingPrice} 
                                onChange={(e) => setListingPrice(Number(e.target.value))}
                                className="bg-transparent border-b border-primary w-full text-white font-pixel text-sm py-1 focus:outline-none"
                             />
                          </div>
                      </div>

                      <p className="text-[0.6rem] uppercase text-muted-foreground px-1">Select from Inventory:</p>
                      <ScrollArea className="h-64 pr-2">
                         <div className="grid grid-cols-4 gap-2">
                            {userData?.inventory?.map((item, idx) => (
                                <button key={idx} className="aspect-[10/12] border-2 border-border flex items-center justify-center hover:border-primary transition-colors bg-black" onClick={() => handleListing(item.type)}>
                                    <ItemSprite type={item.type} size={40} />
                                    <span className="absolute bottom-0 right-0 bg-primary text-[0.45rem] px-0.5 font-bold">x{item.count}</span>
                                </button>
                            ))}
                         </div>
                      </ScrollArea>
                      
                      <Button variant="ghost" className="w-full text-[0.6rem] uppercase h-8" onClick={() => setIsListingItem(null)}>Cancel</Button>
                  </CardContent>
              </Card>
          </div>
      )}
    </div>
  );
}
