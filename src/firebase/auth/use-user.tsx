'use client';
import { doc, getFirestore, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged, getAuth, signOut } from 'firebase/auth';
import { updateDocumentNonBlocking } from '@/firebase';
import type { InventoryItem, InventoryItemType, PlayerColor, Piece, MarketListing } from '@/types';
import { ITEM_METADATA } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface DungeonState {
  level: number;
  board: any[]; 
  currentPlayer: PlayerColor;
  killStreaks: { white: number, black: number };
  capturedPieces: { white: Piece[], black: Piece[] };
  shroomSpawnCounter: number;
  nextShroomSpawnTurn: number;
  enPassantTargetSquare: string | null;
  necroResurrectionCounter?: number;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  eloRating: number;
  wins: number;
  losses: number;
  inventory?: InventoryItem[];
  equipment?: Record<string, string>;
  blackEquipment?: Record<string, string>;
  dungeonState?: DungeonState;
  unlockedPieces?: string[];
  colossusDefeats?: number;
  mirageDefeats?: number;
  necromancerDefeats?: number;
  voidDefeats?: number;
  goldBalance: number;
  marketSlots?: MarketListing[];
  lastActive?: string;
  processedTransactions?: string[];
  role?: 'admin' | 'player';
  mutedUntil?: number;
  bannedUntil?: number;
  adminActiveV1?: boolean;
  lootSyncV18?: boolean;
  suggaRestoreV2?: boolean;
}

const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const PLAYTEST_UNLOCKS: string[] = [];

/**
 * Hook to manage and provide current user data.
 */
