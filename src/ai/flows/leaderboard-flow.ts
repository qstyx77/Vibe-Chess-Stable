'use server';
/**
 * @fileOverview A server-side flow to update the leaderboard.
 *
 * - updateLeaderboard - A function that fetches top users and updates a public leaderboard document.
 */

import { ai } from '@/ai/genkit';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, setDoc } from 'firebase-admin/firestore';
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { firebaseConfig } from '@/firebase/config';

// Initialize Firebase Admin SDK if not already initialized
let adminApp: App;
if (!getApps().length) {
    console.log("Initializing Firebase Admin SDK...");
    // In a real production environment, you would use service account credentials from a secure source
    // For this environment, we will log a warning if the config is not what we expect
    if (process.env.GCLOUD_PROJECT && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
       adminApp = initializeApp({
          projectId: process.env.GCLOUD_PROJECT,
       });
    } else {
        console.warn("Firebase Admin SDK is being initialized without standard credentials. This may fail in some environments.");
        adminApp = initializeApp({ projectId: firebaseConfig.projectId });
    }
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
      console.log('Running updateLeaderboard flow on project:', adminApp.options.projectId);
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('eloRating', 'desc'),
        limit(10)
      );

      const querySnapshot = await getDocs(usersQuery);
      console.log(`Found ${querySnapshot.docs.length} users in the database.`);
      const topPlayers = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('User data:', data);
        return {
            id: doc.id,
            username: data.username,
            eloRating: data.eloRating,
        };
      });

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
