
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

export function AuthWidget() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  
  React.useEffect(() => {
    // If user logs in successfully, close the sheet
    if (user) {
      toast({
        title: "Signed In Successfully!",
        description: `Welcome back, ${user.displayName || user.email}`,
        duration: 5000,
      });
    }
  }, [user, toast]);

  const handleSignOut = () => {
    auth.signOut().then(() => {
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
