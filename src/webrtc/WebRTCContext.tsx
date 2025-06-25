
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { PlayerColor } from '@/types'; // Assuming localPlayerColor will use this

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
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

let determinedSignalingServerUrl = '';
if (typeof window !== 'undefined') {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const webHost = window.location.host; 

  const signalingHost = webHost.replace(/^[0-9]+-/, '8082-');

  determinedSignalingServerUrl = `${wsProtocol}://${signalingHost}/`;
}


const SIGNALING_SERVER_URL = determinedSignalingServerUrl;

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
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    roomIdRef.current = state.roomId;
  }, [state.roomId]);


  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const cleanupConnection = useCallback(() => {
    console.log('[WebRTC Client] Cleanup: Closing connections.');
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
      pcRef.current.ondatachannel = null;
      pcRef.current.onconnectionstatechange = null;
      if (pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
    }
    iceCandidateQueueRef.current = [];
  }, []); 

  const disconnect = useCallback(() => {
    console.log('[WebRTC Client] Disconnect called.');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    cleanupConnection();
    setState({ 
      isConnected: false,
      isConnecting: false,
      peerPresent: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
  }, [cleanupConnection]);

  useEffect(() => {
    if (wsRef.current || !SIGNALING_SERVER_URL) return;
    console.log('[WebRTC Client] Initializing WebSocket connection...');
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    const setupDataChannelEvents = (channel: RTCDataChannel) => {
        console.log('[WebRTC Client] Setting up data channel events.');
        channel.onopen = () => {
            console.log('[WebRTC Client] Data channel OPEN.');
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        };
        channel.onclose = () => {
            console.log('[WebRTC Client] Data channel CLOSED.');
            setState(prev => ({ ...prev, isConnected: false, isConnecting: false, peerPresent: false, error: "Opponent disconnected."}));
            cleanupConnection();
        };
        channel.onerror = (errorEvent) => {
            const error = (errorEvent as RTCErrorEvent).error;
            console.error('[WebRTC Client] Data channel error:', error);
            setState(prev => ({ ...prev, error: `Data channel error: ${error?.message || 'Unknown error'}` }));
        };
        channel.onmessage = (event) => {
            console.log('[WebRTC Client] Received message on data channel:', event.data);
            try {
                const move = JSON.parse(event.data);
                onMoveReceivedCallbackRef.current?.(move);
            } catch (e) {
                console.error('[WebRTC Client] Error parsing received move:', e);
            }
        };
    };

    const processIceCandidateQueue = async () => {
        if (!pcRef.current || pcRef.current.signalingState === 'closed' || !pcRef.current.remoteDescription) {
            console.log('[WebRTC Client] Cannot process ICE queue yet. PC not ready.');
            return;
        };
        console.log(`[WebRTC Client] Processing ${iceCandidateQueueRef.current.length} queued ICE candidates.`);
        while (iceCandidateQueueRef.current.length > 0) {
            const candidate = iceCandidateQueueRef.current.shift();
            if (candidate) {
                try {
                    await pcRef.current.addIceCandidate(candidate);
                    console.log('[WebRTC Client] Added queued ICE candidate.');
                } catch (e) {
                    console.error("[WebRTC Client] Error adding queued ICE candidate:", e);
                }
            }
        }
    };
    
    const handleIncomingCandidate = async (candidatePayload: RTCIceCandidateInit) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription || pc.signalingState === 'closed') {
            console.log('[WebRTC Client] Queuing received ICE candidate.');
            iceCandidateQueueRef.current.push(new RTCIceCandidate(candidatePayload));
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
            console.log('[WebRTC Client] Added received ICE candidate.');
        } catch (e) {
            console.error('[WebRTC Client] Error adding received ICE candidate:', e);
        }
    };

    const createPeerConnection = () => {
        console.log('[WebRTC Client] Creating new RTCPeerConnection.');
        if (pcRef.current) {
            console.log('[WebRTC Client] Cleaning up old peer connection first.');
            cleanupConnection();
        }
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
    
        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                console.log('[WebRTC Client] Sending ICE candidate to server.');
                wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: roomIdRef.current }));
            }
        };

        pc.onconnectionstatechange = () => {
            if (!pc) return;
            console.log(`[WebRTC Client] Connection state changed: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                setState(prev => ({ ...prev, error: 'WebRTC connection failed. Please try again.', isConnecting: false, isConnected: false }));
                disconnect();
            }
            if (pc.connectionState === 'disconnected') {
                setState(prev => ({ ...prev, error: 'Opponent disconnected.', isConnecting: false, isConnected: false, peerPresent: false }));
                cleanupConnection();
            }
            if (pc.connectionState === 'connected') {
                 setState(prev => ({...prev, isConnected: true, isConnecting: false }));
            }
        };

        return pc;
    };


    ws.onopen = () => { console.log('[WebRTC Client] WebSocket connected to signaling server.'); };
    ws.onclose = () => {
      console.log('[WebRTC Client] WebSocket disconnected.');
      disconnect(); 
    };
    ws.onerror = (err) => console.error('[WebRTC Client] WebSocket signaling error:', err);
    
    ws.onmessage = async (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data as string);
            console.log('[WebRTC Client] Received message from signaling server:', data);

            switch (data.type) {
                case 'room-created':
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, error: null, isConnecting: false }));
                    break;

                case 'room-joined': // For joiner
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, error: null }));
                    break;
                
                case 'peer-joined': // For creator
                    setState(prev => ({ ...prev, peerPresent: true }));
                    if (!roomIdRef.current) return;
                    console.log('[WebRTC Client] Peer joined. Creator is creating peer connection and offer.');
                    const pc_creator = createPeerConnection();
                    const dc = pc_creator.createDataChannel('gameMoves');
                    dcRef.current = dc;
                    setupDataChannelEvents(dc);

                    const offer = await pc_creator.createOffer();
                    await pc_creator.setLocalDescription(offer);
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                       wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: roomIdRef.current }));
                    }
                    break;
                
                case 'offer': // For joiner
                    setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                    if (!roomIdRef.current) return;
                    console.log('[WebRTC Client] Received offer. Joiner creating peer connection and answer.');
                    const pc_joiner = createPeerConnection();
                    pc_joiner.ondatachannel = (e) => {
                      console.log('[WebRTC Client] Joiner received data channel from creator.');
                      dcRef.current = e.channel;
                      setupDataChannelEvents(e.channel);
                    };
                    
                    await pc_joiner.setRemoteDescription(new RTCSessionDescription(data.payload));
                    await processIceCandidateQueue();
                    
                    const answer = await pc_joiner.createAnswer();
                    await pc_joiner.setLocalDescription(answer);

                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: roomIdRef.current }));
                    }
                    break;
                
                case 'answer': // For creator
                    if (pcRef.current) {
                      console.log('[WebRTC Client] Received answer. Setting remote description.');
                      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
                      await processIceCandidateQueue();
                    }
                    break;
                
                case 'candidate':
                    await handleIncomingCandidate(data.payload);
                    break;
                
                case 'peer-disconnected':
                    setState(prev => ({ ...prev, error: "Opponent disconnected.", isConnected: false, isConnecting: false, peerPresent: false }));
                    cleanupConnection();
                    break;
                case 'error':
                    setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
                    break;
            }
        } catch (e) {
            console.error("[WebRTC Client] Error processing message from signaling server", e);
        }
    };

    return () => {
        console.log('[WebRTC Client] Cleanup effect running. Closing WebSocket.');
        if (wsRef.current) {
            wsRef.current.onmessage = null;
            wsRef.current.onclose = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        cleanupConnection();
    }
  }, [disconnect, cleanupConnection]);


  const createRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebRTC Client] Sending create-room request.');
      setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
      wsRef.current.send(JSON.stringify({ type: 'create-room' }));
    } else {
      console.error('[WebRTC Client] Cannot create room, WebSocket not open.');
      setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);


  const joinRoom = useCallback((roomIdToJoin: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log(`[WebRTC Client] Sending join-room request for room: ${roomIdToJoin}`);
      setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
      wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
    } else {
       console.error('[WebRTC Client] Cannot join room, WebSocket not open.');
       setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      console.log('[WebRTC Client] Sending move:', move);
      dc.send(JSON.stringify(move));
    } else {
      console.error('[WebRTC Client] sendMove: Data channel not open. Cannot send move.');
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
