
'use client';

import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';

export default function ProfilePage() {
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();

  const firestore = getFirestore();

  const userProfileRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, `users/${user.uid}`);
  }, [firestore, user]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc(userProfileRef);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || isProfileLoading) {
    return <div className="flex justify-center items-center h-screen"><p>Loading profile...</p></div>;
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
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user?.photoURL || undefined} alt={userProfile.username} />
              <AvatarFallback>{userProfile.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold">{userProfile.username}</h2>
            <p className="text-muted-foreground">{userProfile.email}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium text-muted-foreground">ELO Rating</p>
              <p className="text-3xl font-bold">{userProfile.eloRating || 1200}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Wins</p>
                <p className="text-3xl font-bold">{userProfile.wins || 0}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium text-muted-foreground">Losses</p>
                <p className="text-3xl font-bold">{userProfile.losses || 0}</p>
            </div>
          </div>
          <div className="text-center">
             <Link href="/">
                <Button>Back to Game</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
