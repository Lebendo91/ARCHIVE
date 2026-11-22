import { Archive, Clock, Star, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { QueryError } from '@/components/feedback/QueryError';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useI18n, type MessageKey, type PluralKey } from '@/i18n';
import { DocumentTable, type DateColumn } from '@/modules/library/DocumentViews';
import { NoteList } from '@/modules/notes/NoteList';
import { GridSkeleton, WorkspaceGrid } from '@/modules/workspaces/WorkspacesPage';
import type { DocumentQuery } from '@/services/documents';
import type { NoteQuery, NoteSort } from '@/services/notes';
import { useDocumentPages, useNotePages, useWorkspaces } from '@/services/queries';

const DOCUMENTS: Omit<DocumentQuery, 'offset'> = {
  favoritesOnly: false,
  openedOnly: false,
  state: 'active',
  sort: 'updated_at',
  descending: true,
  limit: 60,
};

const NOTES: Omit<NoteQuery, 'offset'> = {
  favoritesOnly: false,
  openedOnly: false,
  state: 'active',
  sort: 'updated_at',
  descending: true,
  limit: 60,
};

/** A titled part of a personal view, with its count and « Show more ». */
function Section({
  title,
  count,
  countKey,
  children,
  hasMore,
  loadingMore,
  onMore,
}: {
  title: string;
  count: number;
  countKey: PluralKey;
  children: ReactNode;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
  const { t, tCount } = useI18n();
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold text-fg">{title}</h2>
        <p className="text-sm text-fg-secondary">{tCount(countKey, count)}</p>
      </header>
      {children}
      {hasMore ? (
        <Button className="self-center" loading={loadingMore} onClick={onMore}>
          {t('library.showMore')}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Documents and notes of a personal view (favorites, recently opened, archives), each in its section; the
 * empty state shows only when neither has anything.
 */
function ResourceSections({
  documents: documentQuery,
  notes: noteQuery,
  dateColumn,
  noteSort,
  titles,
  empty,
  before,
}: {
  documents: Omit<DocumentQuery, 'offset'>;
  notes: Omit<NoteQuery, 'offset'>;
  dateColumn: DateColumn;
  noteSort: NoteSort;
  titles: { documents: MessageKey; notes: MessageKey };
  /** Shown when nothing matches; `null` shows nothing. */
  empty: ReactNode;
  /** Sections shown before the documents (the archived workspaces). */
  before?: ReactNode;
}) {
  const { t } = useI18n();
  const documents = useDocumentPages(documentQuery);
  const notes = useNotePages(noteQuery);
  const workspaces = useWorkspaces();
  if (documents.isError || notes.isError) {
    return (
      <QueryError
        error={documents.error ?? notes.error}
        onRetry={() => {
          void documents.refetch();
          void notes.refetch();
        }}
      />
    );
  }
  if (documents.isPending || notes.isPending) {
    return <Skeleton aria-hidden="true" className="h-40 rounded-card" />;
  }
  const documentItems = documents.data.pages.flatMap((page) => page.items);
  const noteItems = notes.data.pages.flatMap((page) => page.items);
  if (documentItems.length === 0 && noteItems.length === 0 && !before) {
    return empty;
  }
  return (
    <div className="flex flex-col gap-10">
      {before}
      {documentItems.length > 0 ? (
        <Section
          title={t(titles.documents)}
          count={documents.data.pages[0]?.total ?? documentItems.length}
          countKey="library.count"
          hasMore={documents.hasNextPage}
          loadingMore={documents.isFetchingNextPage}
          onMore={() => {
            void documents.fetchNextPage();
          }}
        >
          <DocumentTable
            items={documentItems}
            workspaces={workspaces.data ?? []}
            dateColumn={dateColumn}
          />
        </Section>
      ) : null}
      {noteItems.length > 0 ? (
        <Section
          title={t(titles.notes)}
          count={notes.data.pages[0]?.total ?? noteItems.length}
          countKey="notes.count"
          hasMore={notes.hasNextPage}
          loadingMore={notes.isFetchingNextPage}
          onMore={() => {
            void notes.fetchNextPage();
          }}
        >
          <NoteList items={noteItems} sort={noteSort} workspaces={workspaces.data ?? []} />
        </Section>
      ) : null}
    </div>
  );
}

function PersonalEmpty({
  icon,
  brand = false,
  module,
}: {
  icon: LucideIcon;
  brand?: boolean;
  module: 'favorites' | 'recent';
}) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={icon}
      iconTone={brand ? 'brand' : 'neutral'}
      title={t(`modules.${module}.title`)}
      description={t(`modules.${module}.description`)}
    />
  );
}

/** Favorites (spec §3.3): documents and notes marked with a star. */
export function FavoritesPage() {
  return (
    <ResourceSections
      documents={{ ...DOCUMENTS, favoritesOnly: true }}
      notes={{ ...NOTES, favoritesOnly: true }}
      dateColumn="updated"
      noteSort="updated_at"
      titles={{ documents: 'modules.sections.documents', notes: 'modules.sections.notes' }}
      empty={<PersonalEmpty icon={Star} brand module="favorites" />}
    />
  );
}

/** Recently opened documents and notes, most recent first. */
export function RecentPage() {
  return (
    <ResourceSections
      documents={{ ...DOCUMENTS, openedOnly: true, sort: 'last_opened_at' }}
      notes={{ ...NOTES, openedOnly: true, sort: 'last_opened_at' }}
      dateColumn="opened"
      noteSort="last_opened_at"
      titles={{ documents: 'modules.sections.documents', notes: 'modules.sections.notes' }}
      empty={<PersonalEmpty icon={Clock} module="recent" />}
    />
  );
}

/** Archived items: workspaces, documents and notes, each with its restore action. */
export function ArchivedPage() {
  const { t } = useI18n();
  const workspaces = useWorkspaces();
  const documents = useDocumentPages({ ...DOCUMENTS, state: 'archived', limit: 1 });
  const notes = useNotePages({ ...NOTES, state: 'archived', limit: 1 });

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
  if (workspaces.isPending || documents.isPending || notes.isPending) {
    return <GridSkeleton />;
  }
  const archived = workspaces.data.filter((summary) => summary.workspace.isArchived);
  const archivedDocuments = documents.data?.pages[0]?.total ?? 0;
  const archivedNotes = notes.data?.pages[0]?.total ?? 0;
  if (archived.length === 0 && archivedDocuments === 0 && archivedNotes === 0) {
    return (
      <EmptyState
        icon={Archive}
        title={t('modules.archived.title')}
        description={t('modules.archived.description')}
      />
    );
  }
  return (
    <ResourceSections
      documents={{ ...DOCUMENTS, state: 'archived' }}
      notes={{ ...NOTES, state: 'archived' }}
      dateColumn="updated"
      noteSort="updated_at"
      titles={{
        documents: 'modules.archived.documentsTitle',
        notes: 'modules.archived.notesTitle',
      }}
      empty={null}
      before={
        archived.length > 0 ? (
          <section aria-labelledby="archived-workspaces" className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
              <h2 id="archived-workspaces" className="font-display text-xl font-semibold text-fg">
                {t('modules.archived.workspacesTitle')}
              </h2>
              <p className="text-sm text-fg-secondary">{t('modules.archived.workspacesHint')}</p>
            </header>
            <WorkspaceGrid items={archived} />
          </section>
        ) : null
      }
    />
  );
}
