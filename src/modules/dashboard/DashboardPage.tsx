import {
  ArrowRight,
  Boxes,
  FileText,
  FileUp,
  Folder,
  MessageSquareText,
  NotebookPen,
  Plus,
} from 'lucide-react';
import { useId } from 'react';
import { formatCombination, getShortcut } from '@/app/shortcuts/shortcuts';
import { QuickActionList, type QuickAction } from '@/components/actions/QuickActionList';
import { ActivityList } from '@/components/activity/ActivityList';
import { ResourceList } from '@/components/activity/ResourceList';
import { QueryError } from '@/components/feedback/QueryError';
import { Button, ButtonLink, Card, SectionCard, Skeleton, Stat, StatList } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { formatFileSize, formatLongDate, formatNumber, useI18n } from '@/i18n';
import { WorkspaceIcon } from '@/modules/workspaces/WorkspaceIcon';
import type { DashboardOverview, TimelineEvent } from '@/services/dashboard';
import { errorMessageKey } from '@/services/errors';
import { useDashboardOverview, useStorageOverview, useWorkspaces } from '@/services/queries';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { getGreetingPeriod } from './greeting';

/**
 * Small, clearly labelled illustration of an organized knowledge base (spec §6.2). It is part of the
 * interface, not of the user's data: nothing is written to the database.
 */
function ExampleOrganization() {
  const { t, tList } = useI18n();
  const captionId = useId();
  const [firstFolder, secondFolder] = tList('dashboard.onboarding.exampleFolders');
  const [documentTitle, noteTitle] = tList('dashboard.onboarding.exampleItems');
  return (
    <figure
      aria-labelledby={captionId}
      className="flex w-72 shrink-0 flex-col gap-4 rounded-card border border-dashed border-line bg-obsidian p-5"
    >
      <figcaption
        id={captionId}
        className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
      >
        {t('dashboard.onboarding.exampleLabel')}
      </figcaption>
      <div className="flex flex-col gap-2 text-sm text-fg">
        <p className="flex items-center gap-2 font-medium">
          <WorkspaceIcon icon="cpu" color="amber" size="sm" />
          {t('dashboard.onboarding.exampleWorkspace')}
        </p>
        <ul className="ml-3 flex flex-col gap-2 border-l border-line-subtle pl-4 text-fg-secondary">
          <li className="flex flex-col gap-2">
            <span className="flex items-center gap-2">
              <Folder size={14} aria-hidden="true" />
              {firstFolder}
            </span>
            <ul className="ml-2 flex flex-col gap-2 border-l border-line-subtle pl-4">
              <li className="flex items-center gap-2">
                <FileText size={14} aria-hidden="true" />
                {documentTitle}
              </li>
              <li className="flex items-center gap-2">
                <NotebookPen size={14} aria-hidden="true" />
                {noteTitle}
              </li>
            </ul>
          </li>
          <li className="flex items-center gap-2">
            <Folder size={14} aria-hidden="true" />
            {secondFolder}
          </li>
        </ul>
      </div>
    </figure>
  );
}

/** First steps, while the knowledge base holds no document and no note (spec §6.2). */
function Onboarding({ workspaces }: { workspaces: number }) {
  const { t } = useI18n();
  const ready = workspaces > 0;
  return (
    <Card padding="lg" className="flex items-center gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-xl font-semibold text-fg">
            {ready ? t('dashboard.onboarding.readyTitle') : t('dashboard.onboarding.title')}
          </h3>
          <p className="max-w-xl text-sm text-fg-secondary">
            {ready
              ? t('dashboard.onboarding.readyDescription')
              : t('dashboard.onboarding.description')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {ready ? (
            <ButtonLink to="/workspaces" variant="primary" icon={Boxes}>
              {t('dashboard.onboarding.viewWorkspaces')}
            </ButtonLink>
          ) : (
            <Button
              variant="primary"
              icon={Plus}
              onClick={(event) => {
                workspaceDialogs.create(event.currentTarget);
              }}
            >
              {t('dashboard.onboarding.action')}
            </Button>
          )}
        </div>
        <p className="text-xs text-fg-secondary">{t('dashboard.onboarding.upcoming')}</p>
      </div>
      <ExampleOrganization />
    </Card>
  );
}

/** Quick actions of spec §6.1. Those of modules not delivered yet are visibly unavailable. */
function QuickActions() {
  const { t } = useI18n();
  const actions: QuickAction[] = [
    {
      id: 'workspace',
      icon: Boxes,
      label: t('shortcuts.newWorkspace'),
      keys: formatCombination(getShortcut('newWorkspace').combination, t),
      onClick: (event) => {
        workspaceDialogs.create(event.currentTarget);
      },
    },
    { id: 'document', icon: FileUp, label: t('shortcuts.importDocument') },
    { id: 'note', icon: NotebookPen, label: t('shortcuts.newNote') },
    { id: 'assistant', icon: MessageSquareText, label: t('dashboard.openAssistant') },
  ];
  return <QuickActionList actions={actions} className="grid-cols-2 xl:grid-cols-4" />;
}

function StorageSummary() {
  const { t, tCount, locale } = useI18n();
  const storage = useStorageOverview();
  return (
    <SectionCard title={t('dashboard.storageTitle')}>
      {storage.isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton surface="raised" className="h-4 w-48" />
          <Skeleton surface="raised" className="h-4 w-40" />
        </div>
      ) : storage.isError ? (
        <p className="text-sm text-fg-secondary">{t(errorMessageKey(storage.error))}</p>
      ) : (
        <div className="flex flex-col gap-1 text-sm text-fg">
          <p>
            {t('dashboard.storageSummary', {
              used: formatFileSize(storage.data.totalBytes, locale),
            })}
          </p>
          <p className="text-fg-secondary">
            {tCount('dashboard.storageFiles', storage.data.filesCount, {
              count: formatNumber(storage.data.filesCount, locale),
            })}
            {storage.data.diskAvailableBytes === null
              ? null
              : ` · ${t('dashboard.storageFree', {
                  free: formatFileSize(storage.data.diskAvailableBytes, locale),
                })}`}
          </p>
        </div>
      )}
      <p className="text-xs text-fg-secondary">{t('dashboard.localFirst.description')}</p>
      <ButtonLink
        to="/settings/storage"
        variant="ghost"
        size="sm"
        icon={ArrowRight}
        className="self-start"
      >
        {t('dashboard.storageLink')}
      </ButtonLink>
    </SectionCard>
  );
}

