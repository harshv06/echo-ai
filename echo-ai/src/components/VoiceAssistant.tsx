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
import { useStreamingAudio, resumeAudioContext } from '@/hooks/useStreamingAudio';
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

  // Streaming audio playback hook
  const {
    isPlaying: isAISpeaking,
    queueChunk,
    stop: stopAudio,
    finishStream,
  } = useStreamingAudio({
    volume: 0.7,
    onPlaybackStart: () => {
      setAppState('speaking');
      if (isListening) {
        shouldResumeListeningRef.current = true;
        stopListening();
      }
    },
    onPlaybackEnd: () => {
      setAppState(isListening ? 'listening' : 'idle');
      if (shouldResumeListeningRef.current) {
        shouldResumeListeningRef.current = false;
        startListening();
      }
    },
  });

  // Handle incoming audio chunks
  const handleAudioChunk = useCallback((audioData: ArrayBuffer) => {
    queueChunk(audioData);
  }, [queueChunk]);

  // Handle stream end
  const handleStreamEnd = useCallback(() => {
    finishStream();
  }, [finishStream]);

  // Handle legacy voice suggestion (full URL)
  const handleVoiceSuggestion = useCallback((audioUrl: string) => {
    // Fetch and queue as single chunk
    fetch(audioUrl)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        queueChunk(buffer);
        finishStream();
      })
      .catch(e => console.error('[VoiceAssistant] Failed to fetch audio:', e));
  }, [queueChunk, finishStream]);

  // WebSocket hook with streaming support
  const {
    isConnected,
    error: wsError,
    sendPauseDetected,
  } = useWebSocket({
    url: WS_URL,
    onAudioChunk: handleAudioChunk,
    onStreamEnd: handleStreamEnd,
    onVoiceSuggestion: handleVoiceSuggestion,
    autoConnect: true,
  });

  // Handle pause detection
  const handlePauseDetected = useCallback(() => {
    if (!isConnected) {
      console.log('[VoiceAssistant] Cannot send pause - not connected');
      return;
    }

    // Don't send if AI is currently speaking
    if (isAISpeaking) {
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
    isAISpeaking,
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
    if (!isAISpeaking && appState === 'speaking') {
      updateLastSuggestionTime();
    }
  }, [isAISpeaking, appState, updateLastSuggestionTime]);

  // Update app state based on listening status
  useEffect(() => {
    if (!isAISpeaking) {
      setAppState(isListening ? 'listening' : 'idle');
    }
  }, [isListening, isAISpeaking]);

  // Manual stop handler
  const handleStopAudio = useCallback(() => {
    stopAudio();
    resetPause();
    console.log('[VoiceAssistant] Manual stop triggered');
  }, [stopAudio, resetPause]);

  // Toggle listening (also resumes AudioContext)
  const toggleListening = useCallback(async () => {
    // Resume AudioContext on user interaction
    await resumeAudioContext();

    if (isListening) {
      stopListening();
      stopAudio();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening, stopAudio]);

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
          visible={isAISpeaking}
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
