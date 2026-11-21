import { cn } from '@/utils/cn';

/**
 * Geometry of the ARCHIVE mark, identical to assets/brand/archive-mark.svg (checked by a unit test):
 * a geometric "A" cut into knowledge strata, its apex in Archive Amber.
 */
export const MARK_APEX = '24,5 29,15 19,15';
export const MARK_STRATA = [
  '17,19 31,19 36,29 12,29',
  '10,33 22,33 17,43 5,43',
  '26,33 38,33 43,43 31,43',
];

export interface ArchiveMarkProps {
  size?: number;
  /** Accessible name. Without one the mark is decorative. */
  title?: string;
  className?: string;
}

export function ArchiveMark({ size = 24, title, className }: ArchiveMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <polygon className="fill-amber" points={MARK_APEX} />
      <g className="fill-fg">
        {MARK_STRATA.map((points) => (
          <polygon key={points} points={points} />
        ))}
      </g>
    </svg>
  );
}

export function ArchiveWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display font-semibold tracking-brand text-fg uppercase', className)}>
      ARCHIVE
    </span>
  );
}
