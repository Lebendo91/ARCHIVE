import { Archive, Clock, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { QueryError } from '@/components/feedback/QueryError';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { DocumentTable, type DateColumn } from '@/modules/library/DocumentViews';
import { GridSkeleton, WorkspaceGrid } from '@/modules/workspaces/WorkspacesPage';
import type { DocumentQuery } from '@/services/documents';
import { useDocumentPages, useWorkspaces } from '@/services/queries';

const BASE_QUERY: Omit<DocumentQuery, 'offset'> = {
  favoritesOnly: false,
  openedOnly: false,
  state: 'active',
  sort: 'updated_at',
  descending: true,
  limit: 60,
};

/** Documents of a personal view, as a table with « Show more ». */
function DocumentSection({
  query,
  dateColumn,
  title,
  empty,
}: {
  query: Omit<DocumentQuery, 'offset'>;
  /** The date shown: the one the section is sorted by. */
  dateColumn: DateColumn;
  /** Section title; without one the documents are the whole page. */
  title?: string;
  /** Shown when nothing matches; `null` hides the section instead. */
  empty: ReactNode;
}) {
  const { t, tCount } = useI18n();
  const pages = useDocumentPages(query);
  const workspaces = useWorkspaces();
  if (pages.isError) {
    return (
      <QueryError
        error={pages.error}
        onRetry={() => {
          void pages.refetch();
        }}
      />
    );
  }
  if (pages.isPending) {
    return <Skeleton aria-hidden="true" className="h-40 rounded-card" />;
  }
  const items = pages.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return empty;
  }
  return (
    <section className="flex flex-col gap-4">
      {title ? <h2 className="font-display text-xl font-semibold text-fg">{title}</h2> : null}
      <p className="text-sm text-fg-secondary">
        {tCount('library.count', pages.data.pages[0]?.total ?? items.length)}
      </p>
      <DocumentTable items={items} workspaces={workspaces.data ?? []} dateColumn={dateColumn} />
      {pages.hasNextPage ? (
        <Button
          className="self-center"
          loading={pages.isFetchingNextPage}
          onClick={() => {
            void pages.fetchNextPage();
          }}
        >
          {t('library.showMore')}
        </Button>
      ) : null}
    </section>
  );
}

/** Favorites (spec §3.3): documents marked with a star. Notes join them with the note editor. */
export function FavoritesPage() {
  const { t } = useI18n();
  return (
    <DocumentSection
      query={{ ...BASE_QUERY, favoritesOnly: true }}
      dateColumn="updated"
      empty={
        <EmptyState
          icon={Star}
          iconTone="brand"
          title={t('modules.favorites.title')}
          description={t('modules.favorites.description')}
        />
      }
    />
  );
}

/** Recently opened documents, most recent first. */
export function RecentPage() {
  const { t } = useI18n();
  return (
    <DocumentSection
      query={{ ...BASE_QUERY, openedOnly: true, sort: 'last_opened_at' }}
      dateColumn="opened"
      empty={
        <EmptyState
          icon={Clock}
          title={t('modules.recent.title')}
          description={t('modules.recent.description')}
        />
      }
    />
  );
}

/** Archived items: workspaces and documents, each with its restore action. */
export function ArchivedPage() {
  const { t } = useI18n();
  const workspaces = useWorkspaces();
  const documents = useDocumentPages({ ...BASE_QUERY, state: 'archived', limit: 1 });

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
  if (workspaces.isPending || documents.isPending) {
    return <GridSkeleton />;
  }
  const archived = workspaces.data.filter((summary) => summary.workspace.isArchived);
  const archivedDocuments = documents.data?.pages[0]?.total ?? 0;
  if (archived.length === 0 && archivedDocuments === 0) {
    return (
      <EmptyState
        icon={Archive}
        title={t('modules.archived.title')}
        description={t('modules.archived.description')}
      />
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {archived.length > 0 ? (
        <section aria-labelledby="archived-workspaces" className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h2 id="archived-workspaces" className="font-display text-xl font-semibold text-fg">
              {t('modules.archived.workspacesTitle')}
            </h2>
            <p className="text-sm text-fg-secondary">{t('modules.archived.workspacesHint')}</p>
          </header>
          <WorkspaceGrid items={archived} />
        </section>
      ) : null}
      <DocumentSection
        query={{ ...BASE_QUERY, state: 'archived' }}
        dateColumn="updated"
        title={t('modules.archived.documentsTitle')}
        empty={null}
      />
    </div>
  );
}
