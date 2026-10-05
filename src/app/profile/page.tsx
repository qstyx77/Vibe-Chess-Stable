
'use client';

import { useUser, useDoc, useMemoFirebase, updateDocumentNonBlocking, useAuth } from '@/firebase';
import { doc, getFirestore, deleteDoc, runTransaction } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserInteractionPopover } from '@/components/social/UserInteractionPopover';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { Package, Store, Trash2, UserPlus, AlertTriangle, ShieldAlert, Check, Minus, Plus } from 'lucide-react';
import { ITEM_METADATA, type InventoryItemType, type MarketListing } from '@/types';
import { ItemSprite } from '@/components/evolving-chess/ItemSprite';
import { useToast } from '@/hooks/use-toast';
import { useSocial } from '@/components/social/SocialContext';
import { Coins } from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const { user, userData, isUserLoading, userError } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get('userId');
  const targetId = queryUserId || user?.uid;
  const { toast } = useToast();
  const { ws } = useSocial();

  const firestore = getFirestore();
  const [isListingItem, setIsListingItem] = useState<number | null>(null);
  const [selectedTypeForListing, setSelectedTypeForListing] = useState<{ type: InventoryItemType, count: number } | null>(null);
  const [listingPrice, setListingPrice] = useState(100);
  const [listingQuantity, setListingQuantity] = useState(1);
  const [listingMode, setListingMode] = useState<'each' | 'all'>('each');

  // Deletion state
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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
    setSelectedTypeForListing(null);
    setListingPrice(100);
    setListingQuantity(1);
    setListingMode('each');
  };

  const handleListing = async () => {
    if (!user || isListingItem === null || !selectedTypeForListing) return;
    const userRef = doc(firestore, 'users', user.uid);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists()) throw new Error("Hero profile not found.");
            const data = snap.data();
            
            const currentInv = data.inventory || [];
            const itemIdx = currentInv.findIndex((i: any) => i.type === selectedTypeForListing.type);
            
            if (itemIdx === -1 || currentInv[itemIdx].count < listingQuantity) {
                throw new Error("Insufficient items in Loot Bag.");
            }

            // Atomic Inventory Deduction
            const newInv = [...currentInv];
            if (newInv[itemIdx].count > listingQuantity) {
                newInv[itemIdx].count -= listingQuantity;
            } else {
                newInv.splice(itemIdx, 1);
            }

            // Market Slot Update
            const currentMarket = data.marketSlots || [];
            const newListing: MarketListing = { 
                itemId: selectedTypeForListing.type, 
                price: listingPrice, 
                slot: isListingItem,
                quantity: listingQuantity,
                listingType: listingMode
            };
            const newMarket = [...currentMarket.filter((s: any) => s.slot !== isListingItem), newListing];

            transaction.update(userRef, { inventory: newInv, marketSlots: newMarket });
        });
        
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'chat-message',
                category: 'market',
                sender: userData?.username || user.displayName || 'Player',
                senderId: user.uid,
                text: `[MARKET]: Listed ${listingQuantity}x ${ITEM_METADATA[selectedTypeForListing.type].name} for ${listingPrice}g (${listingMode.toUpperCase()})!`,
                timestamp: Date.now()
            }));
        }

        setIsListingItem(null);
        setSelectedTypeForListing(null);
        toast({ title: "Stall Updated", description: `${listingQuantity}x ${ITEM_METADATA[selectedTypeForListing.type].name} listed for ${listingPrice}g.` });
    } catch (e: any) {
        console.error("Market listing error:", e);
        toast({ variant: 'destructive', title: "Listing Failed", description: e.message });
    }
  };

  const cancelListing = async (slot: number) => {
    if (!user) return;
    const userRef = doc(firestore, 'users', user.uid);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists()) throw new Error("Hero profile not found.");
            const data = snap.data();
            
            const listing = data.marketSlots?.find((s: any) => s.slot === slot);
            if (!listing) throw new Error("Listing already removed.");

            const newMarket = data.marketSlots.filter((s: any) => s.slot !== slot);
            const newInv = [...(data.inventory || [])];
            const idx = newInv.findIndex((i: any) => i.type === listing.itemId);
            
            if (idx > -1) newInv[idx].count += listing.quantity;
            else newInv.push({ type: listing.itemId, count: listing.quantity });

            transaction.update(userRef, { marketSlots: newMarket, inventory: newInv });
        });
        toast({ title: "Listing Removed", description: "Item returned to loot bag." });
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Error", description: e.message });
    }
  };

  const confirmDeleteAccount = async () => {
    if (!user || !deletePassword) return;
    setIsDeleting(true);
    try {
        const credential = EmailAuthProvider.credential(user.email!, deletePassword);
        await reauthenticateWithCredential(user, credential);
        
        // Re-auth success, proceed with cleanup
        const userRef = doc(firestore, 'users', user.uid);
        await deleteDoc(userRef);
        await deleteUser(user);
        
        toast({ title: "Account Deleted", description: "Your journey has ended." });
        setIsDeleteAccountOpen(false);
        router.push('/');
    } catch (e: any) {
        console.error("Account deletion error:", e);
        toast({ 
            variant: 'destructive', 
            title: "Deletion Failed", 
            description: e.code === 'auth/wrong-password' ? "Incorrect password provided." : e.message || "An error occurred during verification." 
        });
    } finally {
        setIsDeleting(false);
    }
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
  const totalMatches = (userProfile.wins || 0) + (userProfile.losses || 0);
  const winRate = totalMatches > 0 ? Math.round((userProfile.wins / totalMatches) * 100) : 0;

  return (
    <div className="container mx-auto p-4 max-w-4xl font-pixel space-y-6">
      <Card className="border-2 border-primary/30">
        <CardHeader className="text-center border-b border-border/50">
          <CardTitle className="uppercase tracking-tighter">{userProfile.username}&apos;S PROFILE</CardTitle>
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
                <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">WIN RATE</p>
                <p className="text-2xl font-bold text-accent">{winRate}%</p>
            </div>
          </div>

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
                                  <div className="relative">
                                    <ItemSprite type={listing.itemId} size={40} />
                                    {listing.quantity > 1 && (
                                        <span className="absolute bottom-0 right-0 bg-primary text-[0.4rem] px-0.5 font-bold">x{listing.quantity}</span>
                                    )}
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[0.5rem] text-yellow-400 font-bold">{listing.price}G</p>
                                    <p className="text-[0.35rem] text-muted-foreground uppercase">{listing.listingType}</p>
                                  </div>
                                  {isMe && (
                                      <button className="absolute -top-1 -right-1 bg-destructive text-white p-0.5" onClick={() => cancelListing(slot)}>
                                          <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                  )}
                               </div>
                           ) : isMe ? (
                               <button className="w-full h-full flex flex-col items-center justify-center hover:bg-primary/5 transition-colors" onClick={() => listItemsForMarket(slot)}>
                                  <UserPlus className="h-6 w-6 text-muted-foreground/40" />
                                  <span className="text-[0.4rem] text-muted-foreground uppercase mt-2">Add Item</span>
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

          <div className="text-center pt-10">
             <Link href="/">
                <Button variant="ghost" className="text-[10px] uppercase">Return to Battle</Button>
            </Link>
          </div>

          {isMe && (
              <div className="mt-12 pt-6 border-t border-destructive/20 flex justify-center">
                  <Button 
                    variant="outline" 
                    className="text-[8px] text-destructive border-destructive/30 hover:bg-destructive/10 uppercase py-6 px-4"
                    onClick={() => setIsDeleteAccountOpen(true)}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" /> Terminate Account
                  </Button>
              </div>
          )}
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
                      {selectedTypeForListing ? (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 bg-muted/10 p-3 border border-border/30">
                                <ItemSprite type={selectedTypeForListing.type} size={40} />
                                <div>
                                    <p className="text-[0.7rem] text-white uppercase font-bold">{ITEM_METADATA[selectedTypeForListing.type].name}</p>
                                    <p className="text-[0.5rem] text-muted-foreground uppercase">Stock: {selectedTypeForListing.count}</p>
                                </div>
                                <Button variant="ghost" size="sm" className="ml-auto text-[0.4rem] uppercase h-6" onClick={() => setSelectedTypeForListing(null)}>Change</Button>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[0.6rem] uppercase text-muted-foreground px-1">Quantity to Sell</Label>
                                <div className="flex items-center gap-4 bg-muted/20 p-2 border border-primary/20">
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => setListingQuantity(Math.max(1, listingQuantity - 1))}
                                        disabled={listingQuantity <= 1}
                                    >
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    <input 
                                        type="number" 
                                        value={listingQuantity} 
                                        onChange={(e) => setListingQuantity(Math.max(1, Math.min(Number(e.target.value), selectedTypeForListing.count)))}
                                        className="bg-transparent border-none w-full text-white font-pixel text-center text-sm focus:outline-none"
                                        min="1"
                                        max={selectedTypeForListing.count}
                                    />
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-8 w-8" 
                                        onClick={() => setListingQuantity(Math.min(selectedTypeForListing.count, listingQuantity + 1))}
                                        disabled={listingQuantity >= selectedTypeForListing.count}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-[0.4rem] text-muted-foreground text-center uppercase">Selling {listingQuantity} of {selectedTypeForListing.count}</p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[0.6rem] uppercase text-muted-foreground px-1">Asking Price (Gold)</Label>
                                <div className="flex items-center gap-2 bg-muted/20 p-2 border border-primary/20">
                                    <Coins className="h-4 w-4 text-yellow-500" />
                                    <input 
                                        type="number" 
                                        value={listingPrice} 
                                        onChange={(e) => setListingPrice(Number(e.target.value))}
                                        className="bg-transparent border-none w-full text-white font-pixel text-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            {listingQuantity > 1 && (
                                <div className="space-y-2">
                                    <Label className="text-[0.6rem] uppercase text-muted-foreground px-1">Selling Mode</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button 
                                            variant={listingMode === 'each' ? 'default' : 'outline'} 
                                            className="h-10 text-[0.5rem] uppercase"
                                            onClick={() => setListingMode('each')}
                                        >
                                            {listingMode === 'each' && <Check className="h-3 w-3 mr-1" />}
                                            {listingPrice}G Each
                                        </Button>
                                        <Button 
                                            variant={listingMode === 'all' ? 'default' : 'outline'} 
                                            className="h-10 text-[0.5rem] uppercase"
                                            onClick={() => setListingMode('all')}
                                        >
                                            {listingMode === 'all' && <Check className="h-3 w-3 mr-1" />}
                                            {listingPrice}G All ({listingQuantity})
                                        </Button>
                                    </div>
                                    <p className="text-[0.4rem] text-muted-foreground italic text-center uppercase">
                                        {listingMode === 'each' ? "Buyer buys 1 at a time." : "Buyer must buy the whole stack."}
                                    </p>
                                </div>
                            )}

                            <Button className="w-full h-12 text-[0.7rem] uppercase mt-2" onClick={handleListing}>Confirm Listing</Button>
                        </div>
                      ) : (
                        <>
                            <p className="text-[0.6rem] uppercase text-muted-foreground px-1">Select from Inventory:</p>
                            <ScrollArea className="h-64 pr-2">
                                <div className="grid grid-cols-4 gap-2">
                                    {userData?.inventory?.map((item, idx) => (
                                        <button key={idx} className="aspect-[10/12] border-2 border-border flex flex-col items-center justify-center hover:border-primary transition-colors bg-black relative" onClick={() => setSelectedTypeForListing(item)}>
                                            <ItemSprite type={item.type} size={40} />
                                            <span className="absolute bottom-0 right-0 bg-primary text-[0.45rem] px-0.5 font-bold">x{item.count}</span>
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </>
                      )}
                      
                      <Button variant="ghost" className="w-full text-[0.6rem] uppercase h-8" onClick={() => setIsListingItem(null)}>Cancel</Button>
                  </CardContent>
              </Card>
          </div>
      )}

      {/* ACCOUNT DELETION OVERLAY */}
      <Dialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen}>
          <DialogContent className="bg-black border-2 border-destructive font-pixel sm:max-w-md z-[120]">
              <DialogHeader>
                  <div className="flex items-center gap-2 text-destructive mb-2">
                    <ShieldAlert className="h-5 w-5" />
                    <DialogTitle className="text-sm uppercase">Irreversible Action</DialogTitle>
                  </div>
                  <DialogDescription className="text-[0.6rem] text-white/70 uppercase leading-relaxed">
                    You are about to delete your account. All gold, levels, items, and progress will be lost forever.
                  </DialogDescription>
              </DialogHeader>
              
              <div className="py-4 space-y-4">
                  <div className="space-y-2">
                      <Label className="text-[0.5rem] uppercase text-muted-foreground px-1">Verify Identity (Password)</Label>
                      <Input 
                        type="password" 
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        className="bg-black border-destructive/40 text-white font-sans text-sm h-10"
                        placeholder="••••••••"
                      />
                  </div>
              </div>

              <DialogFooter className="gap-2 sm:flex-col lg:flex-row">
                  <Button variant="ghost" onClick={() => setIsDeleteAccountOpen(false)} className="text-[0.6rem] uppercase h-10">Cancel</Button>
                  <Button 
                    variant="destructive" 
                    onClick={confirmDeleteAccount} 
                    className="text-[0.6rem] uppercase h-10"
                    disabled={!deletePassword || isDeleting}
                  >
                    {isDeleting ? "Exiling..." : "Confirm Deletion"}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
