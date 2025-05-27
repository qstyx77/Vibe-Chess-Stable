
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { RulesDialog } from '@/components/evolving-chess/RulesDialog';
import {
  initializeBoard,
  applyMove,
  algebraicToCoords,
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  filterLegalMoves,
  coordsToAlgebraic,
  type ConversionEvent,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Bot } from 'lucide-react';
import VibeChessAI from '@/ai/vibe-chess-ai';

let resurrectionIdCounter = 0;

const initialGameStatus: GameStatus = {
  message: "\u00A0", // Non-breaking space for consistent height
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  gameOver: false,
  winner: undefined,
};

// For AI Game State - defined in vibe-chess-ai.ts
interface AIGameState {
  board: (Piece | null)[][];
  currentPlayer: PlayerColor;
  killStreaks?: { white: number; black: number };
  capturedPieces?: { white: Piece[]; black: Piece[] };
  gameOver?: boolean;
  winner?: PlayerColor | 'draw';
  extraTurn?: boolean;
  autoCheckmate?: boolean;
  // Piece objects within board should also include level and invulnerableTurnsRemaining if your AI uses them
}


function adaptBoardForAI(
  mainBoard: BoardState,
  currentPlayerForAI: PlayerColor,
  currentKillStreaks: GameStatus['killStreaks'],
  currentCapturedPieces: GameStatus['capturedPieces']
): AIGameState {
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      // Ensure all relevant properties from the main Piece type are passed to the AI,
      // especially those used by its internal logic (level, invulnerableTurnsRemaining, hasMoved).
      return {
        ...squareState.piece,
        id: squareState.piece.id,
        type: squareState.piece.type,
        color: squareState.piece.color,
        level: squareState.piece.level || 1,
        hasMoved: squareState.piece.hasMoved || false,
        // The AI's isPieceInvulnerable uses invulnerableTurnsRemaining
        invulnerableTurnsRemaining: squareState.piece.invulnerableTurnsRemaining || 0,
        // The 'invulnerable' boolean field is for the AI's internal representation if needed,
        // based on invulnerableTurnsRemaining. Some AI versions used 'invulnerable: boolean'.
        // If your AI's `isPieceInvulnerable` directly uses `invulnerableTurnsRemaining`,
        // then this boolean `invulnerable` field might be redundant for the AI's input.
        // For now, let's ensure the AI gets the raw `invulnerableTurnsRemaining`.
      };
    })
  );

  return {
    board: aiBoard,
    currentPlayer: currentPlayerForAI,
    killStreaks: { // Ensure killStreaks is always an object
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: { // Pass captured pieces for AI's resurrection logic
      white: currentCapturedPieces?.white.map(p => ({ ...p })) || [],
      black: currentCapturedPieces?.black.map(p => ({ ...p })) || [],
    },
    // Pass gameOver status for AI's terminal condition checks
    gameOver: initialGameStatus.gameOver, // This should be the current game's gameOver status
    winner: initialGameStatus.winner,   // And current winner
  };
}

