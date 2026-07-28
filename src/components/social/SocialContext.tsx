
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
}

const SocialContext = createContext<SocialContextType | undefined>(undefined);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { user, userData } = useUser();
  const firestore = useFirestore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

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
  }, [user, userData]);

  const addLog = useCallback((text: string) => {
    const log: ChatMessage = {
        id: `log_${Date.now()}_${Math.random()}`,
        sender: 'SYSTEM',
        text,
        timestamp: Date.now(),
        category: 'log'
    };
    setMessages(prev => [...prev, log]);
  }, []);

  const sendMessage = useCallback((text: string, category: MessageCategory, targetId?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const payload = {
        type: 'chat-message',
        category,
        text,
        targetId,
        sender: userData?.username || user?.displayName || 'Player',
        senderId: user?.uid
    };
    wsRef.current.send(JSON.stringify(payload));
  }, [user, userData]);

  const sendChallenge = useCallback((friendId: string) => {
    const roomId = `duel_${Math.random().toString(36).substring(2, 9)}`;
    sendMessage(`I challenge you to a duel!`, 'social', friendId);
    // Send specific challenge type so server can flag it
    wsRef.current?.send(JSON.stringify({
        type: 'challenge-friend',
        friendId,
        roomId,
        senderName: userData?.username || user?.displayName || 'Player'
    }));
  }, [user, userData, sendMessage]);

  const acceptChallenge = useCallback((roomId: string) => {
      // In a real app, this would route the user to the lobby with this roomId
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
      // Stub for blocking logic
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
    ws
  };

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) throw new Error('useSocial must be used within SocialProvider');
  return context;
}
