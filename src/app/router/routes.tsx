import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AssistantPage } from '@/modules/assistant/AssistantPage';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import { HelpPage } from '@/modules/help/HelpPage';
import { GraphPage } from '@/modules/knowledge-graph/GraphPage';
import { LibraryPage } from '@/modules/library/LibraryPage';
import { NotesPage } from '@/modules/notes/NotesPage';
import { ArchivedPage, FavoritesPage, RecentPage } from '@/modules/personal/PersonalPages';
import { AboutSettings } from '@/modules/settings/AboutSettings';
import { SettingsLayout } from '@/modules/settings/SettingsLayout';
import {
  AiSettings,
  AppearanceSettings,
  GeneralSettings,
  ShortcutsSettings,
  StorageSettings,
} from '@/modules/settings/SettingsPages';
import { NotFoundPage } from '@/modules/system/NotFoundPage';
import { RouteErrorPage } from '@/modules/system/RouteErrorPage';
import { RouteLoading } from '@/modules/system/RouteLoading';
import { TimelinePage } from '@/modules/timeline/TimelinePage';
import { WorkspacesPage } from '@/modules/workspaces/WorkspacesPage';
import type { RouteHandle } from './handles';

const SETTINGS_PARENT: RouteHandle['parent'] = { titleKey: 'nav.settings', to: '/settings' };

/** Development-only routes: they are not part of production builds. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/ui',
        handle: { titleKey: 'dev.gallery' } satisfies RouteHandle,
        lazy: async () => {
          const { UiGalleryPage } = await import('@/modules/dev/UiGalleryPage');
          return { Component: UiGalleryPage };
        },
      },
    ]
  : [];

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    // Shown while a lazily loaded route (development gallery) is fetched on first load.
    hydrateFallbackElement: <RouteLoading />,
    children: [
      {
        // Pathless layout: a page error is displayed inside the shell, which stays usable.
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            element: <DashboardPage />,
            handle: { titleKey: 'nav.overview' } satisfies RouteHandle,
          },
          {
            path: 'library',
            element: <LibraryPage />,
            handle: { titleKey: 'nav.library' } satisfies RouteHandle,
          },
          {
            path: 'notes',
            element: <NotesPage />,
            handle: { titleKey: 'nav.notes' } satisfies RouteHandle,
          },
          {
            path: 'graph',
            element: <GraphPage />,
            handle: { titleKey: 'nav.graph' } satisfies RouteHandle,
          },
          {
            path: 'timeline',
            element: <TimelinePage />,
            handle: { titleKey: 'nav.timeline' } satisfies RouteHandle,
          },
          {
            path: 'assistant',
            element: <AssistantPage />,
            handle: { titleKey: 'nav.assistant' } satisfies RouteHandle,
          },
          {
            path: 'workspaces',
            element: <WorkspacesPage />,
            handle: { titleKey: 'nav.workspacesSection' } satisfies RouteHandle,
          },
          {
            path: 'favorites',
            element: <FavoritesPage />,
            handle: { titleKey: 'nav.favorites' } satisfies RouteHandle,
          },
          {
            path: 'recent',
            element: <RecentPage />,
            handle: { titleKey: 'nav.recent' } satisfies RouteHandle,
          },
          {
            path: 'archived',
            element: <ArchivedPage />,
            handle: { titleKey: 'nav.archived' } satisfies RouteHandle,
          },
          {
            path: 'settings',
            element: <SettingsLayout />,
            handle: { titleKey: 'nav.settings' } satisfies RouteHandle,
            children: [
              { index: true, element: <Navigate to="general" replace /> },
              {
                path: 'general',
                element: <GeneralSettings />,
                handle: {
                  titleKey: 'settings.sections.general',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
              {
                path: 'appearance',
                element: <AppearanceSettings />,
                handle: {
                  titleKey: 'settings.sections.appearance',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
              {
                path: 'storage',
                element: <StorageSettings />,
                handle: {
                  titleKey: 'settings.sections.storage',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
              {
                path: 'ai',
                element: <AiSettings />,
                handle: {
                  titleKey: 'settings.sections.ai',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
              {
                path: 'shortcuts',
                element: <ShortcutsSettings />,
                handle: {
                  titleKey: 'settings.sections.shortcuts',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
              {
                path: 'about',
                element: <AboutSettings />,
                handle: {
                  titleKey: 'settings.sections.about',
                  parent: SETTINGS_PARENT,
                } satisfies RouteHandle,
              },
            ],
          },
          {
            path: 'help',
            element: <HelpPage />,
            handle: { titleKey: 'nav.help' } satisfies RouteHandle,
          },
          ...devRoutes,
          {
            path: '*',
            element: <NotFoundPage />,
            handle: { titleKey: 'errors.notFoundTitle' } satisfies RouteHandle,
          },
        ],
      },
    ],
  },
];
