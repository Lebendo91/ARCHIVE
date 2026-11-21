import type { MessageKey } from '@/i18n';

export type ShortcutId =
  | 'openSearch'
  | 'newNote'
  | 'importDocument'
  | 'newWorkspace'
  | 'save'
  | 'openSettings'
  | 'closeOverlay';

export interface KeyCombination {
  /** `KeyboardEvent.key`, lowercase for printable characters (for example `k` or `,`), or a named key. */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition {
  id: ShortcutId;
  combination: KeyCombination;
  labelKey: MessageKey;
  /** False until the module that handles the shortcut is delivered. */
  available: boolean;
}

/** Application shortcuts (specification §17.3). The reference page lists them with their availability. */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'openSearch',
    combination: { key: 'k', ctrl: true },
    labelKey: 'shortcuts.openSearch',
    available: false,
  },
  {
    id: 'newNote',
    combination: { key: 'n', ctrl: true },
    labelKey: 'shortcuts.newNote',
    available: false,
  },
  {
    id: 'importDocument',
    combination: { key: 'o', ctrl: true },
    labelKey: 'shortcuts.importDocument',
    available: false,
  },
  {
    id: 'newWorkspace',
    combination: { key: 'n', ctrl: true, shift: true },
    labelKey: 'shortcuts.newWorkspace',
    available: false,
  },
  {
    id: 'save',
    combination: { key: 's', ctrl: true },
    labelKey: 'shortcuts.save',
    available: false,
  },
  {
    id: 'openSettings',
    combination: { key: ',', ctrl: true },
    labelKey: 'shortcuts.openSettings',
    available: true,
  },
  {
    id: 'closeOverlay',
    combination: { key: 'Escape' },
    labelKey: 'shortcuts.closeOverlay',
    available: true,
  },
];

export function getShortcut(id: ShortcutId): ShortcutDefinition {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!shortcut) {
    throw new Error(`Unknown shortcut "${id}"`);
  }
  return shortcut;
}

/** Compares the pressed keys with a combination. The Windows logo key never matches. */
export function matchesCombination(event: KeyboardEvent, combination: KeyCombination): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return (
    key === combination.key &&
    event.ctrlKey === Boolean(combination.ctrl) &&
    event.shiftKey === Boolean(combination.shift) &&
    event.altKey === Boolean(combination.alt) &&
    !event.metaKey
  );
}

/** Returns the keys to display, localized (for example `['Ctrl', 'Maj', 'N']` in French). */
export function formatCombination(
  combination: KeyCombination,
  t: (key: MessageKey) => string,
): string[] {
  const keys: string[] = [];
  if (combination.ctrl) keys.push(t('keys.ctrl'));
  if (combination.shift) keys.push(t('keys.shift'));
  if (combination.alt) keys.push(t('keys.alt'));
  if (combination.key === 'Escape') {
    keys.push(t('keys.escape'));
  } else {
    keys.push(combination.key.length === 1 ? combination.key.toUpperCase() : combination.key);
  }
  return keys;
}
