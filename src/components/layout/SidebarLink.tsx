import { NavLink } from 'react-router';
import { Tooltip } from '@/components/ui';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';
import type { NavItem } from './navigation';

export function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useI18n();
  const label = t(item.labelKey);
  const Icon = item.icon;

  const link = (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex cursor-default items-center gap-3 rounded-control text-sm font-medium transition-colors duration-150 ease-standard',
          collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-8 px-3',
          isActive ? 'bg-graphite text-fg' : 'text-fg-secondary hover:bg-graphite/60 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={18}
            className={cn(
              'shrink-0 transition-colors duration-150',
              isActive ? 'text-amber' : 'text-fg-secondary group-hover:text-fg',
            )}
          />
          {collapsed ? null : <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
