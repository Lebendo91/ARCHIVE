import type { LucideIcon } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { Link, useMatch, useResolvedPath } from 'react-router';
import { Tooltip } from '@/components/ui';
import { cn } from '@/utils/cn';

const ITEM_CLASSES =
  'group flex cursor-default items-center gap-3 rounded-control text-sm font-medium transition-colors duration-150 ease-standard';

function itemLayout(collapsed: boolean): string {
  return collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-8 w-full px-3';
}

export interface SidebarLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only active on an exact match (used by routes whose path prefixes other routes). */
  end?: boolean | undefined;
  collapsed: boolean;
  /** Fixed icon colour (the accent of a workspace) instead of the active and inactive colours. */
  iconClassName?: string;
}

export function SidebarLink({
  to,
  label,
  icon: Icon,
  end = false,
  collapsed,
  iconClassName,
}: SidebarLinkProps) {
  // The active state is computed here rather than by NavLink's class function: in collapsed mode the
  // tooltip trigger (Radix Slot) merges class names as strings and would turn that function into text.
  const { pathname } = useResolvedPath(to);
  const isActive = useMatch({ path: pathname, end }) !== null;

  const link = (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        ITEM_CLASSES,
        itemLayout(collapsed),
        isActive ? 'bg-graphite text-fg' : 'text-fg-secondary hover:bg-graphite/60 hover:text-fg',
      )}
    >
      <Icon
        size={18}
        className={cn(
          'shrink-0 transition-colors duration-150',
          iconClassName ?? (isActive ? 'text-amber' : 'text-fg-secondary group-hover:text-fg'),
        )}
      />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );

  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export interface SidebarButtonProps {
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  shortcut?: readonly string[];
  onClick: MouseEventHandler<HTMLButtonElement>;
}

/** Action of the sidebar, laid out like its links (for example « New workspace »). */
export function SidebarButton({
  label,
  icon: Icon,
  collapsed,
  shortcut,
  onClick,
}: SidebarButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        ITEM_CLASSES,
        itemLayout(collapsed),
        'text-fg-secondary hover:bg-graphite/60 hover:text-fg',
      )}
    >
      <Icon size={18} className="shrink-0 text-fg-secondary group-hover:text-fg" />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </button>
  );

  return collapsed ? (
    <Tooltip content={label} side="right" {...(shortcut ? { shortcut } : {})}>
      {button}
    </Tooltip>
  ) : (
    button
  );
}
