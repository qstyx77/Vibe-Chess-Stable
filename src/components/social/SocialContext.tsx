
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, query, onSnapshot, runTransaction } from 'firebase/firestore';
import type { ChatMessage, MessageCategory, Friend, PlayerColor, InventoryItemType } from '@/types';
import { useToast } from '@/hooks/use-toast';

interface SocialContextType {
  messages: ChatMessage[];
  friends: Friend[];
  addLog: (text: string) => void;
  sendMessage: (text: string, category: MessageCategory, targetId?: string) => void;
  sendChallenge: (friendId: string) => void;
  acceptChallenge: (roomId: string) => void;
  addFriend: (userId: string, username: string) => void;
  removeFriend: (userId: string, username: string) => void;
  blockUser: (userId: string) => void;
  onlineStatus: 'disconnected' | 'connecting' | 'connected';
  ws: WebSocket | null;
  onlineUserIds: Set<string>;
  onlineUsers: { userId: string, username: string }[];
  isMessengerOpen: boolean;
  setIsMessengerOpen: (open: boolean) => void;
  hasUnread: { battle: boolean; social: boolean; log: boolean; market: boolean };
  clearUnread: (category: MessageCategory) => void;
  visibleCategories: Set<MessageCategory>;
  setVisibleCategories: (cats: Set<MessageCategory>) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  startDm: (username: string) => void;
  buyItemFromMarket: (sellerId: string, slot: number) => Promise<void>;
  joinTournamentQueue: () => void;
  tournamentQueueCount: number;
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user, userData } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string, username: string }[]>([]);
  const [tournamentQueueCount, setTournamentQueueCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<Set<MessageCategory>>(new Set(['battle', 'social', 'log', 'market']));
  const [hasUnread, setHasUnread] = useState({ battle: false, social: false, log: false, market: false });
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (!user || !firestore) return;
    const updatePresence = () => {
      const userRef = doc(firestore, 'users', user.uid);
      updateDocumentNonBlocking(userRef, { lastActive: new Date().toISOString() });
    };
    updatePresence();
    const interval = setInterval(updatePresence, 60000);
    return () => clearInterval(interval);
  }, [user, firestore]);

  const friendsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, 'users', user.uid, 'friends');
  }, [user, firestore]);
  const { data: friendsData } = useCollection<Friend>(friendsQuery);

  const addLog = useCallback((text: string) => {
    const entropy = Math.random().toString(36).substr(2, 9);
    const log: ChatMessage = {
        id: `log_${Date.now()}_${entropy}`,
        sender: 'SYSTEM',
        text,
        timestamp: Date.now(),
        category: 'log'
    };
    setMessages(prev => [...prev, log]);
    if (!isMessengerOpen || !visibleCategories.has('log')) {
        setHasUnread(prev => ({ ...prev, log: true }));
    }
  }, [isMessengerOpen, visibleCategories]);

  useEffect(() => {
    if (!user) {
        if (wsRef.current) wsRef.current.close();
        setMessages([]);
        setOnlineUserIds(new Set());
        setOnlineUsers([]);
        return;
    }

    const initWs = () => {
        setOnlineStatus('connecting');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = '';
        if (window.location.hostname.includes('cloudworkstations.dev')) {
            const parts = window.location.hostname.split('-');
            parts[0] = '8080';
            wsUrl = `${protocol}//${parts.join('-')}`;
        } else {
            wsUrl = `${protocol}//${window.location.hostname}:8080`;
        }

        const socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            setOnlineStatus('connected');
            socket.send(JSON.stringify({ type: 'identify', userId: user.uid, username: userData?.username || user.displayName || 'Player' }));
        };
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'chat-message') {
                setMessages(prev => {
                    if (prev.some(m => m.id === data.message.id)) return prev;
                    return [...prev, data.message];
                });
                const cat = data.message.category as MessageCategory;
                if (!isMessengerOpen || !visibleCategories.has(cat)) {
                    setHasUnread(prev => ({ ...prev, [cat]: true }));
                }
            } else if (data.type === 'presence-update') {
                setOnlineUserIds(new Set(data.users.map((u: any) => u.userId)));
                setOnlineUsers(data.users);
            } else if (data.type === 'tournament-queue-update') {
                setTournamentQueueCount(data.count);
            } else if (data.type === 'tournament-match-ready') {
                toast({ title: 'Arena Ready!', description: 'Your tournament match is starting!', duration: 10000 });
                window.location.href = `/?roomId=${data.roomId}`;
            }
        };
        socket.onclose = () => {
            setOnlineStatus('disconnected');
            setOnlineUserIds(new Set());
            setOnlineUsers([]);
            setTimeout(initWs, 3000);
        };
        wsRef.current = socket;
        setWs(socket);
    };

    initWs();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [user, userData, isMessengerOpen, visibleCategories, toast]);

  const clearUnread = useCallback((category: MessageCategory) => {
      setHasUnread(prev => ({ ...prev, [category]: false }));
  }, []);

  const sendMessage = useCallback((text: string, category: MessageCategory, targetId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (text.startsWith('/')) {
        const parts = text.split(' ');
        const cmd = parts[0].toLowerCase();
        if (cmd === '/help') {
            addLog("COMMAND LIST:");
            addLog("/help - Show this list");
            addLog("@name <text> - Private whisper to a hero");
            addLog("/friends <text> - Message all online friends");
            addLog("/clear - Wipe session history");
            return;
        }
        if (cmd === '/clear') {
            setMessages([]);
            addLog("Session history cleared.");
            return;
        }
    }

    if (text.startsWith('@')) {
        const sortedOnlineUsers = [...onlineUsers].sort((a, b) => b.username.length - a.username.length);
        let foundUser = null;
        for (const u of sortedOnlineUsers) {
            const prefix = `@${u.username.toLowerCase()} `;
            if (text.toLowerCase().startsWith(prefix)) {
                foundUser = u;
                break;
            }
        }
        if (foundUser) {
            const prefixLen = foundUser.username.length + 2;
            const msgBody = text.substring(prefixLen).trim();
            if (msgBody) {
                wsRef.current.send(JSON.stringify({ type: 'chat-message', category: 'social', text: msgBody, targetName: foundUser.username, sender: userData?.username || user?.displayName || 'Player', senderId: user?.uid }));
                return;
            }
        }
    }

    wsRef.current.send(JSON.stringify({ type: 'chat-message', category, text, targetId, sender: userData?.username || user?.displayName || 'Player', senderId: user?.uid }));
  }, [user, userData, addLog, onlineUsers]);

  const buyItemFromMarket = useCallback(async (sellerId: string, slot: number) => {
    if (!user || !firestore) return;
    const buyerRef = doc(firestore, 'users', user.uid);
    const sellerRef = doc(firestore, 'users', sellerId);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const buyerSnap = await transaction.get(buyerRef);
            const sellerSnap = await transaction.get(sellerRef);
            if (!buyerSnap.exists() || !sellerSnap.exists()) throw new Error("User data error.");

            const buyerData = buyerSnap.data();
            const sellerData = sellerSnap.data();
            const listing = sellerData.marketSlots.find((s: any) => s.slot === slot);
            
            if (!listing) throw new Error("Listing gone.");
            if (buyerData.goldBalance < listing.price) throw new Error("Insufficient Gold.");

            const newBuyerGold = buyerData.goldBalance - listing.price;
            const newSellerGold = (sellerData.goldBalance || 0) + listing.price;

            const newBuyerInventory = [...(buyerData.inventory || [])];
            const itemIdx = newBuyerInventory.findIndex(i => i.type === listing.itemId);
            if (itemIdx > -1) newBuyerInventory[itemIdx].count++;
            else newBuyerInventory.push({ type: listing.itemId, count: 1 });

            const newSellerMarket = sellerData.marketSlots.filter((s: any) => s.slot !== slot);

            transaction.update(buyerRef, { goldBalance: newBuyerGold, inventory: newBuyerInventory });
            transaction.update(sellerRef, { goldBalance: newSellerGold, marketSlots: newSellerMarket });
        });
        toast({ title: "Purchase Success!", description: "Check your loot bag." });
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Purchase Failed", description: e.message });
    }
  }, [user, firestore, toast]);

  const joinTournamentQueue = useCallback(() => {
    if (!wsRef.current || !userData) return;
    if (userData.goldBalance < 100) { toast({ variant: 'destructive', title: "Broke!", description: "100 Gold required for entry." }); return; }
    wsRef.current.send(JSON.stringify({ type: 'join-tournament-queue', userId: user?.uid }));
    addLog("Joined Arena Queue. 100 Gold entry paid.");
  }, [user, userData, toast, addLog]);

  const sendChallenge = useCallback((friendId: string) => {
    const roomId = `duel_${Math.random().toString(36).substring(2, 9)}`;
    sendMessage(`I challenge you to a duel!`, 'social', friendId);
    wsRef.current?.send(JSON.stringify({ type: 'challenge-friend', friendId, roomId, senderName: userData?.username || user?.displayName || 'Player' }));
  }, [userData, user, sendMessage]);

  const acceptChallenge = useCallback((roomId: string) => { window.location.href = `/?roomId=${roomId}`; }, []);

  const addFriend = useCallback((friendId: string, friendName: string) => {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'users', user.uid, 'friends', friendId);
    setDoc(ref, { id: friendId, username: friendName, status: 'accepted', createdAt: new Date().toISOString() });
    addLog(`Added ${friendName} to friends.`);
  }, [user, firestore, addLog]);

  const removeFriend = useCallback((friendId: string, friendName: string) => {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'users', user.uid, 'friends', friendId);
    deleteDoc(ref);
    addLog(`Removed ${friendName} from friends.`);
  }, [user, firestore, addLog]);

  const startDm = (username: string) => {
      setIsMessengerOpen(true);
      const next = new Set(visibleCategories); next.add('social');
      setVisibleCategories(next); setChatInput(`@${username} `);
  };

  const blockUser = (id: string) => { addLog("User blocked."); };

  return (
    <SocialContext.Provider value={{
      messages, friends: (friendsData || []).map(f => ({ ...f })), addLog, sendMessage, sendChallenge, acceptChallenge, addFriend, removeFriend, blockUser, onlineStatus, ws, onlineUserIds, onlineUsers, isMessengerOpen, setIsMessengerOpen, hasUnread, clearUnread, visibleCategories, setVisibleCategories, chatInput, setChatInput, startDm, buyItemFromMarket, joinTournamentQueue, tournamentQueueCount
    }}>{children}</SocialContext.Provider>
  );
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
