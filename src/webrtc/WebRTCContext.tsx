
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
      if (dcRef.current.readyState !== 'closed') {
        dcRef.current.close();
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      if (pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
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
              const move = JSON.parse(event.data);
              console.log('[WebRTC] Received move via data channel:', move);
              onMoveReceivedCallbackRef.current?.(move);
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);
  
  const createPeerConnection = useCallback((currentRoomId: string) => {
    console.log('[WebRTC] Creating new PeerConnection.');
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebRTC] Sending ICE candidate to peer.');
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
      } else if (!event.candidate) {
        console.log('[WebRTC] onicecandidate event: All candidates have been sent.');
      } else {
        console.error('[WebRTC] onicecandidate event without candidate or WS not open.');
      }
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      console.log(`[WebRTC] Connection state changed: ${connectionState}`);
      if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        setState(prev => ({ ...prev, error: 'Opponent has disconnected.'}));
        disconnect();
      }
       if (connectionState === 'connected') {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
      }
    };
    
    return pc;
  }, [disconnect]);

  const handleSignalingMessage = useCallback(async (event: MessageEvent) => {
    let messageData;
    if (event.data instanceof Blob) {
      try {
        messageData = await event.data.text();
      } catch(e) {
        console.error('[WebRTC] Could not read blob data as text.', e);
        return;
      }
    } else {
      messageData = event.data;
    }
    
    try {
      const data = JSON.parse(messageData);
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
          pcRef.current = createPeerConnection(currentRoomId);
          const dc = pcRef.current.createDataChannel('gameMoves');
          dcRef.current = dc;
          setupDataChannelEvents(dc);

          console.log('[WebRTC] Creating offer...');
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          console.log('[WebRTC] Local description set from offer.');

          if(wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[WebRTC] Sending offer to peer.');
            wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
          }
          break;
        case 'offer':
          setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
          pcRef.current = createPeerConnection(currentRoomId);
          pcRef.current.ondatachannel = (e) => {
            console.log('[WebRTC] ondatachannel event triggered.');
            dcRef.current = e.channel;
            setupDataChannelEvents(e.channel);
          };

          console.log('[WebRTC] Setting remote description from offer...');
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
          console.log('[WebRTC] Remote description set from offer.');
          
          console.log('[WebRTC] Creating answer...');
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          console.log('[WebRTC] Local description set from answer.');

          if(wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[WebRTC] Sending answer to peer.');
            wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
          }
          break;
        case 'answer':
          if (pcRef.current && pcRef.current.signalingState !== 'stable') {
            console.log('[WebRTC] Setting remote description from answer...');
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
            console.log('[WebRTC] Remote description set from answer.');
          }
          break;
        case 'candidate':
          if (pcRef.current && pcRef.current.remoteDescription) {
            console.log('[WebRTC] Adding received ICE candidate.');
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.payload));
          } else {
             console.log('[WebRTC] Received candidate but peer connection is not ready. This should be handled by a queue if it becomes a problem.');
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
      console.error("Original message data:", messageData);
    }
  }, [createPeerConnection, disconnect, setupDataChannelEvents]);
  
  const connectWebSocket = useCallback((onOpenAction: () => void) => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      console.log('[WebRTC] WebSocket already open or connecting. Using existing connection.');
      if (wsRef.current.readyState === WebSocket.OPEN) {
        onOpenAction();
      }
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
    
    ws.onopen = () => {
      console.log('[WebRTC] WebSocket connected to signaling server.');
      onOpenAction();
    };
    ws.onclose = (event) => {
      console.log(`[WebRTC] WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
      if (state.isConnected || state.isConnecting || state.roomId) {
        disconnect();
      }
    };
    ws.onerror = (err) => {
      console.error('[WebRTC] WebSocket signaling error:', err);
      setState(prev => ({...prev, error: "Signaling server connection failed.", isConnecting: false}));
    };
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
