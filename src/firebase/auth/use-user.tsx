'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';
import type { InventoryItem, InventoryItemType, BoardState, PlayerColor, Piece } from '@/types';
import { ITEM_METADATA } from '@/types';

interface DungeonState {
  level: number;
  board: any[]; // Use any[] for the flattened board from Firestore
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

// Generate item list dynamically from the central metadata to avoid missing items
const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const DEFAULT_INVENTORY: InventoryItem[] = ITEM_TYPES.map(type => ({
  type,
  count: 5
}));

const PLAYTEST_UNLOCKS = ['dancer', 'mimic', 'grappler'];

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
            
            // LEGACY MIGRATION: poison_dagger -> poison_sword
            let needsUpdate = false;
            
            // 1. Migrate Inventory
            if (data.inventory) {
                data.inventory = data.inventory.map(item => {
                    if ((item.type as any) === 'poison_dagger') {
                        needsUpdate = true;
                        return { ...item, type: 'poison_sword' as InventoryItemType };
                    }
                    return item;
                });
            }

            // 2. Migrate Equipment
            if (data.equipment) {
                for (const key in data.equipment) {
                    if (data.equipment[key] === 'poison_dagger') {
                        needsUpdate = true;
                        data.equipment[key] = 'poison_sword';
                    }
                }
            }

            // 3. Migrate Dungeon State
            if (data.dungeonState?.board) {
                data.dungeonState.board = data.dungeonState.board.map((sq: any) => {
                    if (sq.piece?.heldItem === 'poison_dagger') {
                        needsUpdate = true;
                        return { ...sq, piece: { ...sq.piece, heldItem: 'poison_sword' } };
                    }
                    return sq;
                });
            }
            
            // PLAYTEST INITIALIZATION: Ensure inventory has ALL items (including new ones) for testing.
            const currentInventoryMap = new Map(data.inventory?.map(i => [i.type, i.count]) || []);
            
            const updatedInventory: InventoryItem[] = ITEM_TYPES.map(type => {
              const existingCount = currentInventoryMap.get(type);
              if (existingCount === undefined || existingCount < 5) {
                needsUpdate = true;
                return { type, count: 5 };
              }
              return { type, count: existingCount };
            });

            // PLAYTEST INITIALIZATION: Force special piece unlocks for all testers
            const currentUnlocks = data.unlockedPieces || [];
            const updatedUnlocks = Array.from(new Set([...currentUnlocks, ...PLAYTEST_UNLOCKS]));
            if (updatedUnlocks.length !== currentUnlocks.length) {
              needsUpdate = true;
              data.unlockedPieces = updatedUnlocks;
            }

            if (needsUpdate || !data.inventory) {
                setDoc(userRef, { 
                    inventory: updatedInventory, 
                    unlockedPieces: updatedUnlocks,
                    equipment: data.equipment || {},
                    dungeonState: data.dungeonState || null 
                }, { merge: true });
                setUserData({ ...data, inventory: updatedInventory, unlockedPieces: updatedUnlocks });
            } else {
                setUserData(data);
            }
          } else {
            // New user initialization
            const newUserProfile: UserData = {
              username: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0,5)}`,
              email: firebaseUser.email || 'anonymous',
              eloRating: 1200,
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
