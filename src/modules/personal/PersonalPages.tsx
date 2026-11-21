import { Archive, Clock, Star } from 'lucide-react';
import { QueryError } from '@/components/feedback/QueryError';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';
import { useI18n } from '@/i18n';
import { GridSkeleton, WorkspaceGrid } from '@/modules/workspaces/WorkspacesPage';
import { useWorkspaces } from '@/services/queries';

/** Personal views (specification §3.3): they list real resources once documents and notes exist. */
export function FavoritesPage() {
  return <ModulePlaceholder module="favorites" icon={Star} iconTone="brand" />;
}

export function RecentPage() {
  return <ModulePlaceholder module="recent" icon={Clock} />;
}

/**
 * Archived items. Workspaces can be archived since Phase 3: they are listed here, with their restore action;
 * documents and notes will join them with their modules.
 */
export function ArchivedPage() {
  const { t } = useI18n();
  const workspaces = useWorkspaces();

  if (workspaces.isError) {
    return (
      <QueryError
        error={workspaces.error}
        onRetry={() => {
          void workspaces.refetch();
        }}
      />
    );
  }
  if (workspaces.isPending) {
    return <GridSkeleton />;
  }
  const archived = workspaces.data.filter((summary) => summary.workspace.isArchived);
  if (archived.length === 0) {
    return <ModulePlaceholder module="archived" icon={Archive} />;
  }
  return (
    <section aria-labelledby="archived-workspaces" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 id="archived-workspaces" className="font-display text-xl font-semibold text-fg">
          {t('modules.archived.workspacesTitle')}
        </h2>
        <p className="text-sm text-fg-secondary">{t('modules.archived.workspacesHint')}</p>
      </header>
      <WorkspaceGrid items={archived} />
    </section>
  );
}
