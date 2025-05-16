'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChessBoard } from '@/components/evolving-chess/ChessBoard';
import { GameControls } from '@/components/evolving-chess/GameControls';
import { initializeBoard, applyMove, boardToStringForAI, algebraicToCoords, getPossibleMoves, coordsToAlgebraic } from '@/lib/chess-utils';
import type { BoardState, PlayerColor, AlgebraicSquare, SuggestedMoveAI, Piece, Move } from '@/types';
import { suggestMoves as suggestMovesAI } from '@/ai/flows/suggest-moves';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function EvolvingChessPage() {
  const [board, setBoard] = useState<BoardState>(initializeBoard());
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>('white');
  const [selectedSquare, setSelectedSquare] = useState<AlgebraicSquare | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<AlgebraicSquare[]>([]);
  const [gameStatus, setGameStatus] = useState<string>("White's turn to move.");
  const [suggestions, setSuggestions] = useState<SuggestedMoveAI[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [highlightedSuggestion, setHighlightedSuggestion] = useState<{from: AlgebraicSquare, to: AlgebraicSquare}[]>([]);


  const { toast } = useToast();

  const resetGame = useCallback(() => {
    setBoard(initializeBoard());
    setCurrentPlayer('white');
    setSelectedSquare(null);
    setPossibleMoves([]);
    setGameStatus("White's turn to move.");
    setSuggestions([]);
    setCapturedPieces({ white: [], black: [] });
    setHighlightedSuggestion([]);
    toast({ title: "Game Reset", description: "The board has been reset to the initial state." });
  }, [toast]);

  useEffect(() => {
    resetGame();
  }, [resetGame]);


  const handleSquareClick = useCallback((algebraic: AlgebraicSquare) => {
    setHighlightedSuggestion([]); // Clear AI suggestion highlights on any click
    const { row, col } = algebraicToCoords(algebraic);
    const clickedPiece = board[row][col].piece;

    if (selectedSquare) {
      const { row: fromRow, col: fromCol } = algebraicToCoords(selectedSquare);
      const pieceToMove = board[fromRow][fromCol].piece;

      if (pieceToMove && possibleMoves.includes(algebraic)) {
        // Make the move
        const move: Move = { from: selectedSquare, to: algebraic };
        const { newBoard, capturedPiece: captured } = applyMove(board, move);
        setBoard(newBoard);

        if (captured) {
          setCapturedPieces(prev => ({
            ...prev,
            [pieceToMove.color]: [...prev[pieceToMove.color], captured]
          }));
          const movingPieceDetails = newBoard[row][col].piece; // Get updated piece details
          toast({
            title: "Piece Captured!",
            description: `${pieceToMove.color} ${pieceToMove.type} captured ${captured.color} ${captured.type}. ${movingPieceDetails ? `It's now level ${movingPieceDetails.level}!` : ''}`,
          });
        }

        const nextPlayer = currentPlayer === 'white' ? 'black' : 'white';
        setCurrentPlayer(nextPlayer);
        setGameStatus(`${nextPlayer.charAt(0).toUpperCase() + nextPlayer.slice(1)}'s turn to move.`);
        setSelectedSquare(null);
        setPossibleMoves([]);
        setSuggestions([]); // Clear suggestions after a move
      } else {
        // Clicked on a different square or invalid move, deselect or select new piece
        setSelectedSquare(null);
        setPossibleMoves([]);
        if (clickedPiece && clickedPiece.color === currentPlayer) {
          setSelectedSquare(algebraic);
          setPossibleMoves(getPossibleMoves(board, algebraic));
        }
      }
    } else if (clickedPiece && clickedPiece.color === currentPlayer) {
      // No piece selected, select this one
      setSelectedSquare(algebraic);
      setPossibleMoves(getPossibleMoves(board, algebraic));
    }
  }, [board, currentPlayer, selectedSquare, possibleMoves, toast]);

  const handleSuggestMoves = async () => {
    setIsLoadingSuggestions(true);
    setSuggestions([]);
    setHighlightedSuggestion([]);
    try {
      const boardString = boardToStringForAI(board);
      const aiSuggestions = await suggestMovesAI({
        boardState: boardString,
        playerToMove: currentPlayer,
      });
      setSuggestions(aiSuggestions);
      if (aiSuggestions.length > 0) {
         toast({ title: "Move Suggestions Ready", description: "AI has provided some move suggestions." });
      } else {
         toast({ title: "No Suggestions", description: "AI couldn't find any suggestions for the current state.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error fetching AI suggestions:", error);
      toast({
        title: "Error Fetching Suggestions",
        description: "Could not get suggestions from the AI.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSuggestions(false);
    }
  };
  
  const handleSuggestionClick = (suggestion: SuggestedMoveAI) => {
    // Example move format: "e2-e4" or "Nb1-c3" or "a7a5"
    // This parsing is very basic and needs to be robust
    const parts = suggestion.move.match(/([a-h][1-8])[-]?([a-h][1-8])/i);
    if (parts && parts[1] && parts[2]) {
      const from = parts[1].toLowerCase() as AlgebraicSquare;
      const to = parts[2].toLowerCase() as AlgebraicSquare;
      
      const {row: fromRow, col: fromCol} = algebraicToCoords(from);
      const piece = board[fromRow][fromCol].piece;

      if(piece && piece.color === currentPlayer) {
        setSelectedSquare(from);
        setPossibleMoves(getPossibleMoves(board, from));
        setHighlightedSuggestion([{from, to}]); // Highlight this specific move
        toast({ title: "Suggestion Highlighted", description: `Move ${from} to ${to} is shown on the board.` });
      } else {
        toast({ title: "Invalid Suggestion", description: `Cannot make the suggested move: ${suggestion.move}. It might be for the wrong piece or invalid.`, variant: "destructive" });
      }
    } else {
       toast({ title: "Cannot Parse Suggestion", description: `Could not understand the suggested move format: ${suggestion.move}`, variant: "destructive" });
    }
  };


  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
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
            onSuggestMoves={handleSuggestMoves}
            isLoadingSuggestions={isLoadingSuggestions}
            suggestions={suggestions}
            gameStatus={gameStatus}
            capturedPieces={capturedPieces}
            onSuggestionClick={handleSuggestionClick}
          />
        </div>
        <div className="md:w-2/3 lg:w-3/4 flex justify-center items-start">
          <ChessBoard
            boardState={board}
            selectedSquare={selectedSquare}
            possibleMoves={possibleMoves}
            suggestedMovesCoords={highlightedSuggestion}
            onSquareClick={handleSquareClick}
            playerColor="white" // For now, always white's perspective. Could be configurable.
          />
        </div>
      </div>
    </div>
  );
}
