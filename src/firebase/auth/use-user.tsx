
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
  goldResetV1?: boolean;
  hanzFixV1?: boolean;
  processedTransactions?: string[];
  lootSyncV2?: boolean;
  oilSyncV1?: boolean;
  gamblerSyncV1?: boolean;
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
  const hasInitialized = useRef<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up existing profile listener if switching users
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

    // Prevent multiple parallel initialization runs
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
            eloRating: user.displayName === 'SUGGA' ? 2100 : 1200,
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
            oilSyncV1: true,
            gamblerSyncV1: true
          };
        } else {
          currentData = snap.data() as UserData;
        }

        let needsUpdate = false;
        const updates: any = {};

        // Hanz Schemin' Compensation
        const rawUsername = (currentData.username || "").trim();
        const normalizedUsername = rawUsername.toLowerCase().replace(/[\u2018\u2019]/g, "'");
        if (normalizedUsername === "hanz schemin'" && !currentData.hanzFixV1) {
          updates.goldBalance = (currentData.goldBalance || 0) + 600;
          updates.hanzFixV1 = true;
          needsUpdate = true;
        }

        // Special ELO cases
        if (currentData.username === 'SUGGA' && (currentData.eloRating || 0) < 2100) {
          updates.eloRating = 2100;
          needsUpdate = true;
        }

        // Inventory Integrity Check
        const currentInv = currentData.inventory || [];
        const currentInvMap = new Map(currentInv.map(i => [i.type, i.count]));
        let inventoryNeedsSync = false;
        
        // Force sync for new playtest items if flag is missing
        if (!currentData.gamblerSyncV1) {
            inventoryNeedsSync = true;
            updates.gamblerSyncV1 = true;
        }

        const updatedInventory: InventoryItem[] = ITEM_TYPES.map(type => {
          const count = currentInvMap.get(type);
          if (count === undefined) {
            inventoryNeedsSync = true;
            return { type, count: 5 };
          }
          return { type, count };
        });

        if (inventoryNeedsSync) {
          updates.inventory = updatedInventory;
          needsUpdate = true;
        }

        if (currentData.marketSlots === undefined) {
          updates.marketSlots = [];
          needsUpdate = true;
        }
        if (currentData.processedTransactions === undefined) {
          updates.processedTransactions = [];
          needsUpdate = true;
        }

        const currentUnlocks = currentData.unlockedPieces || [];
        const nextUnlocks = Array.from(new Set([...currentUnlocks, ...PLAYTEST_UNLOCKS]));
        if (nextUnlocks.length !== currentUnlocks.length) {
          updates.unlockedPieces = nextUnlocks;
          needsUpdate = true;
        }

        if (isNewUser) {
          await setDoc(userRef, { ...currentData, ...updates }, { merge: true });
        } else if (needsUpdate && Object.keys(updates).length > 0) {
          updateDocumentNonBlocking(userRef, updates);
        }
      } catch (e) {
        console.warn("User initialization cycle error:", e);
        hasInitialized.current = null; // Allow retry on failure
      }
    };

    ensureInitialized();
  }, [user, isUserLoading]);

  return { user, userData, isUserLoading };
}
