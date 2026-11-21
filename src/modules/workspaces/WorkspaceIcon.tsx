import type { TokenColor } from '@/services/workspaces';
import { cn } from '@/utils/cn';
import { COLOR_TEXT_CLASSES, isWorkspaceIconName, WORKSPACE_ICONS } from './appearance';

const SIZES = {
  sm: { box: 'h-6 w-6 rounded-sm', icon: 14 },
  md: { box: 'h-10 w-10 rounded-control', icon: 20 },
  lg: { box: 'h-12 w-12 rounded-card', icon: 24 },
} as const;

export interface WorkspaceIconProps {
  icon: string;
  color: TokenColor;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Icon of a workspace in its accent colour, on a tile. Decorative: the name always accompanies it. */
export function WorkspaceIcon({ icon, color, size = 'md', className }: WorkspaceIconProps) {
  const Icon = isWorkspaceIconName(icon) ? WORKSPACE_ICONS[icon] : WORKSPACE_ICONS.folder;
  const { box, icon: iconSize } = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center border border-line-subtle bg-steel',
        box,
        COLOR_TEXT_CLASSES[color],
        className,
      )}
    >
      <Icon size={iconSize} />
    </span>
  );
}
