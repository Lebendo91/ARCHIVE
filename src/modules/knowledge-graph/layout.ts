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
  /** Width of the label written under the node. */
  label: number;
}

/** Labels longer than this are shortened on the map (GraphCanvas). */
export const LABEL_CHARS = 26;
/** Average width of a character of the 11 px labels, and the height of a label line. */
const CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 16;
const LABEL_GAP = 10;

function labelWidth(node: Pick<GraphNode, 'label'>): number {
  return Math.min(Math.max(node.label.length, 8), LABEL_CHARS) * CHAR_WIDTH;
}

/**
 * Keeps the labels apart: two labels written side by side overlap long before their nodes touch, which a
 * circular collision cannot see. Overlapping labels are pushed apart along the shorter way out, vertically
 * most of the time. Nodes are looked up in a grid of label-sized cells, so each step stays linear.
 */
function forceLabels() {
  let entries: LayoutNode[] = [];
  const cellWidth = LABEL_CHARS * CHAR_WIDTH + LABEL_GAP;
  const cellHeight = 120;
  /** Numbered cells: no string built for each node at each step. */
  const cellOf = (gx: number, gy: number) => (gx + 32_768) * 65_536 + (gy + 32_768);
  const force = (alpha: number) => {
    // Labels only matter once the map takes shape: the first steps move everything anyway.
    if (alpha > 0.4) {
      return;
    }
    const grid = new Map<number, LayoutNode[]>();
    for (const entry of entries) {
      const key = cellOf(
        Math.floor((entry.x ?? 0) / cellWidth),
        Math.floor((entry.y ?? 0) / cellHeight),
      );
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        grid.set(key, [entry]);
      }
    }
    const share = alpha * 0.5;
    for (const entry of entries) {
      const x = entry.x ?? 0;
      const base = (entry.y ?? 0) + entry.radius;
      const cx = Math.floor(x / cellWidth);
      const cy = Math.floor((entry.y ?? 0) / cellHeight);
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
          for (const other of grid.get(cellOf(gx, gy)) ?? []) {
            // Each pair once.
            if ((other.index ?? 0) <= (entry.index ?? 0)) {
              continue;
            }
            const dx = (other.x ?? 0) - x;
            const dy = (other.y ?? 0) + other.radius - base;
            const overlapX = (entry.label + other.label) / 2 + LABEL_GAP - Math.abs(dx);
            const overlapY = LABEL_HEIGHT + LABEL_GAP - Math.abs(dy);
            if (overlapX <= 0 || overlapY <= 0) {
              continue;
            }
            // Half of the shorter way out for each label, scaled down like every force as the layout settles.
            if (overlapY < overlapX) {
              const push = (dy >= 0 ? 1 : -1) * overlapY * share;
              entry.vy = (entry.vy ?? 0) - push;
              other.vy = (other.vy ?? 0) + push;
            } else {
              const push = (dx >= 0 ? 1 : -1) * overlapX * share;
              entry.vx = (entry.vx ?? 0) - push;
              other.vx = (other.vx ?? 0) + push;
            }
          }
        }
      }
    }
  };
  force.initialize = (nodes: LayoutNode[]) => {
    entries = nodes;
  };
  return force;
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
/** Steps of a first layout, and of a map that only settles around what is already placed. */
const FIRST_STEPS = 150;
const SETTLE_STEPS = 90;
/** Below this share of nodes already placed, another graph is laid out afresh. */
const REUSE_SHARE = 0.5;

export function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  known: ReadonlyMap<string, Point>,
  { pinKnown }: LayoutOptions = { pinKnown: false },
): Map<string, Point> {
  // Another graph (another starting item, for example) shares few nodes with the map drawn: its places would
  // only get in the way.
  const shared = nodes.filter((node) => known.has(node.key)).length;
  const reuse = pinKnown || shared >= nodes.length * REUSE_SHARE;
  const byKey = new Map<string, LayoutNode>();
  for (const node of nodes) {
    const entry: LayoutNode = { key: node.key, radius: nodeRadius(node), label: labelWidth(node) };
    const previous = reuse ? known.get(node.key) : undefined;
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
  const around = new Map<string, string[]>();
  for (const link of links) {
    if (typeof link.source === 'string' && typeof link.target === 'string') {
      around.set(link.source, [...(around.get(link.source) ?? []), link.target]);
      around.set(link.target, [...(around.get(link.target) ?? []), link.source]);
    }
  }

  // A new node starts on a circle around its first placed neighbour, at an angle of its own.
  let placed = 0;
  for (const entry of byKey.values()) {
    if (entry.x !== undefined) {
      placed += 1;
      continue;
    }
    const anchor = (around.get(entry.key) ?? [])
      .map((other) => byKey.get(other))
      .find((other) => other?.fx !== undefined || (other?.x !== undefined && reuse));
    if (anchor?.x !== undefined && anchor.y !== undefined) {
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

  // The starting positions are already readable: a short simulation is enough (measured: about a quarter of
  // a second for 300 nodes on a modest processor), and it runs outside the interface thread (layoutClient).
  const steps = placed > 0 ? SETTLE_STEPS : FIRST_STEPS;
  // Around nodes that do not move, a new node only answers to its neighbours: it is neither pulled towards the
  // centre of the map nor pushed by its far side.
  const settling = pinKnown && placed > 0;
  const simulation = forceSimulation<LayoutNode>(Array.from(byKey.values()))
    .randomSource(seeded(hash(nodes.map((node) => node.key).join('|'))))
    .alphaDecay(1 - Math.pow(0.001, 1 / steps))
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((entry) => entry.key)
        .distance((link) => DISTANCE[link.kind])
        .strength((link) => Math.min(1, STRENGTH[link.kind] * (settling ? 1.6 : 1))),
    )
    .force(
      'charge',
      forceManyBody<LayoutNode>()
        .strength((entry) => -260 - entry.radius * 8)
        .theta(1)
        .distanceMax(settling ? 220 : 500),
    )
    // Room for the node and for the label under it.
    .force(
      'collide',
      forceCollide<LayoutNode>((entry) => entry.radius + 30),
    )
    .force('labels', forceLabels());
  if (!settling) {
    // Separate groups stay near the centre instead of drifting away.
    simulation
      .force('x', forceX<LayoutNode>(0).strength(0.03))
      .force('y', forceY<LayoutNode>(0).strength(0.045));
  }
  simulation.stop();
  if (placed > 0) {
    // A map already drawn only settles: it is not rebuilt.
    simulation.alpha(pinKnown ? 0.6 : 0.35);
  }
  simulation.tick(steps);
  return new Map(
    Array.from(byKey.values(), (entry) => [entry.key, { x: entry.x ?? 0, y: entry.y ?? 0 }]),
  );
}
