import { Link } from 'react-router';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatRelativeTime, useI18n } from '@/i18n';
import type { TimelineEvent } from '@/services/dashboard';
import { EVENT_ICONS, eventTitle, GENERIC_EVENTS, routeFor } from './events';

export interface ActivityListProps {
  events: readonly TimelineEvent[];
  /** Shown when there is no event yet. */
  emptyText: string;
  /** Resource displayed by the page itself: its events are not linked to the page they are on. */
  currentEntityId?: string;
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
        const title = eventTitle(event) || t('activity.untitled');
        const to = event.target?.id === currentEntityId ? undefined : routeFor(event);
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
