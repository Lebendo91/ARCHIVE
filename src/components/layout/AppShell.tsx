import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useDesktopBehavior } from '@/app/shortcuts/useDesktopBehavior';
import { useGlobalShortcuts } from '@/app/shortcuts/useGlobalShortcuts';
import { Toaster } from '@/components/ui';
import { useI18n } from '@/i18n';
import { RouteAnnouncer } from './RouteAnnouncer';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Application frame: sidebar, top bar and the scrollable content area (specification §3.2). */
export function AppShell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useGlobalShortcuts({
    openSettings: () => {
      void navigate('/settings');
    },
  });
  useDesktopBehavior();

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <div className="relative flex h-full">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-50 rounded-control bg-amber px-4 py-2 text-sm font-medium text-obsidian focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        {t('a11y.skipToContent')}
      </button>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto px-8 py-7 outline-none"
        >
          <Outlet />
        </main>
      </div>
      <RouteAnnouncer />
      <Toaster />
    </div>
  );
}
