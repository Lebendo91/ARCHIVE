import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { IconTone } from './Card';

const ICON_TONE_CLASSES: Record<IconTone, string> = {
  neutral: 'text-fg-secondary',
  brand: 'text-amber',
  interactive: 'text-blue',
  intelligence: 'text-cyan',
  relations: 'text-purple',
  success: 'text-success',
  danger: 'text-danger',
};

export interface EmptyStateProps {
  icon: LucideIcon;
  iconTone?: IconTone;
  title: string;
  description: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  headingLevel?: 2 | 3;
}

/** Designed empty state: explains the situation and what the user can do next (specification §17.4). */
export function EmptyState({
  icon: Icon,
  iconTone = 'neutral',
  title,
  description,
  badge,
  actions,
  children,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center py-12 text-center">
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-card border border-line-subtle bg-graphite',
          ICON_TONE_CLASSES[iconTone],
        )}
      >
        <Icon size={24} />
      </span>
      {badge ? <div className="mt-5">{badge}</div> : null}
      <Heading className="mt-4 font-display text-xl font-semibold text-fg">{title}</Heading>
      <p className="mt-2 max-w-md text-sm text-fg-secondary">{description}</p>
      {actions ? <div className="mt-6 flex items-center gap-3">{actions}</div> : null}
      {children ? <div className="mt-8 w-full">{children}</div> : null}
    </div>
  );
}
