
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
      return ''; // Will not be used on server
    }
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const webHost = window.location.host; 
    const signalingHost = webHost.replace(/^[0-9]+-/, '8082-');
    return `${wsProtocol}://${signalingHost}/`;
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
  const iceCandidateQueueRef = useRef<RTCIceCandidate[]>([]);
  const onOpenQueueRef = useRef<(() => void)[]>([]);

  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnect called. Cleaning up...');
    if (dcRef.current) {
      dcRef.current.onopen = null;
      dcRef.current.onclose = null;
      dcRef.current.onerror = null;
      dcRef.current.onmessage = null;
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    iceCandidateQueueRef.current = [];
    onOpenQueueRef.current = [];
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
          console.log('[WebRTC] Data channel is open');
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      };
      channel.onclose = () => {
          console.log('[WebRTC] Data channel is closed');
          disconnect();
      };
      channel.onerror = (err) => console.error('[WebRTC] Data channel error:', err);
      channel.onmessage = (event) => {
          try {
              const move = JSON.parse(event.data);
              onMoveReceivedCallbackRef.current?.(move);
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);

  const processIceCandidateQueue = useCallback(async () => {
      if (!pcRef.current || !pcRef.current.remoteDescription) {
          console.log(`[WebRTC] Cannot process ICE queue yet. Peer connection remote description not set. Queue size: ${iceCandidateQueueRef.current.length}`);
          return;
      }
      console.log(`[WebRTC] Processing ${iceCandidateQueueRef.current.length} queued ICE candidates.`);
      while (iceCandidateQueueRef.current.length > 0) {
          const candidate = iceCandidateQueueRef.current.shift();
          if (candidate) {
              try {
                  await pcRef.current.addIceCandidate(candidate);
                  console.log('[WebRTC] Successfully added queued ICE candidate.');
              } catch (e) {
                  console.error("[WebRTC] Error adding queued ICE candidate:", e);
              }
          }
      }
  }, []);
  
  const createPeerConnection = useCallback((currentRoomId: string) => {
    console.log('[WebRTC] Creating new PeerConnection.');
    if (pcRef.current) {
        pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebRTC] Sending ICE candidate to peer.');
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
      }
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pcRef.current?.connectionState;
      console.log(`[WebRTC] Connection state changed: ${connectionState}`);
      if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        setState(prev => ({ ...prev, error: 'Opponent has disconnected.'}));
        disconnect();
      } else if (connectionState === 'connected') {
        setState(prev => ({...prev, isConnected: true, isConnecting: false, error: null }));
      }
    };
    
    return pc;
  }, [disconnect]);

  const handleSignalingMessage = useCallback(async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const currentRoomId = data.roomId;
        
        console.log(`[WebRTC] Received message from server: ${data.type}`);
        
        if (!currentRoomId && !['room-created', 'error'].includes(data.type)) {
            console.error('[WebRTC] Message without roomId received:', data);
            return;
        }

        switch (data.type) {
          case 'room-created':
            setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, isConnecting: false, error: null }));
            break;
          case 'room-joined': 
            setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, error: null, isConnecting: false }));
            break;
          case 'peer-joined':
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
            const pc_creator = createPeerConnection(currentRoomId);
            const dc = pc_creator.createDataChannel('gameMoves');
            dcRef.current = dc;
            setupDataChannelEvents(dc);
            const offer = await pc_creator.createOffer();
            await pc_creator.setLocalDescription(offer);
            if(wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
            }
            break;
          case 'offer':
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
            const pc_joiner = createPeerConnection(currentRoomId);
            pc_joiner.ondatachannel = (e) => {
              dcRef.current = e.channel;
              setupDataChannelEvents(e.channel);
            };
            await pc_joiner.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await pc_joiner.createAnswer();
            await pc_joiner.setLocalDescription(answer);
            if(wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
            }
            await processIceCandidateQueue();
            break;
          case 'answer':
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
              await processIceCandidateQueue();
            }
            break;
          case 'candidate':
            if (pcRef.current) {
                const candidate = new RTCIceCandidate(data.payload);
                if (pcRef.current.remoteDescription) {
                    await pcRef.current.addIceCandidate(candidate);
                } else {
                    iceCandidateQueueRef.current.push(candidate);
                }
            }
            break;
          case 'peer-disconnected':
            setState(prev => ({ ...prev, error: "Opponent has disconnected."}));
            disconnect();
            break;
          case 'error':
            setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
            break;
        }
      } catch (e) {
        console.error("[WebRTC] Error processing message from signaling server", e);
      }
  }, [createPeerConnection, disconnect, processIceCandidateQueue, setupDataChannelEvents]);
  
  const connectWebSocket = useCallback((onOpenAction: () => void) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        onOpenAction();
        return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        onOpenQueueRef.current.push(onOpenAction);
        return;
    }

    const SIGNALING_SERVER_URL = getSignalingServerUrl();
    if (!SIGNALING_SERVER_URL) {
      console.error("[WebRTC] Signaling server URL not available.");
      setState(prev => ({...prev, error: "Cannot determine signaling server.", isConnecting: false}));
      return;
    }

    console.log('[WebRTC] Attempting to connect to WebSocket signaling server...');
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;
    onOpenQueueRef.current.push(onOpenAction);

    ws.onopen = () => {
        console.log('[WebRTC] WebSocket connected to signaling server.');
        while(onOpenQueueRef.current.length > 0) {
            onOpenQueueRef.current.shift()?.();
        }
    };
    ws.onclose = () => {
        console.log('[WebRTC] WebSocket disconnected.');
        if (state.isConnected || state.isConnecting || state.roomId) {
            disconnect();
        }
    };
    ws.onerror = (err) => console.error('[WebRTC] WebSocket signaling error:', err);
    ws.onmessage = handleSignalingMessage;

  }, [disconnect, handleSignalingMessage, state.isConnected, state.isConnecting, state.roomId]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  const createRoom = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.error("[WebRTC Client] Cannot create room, WebSocket not open.");
          setState(prev => ({...prev, isConnecting: false, error: "Connection failed."}));
          return;
        }
        wsRef.current.send(JSON.stringify({ type: 'create-room' }));
    });
  }, [connectWebSocket]);

  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.error("[WebRTC Client] Cannot join room, WebSocket not open.");
          setState(prev => ({...prev, isConnecting: false, error: "Connection failed."}));
          return;
        }
        wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
    });
  }, [connectWebSocket]);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(move));
    } else {
      console.error('[WebRTC] sendMove failed: Data channel not open.');
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
