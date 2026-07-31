
'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth, updateDocumentNonBlocking } from '@/firebase';
import type { InventoryItem, InventoryItemType, BoardState, PlayerColor, Piece } from '@/types';
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
}

const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const DEFAULT_INVENTORY: InventoryItem[] = ITEM_TYPES.map(type => ({
  type,
  count: 5
}));

const PLAYTEST_UNLOCKS = ['dancer', 'mimic', 'grappler', 'myco_mage'];

export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const db = getFirestore();
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserData;
            let needsUpdate = false;
            
            // --- PLAYTEST OVERRIDE FOR SUGGA ---
            if (data.username === 'SUGGA' && data.eloRating < 2100) {
              data.eloRating = 2100;
              needsUpdate = true;
            }

            // --- INVENTORY INITIALIZATION (DEEP CHECK) ---
            const currentInventoryMap = new Map(data.inventory?.map(i => [i.type, i.count]) || []);
            let inventoryChanged = false;
            const updatedInventory: InventoryItem[] = ITEM_TYPES.map(type => {
              const existingCount = currentInventoryMap.get(type);
              // Initialize with 5 if missing or below playtest threshold
              if (existingCount === undefined || existingCount < 5) {
                inventoryChanged = true;
                return { type, count: 5 };
              }
              return { type, count: existingCount };
            });

            if (inventoryChanged) {
              data.inventory = updatedInventory;
              needsUpdate = true;
            }

            // --- SPECIAL PIECE UNLOCKS ---
            const currentUnlocks = data.unlockedPieces || [];
            const updatedUnlocks = Array.from(new Set([...currentUnlocks, ...PLAYTEST_UNLOCKS]));
            if (updatedUnlocks.length !== currentUnlocks.length) {
              needsUpdate = true;
              data.unlockedPieces = updatedUnlocks;
            }

            if (needsUpdate) {
                updateDocumentNonBlocking(userRef, { 
                    eloRating: data.eloRating,
                    inventory: data.inventory, 
                    unlockedPieces: data.unlockedPieces,
                    equipment: data.equipment || {},
                    dungeonState: data.dungeonState || null 
                });
                setUserData({ ...data });
            } else {
                setUserData(data);
            }
          } else {
            const newUserProfile: UserData = {
              username: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0,5)}`,
              email: firebaseUser.email || 'anonymous',
              eloRating: firebaseUser.displayName === 'SUGGA' ? 2100 : 1200,
              wins: 0,
              losses: 0,
              inventory: DEFAULT_INVENTORY,
              equipment: {},
              unlockedPieces: PLAYTEST_UNLOCKS,
              colossusDefeats: 0
            };
            setDoc(userRef, newUserProfile, { merge: true }).catch(error => {
                console.error("Error creating user profile:", error);
            });
            setUserData(newUserProfile);
          }
          setIsUserLoading(false);
        });

        return () => unsubProfile();

      } else {
        setUser(null);
        setUserData(null);
        setIsUserLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  return { user, userData, isUserLoading };
}
