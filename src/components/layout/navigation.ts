import {
  Archive,
  Boxes,
  CircleHelp,
  Clock,
  History,
  LayoutDashboard,
  Library,
  MessageSquareText,
  NotebookPen,
  Settings,
  Star,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import type { MessageKey } from '@/i18n';

export interface NavItem {
  to: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  /** Only active on an exact match (used by the overview, whose path prefixes every other route). */
  end?: boolean;
}

export interface NavSection {
  id: string;
  titleKey?: MessageKey;
  items: readonly NavItem[];
}

/** Sidebar structure (specification §3.3). */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'main',
    items: [
      { to: '/', labelKey: 'nav.overview', icon: LayoutDashboard, end: true },
      { to: '/library', labelKey: 'nav.library', icon: Library },
      { to: '/notes', labelKey: 'nav.notes', icon: NotebookPen },
      { to: '/graph', labelKey: 'nav.graph', icon: Waypoints },
      { to: '/timeline', labelKey: 'nav.timeline', icon: History },
      { to: '/assistant', labelKey: 'nav.assistant', icon: MessageSquareText },
    ],
  },
  {
    id: 'workspaces',
    titleKey: 'nav.workspacesSection',
    // Exact match: a workspace page activates the shortcut of that workspace, not « All workspaces ».
    items: [{ to: '/workspaces', labelKey: 'nav.allWorkspaces', icon: Boxes, end: true }],
  },
  {
    id: 'personal',
    titleKey: 'nav.personalSection',
    items: [
      { to: '/favorites', labelKey: 'nav.favorites', icon: Star },
      { to: '/recent', labelKey: 'nav.recent', icon: Clock },
      { to: '/archived', labelKey: 'nav.archived', icon: Archive },
    ],
  },
];

export const FOOTER_ITEMS: readonly NavItem[] = [
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
  { to: '/help', labelKey: 'nav.help', icon: CircleHelp },
];
