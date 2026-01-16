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
  const shouldRestartRef = useRef(false);
  const isSupported = isSpeechRecognitionSupported();

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

    if (recognitionRef.current) {
      shouldRestartRef.current = true;
      try {
        recognitionRef.current.start();
      } catch (e) {
        // ignore if already started
      }
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      setError('Speech recognition is not available');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      shouldRestartRef.current = true;
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
          const newTurn = { text: text.trim(), timestamp: Date.now() };
          setRecentTurns(prev => {
            const updated = [...prev, newTurn];
            const cutoff = Date.now() - BUFFER_DURATION;
            return updated.filter(turn => turn.timestamp > cutoff);
          });
          setLastSpokenAt(Date.now());

          if (result[0].confidence) {
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
        shouldRestartRef.current = false;
      } else if (event.error !== 'no-speech') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('[SpeechRecognition] Ended');
      if (recognitionRef.current && shouldRestartRef.current) {
        try {
          recognition.start();
        } catch (e) {
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
      shouldRestartRef.current = false;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

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
