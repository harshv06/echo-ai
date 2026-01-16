/**
 * Voice Indicator Component (Minimal UI)
 * 
 * Shows only 3 states with subtle visual changes.
 * No heavy animations to minimize CPU usage.
 */
import { cn } from '@/lib/utils';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceIndicatorProps {
  state: VoiceState;
  silenceProgress?: number;
  className?: string;
}

export function VoiceIndicator({ state, silenceProgress = 0, className }: VoiceIndicatorProps) {
  const stateConfig = {
    idle: {
      label: 'Tap to start',
      borderClass: 'border-muted-foreground/30',
      bgClass: 'bg-muted/20',
      dotClass: 'bg-muted-foreground/50',
    },
    listening: {
      label: 'Listening',
      borderClass: 'border-primary',
      bgClass: 'bg-primary/10',
      dotClass: 'bg-primary',
    },
    thinking: {
      label: 'Thinking...',
      borderClass: 'border-muted-foreground',
      bgClass: 'bg-muted/30',
      dotClass: 'bg-muted-foreground',
    },
    speaking: {
      label: 'AI Speaking',
      borderClass: 'border-accent',
      bgClass: 'bg-accent/10',
      dotClass: 'bg-accent',
    },
  };

  const config = stateConfig[state];

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      {/* Main indicator orb - simplified */}
      <div className="relative">
        <div
          className={cn(
            'w-24 h-24 rounded-full border-2 flex items-center justify-center',
            'transition-colors duration-300',
            config.borderClass,
            config.bgClass
          )}
        >
          {/* Simple inner indicator */}
          <div
            className={cn(
              'w-4 h-4 rounded-full transition-all duration-300',
              config.dotClass,
              state === 'listening' && 'w-5 h-5',
              state === 'thinking' && 'opacity-60',
              state === 'speaking' && 'w-6 h-6'
            )}
          />
        </div>

        {/* Minimal silence progress ring */}
        {state === 'listening' && silenceProgress > 0 && (
          <svg
            className="absolute inset-0 w-24 h-24 -rotate-90"
            viewBox="0 0 96 96"
          >
            <circle
              cx="48"
              cy="48"
              r="46"
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="2"
              strokeDasharray={`${silenceProgress * 289} 289`}
              className="transition-all duration-100"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* State label - simple text */}
      <span
        className={cn(
          'text-xs font-medium tracking-wide uppercase',
          state === 'idle' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {config.label}
      </span>
    </div>
  );
}
