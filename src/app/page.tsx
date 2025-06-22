
'use client';

import type { ReactNode } from 'react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
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
  coordsToAlgebraic,
  getCastlingRightsString,
  boardToPositionHash,
  type ConversionEvent,
  isPieceInvulnerableToAttack,
  isValidSquare,
  processRookResurrectionCheck,
  type RookResurrectionResult,
  spawnAnvil,
  spawnShroom,
  boardToSimpleString,
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType, GameSnapshot, ViewMode, SquareState, ApplyMoveResult, AIGameState, AIBoardState, AISquareState, QueenLevelReducedEvent, AIMove as AIMoveType } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, BookOpen, Undo2, View, Bot, Globe, Link2Off, Flag } from 'lucide-react';
import type { VibeChessAI as VibeChessAIClassType } from '@/lib/vibe-chess-ai';
import { useWebRTC } from '@/webrtc/WebRTCContext';


let globalResurrectionIdCounter = 0;
const TURN_DURATION_SECONDS = 60;

const initialGameStatus: GameStatus = {
  message: "\u00A0",
  isCheck: false,
  playerWithKingInCheck: null,
  isCheckmate: false,
  isStalemate: false,
  isThreefoldRepetitionDraw: false,
  isInfiltrationWin: false,
  gameOver: false,
  winner: undefined,
};

function adaptBoardForAI(
  currentBoardState: BoardState,
  playerForAITurn: PlayerColor,
  currentKillStreaks: { white: number; black: number },
  currentCapturedPieces: { white: Piece[]; black: Piece[] },
  gameMoveCounter: number,
  firstBloodAchieved: boolean,
  playerWhoGotFirstBlood: PlayerColor | null,
  enPassantTargetSquare: AlgebraicSquare | null,
  shroomSpawnCounter?: number,
  nextShroomSpawnTurn?: number
): AIGameState {
  const newAiBoard: AIBoardState = [];
  for (let r_idx = 0; r_idx < 8; r_idx++) {
    const boardRow = currentBoardState[r_idx];
    const newAiRow: AISquareState[] = [];
    if (boardRow) {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        const squareState = boardRow[c_idx];
        newAiRow.push({
          piece: squareState?.piece ? { ...squareState.piece } : null,
          item: squareState?.item ? { ...squareState.item } : null,
        });
      }
    } else {
      for (let c_idx = 0; c_idx < 8; c_idx++) {
        newAiRow.push({ piece: null, item: null });
      }
    }
    newAiBoard.push(newAiRow);
  }

  return {
    board: newAiBoard,
    currentPlayer: playerForAITurn,
    killStreaks: {
      white: currentKillStreaks?.white || 0,
      black: currentKillStreaks?.black || 0,
    },
    capturedPieces: {
      white: currentCapturedPieces?.white?.map(p => ({ ...p })) || [],
      black: currentCapturedPieces?.black?.map(p => ({ ...p })) || [],
    },
    gameOver: false,
    winner: undefined,
    extraTurn: false,
    autoCheckmate: false,
    gameMoveCounter: gameMoveCounter,
    firstBloodAchieved: firstBloodAchieved,
    playerWhoGotFirstBlood: playerWhoGotFirstBlood,
    enPassantTargetSquare: enPassantTargetSquare,
    shroomSpawnCounter: shroomSpawnCounter,
    nextShroomSpawnTurn: nextShroomSpawnTurn,
  };
}


