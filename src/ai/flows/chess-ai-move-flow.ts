
'use server';
/**
 * @fileOverview A Genkit flow for suggesting chess moves for an AI player.
 *
 * - callChessAiMoveFlow - A function that invokes the AI to get a chess move.
 * - ChessAiMoveInput - The input type for the flow.
 * - ChessAiMoveOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ChessAiMoveInputSchema = z.object({
  boardString: z.string().describe('A string representation of the current chess board state, including piece locations, types, colors, levels, and special statuses. Also indicates whose turn it is.'),
  playerColor: z.enum(['white', 'black']).describe('The color the AI is playing as.'),
});
export type ChessAiMoveInput = z.infer<typeof ChessAiMoveInputSchema>;

const ChessAiMoveOutputSchema = z.object({
  from: z.string().describe('The algebraic notation of the square the piece is moving from (e.g., "e7").'),
  to: z.string().describe('The algebraic notation of the square the piece is moving to (e.g., "e5").'),
  reasoning: z.string().optional().describe('A brief explanation for the chosen move.'),
});
export type ChessAiMoveOutput = z.infer<typeof ChessAiMoveOutputSchema>;

export async function callChessAiMoveFlow(input: ChessAiMoveInput): Promise<ChessAiMoveOutput> {
  return chessAiMoveFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chessAiMovePrompt',
  input: { schema: ChessAiMoveInputSchema },
  output: { schema: ChessAiMoveOutputSchema },
  prompt: `You are a strategic chess AI playing as {{playerColor}} in a game of VIBE CHESS, where pieces can level up and gain special abilities.
The current board state is:
{{boardString}}

Your opponent is ${process.env.NEXT_PUBLIC_PLAYER_NAME || 'White'}.
Your task is to choose the best possible single move for {{playerColor}}.
Consider the following:
- Standard chess rules apply for movement and captures.
- Piece levels and their special abilities are indicated in the board string (e.g., L2 for Level 2, I for Invulnerable Rook).
  - Pawns L2+: Can move 1 square backward.
  - Pawns L3+: Can also move 1 square sideways.
  - Pawns L4+: Push-back: If moved adjacent to an enemy, pushes enemy 1 square further if empty.
  - Knights L2+: Can move 1 square cardinally.
  - Knights L3+: Can jump 3 squares cardinally.
  - Knights L4+: Can swap with a friendly Bishop.
  - Bishops L2+: Can jump over friendly pieces.
  - Bishops L3+: Immune to pawn capture.
  - Bishops L4+: Can swap with a friendly Knight.
  - Bishops L5+: 50% chance to convert adjacent enemy (non-King) to own color.
  - Rooks L3+: Become invulnerable for 1 opponent turn after leveling up to L3+. (Promoted Rooks are invulnerable for 1 opponent turn from L1).
  - Queens L5+: Invulnerable to attacks from lower-level pieces.
  - Kings L2+: Can move/capture up to 2 squares. (Path must be clear for linear 2-square moves).
- Prioritize moves that protect your King, lead to checkmate, gain material advantage, or improve your strategic position by leveraging piece levels and abilities.
- If a pawn can be promoted, assume it will be promoted to a Queen for this move suggestion.

Provide your chosen move as a JSON object with "from" and "to" keys using algebraic notation. Include a brief "reasoning" for your choice.
Example: {"from": "e7", "to": "e5", "reasoning": "Develop pawn to control center."}
Ensure the move is legal according to the rules and current board state.
It is {{playerColor}}'s turn to move.
`,
  config: {
    temperature: 0.5, // A bit of creativity but not too random
  }
});

const chessAiMoveFlow = ai.defineFlow(
  {
    name: 'chessAiMoveFlow',
    inputSchema: ChessAiMoveInputSchema,
    outputSchema: ChessAiMoveOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      // Fallback or error handling if LLM doesn't provide output
      // For now, let's throw an error or return a default 'no move'
      throw new Error('AI failed to generate a move.');
    }
    return output;
  }
);
