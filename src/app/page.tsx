'use client';

import type { ReactNode } from 'react';
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
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState, ConversionEvent } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen, Undo2, View, Bot } from 'lucide-react';
import VibeChessAI from '@/ai/vibe-chess-ai'; // Using Minimax AI

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

function adaptBoardForAI(
  mainBoard: BoardState,
  currentPlayerForAI: PlayerColor,
  currentKillStreaks: { white: number; black: number },
  currentCapturedPieces: { white: Piece[]; black: Piece[] } 
): any { // AIGameState equivalent
  const aiBoard = mainBoard.map(row =>
    row.map(squareState => {
      if (!squareState.piece) return null;
      const pieceForAI: any = { 
        ...squareState.piece,
        // AI uses invulnerableTurnsRemaining directly now for Rooks
        invulnerableTurnsRemaining: squareState.piece.invulnerableTurnsRemaining 
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
    gameOver: false, 
    winner: undefined,
    // Ensure other fields the AI expects are present, e.g. castling rights if AI uses them
    // castlingRights: getCastlingRightsString(mainBoard), // Example
  };
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({...initialGameStatus});
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [positionHistory, setPositionHistory] = useState<string[]>([]);

  const [enemySelectedSquare, setEnemySelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [enemyPossibleMoves, setEnemyPossibleMoves] = useState<AlgebraicSquare[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('flipping');
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white');

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  const flashedCheckStateRef = useRef<string | null>(null);

  const [killStreakFlashMessage, setKillStreakFlashMessage] = useState<string | null>(null);
  const [killStreakFlashMessageKey, setKillStreakFlashMessageKey] = useState<number>(0);

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

  // AI States
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef(new VibeChessAI(2)); // Default depth, can be configurable
  const aiErrorOccurredRef = useRef(false);

  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);

  // Pawn Sacrifice States
  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);
  
  // Rook Sacrifice States (Removed as per last request, kept for potential re-integration if needed)
  // const [isAwaitingRookSacrifice, setIsAwaitingRookSacrifice] = useState(false);
  // const [playerToSacrificeForRook, setPlayerToSacrificeForRook] = useState<PlayerColor | null>(null);
  // const [rookToMakeInvulnerable, setRookToMakeInvulnerable] = useState<AlgebraicSquare | null>(null);
  // const [boardForRookSacrifice, setBoardForRookSacrifice] = useState<BoardState | null>(null);
  // const [originalTurnPlayerForRookSacrifice, setOriginalTurnPlayerForRookSacrifice] = useState<PlayerColor | null>(null);
  // const [isExtraTurnFromRookLevelUp, setIsExtraTurnFromRookLevelUp] = useState(false);

  const { toast } = useToast();
  const mainContentRef = useRef<HTMLDivElement>(null);
  
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn; // Removed isAiThinking


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
    if (whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; 
    if (whiteIsCurrentlyAI && !blackIsCurrentlyAI) return 'black'; 
    if (!whiteIsCurrentlyAI && blackIsCurrentlyAI) return 'white'; 

    if (currentViewMode === 'flipping') return playerForTurn;
    return 'white'; 
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
    
    // Check for auto-checkmate if opponent is in check during an extra turn
    if (opponentInCheck) {
        toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, duration: 2500 });
        setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn }));
        return;
    }
    
    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;
    if (opponentInCheck) { // This condition might be unreachable due to auto-checkmate above
      message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn! Check!`;
    }
    
    const opponentIsStalemated = isStalemate(currentBoard, opponentColor);
    if (opponentIsStalemated) {
        setGameInfo(prev => ({ ...prev, message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
    } else {
        setGameInfo(prev => ({ ...prev, message, isCheck: opponentInCheck, playerWithKingInCheck: opponentInCheck ? opponentColor : null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [viewMode, isBlackAI, isWhiteAI, boardOrientation, toast, getPlayerDisplayName, determineBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setBoardOrientation, setGameInfo]);

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
    let currentMessage = "\u00A0"; // Default empty message

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        currentMessage = `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded }));
      } else {
        currentMessage = "Check!";
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
      } else {
        // Regular turn, no check or stalemate
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
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

    if (repetitionCount >= 3 && !gameInfo.isCheckmate && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) { 
      toast({ title: "Draw!", description: "Draw by Threefold Repetition.", duration: 2500 });
      setGameInfo(prev => ({ 
        ...prev,
        message: "Draw by Threefold Repetition!",
        isCheck: false, 
        playerWithKingInCheck: null,
        isCheckmate: false,
        isStalemate: true, 
        isThreefoldRepetitionDraw: true,
        gameOver: true,
        winner: 'draw',
      }));
      return; 
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(boardAfterMove, playerWhoseTurnCompleted);
    } else {
      completeTurn(boardAfterMove, playerWhoseTurnCompleted);
    }
  }, [positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn]);
  
  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState, 
    playerWhoseQueenLeveled: PlayerColor, 
    queenMovedWithThis: Move | null, // This is the move object of the Queen
    originalQueenLevelIfKnown: number | undefined, // Queen's level BEFORE this move
    isExtraTurnFromOriginalMove: boolean
  ): boolean => { 
    // console.log(`ROOK_SAC_DEBUG: processRookSacrificeCheck called for ${playerWhosePieceLeveled}'s ${pieceThatLeveledUp?.type} L${pieceThatLeveledUp?.level} (was L${originalLevelOfPiece})`);
    // This console log was for Rook, keeping it commented out.

    if (!queenMovedWithThis) {
      console.log("SAC_DEBUG: No queen move data, cannot process sacrifice.");
      processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
      return false; 
    }
    
    const {row: toR, col: toC} = algebraicToCoords(queenMovedWithThis.to);
    const queenAfterLeveling = boardAfterPrimaryMove[toR]?.[toC]?.piece;
    
    console.log("SAC_DEBUG: Checking sacrifice. Queen on board after move: ", queenAfterLeveling);
    const originalLevel = originalQueenLevelIfKnown === undefined ? 0 : originalQueenLevelIfKnown; // Ensure originalLevel is a number
    console.log("SAC_DEBUG: Original Level (derived): ", originalLevel);


    const conditionMet = queenAfterLeveling &&
                         queenAfterLeveling.type === 'queen' &&
                         queenAfterLeveling.color === playerWhoseQueenLeveled &&
                         queenAfterLeveling.level >= 5 && // Queen is L5 or higher
                         originalLevel < 5;              // And was previously L4 or lower
    
    console.log("SAC_DEBUG: Sacrifice conditionMet: ", conditionMet);
    
    if (conditionMet) {
      let hasPawnsToSacrifice = false;
      for (const row of boardAfterPrimaryMove) {
        for (const square of row) {
          if (square.piece && square.piece.type === 'pawn' && square.piece.color === playerWhoseQueenLeveled) {
            hasPawnsToSacrifice = true;
            break;
          }
        }
        if (hasPawnsToSacrifice) break;
      }
      console.log("SAC_DEBUG: Has pawns to sacrifice: ", hasPawnsToSacrifice);

      if (hasPawnsToSacrifice) {
        if ((playerWhoseQueenLeveled === 'white' && isWhiteAI) || (playerWhoseQueenLeveled === 'black' && isBlackAI)) {
          // AI auto-sacrifices
          let pawnSacrificed = false;
          const boardCopyForAISacrifice = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
          let sacrificedAIPawn: Piece | null = null;
          
          for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
              if (boardCopyForAISacrifice[r_idx][c_idx].piece?.type === 'pawn' && boardCopyForAISacrifice[r_idx][c_idx].piece?.color === playerWhoseQueenLeveled) {
                sacrificedAIPawn = { ...boardCopyForAISacrifice[r_idx][c_idx].piece! };
                boardCopyForAISacrifice[r_idx][c_idx].piece = null;
                pawnSacrificed = true;
                break;
              }
            }
            if (pawnSacrificed) break;
          }
          setBoard(boardCopyForAISacrifice);
          if (sacrificedAIPawn) {
            const opponentColor = playerWhoseQueenLeveled === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({
              ...prev,
              [opponentColor]: [...(prev[opponentColor] || []), sacrificedAIPawn!]
            }));
          }
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)} (AI) sacrificed a Pawn!`, duration: 2500 });
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
          return false; 
        } else { 
          // Human player needs to sacrifice
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })))); 
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove); 
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select a Pawn to sacrifice!` }));
          console.log("SAC_DEBUG: Entering human pawn sacrifice mode.");
          return true; // Sacrifice mode initiated, defer processMoveEnd
        }
      } else {
        console.log("SAC_DEBUG: Condition met but no pawns to sacrifice.");
      }
    }
    // If no sacrifice needed, proceed to end the turn normally
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove);
    return false; 
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, isWhiteAI, isBlackAI, processMoveEnd, setBoard, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, setCapturedPieces]); // Added missing dependencies

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
      lastMoveFrom: lastMoveFrom,
      lastMoveTo: lastMoveTo,
      isAwaitingPawnSacrifice: isAwaitingPawnSacrifice,
      playerToSacrificePawn: playerToSacrificePawn,
      boardForPostSacrifice: boardForPostSacrifice ? boardForPostSacrifice.map(row => row.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))) : null,
      playerWhoMadeQueenMove: playerWhoMadeQueenMove,
      isExtraTurnFromQueenMove: isExtraTurnFromQueenMove,
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20); 
      return newHistory;
    });
  }, [board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode, isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory, lastMoveFrom, lastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove]);


  // --- Primary Event Handlers ---
  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    console.log(`STREAK_DEBUG (Human Turn Start): CurrentPlayer: ${currentPlayer}, LastCapturePlayer: ${lastCapturePlayer}, WhiteStreak: ${killStreaks.white}, BlackStreak: ${killStreaks.black}`);
    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col]; 
    const clickedPiece = clickedSquareState?.piece;

    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
        if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer) {
            const boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
            const pawnToSacrifice = { ...boardAfterSacrifice[row][col].piece! };
            boardAfterSacrifice[row][col].piece = null; 
            
            setBoard(boardAfterSacrifice); 

            const opponentOfSacrificer = playerWhoMadeQueenMove! === 'white' ? 'black' : 'white';
            setCapturedPieces(prevCaptured => {
              const newCaptured = { ...prevCaptured };
              newCaptured[opponentOfSacrificer] = [...(newCaptured[opponentOfSacrificer] || []), pawnToSacrifice];
              return newCaptured;
            });
            
            toast({ title: "Pawn Sacrificed!", description: `${getPlayerDisplayName(currentPlayer)} sacrificed their Pawn!`, duration: 2500 });
            
            const playerWhoTriggeredSacrifice = playerWhoMadeQueenMove; // Player whose Queen move initiated this
            const extraTurnAfterSacrifice = isExtraTurnFromQueenMove;

            setIsAwaitingPawnSacrifice(false);
            setPlayerToSacrificePawn(null);
            setBoardForPostSacrifice(null);
            setPlayerWhoMadeQueenMove(null);
            setIsExtraTurnFromQueenMove(false);
            
            setLastMoveFrom(null); 
            setLastMoveTo(algebraic); // Mark sacrificed pawn's square for highlight

            processMoveEnd(boardAfterSacrifice, playerWhoTriggeredSacrifice!, extraTurnAfterSacrifice);
        } else {
            toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns to sacrifice.", duration: 2500 });
        }
        return;
    }

    // Regular move logic
    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesStateForTurn = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };
    let originalPieceLevelBeforeMove: number | undefined;
    
    if (selectedSquare) {
        const {row: fromR_selected, col: fromC_selected} = algebraicToCoords(selectedSquare);
        const pieceDataAtSelected = finalBoardStateForTurn[fromR_selected]?.[fromC_selected]; // Use the current board state
        const pieceToMove = pieceDataAtSelected?.piece;
        originalPieceLevelBeforeMove = pieceToMove?.level; // Get level before move
        
        if (selectedSquare === algebraic && pieceToMove && pieceToMove.type === 'knight' && pieceToMove.color === currentPlayer && (pieceToMove.level || 1) >= 5) {
            // Knight Self-Destruct
            saveStateToHistory();
            setLastMoveFrom(selectedSquare);
            setLastMoveTo(selectedSquare);
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic); 

            const selfDestructPlayer = currentPlayer;
            const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
            let selfDestructCapturedSomething = false;
            let piecesDestroyedCount = 0;
            const { row: knightR, col: knightC } = algebraicToCoords(selectedSquare);
            const boardAfterDestruct = finalBoardStateForTurn.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));


            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const adjR = knightR + dr;
                    const adjC = knightC + dc;
                    if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8) {
                        const victimPiece = boardAfterDestruct[adjR][adjC].piece;
                        if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                             const tempBoardForCheck = boardAfterDestruct.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                             tempBoardForCheck[knightR][knightC].piece = null; // Simulate knight gone before checking
                             if (isKingInCheck(tempBoardForCheck, selfDestructPlayer)) {
                                toast({ title: "Illegal Move", description: "Cannot self-destruct into check.", duration: 2500});
                                setIsMoveProcessing(false); setAnimatedSquareTo(null); return;
                             }
                             if (isPieceInvulnerableToAttack(victimPiece, pieceToMove, boardAfterDestruct)) {
                                toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight's self-destruct failed on invulnerable ${victimPiece.type}.`, duration: 2500 });
                                continue;
                            }
                            finalCapturedPiecesStateForTurn[selfDestructPlayer].push({...victimPiece});
                            boardAfterDestruct[adjR][adjC].piece = null;
                            toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} Knight obliterated ${victimPiece.color} ${victimPiece.type}.`, duration: 2500 });
                            selfDestructCapturedSomething = true;
                            piecesDestroyedCount++;
                        }
                    }
                }
            }
            boardAfterDestruct[knightR][knightC].piece = null; 
            finalBoardStateForTurn = boardAfterDestruct;


            let calculatedNewStreakForPlayer;
            if (selfDestructCapturedSomething) {
                calculatedNewStreakForPlayer = (lastCapturePlayer === selfDestructPlayer ? (killStreaks[selfDestructPlayer] || 0) : 0) + piecesDestroyedCount;
            } else {
                 calculatedNewStreakForPlayer = (lastCapturePlayer === selfDestructPlayer) ? 0 : (killStreaks[selfDestructPlayer] || 0);
            }
            if(!selfDestructCapturedSomething && lastCapturePlayer === selfDestructPlayer) setLastCapturePlayer(null);
            else if (selfDestructCapturedSomething) setLastCapturePlayer(selfDestructPlayer);

            setKillStreaks(prevKillStreaks => {
              const newStreaks = { ...prevKillStreaks };
              newStreaks[selfDestructPlayer] = calculatedNewStreakForPlayer;
              if (!selfDestructCapturedSomething && prevKillStreaks[opponentOfSelfDestructPlayer] !==0) {
                // If no capture, opponent's streak is not reset by this non-capture.
              } else if (selfDestructCapturedSomething) {
                  newStreaks[opponentOfSelfDestructPlayer] = 0; // Reset opponent's streak if AI captured
              }
              return newStreaks;
            });

            if (selfDestructCapturedSomething) { 
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
            }


            if (calculatedNewStreakForPlayer === 3) {
                const opponentColor = selfDestructPlayer === 'white' ? 'black' : 'white';
                let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentColor] || [])];
                if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop(); // Mutates the copy
                    if (pieceToResOriginal) { 
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                          const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                          const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                          const newUniqueSuffix = resurrectionIdCounter++;
                          const resurrectedPiece: Piece = { ...pieceToResOriginal, level: 1, id: `${pieceToResOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResOriginal.type === 'king' || pieceToResOriginal.type === 'rook' ? false : pieceToResOriginal.hasMoved };
                          finalBoardStateForTurn[resR][resC].piece = resurrectedPiece; // Modify the board state that will be set
                          finalCapturedPiecesStateForTurn[opponentColor] = piecesOfCurrentPlayerCapturedByOpponent; // Set the mutated (shorter) list
                          toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                      } else {
                          finalCapturedPiecesStateForTurn[opponentColor].push(pieceToResOriginal); // Put it back if no space
                      }
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
                const currentMoveForSacrifice = {from: selectedSquare!, to: selectedSquare!, type: 'self-destruct' as Move['type']};
                
                const sacrificeTriggered = processPawnSacrificeCheck(finalBoardStateForTurn, selfDestructPlayer, currentMoveForSacrifice, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
                if (!sacrificeTriggered) {
                  // processMoveEnd was handled by processPawnSacrificeCheck if no sacrifice needed
                }
                setIsMoveProcessing(false);
            }, 800); 
            return;
        } else if (possibleMoves.includes(algebraic)) { 
            // Regular move or capture
            saveStateToHistory();
            setLastMoveFrom(selectedSquare);
            setLastMoveTo(algebraic);
            setIsMoveProcessing(true);
            setAnimatedSquareTo(algebraic);

            const { newBoard, capturedPiece: captured, conversionEvents } = applyMove(finalBoardStateForTurn, { from: selectedSquare, to: algebraic });
            finalBoardStateForTurn = newBoard; // This is the board AFTER the move

            const capturingPlayer = currentPlayer;
            const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
            
            let piecesCapturedThisTurn = 0;
            if (captured) piecesCapturedThisTurn = 1;

            let currentCalculatedStreakForCapturingPlayer;
            if (captured) {
                currentCalculatedStreakForCapturingPlayer = (lastCapturePlayer === capturingPlayer ? (killStreaks[capturingPlayer] || 0) : 0) + piecesCapturedThisTurn;
            } else {
                currentCalculatedStreakForCapturingPlayer = (lastCapturePlayer === capturingPlayer) ? 0 : (killStreaks[capturingPlayer] || 0);
            }
            if(!captured && lastCapturePlayer === capturingPlayer) setLastCapturePlayer(null);
            else if (captured) setLastCapturePlayer(capturingPlayer);


            setKillStreaks(prevKillStreaks => {
              const newStreaks = { ...prevKillStreaks };
              newStreaks[capturingPlayer] = currentCalculatedStreakForCapturingPlayer;
              if (!captured && prevKillStreaks[opponentPlayer] !==0) {
                 // If no capture, opponent's streak is not reset by this non-capture.
              } else if (captured) {
                  newStreaks[opponentPlayer] = 0; // Reset opponent's streak if current player captured
              }
              return newStreaks;
            });
            

            if (captured) { 
                finalCapturedPiecesStateForTurn[capturingPlayer].push(captured);
                setShowCaptureFlash(true);
                setCaptureFlashKey(k => k + 1);
            }

            if (currentCalculatedStreakForCapturingPlayer === 3) {
                let piecesBelongingToCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
                if (piecesBelongingToCurrentPlayerCapturedByOpponent.length > 0) {
                    const pieceToResurrectOriginal = piecesBelongingToCurrentPlayerCapturedByOpponent.pop();
                    if(pieceToResurrectOriginal){
                      const emptySquares: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySquares.length > 0) {
                          const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                          const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                          const newUniqueSuffix = resurrectionIdCounter++;
                          const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved };
                          finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                          finalCapturedPiecesStateForTurn[opponentPlayer] = piecesBelongingToCurrentPlayerCapturedByOpponent;
                          toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                      } else {
                          finalCapturedPiecesStateForTurn[opponentPlayer].push(pieceToResurrectOriginal); // Put it back
                      }
                    }
                }
            }
            // Rook L3+ Resurrection
            const movedPieceOnToSquare = finalBoardStateForTurn[toRow][toCol].piece;
            if (
                movedPieceOnToSquare &&
                movedPieceOnToSquare.type === 'rook' &&
                (movedPieceOnToSquare.level || 1) >= 3 &&
                (originalPieceLevelBeforeMove || 0) < 3 
            ) {
                console.log(`ROOK_RES_DEBUG: Human Rook ${movedPieceOnToSquare.id} at ${algebraic} reached L${movedPieceOnToSquare.level} from L${originalPieceLevelBeforeMove}. Attempting resurrection.`);
                let piecesToChooseFromRes = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
                 console.log(`ROOK_RES_DEBUG: Pieces available for ${currentPlayer} to resurrect:`, piecesToChooseFromRes.length);

                if (piecesToChooseFromRes.length > 0) {
                    const pieceToResOriginal = piecesToChooseFromRes[Math.floor(Math.random() * piecesToChooseFromRes.length)];
                    const rookCurrentPos = { row: toRow, col: toCol };
                    const emptyAdjSquares: AlgebraicSquare[] = [];
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const adjR = rookCurrentPos.row + dr;
                            const adjC = rookCurrentPos.col + dc;
                            if ( adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8 && !finalBoardStateForTurn[adjR][adjC].piece) {
                                emptyAdjSquares.push(coordsToAlgebraic(adjR, adjC));
                            }
                        }
                    }
                    console.log(`ROOK_RES_DEBUG: Empty adjacent squares for Rook at ${algebraic}:`, emptyAdjSquares);
                    if (emptyAdjSquares.length > 0) {
                        const targetSqAlg = emptyAdjSquares[Math.floor(Math.random() * emptyAdjSquares.length)];
                        const { row: resR, col: resC } = algebraicToCoords(targetSqAlg);
                        const newUidSuffix = resurrectionIdCounter++;
                        const resurrectedPc: Piece = { ...pieceToResOriginal, level: 1, id: `${pieceToResOriginal.id}_res_${newUidSuffix}_${Date.now()}`, hasMoved: pieceToResOriginal.type === 'king' || pieceToResOriginal.type === 'rook' ? false : pieceToResOriginal.hasMoved };
                        finalBoardStateForTurn[resR][resC].piece = resurrectedPc; // Modify board
                        finalCapturedPiecesStateForTurn[opponentPlayer] = piecesToChooseFromRes.filter(p => p.id !== pieceToResOriginal.id); // Update captured list
                         toast({ title: "Rook's Call!", description: `${getPlayerDisplayName(currentPlayer)}'s Rook resurrected their ${resurrectedPc.type} to ${targetSqAlg}! (L1)`, duration: 2500 });
                        console.log(`ROOK_RES_DEBUG: Resurrected ${resurrectedPc.type} to ${targetSqAlg}`);
                    } else {
                        console.log(`ROOK_RES_DEBUG: No empty adjacent for Rook resurrection.`);
                    }
                } else {
                     console.log(`ROOK_RES_DEBUG: No pieces for ${currentPlayer} to resurrect via Rook.`);
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
                const currentMoveForSacrifice = { from: selectedSquare!, to: algebraic, type: captured ? 'capture' : 'move' as Move['type'] };

                const sacrificeNeeded = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, currentMoveForSacrifice, originalPieceLevelBeforeMove, streakGrantsExtraTurn);
                
                if(isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeeded) { 
                    setIsPromotingPawn(true); setPromotionSquare(algebraic);
                } else if (!isPawnPromotingMove && !sacrificeNeeded && !isAwaitingPawnSacrifice) {
                    // processMoveEnd already called by processPawnSacrificeCheck if no sacrifice was needed
                }
                setIsMoveProcessing(false);
            }, 800); 
            return;
        }

        // Selecting a new piece or an enemy piece
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color !== currentPlayer) { 
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic); // Use current board state
            setEnemyPossibleMoves(enemyMoves);
        } else if (clickedPiece && clickedPiece.color === currentPlayer) { 
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic); // Use current board state
            const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer); 
            setPossibleMoves(legalMovesForPlayer);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else { 
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
    } else { 
        // First click on a square
        if (clickedPiece && clickedPiece.color === currentPlayer) {
            setSelectedSquare(algebraic);
            const pseudoPossibleMoves = getPossibleMoves(board, algebraic); // Use current board state
            const legalMovesForPlayer = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer); 
            setPossibleMoves(legalMovesForPlayer);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        } else if (clickedPiece && clickedPiece.color !== currentPlayer) {
            setEnemySelectedSquare(algebraic);
            const enemyMoves = getPossibleMoves(board, algebraic); // Use current board state
            setEnemyPossibleMoves(enemyMoves);
            setSelectedSquare(null);
            setPossibleMoves([]);
        } else { 
            setSelectedSquare(null);
            setPossibleMoves([]);
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
    }
  }, [ board, currentPlayer, selectedSquare, possibleMoves, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer, saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast, filterLegalMoves, setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing, setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo, isAwaitingPawnSacrifice, playerToSacrificePawn, processPawnSacrificeCheck, determineBoardOrientation, setGameInfoBasedOnExtraTurn, completeTurn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove]);


  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing || isAwaitingPawnSacrifice) return;
    saveStateToHistory();
    
    let boardAfterPromotion = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece;

    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false); return;
    }
    const originalPawnLevel = originalPawnOnBoard.level || 1;
    const pawnColor = originalPawnOnBoard.color;
    // const originalMoveForPawnPromo = { from: lastMoveFrom!, to: promotionSquare, type: 'promotion' as Move['type'], promoteTo: pieceType }; 
    
    // The move that LED to promotion is lastMoveFrom -> promotionSquare
    // The "promotion itself" is just changing the piece type at promotionSquare
    const moveThatLedToPromotion: Move = {
      from: lastMoveFrom!, // This should be the pawn's square before it moved to promotionSquare
      to: promotionSquare,
      type: board[row]?.[col]?.piece ? 'capture' : 'move', // Check if promotion square had a piece
      promoteTo: pieceType
    };


    boardAfterPromotion[row][col].piece = {
        ...originalPawnOnBoard,
        type: pieceType,
        level: 1, 
        id: `${originalPawnOnBoard.id}_promo_${pieceType}`,
        hasMoved: true,
    };
    
    let finalCapturedPiecesAfterPromotion = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };
    // The original piece on promotionSquare (if any) would have been captured by applyMove
    // The capturedPieces state should already reflect this.

    setLastMoveTo(promotionSquare); 
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);

    setBoard(boardAfterPromotion);
    // setCapturedPieces(finalCapturedPiecesAfterPromotion); // Already handled by the move leading to promo

    setTimeout(() => {
        setAnimatedSquareTo(null);
        toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L1)`, duration: 2500 });
        
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);

        const pawnLevelGrantsExtraTurn = originalPawnLevel >= 5;
        const currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0; // Streak AFTER the capture leading to promo
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;
        const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;
        
        // originalPawnOnBoard.level is the level *before* this promotion was chosen, but *after* the capture that led to it.
        // For sacrifice check, we need the level of the QUEEN if it was the piece that moved and leveled.
        // This promotion is a separate event.
        // The sacrifice check should have happened *before* setIsPromotingPawn was true.
        // So here, we just proceed to end the turn.
        const sacrificeTriggeredByQueenLevel = processPawnSacrificeCheck(boardAfterPromotion, pawnColor, moveThatLedToPromotion, undefined /* No queen level check here */, combinedExtraTurn);

        if (!sacrificeTriggeredByQueenLevel) {
             // If sacrifice not needed by queen, then handle the turn end for pawn promotion
            processMoveEnd(boardAfterPromotion, pawnColor, combinedExtraTurn);
        }
        
        setIsPromotingPawn(false); setPromotionSquare(null);
        setIsMoveProcessing(false);
    }, 800); 
  }, [ board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, isMoveProcessing, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, setLastMoveTo, capturedPieces, processMoveEnd, completeTurn, setGameInfoBasedOnExtraTurn ]); 


  const resetGame = useCallback(() => {
    resurrectionIdCounter = 0;
    const initialBoardState = initializeBoard();
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    
    const newIsWhiteAI = false; 
    const newIsBlackAI = false;
    setIsWhiteAI(newIsWhiteAI); 
    setIsBlackAI(newIsBlackAI); 
    
    setGameInfo({...initialGameStatus});
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights);
    setPositionHistory([initialHash]);

    setFlashMessage(null);
    setKillStreakFlashMessage(null);
    setShowCaptureFlash(false);
    setCaptureFlashKey(0);
    setShowCheckFlashBackground(false);
    setCheckFlashBackgroundKey(0);
    setShowCheckmatePatternFlash(false);
    setCheckmatePatternFlashKey(0);

    setIsPromotingPawn(false);
    setPromotionSquare(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setLastMoveFrom(null);
    setLastMoveTo(null);

    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;

    const initialOrientation = determineBoardOrientation('flipping', 'white', newIsWhiteAI, newIsBlackAI);
    setBoardOrientation(initialOrientation);
    setAnimatedSquareTo(null);
    setIsMoveProcessing(false);

    setIsAwaitingPawnSacrifice(false);
    setPlayerToSacrificePawn(null);
    setBoardForPostSacrifice(null);
    setPlayerWhoMadeQueenMove(null);
    setIsExtraTurnFromQueenMove(false);

    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
  }, [toast, determineBoardOrientation]); 

  const handleUndo = useCallback(() => {
    if ((isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice) {
      toast({ title: "Undo Failed", description: "Cannot undo during AI turn, processing, or sacrifice.", duration: 2500 });
      return;
    }
    if (historyStack.length === 0) {
        toast({ title: "Undo Failed", description: "No moves to undo.", duration: 2500 });
        setLastMoveFrom(null); 
        setLastMoveTo(null);
        return;
    }

    const playerWhoseTurnItIsNow = currentPlayer;
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
        toast({ title: "Undo Error", description: "Not enough history.", duration: 2500 });
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
      setLastMoveFrom(stateToRestore.lastMoveFrom || null);
      setLastMoveTo(stateToRestore.lastMoveTo || null);

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
      setKillStreakFlashMessage(null);
      setShowCaptureFlash(false);
      setShowCheckFlashBackground(false);
      setShowCheckmatePatternFlash(false);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false);
      aiErrorOccurredRef.current = false; 
      setHistoryStack(newHistoryStack);

      setIsAwaitingPawnSacrifice(stateToRestore.isAwaitingPawnSacrifice);
      setPlayerToSacrificePawn(stateToRestore.playerToSacrificePawn);
      setBoardForPostSacrifice(stateToRestore.boardForPostSacrifice);
      setPlayerWhoMadeQueenMove(stateToRestore.playerWhoMadeQueenMove);
      setIsExtraTurnFromQueenMove(stateToRestore.isExtraTurnFromQueenMove);

      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    } else { 
        setLastMoveFrom(null);
        setLastMoveTo(null);
    }
  }, [ historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing, isAwaitingPawnSacrifice, setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer, setPositionHistory, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage, setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn, setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setLastMoveFrom, setLastMoveTo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, setPlayerWhoMadeQueenMove, setKillStreakFlashMessage ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      setBoardOrientation(determineBoardOrientation(newMode, currentPlayer, isBlackAI, isWhiteAI));
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [determineBoardOrientation, currentPlayer, isBlackAI, isWhiteAI, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setBoardOrientation]);


  const handleToggleWhiteAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing) return;
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, isBlackAI, newIsWhiteAI));
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, viewMode, isBlackAI, toast, determineBoardOrientation, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);

  const handleToggleBlackAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing) return;
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    setBoardOrientation(determineBoardOrientation(viewMode, currentPlayer, newIsBlackAI, isWhiteAI));
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, viewMode, isWhiteAI, toast, determineBoardOrientation, setBoardOrientation, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);

  // --- AI Turn Execution ---
  const performAiMove = useCallback(async () => {
    console.log(`STREAK_DEBUG (AI Turn Start - ${currentPlayer}): LastCapturePlayer: ${lastCapturePlayer}, WhiteStreak: ${killStreaks.white}, BlackStreak: ${killStreaks.black}`);
    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice) {
      setIsAiThinking(false); 
      return;
    } 

    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...`}));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    
    let aiFromAlg: AlgebraicSquare | null = null;
    let aiToAlg: AlgebraicSquare | null = null;
    let aiMoveDataFromAI: any = null; // AIMove | null
    let finalBoardStateForAI = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null })));
    let finalCapturedPiecesForAI = {
        white: capturedPieces.white.map(p => ({...p})),
        black: capturedPieces.black.map(p => ({...p}))
    };
    let originalPieceLevelForAI : number | undefined;
    let moveForApplyMove: Move | null = null;


    try {
        await new Promise(resolve => setTimeout(resolve, 50)); 
        const gameStateForAI = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI);
        aiMoveDataFromAI = aiInstanceRef.current.getBestMove(gameStateForAI, currentPlayer);

        if (!aiMoveDataFromAI || !Array.isArray(aiMoveDataFromAI.from) || aiMoveDataFromAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromAI.to) || aiMoveDataFromAI.to.length !== 2) {
            console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI returned invalid move structure. Raw move:`, aiMoveDataFromAI);
            aiErrorOccurredRef.current = true;
        } else {
            aiFromAlg = coordsToAlgebraic(aiMoveDataFromAI.from[0], aiMoveDataFromAI.from[1]);
            aiToAlg = coordsToAlgebraic(aiMoveDataFromAI.to[0], aiMoveDataFromAI.to[1]);
            const aiMoveType = (aiMoveDataFromAI.type || 'move') as Move['type'];
            const aiPromoteTo = aiMoveDataFromAI.promoteTo as PieceType | undefined;
            moveForApplyMove = { from: aiFromAlg, to: aiToAlg, type: aiMoveType, promoteTo: aiPromoteTo };


            const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromAI.from[0]]?.[aiMoveDataFromAI.from[1]];
            const pieceOnFromSquareForAI = pieceDataAtFromAI?.piece;
            originalPieceLevelForAI = pieceOnFromSquareForAI?.level;


            if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
                console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI tried to move an invalid piece from ${aiFromAlg}. Board piece:`, pieceOnFromSquareForAI);
                aiErrorOccurredRef.current = true;
            } else {
                const pseudoPossibleMovesForAiPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg);
                const legalMovesForAiPieceOnBoard = filterLegalMoves(finalBoardStateForAI, aiFromAlg, pseudoPossibleMovesForAiPiece, currentPlayer);
                let isAiMoveActuallyLegal = false;

                if (aiMoveType === 'self-destruct' && pieceOnFromSquareForAI.type === 'knight' && (pieceOnFromSquareForAI.level || 1) >= 5) {
                    if (aiFromAlg === aiToAlg) {
                        const tempStateAfterSelfDestruct = finalBoardStateForAI.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                        tempStateAfterSelfDestruct[aiMoveDataFromAI.from[0]][aiMoveDataFromAI.from[1]].piece = null; 
                        if (!isKingInCheck(tempStateAfterSelfDestruct, currentPlayer)) {
                            isAiMoveActuallyLegal = true;
                        } else {
                             console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI self-destruct from ${aiFromAlg} would leave king in check.`);
                             aiErrorOccurredRef.current = true;
                        }
                    } else {
                         console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested self-destruct but 'from' and 'to' are different: ${aiFromAlg} to ${aiToAlg}.`);
                         aiErrorOccurredRef.current = true;
                    }
                } else if (aiMoveType === 'swap') {
                    const targetPieceForAISwap = finalBoardStateForAI[algebraicToCoords(aiToAlg).row]?.[algebraicToCoords(aiToAlg).col]?.piece;
                    const validSwapCondition = (pieceOnFromSquareForAI.type === 'knight' && targetPieceForAISwap?.type === 'bishop' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color && (pieceOnFromSquareForAI.level || 1) >=4 ) ||
                                    (pieceOnFromSquareForAI.type === 'bishop' && targetPieceForAISwap?.type === 'knight' && targetPieceForAISwap.color === pieceOnFromSquareForAI.color && (pieceOnFromSquareForAI.level || 1) >=4 );
                    
                    if (legalMovesForAiPieceOnBoard.some(m => m === aiToAlg) && validSwapCondition) {
                         isAiMoveActuallyLegal = true;
                    } else {
                         console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Validation Error: AI suggested illegal swap: ${aiFromAlg} to ${aiToAlg}. Valid moves: ${legalMovesForAiPieceOnBoard.join(', ')}`);
                         aiErrorOccurredRef.current = true;
                    }
                }
                else { // Regular move or capture
                    isAiMoveActuallyLegal = legalMovesForAiPieceOnBoard.includes(aiToAlg);
                     if (!isAiMoveActuallyLegal) {
                        console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Warning: AI suggested an illegal move: ${aiFromAlg} to ${aiToAlg}. Valid moves for piece: ${legalMovesForAiPieceOnBoard.join(', ')}. AI Move Type: ${aiMoveType}`);
                        aiErrorOccurredRef.current = true;
                    }
                }
                
                if(!aiErrorOccurredRef.current) {
                    saveStateToHistory();
                    setLastMoveFrom(aiFromAlg as AlgebraicSquare);
                    setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare)); 
                    setIsMoveProcessing(true);
                    setAnimatedSquareTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
                    
                    let aiMoveCapturedSomething = false;
                    let currentCalculatedStreakForAIPlayer: number;
                    let piecesDestroyedByAICount = 0;

                    if (moveForApplyMove!.type === 'self-destruct') {
                        const { row: knightR_AI, col: knightC_AI } = algebraicToCoords(moveForApplyMove!.from);
                        const selfDestructingKnight_AI = finalBoardStateForAI[knightR_AI]?.[knightC_AI]?.piece; 

                        for (let dr = -1; dr <= 1; dr++) {
                          for (let dc = -1; dc <= 1; dc++) {
                            if (dr === 0 && dc === 0) continue;
                            const adjR_AI = knightR_AI + dr;
                            const adjC_AI = knightC_AI + dc;
                            if (adjR_AI >= 0 && adjR_AI < 8 && adjC_AI >=0 && adjC_AI < 8 ) {
                              const victimPiece_AI = finalBoardStateForAI[adjR_AI][adjC_AI].piece;
                              if (victimPiece_AI && victimPiece_AI.color !== currentPlayer && victimPiece_AI.type !== 'king' && selfDestructingKnight_AI) {
                                if (isPieceInvulnerableToAttack(victimPiece_AI, selfDestructingKnight_AI, finalBoardStateForAI)) {
                                  toast({ title: "Invulnerable!", description: `AI Knight's self-destruct failed on invulnerable ${victimPiece_AI.type}.`, duration: 2500 });
                                  continue;
                                }
                                finalCapturedPiecesForAI[currentPlayer].push({ ...victimPiece_AI });
                                finalBoardStateForAI[adjR_AI][adjC_AI].piece = null;
                                aiMoveCapturedSomething = true;
                                piecesDestroyedByAICount++;
                              }
                            }
                          }
                        }
                        finalBoardStateForAI[knightR_AI][knightC_AI].piece = null; 
                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) Knight Self-Destructs!`, description: `${piecesDestroyedByAICount} pieces obliterated.`, duration: 2500});
                        
                        if (aiMoveCapturedSomething) {
                            currentCalculatedStreakForAIPlayer = (lastCapturePlayer === currentPlayer ? (killStreaks[currentPlayer] || 0) : 0) + piecesDestroyedByAICount;
                        } else {
                             currentCalculatedStreakForAIPlayer = (lastCapturePlayer === currentPlayer) ? 0 : (killStreaks[currentPlayer] || 0);
                        }
                        if(!aiMoveCapturedSomething && lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                        else if (aiMoveCapturedSomething) setLastCapturePlayer(currentPlayer);


                    } else { 
                        const { newBoard, capturedPiece: capturedByAI, conversionEvents } = applyMove(finalBoardStateForAI, moveForApplyMove!);
                        finalBoardStateForAI = newBoard;
                        toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${moveForApplyMove!.from} to ${moveForApplyMove!.to}`, duration: 1500});

                        if (capturedByAI) {
                            aiMoveCapturedSomething = true;
                            finalCapturedPiecesForAI[currentPlayer].push(capturedByAI);
                            currentCalculatedStreakForAIPlayer = (lastCapturePlayer === currentPlayer ? (killStreaks[currentPlayer] || 0) : 0) + 1;
                        } else {
                             currentCalculatedStreakForAIPlayer = (lastCapturePlayer === currentPlayer) ? 0 : (killStreaks[currentPlayer] || 0);
                        }
                        if(!capturedByAI && lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
                        else if (capturedByAI) setLastCapturePlayer(currentPlayer);
                        
                        if (conversionEvents && conversionEvents.length > 0) {
                            conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
                        }
                    }

                    setKillStreaks(prevKillStreaks => {
                        const newStreaks = { ...prevKillStreaks };
                        newStreaks[currentPlayer] = currentCalculatedStreakForAIPlayer;
                        const opponentOfAI = currentPlayer === 'white' ? 'black' : 'white';
                        if (aiMoveCapturedSomething) { // If AI captured, reset opponent's streak
                            newStreaks[opponentOfAI] = 0;
                        }
                        // Opponent's streak is NOT reset if AI makes a non-capturing move.
                        return newStreaks;
                    });

                     if(aiMoveCapturedSomething) { 
                        setShowCaptureFlash(true);
                        setCaptureFlashKey(k => k + 1);
                    }

                    if (currentCalculatedStreakForAIPlayer === 3) {
                        const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                        let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                         if (piecesOfAICapturedByOpponent.length > 0) {
                            const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop(); 
                            if(pieceToResOriginalAI){
                              const emptySqAI: AlgebraicSquare[] = [];
                              for(let r_idx=0; r_idx<8; r_idx++) for(let c_idx=0; c_idx<8; c_idx++) if(!finalBoardStateForAI[r_idx][c_idx].piece) emptySqAI.push(coordsToAlgebraic(r_idx,c_idx));
                              if(emptySqAI.length > 0){
                                  const randSqAI = emptySqAI[Math.floor(Math.random()*emptySqAI.length)];
                                  const {row: resRAI, col:resCAI} = algebraicToCoords(randSqAI);
                                  const newUniqueSuffixAI = resurrectionIdCounter++;
                                  const resurrectedAI: Piece = {...pieceToResOriginalAI, level:1, id:`${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved };
                                  finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                                  finalCapturedPiecesForAI[opponentColorAI] = piecesOfAICapturedByOpponent;
                                  toast({ title: "Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                              } else {
                                  finalCapturedPiecesForAI[opponentColorAI].push(pieceToResOriginalAI);
                              }
                            }
                        }
                    }
                    
                    // Rook L3+ Resurrection for AI
                    const movedAIRook = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
                    if ( movedAIRook && movedAIRook.type === 'rook' && (movedAIRook.level || 1) >= 3 && (originalPieceLevelForAI || 0) < 3 ) {
                        console.log(`ROOK_RES_DEBUG: AI Rook ${movedAIRook.id} at ${aiToAlg} reached L${movedAIRook.level} from L${originalPieceLevelForAI}. Attempting resurrection.`);
                        const opponentColorOfAI = currentPlayer === 'white' ? 'black' : 'white';
                        let piecesToResurrectFromAI = [...(finalCapturedPiecesForAI[opponentColorOfAI] || [])];
                        if (piecesToResurrectFromAI.length > 0) {
                            const pieceToResOriginalAIRook = piecesToResurrectFromAI[Math.floor(Math.random() * piecesToResurrectFromAI.length)];
                            const aiRookPos = algebraicToCoords(aiToAlg as AlgebraicSquare);
                            const emptyAdjSquaresAI: AlgebraicSquare[] = [];
                            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                                if (dr === 0 && dc === 0) continue;
                                const adjR = aiRookPos.row + dr; const adjC = aiRookPos.col + dc;
                                if (adjR >= 0 && adjR < 8 && adjC >= 0 && adjC < 8 && !finalBoardStateForAI[adjR][adjC].piece) emptyAdjSquaresAI.push(coordsToAlgebraic(adjR, adjC));
                            }
                            if (emptyAdjSquaresAI.length > 0) {
                                const targetSqAlgAI = emptyAdjSquaresAI[Math.floor(Math.random() * emptyAdjSquaresAI.length)];
                                const { row: resRAI, col: resCAI } = algebraicToCoords(targetSqAlgAI);
                                const newUidSuffixAI = resurrectionIdCounter++;
                                const resurrectedAIRookPiece: Piece = { ...pieceToResOriginalAIRook, level: 1, id: `${pieceToResOriginalAIRook.id}_res_${newUidSuffixAI}_${Date.now()}`, hasMoved: pieceToResOriginalAIRook.type === 'king' || pieceToResOriginalAIRook.type === 'rook' ? false : pieceToResOriginalAIRook.hasMoved };
                                finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAIRookPiece;
                                finalCapturedPiecesForAI[opponentColorOfAI] = piecesToResurrectFromAI.filter(p => p.id !== pieceToResOriginalAIRook.id);
                                toast({ title: "Rook's Call!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Rook resurrected their ${resurrectedAIRookPiece.type} to ${targetSqAlgAI}! (L1)`, duration: 2500 });
                            }
                        }
                    }

                    setBoard(finalBoardStateForAI);
                    setCapturedPieces(finalCapturedPiecesForAI);

                    setTimeout(() => {
                        const pieceAtDestinationAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
                        const promotionRowAI = currentPlayer === 'white' ? 0 : 7;

                        const isAIPawnPromoting = pieceAtDestinationAI &&
                                                  pieceAtDestinationAI.type === 'pawn' &&
                                                  algebraicToCoords(aiToAlg as AlgebraicSquare).row === promotionRowAI &&
                                                  moveForApplyMove!.type !== 'self-destruct'; 

                        const streakGrantsExtraTurnForAI = currentCalculatedStreakForAIPlayer === 6;

                        let sacrificeCheckTriggeredForAI = false;
                        if (isAIPawnPromoting) {
                            const promotedTypeAI = moveForApplyMove!.promoteTo || 'queen'; 
                            const originalPawnLevelForAIPromo = originalPieceLevelForAI || 1;
                            
                            const boardAfterAIPromotion = finalBoardStateForAI.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null})));
                            const promotedAIPiece : Piece = {
                                ...(boardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece as Piece),
                                type: promotedTypeAI,
                                level: 1, 
                                id: `${(boardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece as Piece).id}_promo_${promotedTypeAI}_ai`,
                                hasMoved: true,
                            };
                            boardAfterAIPromotion[algebraicToCoords(aiToAlg as AlgebraicSquare).row][algebraicToCoords(aiToAlg as AlgebraicSquare).col].piece = promotedAIPiece;
                            setBoard(boardAfterAIPromotion); 
                            finalBoardStateForAI = boardAfterAIPromotion; // Update final board state
                            toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L1)`, duration: 2500 });
                            
                            const aiPawnPromoExtraTurn = originalPawnLevelForAIPromo >= 5;
                            const combinedExtraTurnForAI = aiPawnPromoExtraTurn || streakGrantsExtraTurnForAI;
                            
                            sacrificeCheckTriggeredForAI = processPawnSacrificeCheck(boardAfterAIPromotion, currentPlayer, moveForApplyMove!, originalPieceLevelForAI, combinedExtraTurnForAI);
                            
                        } else {
                           sacrificeCheckTriggeredForAI = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMove!, originalPieceLevelForAI, streakGrantsExtraTurnForAI);
                        }
                        
                        setAnimatedSquareTo(null);
                        //setIsAiThinking(false); // Moved to after all processing
                        //setIsMoveProcessing(false); // Moved to after all processing

                        if (!sacrificeCheckTriggeredForAI) {
                            // processMoveEnd was handled by processPawnSacrificeCheck if no sacrifice needed by Queen
                            // OR if it was a pawn promotion and sacrifice was not triggered by queen leveling
                            // OR if no pawn promotion and no sacrifice
                        }
                        setIsAiThinking(false);
                        setIsMoveProcessing(false);
                    }, 800); 
                }
            }
        }
    } catch (error) {
        console.error(`AI (${getPlayerDisplayName(currentPlayer)}) Error in performAiMove (outer try-catch):`, error);
        aiErrorOccurredRef.current = true;
    }
    
    if (aiErrorOccurredRef.current) {
        toast({
            title: `AI (${getPlayerDisplayName(currentPlayer)}) Error/Forfeit`,
            description: "AI move forfeited or error occurred.",
            variant: "destructive",
            duration: 2500,
        });
        setIsWhiteAI(prev => currentPlayer === 'white' ? false : prev);
        setIsBlackAI(prev => currentPlayer === 'black' ? false : prev);
        // Defer completion to ensure AI state updates are processed
        setTimeout(() => {
            completeTurn(board, currentPlayer); // Forfeit turn using current board
            setIsAiThinking(false); 
            setIsMoveProcessing(false);
        }, 0);
    }
  }, [
      board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing, isAwaitingPawnSacrifice,
      killStreaks, capturedPieces, lastCapturePlayer, 
      saveStateToHistory, toast, getPlayerDisplayName,
      filterLegalMoves, getPossibleMoves,
      processPawnSacrificeCheck, processMoveEnd,
      applyMove, algebraicToCoords, coordsToAlgebraic, 
      setBoard, setCapturedPieces, setGameInfo, setKillStreaks, setLastCapturePlayer,
      setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
      setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo, setShowCaptureFlash, setCaptureFlashKey,
      setIsWhiteAI, setIsBlackAI, setLastMoveFrom, setLastMoveTo, 
      completeTurn, determineBoardOrientation, setGameInfoBasedOnExtraTurn,
      isWhiteAI, isBlackAI, // Added these
      boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, playerToSacrificePawn // For sacrifice context
    ]
  );


  // --- useEffect Hooks ---
  useEffect(() => {
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice) {
       performAiMove();
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice]);

  useEffect(() => {
    if (!board) return; 
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights);
    if(positionHistory.length === 0 && initialHash){
        setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory]); 

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
  }, [gameInfo]); // Only gameInfo needed here

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
    if (killStreakFlashMessage) {
      timerId = setTimeout(() => {
        setKillStreakFlashMessage(null);
      }, 1500); // Kill streak messages also 1.5s
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [killStreakFlashMessage, killStreakFlashMessageKey]);

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
    if (showCheckFlashBackground) {
      timerId = setTimeout(() => {
        setShowCheckFlashBackground(false);
      }, 2250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckFlashBackground, checkFlashBackgroundKey]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (showCheckmatePatternFlash) {
      timerId = setTimeout(() => {
        setShowCheckmatePatternFlash(false);
      }, 5250); 
    }
    return () => { if (timerId) clearTimeout(timerId); };
  }, [showCheckmatePatternFlash, checkmatePatternFlashKey]);


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}
      
      {/* Main game content wrapper */}
      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center">
        {flashMessage && ( <div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' ? 'animate-flash-checkmate' : 'animate-flash-check' }`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
        {killStreakFlashMessage && ( <div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-pixel text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}
        
        <div className="w-full flex flex-col items-center mb-6 space-y-3">
            <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
            <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={resetGame} aria-label="Reset Game" className="h-8 px-2 text-xs">
                <RefreshCw className="mr-1" /> Reset
            </Button>
            <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-xs">
                <BookOpen className="mr-1" /> Rules
            </Button>
            <Button variant="outline" onClick={handleUndo} disabled={historyStack.length === 0 || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice } aria-label="Undo Move" className="h-8 px-2 text-xs">
                <Undo2 className="mr-1" /> Undo
            </Button>
             <Button variant="outline" onClick={handleToggleWhiteAI} disabled={(isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-8 px-2 text-xs">
                <Bot className="mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleBlackAI} disabled={(isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-8 px-2 text-xs">
                <Bot className="mr-1" /> Black AI: {isBlackAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleViewMode} aria-label="Toggle Board View" className="h-8 px-2 text-xs">
                <View className="mr-1" /> View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
            </Button>
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
            <div className="md:w-1/3 lg:w-1/4">
            <GameControls
                currentPlayer={currentPlayer}
                gameStatusMessage={isAwaitingPawnSacrifice ? `${getPlayerDisplayName(playerToSacrificePawn!)} select Pawn to sacrifice!` : gameInfo.message || "\u00A0"}
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
                isInteractionDisabled={gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice}
                applyBoardOpacityEffect={applyBoardOpacityEffect}
                playerInCheck={gameInfo.playerWithKingInCheck}
                viewMode={viewMode}
                animatedSquareTo={animatedSquareTo}
                lastMoveFrom={lastMoveFrom}
                lastMoveTo={lastMoveTo}
                isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
                playerToSacrificePawn={playerToSacrificePawn}
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