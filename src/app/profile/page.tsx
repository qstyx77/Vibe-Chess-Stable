
'use client';

import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserInteractionPopover } from '@/components/social/UserInteractionPopover';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get('userId');
  const targetId = queryUserId || user?.uid;

  const firestore = getFirestore();

  const userProfileRef = useMemoFirebase(() => {
    if (!targetId) return null;
    return doc(firestore, `users/${targetId}`);
  }, [firestore, targetId]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc(userProfileRef);

  useEffect(() => {
    if (!isUserLoading && !user && !queryUserId) {
      router.push('/');
    }
  }, [user, isUserLoading, router, queryUserId]);

  if (isUserLoading || isProfileLoading) {
    return <div className="flex justify-center items-center h-screen font-pixel uppercase text-xs"><p>Loading profile...</p></div>;
  }

  if (userError) {
    return <div className="flex justify-center items-center h-screen"><p>Error loading user: {userError.message}</p></div>;
  }

  if (!userProfile) {
    return (
        <div className="flex flex-col justify-center items-center h-screen gap-4">
            <p>Profile not found.</p>
            <Link href="/">
                <Button>Go Home</Button>
            </Link>
        </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl font-pixel">
      <Card className="border-2 border-primary/30">
        <CardHeader className="text-center border-b border-border/50">
          <CardTitle className="uppercase tracking-tighter">{userProfile.username}&apos;S HALL OF RECORDS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24 border-4 border-accent shadow-[0_0_15px_rgba(255,0,255,0.3)]">
              <AvatarFallback className="bg-muted text-3xl">{userProfile.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold text-primary uppercase">{userProfile.username}</h2>
            <p className="text-[10px] text-muted-foreground uppercase">{userProfile.email}</p>
            
            {queryUserId && queryUserId !== user?.uid && (
                <UserInteractionPopover userId={queryUserId} username={userProfile.username}>
                    <Button variant="outline" size="sm" className="h-8 text-[8px] uppercase">Interact with Hero</Button>
                </UserInteractionPopover>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted/30 border border-border rounded-none">
              <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">ELO RATING</p>
              <p className="text-2xl font-bold text-primary">{userProfile.eloRating || 1200}</p>
            </div>
            <div className="p-4 bg-muted/30 border border-border rounded-none">
                <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">VICTORIES</p>
                <p className="text-2xl font-bold text-green-500">{userProfile.wins || 0}</p>
            </div>
            <div className="p-4 bg-muted/30 border border-border rounded-none">
                <p className="text-[9px] font-medium text-muted-foreground uppercase mb-1">DEFEATS</p>
                <p className="text-2xl font-bold text-destructive">{userProfile.losses || 0}</p>
            </div>
          </div>

          <div className="text-center">
             <Link href="/">
                <Button variant="ghost" className="text-[10px] uppercase">Return to Battle</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
