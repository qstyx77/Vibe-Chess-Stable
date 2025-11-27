'use server';
/**
 * @fileOverview A server-side flow to update the leaderboard.
 *
 * - updateLeaderboard - A function that fetches top users and updates a public leaderboard document.
 */

import { ai } from '@/ai/genkit';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, setDoc } from 'firebase-admin/firestore';
import { initializeApp, getApps, App } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp();
} else {
  adminApp = getApps()[0];
}

const db = getFirestore(adminApp);

export const updateLeaderboard = ai.defineFlow(
  {
    name: 'updateLeaderboard',
  },
  async () => {
    try {
      console.log('Running updateLeaderboard flow...');
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('eloRating', 'desc'),
        limit(10)
      );

      const querySnapshot = await getDocs(usersQuery);
      const topPlayers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        username: doc.data().username,
        eloRating: doc.data().eloRating,
      }));

      const leaderboardRef = doc(db, 'leaderboard', 'top10');
      await setDoc(leaderboardRef, { players: topPlayers, updatedAt: new Date().toISOString() });
      
      console.log('Leaderboard updated successfully with', topPlayers.length, 'players.');
      return { success: true, players: topPlayers.length };
    } catch (error) {
      console.error('Error updating leaderboard:', error);
      return { success: false, error: (error as Error).message };
    }
  }
);

// We can expose a simple function to trigger it if needed, or set it up to run on a schedule.
export async function triggerLeaderboardUpdate() {
  return await updateLeaderboard();
}
