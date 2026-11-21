import { ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router';
import { useCurrentPageTitle } from '@/app/router/handles';
import { formatCombination, getShortcut } from '@/app/shortcuts/shortcuts';
import { KeyCombo, Tooltip } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ProfileMenu } from './ProfileMenu';
import { QuickCreateMenu } from './QuickCreateMenu';

/**
 * Entry point of the global search. Search needs indexed content (Phase 6): until then the entry point is
 * visibly unavailable and explains why, instead of opening a search that cannot find anything.
 */
function SearchEntry() {
  const { t } = useI18n();
  const keys = formatCombination(getShortcut('openSearch').combination, t);
  return (
    <Tooltip content={t('topbar.searchUnavailable')} side="bottom">
      <button
        type="button"
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
        }}
        className="flex h-8 w-72 shrink-0 cursor-not-allowed items-center gap-2 rounded-control border border-line bg-obsidian px-3 text-left text-sm text-fg-muted opacity-60 xl:w-80"
      >
        <Search size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t('topbar.search')}</span>
        <KeyCombo keys={keys} />
      </button>
    </Tooltip>
  );
}

/** Top bar (specification §3.4): current section and breadcrumb, search entry point, Quick Create, profile menu. */
export function Topbar() {
  const { t } = useI18n();
  const { handle, title } = useCurrentPageTitle();

  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-line-subtle bg-obsidian px-8 select-none">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {handle?.parent ? (
          <nav
            aria-label={t('topbar.breadcrumb')}
            className="flex min-w-0 shrink items-center gap-2"
          >
            <Link
              to={handle.parent.to}
              className="cursor-default truncate rounded-sm font-display text-lg font-medium text-fg-secondary transition-colors duration-150 hover:text-fg"
            >
              {t(handle.parent.titleKey)}
            </Link>
            <ChevronRight size={16} className="shrink-0 text-fg-secondary" />
          </nav>
        ) : null}
        <h1 className="truncate font-display text-lg font-semibold text-fg">{title}</h1>
      </div>
      <SearchEntry />
      <QuickCreateMenu />
      <ProfileMenu trigger="avatar" />
    </header>
  );
}
