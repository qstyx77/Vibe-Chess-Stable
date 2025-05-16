'use client';

import type { PlayerColor, SuggestedMoveAI, Piece, AlgebraicSquare } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Lightbulb } from 'lucide-react';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';

interface GameControlsProps {
  currentPlayer: PlayerColor;
  onSuggestMoves: () => void;
  isLoadingSuggestions: boolean;
  suggestions: SuggestedMoveAI[];
  gameStatus: string;
  capturedPieces: { white: Piece[], black: Piece[] };
  onSuggestionClick: (move: SuggestedMoveAI) => void;
}

export function GameControls({
  currentPlayer,
  onSuggestMoves,
  isLoadingSuggestions,
  suggestions,
  gameStatus,
  capturedPieces,
  onSuggestionClick,
}: GameControlsProps) {
  
  const renderCapturedPieces = (color: PlayerColor) => (
    <div className="flex flex-wrap gap-1 p-1 bg-muted/30 rounded">
      {capturedPieces[color].length === 0 && <span className="text-xs text-muted-foreground">None</span>}
      {capturedPieces[color].map(p => (
        <div key={p.id} className="w-6 h-6 relative">
          <ChessPieceDisplay piece={p} />
        </div>
      ))}
    </div>
  );

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-center text-primary">Evolving Chess</CardTitle>
        <CardDescription className="text-center">{gameStatus}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Current Player</p>
          <p className={`text-xl font-semibold ${currentPlayer === 'white' ? 'text-foreground' : 'text-primary'}`}>
            {currentPlayer.toUpperCase()}
          </p>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Captured by White:</h3>
          {renderCapturedPieces('black')}
        </div>
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Captured by Black:</h3>
          {renderCapturedPieces('white')}
        </div>

        <Separator />
        
        <Button onClick={onSuggestMoves} disabled={isLoadingSuggestions} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
          {isLoadingSuggestions ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lightbulb className="mr-2 h-4 w-4" />
          )}
          Suggest Moves
        </Button>

        {suggestions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-md font-semibold mb-2">Suggested Moves:</h3>
            <ScrollArea className="h-48 w-full rounded-md border p-2">
              <ul className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <li key={index} 
                      className="p-2 rounded-md hover:bg-secondary/20 cursor-pointer border border-transparent hover:border-primary/50"
                      onClick={() => onSuggestionClick(suggestion)}
                  >
                    <p className="font-medium text-sm">
                      Move: <span className="text-primary">{suggestion.move}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Risk: {suggestion.boardStateValueChangeEstimate > 0 ? 'Risky' : suggestion.boardStateValueChangeEstimate < 0 ? 'Safe' : 'Neutral'} (Val: {suggestion.boardStateValueChangeEstimate})</p>
                    <p className="text-xs text-muted-foreground">Reason: {suggestion.reason}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}
        <Separator />
        <div className="text-center text-sm text-muted-foreground">
            <p>Game Mode: Local Hotseat</p>
            <p className="opacity-50">Online Multiplayer (Coming Soon)</p>
        </div>
      </CardContent>
    </Card>
  );
}
