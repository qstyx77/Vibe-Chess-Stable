
'use client';

import * as React from 'react';
import type { User } from 'firebase/auth';
import { doc, getFirestore } from 'firebase/firestore';
import { useDoc, useFirestore } from '@/firebase';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User as UserIcon } from 'lucide-react';

interface UserProfile {
  email: string;
  eloRating?: number;
  wins?: number;
  losses?: number;
}

interface UserProfileProps {
  user: User;
  onSignOut: () => void;
}

export function UserProfile({ user, onSignOut }: UserProfileProps) {
  const firestore = useFirestore();
  const userProfileRef = React.useMemo(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid);
  }, [user, firestore]);

  const { data: userProfile, isLoading } = useDoc<UserProfile>(userProfileRef);

  const getInitials = (email: string | null) => {
    if (!email) return '?';
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
          </Avatar>
          <span>{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-sm">
          {isLoading && <p>Loading profile...</p>}
          {userProfile && (
            <div className="space-y-1">
              <p>ELO: {userProfile.eloRating ?? 'N/A'}</p>
              <p>Wins: {userProfile.wins ?? 0}</p>
              <p>Losses: {userProfile.losses ?? 0}</p>
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
