import {
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
  type TimelineQuery,
} from '@/services/timeline';

export const TIMELINE_RESOURCES = ['document', 'note', 'workspace', 'relation'] as const;
export type TimelineResource = (typeof TIMELINE_RESOURCES)[number];

export const PERIODS = ['today', '7', '30', '365', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

/** Filters of the timeline, read from the address so that a filtered history can be linked. */
export interface TimelineFilters {
  type: TimelineEventType | undefined;
  resource: TimelineResource | undefined;
  workspaceId: string | undefined;
  period: Period | undefined;
  /** Chosen dates (`YYYY-MM-DD`), both included. */
  from: string | undefined;
  to: string | undefined;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

/** Midnight of a `YYYY-MM-DD` day in the local calendar, or `undefined` for anything else. */
export function dayStart(value: string | undefined): number | undefined {
  const match = value === undefined ? null : DAY.exec(value);
  if (!match) {
    return undefined;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // 2026-02-31 is not a day: the Date would silently move to March.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date.getTime()
    : undefined;
}

export function readTimelineParams(params: URLSearchParams): TimelineFilters {
  const workspace = params.get('workspace');
  return {
    type: pick(params.get('type'), TIMELINE_EVENT_TYPES),
    resource: pick(params.get('resource'), TIMELINE_RESOURCES),
    workspaceId: workspace !== null && ID.test(workspace) ? workspace : undefined,
    period: pick(params.get('period'), PERIODS),
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
}

/** True when the chosen dates cannot form a period: the end comes before the start. */
export function invalidRange(filters: TimelineFilters): boolean {
  const from = dayStart(filters.from);
  const to = dayStart(filters.to);
  return filters.period === 'custom' && from !== undefined && to !== undefined && to < from;
}

/** Bounds of the period in milliseconds, in the local calendar; today included. */
export function periodBounds(filters: TimelineFilters, now: Date): { from?: number; to?: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = (days: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)).getTime();
  switch (filters.period) {
    case 'today':
      return { from: today.getTime() };
    case '7':
    case '30':
    case '365':
      return { from: daysBack(Number(filters.period)) };
    case 'custom': {
      if (invalidRange(filters)) {
        return {};
      }
      const from = dayStart(filters.from);
      const to = dayStart(filters.to);
      const end =
        to === undefined
          ? undefined
          : new Date(
              new Date(to).getFullYear(),
              new Date(to).getMonth(),
              new Date(to).getDate() + 1,
            ).getTime();
      return {
        ...(from === undefined ? {} : { from }),
        ...(end === undefined ? {} : { to: end }),
      };
    }
    case undefined:
      return {};
  }
}

/** The query of the core for a page of events (without its cursor). */
export function timelineQuery(
  filters: TimelineFilters,
  now: Date,
  limit: number,
): Omit<TimelineQuery, 'after'> {
  const bounds = periodBounds(filters, now);
  return {
    limit,
    ...(filters.type ? { eventTypes: [filters.type] } : {}),
    ...(filters.resource ? { entityTypes: [filters.resource] } : {}),
    ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
    ...bounds,
  };
}

export function hasFilters(filters: TimelineFilters): boolean {
  return (
    filters.type !== undefined ||
    filters.resource !== undefined ||
    filters.workspaceId !== undefined ||
    filters.period !== undefined
  );
}

export const RESET_TIMELINE_FILTERS = {
  type: null,
  resource: null,
  workspace: null,
  period: null,
  from: null,
  to: null,
};

/** Local day of a timestamp, as a key to group the events by day. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
