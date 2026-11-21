import type { Dictionary, ListKey, MessageKey, MessageParams } from './types';

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
