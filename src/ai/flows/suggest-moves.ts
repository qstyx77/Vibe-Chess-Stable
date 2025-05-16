'use server';

/**
 * @fileOverview Suggests a list of reasonable moves a player could make, ordered from 'safest' to 'riskiest'.
 *
 * - suggestMoves - A function that handles the move suggestion process.
 * - SuggestMovesInput - The input type for the suggestMoves function.
 * - SuggestMovesOutput - The return type for the suggestMoves function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestMovesInputSchema = z.object({
  boardState: z.string().describe('A string representation of the current chess board state.'),
  playerToMove: z.enum(['white', 'black']).describe('The player whose turn it is to move.'),
});
export type SuggestMovesInput = z.infer<typeof SuggestMovesInputSchema>;

const MoveSuggestionSchema = z.object({
  move: z.string().describe('A string representation of the suggested move.'),
  boardStateValueChangeEstimate: z.number().describe('The estimated change in board state value after this move, expressed as the number of remaining pieces held by each player.'),
  reason: z.string().describe('The reason why this move is suggested.'),
});

const SuggestMovesOutputSchema = z.array(MoveSuggestionSchema).describe('A list of suggested moves, ordered from safest to riskiest.');
export type SuggestMovesOutput = z.infer<typeof SuggestMovesOutputSchema>;

export async function suggestMoves(input: SuggestMovesInput): Promise<SuggestMovesOutput> {
  return suggestMovesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestMovesPrompt',
  input: {schema: SuggestMovesInputSchema},
  output: {schema: SuggestMovesOutputSchema},
  prompt: `You are an expert chess strategist. Given the current board state and the player to move, suggest a list of reasonable moves, ordered from safest to riskiest.

Board State:
{{boardState}}

Player to Move: {{playerToMove}}

Consider the estimated change in board state value after each move, expressed as the number of remaining pieces held by each player. The safer the move, the smaller the change in board state value.

Format your response as a JSON array of move suggestions.
`,
});

const suggestMovesFlow = ai.defineFlow(
  {
    name: 'suggestMovesFlow',
    inputSchema: SuggestMovesInputSchema,
    outputSchema: SuggestMovesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
