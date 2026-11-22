import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LibraryView = 'list' | 'grid';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  libraryView: LibraryView;
  setLibraryView: (view: LibraryView) => void;
}

/**
 * Interface preferences that are convenient but not critical (they may be lost without harm) are kept in
 * the webview's local storage. Application settings are stored in SQLite by the native core (Phase 2).
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },
      libraryView: 'list',
      setLibraryView: (view) => {
        set({ libraryView: view });
      },
    }),
    {
      name: 'archive.ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        libraryView: state.libraryView,
      }),
    },
  ),
);
