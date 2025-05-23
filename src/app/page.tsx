
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

const initialGameStatus: GameStatus = {
  message: "\u00A0",
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  gameOver: false,
};

// Helper to adapt the main BoardState to the AI's expected board format
function adaptBoardForAI(mainBoard: BoardState): (Piece | null)[][] {
  return mainBoard.map(row =>
    row.map(squareState =>
      squareState.piece
      ? {
          ...squareState.piece,
          // The VibeChessAI class expects 'invulnerable' boolean based on 'invulnerableTurnsRemaining'
          invulnerable: !!(squareState.piece.invulnerableTurnsRemaining && squareState.piece.invulnerableTurnsRemaining > 0)
        }
      : null
    )
  );
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>(initialGameStatus);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });

  const [viewMode, setViewMode] = useState<ViewMode>('flipping');
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');

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

  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef(new VibeChessAI(3));

  const { toast } = useToast();

  const determineBoardOrientation = useCallback((
    currentViewMode: ViewMode,
    playerForTurn: PlayerColor,
    blackIsCurrentlyAI: boolean,
    whiteIsCurrentlyAI: boolean
  ): PlayerColor => {
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // AI vs AI, default to White's view
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black'; // Human is Black
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // Human is White

    // Human vs Human
    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; // Tabletop default
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
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); // Limit history size
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI]);


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
    setIsWhiteAI(false);
    setIsBlackAI(false);
    setIsAiThinking(false);
    setViewMode('flipping');
    setBoardOrientation(determineBoardOrientation('flipping', 'white', false, false));
    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
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
      if (timerId) clearTimeout(timerId);
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
      if (killStreakTimerId) clearTimeout(killStreakTimerId);
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
      if (boardWasModified) return boardAfterInvulnerabilityWearOff;
      return prevBoard;
    });
  }, [currentPlayer]);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    return player.charAt(0).toUpperCase() + player.slice(1);
  }, []);

  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setBoardOrientation(determineBoardOrientation(viewMode, playerTakingExtraTurn, isBlackAI, isWhiteAI));

    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor);

    if (opponentInCheck) {
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
      setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true });
      return;
    }

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
      setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true });
      return;
    }

    setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  }, [toast, viewMode, isBlackAI, isWhiteAI, determineBoardOrientation, getPlayerDisplayName, setGameInfo, setPossibleMoves, setSelectedSquare, setBoardOrientation]);


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
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true });
      } else {
        setGameInfo({ message: "Check!", isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false });
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true });
      } else {
        setGameInfo({ message: "\u00A0", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
      }
    }
  }, [setCurrentPlayer, setSelectedSquare, setPossibleMoves, setBoardOrientation, viewMode, isBlackAI, isWhiteAI, determineBoardOrientation, setGameInfo, getPlayerDisplayName]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking) return;

    const currentBoardForClick = board;
    const { row, col } = algebraicToCoords(algebraic);
    const clickedPieceData = currentBoardForClick[row][col];
    const clickedPiece = clickedPieceData.piece;

    if (selectedSquare) {
      const pieceToMoveData = currentBoardForClick[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
      const pieceToMove = pieceToMoveData.piece;

      if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && pieceToMove.level >= 5) {
        saveStateToHistory();
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
                 if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                     (victimPiece.type === 'queen' && victimPiece.level >= 5 && pieceToMove.level < victimPiece.level)
                 ) {
                  toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable piece.`, duration: 2500 });
                  continue;
                }
                piecesDestroyed.push({ ...victimPiece });
                finalBoardAfterDestruct[adjR][adjC].piece = null;
                toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
              }
            }
          }
        }
        finalBoardAfterDestruct[knightR][knightC].piece = null; // Remove the Knight

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

            if (calculatedNewStreakForPlayer >= 2 && calculatedNewStreakForPlayer < 3) { setKillStreakFlashMessage("Double Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
            else if (calculatedNewStreakForPlayer >= 3 && calculatedNewStreakForPlayer < 4) { setKillStreakFlashMessage("Triple Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
            else if (calculatedNewStreakForPlayer >= 4 && calculatedNewStreakForPlayer < 5) { setKillStreakFlashMessage("Ultra Kill!"); setKillStreakFlashMessageKey(k => k + 1); }
            else if (calculatedNewStreakForPlayer >= 5) { setKillStreakFlashMessage("RAMPAGE!"); setKillStreakFlashMessageKey(k => k + 1); }


            if (calculatedNewStreakForPlayer >= 3) {
                const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
                setCapturedPieces(prevGlobalCaptured => {
                    const piecesCapturedByOpponent = prevGlobalCaptured[opponentOfSelfDestructPlayer];
                    if (piecesCapturedByOpponent && piecesCapturedByOpponent.length > 0) {
                        const pieceToResurrectOriginal = piecesCapturedByOpponent.pop();
                        const emptySquares: AlgebraicSquare[] = [];
                        for (let r_idx = 0; r_idx < 8; r_idx++) {
                            for (let c_idx = 0; c_idx < 8; c_idx++) {
                                if (!finalBoardAfterDestruct[r_idx][c_idx].piece) {
                                    emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                                }
                            }
                        }
                        if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                            const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                            const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                            const resurrectedPiece: Piece = {
                                ...pieceToResurrectOriginal,
                                level: 1,
                                id: `${pieceToResurrectOriginal.id}_res_${Date.now()}`,
                                invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0,
                            };
                            finalBoardAfterDestruct[resR][resC].piece = resurrectedPiece;
                            toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                        }
                         return {...prevGlobalCaptured, [opponentOfSelfDestructPlayer]: piecesCapturedByOpponent || []};
                    }
                    return prevGlobalCaptured;
                });
            }
        } else { // Self-destruct hit no pieces
            setKillStreaks(prevKillStreaks => {
                 const newStreaks = {
                    white: prevKillStreaks.white,
                    black: prevKillStreaks.black,
                };
                newStreaks[selfDestructPlayer] = 0;
                calculatedNewStreakForPlayer = 0; 
                return newStreaks;
            });
            if (lastCapturePlayer === selfDestructPlayer) {
                setLastCapturePlayer(null); 
            }
        }

        setBoard(finalBoardAfterDestruct);
        setSelectedSquare(null); setPossibleMoves([]);
        const streakGrantsExtraTurn = calculatedNewStreakForPlayer >= 6;
        if (streakGrantsExtraTurn) {
          toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(selfDestructPlayer)} gets extra turn from destruction streak!`, duration: 2500 });
          setGameInfoBasedOnExtraTurn(finalBoardAfterDestruct, selfDestructPlayer);
        } else {
          completeTurn(finalBoardAfterDestruct, selfDestructPlayer);
        }
        return;
      }

      if (pieceToMove && pieceToMove.color === currentPlayer && possibleMoves.includes(algebraic)) {
        saveStateToHistory();
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

             if (currentCalculatedStreakForCapturingPlayer >= 3) {
                const opponentColor = capturingPlayer === 'white' ? 'black' : 'white';
                setCapturedPieces(prevGlobalCaptured => {
                    const piecesCapturedByOpponent = prevGlobalCaptured[opponentColor];
                    if (piecesCapturedByOpponent && piecesCapturedByOpponent.length > 0) {
                        const pieceToResurrectOriginal = piecesCapturedByOpponent.pop();
                        const emptySquares: AlgebraicSquare[] = [];
                        for (let r_idx = 0; r_idx < 8; r_idx++) {
                            for (let c_idx = 0; c_idx < 8; c_idx++) {
                                if (!finalBoardStateForTurn[r_idx][c_idx].piece) { 
                                    emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                                }
                            }
                        }
                        if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                            const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                            const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                            const resurrectedPiece: Piece = {
                                ...pieceToResurrectOriginal,
                                level: 1,
                                id: `${pieceToResurrectOriginal.id}_res_${Date.now()}`,
                                invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0,
                            };
                            finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                            toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                        }
                         return {...prevGlobalCaptured, [opponentColor]: piecesCapturedByOpponent || []};
                    }
                     return prevGlobalCaptured;
                });
             }
        } else { // No capture
            setKillStreaks(prevKillStreaks => {
                const newStreaks = {
                    white: prevKillStreaks.white,
                    black: prevKillStreaks.black,
                };
                newStreaks[capturingPlayer] = 0;
                currentCalculatedStreakForCapturingPlayer = 0; 
                return newStreaks;
            });
            if (lastCapturePlayer === capturingPlayer) { 
                setLastCapturePlayer(null); 
            }
        }

        if (conversionEvents && conversionEvents.length > 0) {
          conversionEvents.forEach(event => {
            toast({
              title: "Conversion!",
              description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type} to their side!`,
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
          setIsPromotingPawn(true); setPromotionSquare(algebraic);
        } else {
          if (streakGrantsExtraTurn) {
            toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(currentPlayer)} gets extra turn from 6+ streak!`, duration: 2500 });
            setGameInfoBasedOnExtraTurn(finalBoardStateForTurn, currentPlayer);
          } else {
            completeTurn(finalBoardStateForTurn, currentPlayer);
          }
        }
      } else {
        setSelectedSquare(null); setPossibleMoves([]);
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
  }, [ board, currentPlayer, selectedSquare, possibleMoves, toast, gameInfo.gameOver, isPromotingPawn, completeTurn, killStreaks, lastCapturePlayer, capturedPieces, setGameInfoBasedOnExtraTurn, saveStateToHistory, determineBoardOrientation, viewMode, isWhiteAI, isBlackAI, isAiThinking, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPossibleMoves, setSelectedSquare, setGameInfo]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;
    saveStateToHistory();
    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;
    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      setIsPromotingPawn(false); setPromotionSquare(null); return;
    }
    const originalPawnLevel = originalPawnOnBoard.level;
    const pawnColor = originalPawnOnBoard.color;
    boardAfterPromotion[row][col].piece = { ...originalPawnOnBoard, type: pieceType, level: 1, invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0 };
    setBoard(boardAfterPromotion);
    toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)${pieceType === 'rook' ? ' Invulnerable!' : ''}`, duration: 2500 });
    const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
    const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0; 
    const streakGrantsExtraTurn = currentStreakForPromotingPlayer >= 6;
    if (pawnLevelGrantsExtraTurn || streakGrantsExtraTurn) {
      let reason = pawnLevelGrantsExtraTurn && streakGrantsExtraTurn ? "high-level promotion AND streak!" : pawnLevelGrantsExtraTurn ? "high-level promotion!" : "6+ kill streak!";
      toast({ title: "Extra Turn!", description: `${getPlayerDisplayName(pawnColor)} gets an extra turn from ${reason}`, duration: 2500 });
      setGameInfoBasedOnExtraTurn(boardAfterPromotion, pawnColor);
    } else {
      completeTurn(boardAfterPromotion, pawnColor);
    }
    setIsPromotingPawn(false); setPromotionSquare(null);
  }, [ board, promotionSquare, completeTurn, toast, killStreaks, setGameInfoBasedOnExtraTurn, saveStateToHistory, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, setGameInfo]);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0 || isAiThinking) {
      toast({ title: "Undo Failed", description: isAiThinking ? "Cannot undo while AI is thinking." : "No moves to undo.", duration: 2500 });
      return;
    }

    const isHumanVsAiGame = (isWhiteAI && !isBlackAI) || (!isWhiteAI && isBlackAI);
    const playerWhoMadeTheActualLastMove = currentPlayer === 'white' ? 'black' : 'white';
    
    let aiMadeTheActualLastMove = false;
    if (isWhiteAI && playerWhoMadeTheActualLastMove === 'white') {
        aiMadeTheActualLastMove = true;
    } else if (isBlackAI && playerWhoMadeTheActualLastMove === 'black') {
        aiMadeTheActualLastMove = true;
    }

    let statesToPop = 1;
    if (isHumanVsAiGame && aiMadeTheActualLastMove && historyStack.length >= 2) {
        statesToPop = 2;
    }
    
    const targetHistoryIndex = historyStack.length - statesToPop;
    if (targetHistoryIndex < 0) { 
        toast({ title: "Undo Error", description: "Not enough history to undo.", duration: 2500 });
        return;
    }
    const stateToRestore = historyStack[targetHistoryIndex]; 

    setHistoryStack(prevHistory => prevHistory.slice(0, targetHistoryIndex));

    if (stateToRestore) {
      setBoard(stateToRestore.board); 
      setCurrentPlayer(stateToRestore.currentPlayer); 
      setGameInfo(stateToRestore.gameInfo); 
      setCapturedPieces(stateToRestore.capturedPieces);
      setKillStreaks(stateToRestore.killStreaks); 
      setLastCapturePlayer(stateToRestore.lastCapturePlayer); 
      
      setIsWhiteAI(stateToRestore.isWhiteAI); 
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation(stateToRestore.viewMode, stateToRestore.currentPlayer, stateToRestore.isBlackAI, stateToRestore.isWhiteAI));
      
      setSelectedSquare(null); 
      setPossibleMoves([]); 
      flashedCheckStateRef.current = null;
      setFlashMessage(null); 
      setKillStreakFlashMessage(null); 
      setIsPromotingPawn(false); 
      setPromotionSquare(null);
      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    }
  }, [
    historyStack, 
    isAiThinking, 
    toast, 
    currentPlayer, 
    isWhiteAI,    
    isBlackAI,    
    determineBoardOrientation,
    setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, 
    setBoardOrientation, setViewMode, setIsWhiteAI, setIsBlackAI, setSelectedSquare, setPossibleMoves,
    setFlashMessage, setKillStreakFlashMessage, setIsPromotingPawn, setPromotionSquare, setHistoryStack
  ]);

  const handleToggleViewMode = () => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
  };

  const handleToggleWhiteAI = () => {
    if (isAiThinking && currentPlayer === 'white') return;
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'Enabled' : 'Disabled'}`, duration: 1500 });
  };
  const handleToggleBlackAI = () => {
    if (isAiThinking && currentPlayer === 'black') return;
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'Enabled' : 'Disabled'}`, duration: 1500 });
  };

  // AI Turn Logic
  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);

    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn) {
      const performAiMove = async () => {
        setIsAiThinking(true);
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...`}));

        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate thinking time

        const adaptedBoardForAI = adaptBoardForAI(board);
        const gameStateForAI = {
            board: adaptedBoardForAI,
            killStreaks: killStreaks,
            currentPlayer: currentPlayer, 
            gameInfo: { 
                isCheck: gameInfo.isCheck && gameInfo.playerWithKingInCheck === currentPlayer,
                playerWithKingInCheck: gameInfo.isCheck && gameInfo.playerWithKingInCheck === currentPlayer ? currentPlayer : null,
                isCheckmate: false, 
                isStalemate: false, 
                gameOver: false, 
            }
        };

        try {
            const aiMove = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

            if (aiMove && aiMove.from && aiMove.to) {
                const aiFrom = coordsToAlgebraic(aiMove.from[0], aiMove.from[1]);
                const aiTo = coordsToAlgebraic(aiMove.to[0], aiMove.to[1]);

                const pieceOnFromSquare = board[aiMove.from[0]][aiMove.from[1]]?.piece;
                if (!pieceOnFromSquare || pieceOnFromSquare.color !== currentPlayer) {
                    console.warn(`AI Warning: AI (${getPlayerDisplayName(currentPlayer)}) tried to move an invalid piece from ${aiFrom}. Board piece:`, pieceOnFromSquare, " Intended move: ", aiMove);
                    toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI tried to move an invalid piece. Forfeiting turn.", variant: "destructive", duration: 2500 });
                    completeTurn(board, currentPlayer);
                    setIsAiThinking(false);
                    return;
                }
                
                let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null }))); 

                if (aiMove.type === 'self-destruct' && pieceOnFromSquare.type === 'knight' && pieceOnFromSquare.level >= 5) {
                    saveStateToHistory();
                    const { row: knightR, col: knightC } = aiMove.from;
                    const piecesDestroyedByAI: Piece[] = [];
                    let aiCalculatedStreak: number;

                    for (let dr = -1; dr <= 1; dr++) {
                      for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const adjR = knightR + dr;
                        const adjC = knightC + dc;
                        if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                          const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                          if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                            if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                (victimPiece.type === 'queen' && victimPiece.level >= 5 && pieceOnFromSquare.level < victimPiece.level)) {
                              continue; 
                            }
                            piecesDestroyedByAI.push({ ...victimPiece });
                            finalBoardStateForTurn[adjR][adjC].piece = null;
                          }
                        }
                      }
                    }
                    finalBoardStateForTurn[knightR][knightC].piece = null; 

                    if (piecesDestroyedByAI.length > 0) {
                        setKillStreaks(prevKillStreaks => {
                            const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
                            newStreaks[currentPlayer] = (prevKillStreaks[currentPlayer] || 0) + piecesDestroyedByAI.length;
                            aiCalculatedStreak = newStreaks[currentPlayer];
                            return newStreaks;
                        });
                        setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), ...piecesDestroyedByAI] }));
                        setLastCapturePlayer(currentPlayer);

                        if (aiCalculatedStreak >= 3) { 
                            const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                            setCapturedPieces(prevCaptured => {
                                const piecesCapturedByOpponentAI = prevCaptured[opponentColorAI];
                                if (piecesCapturedByOpponentAI && piecesCapturedByOpponentAI.length > 0) {
                                    const pieceToResOriginalAI = piecesCapturedByOpponentAI.pop(); 
                                    const emptySqAI: AlgebraicSquare[] = [];
                                    for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                                    if(emptySqAI.length > 0 && pieceToResOriginalAI){
                                        const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                        const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                        const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0};
                                        finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI;
                                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)}'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                                    }
                                    return {...prevCaptured, [opponentColorAI]: piecesCapturedByOpponentAI || []};
                                }
                                return prevCaptured;
                            });
                        }
                    } else {
                        setKillStreaks(prevKillStreaks => {
                            const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
                            newStreaks[currentPlayer] = 0;
                            aiCalculatedStreak = 0;
                            return newStreaks;
                        });
                        if (lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                    }
                    
                    setBoard(finalBoardStateForTurn);
                    completeTurn(finalBoardStateForTurn, currentPlayer);

                } else { 
                    const allPossiblePseudoMoves = getPossibleMoves(board, aiFrom); 
                    const legalMovesForAiPiece = filterLegalMoves(board, aiFrom, allPossiblePseudoMoves, currentPlayer);

                    if (!legalMovesForAiPiece.includes(aiTo)) {
                        console.warn(`AI Warning: AI (${getPlayerDisplayName(currentPlayer)}) suggested an illegal move: ${aiFrom} to ${aiTo}. Valid for ${aiFrom}: ${legalMovesForAiPiece.join(', ')} Board State:`, board);
                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI suggested an invalid move. Forfeiting turn.", variant: "destructive", duration: 2500 });
                        completeTurn(board, currentPlayer);
                        setIsAiThinking(false);
                        return;
                    }

                    saveStateToHistory();
                    const { newBoard, capturedPiece, conversionEvents } = applyMove(board, { from: aiFrom, to: aiTo });
                    finalBoardStateForTurn = newBoard; 

                    toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiFrom} to ${aiTo}`, duration: 1500});

                    let aiCalculatedStreak: number;
                    if (capturedPiece) {
                        setKillStreaks(prevKillStreaks => {
                            const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
                            newStreaks[currentPlayer] = (prevKillStreaks[currentPlayer] || 0) + 1;
                            aiCalculatedStreak = newStreaks[currentPlayer];
                            return newStreaks;
                        });
                        setLastCapturePlayer(currentPlayer);
                        setCapturedPieces(prev => ({ ...prev, [currentPlayer]: [...(prev[currentPlayer] || []), capturedPiece] }));

                        if (aiCalculatedStreak >= 3) { 
                            const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                             setCapturedPieces(prevCaptured => {
                                const piecesCapturedByOpponentAI = prevCaptured[opponentColorAI];
                                if (piecesCapturedByOpponentAI && piecesCapturedByOpponentAI.length > 0) {
                                    const pieceToResOriginalAI = piecesCapturedByOpponentAI.pop();
                                    const emptySqAI: AlgebraicSquare[] = [];
                                    for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                                    if(emptySqAI.length > 0 && pieceToResOriginalAI){
                                        const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                        const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                        const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0};
                                        finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI;
                                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)}'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                                    }
                                     return {...prevCaptured, [opponentColorAI]: piecesCapturedByOpponentAI || []};
                                }
                                return prevCaptured;
                            });
                        }
                    } else { 
                        setKillStreaks(prevKillStreaks => {
                            const newStreaks = { white: prevKillStreaks.white, black: prevKillStreaks.black };
                            newStreaks[currentPlayer] = 0;
                            aiCalculatedStreak = 0; // ensure it's defined
                            return newStreaks;
                        });
                        if (lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                    }

                    const movedPieceAfterAIMove = finalBoardStateForTurn[aiMove.to[0]][aiMove.to[1]]?.piece;
                    const promotionRow = currentPlayer === 'white' ? 0 : 7;
                    if (movedPieceAfterAIMove && movedPieceAfterAIMove.type === 'pawn' && aiMove.to[0] === promotionRow) {
                        //const pawnOriginalLevel = movedPieceAfterAIMove.level; 
                        finalBoardStateForTurn[aiMove.to[0]][aiMove.to[1]].piece = { ...movedPieceAfterAIMove, type: 'queen', level: 1, invulnerableTurnsRemaining: 0 };
                        toast({ title: "AI Pawn Promoted!", description: `${getPlayerDisplayName(currentPlayer)} pawn promoted to Queen! (L1)`, duration: 2500 });
                    }
                    setBoard(finalBoardStateForTurn);
                    completeTurn(finalBoardStateForTurn, currentPlayer);
                }
            } else { 
                 console.warn(`AI Warning: AI (${getPlayerDisplayName(currentPlayer)}) failed to select a move.`);
                 toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI failed to select a move. Forfeiting turn.", variant: "destructive", duration: 2500 });
                 completeTurn(board, currentPlayer); 
            }
        } catch (error) {
            console.warn(`AI Error for ${getPlayerDisplayName(currentPlayer)} (Caught in page.tsx):`, error instanceof Error ? error.message : String(error));
            toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI forfeited turn due to an issue.", variant: "destructive", duration: 2500 });
            completeTurn(board, currentPlayer);
        } finally {
            setIsAiThinking(false);
        }
      };
      performAiMove();
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, board, killStreaks, lastCapturePlayer, capturedPieces, saveStateToHistory, completeTurn, toast, getPlayerDisplayName, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setGameInfo, gameInfo.isCheck, gameInfo.playerWithKingInCheck, viewMode, determineBoardOrientation, setBoardOrientation]);


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {flashMessage && ( <div key={`flash-${flashMessageKey}`} className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none" aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
      {killStreakFlashMessage && ( <div key={`streak-${killStreakFlashMessageKey}`} className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none" aria-live="assertive"><div className="bg-black/50 p-4 md:p-6 rounded-md shadow-xl animate-flash-check"><p className="text-4xl sm:text-5xl md:text-6xl font-bold text-accent font-pixel text-center" style={{ textShadow: '2px 2px 0px hsl(var(--background)), -2px 2px 0px hsl(var(--background)), 2px -2px 0px hsl(var(--background)), -2px -2px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}

      <div className="w-full flex flex-col items-center mb-6 space-y-3">
        <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
            <RefreshCw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
            <BookOpen className="h-4 w-4 mr-1" /> Rules
          </Button>
          <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking} aria-label="Undo Move" className="h-8 px-2 text-xs">
            <Undo2 className="h-4 w-4 mr-1" /> Undo
          </Button>
          <Button variant="outline" onClick={handleToggleWhiteAI} disabled={isAiThinking && currentPlayer === 'white'} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
            <Bot className="h-4 w-4 mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
          </Button>
           <Button variant="outline" onClick={handleToggleBlackAI} disabled={isAiThinking && currentPlayer === 'black'} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
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

