
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
  
  console.log(`WebRTC: Determined SIGNALING_SERVER_URL: ${determinedSignalingServerUrl}`);
}

const SIGNALING_SERVER_URL = determinedSignalingServerUrl;

if (!SIGNALING_SERVER_URL && typeof window !== 'undefined') {
  console.warn(
    "WebRTC: SIGNALING_SERVER_URL could not be determined. This might happen during SSR or if window.location is not available."
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
    console.log("WebRTC: Peer connection cleaned up.");
  }, []); 

  const disconnect = useCallback(() => {
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

    console.log("WebRTC: Establishing a new WebSocket connection.");
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    const setupDataChannelEvents = (channel: RTCDataChannel) => {
        channel.onopen = () => {
            console.log('WebRTC: Data channel is open');
            setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        };
        channel.onclose = () => {
            console.log('WebRTC: Data channel is closed');
            setState(prev => ({ ...prev, isConnected: false, isConnecting: false, peerPresent: false, error: "Opponent disconnected."}));
            cleanupConnection();
        };
        channel.onerror = (errorEvent) => {
            const error = (errorEvent as RTCErrorEvent).error;
            console.error('WebRTC: Data channel error:', error);
            setState(prev => ({ ...prev, error: `Data channel error: ${error?.message || 'Unknown error'}` }));
        };
        channel.onmessage = (event) => {
            try {
                const move = JSON.parse(event.data);
                onMoveReceivedCallbackRef.current?.(move);
            } catch (e) {
                console.error('WebRTC: Error parsing received move:', e);
            }
        };
    };

    const processIceCandidateQueue = async () => {
        if (!pcRef.current || pcRef.current.signalingState === 'closed') return;
        while (iceCandidateQueueRef.current.length > 0) {
            const candidate = iceCandidateQueueRef.current.shift();
            if (candidate) {
                try {
                    console.log("WebRTC: Processing a queued ICE candidate...");
                    await pcRef.current.addIceCandidate(candidate);
                    console.log("WebRTC: Successfully added queued ICE candidate.");
                } catch (e) {
                    console.error("WebRTC: Error adding queued ICE candidate:", e);
                }
            }
        }
    };
    
    const handleIncomingCandidate = async (candidatePayload: RTCIceCandidateInit) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription || pc.signalingState === 'closed') {
            console.log("WebRTC: PeerConnection not ready or remote description not set, QUEUEING candidate.");
            iceCandidateQueueRef.current.push(new RTCIceCandidate(candidatePayload));
            return;
        }

        try {
            console.log("WebRTC: Adding received ICE candidate directly...");
            await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
        } catch (e) {
            console.error('WebRTC: Error adding received ICE candidate:', e);
        }
    };

    const createPeerConnection = (currentRoomId: string) => {
        if (pcRef.current) {
            console.warn("WebRTC: Existing PeerConnection found. Cleaning up before creating a new one.");
            cleanupConnection();
        }
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        console.log("WebRTC: PeerConnection created.");
    
        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                console.log("WebRTC: Sending ICE candidate.");
                wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
            }
        };

        pc.onconnectionstatechange = () => {
            if (!pc) return;
            console.log(`WebRTC: Connection state changed to: ${pc.connectionState}`);
            if (pc.connectionState === 'failed') {
                setState(prev => ({ ...prev, error: 'WebRTC connection failed. Please try again.', isConnecting: false, isConnected: false }));
                disconnect();
            }
            if (pc.connectionState === 'disconnected') {
                setState(prev => ({ ...prev, error: 'Opponent disconnected.', isConnecting: false, isConnected: false, peerPresent: false }));
                cleanupConnection();
            }
        };

        return pc;
    };


    ws.onopen = () => console.log('WebRTC: Connected to signaling server');
    ws.onclose = () => {
      console.log('WebRTC: Disconnected from signaling server');
      disconnect(); 
    };
    ws.onerror = (err) => console.error('WebRTC: Signaling error:', err);
    
    ws.onmessage = async (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data as string);
            console.log('WebRTC: Message from signaling server:', data.type);
            const currentRoomId = data.roomId || state.roomId;

            switch (data.type) {
                case 'room-created':
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, error: null, isConnecting: false }));
                    break;

                case 'room-joined': // For joiner
                    setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false, error: null }));
                    break;
                
                case 'peer-joined': // For creator
                    setState(prev => ({ ...prev, peerPresent: true }));
                    if (!currentRoomId) return;
                    const pc_creator = createPeerConnection(currentRoomId);
                    const dc = pc_creator.createDataChannel('gameMoves');
                    dcRef.current = dc;
                    setupDataChannelEvents(dc);

                    console.log("WebRTC Creator: Creating offer...");
                    const offer = await pc_creator.createOffer();
                    await pc_creator.setLocalDescription(offer);
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                       wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
                       console.log("WebRTC Creator: Offer sent.");
                    }
                    break;
                
                case 'offer': // For joiner
                    setState(prev => ({ ...prev, peerPresent: true }));
                    if (!currentRoomId) return;
                    const pc_joiner = createPeerConnection(currentRoomId);
                    pc_joiner.ondatachannel = (e) => {
                      console.log('WebRTC Joiner: Data channel received.');
                      dcRef.current = e.channel;
                      setupDataChannelEvents(e.channel);
                    };
                    
                    console.log("WebRTC Joiner: Setting remote description from offer...");
                    await pc_joiner.setRemoteDescription(new RTCSessionDescription(data.payload));
                    await processIceCandidateQueue();
                    
                    console.log("WebRTC Joiner: Creating answer...");
                    const answer = await pc_joiner.createAnswer();
                    await pc_joiner.setLocalDescription(answer);

                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
                        console.log("WebRTC Joiner: Answer sent.");
                    }
                    break;
                
                case 'answer': // For creator
                    if (pcRef.current) {
                      console.log("WebRTC Creator: Received answer. Setting remote description...");
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
            console.error("WebRTC: Error processing message from signaling server", e);
        }
    };

    return () => {
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.close();
        }
        cleanupConnection();
    }
  }, []); // Empty dependency array ensures this runs only once.


  const createRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
      wsRef.current.send(JSON.stringify({ type: 'create-room' }));
    } else {
      setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);


  const joinRoom = useCallback((roomIdToJoin: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
      wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
    } else {
       setState(prev => ({ ...prev, error: "Not connected to signaling server." }));
    }
  }, []);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(move));
    } else {
      console.error('WebRTC: Data channel not open. Cannot send move.');
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
