/**
 * Stop Button Component
 * 
 * Manual control to immediately stop AI audio playback.
 * Only visible when AI is speaking.
 */
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StopButtonProps {
  onClick: () => void;
  visible: boolean;
  className?: string;
}

export function StopButton({ onClick, visible, className }: StopButtonProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-full',
        'bg-destructive/90 hover:bg-destructive text-destructive-foreground',
        'transition-all duration-200',
        'text-sm font-medium',
        'focus:outline-none focus:ring-2 focus:ring-destructive/50',
        className
      )}
      aria-label="Stop AI playback"
    >
      <X className="w-4 h-4" />
      <span>Stop</span>
    </button>
  );
}
