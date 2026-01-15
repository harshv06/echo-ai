import { useState, useEffect, useRef, useCallback } from 'react';

interface ConversationSnapshot {
  lastTurns: Array<{ text: string; timestamp: number }>;
  lastSpokenAt: number | null;
  detectedLanguage: string;
}

interface WebSocketMessage {
  type: string;
  conversation_snapshot?: ConversationSnapshot;
  audio_url?: string;
  audio_stream?: string;
  [key: string]: unknown;
}

interface UseWebSocketProps {
  url: string;
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

export function useWebSocket({
  url,
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

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('[WebSocket] Received:', message.type);

          // Handle voice suggestion
          if (message.type === 'voice_suggestion') {
            const audioUrl = message.audio_url || message.audio_stream;
            if (audioUrl && onVoiceSuggestion) {
              onVoiceSuggestion(audioUrl);
            }
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
  }, [url, onVoiceSuggestion, onMessage]);

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
      const message: WebSocketMessage = {
        type: 'pause_detected',
        conversation_snapshot: snapshot,
      };

      console.log('[WebSocket] Sending pause_detected');
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
