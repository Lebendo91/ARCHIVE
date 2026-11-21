import { useMatches } from 'react-router';
import { useI18n, type MessageKey } from '@/i18n';
import { usePageTitleStore } from './pageTitle';

/** Metadata attached to each route: page title and breadcrumb parent. */
export interface RouteHandle {
  titleKey: MessageKey;
  parent?: { titleKey: MessageKey; to: string };
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null && 'titleKey' in value;
}

/** Handle of the deepest matched route that declares one. */
export function useCurrentRouteHandle(): RouteHandle | undefined {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle: unknown = matches[index]?.handle;
    if (isRouteHandle(handle)) {
      return handle;
    }
  }
  return undefined;
}

/** Title of the current page: the one set by the page from its data, or else the title of its route. */
export function useCurrentPageTitle(): { title: string; handle: RouteHandle | undefined } {
  const { t } = useI18n();
  const handle = useCurrentRouteHandle();
  const dynamicTitle = usePageTitleStore((state) => state.title);
  return { handle, title: dynamicTitle ?? (handle ? t(handle.titleKey) : t('app.name')) };
}
