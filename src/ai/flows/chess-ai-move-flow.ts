
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
Your color is {{{playerColor}}}. It is your turn to move.
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

**CRITICAL SAFETY INSTRUCTION: IF YOUR ({{{playerColor}}}) KING IS CURRENTLY IN CHECK, your *absolute highest priority* is to make a move that gets your King out of check. All other strategic considerations are secondary until your King is safe. You MUST find a legal move that resolves the check. If no such move exists, it is checkmate, but you should still try to output a valid "from" and "to" if you believe you have a last resort move, or explain if you believe it's checkmate in the reasoning.**

Your goal is to choose the best possible move. Prioritize King safety.
Consider captures, piece development, controlling the center, and using special abilities if advantageous.
If it is your first move of the game, consider standard openings like moving a center pawn two squares (e.g., e2-e4 if white, e7-e5 if black) or developing a knight. Double check that this move is legal for the specific piece chosen (e.g., a pawn can move two squares from its starting position).

Your output MUST be a valid JSON object with "from" and "to" algebraic square notations. For example: {"from": "e7", "to": "e5"}.
You must suggest exactly ONE move. This move MUST be strictly legal according to standard chess rules AND all special VIBE CHESS abilities described above.

It is ABSOLUTELY CRITICAL that your suggested move is valid.
BEFORE deciding on a move, meticulously verify the following:
1. The piece at your 'from' square MUST belong to you (color: {{{playerColor}}}). VERIFY THIS CAREFULLY from the boardString.
2. CRITICALLY: The piece at the 'from' square MUST have at least one legal move available. If a piece has NO legal moves (e.g., it is pinned, blocked, or has no valid squares to move to according to all rules), YOU CANNOT CHOOSE THIS PIECE TO MOVE. You must select a different piece that does have legal moves. The game guarantees that if it's your turn and not checkmate/stalemate, at least one legal move exists for you to make.
3. The move from the selected piece's 'from' square to your chosen 'to' square is a valid trajectory for that specific piece, considering its current level and all VIBE CHESS abilities.
4. The move does not place or leave your own King in check. If your King is already in check, this move MUST resolve the check.

Think step-by-step to ensure legality (but only output the JSON move):
A. Identify ALL pieces belonging to {{{playerColor}}} on the board. Confirm their color from the boardString. Determine if your King is currently in check by analyzing opponent piece positions and capabilities.
B. For EACH of your pieces, determine ALL its legal moves based on standard chess rules AND all VIBE CHESS abilities for its level. A move is legal if:
    i. It adheres to the piece's movement rules (including any level-based enhancements).
    ii. The path is clear if required by the piece type.
    iii. The destination square is either empty or occupied by an opponent's piece that can be legally captured (considering invulnerabilities).
    iv. Crucially, the move does not place or leave your own King in check. If your King starts the turn in check, this move MUST result in your King no longer being in check.
C. MOST IMPORTANTLY: From the set of all your pieces evaluated in step B, you MUST select a piece that has one or more legal moves available (as defined in B.i-iv). If your evaluation of step B for a chosen piece results in an empty list of legal moves, or no moves that resolve an existing check, YOU MUST DISCARD THAT PIECE AND CHOOSE A DIFFERENT PIECE FROM STEP A for which step B yields at least one legal move that satisfies all conditions. **DO NOT SUGGEST A MOVE FOR A PIECE THAT HAS NO LEGAL MOVES.**
D. From the legal moves available to THAT selected piece (from step C), choose the one you deem most strategic, with the absolute priority of resolving check if applicable.
E. Format this single chosen move as the JSON output.

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
      console.error("AI Error: No output received from the Genkit flow for input:", input);
      return { from: "error", to: "error", reasoning: "AI failed to generate output." };
    }
    if (!output.from || !/^[a-h][1-8]$/.test(output.from) || !output.to || !/^[a-h][1-8]$/.test(output.to)) {
        console.warn("AI Warning: AI returned invalid square format. From: " + output.from + ", To: " + output.to + ". The AI may not understand the board or output requirements correctly.");
    }
    return output;
  }
);

