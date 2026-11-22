import { useId } from 'react';
import { cn } from '@/utils/cn';

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Exclusive choice among a few options, shown as joined buttons. Built on native radio buttons: arrow keys
 * move the selection, and screen readers announce a group of radio buttons. Each invisible radio button covers
 * its segment, so a click anywhere on it (pointer, voice control, automation) reaches the right option.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset
      className={cn(
        'inline-flex shrink-0 rounded-control border border-line bg-obsidian p-0.5',
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="relative cursor-default">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
            className="peer absolute inset-0 m-0 cursor-default appearance-none opacity-0"
          />
          <span
            className={cn(
              'flex h-7 items-center rounded-sm px-3 text-sm whitespace-nowrap transition-colors duration-150 ease-standard',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue',
              value === option.value
                ? 'bg-steel font-medium text-fg'
                : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
