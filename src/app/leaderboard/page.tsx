'use client';

import { useState, useEffect } from 'react';
import { useDoc, useMemoFirebase } from '@/firebase';
import { doc, getFirestore } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { triggerLeaderboardUpdate } from '@/ai/flows/leaderboard-flow';

interface LeaderboardData {
  players: {
    id: string;
    username: string;
    eloRating: number;
  }[];
  updatedAt: string;
}

export default function LeaderboardPage() {
  const firestore = getFirestore();
  const leaderboardRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'leaderboard', 'top10');
  }, [firestore]);

  const { data: leaderboardData, isLoading, error } = useDoc<LeaderboardData>(leaderboardRef);

  const handleManualUpdate = async () => {
    try {
      await triggerLeaderboardUpdate();
      alert('Leaderboard update triggered! The new data will appear shortly.');
    } catch (e) {
      console.error(e);
      alert('Failed to trigger leaderboard update.');
    }
  }

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
              {!isLoading && leaderboardData?.players.map((player, index) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium text-center">{index + 1}</TableCell>
                  <TableCell>{player.username}</TableCell>
                  <TableCell className="text-right font-semibold">{player.eloRating}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (!leaderboardData?.players || leaderboardData.players.length === 0) && (
            <p className="text-center text-muted-foreground mt-4">No players on the leaderboard yet. Try manually updating.</p>
          )}
        </CardContent>
      </Card>
      <div className="text-center mt-6 space-x-4">
        <Link href="/">
          <Button>Back to Game</Button>
        </Link>
         <Button onClick={handleManualUpdate} variant="secondary">Update Leaderboard</Button>
      </div>
       {leaderboardData?.updatedAt && (
        <p className="text-center text-xs text-muted-foreground mt-2">
          Last updated: {new Date(leaderboardData.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
