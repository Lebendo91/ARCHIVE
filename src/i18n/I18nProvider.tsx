import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { LOCALE_TAGS } from './format';
import { fr } from './fr';
import { translate, translateList } from './translate';
import type { Dictionary, ListKey, Locale, MessageKey, MessageParams } from './types';

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export interface I18nContextValue {
  locale: Locale;
  localeTag: string;
  t: (key: MessageKey, params?: MessageParams) => string;
  tList: (key: ListKey) => readonly string[];
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
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const context = use(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return context;
}
