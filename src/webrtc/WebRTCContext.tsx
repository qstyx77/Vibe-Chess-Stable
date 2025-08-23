
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type GameMove = any; 

interface WebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  peerPresent: boolean;
  roomId: string | null;
  error: string | null;
  isCreator: boolean;
}

interface WebRTCContextType extends WebRTCState {
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  sendMove: (move: GameMove) => void;
  disconnect: () => void;
  setOnMoveReceivedCallback: (callback: ((move: GameMove) => void) | null) => void;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const getSignalingServerUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8080`;
};

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<WebRTCState>({
    isConnected: false,
    isConnecting: false,
    peerPresent: false,
    roomId: null,
    error: null,
    isCreator: false,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMoveReceivedCallbackRef = useRef<((move: GameMove) => void) | null>(null);

  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Cleaning up connections...');
    wsRef.current?.close();
    pcRef.current?.close();
    dcRef.current?.close();
    wsRef.current = null;
    pcRef.current = null;
    dcRef.current = null;
  }, []);
  
  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnect called.');
    cleanup();
    setState({ 
      isConnected: false,
      isConnecting: false,
      peerPresent: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
  }, [cleanup]);

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
      channel.onopen = () => {
          console.log('[WebRTC] [SUCCESS] Data channel is open');
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      };
      channel.onclose = () => {
          console.log('[WebRTC] Data channel is closed');
          setState(prev => ({...prev, error: 'Opponent disconnected.'}));
          disconnect();
      };
      channel.onerror = (err) => {
        console.error('[WebRTC] Data channel error:', err);
        setState(prev => ({...prev, error: 'A connection error occurred.'}));
        disconnect();
      }
      channel.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              onMoveReceivedCallbackRef.current?.(data);
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);

  const createPeerConnection = useCallback((currentRoomId: string) => {
      console.log('[WebRTC] Creating PeerConnection...');
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
  
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'candidate', roomId: currentRoomId, candidate: event.candidate }));
        }
      };
  
      pc.onconnectionstatechange = () => {
        if (!pcRef.current) return;
        const connectionState = pcRef.current.connectionState;
        console.log(`[WebRTC] Connection state changed to: ${connectionState}`);
        if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
          setState(prev => ({ ...prev, error: 'Opponent has disconnected.' }));
          disconnect();
        }
        if (connectionState === 'connected') {
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: false, error: null, isConnected: true }));
        }
      };
  
      pc.ondatachannel = (e) => {
        dcRef.current = e.channel;
        setupDataChannelEvents(e.channel);
      };

      return pc;
  }, [disconnect, setupDataChannelEvents]);
  
  const connectWebSocket = useCallback((action: 'create' | 'join', roomIdToJoin?: string) => {
    if (wsRef.current) {
        console.log('[WebRTC] WebSocket already exists. Disconnecting before reconnecting.');
        disconnect();
    }
    
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    const ws = new WebSocket(getSignalingServerUrl());
    wsRef.current = ws;

    ws.onopen = () => {
        console.log('[WebRTC] WebSocket connected.');
        if (action === 'create') {
            ws.send(JSON.stringify({ type: 'create-room' }));
        } else if (action === 'join' && roomIdToJoin) {
            ws.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
        }
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const currentRoomId = state.roomId || data.roomId;

        switch(data.type) {
            case 'room-created':
                setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, isConnecting: false }));
                createPeerConnection(data.roomId);
                break;
            case 'room-joined':
                setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, peerPresent: true }));
                // The joiner doesn't create the data channel, they wait for it
                break;
            case 'peer-joined':
                setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                const pcCreator = pcRef.current || createPeerConnection(currentRoomId);
                const dc = pcCreator.createDataChannel('gameData');
                dcRef.current = dc;
                setupDataChannelEvents(dc);

                const offer = await pcCreator.createOffer();
                await pcCreator.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: 'offer', roomId: currentRoomId, sdp: offer }));
                break;
            case 'offer':
                const pcJoiner = createPeerConnection(currentRoomId);
                await pcJoiner.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pcJoiner.createAnswer();
                await pcJoiner.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'answer', roomId: currentRoomId, sdp: answer }));
                break;
            case 'answer':
                if (pcRef.current && pcRef.current.signalingState !== 'stable') {
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
                break;
            case 'candidate':
                if (pcRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;
             case 'peer-disconnected':
                setState(prev => ({ ...prev, error: "Opponent has disconnected."}));
                disconnect();
                break;
            case 'error':
                setState(prev => ({...prev, error: `Error: ${data.message}`, isConnecting: false, roomId: null }));
                disconnect();
                break;
        }
    };

    ws.onerror = (err) => {
        console.error('[WebRTC] WebSocket error:', err);
        setState(prev => ({...prev, error: 'Could not connect to signaling server.', isConnecting: false}));
        cleanup();
    };

    ws.onclose = () => {
        console.log('[WebRTC] WebSocket connection closed.');
        // Don't call disconnect() here to avoid infinite loops on failed connections
        if(state.isConnected){
             setState(prev => ({ ...prev, error: "Connection lost." }));
             disconnect();
        }
    };

  }, [createPeerConnection, disconnect, setupDataChannelEvents, cleanup, state.isConnected, state.roomId]);

  const createRoom = useCallback(() => {
      connectWebSocket('create');
  }, [connectWebSocket]);

  const joinRoom = useCallback((roomIdToJoin: string) => {
    connectWebSocket('join', roomIdToJoin);
  }, [connectWebSocket]);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(move));
    } else {
      console.error(`[WebRTC] sendMove failed: Data channel not open. State: ${dc?.readyState}`);
    }
  }, []);

  const providerValue = {
    ...state,
    createRoom,
    joinRoom,
    sendMove,
    disconnect,
    setOnMoveReceivedCallback
  };

  return (
    <WebRTCContext.Provider value={providerValue}>
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
