import { LOCALE_TAGS } from './format';
import type { Dictionary, ListKey, Locale, MessageKey, MessageParams, PluralKey } from './types';

function lookup(dictionary: Dictionary, key: string): unknown {
  let node: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(segment in node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Replaces `{name}` placeholders. Unknown placeholders are kept so that a missing value stays visible. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

/** Returns the translated string for `key`, or the key itself if the dictionary has no such string. */
export function translate(dictionary: Dictionary, key: MessageKey, params?: MessageParams): string {
  const value = lookup(dictionary, key);
  if (typeof value !== 'string') {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation for "${key}"`);
    }
    return key;
  }
  return interpolate(value, params);
}

/** Returns the translated list for `key`, or an empty list if the dictionary has no such list. */
export function translateList(dictionary: Dictionary, key: ListKey): readonly string[] {
  const value = lookup(dictionary, key);
  return Array.isArray(value) ? (value as readonly string[]) : [];
}

/**
 * Pluralized message: picks `<base>.one` or `<base>.other` with the plural rules of the language (in French,
 * 0 and 1 are singular). `{count}` is available in the message.
 */
export function translatePlural(
  dictionary: Dictionary,
  locale: Locale,
  base: PluralKey,
  count: number,
  params?: MessageParams,
): string {
  const category =
    new Intl.PluralRules(LOCALE_TAGS[locale]).select(count) === 'one' ? 'one' : 'other';
  return translate(dictionary, `${base}.${category}` as MessageKey, { count, ...params });
}
