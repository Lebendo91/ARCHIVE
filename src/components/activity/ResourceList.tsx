import { FileText, NotebookPen } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatRelativeTime, useI18n } from '@/i18n';
import type { ResourceSummary } from '@/services/dashboard';

export interface ResourceListProps {
  items: readonly ResourceSummary[];
  /** Shown when the list is empty. */
  emptyText: string;
  /** Date displayed for each resource. */
  date: 'opened' | 'updated';
}

/**
 * Compact list of documents and notes (recently opened, favorites). Resources become openable with the
 * Library and Notes modules; until then they are listed without a link rather than with a dead one.
 */
export function ResourceList({ items, emptyText, date }: ResourceListProps) {
  const { t, locale } = useI18n();
  const now = useNow();

  if (items.length === 0) {
    return <p className="text-sm text-fg-secondary">{emptyText}</p>;
  }

  return (
    <ul className="-my-2 flex flex-col">
      {items.map((item) => {
        const Icon = item.kind === 'note' ? NotebookPen : FileText;
        const timestamp =
          date === 'opened' ? (item.lastOpenedAt ?? item.updatedAt) : item.updatedAt;
        const when = new Date(timestamp);
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className="flex items-center gap-3 border-b border-line-subtle py-2 last:border-b-0"
          >
            <Icon size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">
              {item.title || t('activity.untitled')}
            </span>
            <span className="sr-only">{t(`activity.kinds.${item.kind}`)}</span>
            <time
              dateTime={when.toISOString()}
              title={formatDateTime(when, locale)}
              className="shrink-0 text-xs text-fg-secondary"
            >
              {formatRelativeTime(timestamp, now.getTime(), locale)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
