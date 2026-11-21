import { cn } from '@/utils/cn';

export interface SkeletonProps {
  className?: string;
  /** Use "raised" on Graphite surfaces so that the placeholder stays visible. */
  surface?: 'base' | 'raised';
}

/** Placeholder shown while real content loads. Never used to simulate content that does not exist. */
export function Skeleton({ className, surface = 'base' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-control',
        surface === 'raised' ? 'bg-steel' : 'bg-graphite',
        className,
      )}
    />
  );
}
