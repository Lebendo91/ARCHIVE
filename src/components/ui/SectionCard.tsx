import { useId, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SectionCardProps {
  title: string;
  /** Element placed at the end of the title row (a link, a badge…). */
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
}

/** Card holding one section of a page, titled with a section label. */
export function SectionCard({
  title,
  actions,
  headingLevel = 3,
  className,
  children,
}: SectionCardProps) {
  const titleId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-4 rounded-card border border-line-subtle bg-graphite p-5',
        className,
      )}
    >
      <div className="flex min-h-7 items-center justify-between gap-4">
        <Heading
          id={titleId}
          className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
        >
          {title}
        </Heading>
        {actions}
      </div>
      {children}
    </section>
  );
}
