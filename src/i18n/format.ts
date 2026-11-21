import type { Locale } from './types';

/** BCP 47 tag used by the `Intl` APIs for each interface language. */
export const LOCALE_TAGS: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' };

const FILE_SIZE_UNITS: Record<Locale, readonly string[]> = {
  fr: ['o', 'Ko', 'Mo', 'Go', 'To'],
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
};

/** Formats a size in bytes with binary multiples, as Windows File Explorer does (1 Ko = 1 024 o). */
export function formatFileSize(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  const units = FILE_SIZE_UNITS[locale];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = unitIndex === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(LOCALE_TAGS[locale], {
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${number}\u00a0${units[unitIndex] ?? ''}`;
}

/** Formats a date as a weekday, day and month, for example « samedi 21 novembre ». */
export function formatLongDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** Formats a date, for example « 21 novembre 2026 ». */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: 'long' }).format(date);
}

/** Formats a date and time, for example « 21 novembre 2026 à 14:05 ». */
export function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/**
 * Time elapsed since `timestamp` (milliseconds), for example « il y a 5 minutes » or « hier »; less than a
 * minute ago reads « maintenant ».
 */
export function formatRelativeTime(timestamp: number, now: number, locale: Locale): string {
  const formatter = new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], { numeric: 'auto' });
  const elapsed = timestamp - now;
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= size) {
      return formatter.format(Math.round(elapsed / size), unit);
    }
  }
  return formatter.format(0, 'second');
}

/** Formats a number with the separators of the language, for example « 12 345 ». */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value);
}

/** Joins items as a sentence, for example « 2 documents, 1 note et 3 dossiers ». */
export function formatList(items: readonly string[], locale: Locale): string {
  return new Intl.ListFormat(LOCALE_TAGS[locale], { style: 'long', type: 'conjunction' }).format(
    items,
  );
}
