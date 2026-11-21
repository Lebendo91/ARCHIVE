import { useEffect, useRef } from 'react';
import { matchesCombination, SHORTCUTS, type ShortcutId } from './shortcuts';

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

/**
 * Listens for the application shortcuts. Every shortcut uses a modifier, so it also works while typing in
 * a field; only shortcuts marked available and given a handler react.
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      for (const shortcut of SHORTCUTS) {
        const handler = handlersRef.current[shortcut.id];
        if (handler && shortcut.available && matchesCombination(event, shortcut.combination)) {
          event.preventDefault();
          handler();
          return;
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
