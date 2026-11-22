import { Fragment } from 'react';
import type { TextSegment } from '@/services/search';
import { cn } from '@/utils/cn';

/** A text with the words found highlighted (segments computed by the core, never HTML). */
export function Highlighted({
  segments,
  className,
}: {
  segments: readonly TextSegment[];
  className?: string;
}) {
  return (
    <span className={cn('min-w-0', className)}>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className="rounded-sm bg-amber/20 px-0.5 font-medium text-fg">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </span>
  );
}
