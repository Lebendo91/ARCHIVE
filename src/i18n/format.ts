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
