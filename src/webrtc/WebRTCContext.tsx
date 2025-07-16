
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
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

const getSignalingServerUrl = () => {
    if (typeof window === 'undefined') {
      return '';
    }
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Remove the client-side port prefix (e.g., '3000-') from the hostname
    const cleanHostname = window.location.hostname.replace(/^\d+-/, '');
    // Construct the URL to point to the mapped port for our server.js instance
    const wsUrl = `${wsProtocol}//8080-${cleanHostname}`;
    console.log(`[WebRTC] Constructed Signaling Server URL: ${wsUrl}`);
    return wsUrl;
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
    if (wsRef.current) {
        if(wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
            wsRef.current.close();
        }
        wsRef.current = null;
    }
    if (dcRef.current) {
      if (dcRef.current.readyState !== 'closed') {
        dcRef.current.close();
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      if (pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
    }
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
              const move = JSON.parse(event.data);
              onMoveReceivedCallbackRef.current?.(move);
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);

  const processCandidateQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || pc.signalingState !== 'stable') {
      console.log(`[WebRTC] Cannot process candidate queue yet. PC not ready (remoteDescription: ${!!pc?.remoteDescription}, signalingState: ${pc?.signalingState}).`);
      return;
    }
    console.log(`[WebRTC] Processing ${candidateQueueRef.current.length} queued candidates.`);
    for (const candidate of candidateQueueRef.current) {
        try {
            console.log('[WebRTC] [CANDIDATE] Adding candidate from queue.');
            await pc.addIceCandidate(candidate);
        } catch (error) {
            console.error('[WebRTC] Error adding queued ICE candidate:', error);
        }
    }
    candidateQueueRef.current = [];
  }, []);

  const createPeerConnection = useCallback((currentRoomId: string) => {
    if (pcRef.current) {
      console.log('[WebRTC] PeerConnection already exists. Closing old one before creating new.');
      if(pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
    }

    console.log('[WebRTC] Creating new PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`[WebRTC] [SEND] Sending ICE candidate to peer.`);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
            } else {
                console.error(`[WebRTC] onicecandidate event fired, but WebSocket not open. State: ${wsRef.current?.readyState}`);
            }
        } else {
            console.log('[WebRTC] onicecandidate event: All candidates have been gathered.');
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
        const messageStr = event.data;
        if (typeof messageStr !== 'string') {
            console.error('[WebRTC] Received non-string message from signaling server:', messageStr);
            return;
        }
        const data = JSON.parse(messageStr);
        const currentRoomId = state.roomId || data.roomId;
        
        console.log(`[WebRTC] [RECV] Received message type '${data.type}' from signaling server for room '${currentRoomId}'.`);

        if (!pcRef.current && (data.type === 'offer' || data.type === 'peer-joined')) {
            createPeerConnection(currentRoomId);
        }

        const pc = pcRef.current;
        if (!pc) {
            console.error('[WebRTC] PeerConnection not initialized, cannot handle message type', data.type);
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
                console.log('[WebRTC] Peer joined. Creating data channel.');
                const dc = pc.createDataChannel('gameMoves');
                dcRef.current = dc;
                setupDataChannelEvents(dc);

                console.log('[WebRTC] [OFFER] Creating offer...');
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log('[WebRTC] [OFFER] Local description set from offer.');
                
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log('[WebRTC] [SEND] Sending offer to peer.');
                    wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
                }
                break;
            case 'offer':
                pc.ondatachannel = (e) => {
                    console.log('[WebRTC] Received remote data channel.');
                    dcRef.current = e.channel;
                    setupDataChannelEvents(e.channel);
                };

                setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                console.log('[WebRTC] [ANSWER] Setting remote description from offer...');
                await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                console.log('[WebRTC] [ANSWER] Remote description set from offer.');
                
                console.log('[WebRTC] [ANSWER] Creating answer...');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                console.log('[WebRTC] [ANSWER] Local description set from answer.');

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log('[WebRTC] [SEND] Sending answer to peer.');
                    wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
                }
                await processCandidateQueue();
                break;
            case 'answer':
                if (pc.signalingState !== 'stable') {
                    console.log('[WebRTC] [OFFER] Setting remote description from answer...');
                    await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                    console.log('[WebRTC] [OFFER] Remote description set from answer.');
                    await processCandidateQueue();
                }
                break;
            case 'candidate':
                 const candidate = new RTCIceCandidate(data.payload);
                 if (pc.remoteDescription && pc.signalingState === 'stable') {
                     console.log('[WebRTC] [CANDIDATE] Adding received ICE candidate directly.');
                     await pc.addIceCandidate(candidate);
                 } else {
                     console.log('[WebRTC] [CANDIDATE] Remote description not set or not stable. Queuing candidate.');
                     candidateQueueRef.current.push(candidate);
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
        console.error("[WebRTC] Error processing message from signaling server. Message was:", event.data, "Error:", e);
    }
  }, [createPeerConnection, disconnect, setupDataChannelEvents, state.roomId, processCandidateQueue]);
  
  const connectWebSocket = useCallback((onOpenAction: () => void) => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log('[WebRTC] WebSocket already open or connecting. Performing action on open.');
        if (wsRef.current.readyState === WebSocket.OPEN) {
          onOpenAction();
        } else {
          wsRef.current.onopen = () => {
            console.log('[WebRTC] WebSocket connected to signaling server (queued action).');
            onOpenAction();
          };
        }
        return;
    }
    
    disconnect(); 

    const SIGNALING_SERVER_URL = getSignalingServerUrl();
    if (!SIGNALING_SERVER_URL) {
      setState(prev => ({...prev, error: "Cannot determine signaling server.", isConnecting: false}));
      return;
    }

    console.log(`[WebRTC] Attempting to connect to WebSocket signaling server at ${SIGNALING_SERVER_URL}...`);
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('[WebRTC] WebSocket connected to signaling server.');
      onOpenAction();
    };
    ws.onclose = () => {
      console.log(`[WebRTC] WebSocket disconnected.`);
      if (state.isConnected || state.isConnecting) {
        disconnect();
      }
    };
    ws.onerror = (err) => {
      console.error('[WebRTC] WebSocket signaling error:', err);
      setState(prev => ({...prev, error: "Signaling server connection failed.", isConnecting: false}));
    };
    ws.onmessage = handleSignalingMessage;

  }, [disconnect, handleSignalingMessage, state.isConnected, state.isConnecting]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  const createRoom = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('[WebRTC] [SEND] Sending create-room message.');
          wsRef.current?.send(JSON.stringify({ type: 'create-room' }));
        }
    });
  }, [connectWebSocket]);

  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    connectWebSocket(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('[WebRTC] [SEND] Sending join-room message.');
          wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
        }
    });
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
