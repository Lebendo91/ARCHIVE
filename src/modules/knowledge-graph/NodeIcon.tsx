import { FileText, Lightbulb, NotebookText, Tag as TagIcon, type LucideIcon } from 'lucide-react';
import { WORKSPACE_ICONS } from '@/modules/workspaces/appearance';
import type { GraphNode } from '@/services/graph';
import { cn } from '@/utils/cn';
import { nodeTone, workspaceIconName } from './graphModel';

export const KIND_ICONS: Record<'document' | 'note' | 'tag' | 'concept', LucideIcon> = {
  document: FileText,
  note: NotebookText,
  tag: TagIcon,
  concept: Lightbulb,
};

/** Icon of a node, in its colour; decorative: the title always accompanies it. */
export function NodeIcon({
  node,
  size = 16,
  className,
}: {
  node: Pick<GraphNode, 'kind' | 'icon' | 'color'>;
  size?: number;
  className?: string;
}) {
  const Icon =
    node.kind === 'workspace'
      ? WORKSPACE_ICONS[workspaceIconName(node.icon)]
      : KIND_ICONS[node.kind];
  return (
    <Icon size={size} aria-hidden="true" className={cn('shrink-0', nodeTone(node), className)} />
  );
}
