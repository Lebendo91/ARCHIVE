import type { LucideIcon } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@/utils/cn';

const PADDING_CLASSES = { none: '', md: 'p-5', lg: 'p-6' } as const;

export interface CardProps extends ComponentPropsWithRef<'div'> {
  padding?: keyof typeof PADDING_CLASSES;
}

export function Card({ padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line-subtle bg-graphite',
        PADDING_CLASSES[padding],
        className,
      )}
      {...props}
    />
  );
}

export type IconTone =
  'neutral' | 'brand' | 'interactive' | 'intelligence' | 'relations' | 'success' | 'danger';

const ICON_TONE_CLASSES: Record<IconTone, string> = {
  neutral: 'text-fg-secondary',
  brand: 'text-amber',
  interactive: 'text-blue',
  intelligence: 'text-cyan',
  relations: 'text-purple',
  success: 'text-success',
  danger: 'text-danger',
};

export interface CardHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  iconTone?: IconTone;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  iconTone = 'neutral',
  actions,
  headingLevel = 3,
}: CardHeaderProps) {
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4';
  return (
    <div className="flex items-start gap-4">
      {Icon ? (
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel',
            ICON_TONE_CLASSES[iconTone],
          )}
        >
          <Icon size={20} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <Heading className="font-display text-lg font-semibold text-fg">{title}</Heading>
        {description ? <p className="mt-1 text-sm text-fg-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
