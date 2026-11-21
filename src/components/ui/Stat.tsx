import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Skeleton } from './Skeleton';

export interface StatProps {
  label: string;
  /** Value computed from real data; `undefined` while it loads. */
  value: ReactNode;
  /** Secondary line under the value (unit, context). */
  detail?: ReactNode;
}

/** A figure of a statistics list (`StatList`). Never fed with estimated or invented values. */
export function Stat({ label, value, detail }: StatProps) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line-subtle bg-graphite p-5">
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className="flex flex-col gap-1">
        {value === undefined ? (
          <Skeleton surface="raised" className="h-8 w-16" />
        ) : (
          <span className="font-display text-2xl font-semibold text-fg tabular-nums">{value}</span>
        )}
        {detail ? <span className="text-xs text-fg-secondary">{detail}</span> : null}
      </dd>
    </div>
  );
}

export function StatList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn('grid gap-4', className)}>{children}</dl>;
}
