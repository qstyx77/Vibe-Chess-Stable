
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { PromotionDialog } from '@/components/evolving-chess/PromotionDialog';
import { 
  initializeBoard, 
  applyMove, 
  algebraicToCoords, 
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  filterLegalMoves,
  coordsToAlgebraic
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus, PieceType } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const initialGameStatus: GameStatus = {
  message: "White's turn to move.",
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

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);

  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);

  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameInfo(initialGameStatus);
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
    setIsPromotingPawn(false);
    setPromotionSquare(null);
    toast({ title: "Game Reset", description: "The board has been reset to the initial state." });
  }, [toast]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    const clearExistingTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };
  
    if (gameInfo.isCheckmate) {
      clearExistingTimer();
      setFlashMessage('CHECKMATE!');
      setFlashMessageKey(prev => prev + 1);
      timerId = setTimeout(() => setFlashMessage(null), 2500); 
    } else if (gameInfo.isCheck && !gameInfo.isStalemate && !gameInfo.gameOver) {
      clearExistingTimer();
      setFlashMessage('CHECK!');
      setFlashMessageKey(prev => prev + 1);
      timerId = setTimeout(() => setFlashMessage(null), 1500);
    } else if (!gameInfo.isCheck && !gameInfo.isCheckmate) {
      if (flashMessage) {
        clearExistingTimer();
        setFlashMessage(null);
      }
    }
  
    return () => {
      clearExistingTimer();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameInfo.isCheck, gameInfo.isCheckmate, gameInfo.isStalemate, gameInfo.gameOver]);

  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    
    const inCheck = isKingInCheck(updatedBoard, nextPlayer);
    if (inCheck) {
      const mate = isCheckmate(updatedBoard, nextPlayer);
      if (mate) {
        setGameInfo({
          message: `Checkmate! ${playerWhoseTurnEnded.charAt(0).toUpperCase() + playerWhoseTurnEnded.slice(1)} wins!`,
          isCheck: true, 
          playerWithKingInCheck: nextPlayer,
          isCheckmate: true, 
          isStalemate: false, 
          winner: playerWhoseTurnEnded, 
          gameOver: true,
        });
      } else {
        setGameInfo({
          message: `${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)} is in Check!`,
          isCheck: true, 
          playerWithKingInCheck: nextPlayer,
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
          message: `${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)}'s turn to move.`,
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

    const { row, col } = algebraicToCoords(algebraic);
    const clickedPieceData = board[row][col]; 
    const clickedPiece = clickedPieceData.piece;


    if (selectedSquare) {
      const pieceToMoveData = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col];
      const pieceToMove = pieceToMoveData.piece;

      if (pieceToMove && pieceToMove.color === currentPlayer && possibleMoves.includes(algebraic)) {
        const move: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured } = applyMove(board, move);
        
        const movedPieceFinalSquare = newBoard[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
        const movedPiece = movedPieceFinalSquare.piece;

        if (captured) {
          setCapturedPieces(prev => ({
            ...prev,
            [pieceToMove.color]: [...prev[pieceToMove.color], captured]
          }));
          toast({
            title: "Piece Captured!",
            description: `${pieceToMove.color} ${pieceToMove.type} captured ${captured.color} ${captured.type}. ${movedPiece ? `It's now level ${movedPiece.level}!` : ''}`,
          });
        }
        
        const {row: toRowPawnCheck} = algebraicToCoords(algebraic);
        if (movedPiece && movedPiece.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7)) {
            setBoard(newBoard); 
            setIsPromotingPawn(true);
            setPromotionSquare(algebraic);
            setSelectedSquare(null); 
            setPossibleMoves([]);
        } else {
            setBoard(newBoard);
            completeTurn(newBoard, currentPlayer);
        }

      } else { 
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color === currentPlayer) {
          setSelectedSquare(algebraic);
          const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
          const legalFilteredMoves = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
          setPossibleMoves(legalFilteredMoves);
        }
      }
    } else if (clickedPiece && clickedPiece.color === currentPlayer) { 
      setSelectedSquare(algebraic);
      const pseudoPossibleMoves = getPossibleMoves(board, algebraic);
      const legalFilteredMoves = filterLegalMoves(board, algebraic, pseudoPossibleMoves, currentPlayer);
      setPossibleMoves(legalFilteredMoves);
    }
  }, [board, currentPlayer, selectedSquare, possibleMoves, toast, gameInfo.gameOver, isPromotingPawn, completeTurn]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;

    const { row, col } = algebraicToCoords(promotionSquare);
    const originalPawnOnCurrentBoard = board[row][col].piece; 
    if (!originalPawnOnCurrentBoard || originalPawnOnCurrentBoard.type !== 'pawn') {
      // This case should ideally not be reached if logic is correct
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      return;
    }

    const originalPawnLevel = originalPawnOnCurrentBoard.level;
    const pawnColor = originalPawnOnCurrentBoard.color;

    const newBoard = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); // Deep copy
    const promotedPieceRef = newBoard[row][col].piece;

    if (promotedPieceRef && promotedPieceRef.type === 'pawn') {
      promotedPieceRef.type = pieceType;
      promotedPieceRef.level = 1; 
      
      setBoard(newBoard);
      toast({
        title: "Pawn Promoted!",
        description: `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} pawn promoted to ${pieceType}! (Level 1)`,
      });
      
      if (originalPawnLevel >= 5) {
        toast({
          title: "Extra Turn!",
          description: `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} gets an extra turn!`,
          duration: 3000,
        });
        
        // Player (pawnColor) gets an extra turn. CurrentPlayer does not change.
        setSelectedSquare(null);
        setPossibleMoves([]);

        const opponentColor = pawnColor === 'white' ? 'black' : 'white';
        const opponentInCheck = isKingInCheck(newBoard, opponentColor);

        if (opponentInCheck) {
          const opponentIsCheckmated = isCheckmate(newBoard, opponentColor);
          if (opponentIsCheckmated) {
            setGameInfo({
              message: `Checkmate! ${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} wins!`,
              isCheck: true,
              playerWithKingInCheck: opponentColor,
              isCheckmate: true,
              isStalemate: false,
              winner: pawnColor, 
              gameOver: true,
            });
          } else {
            setGameInfo({
              message: `${opponentColor.charAt(0).toUpperCase() + opponentColor.slice(1)} is in Check! ${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)}'s extra turn.`,
              isCheck: true,
              playerWithKingInCheck: opponentColor,
              isCheckmate: false,
              isStalemate: false,
              gameOver: false,
            });
          }
        } else {
          const opponentIsStalemated = isStalemate(newBoard, opponentColor);
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
          } else {
            setGameInfo({
              message: `${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)}'s turn to move. (Extra Turn)`,
              isCheck: false,
              playerWithKingInCheck: null,
              isCheckmate: false,
              isStalemate: false,
              gameOver: false,
            });
          }
        }
      } else {
        // Normal turn completion - switches player
        completeTurn(newBoard, pawnColor);
      }
    }

    setIsPromotingPawn(false);
    setPromotionSquare(null);
  }, [board, promotionSquare, completeTurn, toast]);


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      {flashMessage && (
        <div
          key={flashMessageKey}
          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          aria-live="assertive"
        >
          <div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${gameInfo.isCheckmate ? 'animate-flash-checkmate' : 'animate-flash-check'}`}>
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center"
               style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}
            >
              {flashMessage}
            </p>
          </div>
        </div>
      )}
      <div className="w-full flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-primary font-pixel">Evolving Chess</h1>
        <Button variant="outline" onClick={resetGame} aria-label="Reset Game">
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset Game
        </Button>
      </div>
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl">
        <div className="md:w-1/3 lg:w-1/4">
          <GameControls
            currentPlayer={currentPlayer}
            gameStatusMessage={gameInfo.message}
            capturedPieces={capturedPieces}
            isCheck={gameInfo.isCheck}
            isGameOver={gameInfo.gameOver}
          />
        </div>
        <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
          <ChessBoard
            boardState={board}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            onSquareClick={handleSquareClick}
            playerColor="white" 
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
    </div>
  );
}
