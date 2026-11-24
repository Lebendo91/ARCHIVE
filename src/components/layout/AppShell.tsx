import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useDesktopBehavior } from '@/app/shortcuts/useDesktopBehavior';
import { useGlobalShortcuts } from '@/app/shortcuts/useGlobalShortcuts';
import { ResourceDialogs } from '@/components/resources/ResourceDialogs';
import { flushPendingSaves } from '@/modules/notes/closeGuard';
import { SearchPalette } from '@/modules/search/SearchPalette';
import { useSearchPalette } from '@/stores/searchPalette';
import { Toaster } from '@/components/ui';
import { useFocusRecovery } from '@/hooks/useFocusRecovery';
import { useI18n } from '@/i18n';
import { ImportController } from '@/modules/library/ImportController';
import { usePdfExtraction } from '@/modules/library/usePdfExtraction';
import { useMemoryEvents } from '@/modules/memory/useMemoryEvents';
import { useRestoreNotice } from '@/modules/settings/useRestoreNotice';
import { useStartImport } from '@/modules/library/useStartImport';
import { useCreateNote } from '@/modules/notes/useCreateNote';
import { WorkspaceDialogs } from '@/modules/workspaces/WorkspaceDialogs';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { RouteAnnouncer } from './RouteAnnouncer';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Application frame: sidebar, top bar and the scrollable content area (specification §3.2). */
export function AppShell() {
  useRestoreNotice();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const startImport = useStartImport();
  const createNote = useCreateNote();

  useGlobalShortcuts({
    openSearch: () => {
      // Never replaces another dialog; the palette itself stays open (its input has the focus).
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        useSearchPalette.getState().open();
      }
    },
    save: () => {
      // Never the save dialog of the web view: the changes of the note being edited are saved now.
      void flushPendingSaves();
    },
    openSettings: () => {
      void navigate('/settings');
    },
    importDocument: () => {
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        void startImport('pick');
      }
    },
    newWorkspace: () => {
      // Never replaces a dialog that is already open.
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        workspaceDialogs.create();
      }
    },
    newNote: () => {
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        void createNote();
      }
    },
  });
  useDesktopBehavior();
  useFocusRecovery('main-content');
  usePdfExtraction();
  useMemoryEvents();

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
      <WorkspaceDialogs />
      <ResourceDialogs />
      <SearchPalette />
      <ImportController />
      <Toaster />
    </div>
  );
}
