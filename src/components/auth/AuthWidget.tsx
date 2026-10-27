
'use client';

import * as React from 'react';
import { useUser, useAuth } from '@/firebase';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { AuthForm } from './AuthForm';
import { UserProfile } from './UserProfile';
import { useToast } from '@/hooks/use-toast';
import { LogIn } from 'lucide-react';
import Link from 'next/link';

// Module-level variable to track the last user we showed a login toast for.
// This prevents multiple instances of AuthWidget (e.g. mobile and desktop versions)
// from triggering the same toast simultaneously on the same page.
let lastToastedUserId: string | null = null;

export function AuthWidget() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  
  React.useEffect(() => {
    // If user logs in successfully, show toast only once per user session/ID
    if (user && lastToastedUserId !== user.uid) {
      lastToastedUserId = user.uid;
      toast({
        title: "Signed In Successfully!",
        description: `Welcome back, ${user.displayName || user.email}`,
        duration: 5000,
      });
    } else if (!user) {
      // Reset tracking when logged out so the next login can trigger a toast
      lastToastedUserId = null;
    }
  }, [user, toast]);

  const handleSignOut = () => {
    auth.signOut().then(() => {
      lastToastedUserId = null;
      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
        duration: 5000,
      });
    });
  };

  if (isUserLoading) {
    return <Button variant="outline" size="sm" disabled className="h-7 px-2 text-xs">Loading...</Button>;
  }

  if (user) {
    return <UserProfile user={user} onSignOut={handleSignOut} />;
  }

  return (
    <div className="flex gap-1">
      <Link href="/login">
        <Button variant="outline" className="h-7 px-2 text-xs">
          <LogIn className="mr-1 h-3 w-3" />
          Login
        </Button>
      </Link>
      <Link href="/register">
        <Button variant="default" className="h-7 px-2 text-xs">
          Sign Up
        </Button>
      </Link>
    </div>
  );
}
