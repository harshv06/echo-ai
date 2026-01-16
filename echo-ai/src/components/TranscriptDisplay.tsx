import { cn } from '@/lib/utils';

interface TranscriptDisplayProps {
  recentTurns: Array<{ text: string; timestamp: number }>;
  interimTranscript: string;
  className?: string;
}

export function TranscriptDisplay({
  recentTurns,
  interimTranscript,
  className,
}: TranscriptDisplayProps) {
  const hasContent = recentTurns.length > 0 || interimTranscript;

  if (!hasContent) {
    return (
      <div className={cn('glass-card p-6 text-center', className)}>
        <p className="text-muted-foreground text-sm">
          Start speaking to see your transcript here...
        </p>
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-6 max-h-48 overflow-y-auto', className)}>
      <div className="space-y-2">
        {recentTurns.map((turn, index) => (
          <p key={turn.timestamp} className="text-foreground/90 text-sm leading-relaxed">
            {turn.text}
          </p>
        ))}
        
        {interimTranscript && (
          <p className="text-primary/70 text-sm leading-relaxed italic">
            {interimTranscript}
          </p>
        )}
      </div>
    </div>
  );
}
