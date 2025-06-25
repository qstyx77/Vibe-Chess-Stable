
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
  
  console.log(`[WebRTC Client] Determined SIGNALING_SERVER_URL: ${determinedSignalingServerUrl}`);
}

const SIGNALING_SERVER_URL = determinedSignalingServerUrl;

if (!SIGNALING_SERVER_URL && typeof window !== 'undefined') {
  console.warn(
    "[WebRTC Client] SIGNALING_SERVER_URL could not be determined. This might happen during SSR or if window.location is not available."
  );
}


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


  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const cleanupConnection = useCallback(() => {
    console.log("[WebRTC Client] Cleanup: Closing connections.");
    if (dcRef.current) {
      dcRef.current.onopen = null;
      dcRef.current.onclose = null;
      dcRef.current.onerror = null;
      dcRef.current.onmessage = null;
      if (dcRef.current.readyState !== 'closed') {
        dcRef.current.close();
      }
      dcRef.current = null;
      console.log("[WebRTC Client] Cleanup: DataChannel closed.");
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.onconnectionstatechange = null;
      if (pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
      console.log("[WebRTC Client] Cleanup: PeerConnection closed.");
    }
    iceCandidateQueueRef.current = [];
    console.log("[WebRTC Client] Cleanup: ICE candidate queue cleared.");
  }, []); 

  const disconnect = useCallback(() => {
    console.log("[WebRTC Client] Disconnect called.");
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
     console.log("[WebRTC Client] Disconnect: State reset.");
  }, [cleanupConnection]);

  useEffect(() => {
    if (wsRef.current || !SIGNALING_SERVER_URL) return;

    console.log("[WebRTC Client] useEffect: Initializing WebSocket connection.");
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    const setupDataChannelEvents = (channel: RTCDataChannel) => {
        console.log(`[WebRTC Client] setupDataChannelEvents for channel: ${channel.label}`);
        channel.onopen = () => {
            console.log('[WebRTC Client] Data channel is OPEN');
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        };
        channel.onclose = () => {
            console.log('[WebRTC Client] Data channel is CLOSED');
            setState(prev => ({ ...prev, isConnected: false, isConnecting: false, peerPresent: false, error: "Opponent disconnected."}));
            cleanupConnection();
        };
        channel.onerror = (errorEvent) => {
            const error = (errorEvent as RTCErrorEvent).error;
            console.error('[WebRTC Client] Data channel error:', error);
            setState(prev => ({ ...prev, error: `Data channel error: ${error?.message || 'Unknown error'}` }));
        };
        channel.onmessage = (event) => {
            try {
                console.log(`[WebRTC Client] Data channel received message.`);
                const move = JSON.parse(event.data);
                onMoveReceivedCallbackRef.current?.(move);
            } catch (e) {
                console.error('[WebRTC Client] Error parsing received move:', e);
            }
        };
    };

    const processIceCandidateQueue = async () => {
        if (!pcRef.current || pcRef.current.signalingState === 'closed') return;
        if (iceCandidateQueueRef.current.length > 0) {
            console.log(`[WebRTC Client] Processing ${iceCandidateQueueRef.current.length} queued ICE candidates.`);
        }
        while (iceCandidateQueueRef.current.length > 0) {
            const candidate = iceCandidateQueueRef.current.shift();
            if (candidate) {
                try {
                    await pcRef.current.addIceCandidate(candidate);
                    console.log("[WebRTC Client] Successfully added queued ICE candidate.");
                } catch (e) {
                    console.error("[WebRTC Client] Error adding queued ICE candidate:", e);
                }
            }
        }
    };
    
    const handleIncomingCandidate = async (candidatePayload: RTCIceCandidateInit) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription || pc.signalingState === 'closed') {
            console.log("[WebRTC Client] PeerConnection not ready or remote description not set. QUEUEING candidate.");
            iceCandidateQueueRef.current.push(new RTCIceCandidate(candidatePayload));
            return;
        }

        try {
            console.log("[WebRTC Client] Adding received ICE candidate directly.");
            await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
            console.log("[WebRTC Client] Successfully added received ICE candidate.");
        } catch (e) {
            console.error('[WebRTC Client] Error adding received ICE candidate:', e);
        }
    };

    const createPeerConnection = (currentRoomId: string) => {
        console.log(`[WebRTC Client] Creating new PeerConnection for room ${currentRoomId}.`);
        if (pcRef.current) {
            console.warn("[WebRTC Client] Existing PeerConnection found. Cleaning up before creating a new one.");
            cleanupConnection();
        }
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
    
        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                console.log("[WebRTC Client] onicecandidate: Found a candidate, sending to server.");
                wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
            } else if (!event.candidate) {
                 console.log("[WebRTC Client] onicecandidate: All candidates gathered.");
            }
        };

        pc.onconnectionstatechange = () => {
            if (!pc) return;
            console.log(`[WebRTC Client] onconnectionstatechange: Connection state changed to: ${pc.connectionState}`);
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


    ws.onopen = () => console.log('[WebRTC Client] WebSocket connected to signaling server.');
    ws.onclose = () => {
      console.log('[WebRTC Client] WebSocket disconnected from signaling server.');
      disconnect(); 
    };
    ws.onerror = (err) => console.error('[WebRTC Client] WebSocket signaling error:', err);
    
    ws.onmessage = async (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data as string);
            console.log(`[WebRTC Client] Received message from server. Type: ${data.type}`);
            const currentRoomId = data.roomId || state.roomId;

            switch (data.type) {
                case 'room-created':
                    console.log(`[WebRTC Client] Event: room-created. Room ID: ${data.roomId}`);
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, error: null, isConnecting: false }));
                    break;

                case 'room-joined': // For joiner
                     console.log(`[WebRTC Client] Event: room-joined. Room ID: ${data.roomId}`);
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, error: null }));
                    break;
                
                case 'peer-joined': // For creator
                    console.log(`[WebRTC Client] Event: peer-joined. Room ID: ${currentRoomId}`);
                    setState(prev => ({ ...prev, peerPresent: true }));
                    if (!currentRoomId) return;
                    const pc_creator = createPeerConnection(currentRoomId);
                    const dc = pc_creator.createDataChannel('gameMoves');
                    dcRef.current = dc;
                    setupDataChannelEvents(dc);

                    console.log("[WebRTC Client] Creator: Creating offer...");
                    const offer = await pc_creator.createOffer();
                    await pc_creator.setLocalDescription(offer);
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                       wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
                       console.log("[WebRTC Client] Creator: Offer sent.");
                    }
                    break;
                
                case 'offer': // For joiner
                    console.log(`[WebRTC Client] Event: offer. Room ID: ${currentRoomId}`);
                    setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
                    if (!currentRoomId) return;
                    const pc_joiner = createPeerConnection(currentRoomId);
                    pc_joiner.ondatachannel = (e) => {
                      console.log('[WebRTC Client] Joiner: Data channel received from creator.');
                      dcRef.current = e.channel;
                      setupDataChannelEvents(e.channel);
                    };
                    
                    console.log("[WebRTC Client] Joiner: Setting remote description from offer.");
                    await pc_joiner.setRemoteDescription(new RTCSessionDescription(data.payload));
                    await processIceCandidateQueue();
                    
                    console.log("[WebRTC Client] Joiner: Creating answer.");
                    const answer = await pc_joiner.createAnswer();
                    await pc_joiner.setLocalDescription(answer);

                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
                        console.log("[WebRTC Client] Joiner: Answer sent.");
                    }
                    break;
                
                case 'answer': // For creator
                     console.log(`[WebRTC Client] Event: answer. Room ID: ${currentRoomId}`);
                    if (pcRef.current) {
                      console.log("[WebRTC Client] Creator: Received answer. Setting remote description.");
                      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
                      await processIceCandidateQueue();
                    }
                    break;
                
                case 'candidate':
                    console.log(`[WebRTC Client] Event: candidate. Room ID: ${currentRoomId}`);
                    await handleIncomingCandidate(data.payload);
                    break;
                
                case 'peer-disconnected':
                     console.log(`[WebRTC Client] Event: peer-disconnected. Room ID: ${currentRoomId}`);
                    setState(prev => ({ ...prev, error: "Opponent disconnected.", isConnected: false, isConnecting: false, peerPresent: false }));
                    cleanupConnection();
                    break;
                case 'error':
                     console.error(`[WebRTC Client] Event: error. Message: ${data.message}`);
                    setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
                    break;
            }
        } catch (e) {
            console.error("[WebRTC Client] Error processing message from signaling server", e);
        }
    };

    return () => {
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        cleanupConnection();
    }
  }, [disconnect, cleanupConnection, state.roomId]);


  const createRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WebRTC Client] createRoom: Sending 'create-room' request to server.");
      setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
      wsRef.current.send(JSON.stringify({ type: 'create-room' }));
    } else {
      console.error("[WebRTC Client] createRoom: Cannot create room, not connected to signaling server.");
      setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);


  const joinRoom = useCallback((roomIdToJoin: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
       console.log(`[WebRTC Client] joinRoom: Sending 'join-room' request for room ${roomIdToJoin}.`);
      setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
      wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
    } else {
       console.error(`[WebRTC Client] joinRoom: Cannot join room ${roomIdToJoin}, not connected to signaling server.`);
       setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
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
