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
  const { 
    messages, 
    friends, 
    sendMessage, 
    acceptChallenge, 
    isMessengerOpen, 
    setIsMessengerOpen, 
    hasUnread, 
    clearUnread,
    visibleCategories,
    setVisibleCategories,
    chatInput,
    setChatInput,
    onlineUserIds
  } = useSocial();
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleCategory = (cat: MessageCategory) => {
    const next = new Set(visibleCategories);
    if (next.has(cat)) {
        next.delete(cat);
    } else {
        next.add(cat);
        clearUnread(cat);
    }
    setVisibleCategories(next);
  };

  const filteredMessages = useMemo(() => {
      return messages.filter(m => visibleCategories.has(m.category));
  }, [messages, visibleCategories]);

  const timerDisplay = onlineStatus === 'connected' ? (turnTimer !== null ? turnTimer.toString().padStart(2, '0') : '45') : '00';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages, isMessengerOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendMessage(chatInput.trim(), 'battle');
      setChatInput('');
    }
  };

  const renderCapturedPieces = (color: PlayerColor) => {
    const pieces = capturedPieces[color];
    const label = color === 'white' ? 'Captured White' : 'Captured Black';
    return (
      <div className="w-full">
        <h3 className="text-[0.6rem] font-bold text-muted-foreground uppercase mb-0 leading-none">{label}</h3>
        <div className="flex flex-wrap gap-0.5 bg-background rounded-none min-h-[1.5rem] p-0.5 border border-border/20">
          {pieces.length === 0 ? <span className="text-[0.5rem] text-muted-foreground">None</span> : pieces.map(p => (
            <div key={p.id} className="w-5 h-5 relative" title={`${p.type} L${p.level}`}>
              <ChessPieceDisplay piece={p} isMini />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getMessageColor = (msg: ChatMessage) => {
      if (msg.category === 'log' || msg.sender === 'SYSTEM') return 'text-primary'; 
      if (msg.category === 'social') return 'text-accent'; 
      if (msg.color === 'white') return 'text-foreground'; 
      if (msg.color === 'black') return 'text-secondary'; 
      return 'text-muted-foreground';
  };

  const hasAnyUnread = hasUnread.battle || hasUnread.social || hasUnread.log;

  const onlineFriends = useMemo(() => friends.filter(f => onlineUserIds.has(f.id)), [friends, onlineUserIds]);
  const offlineFriends = useMemo(() => friends.filter(f => !onlineUserIds.has(f.id)), [friends, onlineUserIds]);

  return (
    <Card className="w-full shadow-lg h-full flex flex-col mt-0.5 relative">
      <button
        onClick={() => {
            setIsMessengerOpen(!isMessengerOpen);
            if (!isMessengerOpen) {
                // Clear all currently visible unreads when opening
                visibleCategories.forEach(cat => clearUnread(cat));
            }
        }}
        className={cn(
          "absolute top-2 left-2 z-30 p-1 hover:bg-muted transition-colors",
          !isMessengerOpen && hasAnyUnread && "animate-chat-notify"
        )}
        aria-label={isMessengerOpen ? "Switch to Game Info" : "Switch to Messenger"}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {isMessengerOpen ? (
        <CardContent className="p-2 flex flex-col h-full space-y-2 pt-8">
          <div className="flex gap-1 justify-center">
              <Button 
                variant={visibleCategories.has('battle') ? 'default' : 'outline'} 
                size="sm" 
                className={cn("h-6 text-[0.5rem] uppercase font-pixel px-2 relative", hasUnread.battle && "ring-1 ring-primary")}
                onClick={() => toggleCategory('battle')}
              >
                <Sword className={cn("h-3 w-3 mr-1", !visibleCategories.has('battle') && "opacity-50")} /> Battle
              </Button>
              <Button 
                variant={visibleCategories.has('social') ? 'default' : 'outline'} 
                size="sm" 
                className={cn("h-6 text-[0.5rem] uppercase font-pixel px-2 relative", hasUnread.social && "ring-1 ring-accent")}
                onClick={() => toggleCategory('social')}
              >
                <Users className={cn("h-3 w-3 mr-1", !visibleCategories.has('social') && "opacity-50")} /> Social
              </Button>
              <Button 
                variant={visibleCategories.has('log') ? 'default' : 'outline'} 
                size="sm" 
                className={cn("h-6 text-[0.5rem] uppercase font-pixel px-2 relative", hasUnread.log && "ring-1 ring-primary")}
                onClick={() => toggleCategory('log')}
              >
                <ScrollText className={cn("h-3 w-3 mr-1", !visibleCategories.has('log') && "opacity-50")} /> Log
              </Button>
          </div>

          <ScrollArea className="flex-grow bg-background/50 border rounded-sm p-2 h-[10rem]" ref={scrollRef}>
            <div className="space-y-2">
              {filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30 mt-10">
                    <p className="text-[0.65rem] text-muted-foreground text-center italic">Select categories to view logs.</p>
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-200">
                    <div className="flex items-start gap-1">
                      {msg.sender !== 'SYSTEM' ? (
                        <UserInteractionPopover userId={msg.senderId || ''} username={msg.sender}>
                            <span className={cn("text-[0.6rem] font-bold uppercase", getMessageColor(msg))}>
                                {msg.sender}:
                            </span>
                        </UserInteractionPopover>
                      ) : (
                        <span className="text-[0.6rem] font-bold uppercase text-primary">[SYS]:</span>
                      )}
                      <div className="flex flex-col gap-1 flex-1">
                        <span className={cn("text-[0.65rem] break-words font-pixel leading-tight tracking-tight", getMessageColor(msg))}>
                            {msg.text}
                        </span>
                        {msg.isChallenge && (
                            <Button 
                                size="sm" 
                                className="h-6 text-[0.5rem] uppercase font-pixel w-20 mt-1 border-2 border-primary bg-primary/20 hover:bg-primary text-foreground"
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
          
          <form onSubmit={handleSend} className="flex gap-1">
                <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type message or /help..."
                className="h-7 text-xs font-sans bg-background"
                maxLength={200}
                />
                <Button type="submit" size="sm" variant="secondary" className="h-7 px-2">
                <Send className="h-3 w-3" />
                </Button>
          </form>

          <div className="border-t pt-2 mt-1 space-y-2">
              <div>
                  <h4 className="text-[0.5rem] text-muted-foreground uppercase font-pixel mb-1">Online Friends ({onlineFriends.length})</h4>
                  <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                      {onlineFriends.map(f => (
                          <UserInteractionPopover key={f.id} userId={f.id} username={f.username}>
                             <div className="flex items-center gap-1 bg-muted/30 px-1.5 py-0.5 rounded-sm shrink-0 border border-border/20 hover:border-primary/50 transition-colors">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[0.5rem] text-foreground uppercase">{f.username}</span>
                             </div>
                          </UserInteractionPopover>
                      ))}
                      {onlineFriends.length === 0 && <p className="text-[0.45rem] text-muted-foreground italic">No friends online.</p>}
                  </div>
              </div>
              
              <div>
                  <h4 className="text-[0.5rem] text-muted-foreground uppercase font-pixel mb-1 opacity-60">Away ({offlineFriends.length})</h4>
                  <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                      {offlineFriends.map(f => (
                          <UserInteractionPopover key={f.id} userId={f.id} username={f.username}>
                             <div className="flex items-center gap-1 bg-muted/10 px-1.5 py-0.5 rounded-sm shrink-0 border border-border/10 hover:border-muted-foreground transition-colors opacity-50 grayscale">
                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                <span className="text-[0.5rem] text-foreground uppercase">{f.username}</span>
                             </div>
                          </UserInteractionPopover>
                      ))}
                      {friends.length === 0 && <p className="text-[0.45rem] text-muted-foreground italic">Click any name to add friends!</p>}
                  </div>
              </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="space-y-0.5 flex-grow flex flex-col p-1.5">
          <div className="flex justify-around items-center text-center">
            <div>
              <p className="text-[0.6rem] font-medium text-muted-foreground">Current Player</p>
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
                <p className="text-[0.6rem] font-medium text-muted-foreground">Time</p>
                <p className="text-sm font-semibold font-mono text-primary animate-pulse leading-none">
                  {timerDisplay}
                </p>
              </div>
            )}

            <div className="space-y-0">
              <p className="text-[0.6rem] font-medium text-destructive leading-none">
                <span className="text-foreground">W</span>-Streak: {killStreaks.white}
              </p>
              <p className="text-[0.6rem] font-medium text-destructive leading-none">
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
          <div className="flex-grow flex flex-col justify-center min-h-[2.5rem]">
            {pieceForInfoDisplay ? (
              <PieceAbilitiesInfo piece={pieceForInfoDisplay} />
            ) : (
               <div className="text-center text-[0.6rem] text-muted-foreground leading-tight">
                  Hover over a piece to see its abilities.
               </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
