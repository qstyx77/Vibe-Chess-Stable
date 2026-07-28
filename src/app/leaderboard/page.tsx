
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, limit, getFirestore, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { UserInteractionPopover } from '@/components/social/UserInteractionPopover';

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

  return (
    <div className="container mx-auto p-4 max-w-2xl font-pixel">
      <Card className="border-2 border-primary/20">
        <CardHeader className="text-center border-b border-border/50">
          <div className="flex justify-center items-center gap-2 mb-2">
            <Trophy className="h-6 w-6 text-yellow-500 animate-bounce" />
            <CardTitle className="text-xl uppercase tracking-tighter">HALL OF CHAMPIONS</CardTitle>
            <Trophy className="h-6 w-6 text-yellow-500 animate-bounce" />
          </div>
          <CardDescription className="uppercase text-[9px]">Top 10 tactical masters across the realm.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {error && <p className="text-destructive text-center text-[10px]">Error loading records.</p>}
          <Table>
            <TableHeader>
              <TableRow className="border-b-2">
                <TableHead className="w-[60px] text-center text-[9px] uppercase">RANK</TableHead>
                <TableHead className="text-[9px] uppercase">HERO</TableHead>
                <TableHead className="text-right text-[9px] uppercase">ELO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  </TableRow>
                ))}
              {!isLoading && topPlayers?.map((player, index) => (
                <TableRow key={player.id} className="hover:bg-muted/30 transition-colors border-b border-border/30">
                  <TableCell className="font-bold text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <UserInteractionPopover userId={player.id} username={player.username}>
                      <span className="text-xs uppercase hover:text-primary transition-colors cursor-pointer">{player.username}</span>
                    </UserInteractionPopover>
                  </TableCell>
                  <TableCell className="text-right font-bold text-xs text-primary">{player.eloRating}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!isLoading && (!topPlayers || topPlayers.length === 0) && (
            <p className="text-center text-muted-foreground mt-4 text-[10px] uppercase">The record books are empty.</p>
          )}
        </CardContent>
      </Card>
      <div className="text-center mt-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-[10px] uppercase">
            <ArrowLeft className="mr-2 h-3 w-3" /> Back to Lobby
          </Button>
        </Link>
      </div>
    </div>
  );
}
