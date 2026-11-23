import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { History, SearchX, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EVENT_ICONS, eventTitle, GENERIC_EVENTS, routeFor } from '@/components/activity/events';
import { QueryError } from '@/components/feedback/QueryError';
import { useListParams } from '@/components/resources/listControls';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import {
  formatDateTime,
  formatDayHeading,
  formatTime,
  useI18n,
  type I18nContextValue,
} from '@/i18n';
import { queryKeys, useWorkspaces } from '@/services/queries';
import {
  clearTimeline,
  listTimeline,
  TIMELINE_EVENT_TYPES,
  type TimelineEvent,
} from '@/services/timeline';
import { toast } from '@/stores/toasts';
import {
  dayKey,
  hasFilters,
  invalidRange,
  PERIODS,
  readTimelineParams,
  RESET_TIMELINE_FILTERS,
  TIMELINE_RESOURCES,
  timelineQuery,
  type Period,
} from './timelineFilters';

const PAGE_SIZE = 50;

const PERIOD_LABELS: Record<Period, 'today' | 'last7' | 'last30' | 'last365' | 'custom'> = {
  today: 'today',
  '7': 'last7',
  '30': 'last30',
  '365': 'last365',
  custom: 'custom',
};

const ORIGINS = ['user', 'rule', 'ai'] as const;

/** What is worth knowing about an event besides its title: its type, format, origin and place. */
function eventFacts(
  event: TimelineEvent,
  t: I18nContextValue['t'],
  workspaceName: (id: string) => string | undefined,
  showWorkspace: boolean,
): string[] {
  const label = GENERIC_EVENTS.has(event.eventType)
    ? `${t(`activity.events.${event.eventType}`)} · ${t(`activity.kinds.${event.entityType}`)}`
    : t(`activity.events.${event.eventType}`);
  const facts = [label];
  const format = event.metadata.format;
  if (event.eventType === 'document_imported' && typeof format === 'string' && format !== '') {
    facts.push(format.toUpperCase());
  }
  const origin = ORIGINS.find((candidate) => candidate === event.metadata.origin);
  if (event.eventType === 'relation_accepted' && origin) {
    facts.push(t(`timeline.meta.origin.${origin}`));
  }
  const place = event.workspaceId && showWorkspace ? workspaceName(event.workspaceId) : undefined;
  if (place && event.entityType !== 'workspace') {
    facts.push(place);
  }
  return facts;
}

/**
 * Timeline (specification §13): the history of the knowledge base, day by day, with filters by type of
 * event, resource, workspace and period, the way to each resource that still exists, and an explicit
 * clearing of the history.
 */
