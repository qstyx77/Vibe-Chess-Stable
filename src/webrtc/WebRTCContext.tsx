
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
  const onOpenQueueRef = useRef<(() => void)[]>([]);

  const setOnMoveReceivedCallback = useCallback((callback: ((move: GameMove) => void) | null) => {
    onMoveReceivedCallbackRef.current = callback;
  }, []);

  const disconnect = useCallback(() => {
    console.log('[WebRTC Client] Disconnect called. Cleaning up connections.');
    if (dcRef.current) {
        dcRef.current.onopen = null;
        dcRef.current.onclose = null;
        dcRef.current.onerror = null;
        dcRef.current.onmessage = null;
        dcRef.current.close();
        dcRef.current = null;
    }
    if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.ondatachannel = null;
        pcRef.current.close();
        pcRef.current = null;
    }
    if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }
        wsRef.current = null;
    }
    iceCandidateQueueRef.current = [];
    onOpenQueueRef.current = [];
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
      console.log('[WebRTC Client] Setting up data channel events.');
      channel.onopen = () => {
          console.log('[WebRTC Client] Data channel OPEN.');
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false, error: null }));
      };
      channel.onclose = () => {
          console.log('[WebRTC Client] Data channel CLOSED.');
          disconnect();
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
  }, [disconnect]);

  const processIceCandidateQueue = useCallback(async () => {
      if (!pcRef.current || !pcRef.current.remoteDescription) {
          console.warn(`[WebRTC Client] Cannot process ICE queue. Peer connection not ready. Queue size: ${iceCandidateQueueRef.current.length}`);
          return;
      }
      console.log(`[WebRTC Client] Processing ${iceCandidateQueueRef.current.length} queued ICE candidates.`);
      while (iceCandidateQueueRef.current.length > 0) {
          const candidate = iceCandidateQueueRef.current.shift();
          if (candidate) {
              try {
                  await pcRef.current.addIceCandidate(candidate);
                  console.log('[WebRTC Client] Successfully added queued ICE candidate.');
              } catch (e) {
                  console.error("[WebRTC Client] Error adding queued ICE candidate:", e);
              }
          }
      }
  }, []);

  const createPeerConnection = useCallback((currentRoomId: string) => {
    console.log('[WebRTC Client] Creating new RTCPeerConnection.');
    if (pcRef.current) {
        pcRef.current.close();
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebRTC Client] Sending ICE candidate to server.');
        wsRef.current.send(JSON.stringify({ type: 'candidate', payload: event.candidate, roomId: currentRoomId }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      const connectionState = pcRef.current.connectionState;
      console.log(`[WebRTC Client] Connection state changed: ${connectionState}`);
      if (connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
        setState(prev => ({ ...prev, error: 'Opponent disconnected.'}));
        disconnect();
      } else if (connectionState === 'connected') {
        setState(prev => ({...prev, isConnected: true, isConnecting: false, error: null }));
      }
    };
    
    return pc;
  }, [disconnect]);


  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        console.log('[WebRTC Client] WebSocket connection already exists or is connecting.');
        return wsRef.current;
    }
    
    console.log('[WebRTC Client] WebSocket connection attempt initiated.');
    const ws = new WebSocket(SIGNALING_SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
        console.log('[WebRTC Client] WebSocket connected to signaling server.');
        while(onOpenQueueRef.current.length > 0) {
            const action = onOpenQueueRef.current.shift();
            action?.();
        }
    };
    ws.onclose = () => {
        console.log('[WebRTC Client] WebSocket disconnected.');
        if (state.isConnected) {
            disconnect();
        }
    };
    ws.onerror = (err) => console.error('[WebRTC Client] WebSocket signaling error:', err);

    ws.onmessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        console.log('[WebRTC Client] Received message from signaling server:', data);
        
        const currentRoomId = data.roomId || state.roomId;
        if (!currentRoomId) {
            console.error("Cannot process message without a roomId.", data);
            return;
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
            console.log('[WebRTC Client] Peer joined. Creator is creating peer connection and offer.');
            const pc_creator = createPeerConnection(currentRoomId);
            const dc = pc_creator.createDataChannel('gameMoves');
            dcRef.current = dc;
            setupDataChannelEvents(dc);
            const offer = await pc_creator.createOffer();
            await pc_creator.setLocalDescription(offer);
            if(wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'offer', payload: offer, roomId: currentRoomId }));
            }
            break;
          case 'offer':
            setState(prev => ({ ...prev, peerPresent: true, isConnecting: true }));
            console.log('[WebRTC Client] Received offer. Joiner creating peer connection and answer.');
            const pc_joiner = createPeerConnection(currentRoomId);
            pc_joiner.ondatachannel = (e) => {
              dcRef.current = e.channel;
              setupDataChannelEvents(e.channel);
            };
            await pc_joiner.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await pc_joiner.createAnswer();
            await pc_joiner.setLocalDescription(answer);
            if(wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'answer', payload: answer, roomId: currentRoomId }));
            }
            await processIceCandidateQueue();
            break;
          case 'answer':
            if (pcRef.current) {
              console.log('[WebRTC Client] Received answer. Setting remote description.');
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
              await processIceCandidateQueue();
            }
            break;
          case 'candidate':
            if (!data.payload) {
                console.warn('[WebRTC Client] Received candidate message with null payload.');
                break;
            }
            if (pcRef.current) {
                const candidate = new RTCIceCandidate(data.payload);
                if (pcRef.current.remoteDescription) {
                    try {
                        await pcRef.current.addIceCandidate(candidate);
                        console.log('[WebRTC Client] Successfully added ICE candidate.');
                    } catch (e) {
                        console.error("[WebRTC Client] Error adding received ICE candidate:", e);
                    }
                } else {
                    console.log('[WebRTC Client] Queuing received ICE candidate because remote description is not set.');
                    iceCandidateQueueRef.current.push(candidate);
                }
            } else {
                console.warn('[WebRTC Client] Received candidate but peer connection is not ready. Queuing.');
                iceCandidateQueueRef.current.push(new RTCIceCandidate(data.payload));
            }
            break;
          case 'peer-disconnected':
            setState(prev => ({ ...prev, error: "Opponent disconnected."}));
            disconnect();
            break;
          case 'error':
            setState(prev => ({ ...prev, error: `Signaling error: ${data.message}`, isConnecting: false }));
            break;
        }

      } catch (e) {
        console.error("[WebRTC Client] Error processing message from signaling server", e);
      }
    };

    return ws;
  }, [createPeerConnection, disconnect, processIceCandidateQueue, setupDataChannelEvents, state.roomId, state.isConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const executeWhenConnected = useCallback((action: () => void) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
          action();
      } else {
          onOpenQueueRef.current.push(action);
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
              connectWebSocket();
          }
      }
  }, [connectWebSocket]);
  
  const createRoom = useCallback(() => {
    executeWhenConnected(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('[WebRTC Client] Sending create-room request.');
          setState(prev => ({ ...prev, isConnecting: true, error: null, isCreator: true }));
          wsRef.current.send(JSON.stringify({ type: 'create-room' }));
        } else {
            console.error('[WebRTC Client] Cannot create room, WebSocket not open.');
            setState(prev => ({ ...prev, error: "Failed to connect to signaling server." }));
        }
    });
  }, [executeWhenConnected]);

  const joinRoom = useCallback((roomIdToJoin: string) => {
    executeWhenConnected(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log(`[WebRTC Client] Sending join-room request for room: ${roomIdToJoin}`);
          setState(prev => ({ ...prev, isConnecting: true, error: null, roomId: roomIdToJoin, isCreator: false }));
          wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin }));
        } else {
            console.error('[WebRTC Client] Cannot join room, WebSocket not open.');
            setState(prev => ({ ...prev, error: "Failed to connect to signaling server." }));
        }
    });
  }, [executeWhenConnected]);
  
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
