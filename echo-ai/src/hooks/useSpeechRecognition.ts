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
}

// Buffer duration in milliseconds (60 seconds)
const BUFFER_DURATION = 60000;

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recentTurns, setRecentTurns] = useState<Array<{ text: string; timestamp: number }>>([]);
  const [detectedLanguage, setDetectedLanguage] = useState('en-US');
  const [error, setError] = useState<string | null>(null);
  const [lastSpokenAt, setLastSpokenAt] = useState<number | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
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
      // Auto-restart if we're supposed to be listening
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.log('[SpeechRecognition] Could not restart');
          setIsListening(false);
        }
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
    if (recognitionRef.current) {
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
  };
}