export function useUser() {
  const auth = getAuth();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [userError, setUserError] = useState<Error | null>(null);
  const hasInitialized = useRef<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        const db = getFirestore();
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            
            // BAN CHECK
            if (data.bannedUntil && data.bannedUntil > Date.now()) {
                signOut(auth);
                toast({ 
                    variant: 'destructive', 
                    title: "Account Suspended", 
                    description: `This account is banned until ${new Date(data.bannedUntil).toLocaleString()}` 
                });
                return;
            }

            setUserData({ ...data, id: firebaseUser.uid });
          } else {
            setUserData(null);
          }
          setIsUserLoading(false);
        }, (error) => {
          console.warn("User profile listener error:", error);
          setUserError(error);
          setIsUserLoading(false);
        });

      } else {
        setUser(null);
        setUserData(null);
        setIsUserLoading(false);
        hasInitialized.current = null;
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, [auth, toast]);

  useEffect(() => {
    if (!user || isUserLoading) return;
    if (hasInitialized.current === user.uid) return;

    hasInitialized.current = user.uid;

    const db = getFirestore();
    const userRef = doc(db, 'users', user.uid);

    const ensureInitialized = async () => {
      try {
        const snap = await getDoc(userRef);
        let currentData: UserData;
        let isNewUser = false;

        if (!snap.exists()) {
          isNewUser = true;
          currentData = {
            id: user.uid,
            username: user.displayName || `Player-${user.uid.slice(0,5)}`,
            email: user.email || 'anonymous',
            eloRating: 1200,
            wins: 0,
            losses: 0,
            inventory: ITEM_TYPES.map(type => ({ type, count: 5 })),
            equipment: {},
            blackEquipment: {},
            unlockedPieces: PLAYTEST_UNLOCKS,
            colossusDefeats: 0,
            mirageDefeats: 0,
            necromancerDefeats: 0,
            voidDefeats: 0,
            goldBalance: 0,
            marketSlots: [],
            processedTransactions: [],
            role: 'player',
            lootSyncV18: true,
          };
        } else {
          currentData = snap.data() as UserData;
        }

        let needsUpdate = false;
        const updates: any = {};

        // Targeted grant for account SUGGA - Admin Access
        if (currentData.username === 'SUGGA' && !currentData.adminActiveV1) {
            updates.role = 'admin';
            updates.eloRating = 2100;
            updates.unlockedPieces = ['dancer', 'mimic', 'grappler', 'myco_mage', 'archbishop', 'palace', 'archer'];
            updates.adminActiveV1 = true;
            needsUpdate = true;
        }

        // SQUARE PAYMENT FULFILLMENT CHECK
        const urlParams = new URLSearchParams(window.location.search);
        const checkoutStatus = urlParams.get('checkout_status');
        const itemType = urlParams.get('item_type');

        if (checkoutStatus === 'success' && itemType) {
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);

            const now = Date.now();
            const transactionId = `square_${itemType}_${Math.floor(now / 10000)}`; 
            const processed = currentData.processedTransactions || [];

            if (!processed.includes(transactionId)) {
                updates.processedTransactions = [...processed, transactionId];
                if (itemType === 'gold_100') updates.goldBalance = (currentData.goldBalance || 0) + 100;
                else if (itemType === 'gold_600') updates.goldBalance = (currentData.goldBalance || 0) + 600;
                else if (itemType === 'daily_deal') {
                    const nextInv = [...(currentData.inventory || [])];
                    const rand = () => Math.random();
                    const allItems = Object.keys(ITEM_METADATA) as InventoryItemType[];
                    const rares = allItems.filter(i => ITEM_METADATA[i].rarity === 'rare');
                    const uncommons = allItems.filter(i => ITEM_METADATA[i].rarity === 'uncommon');
                    const commons = allItems.filter(i => ITEM_METADATA[i].rarity === 'common');
                    const pick = (list: any[]) => list[Math.floor(rand() * list.length)];
                    [pick(rares), pick(uncommons), pick(uncommons), pick(commons), pick(commons), pick(commons)].forEach(t => {
                        const idx = nextInv.findIndex(i => i.type === t);
                        if (idx > -1) nextInv[idx].count++;
                        else nextInv.push({ type: t, count: 1 });
                    });
                    updates.inventory = nextInv;
                }
                else {
                    const unlocks = currentData.unlockedPieces || [];
                    if (!unlocks.includes(itemType)) updates.unlockedPieces = [...unlocks, itemType];
                }
                needsUpdate = true;
            }
        }

        const currentInv = currentData.inventory || [];
        const currentInvMap = new Map(currentInv.map(i => [i.type, i.count]));
        let inventoryNeedsSync = false;
        
        const updatedInventory: InventoryItem[] = ITEM_TYPES.map(type => {
          const count = currentInvMap.get(type);
          if (count === undefined) {
            inventoryNeedsSync = true;
            return { type, count: 5 };
          }
          return { type, count };
        });

        if (!currentData.lootSyncV18) {
            const forceAdd: InventoryItemType[] = ['rosary', 'obsidian_blade', 'lose_faith_scroll', 'soul_spark', 'scouts_map'];
            forceAdd.forEach(t => {
                const itemIdx = updatedInventory.findIndex(i => i.type === t);
                if (itemIdx > -1) {
                    if (updatedInventory[itemIdx].count < 5) {
                        updatedInventory[itemIdx].count = 5;
                        inventoryNeedsSync = true;
                    }
                } else {
                    updatedInventory.push({ type: t, count: 5 });
                    inventoryNeedsSync = true;
                }
            });
            updates.lootSyncV18 = true;
            needsUpdate = true;
        }

        if (inventoryNeedsSync) {
          updates.inventory = updatedInventory;
          needsUpdate = true;
        }

        if (isNewUser) {
          await setDoc(userRef, { ...currentData, ...updates }, { merge: true });
        } else if (needsUpdate && Object.keys(updates).length > 0) {
          updateDocumentNonBlocking(userRef, updates);
        }
      } catch (e) {
        console.warn("User initialization cycle error:", e);
        hasInitialized.current = null;
      }
    };

    ensureInitialized();
  }, [user, isUserLoading]);

  return { user, userData, isUserLoading, userError };
}
