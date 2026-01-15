import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSilenceDetectionProps {
  lastSpokenAt: number | null;
  isListening: boolean;
  silenceThreshold?: number; // milliseconds
  onPauseDetected?: () => void;
}

interface UseSilenceDetectionReturn {
  isSpeaking: boolean;
  silenceDuration: number;
  isPaused: boolean;
  resetPause: () => void;
}

// Default silence threshold: 10 seconds
const DEFAULT_SILENCE_THRESHOLD = 10000;

export function useSilenceDetection({
  lastSpokenAt,
  isListening,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
  onPauseDetected,
}: UseSilenceDetectionProps): UseSilenceDetectionReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const lastSpokenAtRef = useRef(lastSpokenAt);
  const pauseTriggeredRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update ref when lastSpokenAt changes
  useEffect(() => {
    if (lastSpokenAt && lastSpokenAt !== lastSpokenAtRef.current) {
      lastSpokenAtRef.current = lastSpokenAt;
      setIsSpeaking(true);
      setIsPaused(false);
      pauseTriggeredRef.current = false;

      // Reset speaking state after a short delay
      const timeout = setTimeout(() => {
        setIsSpeaking(false);
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [lastSpokenAt]);

  // Track silence duration
  useEffect(() => {
    if (!isListening) {
      setSilenceDuration(0);
      setIsPaused(false);
      pauseTriggeredRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (lastSpokenAtRef.current) {
        const silence = Date.now() - lastSpokenAtRef.current;
        setSilenceDuration(silence);

        // Check if we've reached the pause threshold
        if (silence >= silenceThreshold && !pauseTriggeredRef.current) {
          pauseTriggeredRef.current = true;
          setIsPaused(true);
          console.log('[SilenceDetection] Pause detected after', silence, 'ms');
          onPauseDetected?.();
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isListening, silenceThreshold, onPauseDetected]);

  const resetPause = useCallback(() => {
    setIsPaused(false);
    pauseTriggeredRef.current = false;
    lastSpokenAtRef.current = Date.now();
    setSilenceDuration(0);
  }, []);

  return {
    isSpeaking,
    silenceDuration,
    isPaused,
    resetPause,
  };
}
