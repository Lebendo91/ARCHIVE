import type { TimelineCursor } from '@/types/bindings/TimelineCursor';
import type { TimelineEvent } from '@/types/bindings/TimelineEvent';
import type { TimelineEventType } from '@/types/bindings/TimelineEventType';
import type { TimelinePage } from '@/types/bindings/TimelinePage';
import type { TimelineQuery } from '@/types/bindings/TimelineQuery';
import type { TimelineTarget } from '@/types/bindings/TimelineTarget';
import { callCommand } from './tauri';

export type {
  TimelineCursor,
  TimelineEvent,
  TimelineEventType,
  TimelinePage,
  TimelineQuery,
  TimelineTarget,
};

/** The meaningful operations recorded in the timeline (specification §13.1). */
export const TIMELINE_EVENT_TYPES: readonly TimelineEventType[] = [
  'document_imported',
  'note_created',
  'note_modified',
  'resource_favorited',
  'workspace_created',
  'relation_accepted',
  'resource_archived',
  'resource_restored',
];

/** A page of the timeline, most recent first, with the filters applied by the native core. */
export function listTimeline(query: TimelineQuery): Promise<TimelinePage> {
  return callCommand('timeline_list', { query });
}

/** Clears the whole history; returns the number of events removed. */
export function clearTimeline(): Promise<number> {
  return callCommand('timeline_clear');
}
