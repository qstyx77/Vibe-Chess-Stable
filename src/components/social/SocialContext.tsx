
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useFirestore, updateDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, getDoc, query, onSnapshot } from 'firebase/firestore';
import type { ChatMessage, MessageCategory, Friend, PlayerColor } from '@/types';

interface SocialContextType {
  messages: ChatMessage[];
  friends: Friend[];
  addLog: (text: string) => void;
  sendMessage: (text: string, category: MessageCategory, targetId?: string) => void;
  sendChallenge: (friendId: string) => void;
  acceptChallenge: (roomId: string) => void;
  addFriend: (userId: string, username: string) => void;
  removeFriend: (userId: string) => void;
  blockUser: (userId: string) => void;
  onlineStatus: 'disconnected' | 'connecting' | 'connected';
  ws: WebSocket | null;
  // Messenger UI state
  isMessengerOpen: boolean;
  setIsMessengerOpen: (open: boolean) => void;
  hasUnread: { battle: boolean; social: boolean; log: boolean };
  clearUnread: (category: MessageCategory) => void;
  visibleCategories: Set<MessageCategory>;
  setVisibleCategories: (cats: Set<MessageCategory>) => void;
  chatInput: string;
  setChatInput: (val: string) => void;
  startDm: (username: string) => void;
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user, userData } = useUser();
  const firestore = useFirestore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  // UI State
  const [isMessengerOpen, setIsMessengerOpen] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<Set<MessageCategory>>(new Set(['battle', 'social', 'log']));
  const [hasUnread, setHasUnread] = useState({ battle: false, social: false, log: false });
  const [chatInput, setChatInput] = useState('');

  // Presence tracking
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

  // Friends collection
  const friendsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, 'users', user.uid, 'friends');
  }, [user, firestore]);
  const { data: friendsData } = useCollection<Friend>(friendsQuery);

  const addLog = useCallback((text: string) => {
    const log: ChatMessage = {
        id: `log_${Date.now()}_${Math.random()}`,
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

  // Connection Management
  useEffect(() => {
    if (!user) {
        if (wsRef.current) wsRef.current.close();
        setMessages([]);
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
                setMessages(prev => [...prev, data.message]);
                const cat = data.message.category as MessageCategory;
                if (!isMessengerOpen || !visibleCategories.has(cat)) {
                    setHasUnread(prev => ({ ...prev, [cat]: true }));
                }
            }
        };
        socket.onclose = () => {
            setOnlineStatus('disconnected');
            setTimeout(initWs, 3000);
        };
        wsRef.current = socket;
        setWs(socket);
    };

    initWs();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [user, userData, isMessengerOpen, visibleCategories]);

  const clearUnread = useCallback((category: MessageCategory) => {
      setHasUnread(prev => ({ ...prev, [category]: false }));
  }, []);

  const sendMessage = useCallback((text: string, category: MessageCategory, targetId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Command Parser
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

        if (cmd === '/friends') {
            const msgBody = parts.slice(1).join(' ');
            if (!msgBody) {
                addLog("Usage: /friends <message>");
                return;
            }
            wsRef.current.send(JSON.stringify({
                type: 'chat-message',
                category: 'social',
                text: `(To All Friends): ${msgBody}`,
                sender: userData?.username || user?.displayName || 'Player',
                senderId: user?.uid,
                broadcast: 'friends'
            }));
            return;
        }
    }

    // Whisper Parser (@name format)
    if (text.startsWith('@')) {
        const parts = text.split(' ');
        const name = parts[0].substring(1); // Remove the @
        const msgBody = parts.slice(1).join(' ');
        
        if (name && msgBody) {
            wsRef.current.send(JSON.stringify({
                type: 'chat-message',
                category: 'social',
                text: `(Whisper to ${name}): ${msgBody}`,
                targetName: name,
                sender: userData?.username || user?.displayName || 'Player',
                senderId: user?.uid
            }));
            return;
        } else if (name && !msgBody) {
            addLog(`Usage: @${name} <message>`);
            return;
        }
    }

    const payload = {
        type: 'chat-message',
        category,
        text,
        targetId,
        sender: userData?.username || user?.displayName || 'Player',
        senderId: user?.uid
    };
    wsRef.current.send(JSON.stringify(payload));
  }, [user, userData, addLog]);

  const startDm = useCallback((username: string) => {
      setIsMessengerOpen(true);
      const nextVisible = new Set(visibleCategories);
      nextVisible.add('social');
      setVisibleCategories(nextVisible);
      setChatInput(`@${username} `);
  }, [visibleCategories]);

  const sendChallenge = useCallback((friendId: string) => {
    const roomId = `duel_${Math.random().toString(36).substring(2, 9)}`;
    sendMessage(`I challenge you to a duel!`, 'social', friendId);
    wsRef.current?.send(JSON.stringify({
        type: 'challenge-friend',
        friendId,
        roomId,
        senderName: userData?.username || user?.displayName || 'Player'
    }));
  }, [user, userData, sendMessage]);

  const acceptChallenge = useCallback((roomId: string) => {
      window.location.href = `/?roomId=${roomId}`;
  }, []);

  const addFriend = useCallback((friendId: string, friendName: string) => {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'users', user.uid, 'friends', friendId);
    setDoc(ref, { id: friendId, username: friendName, status: 'accepted', createdAt: new Date().toISOString() });
    addLog(`Added ${friendName} to friends.`);
  }, [user, firestore, addLog]);

  const removeFriend = useCallback((friendId: string) => {
    if (!user || !firestore) return;
    const ref = doc(firestore, 'users', user.uid, 'friends', friendId);
    deleteDoc(ref);
  }, [user, firestore]);

  const blockUser = useCallback((targetId: string) => {
      addLog(`User blocked.`);
  }, [addLog]);

  const value = {
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
    isMessengerOpen,
    setIsMessengerOpen,
    hasUnread,
    clearUnread,
    visibleCategories,
    setVisibleCategories,
    chatInput,
    setChatInput,
    startDm
  };

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
