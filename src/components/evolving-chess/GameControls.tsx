
'use client';

import type { PlayerColor, Piece, ChatMessage, MessageCategory } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '../ui/separator';
import { ChessPieceDisplay } from './ChessPieceDisplay';
import { PieceAbilitiesInfo } from './PieceAbilitiesInfo';
import { cn } from '@/lib/utils';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, Send, ScrollText, Users, Sword } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSocial } from '../social/SocialContext';
import { UserInteractionPopover } from '../social/UserInteractionPopover';

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
  chatMessages: any[]; // Deprecated - using context
  onSendMessage: (text: string) => void; // Deprecated
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
  isMessengerOpen,
  onToggleMessenger,
  hasUnreadMessages,
}: GameControlsProps) {
  const { messages, friends, sendMessage, acceptChallenge } = useSocial();
  const [chatInput, setChatInput] = useState('');
  const [category, setCategory] = useState<MessageCategory>('battle');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredMessages = useMemo(() => {
      return messages.filter(m => m.category === category);
  }, [messages, category]);

  const timerDisplay = onlineStatus === 'connected' ? (turnTimer !== null ? turnTimer.toString().padStart(2, '0') : '45') : '00';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages, isMessengerOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput.trim(), category);
      setChatInput('');
    }
  };

  const renderCapturedPieces = (color: PlayerColor) => {
    const pieces = capturedPieces[color];
    const label = color === 'white' ? 'Captured White' : 'Captured Black';
    return (
      <div className="w-full">
        <h3 className="text-[9px] font-bold text-muted-foreground uppercase mb-0 leading-none">{label}</h3>
        <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[24px] p-0.5 border border-border/20">
          {pieces.length === 0 ? <span className="text-[7px] text-muted-foreground">None</span> : pieces.map(p => (
            <div key={p.id} className="w-5 h-5 relative" title={`${p.type} L${p.level}`}>
              <ChessPieceDisplay piece={p} isMini />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const isOnline = onlineStatus === 'connected' || onlineStatus === 'waiting';

  return (
    <Card className="w-full shadow-lg h-full flex flex-col mt-0.5 relative">
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

      {isMessengerOpen ? (
        <CardContent className="p-2 flex flex-col h-full space-y-2 pt-8">
          <div className="flex gap-1 justify-center">
              <Button 
                variant={category === 'battle' ? 'default' : 'outline'} 
                size="sm" 
                className="h-6 text-[8px] uppercase font-pixel px-2"
                onClick={() => setCategory('battle')}
              >
                <Sword className="h-3 w-3 mr-1" /> Battle
              </Button>
              <Button 
                variant={category === 'social' ? 'default' : 'outline'} 
                size="sm" 
                className="h-6 text-[8px] uppercase font-pixel px-2"
                onClick={() => setCategory('social')}
              >
                <Users className="h-3 w-3 mr-1" /> Social
              </Button>
              <Button 
                variant={category === 'log' ? 'default' : 'outline'} 
                size="sm" 
                className="h-6 text-[8px] uppercase font-pixel px-2"
                onClick={() => setCategory('log')}
              >
                <ScrollText className="h-3 w-3 mr-1" /> Log
              </Button>
          </div>

          <ScrollArea className="flex-grow bg-background/50 border rounded-sm p-2 h-[150px]" ref={scrollRef}>
            <div className="space-y-2">
              {filteredMessages.length === 0 ? (
                <p className="text-[0.65rem] text-muted-foreground text-center italic mt-10">No entries yet.</p>
              ) : (
                filteredMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col">
                    <div className="flex items-start gap-1">
                      <UserInteractionPopover userId={msg.senderId || ''} username={msg.sender}>
                        <span className={cn(
                            "text-[0.6rem] font-bold uppercase",
                            msg.sender === 'SYSTEM' ? 'text-primary' : (msg.color === 'white' ? 'text-foreground' : 'text-secondary')
                        )}>
                            {msg.sender}:
                        </span>
                      </UserInteractionPopover>
                      <div className="flex flex-col gap-1 flex-1">
                        <span className="text-[0.65rem] break-words">{msg.text}</span>
                        {msg.isChallenge && category === 'social' && (
                            <Button 
                                size="sm" 
                                className="h-6 text-[8px] uppercase font-pixel w-20"
                                onClick={() => acceptChallenge(msg.challengeRoomId!)}
                            >
                                Accept
                            </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          
          {category !== 'log' && (
            <form onSubmit={handleSend} className="flex gap-1">
                <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type..."
                className="h-7 text-xs font-sans"
                maxLength={200}
                />
                <Button type="submit" size="sm" variant="secondary" className="h-7 px-2">
                <Send className="h-3 w-3" />
                </Button>
            </form>
          )}

          {category === 'social' && (
              <div className="border-t pt-2 mt-2">
                  <h4 className="text-[8px] text-muted-foreground uppercase font-pixel mb-1">Online Friends</h4>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                      {friends.map(f => (
                          <UserInteractionPopover key={f.id} userId={f.id} username={f.username}>
                             <div className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded-sm shrink-0 border border-border/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[8px] text-foreground uppercase">{f.username}</span>
                             </div>
                          </UserInteractionPopover>
                      ))}
                      {friends.length === 0 && <p className="text-[7px] text-muted-foreground italic">Add friends via the leaderboard!</p>}
                  </div>
              </div>
          )}
        </CardContent>
      ) : (
        <CardContent className="space-y-0.5 flex-grow flex flex-col p-1.5">
          <div className="flex justify-around items-center text-center">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Current Player</p>
              <UserInteractionPopover userId="" username={getPlayerDisplayName(currentPlayer)}>
                <p className={cn(
                    "text-sm font-semibold font-sans leading-none uppercase",
                    currentPlayer === 'white' ? 'text-foreground' : 'text-secondary',
                    isGameOver && "opacity-50"
                    )}
                >
                    {isGameOver ? "-" : getPlayerDisplayName(currentPlayer)}
                </p>
              </UserInteractionPopover>
            </div>

            {onlineStatus === 'connected' && !isGameOver && activeTimerPlayer && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Time</p>
                <p className="text-sm font-semibold font-mono text-primary animate-pulse leading-none">
                  {timerDisplay}
                </p>
              </div>
            )}

            <div className="space-y-0">
              <p className="text-[10px] font-medium text-destructive leading-none">
                <span className="text-foreground">W</span>-Streak: {killStreaks.white}
              </p>
              <p className="text-[10px] font-medium text-destructive leading-none">
                <span className="text-secondary">B</span>-Streak: {killStreaks.black}
              </p>
            </div>
          </div>
          <Separator className="my-0.5"/>
          <div className="flex flex-col gap-0.5">
              {renderCapturedPieces('black')}
              {renderCapturedPieces('white')}
          </div>
          <Separator className="my-0.5" />
          <div className="flex-grow flex flex-col justify-center min-h-[40px]">
            {pieceForInfoDisplay ? (
              <PieceAbilitiesInfo piece={pieceForInfoDisplay} />
            ) : (
               <div className="text-center text-[10px] text-muted-foreground leading-tight">
                  Hover over a piece to see its abilities.
               </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
