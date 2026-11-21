import { useMatches } from 'react-router';
import type { MessageKey } from '@/i18n';

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
