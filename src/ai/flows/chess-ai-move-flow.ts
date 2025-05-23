
'use server';
/**
 * @fileOverview A VIBE CHESS AI agent that suggests moves.
 *
 * - getAiMove - A function that handles the AI move suggestion.
 * - ChessAiMoveInputSchema - The input type for the getAiMove function.
 * - ChessAiMoveOutputSchema - The return type for the getAiMove function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { AlgebraicSquare } from '@/types';

// Define input schema using Zod - NOT EXPORTED
const ChessAiMoveInputSchema = z.object({
  boardString: z.string().describe("A string representation of the current chess board state. Format: 'Turn: <playerColor>. Pieces: <piece1> <piece2> ...'. Example piece: wP@e2(L1) - White Pawn at e2, Level 1. Special status: M (hasMoved for King/Rook/Pawn), I (Invulnerable Rook)."),
  playerColor: z.enum(['white', 'black']).describe("The color of the AI player whose turn it is to move."),
  availablePieceSquares: z.array(z.string()).optional().describe("IMPORTANT: If provided, this is a PRE-FILTERED list of squares containing YOUR pieces that are GUARANTEED to have at least one legal move. You MUST choose your 'from' square from this list. If this list is empty and it's your turn (and not checkmate/stalemate), it implies an issue elsewhere, but you should still try to make a valid move if possible or indicate no move."),
  isPlayerInCheck: z.boolean().optional().describe("A boolean indicating if YOUR King is currently in check. If true, your move MUST resolve the check."),
});
export type ChessAiMoveInput = z.infer<typeof ChessAiMoveInputSchema>;

// Define output schema using Zod - NOT EXPORTED
const ChessAiMoveOutputSchema = z.object({
  from: z.string().describe("The algebraic notation of the square the piece is moving FROM (e.g., 'e2')."),
  to: z.string().describe("The algebraic notation of the square the piece is moving TO (e.g., 'e4')."),
  decisionRationale: z.string().optional().describe("A brief explanation of why this move was chosen."),
  error: z.string().optional().describe("If an error occurred or no valid move could be determined."),
});
export type ChessAiMoveOutput = z.infer<typeof ChessAiMoveOutputSchema>;

// Wrapper function to call the Genkit flow
export async function getAiMove(input: ChessAiMoveInput): Promise<ChessAiMoveOutput> {
  // Basic validation for square format
  const squareRegex = /^[a-h][1-8]$/;

  // If the AI suggests a self-destruct for a Knight, it should signal this by returning the same 'from' and 'to' square.
  // This is a special case only for Level 5+ Knights.
  
  const { output } = await chessAiMoveFlow(input);

  if (!output) {
    console.warn("AI Error: Genkit flow returned no output for getAiMove.");
    return { from: "error", to: "error", error: "AI failed to produce an output." };
  }

  if (output.from === output.to) { // Potential self-destruct signal
    if (!squareRegex.test(output.from)) {
       console.warn(`AI Error (getAiMove): Invalid format for self-destruct square: ${output.from}`);
       return { ...output, error: `Invalid square format for self-destruct: ${output.from}` };
    }
    // Further validation for self-destruct (e.g. is it a L5+ Knight) will happen client-side
  } else {
    if (!squareRegex.test(output.from) || !squareRegex.test(output.to)) {
      console.warn(`AI Error (getAiMove): Invalid square format. From: ${output.from}, To: ${output.to}`);
      return { ...output, error: `Invalid square format. From: ${output.from}, To: ${output.to}` };
    }
  }
  return output;
}


const chessAiMoveFlow = ai.defineFlow(
  {
    name: 'chessAiMoveFlow',
    inputSchema: ChessAiMoveInputSchema,
    outputSchema: ChessAiMoveOutputSchema,
  },
  async (input) => {
    const { boardString, playerColor, availablePieceSquares, isPlayerInCheck } = input;

    // Construct the prompt for the AI
    // This prompt is crucial for guiding the AI's behavior.
    const prompt = `
You are a VIBE CHESS AI playing as ${playerColor}. Your goal is to win by checkmating the opponent's King.
VIBE CHESS has special rules: pieces level up by capturing, gaining new abilities.

Current Board State:
${boardString}

Your Task: Decide on the best single, legal move for ${playerColor}.
Output your move in JSON format: {"from": "e2", "to": "e4", "decisionRationale": "brief reason"}
If you intend for a Level 5+ Knight to self-destruct, set "from" and "to" to the Knight's current square.

VIBE CHESS PIECE ABILITIES (Summary - refer to these when deciding moves):
- Pawns:
  - L1: Standard.
  - L2+: Can move 1 square backward (if empty).
  - L3+: Can also move 1 square sideways (if empty).
  - L4+: Push-Back: If Pawn moves to a square adjacent to an enemy, enemy is pushed 1 square further if destination is empty.
  - L5+ Promotion: Extra turn.
- Knights:
  - L1: Standard L-shape.
  - L2+: Can also move 1 square cardinally.
  - L3+: Can also JUMP 3 squares cardinally.
  - L4+: Swap: Can swap with a friendly Bishop.
  - L5+: Self-Destruct: Re-select Knight to destroy adjacent non-King/invulnerable pieces. Counts for streaks.
- Bishops:
  - L1: Standard diagonal.
  - L2+: Phase: Can jump over friendly pieces (still blocked by enemy).
  - L3+: Pawn Immunity: Cannot be captured by Pawns.
  - L4+: Swap: Can swap with a friendly Knight.
  - L5+: Conversion: 50% chance per adjacent non-King enemy to convert it.
- Rooks:
  - L1-2: Standard.
  - L3+ on Level Up: Invulnerable for opponent's next turn (status 'I' in board string).
  - Promotion to Rook (L1): Invulnerable for opponent's next turn.
- Queens:
  - L1: Standard.
  - L5+: Royal Guard: Invulnerable to attacks from any enemy piece of a lower level.
- Kings:
  - L1: Standard. Can castle.
  - L2+: Extended Reach: Can move/capture up to 2 squares; if straight line, intermediate square must be empty.

CAPTURE & LEVELING:
- Capturing Pawn: +1 level.
- Capturing Queen: +3 levels.
- Capturing Other (Rook, Knight, Bishop, King): +2 levels.

KILL STREAKS (Consecutive captures by YOU):
- Streak of 3+: Resurrect one of YOUR lost pieces (L1, random empty square).
- Streak of 6+: Extra turn.

AUTO-CHECKMATE ON EXTRA TURN: If you deliver check AND earn an extra turn (L5+ pawn promotion or 6+ kill streak) on the same move, you win by checkmate.

BEFORE deciding on a move, carefully consider these CRITICAL points in order:
1.  CRITICAL SAFETY INSTRUCTION: If YOUR King (${playerColor}) is currently in check ({{#if isPlayerInCheck}}which it is{{/if}}):
    Your move ABSOLUTELY MUST get your King out of check. This can be by:
    a. Moving your King to a square that is NOT attacked by any enemy piece.
    b. Blocking the check by placing one ofyour pieces between your King and the attacking piece.
    c. Capturing the piece that is delivering the check.
    IMPORTANT: If the attacking piece is invulnerable (e.g., a Rook with 'I' status), capturing it is NOT an option, and you MUST resort to moving your King or blocking the check. If the attacking piece (e.g., an enemy Queen) is on an adjacent square to your King, and your King can legally capture it without moving into another check, YOU SHOULD STRONGLY PRIORITIZE THIS CAPTURE.
    Failure to get out of check is an illegal move.

2.  ULTRA-CRITICAL - CHOOSING A PIECE TO MOVE ('from' square):
    {{#if availablePieceSquares}}
    A PRE-FILTERED LIST of squares containing your pieces that are GUARANTEED to have AT LEAST ONE LEGAL MOVE has been provided: [${availablePieceSquares.join(', ')}].
    YOU ABSOLUTELY MUST CHOOSE YOUR 'from' SQUARE FROM THIS LIST.
    {{#if isPlayerInCheck}}
    CRITICAL: YOUR KING IS IN CHECK. The \`availablePieceSquares\` list contains pieces that are GUARANTEED to have at least one legal move that resolves this check. You ABSOLUTELY MUST select one of these pieces from the \`availablePieceSquares\` list and make a move that results in your King no longer being in check. Failure to do so means you have made an illegal move. Choose wisely from the provided \`availablePieceSquares\` to ensure your King's safety.
    {{else}}
    Even though your King is not currently in check, you still MUST pick your 'from' square from this list.
    {{/if}}
    Note that while a piece on this list *can* make at least one legal move, you must still ensure the specific 'to' square you choose for it is a valid destination according to all game rules and does not leave your King in check.
    {{else}}
    No \`availablePieceSquares\` list was provided. This means you must evaluate ALL your pieces and ensure the one you pick for the 'from' square CAN make at least one legal move. Your FIRST STEP in choosing a 'from' square is to confirm that the piece on that square is actually capable of making at least one move. Selecting a piece with zero legal moves is a critical failure of your process. The game guarantees a legal move exists if it's not checkmate/stalemate.
    {{/if}}

Strategic Elements to Consider (after ensuring King safety and move legality):
1.  LOOK FOR CHECKMATE (Offensive Priority): If you have a move that checkmates the opponent, or leads to an unstoppable checkmate sequence, that is your top priority.
2.  AGGRESSIVE CAPTURES & MATERIAL ADVANTAGE (CRUCIAL PRIORITY):
    *   Prioritize Legal Captures: If the opponent's Queen is legally and safely capturable by any of your pieces, this capture should be considered your ABSOLUTE TOP PRIORITY MOVE, unless making the capture leads to an immediate checkmate against you or an unavoidable, catastrophic loss of material with no significant gain. DO NOT make a simple pawn move if you can safely capture the opponent's Queen.
    *   If a legal capture of any other enemy piece (Rook, Bishop, Knight, Pawn) is available, AND this capture does not result in your immediate checkmate OR an overwhelmingly negative loss of material for you (e.g., losing your Queen for a Pawn without further compensation), THEN YOU SHOULD STRONGLY PREFER THIS CAPTURE over non-capturing moves like simple pawn pushes or minor piece repositioning. Do not be overly passive. Actively look for and execute safe, advantageous captures.
    *   Pawn Captures of High-Value Pieces: Pay special attention to opportunities where one of your Pawns can legally and safely capture a high-value enemy piece like a Queen, Rook, Bishop, or Knight. **Remember: Pawns capture one square diagonally forward. They CANNOT capture by moving straight forward.** If such a move is available, it does not put your King in danger, and the target is not a Level 3+ Bishop (which are immune to Pawn capture), it is an extremely strong move. **Unless there is an immediate checkmate available for you, or a safe capture of the opponent's Queen by another one of your pieces, YOU SHOULD PRIORITIZE THIS PAWN CAPTURE of an enemy Queen, Rook, Bishop, or Knight over simple pawn pushes or minor piece repositioning, provided the capture is fully legal and safe.**
    *   Verification is Key: Crucially, ensure the capturing move itself is fully legal (path clear, piece can make the move (e.g., Pawns capture diagonally, not forward), target not invulnerable (e.g., L5+ Queen vs lower level attacker, invulnerable Rook), doesn't put your King in check or leave it in check).
3.  THREAT RESPONSE & PROTECTING YOUR PIECES: If the opponent makes an aggressive move with a high-value piece (like their Queen) or attacks one of your pieces:
    *   Assess the threat. Is your King in danger? Are valuable pieces attacked?
    *   If your King is safe, consider if you can counter-attack or capture the opponent's aggressive piece.
    *   If not, can you defend your attacked piece or move it to safety?
    *   Avoid unnecessary panic. If a threat is not immediate or severe, continue with your plan.
    *   Protect Your High-Value Pieces (especially your Queen): Consider if your move leaves your Queen or other valuable pieces vulnerable to capture. Avoid this if safer alternatives with similar strategic value exist.
4.  Piece Development & Activity (Mobility): Especially in the early game (first ~5-10 moves), move your Knights and Bishops off their starting squares towards the center or influential positions where they control more squares and have more options. Aim to activate your pieces and increase their mobility. For instance, after moving a center pawn, developing a Knight to support it is often a good follow-up.
5.  Dominate Key Squares & Center Control: Control central squares (d4, e4, d5, e5) with pawns and pieces. Pieces in the center usually have more influence.
6.  Pawn Structure: Maintain a solid pawn structure. Pawns protect each other and control squares. Try to avoid creating isolated or doubled pawns without good reason, and look for opportunities to create passed pawns, especially in the endgame. Generally, develop pieces before making too many pawn moves, unless a pawn move is critical for center control or enabling piece development.
7.  Long-Term King Safety: Keep your King safe, especially in the opening and middlegame. Castle if it seems appropriate. A good pawn shield in front of your castled King is often beneficial in the middlegame. In the early and middle game, prioritize King safety. In the endgame, an active King can be a powerful asset.
8.  Utilize Special Abilities: Remember VIBE CHESS abilities! A well-timed Knight self-destruct, Bishop conversion, Rook invulnerability, or Pawn push-back can change the game. Consider if any of your pieces' special abilities can be used advantageously.

Think step-by-step:
A.  Identify ALL your pieces (${playerColor}) on the board from the boardString.
B.  For each of your pieces, consider its possible moves based on its type AND current level (VIBE CHESS abilities):
    i.  Standard movement/capture patterns (e.g., Pawns capture diagonally, Knights L-shape).
    ii. VIBE CHESS level-based abilities (Pawn backward/sideways, Knight cardinal/long jump, Bishop phase, King extended reach).
    iii.VIBE CHESS special actions (Knight-Bishop swap, Knight self-destruct, Bishop conversion, Rook invulnerability, Queen invulnerability to lower-level attackers, Bishop immunity to Pawn capture).
    iv. CRITICAL: Can the piece legally move to the target square without being blocked (unless it can jump, like a Knight, or a L2+ Bishop over friendly pieces)? Will the move leave YOUR King (${playerColor}) in check? If YOUR King is currently in check ({{#if isPlayerInCheck}}which it is{{/if}}), does this move get it out of check (by moving King, blocking, or capturing attacker - remember, invulnerable attackers cannot be captured)?
C.  {{#if availablePieceSquares}}From the GUARANTEED list of your pieces on [${availablePieceSquares.join(', ')}] that can make at least one legal move,{{else}}From the set of all your pieces evaluated in step B, you MUST select a piece that has one or more legal moves available. If your evaluation of step B for a chosen piece results in an empty list of legal moves, YOU MUST DISCARD THAT PIECE AND CHOOSE A DIFFERENT PIECE FROM STEP A for which step B yields at least one legal move. DO NOT SUGGEST A MOVE FOR A PIECE THAT HAS NO LEGAL MOVES. The game guarantees a legal move exists if it's not checkmate/stalemate.{{/if}}
D.  Filter these potential moves based on the strategic elements above. Prioritize King safety, then checkmates, then aggressive safe captures, then threats/development.
    {{#if isPlayerInCheck}}Again, if your King is in check, the move MUST resolve the check.{{/if}}
    CRITICALLY RE-VERIFY that this single chosen move fully adheres to all conditions in B.i through B.iv. DO NOT SKIP THIS FINAL VALIDATION. If the move is not 100% legal, go back to step C and pick a different piece or a different move for the current piece.

Strategic Considerations (Think Ahead):
*   Consider Opponent's Likely Response & Short-Term Consequences: Before committing to your chosen move, perform this quick mental check:
    1.  What is my opponent's most likely and strongest reply to my intended move?
    2.  After they make that reply, what will the board state look like?
    3.  Does this resulting state improve my position, maintain an advantage, or put me at a disadvantage?
    Aim for moves that are still strong even after considering your opponent's likely best response. Avoid moves that look good initially but fall apart after a simple counter from the opponent.
*   Evaluate the Position After Your Move: Does it improve your material balance (using piece values like P=1, N/B=3, R=5, Q=9), piece activity/mobility, central control, or King safety? Aim to make moves that lead to an objectively better position for you. If your move is a capture, briefly consider if the opponent has an immediate, strong recapture or tactical response. Aim for positions that are 'quiet' and favorable after any immediate exchanges are resolved.

First Move Advice: If it is your first move of the game, consider standard openings like moving a center pawn two squares (e.g., e7-e5 if you are black, after white plays e2-e4) or developing a knight (e.g., g8-f6 if black). Double check that this move is legal for the specific piece chosen (e.g., a pawn can move two squares from its starting position). After your first move, continue to prioritize piece development and central control for the next few moves. For instance, after moving a center pawn, developing a Knight to support it (e.g. Ng8-f6 after ...e7-e5) is often a good follow-up.

FINAL AI SELF-CORRECTION CHECK: Before outputting your move, one last time, quickly mentally replay it on the board.
- Is the 'from' square one of YOUR pieces?
- Is the 'to' square a valid destination for that piece type AND level?
- Is the path clear (if relevant)?
- Does the move put or leave YOUR King in check? {{#if isPlayerInCheck}}You are IN CHECK, so your move MUST resolve it.{{/if}}
- {{#if availablePieceSquares}}Is 'from' one of the provided availablePieceSquares? If so, you must choose a 'to' square that is a genuinely legal destination for that piece from that square according to all VIBE CHESS rules for its current level.{{/if}}
- If ANY of these checks fail, you MUST select a different, 100% legal move. If the piece you selected for the 'from' square has zero valid moves to any 'to' square after all checks, YOU MUST ABANDON THIS 'FROM' PIECE AND RESTART YOUR SELECTION PROCESS (Step A-D) WITH A DIFFERENT PIECE. Failure to output a move for a piece that can legally move is a critical error.

Provide only the JSON output.
`;
    const { output } = await ai.generate({
      prompt,
      model: 'googleai/gemini-2.0-flash', // Ensure this model is appropriate for the complexity
      output: { schema: ChessAiMoveOutputSchema },
    });

    if (!output) {
      console.warn("AI Error (flow): Model returned no output for chessAiMoveFlow.");
      return { from: "error", to: "error", error: "AI model returned no output." };
    }
    
    // Basic validation for square format within the flow
    const squareRegex = /^[a-h][1-8]$/;
    if (!squareRegex.test(output.from) || (!squareRegex.test(output.to) && output.from !== output.to /* allow same for Knight self-destruct signal */)) {
        console.warn(`AI Error (flow): Invalid square format from AI. From: ${output.from}, To: ${output.to}`);
        // Return an error structure or a default safe move if possible,
        // but for now, we'll let the client-side handle the invalid AI output.
        // This error will be caught by getAiMove wrapper and handled further client-side.
        return { ...output, error: `AI returned malformed square(s): from='${output.from}', to='${output.to}'`};
    }

    return output;
  }
);
