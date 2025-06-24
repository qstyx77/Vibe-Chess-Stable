
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
  const stateRef = useRef(state);
  stateRef.current = state;

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
      if (dcRef.current.readyState !== 'closed') dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      if (pcRef.current.signalingState !== 'closed') pcRef.current.close();
      pcRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
    }
    wsRef.current = null;
    iceCandidateQueueRef.current = [];
    console.log("WebRTC: Connections cleaned up.");
  }, []); 


  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('WebRTC: Data channel is open');
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    };
    channel.onclose = () => {
      console.log('WebRTC: Data channel is closed');
    };
    channel.onerror = (errorEvent) => {
      const error = (errorEvent as RTCErrorEvent).error;
      console.error('WebRTC: Data channel error:', error);
      setState(prev => ({ ...prev, error: `Data channel error: ${error?.message || 'Unknown error'}` }));
    };
    channel.onmessage = (event) => {
      console.log('WebRTC: Message received on data channel (raw):', event.data);
      try {
        const move = JSON.parse(event.data);
        if (onMoveReceivedCallbackRef.current) {
          onMoveReceivedCallbackRef.current(move);
        } else {
          console.warn("WebRTC: onMoveReceived callback not set, move dropped.")
        }
      } catch (e) {
        console.error('WebRTC: Error parsing received move:', e);
      }
    };
  }, []);

  const createPeerConnection = useCallback((roomIdForCallback: string) => {
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        console.log("WebRTC: PeerConnection already exists and not closed. Cleaning up before creating new one.");
        cleanupConnection(); 
    }
    
    const newPc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = newPc;
    console.log("WebRTC: PeerConnection created.");

    newPc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && roomIdForCallback) {
        console.log('WebRTC: New ICE candidate generated. Sending to signaling server:', event.candidate.candidate.substring(0, 30) + '...');
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: roomIdForCallback }));
      }
    };

    newPc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      console.log('WebRTC: Connection state change:', pcRef.current.connectionState);
      if (pcRef.current.connectionState === 'connected') {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        console.log("WebRTC: Successfully connected to peer.");
      } else if (pcRef.current.connectionState === 'failed' || pcRef.current.connectionState === 'disconnected' || pcRef.current.connectionState === 'closed') {
        setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: `Connection ${pcRef.current?.connectionState}` }));
        cleanupConnection(); 
      }
    };

    newPc.ondatachannel = (event) => {
      console.log('WebRTC: Data channel received by remote peer');
      const receiveChannel = event.channel;
      dcRef.current = receiveChannel;
      setupDataChannelEvents(receiveChannel);
    };
    
    return newPc;
  }, [cleanupConnection, setupDataChannelEvents]); 

  const handleIncomingCandidate = useCallback(async (candidatePayload: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
        console.log("WebRTC: PeerConnection not ready for addIceCandidate. Queuing candidate.");
        iceCandidateQueueRef.current.push(new RTCIceCandidate(candidatePayload)); 
        return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
      console.log('WebRTC: ICE candidate added successfully.');
    } catch (e: any) {
        console.error('WebRTC: Error adding received ICE candidate:', e);
        setState(prev => ({ ...prev, error: `Error adding ICE candidate: ${e.message}` }));
    }
  }, []);

  const handleIncomingOffer = useCallback(async (offer: RTCSessionDescriptionInit, receivedRoomId: string, initialCandidates: RTCIceCandidateInit[]) => {
    let pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed') {
        console.log("WebRTC: PeerConnection not ready for offer or closed, creating one for joining.");
        pc = createPeerConnection(receivedRoomId);
    }
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for handleIncomingOffer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready to handle offer." }));
        return;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('WebRTC: Remote description (offer) set. Processing initial candidates.');

        for (const candidatePayload of initialCandidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
                console.log('WebRTC: Initial ICE candidate added successfully.');
            } catch (e) {
                console.error("Error adding initial ICE candidate:", e);
            }
        }
        
        console.log('WebRTC: Processing separately queued candidates that may have arrived early.');
        while(iceCandidateQueueRef.current.length > 0) {
            const candidate = iceCandidateQueueRef.current.shift();
            if (candidate) {
                try {
                    await pc.addIceCandidate(candidate);
                    console.log('WebRTC: Queued ICE candidate added successfully.');
                } catch(e) {
                    console.error("Error adding queued ICE candidate:", e);
                }
            }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('WebRTC: Answer created. Sending to signaling server.');

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: receivedRoomId }));
        } else {
             console.error("WebRTC: WebSocket not open to send answer.");
             setState(prev => ({ ...prev, error: "WebSocket not open to send answer." }));
        }
    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingOffer:', e);
        setState(prev => ({ ...prev, error: `Error processing offer: ${e.message}` }));
    }
  }, [createPeerConnection]);

  const handleIncomingAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for handleIncomingAnswer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready to handle answer." }));
        return;
    }
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('WebRTC: Remote description (answer) set. Processing ICE candidate queue.');

        while(iceCandidateQueueRef.current.length > 0) {
            const candidate = iceCandidateQueueRef.current.shift();
            if (candidate) {
                try {
                    await pc.addIceCandidate(candidate);
                    console.log('WebRTC: Queued ICE candidate from answer handler added successfully.');
                } catch(e) {
                    console.error("Error adding queued ICE candidate from answer handler:", e);
                }
            }
        }

    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingAnswer:', e);
        setState(prev => ({ ...prev, error: `Error processing answer: ${e.message}` }));
    }
  }, []);

  const connectToSignaling = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        console.log("WebRTC: WebSocket connection already open or connecting.");
        return;
    }
    
    if (!SIGNALING_SERVER_URL) {
        console.warn("WebRTC: WebSocket connection attempt skipped because SIGNALING_SERVER_URL is not determined yet.");
        setState(prev => ({ ...prev, error: "WebSocket URL not determined."}));
        return;
    }

    console.log("WebRTC: Attempting new WebSocket connection to signaling server...");
    const ws = new WebSocket(SIGNALING_SERVER_URL); 
    wsRef.current = ws; 

    ws.onopen = () => {
      console.log('WebRTC: Connected to signaling server');
      setState(prev => ({ ...prev, error: null }));
    };

    ws.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data as string);
        console.log('WebRTC: Message from signaling server:', data.type, data.roomId || '');

        switch (data.type) {
            case 'room-created':
                setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: false, isCreator: true, error: null }));
                const pcCreator = createPeerConnection(data.roomId); 
                if (!pcCreator) {
                    console.error("Failed to create peer connection for creator");
                    setState(prev => ({ ...prev, error: "Failed to create PC for creator", isConnecting: false }));
                    return;
                }
                const dataChannel = pcCreator.createDataChannel('gameMoves', { negotiated: false }); 
                dcRef.current = dataChannel;
                setupDataChannelEvents(dataChannel);
                pcCreator.createOffer()
                    .then(offer => pcCreator.setLocalDescription(offer))
                    .then(() => {
                        console.log('WebRTC: Offer created. Sending to signaling server.');
                        ws.send(JSON.stringify({ type: 'offer', payload: pcCreator.localDescription, roomId: data.roomId }));
                    })
                    .catch(e => {
                        console.error("WebRTC: Error creating offer for new room", e);
                        setState(prev => ({ ...prev, error: `Offer creation error: ${e.message}`, isConnecting: false }));
                    });
                break;
            case 'room-joined': 
                setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: false, isCreator: false, error: null }));
                if (data.offer) {
                    handleIncomingOffer(data.offer, data.roomId, data.candidates || []).catch(e => console.error("Error in handleIncomingOffer:", e));
                }
                break;
            case 'peer-joined': 
                console.log("WebRTC: Peer has joined the room. Creator is already set up.");
                setState(prev => ({ ...prev, isConnecting: false })); 
                break;
            case 'answer': 
                handleIncomingAnswer(data.payload).catch(e => console.error("Error in handleIncomingAnswer:", e));
                break;
            case 'candidate':
                handleIncomingCandidate(data.payload).catch(e => console.error("Error in handleIncomingCandidate:", e));
                break;
            case 'peer-disconnected':
                console.log("WebRTC: Peer disconnected.");
                setState(prev => ({ ...prev, error: "Opponent disconnected.", isConnected: false, isConnecting: false }));
                cleanupConnection();
                connectToSignaling();
                break;
            case 'error':
                console.error('WebRTC: Error from signaling server:', data.message);
                setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
                break;
            default:
                console.warn('WebRTC: Unknown message type from signaling server:', data.type);
        }
    };

    ws.onclose = (event) => {
      console.log('WebRTC: Disconnected from signaling server. Code:', event.code, 'Reason:', event.reason, 'Was Clean:', event.wasClean);
      const currentState = stateRef.current;
      if (!event.wasClean && (currentState.isConnected || currentState.isConnecting)) {
        setState(prev => ({ ...prev, error: 'Unexpectedly disconnected from signaling server.', isConnected: false, isConnecting: false }));
      }
      cleanupConnection();
    };

    ws.onerror = (event) => {
      console.warn('WebRTC: Signaling server connection error. Check if the signaling server (server.js) is running and accessible.');
      setState(prev => ({ ...prev, error: 'Signaling server connection error.', isConnected: false, isConnecting: false }));
      cleanupConnection();
    };
  }, [cleanupConnection, createPeerConnection, handleIncomingAnswer, handleIncomingCandidate, handleIncomingOffer, setupDataChannelEvents]);

  useEffect(() => {
    connectToSignaling();
    return () => {
      console.log("WebRTC: WebRTCProvider unmounting, cleaning up connections.");
      cleanupConnection();
    };
  }, [connectToSignaling, cleanupConnection]);


  const createRoom = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectToSignaling();
        setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                console.log('WebRTC: Requesting to create room...');
                setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
                wsRef.current.send(JSON.stringify({ type: 'create-room' }));
            } else {
                setState(prev => ({ ...prev, error: "Failed to connect to signaling server."}));
            }
        }, 1000);
        return;
    }
    console.log('WebRTC: Requesting to create room...');
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    wsRef.current.send(JSON.stringify({ type: 'create-room' }));
  }, [connectToSignaling]);


  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectToSignaling();
        setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                 console.log(`WebRTC: Requesting to join room: ${roomIdToJoin}`);
                setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
                wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
            } else {
                setState(prev => ({ ...prev, error: "Failed to connect to signaling server."}));
            }
        }, 1000);
        return;
    }
    console.log(`WebRTC: Requesting to join room: ${roomIdToJoin}`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
  }, [connectToSignaling]);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') {
      try {
        console.log('WebRTC: Sending move via DataChannel:', move);
        dc.send(JSON.stringify(move));
      } catch (e: any) {
        console.error("WebRTC: Error sending move via DataChannel", e);
        setState(prev => ({ ...prev, error: `Error sending move: ${e.message}` }));
      }
    } else {
      console.error('WebRTC: Data channel not open. Cannot send move.');
      setState(prev => ({ ...prev, error: 'Cannot send move: connection not established.' }));
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('WebRTC: Disconnecting locally and notifying server...');
    cleanupConnection();
    // Reconnect to signaling server to be ready for a new game
    connectToSignaling(); 
    setState({ 
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
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
