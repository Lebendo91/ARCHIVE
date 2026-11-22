import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Non-modal panel anchored to its trigger, for a small form such as filters. It is announced as a dialog
 * named by `label`; focus moves into it when it opens and returns to the trigger when Escape, a click outside
 * or the trigger closes it.
 */
export const Popover = PopoverPrimitive.Root;

export const PopoverTrigger = PopoverPrimitive.Trigger;

export interface PopoverContentProps {
  /** Accessible name of the panel. */
  label: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function PopoverContent({
  label,
  children,
  side = 'bottom',
  align = 'start',
  className,
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        aria-label={label}
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={8}
        className={cn(
          'z-50 rounded-card border border-line bg-graphite p-4 shadow-popover data-[state=open]:animate-popover-in',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
