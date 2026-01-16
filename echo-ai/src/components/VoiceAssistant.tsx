/**
 * Voice Assistant Component (Optimized MVP)
 * 
 * Core changes implemented:
 * 1. Streaming audio playback with chunk queuing
 * 2. Smart user speech handling (no auto-interrupt)
 * 3. Manual stop control button
 * 4. Pause detection with cooldown (cost saving)
 * 5. Context minimization (last 4 turns, no fillers)
 * 6. Single AudioContext, binary WebSocket support
 * 7. Minimal UI with 3 states
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';
import { useWebSocket } from '@/hooks/useWebSocket';
import { resumeAudioContext } from '@/hooks/useStreamingAudio';
import { VoiceIndicator } from './VoiceIndicator';
import { TranscriptDisplay } from './TranscriptDisplay';
import { StatusBar } from './StatusBar';
import { StopButton } from './StopButton';
import { cn } from '@/lib/utils';

// Configuration constants
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
const SILENCE_THRESHOLD = 7000;   // 7 seconds (aligned with backend trigger)
const COOLDOWN_PERIOD = 30000;    // 30 seconds between suggestions

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function VoiceAssistant() {
  const [appState, setAppState] = useState<AppState>('idle');
  const shouldResumeListeningRef = useRef(false);
  const silenceDurationRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Speech recognition hook
  const {
    isListening,
    isSupported,
    interimTranscript,
    recentTurns,
    detectedLanguage,
    error: speechError,
    startListening,
    stopListening,
    lastSpokenAt,
  } = useSpeechRecognition();

  const stopSpeech = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setAppState(isListening ? 'listening' : 'idle');
  }, [isListening]);

  const speakSuggestion = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[VoiceAssistant] SpeechSynthesis not supported');
      return;
    }

    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utteranceRef.current = utterance;

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setAppState('speaking');
      if (isListening) {
        shouldResumeListeningRef.current = true;
        stopListening();
      }
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setAppState(isListening ? 'listening' : 'idle');
      if (shouldResumeListeningRef.current) {
        shouldResumeListeningRef.current = false;
        startListening();
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [isListening, stopListening, startListening, stopSpeech]);

  const handleTextSuggestion = useCallback((text: string) => {
    speakSuggestion(text);
  }, [speakSuggestion]);

  // WebSocket hook with streaming support
  const {
    isConnected,
    error: wsError,
    sendPauseDetected,
  } = useWebSocket({
    url: WS_URL,
    onTextSuggestion: handleTextSuggestion,
    autoConnect: true,
  });

  // Handle pause detection
  const handlePauseDetected = useCallback(() => {
    if (!isConnected) {
      console.log('[VoiceAssistant] Cannot send pause - not connected');
      return;
    }

    // Don't send if AI is currently speaking
    if (isSpeakingRef.current) {
      console.log('[VoiceAssistant] Skipping pause - AI is speaking');
      return;
    }

    setAppState('thinking');

    const silenceSeconds = Math.max(0, silenceDurationRef.current / 1000);
    const baseConfidence = Math.max(0, 1 - silenceSeconds / 15);
    const turnBoost = Math.min(recentTurns.length / 6, 0.2);
    const confidenceScore = Math.min(1, Math.max(0, baseConfidence + turnBoost));

    const normalizedLanguage = detectedLanguage.startsWith('hi')
      ? 'hindi'
      : 'english';

    // Send minimal conversation snapshot to backend
    sendPauseDetected({
      lastTurns: recentTurns,
      lastSpokenAt: lastSpokenAt ? Math.floor(lastSpokenAt / 1000) : null,
      detectedLanguage: normalizedLanguage,
      confidenceScore,
    });
  }, [
    isConnected,
    sendPauseDetected,
    recentTurns,
    lastSpokenAt,
    detectedLanguage,
  ]);

  // Silence detection hook with cooldown
  const { 
    silenceDuration, 
    resetPause,
    updateLastSuggestionTime,
    isInCooldown,
  } = useSilenceDetection({
    lastSpokenAt,
    isListening,
    silenceThreshold: SILENCE_THRESHOLD,
    cooldownPeriod: COOLDOWN_PERIOD,
    onPauseDetected: handlePauseDetected,
  });

  useEffect(() => {
    silenceDurationRef.current = silenceDuration;
  }, [silenceDuration]);

  // Calculate silence progress (0-1)
  const silenceProgress = isInCooldown ? 0 : Math.min(silenceDuration / SILENCE_THRESHOLD, 1);

  // Update cooldown when AI finishes speaking
  useEffect(() => {
    if (!isSpeakingRef.current && appState === 'speaking') {
      updateLastSuggestionTime();
    }
  }, [appState, updateLastSuggestionTime]);

  // Update app state based on listening status
  useEffect(() => {
    if (!isSpeakingRef.current) {
      setAppState(isListening ? 'listening' : 'idle');
    }
  }, [isListening]);

  // Manual stop handler
  const handleStopAudio = useCallback(() => {
    stopSpeech();
    resetPause();
    console.log('[VoiceAssistant] Manual stop triggered');
  }, [stopSpeech, resetPause]);

  // Toggle listening (also resumes AudioContext)
  const toggleListening = useCallback(async () => {
    // Resume AudioContext on user interaction
    await resumeAudioContext();

    if (isListening) {
      stopListening();
      stopSpeech();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening, stopSpeech]);

  // Combined error
  const error = speechError || wsError;

  // Browser support check
  if (!isSupported) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="p-8 text-center max-w-md border border-border rounded-lg">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Browser Not Supported
          </h2>
          <p className="text-muted-foreground">
            Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        {/* Header - minimal */}
        <div className="text-center">
          <h1 className="text-xl font-light tracking-wide text-foreground">
            Voice Assistant
          </h1>
        </div>

        {/* Voice indicator - clickable to toggle */}
        <button
          onClick={toggleListening}
          className={cn(
            'focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full',
            'transition-transform active:scale-95'
          )}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
        >
          <VoiceIndicator
            state={appState}
            silenceProgress={appState === 'listening' ? silenceProgress : 0}
          />
        </button>

        {/* Stop button - only visible when AI is speaking */}
        <StopButton
          onClick={handleStopAudio}
          visible={isSpeakingRef.current}
        />

        {/* Transcript display */}
        <TranscriptDisplay
          recentTurns={recentTurns}
          interimTranscript={interimTranscript}
          className="w-full max-w-lg"
        />

        {/* Minimal instructions */}
        <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
          {appState === 'idle' && 'Tap to start'}
          {appState === 'listening' && (isInCooldown ? 'Listening... (cooldown active)' : 'Listening...')}
          {appState === 'thinking' && 'Processing...'}
          {appState === 'speaking' && 'AI responding'}
        </p>
      </div>

      {/* Status bar */}
      <div className="p-4 border-t border-border/50">
        <StatusBar
          isListening={isListening}
          isConnected={isConnected}
          error={error}
          className="max-w-lg mx-auto"
        />
      </div>
    </div>
  );
}
