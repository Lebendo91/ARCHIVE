export type GreetingPeriod = 'morning' | 'afternoon' | 'evening';

/** Greeting period by local time: 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening. */
export function getGreetingPeriod(date: Date): GreetingPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return 'morning';
  }
  if (hour >= 12 && hour < 18) {
    return 'afternoon';
  }
  return 'evening';
}
