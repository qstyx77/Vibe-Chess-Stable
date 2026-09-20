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
  dungeonState?: DungeonState;
  unlockedPieces?: string[];
  colossusDefeats?: number;
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
}

const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const PLAYTEST_UNLOCKS = ['dancer', 'mimic', 'grappler', 'myco_mage'];

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
            unlockedPieces: PLAYTEST_UNLOCKS,
            colossusDefeats: 0,
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

        // Forced sync for Batch 18 Playtesting (Rosary, Obsidian Blade, Lose Faith)
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
