import { useEffect } from 'react';
import { matchesCombination, type KeyCombination } from './shortcuts';

/**
 * Browser commands that make no sense in a desktop application and could interrupt the user's work:
 * reloading the interface, printing the window, caret browsing.
 */
export const BLOCKED_BROWSER_COMBINATIONS: readonly KeyCombination[] = [
  { key: 'F5' },
  { key: 'F5', ctrl: true },
  { key: 'r', ctrl: true },
  { key: 'r', ctrl: true, shift: true },
  { key: 'p', ctrl: true },
  { key: 'F7' },
];

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null
  );
}

/**
 * Gives the webview the behaviour of a desktop application: browser shortcuts are disabled and the
 * webview context menu only appears where it is useful (editable fields, selected text). Disabled while
 * developing, to keep reloading and the developer tools at hand.
 */
export function useDesktopBehavior(enabled = !import.meta.env.DEV): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (
        BLOCKED_BROWSER_COMBINATIONS.some((combination) => matchesCombination(event, combination))
      ) {
        event.preventDefault();
      }
    }
    function onContextMenu(event: MouseEvent) {
      const hasSelection = (window.getSelection()?.toString() ?? '') !== '';
      if (!isEditable(event.target) && !hasSelection) {
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [enabled]);
}
