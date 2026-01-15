/**
 * Voice Activity Detection Hook (RMS-based)
 * 
 * Monitors microphone input to detect sustained user speech.
 * Used to determine intentional interruption vs. backchannel sounds.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceActivityDetectionProps {
  // RMS threshold above ambient to consider as speech
  rmsThreshold?: number;
  // Duration thresholds in ms
  backchannelThreshold?: number;  // < this = ignore (600ms)
  interruptionThreshold?: number; // >= this = interruption candidate (1200ms)
  enabled?: boolean;
}

interface UseVoiceActivityDetectionReturn {
  isSpeaking: boolean;
  speechDuration: number;
  currentRms: number;
  ambientRms: number;
  isInterruptionCandidate: boolean;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
}

// Constants
const BACKCHANNEL_THRESHOLD = 600;
const INTERRUPTION_THRESHOLD = 1200;
const RMS_THRESHOLD = 0.02; // Minimum RMS above ambient

export function useVoiceActivityDetection({
  rmsThreshold = RMS_THRESHOLD,
  backchannelThreshold = BACKCHANNEL_THRESHOLD,
  interruptionThreshold = INTERRUPTION_THRESHOLD,
  enabled = true,
}: UseVoiceActivityDetectionProps = {}): UseVoiceActivityDetectionReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechDuration, setSpeechDuration] = useState(0);
  const [currentRms, setCurrentRms] = useState(0);
  const [ambientRms, setAmbientRms] = useState(0.01);
  const [isInterruptionCandidate, setIsInterruptionCandidate] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const speechStartTimeRef = useRef<number | null>(null);
  const ambientSamplesRef = useRef<number[]>([]);
  const isSpeakingRef = useRef(false);

  // Calculate RMS from audio data
  const calculateRms = useCallback((dataArray: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  // Update ambient noise level
  const updateAmbient = useCallback((rms: number) => {
    if (!isSpeakingRef.current && rms < 0.1) {
      ambientSamplesRef.current.push(rms);
      // Keep last 50 samples
      if (ambientSamplesRef.current.length > 50) {
        ambientSamplesRef.current.shift();
      }
      // Calculate average ambient
      const avg = ambientSamplesRef.current.reduce((a, b) => a + b, 0) / 
                  ambientSamplesRef.current.length;
      setAmbientRms(avg);
    }
  }, []);

  // Monitor audio levels
  const monitorAudio = useCallback(() => {
    if (!analyserRef.current || !enabled) return;

    const dataArray = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(dataArray);

    const rms = calculateRms(dataArray);
    setCurrentRms(rms);
    updateAmbient(rms);

    const isAboveThreshold = rms > ambientRms + rmsThreshold;

    if (isAboveThreshold) {
      if (!isSpeakingRef.current) {
        // Speech started
        isSpeakingRef.current = true;
        speechStartTimeRef.current = Date.now();
        setIsSpeaking(true);
        setIsInterruptionCandidate(false);
      } else {
        // Speech continuing
        const duration = Date.now() - (speechStartTimeRef.current || 0);
        setSpeechDuration(duration);

        // Check if this is an interruption candidate
        if (duration >= interruptionThreshold) {
          setIsInterruptionCandidate(true);
        }
      }
    } else {
      if (isSpeakingRef.current) {
        const duration = Date.now() - (speechStartTimeRef.current || 0);
        
        // Only mark as not speaking after some silence
        if (duration > 100) {
          // Check if this was meaningful speech or backchannel
          if (duration < backchannelThreshold) {
            // Backchannel - ignore
            console.log('[VAD] Backchannel detected:', duration, 'ms');
          }
          
          isSpeakingRef.current = false;
          speechStartTimeRef.current = null;
          setIsSpeaking(false);
          setSpeechDuration(0);
          setIsInterruptionCandidate(false);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorAudio);
  }, [enabled, rmsThreshold, calculateRms, updateAmbient, ambientRms, 
      backchannelThreshold, interruptionThreshold]);

  // Start monitoring
  const startMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start monitoring loop
      monitorAudio();
      console.log('[VAD] Started monitoring');
    } catch (e) {
      console.error('[VAD] Failed to start:', e);
    }
  }, [monitorAudio]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    setIsSpeaking(false);
    setSpeechDuration(0);
    setIsInterruptionCandidate(false);
    console.log('[VAD] Stopped monitoring');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    isSpeaking,
    speechDuration,
    currentRms,
    ambientRms,
    isInterruptionCandidate,
    startMonitoring,
    stopMonitoring,
  };
}
