
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

type GameMove = any; 

interface WebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  roomId: string | null;
  error: string | null;
  isCreator: boolean; // To distinguish between room creator and joiner
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

let determinedSignalingServerUrl = '';
if (typeof window !== 'undefined') {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const webHost = window.location.host; 

  // In environments like Firebase Studio, ports are often exposed as prefixed hostnames.
  // We'll replace the main app's port prefix (e.g., '9000-') with the signaling server's port ('8082-').
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

  const cleanupConnection = useCallback((notifyServer = false) => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueueRef.current = [];
    console.log("WebRTC: Peer connection cleaned up.");

    // Only close websocket if we intend to fully disconnect.
    if (notifyServer && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []); 

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('WebRTC: Data channel is open');
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
    };
    channel.onclose = () => {
      console.log('WebRTC: Data channel is closed');
       setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: "Data channel closed."}));
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
  }, [cleanupConnection]);

   const processIceCandidateQueue = useCallback(async () => {
    if (!pcRef.current) return;
    while (iceCandidateQueueRef.current.length > 0) {
      const candidate = iceCandidateQueueRef.current.shift();
      if (candidate) {
        try {
          await pcRef.current.addIceCandidate(candidate);
          console.log("WebRTC: Successfully added queued ICE candidate.");
        } catch (e) {
          console.error("WebRTC: Error adding queued ICE candidate:", e);
        }
      }
    }
  }, []);

  const handleIncomingCandidate = useCallback(async (candidatePayload: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    // `signalingState` is the source of truth. If it's 'stable', the offer/answer is done.
    // If it's not, we queue candidates.
    if (!pc || pc.signalingState === 'closed' || pc.signalingState === 'new') {
        console.log("WebRTC: PeerConnection not ready for candidate, queueing.");
        iceCandidateQueueRef.current.push(new RTCIceCandidate(candidatePayload));
        return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
    } catch (e) {
        console.error('WebRTC: Error adding received ICE candidate:', e);
    }
  }, []);

  const handleIncomingOffer = useCallback(async (offer: RTCSessionDescriptionInit, receivedRoomId: string, initialCandidates: RTCIceCandidateInit[]) => {
    if (pcRef.current) {
        console.warn("WebRTC: Existing PeerConnection found when handling offer. Cleaning up first.");
        cleanupConnection();
    }
    
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    console.log("WebRTC: PeerConnection created for joining.");

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: receivedRoomId }));
      }
    };

    pc.ondatachannel = (event) => {
      console.log('WebRTC: Data channel received.');
      dcRef.current = event.channel;
      setupDataChannelEvents(event.channel);
    };

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('WebRTC: Remote description (offer) set.');
        
        // Process any candidates that came along with the offer
        for (const candidatePayload of initialCandidates) {
            await handleIncomingCandidate(candidatePayload);
        }
        // Process any candidates that were queued separately
        await processIceCandidateQueue();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('WebRTC: Answer created and set.');

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: receivedRoomId }));
        }
    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingOffer:', e);
    }
  }, [cleanupConnection, setupDataChannelEvents, handleIncomingCandidate, processIceCandidateQueue]);

  const handleIncomingAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("WebRTC: Remote description (answer) set.");
      // Now that the answer is set, the connection is ready for any queued candidates.
      await processIceCandidateQueue();
    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingAnswer:', e);
    }
  }, [processIceCandidateQueue]);


 const connectToSignaling = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      console.log("WebRTC: Signaling connection already exists.");
      return;
    }
    if (!SIGNALING_SERVER_URL) {
      setState(prev => ({ ...prev, error: "Signaling server URL not configured."}));
      return;
    }

    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => console.log('WebRTC: Connected to signaling server');
    ws.onclose = () => console.log('WebRTC: Disconnected from signaling server');
    ws.onerror = (err) => console.error('WebRTC: Signaling error:', err);
    
    ws.onmessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data as string);
            console.log('WebRTC: Message from signaling server:', data.type);

            switch (data.type) {
                case 'room-created':
                    setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: false, isCreator: true, error: null }));
                    const pc = new RTCPeerConnection(ICE_SERVERS);
                    pcRef.current = pc;

                    pc.onicecandidate = (e) => {
                        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({ type: 'candidate', payload: e.candidate, roomId: data.roomId }));
                        }
                    };

                    const dc = pc.createDataChannel('gameMoves');
                    dcRef.current = dc;
                    setupDataChannelEvents(dc);

                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            if (pc.localDescription) {
                                ws.send(JSON.stringify({ type: 'offer', payload: pc.localDescription, roomId: data.roomId }));
                            }
                        });
                    break;
                case 'room-joined':
                    setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: false, isCreator: false, error: null }));
                    handleIncomingOffer(data.offer, data.roomId, data.candidates || []);
                    break;
                case 'peer-joined':
                    setState(prev => ({...prev, isConnected: true, isConnecting: false}));
                    break;
                case 'answer':
                    handleIncomingAnswer(data.payload);
                    break;
                case 'candidate':
                    handleIncomingCandidate(data.payload);
                    break;
                case 'peer-disconnected':
                    setState(prev => ({ ...prev, error: "Opponent disconnected.", isConnected: false, isConnecting: false, roomId: null }));
                    cleanupConnection();
                    break;
                case 'error':
                    setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
                    break;
            }
        } catch (e) {
            console.error("WebRTC: Error parsing message from signaling server", e);
        }
    };
  }, [setupDataChannelEvents, handleIncomingOffer, handleIncomingAnswer, handleIncomingCandidate, cleanupConnection]);

  useEffect(() => {
    connectToSignaling();
    return () => {
      cleanupConnection(true);
    };
  }, [connectToSignaling, cleanupConnection]);


  const createRoom = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    wsRef.current?.send(JSON.stringify({ type: 'create-room' }));
  }, []);


  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    wsRef.current?.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
  }, []);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc?.readyState === 'open') {
      dc.send(JSON.stringify(move));
    } else {
      console.error('WebRTC: Data channel not open. Cannot send move.');
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanupConnection(true);
    setState({ 
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
    // Let the useEffect handle reconnecting to signaling if needed, or connect explicitly
    setTimeout(connectToSignaling, 100);
  }, [cleanupConnection, connectToSignaling]);

  return (
    <WebRTCContext.Provider value={{ 
        ...state, 
        createRoom, 
        joinRoom, 
        sendMove, 
        disconnect,
        setOnMoveReceivedCallback
    }}>
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
