
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
): any { // Using 'any' for AI's gameState flexibility, ensure properties align
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      return {
        id: squareState.piece.id,
        type: squareState.piece.type,
        color: squareState.piece.color,
        level: squareState.piece.level || 1,
        hasMoved: squareState.piece.hasMoved || false,
        // AI class expects 'invulnerable' boolean, derived from 'invulnerableTurnsRemaining'
        invulnerable: (squareState.piece.invulnerableTurnsRemaining || 0) > 0,
        // Pass invulnerableTurnsRemaining as well if the AI's makeMove needs to simulate its decrease
        invulnerableTurnsRemaining: squareState.piece.invulnerableTurnsRemaining || 0,
      };
    })
  );

  return {
    board: aiBoard,
    currentPlayer: currentPlayerForAI, // The player whose turn it IS in the game
    killStreaks: {
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: { // AI's makeMove might need this for resurrection logic
        white: currentCapturedPieces?.white?.map(p => ({ ...p })) || [],
        black: currentCapturedPieces?.black?.map(p => ({ ...p })) || [],
    },
    // Pass game over status if AI needs it for terminal node detection in its own isGameOver
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
  const aiInstanceRef = useRef(new VibeChessAI(2)); // Default depth 2
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
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // Both AI, default to white
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black'; // White AI, human Black -> orient for Black
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; // Black AI, human White -> orient for White

    // Human vs Human
    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; // Tabletop default
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

    if (opponentInCheck && ( (killStreaks[playerTakingExtraTurn] || 0) === 6 || (currentBoard[algebraicToCoords(promotionSquare || 'a1').row]?.[algebraicToCoords(promotionSquare || 'a1').col]?.piece?.level || 0) >=5 )) { // Auto-checkmate check
        toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
        setGameInfo({ message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn });
        return;
    }

    if (opponentInCheck) {
      setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn! Check!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: false, isStalemate: false, gameOver: false });
    } else {
      const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
      if (opponentIsStalemated) {
        setGameInfo({ message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' });
        return;
      }
      setGameInfo({ message: `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false });
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, setGameInfo, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, killStreaks, promotionSquare]);


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
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, getPlayerDisplayName, determineBoardOrientation, setGameInfo, setBoardOrientation, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);

  const processMoveEnd = useCallback((boardAfterMove: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean) => {
    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(boardAfterMove);
    const currentPositionHash = boardToPositionHash(boardAfterMove, nextPlayerForHash, castlingRights);
    
    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.gameOver) { 
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 2500 });
      setGameInfo({ 
        message: "Draw by Threefold Repetition!", 
        isCheck: false, 
        playerWithKingInCheck: null, 
        isCheckmate: false, 
        isStalemate: true, 
        isThreefoldRepetitionDraw: true,
        gameOver: true, 
        winner: 'draw' 
      });
      return; 
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, gameInfo.gameOver, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn]);


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
      if (newHistory.length > 20) return newHistory.slice(-20);
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
    
    setIsWhiteAI(false); // Toggle off AI
    setIsBlackAI(false); // Toggle off AI
    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;
    
    // Use the updated AI states for orientation
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
  }, [toast, determineBoardOrientation, setBoard, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setGameInfo, setCapturedPieces, setPositionHistory, setFlashMessage, setIsPromotingPawn, setPromotionSquare, setKillStreaks, setLastCapturePlayer, setHistoryStack, setIsWhiteAI, setIsBlackAI, setIsAiThinking, setBoardOrientation, setShowCheckFlashBackground, setCheckFlashBackgroundKey, setShowCaptureFlash, setCaptureFlashKey, setShowCheckmatePatternFlash, setCheckmatePatternFlashKey, setAnimatedSquareTo, setIsMoveProcessing ]);

  useEffect(() => {
    // Initialize position history on mount
    const initialCastlingRights = getCastlingRightsString(board); // Use current board state
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
    setPositionHistory([initialHash]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency to run once on mount. Board/currentPlayer will be initial values.

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
             flashedCheckStateRef.current = null;
        }
    }
  }, [gameInfo]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (flashMessage) {
      const duration = flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 2500 : 1500;
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
    console.log(`VIBE_DEBUG (HvsH & AI): Start of ${currentPlayer}'s turn. Clearing invulnerability for ${currentPlayer}'s Rooks if applicable.`);
    setBoard(prevBoard => {
      if (!prevBoard) return prevBoard; // Should not happen if initialized
      let boardWasModified = false;
      const boardAfterInvulnerabilityWearOff = prevBoard.map(row =>
        row.map(square => {
          if (square.piece &&
              square.piece.color === currentPlayer && // Invulnerability wears off for the player whose turn it IS NOW
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
  }, [currentPlayer, setBoard]);

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
            setLastCapturePlayer(selfDestructCapturedSomething ? selfDestructPlayer : (lastCapturePlayer === selfDestructPlayer ? null : lastCapturePlayer));

            if (calculatedNewStreakForPlayer === 3) {
                const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
                let piecesOfCurrentPlayerCapturedByOpponent = finalCapturedPiecesAfterDestruct[opponentOfSelfDestructPlayer] || [];
                if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop(); // Modifies the array in finalCapturedPiecesAfterDestruct
                    // finalCapturedPiecesAfterDestruct[opponentOfSelfDestructPlayer] is now shorter

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
            setCapturedPieces(finalCapturedPiecesAfterDestruct); // Set the modified captured pieces

            setTimeout(() => {
                setAnimatedSquareTo(null);
                setSelectedSquare(null); setPossibleMoves([]);
                setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
                const streakGrantsExtraTurn = calculatedNewStreakForPlayer === 6;
                processMoveEnd(finalBoardAfterDestruct, selfDestructPlayer, streakGrantsExtraTurn);
                setIsMoveProcessing(false);
            }, 800); // Increased from 400ms
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
            finalBoardStateForTurn = newBoard; // Board after standard move/capture
            
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
            setLastCapturePlayer(captured ? capturingPlayer : (lastCapturePlayer === capturingPlayer ? null : lastCapturePlayer));
            
            if (currentCalculatedStreakForCapturingPlayer === 3) {
                const opponentColor = capturingPlayer === 'white' ? 'black' : 'white';
                let piecesBelongingToCurrentPlayerCapturedByOpponent = finalCapturedPiecesStateForTurn[opponentColor] || [];
                if (piecesBelongingToCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesBelongingToCurrentPlayerCapturedByOpponent.pop(); // Modifies array in finalCapturedPiecesStateForTurn
                    
                    const emptySquares: AlgebraicSquare[] = [];
                    for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                    if (emptySquares.length > 0 && pieceToResurrectOriginal) {
                        const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                        const newUniqueSuffix = resurrectionIdCounter++;
                        const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResurrectOriginal.type === 'rook' ? 1 : 0, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPiece; // Modify board state for resurrection
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                }
            }

            if (conversionEvents && conversionEvents.length > 0) {
                conversionEvents.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
            }

            setBoard(finalBoardStateForTurn); // Set board after all modifications (capture, resurrection)
            setCapturedPieces(finalCapturedPiecesStateForTurn); // Set the potentially modified captured pieces

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
            }, 800); // Increased from 400ms
            return;
        }
        
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) {
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic);
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) {
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
            const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
            setPossibleMoves(legalMovesForPlayer);
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
                const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
                const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
                setPossibleMoves(legalMovesForPlayer);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else {
                setEnemySelectedSquare(algebraic);
                const enemyMoves = getPossibleMoves(board, algebraic);
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
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, killStreaks, lastCapturePlayer, capturedPieces, saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, isAiThinking, filterLegalMoves, setIsMoveProcessing, setAnimatedSquareTo, setBoard, setCapturedPieces, setShowCaptureFlash, setCaptureFlashKey, setKillStreaks, setLastCapturePlayer, setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);


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
    }, 800); // Increased from 400ms
  }, [ board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processMoveEnd, isMoveProcessing, setAnimatedSquareTo, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves ]);

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
      setPositionHistory(stateToRestore.positionHistory || []);

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
  }, [ historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPositionHistory, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage, setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn, setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack ]);

  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [setViewMode, setBoardOrientation, determineBoardOrientation, currentPlayer, isBlackAI, isWhiteAI, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves ]);

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
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing) return;

    setIsAiThinking(true);
    setIsMoveProcessing(true); // Also disable board interaction during AI thinking & processing
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...`}));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    aiErrorOccurredRef.current = false;

    await new Promise(resolve => setTimeout(resolve, 250)); // Brief delay for UI update

    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
        white: [...(capturedPieces.white || [])],
        black: [...(capturedPieces.black || [])]
    };
    
    let aiMoveDataFromAI: AIMove | null = null;

    try {
        const gameStateForAI = adaptBoardForAI(finalBoardStateForTurn, currentPlayer, killStreaks, finalCapturedPiecesStateForTurn);
        // The AI's getBestMove now expects a gameState format that includes 'invulnerable' boolean.
        // 'adaptBoardForAI' should be providing this derived from 'invulnerableTurnsRemaining'.
        aiMoveDataFromAI = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

        if (!aiMoveDataFromAI || !Array.isArray(aiMoveDataFromAI.from) || aiMoveDataFromAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromAI.to) || aiMoveDataFromAI.to.length !== 2) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI failed to select a valid move structure. Raw move:`, aiMoveDataFromAI);
            throw new Error("AI returned invalid move structure.");
        }
        
        const aiFromAlg = coordsToAlgebraic(aiMoveDataFromAI.from[0], aiMoveDataFromAI.from[1]);
        const aiToAlg = coordsToAlgebraic(aiMoveDataFromAI.to[0], aiMoveDataFromAI.to[1]);
        
        const pieceDataAtFrom = finalBoardStateForTurn[aiMoveDataFromAI.from[0]]?.[aiMoveDataFromAI.from[1]];
        const pieceOnFromSquare = pieceDataAtFrom?.piece;
        
        if (!pieceOnFromSquare || pieceOnFromSquare.color !== currentPlayer) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquare, " Intended move: ", aiMoveDataFromAI);
            throw new Error("AI chose an invalid piece to move.");
        }
        
        // Use main game's utils to validate AI move against the current real board state
        const pseudoPossibleMovesForAiPiece = getPossibleMoves(finalBoardStateForTurn, aiFromAlg);
        const legalMovesForAiPieceOnBoard = filterLegalMoves(finalBoardStateForTurn, aiFromAlg, pseudoPossibleMovesForAiPiece, currentPlayer);

        let isAiMoveActuallyLegal = false;
        const aiMoveType = aiMoveDataFromAI.type || 'move'; // Default to 'move' if type undefined

        if (aiMoveType === 'self-destruct' && pieceOnFromSquare.type === 'knight' && (pieceOnFromSquare.level || 1) >= 5) {
            if (aiFromAlg === aiToAlg) { // For self-destruct, from and to can be the same
                 isAiMoveActuallyLegal = true;
            } else {
                 console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
                 throw new Error("AI self-destruct move validation failed (from/to mismatch).");
            }
        } else {
            isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
        }

        if (!isAiMoveActuallyLegal) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Valid moves for piece by main game logic: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveType}`);
            throw new Error("AI suggested an objectively illegal move according to main game rules.");
        }
        
        // Use main game's applyMove for consistent rule application
        const moveForApplyMove: Move = { 
            from: aiFromAlg, 
            to: aiToAlg, 
            type: aiMoveType as Move['type'], // Cast because AI's type might be broader
            promoteTo: aiMoveDataFromAI.promoteTo as PieceType | undefined
        };

        saveStateToHistory();
        setAnimatedSquareTo(aiToAlg);
        
        let aiMoveCapturedSomething = false;
        let currentCalculatedStreakForAIPlayer = killStreaks[currentPlayer] || 0;
        let capturedByAIThisTurn: Piece[] = []; // For self-destruct potentially capturing multiple

        if (moveForApplyMove.type === 'self-destruct') {
            const { row: knightR, col: knightC } = algebraicToCoords(moveForApplyMove.from);
            
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR = knightR + dr;
                const adjC = knightC + dc;
                if (adjR >= 0 && adjR < 8 && adjC >=0 && adjC < 8 ) {
                  const victimPiece = finalBoardStateForTurn[adjR][adjC].piece;
                  if (victimPiece && victimPiece.color !== currentPlayer && victimPiece.type !== 'king') {
                     // Use game's invulnerability check
                    if (isPieceInvulnerable(victimPiece, pieceOnFromSquare)) { 
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
            finalBoardStateForTurn[knightR][knightC].piece = null; // Remove the Knight
            toast({ title: `AI ${getPlayerDisplayName(currentPlayer)} Knight Self-Destructs!`, description: `${capturedByAIThisTurn.length} pieces obliterated.`, duration: 2500});
            currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + (aiMoveCapturedSomething ? capturedByAIThisTurn.length : 0);

        } else { // Regular move, capture, promotion, swap, castle handled by applyMove
            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, moveForApplyMove);
            finalBoardStateForTurn = newBoard; // Update board after applyMove
            
            toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMove.from} to ${moveForApplyMove.to}`, duration: 1500});

            if (captured) {
                aiMoveCapturedSomething = true;
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
                finalCapturedPiecesStateForTurn[currentPlayer].push(captured);
                currentCalculatedStreakForAIPlayer = (killStreaks[currentPlayer] || 0) + 1;
            } else {
                currentCalculatedStreakForAIPlayer = 0; // Reset streak if no capture
            }
            if (conversionEvents && conversionEvents.length > 0) {
                conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
            }
        }
        
        setKillStreaks(prevKillStreaks => {
            const newStreaks = {
                white: prevKillStreaks.white,
                black: prevKillStreaks.black
              };
            newStreaks[currentPlayer] = currentCalculatedStreakForAIPlayer;
            newStreaks[currentPlayer === 'white' ? 'black' : 'white'] = aiMoveCapturedSomething ? 0 : prevKillStreaks[currentPlayer === 'white' ? 'black' : 'white'];
            return newStreaks;
        });
        setLastCapturePlayer(aiMoveCapturedSomething ? currentPlayer : (lastCapturePlayer === currentPlayer ? null : lastCapturePlayer));
        
        if (currentCalculatedStreakForAIPlayer === 3) { // Check streak *after* it's updated
            const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
            let piecesOfAICapturedByOpponent = finalCapturedPiecesStateForTurn[opponentColorAI] || [];
             if (piecesOfAICapturedByOpponent.length > 0) {
                const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop(); // Modifies array
                
                const emptySqAI: AlgebraicSquare[] = [];
                for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForTurn[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                if(emptySqAI.length > 0 && pieceToResOriginalAI){
                    const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                    const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                    const newUniqueSuffixAI = resurrectionIdCounter++;
                    const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, invulnerableTurnsRemaining: pieceToResOriginalAI.type === 'rook' ? 1:0, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                    finalBoardStateForTurn[resRAI][resCAI].piece = resurrectedAI; // Modify board for resurrection
                    toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                }
            }
        }
        
        setBoard(finalBoardStateForTurn); // Set board state after all modifications
        setCapturedPieces(finalCapturedPiecesStateForTurn); // Set captured pieces state
        
        setTimeout(() => {
            setAnimatedSquareTo(null);
            const pieceAtDestination = finalBoardStateForTurn[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;
            const promotionRowAI = currentPlayer === 'white' ? 0 : 7;
            
            const isAIPawnPromoting = pieceAtDestination &&
                                      pieceAtDestination.type === 'pawn' && 
                                      algebraicToCoords(aiToAlg).row === promotionRowAI &&
                                      moveForApplyMove.type !== 'self-destruct'; // Self-destruct shouldn't promote
            
            if (isAIPawnPromoting) {
                const promotedTypeAI = moveForApplyMove.promoteTo || 'queen'; // AI defaults to Queen
                const originalPawnForAIPromo = finalBoardStateForTurn[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;

                if (originalPawnForAIPromo && originalPawnForAIPromo.type === 'pawn') {
                    const originalPawnLevelForAIPromo = originalPawnForAIPromo.level || 1;
                    const finalBoardAfterAIPromotion = finalBoardStateForTurn.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                    finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece = {
                        ...(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece as Piece),
                        type: promotedTypeAI,
                        level: 1, // Reset level
                        invulnerableTurnsRemaining: promotedTypeAI === 'rook' ? 1 : 0,
                        id: `${(finalBoardAfterAIPromotion[algebraicToCoords(aiToAlg).row][algebraicToCoords(aiToAlg).col].piece as Piece).id}_promo_${promotedTypeAI}_ai`,
                        hasMoved: true,
                    };
                    setBoard(finalBoardAfterAIPromotion); // Update board with promoted piece
                    toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });

                    const aiPawnLevelExtraTurn = originalPawnLevelForAIPromo >= 5;
                    const aiStreakExtraTurn = currentCalculatedStreakForAIPlayer === 6;
                    processMoveEnd(finalBoardAfterAIPromotion, currentPlayer, aiStreakExtraTurn || aiPawnLevelExtraTurn);
                } else {
                     // Should not happen if isAIPawnPromoting is true, but as a fallback:
                    processMoveEnd(finalBoardStateForTurn, currentPlayer, currentCalculatedStreakForAIPlayer === 6);
                }
            } else {
                const aiStreakExtraTurn = currentCalculatedStreakForAIPlayer === 6;
                processMoveEnd(finalBoardStateForTurn, currentPlayer, aiStreakExtraTurn);
            }
            setIsAiThinking(false);
            setIsMoveProcessing(false);
        }, 800); // Delay for animation

    } catch (error) {
        console.error(`AI (${getPlayerDisplayName(currentPlayer)}) Error in performAiMove:`, error);
        toast({
            title: `AI (${getPlayerDisplayName(currentPlayer)}) Error`,
            description: "AI move forfeited. AI turned off for this player.",
            variant: "destructive",
            duration: 2500,
        });
        aiErrorOccurredRef.current = true;
        
        // Toggle off the AI that erred
        if (currentPlayer === 'white') setIsWhiteAI(false);
        if (currentPlayer === 'black') setIsBlackAI(false);
        
        setIsAiThinking(false);
        setIsMoveProcessing(false);

        // Defer completeTurn to ensure state updates for AI toggles are processed
        setTimeout(() => {
             completeTurn(board, currentPlayer); // Use the board state before AI's attempt
        }, 0);
    }
  }, [
      board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing,
      isWhiteAI, isBlackAI, 
      killStreaks, capturedPieces, lastCapturePlayer,
      saveStateToHistory, toast, getPlayerDisplayName,
      processMoveEnd, filterLegalMoves, 
      completeTurn,
      aiInstanceRef, setBoard, setCapturedPieces, setGameInfo, setKillStreaks, setLastCapturePlayer,
      setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
      setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo, setShowCaptureFlash, setCaptureFlashKey
    ]
  );

  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !aiErrorOccurredRef.current) {
       performAiMove();
    } else if (aiErrorOccurredRef.current && !isAiThinking && !isMoveProcessing) { // Reset error flag after AI has stopped thinking/processing
        aiErrorOccurredRef.current = false;
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove]);

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center relative">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center bg-background">
        {flashMessage && ( <div key={flashMessageKey} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 'animate-flash-checkmate' : 'animate-flash-check' }`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}

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
