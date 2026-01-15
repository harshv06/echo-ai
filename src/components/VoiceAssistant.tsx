import { useState, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { VoiceIndicator } from './VoiceIndicator';
import { TranscriptDisplay } from './TranscriptDisplay';
import { StatusBar } from './StatusBar';
import { cn } from '@/lib/utils';

// WebSocket URL - configure this for your backend
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

// Silence threshold in ms
const SILENCE_THRESHOLD = 10000;

type AppState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function VoiceAssistant() {
  const [appState, setAppState] = useState<AppState>('idle');

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

  // Audio playback hook
  const {
    isPlaying: isAISpeaking,
    play: playAudio,
    stop: stopAudio,
  } = useAudioPlayback({
    volume: 0.7,
    onPlaybackStart: () => setAppState('speaking'),
    onPlaybackEnd: () => setAppState(isListening ? 'listening' : 'idle'),
  });

  // Handle voice suggestion from backend
  const handleVoiceSuggestion = useCallback(
    (audioUrl: string) => {
      // Don't play if user is actively speaking
      if (lastSpokenAt && Date.now() - lastSpokenAt < 1000) {
        console.log('[VoiceAssistant] Skipping audio - user is speaking');
        return;
      }
      playAudio(audioUrl);
    },
    [lastSpokenAt, playAudio]
  );

  // WebSocket hook
  const {
    isConnected,
    error: wsError,
    sendPauseDetected,
  } = useWebSocket({
    url: WS_URL,
    onVoiceSuggestion: handleVoiceSuggestion,
    autoConnect: true,
  });

  // Handle pause detection
  const handlePauseDetected = useCallback(() => {
    if (!isConnected) {
      console.log('[VoiceAssistant] Cannot send pause - not connected');
      return;
    }

    setAppState('thinking');

    // Send conversation snapshot to backend
    sendPauseDetected({
      lastTurns: recentTurns,
      lastSpokenAt,
      detectedLanguage,
    });
  }, [isConnected, sendPauseDetected, recentTurns, lastSpokenAt, detectedLanguage]);

  // Silence detection hook
  const { silenceDuration, isPaused, resetPause } = useSilenceDetection({
    lastSpokenAt,
    isListening,
    silenceThreshold: SILENCE_THRESHOLD,
    onPauseDetected: handlePauseDetected,
  });

  // Calculate silence progress (0-1)
  const silenceProgress = Math.min(silenceDuration / SILENCE_THRESHOLD, 1);

  // Stop AI audio if user starts speaking
  useEffect(() => {
    if (isAISpeaking && lastSpokenAt) {
      const timeSinceSpoke = Date.now() - lastSpokenAt;
      if (timeSinceSpoke < 500) {
        console.log('[VoiceAssistant] User interrupted - stopping audio');
        stopAudio();
        resetPause();
      }
    }
  }, [lastSpokenAt, isAISpeaking, stopAudio, resetPause]);

  // Update app state based on listening status
  useEffect(() => {
    if (!isAISpeaking) {
      if (isListening) {
        setAppState('listening');
      } else {
        setAppState('idle');
      }
    }
  }, [isListening, isAISpeaking]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      stopAudio();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening, stopAudio]);

  // Combined error
  const error = speechError || wsError;

  // Check browser support
  if (!isSupported) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass-card p-8 text-center max-w-md">
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-light tracking-wide text-foreground mb-2">
            Voice Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            Speak naturally • I'll listen and respond
          </p>
        </div>

        {/* Voice indicator - clickable to toggle */}
        <button
          onClick={toggleListening}
          className={cn(
            'focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full',
            'transition-transform hover:scale-105 active:scale-95'
          )}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
        >
          <VoiceIndicator
            state={appState}
            silenceProgress={appState === 'listening' ? silenceProgress : 0}
          />
        </button>

        {/* Transcript display */}
        <TranscriptDisplay
          recentTurns={recentTurns}
          interimTranscript={interimTranscript}
          className="w-full max-w-lg"
        />

        {/* Instructions */}
        <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
          {appState === 'idle' && 'Click the orb to start listening'}
          {appState === 'listening' && 'Speak naturally. I\'ll suggest responses after 10 seconds of silence.'}
          {appState === 'thinking' && 'Processing your conversation...'}
          {appState === 'speaking' && 'Speak to interrupt at any time'}
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
