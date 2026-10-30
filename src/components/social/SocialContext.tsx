
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, query, increment, runTransaction } from 'firebase/firestore';
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
  isTournamentIntermission: boolean;
  tournamentRound: number;
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
  const [isTournamentIntermission, setIsTournamentIntermission] = useState(false);
  const [tournamentRound, setTournamentRound] = useState(0);
  
  const [ignoredUserIds, setIgnoredUserIds] = useState<Set<string>>(new Set());
  
  const wsRef = useRef<WebSocket | null>(null);
  const userDataRef = useRef(userData);
  const ignoredUserIdsRef = useRef(ignoredUserIds);
  const messageIdsRef = useRef<Set<string>>(new Set());

  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<Set<MessageCategory>>(new Set(['battle', 'social', 'log', 'market']));
  const [hasUnread, setHasUnread] = useState({ battle: false, social: false, log: false, market: false });
  const [chatInput, setChatInput] = useState('');

  const isMessengerOpenRef = useRef(isMessengerOpen);
  const visibleCategoriesRef = useRef(visibleCategories);

  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  useEffect(() => {
    ignoredUserIdsRef.current = ignoredUserIds;
  }, [ignoredUserIds]);

  useEffect(() => {
    isMessengerOpenRef.current = isMessengerOpen;
  }, [isMessengerOpen]);

  useEffect(() => {
    visibleCategoriesRef.current = visibleCategories;
  }, [visibleCategories]);

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
    const logId = `log_${Date.now()}_${entropy}`;
    const log: ChatMessage = {
        id: logId,
        sender: 'SYSTEM',
        text,
        timestamp: Date.now(),
        category: 'log'
    };
    
    if (messageIdsRef.current.has(logId)) return;
    messageIdsRef.current.add(logId);

    setMessages(prev => {
        const next = [...prev, log];
        return next.slice(-100);
    });
    setHasUnread(prev => {
        if (!isMessengerOpenRef.current || !visibleCategoriesRef.current.has('log')) {
            return { ...prev, log: true };
        }
        return prev;
    });
  }, []);

  useEffect(() => {
    if (ws && ws.readyState === WebSocket.OPEN && user?.uid) {
        ws.send(JSON.stringify({ 
            type: 'identify', 
            userId: user.uid, 
            username: userDataRef.current?.username || user.displayName || 'Player' 
        }));
    }
  }, [ws, user?.uid, userData?.username]);

  useEffect(() => {
    if (!user) {
        if (wsRef.current) wsRef.current.close();
        setMessages([]);
        messageIdsRef.current.clear();
        setOnlineUserIds(new Set());
        setOnlineUsers([]);
        setOnlineStatus('disconnected');
        return;
    }

    let reconnectTimeout: NodeJS.Timeout;

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
            if (user?.uid) {
                socket.send(JSON.stringify({ 
                    type: 'identify', 
                    userId: user.uid, 
                    username: userDataRef.current?.username || user.displayName || 'Player' 
                }));
            }
        };
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'chat-message') {
                const senderId = data.message.senderId;
                const text = data.message.text || '';
                const cat = data.message.category as MessageCategory;
                const msgId = data.message.id;
                
                // Only de-duplicate if the message ID was generated by THIS specific client instance
                // to prevent blocking legitimate DMs arriving from other sources.
                const isSentByMe = senderId === user?.uid;
                if (isSentByMe && messageIdsRef.current.has(msgId)) {
                    return;
                }

                if (ignoredUserIdsRef.current.has(senderId)) {
                    return;
                }
                
                const isWhisper = text.includes('[WHISPER]') || text.includes('[TO ');

                messageIdsRef.current.add(msgId);
                setMessages(prev => {
                    const next = [...prev, data.message];
                    return next.slice(-100); 
                });

                if (isWhisper) {
                    setVisibleCategories(prev => {
                        if (!prev.has('social')) {
                            const next = new Set(prev);
                            next.add('social');
                            return next;
                        }
                        return prev;
                    });
                }

                if (isSentByMe) return;

                setHasUnread(prev => {
                    if (!isMessengerOpenRef.current || !visibleCategoriesRef.current.has(cat)) {
                        return { ...prev, [cat]: true };
                    }
                    return prev;
                });
            } else if (data.type === 'presence-update') {
                setOnlineUserIds(new Set(data.users.map((u: any) => u.userId)));
                setOnlineUsers(data.users);
            } else if (data.type === 'tournament-queue-update') {
                setTournamentQueueCount(data.count);
            } else if (data.type === 'tournament-match-ready') {
                setIsTournamentIntermission(false);
                toast({ title: 'Arena Ready!', description: 'Your tournament match is starting!', duration: 10000 });
                window.location.href = `/?roomId=${data.roomId}`;
            } else if (data.type === 'tournament-intermission') {
                setIsTournamentIntermission(true);
                setTournamentRound(data.round);
                toast({ title: 'Advanced!', description: `You have advanced to Round ${data.nextRound}! Re-equip your units now.`, duration: 15000 });
            }
        };
        socket.onclose = (event) => {
            setOnlineStatus('disconnected');
            setOnlineUserIds(new Set());
            setOnlineUsers([]);
            reconnectTimeout = setTimeout(initWs, 3000);
        };
        wsRef.current = socket;
        setWs(socket);
    };

    initWs();
    return () => { 
        if (wsRef.current) wsRef.current.close();
        clearTimeout(reconnectTimeout);
    };
  }, [user?.uid, toast]);

  const clearUnread = useCallback((category: MessageCategory) => {
      setHasUnread(prev => ({ ...prev, [category]: false }));
  }, []);

  const sendMessage = useCallback((text: string, category: MessageCategory, targetId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        addLog("Not connected to server.");
        return;
    }

    const myUsername = userDataRef.current?.username || user?.displayName || 'Player';
    const myId = user?.uid;
    const entropy = Math.random().toString(36).substr(2, 5);

    if (text.startsWith('/')) {
        const parts = text.trim().split(' ');
        const cmd = parts[0].toLowerCase();
        
        const adminCmds = ['/gold', '/elo', '/unlock', '/clear_inv', '/mute', '/unmute', '/ban', '/unban', '/delete_acc', '/who', '/adminhelp'];
        if (adminCmds.includes(cmd)) {
            addLog(`Executing: ${cmd}...`);
            wsRef.current.send(JSON.stringify({
                type: 'admin-command',
                senderId: myId,
                text: text
            }));
            return;
        }

        if (cmd === '/help') {
            addLog("HERO COMMAND LIST:");
            addLog("/friend <name> - Send friend request");
            addLog("/unfriend <name> - Remove friend");
            addLog("@<name> <msg> - Private message");
            addLog("/invite <name> - Invite player to your room");
            addLog("/spectate <name> - Join a player's session");
            addLog("/block <name> - Permanent blacklist");
            addLog("/unblock <name> - Restore communication");
            addLog("/ignore <name> - Session hide (Soft block)");
            addLog("/stats - View your combat record");
            addLog("/rank - Check Hall of Champions position");
            addLog("/clear - Wipe session logs");
            return;
        }

        if (cmd === '/clear') {
            setMessages([]);
            messageIdsRef.current.clear();
            addLog("Session history cleared.");
            return;
        }

        if (cmd === '/ignore') {
            const targetName = parts[1];
            if (targetName) {
                const target = onlineUsers.find(u => u.username.toLowerCase() === targetName.toLowerCase());
                if (target) {
                    setIgnoredUserIds(prev => new Set(prev).add(target.userId));
                    addLog(`Now ignoring messages from ${target.username} for this session.`);
                } else {
                    addLog(`Error: ${targetName} not found online.`);
                }
            } else {
                addLog("Usage: /ignore <name>");
            }
            return;
        }

        if (cmd === '/stats') {
            if (userDataRef.current) {
                addLog(`YOUR RECORD: ${userDataRef.current.username}`);
                addLog(`Elo: ${userDataRef.current.eloRating} | Victories: ${userDataRef.current.wins}`);
                addLog(`Defeats: ${userDataRef.current.losses} | Gold: ${userDataRef.current.goldBalance}`);
            }
            return;
        }

        const playerForwardCmds = ['/friend', '/unfriend', '/invite', '/block', '/unblock', '/rank', '/spectate'];
        if (playerForwardCmds.includes(cmd)) {
            wsRef.current.send(JSON.stringify({
                type: 'player-command',
                senderId: myId,
                text: text
            }));
            return;
        }
    }

    // Handle @ Mentions / Whispers
    if (text.startsWith('@')) {
        let foundUser = null;
        let msgBody = "";
        
        const sortedOnlineUsers = [...onlineUsers].sort((a, b) => b.username.length - a.username.length);

        for (const u of sortedOnlineUsers) {
            const prefix = `@${u.username}`;
            if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
                foundUser = u;
                msgBody = text.substring(prefix.length).replace(/^[:\s]+/, '').trim();
                break;
            }
        }

        if (foundUser && msgBody) {
            const msgId = `opt_w_${Date.now()}_${entropy}`;
            console.log(`[SOCIAL]: SENDING whisper to ${foundUser.username} (${foundUser.userId}). Msg: "${msgBody}"`);
            
            const localMsg: ChatMessage = {
                id: msgId,
                sender: myUsername,
                senderId: myId,
                text: `[TO ${foundUser.username}]: ${msgBody}`,
                timestamp: Date.now(),
                category: 'social'
            };

            messageIdsRef.current.add(msgId);
            setMessages(prev => {
                const next = [...prev, localMsg];
                return next.slice(-100);
            });
            
            setVisibleCategories(prev => {
                const next = new Set(prev);
                next.add('social');
                return next;
            });

            const whisperPayload = { 
                type: 'chat-message', 
                id: msgId,
                category: 'social', 
                text: msgBody, 
                targetId: foundUser.userId,
                targetName: foundUser.username, 
                sender: myUsername, 
                senderId: myId 
            };
            wsRef.current.send(JSON.stringify(whisperPayload));
            return;
        } else if (text.split(' ')[0].startsWith('@')) {
            const attemptedName = text.split(' ')[0].substring(1);
            addLog(`User ${attemptedName} is not online.`);
            return;
        }
    }

    const msgId = `opt_${Date.now()}_${entropy}`;
    const broadcastMsg: ChatMessage = {
        id: msgId,
        sender: myUsername,
        senderId: myId,
        text: text,
        timestamp: Date.now(),
        category: category
    };
    
    messageIdsRef.current.add(msgId);
    setMessages(prev => {
        const next = [...prev, broadcastMsg];
        return next.slice(-100);
    });

    const broadcastPayload = { 
        type: 'chat-message', 
        id: msgId, 
        category, 
        text, 
        targetId, 
        sender: myUsername, 
        senderId: myId 
    };
    wsRef.current.send(JSON.stringify(broadcastPayload));
  }, [user?.uid, addLog, onlineUsers, userData]);

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
            
            const quantityPurchased = listing.listingType === 'each' ? 1 : listing.quantity;

            if (itemIdx > -1) newBuyerInventory[itemIdx].count += quantityPurchased;
            else newBuyerInventory.push({ type: listing.itemId, count: quantityPurchased });

            let newSellerMarket = [...sellerData.marketSlots];
            if (listing.listingType === 'each') {
                const targetIdx = newSellerMarket.findIndex((s: any) => s.slot === slot);
                newSellerMarket[targetIdx].quantity -= 1;
                if (newSellerMarket[targetIdx].quantity <= 0) {
                    newSellerMarket = newSellerMarket.filter((s: any) => s.slot !== slot);
                }
            } else {
                newSellerMarket = newSellerMarket.filter((s: any) => s.slot !== slot);
            }

            transaction.update(buyerRef, { goldBalance: newBuyerGold, inventory: newBuyerInventory });
            transaction.update(sellerRef, { goldBalance: newSellerGold, marketSlots: newSellerMarket });
        });
        toast({ title: "Purchase Success!", description: "Check your loot bag." });
    } catch (e: any) {
        toast({ variant: 'destructive', title: "Purchase Failed", description: e.message });
    }
  }, [user, firestore, toast]);

  const joinTournamentQueue = useCallback(() => {
    if (!wsRef.current || !userDataRef.current || !user || !firestore) return;
    if (userDataRef.current.goldBalance < 100) { 
        toast({ variant: 'destructive', title: "Broke!", description: "100 Gold required for entry." }); 
        return; 
    }
    
    const userRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userRef, { goldBalance: increment(-100) });

    const equipment = userDataRef.current.equipment || {};
    wsRef.current.send(JSON.stringify({ 
        type: 'join-tournament-queue', 
        userId: user.uid,
        user: {
            userId: user.uid,
            username: userDataRef.current.username,
            elo: userDataRef.current.eloRating,
            unlockedPieces: userDataRef.current.unlockedPieces || [],
            equipment: equipment
        }
    }));
    addLog("Joined Arena Queue. 100 Gold entry paid.");
  }, [user, firestore, toast, addLog]);

  const sendChallenge = useCallback((friendId: string) => {
    const roomId = `duel_${Math.random().toString(36).substring(2, 9)}`;
    sendMessage(`I challenge you to a duel!`, 'social', friendId);
    wsRef.current?.send(JSON.stringify({ 
        type: 'challenge-friend', 
        friendId, 
        roomId, 
        senderName: userDataRef.current?.username || user?.displayName || 'Player' 
    }));
  }, [user?.uid, sendMessage]);

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
      messages, 
      friends: (friendsData || []).map(f => ({ ...f })), 
      addLog, 
      sendMessage, 
      sendChallenge, 
      acceptChallenge, 
      addFriend, 
      removeFriend, 
      blockUser, 
      onlineStatus, 
      ws, 
      onlineUserIds, 
      onlineUsers, 
      isMessengerOpen, 
      setIsMessengerOpen, 
      hasUnread, 
      clearUnread, 
      visibleCategories, 
      setVisibleCategories, 
      chatInput, 
      setChatInput, 
      startDm, 
      buyItemFromMarket, 
      joinTournamentQueue, 
      tournamentQueueCount,
      isTournamentIntermission,
      tournamentRound
    }}>{children}</SocialContext.Provider>
  );
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
