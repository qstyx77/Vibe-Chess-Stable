
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
  availablePieceSquares: z.array(z.string()).optional().describe('An optional list of algebraic notations of squares containing pieces that currently have at least one legal move. If provided, the AI MUST select its "from" square from one of these squares.'),
  isPlayerInCheck: z.boolean().optional().describe('An optional flag indicating if the current player (for whom the move is being suggested) is currently in check.'),
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

{{#if availablePieceSquares}}
IMPORTANT: You have been provided with a list of squares: {{#each availablePieceSquares}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}.
These squares contain your pieces that are GUARANTEED to have at least one legal move.
YOU MUST CHOOSE YOUR 'FROM' SQUARE FROM THIS LIST.
**Note that while a piece on this list *can* make at least one legal move, you must still ensure the specific 'to' square you choose for it is a valid destination according to all game rules and does not leave your King in check.**
{{#if isPlayerInCheck}}
**YOUR KING IS IN CHECK. The \`availablePieceSquares\` list contains pieces that can make a move to resolve this check. You MUST use one of these pieces and make a move that resolves the check. Prioritize moves that directly move your King to safety or capture the attacker if possible (unless the attacker is invulnerable).**
{{/if}}
{{else}}
{{#if isPlayerInCheck}}
**YOUR KING IS IN CHECK. You MUST make a move that resolves the check. Prioritize moves that directly move your King to safety or capture the attacker if possible (unless the attacker is invulnerable).**
{{/if}}
{{/if}}

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
- Rooks (L3+ level-up / promotion): Invulnerable for 1 opponent turn. (Indicated by 'I' in status).
- Queens (L5+): Invulnerable to lower-level pieces.
- Kings (L2+): Move/capture 2 sq (straight line path must be clear). Castling is standard.

Kill Streaks:
- 3+ captures: Resurrect one of your lost pieces (L1, random empty square).
- 6+ captures: Extra turn.
  (Self-destruct counts multiple captures for streaks).

Auto-Checkmate: If a player delivers check AND earns an extra turn (L5+ pawn promo or 6+ kill streak) on the same move, it's an immediate checkmate.

It is ABSOLUTELY CRITICAL that your suggested move is valid.
BEFORE deciding on a move, meticulously verify the following:
1. The piece at your 'from' square MUST belong to you (color: {{{playerColor}}}). VERIFY THIS CAREFULLY from the boardString. {{#if availablePieceSquares}}Remember, your 'from' square MUST be one of: {{#each availablePieceSquares}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}.{{/if}}
2. **ULTRA-CRITICAL: The piece at the 'from' square you select MUST have at least one legal move available to it according to ALL game rules (standard chess + VIBE CHESS abilities for its level). **DO NOT SELECT A PIECE FOR THE 'FROM' SQUARE IF IT HAS NO LEGAL MOVES.** Selecting a piece with zero legal moves is a critical failure of your process. Your FIRST STEP in choosing a 'from' square is to confirm that the piece on that square is actually capable of making at least one move. **The game guarantees that if it's your turn and not checkmate/stalemate, at least one legal move exists for you to make with some piece.** {{#if availablePieceSquares}}The provided 'availablePieceSquares' list already confirms this for the pieces on those squares.{{/if}}
3. The move from the selected piece's 'from' square to your chosen 'to' square is a valid trajectory for that specific piece, considering its current level and all VIBE CHESS abilities. This includes understanding how it *captures* versus how it *moves* if they are different (e.g., **Pawns move forward but capture diagonally. Pawns CANNOT capture by moving straight forward.**).
4. The move does not place or leave your own King in check. If your King is already in check{{#if isPlayerInCheck}} (which it is){{/if}}, this move MUST resolve the check.

**CRITICAL SAFETY INSTRUCTION (Applies AFTER confirming piece legality from point 2 above): IF YOUR ({{{playerColor}}}) KING IS CURRENTLY IN CHECK ({{#if isPlayerInCheck}}which it is{{/if}}), your *absolute highest priority* is to make a move that gets your King out of check. This can be achieved by:
1. Moving your King to a safe square (a square where it is not attacked by any other opponent piece).
2. Blocking the check with another one of your pieces.
3. CAPTURING THE PIECE THAT IS DELIVERING THE CHECK. This is often the best and most direct option. **If the attacking piece (e.g., an enemy Queen) is on an adjacent square to your King, and your King can legally capture it without moving into another check, YOU SHOULD STRONGLY PRIORITIZE THIS CAPTURE.** This applies even if it's your King making the capture. **However, if the attacking piece is invulnerable (e.g., a Rook with 'I' status), capturing it is NOT an option, and you MUST resort to moving your King or blocking the check.**
You MUST find a legal move that resolves the check. All other strategic considerations are secondary until your King is safe. If no such move exists, it is checkmate, but you should still try to output a valid "from" and "to" if you believe you have a last resort move, or explain if you believe it's checkmate in the reasoning.**

Your goal is to choose the best possible move. First, ensure your selected piece can move (ULTRA-CRITICAL point 2). Then, ensure King safety (CRITICAL SAFETY INSTRUCTION). After these are assured, consider the following strategic elements in roughly this order of importance:

1.  **LOOK FOR CHECKMATE (HIGHEST OFFENSIVE PRIORITY):** If you have any move that results in an immediate checkmate against the opponent's King, YOU MUST CHOOSE THIS MOVE. All other considerations are secondary.
2.  **AGGRESSIVE CAPTURES & MATERIAL ADVANTAGE (CRUCIAL PRIORITY):** Your primary offensive goal is to gain a material advantage by capturing enemy pieces. To do this, you must actively look for opportunities to use your pieces' specific attack patterns to capture opponent pieces. Use standard piece values as a guideline (Pawn=1, Knight/Bishop=3, Rook=5, Queen=9) when evaluating material.
    *   **Prioritize Legal Captures, Especially of High-Value Pieces:** Actively seek out and execute legal captures. For each of your pieces, consider how it attacks (e.g., Pawn's diagonal capture, Knight's L-shape, Bishop's diagonals, Rook's files/ranks, Queen's combined movements, King's adjacent squares, and any special level-based attack abilities).
        *   **If the opponent's Queen is legally and safely capturable by any of your pieces, this capture should be considered your ABSOLUTE TOP PRIORITY MOVE, unless making the capture leads to an immediate checkmate against you or an unavoidable, catastrophic loss of material with no significant gain. DO NOT make a simple pawn move if you can safely capture the opponent's Queen.**
        *   **If a legal capture of any enemy piece (Rook, Bishop, Knight, Pawn) is available, AND this capture does not result in your immediate checkmate OR an immediate, overwhelmingly negative loss of material for you (e.g., losing your Queen for a Pawn without further compensation), THEN YOU SHOULD STRONGLY PREFER THIS CAPTURE over non-capturing moves like simple pawn pushes or minor piece repositioning. Do not be overly passive. Actively look for and execute safe, advantageous captures.**
    *   **Pawn Captures of High-Value Pieces:** Pay special attention to opportunities where one of your Pawns can legally and safely capture a high-value enemy piece like a Queen or Rook. **Remember: Pawns capture one square diagonally forward. They CANNOT capture by moving straight forward.** If such a move is available, it does not put your King in danger, and the target is not a Level 3+ Bishop (which are immune to Pawn capture), it is an extremely strong move and should be heavily favored.
    *   **Verification is Key:** Before committing to a capture, meticulously verify its complete legality: the piece can make the move (e.g., Pawns capture diagonally, not forward; Knights use L-shapes or cardinal moves based on level), its path is clear if required by its type, the target is not invulnerable to your piece (e.g., high-level Queen vs. lower-level attacker, invulnerable Rook, **Bishop immunity to Pawn capture**), and **critically, the move does not put your own King in check or leave it in check.** If the capture isn't safe or fully legal, re-evaluate.
3.  **THREAT RESPONSE & PROTECTING YOUR PIECES:**
    *   **Assess Threats:** If the opponent moves a high-value piece like their Queen or Rook into an aggressive position early, calmly assess the direct threats. Is your King in check? Is one of your pieces directly attacked and can be captured on the next move?
    *   **Prioritize King Safety:** If your King is threatened, resolving that threat is paramount (see CRITICAL SAFETY INSTRUCTION).
    *   **Counter-Attack/Capture:** If the opponent's aggressive piece (e.g., their Queen) can be legally and safely captured by one of your pieces, this is often a very strong response (see AGGRESSIVE CAPTURES).
    *   **Defend:** If a valuable piece of yours is attacked, consider moving it to safety or defending it with another piece.
    *   **Avoid Unnecessary Panic:** Not every aggressive-looking move from the opponent requires an immediate defensive reaction if it doesn't create an immediate, concrete threat. Continue with your development or strategic plan if the opponent's move is speculative and doesn't force your hand.
    *   **Protect Your Own High-Value Pieces (especially your Queen):** Before making any move, especially a pawn move or a move with a less valuable piece, quickly assess if that move will leave *your* Queen (or other high-value pieces like Rooks) open to an immediate and unfavorable capture. Avoid moves that unnecessarily endanger your key pieces if safer alternatives with similar strategic value exist.
4.  **CREATE THREATS, CONTROL SPACE, & IMPROVE POSITION (Work Towards Checkmate):**
    *   **Deliver Checks:** If you can safely deliver check to the opponent's King, especially if it forces the King to a worse square or restricts its options, this is often a strong move. Consider how your pieces can work together to create a "net" around the enemy King. For example, Knights are often strong in the center or on outposts; Rooks are powerful on open files or controlling the 7th/8th ranks; Bishops thrive on open diagonals.
    *   **Threaten Mate:** Look for moves that create an immediate threat of checkmate on your next turn (a "mate-in-one" threat).
    *   **Dominate Key Squares & Center Control:** Control central squares (d4, e4, d5, e5) and squares around the opponent's King. Aim for active piece placement where your pieces control many squares, have good mobility, and coordinate well.
    *   **Piece Development & Activity (Mobility):** Especially in the early game (first ~5-10 moves), move your Knights and Bishops off their starting squares towards the center or influential positions where they control more squares and have more options. For instance, after moving a center pawn, developing a Knight to support it is often a good follow-up. Do not just move pawns if no better capturing, threatening, or developing moves are available. Aim to activate your pieces and increase their mobility.
5.  **STRATEGIC CONSIDERATIONS (Think Ahead):**
    *   **Evaluate the Position After Your Move:** Before settling on a move, consider what the board will look like *after* your move. Does it improve your material balance (using piece values like P=1, N/B=3, R=5, Q=9), piece activity/mobility, central control, or King safety? Aim to make moves that lead to an objectively better position for you. If your move is a capture, briefly consider if the opponent has an immediate, strong recapture or tactical response. Aim for positions that are 'quiet' and favorable after any immediate exchanges are resolved.
    *   **Consider Opponent's Likely Response:** Briefly think about the opponent's most likely replies to your candidate moves. Does your move leave you vulnerable to a strong counter-attack? Try to think a step or two ahead.
6.  **Utilizing Special Abilities:** If your pieces have leveled up, look for opportunities to use their special abilities (e.g., Knight swaps, Bishop conversions, Pawn push-backs, Rook invulnerability after leveling) to gain an advantage, create threats, or improve your position.
7.  **Long-Term King Safety:** Beyond immediate checks, consider the long-term safety of your King. Is it well-defended? A good pawn shield in front of your castled King is often beneficial in the middlegame. In the early and middle game, prioritize King safety. In the endgame, an active King can be a powerful asset.
8.  **Pawn Structure:** While pawn moves are common, ensure they support your overall strategy and don't create weaknesses. Try to avoid creating isolated or doubled pawns without good reason, and look for opportunities to create passed pawns, especially in the endgame. Pawn moves should generally be made if no better capturing, threatening, developing, or position-improving moves are available.

If it is your first move of the game, consider standard openings like moving a center pawn two squares (e.g., e2-e4 if white, e7-e5 if black) or developing a knight (e.g., g1-f3 if white, g8-f6 if black). **BEFORE outputting this move, you MUST simulate it in your mind: confirm the piece exists, is yours, and that the path and destination square are valid according to all rules for that piece type and its current level.** After your first move, continue to prioritize piece development and central control for the next few moves.

Your output MUST be a valid JSON object with "from" and "to" algebraic square notations. For example: {"from": "e7", "to": "e5"}.
You must suggest exactly ONE move. This move MUST be strictly legal according to standard chess rules AND all special VIBE CHESS abilities described above.

Think step-by-step to ensure legality (but only output the JSON move):
A. Identify ALL pieces belonging to {{{playerColor}}} on the board. Confirm their color from the boardString. Determine if your King is currently in check ({{#if isPlayerInCheck}}which it is{{/if}}) by analyzing opponent piece positions and capabilities.
B. For EACH of your pieces {{#if availablePieceSquares}}(especially those on squares: {{#each availablePieceSquares}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}){{/if}}, determine ALL its legal moves based on standard chess rules AND all VIBE CHESS abilities for its level. A move is legal if:
    i. It adheres to the piece's movement rules (including any level-based enhancements). This includes distinguishing between movement patterns and capture patterns (e.g., **Pawns move forward but capture diagonally. Pawns CANNOT capture by moving straight forward.**).
    ii. The path is clear if required by the piece type (e.g., Rooks, Bishops, Queens).
    iii. The destination square is either empty or occupied by an opponent's piece that can be legally captured (considering invulnerabilities like those of high-level Queens or Rooks, or **Bishop immunity to Pawn capture**).
    iv. Crucially, the move does not place or leave your own King in check. If your King starts the turn in check ({{#if isPlayerInCheck}}which it does{{/if}}), this move MUST result in your King no longer being in check (e.g., by **moving the King to a safe square**, blocking the attack, or **CAPTURING THE ATTACKING PIECE - remember the strong advice in the CRITICAL SAFETY INSTRUCTION if the attacker is adjacent to your King and not invulnerable**).
C. **MOST IMPORTANTLY: From the set of all your pieces evaluated in step B, you MUST select a piece that has one or more legal moves available (as defined in B.i-iv). {{#if availablePieceSquares}}YOU ABSOLUTELY MUST CHOOSE YOUR 'FROM' SQUARE FROM THIS LIST: {{#each availablePieceSquares}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}. These pieces are pre-verified to have legal moves.{{else}}The game guarantees that a legal move is available if it is not checkmate or stalemate, so you must find one.{{/if}} If your evaluation of step B for a chosen piece results in an empty list of legal moves, or no moves that resolve an existing check, YOU MUST DISCARD THAT PIECE AND CHOOSE A DIFFERENT PIECE FROM STEP A for which step B yields at least one legal move that satisfies all conditions. DO NOT SUGGEST A MOVE FOR A PIECE THAT HAS NO LEGAL MOVES.** Selecting a piece with zero legal moves is a critical failure of your process.
D. From the legal moves available to THAT selected piece (from step C), choose the one you deem most strategic, using the strategic elements listed above, with the absolute priority of resolving check if applicable ({{#if isPlayerInCheck}}YOUR KING IS IN CHECK, THIS IS TOP PRIORITY{{/if}} - prioritizing King moves to safety or captures of the checking piece if possible, **especially if the King can capture an adjacent checker, unless the checker is invulnerable**). Consider the board state *after* your proposed move. Does it improve your position based on material, piece activity, and safety? **CRITICALLY RE-VERIFY that this single chosen move fully adheres to all conditions in B.i through B.iv. DO NOT SKIP THIS FINAL VALIDATION. If the move is not 100% legal, go back to step C and pick a different piece or a different move for the current piece.**
E. Format this single chosen move as the JSON output.

**FINAL AI SELF-CORRECTION CHECK: Before outputting your JSON, one last time, simulate the move in your head. Does the piece exist at \`from\`? Is it your color? {{#if availablePieceSquares}}Is \`from\` one of the provided availablePieceSquares?{{/if}} Can this specific piece, with its current level and VIBE CHESS abilities, legally move from \`from\` to \`to\`? Does the move clear all obstacles if needed? Is the destination square valid for capture or movement? Does it keep your King safe ({{#if isPlayerInCheck}}AND resolve the current check, noting if the attacker is invulnerable{{/if}})? **Crucially, if the piece you selected for the 'from' square has zero valid moves to any 'to' square after all checks (even if it was in availablePieceSquares, you must verify the specific 'to' choice), YOU MUST ABANDON THIS 'FROM' PIECE AND RESTART YOUR SELECTION PROCESS (Step A-D) WITH A DIFFERENT PIECE FROM THE availablePieceSquares LIST (if provided) or from scratch. Failure to output a move for a piece that can legally move is a critical error.** If ANY doubt, you MUST pick a different, simpler, or more obviously legal move, even if less strategic. Prioritize legality above all else. **IF YOU DETERMINE YOUR CHOSEN MOVE IS ILLEGAL, DO NOT OUTPUT IT. INSTEAD, RESTART YOUR THINKING PROCESS FROM STEP A TO FIND A GUARANTEED LEGAL MOVE.**

Based on the board: {{{boardString}}}
{{#if availablePieceSquares}}Using one of these squares as 'from': {{#each availablePieceSquares}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}.{{#if isPlayerInCheck}} **Remember, your King is in check, so your move MUST resolve this. If the attacker is invulnerable, you cannot capture it.**{{/if}}{{/if}}
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
      // Ensure a structured error response that matches ChessAiMoveOutputSchema
      return { from: "error", to: "error", reasoning: "AI failed to generate output." };
    }
    // Basic validation for square format.
    if (!output.from || !/^[a-h][1-8]$/.test(output.from) || !output.to || !/^[a-h][1-8]$/.test(output.to)) {
        console.warn("AI Warning: AI returned invalid square format. From: " + output.from + ", To: " + output.to + ". The AI may not understand the board or output requirements correctly. AI will forfeit turn.");
        return { from: "error", to: "error", reasoning: "AI returned invalid square format." };
    }
    return output;
  }
);


