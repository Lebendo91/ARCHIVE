import { describe, expect, it } from 'vitest';
import { getGreetingPeriod } from './greeting';

const at = (hours: number, minutes = 0) => new Date(2026, 10, 21, hours, minutes);

describe('getGreetingPeriod', () => {
  it.each([
    [at(5), 'morning'],
    [at(11, 59), 'morning'],
    [at(12), 'afternoon'],
    [at(17, 59), 'afternoon'],
    [at(18), 'evening'],
    [at(0), 'evening'],
    [at(4, 59), 'evening'],
  ])('maps %s to %s', (date, period) => {
    expect(getGreetingPeriod(date)).toBe(period);
  });
});
