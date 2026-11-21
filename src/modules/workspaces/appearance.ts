import {
  BookOpen,
  Briefcase,
  Code,
  Cpu,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  House,
  Landmark,
  Lightbulb,
  Music,
  Palette,
  Rocket,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TokenColor } from '@/services/workspaces';

/**
 * Icons offered for a workspace (spec §12.1), stored by name in the database. An unknown name (written by
 * a later version, for example) is displayed with the default folder icon.
 */
export const WORKSPACE_ICONS = {
  folder: Folder,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  briefcase: Briefcase,
  cpu: Cpu,
  'flask-conical': FlaskConical,
  code: Code,
  lightbulb: Lightbulb,
  rocket: Rocket,
  landmark: Landmark,
  wrench: Wrench,
  globe: Globe,
  palette: Palette,
  heart: Heart,
  house: House,
  music: Music,
} as const satisfies Record<string, LucideIcon>;

export type WorkspaceIconName = keyof typeof WORKSPACE_ICONS;

export const WORKSPACE_ICON_NAMES = Object.keys(WORKSPACE_ICONS) as WorkspaceIconName[];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconName = 'folder';

export function isWorkspaceIconName(name: string): name is WorkspaceIconName {
  return Object.hasOwn(WORKSPACE_ICONS, name);
}

export function workspaceIcon(name: string): LucideIcon {
  return isWorkspaceIconName(name) ? WORKSPACE_ICONS[name] : WORKSPACE_ICONS.folder;
}

/**
 * Accent colours offered for a workspace. Following the palette rules (spec §2.3), Soft Cyan stays reserved
 * for intelligence features and the semantic colours for states: they are not offered, but a workspace
 * stored with one of them is still displayed correctly.
 */
export const WORKSPACE_COLORS: readonly TokenColor[] = ['amber', 'blue', 'purple', 'neutral'];

export const DEFAULT_WORKSPACE_COLOR: TokenColor = 'amber';

export const COLOR_TEXT_CLASSES: Record<TokenColor, string> = {
  amber: 'text-amber',
  blue: 'text-blue',
  cyan: 'text-cyan',
  purple: 'text-purple',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-fg-secondary',
};

export const COLOR_SWATCH_CLASSES: Record<TokenColor, string> = {
  amber: 'bg-amber',
  blue: 'bg-blue',
  cyan: 'bg-cyan',
  purple: 'bg-purple',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-fg-secondary',
};
