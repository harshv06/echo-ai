import { useState, useRef, useCallback, useEffect } from 'react';

const SAMPLE_RATE = 16000;

interface UseAudioCaptureProps {
    onAudioData: (data: ArrayBuffer) => void;
}

interface UseAudioCaptureReturn {
    isCapturing: boolean;
    isSupported: boolean;
    error: string | null;
    startCapture: () => Promise<void>;
    stopCapture: () => void;
}

export function useAudioCapture({ onAudioData }: UseAudioCaptureProps): UseAudioCaptureReturn {
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopCapture = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCapturing(false);
    }, []);

    const startCapture = useCallback(async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });
            streamRef.current = stream;

            const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            // Create a ScriptProcessor to get raw PCM data
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                onAudioData(pcmData.buffer);
            };

            setIsCapturing(true);
        } catch (err) {
            console.error('[AudioCapture] Error starting capture:', err);
            setError('Microphone access denied or error');
            throw err;
        }
    }, [onAudioData]);

    useEffect(() => {
        return () => {
            stopCapture();
        };
    }, [stopCapture]);

    return {
        isCapturing,
        isSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        error,
        startCapture,
        stopCapture,
    };
}
