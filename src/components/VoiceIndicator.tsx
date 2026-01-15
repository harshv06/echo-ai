import { cn } from '@/lib/utils';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceIndicatorProps {
  state: VoiceState;
  silenceProgress?: number; // 0-1 progress toward pause threshold
  className?: string;
}

export function VoiceIndicator({ state, silenceProgress = 0, className }: VoiceIndicatorProps) {
  const stateConfig = {
    idle: {
      label: 'Tap to start',
      ringClass: 'border-muted-foreground/30',
      glowClass: '',
      dotClass: 'bg-muted-foreground/50',
    },
    listening: {
      label: 'Listening...',
      ringClass: 'border-primary',
      glowClass: 'glow-primary',
      dotClass: 'bg-primary',
    },
    thinking: {
      label: 'Thinking...',
      ringClass: 'border-muted-foreground',
      glowClass: 'glow-muted',
      dotClass: 'bg-muted-foreground',
    },
    speaking: {
      label: 'AI Speaking',
      ringClass: 'border-accent',
      glowClass: 'glow-accent',
      dotClass: 'bg-accent',
    },
  };

  const config = stateConfig[state];

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      {/* Main indicator orb */}
      <div className="relative">
        {/* Outer glow rings */}
        {state !== 'idle' && (
          <>
            <div
              className={cn(
                'absolute inset-0 rounded-full border-2 animate-ripple',
                config.ringClass,
                'opacity-30'
              )}
              style={{ animationDelay: '0s' }}
            />
            <div
              className={cn(
                'absolute inset-0 rounded-full border-2 animate-ripple',
                config.ringClass,
                'opacity-20'
              )}
              style={{ animationDelay: '0.5s' }}
            />
            <div
              className={cn(
                'absolute inset-0 rounded-full border-2 animate-ripple',
                config.ringClass,
                'opacity-10'
              )}
              style={{ animationDelay: '1s' }}
            />
          </>
        )}

        {/* Main orb */}
        <div
          className={cn(
            'relative w-32 h-32 rounded-full border-2 flex items-center justify-center',
            'transition-all duration-500',
            config.ringClass,
            config.glowClass,
            state !== 'idle' && 'animate-pulse-glow'
          )}
        >
          {/* Inner content based on state */}
          {state === 'speaking' ? (
            <WaveformBars />
          ) : state === 'thinking' ? (
            <ThinkingDots />
          ) : (
            <div
              className={cn(
                'w-4 h-4 rounded-full transition-all duration-300',
                config.dotClass,
                state === 'listening' && 'w-6 h-6 animate-pulse'
              )}
            />
          )}
        </div>

        {/* Silence progress ring (only when listening) */}
        {state === 'listening' && silenceProgress > 0 && (
          <svg
            className="absolute inset-0 w-32 h-32 -rotate-90"
            viewBox="0 0 128 128"
          >
            <circle
              cx="64"
              cy="64"
              r="62"
              fill="none"
              stroke="hsl(var(--muted-foreground) / 0.2)"
              strokeWidth="2"
            />
            <circle
              cx="64"
              cy="64"
              r="62"
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="2"
              strokeDasharray={`${silenceProgress * 389.6} 389.6`}
              className="transition-all duration-100"
            />
          </svg>
        )}
      </div>

      {/* State label */}
      <span
        className={cn(
          'text-sm font-medium tracking-wide uppercase',
          state === 'idle' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {config.label}
      </span>
    </div>
  );
}

function WaveformBars() {
  return (
    <div className="flex items-center gap-1 h-8">
      {[0, 0.1, 0.2, 0.15, 0.25].map((delay, i) => (
        <div
          key={i}
          className="w-1.5 bg-accent rounded-full animate-wave"
          style={{
            height: '100%',
            animationDelay: `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2">
      {[0, 0.2, 0.4].map((delay, i) => (
        <div
          key={i}
          className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
