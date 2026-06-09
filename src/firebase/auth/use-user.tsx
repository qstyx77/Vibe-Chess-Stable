
'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';
import type { InventoryItem } from '@/types';

interface UserData {
  username: string;
  email: string;
  eloRating: number;
  wins: number;
  losses: number;
  inventory?: InventoryItem[];
  equipment?: Record<string, string>;
}

const DEFAULT_INVENTORY: InventoryItem[] = [
  { type: 'mirror_shield', count: 1 },
  { type: 'swift_cloak', count: 1 },
  { type: 'passive_armor', count: 2 },
  { type: 'cardinal_greaves', count: 1 },
  { type: 'drift_boots', count: 1 },
  { type: 'queens_peace', count: 1 },
  { type: 'wind_sword', count: 1 },
  { type: 'middle_way', count: 1 },
  { type: 'phoenix_down', count: 1 },
  { type: 'wind_scroll', count: 1 },
  { type: 'life_leach', count: 1 },
  { type: 'summon_anvil', count: 1 },
  { type: 'wind_cloak', count: 1 },
  { type: 'gnosis', count: 1 },
  { type: 'shield_scroll', count: 1 },
  { type: 'rally_scroll', count: 1 },
  { type: 'poison_dagger', count: 1 },
  { type: 'antidote', count: 1 },
  { type: 'crossbow', count: 1 },
  { type: 'poison_tunic', count: 1 },
  { type: 'detonation_scroll', count: 1 },
  { type: 'phase_boots', count: 1 },
  { type: 'swap_scroll', count: 1 },
  { type: 'grimoir', count: 2 },
  { type: 'soul_link', count: 2 },
  { type: 'logas', count: 2 },
  { type: 'berserkers_mask', count: 2 },
  { type: 'ice_scroll', count: 2 },
  { type: 'resurrection_scroll', count: 2 },
  { type: 'faith_scroll', count: 2 },
  { type: 'tortoise_hammer', count: 2 },
  { type: 'leach_blade', count: 2 }
];

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
            setUserData(docSnap.data() as UserData);
          } else {
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