export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameInfo, setGameInfo] = useState<GameStatus>({ ...initialGameStatus });
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
  const [promotionMoveWasCapture, setPromotionMoveWasCapture] = useState(false);
  const [promotionPawnOriginalLevel, setPromotionPawnOriginalLevel] = useState<number | null>(null);
  const [isRulesDialogOpen, setIsRulesDialogOpen] = useState(false);
  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [lastCapturePlayer, setLastCapturePlayer] = useState<PlayerColor | null>(null);
  const [historyStack, setHistoryStack] = useState<GameSnapshot[]>([]);
  const [isWhiteAI, setIsWhiteAI] = useState(false);
  const [isBlackAI, setIsBlackAI] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const aiInstanceRef = useRef<VibeChessAIClassType | null>(null);
  const aiErrorOccurredRef = useRef(false);
  const [animatedSquareTo, setAnimatedSquareTo] = useState<AlgebraicSquare | null>(null);
  const [isMoveProcessing, setIsMoveProcessing] = useState(false);
  const [lastMoveFrom, setLastMoveFrom] = useState<AlgebraicSquare | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<AlgebraicSquare | null>(null);
  const [gameMoveCounter, setGameMoveCounter] = useState(0);
  const [enPassantTargetSquare, setEnPassantTargetSquare] = useState<AlgebraicSquare | null>(null);


  const [isAwaitingPawnSacrifice, setIsAwaitingPawnSacrifice] = useState(false);
  const [playerToSacrificePawn, setPlayerToSacrificePawn] = useState<PlayerColor | null>(null);
  const [boardForPostSacrifice, setBoardForPostSacrifice] = useState<BoardState | null>(null);
  const [playerWhoMadeQueenMove, setPlayerWhoMadeQueenMove] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromQueenMove, setIsExtraTurnFromQueenMove] = useState<boolean>(false);

  const [isAwaitingRookSacrifice, setIsAwaitingRookSacrifice] = useState(false);
  const [playerToSacrificeForRook, setPlayerToSacrificeForRook] = useState<PlayerColor | null>(null);
  const [rookToMakeInvulnerable, setRookToMakeInvulnerable] = useState<AlgebraicSquare | null>(null);
  const [boardForRookSacrifice, setBoardForRookSacrifice] = useState<BoardState | null>(null);
  const [originalTurnPlayerForRookSacrifice, setOriginalTurnPlayerForRookSacrifice] = useState<PlayerColor | null>(null);
  const [isExtraTurnFromRookLevelUp, setIsExtraTurnFromRookLevelUp] = useState<boolean>(false);

  const [isResurrectionPromotionInProgress, setIsResurrectionPromotionInProgress] = useState(false);
  const [playerForPostResurrectionPromotion, setPlayerForPostResurrectionPromotion] = useState<PlayerColor | null>(null);
  const [isExtraTurnForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion] = useState<boolean>(false);

  const [firstBloodAchieved, setFirstBloodAchieved] = useState(false);
  const [playerWhoGotFirstBlood, setPlayerWhoGotFirstBlood] = useState<PlayerColor | null>(null);
  const [isAwaitingCommanderPromotion, setIsAwaitingCommanderPromotion] = useState(false);

  const [shroomSpawnCounter, setShroomSpawnCounter] = useState(0);
  const [nextShroomSpawnTurn, setNextShroomSpawnTurn] = useState(Math.floor(Math.random() * 6) + 5);

  const [activeTimerPlayer, setActiveTimerPlayer] = useState<PlayerColor | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [turnTimeouts, setTurnTimeouts] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);


  const { toast } = useToast();
  const mainContentRef = useRef<HTMLDivElement>(null);
  const applyBoardOpacityEffect = gameInfo.gameOver || isPromotingPawn || isAwaitingCommanderPromotion;

  const webRTC = useWebRTC(); 
  const [inputRoomId, setInputRoomId] = useState('');
  const [localPlayerColor, setLocalPlayerColor] = useState<PlayerColor | null>(null);

  const getPlayerDisplayName = useCallback((player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI && !webRTC.isConnected) name += " (AI)";
    if (player === 'black' && isBlackAI && !webRTC.isConnected) name += " (AI)";
    if (webRTC.isConnected && player === localPlayerColor) name += " (You)";
    return name;
  }, [isWhiteAI, isBlackAI, webRTC.isConnected, localPlayerColor]);
  
  const getKillStreakToastMessage = useCallback((streak: number): string | null => {
    if (streak === 1) return "KILL STREAK!";
    if (streak === 2) return "DOUBLE KILL!";
    if (streak === 3) return "TRIPLE KILL!";
    if (streak === 4) return "ULTRA KILL!";
    if (streak === 5) return "MONSTER KILL!";
    if (streak >= 6) return "RAMPAGE!";
    return null;
  }, []);

  const saveStateToHistory = useCallback(() => {
    const snapshot: GameSnapshot = {
      board: board.map(row => row.map(square => ({
        ...square,
        piece: square.piece ? { ...square.piece } : null,
        item: square.item ? { ...square.item } : null,
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
      gameMoveCounter: gameMoveCounter,
      enPassantTargetSquare: enPassantTargetSquare,

      isAwaitingPawnSacrifice: isAwaitingPawnSacrifice,
      playerToSacrificePawn: playerToSacrificePawn,
      boardForPostSacrifice: boardForPostSacrifice ? boardForPostSacrifice.map(row => row.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))) : null,
      playerWhoMadeQueenMove: playerWhoMadeQueenMove,
      isExtraTurnFromQueenMove: isExtraTurnFromQueenMove,
      isAwaitingRookSacrifice: isAwaitingRookSacrifice,
      playerToSacrificeForRook: playerToSacrificeForRook,
      rookToMakeInvulnerable: rookToMakeInvulnerable,
      boardForRookSacrifice: boardForRookSacrifice ? boardForRookSacrifice.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null }))) : null,
      originalTurnPlayerForRookSacrifice: originalTurnPlayerForRookSacrifice,
      isExtraTurnFromRookLevelUp: isExtraTurnFromRookLevelUp,
      isResurrectionPromotionInProgress: isResurrectionPromotionInProgress,
      playerForPostResurrectionPromotion: playerForPostResurrectionPromotion,
      isExtraTurnForPostResurrectionPromotion: isExtraTurnForPostResurrectionPromotion,
      promotionSquare: promotionSquare,
      promotionMoveWasCapture: promotionMoveWasCapture,
      promotionPawnOriginalLevel: promotionPawnOriginalLevel,
      firstBloodAchieved: firstBloodAchieved,
      playerWhoGotFirstBlood: playerWhoGotFirstBlood,
      isAwaitingCommanderPromotion: isAwaitingCommanderPromotion,
      shroomSpawnCounter: shroomSpawnCounter,
      nextShroomSpawnTurn: nextShroomSpawnTurn,
      activeTimerPlayer: activeTimerPlayer,
      remainingTime: remainingTime,
      turnTimeouts: { ...turnTimeouts },
    };
    setHistoryStack(prevHistory => {
      const newHistory = [...prevHistory, snapshot];
      if (newHistory.length > 20) return newHistory.slice(-20);
      return newHistory;
    });
  }, [
    board, currentPlayer, gameInfo, capturedPieces, killStreaks, lastCapturePlayer, boardOrientation, viewMode,
    isWhiteAI, isBlackAI, enemySelectedSquare, enemyPossibleMoves, positionHistory, lastMoveFrom, lastMoveTo, gameMoveCounter,
    enPassantTargetSquare,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion, promotionSquare, promotionMoveWasCapture, promotionPawnOriginalLevel,
    firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn,
    activeTimerPlayer, remainingTime, turnTimeouts 
  ]);

  const startOrResetTurnTimer = useCallback((player: PlayerColor) => {
    if (webRTC.isConnected && !isWhiteAI && !isBlackAI && !gameInfo.gameOver) {
      setActiveTimerPlayer(player);
      setRemainingTime(TURN_DURATION_SECONDS);
    } else {
      setActiveTimerPlayer(null);
      setRemainingTime(null);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [webRTC.isConnected, isWhiteAI, isBlackAI, gameInfo.gameOver]);

  const setGameInfoBasedOnExtraTurn = useCallback((currentBoard: BoardState, playerTakingExtraTurn: PlayerColor) => {
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    setCurrentPlayer(playerTakingExtraTurn);


    const opponentColor = playerTakingExtraTurn === 'white' ? 'black' : 'white';
    const opponentInCheck = isKingInCheck(currentBoard, opponentColor, null);

    if (opponentInCheck) {
      toast({ title: "Auto-Checkmate!", description: `${getPlayerDisplayName(playerTakingExtraTurn)} wins by delivering check with an extra turn!`, duration: 2500 });
      setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(playerTakingExtraTurn)} wins!`, isCheck: true, playerWithKingInCheck: opponentColor, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerTakingExtraTurn }));
      setActiveTimerPlayer(null); setRemainingTime(null); 
      if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'auto-checkmate', winner: playerTakingExtraTurn });
      return;
    }

    let message = `${getPlayerDisplayName(playerTakingExtraTurn)} gets an extra turn!`;

    const opponentIsStalemated = isStalemate(currentBoard, opponentColor, null);
    if (opponentIsStalemated) {
      setGameInfo(prev => ({ ...prev, message: `Stalemate! It's a draw.`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
      setActiveTimerPlayer(null); setRemainingTime(null); 
      if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'stalemate', winner: 'draw' });
    } else {
      setGameInfo(prev => ({ ...prev, message, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: false }));
    }
  }, [toast, getPlayerDisplayName, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setGameInfo, setCurrentPlayer, webRTC]);

  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor, currentEnPassantTarget: AlgebraicSquare | null) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);

    const inCheck = isKingInCheck(updatedBoard, nextPlayer, currentEnPassantTarget);
    let newPlayerWithKingInCheck: PlayerColor | null = null;
    let currentMessage = "\u00A0";

    if (inCheck) {
      newPlayerWithKingInCheck = nextPlayer;
      const mate = isCheckmate(updatedBoard, nextPlayer, currentEnPassantTarget);
      if (mate) {
        currentMessage = `Checkmate! ${getPlayerDisplayName(playerWhoseTurnEnded)} wins!`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: true, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: true, isStalemate: false, gameOver: true, winner: playerWhoseTurnEnded }));
        setActiveTimerPlayer(null); setRemainingTime(null); 
        if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'checkmate', winner: playerWhoseTurnEnded });
        return;
      } else {
        currentMessage = "Check!";
      }
    } else {
      const stale = isStalemate(updatedBoard, nextPlayer, currentEnPassantTarget);
      if (stale) {
        currentMessage = `Stalemate! It's a draw.`;
        setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
        setActiveTimerPlayer(null); setRemainingTime(null); 
        if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'stalemate', winner: 'draw' });
        return;
      }
    }
     setGameInfo(prev => ({ ...prev, message: currentMessage, isCheck: inCheck, playerWithKingInCheck: newPlayerWithKingInCheck, isCheckmate: false, isStalemate: false, gameOver: false }));

  }, [getPlayerDisplayName, setGameInfo, setCurrentPlayer, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, webRTC]);

  const processMoveEnd = useCallback((boardForNextStep: BoardState, playerWhoseTurnCompleted: PlayerColor, isExtraTurn: boolean, finalEnPassantTarget: AlgebraicSquare | null) => {
    let currentBoardState = boardForNextStep;
    const newGameMoveCounter = gameMoveCounter + 1;
    setGameMoveCounter(newGameMoveCounter);

    if (newGameMoveCounter > 0 && newGameMoveCounter % 9 === 0) {
      currentBoardState = spawnAnvil(currentBoardState);
      setBoard(currentBoardState);
      toast({ title: "Look Out!", description: "An anvil has dropped onto the board!", duration: 2500 });
    }

    let currentShroomCounter = shroomSpawnCounter + 1;
    setShroomSpawnCounter(currentShroomCounter);
    if (currentShroomCounter >= nextShroomSpawnTurn) {
        currentBoardState = spawnShroom(currentBoardState);
        setBoard(currentBoardState);
        toast({ title: "Look Out!", description: "A mystical Shroom 🍄 has appeared!", duration: 2500 });
        setShroomSpawnCounter(0);
        setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);
    }


    const nextPlayerForHash = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');
    const castlingRights = getCastlingRightsString(currentBoardState);
    const currentPositionHash = boardToPositionHash(currentBoardState, nextPlayerForHash, castlingRights, finalEnPassantTarget);

    const newHistory = [...positionHistory, currentPositionHash];
    setPositionHistory(newHistory);

    const repetitionCount = newHistory.filter(hash => hash === currentPositionHash).length;

    if (repetitionCount >= 3 && !gameInfo.isCheckmate && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw && !gameInfo.isInfiltrationWin) {
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
      setActiveTimerPlayer(null); setRemainingTime(null); 
      if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'threefold-repetition', winner: 'draw' });
      return;
    }

    const playerIsAI = (playerWhoseTurnCompleted === 'white' && isWhiteAI && !webRTC.isConnected) || (playerWhoseTurnCompleted === 'black' && isBlackAI && !webRTC.isConnected);
    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === playerWhoseTurnCompleted && playerIsAI) {
        setIsAwaitingCommanderPromotion(false);
    }

    const nextPlayerActual = isExtraTurn ? playerWhoseTurnCompleted : (playerWhoseTurnCompleted === 'white' ? 'black' : 'white');

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === nextPlayerActual && !((nextPlayerActual === 'white' && isWhiteAI && !webRTC.isConnected) || (nextPlayerActual === 'black' && isBlackAI && !webRTC.isConnected))) {
      setCurrentPlayer(nextPlayerActual);
      setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(nextPlayerActual)}: Select L1 Pawn for Commander!`}));
      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
      setActiveTimerPlayer(null); setRemainingTime(null);
      return;
    }

    if (gameInfo.gameOver) { 
      setActiveTimerPlayer(null); setRemainingTime(null);
      return;
    }

    if (isExtraTurn) {
      setGameInfoBasedOnExtraTurn(currentBoardState, playerWhoseTurnCompleted);
      if (!gameInfo.gameOver && webRTC.isConnected && !isWhiteAI && !isBlackAI) startOrResetTurnTimer(playerWhoseTurnCompleted);
    } else {
      completeTurn(currentBoardState, playerWhoseTurnCompleted, finalEnPassantTarget);
      if (!gameInfo.gameOver && webRTC.isConnected && !isWhiteAI && !isBlackAI) startOrResetTurnTimer(nextPlayerActual);
    }
  }, [
    positionHistory, toast, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.isThreefoldRepetitionDraw, gameInfo.isInfiltrationWin, gameInfo.gameOver,
    setGameInfo, setPositionHistory, setGameInfoBasedOnExtraTurn, completeTurn, getCastlingRightsString,
    boardToPositionHash, gameMoveCounter, setBoard, isAwaitingCommanderPromotion, playerWhoGotFirstBlood,
    getPlayerDisplayName, setCurrentPlayer, isWhiteAI, isBlackAI, 
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setIsAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn, setShroomSpawnCounter, setNextShroomSpawnTurn, startOrResetTurnTimer, webRTC
  ]);

  useEffect(() => {
    if (activeTimerPlayer && remainingTime !== null && remainingTime > 0 && !gameInfo.gameOver && webRTC.isConnected && !isWhiteAI && !isBlackAI) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); 
      timerIntervalRef.current = setInterval(() => {
        setRemainingTime(prevTime => {
          if (prevTime === null) return null;
          if (prevTime <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;

            const timedOutPlayer = activeTimerPlayer; 
            setActiveTimerPlayer(null); 

            if (timedOutPlayer) {
              const newTimeouts = { ...turnTimeouts, [timedOutPlayer]: (turnTimeouts[timedOutPlayer] || 0) + 1 };
              setTurnTimeouts(newTimeouts);
              toast({ title: "Time's Up!", description: `${getPlayerDisplayName(timedOutPlayer)} ran out of time. Turn passed.`, duration: 3000 });

              if (newTimeouts[timedOutPlayer] >= 3) {
                const winner = timedOutPlayer === 'white' ? 'black' : 'white';
                setGameInfo(prev => ({
                  ...prev,
                  message: `${getPlayerDisplayName(timedOutPlayer)} forfeits after 3 timeouts. ${getPlayerDisplayName(winner)} wins!`,
                  gameOver: true,
                  winner: winner
                }));
                 if (webRTC.isConnected) {
                    webRTC.sendMove({ type: 'forfeit-timeout', winner: winner, timedOutPlayer: timedOutPlayer });
                 }
              } else {
                const nextPlayerAfterTimeout = timedOutPlayer === 'white' ? 'black' : 'white';
                setCurrentPlayer(nextPlayerAfterTimeout);
                setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(nextPlayerAfterTimeout)}'s turn.` }));
                startOrResetTurnTimer(nextPlayerAfterTimeout);
                 if (webRTC.isConnected) {
                    webRTC.sendMove({ type: 'turn-pass-timeout', nextPlayer: nextPlayerAfterTimeout, timedOutPlayer: timedOutPlayer });
                 }
              }
            }
            return 0; 
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [activeTimerPlayer, remainingTime, gameInfo.gameOver, turnTimeouts, toast, getPlayerDisplayName, setCurrentPlayer, setGameInfo, webRTC, isWhiteAI, isBlackAI, startOrResetTurnTimer]);

  useEffect(() => {
    const handleIncomingMove = (moveData: any) => {
        console.log("Page received data from WebRTC:", moveData);
        if (moveData.type === 'forfeit-timeout') {
            toast({ title: "Game Over!", description: `${getPlayerDisplayName(moveData.timedOutPlayer)} forfeited due to timeouts. ${getPlayerDisplayName(moveData.winner)} wins!`, duration: 5000 });
            setGameInfo(prev => ({
                ...prev,
                message: `${getPlayerDisplayName(moveData.timedOutPlayer)} forfeits (timeouts). ${getPlayerDisplayName(moveData.winner)} wins!`,
                gameOver: true,
                winner: moveData.winner
            }));
            setActiveTimerPlayer(null);
            setRemainingTime(null);
            return;
        }
        if (moveData.type === 'turn-pass-timeout') {
            toast({ title: "Opponent Timed Out", description: `${getPlayerDisplayName(moveData.timedOutPlayer)}'s turn passed. It's now ${getPlayerDisplayName(moveData.nextPlayer)}'s turn.`, duration: 3000});
            setCurrentPlayer(moveData.nextPlayer);
            if (moveData.nextPlayer === localPlayerColor) {
                startOrResetTurnTimer(localPlayerColor!);
            } else {
                setActiveTimerPlayer(null);
                setRemainingTime(null);
            }
            return;
        }
        if (moveData.type === 'resign') {
            const resigningPlayer = moveData.resigningPlayer;
            const winner = resigningPlayer === 'white' ? 'black' : 'white';
            toast({ title: "Opponent Resigned!", description: `${getPlayerDisplayName(resigningPlayer)} has resigned. ${getPlayerDisplayName(winner)} wins!`, duration: 5000 });
            setGameInfo(prev => ({
                ...prev,
                message: `${getPlayerDisplayName(resigningPlayer)} resigned. ${getPlayerDisplayName(winner)} wins!`,
                gameOver: true,
                winner: winner
            }));
            setActiveTimerPlayer(null);
            setRemainingTime(null);
            return;
        }


        const move = moveData as Move;

        if (currentPlayer === localPlayerColor) {
          console.warn("WebRTC: Received move but it's local player's turn. Ignoring.");
          toast({ title: "Move Error", description: "Received opponent's move out of turn.", variant: "destructive" });
          return;
        }

        const { row: fromR, col: fromC } = algebraicToCoords(move.from);
        const piece = board[fromR]?.[fromC]?.piece;
        if (!piece || piece.color === localPlayerColor) {
            console.error("WebRTC: Invalid move received - no piece or wrong color.", move);
            toast({ title: "Invalid Move", description: "Opponent sent an invalid move.", variant: "destructive"});
            return;
        }
        
        saveStateToHistory();
        setLastMoveFrom(move.from);
        setLastMoveTo(move.to);
        
        const { newBoard, capturedPiece, pieceCapturedByAnvil, anvilPushedOffBoard, conversionEvents, originalPieceLevel, selfCheckByPushBack, queenLevelReducedEvents, isEnPassantCapture, promotedToInfiltrator, infiltrationWin, enPassantTargetSet, shroomConsumed } = applyMove(board, move, enPassantTargetSquare);
        
        setBoard(newBoard);
        setEnPassantTargetSquare(enPassantTargetSet);

        const playerWhoseTurnCompleted = currentPlayer; // This should be the opponent's color (the actual current player before this move)
        let opponentCapturedSomething = false;

        if (capturedPiece) {
          const opponentColor = localPlayerColor === 'white' ? 'black' : 'white'; // This is actually the player who made the move (the opponent)
          setCapturedPieces(prev => ({
            ...prev,
            [opponentColor]: [...(prev[opponentColor] || []), capturedPiece]
          }));
           setLastCapturePlayer(opponentColor);
           opponentCapturedSomething = true;
        }
        if (pieceCapturedByAnvil) {
            const opponentColor = localPlayerColor === 'white' ? 'black' : 'white';
            setCapturedPieces(prev => ({
              ...prev,
              [opponentColor]: [...(prev[opponentColor] || []), pieceCapturedByAnvil]
            }));
            setLastCapturePlayer(opponentColor);
            opponentCapturedSomething = true;
            toast({ title: "Opponent's Anvil Crush!", description: `${getPlayerDisplayName(opponentColor)}'s Pawn push made an Anvil capture a ${pieceCapturedByAnvil.type}!`, duration: 3000 });
        }

        let newOpponentKillStreak = killStreaks[playerWhoseTurnCompleted] || 0;
        if (opponentCapturedSomething) {
            newOpponentKillStreak++;
            if (!firstBloodAchieved) {
                setFirstBloodAchieved(true);
                setPlayerWhoGotFirstBlood(playerWhoseTurnCompleted);
                toast({ title: "OPPONENT GOT FIRST BLOOD!", description: `${getPlayerDisplayName(playerWhoseTurnCompleted)} drew first blood!`, duration: 4000});
            }
            const opponentStreakMsg = getKillStreakToastMessage(newOpponentKillStreak);
            if(opponentStreakMsg) {
                setKillStreakFlashMessage(`OPPONENT: ${opponentStreakMsg}`);
                setKillStreakFlashMessageKey(k => k + 1);
            }
        } else {
            newOpponentKillStreak = 0;
        }
        setKillStreaks(prev => ({ ...prev, [playerWhoseTurnCompleted]: newOpponentKillStreak }));


        let extraTurnForOpponent = false; 
        
        if (shroomConsumed) {
             const movedPieceDataOpp = newBoard[algebraicToCoords(move.to).row]?.[algebraicToCoords(move.to).col]?.piece;
            if(movedPieceDataOpp) {
                toast({ title: "Opponent Level Up!", description: `${getPlayerDisplayName(playerWhoseTurnCompleted)}'s ${movedPieceDataOpp.type} consumed a Shroom 🍄 and leveled up to L${movedPieceDataOpp.level}!`, duration: 3000 });
            }
        }

        const opponentOriginalPiece = board[fromR]?.[fromC]?.piece;
        if (opponentOriginalPiece?.type === 'pawn' && (originalPieceLevel || 0) >= 5 && (algebraicToCoords(move.to).row === 0 || algebraicToCoords(move.to).row === 7) && move.type !== 'enpassant') {
            extraTurnForOpponent = true;
        }
        if (opponentOriginalPiece?.type === 'commander' && (originalPieceLevel || 0) >= 5 && move.type === 'promotion' && move.promoteTo === 'hero') {
            extraTurnForOpponent = true;
        }
         if ((capturedPiece || pieceCapturedByAnvil) && newOpponentKillStreak === 6) {
             extraTurnForOpponent = true;
         }


        setCurrentPlayer(extraTurnForOpponent ? playerWhoseTurnCompleted : localPlayerColor!);
        if (!gameInfo.gameOver && !isWhiteAI && !isBlackAI) {
             startOrResetTurnTimer(extraTurnForOpponent ? playerWhoseTurnCompleted : localPlayerColor!);
        }
        processMoveEnd(newBoard, playerWhoseTurnCompleted, extraTurnForOpponent, enPassantTargetSet);
        toast({ title: "Opponent Move", description: `From ${move.from} to ${move.to}`, duration: 2000 });
    };

    webRTC.setOnMoveReceivedCallback(handleIncomingMove);
    return () => {
        webRTC.setOnMoveReceivedCallback(null);
    };
  }, [webRTC, toast, startOrResetTurnTimer, currentPlayer, isWhiteAI, isBlackAI, setCurrentPlayer, localPlayerColor, board, enPassantTargetSquare, saveStateToHistory, setLastMoveFrom, setLastMoveTo, setBoard, setEnPassantTargetSquare, setCapturedPieces, gameInfo.gameOver, setLastCapturePlayer, getPlayerDisplayName, processMoveEnd, killStreaks, firstBloodAchieved, getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey, setFirstBloodAchieved, setPlayerWhoGotFirstBlood]);


  useEffect(() => {
    const initializeAI = async () => {
      try {
        const VibeChessAIModule = await import('@/lib/vibe-chess-ai');
        const ActualVibeChessAI = VibeChessAIModule.VibeChessAI;
        if (ActualVibeChessAI && typeof ActualVibeChessAI === 'function') {
          aiInstanceRef.current = new ActualVibeChessAI(2);
        } else {
          console.error("Failed to load VibeChessAI constructor dynamically from named export.", ActualVibeChessAI);
          toast({
            title: "AI Initialization Error",
            description: "Could not load the AI engine (named export not found or not a constructor).",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        console.error("Error dynamically importing VibeChessAI:", err);
        toast({
          title: "AI Import Error",
          description: `There was an issue loading the AI component: ${err.message}`,
          variant: "destructive",
        });
      }
    };
    initializeAI();
  }, [toast]);


  const determineBoardOrientation = useCallback((): PlayerColor => {
    if (isWhiteAI && isBlackAI && !webRTC.isConnected) return 'white';
    if (isWhiteAI && !isBlackAI && !webRTC.isConnected) return 'black';
    if (!isWhiteAI && isBlackAI && !webRTC.isConnected) return 'white';

    if (webRTC.isConnected) {
        return localPlayerColor || 'white';
    }

    if (viewMode === 'flipping') return currentPlayer;
    return 'white';
  }, [isWhiteAI, isBlackAI, webRTC.isConnected, localPlayerColor, viewMode, currentPlayer]);

  useEffect(() => {
    setBoardOrientation(determineBoardOrientation());
  }, [determineBoardOrientation, setBoardOrientation]);

  const processPawnSacrificeCheck = useCallback((
    boardAfterPrimaryMove: BoardState,
    playerWhoseQueenLeveled: PlayerColor,
    queenMovedWithThis: Move | null,
    originalPieceLevelIfKnown: number | undefined,
    isExtraTurnFromOriginalMove: boolean,
    currentEnPassantTarget: AlgebraicSquare | null
  ): boolean => {

    if (!queenMovedWithThis) {
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, currentEnPassantTarget);
        return false;
    }

    const { row: toR, col: toC } = algebraicToCoords(queenMovedWithThis.to);
    const queenOnSquare = boardAfterPrimaryMove[toR]?.[toC]?.piece;

    if (!queenOnSquare || queenOnSquare.type !== 'queen' || queenOnSquare.color !== playerWhoseQueenLeveled) {
        processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, currentEnPassantTarget);
        return false;
    }

    const currentQueenLevel = Number(queenOnSquare.level || 1);
    const previousLevelOfThisPiece = Number(originalPieceLevelIfKnown || 0);

    let leveledUpToQueenL7 = false;
    if (currentQueenLevel === 7) {
        if (queenMovedWithThis?.type === 'promotion' && queenMovedWithThis.promoteTo === 'queen') {
            leveledUpToQueenL7 = true;
        } else if (queenMovedWithThis?.type !== 'promotion' && queenOnSquare.type === 'queen' && previousLevelOfThisPiece < 7) {
            leveledUpToQueenL7 = true;
        }
    }


    if (leveledUpToQueenL7) {
      let hasPawnsToSacrifice = false;
      for (const row of boardAfterPrimaryMove) {
        for (const square of row) {
          if (square.piece && (square.piece.type === 'pawn' || square.piece.type === 'commander') && square.piece.color === playerWhoseQueenLeveled) {
            hasPawnsToSacrifice = true;
            break;
          }
        }
        if (hasPawnsToSacrifice) break;
      }

      if (hasPawnsToSacrifice) {
        const isCurrentPlayerAI = (playerWhoseQueenLeveled === 'white' && isWhiteAI && !webRTC.isConnected) || (playerWhoseQueenLeveled === 'black' && isBlackAI && !webRTC.isConnected);
        if (isCurrentPlayerAI) {
          let pawnSacrificed = false;
          const boardCopyForAISacrifice = boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
          let sacrificedAIPawn: Piece | null = null;

          for (let r_idx = 0; r_idx < 8; r_idx++) {
            for (let c_idx = 0; c_idx < 8; c_idx++) {
              const pieceAtSquare = boardCopyForAISacrifice[r_idx][c_idx].piece;
              if (pieceAtSquare && (pieceAtSquare.type === 'pawn' || pieceAtSquare.type === 'commander') && pieceAtSquare.color === playerWhoseQueenLeveled) {
                sacrificedAIPawn = { ...pieceAtSquare, id: `${pieceAtSquare.id}_sac_AI_${Date.now()}` };
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
          toast({ title: "Queen's Ascension!", description: `${getPlayerDisplayName(playerWhoseQueenLeveled)} (AI) sacrificed a Pawn/Commander for L7 Queen!`, duration: 2500 });
          processMoveEnd(boardCopyForAISacrifice, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, currentEnPassantTarget);
          return false;
        } else {
          setIsAwaitingPawnSacrifice(true);
          setPlayerToSacrificePawn(playerWhoseQueenLeveled);
          setBoardForPostSacrifice(boardAfterPrimaryMove.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null }))));
          setPlayerWhoMadeQueenMove(playerWhoseQueenLeveled);
          setIsExtraTurnFromQueenMove(isExtraTurnFromOriginalMove);
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(playerWhoseQueenLeveled)}, select Pawn/Commander to sacrifice for L7 Queen!` }));
          setActiveTimerPlayer(null); setRemainingTime(null); 
          return true;
        }
      }
    }
    processMoveEnd(boardAfterPrimaryMove, playerWhoseQueenLeveled, isExtraTurnFromOriginalMove, currentEnPassantTarget);
    return false;
  }, [getPlayerDisplayName, toast, setGameInfo, setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, processMoveEnd, isWhiteAI, isBlackAI, setBoard, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove, setCapturedPieces, algebraicToCoords, setActiveTimerPlayer, setRemainingTime, webRTC.isConnected]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    let humanPlayerAchievedFirstBloodThisTurn = false;

    if (webRTC.isConnected && localPlayerColor !== currentPlayer && !((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI)) ) {
        toast({ title: "Not Your Turn", description: "Wait for your opponent to move.", duration: 2000 });
        return;
    }

    if (gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress) {
      if (!(isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)) {
          return;
      }
    }

    if (webRTC.isConnected && !isWhiteAI && !isBlackAI && activeTimerPlayer === currentPlayer) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }


    const { row, col } = algebraicToCoords(algebraic);
    const clickedSquareState = board[row]?.[col];
    const clickedPiece = clickedSquareState?.piece;
    const clickedItem = clickedSquareState?.item;
    let originalPieceLevelBeforeMove: number | undefined;
    let currentEnPassantTargetForThisTurn = enPassantTargetSquare;
    let moveBeingMade: Move | null = null;

    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer) {
      if (clickedPiece && clickedPiece.type === 'pawn' && clickedPiece.color === currentPlayer && clickedPiece.level === 1) {
        saveStateToHistory();
        const boardAfterCommanderPromo = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
        boardAfterCommanderPromo[row][col].piece!.type = 'commander';
        boardAfterCommanderPromo[row][col].piece!.id = `${boardAfterCommanderPromo[row][col].piece!.id}_CMD`;
        setBoard(boardAfterCommanderPromo);
        toast({ title: "Commander Promoted!", description: `${getPlayerDisplayName(currentPlayer)}'s Pawn on ${algebraic} is now a Commander!`, duration: 3000});
        
        if (webRTC.isConnected) {
            webRTC.sendMove({ type: 'commander-promo', player: currentPlayer, square: algebraic });
        }

        const playerWhoActed = playerWhoGotFirstBlood;
        let wasExtraTurnFromStreak = false;
        if (historyStack.length > 0) {
            const previousSnapshot = historyStack[historyStack.length - 1];
            if (previousSnapshot && previousSnapshot.killStreaks && playerWhoActed) {
                const streakWhenFirstBloodOccurred = previousSnapshot.killStreaks[playerWhoActed];
                 wasExtraTurnFromStreak = streakWhenFirstBloodOccurred === 6;
            }
        } else if (playerWhoActed) {
            wasExtraTurnFromStreak = killStreaks[playerWhoActed] === 6;
        }

        setIsAwaitingCommanderPromotion(false);
        processMoveEnd(boardAfterCommanderPromo, playerWhoActed!, wasExtraTurnFromStreak, null);

        setSelectedSquare(null);
        setPossibleMoves([]);
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
        setLastMoveFrom(null);
        setLastMoveTo(algebraic);
        setEnPassantTargetSquare(null);
        return;

      } else {
        toast({title: "Invalid Commander Choice", description: "Select one of your own Level 1 Pawns to promote.", duration: 2500});
      }
      return;
    }


    if (isAwaitingPawnSacrifice && playerToSacrificePawn === currentPlayer) {
      if (clickedPiece && (clickedPiece.type === 'pawn' || clickedPiece.type === 'commander') && clickedPiece.color === currentPlayer) {
        let boardAfterSacrifice = boardForPostSacrifice!.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
        const pawnToSacrificeBase = { ...boardAfterSacrifice[row][col].piece! };
        const pawnToSacrifice = { ...pawnToSacrificeBase, id: `${pawnToSacrificeBase.id}_sac_${globalResurrectionIdCounter++}`};
        boardAfterSacrifice[row][col].piece = null;

        setBoard(boardAfterSacrifice);

        const opponentOfSacrificer = playerWhoMadeQueenMove! === 'white' ? 'black' : 'white';
        setCapturedPieces(prevCaptured => {
          const newCaptured = { ...prevCaptured };
          newCaptured[opponentOfSacrificer] = [...(newCaptured[opponentOfSacrificer] || []), pawnToSacrifice];
          return newCaptured;
        });

        toast({ title: "Pawn/Commander Sacrificed!", description: `${getPlayerDisplayName(currentPlayer)} sacrificed their ${pawnToSacrifice.type}!`, duration: 2500 });
        if (webRTC.isConnected) {
            webRTC.sendMove({ type: 'pawn-sacrifice', player: currentPlayer, sacrificedPiece: pawnToSacrifice, square: algebraic });
        }


        const playerWhoTriggeredSacrifice = playerWhoMadeQueenMove;
        const extraTurnAfterSacrifice = isExtraTurnFromQueenMove;

        setIsAwaitingPawnSacrifice(false);
        setPlayerToSacrificePawn(null);
        setBoardForPostSacrifice(null);
        setPlayerWhoMadeQueenMove(null);
        setIsExtraTurnFromQueenMove(false);

        setLastMoveFrom(null);
        setLastMoveTo(algebraic);

        processMoveEnd(boardAfterSacrifice, playerWhoTriggeredSacrifice!, extraTurnAfterSacrifice, null);
        setEnPassantTargetSquare(null);
      } else {
        toast({ title: "Invalid Sacrifice", description: "Please select one of your Pawns/Commanders to sacrifice for the Queen.", duration: 2500 });
      }
      return;
    }

    if (clickedItem && clickedItem.type !== 'shroom') {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
        setEnPassantTargetSquare(null);
        return;
    }

    if (isAwaitingRookSacrifice && playerToSacrificeForRook === currentPlayer) {
      toast({ title: "Rook Action", description: "Rook ability is now automatic on L4+.", duration: 2500 });
      setIsAwaitingRookSacrifice(false);
      setPlayerToSacrificeForRook(null);
      setRookToMakeInvulnerable(null);
      processMoveEnd(boardForRookSacrifice || board, originalTurnPlayerForRookSacrifice || currentPlayer, isExtraTurnFromRookLevelUp || false, null);
      setBoardForRookSacrifice(null);
      setOriginalTurnPlayerForRookSacrifice(null);
      setIsExtraTurnFromRookLevelUp(false);
      setEnPassantTargetSquare(null);
      setActiveTimerPlayer(null); setRemainingTime(null); 
      return;
    }

    let finalBoardStateForTurn = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    let finalCapturedPiecesStateForTurn = {
      white: capturedPieces.white.map(p => ({ ...p })),
      black: capturedPieces.black.map(p => ({ ...p }))
    };
    let newEnPassantTargetForNextTurn: AlgebraicSquare | null = null;


    if (selectedSquare) {
      const { row: fromR_selected, col: fromC_selected } = algebraicToCoords(selectedSquare);
      const pieceDataAtSelectedSquareFromBoard = board[fromR_selected]?.[fromC_selected];
      const pieceToMoveFromSelected = pieceDataAtSelectedSquareFromBoard?.piece;

      if (!pieceToMoveFromSelected) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setIsMoveProcessing(false);
        setEnPassantTargetSquare(null);
        return;
      }

      if (selectedSquare === algebraic && !(pieceToMoveFromSelected.type === 'knight' || pieceToMoveFromSelected.type === 'hero') && (Number(pieceToMoveFromSelected.level || 1)) >= 5) {
        setSelectedSquare(null);
        setPossibleMoves([]);
        setEnemySelectedSquare(null);
        setEnemyPossibleMoves([]);
        return;
      }

      originalPieceLevelBeforeMove = Number(pieceToMoveFromSelected.level || 1);

      const freshlyCalculatedMovesForThisPiece = getPossibleMoves(board, selectedSquare, currentEnPassantTargetForThisTurn);
      let isMoveInFreshList = freshlyCalculatedMovesForThisPiece.includes(algebraic);

      moveBeingMade = { from: selectedSquare, to: algebraic }; 

      if (pieceToMoveFromSelected.type === 'king' && Math.abs(fromC_selected - col) === 2) {
          if (freshlyCalculatedMovesForThisPiece.includes(algebraic)) { 
            moveBeingMade.type = 'castle';
          }
      } else if (pieceToMoveFromSelected.type === 'pawn' && algebraic === currentEnPassantTargetForThisTurn && !board[row][col].piece) {
         moveBeingMade.type = 'enpassant';
      } else if (isMoveInFreshList && board[row]?.[col]?.piece && board[row]?.[col]?.piece?.color !== pieceToMoveFromSelected.color) {
         moveBeingMade.type = 'capture';
      }


      if (selectedSquare === algebraic && (pieceToMoveFromSelected.type === 'knight' || pieceToMoveFromSelected.type === 'hero') && (Number(pieceToMoveFromSelected.level || 1)) >= 5) {
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(selectedSquare);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);
        moveBeingMade = { from: selectedSquare, to: selectedSquare, type: 'self-destruct' };


        const selfDestructPlayer = currentPlayer;
        const opponentOfSelfDestructPlayer = selfDestructPlayer === 'white' ? 'black' : 'white';
        let selfDestructCapturedSomething = false;
        let piecesDestroyedCount = 0;
        let anvilsDestroyedCount = 0;
        let boardAfterDestruct = finalBoardStateForTurn.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));

        const tempBoardForCheck = boardAfterDestruct.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));
        tempBoardForCheck[fromR_selected][fromC_selected].piece = null;
        if (isKingInCheck(tempBoardForCheck, selfDestructPlayer, null)) {
          toast({ title: "Illegal Move", description: "Cannot self-destruct into check.", duration: 2500 });
          setIsMoveProcessing(false); setAnimatedSquareTo(null); return;
        }

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const adjR = fromR_selected + dr;
            const adjC = fromC_selected + dc;
            if (isValidSquare(adjR, adjC)) {
              const victimSquareState = boardAfterDestruct[adjR][adjC];

              if (victimSquareState.item?.type === 'anvil') {
                boardAfterDestruct[adjR][adjC].item = null;
                anvilsDestroyedCount++;
              }

              const victimPiece = boardAfterDestruct[adjR][adjC].piece;
              if (victimPiece && victimPiece.color !== selfDestructPlayer && victimPiece.type !== 'king') {
                const isQueenTarget = victimPiece.type === 'queen';
                const isNormallyInvulnerable = !isQueenTarget && isPieceInvulnerableToAttack(victimPiece, pieceToMoveFromSelected);

                if (!isNormallyInvulnerable || (isQueenTarget && ['commander', 'hero', 'infiltrator'].includes(pieceToMoveFromSelected.type))) {
                  if (pieceToMoveFromSelected.type !== 'infiltrator') {
                    finalCapturedPiecesStateForTurn[selfDestructPlayer].push({ ...victimPiece });
                  }
                  boardAfterDestruct[adjR][adjC].piece = null;
                  toast({ title: "Self-Destruct!", description: `${getPlayerDisplayName(selfDestructPlayer)} ${pieceToMoveFromSelected.type} obliterated ${victimPiece.color} ${victimPiece.type}${isQueenTarget ? ' (bypassing invulnerability!)' : ''}.`, duration: 3000 });
                  selfDestructCapturedSomething = true;
                  piecesDestroyedCount++;
                } else {
                  toast({ title: "Invulnerable!", description: `${getPlayerDisplayName(selfDestructPlayer)} ${pieceToMoveFromSelected.type}'s self-destruct failed on invulnerable ${victimPiece.type}.`, duration: 2500 });
                }
              }
            }
          }
        }
        boardAfterDestruct[fromR_selected][fromC_selected].piece = null;
        finalBoardStateForTurn = boardAfterDestruct;

        if (anvilsDestroyedCount > 0) {
            toast({ title: "Anvils Shattered!", description: `${getPlayerDisplayName(selfDestructPlayer)} ${pieceToMoveFromSelected.type} destroyed ${anvilsDestroyedCount} anvil${anvilsDestroyedCount > 1 ? 's' : ''}!`, duration: 2500 });
        }

        let newStreakForSelfDestructPlayer = killStreaks[selfDestructPlayer] || 0;
        if (selfDestructCapturedSomething) {
            newStreakForSelfDestructPlayer += piecesDestroyedCount;
            if (!firstBloodAchieved) {
                setKillStreakFlashMessage("FIRST BLOOD!");
                setKillStreakFlashMessageKey(k => k + 1);
            } else {
                const streakMsg = getKillStreakToastMessage(newStreakForSelfDestructPlayer);
                if (streakMsg) {
                    setKillStreakFlashMessage(streakMsg);
                    setKillStreakFlashMessageKey(k => k + 1);
                }
            }
        } else {
            if (anvilsDestroyedCount === 0) {
                newStreakForSelfDestructPlayer = 0;
            }
        }
        setKillStreaks(prev => ({ ...prev, [selfDestructPlayer]: newStreakForSelfDestructPlayer }));


        if (selfDestructCapturedSomething) {
          setLastCapturePlayer(selfDestructPlayer);
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
           if(lastCapturePlayer === selfDestructPlayer) setLastCapturePlayer(null);
        }

        if (selfDestructCapturedSomething && !firstBloodAchieved) {
            const isCurrentPlayerHuman = !((selfDestructPlayer === 'white' && isWhiteAI && !webRTC.isConnected) || (selfDestructPlayer === 'black' && isBlackAI && !webRTC.isConnected));
            if (isCurrentPlayerHuman) {
                humanPlayerAchievedFirstBloodThisTurn = true;
                 setFirstBloodAchieved(true);
                 setPlayerWhoGotFirstBlood(selfDestructPlayer);
                 setGameInfo(prev => ({...prev, message: `${getPlayerDisplayName(selfDestructPlayer)}: Select L1 Pawn for Commander!`}));
                 setIsAwaitingCommanderPromotion(true);
            } else {
                 setFirstBloodAchieved(true);
                 setPlayerWhoGotFirstBlood(selfDestructPlayer);
            }
            toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(selfDestructPlayer)} can promote a Level 1 Pawn to Commander!`, duration: 4000 });
        } else if (selfDestructCapturedSomething && newStreakForSelfDestructPlayer === 3) {
              let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] || [])];
              if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                const pieceToResOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
                if (pieceToResOriginal) {
                  const emptySquares: AlgebraicSquare[] = [];
                  for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece && !finalBoardStateForTurn[r_idx][c_idx].item) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                  if (emptySquares.length > 0) {
                    const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                    const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                    const newUniqueSuffix = globalResurrectionIdCounter++;
                    const resurrectedPiece: Piece = { ...pieceToResOriginal, level: 1, id: `${pieceToResOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResOriginal.type === 'king' || pieceToResOriginal.type === 'rook' ? false : pieceToResOriginal.hasMoved, invulnerableTurnsRemaining: 0 };

                    const promoRow = selfDestructPlayer === 'white' ? 0 : 7;
                    if (resurrectedPiece.type === 'commander' && resR === promoRow) {
                        resurrectedPiece.type = 'hero';
                        resurrectedPiece.id = `${resurrectedPiece.id}_HeroPromo_Res`;
                        toast({ title: "Resurrection & Promotion!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s Commander resurrected and promoted to Hero! (L1)`, duration: 3000 });
                    } else {
                         toast({ title: "Resurrection!", description: `${getPlayerDisplayName(selfDestructPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                    finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                    finalCapturedPiecesStateForTurn[opponentOfSelfDestructPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResOriginal.id);


                    if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                        setPlayerForPostResurrectionPromotion(selfDestructPlayer);
                        setIsExtraTurnForPostResurrectionPromotion(newStreakForSelfDestructPlayer === 6);
                        setIsResurrectionPromotionInProgress(true);
                        setIsPromotingPawn(true);
                        setPromotionSquare(randomSquareAlg);
                        setBoard(finalBoardStateForTurn);
                        setCapturedPieces(finalCapturedPiecesStateForTurn);
                        setIsMoveProcessing(false);
                        setAnimatedSquareTo(null);
                        return;
                    }
                  }
                }
              }
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);
        setEnPassantTargetSquare(null);

        if (webRTC.isConnected && moveBeingMade) {
            webRTC.sendMove(moveBeingMade);
        }

        setTimeout(() => {
          setAnimatedSquareTo(null);
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          if (humanPlayerAchievedFirstBloodThisTurn) {
             setIsMoveProcessing(false);
             return;
          }

          const streakGrantsExtraTurn = newStreakForSelfDestructPlayer === 6;
          processMoveEnd(finalBoardStateForTurn, selfDestructPlayer, streakGrantsExtraTurn, null);
          setIsMoveProcessing(false);
        }, 800);
        return;
      } else if (isMoveInFreshList && moveBeingMade) {
        saveStateToHistory();
        setLastMoveFrom(selectedSquare);
        setLastMoveTo(algebraic);
        setIsMoveProcessing(true);
        setAnimatedSquareTo(algebraic);

        const applyMoveResult = applyMove(finalBoardStateForTurn, moveBeingMade, currentEnPassantTargetForThisTurn);
        finalBoardStateForTurn = applyMoveResult.newBoard;
        const capturedPieceFromApply = applyMoveResult.capturedPiece;
        const pieceCapturedByAnvilFromApply = applyMoveResult.pieceCapturedByAnvil;
        const anvilPushedOffBoardFromApply = applyMoveResult.anvilPushedOffBoard;
        const conversionEventsFromApply = applyMoveResult.conversionEvents;
        const levelFromApplyMoveInternal = applyMoveResult.originalPieceLevel;
        const selfCheckByPushBackFromApply = applyMoveResult.selfCheckByPushBack;
        const queenLevelReducedEventsFromApply = applyMoveResult.queenLevelReducedEvents;
        const enPassantHappenedFromApply = applyMoveResult.isEnPassantCapture;
        const becameInfiltratorFromApply = applyMoveResult.promotedToInfiltrator;
        const gameWonByInfiltrationFromApply = applyMoveResult.infiltrationWin;
        newEnPassantTargetForNextTurn = applyMoveResult.enPassantTargetSet;
        const shroomConsumedFromApply = applyMoveResult.shroomConsumed;


        if (gameWonByInfiltrationFromApply) {
          setBoard(finalBoardStateForTurn);
          setCapturedPieces(finalCapturedPiecesStateForTurn);
          setEnPassantTargetSquare(newEnPassantTargetForNextTurn);
          toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, duration: 5000 });
          setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
          setIsMoveProcessing(false); setAnimatedSquareTo(null);
          setActiveTimerPlayer(null); setRemainingTime(null); 
           if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'infiltration', winner: currentPlayer });
          return;
        }

        if (enPassantHappenedFromApply) {
            toast({ title: "En Passant!", description: `${getPlayerDisplayName(currentPlayer)} captures En Passant and promotes to Infiltrator!`, duration: 3000 });
        }
        if (becameInfiltratorFromApply) {
        }
        if (shroomConsumedFromApply) {
            const movedPieceData = finalBoardStateForTurn[algebraicToCoords(algebraic).row]?.[algebraicToCoords(algebraic).col]?.piece;
            if(movedPieceData) {
                toast({ title: "Level Up!", description: `${getPlayerDisplayName(currentPlayer)}'s ${movedPieceData.type} consumed a Shroom 🍄 and leveled up to L${movedPieceData.level}!`, duration: 3000 });
            }
        }


        if (queenLevelReducedEventsFromApply && queenLevelReducedEventsFromApply.length > 0) {
            queenLevelReducedEventsFromApply.forEach(event => {
                const queenOwnerName = getPlayerDisplayName(event.reducedByKingOfColor === 'white' ? 'black' : 'white');
                toast({
                title: "King's Dominion!",
                description: `${getPlayerDisplayName(event.reducedByKingOfColor)} King leveled up! ${queenOwnerName}'s Queen (ID: ...${event.queenId.slice(-4)}) level reduced by ${event.reductionAmount} from L${event.originalLevel} to L${event.newLevel}.`,
                duration: 3500,
                });
            });
        }


        if (selfCheckByPushBackFromApply) {
          const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
          toast({
            title: "Auto-Checkmate!",
            description: `${getPlayerDisplayName(currentPlayer)}'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
            variant: "destructive",
            duration: 5000
          });
          setGameInfo(prev => ({
            ...prev,
            message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
            isCheck: true,
            playerWithKingInCheck: currentPlayer,
            isCheckmate: true,
            isStalemate: false,
            gameOver: true,
            winner: opponentPlayer
          }));
          setBoard(finalBoardStateForTurn);
          setEnPassantTargetSquare(newEnPassantTargetForNextTurn);
          setIsMoveProcessing(false);
          setAnimatedSquareTo(null);
          setSelectedSquare(null); setPossibleMoves([]);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
          setActiveTimerPlayer(null); setRemainingTime(null); 
          if (webRTC.isConnected) webRTC.sendMove({ type: 'game-over', reason: 'self-check', winner: opponentPlayer, byPlayer: currentPlayer });
          return;
        }

        const capturingPlayer = currentPlayer;
        const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';
        const pieceWasCapturedThisTurn = !!capturedPieceFromApply || !!pieceCapturedByAnvilFromApply;
        let newStreakForCapturingPlayer = killStreaks[capturingPlayer] || 0;

        if (pieceWasCapturedThisTurn) {
            newStreakForCapturingPlayer++;
            if (!firstBloodAchieved) {
                setKillStreakFlashMessage("FIRST BLOOD!");
                setKillStreakFlashMessageKey(k => k + 1);
            } else {
                const streakMsg = getKillStreakToastMessage(newStreakForCapturingPlayer);
                if (streakMsg) {
                    setKillStreakFlashMessage(streakMsg);
                    setKillStreakFlashMessageKey(k => k + 1);
                }
            }
        } else {
            newStreakForCapturingPlayer = 0;
        }
        setKillStreaks(prev => ({ ...prev, [capturingPlayer]: newStreakForCapturingPlayer }));

        const { row: toR_final_check_infiltrator, col: toC_final_check_infiltrator } = algebraicToCoords(algebraic);
        const pieceThatMadeTheMove = finalBoardStateForTurn[toR_final_check_infiltrator]?.[toC_final_check_infiltrator]?.piece;

        if (capturedPieceFromApply) {
          setLastCapturePlayer(capturingPlayer);
          if (!(pieceThatMadeTheMove && pieceThatMadeTheMove.type === 'infiltrator')) {
            finalCapturedPiecesStateForTurn[capturingPlayer].push(capturedPieceFromApply);
          } else {
            toast({ title: "Obliterated!", description: `${getPlayerDisplayName(capturingPlayer)}'s Infiltrator obliterated ${capturedPieceFromApply.color} ${capturedPieceFromApply.type}!`, duration: 3000});
          }
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else if (pieceCapturedByAnvilFromApply) {
          setLastCapturePlayer(capturingPlayer);
          finalCapturedPiecesStateForTurn[capturingPlayer].push(pieceCapturedByAnvilFromApply);
          toast({ title: "Anvil Crush!", description: `${getPlayerDisplayName(capturingPlayer)}'s Pawn push made an Anvil capture a ${pieceCapturedByAnvilFromApply.type}!`, duration: 3000 });
          setShowCaptureFlash(true);
          setCaptureFlashKey(k => k + 1);
        } else {
          if(lastCapturePlayer === capturingPlayer) setLastCapturePlayer(null);
        }
        if (anvilPushedOffBoardFromApply) {
            toast({ title: "Anvil Removed!", description: "Anvil pushed off the board.", duration: 2000 });
        }

        if (pieceWasCapturedThisTurn && !firstBloodAchieved) {
            const isCurrentPlayerHuman = !((capturingPlayer === 'white' && isWhiteAI && !webRTC.isConnected) || (capturingPlayer === 'black' && isBlackAI && !webRTC.isConnected));
            if (isCurrentPlayerHuman) {
                humanPlayerAchievedFirstBloodThisTurn = true;
                setFirstBloodAchieved(true);
                setPlayerWhoGotFirstBlood(capturingPlayer);
                setGameInfo(prev => ({...prev, message: `${getPlayerDisplayName(capturingPlayer)}: Select L1 Pawn for Commander!`}));
                setIsAwaitingCommanderPromotion(true);
            } else {
                setFirstBloodAchieved(true);
                setPlayerWhoGotFirstBlood(capturingPlayer);
            }
            toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(capturingPlayer)} can promote a Level 1 Pawn to Commander!`, duration: 4000 });
        } else if (pieceWasCapturedThisTurn && newStreakForCapturingPlayer === 3) {
              let piecesOfCurrentPlayerCapturedByOpponent = [...(finalCapturedPiecesStateForTurn[opponentPlayer] || [])];
              if (piecesOfCurrentPlayerCapturedByOpponent.length > 0) {
                const pieceToResurrectOriginal = piecesOfCurrentPlayerCapturedByOpponent.pop();
                if (pieceToResurrectOriginal) {
                  const emptySquares: AlgebraicSquare[] = [];
                  for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForTurn[r_idx][c_idx].piece && !finalBoardStateForTurn[r_idx][c_idx].item) emptySquares.push(coordsToAlgebraic(r_idx, c_idx));
                  if (emptySquares.length > 0) {
                    const randomSquareAlg = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                    const { row: resR, col: resC } = algebraicToCoords(randomSquareAlg);
                    const newUniqueSuffix = globalResurrectionIdCounter++;
                    const resurrectedPiece: Piece = { ...pieceToResurrectOriginal, level: 1, id: `${pieceToResurrectOriginal.id}_res_${newUniqueSuffix}_${Date.now()}`, hasMoved: pieceToResurrectOriginal.type === 'king' || pieceToResurrectOriginal.type === 'rook' ? false : pieceToResurrectOriginal.hasMoved, invulnerableTurnsRemaining: 0 };

                    const promoRow = capturingPlayer === 'white' ? 0 : 7;
                     if (resurrectedPiece.type === 'commander' && resR === promoRow) {
                        resurrectedPiece.type = 'hero';
                        resurrectedPiece.id = `${resurrectedPiece.id}_HeroPromo_Res`;
                        toast({ title: "Resurrection & Promotion!", description: `${getPlayerDisplayName(capturingPlayer)}'s Commander resurrected and promoted to Hero! (L1)`, duration: 3000 });
                    } else {
                        toast({ title: "Resurrection!", description: `${getPlayerDisplayName(capturingPlayer)}'s ${resurrectedPiece.type} returns! (L1)`, duration: 2500 });
                    }
                    finalBoardStateForTurn[resR][resC].piece = resurrectedPiece;
                    finalCapturedPiecesStateForTurn[opponentPlayer] = piecesOfCurrentPlayerCapturedByOpponent.filter(p => p.id !== pieceToResurrectOriginal.id);


                    if (resurrectedPiece.type === 'pawn' && resR === promoRow) {
                        setPlayerForPostResurrectionPromotion(capturingPlayer);
                        setIsExtraTurnForPostResurrectionPromotion(newStreakForCapturingPlayer === 6);
                        setIsResurrectionPromotionInProgress(true);
                        setIsPromotingPawn(true);
                        setPromotionSquare(randomSquareAlg);
                        setBoard(finalBoardStateForTurn);
                        setCapturedPieces(finalCapturedPiecesStateForTurn);
                        setEnPassantTargetSquare(newEnPassantTargetForNextTurn);
                        setIsMoveProcessing(false);
                        setAnimatedSquareTo(null);
                        return;
                    }
                  }
                }
              }
        }

        const { row: toR_final, col: toC_final } = algebraicToCoords(algebraic);
        const movedPieceOnToSquareHuman = finalBoardStateForTurn[toR_final]?.[toC_final]?.piece;
        let humanRookResData: RookResurrectionResult | null = null;

        if (movedPieceOnToSquareHuman && (movedPieceOnToSquareHuman.type === 'rook' || (moveBeingMade.type === 'promotion' && moveBeingMade.promoteTo === 'rook')) ) {
           if (capturedPieceFromApply) { // Only call if a capture occurred this move
            const oldLevelForResurrectionCheck = levelFromApplyMoveInternal !== undefined ? levelFromApplyMoveInternal : originalPieceLevelBeforeMove;
            humanRookResData = processRookResurrectionCheck(
              finalBoardStateForTurn,
              currentPlayer,
              moveBeingMade,
              algebraic,
              oldLevelForResurrectionCheck,
              finalCapturedPiecesStateForTurn,
              globalResurrectionIdCounter
            );
            if (humanRookResData.resurrectionPerformed) {
              finalBoardStateForTurn = humanRookResData.boardWithResurrection;
              finalCapturedPiecesStateForTurn = humanRookResData.capturedPiecesAfterResurrection;
              globalResurrectionIdCounter = humanRookResData.newResurrectionIdCounter!;
              toast({
                  title: "Rook's Call!",
                  description: `${getPlayerDisplayName(currentPlayer)}'s Rook resurrected their ${humanRookResData.resurrectedPieceData!.type} to ${humanRookResData.resurrectedSquareAlg!}! (L1)`,
                  duration: 3000,
              });

              if (humanRookResData.resurrectedPieceData?.type === 'pawn' || humanRookResData.resurrectedPieceData?.type === 'commander'){
                  const promoRow = currentPlayer === 'white' ? 0 : 7;
                  if (algebraicToCoords(humanRookResData.resurrectedSquareAlg!).row === promoRow) {
                      setPlayerForPostResurrectionPromotion(currentPlayer);
                      setIsExtraTurnForPostResurrectionPromotion(newStreakForCapturingPlayer === 6); 
                      setIsResurrectionPromotionInProgress(true);
                      setIsPromotingPawn(true);
                      setPromotionSquare(humanRookResData.resurrectedSquareAlg!);
                      setBoard(finalBoardStateForTurn);
                      setCapturedPieces(finalCapturedPiecesStateForTurn);
                      setEnPassantTargetSquare(newEnPassantTargetForNextTurn);
                      setIsMoveProcessing(false);
                      setAnimatedSquareTo(null);
                      return;
                  }
              }
            }
          }
        }

        if (conversionEventsFromApply && conversionEventsFromApply.length > 0) {
          conversionEventsFromApply.forEach(event => toast({ title: "Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
        }

        setBoard(finalBoardStateForTurn);
        setCapturedPieces(finalCapturedPiecesStateForTurn);
        setEnPassantTargetSquare(newEnPassantTargetForNextTurn);

        if (webRTC.isConnected && moveBeingMade) { 
            webRTC.sendMove(moveBeingMade);
        }


        setTimeout(() => {
          setAnimatedSquareTo(null);
          setEnemySelectedSquare(null); setEnemyPossibleMoves([]);

          if (humanPlayerAchievedFirstBloodThisTurn) {
            setIsMoveProcessing(false);
            return;
          }

          const movedPieceFinalSquare = finalBoardStateForTurn[toR_final]?.[toC_final];
          const pieceOnBoardAfterMove = movedPieceFinalSquare?.piece;
          const isPawnPromotingMove = pieceOnBoardAfterMove && pieceOnBoardAfterMove.type === 'pawn' && (toR_final === 0 || toR_final === 7) && !enPassantHappenedFromApply && !becameInfiltratorFromApply;


          const originalPieceDataFromBoard = board[algebraicToCoords(selectedSquare).row]?.[algebraicToCoords(selectedSquare).col]?.piece;

          const commanderHeroPromoExtraTurn = (originalPieceDataFromBoard?.type === 'commander' &&
                                               (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 &&
                                               pieceOnBoardAfterMove?.type === 'hero');

          const pawnLevelGrantsExtraTurn = (originalPieceDataFromBoard?.type === 'pawn' &&
                                           (levelFromApplyMoveInternal || originalPieceLevelBeforeMove || 0) >= 5 &&
                                           (toR_final === 0 || toR_final === 7) && !isPawnPromotingMove && !enPassantHappenedFromApply && !becameInfiltratorFromApply);


          const streakGrantsExtraTurn = newStreakForCapturingPlayer === 6;
          const combinedExtraTurn = commanderHeroPromoExtraTurn || pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;


          let isPendingHumanResurrectionPromotion = isResurrectionPromotionInProgress;
          let sacrificeNeededForQueen = false;

          if (!isPendingHumanResurrectionPromotion && pieceOnBoardAfterMove?.type === 'queen' ) {
             sacrificeNeededForQueen = processPawnSacrificeCheck(finalBoardStateForTurn, currentPlayer, moveBeingMade, levelFromApplyMoveInternal, combinedExtraTurn, newEnPassantTargetForNextTurn);
          }

          if (isPawnPromotingMove && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen && !isAwaitingRookSacrifice && !isPendingHumanResurrectionPromotion) {
            setPromotionPawnOriginalLevel(originalPieceLevelBeforeMove);
            setPromotionMoveWasCapture(!!capturedPieceFromApply);
            setIsPromotingPawn(true); setPromotionSquare(algebraic);
            setActiveTimerPlayer(null); setRemainingTime(null); 
          } else if (!isPawnPromotingMove && !sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isPendingHumanResurrectionPromotion && !enPassantHappenedFromApply && !becameInfiltratorFromApply) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, newEnPassantTargetForNextTurn);
          } else if (humanRookResData?.resurrectionPerformed && !isPendingHumanResurrectionPromotion) {
             processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, newEnPassantTargetForNextTurn);
          } else if ((enPassantHappenedFromApply || becameInfiltratorFromApply) && !isPendingHumanResurrectionPromotion && !isAwaitingPawnSacrifice && !sacrificeNeededForQueen) {
            processMoveEnd(finalBoardStateForTurn, currentPlayer, combinedExtraTurn, newEnPassantTargetForNextTurn);
          }

          setIsMoveProcessing(false);
        }, 800);
        return;
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && (!clickedItem || clickedItem.type === 'shroom')) {
            if(clickedPiece.color === currentPlayer) {
                setSelectedSquare(algebraic);
                const legalMovesForNewSelection = getPossibleMoves(board, algebraic, currentEnPassantTargetForThisTurn);
                setPossibleMoves(legalMovesForNewSelection);
                setEnemySelectedSquare(null);
                setEnemyPossibleMoves([]);
            } else {
                setEnemySelectedSquare(algebraic);
                const enemyMovesForNewSelection = getPossibleMoves(board, algebraic, currentEnPassantTargetForThisTurn);
                setEnemyPossibleMoves(enemyMovesForNewSelection);
            }
        } else {
            setEnemySelectedSquare(null);
            setEnemyPossibleMoves([]);
        }
        setIsMoveProcessing(false);
        setEnPassantTargetSquare(currentEnPassantTargetForThisTurn);
        return;
      }
    } else if (clickedPiece && (!clickedItem || clickedItem.type === 'shroom') && clickedPiece.color === currentPlayer) {
      setSelectedSquare(algebraic);
      const legalMovesForPlayer = getPossibleMoves(board, algebraic, currentEnPassantTargetForThisTurn);
      setPossibleMoves(legalMovesForPlayer);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    } else if (clickedPiece && (!clickedItem || clickedItem.type === 'shroom') && clickedPiece.color !== currentPlayer) {
      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(algebraic);
      const enemyMoves = getPossibleMoves(board, algebraic, currentEnPassantTargetForThisTurn);
      setEnemyPossibleMoves(enemyMoves);
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
    }
    let resetEP = true;
    if (moveBeingMade) {
        const pieceMakingMove = board[algebraicToCoords(moveBeingMade.from).row]?.[algebraicToCoords(moveBeingMade.from).col]?.piece;
        if (pieceMakingMove?.type === 'pawn' && Math.abs(algebraicToCoords(moveBeingMade.from).row - algebraicToCoords(moveBeingMade.to).row) === 2) {
            resetEP = false; 
        } else if (moveBeingMade.type === 'enpassant') {
            resetEP = false; 
        }
    }
    if (resetEP) {
        setEnPassantTargetSquare(null);
    }


  }, [
    board, currentPlayer, selectedSquare, gameInfo.gameOver, isPromotingPawn, isAiThinking, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer,
    enPassantTargetSquare,
    saveStateToHistory, processMoveEnd, getPlayerDisplayName, toast,
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setIsPromotingPawn, setPromotionSquare, setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setAnimatedSquareTo, setIsMoveProcessing,
    setShowCaptureFlash, setCaptureFlashKey, setLastMoveFrom, setLastMoveTo,
    isAwaitingPawnSacrifice, playerToSacrificePawn, boardForPostSacrifice, playerWhoMadeQueenMove, isExtraTurnFromQueenMove, processPawnSacrificeCheck,
    isAwaitingRookSacrifice, playerToSacrificeForRook, rookToMakeInvulnerable, boardForRookSacrifice, originalTurnPlayerForRookSacrifice, isExtraTurnFromRookLevelUp,
    algebraicToCoords, applyMove, isKingInCheck, isPieceInvulnerableToAttack, isValidSquare, processRookResurrectionCheck,
    getPossibleMoves, coordsToAlgebraic,
    isResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setIsResurrectionPromotionInProgress,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey,
    firstBloodAchieved, playerWhoGotFirstBlood, isAwaitingCommanderPromotion,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion, historyStack, isWhiteAI, isBlackAI,
    setEnPassantTargetSquare,
    webRTC, activeTimerPlayer, setActiveTimerPlayer, setRemainingTime, localPlayerColor, setPromotionMoveWasCapture, setPromotionPawnOriginalLevel
  ]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare || isMoveProcessing || isAwaitingCommanderPromotion ) return;

    if (webRTC.isConnected && !isWhiteAI && !isBlackAI && activeTimerPlayer === currentPlayer) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    let boardToUpdate = board.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? {...s.item} : null })));
    const { row, col } = algebraicToCoords(promotionSquare);
    const pieceBeingPromoted = boardToUpdate[row]?.[col]?.piece;

    if (!pieceBeingPromoted || (pieceBeingPromoted.type !== 'pawn' && pieceBeingPromoted.type !== 'commander' && !isResurrectionPromotionInProgress) ) {
      setIsPromotingPawn(false); setPromotionSquare(null); setIsMoveProcessing(false);
      setPromotionMoveWasCapture(false);
      setPromotionPawnOriginalLevel(null);
      setIsResurrectionPromotionInProgress(false);
      return;
    }

    saveStateToHistory();

    const pawnColor = pieceBeingPromoted.color;
    const originalPieceId = pieceBeingPromoted.id;
    const promotingFromType = pieceBeingPromoted.type;
    const currentLevelOfPieceOnSquare = Number(boardToUpdate[row][col].piece!.level || 1);

    const moveThatLedToPromotion: Move = { from: lastMoveFrom!, to: promotionSquare, type: 'promotion', promoteTo: pieceType };


    boardToUpdate[row][col].piece = {
      ...pieceBeingPromoted,
      type: pieceType,
      level: currentLevelOfPieceOnSquare,
      id: isResurrectionPromotionInProgress ? `${originalPieceId}_resPromo_${pieceType}` : `${originalPieceId}_promo_${pieceType}`,
      hasMoved: true,
      invulnerableTurnsRemaining: 0,
    };
    if (pieceType === 'queen') {
        boardToUpdate[row][col].piece!.level = Math.min(currentLevelOfPieceOnSquare, 7);
    }


    setLastMoveTo(promotionSquare);
    setIsMoveProcessing(true);
    setAnimatedSquareTo(promotionSquare);
    setBoard(boardToUpdate);
    setEnPassantTargetSquare(null);

    if (webRTC.isConnected && localPlayerColor === pawnColor) {
        webRTC.sendMove({
            from: lastMoveFrom!,
            to: promotionSquare,
            type: 'promotion',
            promoteTo: pieceType
        } as Move);
    }

    setTimeout(() => {
      setAnimatedSquareTo(null);

      let currentStreakForPromotingPlayer = killStreaks[pawnColor] || 0;

      if (isResurrectionPromotionInProgress) {
        toast({ title: "Resurrected Piece Promoted!", description: `${getPlayerDisplayName(playerForPostResurrectionPromotion!)}'s ${promotingFromType} on ${promotionSquare} promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 2500 });
        currentStreakForPromotingPlayer = killStreaks[playerForPostResurrectionPromotion!] || 0;
        processMoveEnd(boardToUpdate, playerForPostResurrectionPromotion!, isExtraTurnForPostResurrectionPromotion || currentStreakForPromotingPlayer === 6, null);
        setIsResurrectionPromotionInProgress(false);
        setPlayerForPostResurrectionPromotion(null);
        setIsExtraTurnForPostResurrectionPromotion(false);
      } else {
        toast({ title: "Pawn Promoted!", description: `${getPlayerDisplayName(pawnColor)} pawn promoted to ${pieceType}! (L${boardToUpdate[row][col].piece!.level})`, duration: 2500 });

        const pieceLevelForExtraTurnCheck = promotionPawnOriginalLevel || 1;
        const pawnLevelGrantsExtraTurn = pieceLevelForExtraTurnCheck >= 5;
        const streakGrantsExtraTurn = currentStreakForPromotingPlayer === 6;
        const combinedExtraTurn = pawnLevelGrantsExtraTurn || streakGrantsExtraTurn;

        let sacrificeNeededForQueen = false;

        if (pieceType === 'queen') {
          sacrificeNeededForQueen = processPawnSacrificeCheck(boardToUpdate, pawnColor, moveThatLedToPromotion, currentLevelOfPieceOnSquare, combinedExtraTurn, null);
        } else if (pieceType === 'rook') {
          if (promotionMoveWasCapture) { // Only call if the promotion move was a capture
            const newRookLevel = Number(boardToUpdate[row][col].piece!.level || 1);
            if (newRookLevel >= 4) { // processRookResurrectionCheck handles if it *crossed* L4
              const { boardWithResurrection, capturedPiecesAfterResurrection, resurrectionPerformed, resurrectedPieceData, resurrectedSquareAlg, newResurrectionIdCounter } = processRookResurrectionCheck(
                boardToUpdate, pawnColor, moveThatLedToPromotion, promotionSquare, 
                0, // Original level for a "new" rook type is 0
                capturedPieces, globalResurrectionIdCounter
              );
              if (resurrectionPerformed) {
                boardToUpdate = boardWithResurrection;
                setCapturedPieces(capturedPiecesAfterResurrection);
                setBoard(boardToUpdate);
                globalResurrectionIdCounter = newResurrectionIdCounter!;
                toast({ title: "Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(pawnColor)}'s new Rook resurrected their ${resurrectedPieceData!.type} to ${resurrectedSquareAlg!}! (L1)`, duration: 3000 });

                if(resurrectedPieceData?.type === 'pawn' || resurrectedPieceData?.type === 'commander'){
                    const promoR = pawnColor === 'white' ? 0 : 7;
                    if (algebraicToCoords(resurrectedSquareAlg!).row === promoR) {
                        setPlayerForPostResurrectionPromotion(pawnColor);
                        setIsExtraTurnForPostResurrectionPromotion(combinedExtraTurn);
                        setIsResurrectionPromotionInProgress(true);
                        setIsPromotingPawn(true);
                        setPromotionSquare(resurrectedSquareAlg!);
                        setIsMoveProcessing(false);
                        setAnimatedSquareTo(null);
                        setPromotionMoveWasCapture(false);
                        return;
                    }
                }
              }
            }
          }
        }

        if (!sacrificeNeededForQueen && !isAwaitingPawnSacrifice && !isResurrectionPromotionInProgress && !isAwaitingCommanderPromotion) {
           processMoveEnd(boardToUpdate, pawnColor, combinedExtraTurn, null);
        }
      }

      setEnemySelectedSquare(null);
      setEnemyPossibleMoves([]);
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      setPromotionMoveWasCapture(false);
      setPromotionPawnOriginalLevel(null);
      setIsMoveProcessing(false);
    }, 800);
  }, [
    board, promotionSquare, toast, killStreaks, saveStateToHistory, getPlayerDisplayName, processPawnSacrificeCheck, processRookResurrectionCheck,
    isMoveProcessing, setBoard, setIsPromotingPawn, setPromotionSquare, setIsMoveProcessing, setEnemySelectedSquare, setEnemyPossibleMoves,
    setAnimatedSquareTo, lastMoveFrom, isAwaitingPawnSacrifice, algebraicToCoords, capturedPieces, setCapturedPieces,
    isResurrectionPromotionInProgress, playerForPostResurrectionPromotion, isExtraTurnForPostResurrectionPromotion,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, processMoveEnd, setLastMoveTo,
    isAwaitingCommanderPromotion, historyStack, enPassantTargetSquare, setEnPassantTargetSquare,
    webRTC, activeTimerPlayer, currentPlayer, isWhiteAI, isBlackAI, localPlayerColor, promotionMoveWasCapture, setPromotionMoveWasCapture, promotionPawnOriginalLevel, setPromotionPawnOriginalLevel
  ]);


  const performAiMove = useCallback(async () => {
    const currentAiInstance = aiInstanceRef.current;

    if (!currentAiInstance) {
      console.error("AI instance not available for performAiMove (captured check).");
      toast({
        title: "AI Error",
        description: "AI engine is not ready or was lost. Please wait or reset the game.",
        variant: "destructive",
      });
      setIsAiThinking(false);
      if(currentPlayer === 'white') setIsWhiteAI(false); else setIsBlackAI(false);
      return;
    }

    if (gameInfo.gameOver || isPromotingPawn || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice ) {
      setIsAiThinking(false);
      return;
    }
    if (isAwaitingCommanderPromotion && playerWhoGotFirstBlood !== currentPlayer) {
        setIsAiThinking(false);
        return;
    }

    aiErrorOccurredRef.current = false;
    setIsAiThinking(true);
    setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) is thinking...` }));
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    setActiveTimerPlayer(null); setRemainingTime(null); 

    let aiFromAlg: AlgebraicSquare | null = null;
    let aiToAlg: AlgebraicSquare | null = null;
    let originalPieceLevelForAI: number | undefined;
    let moveForApplyMoveAI: Move | null = null;
    let localAIAwaitingCommanderPromo = false;
    let aiGeneratedEnPassantTarget: AlgebraicSquare | null = null;


    let finalBoardStateForAI = board.map(r_fbs => r_fbs.map(s_fbs => ({ ...s_fbs, piece: s_fbs.piece ? { ...s_fbs.piece } : null, item: s_fbs.item ? { ...s_fbs.item } : null })));
    let finalCapturedPiecesForAI = {
      white: capturedPieces.white.map(p_cap => ({ ...p_cap })),
      black: capturedPieces.black.map(p_cap => ({ ...p_cap }))
    };
    let capturedPieceDataForScoring: Piece | null = null; // To hold captured piece by AI's move
    let shroomConsumedByAIForEval = false;


    try {
      let aiMoveDataFromVibeAI: AIMoveType | null = null;
      let aiExtraTurnFromAIMethod = false;
      let attemptCount = 0;
      const MAX_AI_ATTEMPTS = 3;
      let pieceOnFromSquareForAI: Piece | null = null;
      let isAiMoveActuallyLegal = false;

      while (attemptCount < MAX_AI_ATTEMPTS && !isAiMoveActuallyLegal) {
        attemptCount++;
        await new Promise(resolve => setTimeout(resolve, 50 * attemptCount)); // Small delay, increasing
        const gameStateForAI = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI, gameMoveCounter, firstBloodAchieved, playerWhoGotFirstBlood, enPassantTargetSquare, shroomSpawnCounter, nextShroomSpawnTurn);
        const aiResult = currentAiInstance.getBestMove(gameStateForAI, currentPlayer);
        aiMoveDataFromVibeAI = aiResult?.move;
        aiExtraTurnFromAIMethod = aiResult?.extraTurn || false;

        if (!aiMoveDataFromVibeAI || !aiMoveDataFromVibeAI.from || !aiMoveDataFromVibeAI.to ||
            !Array.isArray(aiMoveDataFromVibeAI.from) || aiMoveDataFromVibeAI.from.length !== 2 ||
            !Array.isArray(aiMoveDataFromVibeAI.to) || aiMoveDataFromVibeAI.to.length !== 2) {
            console.log(`AI ILLEGAL MOVE DEBUG (Attempt ${attemptCount}): AI move data from vibe AI is invalid or null.`);
            continue; // Try again
        }

        aiFromAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.from[0], aiMoveDataFromVibeAI.from[1]);
        aiToAlg = coordsToAlgebraic(aiMoveDataFromVibeAI.to[0], aiMoveDataFromVibeAI.to[1]);
        const pieceDataAtFromAI = finalBoardStateForAI[aiMoveDataFromVibeAI.from[0]]?.[aiMoveDataFromVibeAI.from[1]];
        pieceOnFromSquareForAI = pieceDataAtFromAI?.piece || null;
        originalPieceLevelForAI = Number(pieceOnFromSquareForAI?.level || 1);

        if (!pieceOnFromSquareForAI || pieceOnFromSquareForAI.color !== currentPlayer) {
            console.log(`AI ILLEGAL MOVE DEBUG (Attempt ${attemptCount}): No piece to move for AI or piece color mismatch. Piece: ${pieceOnFromSquareForAI}, CurrentPlayer: ${currentPlayer}`);
            continue; // Try again
        }

        const definitiveLegalMovesForPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg as AlgebraicSquare, enPassantTargetSquare);
        isAiMoveActuallyLegal = definitiveLegalMovesForPiece.includes(aiToAlg as AlgebraicSquare);
        
        if (!isAiMoveActuallyLegal && aiMoveDataFromVibeAI.type === 'self-destruct' && aiFromAlg === aiToAlg) {
            const tempStateAfterSelfDestruct = finalBoardStateForAI.map(r => r.map(s => ({ ...s, piece: s.piece ? { ...s.piece } : null, item: s.item ? { ...s.item } : null })));
            tempStateAfterSelfDestruct[aiMoveDataFromVibeAI.from[0]][aiMoveDataFromVibeAI.from[1]].piece = null;
            if (!isKingInCheck(tempStateAfterSelfDestruct, currentPlayer, null)) {
              isAiMoveActuallyLegal = true;
            }
        }


        if (!isAiMoveActuallyLegal) {
            console.log(`AI ILLEGAL MOVE DEBUG (Attempt ${attemptCount}): AI suggested move ${aiFromAlg} to ${aiToAlg} is not in chess-utils legal moves.`);
        }
      }


      if (!isAiMoveActuallyLegal && pieceOnFromSquareForAI && aiFromAlg) { // Fallback if all attempts failed
        toast({ title: "AI Recalibrating...", description: "AI suggested an invalid move, picking a valid one.", duration: 2000 });
        const definitiveLegalMovesForPiece = getPossibleMoves(finalBoardStateForAI, aiFromAlg as AlgebraicSquare, enPassantTargetSquare);
        if (definitiveLegalMovesForPiece.length > 0) {
            const chosenDefinitiveMoveAlg = definitiveLegalMovesForPiece[0];
            const newToCoords = algebraicToCoords(chosenDefinitiveMoveAlg);
            let overrideMoveType: AIMoveType['type'] = 'move';
            const targetSquareForOverride = finalBoardStateForAI[newToCoords.row]?.[newToCoords.col];
            if (targetSquareForOverride?.piece) {
                overrideMoveType = 'capture';
            } else if (pieceOnFromSquareForAI.type === 'pawn' && chosenDefinitiveMoveAlg === enPassantTargetSquare) {
                overrideMoveType = 'enpassant';
            }
            const promotionRankOverride = currentPlayer === 'white' ? 0 : 7;
            let promoteToOverrideType: PieceType | undefined = undefined;
            if ((pieceOnFromSquareForAI.type === 'pawn' || pieceOnFromSquareForAI.type === 'commander') && newToCoords.row === promotionRankOverride && overrideMoveType !== 'enpassant') {
                 overrideMoveType = 'promotion';
                 promoteToOverrideType = pieceOnFromSquareForAI.type === 'commander' ? 'hero' : 'queen';
            } else if (pieceOnFromSquareForAI.type === 'king' && Math.abs(aiMoveDataFromVibeAI!.from[1] - newToCoords.col) === 2) {
                overrideMoveType = 'castle';
            } else if (pieceOnFromSquareForAI.type === 'knight' || pieceOnFromSquareForAI.type === 'hero') {
                if ((Number(pieceOnFromSquareForAI.level || 1) >= 5) && chosenDefinitiveMoveAlg === aiFromAlg) {
                    overrideMoveType = 'self-destruct';
                } else if (Number(pieceOnFromSquareForAI.level || 1) >= 4 && targetSquareForOverride?.piece?.type === 'bishop' && targetSquareForOverride.piece.color === pieceOnFromSquareForAI.color) {
                    overrideMoveType = 'swap';
                }
            } else if (pieceOnFromSquareForAI.type === 'bishop' && Number(pieceOnFromSquareForAI.level || 1) >= 4) {
                 if ((targetSquareForOverride?.piece?.type === 'knight' || targetSquareForOverride?.piece?.type === 'hero') && targetSquareForOverride.piece.color === pieceOnFromSquareForAI.color) {
                    overrideMoveType = 'swap';
                }
            }
            aiMoveDataFromVibeAI = { from: aiMoveDataFromVibeAI!.from, to: [newToCoords.row, newToCoords.col], type: overrideMoveType, promoteTo: promoteToOverrideType };
            aiToAlg = chosenDefinitiveMoveAlg;
            isAiMoveActuallyLegal = true;
            console.log("AI overridden move:", aiMoveDataFromVibeAI);
        } else {
            aiErrorOccurredRef.current = true;
            console.log("AI Fallback: chess-utils also confirms no legal moves for AI's chosen piece. Proceeding with forfeit logic.");
        }
      }


      if (!aiMoveDataFromVibeAI || !isAiMoveActuallyLegal) {
        // This block handles cases where AI has no valid moves or all attempts/fallbacks failed
        const isAiInCheck = isKingInCheck(finalBoardStateForAI, currentPlayer, enPassantTargetSquare);
        const opponent = currentPlayer === 'white' ? 'black' : 'white';
        if (isAiInCheck) {
            const isMate = isCheckmate(finalBoardStateForAI, currentPlayer, enPassantTargetSquare);
            if (isMate) {
                setGameInfo(prev => ({ ...prev, message: `Checkmate! ${getPlayerDisplayName(opponent)} wins!`, isCheck: true, playerWithKingInCheck: currentPlayer, isCheckmate: true, isStalemate: false, gameOver: true, winner: opponent }));
                toast({ title: "Checkmate!", description: `${getPlayerDisplayName(opponent)} wins! AI has no moves.`, duration: 3000 });
            } else {
                 console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) Malfunction: AI in check, found no moves, but utils indicate not checkmate. Legal moves should exist.`);
                 setGameInfo(prev => ({ ...prev, message: `Draw! (AI Error/Forfeit)`, isCheck: true, playerWithKingInCheck: currentPlayer, isCheckmate: false, isStalemate: true, gameOver: true, winner: "draw" }));
                 toast({ title: "Draw by AI Error!", description: "The AI encountered an issue and cannot make a legal move.", variant: "destructive" });
                 aiErrorOccurredRef.current = true;
            }
        } else {
            const isStale = isStalemate(finalBoardStateForAI, currentPlayer, enPassantTargetSquare);
            if (isStale) {
              setGameInfo(prev => ({ ...prev, message: "Stalemate! It's a draw.", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
              toast({ title: "Stalemate!", description: "It's a draw! AI has no moves.", duration: 3000 });
            } else {
              console.warn(`AI (${getPlayerDisplayName(currentPlayer)}) has no moves, not in check, but not stalemate. Assuming stalemate or error.`);
              setGameInfo(prev => ({ ...prev, message: "Stalemate! (AI Forfeit)", isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: true, gameOver: true, winner: 'draw' }));
              aiErrorOccurredRef.current = true;
            }
        }
        if(!aiErrorOccurredRef.current) {
            setIsAiThinking(false);
            setIsMoveProcessing(false);
            setAnimatedSquareTo(null);
            setEnPassantTargetSquare(null);
            return;
        }
      }

      if (!aiErrorOccurredRef.current && aiMoveDataFromVibeAI && aiFromAlg && aiToAlg) {
        saveStateToHistory();
        let aiMoveType = (aiMoveDataFromVibeAI.type || 'move') as Move['type'];
        let aiPromoteTo = aiMoveDataFromVibeAI.promoteTo as PieceType | undefined;

        setLastMoveFrom(aiFromAlg as AlgebraicSquare);
        setLastMoveTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));
        setIsMoveProcessing(true);
        setAnimatedSquareTo(aiMoveType === 'self-destruct' ? (aiFromAlg as AlgebraicSquare) : (aiToAlg as AlgebraicSquare));

        if (pieceOnFromSquareForAI?.type === 'king' && aiFromAlg && aiToAlg && Math.abs(algebraicToCoords(aiFromAlg).col - algebraicToCoords(aiToAlg).col) === 2 && aiMoveType !== 'self-destruct') {
            aiMoveType = 'castle';
        }

        moveForApplyMoveAI = {
            from: aiFromAlg as AlgebraicSquare,
            to: aiToAlg as AlgebraicSquare,
            type: aiMoveType as Move['type'],
            promoteTo: aiPromoteTo
        };

        let aiMoveCapturedSomething = false;
        let pieceCapturedByAnvilAI = false;
        let aiAnvilPushedOff = false;
        let piecesDestroyedByAICount = 0;
        let anvilsDestroyedByAICount = 0;
        let levelFromAIApplyMove: number | undefined = originalPieceLevelForAI;
        let selfCheckByAIPushBack = false;
        let queenLevelReducedEventsAI: QueenLevelReducedEvent[] | undefined = undefined;
        let aiEnPassantHappened = false;
        let aiBecameInfiltrator = false;
        let aiGameWonByInfiltration = false;


        if (moveForApplyMoveAI!.type === 'self-destruct') {
          const { row: knightR_AI, col: knightC_AI } = algebraicToCoords(moveForApplyMoveAI!.from as AlgebraicSquare);
          const selfDestructingKnight_AI = finalBoardStateForAI[knightR_AI]?.[knightC_AI]?.piece;

          const tempBoardForCheckAI = finalBoardStateForAI.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null, item: s.item ? {...s.item} : null })));
          tempBoardForCheckAI[knightR_AI][knightC_AI].piece = null;
          if (isKingInCheck(tempBoardForCheckAI, currentPlayer, null)) {
              aiErrorOccurredRef.current = true;
          } else if (selfDestructingKnight_AI) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const adjR_AI = knightR_AI + dr;
                const adjC_AI = knightC_AI + dc;
                if (isValidSquare(adjR_AI, adjC_AI)) {
                    const victimSquareStateAI = finalBoardStateForAI[adjR_AI]?.[adjC_AI];
                    if (!victimSquareStateAI) continue;

                    if (victimSquareStateAI.item?.type === 'anvil') {
                        victimSquareStateAI.item = null;
                        anvilsDestroyedByAICount++;
                    }
                    
                    const victimPieceAI = victimSquareStateAI.piece;
                    if (victimPieceAI && victimPieceAI.color !== currentPlayer && victimPieceAI.type !== 'king') {
                        const isQueenTargetAI = victimPieceAI.type === 'queen';
                        const isNormallyInvulnerableAI = !isQueenTargetAI && isPieceInvulnerableToAttack(victimPieceAI, selfDestructingKnight_AI);

                        if (!isNormallyInvulnerableAI || (isQueenTargetAI )) {
                            if (selfDestructingKnight_AI.type !== 'infiltrator') {
                                finalCapturedPiecesForAI[currentPlayer].push({ ...victimPieceAI });
                            }
                            if(finalBoardStateForAI[adjR_AI]?.[adjC_AI]) {
                                finalBoardStateForAI[adjR_AI][adjC_AI].piece = null;
                            }
                            aiMoveCapturedSomething = true;
                            piecesDestroyedByAICount++;
                            toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) ${selfDestructingKnight_AI.type} Obliterates!`, description: `${victimPieceAI.color} ${victimPieceAI.type} destroyed${isQueenTargetAI ? ' (bypassing invulnerability!)' : ''}.`, duration: 2500 });
                        }
                    }
                }
                }
            }
            if(finalBoardStateForAI[knightR_AI]?.[knightC_AI]) {
                finalBoardStateForAI[knightR_AI][knightC_AI].piece = null;
            }
            if (anvilsDestroyedByAICount > 0) {
                 toast({ title: "AI Smashes Anvils!", description: `${anvilsDestroyedByAICount} anvil${anvilsDestroyedByAICount > 1 ? 's':''} destroyed.`, duration: 2500 });
            }
             if (piecesDestroyedByAICount > 0 && piecesDestroyedByAICount !== 1) {
               toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) ${selfDestructingKnight_AI.type} Self-Destructs!`, description: `${piecesDestroyedByAICount} pieces obliterated.`, duration: 2500 });
            }
          } else {
              aiErrorOccurredRef.current = true;
          }
        } else {
          const applyMoveResult = applyMove(finalBoardStateForAI, moveForApplyMoveAI as Move, enPassantTargetSquare);
          finalBoardStateForAI = applyMoveResult.newBoard;
          capturedPieceDataForScoring = applyMoveResult.capturedPiece; // Store for later checks
          shroomConsumedByAIForEval = applyMoveResult.shroomConsumed || false;
          levelFromAIApplyMove = applyMoveResult.originalPieceLevel;
          selfCheckByAIPushBack = applyMoveResult.selfCheckByPushBack;
          aiAnvilPushedOff = applyMoveResult.anvilPushedOffBoard;
          queenLevelReducedEventsAI = applyMoveResult.queenLevelReducedEvents;
          aiEnPassantHappened = applyMoveResult.isEnPassantCapture || false;
          aiBecameInfiltrator = applyMoveResult.promotedToInfiltrator || false;
          aiGameWonByInfiltration = applyMoveResult.infiltrationWin || false;
          aiGeneratedEnPassantTarget = applyMoveResult.enPassantTargetSet || null;


          if (aiGameWonByInfiltration) {
            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);
            setEnPassantTargetSquare(aiGeneratedEnPassantTarget);
            toast({ title: "Infiltration!", description: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, duration: 5000 });
            setGameInfo(prev => ({ ...prev, message: `${getPlayerDisplayName(currentPlayer)} (AI) wins by Infiltration!`, isCheck: false, playerWithKingInCheck: null, isCheckmate: false, isStalemate: false, gameOver: true, isInfiltrationWin: true, winner: currentPlayer }));
            setIsMoveProcessing(false); setIsAiThinking(false); setAnimatedSquareTo(null); return;
          }
          if (aiEnPassantHappened) {
            toast({ title: "AI En Passant!", description: `${getPlayerDisplayName(currentPlayer)} (AI) captures En Passant and promotes to Infiltrator!`, duration: 3000 });
          }
          if (shroomConsumedByAIForEval) {
              const movedPieceDataAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
               if(movedPieceDataAI) {
                 toast({ title: "AI Level Up!", description: `AI's ${movedPieceDataAI.type} consumed a Shroom 🍄 and leveled up to L${movedPieceDataAI.level}!`, duration: 3000 });
               }
          }


          if (queenLevelReducedEventsAI && queenLevelReducedEventsAI.length > 0) {
              queenLevelReducedEventsAI.forEach(event => {
                  const queenOwnerName = getPlayerDisplayName(event.reducedByKingOfColor === 'white' ? 'black' : 'white');
                  toast({
                    title: "King's Dominion!",
                    description: `${getPlayerDisplayName(event.reducedByKingOfColor)} (AI) King leveled up! ${queenOwnerName}'s Queen (ID: ...${event.queenId.slice(-4)}) level reduced by ${event.reductionAmount} from L${event.originalLevel} to L${event.newLevel}.`,
                    duration: 3500,
                  });
              });
          }

          if (applyMoveResult.pieceCapturedByAnvil) {
            pieceCapturedByAnvilAI = true;
            capturedPieceDataForScoring = applyMoveResult.pieceCapturedByAnvil; // Also counts for resurrection
            if (pieceOnFromSquareForAI?.type !== 'infiltrator') {
                finalCapturedPiecesForAI[currentPlayer].push(applyMoveResult.pieceCapturedByAnvil);
            } else {
                toast({ title: "AI Obliterated by Anvil!", description: `AI's Pawn push made an Anvil obliterate a ${applyMoveResult.pieceCapturedByAnvil.type}!`, duration: 3000 });
            }
            toast({ title: "AI Anvil Crush!", description: `AI's Pawn push made an Anvil capture a ${applyMoveResult.pieceCapturedByAnvil.type}!`, duration: 3000 });
          }
          if (aiAnvilPushedOff) {
              toast({ title: "AI Anvil Removed!", description: "Anvil pushed off the board by AI.", duration: 2000 });
          }


          if (selfCheckByAIPushBack) {
            const opponentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            toast({
              title: "Auto-Checkmate!",
              description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Pawn Push-Back resulted in self-check. ${getPlayerDisplayName(opponentPlayer)} wins!`,
              variant: "destructive",
              duration: 5000
            });
            setGameInfo(prev => ({
              ...prev,
              message: `Checkmate! ${getPlayerDisplayName(opponentPlayer)} wins by self-check!`,
              isCheck: true,
              playerWithKingInCheck: currentPlayer,
              isCheckmate: true,
              isStalemate: false,
              gameOver: true,
              winner: opponentPlayer
            }));
            setBoard(finalBoardStateForAI);
            setEnPassantTargetSquare(aiGeneratedEnPassantTarget);
            setIsMoveProcessing(false);
            setIsAiThinking(false);
            setAnimatedSquareTo(null);
            setSelectedSquare(null); setPossibleMoves([]);
            setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
            return;
          }
          toast({ title: `AI (${getPlayerDisplayName(currentPlayer)}) moves`, description: `${aiFromAlg} to ${aiToAlg}`, duration: 1500 });

          if (applyMoveResult.capturedPiece) { // This is the direct capture by the moving piece
            // capturedPieceDataForScoring is already set
            const pieceThatMadeTheMoveAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
            if (pieceThatMadeTheMoveAI && pieceThatMadeTheMoveAI.type === 'infiltrator') {
                toast({ title: "Obliterated!", description: `${getPlayerDisplayName(currentPlayer)}'s Infiltrator obliterated ${applyMoveResult.capturedPiece.color} ${applyMoveResult.capturedPiece.type}!`, duration: 3000});
            } else {
                finalCapturedPiecesForAI[currentPlayer].push(applyMoveResult.capturedPiece);
            }
            aiMoveCapturedSomething = true;
          }
          if (applyMoveResult.conversionEvents && applyMoveResult.conversionEvents.length > 0) {
            applyMoveResult.conversionEvents.forEach(event => toast({ title: "AI Conversion!", description: `${getPlayerDisplayName(event.byPiece.color)} (AI) ${event.byPiece.type} converted ${event.originalPiece.color} ${event.originalPiece.type}!`, duration: 2500 }));
          }
        }

        if(!aiErrorOccurredRef.current) {
            let newStreakForAIPlayer = killStreaks[currentPlayer] || 0;
            const aiCaptureOccurredThisTurnForStreak = aiMoveCapturedSomething || pieceCapturedByAnvilAI; // Use this for streak

            if (aiCaptureOccurredThisTurnForStreak) {
                newStreakForAIPlayer += (piecesDestroyedByAICount > 0 ? piecesDestroyedByAICount : 1);
                if (!firstBloodAchieved) {
                    setKillStreakFlashMessage("FIRST BLOOD!");
                    setKillStreakFlashMessageKey(k => k + 1);
                } else {
                    const streakMsg = getKillStreakToastMessage(newStreakForAIPlayer);
                    if (streakMsg) {
                        setKillStreakFlashMessage(streakMsg);
                        setKillStreakFlashMessageKey(k => k + 1);
                    }
                }
            } else if (moveForApplyMoveAI!.type === 'self-destruct' && anvilsDestroyedByAICount > 0) {
            } else {
                newStreakForAIPlayer = 0;
            }
            setKillStreaks(prev => ({ ...prev, [currentPlayer]: newStreakForAIPlayer }));


            if (aiMoveCapturedSomething || pieceCapturedByAnvilAI) {
              setLastCapturePlayer(currentPlayer);
              setShowCaptureFlash(true);
              setCaptureFlashKey(k => k + 1);
            } else {
              if(lastCapturePlayer === currentPlayer) setLastCapturePlayer(null);
            }


            if (aiCaptureOccurredThisTurnForStreak) { // Use the same consolidated capture flag
                if (!firstBloodAchieved) {
                    setFirstBloodAchieved(true);
                    setPlayerWhoGotFirstBlood(currentPlayer);
                    localAIAwaitingCommanderPromo = true;
                    toast({ title: "FIRST BLOOD!", description: `${getPlayerDisplayName(currentPlayer)} (AI) promotes a Pawn to Commander!`, duration: 4000 });
                } else if (newStreakForAIPlayer === 3) {
                  const opponentColorAI = currentPlayer === 'white' ? 'black' : 'white';
                  let piecesOfAICapturedByOpponent = [...(finalCapturedPiecesForAI[opponentColorAI] || [])];
                  if (piecesOfAICapturedByOpponent.length > 0) {
                      const pieceToResOriginalAI = piecesOfAICapturedByOpponent.pop();
                      if (pieceToResOriginalAI) {
                      const emptySqAI: AlgebraicSquare[] = [];
                      for (let r_idx = 0; r_idx < 8; r_idx++) for (let c_idx = 0; c_idx < 8; c_idx++) if (!finalBoardStateForAI[r_idx][c_idx].piece && !finalBoardStateForAI[r_idx][c_idx].item) emptySqAI.push(coordsToAlgebraic(r_idx, c_idx));
                      if (emptySqAI.length > 0) {
                          const randSqAI_alg = emptySqAI[Math.floor(Math.random() * emptySqAI.length)];
                          const { row: resRAI, col: resCAI } = algebraicToCoords(randSqAI_alg);
                          const newUniqueSuffixAI = globalResurrectionIdCounter++;
                          const resurrectedAI: Piece = { ...pieceToResOriginalAI, level: 1, id: `${pieceToResOriginalAI.id}_res_${newUniqueSuffixAI}_${Date.now()}`, hasMoved: pieceToResOriginalAI.type === 'king' || pieceToResOriginalAI.type === 'rook' ? false : pieceToResOriginalAI.hasMoved, invulnerableTurnsRemaining: 0 };

                          const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                          if (resurrectedAI.type === 'commander' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'hero';
                              resurrectedAI.id = `${resurrectedAI.id}_HeroPromo_Res_AI`;
                              toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander resurrected and promoted to Hero! (L1)`, duration: 3000 });
                          } else if (resurrectedAI.type === 'pawn' && resRAI === promoRowAI) {
                              resurrectedAI.type = 'queen';
                              resurrectedAI.id = `${resurrectedAI.id}_QueenPromo_Res_AI`;
                               toast({ title: "AI Resurrection & Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) Pawn resurrected and promoted to Queen! (L1)`, duration: 3000 });
                          } else {
                               toast({ title: "AI Resurrection!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s ${resurrectedAI.type} returns! (L1)`, duration: 2500 });
                          }
                          finalBoardStateForAI[resRAI][resCAI].piece = resurrectedAI;
                          finalCapturedPiecesForAI[opponentColorAI] = piecesOfAICapturedByOpponent.filter(p => p.id !== pieceToResOriginalAI.id);
                      }
                      }
                  }
                }
            }

            if (localAIAwaitingCommanderPromo && currentAiInstance) {
                const gameStateForAICmdrSelect = adaptBoardForAI(finalBoardStateForAI, currentPlayer, killStreaks, finalCapturedPiecesForAI, gameMoveCounter, true, currentPlayer, null, shroomSpawnCounter, nextShroomSpawnTurn);
                const commanderPawnCoords = currentAiInstance.selectPawnForCommanderPromotion(gameStateForAICmdrSelect);
                if (commanderPawnCoords) {
                    const [pawnR, pawnC] = commanderPawnCoords;
                    if(finalBoardStateForAI[pawnR]?.[pawnC]?.piece?.type === 'pawn' && finalBoardStateForAI[pawnR]?.[pawnC]?.piece?.level === 1) {
                        finalBoardStateForAI[pawnR][pawnC].piece!.type = 'commander';
                        finalBoardStateForAI[pawnR][pawnC].piece!.id = `${finalBoardStateForAI[pawnR][pawnC].piece!.id}_CMD_AI`;
                    }
                }
            }


            const { row: aiToR, col: aiToC } = algebraicToCoords(aiToAlg as AlgebraicSquare);
            const aiMovedPieceOnToSquare = finalBoardStateForAI[aiToR]?.[aiToC]?.piece;
            let aiRookResData: RookResurrectionResult | null = null;

            if (aiMovedPieceOnToSquare &&
                (aiMovedPieceOnToSquare.type === 'rook' || (moveForApplyMoveAI!.type === 'promotion' && moveForApplyMoveAI!.promoteTo === 'rook')) &&
                moveForApplyMoveAI!.type !== 'self-destruct' &&
                (capturedPieceDataForScoring || pieceCapturedByAnvilAI) // Rook resurrection only on capture
            ) {
              const oldLevelForAIResCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI;
              aiRookResData = processRookResurrectionCheck(
                  finalBoardStateForAI,
                  currentPlayer,
                  moveForApplyMoveAI as Move,
                  aiToAlg as AlgebraicSquare,
                  oldLevelForAIResCheck,
                  finalCapturedPiecesForAI,
                  globalResurrectionIdCounter
              );
              if (aiRookResData.resurrectionPerformed) {
                  finalBoardStateForAI = aiRookResData.boardWithResurrection;
                  finalCapturedPiecesForAI = aiRookResData.capturedPiecesAfterResurrection;
                  globalResurrectionIdCounter = aiRookResData.newResurrectionIdCounter!;
                  toast({ title: "AI Rook's Call!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s Rook resurrected their ${aiRookResData.resurrectedPieceData!.type} to ${aiRookResData.resurrectedSquareAlg!}! (L1)`, duration: 3000 });

                  if (aiRookResData.resurrectedPieceData?.type === 'pawn' || aiRookResData.resurrectedPieceData?.type === 'commander') {
                      const promoRowAI = currentPlayer === 'white' ? 0 : 7;
                      const {row: resRookAIR, col: resRookAIC} = algebraicToCoords(aiRookResData.resurrectedSquareAlg!);
                      if (resRookAIR === promoRowAI) {
                          const resurrectedPieceOnBoard = finalBoardStateForAI[resRookAIR]?.[resRookAIC]?.piece;
                          if(resurrectedPieceOnBoard) {
                            if (resurrectedPieceOnBoard.type === 'pawn') {
                                resurrectedPieceOnBoard.type = 'queen';
                                resurrectedPieceOnBoard.level = 1;
                                resurrectedPieceOnBoard.id = `${aiRookResData.resurrectedPieceData!.id}_resPromo_Q`;
                                toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 2500 });
                            } else if (resurrectedPieceOnBoard.type === 'commander') {
                                resurrectedPieceOnBoard.type = 'hero';
                                resurrectedPieceOnBoard.id = `${aiRookResData.resurrectedPieceData!.id}_resPromo_H_AI`;
                                toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Commander promoted to Hero! (L1)`, duration: 2500 });
                            }
                          }
                      }
                  }
              }
            }

            setBoard(finalBoardStateForAI);
            setCapturedPieces(finalCapturedPiecesForAI);
            setEnPassantTargetSquare(aiGeneratedEnPassantTarget);

            setTimeout(() => {
              const pieceAtDestinationAI = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;
              const promotionRankAI = currentPlayer === 'white' ? 0 : 7;
              const isAIPawnPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'pawn' && algebraicToCoords(aiToAlg as AlgebraicSquare).row === promotionRankAI && moveForApplyMoveAI!.type !== 'self-destruct' && moveForApplyMoveAI!.type !== 'enpassant';
              const isAICommanderPromoting = pieceAtDestinationAI && pieceAtDestinationAI.type === 'commander' && algebraicToCoords(aiToAlg as AlgebraicSquare).row === promotionRankAI && moveForApplyMoveAI!.type !== 'self-destruct';

              let extraTurnForThisAIMove = aiExtraTurnFromAIMethod || newStreakForAIPlayer === 6;
              let sacrificeNeededForAIQueen = false;

              const pieceOnFromSquareForAILevelCheck = finalBoardStateForAI[algebraicToCoords(aiFromAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiFromAlg as AlgebraicSquare).col]?.piece || pieceOnFromSquareForAI;
              const originalTypeOfAIMovedPiece = pieceOnFromSquareForAILevelCheck!.type;
              const originalLevelOfAIMovedPieceForPromoCheck = levelFromAIApplyMove !== undefined ? levelFromAIApplyMove : originalPieceLevelForAI || 1;


              if (isAIPawnPromoting) {
                  const promotedTypeAI = moveForApplyMoveAI!.promoteTo || 'queen'; 

                  const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                  if(finalBoardStateForAI[promoR][promoC].piece && finalBoardStateForAI[promoR][promoC].piece!.type === 'pawn') {
                      finalBoardStateForAI[promoR][promoC].piece!.type = promotedTypeAI;
                      finalBoardStateForAI[promoR][promoC].piece!.level = pieceAtDestinationAI!.level; 
                      finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_promo_${promotedTypeAI}`;
                      setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                  }
                  toast({ title: `AI Pawn Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) pawn promoted to ${promotedTypeAI}! (L${finalBoardStateForAI[promoR][promoC].piece!.level})`, duration: 2500 });

                  if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;

                  const pieceAfterAIPromo = finalBoardStateForAI[algebraicToCoords(aiToAlg as AlgebraicSquare).row]?.[algebraicToCoords(aiToAlg as AlgebraicSquare).col]?.piece;

                  if (pieceAfterAIPromo?.type === 'queen') {
                    sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, finalBoardStateForAI[promoR][promoC].piece!.level, extraTurnForThisAIMove, aiGeneratedEnPassantTarget);
                  } else if (pieceAfterAIPromo?.type === 'rook') {
                      if ((!aiRookResData || !aiRookResData.resurrectionPerformed) && (capturedPieceDataForScoring || pieceCapturedByAnvilAI)) { // Rook resurrection only on capture
                        const newRookLevelCheck = Number(pieceAfterAIPromo.level || 1);
                        if (newRookLevelCheck >= 4) { // Check if newly promoted rook is L4+
                            const { boardWithResurrection, capturedPiecesAfterResurrection: capturedAfterAIRookRes, resurrectionPerformed: aiPromoRookResPerformed, resurrectedPieceData: aiPromoRookPieceData, resurrectedSquareAlg: aiPromoRookSquareAlg, newResurrectionIdCounter: aiPromoRookIdCounter } = processRookResurrectionCheck(
                                finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, aiToAlg as AlgebraicSquare, 
                                0, // Original level of "rook" type is 0 for promotion
                                finalCapturedPiecesForAI, globalResurrectionIdCounter
                            );
                            if (aiPromoRookResPerformed) {
                                finalBoardStateForAI = boardWithResurrection;
                                finalCapturedPiecesForAI = capturedAfterAIRookRes;
                                globalResurrectionIdCounter = aiPromoRookIdCounter!;
                                setBoard(finalBoardStateForAI);
                                setCapturedPieces(finalCapturedPiecesForAI);
                                toast({ title: "AI Rook's Call (Post-Promo)!", description: `${getPlayerDisplayName(currentPlayer)} (AI)'s new Rook resurrected their ${aiPromoRookPieceData!.type} to ${aiPromoRookSquareAlg!}! (L1)`, duration: 3000 });
                                if(aiPromoRookPieceData?.type === 'pawn' || aiPromoRookPieceData?.type === 'commander'){
                                    const promoR_AI = currentPlayer === 'white' ? 0 : 7;
                                    const {row: resRookPromoAIR, col: resRookPromoAIC} = algebraicToCoords(aiPromoRookSquareAlg!);
                                    if (resRookPromoAIR === promoR_AI) {
                                        const resurrectedPieceOnBoardAI = finalBoardStateForAI[resRookPromoAIR]?.[resRookPromoAIC]?.piece;
                                        if (resurrectedPieceOnBoardAI) {
                                            if (resurrectedPieceOnBoardAI.type === 'pawn') {
                                                resurrectedPieceOnBoardAI.type = 'queen';
                                                resurrectedPieceOnBoardAI.level = 1;
                                                resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_Q`;
                                                toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Pawn promoted to Queen! (L1)`, duration: 2500 });
                                            } else if (resurrectedPieceOnBoardAI.type === 'commander') {
                                                resurrectedPieceOnBoardAI.type = 'hero';
                                                resurrectedPieceOnBoardAI.id = `${aiPromoRookPieceData!.id}_resPromo_H_AI`;
                                                toast({ title: "AI Rook Resurrection Promotion!", description: `${getPlayerDisplayName(currentPlayer)} (AI) resurrected Commander promoted to Hero! (L1)`, duration: 2500 });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                      }
                  }
              } else if (isAICommanderPromoting) {
                    const {row: promoR, col: promoC} = algebraicToCoords(aiToAlg as AlgebraicSquare);
                    if(finalBoardStateForAI[promoR]?.[promoC]?.piece?.type === 'commander') {
                        finalBoardStateForAI[promoR][promoC].piece!.type = 'hero';
                        finalBoardStateForAI[promoR][promoC].piece!.id = `${finalBoardStateForAI[promoR][promoC].piece!.id}_HeroPromo_AI`;
                        setBoard(finalBoardStateForAI.map(r_bd => r_bd.map(s_bd => ({...s_bd, piece: s_bd.piece ? {...s_bd.piece} : null, item: s_bd.item ? {...s_bd.item} : null }))));
                    }
                    toast({ title: `AI Commander Promoted!`, description: `${getPlayerDisplayName(currentPlayer)} (AI) Commander promoted to Hero! (L${originalLevelOfAIMovedPieceForPromoCheck})`, duration: 2500 });
                    if (originalLevelOfAIMovedPieceForPromoCheck >= 5) extraTurnForThisAIMove = true;
              } else if (pieceAtDestinationAI?.type === 'queen') {
                 sacrificeNeededForAIQueen = processPawnSacrificeCheck(finalBoardStateForAI, currentPlayer, moveForApplyMoveAI as Move, levelFromAIApplyMove, extraTurnForThisAIMove, aiGeneratedEnPassantTarget);
              } else if (aiBecameInfiltrator) {
              }

              if (localAIAwaitingCommanderPromo) {
                console.log(`AI FIRST BLOOD DEBUG: Player ${currentPlayer}. Extra turn for processMoveEnd: ${extraTurnForThisAIMove}. Streak: ${newStreakForAIPlayer}. Pawn/Cmdr promo L5+ involved: ${(isAIPawnPromoting || isAICommanderPromoting) && originalLevelOfAIMovedPieceForPromoCheck >= 5}`);
              }

              if (!sacrificeNeededForAIQueen) {
                  processMoveEnd(finalBoardStateForAI, currentPlayer, extraTurnForThisAIMove, aiGeneratedEnPassantTarget);
              }

              setAnimatedSquareTo(null);
              setIsMoveProcessing(false);
              setIsAiThinking(false);
            }, 800);
        } else {
          aiErrorOccurredRef.current = true;
        }
      } else { // This branch now only covers if aiMoveDataFromVibeAI was null initially, or all attempts + fallback failed.
        aiErrorOccurredRef.current = true;
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
      if(currentPlayer === 'white') setIsWhiteAI(false); else setIsBlackAI(false);

      if (!gameInfo.gameOver) {
          const boardBeforeAIAttempt = board.map(r_err => r_err.map(s_err => ({ ...s_err, piece: s_err.piece ? { ...s_err.piece } : null, item: s_err.item ? {...s_err.item} : null })));
          processMoveEnd(boardBeforeAIAttempt, currentPlayer, false, enPassantTargetSquare);
      }
      setIsMoveProcessing(false);
      setIsAiThinking(false);
      setAnimatedSquareTo(null);
      setEnPassantTargetSquare(null);
    }
  }, [
    board, currentPlayer, gameInfo.gameOver, isPromotingPawn, isMoveProcessing, killStreaks, capturedPieces, lastCapturePlayer,
    isWhiteAI, isBlackAI, isAiThinking, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, enPassantTargetSquare, setEnPassantTargetSquare,
    saveStateToHistory, toast, getPlayerDisplayName,
    setGameInfo, setBoard, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves,
    setIsAiThinking, setIsMoveProcessing, setAnimatedSquareTo, setActiveTimerPlayer, setRemainingTime,
    setShowCaptureFlash, setCaptureFlashKey, setIsWhiteAI, setIsBlackAI,
    setLastMoveFrom, setLastMoveTo,
    processPawnSacrificeCheck,
    algebraicToCoords, coordsToAlgebraic, applyMove, isKingInCheck, isValidSquare, processRookResurrectionCheck,
    processMoveEnd, getPossibleMoves, isStalemate, isCheckmate,
    getKillStreakToastMessage, setKillStreakFlashMessage, setKillStreakFlashMessageKey, gameMoveCounter,
    firstBloodAchieved, playerWhoGotFirstBlood,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion,
    shroomSpawnCounter, nextShroomSpawnTurn, webRTC.isConnected
  ]);


  useEffect(() => {
    const currentAiInstance = aiInstanceRef.current;
    const isCurrentPlayerAI = (currentPlayer === 'white' && isWhiteAI && !webRTC.isConnected) || (currentPlayer === 'black' && isBlackAI && !webRTC.isConnected);
    if (isCurrentPlayerAI && !gameInfo.gameOver && !isAiThinking && !isPromotingPawn && !isMoveProcessing && !isAwaitingPawnSacrifice && !isAwaitingRookSacrifice && !isResurrectionPromotionInProgress && currentAiInstance) {
        if (!isAwaitingCommanderPromotion || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)) {
             performAiMove();
        }
    }
  }, [currentPlayer, isWhiteAI, isBlackAI, gameInfo.gameOver, isAiThinking, isPromotingPawn, isMoveProcessing, performAiMove, isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress, isAwaitingCommanderPromotion, playerWhoGotFirstBlood, webRTC.isConnected]);

  useEffect(() => {
    if (!board || positionHistory.length > 0) return;
    const initialCastlingRights = getCastlingRightsString(board);
    const initialHash = boardToPositionHash(board, currentPlayer, initialCastlingRights, enPassantTargetSquare);
    if (initialHash) {
      setPositionHistory([initialHash]);
    }
  }, [board, currentPlayer, positionHistory, getCastlingRightsString, boardToPositionHash, enPassantTargetSquare]);

  useEffect(() => {
    let currentCheckStateString: string | null = null;
    if (gameInfo.gameOver && gameInfo.winner === 'draw') {
      currentCheckStateString = 'draw';
    } else if (gameInfo.isCheckmate && gameInfo.playerWithKingInCheck) {
      currentCheckStateString = `checkmate-${gameInfo.playerWithKingInCheck}`;
    } else if (gameInfo.isCheck && !gameInfo.gameOver && gameInfo.playerWithKingInCheck && !gameInfo.isStalemate && !gameInfo.isThreefoldRepetitionDraw) {
      currentCheckStateString = `${gameInfo.playerWithKingInCheck}-check`;
    } else if (gameInfo.isInfiltrationWin) {
      currentCheckStateString = `infiltration-${gameInfo.winner}`;
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
        } else if (currentCheckStateString.startsWith('infiltration')) {
          setFlashMessage('INFILTRATION!');
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
      const duration = (flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!') ? 2500 : 1500;
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
      }, 1500);
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


  const resetGame = useCallback(() => {
    if (webRTC.isConnected && localPlayerColor) {
      const opponent = localPlayerColor === 'white' ? 'black' : 'white';
      webRTC.sendMove({ type: 'resign', resigningPlayer: localPlayerColor });
      setGameInfo(prev => ({
        ...prev,
        message: `${getPlayerDisplayName(localPlayerColor)} resigned. ${getPlayerDisplayName(opponent)} wins!`,
        gameOver: true,
        winner: opponent,
      }));
      toast({ title: "You Resigned", description: `${getPlayerDisplayName(opponent)} wins.`, duration: 3000});
      setActiveTimerPlayer(null);
      setRemainingTime(null);
      // Do not disconnect or reset localPlayerColor here yet, let the peer-disconnected or error handle it.
      return; // Game over, but connection remains until explicit disconnect or server error
    }

    globalResurrectionIdCounter = 0;
    const initialBoardState = initializeBoard();
    setBoard(initialBoardState);
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setEnemySelectedSquare(null);
    setEnemyPossibleMoves([]);
    setGameMoveCounter(0);
    setEnPassantTargetSquare(null);

    const newIsWhiteAI = false;
    const newIsBlackAI = false;
    setIsWhiteAI(newIsWhiteAI);
    setIsBlackAI(newIsBlackAI);

    setGameInfo({ ...initialGameStatus });
    flashedCheckStateRef.current = null;
    setCapturedPieces({ white: [], black: [] });

    const initialCastlingRights = getCastlingRightsString(initialBoardState);
    const initialHash = boardToPositionHash(initialBoardState, 'white', initialCastlingRights, null);
    if(initialHash) setPositionHistory([initialHash]); else setPositionHistory([]);


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
    setPromotionMoveWasCapture(false);
    setPromotionPawnOriginalLevel(null);
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    setHistoryStack([]);
    setLastMoveFrom(null);
    setLastMoveTo(null);

    setIsAiThinking(false);
    aiErrorOccurredRef.current = false;

    setBoardOrientation(determineBoardOrientation());
    setAnimatedSquareTo(null);
    setIsMoveProcessing(false);

    setIsAwaitingPawnSacrifice(false);
    setPlayerToSacrificePawn(null);
    setBoardForPostSacrifice(null);
    setPlayerWhoMadeQueenMove(null);
    setIsExtraTurnFromQueenMove(false);

    setIsAwaitingRookSacrifice(false);
    setPlayerToSacrificeForRook(null);
    setRookToMakeInvulnerable(null);
    setBoardForRookSacrifice(null);
    setOriginalTurnPlayerForRookSacrifice(null);
    setIsExtraTurnFromRookLevelUp(false);

    setIsResurrectionPromotionInProgress(false);
    setPlayerForPostResurrectionPromotion(null);
    setIsExtraTurnForPostResurrectionPromotion(false);

    setFirstBloodAchieved(false);
    setPlayerWhoGotFirstBlood(null);
    setIsAwaitingCommanderPromotion(false);

    setShroomSpawnCounter(0);
    setNextShroomSpawnTurn(Math.floor(Math.random() * 6) + 5);

    setActiveTimerPlayer(null);
    setRemainingTime(null);
    setTurnTimeouts({ white: 0, black: 0 });
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;
    setLocalPlayerColor(null);

    toast({ title: "Game Reset", description: "The board has been reset.", duration: 2500 });
    if (webRTC.isConnected) {
      webRTC.disconnect();
    }
  }, [toast, determineBoardOrientation, getCastlingRightsString, boardToPositionHash, webRTC, localPlayerColor, getPlayerDisplayName]);

  const handleUndo = useCallback(() => {
    if (webRTC.isConnected || (isAiThinking && ((currentPlayer === 'white' && isWhiteAI) || (currentPlayer === 'black' && isBlackAI))) || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || isAwaitingCommanderPromotion) {
      toast({ title: "Undo Failed", description: "Cannot undo during AI turn, processing, or pending actions. Undo is disabled in online games.", duration: 2500 });
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
      setGameMoveCounter(stateToRestore.gameMoveCounter || 0);
      setEnPassantTargetSquare(stateToRestore.enPassantTargetSquare || null);

      setIsWhiteAI(stateToRestore.isWhiteAI);
      setIsBlackAI(stateToRestore.isBlackAI);
      setViewMode(stateToRestore.viewMode);
      setBoardOrientation(determineBoardOrientation());

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
      setPromotionSquare(stateToRestore.promotionSquare || null);
      setPromotionMoveWasCapture(stateToRestore.promotionMoveWasCapture || false);
      setPromotionPawnOriginalLevel(stateToRestore.promotionPawnOriginalLevel || null);
      setAnimatedSquareTo(null);
      setIsMoveProcessing(false);
      aiErrorOccurredRef.current = false;
      setHistoryStack(newHistoryStack);

      setIsAwaitingPawnSacrifice(stateToRestore.isAwaitingPawnSacrifice);
      setPlayerToSacrificePawn(stateToRestore.playerToSacrificePawn);
      setBoardForPostSacrifice(stateToRestore.boardForPostSacrifice);
      setPlayerWhoMadeQueenMove(stateToRestore.playerWhoMadeQueenMove);
      setIsExtraTurnFromQueenMove(stateToRestore.isExtraTurnFromQueenMove);

      setIsAwaitingRookSacrifice(stateToRestore.isAwaitingRookSacrifice);
      setPlayerToSacrificeForRook(stateToRestore.playerToSacrificeForRook);
      setRookToMakeInvulnerable(stateToRestore.rookToMakeInvulnerable);
      setBoardForRookSacrifice(stateToRestore.boardForRookSacrifice);
      setOriginalTurnPlayerForRookSacrifice(stateToRestore.originalTurnPlayerForRookSacrifice);
      setIsExtraTurnFromRookLevelUp(stateToRestore.isExtraTurnFromRookLevelUp);

      setIsResurrectionPromotionInProgress(stateToRestore.isResurrectionPromotionInProgress);
      setPlayerForPostResurrectionPromotion(stateToRestore.playerForPostResurrectionPromotion);
      setIsExtraTurnForPostResurrectionPromotion(stateToRestore.isExtraTurnForPostResurrectionPromotion);

      setFirstBloodAchieved(stateToRestore.firstBloodAchieved);
      setPlayerWhoGotFirstBlood(stateToRestore.playerWhoGotFirstBlood);
      setIsAwaitingCommanderPromotion(stateToRestore.isAwaitingCommanderPromotion);

      setShroomSpawnCounter(stateToRestore.shroomSpawnCounter || 0);
      setNextShroomSpawnTurn(stateToRestore.nextShroomSpawnTurn || (Math.floor(Math.random() * 6) + 5));

      setActiveTimerPlayer(stateToRestore.activeTimerPlayer || null);
      setRemainingTime(stateToRestore.remainingTime || null);
      setTurnTimeouts(stateToRestore.turnTimeouts || { white: 0, black: 0 });
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      

      toast({ title: "Move Undone", description: "Returned to previous state.", duration: 2500 });
    } else {
      setLastMoveFrom(null);
      setLastMoveTo(null);
    }
  }, [
    historyStack, isAiThinking, toast, currentPlayer, isWhiteAI, isBlackAI, determineBoardOrientation, isMoveProcessing,
    isAwaitingPawnSacrifice, isAwaitingRookSacrifice, isResurrectionPromotionInProgress, isAwaitingCommanderPromotion,
    setBoard, setCurrentPlayer, setGameInfo, setCapturedPieces, setKillStreaks, setLastCapturePlayer,
    setPositionHistory, setLastMoveFrom, setLastMoveTo, setIsWhiteAI, setIsBlackAI, setViewMode, setBoardOrientation,
    setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves, setFlashMessage,
    setShowCheckFlashBackground, setShowCaptureFlash, setShowCheckmatePatternFlash, setIsPromotingPawn,
    setPromotionSquare, setAnimatedSquareTo, setIsMoveProcessing, setHistoryStack, setKillStreakFlashMessage,
    setIsAwaitingPawnSacrifice, setPlayerToSacrificePawn, setBoardForPostSacrifice, setPlayerWhoMadeQueenMove, setIsExtraTurnFromQueenMove,
    setIsAwaitingRookSacrifice, setPlayerToSacrificeForRook, setRookToMakeInvulnerable, setBoardForRookSacrifice, setOriginalTurnPlayerForRookSacrifice, setIsExtraTurnFromRookLevelUp,
    setIsResurrectionPromotionInProgress, setPlayerForPostResurrectionPromotion, setIsExtraTurnForPostResurrectionPromotion, setGameMoveCounter,
    setFirstBloodAchieved, setPlayerWhoGotFirstBlood, setIsAwaitingCommanderPromotion, setEnPassantTargetSquare,
    setShroomSpawnCounter, setNextShroomSpawnTurn,
    setActiveTimerPlayer, setRemainingTime, setTurnTimeouts, webRTC.isConnected, setPromotionMoveWasCapture, setPromotionPawnOriginalLevel
  ]);


  const handleToggleViewMode = useCallback(() => {
    setViewMode(prevMode => {
      const newMode = prevMode === 'flipping' ? 'tabletop' : 'flipping';
      return newMode;
    });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
  }, [setSelectedSquare, setPossibleMoves, setEnemySelectedSquare, setEnemyPossibleMoves]);


  const handleToggleWhiteAI = useCallback(() => {
    if ((isAiThinking && currentPlayer === 'white') || isMoveProcessing || webRTC.isConnected) {
      if(webRTC.isConnected) toast({ title: "AI Control Disabled", description: "Cannot enable/disable AI during an online game.", duration: 2500 });
      return;
    }
    const newIsWhiteAI = !isWhiteAI;
    setIsWhiteAI(newIsWhiteAI);
    toast({ title: `White AI ${newIsWhiteAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
    if (newIsWhiteAI && currentPlayer === 'white' && !gameInfo.gameOver) {
      setActiveTimerPlayer(null); setRemainingTime(null);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [isAiThinking, currentPlayer, isMoveProcessing, isWhiteAI, toast, gameInfo.gameOver, webRTC.isConnected]); 

  const handleToggleBlackAI = useCallback(() => {
     if ((isAiThinking && currentPlayer === 'black') || isMoveProcessing || webRTC.isConnected) {
      if(webRTC.isConnected) toast({ title: "AI Control Disabled", description: "Cannot enable/disable AI during an online game.", duration: 2500 });
      return;
    }
    const newIsBlackAI = !isBlackAI;
    setIsBlackAI(newIsBlackAI);
    toast({ title: `Black AI ${newIsBlackAI ? 'On' : 'Off'}`, duration: 1500 });
    setSelectedSquare(null); setPossibleMoves([]);
    setEnemySelectedSquare(null); setEnemyPossibleMoves([]);
     if (newIsBlackAI && currentPlayer === 'black' && !gameInfo.gameOver) {
      setActiveTimerPlayer(null); setRemainingTime(null);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [isAiThinking, currentPlayer, isMoveProcessing, isBlackAI, toast, gameInfo.gameOver, webRTC.isConnected]);

  const isInteractionDisabled = gameInfo.gameOver || isPromotingPawn || isAiThinking || isMoveProcessing || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood !== currentPlayer) || (webRTC.isConnected && localPlayerColor !== currentPlayer && !((currentPlayer === 'white' && isWhiteAI && !webRTC.isConnected) || (currentPlayer === 'black' && isBlackAI && !webRTC.isConnected)) );

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {showCaptureFlash && <div key={`capture-${captureFlashKey}`} className="fixed inset-0 z-10 animate-capture-pattern-flash" />}
      {showCheckFlashBackground && <div key={`check-${checkFlashBackgroundKey}`} className="fixed inset-0 z-10 animate-check-pattern-flash" />}
      {showCheckmatePatternFlash && <div key={`checkmate-${checkmatePatternFlashKey}`} className="fixed inset-0 z-10 animate-checkmate-pattern-flash" />}

      <div ref={mainContentRef} className="relative z-20 w-full flex flex-col items-center">
        {flashMessage && (<div key={`flash-${flashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' || flashMessage === 'DRAW!' || flashMessage === 'INFILTRATION!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{flashMessage}</p></div></div>)}
        {killStreakFlashMessage && (<div key={`streak-${killStreakFlashMessageKey}`} className={`fixed inset-0 flex items-center justify-center z-50 pointer-events-none`} aria-live="assertive"><div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl animate-flash-check`}><p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-accent font-sans text-center" style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}>{killStreakFlashMessage}</p></div></div>)}

        <div className="w-full flex flex-col items-center mb-6 space-y-3">
          <div className="flex items-center justify-center gap-4">
            <Image
              src="/images/rook-title.gif"
              alt="Vibe Chess Rook"
              width={48}
              height={48}
              unoptimized
              className="hidden md:block"
              data-ai-hint="chess rook"
            />
            <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">VIBE CHESS</h1>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2">
            <Button variant="outline" onClick={resetGame} aria-label={webRTC.isConnected ? "Resign Game" : "Reset Game"} className="h-8 px-2 text-sm font-medium">
              {webRTC.isConnected ? <Flag className="mr-1" /> : <RefreshCw className="mr-1" />} {webRTC.isConnected ? 'Resign' : 'Reset'}
            </Button>
            <Button variant="outline" onClick={() => setIsRulesDialogOpen(true)} aria-label="View Game Rules" className="h-8 px-2 text-sm font-medium">
              <BookOpen className="mr-1" /> Rules
            </Button>
            <Button variant="outline" onClick={handleUndo} disabled={webRTC.isConnected || historyStack.length === 0 || isAiThinking || isMoveProcessing || isAwaitingPawnSacrifice || isAwaitingRookSacrifice || isResurrectionPromotionInProgress || (isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer)} aria-label="Undo Move" className="h-8 px-2 text-sm font-medium">
              <Undo2 className="mr-1" /> Undo
            </Button>
            <Button variant="outline" onClick={handleToggleWhiteAI} disabled={webRTC.isConnected || (isAiThinking && currentPlayer === 'white') || isMoveProcessing} aria-label="Toggle White AI" className="h-8 px-2 text-sm font-medium">
              <Bot className="mr-1" /> White AI: {isWhiteAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleBlackAI} disabled={webRTC.isConnected || (isAiThinking && currentPlayer === 'black') || isMoveProcessing} aria-label="Toggle Black AI" className="h-8 px-2 text-sm font-medium">
              <Bot className="mr-1" /> Black AI: {isBlackAI ? 'On' : 'Off'}
            </Button>
            <Button variant="outline" onClick={handleToggleViewMode} disabled={webRTC.isConnected} aria-label="Toggle Board View" className="h-8 px-2 text-sm font-medium">
              <View className="mr-1" /> View: {viewMode === 'flipping' ? 'Hotseat' : 'Tabletop'}
            </Button>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (webRTC.isConnected) {
                  webRTC.disconnect();
                  setLocalPlayerColor(null);
                  setActiveTimerPlayer(null); setRemainingTime(null);
                  resetGame(); 
                } else {
                  await webRTC.createRoom();
                  setLocalPlayerColor('white');
                  if (currentPlayer === 'white' && !isWhiteAI && !isBlackAI) startOrResetTurnTimer('white');
                }
              }}
              disabled={webRTC.isConnecting || (!webRTC.isConnected && (isWhiteAI || isBlackAI))}
              className="h-8 px-2 text-sm font-medium"
              aria-label={webRTC.isConnected ? "Disconnect from Online Game" : "Create Online Game"}
            >
              {webRTC.isConnected ? <Link2Off className="mr-1" /> : <Globe className="mr-1" />}
              {webRTC.isConnecting ? 'Connecting...' : webRTC.isConnected ? `Room: ${webRTC.roomId} (Disconnect)` : 'Create Online Game'}
            </Button>
            <div className="flex gap-1 items-center">
              <Input
                type="text"
                placeholder="Room ID"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                className="h-8 px-2 text-xs font-medium w-24"
                disabled={webRTC.isConnected || webRTC.isConnecting || isWhiteAI || isBlackAI}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (inputRoomId) {
                    await webRTC.joinRoom(inputRoomId);
                    setLocalPlayerColor('black');
                     if (currentPlayer === 'black' && !isWhiteAI && !isBlackAI) startOrResetTurnTimer('black');
                  }
                }}
                disabled={webRTC.isConnected || webRTC.isConnecting || !inputRoomId || isWhiteAI || isBlackAI}
                className="h-8 px-2 text-sm font-medium"
                aria-label="Join Online Game"
              >
                Join
              </Button>
            </div>
            {webRTC.error && <p className="text-sm font-medium text-destructive">{webRTC.error}</p>}
             {webRTC.isConnected && localPlayerColor && <p className="text-sm font-medium text-primary">You are playing as {localPlayerColor}.</p>}
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
          <div className="md:w-1/3 lg:w-1/4">
            <GameControls
              currentPlayer={currentPlayer}
              gameStatusMessage={
                isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer && !((currentPlayer === 'white' && isWhiteAI && !webRTC.isConnected) || (currentPlayer === 'black' && isBlackAI && !webRTC.isConnected)) ? `${getPlayerDisplayName(playerWhoGotFirstBlood!)}: Select L1 Pawn for Commander!` :
                  isResurrectionPromotionInProgress ? `${getPlayerDisplayName(playerForPostResurrectionPromotion!)} promoting piece!` :
                    isAwaitingPawnSacrifice ? `${getPlayerDisplayName(playerToSacrificePawn!)} select Pawn/Cmdr to sacrifice!` :
                      isAwaitingRookSacrifice ? `${getPlayerDisplayName(playerToSacrificeForRook!)}: Rook action pending.` :
                        gameInfo.message || "\u00A0"
              }
              capturedPieces={capturedPieces}
              isCheck={gameInfo.isCheck}
              isGameOver={gameInfo.gameOver}
              killStreaks={killStreaks}
              isWhiteAI={isWhiteAI && !webRTC.isConnected}
              isBlackAI={isBlackAI && !webRTC.isConnected}
              activeTimerPlayer={activeTimerPlayer}
              remainingTime={remainingTime}
              turnTimeouts={turnTimeouts}
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
              isInteractionDisabled={isInteractionDisabled}
              applyBoardOpacityEffect={applyBoardOpacityEffect}
              playerInCheck={gameInfo.playerWithKingInCheck}
              viewMode={viewMode}
              animatedSquareTo={animatedSquareTo}
              lastMoveFrom={lastMoveFrom}
              lastMoveTo={lastMoveTo}
              isAwaitingPawnSacrifice={isAwaitingPawnSacrifice}
              playerToSacrificePawn={playerToSacrificePawn}
              isAwaitingCommanderPromotion={isAwaitingCommanderPromotion && playerWhoGotFirstBlood === currentPlayer}
              playerToPromoteCommander={playerWhoGotFirstBlood === currentPlayer ? currentPlayer : null}
              enPassantTargetSquare={enPassantTargetSquare}
            />
          </div>
        </div>
      </div>
      <PromotionDialog
        isOpen={isPromotingPawn}
        onSelectPiece={handlePromotionSelect}
        pawnColor={
            promotionSquare &&
            (isResurrectionPromotionInProgress ? playerForPostResurrectionPromotion : board[algebraicToCoords(promotionSquare).row][algebraicToCoords(promotionSquare).col].piece?.color) || null
        }
      />
      <RulesDialog isOpen={isRulesDialogOpen} onOpenChange={setIsRulesDialogOpen} />
    </div>
  );
}
