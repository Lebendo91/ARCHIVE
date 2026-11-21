import { Archive, Boxes, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { QueryError } from '@/components/feedback/QueryError';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useWorkspaces } from '@/services/queries';
import type { WorkspaceSummary } from '@/services/workspaces';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { cn } from '@/utils/cn';
import { WorkspaceCard } from './WorkspaceCard';

export function WorkspaceGrid({ items }: { items: readonly WorkspaceSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3">
      {items.map((summary) => (
        <li key={summary.workspace.id}>
          <WorkspaceCard summary={summary} />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-4 xl:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-36 rounded-card" />
      ))}
    </div>
  );
}

/** Workspaces (spec §12): every workspace with its real counts, creation, edition, archiving, deletion. */
export function WorkspacesPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = searchParams.get('archived') === '1';
  const workspaces = useWorkspaces();

  const setShowArchived = (show: boolean) => {
    setSearchParams(show ? { archived: '1' } : {}, { replace: true });
  };

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

  const all = workspaces.data ?? [];
  const active = all.filter((summary) => !summary.workspace.isArchived);
  const archived = all.filter((summary) => summary.workspace.isArchived);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-6">
        <p className="max-w-2xl text-base text-fg-secondary">{t('workspaces.intro')}</p>
        <div className="flex shrink-0 items-center gap-3">
          {archived.length > 0 ? (
            <Button
              icon={Archive}
              aria-pressed={showArchived}
              onClick={() => {
                setShowArchived(!showArchived);
              }}
              className={showArchived ? 'border-blue' : undefined}
            >
              {t('workspaces.showArchived')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            icon={Plus}
            onClick={(event) => {
              workspaceDialogs.create(event.currentTarget);
            }}
          >
            {t('workspaces.create')}
          </Button>
        </div>
      </div>

      {workspaces.isPending ? (
        <GridSkeleton />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Boxes}
          iconTone="brand"
          title={t('workspaces.empty.title')}
          description={t('workspaces.empty.description')}
          actions={
            <Button
              variant="primary"
              icon={Plus}
              onClick={(event) => {
                workspaceDialogs.create(event.currentTarget);
              }}
            >
              {t('workspaces.empty.action')}
            </Button>
          }
        />
      ) : (
        <>
          {active.length > 0 ? (
            <section aria-labelledby="active-workspaces" className="flex flex-col gap-4">
              <h2
                id="active-workspaces"
                className={cn(
                  'text-2xs font-semibold tracking-label text-fg-secondary uppercase',
                  !showArchived && 'sr-only',
                )}
              >
                {t('workspaces.activeTitle')}
              </h2>
              <WorkspaceGrid items={active} />
            </section>
          ) : (
            <EmptyState
              icon={Archive}
              title={t('workspaces.emptyActive.title')}
              description={t('workspaces.emptyActive.description')}
            />
          )}
          {showArchived && archived.length > 0 ? (
            <section aria-labelledby="archived-workspaces" className="flex flex-col gap-4">
              <h2
                id="archived-workspaces"
                className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
              >
                {t('workspaces.archivedTitle')}
              </h2>
              <WorkspaceGrid items={archived} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
