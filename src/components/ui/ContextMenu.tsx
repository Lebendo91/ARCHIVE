import type { LucideIcon } from 'lucide-react';
import { ContextMenu as MenuPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Menu opened with a right click or the context-menu key, styled like `DropdownMenu`. */
export function ContextMenu(props: ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root modal={false} {...props} />;
}

export const ContextMenuTrigger = MenuPrimitive.Trigger;

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        collisionPadding={8}
        className="z-50 min-w-56 rounded-card border border-line bg-graphite p-1 shadow-popover data-[state=open]:animate-popover-in"
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

export interface ContextMenuItemProps extends ComponentProps<typeof MenuPrimitive.Item> {
  icon?: LucideIcon;
}

export function ContextMenuItem({
  icon: Icon,
  children,
  className,
  ...props
}: ContextMenuItemProps) {
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
    </MenuPrimitive.Item>
  );
}

export function ContextMenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-line-subtle" />;
}