function Statistics({ overview }: { overview: DashboardOverview | undefined }) {
  const { t, locale } = useI18n();
  const storage = useStorageOverview();
  const count = (value: number | undefined) =>
    value === undefined ? undefined : formatNumber(value, locale);
  const storageValue = storage.isSuccess
    ? formatFileSize(storage.data.totalBytes, locale)
    : storage.isError
      ? t('common.unavailable')
      : undefined;
  return (
    <section aria-labelledby="dashboard-stats" className="flex flex-col gap-4">
      <h3
        id="dashboard-stats"
        className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
      >
        {t('dashboard.stats.title')}
      </h3>
      <StatList className="grid-cols-5">
        <Stat label={t('dashboard.stats.documents')} value={count(overview?.documents)} />
        <Stat label={t('dashboard.stats.notes')} value={count(overview?.notes)} />
        <Stat label={t('dashboard.stats.workspaces')} value={count(overview?.workspaces)} />
        <Stat label={t('dashboard.stats.storage')} value={storageValue} />
        <Stat label={t('dashboard.stats.indexed')} value={count(overview?.recentlyIndexed)} />
      </StatList>
    </section>
  );
}

/**
 * Overview (spec §6): every figure and list comes from the database through the native core. A new
 * installation sees its first steps instead of empty charts, and no example is stored as user data.
 */
export function DashboardPage() {
  const { t, locale } = useI18n();
  const now = useNow();
  const greeting = t(`dashboard.greeting.${getGreetingPeriod(now)}`);
  const overview = useDashboardOverview();
  const workspaces = useWorkspaces();
  const existing = new Set((workspaces.data ?? []).map((summary) => summary.workspace.id));
  const linkFor = (event: TimelineEvent) =>
    event.entityType === 'workspace' && existing.has(event.entityId)
      ? `/workspaces/${event.entityId}`
      : undefined;
  const data = overview.data;
  const firstSteps = data?.documents === 0 && data.notes === 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-fg-secondary first-letter:uppercase">
          {formatLongDate(now, locale)}
        </p>
        <h2 className="font-display text-3xl font-semibold text-fg">
          {t('dashboard.welcome', { greeting })}
        </h2>
        <p className="text-base text-fg-secondary">{t('dashboard.subtitle')}</p>
      </header>

      {overview.isError ? (
        <QueryError
          error={overview.error}
          onRetry={() => {
            void overview.refetch();
          }}
        />
      ) : (
        <>
          {firstSteps ? <Onboarding workspaces={data.workspaces} /> : null}
          <Statistics overview={data} />
          <section aria-labelledby="dashboard-actions" className="flex flex-col gap-4">
            <h3
              id="dashboard-actions"
              className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
            >
              {t('dashboard.actionsTitle')}
            </h3>
            <QuickActions />
          </section>
          <div className="grid grid-cols-3 gap-6">
            <SectionCard title={t('dashboard.recentActivity')} className="col-span-2">
              {data ? (
                <ActivityList
                  events={data.recentActivity}
                  emptyText={t('dashboard.noActivity')}
                  linkFor={linkFor}
                />
              ) : (
                <Skeleton surface="raised" className="h-24" />
              )}
            </SectionCard>
            <StorageSummary />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <SectionCard title={t('dashboard.recentlyOpened')}>
              {data ? (
                <ResourceList
                  items={data.recentlyOpened}
                  date="opened"
                  emptyText={t('dashboard.noRecentlyOpened')}
                />
              ) : (
                <Skeleton surface="raised" className="h-16" />
              )}
            </SectionCard>
            <SectionCard title={t('dashboard.favorites')}>
              {data ? (
                <ResourceList
                  items={data.favorites}
                  date="updated"
                  emptyText={t('dashboard.noFavorites')}
                />
              ) : (
                <Skeleton surface="raised" className="h-16" />
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
