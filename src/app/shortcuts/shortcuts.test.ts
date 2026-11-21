import { describe, expect, it } from 'vitest';
import { translate } from '@/i18n/translate';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { formatCombination, getShortcut, matchesCombination, SHORTCUTS } from './shortcuts';

const press = (key: string, modifiers: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key, ...modifiers });

describe('shortcuts', () => {
  it('declare every shortcut of the specification once, without conflicts', () => {
    const combos = SHORTCUTS.map(({ combination }) => JSON.stringify(combination));
    expect(new Set(combos).size).toBe(SHORTCUTS.length);
    expect(SHORTCUTS.map(({ id }) => id).sort()).toEqual(
      [
        'closeOverlay',
        'importDocument',
        'newNote',
        'newWorkspace',
        'openSearch',
        'openSettings',
        'save',
      ].sort(),
    );
  });

  it('match modifiers exactly', () => {
    const settings = getShortcut('openSettings').combination;
    expect(matchesCombination(press(',', { ctrlKey: true }), settings)).toBe(true);
    expect(matchesCombination(press(',', { ctrlKey: true, shiftKey: true }), settings)).toBe(false);
    expect(matchesCombination(press(','), settings)).toBe(false);
    expect(matchesCombination(press(',', { ctrlKey: true, metaKey: true }), settings)).toBe(false);
  });

  it('match letters whatever the case produced by Shift', () => {
    const newWorkspace = getShortcut('newWorkspace').combination;
    expect(matchesCombination(press('N', { ctrlKey: true, shiftKey: true }), newWorkspace)).toBe(
      true,
    );
  });

  it('display localized key names', () => {
    const combination = getShortcut('newWorkspace').combination;
    expect(formatCombination(combination, (key) => translate(fr, key))).toEqual([
      'Ctrl',
      'Maj',
      'N',
    ]);
    expect(formatCombination(combination, (key) => translate(en, key))).toEqual([
      'Ctrl',
      'Shift',
      'N',
    ]);
    expect(
      formatCombination(getShortcut('closeOverlay').combination, (key) => translate(fr, key)),
    ).toEqual(['Échap']);
  });
});
