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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const db = getFirestore();
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            setUserData({ ...data, id: firebaseUser.uid });
          } else {
            setUserData(null);
          }
          setIsUserLoading(false);
        });

        return () => unsubProfile();

      } else {
        setUser(null);
        setUserData(null);
        setIsUserLoading(false);
        hasInitialized.current = null;
      }
    });

    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!user || isUserLoading) return;
    if (hasInitialized.current === user.uid) return;

    const db = getFirestore();
    const userRef = doc(db, 'users', user.uid);

    const ensureInitialized = async () => {
      try {
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
          const newUserProfile: UserData = {
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
            goldResetV1: true,
            processedTransactions: []
          };
          await setDoc(userRef, newUserProfile, { merge: true });
        } else {
          const data = snap.data() as UserData;
          let needsUpdate = false;
          const updates: any = {};

          if (data.goldResetV1 !== true) {
            updates.goldBalance = 0;
            updates.goldResetV1 = true;
            needsUpdate = true;
          }

          // Hanz Schemin' Compensation Fix
          if (data.username === 'Hanz Schemin\'' && !data.hanzFixV1) {
            updates.goldBalance = (data.goldBalance || 0) + 600;
            updates.hanzFixV1 = true;
            needsUpdate = true;
          }

          if (data.username === 'SUGGA' && (data.eloRating || 0) < 2100) {
            updates.eloRating = 2100;
            needsUpdate = true;
          }

          const currentInv = data.inventory || [];
          const currentInvMap = new Map(currentInv.map(i => [i.type, i.count]));
          let inventoryMissingItems = false;
          const updatedInventory: InventoryItem[] = ITEM_TYPES.map(type => {
            const count = currentInvMap.get(type);
            if (count === undefined) {
              inventoryMissingItems = true;
              return { type, count: 5 };
            }
            return { type, count };
          });

          if (inventoryMissingItems) {
            updates.inventory = updatedInventory;
            needsUpdate = true;
          }

          if (data.goldBalance === undefined) {
            updates.goldBalance = 0;
            needsUpdate = true;
          }
          if (data.marketSlots === undefined) {
            updates.marketSlots = [];
            needsUpdate = true;
          }
          if (data.processedTransactions === undefined) {
            updates.processedTransactions = [];
            needsUpdate = true;
          }

          const currentUnlocks = data.unlockedPieces || [];
          const nextUnlocks = Array.from(new Set([...currentUnlocks, ...PLAYTEST_UNLOCKS]));
          if (nextUnlocks.length !== currentUnlocks.length) {
            updates.unlockedPieces = nextUnlocks;
            needsUpdate = true;
          }

          if (needsUpdate) {
            updateDocumentNonBlocking(userRef, updates);
          }
        }
        hasInitialized.current = user.uid;
      } catch (e) {
        console.error("User initialization failed:", e);
      }
    };

    ensureInitialized();
  }, [user, isUserLoading]);

  return { user, userData, isUserLoading };
}
