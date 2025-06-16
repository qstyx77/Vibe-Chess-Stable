
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback } from 'react';

// Placeholder for actual game move type
type GameMove = any; // Replace with your actual Move type from '@/types' if available

interface WebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  roomId: string | null;
  error: string | null;
  // We'll add more state like peer connections, data channels later
}

interface WebRTCContextType extends WebRTCState {
  createRoom: () => Promise<string | null>;
  joinRoom: (roomId: string) => Promise<boolean>;
  sendMove: (move: GameMove) => void;
  disconnect: () => void;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<WebRTCState>({
    isConnected: false,
    isConnecting: false,
    roomId: null,
    error: null,
  });

  const createRoom = useCallback(async (): Promise<string | null> => {
    console.log('Attempting to create WebRTC room...');
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: null, isConnected: false }));
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const newRoomId = `room_${Math.random().toString(36).substring(2, 7)}`;
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false, roomId: newRoomId }));
        console.log(`Room created: ${newRoomId}`);
        resolve(newRoomId);
      }, 1000);
    });
  }, []);

  const joinRoom = useCallback(async (roomIdToJoin: string): Promise<boolean> => {
    console.log(`Attempting to join WebRTC room: ${roomIdToJoin}...`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isConnected: false }));

    return new Promise((resolve) => {
      setTimeout(() => {
        if (roomIdToJoin === "fail") { // Simple way to test error
          setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: "Failed to join room (simulated)." }));
          console.error(`Failed to join room: ${roomIdToJoin}`);
          resolve(false);
        } else {
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
          console.log(`Joined room: ${roomIdToJoin}`);
          resolve(true);
        }
      }, 1000);
    });
  }, []);

  const sendMove = useCallback((move: GameMove) => {
    if (!state.isConnected || !state.roomId) {
      console.error('Cannot send move, not connected to a room.');
      setState(prev => ({ ...prev, error: 'Cannot send move: Not connected.' }));
      return;
    }
    // Placeholder for sending move via RTCDataChannel
    console.log(`Sending move to room ${state.roomId}:`, move);
  }, [state.isConnected, state.roomId]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting from WebRTC room...');
    setState({
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
    });
  }, []);

  return (
    <WebRTCContext.Provider value={{ ...state, createRoom, joinRoom, sendMove, disconnect }}>
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = (): WebRTCContextType => {
  const context = useContext(WebRTCContext);
  if (context === undefined) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};
