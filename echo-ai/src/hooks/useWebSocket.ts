/**
 * WebSocket Hook (Optimized for Streaming)
 * 
 * Handles both JSON and binary WebSocket frames.
 * Supports streaming audio chunks for low-latency playback.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// Filler words to filter out from transcript
const FILLER_WORDS = new Set([
  'uh', 'um', 'hmm', 'haan', 'ah', 'eh', 'er', 'like', 'you know',
  'basically', 'actually', 'literally', 'so', 'well', 'right',
]);

interface ConversationTurn {
  text: string;
  timestamp: number;
}

interface ConversationSnapshot {
  lastTurns: ConversationTurn[];
  lastSpokenAt: number | null;
  detectedLanguage: string;
  confidenceScore?: number;
}

interface WebSocketMessage {
  type: string;
  conversation_snapshot?: ConversationSnapshot;
  audio_url?: string;
  audio_stream?: string;
  audio_chunk?: string; // base64 encoded audio chunk
  [key: string]: unknown;
}

interface UseWebSocketProps {
  url: string;
  onAudioChunk?: (audioData: ArrayBuffer) => void;
  onStreamEnd?: () => void;
  onVoiceSuggestion?: (audioUrl: string) => void;
  onMessage?: (message: WebSocketMessage) => void;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  sendPauseDetected: (snapshot: ConversationSnapshot) => void;
  connect: () => void;
  disconnect: () => void;
}

// Filter and clean transcript before sending
function cleanTranscript(turns: ConversationTurn[]): ConversationTurn[] {
  return turns
    .map(turn => {
      // Remove filler words
      const words = turn.text.toLowerCase().split(/\s+/);
      const cleanedWords = words.filter(word => !FILLER_WORDS.has(word));
      return {
        ...turn,
        text: cleanedWords.join(' ').trim(),
      };
    })
    .filter(turn => turn.text.length > 0); // Remove empty turns
}

// Get only last N turns (context minimization)
function getRecentTurns(turns: ConversationTurn[], maxTurns: number = 4): ConversationTurn[] {
  const cleaned = cleanTranscript(turns);
  return cleaned.slice(-maxTurns);
}

export function useWebSocket({
  url,
  onAudioChunk,
  onStreamEnd,
  onVoiceSuggestion,
  onMessage,
  autoConnect = true,
}: UseWebSocketProps): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(url);
      // Support binary frames for audio streaming
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        // Handle binary audio data
        if (event.data instanceof ArrayBuffer) {
          console.log('[WebSocket] Received binary audio chunk:', event.data.byteLength, 'bytes');
          onAudioChunk?.(event.data);
          return;
        }

        // Handle JSON messages
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received:', message.type);

          switch (message.type) {
            case 'voice_suggestion':
              // Legacy: full audio URL
              if (message.audio_url && onVoiceSuggestion) {
                onVoiceSuggestion(message.audio_url);
              }
              // Base64 full audio stream
              if (message.audio_stream && onAudioChunk) {
                const binaryString = atob(message.audio_stream);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                onAudioChunk(bytes.buffer);
                onStreamEnd?.();
              }
              break;

            case 'audio_chunk':
              // Base64 encoded audio chunk
              if (message.audio_chunk && onAudioChunk) {
                const binaryString = atob(message.audio_chunk);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                onAudioChunk(bytes.buffer);
              }
              break;

            case 'suggestion_end':
              // Stream finished
              console.log('[WebSocket] Audio stream ended');
              onStreamEnd?.();
              break;
          }

          onMessage?.(message);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      setIsConnecting(false);
      setError('Failed to create WebSocket connection');
    }
  }, [url, onAudioChunk, onStreamEnd, onVoiceSuggestion, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const sendPauseDetected = useCallback((snapshot: ConversationSnapshot) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Apply context minimization
      const minimalSnapshot: ConversationSnapshot = {
        lastTurns: getRecentTurns(snapshot.lastTurns, 4),
        lastSpokenAt: snapshot.lastSpokenAt,
        detectedLanguage: snapshot.detectedLanguage,
      };

      const message: WebSocketMessage = {
        type: 'pause_detected',
        conversation_snapshot: minimalSnapshot,
      };

      console.log('[WebSocket] Sending pause_detected with', minimalSnapshot.lastTurns.length, 'turns');
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send - not connected');
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    sendPauseDetected,
    connect,
    disconnect,
  };
}
