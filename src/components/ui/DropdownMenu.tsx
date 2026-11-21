import type { LucideIcon } from 'lucide-react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { KeyCombo } from './Kbd';

/**
 * Non-modal menu (WAI-ARIA menu button pattern): the rest of the window is not hidden from assistive
 * technologies while the menu is open; Escape, Tab or a click outside close it.
 */
export function DropdownMenu(props: ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root modal={false} {...props} />;
}

export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export interface DropdownMenuContentProps {
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function DropdownMenuContent({
  children,
  side = 'bottom',
  align = 'end',
  className,
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-56 rounded-card border border-line bg-graphite p-1 shadow-popover data-[state=open]:animate-popover-in',
          className,
        )}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  icon?: LucideIcon;
  shortcut?: readonly string[];
}

export function DropdownMenuItem({
  icon: Icon,
  shortcut,
  children,
  className,
  ...props
}: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex h-8 cursor-default items-center gap-3 rounded-control px-2 text-sm text-fg-secondary outline-none select-none data-[disabled]:text-fg-disabled data-[highlighted]:bg-steel data-[highlighted]:text-fg',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon size={16} className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <KeyCombo keys={shortcut} /> : null}
    </MenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-line-subtle" />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <MenuPrimitive.Label className="px-2 py-2">{children}</MenuPrimitive.Label>;
}
