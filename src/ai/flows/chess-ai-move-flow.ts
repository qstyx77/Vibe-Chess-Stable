
'use server';
/**
 * @fileOverview A chess AI agent that suggests moves.
 *
 * - chessAiMoveFlow - A function that calls the Genkit flow to get a move.
 * - ChessAiMoveInput - The input type for the chessAiMoveFlow.
 * - ChessAiMoveOutput - The return type for the chessAiMoveOutput.
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

**CRITICAL SAFETY INSTRUCTION: IF YOUR ({{{playerColor}}}) KING IS CURRENTLY IN CHECK, your *absolute highest priority* is to make a move that gets your King out of check. This can be achieved by:
1. Moving your King to a safe square (a square where it is not attacked by any opponent piece).
2. Blocking the check with another one of your pieces.
3. CAPTURING THE PIECE THAT IS DELIVERING THE CHECK (this is often the best option if available and safe, either with your King or another piece).
You MUST find a legal move that resolves the check. All other strategic considerations are secondary until your King is safe. If no such move exists, it is checkmate, but you should still try to output a valid "from" and "to" if you believe you have a last resort move, or explain if you believe it's checkmate in the reasoning.**

Your goal is to choose the best possible move.
**ABSOLUTE HIGHEST PRIORITY: KING SAFETY.** First, ensure your King is not in check, or if it is, that your move resolves the check (see CRITICAL SAFETY INSTRUCTION above). After King safety is assured, consider the following strategic elements in roughly this order of importance:

1.  **AGGRESSIVE CAPTURES & MATERIAL ADVANTAGE (CRUCIAL PRIORITY):** Your primary offensive goal is to gain a material advantage by capturing enemy pieces. To do this, you must actively look for opportunities to use your pieces' specific attack patterns to capture opponent pieces.
    *   **Prioritize Legal Captures:** Actively seek out and execute legal captures. For each of your pieces, consider how it attacks (e.g., Pawn's diagonal capture, Knight's L-shape, Bishop's diagonals, Rook's files/ranks, Queen's combined movements, King's adjacent squares, and any special level-based attack abilities). If a legal capture is available, especially of a higher-value piece (Queen > Rook > Bishop/Knight > Pawn) or a piece posing an immediate threat, **YOU SHOULD ALMOST ALWAYS CHOOSE THIS CAPTURE over a simple pawn move or minor piece repositioning, unless making the capture leads to an immediate checkmate against you or a definite, catastrophic loss of material for no significant gain.** Do not be overly passive.
    *   **Verification is Key:** Before committing to a capture, meticulously verify its complete legality: the piece can make the move, its path is clear if required by its type, the target is not invulnerable to your piece (e.g., high-level Queen vs. lower-level attacker, invulnerable Rook, Bishop vs. Pawn immunity), and **critically, the move does not put your own King in check or leave it in check.** If the capture isn't safe or fully legal, re-evaluate.
2.  **Piece Development:** Especially in the early game, move your Knights and Bishops off their starting squares towards the center or influential positions. Do not just move pawns if better developing or capturing moves are available.
3.  **Center Control:** Controlling the central squares (d4, e4, d5, e5) is often advantageous.
4.  **Utilizing Special Abilities:** If your pieces have leveled up, look for opportunities to use their special abilities (e.g., Knight swaps, Bishop conversions, Pawn push-backs, Rook invulnerability after leveling).
5.  **Threats:** Can you make a move that threatens an opponent's piece, forcing them to react? This is often better than a quiet pawn move.
6.  **Long-Term King Safety:** Beyond immediate checks, consider the long-term safety of your King. Is it well-defended?
7.  **Pawn Structure:** While pawn moves are common, ensure they support your overall strategy and don't create weaknesses. Pawn moves should generally be made if no better capturing or developing moves are available.

If it is your first move of the game, consider standard openings like moving a center pawn two squares (e.g., e2-e4 if white, e7-e5 if black) or developing a knight (e.g., g1-f3 if white, g8-f6 if black). **BEFORE outputting this move, you MUST simulate it in your mind: confirm the piece exists, is yours, and that the path and destination square are valid according to all rules for that piece type and its current level.**

Your output MUST be a valid JSON object with "from" and "to" algebraic square notations. For example: {"from": "e7", "to": "e5"}.
You must suggest exactly ONE move. This move MUST be strictly legal according to standard chess rules AND all special VIBE CHESS abilities described above.

It is ABSOLUTELY CRITICAL that your suggested move is valid.
BEFORE deciding on a move, meticulously verify the following:
1. The piece at your 'from' square MUST belong to you (color: {{{playerColor}}}). VERIFY THIS CAREFULLY from the boardString.
2. **ULTRA-CRITICAL**: The piece at the 'from' square you select MUST have at least one legal move available to it according to ALL game rules (standard chess + VIBE CHESS abilities for its level). **DO NOT SELECT A PIECE FOR THE 'FROM' SQUARE IF IT HAS NO LEGAL MOVES.** If your initial choice of piece has no legal moves, you MUST choose a different piece that does have legal moves. **The game guarantees that if it's your turn and not checkmate/stalemate, at least one legal move exists for you to make with some piece.** Your FIRST STEP in choosing a 'from' square is to confirm that the piece on that square is actually capable of making at least one move.
3. The move from the selected piece's 'from' square to your chosen 'to' square is a valid trajectory for that specific piece, considering its current level and all VIBE CHESS abilities. This includes understanding how it *captures* versus how it *moves* if they are different (e.g., Pawns).
4. The move does not place or leave your own King in check. If your King is already in check, this move MUST resolve the check.

Think step-by-step to ensure legality (but only output the JSON move):
A. Identify ALL pieces belonging to {{{playerColor}}} on the board. Confirm their color from the boardString. Determine if your King is currently in check by analyzing opponent piece positions and capabilities.
B. For EACH of your pieces, determine ALL its legal moves based on standard chess rules AND all VIBE CHESS abilities for its level. A move is legal if:
    i. It adheres to the piece's movement rules (including any level-based enhancements). This includes distinguishing between movement patterns and capture patterns (e.g., Pawns move forward but capture diagonally).
    ii. The path is clear if required by the piece type (e.g., Rooks, Bishops, Queens).
    iii. The destination square is either empty or occupied by an opponent's piece that can be legally captured (considering invulnerabilities like those of high-level Queens or Rooks, or Bishop immunity to Pawn capture).
    iv. Crucially, the move does not place or leave your own King in check. If your King starts the turn in check, this move MUST result in your King no longer being in check (e.g., by **moving the King to a safe square**, blocking the attack, or **capturing the attacking piece**).
C. **MOST IMPORTANTLY: From the set of all your pieces evaluated in step B, you MUST select a piece that has one or more legal moves available (as defined in B.i-iv). If your evaluation of step B for a chosen piece results in an empty list of legal moves, or no moves that resolve an existing check, YOU MUST DISCARD THAT PIECE AND CHOOSE A DIFFERENT PIECE FROM STEP A for which step B yields at least one legal move that satisfies all conditions. DO NOT SUGGEST A MOVE FOR A PIECE THAT HAS NO LEGAL MOVES. The game guarantees that a legal move is available if it is not checkmate or stalemate, so you must find one.**
D. From the legal moves available to THAT selected piece (from step C), choose the one you deem most strategic, using the strategic elements listed above, with the absolute priority of resolving check if applicable (prioritizing King moves to safety or captures of the checking piece if possible). **CRITICALLY RE-VERIFY that this single chosen move fully adheres to all conditions in B.i through B.iv before finalizing your decision.**
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
      // Return a structured error that page.tsx can interpret as an invalid move
      return { from: "error", to: "error", reasoning: "AI failed to generate output." };
    }
    // Basic validation for square format. This doesn't check game legality.
    if (!output.from || !/^[a-h][1-8]$/.test(output.from) || !output.to || !/^[a-h][1-8]$/.test(output.to)) {
        console.warn("AI Warning: AI returned invalid square format. From: " + output.from + ", To: " + output.to + ". The AI may not understand the board or output requirements correctly.");
        // Consider this an invalid move too, so page.tsx can forfeit the turn.
        // It's better than trying to process malformed data.
    }
    return output;
  }
);

