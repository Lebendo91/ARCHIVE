import type { GraphData } from '@/types/bindings/GraphData';
import type { GraphEdge } from '@/types/bindings/GraphEdge';
import type { GraphEdgeKind } from '@/types/bindings/GraphEdgeKind';
import type { GraphItem } from '@/types/bindings/GraphItem';
import type { GraphNode } from '@/types/bindings/GraphNode';
import type { GraphNodeKind } from '@/types/bindings/GraphNodeKind';
import type { GraphQuery } from '@/types/bindings/GraphQuery';
import { RELATION_TYPES } from './memory';
import { callCommand } from './tauri';

export type {
  GraphData,
  GraphEdge,
  GraphEdgeKind,
  GraphItem,
  GraphNode,
  GraphNodeKind,
  GraphQuery,
};

/** Nodes drawn before any expansion (specification §11.3). */
export const GRAPH_LIMIT = 300;
/** The core never sends more nodes than this, expansions included. */
export const GRAPH_NODES_MAX = 500;
/** Items whose neighbours can be added to one graph. */
export const GRAPH_EXPANDED_MAX = 50;
/** Relations written as links in the text of notes. */
export const LINK_TYPE = 'links_to';
/** Types of connection the graph can show: the links of notes, then the types of relation. */
export const GRAPH_RELATION_TYPES: readonly string[] = [LINK_TYPE, ...RELATION_TYPES];
export const GRAPH_NODE_KINDS: readonly GraphNodeKind[] = [
  'document',
  'note',
  'workspace',
  'tag',
  'concept',
];

/** The graph that answers a query, filtered and limited by the native core. */
export function loadGraph(query: GraphQuery): Promise<GraphData> {
  return callCommand('graph_load', { query });
}
