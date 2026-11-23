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
import type { TimelineEvent, TimelineEventType } from '@/services/timeline';

export const EVENT_ICONS: Record<TimelineEventType, LucideIcon> = {
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
export const GENERIC_EVENTS: ReadonlySet<TimelineEventType> = new Set([
  'resource_favorited',
  'resource_archived',
  'resource_restored',
]);

/**
 * Route of the resource an event leads to, if it still exists (the core tells) and has a page: the resource
 * itself, or the item an accepted relation starts from.
 */
export function routeFor(event: TimelineEvent): string | undefined {
  switch (event.target?.kind) {
    case 'workspace':
      return `/workspaces/${event.target.id}`;
    case 'document':
      return `/library/${event.target.id}`;
    case 'note':
      return `/notes/${event.target.id}`;
    default:
      return undefined;
  }
}

/**
 * Title of the resource an event concerns: its title today while it exists (a note is created without a title,
 * a document may be renamed), otherwise the title it had then.
 */
export function eventTitle(event: TimelineEvent): string {
  const current = event.currentTitle?.trim() ?? '';
  return current !== '' ? current : event.description.trim();
}
