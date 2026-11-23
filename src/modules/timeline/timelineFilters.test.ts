import { describe, expect, it } from 'vitest';
import {
  dayKey,
  dayStart,
  hasFilters,
  invalidRange,
  periodBounds,
  readTimelineParams,
  timelineQuery,
} from './timelineFilters';

const ID = '0d6f6b1e-9c55-4c3e-9a4f-3f1f6c2b8a10';
/** Tuesday 17 November 2026, 15:30, in the local calendar. */
const NOW = new Date(2026, 10, 17, 15, 30);

describe('timeline filters', () => {
  it('reads only valid values from the address', () => {
    expect(
      readTimelineParams(
        new URLSearchParams(
          `type=note_created&resource=relation&workspace=${ID}&period=30&from=x&to=y`,
        ),
      ),
    ).toEqual({
      type: 'note_created',
      resource: 'relation',
      workspaceId: ID,
      period: '30',
      from: 'x',
      to: 'y',
    });
    const ignored = readTimelineParams(
      new URLSearchParams('type=deleted_everything&resource=user&workspace=../x&period=999'),
    );
    expect(hasFilters(ignored)).toBe(false);
  });

  it('reads days in the local calendar and refuses days that do not exist', () => {
    expect(dayStart('2026-03-10')).toBe(new Date(2026, 2, 10).getTime());
    for (const value of ['2026-02-31', '2026-13-01', '10/03/2026', '', undefined]) {
      expect(dayStart(value)).toBeUndefined();
    }
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it('turns a period into bounds, today included, and an impossible one into none', () => {
    const base = readTimelineParams(new URLSearchParams());
    expect(periodBounds({ ...base, period: 'today' }, NOW)).toEqual({
      from: new Date(2026, 10, 17).getTime(),
    });
    expect(periodBounds({ ...base, period: '7' }, NOW)).toEqual({
      from: new Date(2026, 10, 11).getTime(),
    });
    // Both chosen days are included: the period ends at the midnight after the last one.
    expect(
      periodBounds({ ...base, period: 'custom', from: '2026-03-01', to: '2026-03-10' }, NOW),
    ).toEqual({ from: new Date(2026, 2, 1).getTime(), to: new Date(2026, 2, 11).getTime() });
    const impossible = { ...base, period: 'custom' as const, from: '2026-03-10', to: '2026-03-01' };
    expect(invalidRange(impossible)).toBe(true);
    expect(periodBounds(impossible, NOW)).toEqual({});
    expect(
      timelineQuery({ ...base, type: 'resource_archived', resource: 'note' }, NOW, 50),
    ).toEqual({ limit: 50, eventTypes: ['resource_archived'], entityTypes: ['note'] });
  });
});
