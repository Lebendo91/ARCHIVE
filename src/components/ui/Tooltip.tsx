import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import { KeyCombo } from './Kbd';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: ReactNode;
  /** Keyboard shortcut displayed after the label, for example `['Ctrl', ',']`. */
  shortcut?: readonly string[];
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** The trigger: a single element that forwards its ref and props (button, link…). */
  children: ReactElement;
}

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  children,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          className="z-[60] flex max-w-xs items-center gap-2 rounded-control border border-line bg-steel px-2 py-1 text-xs text-fg shadow-popover data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in"
        >
          <span>{content}</span>
          {shortcut ? <KeyCombo keys={shortcut} /> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
