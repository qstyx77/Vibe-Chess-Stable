
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
  getCastlingRightsString,
  boardToPositionHash,
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
  isThreefoldRepetitionDraw: false,
  gameOver: false,
  winner: undefined,
};

// Adapts the main game's BoardState to the AIGameState for the VibeChessAI class
function adaptBoardForAI(
  mainBoard: BoardState,
  currentPlayerForAI: PlayerColor,
  currentKillStreaks: GameStatus['killStreaks'],
  currentCapturedPieces: GameStatus['capturedPieces']
): any { // Using 'any' for AIGameState due to its definition in vibe-chess-ai.ts
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      const pieceForAI: any = { // Use 'any' or a more specific AI Piece type if defined
        ...squareState.piece,
        invulnerable: (squareState.piece.invulnerableTurnsRemaining || 0) > 0,
      };
      return pieceForAI;
    })
  );

  return {
    board: aiBoard,
    currentPlayer: currentPlayerForAI,
    killStreaks: {
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: { // AI needs this for its resurrection logic
        white: currentCapturedPieces?.white?.map(p => ({ ...p })) || [],
        black: currentCapturedPieces?.black?.map(p => ({ ...p })) || [],
    },
    gameOver: initialGameStatus.gameOver, 
    winner: initialGameStatus.winner, 
  };
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>(initialGameStatus);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [positionHistory, setPositionHistory] = useState<string[]>([]);

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
  const aiInstanceRef = useRef(new VibeChessAI(2));
  const aiErrorOccurredRef = useRef(false);

  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);

  const { toast } = useToast();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn;


  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  }, [isWhiteAI, isBlackAI]);

  const determineBoardOrientation = useCallback((
    currentViewMode: ViewMode,
    playerForTurn: PlayerColor,
    blackIsCurrentlyAI: boolean,
    whiteIsCurrentlyAI: boolean
  ): PlayerColor => {
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // AI vs AI, default to white's view
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black'; // Human is Black
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // Human is White

    // Human vs Human
    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; // Tabletop defaults to White's perspective
  }, []);

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

    // Check for auto-checkmate: if extra turn AND opponent is put in check
    const isStreakExtraTurn = (killStreaks[playerTakingExtraTurn] || 0) === 6;
    const movedPieceCoords = promotionSquare ? algebraicToCoords(promotionSquare) : null;
    const movedPieceForAutoCheckmate = movedPieceCoords ? currentBoard[movedPieceCoords.row]?.[movedPieceCoords.col]?.piece : null;
    const isPawnPromoExtraTurn = promotionSquare && (movedPieceForAutoCheckmate?.level || 0) >=5;


    if (opponentInCheck && ( isStreakExtraTurn || isPawnPromoExtraTurn )) {
        toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn, killStreaks, capturedPieces });
        return;
    }

    if (opponentInCheck) {
      setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn! Check!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
    } else {
      const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
      if (opponentIsStalemated) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw', killStreaks, capturedPieces });
        return;
      }
      setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, killStreaks, promotionSquare, capturedPieces, setGameInfo, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';

    const newOrientation = determineBoardOrientation(viewMode, nextPlayer, isBlackAI, isWhiteAI);
    if (newOrientation !== boardOrientation) {
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
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded, killStreaks, capturedPieces });
      } else {
        setGameInfo({ message: "Check!", isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw', killStreaks, capturedPieces });
      } else {
        setGameInfo({ message: "\u00A0", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false, killStreaks, capturedPieces });
      }
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, getPlayerDisplayName, determineBoardOrientation, killStreaks, capturedPieces, setGameInfo, setBoardOrientation, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);

  const processMoveEnd = useCallback((boardAfterMove: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean) => {
    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(boardAfterMove);
    const currentPositionHash = boardToPositionHash(boardAfterMove, nextPlayerForHash, castlingRights);

    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.gameOver) { // Check gameInfo.gameOver here
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 2500 });
      setGameInfo({ // Ensure killStreaks and capturedPieces are passed
        message: "Draw by Threefold Repetition!",
        isCheck: false,
        playerWithKingInCheck: null,
        isCheckmate: false,
        isStalemate: true, // Mark as stalemate for draw condition
        isThreefoldRepetitionDraw: true,
        gameOver: true,
        winner: 'draw',
        killStreaks,
        capturedPieces
      });
      return; // Exit early as game is over
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, gameInfo.gameOver, killStreaks, capturedPieces, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn]);


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
      positionHistory: [...positionHistory],
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); // Limit history size
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory]);


  const resetGame = useCallback(() => {
    resurrectionIdCounter = 0;
    const initialBoardState = initializeBoard();
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameInfo(initialGameStatus);
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights);
    setPositionHistory([initialHash]);

    setFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);

    setIsWhiteAI(false); // Turn off AI on reset
    setIsBlackAI(false); // Turn off AI on reset
    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;

    const initialOrientation = determineBoardOrientation('flipping', 'white', false, false);
    setBoardOrientation(initialOrientation);

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
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
    setPositionHistory([initialHash]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on initial mount

  useEffect(() => {
    let currentCheckStateString: string | null = null;

    if (gameInfo.gameOver && gameInfo.winner === 'draw') {
        currentCheckStateString = 'draw';
    } else if (gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = `checkmate-${gameInfo.playerWithKingInCheck}`;
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    }

    if (currentCheckStateString) {
      if (flashedCheckStateRef.current !== currentCheckStateString) {
        if (currentCheckStateString.startsWith('draw')) {
            setFlashMessage('DRAW!');
            setShowCheckmatePatternFlash(true);
            setCheckmatePatternFlashKey(k => k + 1);
        } else if (currentCheckStateString.startsWith('checkmate')) {
          setFlashMessage('CHECKMATE!');
          setShowCheckmatePatternFlash(true);
          setCheckmatePatternFlashKey(k => k + 1);
        } else if (currentCheckStateString.endsWith('-check')) {
          setFlashMessage('CHECK!');
          setShowCheckFlashBackground(true);
          setCheckFlashBackgroundKey(k => k + 1);
        }
        setFlashMessageKey(k => k + 1);
        flashedCheckStateRef.current = currentCheckStateString;
      }
    } else {
        if (flashedCheckStateRef.current) {
             flashedCheckStateRef.current = null; // Clear flashed state if no current check/mate/draw
        }
    }
  }, [gameInfo]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (flashMessage) {
      const duration = (flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!') ? 2500 : 1500;
      timerId = setTimeout(() => {
        setFlashMessage(null);
      }, duration);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [flashMessage, flashMessageKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250); // 1.25s animation + 1s buffer
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCaptureFlash) {
      timerId = setTimeout(() => {
        setShowCaptureFlash(false);
      }, 2250); // 1.25s animation + 1s buffer
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCaptureFlash, captureFlashKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250); // 3.25s animation + 2s buffer
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);

  useEffect(() => {
    console.log(`VIBE_DEBUG (HvsH & AI): Start of ${currentPlayer}'s turn. Clearing invulnerability for ${currentPlayer}'s Rooks if applicable.`);
    setBoard(prevBoard => {
      if (!prevBoard) return prevBoard; // Guard against null prevBoard
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
      return prevBoard;
    });
  }, [currentPlayer, setBoard]); // Added setBoard

  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing) return;

    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };
    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = finalBoardStateForTurn[row][col];
    const clickedPiece = clickedSquareState.piece;

    if (selectedSquare) {
        const pieceToMoveData = finalBoardStateForTurn[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
        const pieceToMove = pieceToMoveData.piece;

        // Knight Self-Destruct (L5+)
        if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && (pieceToMove.level || 1) >= 5) {
            saveStateToHistory();
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic); // Animate the knight itself for self-destruct

            const selfDestructPlayer = currentPlayer;
            const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
            let selfDestructCapturedSomething = false;
            let calculatedNewStreakForPlayer: number;

            const piecesDestroyed: Piece[] = [];
            const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);

            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const adjR = knightR + dr;
                    const adjC = knightC + dc;
                    if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                        const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                        if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                             if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceToMove.level || 1) < (victimPiece.level || 1))) {
                                toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable piece.`, duration: 2500 });
                                continue;
                            }
                            piecesDestroyed.push({ ...victimPiece });
                            finalCapturedPiecesStateForTurn[selfDestructPlayer].push({...victimPiece});
                            finalBoardStateForTurn[adjR][adjC].piece = null;
                            toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
                            selfDestructCapturedSomething = true;
                        }
                    }
                }
            }
            finalBoardStateForTurn[knightR][knightC].piece = null; // Remove the knight

            if (selfDestructCapturedSomething) {
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                calculatedNewStreakForPlayer = (killStreaks[selfDestructPlayer] || 0) + piecesDestroyed.length;
            } else { // No pieces destroyed by self-destruct
                 calculatedNewStreakForPlayer = 0; // Break own streak
            }

            setKillStreaks(prevKillStreaks => {
              const newStreaks = {
                white: prevKillStreaks.white,
                black: prevKillStreaks.black
              };
              newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
              if (selfDestructCapturedSomething) { // If something was captured, opponent's streak breaks
                newStreaks[opponentOfSelfDestructPlayer] = 0;
              }
              return newStreaks;
            });
            setLastCapturePlayer(selfDestructCapturedSomething ? selfDestructPlayer : null);

            if (calculatedNewStreakForPlayer === 3) {
                let piecesOfCurrentPlayerCapturedByOpponent = finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] || [];
                if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
                    finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] = [...piecesOfCurrentPlayerCapturedByOpponent]; 

                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = resurrectionIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                }
            }
            setBoard(finalBoardStateForTurn);
            setCapturedPieces(finalCapturedPiecesStateForTurn);

            setTimeout(() => {
                setAnimatedSquareTo(null);
                setSelectedSquare(null); setPossibleMoves([]);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
                const streakGrantsExtraTurn = calculatedNewStreakForPlayer === 6;
                processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn);
                setIsMoveProcessing(false);
            }, 800); // Animation duration
            return;
        } else if (possibleMoves.includes(algebraic)) { // Regular move or capture
            saveStateToHistory();
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic);

            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, { from: selectedSquare, to: algebraic });
            finalBoardStateForTurn = newBoard;

            const capturingPlayer = currentPlayer;
            const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
            let currentCalculatedStreakForCapturingPlayer: number;

            if (captured) {
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
                currentCalculatedStreakForCapturingPlayer = (killStreaks[capturingPlayer] || 0) + 1;
            } else { // No capture on this move
                 currentCalculatedStreakForCapturingPlayer = 0; // Break own streak
            }

            setKillStreaks(prevKillStreaks => {
              const newStreaks = {
                white: prevKillStreaks.white,
                black: prevKillStreaks.black
              };
              newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
              if (captured) { // If something was captured, opponent's streak breaks
                newStreaks[opponentPlayer] = 0;
              }
              return newStreaks;
            });
            setLastCapturePlayer(captured ? capturingPlayer : null);

            if (currentCalculatedStreakForCapturingPlayer === 3) {
                let piecesBelongingToCurrentPlayerCapturedByOpponent = finalCapturedPiecesStateForTurn[opponentPlayer] || [];
                if (piecesBelongingToCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesBelongingToCurrentPlayerCapturedByOpponent.pop();
                    finalCapturedPiecesStateForTurn[opponentPlayer] = [...piecesBelongingToCurrentPlayerCapturedByOpponent]; 

                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = resurrectionIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                }
            }

            if (conversionEvents && conversionEvents.length > 0) {
                conversionEvents.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
            }

            setBoard(finalBoardStateForTurn);
            setCapturedPieces(finalCapturedPiecesStateForTurn);

            setTimeout(() => {
                setAnimatedSquareTo(null);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

                const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
                const movedPieceOnBoard = movedPieceFinalSquare.piece;
                const { row: toRowPawnCheck } = algebraicToCoords(algebraic);
                const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);
                const streakGrantsExtraTurn = currentCalculatedStreakForCapturingPlayer === 6;

                if (isPawnPromotingMove) {
                    setIsPromotingPawn(true); setPromotionSquare(algebraic);
                } else {
                    processMoveEnd(finalBoardStateForTurn, currentPlayer, streakGrantsExtraTurn);
                }
                setIsMoveProcessing(false);
            }, 800); // Animation duration
            return;
        }

        // Clicked on a new square (not a move for the selected piece)
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) { // Selected an enemy piece
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic); // Use current board
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) { // Selected own piece
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic); // Use current board
            const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
            setPossibleMoves(legalMovesForPlayer);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else { // Clicked an empty square without a piece selected
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }

    } else { // No piece was previously selected
        if (clickedPiece) {
            if (clickedPiece.color === currentPlayer) { // Selected own piece
                setSelectedSquare(algebraic);
                const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
                const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
                setPossibleMoves(legalMovesForPlayer);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else { // Selected an enemy piece
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
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, filterLegalMoves, setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing, setShowCaptureFlash, setCaptureFlashKey ]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing) return;
    saveStateToHistory();
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);

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
        level: 1, // Promoted pieces reset to L1
        invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0, // Promoted Rooks get 1 turn invuln
        id: `${originalPawnOnBoard.id}_promo_${pieceType}`,
        hasMoved: true,
    };

    setBoard(boardAfterPromotion);

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

        const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
        const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;

        processMoveEnd(boardAfterPromotion, pawnColor, pawnLevelGrantsExtraTurn || streakGrantsExtraTurn);

        setIsPromotingPawn(false); setPromotionSquare(null);
        setIsMoveProcessing(false);
    }, 800); // Animation duration
  }, [ board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processMoveEnd, isMoveProcessing, setGameInfo, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo ]);


  const handleUndo = useCallback(() => {
    if (isAiThinking || isMoveProcessing) {
      toast({ title: "Undo Failed", description: "Cannot undo while AI is thinking or move processing.", duration: 2500 });
      return;
    }
    if (historyStack.length === 0) {
        toast({ title: "Undo Failed", description: "No moves to undo.", duration: 2500 });
        return;
    }

    const playerWhoseTurnItIsNow = currentPlayer;
    // Determine who made the actual last move based on current player
    const lastMovePlayer = playerWhoseTurnItIsNow === 'white' ? 'black' : 'white';
    
    let aiMadeTheActualLastMove = false;
    if (lastMovePlayer === 'white' && isWhiteAI) aiMadeTheActualLastMove = true;
    else if (lastMovePlayer === 'black' && isBlackAI) aiMadeTheActualLastMove = true;

    const isHumanVsAiGame = (isWhiteAI && !isBlackAI) || (!isWhiteAI && isBlackAI);
    let statesToPop = 1;
    if (isHumanVsAiGame && aiMadeTheActualLastMove && historyStack.length >= 2) {
        statesToPop = 2;
    }

    const targetHistoryIndex = historyStack.length - statesToPop;
    if (targetHistoryIndex < 0) {
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
      setPositionHistory(stateToRestore.positionHistory || []);

      // Restore AI and View settings
      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation(stateToRestore.viewMode, stateToRestore.currentPlayer, stateToRestore.isBlackAI, stateToRestore.isWhiteAI));

      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(stateToRestore.enemySelectedSquare || null);
      setEnemyPossibleMoves(stateToRestore.enemyPossibleMoves || []);

      flashedCheckStateRef.current = null; // Reset flash message state
      setFlashMessage(null);
      setShowCheckFlashBackground(false);
      setShowCaptureFlash(false);
      setShowCheckmatePatternFlash(false);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false);
      aiErrorOccurredRef.current = false; // Reset AI error flag
      setHistoryStack(newHistoryStack);
      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    }
  }, [ historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPositionHistory, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage, setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn, setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [determineBoardOrientation, currentPlayer, isBlackAI, isWhiteAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


  const handleToggleWhiteAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing) return;
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, viewMode, isBlackAI, toast, determineBoardOrientation, setIsWhiteAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);

  const handleToggleBlackAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing) return;
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, viewMode, isWhiteAI, toast, determineBoardOrientation, setIsBlackAI, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);


  const performAiMove = useCallback(async () => {
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing) return; // Ensure isMoveProcessing is checked

    setIsAiThinking(true);
    setIsMoveProcessing(true); // AI is processing a move
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...`}));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    aiErrorOccurredRef.current = false;

    await new Promise(resolve => setTimeout(resolve, 250)); // Brief delay for UI update

    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };

    let aiMoveData: {from: [number, number], to: [number, number], type?: string, promoteTo?: PieceType } | null = null;

    try {
        const gameStateForAI = adaptBoardForAI(finalBoardStateForTurn, currentPlayer, killStreaks, finalCapturedPiecesStateForTurn);
        aiMoveData = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

        if (!aiMoveData || !Array.isArray(aiMoveData.from) || aiMoveData.from.length !== 2 ||
            !Array.isArray(aiMoveData.to) || aiMoveData.to.length !== 2) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI failed to select a valid move structure. Raw move:`, aiMoveData);
            aiErrorOccurredRef.current = true;
        } else {
            const aiFromAlg = coordsToAlgebraic(aiMoveData.from[0], aiMoveData.from[1]);
            const aiToAlg = coordsToAlgebraic(aiMoveData.to[0], aiMoveData.to[1]);

            const pieceDataAtFrom = finalBoardStateForTurn[aiMoveData.from[0]]?.[aiMoveData.from[1]];
            const pieceOnFromSquare = pieceDataAtFrom?.piece;

            if (!pieceOnFromSquare || pieceOnFromSquare.color !== currentPlayer) {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquare, " Intended move: ", aiMoveData);
                aiErrorOccurredRef.current = true;
            } else {
                const pseudoPossibleMovesForAiPiece = getPossibleMoves(finalBoardStateForTurn, aiFromAlg);
                const legalMovesForAiPieceOnBoard = filterLegalMoves(finalBoardStateForTurn, aiFromAlg, pseudoPossibleMovesForAiPiece, currentPlayer);

                let isAiMoveActuallyLegal = false;
                const aiMoveType = aiMoveData.type || 'move'; // Default to 'move' if type is not specified

                if (aiMoveType === 'self-destruct' && pieceOnFromSquare.type === 'knight' && (pieceOnFromSquare.level || 1) >= 5) {
                    // Self-destruct is always on its own square, so from === to
                    if (aiFromAlg === aiToAlg) {
                         isAiMoveActuallyLegal = true; // Special case: self-destruct is a valid action
                    } else {
                         console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
                         aiErrorOccurredRef.current = true;
                    }
                } else {
                    isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
                }

                if (!isAiMoveActuallyLegal) {
                    console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Valid moves for piece: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveType}`);
                    aiErrorOccurredRef.current = true;
                } else {
                    const moveForApplyMove: Move = {
                        from: aiFromAlg,
                        to: aiToAlg,
                        type: aiMoveType as Move['type'], // Cast to ensure type safety
                        promoteTo: aiMoveData.promoteTo
                    };

                    saveStateToHistory();
                    setAnimatedSquareTo(aiToAlg);

                    let aiMoveCapturedSomething = false;
                    let currentCalculatedStreakForAIPlayer: number;
                    let capturedByAIThisTurn: Piece[] = []; // For self-destruct multi-capture

                    if (moveForApplyMove.type === 'self-destruct') {
                        // Self-destruct logic for AI
                        const { row: knightR, col: knightC } = algebraicToCoords(moveForApplyMove.from);

                        for (let dr = -1; dr <= 1; dr++) {
                          for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const adjR = knightR + dr;
                            const adjC = knightC + dc;
                            if (adjR >= 0 && adjR < 8 && adjC >=0 && adjC < 8 ) {
                              const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                              if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                                // Check invulnerability of victim
                                if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                    (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceOnFromSquare.level || 1) < (victimPiece.level || 1))) {
                                  toast({ title: "Invulnerable!", description: `AI Knight's self-destruct failed on invulnerable ${victimPiece.type}.`, duration: 2500 });
                                  continue;
                                }
                                capturedByAIThisTurn.push({ ...victimPiece });
                                finalCapturedPiecesStateForTurn[currentPlayer].push({ ...victimPiece });
                                finalBoardStateForTurn[adjR][adjC].piece = null;
                                aiMoveCapturedSomething = true;
                              }
                            }
                          }
                        }
                        finalBoardStateForTurn[knightR][knightC].piece = null; // Remove the knight
                        toast({ title: `AI ${getPlayerDisplayName(currentPlayer)} Knight Self-Destructs!`, description: `${capturedByAIThisTurn.length} pieces obliterated.`, duration: 2500});
                        currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + (aiMoveCapturedSomething ? capturedByAIThisTurn.length : 0);

                    } else { // Regular move or capture for AI
                        const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, moveForApplyMove);
                        finalBoardStateForTurn = newBoard;

                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMove.from} to ${moveForApplyMove.to}`, duration: 1500});

                        if (captured) {
                            aiMoveCapturedSomething = true;
                            setShowCaptureFlash(true);
                            setCaptureFlashKey(k => k + 1);
                            finalCapturedPiecesStateForTurn[currentPlayer].push(captured);
                            currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + 1;
                        } else {
                            currentCalculatedStreakForAIPlayer = 0; // Reset streak on non-capture
                        }
                        if (conversionEvents && conversionEvents.length > 0) {
                            conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
                        }
                    }

                    // Update kill streaks and last capture player
                    setKillStreaks(prevKillStreaks => {
                        const newStreaks = {
                            white: prevKillStreaks.white,
                            black: prevKillStreaks.black
                        };
                        newStreaks[currentPlayer] = currentCalculatedStreakForAIPlayer;
                        if(aiMoveCapturedSomething) { // If AI captured something
                            newStreaks[currentPlayer === 'white' ? 'black' : 'white'] = 0; // Reset opponent's streak
                        }
                        return newStreaks;
                    });
                    setLastCapturePlayer(aiMoveCapturedSomething ? currentPlayer : null);

                    // Resurrection for AI
                    if (currentCalculatedStreakForAIPlayer === 3) {
                        const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                        let piecesOfAICapturedByOpponent = finalCapturedPiecesStateForTurn[opponentColorAI] || [];
                         if (piecesOfAICapturedByOpponent.length > 0) {
                            const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop(); // This mutates the temp array
                            finalCapturedPiecesStateForTurn[opponentColorAI] = [...piecesOfAICapturedByOpponent]; 

                            const emptySqAI: AlgebraicSquare[] = [];
                            for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                            if(emptySqAI.length > 0 && pieceToResOriginalAI){
                                const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                const newUniqueSuffixAI = resurrectionIdCounter++;
                                const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                                finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI;
                                toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                            }
                        }
                    }

                    setBoard(finalBoardStateForTurn);
                    setCapturedPieces(finalCapturedPiecesStateForTurn);

                    // Delay after animation for turn completion
                    setTimeout(() => {
                        setAnimatedSquareTo(null);
                        const pieceAtDestination = finalBoardStateForTurn[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;
                        const promotionRowAI = currentPlayer === 'white' ? 0 : 7;

                        const isAIPawnPromoting = pieceAtDestination &&
                                                  pieceAtDestination.type === 'pawn' &&
                                                  algebraicToCoords(aiToAlg).row === promotionRowAI &&
                                                  moveForApplyMove.type !== 'self-destruct'; // Self-destruct is not a promotion

                        if (isAIPawnPromoting) {
                            const promotedTypeAI = moveForApplyMove.promoteTo || 'queen'; // AI defaults to Queen if not specified
                            const originalPawnForAIPromo = finalBoardStateForTurn[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;

                            if (originalPawnForAIPromo && originalPawnForAIPromo.type === 'pawn') { // Ensure it's still a pawn
                                const originalPawnLevelForAIPromo = originalPawnForAIPromo.level || 1;
                                const finalBoardAfterAIPromotion = finalBoardStateForTurn.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                                finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece = {
                                    ...(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece as Piece),
                                    type: promotedTypeAI,
                                    level: 1, // Promoted pieces start at L1
                                    invulnerableTurnsRemaining: promotedTypeAI === 'rook' ? 1 : 0,
                                    id: `${(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece as Piece).id}_promo_${promotedTypeAI}_ai`,
                                    hasMoved: true,
                                };
                                setBoard(finalBoardAfterAIPromotion);
                                toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });

                                // AI does NOT get extra turn from pawn promotion or streak in this simplified AI handling
                                processMoveEnd(finalBoardAfterAIPromotion, currentPlayer, false); // No extra turn for AI
                            } else {
                                processMoveEnd(finalBoardStateForTurn, currentPlayer, false); // Should not happen, but safety
                            }
                        } else {
                            // AI does NOT get extra turn from streak in this simplified AI handling
                            processMoveEnd(finalBoardStateForTurn, currentPlayer, false); // No extra turn for AI
                        }
                        setIsAiThinking(false);
                        setIsMoveProcessing(false);
                    }, 800); // Animation duration
                }
            }
        }
    } catch (error) {
        console.error(`AI (${getPlayerDisplayName(currentPlayer)}) Error in performAiMove try-catch:`, error);
        aiErrorOccurredRef.current = true;
    }

    // This block runs if aiErrorOccurredRef.current is true (set by illegal move or catch block)
    if (aiErrorOccurredRef.current) {
        toast({
            title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`,
            description: "AI move forfeited or error occurred.",
            variant: "destructive",
            duration: 2500,
        });
        if (currentPlayer === 'white') setIsWhiteAI(false);
        if (currentPlayer === 'black') setIsBlackAI(false);

        // Defer completion to allow state updates for AI toggles
        setTimeout(() => {
             completeTurn(board, currentPlayer); // Use board state before AI's attempt
             setIsAiThinking(false);
             setIsMoveProcessing(false);
        }, 0);
    }
    // If no error occurred AND AI didn't return early (e.g. successful move path leads to its own setTimeout),
    // then setIsAiThinking and setIsMoveProcessing are handled within that path.
    // If the AI's move path completes fully without setting aiErrorOccurredRef, the flags are reset inside its setTimeout.

  }, [
      board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing, // Removed isAiThinking from here to prevent re-trigger
      isWhiteAI, isBlackAI, // Keep these to react to AI toggles
      killStreaks, capturedPieces, // For adaptBoardForAI and AI move consequences
      saveStateToHistory, toast, getPlayerDisplayName,
      processMoveEnd, filterLegalMoves,
      completeTurn, determineBoardOrientation, setGameInfoBasedOnExtraTurn, // These are stable due to their own useCallback
      aiInstanceRef, setBoard, setCapturedPieces, setGameInfo, setKillStreaks, setLastCapturePlayer,
      setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
      setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo, setShowCaptureFlash, setCaptureFlashKey,
      setIsWhiteAI, setIsBlackAI // Ensure AI toggle setters are here
    ]
  );


  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !aiErrorOccurredRef.current) {
       performAiMove();
    }
  // Dependencies: Key states that trigger AI move
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove]);

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center relative">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center"> {/* Removed bg-background for transparency */}
        {flashMessage && ( <div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 'animate-flash-checkmate' : 'animate-flash-check' }`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}

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
                gameStatusMessage={gameInfo.message || "\u00A0"}
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
                playerColor={boardOrientation}
                currentPlayerColor={currentPlayer}
                isInteractionDisabled={gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing}
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
