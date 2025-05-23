
'use client';

import type { PlayerColor, Piece } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { cn } from '@/lib/utils';

interface GameControlsProps {
  currentPlayer: PlayerColor;
  gameStatusMessage: string;
  capturedPieces: { white: Piece[], black: Piece[] };
  isCheck: boolean;
  isGameOver: boolean;
  killStreaks: { white: number, black: number };
  isWhiteAI: boolean; // New prop
  isBlackAI: boolean; // New prop
}

export function GameControls({
  currentPlayer,
  gameStatusMessage,
  capturedPieces,
  isCheck,
  isGameOver,
  killStreaks,
  isWhiteAI, // Destructure new prop
  isBlackAI, // Destructure new prop
}: GameControlsProps) {

  const renderCapturedPieces = (color: PlayerColor) => {
    const actualCaptured = color === 'white' ? capturedPieces.black : capturedPieces.white;
    return (
      <div>
        <div className="flex flex-wrap gap-1 p-1 bg-background rounded-none min-h-[28px]">
          {actualCaptured.length === 0 && <span className="text-xs text-muted-foreground font-pixel">None</span>}
          {actualCaptured.map(p => (
            <div key={p.id} className="w-6 h-6 relative">
              <ChessPieceDisplay piece={p} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getPlayerDisplayNameWithAI = (player: PlayerColor) => {
    let name = player.charAt(0).toUpperCase() + player.slice(1);
    if (player === 'white' && isWhiteAI) name += " (AI)";
    if (player === 'black' && isBlackAI) name += " (AI)";
    return name;
  };

  let currentTurnMessage = gameStatusMessage;
   if (!currentTurnMessage && !isGameOver) {
    currentTurnMessage = "\u00A0"; 
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="pb-2">
        <CardDescription
          className={cn(
            "text-center font-pixel min-h-[1.5em]",
             isCheck && !isGameOver && "text-destructive font-bold animate-pulse",
             (gameStatusMessage.includes("(AI) is thinking...") && "text-primary font-bold")
          )}
        >
          {currentTurnMessage}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground font-pixel">Current Player</p>
          <p className={cn(
              "text-xl font-semibold font-pixel",
              currentPlayer === 'white' ? 'text-foreground' : 'text-secondary',
              isGameOver && "opacity-50"
            )}
          >
            {isGameOver ? "-" : getPlayerDisplayNameWithAI(currentPlayer)}
          </p>
        </div>

        <div className="text-center mt-2 space-y-1">
          <p className="text-sm font-medium text-destructive font-pixel">
            White's Streak: {killStreaks.white}
          </p>
          <p className="text-sm font-medium text-destructive font-pixel">
            Black's Streak: {killStreaks.black}
          </p>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured Black Pieces:</h3>
          {renderCapturedPieces('black')}
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured White Pieces:</h3>
          {renderCapturedPieces('white')}
        </div>

        <Separator />
      </CardContent>
    </Card>
  );
}

    