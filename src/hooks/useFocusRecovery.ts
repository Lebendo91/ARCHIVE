import { useEffect } from 'react';

/**
 * When the focused element leaves the page (the card of a workspace that was just archived, the page of a
 * deleted workspace…), the browser drops the focus on the document body and keyboard users lose their
 * place. This moves the focus to `fallbackId` instead. Menus and dialogs restore the focus themselves first:
 * the check runs after them and only acts when the focus is really lost.
 */
export function useFocusRecovery(fallbackId: string): void {
  useEffect(() => {
    let lastFocused: Element | null = null;
    let pending: number | undefined;

    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target instanceof Element ? event.target : null;
    };
    const observer = new MutationObserver(() => {
      if (lastFocused === null || lastFocused.isConnected || pending !== undefined) {
        return;
      }
      pending = window.setTimeout(() => {
        pending = undefined;
        const active = document.activeElement;
        if (lastFocused?.isConnected === false && (active === null || active === document.body)) {
          lastFocused = null;
          document.getElementById(fallbackId)?.focus();
        }
      }, 0);
    });

    document.addEventListener('focusin', onFocusIn);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      observer.disconnect();
      window.clearTimeout(pending);
    };
  }, [fallbackId]);
}
