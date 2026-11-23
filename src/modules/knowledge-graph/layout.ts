import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphEdge, GraphEdgeKind, GraphNode } from '@/services/graph';

export interface Point {
  x: number;
  y: number;
}

interface LayoutNode extends SimulationNodeDatum {
  key: string;
  radius: number;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  kind: GraphEdgeKind;
}

/** Radius of a node: larger for a workspace, smaller for a tag, growing slowly with its connections. */
export function nodeRadius(node: Pick<GraphNode, 'kind' | 'degree'>): number {
  const base = node.kind === 'workspace' ? 15 : node.kind === 'tag' ? 9 : 11;
  return base + Math.min(9, Math.sqrt(node.degree) * 1.5);
}

/** Stable number for a text (FNV-1a). */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Deterministic pseudo-random numbers (xorshift32): the same graph is always drawn the same way. */
function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Items connected by what they say stay close; the organisation (workspaces, tags) holds them loosely. The
 * distances leave room for the labels written under the nodes.
 */
const DISTANCE: Record<GraphEdgeKind, number> = {
  link: 110,
  relation: 110,
  suggestion: 130,
  tag: 100,
  workspace: 120,
};
const STRENGTH: Record<GraphEdgeKind, number> = {
  link: 0.6,
  relation: 0.6,
  suggestion: 0.3,
  tag: 0.2,
  workspace: 0.12,
};

/**
 * Starting positions of a graph laid out for the first time: each group of connected nodes gets its own
 * place, larger groups first, and inside a group the nodes stand on rings around its most connected node,
 * one ring per step away from it. The simulation then only refines a readable arrangement, instead of
 * untangling groups that started mixed together.
 */
function seedPositions(
  entries: readonly LayoutNode[],
  links: readonly LayoutLink[],
  degree: ReadonlyMap<string, number>,
): void {
  const neighbours = new Map<string, string[]>();
  for (const link of links) {
    if (typeof link.source !== 'string' || typeof link.target !== 'string') {
      continue;
    }
    neighbours.set(link.source, [...(neighbours.get(link.source) ?? []), link.target]);
    neighbours.set(link.target, [...(neighbours.get(link.target) ?? []), link.source]);
  }
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const seen = new Set<string>();
  const groups: string[][][] = [];
  // Entries come most connected first: each group starts from its hub.
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      continue;
    }
    seen.add(entry.key);
    const rings: string[][] = [[entry.key]];
    for (;;) {
      const next: string[] = [];
      for (const key of rings.at(-1) ?? []) {
        const around = [...(neighbours.get(key) ?? [])].sort(
          (a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0),
        );
        for (const other of around) {
          if (!seen.has(other) && byKey.has(other)) {
            seen.add(other);
            next.push(other);
          }
        }
      }
      if (next.length === 0) {
        break;
      }
      rings.push(next);
    }
    groups.push(rings);
  }
  groups.sort((a, b) => b.flat().length - a.flat().length);
  // Groups on a spiral around the largest one, each far enough from the previous ones.
  let angle = 0;
  let distance = 0;
  for (const rings of groups) {
    const reach = 60 + rings.length * 110;
    const centre = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    rings.forEach((ring, depth) => {
      ring.forEach((key, index) => {
        const entry = byKey.get(key);
        if (!entry || entry.x !== undefined) {
          return;
        }
        const turn = (2 * Math.PI * index) / ring.length + depth * 0.6;
        entry.x = centre.x + Math.cos(turn) * depth * 110;
        entry.y = centre.y + Math.sin(turn) * depth * 110;
      });
    });
    distance += reach;
    angle += 2.4;
  }
}

export interface LayoutOptions {
  /**
   * Nodes already placed do not move: for an expansion, so that the map the user is reading stays as it is.
   * Otherwise (other filters), they only start from their place and may shift to make room.
   */
  pinKnown: boolean;
}

/**
 * Positions of the nodes, computed once per graph received, never on each render (spec §4.2). Nodes already
 * placed start where they were, so that the map is not reshuffled (spec §11.3, controlled layouts); a new
 * node starts next to a placed neighbour. The layout runs a fixed number of steps of a force simulation,
 * without animation, with a seeded random source: the same graph is always drawn the same way.
 */
export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  known: ReadonlyMap<string, Point>,
  { pinKnown }: LayoutOptions = { pinKnown: false },
): Map<string, Point> {
  const byKey = new Map<string, LayoutNode>();
  for (const node of nodes) {
    const entry: LayoutNode = { key: node.key, radius: nodeRadius(node) };
    const previous = known.get(node.key);
    if (previous) {
      entry.x = previous.x;
      entry.y = previous.y;
      if (pinKnown) {
        entry.fx = previous.x;
        entry.fy = previous.y;
      }
    }
    byKey.set(node.key, entry);
  }
  const links: LayoutLink[] = edges
    .filter((edge) => byKey.has(edge.source) && byKey.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, kind: edge.kind }));

  // A new node starts on a circle around its first placed neighbour, at an angle of its own.
  let placed = 0;
  for (const entry of byKey.values()) {
    if (entry.x !== undefined) {
      placed += 1;
      continue;
    }
    const anchor = links
      .map((link) =>
        link.source === entry.key ? link.target : link.target === entry.key ? link.source : null,
      )
      .map((other) => (typeof other === 'string' ? known.get(other) : undefined))
      .find((point) => point !== undefined);
    if (anchor) {
      const angle = ((hash(entry.key) % 360) * Math.PI) / 180;
      entry.x = anchor.x + Math.cos(angle) * (entry.radius + 60);
      entry.y = anchor.y + Math.sin(angle) * (entry.radius + 60);
    }
  }
  if (placed === 0) {
    const degree = new Map(nodes.map((node) => [node.key, node.degree]));
    seedPositions(Array.from(byKey.values()), links, degree);
  }
  if (placed === byKey.size && pinKnown) {
    return new Map(
      Array.from(byKey.values(), (entry) => [entry.key, { x: entry.x ?? 0, y: entry.y ?? 0 }]),
    );
  }

  const simulation = forceSimulation<LayoutNode>(Array.from(byKey.values()))
    .randomSource(seeded(hash(nodes.map((node) => node.key).join('|'))))
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((entry) => entry.key)
        .distance((link) => DISTANCE[link.kind])
        .strength((link) => STRENGTH[link.kind]),
    )
    .force(
      'charge',
      forceManyBody<LayoutNode>()
        .strength((entry) => -260 - entry.radius * 8)
        .distanceMax(700),
    )
    // Room for the node and for the label under it.
    .force('collide', forceCollide<LayoutNode>((entry) => entry.radius + 34).iterations(2))
    // Separate groups stay near the centre instead of drifting away.
    .force('x', forceX<LayoutNode>(0).strength(0.03))
    .force('y', forceY<LayoutNode>(0).strength(0.045))
    .stop();
  if (placed > 0) {
    // A map already drawn only settles: it is not rebuilt.
    simulation.alpha(pinKnown ? 0.6 : 0.35);
  }
  simulation.tick(placed > 0 ? 160 : 300);
  return new Map(
    Array.from(byKey.values(), (entry) => [entry.key, { x: entry.x ?? 0, y: entry.y ?? 0 }]),
  );
}
