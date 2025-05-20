
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
  type ConversionEvent
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View } from 'lucide-react';

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
  const [viewMode, setViewMode] = useState<ViewMode>('flipping');

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  const flashedCheckStateRef = useRef<string | null>(null);


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
      viewMode: viewMode,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); // Limit history size
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode]);


  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameInfo(initialGameStatus);
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
    flashedCheckStateRef.current = null;
    setKillStreakFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setBoardOrientation('white');
    setViewMode('flipping');
    setHistoryStack([]);
    toast({ title: "Game Reset", description: "The board has been reset to the initial state.", duration: 2500 });
  }, [toast]);

 useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver && gameInfo.isCheckmate) {
      currentCheckStateString = 'checkmate';
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    }

    if (currentCheckStateString) {
      if (flashedCheckStateRef.current !== currentCheckStateString) {
        setFlashMessage(gameInfo.isCheckmate ? 'CHECKMATE!' : 'CHECK!');
        setFlashMessageKey(k => k + 1);
        flashedCheckStateRef.current = currentCheckStateString;
      }
    } else {
        // This condition ensures that if the game state moves from check/checkmate to no-check/no-checkmate,
        // the ref is cleared, allowing the flash message to appear again if the same check state occurs later.
        if (flashedCheckStateRef.current && (flashedCheckStateRef.current.endsWith('-check') || flashedCheckStateRef.current === 'checkmate')) {
           // No need to setFlashMessage(null) here as the timeout effect handles it.
        }
        if (!gameInfo.isCheck && !gameInfo.isCheckmate && flashedCheckStateRef.current) {
             flashedCheckStateRef.current = null;
        }
    }
  // Removed flashMessage from dependency array to prevent re-flashing due to its own clearing.
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
    if (viewMode === 'flipping') {
      setBoardOrientation(playerTakingExtraTurn);
    }


    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);

    if (opponentInCheck) {
      toast({
        title: "Auto-Checkmate!",
        description: `${playerTakingExtraTurn.charAt(0).toUpperCase() + playerTakingExtraTurn.slice(1)} wins by delivering check and earning an extra turn!`,
        duration: 2500,
      });
      setGameInfo({
        message: `Checkmate! ${playerTakingExtraTurn.charAt(0).toUpperCase() + playerTakingExtraTurn.slice(1)} wins!`,
        isCheck: true,
        playerWithKingInCheck: opponentColor,
        isCheckmate: true,
        isStalemate: false,
        winner: playerTakingExtraTurn,
        gameOver: true,
      });
      return;
    }

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

    setGameInfo({
      message: `${playerTakingExtraTurn.charAt(0).toUpperCase() + playerTakingExtraTurn.slice(1)}'s Extra Turn!`,
      isCheck: false,
      playerWithKingInCheck: null,
      isCheckmate: false,
      isStalemate: false,
      gameOver: false,
    });
  }, [toast, viewMode, setBoardOrientation, setGameInfo, setSelectedSquare, setPossibleMoves]);


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);

    if (viewMode === 'flipping') {
       setBoardOrientation(nextPlayer);
    } else if (viewMode === 'tabletop') {
       setBoardOrientation('white'); // Keep white at bottom for tabletop
    }


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
  }, [setGameInfo, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setBoardOrientation, viewMode]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn) return;

    const currentBoardForClick = board;
    const { row, col } = algebraicToCoords(algebraic);
    const clickedPieceData = currentBoardForClick[row][col];
    const clickedPiece = clickedPieceData.piece;

    if (selectedSquare) {
      const pieceToMoveData = currentBoardForClick[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
      const pieceToMove = pieceToMoveData.piece;

      saveStateToHistory();

      // Knight Self-Destruct Logic
      if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && pieceToMove.level >= 5) {
        let finalBoardAfterDestruct = currentBoardForClick.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);
        const piecesDestroyed: Piece[] = [];

        const selfDestructPlayer = currentPlayer;
        let calculatedNewStreakForPlayer: number = killStreaks[selfDestructPlayer] || 0;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const adjR = knightR + dr;
            const adjC = knightC + dc;

            if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
              const victimPiece = finalBoardAfterDestruct[adjR][adjC].piece;
              if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                 if (victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) {
                  toast({
                    title: "Invulnerable Rook!",
                    description: `${selfDestructPlayer} Knight's self-destruct failed on invulnerable ${victimPiece.color} Rook.`,
                    duration: 2500,
                  });
                  continue;
                }
                if (victimPiece.type === 'queen' && victimPiece.level >= 5 && pieceToMove.level < victimPiece.level) {
                   toast({
                    title: "Invulnerable Queen!",
                    description: `${selfDestructPlayer} Knight's self-destruct failed on high-level ${victimPiece.color} Queen.`,
                    duration: 2500,
                  });
                  continue;
                }
                piecesDestroyed.push({ ...victimPiece });
                finalBoardAfterDestruct[adjR][adjC].piece = null;
                toast({
                  title: "Self-Destruct!",
                  description: `${selfDestructPlayer} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`,
                  duration: 2500,
                });
              }
            }
          }
        }
        finalBoardAfterDestruct[knightR][knightC].piece = null; // Remove the knight

        if (piecesDestroyed.length > 0) {
           calculatedNewStreakForPlayer += piecesDestroyed.length;
           setKillStreaks(prevKillStreaks => {
            const newStreaks = {
                white: prevKillStreaks.white,
                black: prevKillStreaks.black,
            };
            newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
            return newStreaks;
          });
          setLastCapturePlayer(selfDestructPlayer);
          setCapturedPieces(prev => ({
            ...prev,
            [selfDestructPlayer]: [...(prev[selfDestructPlayer] || []), ...piecesDestroyed]
          }));


          if (calculatedNewStreakForPlayer >= 2 && calculatedNewStreakForPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 3 && calculatedNewStreakForPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 4 && calculatedNewStreakForPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (calculatedNewStreakForPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }


          if (calculatedNewStreakForPlayer >= 3) {
            const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
            const piecesPlayerLost = capturedPieces[opponentOfSelfDestructPlayer];
            if (piecesPlayerLost && piecesPlayerLost.length > 0) {
              const pieceToResurrectOriginal = piecesPlayerLost[piecesPlayerLost.length - 1];
              const resurrectedPiece = {
                ...pieceToResurrectOriginal,
                level: 1,
                id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
              };

              setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentOfSelfDestructPlayer] || [])];
                specificListOfLostPieces.pop();
                newGlobalCaptured[opponentOfSelfDestructPlayer] = specificListOfLostPieces;
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
                  description: `${selfDestructPlayer}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                  duration: 2500,
                });
              }
            }
          }
        } else {
            setKillStreaks(prevKillStreaks => {
                const newStreaks = {
                  white: prevKillStreaks.white,
                  black: prevKillStreaks.black,
                };
                newStreaks[selfDestructPlayer] = 0;
                return newStreaks;
            });
            if (lastCapturePlayer === selfDestructPlayer) {
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
            description: `${selfDestructPlayer.charAt(0).toUpperCase() + selfDestructPlayer.slice(1)} gets an extra turn from a 6+ destruction streak!`,
            duration: 2500,
          });
          setGameInfoBasedOnExtraTurn(finalBoardAfterDestruct, selfDestructPlayer);
        } else {
          completeTurn(finalBoardAfterDestruct, selfDestructPlayer);
        }
        return;
      }

      // Regular Move Logic
      if (pieceToMove && pieceToMove.color === currentPlayer && possibleMoves.includes(algebraic)) {
        const move: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(currentBoardForClick, move);
        let finalBoardStateForTurn = newBoard;

        let currentCalculatedStreakForCapturingPlayer: number = killStreaks[currentPlayer] || 0;
        const capturingPlayer = currentPlayer;

        if (captured) {
          currentCalculatedStreakForCapturingPlayer += 1; // For a single capture in a regular move
          setKillStreaks(prevKillStreaks => {
            const newStreaks = {
                white: prevKillStreaks.white,
                black: prevKillStreaks.black,
            };
            newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
            return newStreaks;
          });
          setLastCapturePlayer(capturingPlayer);
          setCapturedPieces(prev => ({
            ...prev,
            [capturingPlayer]: [...(prev[capturingPlayer] || []), captured]
          }));


          if (currentCalculatedStreakForCapturingPlayer >= 2 && currentCalculatedStreakForCapturingPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 3 && currentCalculatedStreakForCapturingPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 4 && currentCalculatedStreakForCapturingPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }

          const pieceOnToSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece;
          toast({
            title: "Piece Captured!",
            description: `${capturingPlayer} ${pieceOnToSquare?.type} captured ${captured.color} ${captured.type}. ${pieceOnToSquare ? `It's now level ${pieceOnToSquare.level}!` : ''}`,
            duration: 2500,
          });

          if (currentCalculatedStreakForCapturingPlayer >= 3) {
            const opponentOfCapturingPlayer = capturingPlayer === 'white' ? 'black' : 'white';
            const piecesLostByCapturingPlayer = capturedPieces[opponentOfCapturingPlayer];
            if (piecesLostByCapturingPlayer && piecesLostByCapturingPlayer.length > 0) {
              const pieceToResurrectOriginal = piecesLostByCapturingPlayer[piecesLostByCapturingPlayer.length - 1];
              const resurrectedPiece = {
                ...pieceToResurrectOriginal,
                level: 1,
                id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
              };

              setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentOfCapturingPlayer] || [])];
                specificListOfLostPieces.pop();
                newGlobalCaptured[opponentOfCapturingPlayer] = specificListOfLostPieces;
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
                  duration: 2500,
                });
              }
            }
          }
        } else {
            setKillStreaks(prevKillStreaks => {
                const newStreaks = {
                  white: prevKillStreaks.white,
                  black: prevKillStreaks.black,
                };
                newStreaks[capturingPlayer] = 0;
                return newStreaks;
            });
            if (lastCapturePlayer === capturingPlayer) {
                setLastCapturePlayer(null);
            }
            currentCalculatedStreakForCapturingPlayer = 0;
        }


        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => {
            toast({
              title: "Piece Converted!",
              description: `${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)}'s Bishop converted an enemy ${event.originalPiece.type} to their side!`,
              duration: 2500,
            });
          });
        }

        setBoard(finalBoardStateForTurn);

        const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
        const movedPieceOnBoard = movedPieceFinalSquare.piece;
        const { row: toRowPawnCheck } = algebraicToCoords(algebraic);
        const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);

        const streakGrantsExtraTurn = currentCalculatedStreakForCapturingPlayer >= 6;

        if (isPawnPromotingMove) {
          setIsPromotingPawn(true);
          setPromotionSquare(algebraic);
        } else {
          if (streakGrantsExtraTurn) {
            toast({
              title: "Extra Turn!",
              description: `${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)} gets an extra turn for a 6+ kill streak!`,
              duration: 2500,
            });
            setGameInfoBasedOnExtraTurn(finalBoardStateForTurn, currentPlayer);
          } else {
            completeTurn(finalBoardStateForTurn, currentPlayer);
          }
        }

      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color === currentPlayer) {
          setSelectedSquare(algebraic);
          const pseudoPossibleMoves = getPossibleMoves(currentBoardForClick, algebraic);
          const legalFilteredMoves = filterLegalMoves(currentBoardForClick, algebraic, pseudoPossibleMoves, currentPlayer);
          setPossibleMoves(legalFilteredMoves);
        }
      }
    } else if (clickedPiece && clickedPiece.color === currentPlayer) {
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
      killStreaks,
      lastCapturePlayer,
      capturedPieces,
      setGameInfoBasedOnExtraTurn,
      saveStateToHistory,
      setBoard,
      setGameInfo,
      setCapturedPieces,
      setKillStreaks,
      setLastCapturePlayer,
      setKillStreakFlashMessage,
      setKillStreakFlashMessageKey,
      setIsPromotingPawn,
      setPromotionSquare,
      setSelectedSquare,
      setPossibleMoves,
      viewMode,
    ]
  );

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;

    saveStateToHistory();

    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));

    const { row, col } = algebraicToCoords(promotionSquare);
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
      duration: 2500,
    });

    const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
    const currentStreakForPromotingPlayer = killStreaks[pawnColor];
    const streakGrantsExtraTurn = currentStreakForPromotingPlayer >= 6;


    if (pawnLevelGrantsExtraTurn || streakGrantsExtraTurn) {
      let reason = "";
      if (pawnLevelGrantsExtraTurn && streakGrantsExtraTurn) {
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn from high-level promotion AND a 6+ kill streak!`;
      } else if (pawnLevelGrantsExtraTurn) {
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn from high-level promotion!`;
      } else { // streakGrantsExtraTurn must be true
        reason = `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn for a 6+ kill streak!`;
      }
      toast({
        title: "Extra Turn!",
        description: reason,
        duration: 2500,
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
      saveStateToHistory,
      setBoard,
      setIsPromotingPawn,
      setPromotionSquare,
    ]
  );

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) {
      toast({ title: "Undo Failed", description: "No moves to undo.", duration: 2500 });
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
        setViewMode(lastState.viewMode);

        setSelectedSquare(null);
        setPossibleMoves([]);
        setFlashMessage(null);
        flashedCheckStateRef.current = null;
        setKillStreakFlashMessage(null);
        setIsPromotingPawn(false);
        setPromotionSquare(null);

        toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
      }
      return newHistory;
    });
  }, [historyStack, toast, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setBoardOrientation, setViewMode, setSelectedSquare, setPossibleMoves, setFlashMessage, setKillStreakFlashMessage, setIsPromotingPawn, setPromotionSquare]);

  const handleToggleViewMode = () => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      if (newMode === 'flipping') {
        setBoardOrientation(currentPlayer);
      } else {
        setBoardOrientation('white');
      }
      return newMode;
    });
  };

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {flashMessage && (
        <div
          key={`flash-${flashMessageKey}`}
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
          key={`streak-${killStreakFlashMessageKey}`}
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
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
            <RefreshCw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
            <BookOpen className="h-4 w-4 mr-1" />
            Rules
          </Button>
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={historyStack.length === 0} aria-label="Undo Move" className="h-8 px-2 text-xs">
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
            <View className="h-4 w-4 mr-1" />
            View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
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
            viewMode={viewMode}
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
