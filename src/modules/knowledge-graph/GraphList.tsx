import { Badge } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { GraphNode } from '@/services/graph';
import { cn } from '@/utils/cn';
import { nodeTitle, type GraphSelection } from './graphModel';
import { NodeIcon } from './NodeIcon';

export interface GraphListProps {
  nodes: readonly GraphNode[];
  degrees: ReadonlyMap<string, number>;
  selection: GraphSelection | null;
  matches: ReadonlySet<string> | null;
  onSelect: (selection: GraphSelection) => void;
}

/**
 * The graph as a list, the accessible alternative to the map: every node, most connected first, with its
 * kind and its connections; selecting one shows its connections in the details panel.
 */
export function GraphList({ nodes, degrees, selection, matches, onSelect }: GraphListProps) {
  const { t, tCount } = useI18n();
  const shown = matches ? nodes.filter((node) => matches.has(node.key)) : nodes;
  return (
    <ul
      aria-label={t('graph.views.list')}
      className="max-h-full min-h-0 flex-1 self-start overflow-y-auto rounded-card border border-line-subtle bg-graphite"
    >
      {shown.map((node) => {
        const selected = selection?.type === 'node' && selection.key === node.key;
        return (
          <li
            key={node.key}
            className={cn(
              'flex items-center gap-3 border-b border-line-subtle px-4 py-2 last:border-b-0',
              selected && 'bg-steel',
            )}
          >
            <NodeIcon node={node} />
            <button
              type="button"
              data-key={node.key}
              aria-pressed={selected}
              onClick={() => {
                onSelect({ type: 'node', key: node.key });
              }}
              className="min-w-0 flex-1 cursor-default truncate rounded-sm text-left text-sm text-fg hover:text-blue"
            >
              {nodeTitle(node, t)}
            </button>
            {node.archived ? <Badge>{t('graph.archived')}</Badge> : null}
            <span className="w-32 shrink-0 truncate text-xs text-fg-secondary">
              {t(`graph.kinds.${node.kind}`)}
            </span>
            <span className="w-28 shrink-0 text-right text-xs text-fg-secondary">
              {tCount('graph.connections', degrees.get(node.key) ?? 0)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
