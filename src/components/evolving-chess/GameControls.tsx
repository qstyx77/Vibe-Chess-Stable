'use client';

import type { PlayerColor, Piece, ChatMessage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { PieceAbilitiesInfo } from './PieceAbilitiesInfo';
import { cn } from '@/lib/utils';
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isMessengerOpen: boolean;
  onToggleMessenger: () => void;
  hasUnreadMessages: boolean;
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
  chatMessages,
  onSendMessage,
  isMessengerOpen,
  onToggleMessenger,
  hasUnreadMessages,
}: GameControlsProps) {
  const [chatInput, setChatInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const timerDisplay = onlineStatus === 'connected' ? (turnTimer !== null ? turnTimer.toString().padStart(2, '0') : '45') : '00';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isMessengerOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendMessage(chatInput.trim());
      setChatInput('');
    }
  };

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

  const isOnline = onlineStatus === 'connected' || onlineStatus === 'waiting';

  return (
    <Card className="w-full shadow-lg h-full flex flex-col mt-1 relative">
      {isOnline && (
        <button
          onClick={onToggleMessenger}
          className={cn(
            "absolute top-2 left-2 z-30 p-1 hover:bg-muted transition-colors",
            !isMessengerOpen && hasUnreadMessages && "animate-chat-notify"
          )}
          aria-label={isMessengerOpen ? "Switch to Game Info" : "Switch to Messenger"}
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {isMessengerOpen ? (
        <CardContent className="p-3 flex flex-col h-full space-y-2 pt-10">
          <h2 className="text-sm font-bold text-primary font-pixel text-center">MESSENGER</h2>
          <ScrollArea className="flex-grow bg-background/50 border rounded-sm p-2 h-[200px]" ref={scrollRef}>
            <div className="space-y-2">
              {chatMessages.length === 0 ? (
                <p className="text-[0.65rem] text-muted-foreground text-center italic mt-10">No messages yet. Say hi!</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        "text-[0.6rem] font-bold",
                        msg.color === 'white' ? 'text-foreground' : 'text-secondary'
                      )}>
                        {msg.sender}:
                      </span>
                      <span className="text-[0.65rem] break-words">{msg.text}</span>
                    </div>
                    <span className="text-[0.5rem] text-muted-foreground/50 self-end">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <form onSubmit={handleSend} className="flex gap-1">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type..."
              className="h-8 text-xs font-sans"
              maxLength={200}
            />
            <Button type="submit" size="sm" variant="secondary" className="h-8 px-2">
              <Send className="h-3 w-3" />
            </Button>
          </form>
        </CardContent>
      ) : (
        <CardContent className="space-y-1 flex-grow flex flex-col p-2">
          {/* Top Fixed Section */}
          <div className="flex justify-around items-center text-center pt-2">
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
      )}
    </Card>
  );
}
