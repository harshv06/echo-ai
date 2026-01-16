import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Mic, MicOff, AlertCircle } from 'lucide-react';

interface StatusBarProps {
  isListening: boolean;
  isConnected: boolean;
  error: string | null;
  className?: string;
}

export function StatusBar({ isListening, isConnected, error, className }: StatusBarProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {/* Left side - Microphone status */}
      <div className="flex items-center gap-2">
        {isListening ? (
          <>
            <Mic className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Mic active</span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Mic off</span>
          </>
        )}
      </div>

      {/* Center - Error message */}
      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Right side - Connection status */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
