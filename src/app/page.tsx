
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
  boardToSimpleString, // Restored for AI
  type ConversionEvent,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Cpu } from 'lucide-react'; // Added Cpu icon
import { getAiMove } from '@/ai/flows/chess-ai-move-flow'; // Restored for AI

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

  const [isBlackAI, setIsBlackAI] = useState(false); // AI state
  const [isWhiteAI, setIsWhiteAI] = useState(false); // AI state
  const [isAiThinking, setIsAiThinking] = useState(false); // AI thinking state

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

  const determineBoardOrientation = useCallback((
    currentViewMode: ViewMode,
    playerForTurn: PlayerColor,
    blackIsAI: boolean,
    whiteIsAI: boolean
  ): PlayerColor => {
    if (whiteIsAI && blackIsAI) {
      return 'white'; // Both AI, default to white
    }
    if (whiteIsAI && !blackIsAI) {
      return 'black'; // White is AI, Black is Human, orient for Black
    }
    if (!whiteIsAI && blackIsAI) {
      return 'white'; // Black is AI, White is Human, orient for White
    }
    // Human vs Human
    if (currentViewMode === 'flipping') {
      return playerForTurn;
    } else { 
      return 'white'; // Tabletop view is always White-oriented
    }
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
      isBlackAI: isBlackAI,
      isWhiteAI: isWhiteAI,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20);
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isBlackAI, isWhiteAI]);


  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameInfo(initialGameStatus);
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
    setKillStreakFlashMessage(null);
    setKillStreakFlashMessageKey(0);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setIsBlackAI(false);
    setIsWhiteAI(false);
    setIsAiThinking(false);
    setViewMode('flipping'); 
    setBoardOrientation(determineBoardOrientation('flipping', 'white', false, false));
    toast({ title: "Game Reset", description: "The board has been reset to the initial state.", duration: 2500 });
  }, [toast, determineBoardOrientation]); 

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
        if (!gameInfo.isCheck && !gameInfo.isCheckmate && flashedCheckStateRef.current) {
             flashedCheckStateRef.current = null;
        }
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
    
    setBoardOrientation(determineBoardOrientation(viewMode, playerTakingExtraTurn, isBlackAI, isWhiteAI));

    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);

    if (opponentInCheck) {
      toast({
        title: "Auto-Checkmate!",
        description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins by delivering check and earning an extra turn!`,
        duration: 2500,
      });
      setGameInfo({
        message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`,
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
      message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, 
      isCheck: false,
      playerWithKingInCheck: null,
      isCheckmate: false,
      isStalemate: false,
      gameOver: false,
    });
  }, [toast, viewMode, determineBoardOrientation, isBlackAI, isWhiteAI, setBoardOrientation, setGameInfo, setSelectedSquare, setPossibleMoves]); 


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);

    setBoardOrientation(determineBoardOrientation(viewMode, nextPlayer, isBlackAI, isWhiteAI));

    const inCheck = isKingInCheck(updatedBoard, nextPlayer);
    let newPlayerWithKingInCheck: PlayerColor | null = null;

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        setGameInfo({
          message: `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`,
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
  }, [setCurrentPlayer, setSelectedSquare, setPossibleMoves, setBoardOrientation, viewMode, determineBoardOrientation, isBlackAI, isWhiteAI, setGameInfo]); 


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking) return;

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
        let calculatedNewStreakForPlayer: number;
        
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
                    description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable ${victimPiece.color} Rook.`,
                    duration: 2500,
                  });
                  continue;
                }
                if (victimPiece.type === 'queen' && victimPiece.level >= 5 && pieceToMove.level < victimPiece.level) {
                   toast({
                    title: "Invulnerable Queen!",
                    description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on high-level ${victimPiece.color} Queen.`,
                    duration: 2500,
                  });
                  continue;
                }
                piecesDestroyed.push({ ...victimPiece });
                finalBoardAfterDestruct[adjR][adjC].piece = null;
                toast({
                  title: "Self-Destruct!",
                  description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`,
                  duration: 2500,
                });
              }
            }
          }
        }
        finalBoardAfterDestruct[knightR][knightC].piece = null; 

        if (piecesDestroyed.length > 0) {
          setKillStreaks(prevKillStreaks => {
            const newStreaks = {
              white: prevKillStreaks.white,
              black: prevKillStreaks.black,
            };
            newStreaks[selfDestructPlayer] = (prevKillStreaks[selfDestructPlayer] || 0) + piecesDestroyed.length;
            calculatedNewStreakForPlayer = newStreaks[selfDestructPlayer];
            return newStreaks;
          });
          setCapturedPieces(prev => ({ ...prev, [selfDestructPlayer]: [...(prev[selfDestructPlayer] || []), ...piecesDestroyed] }));
          setLastCapturePlayer(selfDestructPlayer);

        } else {
           setKillStreaks(prevKillStreaks => {
            const newStreaks = {
              white: prevKillStreaks.white,
              black: prevKillStreaks.black,
            };
            if (prevKillStreaks[selfDestructPlayer] > 0) { // Only reset if they had a streak
                newStreaks[selfDestructPlayer] = 0;
            }
            // If no pieces destroyed, lastCapturePlayer remains unchanged (opponent might have it) unless this player was the last one.
            if (lastCapturePlayer === selfDestructPlayer) {
              setLastCapturePlayer(null);
            }
            calculatedNewStreakForPlayer = newStreaks[selfDestructPlayer];
            return newStreaks;
           });
        }
        // This needs to be outside setKillStreaks to use the final calculated value
        if (calculatedNewStreakForPlayer >= 2 && calculatedNewStreakForPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
        else if (calculatedNewStreakForPlayer >= 3 && calculatedNewStreakForPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
        else if (calculatedNewStreakForPlayer >= 4 && calculatedNewStreakForPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
        else if (calculatedNewStreakForPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }


        if (calculatedNewStreakForPlayer >= 3) {
          const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
          let pieceToResurrectOriginal: Piece | undefined;

          setCapturedPieces(prevGlobalCaptured => {
            const newGlobalCaptured = { ...prevGlobalCaptured };
            const specificListOfLostPieces = [...(newGlobalCaptured[opponentOfSelfDestructPlayer] || [])];
            if (specificListOfLostPieces.length > 0) {
              pieceToResurrectOriginal = specificListOfLostPieces.pop(); // Get and remove
              newGlobalCaptured[opponentOfSelfDestructPlayer] = specificListOfLostPieces;
            }
            return newGlobalCaptured;
          });

          if (pieceToResurrectOriginal) {
            const resurrectedPiece = {
              ...pieceToResurrectOriginal,
              level: 1,
              id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
            };
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
                description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                duration: 2500,
              });
            } else if (pieceToResurrectOriginal) { // If no empty squares, add back to captured list
                setCapturedPieces(prev => ({ ...prev, [opponentOfSelfDestructPlayer]: [...(prev[opponentOfSelfDestructPlayer] || []), pieceToResurrectOriginal!] }));
            }
          }
        }

        setBoard(finalBoardAfterDestruct);
        setSelectedSquare(null);
        setPossibleMoves([]);

        const streakGrantsExtraTurn = calculatedNewStreakForPlayer >= 6;
        if (streakGrantsExtraTurn) {
          toast({
            title: "Extra Turn!",
            description: `${getPlayerDisplayName(selfDestructPlayer)} gets an extra turn from a 6+ destruction streak!`,
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
        const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(currentBoardForClick, { from: selectedSquare, to: algebraic });
        let finalBoardStateForTurn = newBoard;

        const capturingPlayer = currentPlayer;
        let currentCalculatedStreakForCapturingPlayer: number;

        if (captured) {
          setKillStreaks(prevKillStreaks => {
            const newStreaks = {
              white: prevKillStreaks.white,
              black: prevKillStreaks.black,
            };
            newStreaks[capturingPlayer] = (prevKillStreaks[capturingPlayer] || 0) + 1;
            currentCalculatedStreakForCapturingPlayer = newStreaks[capturingPlayer];
            return newStreaks;
          });
          setLastCapturePlayer(capturingPlayer);
          setCapturedPieces(prev => ({ ...prev, [capturingPlayer]: [...(prev[capturingPlayer] || []), captured] }));


          if (currentCalculatedStreakForCapturingPlayer >= 2 && currentCalculatedStreakForCapturingPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 3 && currentCalculatedStreakForCapturingPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 4 && currentCalculatedStreakForCapturingPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
          else if (currentCalculatedStreakForCapturingPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }

          const pieceOnToSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece;
          toast({
            title: "Piece Captured!",
            description: `${getPlayerDisplayName(capturingPlayer)} ${pieceOnToSquare?.type} captured ${captured.color} ${captured.type}. ${pieceOnToSquare ? `It's now level ${pieceOnToSquare.level}!` : ''}`,
            duration: 2500,
          });

          if (currentCalculatedStreakForCapturingPlayer >= 3) {
            const opponentOfCapturingPlayer = capturingPlayer === 'white' ? 'black' : 'white';
            let pieceToResurrectOriginal: Piece | undefined;
            
            setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentOfCapturingPlayer] || [])];
                if (specificListOfLostPieces.length > 0) {
                  pieceToResurrectOriginal = specificListOfLostPieces.pop();
                  newGlobalCaptured[opponentOfCapturingPlayer] = specificListOfLostPieces;
                }
                return newGlobalCaptured;
            });

            if (pieceToResurrectOriginal) {
                const resurrectedPiece = {
                    ...pieceToResurrectOriginal,
                    level: 1,
                    id: `${pieceToResurrectOriginal.id}_res${Date.now()}`
                };
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
                        description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                        duration: 2500,
                    });
                }  else if (pieceToResurrectOriginal) { // If no empty squares, add back to captured list
                    setCapturedPieces(prev => ({ ...prev, [opponentOfCapturingPlayer]: [...(prev[opponentOfCapturingPlayer] || []), pieceToResurrectOriginal!] }));
                }
            }
          }
        } else { 
            setKillStreaks(prevKillStreaks => {
                const newStreaks = {
                  white: prevKillStreaks.white,
                  black: prevKillStreaks.black,
                };
                if (prevKillStreaks[capturingPlayer] > 0) { // Only reset if they had a streak
                    newStreaks[capturingPlayer] = 0;
                }
                 // If no capture, lastCapturePlayer remains unchanged (opponent might have it) unless this player was the last one.
                if (lastCapturePlayer === capturingPlayer) {
                  setLastCapturePlayer(null);
                }
                currentCalculatedStreakForCapturingPlayer = newStreaks[capturingPlayer];
                return newStreaks;
            });
        }


        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => {
            toast({
              title: "Piece Converted!",
              description: `${getPlayerDisplayName(currentPlayer)}'s Bishop converted an enemy ${event.originalPiece.type} to their side!`,
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
              description: `${getPlayerDisplayName(currentPlayer)} gets an extra turn for a 6+ kill streak!`,
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
      determineBoardOrientation,
      viewMode, 
      isAiThinking,
      setBoard, 
      setCapturedPieces, 
      setKillStreaks,
      setLastCapturePlayer,
      setPossibleMoves,
      setSelectedSquare,
      setIsPromotingPawn,
      setPromotionSquare,
      setKillStreakFlashMessage,
      setKillStreakFlashMessageKey
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
      description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (Level 1)${pieceType === 'rook' ? ' Invulnerable for 1 turn!' : ''}`,
      duration: 2500,
    });

    const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
    const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0; 
    const streakGrantsExtraTurn = currentStreakForPromotingPlayer >= 6;


    if (pawnLevelGrantsExtraTurn || streakGrantsExtraTurn) {
      let reason = "";
      if (pawnLevelGrantsExtraTurn && streakGrantsExtraTurn) {
        reason = `${getPlayerDisplayName(pawnColor)} gets an extra turn from high-level promotion AND a 6+ kill streak!`;
      } else if (pawnLevelGrantsExtraTurn) {
        reason = `${getPlayerDisplayName(pawnColor)} gets an extra turn from high-level promotion!`;
      } else { 
        reason = `${getPlayerDisplayName(pawnColor)} gets an extra turn for a 6+ kill streak!`;
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
      setIsPromotingPawn,
      setPromotionSquare,
      setBoard,
    ]
  );

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0 || isAiThinking) {
      toast({ title: "Undo Failed", description: isAiThinking ? "Cannot undo while AI is thinking." : "No moves to undo.", duration: 2500 });
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
        setIsBlackAI(lastState.isBlackAI);
        setIsWhiteAI(lastState.isWhiteAI);
        
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
  }, [historyStack, toast, isAiThinking, setHistoryStack, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setBoardOrientation, setViewMode, setIsBlackAI, setIsWhiteAI, setSelectedSquare, setPossibleMoves, setFlashMessage, setKillStreakFlashMessage, setIsPromotingPawn, setPromotionSquare]);

  const handleToggleViewMode = () => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
  };

  const handleToggleBlackAI = () => {
    if (isAiThinking && currentPlayer === 'black') return; // Prevent toggle if AI is thinking for this color
    setIsBlackAI(prev => {
      const newIsBlackAI = !prev;
      setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
      return newIsBlackAI;
    });
  };

  const handleToggleWhiteAI = () => {
    if (isAiThinking && currentPlayer === 'white') return; // Prevent toggle if AI is thinking for this color
    setIsWhiteAI(prev => {
      const newIsWhiteAI = !prev;
      setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
      return newIsWhiteAI;
    });
  };

  // AI Turn Logic
  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'black' && isBlackAI) || (currentPlayer === 'white' && isWhiteAI);

    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn) {
      const performAiMove = async () => {
        setIsAiThinking(true);
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));

        // Client-side pre-computation of movable pieces for the AI
        const aiMovablePieceSquares: AlgebraicSquare[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = board[r][c];
                if (square.piece && square.piece.color === currentPlayer) {
                    const pseudoMoves = getPossibleMoves(board, square.algebraic);
                    const legalMovesForPiece = filterLegalMoves(board, square.algebraic, pseudoMoves, currentPlayer);
                    if (legalMovesForPiece.length > 0) {
                        aiMovablePieceSquares.push(square.algebraic);
                    }
                }
            }
        }
        
        if (aiMovablePieceSquares.length === 0 && !isCheckmate(board, currentPlayer) && !isStalemate(board, currentPlayer)) {
            console.warn(`AI FORFEIT (${currentPlayer}): No movable pieces found, but not checkmate/stalemate. This indicates a potential logic error upstream or a very unusual board state.`);
            toast({ title: "AI Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) has no valid starting pieces and forfeits turn.`, variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer);
            setIsAiThinking(false);
            return;
        }


        try {
          const aiInput: ChessAiMoveInput = {
            boardString: boardToSimpleString(board, currentPlayer),
            playerColor: currentPlayer,
            availablePieceSquares: aiMovablePieceSquares,
            isPlayerInCheck: gameInfo.isCheck && gameInfo.playerWithKingInCheck === currentPlayer,
          };
          const aiResult = await getAiMove(aiInput);

          if (aiResult.error || !aiResult.from || !aiResult.to) {
            console.warn(`AI FORFEIT (${currentPlayer}): AI flow error or no move suggested. Error: ${aiResult.error || 'Unknown AI error'}`);
            toast({ title: "AI Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) had an issue and forfeits turn. ${aiResult.error || ''}`, variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer);
            setIsAiThinking(false);
            return;
          }

          const { from: aiFrom, to: aiTo } = aiResult;

          // Validate AI's chosen 'from' square
          const fromSquarePiece = board[algebraicToCoords(aiFrom as AlgebraicSquare).row][algebraicToCoords(aiFrom as AlgebraicSquare).col].piece;

          if (!fromSquarePiece || fromSquarePiece.color !== currentPlayer) {
            console.warn(`AI FORFEIT (${currentPlayer}): AI tried to move an opponent's piece or an empty square from ${aiFrom}.`);
            toast({ title: "AI Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) selected an invalid piece and forfeits turn.`, variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer);
            setIsAiThinking(false);
            return;
          }

          if (aiMovablePieceSquares && aiMovablePieceSquares.length > 0 && !aiMovablePieceSquares.includes(aiFrom as AlgebraicSquare)) {
            console.warn(`AI FORFEIT (${currentPlayer}): AI chose 'from' square ${aiFrom} which was NOT in the provided 'availablePieceSquares' list: [${aiMovablePieceSquares.join(', ')}]. This means the AI ignored a critical constraint.`);
            toast({ title: "AI Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) ignored constraints and forfeits turn.`, variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer);
            setIsAiThinking(false);
            return;
          }


          const legalMovesForAiPiece = filterLegalMoves(board, aiFrom as AlgebraicSquare, getPossibleMoves(board, aiFrom as AlgebraicSquare), currentPlayer);

          // Handle AI Knight Self-Destruct
          if (aiFrom === aiTo && fromSquarePiece.type === 'knight' && fromSquarePiece.level >= 5) {
            // AI signaled self-destruct by making 'from' and 'to' the same
             saveStateToHistory();
            let finalBoardAfterDestruct = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            const { row: knightR, col: knightC } = algebraicToCoords(aiFrom as AlgebraicSquare);
            const piecesDestroyed: Piece[] = [];
            const selfDestructPlayer = currentPlayer;
            let calculatedNewStreakForPlayer: number;

            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = knightR + dr;
                const adjC = knightC + dc;
                if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                  const victimPiece = finalBoardAfterDestruct[adjR][adjC].piece;
                  if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                    if (victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) continue;
                    if (victimPiece.type === 'queen' && victimPiece.level >= 5 && fromSquarePiece.level < victimPiece.level) continue;
                    piecesDestroyed.push({ ...victimPiece });
                    finalBoardAfterDestruct[adjR][adjC].piece = null;
                  }
                }
              }
            }
            finalBoardAfterDestruct[knightR][knightC].piece = null;

            if (piecesDestroyed.length > 0) {
                setKillStreaks(prev => {
                    const newStreaks = { white: prev.white, black: prev.black };
                    newStreaks[selfDestructPlayer] = (prev[selfDestructPlayer] || 0) + piecesDestroyed.length;
                    calculatedNewStreakForPlayer = newStreaks[selfDestructPlayer];
                    return newStreaks;
                });
                setCapturedPieces(prev => ({ ...prev, [selfDestructPlayer]: [...(prev[selfDestructPlayer] || []), ...piecesDestroyed] }));
                setLastCapturePlayer(selfDestructPlayer);
            } else {
                setKillStreaks(prev => {
                    const newStreaks = { white: prev.white, black: prev.black };
                    if (prev[selfDestructPlayer] > 0) newStreaks[selfDestructPlayer] = 0;
                    if (lastCapturePlayer === selfDestructPlayer) setLastCapturePlayer(null);
                    calculatedNewStreakForPlayer = newStreaks[selfDestructPlayer];
                    return newStreaks;
                });
            }
            // Simplified AI resurrection and extra turn logic for now
             if (calculatedNewStreakForPlayer >= 3) { /* Basic resurrection can be added here later if needed */ }
            
            setBoard(finalBoardAfterDestruct);
            completeTurn(finalBoardAfterDestruct, selfDestructPlayer); // AI does not get extra turn from self-destruct streak for simplicity
          } else if (legalMovesForAiPiece.includes(aiTo as AlgebraicSquare)) {
            // AI suggested a valid regular move
            saveStateToHistory();
            const { newBoard: boardAfterAiMove, capturedPiece: aiCaptured, conversionEvents: aiConversionEvents } = applyMove(board, { from: aiFrom as AlgebraicSquare, to: aiTo as AlgebraicSquare });
            let finalBoardForAiTurn = boardAfterAiMove;

            if (aiCaptured) {
                setKillStreaks(prev => {
                    const newStreaks = { white: prev.white, black: prev.black };
                    newStreaks[currentPlayer] = (prev[currentPlayer] || 0) + 1;
                    // AI does not get resurrection from its own streak for simplicity
                    return newStreaks;
                });
                setLastCapturePlayer(currentPlayer);
                setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), aiCaptured] }));
            } else {
                 setKillStreaks(prev => {
                    const newStreaks = { white: prev.white, black: prev.black };
                    if (prev[currentPlayer] > 0) newStreaks[currentPlayer] = 0;
                    if (lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                    return newStreaks;
                });
            }
            
            // Handle AI Pawn Promotion (Simplified: Auto-Queen)
            const movedPieceFinalSquare = finalBoardForAiTurn[algebraicToCoords(aiTo as AlgebraicSquare).row][algebraicToCoords(aiTo as AlgebraicSquare).col];
            const movedPieceOnBoard = movedPieceFinalSquare.piece;
            const { row: toRowPawnCheck } = algebraicToCoords(aiTo as AlgebraicSquare);
            const isPawnPromotingMove = movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7);

            if (isPawnPromotingMove) {
              const pawnColor = movedPieceOnBoard.color;
              finalBoardForAiTurn[algebraicToCoords(aiTo as AlgebraicSquare).row][algebraicToCoords(aiTo as AlgebraicSquare).col].piece = {
                ...movedPieceOnBoard,
                type: 'queen',
                level: 1,
                invulnerableTurnsRemaining: 0, // Promoted queen not invulnerable by default
              };
              toast({
                title: "AI Pawn Promoted!",
                description: `${getPlayerDisplayName(pawnColor)} (AI) pawn promoted to Queen! (Level 1)`,
                duration: 2500,
              });
            }
            setBoard(finalBoardForAiTurn);
            // AI does not get extra turns from pawn promotion or streaks in this simplified version
            completeTurn(finalBoardForAiTurn, currentPlayer);
          } else {
            if (legalMovesForAiPiece.length === 0 && fromSquarePiece) {
                 console.warn(`AI FORFEIT (${currentPlayer}): AI chose a piece at ${aiFrom} which has no legal moves. Available for AI: [${aiMovablePieceSquares.join(', ')}]`);
            } else {
                 console.warn(`AI FORFEIT (${currentPlayer}): AI suggested an illegal move: ${aiFrom} to ${aiTo}. Valid for ${aiFrom}: [${legalMovesForAiPiece.join(', ')}]. Available for AI: [${aiMovablePieceSquares.join(', ')}]`);
            }
            toast({ title: "AI Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) made an invalid move and forfeits turn.`, variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer); // Pass turn even if AI makes an error
          }
        } catch (error) {
          console.error("Error during AI move execution:", error);
          toast({ title: "AI System Error", description: `${getPlayerDisplayName(currentPlayer)} (AI) encountered a system error and forfeits turn.`, variant: "destructive", duration: 2500 });
          completeTurn(board, currentPlayer);
        } finally {
          setIsAiThinking(false);
        }
      };
      performAiMove();
    }
  }, [
    currentPlayer, gameInfo.gameOver, isAiThinking, isBlackAI, isWhiteAI, board, 
    completeTurn, saveStateToHistory, toast, isPromotingPawn,
    setBoard, setCapturedPieces, setGameInfo, setKillStreaks, setLastCapturePlayer, setIsAiThinking,
    gameInfo.isCheck, gameInfo.playerWithKingInCheck // Added for isPlayerInCheck input to AI
  ]);


  const getPlayerDisplayName = (player: PlayerColor) => {
    return player.charAt(0).toUpperCase() + player.slice(1);
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
          <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
            <RefreshCw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
            <BookOpen className="h-4 w-4 mr-1" />
            Rules
          </Button>
          <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking} aria-label="Undo Move" className="h-8 px-2 text-xs">
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
          <Button variant="outline" onClick={handleToggleWhiteAI} disabled={isAiThinking && currentPlayer === 'white'} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
            <Cpu className="h-4 w-4 mr-1" /> W AI: {isWhiteAI ? 'On' : 'Off'}
          </Button>
          <Button variant="outline" onClick={handleToggleBlackAI} disabled={isAiThinking && currentPlayer === 'black'} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
            <Cpu className="h-4 w-4 mr-1" /> B AI: {isBlackAI ? 'On' : 'Off'}
          </Button>
          <Button variant="outline" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
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
            isWhiteAI={isWhiteAI} // Pass AI status
            isBlackAI={isBlackAI} // Pass AI status
            isAiThinking={isAiThinking}
          />
        </div>
        <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
          <ChessBoard
            boardState={board}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            onSquareClick={handleSquareClick}
            playerColor={boardOrientation}
            isGameOver={gameInfo.gameOver || isPromotingPawn || isAiThinking}
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
