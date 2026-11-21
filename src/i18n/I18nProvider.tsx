import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { LOCALE_TAGS } from './format';
import { fr } from './fr';
import { translate, translateList, translatePlural } from './translate';
import type { Dictionary, ListKey, Locale, MessageKey, MessageParams, PluralKey } from './types';

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export interface I18nContextValue {
  locale: Locale;
  localeTag: string;
  t: (key: MessageKey, params?: MessageParams) => string;
  tList: (key: ListKey) => readonly string[];
  /** Pluralized message, with `{count}` set to `count`. */
  tCount: (key: PluralKey, count: number, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** Interface language. French is the default; the choice becomes a persisted setting in Phase 2. */
  locale?: Locale;
  children: ReactNode;
}

export function I18nProvider({ locale = 'fr', children }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(() => {
    const dictionary = DICTIONARIES[locale];
    return {
      locale,
      localeTag: LOCALE_TAGS[locale],
      t: (key, params) => translate(dictionary, key, params),
      tList: (key) => translateList(dictionary, key),
      tCount: (key, count, params) => translatePlural(dictionary, locale, key, count, params),
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

/** Translates a key in a given language, independently of the language currently displayed. */
export function translateFor(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return translate(DICTIONARIES[locale], key, params);
}

export function useI18n(): I18nContextValue {
  const context = use(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return context;
}
