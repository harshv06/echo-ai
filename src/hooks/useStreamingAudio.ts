/**
 * Streaming Audio Playback Hook
 * 
 * Handles streaming audio chunks with a single AudioContext.
 * Optimized for low latency and minimal CPU usage.
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseStreamingAudioProps {
  volume?: number;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

interface UseStreamingAudioReturn {
  isPlaying: boolean;
  play: (audioData: ArrayBuffer | string) => Promise<void>;
  queueChunk: (audioData: ArrayBuffer) => void;
  stop: () => void;
  finishStream: () => void;
}

// Single AudioContext instance - reused across the app
let sharedAudioContext: AudioContext | null = null;
let audioContextResumed = false;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext({ sampleRate: 24000 });
  }
  return sharedAudioContext;
}

// Resume AudioContext on user interaction (required by browsers)
export async function resumeAudioContext(): Promise<void> {
  if (audioContextResumed) return;
  
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
    audioContextResumed = true;
    console.log('[StreamingAudio] AudioContext resumed');
  }
}

export function useStreamingAudio({
  volume = 0.7,
  onPlaybackStart,
  onPlaybackEnd,
}: UseStreamingAudioProps = {}): UseStreamingAudioReturn {
  const [isPlaying, setIsPlaying] = useState(false);

  // Buffer queue for streaming chunks
  const chunkQueueRef = useRef<ArrayBuffer[]>([]);
  const isStreamingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const playbackStartedRef = useRef(false);

  // Initialize gain node
  useEffect(() => {
    const ctx = getAudioContext();
    gainNodeRef.current = ctx.createGain();
    gainNodeRef.current.gain.value = volume;
    gainNodeRef.current.connect(ctx.destination);

    return () => {
      gainNodeRef.current?.disconnect();
      gainNodeRef.current = null;
    };
  }, [volume]);

  // Update volume dynamically
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Process queued chunks
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || chunkQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    const ctx = getAudioContext();

    while (chunkQueueRef.current.length > 0) {
      const chunk = chunkQueueRef.current.shift();
      if (!chunk) continue;

      try {
        // Decode audio data
        const audioBuffer = await ctx.decodeAudioData(chunk.slice(0));
        
        // Create source node
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNodeRef.current!);
        
        // Track source for cleanup
        sourceNodesRef.current.push(source);

        // Schedule playback
        const currentTime = ctx.currentTime;
        const startTime = Math.max(currentTime, nextPlayTimeRef.current);
        
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;

        // First chunk - mark as playing
        if (!playbackStartedRef.current) {
          playbackStartedRef.current = true;
          setIsPlaying(true);
          onPlaybackStart?.();
          console.log('[StreamingAudio] Playback started');
        }

        // Clean up when done
        source.onended = () => {
          const idx = sourceNodesRef.current.indexOf(source);
          if (idx > -1) sourceNodesRef.current.splice(idx, 1);
          
          // Check if all done
          if (!isStreamingRef.current && 
              chunkQueueRef.current.length === 0 && 
              sourceNodesRef.current.length === 0) {
            playbackStartedRef.current = false;
            setIsPlaying(false);
            onPlaybackEnd?.();
            console.log('[StreamingAudio] Playback ended');
          }
        };
      } catch (e) {
        console.error('[StreamingAudio] Failed to decode chunk:', e);
      }
    }

    isProcessingRef.current = false;
  }, [onPlaybackStart, onPlaybackEnd]);

  // Queue a new audio chunk
  const queueChunk = useCallback((audioData: ArrayBuffer) => {
    isStreamingRef.current = true;
    chunkQueueRef.current.push(audioData);
    processQueue();
  }, [processQueue]);

  // Mark stream as finished
  const finishStream = useCallback(() => {
    isStreamingRef.current = false;
    console.log('[StreamingAudio] Stream finished');
  }, []);

  // Stop playback immediately
  const stop = useCallback(() => {
    // Stop all source nodes
    sourceNodesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Already stopped
      }
    });
    sourceNodesRef.current = [];
    
    // Clear queue
    chunkQueueRef.current = [];
    isStreamingRef.current = false;
    isProcessingRef.current = false;
    nextPlayTimeRef.current = 0;
    playbackStartedRef.current = false;
    
    setIsPlaying(false);
    onPlaybackEnd?.();
    console.log('[StreamingAudio] Playback stopped');
  }, [onPlaybackEnd]);

  // Play a single audio file (for backwards compatibility)
  const play = useCallback(async (audioData: ArrayBuffer | string) => {
    stop();
    await resumeAudioContext();

    try {
      let buffer: ArrayBuffer;
      
      if (typeof audioData === 'string') {
        // URL - fetch it
        const response = await fetch(audioData);
        buffer = await response.arrayBuffer();
      } else {
        buffer = audioData;
      }

      queueChunk(buffer);
      finishStream();
    } catch (e) {
      console.error('[StreamingAudio] Failed to play:', e);
    }
  }, [stop, queueChunk, finishStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isPlaying,
    play,
    queueChunk,
    stop,
    finishStream,
  };
}
