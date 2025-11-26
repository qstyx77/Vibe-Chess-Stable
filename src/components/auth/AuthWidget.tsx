
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

export function AuthWidget() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [formType, setFormType] = React.useState<'signin' | 'signup'>('signin');

  React.useEffect(() => {
    // If user logs in successfully, close the sheet
    if (user && sheetOpen) {
      setSheetOpen(false);
      toast({
        title: "Signed In Successfully!",
        description: `Welcome back, ${user.email}`,
      });
    }
  }, [user, sheetOpen, toast]);

  const handleSignOut = () => {
    auth.signOut().then(() => {
      toast({
        title: 'Signed Out',
        description: 'You have been successfully signed out.',
      });
    });
  };

  const openSheet = (type: 'signin' | 'signup') => {
    setFormType(type);
    setSheetOpen(true);
  };

  if (isUserLoading) {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  if (user) {
    return <UserProfile user={user} onSignOut={handleSignOut} />;
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => openSheet('signin')}>
          Sign In
        </Button>
        <Button variant="default" onClick={() => openSheet('signup')}>
          Sign Up
        </Button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {formType === 'signin' ? 'Sign In' : 'Create an Account'}
            </SheetTitle>
            <SheetDescription>
              {formType === 'signin'
                ? "Access your account to see your game history and stats."
                : "Join the ranks and start your Vibe Chess journey."}
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <AuthForm type={formType} onSuccess={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
