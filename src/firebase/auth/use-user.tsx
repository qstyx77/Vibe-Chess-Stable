
'use client';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';

interface UserData {
  username: string;
  email: string;
  eloRating: number;
  wins: number;
  losses: number;
}

export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const db = getFirestore();
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Set up a real-time listener for the user's profile data
        const unsubProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserData(docSnap.data() as UserData);
          } else {
            // If the document doesn't exist, create it.
            const newUserProfile: UserData = {
              username: firebaseUser.displayName || `Player-${firebaseUser.uid.slice(0,5)}`,
              email: firebaseUser.email || 'anonymous',
              eloRating: 1200,
              wins: 0,
              losses: 0,
            };
            // Use non-blocking setDoc
            setDoc(userRef, newUserProfile, { merge: true }).catch(error => {
                console.error("Error creating user profile:", error);
                // Optionally emit a global error here
            });
            setUserData(newUserProfile);
          }
          setIsLoading(false);
        });

        // Return the unsubscribe function for the profile listener
        return () => unsubProfile();

      } else {
        setUser(null);
        setUserData(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth]);

  return { user, userData, isLoading };
}

    