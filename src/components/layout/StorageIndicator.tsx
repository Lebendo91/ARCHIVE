import { HardDrive } from 'lucide-react';
import { NavLink } from 'react-router';
import { Tooltip } from '@/components/ui';
import { formatFileSize, useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useStorageOverview } from '@/services/queries';
import { cn } from '@/utils/cn';

/**
 * Space used by ARCHIVE (specification §3.3), from the real size of its data. No capacity bar: the disk
 * size says nothing about the application, and nothing is estimated.
 */
export function StorageIndicator({ collapsed }: { collapsed: boolean }) {
  const { t, locale } = useI18n();
  const overview = useStorageOverview();
  const detail = overview.isSuccess
    ? t('sidebar.storageUsed', { size: formatFileSize(overview.data.totalBytes, locale) })
    : overview.isError
      ? t(errorMessageKey(overview.error))
      : t('common.loading');
  const label = t('sidebar.storage');

  const link = (
    <NavLink
      to="/settings/storage"
      aria-label={collapsed ? `${label} — ${detail}` : undefined}
      className={({ isActive }) =>
        cn(
          'group flex cursor-default items-center gap-3 rounded-control transition-colors duration-150 ease-standard',
          collapsed ? 'mx-auto h-10 w-10 justify-center' : 'px-3 py-2',
          isActive ? 'bg-graphite text-fg' : 'text-fg-secondary hover:bg-graphite/60 hover:text-fg',
        )
      }
    >
      <HardDrive size={18} className="shrink-0" />
      {collapsed ? null : (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="truncate text-2xs text-fg-secondary">{detail}</span>
        </span>
      )}
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={`${label} — ${detail}`} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}
