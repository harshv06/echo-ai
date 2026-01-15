import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioPlaybackProps {
  volume?: number;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

interface UseAudioPlaybackReturn {
  isPlaying: boolean;
  play: (audioUrl: string) => Promise<void>;
  stop: () => void;
  currentUrl: string | null;
}

export function useAudioPlayback({
  volume = 0.7, // Slightly lower than normal as per requirements
  onPlaybackStart,
  onPlaybackEnd,
}: UseAudioPlaybackProps = {}): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentUrl(null);
    onPlaybackEnd?.();
  }, [onPlaybackEnd]);

  const play = useCallback(async (audioUrl: string) => {
    // Stop any currently playing audio
    stop();

    try {
      const audio = new Audio(audioUrl);
      audio.volume = volume;
      audio.crossOrigin = 'anonymous';

      audioRef.current = audio;
      setCurrentUrl(audioUrl);

      audio.onplay = () => {
        setIsPlaying(true);
        onPlaybackStart?.();
        console.log('[AudioPlayback] Started playing');
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentUrl(null);
        onPlaybackEnd?.();
        console.log('[AudioPlayback] Finished playing');
      };

      audio.onerror = (e) => {
        console.error('[AudioPlayback] Error:', e);
        setIsPlaying(false);
        setCurrentUrl(null);
        onPlaybackEnd?.();
      };

      await audio.play();
    } catch (e) {
      console.error('[AudioPlayback] Failed to play:', e);
      setIsPlaying(false);
      setCurrentUrl(null);
    }
  }, [volume, stop, onPlaybackStart, onPlaybackEnd]);

  return {
    isPlaying,
    play,
    stop,
    currentUrl,
  };
}
