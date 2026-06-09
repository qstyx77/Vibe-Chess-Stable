'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';
import type { InventoryItem, InventoryItemType } from '@/types';
import { ITEM_METADATA } from '@/types';

interface UserData {
  username: string;
  email: string;
  eloRating: number;
  wins: number;
  losses: number;
  inventory?: InventoryItem[];
  equipment?: Record<string, string>;
}

// Generate item list dynamically from the central metadata to avoid missing items
const ITEM_TYPES = Object.keys(ITEM_METADATA) as InventoryItemType[];

const DEFAULT_INVENTORY: InventoryItem[] = ITEM_TYPES.map(type => ({
  type,
  count: 5
}));

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
            
            // PLAYTEST OVERRIDE: If inventory is missing or has fewer items than the total available,
            // refresh it to ensure the playtester has access to everything.
            if (!data.inventory || data.inventory.length < ITEM_TYPES.length) {
                const refreshedInventory = [...DEFAULT_INVENTORY];
                // Update Firestore and local state
                setDoc(userRef, { inventory: refreshedInventory }, { merge: true });
                setUserData({ ...data, inventory: refreshedInventory });
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
              equipment: {}
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
