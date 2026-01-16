/**
 * Silence Detection Hook (Optimized)
 * 
 * Detects conversation pauses with configurable threshold and cooldown.
 * Implements cost-saving logic to reduce backend calls.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSilenceDetectionProps {
  lastSpokenAt: number | null;
  isListening: boolean;
  silenceThreshold?: number; // milliseconds (default 5000)
  cooldownPeriod?: number;   // milliseconds (default 30000)
  onPauseDetected?: () => void;
}

interface UseSilenceDetectionReturn {
  isSpeaking: boolean;
  silenceDuration: number;
  isPaused: boolean;
  isInCooldown: boolean;
  resetPause: () => void;
  updateLastSuggestionTime: () => void;
}

// Configurable constants
const DEFAULT_SILENCE_THRESHOLD = 5000;  // 5 seconds (reduced from 10)
const DEFAULT_COOLDOWN_PERIOD = 30000;   // 30 seconds cooldown

export function useSilenceDetection({
  lastSpokenAt,
  isListening,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
  cooldownPeriod = DEFAULT_COOLDOWN_PERIOD,
  onPauseDetected,
}: UseSilenceDetectionProps): UseSilenceDetectionReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInCooldown, setIsInCooldown] = useState(false);

  const lastSpokenAtRef = useRef(lastSpokenAt);
  const pauseTriggeredRef = useRef(false);
  const lastSuggestionTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update last suggestion time (called when AI finishes speaking)
  const updateLastSuggestionTime = useCallback(() => {
    if (cooldownPeriod <= 0) {
      return;
    }
    lastSuggestionTimeRef.current = Date.now();
    setIsInCooldown(true);
    console.log('[SilenceDetection] Cooldown started');
  }, []);

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

  // Track silence duration with cooldown logic
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
      const now = Date.now();

      // Check cooldown status
      if (cooldownPeriod > 0 && lastSuggestionTimeRef.current) {
        const timeSinceSuggestion = now - lastSuggestionTimeRef.current;
        if (timeSinceSuggestion < cooldownPeriod) {
          setIsInCooldown(true);
        } else {
          setIsInCooldown(false);
        }
      }

      if (lastSpokenAtRef.current) {
        const silence = now - lastSpokenAtRef.current;
        setSilenceDuration(silence);

        // Check if we've reached the pause threshold
        if (silence >= silenceThreshold && !pauseTriggeredRef.current) {
          // Check cooldown - don't trigger if in cooldown
          if (cooldownPeriod > 0 && lastSuggestionTimeRef.current) {
            const timeSinceSuggestion = now - lastSuggestionTimeRef.current;
            if (timeSinceSuggestion < cooldownPeriod) {
              console.log('[SilenceDetection] In cooldown, skipping pause trigger');
              return;
            }
          }

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
  }, [isListening, silenceThreshold, cooldownPeriod, onPauseDetected]);

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
    isInCooldown,
    resetPause,
    updateLastSuggestionTime,
  };
}
