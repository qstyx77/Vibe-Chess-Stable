
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
    // Using 0.0.0.0 is a robust way to connect to the local machine in many containerized/forwarded port environments.
    return 'wss://0.0.0.0:8080';
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

  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Cleaning up connections...');
    if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if(wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING){
            wsRef.current.close();
        }
    }
    pcRef.current?.close();
    dcRef.current?.close();

    wsRef.current = null;
    pcRef.current = null;
    dcRef.current = null;
  }, []);
  
  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnect called.');
    cleanup();
    setState({ 
      isConnected: false,
      isConnecting: false,
      peerPresent: false,
      roomId: null,
      error: null,
      isCreator: false,
    });
  }, [cleanup]);

  const setupDataChannelEvents = useCallback((channel: RTCDataChannel) => {
      channel.onopen = () => {
          console.log('[WebRTC] [SUCCESS] Data channel is open');
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      };
      channel.onclose = () => {
          console.log('[WebRTC] Data channel is closed');
          disconnect();
          setState(prev => ({...prev, error: 'Opponent disconnected.'}));
      };
      channel.onerror = (err) => {
        console.error('[WebRTC] Data channel error:', err);
        disconnect();
        setState(prev => ({...prev, error: 'A connection error occurred.'}));
      }
      channel.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              onMoveReceivedCallbackRef.current?.(data);
          } catch (e) {
              console.error('[WebRTC] Error parsing received move:', e);
          }
      };
  }, [disconnect]);

  const handleSignalingMessage = useCallback(async (data: any, currentRoomId: string | null) => {
    switch(data.type) {
        case 'room-created':
            setState(prev => ({ ...prev, roomId: data.roomId, isCreator: true, isConnecting: false }));
            pcRef.current = createPeerConnection(data.roomId);
            break;
        case 'room-joined':
            setState(prev => ({ ...prev, roomId: data.roomId, isCreator: false }));
            pcRef.current = createPeerConnection(data.roomId);
            if (pcRef.current) {
              dcRef.current = pcRef.current.createDataChannel('gameData');
              setupDataChannelEvents(dcRef.current);
              const offer = await pcRef.current.createOffer();
              await pcRef.current.setLocalDescription(offer);
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'offer', roomId: data.roomId, payload: offer }));
              }
            }
            break;
        case 'peer-joined':
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
            break;
        case 'offer':
             if (!pcRef.current) {
                pcRef.current = createPeerConnection(currentRoomId!);
            }
            await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await pcRef.current?.createAnswer();
            await pcRef.current?.setLocalDescription(answer);
            if(wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'answer', roomId: currentRoomId, payload: answer }));
            }
            break;
        case 'answer':
            if (pcRef.current?.signalingState !== 'stable') {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.payload));
            }
            break;
        case 'candidate':
            if (pcRef.current) {
                try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(data.payload));
                } catch (e) {
                    console.error('[WebRTC] Error adding received ICE candidate', e);
                }
            }
            break;
         case 'peer-disconnected':
            setState(prev => ({ ...prev, error: "Opponent has disconnected."}));
            disconnect();
            break;
        case 'error':
            setState(prev => ({...prev, error: `Error: ${data.message}`, isConnecting: false, roomId: null }));
            disconnect();
            break;
    }
}, [setupDataChannelEvents, disconnect]);

  const createPeerConnection = useCallback((currentRoomId: string) => {
    console.log('[WebRTC] Creating PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'candidate', roomId: currentRoomId, payload: event.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pcRef.current?.connectionState;
      console.log(`[WebRTC] Connection state changed to: ${connectionState}`);
      if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        disconnect();
        setState(prev => ({ ...prev, error: 'Opponent has disconnected.' }));
      }
      if (connectionState === 'connected') {
          setState(prev => ({ ...prev, isConnecting: false, error: null, isConnected: true }));
      }
    };

    pc.ondatachannel = (e) => {
      dcRef.current = e.channel;
      setupDataChannelEvents(e.channel);
    };

    return pc;
  }, [disconnect, setupDataChannelEvents]);
  
  const connectWebSocket = useCallback((action: (ws: WebSocket) => void): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            console.log('[WebRTC] WebSocket already open or connecting. Using existing connection.');
            action(wsRef.current);
            resolve();
            return;
        }

        setState(prev => ({ ...prev, isConnecting: true, error: null }));
        
        const signalingUrl = getSignalingServerUrl();
        if (!signalingUrl) {
            setState(prev => ({...prev, error: 'Could not determine signaling server URL.', isConnecting: false}));
            reject(new Error('Signaling server URL is empty.'));
            return;
        }

        console.log(`[WebRTC] Connecting to signaling server at ${signalingUrl}...`);
        const ws = new WebSocket(signalingUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[WebRTC] WebSocket connected.');
            action(ws);
            resolve();
        };

        ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              // Pass the current roomId from state to the handler
              setState(currentState => {
                handleSignalingMessage(data, currentState.roomId);
                return currentState; 
              });
            } catch (e) {
               console.error('[WebRTC] Error parsing signaling message:', e);
            }
        };

        ws.onerror = (err) => {
            console.error('[WebRTC] WebSocket error:', err);
            setState(prev => ({...prev, error: 'Could not connect to signaling server.', isConnecting: false}));
            cleanup();
            reject(err);
        };

        ws.onclose = (event) => {
            console.log(`[WebRTC] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
            disconnect();
        };
      })
  }, [cleanup, handleSignalingMessage, disconnect]);

  const createRoom = useCallback(async () => {
    try {
        await connectWebSocket((ws) => {
            ws.send(JSON.stringify({ type: 'create-room' }));
        });
    } catch (error) {
        console.error("Failed to create room due to WebSocket connection error.", error);
        setState(prev => ({ ...prev, error: "Failed to connect to server.", isConnecting: false }));
    }
  }, [connectWebSocket]);

  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    try {
        await connectWebSocket((ws) => {
            ws.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
        });
    } catch (error) {
        console.error("Failed to join room due to WebSocket connection error.", error);
        setState(prev => ({ ...prev, error: "Failed to join room.", isConnecting: false }));
    }
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
