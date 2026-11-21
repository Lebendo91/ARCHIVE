import { useEffect, useRef } from 'react';
import { useCurrentPageTitle } from '@/app/router/handles';
import { useI18n } from '@/i18n';

/**
 * Keeps the window title in sync with the current page and announces page changes to screen readers,
 * without moving the keyboard focus away from the navigation.
 */
export function RouteAnnouncer() {
  const { t } = useI18n();
  const { handle, title } = useCurrentPageTitle();
  const regionRef = useRef<HTMLDivElement>(null);
  const previousTitle = useRef<string | null>(null);

  useEffect(() => {
    document.title = handle ? `${title} — ${t('app.name')}` : t('app.name');
    if (previousTitle.current !== null && previousTitle.current !== title && regionRef.current) {
      regionRef.current.textContent = t('a11y.pageAnnouncement', { title });
    }
    previousTitle.current = title;
  }, [handle, title, t]);

  return <div ref={regionRef} aria-live="polite" aria-atomic="true" className="sr-only" />;
}