export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>(initialGameStatus);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });

  const [enemySelectedSquare, setEnemySelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [enemyPossibleMoves, setEnemyPossibleMoves] = useState<AlgebraicSquare[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('flipping');
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  const flashedCheckStateRef = useRef<string | null>(null);

  const [showCaptureFlash, setShowCaptureFlash] = useState(false);
  const [captureFlashKey, setCaptureFlashKey] = useState(0);

  const [showCheckFlashBackground, setShowCheckFlashBackground] = useState(false);
  const [checkFlashBackgroundKey, setCheckFlashBackgroundKey] = useState(0);

  const [showCheckmatePatternFlash, setShowCheckmatePatternFlash] = useState(false);
  const [checkmatePatternFlashKey, setCheckmatePatternFlashKey] = useState(0);


  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);

  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [lastCapturePlayer, setLastCapturePlayer] = useState<PlayerColor | null>(null);

  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);

  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef(new VibeChessAI(2)); // Default depth for AI

  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);

  const { toast } = useToast();

  const determineBoardOrientation = useCallback((
    currentViewMode: ViewMode,
    playerForTurn: PlayerColor,
    blackIsCurrentlyAI: boolean,
    whiteIsCurrentlyAI: boolean
  ): PlayerColor => {
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white';
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black';
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white';

    // Human vs Human
    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; // Default for tabletop HvsH
  }, []);

  const saveStateToHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(square => ({
        ...square,
        piece: square.piece ? { ...square.piece } : null
      }))),
      currentPlayer: currentPlayer,
      gameInfo: { ...gameInfo },
      capturedPieces: {
        white: capturedPieces.white.map(p => ({ ...p })),
        black: capturedPieces.black.map(p => ({ ...p })),
      },
      killStreaks: { ...killStreaks },
      lastCapturePlayer: lastCapturePlayer,
      boardOrientation: boardOrientation,
      viewMode: viewMode,
      isWhiteAI: isWhiteAI,
      isBlackAI: isBlackAI,
      enemySelectedSquare: enemySelectedSquare,
      enemyPossibleMoves: [...enemyPossibleMoves],
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); // Limit history size
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  }, [isWhiteAI, isBlackAI]);

  const resetGame = useCallback(() => {
    resurrectionIdCounter = 0;
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameInfo(initialGameStatus);
    flashedCheckStateRef.current = null; // Reset flashed state on game reset
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setIsWhiteAI(false);
    setIsBlackAI(false);
    setIsAiThinking(false);
    setViewMode('flipping');
    setBoardOrientation(determineBoardOrientation('flipping', 'white', false, false));
    setShowCheckFlashBackground(false);
    setCheckFlashBackgroundKey(0);
    setShowCaptureFlash(false);
    setCaptureFlashKey(0);
    setShowCheckmatePatternFlash(false);
    setCheckmatePatternFlashKey(0);
    setAnimatedSquareTo(null);
    setIsMoveProcessing(false);
    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
  }, [toast, determineBoardOrientation]);

  useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver && gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = 'checkmate';
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck && !gameInfo.isStalemate) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    }

    if (currentCheckStateString) {
      if (flashedCheckStateRef.current !== currentCheckStateString) {
        if (gameInfo.isCheckmate) {
          setFlashMessage('CHECKMATE!');
          setShowCheckmatePatternFlash(true);
          setCheckmatePatternFlashKey(k => k + 1);
        } else { // Just a check
          setFlashMessage('CHECK!');
          setShowCheckFlashBackground(true);
          setCheckFlashBackgroundKey(k => k + 1);
        }
        setFlashMessageKey(k => k + 1); // Trigger text flash animation
        flashedCheckStateRef.current = currentCheckStateString;
      }
    } else {
        // If gameInfo indicates no check/checkmate, but we previously flashed something, reset the ref
        if (flashedCheckStateRef.current) {
             flashedCheckStateRef.current = null;
        }
    }
  }, [gameInfo]); // Only react to gameInfo

  // Effect for text flash message timeout
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (flashMessage) {
      const duration = flashMessage === 'CHECKMATE!' ? 2500 : 1500;
      timerId = setTimeout(() => {
        setFlashMessage(null);
      }, duration);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [flashMessage, flashMessageKey]); // React to flashMessage and its key

  // Effect for CHECK background flash timeout
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250); // 2.25 seconds
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

  // Effect for CAPTURE background flash timeout
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCaptureFlash) {
      timerId = setTimeout(() => {
        setShowCaptureFlash(false);
      }, 2250); // 2.25 seconds
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCaptureFlash, captureFlashKey]);

  // Effect for CHECKMATE background flash timeout
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250); // 5.25 seconds
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);

  // Effect for clearing Rook invulnerability at the start of a player's turn
  useEffect(() => {
    console.log(`VIBE_DEBUG (HvsH & AI): Start of ${currentPlayer}'s turn. Clearing invulnerability for ${currentPlayer}'s Rooks if applicable.`);
    setBoard(prevBoard => {
      let boardWasModified = false;
      const boardAfterInvulnerabilityWearOff = prevBoard.map(row =>
        row.map(square => {
          if (square.piece &&
              square.piece.color === currentPlayer &&
              square.piece.type === 'rook' &&
              square.piece.invulnerableTurnsRemaining &&
              square.piece.invulnerableTurnsRemaining > 0) {
            console.log(`VIBE_DEBUG (HvsH & AI): Clearing invulnerability for ${currentPlayer} Rook ${square.piece.id} at ${square.algebraic}. Was: ${square.piece.invulnerableTurnsRemaining}`);
            boardWasModified = true;
            return { ...square, piece: { ...square.piece, invulnerableTurnsRemaining: 0 } };
          }
          return square;
        })
      );
      if (boardWasModified) {
        return boardAfterInvulnerabilityWearOff;
      }
      return prevBoard; // Important: return prevBoard if no changes to avoid unnecessary re-renders
    });
  }, [currentPlayer, setBoard]);


  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const newOrientation = determineBoardOrientation(viewMode, playerTakingExtraTurn, isBlackAI, isWhiteAI);
    if (newOrientation !== boardOrientation) {
      setBoardOrientation(newOrientation);
    }

    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);

    if (opponentInCheck) { // Auto-Checkmate on Extra Turn logic
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
      setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn });
      return;
    }

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
      setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
      return;
    }
    // If no auto-checkmate or stalemate, it's a regular extra turn
    setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  }, [toast, determineBoardOrientation, viewMode, isBlackAI, isWhiteAI, getPlayerDisplayName, boardOrientation, setBoardOrientation, setEnemyPossibleMoves, setEnemySelectedSquare, setGameInfo, setPossibleMoves, setSelectedSquare]);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    
    const newOrientation = determineBoardOrientation(viewMode, nextPlayer, isBlackAI, isWhiteAI);
     if (newOrientation !== boardOrientation) { // Only update if it actually changes
      setBoardOrientation(newOrientation);
    }
    
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const inCheck = isKingInCheck(updatedBoard, nextPlayer);
    let newPlayerWithKingInCheck: PlayerColor | null = null;

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded });
      } else {
        setGameInfo({ message: "Check!", isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false });
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
      } else {
        setGameInfo({ message: "\u00A0", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
      }
    }
  }, [setCurrentPlayer, setSelectedSquare, setPossibleMoves, determineBoardOrientation, viewMode, isBlackAI, isWhiteAI, boardOrientation, setBoardOrientation, setGameInfo, getPlayerDisplayName, setEnemyPossibleMoves, setEnemySelectedSquare]);

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing) return;

    let currentBoardForClick = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = currentBoardForClick[row][col];
    const clickedPiece = clickedSquareState.piece;

    if (selectedSquare) {
        const pieceToMoveData = currentBoardForClick[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
        const pieceToMove = pieceToMoveData.piece;

        if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && (pieceToMove.level || 1) >= 5) {
            saveStateToHistory();
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic); // Animate the knight itself

            let finalBoardAfterDestruct = currentBoardForClick.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            let finalCapturedPiecesAfterDestruct = {
              white: [...(capturedPieces.white || [])],
              black: [...(capturedPieces.black || [])]
            };
            const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);
            const piecesDestroyed: Piece[] = [];
            const selfDestructPlayer = currentPlayer;
            let calculatedNewStreakForPlayer: number = killStreaks[selfDestructPlayer] || 0;
            let selfDestructCapturedSomething = false;

            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const adjR = knightR + dr;
                    const adjC = knightC + dc;
                    if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                        const victimPiece = finalBoardAfterDestruct[adjR][adjC].piece;
                        if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                            if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceToMove.level || 1) < (victimPiece.level || 1))) {
                                toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable piece.`, duration: 2500 });
                                continue;
                            }
                            piecesDestroyed.push({ ...victimPiece });
                            finalCapturedPiecesAfterDestruct[selfDestructPlayer].push({...victimPiece});
                            finalBoardAfterDestruct[adjR][adjC].piece = null;
                            toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
                            selfDestructCapturedSomething = true;
                        }
                    }
                }
            }
            finalBoardAfterDestruct[knightR][knightC].piece = null;

            if (selfDestructCapturedSomething) {
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                calculatedNewStreakForPlayer += piecesDestroyed.length;
                setLastCapturePlayer(selfDestructPlayer);
            } else { // Knight self-destructed but captured nothing
                calculatedNewStreakForPlayer = 0; // Breaks own streak
                // No change to lastCapturePlayer if nothing was captured this turn
            }
            
            setKillStreaks(prev => {
                const newStreaks = {...prev};
                newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
                if (selfDestructCapturedSomething) { // Only reset opponent streak if a capture happened
                    const opponent = selfDestructPlayer === 'white' ? 'black' : 'white';
                    newStreaks[opponent] = 0;
                }
                return newStreaks;
            });


            if (calculatedNewStreakForPlayer === 3) { // Only if streak becomes exactly 3
                const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
                let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesAfterDestruct[opponentOfSelfDestructPlayer] || [])];
                if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop(); 
                    finalCapturedPiecesAfterDestruct[opponentOfSelfDestructPlayer] = piecesOfCurrentPlayerCapturedByOpponent;

                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardAfterDestruct[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = resurrectionIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                        finalBoardAfterDestruct[resR][resC].piece = resurrectedPiece;
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                }
            }
            setBoard(finalBoardAfterDestruct);
            setCapturedPieces(finalCapturedPiecesAfterDestruct);

            setTimeout(() => {
                setAnimatedSquareTo(null);
                setSelectedSquare(null); setPossibleMoves([]);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
                const streakGrantsExtraTurn = calculatedNewStreakForPlayer === 6; // Exactly 6
                if (streakGrantsExtraTurn) {
                    toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(selfDestructPlayer)} gets extra turn from destruction streak!`, duration: 2500 });
                    setGameInfoBasedOnExtraTurn(finalBoardAfterDestruct, selfDestructPlayer);
                } else {
                    completeTurn(finalBoardAfterDestruct, selfDestructPlayer);
                }
                setIsMoveProcessing(false);
            }, 400);
            return;
        } else if (possibleMoves.includes(algebraic)) {
            saveStateToHistory();
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic);

            let finalBoardStateForTurn = currentBoardForClick.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            let finalCapturedPiecesStateForTurn = {
                white: [...(capturedPieces.white || [])],
                black: [...(capturedPieces.black || [])]
            };
            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, { from: selectedSquare, to: algebraic });
            finalBoardStateForTurn = newBoard;
            // Do not setBoard(finalBoardStateForTurn) here yet, wait for all effects

            const capturingPlayer = currentPlayer;
            let currentCalculatedStreakForCapturingPlayer: number = killStreaks[capturingPlayer] || 0;

            if (captured) {
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
                currentCalculatedStreakForCapturingPlayer += 1;
                setLastCapturePlayer(capturingPlayer);
            } else { // No capture
                currentCalculatedStreakForCapturingPlayer = 0; // Break own streak
                // lastCapturePlayer remains unchanged if opponent had the last capture
            }

            setKillStreaks(prev => {
                const newStreaks = {...prev};
                newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
                if (captured) { // Only reset opponent's streak if a capture happened
                    const opponent = capturingPlayer === 'white' ? 'black' : 'white';
                    newStreaks[opponent] = 0;
                }
                return newStreaks;
            });
            

            if (currentCalculatedStreakForCapturingPlayer === 3) { // Only if streak becomes exactly 3
                const opponentColor = capturingPlayer === 'white' ? 'black' : 'white';
                let piecesBelongingToCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentColor] || [])];
                if (piecesBelongingToCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesBelongingToCurrentPlayerCapturedByOpponent.pop();
                    finalCapturedPiecesStateForTurn[opponentColor] = piecesBelongingToCurrentPlayerCapturedByOpponent;

                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = resurrectionIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece; // Apply to the working board state
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                }
            }

            if (conversionEvents && conversionEvents.length > 0) {
                conversionEvents.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
            }

            setBoard(finalBoardStateForTurn); // Now set the final board state
            setCapturedPieces(finalCapturedPiecesStateForTurn);

            setTimeout(() => {
                setAnimatedSquareTo(null);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

                const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
                const movedPieceOnBoard = movedPieceFinalSquare.piece;
                const { row: toRowPawnCheck } = algebraicToCoords(algebraic);
                const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);
                const streakGrantsExtraTurn = currentCalculatedStreakForCapturingPlayer === 6; // Exactly 6

                if (isPawnPromotingMove) {
                    setIsPromotingPawn(true); setPromotionSquare(algebraic);
                } else {
                    if (streakGrantsExtraTurn) {
                        toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(currentPlayer)} gets extra turn from streak of 6!`, duration: 2500 });
                        setGameInfoBasedOnExtraTurn(finalBoardStateForTurn, currentPlayer);
                    } else {
                        completeTurn(finalBoardStateForTurn, currentPlayer);
                    }
                }
                setIsMoveProcessing(false);
            }, 400);
            return;
        }
        // Clicked on an empty square or an unmovable piece
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) {
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic); // Use current board state for display
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) {
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic); // Use current board state
            const legalFilteredMoves = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
            setPossibleMoves(legalFilteredMoves);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else { // Clicked an empty square not part of a move
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }

    } else { // No square was previously selected
        if (clickedPiece) {
            if (clickedPiece.color === currentPlayer) {
                setSelectedSquare(algebraic);
                const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
                const legalFilteredMoves = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
                setPossibleMoves(legalFilteredMoves);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else { // Clicked on an enemy piece
                setEnemySelectedSquare(algebraic);
                const enemyMoves = getPossibleMoves(board, algebraic);
                setEnemyPossibleMoves(enemyMoves);
                setSelectedSquare(null);
                setPossibleMoves([]);
            }
        } else { // Clicked an empty square
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
    }
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, killStreaks, capturedPieces, saveStateToHistory, setGameInfoBasedOnExtraTurn, completeTurn, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPossibleMoves, setSelectedSquare, setGameInfo, determineBoardOrientation, viewMode, isWhiteAI, isBlackAI, isAiThinking, setEnemySelectedSquare, setEnemyPossibleMoves, toast, setAnimatedSquareTo, setIsMoveProcessing, showCaptureFlash, captureFlashKey, showCheckFlashBackground, checkFlashBackgroundKey, showCheckmatePatternFlash, checkmatePatternFlashKey, lastCapturePlayer ]);


  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing) return; // Ensure promotion square is set and not processing another move
    saveStateToHistory();
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare); // Animate the promotion square

    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;

    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      console.error("Promotion error: No pawn found at promotion square or piece is not a pawn.");
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false); return;
    }
    const originalPawnLevel = originalPawnOnBoard.level || 1;
    const pawnColor = originalPawnOnBoard.color;
    boardAfterPromotion[row][col].piece = {
        ...originalPawnOnBoard,
        type: pieceType,
        level: 1, // Reset level to 1 on promotion
        invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0, // Grant invulnerability if promoted to Rook
        id: `${originalPawnOnBoard.id}_promo_${pieceType}`,
        hasMoved: true, // Promoted piece is considered to have moved
    };

    setBoard(boardAfterPromotion); // Update the board with the promoted piece

    setTimeout(() => {
        setAnimatedSquareTo(null);
        if (pieceType === 'rook') {
            console.log(`VIBE_DEBUG: Pawn promoted to Rook (Color: ${pawnColor}) at ${promotionSquare} GAINED invulnerability.`);
            toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to Rook! (L1) Invulnerable!`, duration: 2500 });
        } else {
            toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)`, duration: 2500 });
        }

        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);

        // Check for extra turn
        const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
        // Use the current killStreaks state for the player who promoted
        const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6; // Exactly 6

        if (pawnLevelGrantsExtraTurn || streakGrantsExtraTurn) {
          let reason = pawnLevelGrantsExtraTurn && streakGrantsExtraTurn ? "high-level promotion AND streak of 6!" : pawnLevelGrantsExtraTurn ? "high-level promotion!" : "streak of 6!";
          toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(pawnColor)} gets an extra turn from ${reason}`, duration: 2500 });
          setGameInfoBasedOnExtraTurn(boardAfterPromotion, pawnColor);
        } else {
          completeTurn(boardAfterPromotion, pawnColor);
        }
        setIsPromotingPawn(false); setPromotionSquare(null);
        setIsMoveProcessing(false);
    }, 400);
  }, [ board, promotionSquare, toast, killStreaks, setGameInfoBasedOnExtraTurn, saveStateToHistory, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, completeTurn, setEnemyPossibleMoves, setEnemySelectedSquare, isMoveProcessing, setAnimatedSquareTo ]);

  const handleUndo = useCallback(() => {
    if (isAiThinking || isMoveProcessing) {
      toast({ title: "Undo Failed", description: "Cannot undo while AI is thinking or move processing.", duration: 2500 });
      return;
    }
    if (historyStack.length === 0) {
        toast({ title: "Undo Failed", description: "No moves to undo.", duration: 2500 });
        return;
    }

    const playerWhoseTurnItIsNow = currentPlayer; // Player whose turn it is BEFORE undo
    const playerWhoMadeTheActualLastMove = playerWhoseTurnItIsNow === 'white' ? 'black' : 'white';

    let aiMadeTheActualLastMove = false;
    if (playerWhoMadeTheActualLastMove === 'white' && isWhiteAI) aiMadeTheActualLastMove = true;
    else if (playerWhoMadeTheActualLastMove === 'black' && isBlackAI) aiMadeTheActualLastMove = true;

    const isHumanVsAiGame = (isWhiteAI && !isBlackAI) || (!isWhiteAI && isBlackAI);
    let statesToPop = 1;
    if (isHumanVsAiGame && aiMadeTheActualLastMove && historyStack.length >= 2) {
        statesToPop = 2; // Undo AI's move AND human's preceding move
    }

    const targetHistoryIndex = historyStack.length - statesToPop;
    if (targetHistoryIndex < 0) { // Should not happen if length checks are correct, but as safeguard
        toast({ title: "Undo Error", description: "Not enough history to undo that many moves.", duration: 2500 });
        return;
    }
    const stateToRestore = historyStack[targetHistoryIndex];
    const newHistoryStack = historyStack.slice(0, targetHistoryIndex);

    if (stateToRestore) {
      setBoard(stateToRestore.board);
      setCurrentPlayer(stateToRestore.currentPlayer);
      setGameInfo(stateToRestore.gameInfo);
      setCapturedPieces(stateToRestore.capturedPieces);
      setKillStreaks(stateToRestore.killStreaks);
      setLastCapturePlayer(stateToRestore.lastCapturePlayer);

      // Restore AI settings from the snapshot
      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation(stateToRestore.viewMode, stateToRestore.currentPlayer, stateToRestore.isBlackAI, stateToRestore.isWhiteAI)); // Recalculate based on restored AI states

      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(stateToRestore.enemySelectedSquare || null);
      setEnemyPossibleMoves(stateToRestore.enemyPossibleMoves || []);

      flashedCheckStateRef.current = null; // Reset flashed state as the context has changed
      setFlashMessage(null);
      setShowCheckFlashBackground(false);
      setShowCaptureFlash(false);
      setShowCheckmatePatternFlash(false);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false); // Ensure move processing is reset
      setHistoryStack(newHistoryStack);
      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    }
  }, [
    historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI,
    determineBoardOrientation, setBoard, setCurrentPlayer, setGameInfo,
    setCapturedPieces, setKillStreaks, setLastCapturePlayer, setBoardOrientation,
    setViewMode, setIsWhiteAI, setIsBlackAI, setSelectedSquare, setPossibleMoves,
    setFlashMessage, setIsPromotingPawn, setPromotionSquare,
    setHistoryStack, setEnemyPossibleMoves, setEnemySelectedSquare, isMoveProcessing,
    setAnimatedSquareTo, setShowCaptureFlash, setShowCheckFlashBackground, setShowCheckmatePatternFlash
  ]);

  const handleToggleViewMode = () => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      // Update orientation based on new view mode and current AI states
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]); // Clear selections on view change
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };

  const handleToggleWhiteAI = () => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing) return; // Prevent toggling during AI move
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };
  const handleToggleBlackAI = () => {
    if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing) return; // Prevent toggling during AI move
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };

  // AI Turn Logic
  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);

    const performAiMove = async () => {
        setIsAiThinking(true);
        setIsMoveProcessing(true); // Also set move processing
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} is thinking...`}));
        setSelectedSquare(null); setPossibleMoves([]);
        setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

        // Short delay to allow UI update for "thinking" message
        await new Promise(resolve => setTimeout(resolve, 250)); 

        let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        let finalCapturedPiecesStateForTurn = {
            white: [...(capturedPieces.white || [])],
            black: [...(capturedPieces.black || [])]
        };

        let calculatedNewStreakForAIPlayer: number = killStreaks[currentPlayer] || 0;
        let aiMoveData: AIMove | null = null;
        let aiErrorOccurred = false;

        try {
            const gameStateForAI = adaptBoardForAI(finalBoardStateForTurn, currentPlayer, killStreaks, capturedPieces);
            // aiInstanceRef.current = new VibeChessAI(2); // Re-instantiate if needed or use ref
            
            aiMoveData = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

            if (!aiMoveData || !Array.isArray(aiMoveData.from) || aiMoveData.from.length !== 2 ||
                !Array.isArray(aiMoveData.to) || aiMoveData.to.length !== 2) {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Error: AI failed to select a valid move structure. Raw move:`, aiMoveData);
                aiErrorOccurred = true;
            } else {
                const aiFromAlg = coordsToAlgebraic(aiMoveData.from[0], aiMoveData.from[1]);
                const aiToAlg = coordsToAlgebraic(aiMoveData.to[0], aiMoveData.to[1]);
                
                setAnimatedSquareTo(aiToAlg); // Animate the AI's move

                const pieceOnFromSquare = finalBoardStateForTurn[aiMoveData.from[0]]?.[aiMoveData.from[1]]?.piece;

                if (!pieceOnFromSquare || pieceOnFromSquare.color !== currentPlayer) {
                    console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Error: AI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquare, " Intended move: ", aiMoveData);
                    aiErrorOccurred = true;
                } else {
                    const allPossiblePseudoMovesForAIPiece = getPossibleMoves(finalBoardStateForTurn, aiFromAlg);
                    const legalMovesForAiPieceOnBoard = filterLegalMoves(finalBoardStateForTurn, aiFromAlg, allPossiblePseudoMovesForAIPiece, currentPlayer);

                    let isAiMoveActuallyLegal = false;
                    // Special check for AI self-destruct if AI's internal logic might not provide the exact 'self-destruct' type
                    if (aiMoveData.type === 'self-destruct' && pieceOnFromSquare.type === 'knight' && (pieceOnFromSquare.level || 1) >= 5) {
                         // If from and to are the same, it's a self-destruct signal from this AI
                        if (aiMoveData.from[0] === aiMoveData.to[0] && aiMoveData.from[1] === aiMoveData.to[1]) {
                             isAiMoveActuallyLegal = true; // Self-destruct is its own kind of legal
                        } else {
                             console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
                             aiErrorOccurred = true;
                        }
                    } else {
                        isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
                    }


                    if (isAiMoveActuallyLegal) {
                        saveStateToHistory(); // Save state before AI's move
                        let capturedByAI: Piece | null = null;
                        let conversionEventsByAI: ConversionEvent[] = [];
                        let aiMoveCapturedSomething = false;

                        if (aiMoveData.type === 'self-destruct') {
                            // AI Knight Self-Destruct Logic (Mirroring human player)
                            const { row: knightR, col: knightC } = aiMoveData.from;
                            const piecesDestroyedByAI: Piece[] = [];

                            for (let dr = -1; dr <= 1; dr++) {
                              for (let dc = -1; dc <= 1; dc++) {
                                if (dr === 0 && dc === 0) continue;
                                const adjR = knightR + dr;
                                const adjC = knightC + dc;
                                if (adjR >= 0 && adjR < 8 && adjC >=0 && adjC < 8 ) {
                                  const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                                  if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                                    // Check invulnerability of victim against the Knight
                                    if (isKingInCheck(finalBoardStateForTurn, victimPiece.color) && // simplified invuln check for self-destruct
                                        ((victimPiece.type === 'rook' && (victimPiece.level || 1) >= 3 && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                        (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceOnFromSquare.level || 1) < (victimPiece.level || 1)))
                                    ) {
                                      continue; // Skip invulnerable piece
                                    }
                                    piecesDestroyedByAI.push({ ...victimPiece });
                                    finalCapturedPiecesStateForTurn[currentPlayer].push({ ...victimPiece }); // AI captures these
                                    finalBoardStateForTurn[adjR][adjC].piece = null;
                                    aiMoveCapturedSomething = true;
                                  }
                                }
                              }
                            }
                            finalBoardStateForTurn[knightR][knightC].piece = null; // Knight is removed
                            toast({ title: `AI ${getPlayerDisplayName(currentPlayer)} Knight Self-Destructs!`, description: `${piecesDestroyedByAI.length} pieces obliterated.`, duration: 2500});
                            if(aiMoveCapturedSomething) {
                                calculatedNewStreakForAIPlayer += piecesDestroyedByAI.length;
                            }

                        } else { // Regular move, capture, or promotion by AI
                            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, { from: aiFromAlg, to: aiToAlg });
                            finalBoardStateForTurn = newBoard; // Update board with result of applyMove
                            capturedByAI = captured;
                            conversionEventsByAI = conversionEvents || [];
                            toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiFromAlg} to ${aiToAlg}`, duration: 1500});

                            if (capturedByAI) {
                                aiMoveCapturedSomething = true;
                                setShowCaptureFlash(true);
                                setCaptureFlashKey(k => k + 1);
                                finalCapturedPiecesStateForTurn[currentPlayer].push(capturedByAI); // AI captures this piece
                                calculatedNewStreakForAIPlayer += 1;
                            }
                             if (conversionEventsByAI && conversionEventsByAI.length > 0) {
                                conversionEventsByAI.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
                            }
                        }

                        setBoard(finalBoardStateForTurn); // Set board before streak logic

                        if(aiMoveCapturedSomething) {
                             setKillStreaks(prev => {
                                const newStreaks = {...prev};
                                newStreaks[currentPlayer] = calculatedNewStreakForAIPlayer;
                                const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                                newStreaks[opponentColorAI] = 0; // Reset opponent's streak
                                return newStreaks;
                            });
                            setLastCapturePlayer(currentPlayer);
                        } else { // AI made a non-capturing move
                             setKillStreaks(prev => {
                                const newStreaks = {...prev};
                                newStreaks[currentPlayer] = 0; // AI's own streak breaks
                                return newStreaks;
                             });
                             // lastCapturePlayer remains unchanged if opponent had it
                        }

                        if (calculatedNewStreakForAIPlayer === 3) {
                            const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                            let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentColorAI] || [])];
                             if (piecesOfAICapturedByOpponent.length > 0) {
                                const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop();
                                finalCapturedPiecesStateForTurn[opponentColorAI] = piecesOfAICapturedByOpponent;

                                const emptySqAI: AlgebraicSquare[] = [];
                                for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                                if(emptySqAI.length > 0 && pieceToResOriginalAI){
                                    const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                    const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                    const newUniqueSuffixAI = resurrectionIdCounter++;
                                    const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                                    finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI;
                                    setBoard(finalBoardStateForTurn); // Update board again if piece resurrected
                                    toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                                }
                            }
                        }
                        setCapturedPieces(finalCapturedPiecesStateForTurn); // Set final captured pieces state
                    } else { // AI move was not legal according to game client
                        console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: Minimax AI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Game Logic Valid for ${aiFromAlg}: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveData.type}`);
                        aiErrorOccurred = true;
                    }
                }
            }
        } catch (error) { // Catch errors from AI.getBestMove or within this block
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`AI Error for ${getPlayerDisplayName(currentPlayer)} (Caught in performAiMove try-catch): ${errorMessage}`, error);
            aiErrorOccurred = true;
        }

        // This timeout handles the end of the AI's move processing, including animation and turn completion
        setTimeout(() => {
            setAnimatedSquareTo(null); // Stop animation
            if (aiErrorOccurred) {
                toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI forfeited turn.", variant: "destructive", duration: 2500 });
                // Turn off the errored AI
                if (currentPlayer === 'white') setIsWhiteAI(false);
                if (currentPlayer === 'black') setIsBlackAI(false);
                // Defer completeTurn to ensure state updates for AI toggles are processed
                setTimeout(() => {
                  completeTurn(board, currentPlayer); // Pass original board if AI errored before moving
                }, 0);
            } else if (aiMoveData) { // AI made a move (error did not occur before move application)
                const pieceAtDestination = finalBoardStateForTurn[aiMoveData.to[0]][aiMoveData.to[1]]?.piece;
                const promotionRowAI = currentPlayer === 'white' ? 0 : 7;
                const isAIPawnPromoting = pieceAtDestination &&
                                          pieceAtDestination.type === 'pawn' && // Should be the new piece type after promotion
                                          aiMoveData.to[0] === promotionRowAI;
                
                // AI auto-promotes to Queen in its internal makeMove for evaluation.
                // Here, we ensure the promoted piece type from AI's makeMove is respected if it set one,
                // or default to Queen if type is still pawn at promotion rank.
                if (pieceAtDestination && pieceAtDestination.type === 'pawn' && aiMoveData.to[0] === promotionRowAI) {
                    const promotedTypeAI = aiMoveData.promoteTo || 'queen'; // Use AI's choice or default
                    finalBoardStateForTurn[aiMoveData.to[0]][aiMoveData.to[1]].piece = {
                        ...(pieceAtDestination),
                        type: promotedTypeAI,
                        level: 1,
                        invulnerableTurnsRemaining: promotedTypeAI === 'rook' ? 1 : 0,
                        id: `${pieceAtDestination.id}_promo_${promotedTypeAI}_ai`,
                        hasMoved: true,
                    };
                    setBoard(finalBoardStateForTurn); // Update board with explicit AI promotion
                    toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });
                }

                const aiStreakExtraTurn = calculatedNewStreakForAIPlayer === 6; // Exactly 6
                // AI does not get pawn promotion extra turn in this simplified model.
                if (aiStreakExtraTurn) {
                    toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(currentPlayer)} (AI) gets extra turn from streak of 6!`, duration: 2500 });
                    setGameInfoBasedOnExtraTurn(finalBoardStateForTurn, currentPlayer);
                } else {
                    completeTurn(finalBoardStateForTurn, currentPlayer);
                }
            }
            setIsAiThinking(false);
            setIsMoveProcessing(false); // AI move processing finished
        }, 400); // Delay for animation and then process turn completion
      };

      if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing) {
         performAiMove();
      }
  }, [
    currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, gameInfo.isCheck, gameInfo.playerWithKingInCheck, gameInfo.message, // Added gameInfo.message
    isAiThinking, isPromotingPawn, board, killStreaks, lastCapturePlayer, capturedPieces,
    saveStateToHistory, toast, getPlayerDisplayName, setBoard, setCapturedPieces,
    setKillStreaks, setLastCapturePlayer, setGameInfo, viewMode, determineBoardOrientation,
    setBoardOrientation, setGameInfoBasedOnExtraTurn, completeTurn, setSelectedSquare, setPossibleMoves,
    setEnemySelectedSquare, setEnemyPossibleMoves, setIsWhiteAI, setIsBlackAI, setIsAiThinking,
    setAnimatedSquareTo, setIsMoveProcessing, setShowCaptureFlash, setCaptureFlashKey, aiInstanceRef
  ]);

  const mainContentRef = useRef<HTMLDivElement>(null);

  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn || isAiThinking;
  const isInteractionDisabled = gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing;


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center relative">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center">
        {flashMessage && ( <div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}

        <div className="w-full flex flex-col items-center mb-6 space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
            <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
                <RefreshCw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
                <BookOpen className="h-4 w-4 mr-1" /> Rules
            </Button>
            <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking || isMoveProcessing} aria-label="Undo Move" className="h-8 px-2 text-xs">
                <Undo2 className="h-4 w-4 mr-1" /> Undo
            </Button>
            <Button variant="outline" onClick={handleToggleWhiteAI} disabled={(isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
                <Bot className="h-4 w-4 mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleBlackAI} disabled={(isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
                <Bot className="h-4 w-4 mr-1" /> Black AI: {isBlackAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
                <View className="h-4 w-4 mr-1" /> View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
            </Button>
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
            <div className="md:w-1/3 lg:w-1/4">
            <GameControls
                currentPlayer={currentPlayer}
                gameStatusMessage={gameInfo.message}
                capturedPieces={capturedPieces}
                isCheck={gameInfo.isCheck}
                isGameOver={gameInfo.gameOver}
                killStreaks={killStreaks}
                isWhiteAI={isWhiteAI}
                isBlackAI={isBlackAI}
            />
            </div>
            <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
            <ChessBoard
                boardState={board}
                selectedSquare={selectedSquare}
                possibleMoves={possibleMoves}
                enemySelectedSquare={enemySelectedSquare}
                enemyPossibleMoves={enemyPossibleMoves}
                onSquareClick={handleSquareClick}
                playerColor={boardOrientation} // This is the orientation perspective
                currentPlayerColor={currentPlayer} // This is whose turn it actually is
                isInteractionDisabled={isInteractionDisabled}
                applyBoardOpacityEffect={applyBoardOpacityEffect}
                playerInCheck={gameInfo.playerWithKingInCheck}
                viewMode={viewMode}
                animatedSquareTo={animatedSquareTo}
            />
            </div>
        </div>
      </div>
      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={promotionSquare && board[algebraicToCoords(promotionSquare).row][algebraicToCoords(promotionSquare).col].piece?.color || null}
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}
```