'use client';
import { doc, setDoc, getDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  eloRating: number;
  wins: number;
  losses: number;
  createdAt: any; // Using 'any' for serverTimestamp flexibility
}

/**
 * Creates a new user profile document in Firestore.
 * This is intended to be called right after a user signs up.
 */
export function createUserProfile(
  db: Firestore,
  userId: string,
  email: string,
  username: string
) {
  const userProfileRef = doc(db, 'users', userId);
  const newUserProfile: Omit<UserProfile, 'uid' | 'createdAt'> & { createdAt: any } = {
    email,
    username,
    eloRating: 1200, // Default ELO
    wins: 0,
    losses: 0,
    createdAt: serverTimestamp(),
  };

  // Non-blocking write operation
  setDoc(userProfileRef, newUserProfile).catch(error => {
    // Emit a contextual error if the write fails due to permissions
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: userProfileRef.path,
        operation: 'create',
        requestResourceData: newUserProfile,
      })
    );
  });
}

/**
 * Fetches a user's profile from Firestore.
 * @returns {Promise<UserProfile | null>} The user profile data or null if not found.
 */
export async function getUserProfile(db: Firestore, userId: string): Promise<UserProfile | null> {
  const userProfileRef = doc(db, 'users', userId);
  try {
    const docSnap = await getDoc(userProfileRef);
    if (docSnap.exists()) {
      return { uid: docSnap.id, ...docSnap.data() } as UserProfile;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
    // In a real app, you might want to handle this more gracefully
    return null;
  }
}
