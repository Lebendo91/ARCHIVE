import {
  GRAPH_LIMIT,
  GRAPH_NODE_KINDS,
  GRAPH_RELATION_TYPES,
  type GraphItem,
  type GraphNodeKind,
  type GraphQuery,
} from '@/services/graph';

export type GraphView = 'map' | 'list';

/** What the graph shows, read from the address: a link can open a filtered graph around an item. */
export interface GraphFilters {
  kinds: GraphNodeKind[];
  /** Types of connection between items: `links_to` and the types of relation. */
  types: string[];
  suggestions: boolean;
  workspaceId: string | undefined;
  focus: GraphItem | undefined;
  view: GraphView;
}

/** Items only: the organisation (workspaces, tags) is shown on request. */
export const DEFAULT_KINDS: readonly GraphNodeKind[] = ['document', 'note'];
/** Kinds of node that are items: at least one of them stays selected. */
export const ITEM_KINDS: readonly GraphNodeKind[] = ['document', 'note'];

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Written in the address when the user unchecks every type of connection. */
const NONE = 'none';

function listParam<T extends string>(value: string | null, allowed: readonly T[]): T[] | undefined {
  if (value === null) {
    return undefined;
  }
  const parts = value.split(',');
  return allowed.filter((candidate) => parts.includes(candidate));
}

export function readGraphParams(params: URLSearchParams): GraphFilters {
  const kinds = listParam(params.get('kinds'), GRAPH_NODE_KINDS);
  const types = listParam(params.get('types'), GRAPH_RELATION_TYPES);
  const workspace = params.get('workspace');
  const focusParts = (params.get('focus') ?? '').split(':');
  const [focusKind, focusId] = focusParts.length === 2 ? focusParts : [];
  const kind = GRAPH_NODE_KINDS.find((candidate) => candidate === focusKind);
  return {
    kinds:
      kinds?.some((candidate) => ITEM_KINDS.includes(candidate)) === true
        ? kinds
        : [...DEFAULT_KINDS],
    types: types ?? [...GRAPH_RELATION_TYPES],
    suggestions: params.get('suggestions') === '1',
    workspaceId: workspace !== null && ID.test(workspace) ? workspace : undefined,
    focus: kind && focusId && ID.test(focusId) ? { kind, id: focusId } : undefined,
    view: params.get('view') === 'list' ? 'list' : 'map',
  };
}

function sameSet(values: readonly string[], reference: readonly string[]): boolean {
  return values.length === reference.length && reference.every((value) => values.includes(value));
}

/** Changes of the address for a new set of node kinds (`null` removes a parameter). */
export function kindsParam(kinds: readonly GraphNodeKind[]): string | null {
  return sameSet(kinds, DEFAULT_KINDS)
    ? null
    : GRAPH_NODE_KINDS.filter((kind) => kinds.includes(kind)).join(',');
}

export function typesParam(types: readonly string[]): string | null {
  if (sameSet(types, GRAPH_RELATION_TYPES)) {
    return null;
  }
  return types.length === 0
    ? NONE
    : GRAPH_RELATION_TYPES.filter((type) => types.includes(type)).join(',');
}

export function focusParam(item: GraphItem | undefined): string | null {
  return item ? `${item.kind}:${item.id}` : null;
}

/** True when the filters are the default ones: an empty graph then means « no relation yet ». */
export function hasDefaultFilters(filters: GraphFilters): boolean {
  return (
    sameSet(filters.kinds, DEFAULT_KINDS) &&
    sameSet(filters.types, GRAPH_RELATION_TYPES) &&
    !filters.suggestions &&
    filters.workspaceId === undefined
  );
}

/** Address parameters that bring the default filters back (the focus and the view are kept). */
export const RESET_FILTERS = { kinds: null, types: null, suggestions: null, workspace: null };

export function graphQuery(filters: GraphFilters, expanded: readonly GraphItem[]): GraphQuery {
  return {
    nodeKinds: filters.kinds,
    relationTypes: filters.types,
    ...(filters.suggestions ? { includeSuggestions: true } : {}),
    ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
    ...(filters.focus ? { focus: filters.focus } : {}),
    ...(expanded.length > 0 ? { expanded: [...expanded] } : {}),
    limit: GRAPH_LIMIT,
  };
}
