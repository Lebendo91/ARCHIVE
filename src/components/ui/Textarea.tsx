import { CircleAlert } from 'lucide-react';
import { useId, type ComponentPropsWithRef } from 'react';
import { cn } from '@/utils/cn';

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label: string;
  hint?: string;
  error?: string;
}

/** Multi-line text field, with the same rules as `Input` (it sits on Obsidian for contrast). */
export function Textarea({ label, hint, error, id, className, rows = 3, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = error ? `${textareaId}-error` : undefined;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={textareaId} className="text-xs font-medium text-fg-secondary">
        {label}
      </label>
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full resize-none rounded-control border bg-obsidian px-3 py-2 text-sm text-fg transition-colors duration-150 ease-standard placeholder:text-fg-muted',
          'focus:border-blue focus:ring-1 focus:ring-blue focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:border-line-subtle disabled:text-fg-disabled',
          error
            ? 'border-danger focus:border-danger focus:ring-danger'
            : 'border-line enabled:hover:border-fg-disabled',
        )}
        {...props}
      />
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
