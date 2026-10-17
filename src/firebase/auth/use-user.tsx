'use client';
import { doc, getFirestore, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth, updateDocumentNonBlocking } from '@/firebase';
import type { InventoryItem, InventoryItemType, PlayerColor, Piece, MarketListing } from '@/types';
import { ITEM_METADATA } from '@/types';

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
  lootSyncV2?: boolean;
  statusSyncV1?: boolean;
  lootSyncV3?: boolean;
  lootSyncV4?: boolean;
  lootSyncV5?: boolean;
  lootSyncV6?: boolean;
  lootSyncV7?: boolean;
  lootSyncV8?: boolean;
  lootSyncV9?: boolean;
  lootSyncV10?: boolean;
  lootSyncV11?: boolean;
  lootSyncV12?: boolean;
  lootSyncV13?: boolean;
  lootSyncV14?: boolean;
  lootSyncV15?: boolean;
  lootSyncV16?: boolean;
  lootSyncV17?: boolean;
  lootSyncV18?: boolean;
  suggaRestoreV1?: boolean;
  suggaRestoreV2?: boolean;
  paymentFulfillmentV1?: boolean;
}

const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const PLAYTEST_UNLOCKS: string[] = [];

/**
 * Hook to manage and provide current user data.
 */
export function useUser() {
  const auth = useAuth();
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
  }, [auth]);

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
            lootSyncV2: true,
            statusSyncV1: true,
            lootSyncV3: true,
            lootSyncV4: true,
            lootSyncV5: true,
            lootSyncV6: true,
            lootSyncV7: true,
            lootSyncV8: true,
            lootSyncV9: true,
            lootSyncV10: true,
            lootSyncV11: true,
            lootSyncV12: true,
            lootSyncV13: true,
            lootSyncV14: true,
            lootSyncV15: true,
            lootSyncV16: true,
            lootSyncV17: true,
            lootSyncV18: true
          };
        } else {
          currentData = snap.data() as UserData;
        }

        let needsUpdate = false;
        const updates: any = {};

        // SQUARE PAYMENT FULFILLMENT CHECK
        const urlParams = new URLSearchParams(window.location.search);
        const checkoutStatus = urlParams.get('checkout_status');
        const itemType = urlParams.get('item_type');

        if (checkoutStatus === 'success' && itemType) {
            // Remove params from URL immediately
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);

            // Simple idempotency check using timestamp window
            const now = Date.now();
            const transactionId = `square_${itemType}_${Math.floor(now / 10000)}`; // 10s window
            const processed = currentData.processedTransactions || [];

            if (!processed.includes(transactionId)) {
                updates.processedTransactions = [...processed, transactionId];
                
                // Gold Packs
                if (itemType === 'gold_100') updates.goldBalance = (currentData.goldBalance || 0) + 100;
                else if (itemType === 'gold_600') updates.goldBalance = (currentData.goldBalance || 0) + 600;
                // Daily Deal (1x Rare, 2x Uncommon, 3x Common)
                else if (itemType === 'daily_deal') {
                    const nextInv = [...(currentData.inventory || [])];
                    const allItems = Object.keys(ITEM_METADATA) as InventoryItemType[];
                    const rares = allItems.filter(i => ITEM_METADATA[i].rarity === 'rare');
                    const uncommons = allItems.filter(i => ITEM_METADATA[i].rarity === 'uncommon');
                    const commons = allItems.filter(i => ITEM_METADATA[i].rarity === 'common');
                    
                    const pick = (list: any[]) => list[Math.floor(rand() * list.length)];
                    const bundle = [pick(rares), pick(uncommons), pick(uncommons), pick(commons), pick(commons), pick(commons)];
                    
                    bundle.forEach(t => {
                        const idx = nextInv.findIndex(i => i.type === t);
                        if (idx > -1) nextInv[idx].count++;
                        else nextInv.push({ type: t, count: 1 });
                    });
                    updates.inventory = nextInv;
                }
                // Units
                else {
                    const unlocks = currentData.unlockedPieces || [];
                    if (!unlocks.includes(itemType)) {
                        updates.unlockedPieces = [...unlocks, itemType];
                    }
                }
                needsUpdate = true;
            }
        }

        // Targeted restore for account SUGGA - Version 2 to ensure reset recovery
        if (currentData.username === 'SUGGA' && !currentData.suggaRestoreV2) {
            updates.eloRating = 2100;
            updates.unlockedPieces = ['dancer', 'mimic', 'grappler', 'myco_mage', 'archbishop', 'palace', 'archer'];
            updates.suggaRestoreV2 = true;
            needsUpdate = true;
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
