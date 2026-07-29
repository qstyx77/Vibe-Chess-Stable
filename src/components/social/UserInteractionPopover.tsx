'use client';

import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useSocial } from './SocialContext';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Shield, UserPlus, UserMinus, Sword, Ban, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface UserInteractionPopoverProps {
  userId: string;
  username: string;
  children: React.ReactNode;
  className?: string;
}

export function UserInteractionPopover({ userId, username, children, className }: UserInteractionPopoverProps) {
  const { user } = useUser();
  const { friends, addFriend, removeFriend, blockUser, sendChallenge } = useSocial();
  const isMe = user?.uid === userId;
  const isFriend = friends.some(f => f.id === userId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Changed from <button> to <span> to avoid nested button hydration errors */}
        <span role="button" className={cn("hover:text-primary transition-colors cursor-pointer outline-none inline-block", className)}>
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 bg-card border-2 border-primary/40 font-pixel">
        <div className="space-y-3">
          <div className="text-center pb-2 border-b border-border/50">
            <p className="text-[10px] text-primary uppercase mb-1">{username}</p>
            {!isMe && (
               <p className="text-[8px] text-muted-foreground uppercase">
                 {isFriend ? "Friendly Hero" : "Mysterious Traveler"}
               </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {!isMe && (
              <>
                {isFriend ? (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[8px] uppercase justify-start gap-2"
                      onClick={() => sendChallenge(userId)}
                    >
                      <Sword className="h-3 w-3 text-destructive" /> Challenge
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[8px] uppercase justify-start gap-2 text-destructive hover:text-destructive"
                      onClick={() => removeFriend(userId)}
                    >
                      <UserMinus className="h-3 w-3" /> Remove Friend
                    </Button>
                  </>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[8px] uppercase justify-start gap-2"
                    onClick={() => addFriend(userId, username)}
                  >
                    <UserPlus className="h-3 w-3 text-primary" /> Add Friend
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[8px] uppercase justify-start gap-2 text-muted-foreground"
                  onClick={() => blockUser(userId)}
                >
                  <Ban className="h-3 w-3" /> Block
                </Button>
              </>
            )}
            
            <Link href={isMe ? "/profile" : `/profile?userId=${userId}`} className="w-full">
              <Button variant="outline" size="sm" className="h-8 text-[8px] uppercase justify-start gap-2 w-full">
                <UserIcon className="h-3 w-3" /> View Profile
              </Button>
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
