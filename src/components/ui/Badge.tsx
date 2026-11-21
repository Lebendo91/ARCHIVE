import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Tones map to the semantic roles of the palette: cyan for intelligence, purple for relationships… */
export type BadgeTone =
  'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'intelligence' | 'relations';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-steel text-fg-secondary',
  brand: 'border-amber/30 bg-amber/10 text-amber',
  info: 'border-blue/30 bg-blue/10 text-blue',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  intelligence: 'border-cyan/30 bg-cyan/10 text-cyan',
  relations: 'border-purple/30 bg-purple/10 text-purple',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-2xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}
