import { ChevronDown } from 'lucide-react';
import { useId, type ComponentPropsWithRef } from 'react';
import { cn } from '@/utils/cn';

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label: string;
  hint?: string;
}

/** Native drop-down list, styled like `Input`: keyboard and screen reader support come from the platform. */
export function Select({ label, hint, id, className, children, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={selectId} className="text-xs font-medium text-fg-secondary">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-describedby={hintId}
          className={cn(
            'h-8 w-full appearance-none rounded-control border border-line bg-obsidian pr-9 pl-3 text-sm text-fg transition-colors duration-150 ease-standard',
            'focus:border-blue focus:ring-1 focus:ring-blue focus-visible:outline-none enabled:hover:border-fg-disabled',
            'disabled:cursor-not-allowed disabled:border-line-subtle disabled:text-fg-disabled',
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-secondary"
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-fg-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
