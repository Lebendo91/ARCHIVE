import { describe, expect, it } from 'vitest';
import { en } from './en';
import {
  formatFileSize,
  formatList,
  formatLongDate,
  formatNumber,
  formatRelativeTime,
} from './format';
import { fr } from './fr';
import { interpolate, translate, translateList, translatePlural } from './translate';

function collectLeaves(node: unknown, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>();
  if (typeof node === 'string' || Array.isArray(node)) {
    leaves.set(prefix, node);
    return leaves;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    for (const [path, leaf] of collectLeaves(value, prefix ? `${prefix}.${key}` : key)) {
      leaves.set(path, leaf);
    }
  }
  return leaves;
}

describe('dictionaries', () => {
  const frLeaves = collectLeaves(fr);
  const enLeaves = collectLeaves(en);

  it('have exactly the same keys in French and English', () => {
    expect([...enLeaves.keys()].sort()).toEqual([...frLeaves.keys()].sort());
  });

  it('contain no empty string or empty list', () => {
    for (const [path, value] of [...frLeaves, ...enLeaves]) {
      if (Array.isArray(value)) {
        expect(value.length, path).toBeGreaterThan(0);
      } else {
        expect(String(value).trim(), path).not.toBe('');
      }
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const [path, value] of frLeaves) {
      if (typeof value === 'string') {
        const placeholders = (text: unknown) =>
          String(text)
            .match(/\{\w+\}/g)
            ?.sort() ?? [];
        expect(placeholders(enLeaves.get(path)), path).toEqual(placeholders(value));
      }
    }
  });
});

describe('translate', () => {
  it('returns the string and interpolates parameters', () => {
    expect(translate(fr, 'nav.library')).toBe('Bibliothèque');
    expect(translate(fr, 'dashboard.welcome', { greeting: 'Bonjour' })).toBe(
      'Bonjour. Bienvenue dans ARCHIVE.',
    );
  });

  it('keeps unknown placeholders visible', () => {
    expect(interpolate('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('returns lists', () => {
    expect(translateList(fr, 'modules.notes.capabilities').length).toBe(3);
  });
});

describe('formatters', () => {
  it('format file sizes with binary multiples and localized units', () => {
    expect(formatFileSize(0, 'fr')).toBe('0\u00a0o');
    expect(formatFileSize(1536, 'fr')).toBe('1,5\u00a0Ko');
    expect(formatFileSize(5 * 1024 ** 3, 'fr')).toBe('5\u00a0Go');
    expect(formatFileSize(1536, 'en')).toBe('1.5\u00a0KB');
    expect(formatFileSize(-1, 'fr')).toBe('—');
  });

  it('format long dates in French', () => {
    expect(formatLongDate(new Date(2026, 10, 21, 9, 0), 'fr')).toBe('samedi 21 novembre');
  });
});

describe('plural forms', () => {
  it('follow the plural rules of each language', () => {
    expect(translatePlural(fr, 'fr', 'workspaces.counts.documents', 0)).toBe('0 document');
    expect(translatePlural(fr, 'fr', 'workspaces.counts.documents', 1)).toBe('1 document');
    expect(translatePlural(fr, 'fr', 'workspaces.counts.documents', 2)).toBe('2 documents');
    expect(translatePlural(en, 'en', 'workspaces.counts.documents', 0)).toBe('0 documents');
    expect(translatePlural(en, 'en', 'workspaces.counts.documents', 1)).toBe('1 document');
    expect(translatePlural(en, 'en', 'workspaces.counts.folders', 3)).toBe('3 folders');
  });

  it('can display a formatted count', () => {
    expect(translatePlural(fr, 'fr', 'dashboard.storageFiles', 1234, { count: '1\u202f234' })).toBe(
      '1\u202f234 fichiers stockés',
    );
  });
});

describe('formatting', () => {
  const now = Date.UTC(2026, 10, 21, 15, 0);

  it('describes elapsed time in each language', () => {
    expect(formatRelativeTime(now - 30_000, now, 'fr')).toBe('maintenant');
    expect(formatRelativeTime(now - 5 * 60_000, now, 'fr')).toBe('il y a 5 minutes');
    expect(formatRelativeTime(now - 24 * 3_600_000, now, 'fr')).toBe('hier');
    expect(formatRelativeTime(now - 30_000, now, 'en')).toBe('now');
    expect(formatRelativeTime(now - 2 * 3_600_000, now, 'en')).toBe('2 hours ago');
  });

  it('joins lists and groups digits as each language does', () => {
    expect(formatList(['2 documents', '1 note', '3 dossiers'], 'fr')).toBe(
      '2 documents, 1 note et 3 dossiers',
    );
    expect(formatList(['2 documents', '1 note', '3 folders'], 'en')).toBe(
      '2 documents, 1 note, and 3 folders',
    );
    expect(formatNumber(12_345, 'fr')).toBe('12\u202f345');
    expect(formatNumber(12_345, 'en')).toBe('12,345');
  });
});
