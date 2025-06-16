
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// Placeholder for actual game move type
type GameMove = any; 

interface WebRTCState {
  isConnected: boolean;
  isConnecting: boolean;
  roomId: string | null;
  error: string | null;
  // Callback to notify page of incoming move
  // onMoveReceived: ((move: GameMove) => void) | null; // Managed by onMoveReceivedCallbackRef
}

interface WebRTCContextType extends WebRTCState {
  createRoom: () => Promise<{ roomId: string; offer: RTCSessionDescriptionInit } | null>;
  joinRoom: (roomId: string) => Promise<boolean>;
  sendMove: (move: GameMove) => void;
  disconnect: () => void;
  handleIncomingOffer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit | null>;
  handleIncomingAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit | RTCIceCandidate) => Promise<void>;
  setOnMoveReceivedCallback: (callback: ((move: GameMove) => void) | null) => void;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<WebRTCState>({
    isConnected: false,
    isConnecting: false,
    roomId: null,
    error: null,
    // peerConnection and dataChannel are managed by refs
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const onMoveReceivedCallbackRef = useRef<((move: GameMove) => void) | null>(null);
  const localIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const remoteIceCandidatesRef = useRef<RTCIceCandidate[]>([]);


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
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.ondatachannel = null;
      if (pcRef.current.signalingState !== 'closed') {
        pcRef.current.close();
      }
      pcRef.current = null;
    }
    localIceCandidatesRef.current = [];
    remoteIceCandidatesRef.current = [];
  }, []);

  const createPeerConnection = useCallback((currentRoomId: string | null) => {
    cleanupConnection();
    
    const newPc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = newPc;

    newPc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('WebRTC: New ICE candidate generated. Send this to the other peer via signaling:', event.candidate);
        // In a real app, you'd send event.candidate to the other peer via signaling server.
        // For local testing if candidates arrive before remote description is set:
        localIceCandidatesRef.current.push(event.candidate);
      }
    };

    newPc.onconnectionstatechange = () => {
      console.log('WebRTC: Connection state change:', newPc.connectionState);
      if (newPc.connectionState === 'connected') {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
        // Process any queued remote ICE candidates
        remoteIceCandidatesRef.current.forEach(candidate => {
          if (pcRef.current && pcRef.current.remoteDescription) { // Ensure remoteDescription is set
            pcRef.current.addIceCandidate(candidate).catch(e => console.error("Error adding queued remote ICE candidate:", e));
          }
        });
        remoteIceCandidatesRef.current = [];
      } else if (newPc.connectionState === 'failed' || newPc.connectionState === 'disconnected' || newPc.connectionState === 'closed') {
        setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: `Connection ${newPc.connectionState}` }));
        cleanupConnection();
      }
    };

    newPc.ondatachannel = (event) => {
      console.log('WebRTC: Data channel received');
      const receiveChannel = event.channel;
      dcRef.current = receiveChannel;
      setupDataChannelEvents(receiveChannel);
    };
    
    return newPc;
  }, [cleanupConnection]); // setupDataChannelEvents dependency removed as it's defined below and stable if its own dependencies are stable.

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('WebRTC: Data channel is open');
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    };

    channel.onclose = () => {
      console.log('WebRTC: Data channel is closed');
      // isConnected will be false due to peerConnection state change, no need to set here
    };

    channel.onerror = (errorEvent) => {
      const error = (errorEvent as RTCErrorEvent).error;
      console.error('WebRTC: Data channel error:', error);
      setState(prev => ({ ...prev, error: `Data channel error: ${error?.message || 'Unknown error'}` }));
    };

    channel.onmessage = (event) => {
      console.log('WebRTC: Message received:', event.data);
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


  const createRoom = useCallback(async (): Promise<{ roomId: string; offer: RTCSessionDescriptionInit } | null> => {
    console.log('WebRTC: Attempting to create room...');
    const newRoomId = `room_${Math.random().toString(36).substring(2, 9)}`;
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: newRoomId, isConnected: false }));
    
    const pc = createPeerConnection(newRoomId);
    if (!pc) {
      setState(prev => ({...prev, error: "Failed to create PeerConnection", isConnecting: false, roomId: null}));
      return null;
    }

    const dataChannel = pc.createDataChannel('gameMoves');
    dcRef.current = dataChannel;
    setupDataChannelEvents(dataChannel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('WebRTC: Offer created and local description set. Send this offer and roomId to the other peer via signaling:', { roomId: newRoomId, offer });
      setState(prev => ({ ...prev, isConnecting: false /* Wait for connection state for true isConnected */ }));
      return { roomId: newRoomId, offer }; 
    } catch (e: any) {
      console.error('WebRTC: Error creating offer:', e);
      setState(prev => ({ ...prev, error: `Error creating offer: ${e.message}`, isConnecting: false, roomId: null }));
      cleanupConnection();
      return null;
    }
  }, [createPeerConnection, setupDataChannelEvents, cleanupConnection]);

  const joinRoom = useCallback(async (roomIdToJoin: string): Promise<boolean> => {
    console.log(`WebRTC: Initializing to join room: ${roomIdToJoin}. Waiting for offer from creator via signaling.`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isConnected: false }));

    const pc = createPeerConnection(roomIdToJoin);
     if (!pc) {
      setState(prev => ({...prev, error: "Failed to create PeerConnection for joining", isConnecting: false, roomId: null}));
      return false;
    }
    // The host will send an offer. This client will use handleIncomingOffer.
    // For now, isConnecting will remain true until connection state changes.
    // setState(prev => ({ ...prev, isConnecting: false })); // Moved to connection state change
    return true; 
  }, [createPeerConnection]);
  
  const handleIncomingOffer = useCallback(async (offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for handleIncomingOffer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready to handle offer." }));
        return null;
    }
    setState(prev => ({ ...prev, isConnecting: true }));
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('WebRTC: Remote description (offer) set.');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('WebRTC: Answer created. Send this answer back to the room creator via signaling:', answer);
        setState(prev => ({ ...prev, isConnecting: false }));
        return answer;
    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingOffer:', e);
        setState(prev => ({ ...prev, error: `Error processing offer: ${e.message}`, isConnecting: false }));
        return null;
    }
  }, []);

  const handleIncomingAnswer = useCallback(async (answer: RTCSessionDescriptionInit): Promise<void> => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for handleIncomingAnswer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready to handle answer." }));
        return;
    }
    setState(prev => ({ ...prev, isConnecting: true }));
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('WebRTC: Remote description (answer) set.');
        setState(prev => ({ ...prev, isConnecting: false }));
    } catch (e: any) {
        console.error('WebRTC: Error in handleIncomingAnswer:', e);
        setState(prev => ({ ...prev, error: `Error processing answer: ${e.message}`, isConnecting: false }));
    }
  }, []);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit | RTCIceCandidate) => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for addIceCandidate.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready for ICE candidate." }));
        return;
    }
    try {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate);
        console.log('WebRTC: ICE candidate added successfully.');
      } else {
        console.log('WebRTC: Remote description not set, queueing ICE candidate.');
        remoteIceCandidatesRef.current.push(new RTCIceCandidate(candidate));
      }
    } catch (e: any) {
        console.error('WebRTC: Error adding received ICE candidate:', e);
        setState(prev => ({ ...prev, error: `Error adding ICE candidate: ${e.message}` }));
    }
  }, []);


  const sendMove = useCallback((move: GameMove) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') {
      console.error('WebRTC: Cannot send move, data channel not open or not available.');
      setState(prev => ({ ...prev, error: 'Cannot send move: Data channel not ready.' }));
      return;
    }
    try {
      dc.send(JSON.stringify(move));
      console.log('WebRTC: Move sent:', move);
    } catch (e: any) {
      console.error('WebRTC: Error sending move:', e);
      setState(prev => ({ ...prev, error: `Error sending move: ${e.message}` }));
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('WebRTC: Disconnecting...');
    cleanupConnection();
    setState({
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
    });
  }, [cleanupConnection]);

  return (
    <WebRTCContext.Provider value={{ 
        ...state, 
        createRoom, 
        joinRoom, 
        sendMove, 
        disconnect,
        handleIncomingOffer,
        handleIncomingAnswer,
        addIceCandidate,
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

    
