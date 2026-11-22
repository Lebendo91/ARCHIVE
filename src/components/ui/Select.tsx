import { ChevronDown, CircleAlert } from 'lucide-react';
import { useId, type ComponentPropsWithRef } from 'react';
import { cn } from '@/utils/cn';

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label: string;
  /** Keeps the label for assistive technologies but hides it visually (compact filter bars). */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
}

/** Native drop-down list, styled like `Input`: keyboard and screen reader support come from the platform. */
export function Select({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  className,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label
        htmlFor={selectId}
        className={cn('text-xs font-medium text-fg-secondary', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-8 w-full appearance-none rounded-control border bg-obsidian pr-9 pl-3 text-sm text-fg transition-colors duration-150 ease-standard',
            'focus:border-blue focus:ring-1 focus:ring-blue focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:border-line-subtle disabled:text-fg-disabled',
            error
              ? 'border-danger focus:border-danger focus:ring-danger'
              : 'border-line enabled:hover:border-fg-disabled',
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
      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert size={14} />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-fg-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
