
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, getFirestore, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface UserData {
  id: string;
  username: string;
  eloRating: number;
}

export default function LeaderboardPage() {
  const firestore = useFirestore();

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'users'),
      orderBy('eloRating', 'desc'),
      limit(10)
    );
  }, [firestore]);

  const { data: topPlayers, isLoading, error } = useCollection<UserData>(usersQuery);

  // TEMPORARY: Playtest Sync Logic
  // Sets ELO to 2100 for anyone appearing on the leaderboard to test unlockable pieces
  useEffect(() => {
    if (topPlayers && topPlayers.length > 0 && firestore) {
      topPlayers.forEach(player => {
        if (player.eloRating !== 2100) {
          const userRef = doc(firestore, 'users', player.id);
          updateDocumentNonBlocking(userRef, { eloRating: 2100 });
        }
      });
    }
  }, [topPlayers, firestore]);

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center items-center gap-2">
            <Trophy className="h-8 w-8 text-primary" />
            <CardTitle>Top 10 Players</CardTitle>
          </div>
          <CardDescription>Leaderboard based on ELO rating.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-destructive text-center">Error loading leaderboard: {error.message}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px] text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">ELO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center"><Skeleton className="h-5 w-5 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading && topPlayers?.map((player, index) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium text-center">{index + 1}</TableCell>
                  <TableCell>{player.username}</TableCell>
                  <TableCell className="text-right font-semibold">{player.eloRating}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (!topPlayers || topPlayers.length === 0) && (
            <p className="text-center text-muted-foreground mt-4">No players on the leaderboard yet.</p>
          )}
        </CardContent>
      </Card>
      <div className="text-center mt-6">
        <Link href="/">
          <Button>Back to Game</Button>
        </Link>
      </div>
    </div>
  );
}
