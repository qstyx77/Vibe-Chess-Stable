'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';
import type { InventoryItem, InventoryItemType } from '@/types';

interface UserData {
  username: string;
  email: string;
  eloRating: number;
  wins: number;
  losses: number;
  inventory?: InventoryItem[];
  equipment?: Record<string, string>;
}

const ITEM_TYPES: InventoryItemType[] = [
  'mirror_shield', 'swift_cloak', 'passive_armor', 'cardinal_greaves', 'drift_boots',
  'queens_peace', 'wind_sword', 'middle_way', 'phoenix_down', 'wind_scroll',
  'life_leach', 'summon_anvil', 'wind_cloak', 'gnosis', 'shield_scroll',
  'rally_scroll', 'poison_dagger', 'antidote', 'crossbow', 'poison_tunic',
  'detonation_scroll', 'phase_boots', 'swap_scroll', 'grimoir', 'soul_link',
  'logas', 'berserkers_mask', 'ice_scroll', 'resurrection_scroll', 'faith_scroll',
  'tortoise_hammer', 'leach_blade', 'fireball_scroll', 'portal_scroll_20',
  'portal_scroll_30', 'portal_scroll_40', 'health_potion', 'mana_potion',
  'speed_potion', 'poison_flask', 'apple', 'ham', 'cheese', 'steak', 'bread',
  'grapes', 'fire_book', 'ice_book', 'lightning_book', 'iron_helmet',
  'plate_armor', 'wizard_robe', 'leather_armor', 'buckler', 'iron_shield',
  'spiked_shield', 'iron_sword', 'claymore', 'battle_axe', 'mace', 'long_bow',
  'magic_staff', 'wand', 'gold_ring', 'ruby_ring', 'emerald_pendant',
  'pickaxe', 'torch'
];

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
