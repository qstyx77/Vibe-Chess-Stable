
'use client';

import type { PlayerColor, Piece } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';

interface GameControlsProps {
  currentPlayer: PlayerColor;
  gameStatus: string;
  capturedPieces: { white: Piece[], black: Piece[] };
}

export function GameControls({
  currentPlayer,
  gameStatus,
  capturedPieces,
}: GameControlsProps) {
  
  const renderCapturedPieces = (color: PlayerColor) => (
    <div className="flex flex-wrap gap-1 p-1 bg-background rounded-none">
      {capturedPieces[color].length === 0 && <span className="text-xs text-muted-foreground font-pixel">None</span>}
      {capturedPieces[color].map(p => (
        <div key={p.id} className="w-6 h-6 relative"> {/* Adjust size if pieces look too small/big */}
          <ChessPieceDisplay piece={p} />
        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-center text-primary font-pixel">Evolving Chess</CardTitle>
        <CardDescription className="text-center font-pixel">{gameStatus}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground font-pixel">Current Player</p>
          <p className={`text-xl font-semibold font-pixel ${currentPlayer === 'white' ? 'text-foreground' : 'text-secondary'}`}>
            {currentPlayer.toUpperCase()}
          </p>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured by White:</h3>
          {renderCapturedPieces('black')}
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1 font-pixel">Captured by Black:</h3>
          {renderCapturedPieces('white')}
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
