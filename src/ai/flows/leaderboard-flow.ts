'use server';
/**
 * @fileOverview A server-side flow to update the leaderboard.
 *
 * - updateLeaderboard - A function that fetches top users and updates a public leaderboard document.
 */

import { ai } from '@/ai/genkit';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, setDoc } from 'firebase-admin/firestore';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { firebaseConfig } from '@/firebase/config';

// Initialize Firebase Admin SDK if not already initialized
let adminApp: App;
if (!getApps().length) {
    console.log("Initializing Firebase Admin SDK...");
    // In this environment, we check for standard Google Cloud environment variables
    // which should be present for server-side functions.
    if (process.env.GCLOUD_PROJECT) {
       adminApp = initializeApp({
          projectId: process.env.GCLOUD_PROJECT,
       });
    } else {
        console.warn("Firebase Admin SDK is being initialized without standard GCLOUD_PROJECT credential. This may fail. Falling back to local config.");
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
      
      if (querySnapshot.empty) {
        console.log("No users found. The 'users' collection might be empty or the query is incorrect.");
      }

      const topPlayers = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Processing user data:', {id: doc.id, username: data.username, elo: data.eloRating});
        return {
            id: doc.id,
            username: data.username,
            eloRating: data.eloRating,
        };
      });

      const leaderboardRef = doc(db, 'leaderboard', 'top10');
      await setDoc(leaderboardRef, { players: topPlayers, updatedAt: new Date().toISOString() });
      
      console.log('Leaderboard updated successfully with', topPlayers.length, 'players.');
      return { success: true, players: topPlayers.length, details: topPlayers };
    } catch (error) {
      console.error('Error updating leaderboard:', error);
      return { success: false, error: (error as Error).message };
    }
  }
);

// We can expose a simple function to trigger it if needed, or set it up to run on a schedule.
export async function triggerLeaderboardUpdate() {
  console.log("triggerLeaderboardUpdate called. Executing flow...");
  const result = await updateLeaderboard();
  console.log("Leaderboard flow finished with result:", result);
  return result;
}
