'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Coins, 
  Trophy, 
  Megaphone, 
  RefreshCw,
  Check,
  Activity,
  User as UserIcon
} from 'lucide-react';
import { useSocial } from '../social/SocialContext';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, limit, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { PixelGear, PixelGemstoneMasonry } from './IconLibrary';

interface AdminSanctumProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AdminUserRecord {
  id: string;
  username: string;
  goldBalance: number;
  eloRating: number;
  lastActive?: string;
  role?: string;
}

export function AdminSanctum({ isOpen, onOpenChange }: AdminSanctumProps) {
  const firestore = useFirestore();
  const { ws, onlineUserIds } = useSocial();
  const [searchQuery, setSearchQuery] = useState('');
  const [broadcastText, setBroadcastText] = useState('');

  // 1. Direct Real-time Ledger via Client SDK (Bypasses server-side Admin SDK hangs)
  const usersQuery = useMemoFirebase(() => {
    if (!isOpen || !firestore) return null;
    return query(collection(firestore, 'users'), limit(200));
  }, [isOpen, firestore]);

  const { data: usersData, isLoading: loading } = useCollection<AdminUserRecord>(usersQuery);

  // Buffer for local numeric changes before "Update" is clicked
  const [localStats, setLocalStats] = useState<Record<string, { gold: number, elo: number }>>({});

  useEffect(() => {
    if (usersData) {
        setLocalStats(prev => {
            const next = { ...prev };
            usersData.forEach(u => {
                // Only initialize if we aren't currently tracking local changes to avoid overwriting typed input
                if (next[u.id] === undefined) {
                    next[u.id] = { gold: u.goldBalance || 0, elo: u.eloRating || 1200 };
                }
            });
            return next;
        });
    }
  }, [usersData]);

  useEffect(() => {
    if (!ws) return;
    const handleAdminError = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'admin-error') {
                console.error("[ADMIN SANCTUM]: Server reported error:", data.message);
            }
        } catch (e) {}
    };
    ws.addEventListener('message', handleAdminError);
    return () => ws.removeEventListener('message', handleAdminError);
  }, [ws]);

  const handleUpdateUser = (userId: string) => {
    const stats = localStats[userId];
    if (ws?.readyState === WebSocket.OPEN && stats) {
      console.log(`[ADMIN SANCTUM]: Dispatching update for Hero ${userId}...`);
      ws.send(JSON.stringify({ 
          type: 'admin-action', 
          action: 'update-user', 
          payload: { 
            targetUid: userId, 
            gold: stats.gold, 
            elo: stats.elo 
          } 
      }));
    }
  };

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastText.trim() && ws?.readyState === WebSocket.OPEN) {
        console.log(`[ADMIN SANCTUM]: Dispatching global broadcast: ${broadcastText}`);
        ws.send(JSON.stringify({ 
            type: 'admin-action', 
            action: 'broadcast', 
            payload: { text: broadcastText } 
        }));
        setBroadcastText('');
    }
  };

  const filteredUsers = useMemo(() => {
    const list = (usersData || []) as AdminUserRecord[];
    return list.filter(u => 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.id.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
        const aOnline = onlineUserIds.has(a.id);
        const bOnline = onlineUserIds.has(b.id);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return 0;
    });
  }, [usersData, searchQuery, onlineUserIds]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl bg-black border-2 border-primary font-pixel p-0 overflow-hidden h-[90vh] flex flex-col shadow-[0_0_50px_rgba(var(--primary),0.2)] rounded-none">
        {/* Aesthetic Background Layer */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-10">
           <div className="absolute inset-0 ascii-shader [--ascii-unit:4px] animate-gemstone-shimmer">
              <PixelGemstoneMasonry className="w-full h-full" />
           </div>
        </div>

        <DialogHeader className="p-6 border-b border-border/50 relative z-10 bg-black/60 backdrop-blur-sm shrink-0">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <PixelGear className="h-10 w-10 text-primary animate-spin-slow ascii-shader" />
                 <div>
                    <DialogTitle className="text-xl text-primary uppercase tracking-tighter">Command Sanctum</DialogTitle>
                    <DialogDescription className="text-[0.6rem] text-muted-foreground uppercase">Administrative Control Protocol: SUGGA-01</DialogDescription>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 {loading && <Activity className="h-4 w-4 text-primary animate-pulse" />}
                 <div className="text-right">
                    <p className="text-[0.45rem] text-muted-foreground uppercase">Status</p>
                    <p className="text-[0.6rem] text-primary uppercase font-bold">Authenticated</p>
                 </div>
              </div>
           </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row relative z-10 scrollbar-hide">
            {/* HERO LEDGER MAIN PANEL */}
            <div className="w-full lg:flex-1 flex flex-col lg:border-r border-border/30 p-4 bg-black/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3 px-1">
                    <h2 className="text-[0.65rem] text-primary uppercase font-bold flex items-center gap-2">
                        <UserIcon className="h-4 w-4" /> Hero Ledger ({filteredUsers.length})
                    </h2>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="SEARCH HERO..." 
                            className="pl-10 h-8 text-[0.6rem] bg-background/50 border-primary/20 rounded-none uppercase font-pixel"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="h-[50vh] lg:h-auto lg:flex-1 pr-4 border border-primary/10 bg-black/40">
                    <div className="p-2 space-y-2">
                        {filteredUsers.map(u => {
                            const isOnline = onlineUserIds.has(u.id);
                            const stats = localStats[u.id] || { gold: u.goldBalance || 0, elo: u.eloRating || 1200 };
                            return (
                                <Card key={u.id} className="border border-border/50 bg-muted/5 rounded-none hover:bg-primary/5 transition-colors">
                                    <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-[140px]">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full shrink-0",
                                                isOnline ? "bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-slate-700"
                                            )} />
                                            <div className="min-w-0">
                                                <p className="text-[0.65rem] text-white uppercase truncate font-bold">{u.username}</p>
                                                <p className="text-[0.45rem] text-muted-foreground uppercase mt-0.5 truncate">ID: {u.id.slice(0, 8)}...</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap justify-end">
                                            <div className="flex items-center gap-2 bg-black/40 border border-yellow-500/20 px-2 py-1">
                                                <Coins className="h-3 w-3 text-yellow-500" />
                                                <input 
                                                    type="number" 
                                                    value={stats.gold}
                                                    onChange={(e) => setLocalStats(prev => ({ ...prev, [u.id]: { ...stats, gold: parseInt(e.target.value) || 0 } }))}
                                                    className="w-16 bg-transparent border-none text-yellow-400 font-pixel text-[0.6rem] focus:outline-none"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 bg-black/40 border border-primary/20 px-2 py-1">
                                                <Trophy className="h-3 w-3 text-primary" />
                                                <input 
                                                    type="number" 
                                                    value={stats.elo}
                                                    onChange={(e) => setLocalStats(prev => ({ ...prev, [u.id]: { ...stats, elo: parseInt(e.target.value) || 0 } }))}
                                                    className="w-16 bg-transparent border-none text-primary font-pixel text-[0.6rem] focus:outline-none"
                                                />
                                            </div>
                                            <Button 
                                                size="sm" 
                                                className="h-8 px-3 rounded-none bg-primary/20 hover:bg-primary text-foreground text-[0.5rem] border border-primary/30"
                                                onClick={() => handleUpdateUser(u.id)}
                                            >
                                                <Check className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                        
                        {filteredUsers.length === 0 && !loading && (
                            <div className="text-center py-20 opacity-30">
                                <Activity className="h-12 w-12 mx-auto mb-2" />
                                <p className="text-[0.6rem] uppercase">
                                    {usersData && usersData.length === 0 ? "THE REALM IS CURRENTLY UNPOPULATED" : "NO HERO MATCHES SEARCH CRITERIA"}
                                </p>
                            </div>
                        )}
                        
                        {loading && (
                             <div className="text-center py-20 animate-pulse">
                                <RefreshCw className="h-12 w-12 mx-auto mb-2 animate-spin text-primary opacity-50" />
                                <p className="text-[0.6rem] uppercase text-primary">COMMUNING WITH THE ANCIENT LEDGER...</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* BROADCAST TOOL SIDEBAR */}
            <div className="w-full lg:w-80 p-4 bg-muted/10 border-t lg:border-t-0 flex flex-col gap-4 shrink-0">
                <section className="space-y-3">
                    <h2 className="text-[0.65rem] text-accent uppercase font-bold flex items-center gap-2">
                        <Megaphone className="h-4 w-4" /> Global Voice
                    </h2>
                    <form onSubmit={handleBroadcast} className="space-y-2">
                        <textarea 
                            value={broadcastText}
                            onChange={(e) => setBroadcastText(e.target.value)}
                            placeholder="TYPE MESSAGE TO ALL HEROES..."
                            className="w-full h-32 bg-black/60 border border-accent/30 text-white font-pixel text-[0.6rem] p-3 focus:border-accent focus:ring-1 focus:ring-accent outline-none uppercase resize-none"
                        />
                        <Button type="submit" className="w-full h-10 rounded-none bg-accent hover:bg-accent/80 text-accent-foreground text-[0.6rem] uppercase">
                           Broadcast Realm-Wide
                        </Button>
                    </form>
                    <p className="text-[0.45rem] text-muted-foreground uppercase leading-tight italic">
                        Messages sent here will appear in the System Log for every Hero currently online.
                    </p>
                </section>

                <Separator className="bg-border/30" />

                <section className="space-y-3">
                    <h2 className="text-[0.65rem] text-primary uppercase font-bold flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Sanctum Status
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-black/40 border border-border/30 text-center">
                            <p className="text-[0.45rem] text-muted-foreground uppercase">Online</p>
                            <p className="text-sm font-bold text-green-500">{onlineUserIds.size}</p>
                        </div>
                        <div className="p-2 bg-black/40 border border-border/30 text-center">
                            <p className="text-[0.45rem] text-muted-foreground uppercase">Registered</p>
                            <p className="text-sm font-bold text-primary">{usersData?.length || 0}</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <div className="p-4 bg-black border-t border-border/50 text-center relative z-10 shrink-0">
            <p className="text-[0.5rem] text-muted-foreground uppercase tracking-widest font-bold">
               Vibe Chess Architectural Console v1.0.9-BETA
            </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
