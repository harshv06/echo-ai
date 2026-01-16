import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SpeechRecognition,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
} from '@/types/speech-recognition';

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  recentTurns: Array<{ text: string; timestamp: number }>;
  detectedLanguage: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  lastSpokenAt: number | null;
  refreshRecognition: () => void;
}

// Buffer duration in milliseconds (60 minutes)
const BUFFER_DURATION = 3600000;
// Watchdog timeout - restart if no results for this long while listening
const WATCHDOG_TIMEOUT = 10000; // 10 seconds - aggressive recovery
// Delay before auto-restart to prevent rapid restarts
const RESTART_DELAY = 150; // 150ms
// Watchdog check interval
const WATCHDOG_CHECK_INTERVAL = 2000; // Check every 2 seconds

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recentTurns, setRecentTurns] = useState<Array<{ text: string; timestamp: number }>>([]);
  const [detectedLanguage, setDetectedLanguage] = useState('en-US');
  const [error, setError] = useState<string | null>(null);
  const [lastSpokenAt, setLastSpokenAt] = useState<number | null>(null);
  const [lastResultTime, setLastResultTime] = useState<number>(Date.now());

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSupported = isSpeechRecognitionSupported();

  // Clean up old entries from the buffer
  const cleanBuffer = useCallback(() => {
    const cutoff = Date.now() - BUFFER_DURATION;
    setRecentTurns(prev => prev.filter(turn => turn.timestamp > cutoff));
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser');
      return;
    }

    // Stop any existing instance first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null; // Prevent cascading restarts
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    setError(null);

    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      setError('Speech recognition is not available');
      return;
    }

    const recognition = new SpeechRecognitionClass();

    recognition.continuous = true;
    recognition.interimResults = true;
    // Support multiple languages - let browser auto-detect
    recognition.lang = 'en-US'; // Primary, but will understand Hindi/Hinglish
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      console.log('[SpeechRecognition] Started listening');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Update last result time for watchdog
      setLastResultTime(Date.now());

      let finalTranscript = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += text;

          // Add to recent turns buffer
          const newTurn = { text: text.trim(), timestamp: Date.now() };
          setRecentTurns(prev => {
            const updated = [...prev, newTurn];
            // Keep only last 60 seconds
            const cutoff = Date.now() - BUFFER_DURATION;
            return updated.filter(turn => turn.timestamp > cutoff);
          });

          setLastSpokenAt(Date.now());

          // Try to detect language from result
          if (result[0].confidence) {
            // Simple heuristic for Hindi detection
            const hasDevanagari = /[\u0900-\u097F]/.test(text);
            if (hasDevanagari) {
              setDetectedLanguage('hi-IN');
            }
          }
        } else {
          interimText += text;
          setLastSpokenAt(Date.now());
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] Error:', event.error);

      if (event.error === 'not-allowed') {
        setError('Microphone permission denied');
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // This is normal during silence, don't treat as error
      } else if (event.error === 'network') {
        setError('Network error - check your connection');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('[SpeechRecognition] Ended');

      // Clear any pending restart
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }

      // Auto-restart if we're supposed to be listening
      // Check if this instance is still keeping the ref alive
      if (recognitionRef.current === recognition) {
        // Hard reset: Create a NEW instance instead of restarting the old one
        restartTimeoutRef.current = setTimeout(() => {
          // Double check we're still active
          if (recognitionRef.current === recognition) {
            console.log('[SpeechRecognition] Auto-restarting with fresh instance...');
            startListening();
          }
        }, RESTART_DELAY);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setError('Failed to start speech recognition');
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    // Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Remove handler to prevent restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Periodically clean buffer
  useEffect(() => {
    const interval = setInterval(cleanBuffer, 10000);
    return () => clearInterval(interval);
  }, [cleanBuffer]);

  // Manual refresh function - Hard Reset
  const refreshRecognition = useCallback(() => {
    console.log('[SpeechRecognition] Hard refresh triggered');

    // 1. Clear any pending restart
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    // 2. Stop current instance and prevent its auto-restart
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }

    // 3. Start fresh immediately
    setTimeout(() => {
      if (isListening) startListening();
    }, 100);

  }, [isListening, startListening]);

  // Preventive periodic restart - force restart every 50 seconds
  // This prevents the browser's built-in timeout from stopping recognition
  useEffect(() => {
    if (!isListening) return;

    const preventiveRestartInterval = setInterval(() => {
      console.log('[SpeechRecognition] Preventive restart (50s cycle)');
      refreshRecognition();
    }, 50000); // Restart every 50 seconds (before browser's ~60s timeout)

    return () => clearInterval(preventiveRestartInterval);
  }, [isListening, refreshRecognition]);

  // Watchdog: detect when recognition gets stuck
  // Only triggers if user was recently speaking but stopped getting results
  useEffect(() => {
    if (!isListening) return;

    const watchdogInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceResult = now - lastResultTime;
      const timeSinceSpoken = lastSpokenAt ? now - lastSpokenAt : Infinity;

      // Only trigger watchdog if:
      // 1. No results for WATCHDOG_TIMEOUT (10s)
      // 2. AND user was speaking recently (within 30s)
      // This prevents unnecessary refreshes when user is just silent
      if (timeSinceResult > WATCHDOG_TIMEOUT && timeSinceSpoken < 30000) {
        console.warn('[SpeechRecognition] No results for', timeSinceResult, 'ms (user was speaking) - auto-refreshing...');
        refreshRecognition();
        setLastResultTime(Date.now()); // Reset to prevent rapid refreshes
      }
    }, WATCHDOG_CHECK_INTERVAL);

    return () => clearInterval(watchdogInterval);
  }, [isListening, lastResultTime, lastSpokenAt, refreshRecognition]);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    recentTurns,
    detectedLanguage,
    error,
    startListening,
    stopListening,
    lastSpokenAt,
    refreshRecognition,
  };
}
