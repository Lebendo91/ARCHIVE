import { useLayoutEffect } from 'react';
import { create } from 'zustand';

interface PageTitleState {
  title: string | null;
}

/** Title of the current page when it depends on data (a workspace name, for example). */
export const usePageTitleStore = create<PageTitleState>()(() => ({ title: null }));

/**
 * Replaces the route title of the current page (top bar, window title, screen reader announcement) with
 * `title` while the page is displayed. Layout effects keep the title in step with the route, frame by frame.
 */
export function usePageTitle(title: string | undefined): void {
  useLayoutEffect(() => {
    if (title === undefined) {
      return undefined;
    }
    usePageTitleStore.setState({ title });
    return () => {
      usePageTitleStore.setState({ title: null });
    };
  }, [title]);
}
