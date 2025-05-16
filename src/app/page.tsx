
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { 
  initializeBoard, 
  applyMove, 
  algebraicToCoords, 
  getPossibleMoves,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  filterLegalMoves
} from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, Piece, Move, GameStatus } from '@/types';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const initialGameStatus: GameStatus = {
  message: "White's turn to move.",
  isCheck: false,
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

  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameInfo(initialGameStatus);
    setCapturedPieces({ white: [], black: [] });
    setFlashMessage(null);
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
      // If no longer in check or checkmate, clear the message immediately if it's visible
      // This handles scenarios where a player moves out of check.
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


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    if (gameInfo.gameOver) return;

    const { row, col } = algebraicToCoords(algebraic);
    const clickedPiece = board[row][col].piece;

    if (selectedSquare) {
      const pieceToMove = board[algebraicToCoords(selectedSquare).row][algebraicToCoords(selectedSquare).col].piece;

      if (pieceToMove && pieceToMove.color === currentPlayer && possibleMoves.includes(algebraic)) {
        const move: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured } = applyMove(board, move);
        
        setBoard(newBoard);

        if (captured) {
          setCapturedPieces(prev => ({
            ...prev,
            [pieceToMove.color]: [...prev[pieceToMove.color], captured]
          }));
          const movingPieceDetails = newBoard[row][col].piece;
          toast({
            title: "Piece Captured!",
            description: `${pieceToMove.color} ${pieceToMove.type} captured ${captured.color} ${captured.type}. ${movingPieceDetails ? `It's now level ${movingPieceDetails.level}!` : ''}`,
          });
        }

        const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
        setCurrentPlayer(nextPlayer);
        setSelectedSquare(null);
        setPossibleMoves([]);
        
        const inCheck = isKingInCheck(newBoard, nextPlayer);
        if (inCheck) {
          const mate = isCheckmate(newBoard, nextPlayer);
          if (mate) {
            setGameInfo({
              message: `Checkmate! ${currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)} wins!`,
              isCheck: true, isCheckmate: true, isStalemate: false, winner: currentPlayer, gameOver: true,
            });
          } else {
            setGameInfo({
              message: `${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)} is in Check!`,
              isCheck: true, isCheckmate: false, isStalemate: false, gameOver: false,
            });
          }
        } else {
          const stale = isStalemate(newBoard, nextPlayer);
          if (stale) {
            setGameInfo({
              message: `Stalemate! It's a draw.`,
              isCheck: false, isCheckmate: false, isStalemate: true, winner: 'draw', gameOver: true,
            });
          } else {
            setGameInfo({
              message: `${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)}'s turn to move.`,
              isCheck: false, isCheckmate: false, isStalemate: false, gameOver: false,
            });
          }
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
  }, [board, currentPlayer, selectedSquare, possibleMoves, toast, gameInfo.gameOver]);

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
            isGameOver={gameInfo.gameOver}
            playerInCheck={gameInfo.isCheck ? (gameInfo.winner === 'white' ? 'black' : gameInfo.winner === 'black' ? 'white' : currentPlayer === 'white' ? 'black' : 'white') : null}
          />
        </div>
      </div>
    </div>
  );
}
