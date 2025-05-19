
'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  type ConversionEvent
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2 } from 'lucide-react';

const initialGameStatus: GameStatus = {
  message: "",
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  gameOver: false,
};

export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>(initialGameStatus);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);

  const [killStreakFlashMessage, setKillStreakFlashMessage] = useState<string | null>(null);
  const [killStreakFlashMessageKey, setKillStreakFlashMessageKey] = useState<number>(0);

  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);

  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [lastCapturePlayer, setLastCapturePlayer] = useState<PlayerColor | null>(null);

  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);

  const { toast } = useToast();

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
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      // Optional: Limit history size, e.g., to last 20 moves
      if (newHistory.length > 20) return newHistory.slice(-20);
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation]);


  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameInfo(initialGameStatus);
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
    setKillStreakFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setBoardOrientation('white');
    setHistoryStack([]);
    toast({ title: "Game Reset", description: "The board has been reset to the initial state." });
  }, [toast]);

  useEffect(() => {
    let newFlash: string | null = null;
    if (gameInfo.isCheckmate) {
      newFlash = 'CHECKMATE!';
    } else if (gameInfo.isCheck && gameInfo.playerWithKingInCheck && !gameInfo.gameOver && !gameInfo.isStalemate) {
      newFlash = 'CHECK!';
    }

    if (newFlash) {
      setFlashMessage(newFlash);
      setFlashMessageKey(k => k + 1);
    } else if (!gameInfo.isCheck && !gameInfo.isCheckmate) {
      setFlashMessage(null);
    }
  }, [gameInfo.isCheck, gameInfo.isCheckmate, gameInfo.playerWithKingInCheck, gameInfo.gameOver, gameInfo.isStalemate]);


  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (flashMessage) {
      const duration = flashMessage === 'CHECKMATE!' ? 2500 : 1500;
      timerId = setTimeout(() => {
        setFlashMessage(null);
      }, duration);
    }
    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [flashMessage, flashMessageKey]);

  useEffect(() => {
    let killStreakTimerId: NodeJS.Timeout | null = null;
    if (killStreakFlashMessage) {
      killStreakTimerId = setTimeout(() => {
        setKillStreakFlashMessage(null);
      }, 1500);
    }
    return () => {
      if (killStreakTimerId) {
        clearTimeout(killStreakTimerId);
      }
    };
  }, [killStreakFlashMessage, killStreakFlashMessageKey]);

  useEffect(() => {
    setBoard(prevBoard => {
      let boardWasModified = false;
      const boardAfterInvulnerabilityWearOff = prevBoard.map(row =>
        row.map(square => {
          if (square.piece && square.piece.color === currentPlayer && square.piece.type === 'rook' && square.piece.invulnerableTurnsRemaining && square.piece.invulnerableTurnsRemaining > 0) {
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
  }, [currentPlayer]);

  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setBoardOrientation(playerTakingExtraTurn);

    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);
    let newPlayerWithKingInCheckForExtraTurn: PlayerColor | null = null;
    let extraTurnMessage = "Extra Turn!";

    if (opponentInCheck) {
      newPlayerWithKingInCheckForExtraTurn = opponentColor;
      const opponentIsCheckmated = isCheckmate(currentBoard, opponentColor);
      if (opponentIsCheckmated) {
        setGameInfo({
          message: `Checkmate! ${playerTakingExtraTurn.charAt(0).toUpperCase() + playerTakingExtraTurn.slice(1)} wins!`,
          isCheck: true,
          playerWithKingInCheck: newPlayerWithKingInCheckForExtraTurn,
          isCheckmate: true,
          isStalemate: false,
          winner: playerTakingExtraTurn,
          gameOver: true,
        });
        return;
      } else {
        extraTurnMessage = "Check! (Extra Turn)";
      }
    } else {
      const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
      if (opponentIsStalemated) {
        setGameInfo({
          message: `Stalemate! It's a draw.`,
          isCheck: false,
          playerWithKingInCheck: null,
          isCheckmate: false,
          isStalemate: true,
          winner: 'draw',
          gameOver: true,
        });
        return;
      }
    }

    setGameInfo({
      message: extraTurnMessage,
      isCheck: opponentInCheck,
      playerWithKingInCheck: newPlayerWithKingInCheckForExtraTurn,
      isCheckmate: false,
      isStalemate: false,
      gameOver: false,
    });
  }, []);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setBoardOrientation(nextPlayer);

    const inCheck = isKingInCheck(updatedBoard, nextPlayer);
    let newPlayerWithKingInCheck: PlayerColor | null = null;

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        setGameInfo({
          message: `Checkmate! ${playerWhoseTurnEnded.charAt(0).toUpperCase() + playerWhoseTurnEnded.slice(1)} wins!`,
          isCheck: true,
          playerWithKingInCheck: newPlayerWithKingInCheck,
          isCheckmate: true,
          isStalemate: false,
          winner: playerWhoseTurnEnded,
          gameOver: true,
        });
      } else {
        setGameInfo({
          message: "Check!",
          isCheck: true,
          playerWithKingInCheck: newPlayerWithKingInCheck,
          isCheckmate: false,
          isStalemate: false,
          gameOver: false,
        });
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        setGameInfo({
          message: `Stalemate! It's a draw.`,
          isCheck: false,
          playerWithKingInCheck: null,
          isCheckmate: false,
          isStalemate: true,
          winner: 'draw',
          gameOver: true,
        });
      } else {
        setGameInfo({
          message: "",
          isCheck: false,
          playerWithKingInCheck: null,
          isCheckmate: false,
          isStalemate: false,
          gameOver: false,
        });
      }
    }
  }, []);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn) return;

    const currentBoardForClick = board;
    const { row, col } = algebraicToCoords(algebraic);
    const clickedPieceData = currentBoardForClick[row][col];
    const clickedPiece = clickedPieceData.piece;

    if (selectedSquare) {
      const pieceToMoveData = currentBoardForClick[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
      const pieceToMove = pieceToMoveData.piece;

      // Save state BEFORE making a move or self-destruct
      saveStateToHistory();

      // Knight Self-Destruct Logic
      if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && pieceToMove.level >= 5) {
        let currentBoardState = currentBoardForClick.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);
        const piecesDestroyed: Piece[] = [];
        let finalBoardAfterDestruct = currentBoardState;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const adjR = knightR + dr;
            const adjC = knightC + dc;

            if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
              const victimPiece = currentBoardState[adjR][adjC].piece;
              if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                if (victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) {
                  toast({
                    title: "Invulnerable Rook!",
                    description: `${currentPlayer} Knight's self-destruct failed on invulnerable ${victimPiece.color} Rook.`,
                  });
                  continue;
                }
                if (victimPiece.type === 'queen' && victimPiece.level >= 5 && pieceToMove.level < victimPiece.level) {
                  toast({
                    title: "Invulnerable Queen!",
                    description: `${currentPlayer} Knight's self-destruct failed on high-level ${victimPiece.color} Queen.`,
                  });
                  continue;
                }
                piecesDestroyed.push({ ...victimPiece });
                currentBoardState[adjR][adjC].piece = null;
                toast({
                  title: "Self-Destruct!",
                  description: `${currentPlayer} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`,
                });
              }
            }
          }
        }
        currentBoardState[knightR][knightC].piece = null;

        let calculatedNewStreakForPlayer = 0;
        const opponentColor = currentPlayer === 'white' ? 'black' : 'white';

        if (piecesDestroyed.length > 0) {
          setCapturedPieces(prev => ({
            ...prev,
            [currentPlayer]: [...(prev[currentPlayer] || []), ...piecesDestroyed]
          }));
          
          const currentStreak = lastCapturePlayer === currentPlayer ? killStreaks[currentPlayer] : 0;
          calculatedNewStreakForPlayer = currentStreak + piecesDestroyed.length;

          setKillStreaks(prevKillStreaks => ({
            ...prevKillStreaks,
            [currentPlayer]: calculatedNewStreakForPlayer,
            [opponentColor]: lastCapturePlayer !== currentPlayer ? 0 : prevKillStreaks[opponentColor],
          }));
          setLastCapturePlayer(currentPlayer);

          if (calculatedNewStreakForPlayer >= 2 && calculatedNewStreakForPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 3 && calculatedNewStreakForPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 4 && calculatedNewStreakForPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }


          if (calculatedNewStreakForPlayer >= 3) {
            const piecesPlayerLost = capturedPieces[opponentColor];
            if (piecesPlayerLost && piecesPlayerLost.length > 0) {
              const pieceToResurrectOriginal = piecesPlayerLost[piecesPlayerLost.length - 1];
              const resurrectedPiece = {
                ...pieceToResurrectOriginal,
                level: 1,
                id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
              };

              setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentColor] || [])];
                specificListOfLostPieces.pop();
                newGlobalCaptured[opponentColor] = specificListOfLostPieces;
                return newGlobalCaptured;
              });

              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) {
                for (let c_idx = 0; c_idx < 8; c_idx++) {
                  if (!finalBoardAfterDestruct[r_idx][c_idx].piece) {
                    emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                  }
                }
              }

              if (emptySquares.length > 0) {
                const randomEmptySquareAlgebraic = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resRow, col: resCol } = algebraicToCoords(randomEmptySquareAlgebraic);

                finalBoardAfterDestruct[resRow][resCol].piece = resurrectedPiece;

                toast({
                  title: "Resurrection!",
                  description: `${currentPlayer}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                });
              }
            }
          }
        } else {
          if (lastCapturePlayer === currentPlayer) {
            setKillStreaks(prevKillStreaks => ({
              ...prevKillStreaks,
              [currentPlayer]: 0,
            }));
            setLastCapturePlayer(null);
          }
          calculatedNewStreakForPlayer = 0;
        }

        setBoard(finalBoardAfterDestruct);
        setSelectedSquare(null);
        setPossibleMoves([]);

        const streakGrantsExtraTurn = calculatedNewStreakForPlayer >= 6;
        if (streakGrantsExtraTurn) {
          toast({
            title: "Extra Turn!",
            description: `${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)} gets an extra turn from a 6+ destruction streak!`,
            duration: 3000,
          });
          setGameInfoBasedOnExtraTurn(finalBoardAfterDestruct, currentPlayer);
        } else {
          completeTurn(finalBoardAfterDestruct, currentPlayer);
        }
        return;
      }
      // End of Self-Destruct Logic

      // Regular Move Logic
      if (pieceToMove && pieceToMove.color === currentPlayer && possibleMoves.includes(algebraic)) {
        const move: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(currentBoardForClick, move);
        let finalBoardStateForTurn = newBoard;
        let calculatedNewStreakForCapturingPlayer = 0;

        if (captured) {
          const capturingPlayer = currentPlayer;
          const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';

          setCapturedPieces(prev => ({
            ...prev,
            [capturingPlayer]: [...(prev[capturingPlayer] || []), captured]
          }));

          const currentStreakValue = lastCapturePlayer === capturingPlayer ? killStreaks[capturingPlayer] : 0;
          calculatedNewStreakForCapturingPlayer = currentStreakValue + 1;


          setKillStreaks(prevKillStreaks => ({
            ...prevKillStreaks,
            [capturingPlayer]: calculatedNewStreakForCapturingPlayer,
            [opponentPlayer]: lastCapturePlayer !== capturingPlayer ? 0 : prevKillStreaks[opponentPlayer],
          }));
          setLastCapturePlayer(capturingPlayer);

          if (calculatedNewStreakForCapturingPlayer >= 2 && calculatedNewStreakForCapturingPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForCapturingPlayer >= 3 && calculatedNewStreakForCapturingPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForCapturingPlayer >= 4 && calculatedNewStreakForCapturingPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForCapturingPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }

          const pieceOnToSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece;
          toast({
            title: "Piece Captured!",
            description: `${capturingPlayer} ${pieceOnToSquare?.type} captured ${captured.color} ${captured.type}. ${pieceOnToSquare ? `It's now level ${pieceOnToSquare.level}!` : ''}`,
          });

          if (calculatedNewStreakForCapturingPlayer >= 3) {
            const piecesLostByCapturingPlayer = capturedPieces[opponentPlayer];
            if (piecesLostByCapturingPlayer && piecesLostByCapturingPlayer.length > 0) {
              const pieceToResurrectOriginal = piecesLostByCapturingPlayer[piecesLostByCapturingPlayer.length - 1];
              const resurrectedPiece = {
                ...pieceToResurrectOriginal,
                level: 1,
                id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
              };

              setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentPlayer] || [])];
                specificListOfLostPieces.pop();
                newGlobalCaptured[opponentPlayer] = specificListOfLostPieces;
                return newGlobalCaptured;
              });

              const emptySquares: AlgebraicSquare[] = [];
              for (let r_idx = 0; r_idx < 8; r_idx++) {
                for (let c_idx = 0; c_idx < 8; c_idx++) {
                  if (!finalBoardStateForTurn[r_idx][c_idx].piece) {
                    emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                  }
                }
              }

              if (emptySquares.length > 0) {
                const randomEmptySquareAlgebraic = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                const { row: resRow, col: resCol } = algebraicToCoords(randomEmptySquareAlgebraic);

                finalBoardStateForTurn[resRow][resCol].piece = resurrectedPiece;

                toast({
                  title: "Resurrection!",
                  description: `${capturingPlayer}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                });
              }
            }
          }
        } else { // No capture
           if (lastCapturePlayer === currentPlayer) {
            setKillStreaks(prevKillStreaks => ({
              ...prevKillStreaks,
              [currentPlayer]: 0,
            }));
            setLastCapturePlayer(null); // Current player made a non-capturing move, so they are not the last capturer.
          }
          // If lastCapturePlayer was the opponent, their streak continues.
          calculatedNewStreakForCapturingPlayer = 0;
        }


        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => {
            toast({
              title: "Piece Converted!",
              description: `${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)}'s Bishop converted an enemy ${event.originalPiece.type} to their side!`,
            });
          });
        }

        setBoard(finalBoardStateForTurn);

        const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
        const movedPieceOnBoard = movedPieceFinalSquare.piece;
        const { row: toRowPawnCheck } = algebraicToCoords(algebraic);
        const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);

        const streakGrantsExtraTurn = calculatedNewStreakForCapturingPlayer >= 6;

        if (isPawnPromotingMove) {
          setIsPromotingPawn(true);
          setPromotionSquare(algebraic);
        } else {
          if (streakGrantsExtraTurn) {
            toast({
              title: "Extra Turn!",
              description: `${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)} gets an extra turn for a 6+ kill streak!`,
              duration: 3000,
            });
            setGameInfoBasedOnExtraTurn(finalBoardStateForTurn, currentPlayer);
          } else {
            completeTurn(finalBoardStateForTurn, currentPlayer);
          }
        }

      } else { // Clicked on a different square or an empty square (deselect or invalid move)
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color === currentPlayer) { // Selected a new piece of current player
          setSelectedSquare(algebraic);
          const pseudoPossibleMoves = getPossibleMoves(currentBoardForClick, algebraic);
          const legalFilteredMoves = filterLegalMoves(currentBoardForClick, algebraic, pseudoPossibleMoves, currentPlayer);
          setPossibleMoves(legalFilteredMoves);
        }
      }
    } else if (clickedPiece && clickedPiece.color === currentPlayer) { // First click: selecting a piece
      setSelectedSquare(algebraic);
      const pseudoPossibleMoves = getPossibleMoves(currentBoardForClick, algebraic);
      const legalFilteredMoves = filterLegalMoves(currentBoardForClick, algebraic, pseudoPossibleMoves, currentPlayer);
      setPossibleMoves(legalFilteredMoves);
    }
  }, [
      board,
      currentPlayer,
      selectedSquare,
      possibleMoves,
      toast,
      gameInfo.gameOver,
      isPromotingPawn,
      completeTurn,
      lastCapturePlayer,
      killStreaks,
      capturedPieces,
      setGameInfoBasedOnExtraTurn,
      saveStateToHistory
    ]
  );

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;

    saveStateToHistory(); // Save state before applying promotion

    const { row, col } = algebraicToCoords(promotionSquare);
    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));

    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;
    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      return;
    }

    const originalPawnLevel = originalPawnOnBoard.level;
    const pawnColor = originalPawnOnBoard.color;

    boardAfterPromotion[row][col].piece = {
      ...originalPawnOnBoard,
      type: pieceType,
      level: 1,
      invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0,
    };

    setBoard(boardAfterPromotion);
    toast({
      title: "Pawn Promoted!",
      description: `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} pawn promoted to ${pieceType}! (Level 1)${pieceType === 'rook' ? ' Invulnerable for 1 turn!' : ''}`,
    });

    const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
    const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;
    const streakGrantsExtraTurn = currentStreakForPromotingPlayer >= 6;

    if (pawnLevelGrantsExtraTurn || streakGrantsExtraTurn) {
      let reason = "";
      if (pawnLevelGrantsExtraTurn && streakGrantsExtraTurn) {
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn from high-level promotion AND a 6+ kill streak!`;
      } else if (pawnLevelGrantsExtraTurn) {
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn from high-level promotion!`;
      } else {
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn for a 6+ kill streak!`;
      }
      toast({
        title: "Extra Turn!",
        description: reason,
        duration: 3000,
      });
      setGameInfoBasedOnExtraTurn(boardAfterPromotion, pawnColor);
    } else {
      completeTurn(boardAfterPromotion, pawnColor);
    }

    setIsPromotingPawn(false);
    setPromotionSquare(null);
  }, [
      board,
      promotionSquare,
      completeTurn,
      toast,
      killStreaks,
      setGameInfoBasedOnExtraTurn,
      saveStateToHistory
    ]
  );

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) {
      toast({ title: "Undo Failed", description: "No moves to undo." });
      return;
    }

    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory];
      const lastState = newHistory.pop();

      if (lastState) {
        setBoard(lastState.board);
        setCurrentPlayer(lastState.currentPlayer);
        setGameInfo(lastState.gameInfo);
        setCapturedPieces(lastState.capturedPieces);
        setKillStreaks(lastState.killStreaks);
        setLastCapturePlayer(lastState.lastCapturePlayer);
        setBoardOrientation(lastState.boardOrientation);

        setSelectedSquare(null);
        setPossibleMoves([]);
        setFlashMessage(null);
        setKillStreakFlashMessage(null);
        setIsPromotingPawn(false);
        setPromotionSquare(null);

        toast({ title: "Move Undone", description: "Returned to previous state." });
      }
      return newHistory;
    });
  }, [historyStack, toast]);


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {flashMessage && (
        <div
          key={flashMessageKey}
          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          aria-live="assertive"
        >
          <div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}>
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center"
              style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}
            >
              {flashMessage}
            </p>
          </div>
        </div>
      )}
      {killStreakFlashMessage && (
        <div
          key={killStreakFlashMessageKey}
          className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none"
          aria-live="assertive"
        >
          <div className="bg-black/50 p-4 md:p-6 rounded-md shadow-xl animate-flash-check">
            <p className="text-4xl sm:text-5xl md:text-6xl font-bold text-accent font-pixel text-center"
              style={{ textShadow: '2px 2px 0px hsl(var(--background)), -2px 2px 0px hsl(var(--background)), 2px -2px 0px hsl(var(--background)), -2px -2px 0px hsl(var(--background))' }}
            >
              {killStreakFlashMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full flex flex-col items-center mb-6 space-y-3">
        <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">
          VIBE CHESS
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetGame} aria-label="Reset Game">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Game
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules">
            <BookOpen className="h-4 w-4 mr-2" />
            Game Rules
          </Button>
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} aria-label="Undo Move">
            <Undo2 className="h-4 w-4 mr-2" />
            Undo Move
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
          />
        </div>
        <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
          <ChessBoard
            boardState={board}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            onSquareClick={handleSquareClick}
            playerColor={boardOrientation}
            isGameOver={gameInfo.gameOver || isPromotingPawn}
            playerInCheck={gameInfo.playerWithKingInCheck}
          />
        </div>
      </div>
      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={promotionSquare ? board[algebraicToCoords(promotionSquare).row][algebraicToCoords(promotionSquare).col].piece?.color ?? null : null}
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}

    