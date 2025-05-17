
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

  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [flashMessageKey, setFlashMessageKey] = useState<number>(0);
  
  const [isPromotingPawn, setIsPromotingPawn] = useState(false);
  const [promotionSquare, setPromotionSquare] = useState<AlgebraicSquare | null>(null);

  const [killStreaks, setKillStreaks] = useState<{ white: number, black: number }>({ white: 0, black: 0 });
  const [lastCapturePlayer, setLastCapturePlayer] = useState<PlayerColor | null>(null);

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
    setKillStreaks({ white: 0, black: 0 });
    setLastCapturePlayer(null);
    toast({ title: "Game Reset", description: "The board has been reset to the initial state." });
  }, [toast]);

   // Effect for Check/Checkmate flash messages
   useEffect(() => {
    let newFlash: string | null = null;
    if (gameInfo.isCheckmate) {
      newFlash = 'CHECKMATE!';
    } else if (gameInfo.isCheck && gameInfo.playerWithKingInCheck && !gameInfo.gameOver && !gameInfo.isStalemate) {
      newFlash = 'CHECK!';
    }

    if (newFlash) {
      setFlashMessage(newFlash);
      setFlashMessageKey(k => k + 1);
    } else if (!gameInfo.isCheck && !gameInfo.isCheckmate) {
       setFlashMessage(null);
    }
  }, [gameInfo.isCheck, gameInfo.isCheckmate, gameInfo.playerWithKingInCheck, gameInfo.gameOver, gameInfo.isStalemate]);


  // Effect for timing out Check/Checkmate flash messages
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


  const completeTurn = useCallback((updatedBoard: BoardState, playerWhoseTurnEnded: PlayerColor) => {
    const nextPlayer = playerWhoseTurnEnded === 'white' ? 'black' : 'white';
    setCurrentPlayer(nextPlayer);
    setSelectedSquare(null);
    setPossibleMoves([]);
    
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
        let finalBoardStateForTurn = newBoard; // This board will be modified by resurrection if applicable
        
        if (captured) {
          const capturingPlayer = currentPlayer;
          const opponentPlayer = capturingPlayer === 'white' ? 'black' : 'white';

          // Add captured piece to capturing player's collection
           setCapturedPieces(prev => ({
            ...prev,
            [capturingPlayer]: [...(prev[capturingPlayer] || []), captured]
          }));
          
          toast({
            title: "Piece Captured!",
            description: `${capturingPlayer} ${finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece?.type} captured ${captured.color} ${captured.type}. ${finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece ? `It's now level ${finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col].piece?.level}!` : ''}`,
          });

          let calculatedNewStreakForCapturingPlayer;
          if (lastCapturePlayer === capturingPlayer) {
            calculatedNewStreakForCapturingPlayer = (killStreaks[capturingPlayer] || 0) + 1;
          } else {
            calculatedNewStreakForCapturingPlayer = 1;
          }

          setKillStreaks(prevKillStreaks => {
            const updatedStreaks = { ...prevKillStreaks };
            if (lastCapturePlayer === capturingPlayer) {
              updatedStreaks[capturingPlayer]++;
            } else {
              updatedStreaks[capturingPlayer] = 1;
              if (updatedStreaks[opponentPlayer] > 0) { 
                 updatedStreaks[opponentPlayer] = 0; 
              }
            }
            return updatedStreaks;
          });
          setLastCapturePlayer(capturingPlayer);

          // Resurrection logic
          if (calculatedNewStreakForCapturingPlayer >= 3) {
            const piecesLostByCapturingPlayer = capturedPieces[opponentPlayer]; // These are currentPlayer's pieces captured by opponent

            if (piecesLostByCapturingPlayer && piecesLostByCapturingPlayer.length > 0) {
              const pieceToResurrectOriginal = piecesLostByCapturingPlayer[piecesLostByCapturingPlayer.length - 1]; // Take the last one
              const resurrectedPiece = { 
                ...pieceToResurrectOriginal, 
                level: 1, 
                id: `${pieceToResurrectOriginal.id}_res${Date.now()}` // Ensure unique ID
              };

              // Update capturedPieces state to remove the resurrected piece
              setCapturedPieces(prevGlobalCaptured => {
                const newGlobalCaptured = { ...prevGlobalCaptured };
                const specificListOfLostPieces = [...(newGlobalCaptured[opponentPlayer] || [])];
                const indexToRemove = specificListOfLostPieces.findIndex(p => p.id === pieceToResurrectOriginal.id);
                if (indexToRemove !== -1) {
                  specificListOfLostPieces.splice(indexToRemove, 1);
                }
                newGlobalCaptured[opponentPlayer] = specificListOfLostPieces;
                return newGlobalCaptured;
              });
              
              const emptySquares: AlgebraicSquare[] = [];
              // Find empty squares on the board *after the initial capture*
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
                
                // Place resurrected piece on the finalBoardStateForTurn
                finalBoardStateForTurn[resRow][resCol].piece = resurrectedPiece;
                
                toast({
                  title: "Resurrection!",
                  description: `${capturingPlayer}'s ${resurrectedPiece.type} has returned to the fight! (Level 1)`,
                });
              }
            }
          }

        } else { 
           // No capture this turn
           if (lastCapturePlayer === currentPlayer) {
             // Current player had a streak but didn't capture. Reset their streak.
             setKillStreaks(prevKillStreaks => ({
               ...prevKillStreaks,
               [currentPlayer]: 0,
             }));
             setLastCapturePlayer(null); 
           }
           // If lastCapturePlayer was the opponent, their streak continues (LCP remains opponent).
           // If lastCapturePlayer was null, it remains null.
        }
        
        setBoard(finalBoardStateForTurn); // Update the main board state with all changes

        const movedPieceFinalSquare = finalBoardStateForTurn[algebraicToCoords(algebraic).row][algebraicToCoords(algebraic).col];
        const movedPieceOnBoard = movedPieceFinalSquare.piece; 
        const {row: toRowPawnCheck} = algebraicToCoords(algebraic);

        if (movedPieceOnBoard && movedPieceOnBoard.type === 'pawn' && (toRowPawnCheck === 0 || toRowPawnCheck === 7)) {
            setIsPromotingPawn(true);
            setPromotionSquare(algebraic);
            setSelectedSquare(null); 
            setPossibleMoves([]);
        } else {
            completeTurn(finalBoardStateForTurn, currentPlayer);
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
  }, [board, currentPlayer, selectedSquare, possibleMoves, toast, gameInfo.gameOver, isPromotingPawn, completeTurn, lastCapturePlayer, killStreaks, capturedPieces]);

  const handlePromotionSelect = useCallback((pieceType: PieceType) => {
    if (!promotionSquare) return;

    const { row, col } = algebraicToCoords(promotionSquare);
    // Create a new board state for this update to avoid mutating the current `board` state directly
    // before `completeTurn` or extra turn logic is called.
    let boardAfterPromotion = board.map(r => r.map(s => ({...s, piece: s.piece ? {...s.piece} : null}))); 
    
    const originalPawnOnBoard = boardAfterPromotion[row][col].piece; 
    if (!originalPawnOnBoard || originalPawnOnBoard.type !== 'pawn') {
      setIsPromotingPawn(false);
      setPromotionSquare(null);
      return;
    }

    const originalPawnLevel = originalPawnOnBoard.level;
    const pawnColor = originalPawnOnBoard.color;
    
    // Promote the piece directly on boardAfterPromotion
    boardAfterPromotion[row][col].piece = {
      ...originalPawnOnBoard,
      type: pieceType,
      level: 1, // Reset level on promotion
    };
      
    setBoard(boardAfterPromotion); // Update main board state
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
        
      setSelectedSquare(null);
      setPossibleMoves([]);

      const opponentColor = pawnColor === 'white' ? 'black' : 'white';
      const opponentInCheck = isKingInCheck(boardAfterPromotion, opponentColor);
      let newPlayerWithKingInCheckForExtraTurn : PlayerColor | null = null;

      if (opponentInCheck) {
        newPlayerWithKingInCheckForExtraTurn = opponentColor;
        const opponentIsCheckmated = isCheckmate(boardAfterPromotion, opponentColor);
        if (opponentIsCheckmated) {
          setGameInfo({
            message: `Checkmate! ${pawnColor.charAt(0).toUpperCase() + pawnColor.slice(1)} wins!`,
            isCheck: true,
            playerWithKingInCheck: newPlayerWithKingInCheckForExtraTurn,
            isCheckmate: true,
            isStalemate: false,
            winner: pawnColor, 
            gameOver: true,
          });
        } else {
          setGameInfo({
            message: "Check! (Extra Turn)", 
            isCheck: true,
            playerWithKingInCheck: newPlayerWithKingInCheckForExtraTurn,
            isCheckmate: false,
            isStalemate: false,
            gameOver: false,
          });
        }
      } else {
        const opponentIsStalemated = isStalemate(boardAfterPromotion, opponentColor);
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
            message: "Extra Turn!", 
            isCheck: false,
            playerWithKingInCheck: null,
            isCheckmate: false,
            isStalemate: false,
            gameOver: false,
          });
        }
      }
    } else {
      completeTurn(boardAfterPromotion, pawnColor);
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
          <div className={`bg-black/60 p-6 md:p-8 rounded-md shadow-2xl ${flashMessage === 'CHECKMATE!' ? 'animate-flash-checkmate' : 'animate-flash-check'}`}>
            <p className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-destructive font-pixel text-center"
               style={{ textShadow: '3px 3px 0px hsl(var(--background)), -3px -3px 0px hsl(var(--background)), 3px -3px 0px hsl(var(--background)), -3px 3px 0px hsl(var(--background)), 3px 0px 0px hsl(var(--background)), -3px 0px 0px hsl(var(--background)), 0px 3px 0px hsl(var(--background)), 0px -3px 0px hsl(var(--background))' }}
            >
              {flashMessage}
            </p>
          </div>
        </div>
      )}
      
      <div className="w-full flex flex-col items-center mb-6 space-y-3">
        <h1 className="text-4xl md:text-5xl font-bold text-accent font-pixel text-center animate-pixel-title-flash">
          VIBE CHESS
        </h1>
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
            killStreaks={killStreaks}
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

    