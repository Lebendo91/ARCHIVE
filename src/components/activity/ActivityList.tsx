import {
  Archive,
  ArchiveRestore,
  Boxes,
  FileText,
  NotebookPen,
  Pencil,
  Star,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatRelativeTime, useI18n } from '@/i18n';
import type { TimelineEvent, TimelineEventType } from '@/services/dashboard';

const EVENT_ICONS: Record<TimelineEventType, LucideIcon> = {
  document_imported: FileText,
  note_created: NotebookPen,
  note_modified: Pencil,
  resource_favorited: Star,
  workspace_created: Boxes,
  relation_accepted: Waypoints,
  resource_archived: Archive,
  resource_restored: ArchiveRestore,
};

/** Events whose label does not say which kind of resource they concern. */
const GENERIC_EVENTS: ReadonlySet<TimelineEventType> = new Set([
  'resource_favorited',
  'resource_archived',
  'resource_restored',
]);

export interface ActivityListProps {
  events: readonly TimelineEvent[];
  /** Shown when there is no event yet. */
  emptyText: string;
  /** Resource displayed by the page itself: its events are not linked to the page they are on. */
  currentEntityId?: string;
}

/** Route of the resource an event concerns, if it still exists (the core tells) and has a page. */
function routeFor(event: TimelineEvent): string | undefined {
  if (!event.available) {
    return undefined;
  }
  switch (event.entityType) {
    case 'workspace':
      return `/workspaces/${event.entityId}`;
    case 'document':
      return `/library/${event.entityId}`;
    default:
      return undefined;
  }
}

/** Latest events of the timeline (spec §6.1 and §12.2), most recent first, from the database. */
export function ActivityList({ events, emptyText, currentEntityId }: ActivityListProps) {
  const { t, locale } = useI18n();
  const now = useNow();

  if (events.length === 0) {
    return <p className="text-sm text-fg-secondary">{emptyText}</p>;
  }

  return (
    <ul className="-my-3 flex flex-col">
      {events.map((event) => {
        const Icon = EVENT_ICONS[event.eventType];
        const title = event.description || t('activity.untitled');
        const to = event.entityId === currentEntityId ? undefined : routeFor(event);
        const label = GENERIC_EVENTS.has(event.eventType)
          ? `${t(`activity.events.${event.eventType}`)} · ${t(`activity.kinds.${event.entityType}`)}`
          : t(`activity.events.${event.eventType}`);
        const date = new Date(event.createdAt);
        return (
          <li
            key={event.id}
            className="flex items-center gap-3 border-b border-line-subtle py-3 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel text-fg-secondary"
            >
              <Icon size={16} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
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
              <span className="truncate text-xs text-fg-secondary">{label}</span>
            </div>
            <time
              dateTime={date.toISOString()}
              title={formatDateTime(date, locale)}
              className="shrink-0 text-xs text-fg-secondary"
            >
              {formatRelativeTime(event.createdAt, now.getTime(), locale)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
