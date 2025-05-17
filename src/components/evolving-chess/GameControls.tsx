
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
}

export function GameControls({
  currentPlayer,
  gameStatusMessage,
  capturedPieces,
  isCheck,
  isGameOver,
  killStreaks,
}: GameControlsProps) {
  
  const renderCapturedPieces = (color: PlayerColor) => {
    return (
      <div>
        <div className="flex flex-wrap gap-1 p-1 bg-background rounded-none min-h-[28px]"> {/* Added min-height */}
          {capturedPieces[color].length === 0 && <span className="text-xs text-muted-foreground font-pixel">None</span>}
          {capturedPieces[color].map(p => (
            <div key={p.id} className="w-6 h-6 relative">
              <ChessPieceDisplay piece={p} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        {/* <CardTitle className="text-center text-primary font-pixel">Evolving Chess</CardTitle> */}
        <CardDescription 
          className={cn(
            "text-center font-pixel min-h-[3em]", 
             isCheck && !isGameOver && "text-destructive font-bold animate-pulse"
          )}
        >
          {gameStatusMessage}
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
            {isGameOver ? "-" : currentPlayer.toUpperCase()}
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
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured by White:</h3>
          {renderCapturedPieces('black')}
           {killStreaks.white >= 2 && (
            <p className="text-xs text-destructive font-pixel mt-1 text-center">White's Streak: {killStreaks.white}</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured by Black:</h3>
          {renderCapturedPieces('white')}
          {killStreaks.black >= 2 && (
            <p className="text-xs text-destructive font-pixel mt-1 text-center">Black's Streak: {killStreaks.black}</p>
          )}
        </div>
        
        <Separator />
        <div className="text-center text-sm text-muted-foreground font-pixel">
            <p>Game Mode: Local Hotseat</p>
            <p className="opacity-50">Online Multiplayer (Soon)</p>
        </div>
      </CardContent>
    </Card>
  );
}
