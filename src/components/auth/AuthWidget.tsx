
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
      });
    }
  }, [user, toast]);

  const handleSignOut = () => {
    auth.signOut().then(() => {
      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
      });
    });
  };

  if (isUserLoading) {
    return <Button variant="outline" size="sm" disabled>Loading...</Button>;
  }

  if (user) {
    return <UserProfile user={user} onSignOut={handleSignOut} />;
  }

  return (
    <div className="flex gap-2">
      <Link href="/login">
        <Button variant="outline" size="sm">
          <LogIn className="mr-2 h-4 w-4" />
          Login
        </Button>
      </Link>
      <Link href="/register">
        <Button variant="default" size="sm">
          Sign Up
        </Button>
      </Link>
    </div>
  );
}
