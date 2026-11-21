import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useId } from 'react';
import { ArchiveMark, ArchiveWordmark } from '@/components/brand/ArchiveMark';
import { IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { isNativeRuntime } from '@/services/tauri';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/utils/cn';
import { FOOTER_ITEMS, NAV_SECTIONS, type NavSection } from './navigation';
import { ProfileMenu } from './ProfileMenu';
import { SidebarLink } from './SidebarLink';
import { StorageIndicator } from './StorageIndicator';

function SidebarSection({ section, collapsed }: { section: NavSection; collapsed: boolean }) {
  const { t } = useI18n();
  const titleId = useId();
  const title = section.titleKey ? t(section.titleKey) : undefined;

  return (
    <div role={title ? 'group' : undefined} aria-labelledby={title ? titleId : undefined}>
      {title ? (
        collapsed ? (
          <>
            <span id={titleId} className="sr-only">
              {title}
            </span>
            <div aria-hidden="true" className="mx-auto mb-3 h-px w-8 bg-line-subtle" />
          </>
        ) : (
          <p
            id={titleId}
            className="px-3 pb-2 text-2xs font-semibold tracking-label text-fg-secondary uppercase"
          >
            {title}
          </p>
        )
      ) : null}
      <ul className="flex flex-col gap-1">
        {section.items.map((item) => (
          <li key={item.to}>
            <SidebarLink item={item} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Main navigation (specification §3.3): brand, modules, workspaces, personal views, settings, profile. */
export function Sidebar() {
  const { t } = useI18n();
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line-subtle bg-carbon transition-[width] duration-200 ease-standard select-none',
        collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-line-subtle',
          collapsed ? 'justify-center' : 'gap-3 pr-3 pl-6',
        )}
      >
        <ArchiveMark size={20} />
        {collapsed ? null : (
          <>
            <ArchiveWordmark className="flex-1 text-sm" />
            <IconButton
              icon={PanelLeftClose}
              label={t('sidebar.collapse')}
              size="sm"
              tooltipSide="right"
              onClick={toggleSidebar}
            />
          </>
        )}
      </div>

      {collapsed ? (
        <div className="flex shrink-0 justify-center pt-4">
          <IconButton
            icon={PanelLeftOpen}
            label={t('sidebar.expand')}
            size="lg"
            tooltipSide="right"
            onClick={toggleSidebar}
          />
        </div>
      ) : null}

      <nav
        aria-label={t('nav.mainLabel')}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      >
        {NAV_SECTIONS.map((section) => (
          <SidebarSection key={section.id} section={section} collapsed={collapsed} />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-line-subtle px-3 py-3">
        {isNativeRuntime() ? <StorageIndicator collapsed={collapsed} /> : null}
        <ul className="flex flex-col gap-1">
          {FOOTER_ITEMS.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} collapsed={collapsed} />
            </li>
          ))}
        </ul>
        <ProfileMenu trigger={collapsed ? 'sidebar-collapsed' : 'sidebar'} />
      </div>
    </aside>
  );
}
