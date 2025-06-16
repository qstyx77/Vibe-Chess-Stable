
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
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  // Callback to notify page of incoming move
  onMoveReceived: ((move: GameMove) => void) | null; 
}

interface WebRTCContextType extends Omit<WebRTCState, 'peerConnection' | 'dataChannel' | 'onMoveReceived'> {
  createRoom: () => Promise<string | null>;
  joinRoom: (roomId: string, offer?: RTCSessionDescriptionInit) => Promise<boolean>;
  sendMove: (move: GameMove) => void;
  disconnect: () => void;
  setRemoteDescriptionAndCreateAnswer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit | null>;
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
    peerConnection: null,
    dataChannel: null,
    onMoveReceived: null,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const onMoveReceivedCallbackRef = useRef<((move: GameMove) => void) | null>(null);

  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    
    const newPc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = newPc;

    newPc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('WebRTC: New ICE candidate found:', event.candidate);
        // PRODUCTION: Send event.candidate to other peer via signaling server
        // Example: signalingServer.send({ type: 'candidate', candidate: event.candidate, roomId: state.roomId });
      }
    };

    newPc.onconnectionstatechange = () => {
      console.log('WebRTC: Connection state change:', newPc.connectionState);
      if (newPc.connectionState === 'connected') {
        setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      } else if (newPc.connectionState === 'failed' || newPc.connectionState === 'disconnected' || newPc.connectionState === 'closed') {
        setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: `Connection ${newPc.connectionState}` }));
      }
    };

    newPc.ondatachannel = (event) => {
      console.log('WebRTC: Data channel received');
      const receiveChannel = event.channel;
      dcRef.current = receiveChannel;
      setupDataChannelEvents(receiveChannel);
      setState(prev => ({ ...prev, dataChannel: receiveChannel }));
    };
    
    setState(prev => ({ ...prev, peerConnection: newPc }));
    return newPc;
  }, []);

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('WebRTC: Data channel is open');
      setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
    };

    channel.onclose = () => {
      console.log('WebRTC: Data channel is closed');
      setState(prev => ({ ...prev, isConnected: false, dataChannel: null }));
    };

    channel.onerror = (error) => {
      console.error('WebRTC: Data channel error:', error);
      setState(prev => ({ ...prev, error: 'Data channel error' }));
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

  const createRoom = useCallback(async (): Promise<string | null> => {
    console.log('WebRTC: Attempting to create room...');
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: null, isConnected: false }));
    
    const pc = createPeerConnection();
    if (!pc) {
      setState(prev => ({...prev, error: "Failed to create PeerConnection", isConnecting: false}));
      return null;
    }

    const dataChannel = pc.createDataChannel('gameMoves');
    dcRef.current = dataChannel;
    setupDataChannelEvents(dataChannel);
    setState(prev => ({ ...prev, dataChannel }));

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('WebRTC: Offer created and local description set:', offer);
      // PRODUCTION: Send this offer to the signaling server.
      // The signaling server will then pass it to the joining client.
      // For now, we'll simulate this by resolving with a "room ID".
      const newRoomId = `room_${Math.random().toString(36).substring(2, 7)}`;
      setState(prev => ({ ...prev, roomId: newRoomId, isConnecting: false /* Wait for datachannel open for true isConnected */ }));
      // Note: isConnected will be true when data channel opens or PC connects.
      return newRoomId; 
    } catch (e: any) {
      console.error('WebRTC: Error creating offer:', e);
      setState(prev => ({ ...prev, error: `Error creating offer: ${e.message}`, isConnecting: false }));
      pc.close();
      pcRef.current = null;
      return null;
    }
  }, [createPeerConnection, setupDataChannelEvents]);

  const joinRoom = useCallback(async (roomIdToJoin: string, initialOffer?: RTCSessionDescriptionInit): Promise<boolean> => {
    console.log(`WebRTC: Attempting to join room: ${roomIdToJoin}`);
    setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isConnected: false }));

    const pc = createPeerConnection();
     if (!pc) {
      setState(prev => ({...prev, error: "Failed to create PeerConnection", isConnecting: false}));
      return false;
    }

    if (initialOffer) {
        // This path is if the offer is passed directly (e.g. after signaling)
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
            console.log('WebRTC: Remote description (offer) set.');
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('WebRTC: Answer created and local description set:', answer);
            // PRODUCTION: Send this answer to the signaling server, which relays it to the room creator.
            // For simulation, we assume connection proceeds.
            // isConnected will be true when data channel opens or PC connects.
            setState(prev => ({ ...prev, isConnecting: false, roomId: roomIdToJoin }));
            return true;
        } catch (e: any) {
            console.error('WebRTC: Error during joinRoom with offer:', e);
            setState(prev => ({ ...prev, error: `Error joining room: ${e.message}`, isConnecting: false }));
            pc.close();
            pcRef.current = null;
            return false;
        }
    } else {
        // PRODUCTION: This branch would typically not exist or would fetch the offer.
        // For now, simulate success if not testing a direct offer/answer flow.
        console.warn("WebRTC: Joining room without an initial offer (placeholder logic). In production, an offer is required.");
        // Simulate a delay then success for placeholder UI
        return new Promise((resolve) => {
            setTimeout(() => {
                if (roomIdToJoin === "fail") { 
                    setState(prev => ({ ...prev, isConnected: false, isConnecting: false, error: "Failed to join room (simulated)." }));
                    resolve(false);
                } else {
                    // isConnected will be true when data channel opens or PC connects.
                    setState(prev => ({ ...prev, isConnecting: false, error: null }));
                    resolve(true);
                }
            }, 1000);
        });
    }
  }, [createPeerConnection]);
  
  const setRemoteDescriptionAndCreateAnswer = useCallback(async (offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> => {
    const pc = pcRef.current;
    if (!pc) {
        console.error("WebRTC: PeerConnection not initialized for setRemoteDescriptionAndCreateAnswer.");
        setState(prev => ({ ...prev, error: "PeerConnection not ready." }));
        return null;
    }
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('WebRTC: Remote description (offer) set from external call.');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('WebRTC: Answer created and local description set from external call:', answer);
        // PRODUCTION: This answer now needs to be sent back to the offerer via signaling.
        return answer;
    } catch (e: any) {
        console.error('WebRTC: Error in setRemoteDescriptionAndCreateAnswer:', e);
        setState(prev => ({ ...prev, error: `Error processing offer: ${e.message}` }));
        return null;
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
        await pc.addIceCandidate(candidate);
        console.log('WebRTC: ICE candidate added successfully.');
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
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setState({
      isConnected: false,
      isConnecting: false,
      roomId: null,
      error: null,
      peerConnection: null,
      dataChannel: null,
      onMoveReceived: onMoveReceivedCallbackRef.current, // Preserve callback if set
    });
  }, []);

  return (
    <WebRTCContext.Provider value={{ 
        ...state, 
        peerConnection: undefined, // Hide internal objects from context consumers
        dataChannel: undefined,    // Hide internal objects from context consumers
        onMoveReceived: undefined, // Hide internal objects from context consumers
        createRoom, 
        joinRoom, 
        sendMove, 
        disconnect,
        setRemoteDescriptionAndCreateAnswer,
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

    