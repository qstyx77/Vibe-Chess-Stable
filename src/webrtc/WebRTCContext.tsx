
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

const SIGNALING_SERVER_URL = 'ws://localhost:8080';

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

  const cleanupConnection = useCallback((notifyServer = true) => {
    if (notifyServer && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && state.roomId) {
        // Optionally send a disconnect message if your server handles it
        // wsRef.current.send(JSON.stringify({ type: 'disconnecting', roomId: state.roomId }));
    }

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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    iceCandidateQueueRef.current = [];
    console.log("WebRTC: Connections cleaned up.");
  }, [state.roomId]); 


  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
        console.log("WebRTC: PeerConnection already exists. Cleaning up before creating new one.");
        cleanupConnection(false); 
    }
    
    const newPc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = newPc;
    console.log("WebRTC: PeerConnection created.");

    newPc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && state.roomId) {
        console.log('WebRTC: New ICE candidate generated. Sending to signaling server:', event.candidate);
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: state.roomId }));
      } else if (event.candidate) {
        console.log('WebRTC: ICE candidate generated but WebSocket not ready or no room ID. Queuing:', event.candidate);
        iceCandidateQueueRef.current.push(event.candidate);
      }
    };

    newPc.onconnectionstatechange = () => {
      console.log('WebRTC: Connection state change:', newPc.connectionState);
      if (newPc.connectionState === 'connected') {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        console.log("WebRTC: Successfully connected to peer.");
      } else if (newPc.connectionState === 'failed' || newPc.connectionState === 'disconnected' || newPc.connectionState === 'closed') {
        setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: `Connection ${newPc.connectionState}` }));
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
  }, [cleanupConnection, state.roomId]);

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
      console.log('WebRTC: Message received on data channel:', event.data);
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


  const handleIncomingOffer = useCallback(async (offer: RTCSessionDescriptionInit, receivedRoomId: string) => {
    if (!pcRef.current) {
        console.log("WebRTC: PeerConnection not ready for offer, creating one for joining.");
        createPeerConnection(); 
    }
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for handleIncomingOffer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready to handle offer." }));
        return;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('WebRTC: Remote description (offer) set.');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('WebRTC: Answer created. Sending to signaling server:', answer);
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
        console.log('WebRTC: Remote description (answer) set.');
        iceCandidateQueueRef.current.forEach(candidate => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && state.roomId) {
                 wsRef.current.send(JSON.stringify({ type: 'candidate', payload: candidate, roomId: state.roomId }));
            }
        });
        iceCandidateQueueRef.current = [];

    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingAnswer:', e);
        setState(prev => ({ ...prev, error: `Error processing answer: ${e.message}` }));
    }
  }, [state.roomId]);

  const handleIncomingCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for addIceCandidate. Queuing.");
        iceCandidateQueueRef.current.push(new RTCIceCandidate(candidate)); 
        return;
    }
    try {
      if (pc.remoteDescription) { 
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('WebRTC: ICE candidate added successfully.');
      } else {
        console.log('WebRTC: Remote description not set, queueing ICE candidate.');
        iceCandidateQueueRef.current.push(new RTCIceCandidate(candidate));
      }
    } catch (e: any) {
        console.error('WebRTC: Error adding received ICE candidate:', e);
        setState(prev => ({ ...prev, error: `Error adding ICE candidate: ${e.message}` }));
    }
  }, []);

  useEffect(() => {
    if (!wsRef.current) {
      const ws = new WebSocket(SIGNALING_SERVER_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebRTC: Connected to signaling server');
        setState(prev => ({ ...prev, error: null }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data as string);
        console.log('WebRTC: Message from signaling server:', data.type, data.roomId || '');

        switch (data.type) {
          case 'room-created':
            setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: true, isCreator: true, error: null }));
            const pc = createPeerConnection(); 
            if (!pc) {
                console.error("Failed to create peer connection for creator");
                setState(prev => ({ ...prev, error: "Failed to create PC for creator", isConnecting: false }));
                return;
            }
            const dataChannel = pc.createDataChannel('gameMoves');
            dcRef.current = dataChannel;
            setupDataChannelEvents(dataChannel);
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log('WebRTC: Offer created. Sending to signaling server:', offer);
                ws.send(JSON.stringify({ type: 'offer', payload: offer, roomId: data.roomId }));
            } catch (e: any) {
                console.error("WebRTC: Error creating offer for new room", e);
                setState(prev => ({ ...prev, error: `Offer creation error: ${e.message}`, isConnecting: false }));
            }
            break;
          case 'room-joined': 
            setState(prev => ({ ...prev, roomId: data.roomId, isConnecting: true, isCreator: false, error: null }));
            if (data.offer) {
                 await handleIncomingOffer(data.offer, data.roomId);
            }
            if (data.candidates && Array.isArray(data.candidates)) {
                for (const candidate of data.candidates) {
                    await handleIncomingCandidate(candidate);
                }
            }
            break;
          case 'peer-joined': 
            console.log("WebRTC: Peer has joined the room. Creator is already set up.");
            setState(prev => ({ ...prev, isConnecting: false }));
            break;
          case 'offer': 
            await handleIncomingOffer(data.payload, data.roomId);
            break;
          case 'answer': 
            await handleIncomingAnswer(data.payload);
            break;
          case 'candidate':
            await handleIncomingCandidate(data.payload);
            break;
          case 'move':
            if (onMoveReceivedCallbackRef.current) {
              onMoveReceivedCallbackRef.current(data.payload);
            }
            break;
          case 'peer-disconnected':
            console.log("WebRTC: Peer disconnected.");
            setState(prev => ({ ...prev, error: "Opponent disconnected.", isConnected: false, isConnecting: false }));
            cleanupConnection(false); 
            break;
          case 'error':
            console.error('WebRTC: Error from signaling server:', data.message);
            setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
            break;
          default:
            console.warn('WebRTC: Unknown message type from signaling server:', data.type);
        }
      };

      ws.onclose = () => {
        console.log('WebRTC: Disconnected from signaling server');
        if (state.isConnected || state.isConnecting) { 
            setState(prev => ({ ...prev, error: 'Disconnected from signaling server', isConnected: false, isConnecting: false }));
        }
        cleanupConnection(false); 
      };

      ws.onerror = (event) => {
        console.error('WebRTC: Signaling server connection error. Check if the signaling server (server.js) is running and accessible.');
        setState(prev => ({ ...prev, error: 'Signaling server connection error.', isConnected: false, isConnecting: false }));
        cleanupConnection(false);
      };
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      cleanupConnection(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  const createRoom = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error("WebRTC: Signaling server not connected. Cannot create room.");
        setState(prev => ({ ...prev, error: "Signaling server not connected."}));
        return;
    }
    console.log('WebRTC: Requesting to create room...');
    setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
    wsRef.current.send(JSON.stringify({ type: 'create-room' }));
  }, [createPeerConnection, setupDataChannelEvents]);


  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error("WebRTC: Signaling server not connected. Cannot join room.");
        setState(prev => ({ ...prev, error: "Signaling server not connected."}));
        return;
    }
    console.log(`WebRTC: Requesting to join room: ${roomIdToJoin}`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
    wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
  }, []);
  
  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      console.error('WebRTC: Data channel not open. Cannot send move.');
      setState(prev => ({ ...prev, error: 'Data channel not ready to send move.' }));
      return;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && state.roomId) {
        console.log('WebRTC: Sending move via WebSocket to signaling server:', move);
        wsRef.current.send(JSON.stringify({ type: 'move', payload: move, roomId: state.roomId }));
    } else {
        console.error('WebRTC: Signaling server not connected or no room ID. Cannot send move.');
        setState(prev => ({ ...prev, error: 'Signaling server not ready for move.' }));
    }
  }, [state.roomId]);

  const disconnect = useCallback(() => {
    console.log('WebRTC: Disconnecting locally and notifying server...');
    cleanupConnection(true); 
    setState({
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
  }, [cleanupConnection]);

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

