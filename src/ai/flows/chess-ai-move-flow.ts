
'use server';
/**
 * @fileOverview A chess AI agent that suggests moves.
 *
 * - chessAiMoveFlow - A function that calls the Genkit flow to get a move.
 * - ChessAiMoveInput - The input type for the chessAiMoveFlow.
 * - ChessAiMoveOutput - The return type for the chessAiMoveFlow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ChessAiMoveInputSchema = z.object({
  boardString: z.string().describe('A string representation of the current chess board state, including piece locations, types, levels, and any special statuses. Also indicates whose turn it is.'),
  playerColor: z.enum(['white', 'black']).describe('The color of the player for whom the AI should suggest a move.'),
});
export type ChessAiMoveInput = z.infer<typeof ChessAiMoveInputSchema>;

const ChessAiMoveOutputSchema = z.object({
  from: z.string().describe('The algebraic notation of the square the piece is moving from (e.g., "e2").'),
  to: z.string().describe('The algebraic notation of the square the piece is moving to (e.g., "e4").'),
  reasoning: z.string().optional().describe('A brief explanation of why the AI chose this move.'),
});
export type ChessAiMoveOutput = z.infer<typeof ChessAiMoveOutputSchema>;


export async function getAiMove(input: ChessAiMoveInput): Promise<ChessAiMoveOutput> {
  return chessAiMoveFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chessAiMovePrompt',
  input: { schema: ChessAiMoveInputSchema },
  output: { schema: ChessAiMoveOutputSchema },
  prompt: `You are a strategic chess AI playing "VIBE CHESS", a game with evolving pieces.
Your color is {{{playerColor}}}.
The current board state is:
{{{boardString}}}

Piece Notation:
- Color: 'w' for white, 'b' for black.
- Type: 'P' (Pawn), 'N' (Knight), 'B' (Bishop), 'R' (Rook), 'Q' (Queen), 'K' (King).
- Location: Algebraic notation (e.g., @e2).
- Level: (L#), e.g., (L1).
- Special Status:
    - 'I': Invulnerable (usually for Rooks for one opponent turn after leveling to L3+ or promotion).
    - 'M': Has Moved (relevant for King/Rook castling or Pawn initial two-square move).

Piece Abilities (summary - exact rules are complex, but this gives an idea):
- Pawns (L2+): Move backward. (L3+): Move sideways. (L4+): Push adjacent enemy 1 sq. (L5+ promotion): Extra turn.
- Knights (L2+): 1 sq cardinal move. (L3+): 3 sq cardinal jump. (L4+): Swap with friendly Bishop. (L5+): Self-destruct, captures adjacent (not Kings, invulnerable Rooks/Queens).
- Bishops (L2+): Jump friendly pieces. (L3+): Immune to Pawn capture. (L4+): Swap with friendly Knight. (L5+): 50% chance convert adjacent enemy (not Kings).
- Rooks (L3+ level-up / promotion): Invulnerable for 1 opponent turn.
- Queens (L5+): Invulnerable to lower-level pieces.
- Kings (L2+): Move/capture 2 sq (straight line path must be clear). Castling is standard.

Kill Streaks:
- 3+ captures: Resurrect one of your lost pieces (L1, random empty square).
- 6+ captures: Extra turn.
  (Self-destruct counts multiple captures for streaks).

Auto-Checkmate: If a player delivers check AND earns an extra turn (L5+ pawn promo or 6+ kill streak) on the same move, it's an immediate checkmate.

Your goal is to choose the best possible move. Prioritize King safety.
Consider captures, piece development, controlling the center, and using special abilities if advantageous.
Your output MUST be a valid JSON object with "from" and "to" algebraic square notations. For example: {"from": "e7", "to": "e5"}.
Suggest ONE legal move.
Think step by step for your reasoning (but only output the JSON move).
1. Identify all your pieces.
2. For each piece, identify all its legal moves considering its current level and abilities, and standard chess rules.
3. Evaluate the board after each potential move.
4. Choose the move that provides the best strategic advantage or mitigates threats.
5. Ensure the move is legal and does not put your own King in check.

Based on the board: {{{boardString}}}
Suggest a move for {{{playerColor}}}:
`,
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
      throw new Error('AI failed to provide a move.');
    }
    // Basic validation for 'from' and 'to' format, more robust validation happens in page.tsx
    if (!/^[a-h][1-8]$/.test(output.from) || !/^[a-h][1-8]$/.test(output.to)) {
        // Attempt to recover or ask for a retry if output is parsable but invalid format
        console.warn("AI returned invalid square format, attempting to parse reasoning or re-prompt might be needed.");
        // For now, let it pass and be caught by page.tsx validation or throw specific error
        // This part can be enhanced with retries or asking for clarification from the LLM.
        // For simplicity, we will let the game logic in page.tsx handle detailed validation.
    }
    return output;
  }
);