export function TimelinePage() {
  const { t, tCount, locale } = useI18n();
  const client = useQueryClient();
  const { params, update } = useListParams();
  const filters = readTimelineParams(params);
  const now = useNow();
  const workspaces = useWorkspaces();
  const [clearing, setClearing] = useState(false);
  const [clearPending, setClearPending] = useState(false);

  // A workspace deleted since the address was made no longer filters anything.
  const workspaceKnown =
    filters.workspaceId === undefined ||
    !workspaces.isSuccess ||
    workspaces.data.some((summary) => summary.workspace.id === filters.workspaceId);
  const effective = workspaceKnown ? filters : { ...filters, workspaceId: undefined };
  const query = timelineQuery(effective, now, PAGE_SIZE);
  const events = useInfiniteQuery({
    queryKey: queryKeys.timeline(query),
    queryFn: ({ pageParam }) =>
      listTimeline({ ...query, ...(pageParam ? { after: pageParam } : {}) }),
    initialPageParam: null as { createdAt: number; id: string } | null,
    getNextPageParam: (last) => {
      const end = last.events.at(-1);
      return last.hasMore && end ? { createdAt: end.createdAt, id: end.id } : undefined;
    },
    placeholderData: keepPreviousData,
  });
  const loaded = events.data?.pages.flatMap((page) => page.events) ?? [];
  const filtered = hasFilters(filters);

  const workspaceName = (id: string) =>
    workspaces.data?.find((summary) => summary.workspace.id === id)?.workspace.name;
  const groups: { day: string; date: Date; events: TimelineEvent[] }[] = [];
  for (const event of loaded) {
    const day = dayKey(event.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.events.push(event);
    } else {
      groups.push({ day, date: new Date(event.createdAt), events: [event] });
    }
  }
  const heading = (date: Date) => {
    const key = dayKey(date.getTime());
    if (key === dayKey(now.getTime())) {
      return t('timeline.today');
    }
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return key === dayKey(yesterday.getTime())
      ? t('timeline.yesterday')
      : formatDayHeading(date, now, locale);
  };

  const clear = () => {
    setClearPending(true);
    clearTimeline()
      .then(async (count) => {
        await client.invalidateQueries({ queryKey: queryKeys.dashboard });
        await client.invalidateQueries({ queryKey: queryKeys.workspaces });
        setClearing(false);
        toast.success(tCount('timeline.clear.done', count));
      })
      .catch(() => {
        toast.error(t('timeline.clear.failed'));
      })
      .finally(() => {
        setClearPending(false);
      });
  };

  let content;
  if (events.isError && !events.data) {
    content = (
      <QueryError
        error={events.error}
        onRetry={() => {
          void events.refetch();
        }}
      />
    );
  } else if (events.isPending) {
    content = (
      <div aria-hidden="true" className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-16 rounded-card" />
        ))}
      </div>
    );
  } else if (loaded.length === 0) {
    content = filtered ? (
      <EmptyState
        icon={SearchX}
        title={t('timeline.empty.filteredTitle')}
        description={t('timeline.empty.filteredDescription')}
        actions={
          <Button
            onClick={() => {
              update(RESET_TIMELINE_FILTERS);
            }}
          >
            {t('timeline.filters.reset')}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={History}
        title={t('timeline.empty.title')}
        description={t('timeline.empty.description')}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.day} aria-labelledby={`day-${group.day}`}>
            <h2
              id={`day-${group.day}`}
              className="mb-2 text-2xs font-semibold tracking-label text-fg-secondary uppercase"
            >
              {heading(group.date)}
            </h2>
            <ul className="overflow-hidden rounded-card border border-line-subtle bg-graphite">
              {group.events.map((event) => {
                const Icon = EVENT_ICONS[event.eventType];
                const title = eventTitle(event) || t('activity.untitled');
                const to = routeFor(event);
                const date = new Date(event.createdAt);
                const facts = eventFacts(
                  event,
                  t,
                  workspaceName,
                  effective.workspaceId === undefined,
                );
                return (
                  <li
                    key={event.id}
                    className="flex items-center gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel text-fg-secondary"
                    >
                      <Icon size={16} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {to ? (
                        <Link
                          to={to}
                          className="cursor-default truncate rounded-sm text-sm font-medium text-fg hover:text-blue"
                        >
                          {title}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-medium text-fg">{title}</span>
                      )}
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-fg-secondary">
                        <span>{facts.join(' · ')}</span>
                        {event.available ? null : (
                          <Badge>
                            {t(
                              event.entityType === 'relation'
                                ? 'timeline.meta.relationGone'
                                : 'timeline.meta.unavailable',
                            )}
                          </Badge>
                        )}
                      </span>
                    </div>
                    <time
                      dateTime={date.toISOString()}
                      title={formatDateTime(date, locale)}
                      className="shrink-0 text-xs text-fg-secondary tabular-nums"
                    >
                      {formatTime(date, locale)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {events.hasNextPage ? (
          <Button
            className="self-center"
            loading={events.isFetchingNextPage}
            onClick={() => {
              void events.fetchNextPage();
            }}
          >
            {t('timeline.more')}
          </Button>
        ) : (
          <p className="text-center text-xs text-fg-secondary">
            {t(filtered ? 'timeline.endFiltered' : 'timeline.end')}
          </p>
        )}
      </div>
    );
  }

  const rangeError = invalidRange(filters) ? t('timeline.filters.invalidRange') : undefined;
  return (
    <div className="flex flex-col gap-6">
      {/* Aligned on the labels: the message of an impossible period, under its field, moves nothing else. */}
      <div className="flex flex-wrap items-start gap-3">
        <div
          role="group"
          aria-label={t('timeline.filters.label')}
          className="flex flex-wrap items-start gap-3"
        >
          <Select
            label={t('timeline.filters.type')}
            value={filters.type ?? ''}
            onChange={(event) => {
              update({ type: event.target.value });
            }}
            className="w-52"
          >
            <option value="">{t('timeline.filters.allTypes')}</option>
            {TIMELINE_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`activity.events.${type}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('timeline.filters.resource')}
            value={filters.resource ?? ''}
            onChange={(event) => {
              update({ resource: event.target.value });
            }}
            className="w-48"
          >
            <option value="">{t('timeline.filters.allResources')}</option>
            {TIMELINE_RESOURCES.map((resource) => (
              <option key={resource} value={resource}>
                {t(`timeline.filters.resources.${resource}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('timeline.filters.workspace')}
            value={effective.workspaceId ?? ''}
            onChange={(event) => {
              update({ workspace: event.target.value });
            }}
            className="w-52"
          >
            <option value="">{t('timeline.filters.allWorkspaces')}</option>
            {(workspaces.data ?? []).map(({ workspace }) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
          <Select
            label={t('timeline.filters.period')}
            value={filters.period ?? ''}
            onChange={(event) => {
              const period = event.target.value;
              update(period === 'custom' ? { period } : { period, from: null, to: null });
            }}
            className="w-48"
          >
            <option value="">{t('timeline.filters.periods.all')}</option>
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {t(`timeline.filters.periods.${PERIOD_LABELS[period]}`)}
              </option>
            ))}
          </Select>
          {filters.period === 'custom' ? (
            <>
              <Input
                type="date"
                label={t('timeline.filters.from')}
                value={filters.from ?? ''}
                max={filters.to}
                onChange={(event) => {
                  update({ from: event.target.value });
                }}
                className="w-40"
              />
              <Input
                type="date"
                label={t('timeline.filters.to')}
                value={filters.to ?? ''}
                min={filters.from}
                error={rangeError}
                onChange={(event) => {
                  update({ to: event.target.value });
                }}
                className="w-40"
              />
            </>
          ) : null}
          {filtered ? (
            <Button
              variant="ghost"
              className="mt-6"
              onClick={() => {
                update(RESET_TIMELINE_FILTERS);
              }}
            >
              {t('timeline.filters.reset')}
            </Button>
          ) : null}
        </div>
        <div className="mt-6 ml-auto flex items-center gap-3">
          {events.isFetching && !events.isFetchingNextPage && events.data ? (
            <Spinner size={16} />
          ) : null}
          <Button
            icon={Trash2}
            disabled={!events.isSuccess || (loaded.length === 0 && !filtered)}
            onClick={() => {
              setClearing(true);
            }}
          >
            {t('timeline.clear.action')}
          </Button>
        </div>
      </div>
      {content}
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={t('timeline.clear.title')}
        description={t('timeline.clear.description')}
        confirmLabel={t('timeline.clear.confirm')}
        loading={clearPending}
        onConfirm={clear}
      />
    </div>
  );
}
