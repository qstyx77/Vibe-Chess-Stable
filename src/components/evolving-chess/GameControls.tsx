
'use client';

import type { PlayerColor, Piece } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { PieceAbilitiesInfo } from './PieceAbilitiesInfo';
import { cn } from '@/lib/utils';
import React from 'react';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, firestore } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

interface GameControlsProps {
  currentPlayer: PlayerColor;
  gameStatusMessage: string;
  capturedPieces: { white: Piece[], black: Piece[] };
  isCheck: boolean;
  isGameOver: boolean;
  killStreaks: { white: number, black: number };
  isWhiteAI: boolean;
  isBlackAI: boolean;
  pieceForInfoDisplay: Piece | null;
  localPlayerColor?: PlayerColor | null;
  getPlayerDisplayName: (player: PlayerColor) => string;
  onlineStatus: 'disconnected' | 'connecting' | 'connected' | 'waiting';
  turnTimer: number | null;
  activeTimerPlayer: PlayerColor | null;
}

export function GameControls({
  currentPlayer,
  gameStatusMessage,
  capturedPieces,
  isCheck,
  isGameOver,
  killStreaks,
  isWhiteAI,
  isBlackAI,
  pieceForInfoDisplay,
  localPlayerColor,
  getPlayerDisplayName,
  onlineStatus,
  turnTimer,
  activeTimerPlayer,
}: GameControlsProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  
  const { data: userData } = useDoc(userDocRef);


  const renderCapturedPieces = (color: PlayerColor) => {
    // Corrected logic: Show pieces of 'color' that have been captured.
    // White captures black pieces, so they go in the 'white' array.
    const actualCaptured = color === 'white' ? capturedPieces.white : capturedPieces.black;
    
    return (
      <div>
        <div className="flex flex-wrap gap-1 p-1 bg-background rounded-none min-h-[28px]">
          {actualCaptured.length === 0 && <span className="text-sm font-medium text-muted-foreground">None</span>}
          {actualCaptured.map(p => (
            <div key={p.id} className="w-6 h-6 relative">
              <ChessPieceDisplay piece={p} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  let currentTurnMessage = gameStatusMessage;
   if (!currentTurnMessage && !isGameOver) {
    currentTurnMessage = " ";
  }
  
  const timerDisplay = onlineStatus === 'connected' ? (turnTimer !== null ? turnTimer.toString().padStart(2, '0') : '45') : '00';


  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="pb-2">
          <CardDescription
            className={cn(
              "text-center text-sm font-medium min-h-[1.5em]",
              isCheck && !isGameOver && "text-destructive font-bold animate-pulse",
              (gameStatusMessage.includes("(AI) is thinking...") && "text-primary font-bold")
            )}
          >
           {currentTurnMessage}
          </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {user ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-primary">{user.displayName || user.email}</p>
            {userData && (
               <p className="text-sm font-medium text-muted-foreground">ELO: {userData.eloRating}</p>
            )}
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground">
            Not logged in
          </div>
        )}
        <Separator/>
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Current Player</p>
          <p className={cn(
              "text-xl font-semibold font-sans",
              currentPlayer === 'white' ? 'text-foreground' : 'text-secondary',
              isGameOver && "opacity-50"
            )}
          >
            {isGameOver ? "-" : getPlayerDisplayName(currentPlayer)}
          </p>
          {onlineStatus === 'connected' && !isGameOver && activeTimerPlayer && (
            <div className="text-center mt-2">
              <p className="text-sm font-medium text-muted-foreground">Time Left</p>
              <p className="text-xl font-semibold font-mono text-primary animate-pulse">
                {timerDisplay}
              </p>
            </div>
          )}
        </div>

        <div className="text-center mt-2 space-y-1">
          <p className="text-sm font-medium text-destructive">
            White's Streak: {killStreaks.white}
          </p>
          <p className="text-sm font-medium text-destructive">
            Black's Streak: {killStreaks.black}
          </p>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Captured Black Pieces:</h3>
          {renderCapturedPieces('white')}
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Captured White Pieces:</h3>
          {renderCapturedPieces('black')}
        </div>

        <Separator />
        
        <div className="min-h-[140px]">
          {pieceForInfoDisplay ? (
            <PieceAbilitiesInfo piece={pieceForInfoDisplay} />
          ) : (
             <div className="text-center text-sm font-medium text-muted-foreground pt-2">
                Select or hover over a piece to see its abilities.
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

    
