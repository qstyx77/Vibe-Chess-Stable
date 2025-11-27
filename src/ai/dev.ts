
import { config } from 'dotenv';
config();

// Import your flows an actions here to make them available to the Genkit Inspector.
import { updateLeaderboard } from './flows/leaderboard-flow';

// You can look at the Genkit Inspector by using the command:
// genkit:watch
//
// Then opening the inspector by visiting http://127.0.0.1:4000/
//
// The flow(s) below will be available to run in the inspector.
export { updateLeaderboard };
