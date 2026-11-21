/** Joins class names, skipping falsy values. Used to compose Tailwind utilities conditionally. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
