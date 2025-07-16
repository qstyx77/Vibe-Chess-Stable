
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
  const candidateQueueRef = useRef<RTCIceCandidate[]>([]);


  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);
  
  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnect called. Cleaning up...');
    if (wsRef.current) {
        if(wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.onopen = null;
      dcRef.current.onclose = null;
      dcRef.current.onmessage = null;
      dcRef.current.onerror = null;
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

  const createPeerConnection = useCallback((currentRoomId: string) => {
    if (pcRef.current) {
      console.log('[WebRTC] PeerConnection already exists. Ignoring request.');
      return pcRef.current;
    }

    console.log('[WebRTC] Creating new PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            console.log(`[WebRTC] [SEND] Sending ICE candidate to peer.`, event.candidate);
            wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
        } else if (!event.candidate) {
            console.log('[WebRTC] onicecandidate event: All candidates have been gathered.');
        } else {
             console.log(`[WebRTC] onicecandidate event fired, but WebSocket not open. State: ${wsRef.current?.readyState}`);
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
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false, peerPresent: true, error: null }));
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
        const currentRoomId = data.roomId;
        
        console.log(`[WebRTC] [RECV] Received message type '${data.type}' from signaling server.`);

        if (!pcRef.current && (data.type === 'offer' || data.type === 'peer-joined')) {
            createPeerConnection(currentRoomId);
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
                const pcCreator = pcRef.current;
                if (!pcCreator) return;
                console.log('[WebRTC] Peer joined. Creating data channel.');
                const dc = pcCreator.createDataChannel('gameMoves');
                dcRef.current = dc;
                setupDataChannelEvents(dc);

                console.log('[WebRTC] [OFFER] Creating offer...');
                const offer = await pcCreator.createOffer();
                await pcCreator.setLocalDescription(offer);
                console.log('[WebRTC] [OFFER] Local description set from offer.');
                
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log('[WebRTC] [SEND] Sending offer to peer.');
                    wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
                }
                break;
            case 'offer':
                const pcJoiner = pcRef.current;
                if (!pcJoiner) return;
                pcJoiner.ondatachannel = (e) => {
                    console.log('[WebRTC] Received remote data channel.');
                    dcRef.current = e.channel;
                    setupDataChannelEvents(e.channel);
                };

                setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                console.log('[WebRTC] [ANSWER] Setting remote description from offer...');
                await pcJoiner.setRemoteDescription(new RTCSessionDescription(data.payload));
                console.log('[WebRTC] [ANSWER] Remote description set from offer.');
                
                candidateQueueRef.current.forEach(candidate => {
                    console.log("[WebRTC] Processing queued ICE candidate.");
                    pcJoiner.addIceCandidate(candidate);
                });
                candidateQueueRef.current = [];

                console.log('[WebRTC] [ANSWER] Creating answer...');
                const answer = await pcJoiner.createAnswer();
                await pcJoiner.setLocalDescription(answer);
                console.log('[WebRTC] [ANSWER] Local description set from answer.');

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    console.log('[WebRTC] [SEND] Sending answer to peer.');
                    wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
                }
                break;
            case 'answer':
                if (pcRef.current && pcRef.current.signalingState !== 'stable') {
                    console.log('[WebRTC] [OFFER] Setting remote description from answer...');
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
                    console.log('[WebRTC] [OFFER] Remote description set from answer.');
                    candidateQueueRef.current.forEach(candidate => {
                         console.log("[WebRTC] Processing queued ICE candidate.");
                         pcRef.current?.addIceCandidate(candidate);
                    });
                    candidateQueueRef.current = [];
                }
                break;
            case 'candidate':
                if (pcRef.current) {
                    if (pcRef.current.remoteDescription) {
                        console.log('[WebRTC] [CANDIDATE] Adding received ICE candidate directly.');
                        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.payload));
                    } else {
                        console.log('[WebRTC] [CANDIDATE] Remote description not set. Queuing candidate.');
                        candidateQueueRef.current.push(new RTCIceCandidate(data.payload));
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
        console.error("[WebRTC] Error processing message from signaling server. Message was:", event.data, "Error:", e);
    }
  }, [createPeerConnection, disconnect, setupDataChannelEvents]);
  
  const connectWebSocket = useCallback((onOpenAction: () => void) => {
    disconnect(); 

    const SIGNALING_SERVER_URL = getSignalingServerUrl();
    if (!SIGNALING_SERVER_URL) {
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
    ws.onclose = () => {
      console.log(`[WebRTC] WebSocket disconnected.`);
      // The disconnect() call handles state cleanup.
    };
    ws.onerror = (err) => {
      console.error('[WebRTC] WebSocket signaling error:', err);
      setState(prev => ({...prev, error: "Signaling server connection failed.", isConnecting: false}));
    };
    ws.onmessage = handleSignalingMessage;

  }, [disconnect, handleSignalingMessage]);

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
          createPeerConnection(''); // Room ID will be set by server
          wsRef.current?.send(JSON.stringify({ type: 'create-room' }));
        }
    });
  }, [connectWebSocket, createPeerConnection]);

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
