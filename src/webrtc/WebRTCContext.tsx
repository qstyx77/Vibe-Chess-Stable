
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
    // Placeholder for actual WebRTC room creation logic
    // This would involve a signaling server
    console.log('Attempting to create WebRTC room...');
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newRoomId = `room_${Math.random().toString(36).substring(2, 7)}`;
    setState(prev => ({ ...prev, isConnected: true, isConnecting: false, roomId: newRoomId }));
    console.log(`Room created: ${newRoomId}`);
    // In a real scenario, you'd return the room ID from the signaling server
    return newRoomId;
  }, []);

  const joinRoom = useCallback(async (roomIdToJoin: string): Promise<boolean> => {
    // Placeholder for actual WebRTC room joining logic
    // This would involve a signaling server
    console.log(`Attempting to join WebRTC room: ${roomIdToJoin}...`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin }));
     // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Simulate successful connection
    setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    console.log(`Joined room: ${roomIdToJoin}`);
    return true;
    // In a real scenario, handle connection failures and set error accordingly
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
    // Placeholder for disconnecting logic (closing peer connections, notifying signaling server)
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
