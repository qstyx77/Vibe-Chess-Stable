
'use client';

import type { PlayerColor, Piece } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { PieceAbilitiesInfo } from './PieceAbilitiesInfo';
import { cn } from '@/lib/utils';
import React from 'react';

interface GameControlsProps {
  currentPlayer: PlayerColor;
  capturedPieces: { white: Piece[], black: Piece[] };
  isGameOver: boolean;
  killStreaks: { white: number, black: number };
  pieceForInfoDisplay: Piece | null;
  localPlayerColor?: PlayerColor | null;
  getPlayerDisplayName: (player: PlayerColor) => string;
  onlineStatus: 'disconnected' | 'connecting' | 'connected' | 'waiting';
  turnTimer: number | null;
  activeTimerPlayer: PlayerColor | null;
}

export function GameControls({
  currentPlayer,
  capturedPieces,
  isGameOver,
  killStreaks,
  pieceForInfoDisplay,
  localPlayerColor,
  getPlayerDisplayName,
  onlineStatus,
  turnTimer,
  activeTimerPlayer,
}: GameControlsProps) {
  const timerDisplay = onlineStatus === 'connected' ? (turnTimer !== null ? turnTimer.toString().padStart(2, '0') : '45') : '00';

  const renderCapturedPieces = (color: PlayerColor, capturedBy: PlayerColor) => {
    const pieces = capturedPieces[capturedBy];
    return (
      <div className="flex-grow">
        <h3 className="text-xs font-medium text-muted-foreground mb-1">Captured {color.charAt(0).toUpperCase() + color.slice(1)}</h3>
        <div className="flex flex-wrap gap-1 bg-background rounded-none min-h-[24px] p-1">
          {pieces.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : pieces.map(p => (
            <div key={p.id} className="w-5 h-5 relative" title={`${p.type} L${p.level}`}>
              <ChessPieceDisplay piece={p} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full shadow-lg h-full flex flex-col mt-1">
      <CardContent className="space-y-1 flex-grow flex flex-col p-2">
        {/* Top Fixed Section */}
        <div className="flex justify-around items-center text-center">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Current Player</p>
            <p className={cn(
                "text-base font-semibold font-sans",
                currentPlayer === 'white' ? 'text-foreground' : 'text-secondary',
                isGameOver && "opacity-50"
              )}
            >
              {isGameOver ? "-" : getPlayerDisplayName(currentPlayer)}
            </p>
          </div>

          {onlineStatus === 'connected' && !isGameOver && activeTimerPlayer && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Time</p>
              <p className="text-base font-semibold font-mono text-primary animate-pulse">
                {timerDisplay}
              </p>
            </div>
          )}

          <div className="space-y-0.5">
            <p className="text-xs font-medium text-destructive">
              <span className="text-foreground">W</span>-Streak: {killStreaks.white}
            </p>
            <p className="text-xs font-medium text-destructive">
              <span className="text-secondary">B</span>-Streak: {killStreaks.black}
            </p>
          </div>
        </div>
        <Separator className="my-1"/>
        <div className="flex gap-2">
            {renderCapturedPieces('black', 'white')}
            {renderCapturedPieces('white', 'black')}
        </div>
        
        {/* Bottom Dynamic Section */}
        <Separator className="my-1" />
        <div className="flex-grow flex flex-col justify-center min-h-[60px]">
          {pieceForInfoDisplay ? (
            <PieceAbilitiesInfo piece={pieceForInfoDisplay} />
          ) : (
             <div className="text-center text-xs text-muted-foreground">
                Hover over a piece to see its abilities.
             </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

    
