
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
  createRoom: () => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
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
    // This assumes the signaling server is running on port 8080 of the same host.
    // This is a common pattern in development environments.
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
  const candidateQueueRef = useRef<RTCIceCandidate[]>([]);


  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);
  
  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnect called. Cleaning up...');
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        wsRef.current.close();
    }
    wsRef.current = null;
    
    if (dcRef.current && dcRef.current.readyState !== 'closed') {
      dcRef.current.close();
    }
    dcRef.current = null;
    
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      pcRef.current.close();
    }
    pcRef.current = null;
    candidateQueueRef.current = [];

    setState({ 
      isConnected: false,
      isConnecting: false,
      peerPresent: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
  }, []);

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
              if (data.type === 'game-move' && data.payload) {
                onMoveReceivedCallbackRef.current?.(data.payload);
              } else {
                 console.warn('[WebRTC] Received non-game-move message on data channel:', data);
              }
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);

  const processCandidateQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || candidateQueueRef.current.length === 0) {
      return;
    }
    console.log(`[WebRTC] Processing ${candidateQueueRef.current.length} queued candidates.`);
    for (const candidate of candidateQueueRef.current) {
        try {
            await pc.addIceCandidate(candidate);
        } catch (error) {
            console.error('[WebRTC] Error adding queued ICE candidate:', error);
        }
    }
    candidateQueueRef.current = [];
  }, []);

  const createPeerConnection = useCallback((currentRoomId: string) => {
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      pcRef.current.close();
    }

    console.log('[WebRTC] Creating new PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
        }
    };

    pc.onconnectionstatechange = () => {
        const connectionState = pc.connectionState;
        console.log(`[WebRTC] Connection state changed to: ${connectionState}`);
        if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
            setState(prev => ({ ...prev, error: 'Opponent has disconnected.'}));
            disconnect();
        }
        if (connectionState === 'connected') {
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: false, error: null, isConnected: true }));
        }
    };
    
    return pc;
  }, [disconnect]);

  const handleSignalingMessage = useCallback(async (event: MessageEvent) => {
    try {
        const data = JSON.parse(event.data);
        const currentRoomId = state.roomId || data.roomId;
        
        console.log(`[WebRTC] [RECV] Received message type '${data.type}' from signaling server.`);
        
        switch(data.type) {
            case 'room-created':
                setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, isConnecting: false, error: null }));
                createPeerConnection(data.roomId);
                return;
            case 'room-joined':
                 setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, error: null, isConnecting: true }));
                 createPeerConnection(data.roomId);
                return;
            case 'error':
                setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
                disconnect();
                return;
            case 'peer-disconnected':
                setState(prev => ({ ...prev, error: "Opponent has disconnected."}));
                disconnect();
                return;
        }

        const pc = pcRef.current;
        if (!pc) {
            console.error('[WebRTC] PeerConnection not initialized, cannot handle message type', data.type);
            return;
        }

        switch (data.type) {
            case 'peer-joined':
                setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                const dc = pc.createDataChannel('gameData');
                dcRef.current = dc;
                setupDataChannelEvents(dc);

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
                }
                break;
            case 'offer':
                pc.ondatachannel = (e) => {
                    dcRef.current = e.channel;
                    setupDataChannelEvents(e.channel);
                };

                setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                await processCandidateQueue();

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
                }
                break;
            case 'answer':
                 if (pc.signalingState !== 'stable') {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                    await processCandidateQueue();
                 }
                break;
            case 'candidate':
                 const candidate = new RTCIceCandidate(data.payload);
                 if (pc.remoteDescription) {
                     await pc.addIceCandidate(candidate);
                 } else {
                     candidateQueueRef.current.push(candidate);
                 }
                break;
        }
    } catch (e) {
        console.error("[WebRTC] Error processing message from signaling server. Message was:", event.data, "Error:", e);
    }
  }, [disconnect, createPeerConnection, setupDataChannelEvents, processCandidateQueue, state.roomId]);
  
  const connectWebSocket = useCallback((onOpenAction: () => void) => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        if (wsRef.current.readyState === WebSocket.OPEN) onOpenAction();
        return;
    }
    
    disconnect(); 

    const SIGNALING_SERVER_URL = getSignalingServerUrl();
    if (!SIGNALING_SERVER_URL) {
      setState(prev => ({...prev, error: "Cannot determine signaling server.", isConnecting: false}));
      return;
    }
    
    try {
        const ws = new WebSocket(SIGNALING_SERVER_URL);
        wsRef.current = ws;
        
        ws.onopen = onOpenAction;
        ws.onclose = () => {
          console.log(`[WebRTC] WebSocket disconnected.`);
        };
        ws.onerror = (err) => {
          console.error('[WebRTC] WebSocket signaling error:', err);
          setState(prev => ({...prev, error: "Signaling server connection failed.", isConnecting: false}));
        };
        ws.onmessage = handleSignalingMessage;
    } catch (error) {
        console.error('[WebRTC] Failed to create WebSocket:', error);
        setState(prev => ({...prev, error: 'Failed to establish signaling connection.', isConnecting: false}));
    }

  }, [disconnect, handleSignalingMessage]);
  
  const createRoom = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current?.send(JSON.stringify({ type: 'create-room' }));
        }
    });
  }, [connectWebSocket]);

  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
        }
    });
  }, [connectWebSocket]);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify({type: 'game-move', payload: move}));
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
