import type { I18nContextValue } from '@/i18n';
import {
  COLOR_TEXT_CLASSES,
  isWorkspaceIconName,
  type WorkspaceIconName,
} from '@/modules/workspaces/appearance';
import { isRelationType } from '@/services/memory';
import type { GraphEdge, GraphNode } from '@/services/graph';

/** What the user selected on the map or in the list: a node, or a line between two nodes. */
export type GraphSelection = { type: 'node'; key: string } | { type: 'edge'; id: string };

/** Relations without direction: no arrow. */
const SYMMETRIC: ReadonlySet<string> = new Set(['related_to', 'contradicts']);

/** True when the line has a direction worth an arrow: a link, or a relation that reads one way. */
export function isDirected(edge: Pick<GraphEdge, 'kind' | 'relationType'>): boolean {
  if (edge.kind === 'link') {
    return true;
  }
  if (edge.kind === 'relation' || edge.kind === 'suggestion') {
    return edge.relationType !== null && !SYMMETRIC.has(edge.relationType);
  }
  return false;
}

/** The title shown for a node; a note without a title reads « Sans titre ». */
export function nodeTitle(node: Pick<GraphNode, 'label'>, t: I18nContextValue['t']): string {
  return node.label.trim() === '' ? t('graph.untitled') : node.label;
}

/** Page of the resource a node stands for; a tag leads to the search of its items, a concept to its search. */
export function nodeRoute(node: Pick<GraphNode, 'kind' | 'id' | 'label'>): string {
  switch (node.kind) {
    case 'document':
      return `/library/${node.id}`;
    case 'note':
      return `/notes/${node.id}`;
    case 'workspace':
      return `/workspaces/${node.id}`;
    case 'tag':
      return `/search?tag=${node.id}`;
    case 'concept':
      return `/search?q=${encodeURIComponent(node.label)}`;
  }
}

/** Icon of a workspace node; an unknown name (written by a later version) shows the folder. */
export function workspaceIconName(name: string | null): WorkspaceIconName {
  return name !== null && isWorkspaceIconName(name) ? name : 'folder';
}

/**
 * Colour of a node: documents neutral, notes in the brand accent, workspaces and tags in their own colour.
 * Never the only cue: the shape and the icon tell the kind too.
 */
export function nodeTone(node: Pick<GraphNode, 'kind' | 'color'>): string {
  switch (node.kind) {
    case 'document':
      return 'text-fg-secondary';
    case 'note':
      return 'text-amber';
    case 'concept':
      return 'text-cyan';
    default:
      return COLOR_TEXT_CLASSES[node.color ?? 'neutral'];
  }
}

/** Connections of each node among the lines drawn. */
export function shownDegrees(edges: readonly GraphEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

/** How a connection reads from one of its ends: « Explique » one way, « Expliqué par » the other. */
export function connectionLabel(edge: GraphEdge, from: string, t: I18nContextValue['t']): string {
  const outgoing = edge.source === from;
  switch (edge.kind) {
    case 'link':
      return t(outgoing ? 'graph.details.directions.linkOut' : 'graph.details.directions.linkIn');
    case 'workspace':
      return t(
        outgoing ? 'graph.details.directions.workspaceOut' : 'graph.details.directions.workspaceIn',
      );
    case 'tag':
      return t(outgoing ? 'graph.details.directions.tagOut' : 'graph.details.directions.tagIn');
    case 'concept':
      return t(
        outgoing ? 'graph.details.directions.conceptOut' : 'graph.details.directions.conceptIn',
      );
    case 'relation':
    case 'suggestion': {
      const type = edge.relationType ?? '';
      const label = isRelationType(type)
        ? t(outgoing ? `memory.relations.types.${type}` : `memory.relations.inverse.${type}`)
        : type;
      return edge.kind === 'suggestion'
        ? t('graph.details.directions.suggestion', { type: label })
        : label;
    }
  }
}

/** Folded text for the search in the graph: case and accents do not matter. */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
