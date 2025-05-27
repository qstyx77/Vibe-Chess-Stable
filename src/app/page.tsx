
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
  boardToPositionHash, // Added
  getCastlingRightsString, // Added
  type ConversionEvent,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState } from '@/types'; // Removed AIGameState
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Bot } from 'lucide-react';
import VibeChessAI from '@/ai/vibe-chess-ai';


let resurrectionIdCounter = 0;

const initialGameStatus: GameStatus = {
  message: "\u00A0", 
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
): any { // Changed AIGameState to any for flexibility with AI class
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      return {
        id: squareState.piece.id,
        type: squareState.piece.type,
        color: squareState.piece.color,
        level: squareState.piece.level || 1,
        hasMoved: squareState.piece.hasMoved || false,
        // Pass invulnerableTurnsRemaining directly, AI class can interpret
        invulnerableTurnsRemaining: squareState.piece.invulnerableTurnsRemaining || 0,
      };
    })
  );

  return {
    board: aiBoard,
    currentPlayer: currentPlayerForAI,
    killStreaks: { 
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: { 
      white: currentCapturedPieces?.white.map(p => ({ ...p })) || [],
      black: currentCapturedPieces?.black.map(p => ({ ...p })) || [],
    },
    // Ensure these are passed as AI might use them in its own isGameOver
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
  const [positionHistory, setPositionHistory] = useState<string[]>([]); // Added

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

    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; 
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
      positionHistory: [...positionHistory], // Added
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); 
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory]); // Added positionHistory

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  }, [isWhiteAI, isBlackAI]);

  const resetGame = useCallback(() => {
    resurrectionIdCounter = 0;
    const initialBoard = initializeBoard();
    setBoard(initialBoard);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameInfo(initialGameStatus);
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });
    
    const initialCastlingRights = getCastlingRightsString(initialBoard);
    const initialHash = boardToPositionHash(initialBoard, 'white', initialCastlingRights);
    setPositionHistory([initialHash]); // Initialize with starting position
    
    setFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setIsWhiteAI(false);
    setIsBlackAI(false);
    setIsAiThinking(false);
    
    const initialOrientation = determineBoardOrientation('flipping', 'white', false, false);
    setViewMode('flipping'); 
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
  }, []); // Run only once on mount to set initial position hash

  useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver && gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = 'checkmate';
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    }

    if (currentCheckStateString) {
      if (flashedCheckStateRef.current !== currentCheckStateString) {
        if (gameInfo.isCheckmate) {
          setFlashMessage('CHECKMATE!');
          setShowCheckmatePatternFlash(true);
          setCheckmatePatternFlashKey(k => k + 1);
        } else { 
          setFlashMessage('CHECK!');
          setShowCheckFlashBackground(true);
          setCheckFlashBackgroundKey(k => k + 1);
        }
        setFlashMessageKey(k => k + 1); 
        flashedCheckStateRef.current = currentCheckStateString;
      }
    } else {
        if (flashedCheckStateRef.current) {
             flashedCheckStateRef.current = null;
        }
    }
  }, [gameInfo]); 

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
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCaptureFlash) {
      timerId = setTimeout(() => {
        setShowCaptureFlash(false);
      }, 2250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCaptureFlash, captureFlashKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);

  useEffect(() => {
    setBoard(prevBoard => {
      if (!prevBoard) return prevBoard; 
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

  const processMoveEnd = useCallback((boardAfterMove: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean) => {
    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(boardAfterMove);
    const currentPositionHash = boardToPositionHash(boardAfterMove, nextPlayerForHash, castlingRights);
    
    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3) {
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 3000 });
      setGameInfo({ 
        message: "Draw by Threefold Repetition!", 
        isCheck: false, 
        playerWithKingInCheck: null, 
        isCheckmate: false, 
        isStalemate: true, // Treat as a form of stalemate for game over
        isThreefoldRepetitionDraw: true,
        gameOver: true, 
        winner: 'draw' 
      });
      return; // End turn processing
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, setGameInfoBasedOnExtraTurn, completeTurn]); // Added dependencies

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

    if (opponentInCheck) { 
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
      setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn });
      return;
    }

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
      setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
      return;
    }
    
    setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
  }, [toast, determineBoardOrientation, viewMode, isBlackAI, isWhiteAI, getPlayerDisplayName, boardOrientation, setBoardOrientation, setGameInfo, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


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
            setAnimatedSquareTo(algebraic); 

            let finalBoardAfterDestruct = currentBoardForClick.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            let finalCapturedPiecesAfterDestruct = {
              white: [...(capturedPieces.white || [])],
              black: [...(capturedPieces.black || [])]
            };
            const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);
            const piecesDestroyed: Piece[] = [];
            const selfDestructPlayer = currentPlayer;
            let calculatedNewStreakForPlayer: number;
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
                calculatedNewStreakForPlayer = (killStreaks[selfDestructPlayer] || 0) + piecesDestroyed.length;
            } else { 
                calculatedNewStreakForPlayer = 0; 
            }

            setKillStreaks(prevKillStreaks => {
              const newStreaks = { 
                white: prevKillStreaks.white, 
                black: prevKillStreaks.black 
              };
              newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
              newStreaks[selfDestructPlayer === 'white' ? 'black' : 'white'] = selfDestructCapturedSomething ? 0 : prevKillStreaks[selfDestructPlayer === 'white' ? 'black' : 'white'];
              return newStreaks;
            });
            setLastCapturePlayer(selfDestructCapturedSomething ? selfDestructPlayer : null);


            if (calculatedNewStreakForPlayer === 3) { // Only at 3
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
                const streakGrantsExtraTurn = calculatedNewStreakForPlayer === 6; 
                processMoveEnd(finalBoardAfterDestruct, selfDestructPlayer, streakGrantsExtraTurn);
                setIsMoveProcessing(false);
            }, 800);
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
            
            const capturingPlayer = currentPlayer;
            let currentCalculatedStreakForCapturingPlayer: number;

            if (captured) {
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
                currentCalculatedStreakForCapturingPlayer = (killStreaks[capturingPlayer] || 0) + 1;
            } else { 
                currentCalculatedStreakForCapturingPlayer = 0; 
            }

            setKillStreaks(prevKillStreaks => {
              const newStreaks = { 
                white: prevKillStreaks.white, 
                black: prevKillStreaks.black 
              };
              newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
              newStreaks[capturingPlayer === 'white' ? 'black' : 'white'] = captured ? 0 : prevKillStreaks[capturingPlayer === 'white' ? 'black' : 'white'];
              return newStreaks;
            });
            setLastCapturePlayer(captured ? capturingPlayer : null);
            

            if (currentCalculatedStreakForCapturingPlayer === 3) { // Only at 3
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
            }, 800);
            return;
        }
        
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) {
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic, clickedPiece.color); 
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) {
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic, currentPlayer); 
            setPossibleMoves(pseudoPossibleMoves); // filterLegalMoves is implicitly done by getPossibleMoves now
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else { 
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }

    } else { 
        if (clickedPiece) {
            if (clickedPiece.color === currentPlayer) {
                setSelectedSquare(algebraic);
                const pseudoPossibleMoves = getPossibleMoves(board, algebraic, currentPlayer);
                setPossibleMoves(pseudoPossibleMoves);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else { 
                setEnemySelectedSquare(algebraic);
                const enemyMoves = getPossibleMoves(board, algebraic, clickedPiece.color);
                setEnemyPossibleMoves(enemyMoves);
                setSelectedSquare(null);
                setPossibleMoves([]);
            }
        } else { 
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
    }
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, killStreaks, lastCapturePlayer, capturedPieces, saveStateToHistory, processMoveEnd, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPossibleMoves, setSelectedSquare, determineBoardOrientation, viewMode, isWhiteAI, isBlackAI, isAiThinking, setEnemySelectedSquare, setEnemyPossibleMoves, toast, setAnimatedSquareTo, setIsMoveProcessing, boardOrientation ]);


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
        level: 1, 
        invulnerableTurnsRemaining: pieceType === 'rook' ? 1 : 0, 
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
    }, 800);
  }, [ board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, setIsPromotingPawn, setPromotionSquare, setBoard, processMoveEnd, setEnemyPossibleMoves, setEnemySelectedSquare, isMoveProcessing, setAnimatedSquareTo ]);

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
    const playerWhoMadeTheActualLastMove = playerWhoseTurnItIsNow === 'white' ? 'black' : 'white';

    let aiMadeTheActualLastMove = false;
    if (playerWhoMadeTheActualLastMove === 'white' && isWhiteAI) aiMadeTheActualLastMove = true;
    else if (playerWhoMadeTheActualLastMove === 'black' && isBlackAI) aiMadeTheActualLastMove = true;

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
      setPositionHistory(stateToRestore.positionHistory || []); // Restore position history

      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation(stateToRestore.viewMode, stateToRestore.currentPlayer, stateToRestore.isBlackAI, stateToRestore.isWhiteAI)); 

      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(stateToRestore.enemySelectedSquare || null);
      setEnemyPossibleMoves(stateToRestore.enemyPossibleMoves || []);

      flashedCheckStateRef.current = null; 
      setFlashMessage(null);
      setShowCheckFlashBackground(false);
      setShowCaptureFlash(false);
      setShowCheckmatePatternFlash(false);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false); 
      setHistoryStack(newHistoryStack);
      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    }
  }, [ historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPositionHistory, setBoardOrientation, setViewMode, setIsWhiteAI, setIsBlackAI, setSelectedSquare, setPossibleMoves, setFlashMessage, setIsPromotingPawn, setPromotionSquare, setHistoryStack, setEnemyPossibleMoves, setEnemySelectedSquare, isMoveProcessing, setAnimatedSquareTo, setShowCaptureFlash, setShowCheckFlashBackground, setShowCheckmatePatternFlash ]);

  const handleToggleViewMode = () => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]); 
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };

  const handleToggleWhiteAI = () => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing) return; 
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };
  const handleToggleBlackAI = () => {
    if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing) return; 
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  };

  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);

    const performAiMove = async () => {
        setIsAiThinking(true);
        setIsMoveProcessing(true);
        setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} is thinking...`}));
        setSelectedSquare(null); setPossibleMoves([]);
        setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

        await new Promise(resolve => setTimeout(resolve, 250)); 

        let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
        let finalCapturedPiecesStateForTurn = {
            white: [...(capturedPieces.white || [])],
            black: [...(capturedPieces.black || [])]
        };
        let currentCalculatedStreakForAIPlayer = killStreaks[currentPlayer] || 0; 
        let aiErrorOccurred = false;
        let aiMove: Move | null = null;

        try {
            const gameStateForAI = adaptBoardForAI(finalBoardStateForTurn, currentPlayer, killStreaks, capturedPieces);
            const rawAiMove = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

            if (!rawAiMove || !Array.isArray(rawAiMove.from) || rawAiMove.from.length !== 2 ||
                !Array.isArray(rawAiMove.to) || rawAiMove.to.length !== 2) {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Error: AI failed to select a valid move structure. Raw move:`, rawAiMove);
                aiErrorOccurred = true;
            } else {
                aiMove = {
                    from: coordsToAlgebraic(rawAiMove.from[0], rawAiMove.from[1]),
                    to: coordsToAlgebraic(rawAiMove.to[0], rawAiMove.to[1]),
                    type: rawAiMove.type || 'move', // Default to 'move' if AI doesn't specify
                    promoteTo: rawAiMove.promoteTo
                };
                
                const pieceDataAtFrom = finalBoardStateForTurn[rawAiMove.from[0]]?.[rawAiMove.from[1]];
                const pieceOnFromSquare = pieceDataAtFrom?.piece;
                
                if (!pieceOnFromSquare || pieceOnFromSquare.color !== currentPlayer) {
                    console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Error: AI tried to move an invalid piece from ${aiMove.from}. Board piece:`, pieceOnFromSquare, " Intended move: ", aiMove);
                    aiErrorOccurred = true;
                } else {
                    const legalMovesForAiPieceOnBoard = getPossibleMoves(finalBoardStateForTurn, aiMove.from, currentPlayer);

                    let isAiMoveActuallyLegal = false;
                    if (aiMove.type === 'self-destruct' && pieceOnFromSquare.type === 'knight' && (pieceOnFromSquare.level || 1) >= 5) {
                        if (aiMove.from === aiMove.to) {
                             isAiMoveActuallyLegal = true; 
                        } else {
                             console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiMove.from} to ${aiMove.to}.`);
                             aiErrorOccurred = true;
                        }
                    } else {
                        isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiMove.to);
                    }


                    if (isAiMoveActuallyLegal) {
                        saveStateToHistory(); 
                        setAnimatedSquareTo(aiMove.to); 
                        let capturedByAI: Piece | null = null;
                        let conversionEventsByAI: ConversionEvent[] = [];
                        let aiMoveCapturedSomething = false;

                        if (aiMove.type === 'self-destruct') {
                            const { row: knightR, col: knightC } = algebraicToCoords(aiMove.from);
                            const piecesDestroyedByAI: Piece[] = [];

                            for (let dr = -1; dr <= 1; dr++) {
                              for (let dc = -1; dc <= 1; dc++) {
                                if (dr === 0 && dc === 0) continue;
                                const adjR = knightR + dr;
                                const adjC = knightC + dc;
                                if (adjR >= 0 && adjR < 8 && adjC >=0 && adjC < 8 ) {
                                  const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                                  if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                                    if ((victimPiece.type === 'rook' && victimPiece.invulnerableTurnsRemaining && victimPiece.invulnerableTurnsRemaining > 0) ||
                                        (victimPiece.type === 'queen' && (victimPiece.level || 1) >= 5 && (pieceOnFromSquare.level || 1) < (victimPiece.level || 1))) {
                                      continue; 
                                    }
                                    piecesDestroyedByAI.push({ ...victimPiece });
                                    finalCapturedPiecesStateForTurn[currentPlayer].push({ ...victimPiece }); 
                                    finalBoardStateForTurn[adjR][adjC].piece = null;
                                    aiMoveCapturedSomething = true;
                                  }
                                }
                              }
                            }
                            finalBoardStateForTurn[knightR][knightC].piece = null; 
                            toast({ title: `AI ${getPlayerDisplayName(currentPlayer)} Knight Self-Destructs!`, description: `${piecesDestroyedByAI.length} pieces obliterated.`, duration: 2500});
                            currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + (aiMoveCapturedSomething ? piecesDestroyedByAI.length : 0);

                        } else { 
                            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, aiMove);
                            finalBoardStateForTurn = newBoard; 
                            capturedByAI = captured;
                            conversionEventsByAI = conversionEvents || [];
                            toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiMove.from} to ${aiMove.to}`, duration: 1500});

                            if (capturedByAI) {
                                aiMoveCapturedSomething = true;
                                setShowCaptureFlash(true);
                                setCaptureFlashKey(k => k + 1);
                                finalCapturedPiecesStateForTurn[currentPlayer].push(capturedByAI); 
                                currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + 1;
                            } else {
                                currentCalculatedStreakForAIPlayer = 0;
                            }
                             if (conversionEventsByAI && conversionEventsByAI.length > 0) {
                                conversionEventsByAI.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
                            }
                        }

                        setBoard(finalBoardStateForTurn); 

                        setKillStreaks(prevKillStreaks => {
                            const newStreaks = { 
                                white: prevKillStreaks.white,
                                black: prevKillStreaks.black,
                            };
                            newStreaks[currentPlayer] = currentCalculatedStreakForAIPlayer;
                            newStreaks[currentPlayer === 'white' ? 'black' : 'white'] = aiMoveCapturedSomething ? 0 : prevKillStreaks[currentPlayer === 'white' ? 'black' : 'white'];
                            return newStreaks;
                        });
                        setLastCapturePlayer(aiMoveCapturedSomething ? currentPlayer : null);


                        if (currentCalculatedStreakForAIPlayer === 3) {
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
                                    setBoard(finalBoardStateForTurn); 
                                    toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                                }
                            }
                        }
                        setCapturedPieces(finalCapturedPiecesStateForTurn); 
                    } else { 
                        console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested an illegal move: ${aiMove.from} to ${aiMove.to}. Valid moves for piece: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMove.type}`);
                        aiErrorOccurred = true;
                    }
                }
            }
        } catch (error) { 
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`AI Error for ${getPlayerDisplayName(currentPlayer)} (Caught in performAiMove try-catch): ${errorMessage}`, error);
            aiErrorOccurred = true;
        }

        setTimeout(() => {
            setAnimatedSquareTo(null); 
            if (aiErrorOccurred) {
                toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`, description: "AI move forfeited.", variant: "destructive", duration: 2500 });
                setIsWhiteAI(prev => currentPlayer === 'white' ? false : prev);
                setIsBlackAI(prev => currentPlayer === 'black' ? false : prev);
                
                 setTimeout(() => { 
                  processMoveEnd(board, currentPlayer, false); // Pass original board, AI forfeits
                }, 0);

            } else if (aiMove) { 
                const { row: toRow, col: toCol } = algebraicToCoords(aiMove.to);
                const pieceAtDestination = finalBoardStateForTurn[toRow][toCol]?.piece;
                const promotionRowAI = currentPlayer === 'white' ? 0 : 7;
                const isAIPawnPromoting = pieceAtDestination &&
                                          pieceAtDestination.type === 'pawn' && 
                                          toRow === promotionRowAI &&
                                          aiMove.type !== 'self-destruct'; 
                
                if (isAIPawnPromoting) {
                    const promotedTypeAI = aiMove.promoteTo || 'queen'; 
                    
                    const originalPawnForAIPromo = gameStateForAI.board[algebraicToCoords(aiMove.from).row][algebraicToCoords(aiMove.from).col];

                    finalBoardStateForTurn[toRow][toCol].piece = {
                        ...(pieceAtDestination as Piece), 
                        type: promotedTypeAI,
                        level: 1,
                        invulnerableTurnsRemaining: promotedTypeAI === 'rook' ? 1 : 0,
                        id: `${(pieceAtDestination as Piece).id}_promo_${promotedTypeAI}_ai`,
                        hasMoved: true,
                    };
                    setBoard(finalBoardStateForTurn); 
                    toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });

                    const aiPawnLevelForExtraTurn = originalPawnForAIPromo?.level || 1;
                    const aiStreakExtraTurn = currentCalculatedStreakForAIPlayer === 6; 
                    const aiPawnLevelExtraTurn = aiPawnLevelForExtraTurn >= 5;
                    
                    processMoveEnd(finalBoardStateForTurn, currentPlayer, aiStreakExtraTurn || aiPawnLevelExtraTurn);

                } else { 
                    const aiStreakExtraTurn = currentCalculatedStreakForAIPlayer === 6; 
                    processMoveEnd(finalBoardStateForTurn, currentPlayer, aiStreakExtraTurn);
                }
            }
            setIsAiThinking(false);
            setIsMoveProcessing(false); 
        }, 800); 
      };

      if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing) {
         performAiMove();
      }
  }, [
    currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, 
    isAiThinking, isPromotingPawn, board, killStreaks, lastCapturePlayer, capturedPieces,
    saveStateToHistory, toast, getPlayerDisplayName, setBoard, setCapturedPieces,
    setKillStreaks, setLastCapturePlayer, setGameInfo, viewMode, determineBoardOrientation,
    setBoardOrientation, processMoveEnd, setSelectedSquare, setPossibleMoves,
    setEnemySelectedSquare, setEnemyPossibleMoves, setIsWhiteAI, setIsBlackAI, setIsAiThinking,
    setAnimatedSquareTo, setIsMoveProcessing, setShowCaptureFlash, setCaptureFlashKey, aiInstanceRef, boardOrientation,
    setGameInfoBasedOnExtraTurn, completeTurn, gameInfo.message, gameInfo.playerWithKingInCheck, gameInfo.isCheck, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.winner
  ]);

  const mainContentRef = useRef<HTMLDivElement>(null);
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn || isAiThinking;


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center relative">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center bg-background">
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

