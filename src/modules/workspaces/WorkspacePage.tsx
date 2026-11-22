import { ArrowLeft, ArrowRight, Boxes, FileUp, NotebookPen, Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { QuickActionList } from '@/components/actions/QuickActionList';
import { ActivityList } from '@/components/activity/ActivityList';
import { ResourceList } from '@/components/activity/ResourceList';
import { QueryError } from '@/components/feedback/QueryError';
import { usePageTitle } from '@/app/router/pageTitle';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  SectionCard,
  Skeleton,
  Stat,
  StatList,
} from '@/components/ui';
import { formatCombination, getShortcut } from '@/app/shortcuts/shortcuts';
import { formatDate, formatNumber, useI18n } from '@/i18n';
import { useStartImport } from '@/modules/library/useStartImport';
import { useCreateNote } from '@/modules/notes/useCreateNote';
import { useWorkspace, useWorkspaces } from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import type { Workspace, WorkspaceDetail } from '@/services/workspaces';
import { useImportStore } from '@/stores/imports';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { WorkspaceActionsMenu } from './WorkspaceActionsMenu';
import { WorkspaceIcon } from './WorkspaceIcon';

/** Imports and new notes go into this workspace; its documents and notes are one click away. */
function WorkspaceActions({ workspace }: { workspace: Workspace }) {
  const { t } = useI18n();
  const startImport = useStartImport();
  const createNote = useCreateNote();
  return (
    <div className="flex flex-col gap-3">
      <QuickActionList
        className="grid-cols-2"
        actions={[
          {
            id: 'document',
            icon: FileUp,
            label: t('shortcuts.importDocument'),
            keys: formatCombination(getShortcut('importDocument').combination, t),
            onClick: () => {
              void startImport('pick', { workspaceId: workspace.id });
            },
          },
          {
            id: 'note',
            icon: NotebookPen,
            label: t('shortcuts.newNote'),
            onClick: () => {
              void createNote({ workspaceId: workspace.id });
            },
          },
        ]}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ButtonLink
          to={`/library?workspace=${workspace.id}`}
          variant="ghost"
          size="sm"
          icon={ArrowRight}
        >
          {t('workspaces.detail.viewDocuments')}
        </ButtonLink>
        <ButtonLink
          to={`/notes?workspace=${workspace.id}`}
          variant="ghost"
          size="sm"
          icon={ArrowRight}
        >
          {t('workspaces.detail.viewNotes')}
        </ButtonLink>
      </div>
    </div>
  );
}

function WorkspaceDashboard({ detail }: { detail: WorkspaceDetail }) {
  const { t, locale } = useI18n();
  const { workspace, counts, recentActivity, favorites } = detail;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start gap-5">
        <WorkspaceIcon icon={workspace.icon} color={workspace.color} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate font-display text-2xl font-semibold text-fg">
              {workspace.name}
            </h2>
            {workspace.isArchived ? <Badge>{t('workspaces.archivedBadge')}</Badge> : null}
          </div>
          {workspace.description ? (
            <p className="max-w-3xl text-base whitespace-pre-line text-fg-secondary">
              {workspace.description}
            </p>
          ) : null}
          <p className="text-xs text-fg-secondary">
            {t('workspaces.detail.createdOn', {
              date: formatDate(new Date(workspace.createdAt), locale),
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            icon={Pencil}
            onClick={(event) => {
              workspaceDialogs.edit(workspace, event.currentTarget);
            }}
          >
            {t('workspaces.actions.edit')}
          </Button>
          <WorkspaceActionsMenu workspace={workspace} withEdit={false} variant="secondary" />
        </div>
      </header>

      <section aria-labelledby="workspace-stats" className="flex flex-col gap-4">
        <h3
          id="workspace-stats"
          className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
        >
          {t('workspaces.detail.stats.title')}
        </h3>
        <StatList className="grid-cols-3">
          <Stat
            label={t('workspaces.detail.stats.documents')}
            value={formatNumber(counts.documents, locale)}
          />
          <Stat
            label={t('workspaces.detail.stats.notes')}
            value={formatNumber(counts.notes, locale)}
          />
          <Stat
            label={t('workspaces.detail.stats.folders')}
            value={formatNumber(counts.folders, locale)}
          />
        </StatList>
      </section>

      <section aria-labelledby="workspace-actions" className="flex flex-col gap-4">
        <h3
          id="workspace-actions"
          className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
        >
          {t('workspaces.detail.actionsTitle')}
        </h3>
        <WorkspaceActions workspace={workspace} />
      </section>

      <div className="grid grid-cols-3 gap-6">
        <SectionCard title={t('workspaces.detail.activity')} className="col-span-2">
          <ActivityList
            events={recentActivity}
            emptyText={t('workspaces.detail.noActivity')}
            currentEntityId={workspace.id}
          />
        </SectionCard>
        <SectionCard title={t('workspaces.detail.favorites')}>
          <ResourceList
            items={favorites}
            date="updated"
            emptyText={t('workspaces.detail.noFavorites')}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      <div className="flex items-start gap-5">
        <Skeleton className="h-12 w-12 rounded-card" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}

/** Dashboard of a workspace (spec §12.2): description, real counts, recent activity, favorites, actions. */
export function WorkspacePage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const detail = useWorkspace(id);
  // While the detail loads, the name already known from the list titles the page.
  const listed = useWorkspaces().data?.find((summary) => summary.workspace.id === id);
  usePageTitle(detail.data?.workspace.name ?? listed?.workspace.name);

  // Files dropped while this page is displayed go into this workspace.
  const name = detail.data?.workspace.name;
  useEffect(() => {
    if (name === undefined) {
      return undefined;
    }
    useImportStore.getState().setContext({ target: { workspaceId: id }, label: name });
    return () => {
      useImportStore.getState().setContext(null);
    };
  }, [id, name]);

  if (detail.isError) {
    const missing =
      isCommandError(detail.error) &&
      (detail.error.code === 'not_found' || detail.error.code === 'invalid_input');
    if (!missing) {
      return (
        <QueryError
          error={detail.error}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      );
    }
    return (
      <EmptyState
        icon={Boxes}
        title={t('workspaces.detail.notFoundTitle')}
        description={t('workspaces.detail.notFoundDescription')}
        actions={
          <ButtonLink to="/workspaces" icon={ArrowLeft}>
            {t('workspaces.detail.back')}
          </ButtonLink>
        }
      />
    );
  }
  if (detail.isPending) {
    return <DetailSkeleton />;
  }
  return <WorkspaceDashboard detail={detail.data} />;
}
