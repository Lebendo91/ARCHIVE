import { describe, expect, it } from 'vitest';
import { GRAPH_RELATION_TYPES, type GraphEdge, type GraphNode } from '@/services/graph';
import {
  DEFAULT_KINDS,
  graphQuery,
  hasDefaultFilters,
  kindsParam,
  readGraphParams,
  typesParam,
} from './graphParams';
import { layoutGraph, nodeRadius, type Point } from './layout';
import {
  distanceToSegment,
  fitView,
  nearestInDirection,
  revealPoint,
  toGraph,
  zoomAround,
  ZOOM_MAX,
} from './viewport';

const ID = '0d6f6b1e-9c55-4c3e-9a4f-3f1f6c2b8a10';
const OTHER = '6a1c1f0e-2b7d-4b1a-8e5f-4f2a9d3c7e21';

function node(index: number, degree = 1): GraphNode {
  return {
    key: `note:${String(index)}`,
    kind: 'note',
    id: String(index),
    label: `Note ${String(index)}`,
    degree,
    archived: false,
    format: null,
    color: null,
    icon: null,
  };
}

function edge(source: number, target: number): GraphEdge {
  return {
    id: `${String(source)}-${String(target)}`,
    kind: 'link',
    source: `note:${String(source)}`,
    target: `note:${String(target)}`,
    relationType: 'links_to',
    origin: 'user',
    confidence: null,
  };
}

describe('graph address', () => {
  it('reads the default filters, and keeps only valid values', () => {
    const defaults = readGraphParams(new URLSearchParams());
    expect(defaults.kinds).toEqual(DEFAULT_KINDS);
    expect(defaults.types).toEqual(GRAPH_RELATION_TYPES);
    expect(defaults.view).toBe('map');
    expect(hasDefaultFilters(defaults)).toBe(true);

    const read = readGraphParams(
      new URLSearchParams(
        `kinds=note,tag,planet&types=explains,links_to,DROP&suggestions=1&workspace=${ID}&focus=document:${OTHER}&view=list`,
      ),
    );
    expect(read).toEqual({
      kinds: ['note', 'tag'],
      types: ['links_to', 'explains'],
      suggestions: true,
      workspaceId: ID,
      focus: { kind: 'document', id: OTHER },
      view: 'list',
    });
    expect(hasDefaultFilters(read)).toBe(false);

    // Without an item kind, nothing could be connected: the default kinds come back.
    expect(readGraphParams(new URLSearchParams('kinds=workspace,tag')).kinds).toEqual(
      DEFAULT_KINDS,
    );
    // No type at all is a choice the address keeps.
    expect(readGraphParams(new URLSearchParams('types=none')).types).toEqual([]);
    for (const focus of ['note:../x', 'planet:' + ID, ID, `note:${ID}:x`]) {
      expect(readGraphParams(new URLSearchParams({ focus })).focus).toBeUndefined();
    }
    expect(readGraphParams(new URLSearchParams('workspace=1 OR 1=1')).workspaceId).toBeUndefined();
  });

  it('writes only what differs from the defaults, and builds the query of the core', () => {
    expect(kindsParam(['note', 'document'])).toBeNull();
    expect(kindsParam(['tag', 'note'])).toBe('note,tag');
    expect(typesParam([...GRAPH_RELATION_TYPES])).toBeNull();
    expect(typesParam([])).toBe('none');
    expect(typesParam(['explains', 'links_to'])).toBe('links_to,explains');

    const filters = readGraphParams(new URLSearchParams(`focus=note:${ID}`));
    expect(graphQuery(filters, [{ kind: 'note', id: OTHER }])).toEqual({
      nodeKinds: ['document', 'note'],
      relationTypes: GRAPH_RELATION_TYPES,
      focus: { kind: 'note', id: ID },
      expanded: [{ kind: 'note', id: OTHER }],
      limit: 300,
    });
  });
});

function at(positions: ReadonlyMap<string, Point>, key: string): Point {
  const point = positions.get(key);
  if (!point) {
    throw new Error(`No position for ${key}`);
  }
  return point;
}

describe('graph layout', () => {
  const nodes = Array.from({ length: 40 }, (_, index) => node(index, index === 0 ? 39 : 1));
  const edges = nodes.slice(1).map((_, index) => edge(0, index + 1));

  it('is the same for the same graph, with every node placed apart', () => {
    const first = layoutGraph(nodes, edges, new Map());
    const second = layoutGraph(nodes, edges, new Map());
    expect([...first.entries()]).toEqual([...second.entries()]);
    const points = [...first.values()];
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(
      true,
    );
    let closest = Infinity;
    points.forEach((a, index) => {
      for (const b of points.slice(index + 1)) {
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    });
    expect(closest).toBeGreaterThan(nodeRadius(node(1)));
  });

  it('keeps the nodes already placed for an expansion, and places a new one next to its neighbour', () => {
    const known = layoutGraph(nodes, edges, new Map());
    const added = [...nodes, node(99)];
    const next = layoutGraph(added, [...edges, edge(5, 99)], known, { pinKnown: true });
    for (const [key, point] of known) {
      expect(next.get(key)).toEqual(point);
    }
    // Among the closest nodes to the new one: the one it is connected to.
    const placed = at(next, 'note:99');
    const nearest = [...known.entries()]
      .map(([key, point]) => ({
        key,
        distance: Math.hypot(placed.x - point.x, placed.y - point.y),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((entry) => entry.key);
    expect(nearest).toContain('note:5');
  });

  it('lays out a graph at the ceiling of the core in a reasonable time', () => {
    const many = Array.from({ length: 500 }, (_, index) => node(index, 6));
    const links = many.flatMap((_, index) =>
      [1, 7, 31].map((step) => edge(index, (index + step) % many.length)),
    );
    const started = performance.now();
    const positions = layoutGraph(many, links, new Map());
    const elapsed = performance.now() - started;
    expect(positions.size).toBe(500);
    // Measured around 0.3 s on the test machine; the bound only catches a runaway layout.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('graph viewport', () => {
  it('zooms around the pointer and within limits', () => {
    const view = { x: 10, y: 20, k: 1 };
    const zoomed = zoomAround(view, 2, 110, 120);
    const before = toGraph(view, 110, 120);
    const after = toGraph(zoomed, 110, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAround(view, 100, 0, 0).k).toBe(ZOOM_MAX);
  });

  it('fits every node, reveals a node out of sight, and finds the next node of an arrow key', () => {
    const view = fitView(
      [
        { x: -100, y: -50, r: 10 },
        { x: 300, y: 150, r: 10 },
      ],
      800,
      600,
    );
    for (const point of [
      { x: -110, y: -60 },
      { x: 310, y: 176 },
    ]) {
      const sx = view.x + view.k * point.x;
      const sy = view.y + view.k * point.y;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(800);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(600);
    }
    const moved = revealPoint({ x: 0, y: 0, k: 1 }, { x: 1000, y: 10 }, 800, 600);
    expect(moved.x + 1000).toBeLessThanOrEqual(800);
    expect(revealPoint(view, { x: 0, y: 0 }, 800, 600)).toBe(view);

    const candidates: [string, Point][] = [
      ['right-far', { x: 100, y: 0 }],
      ['right-side', { x: 40, y: 60 }],
      ['left', { x: -50, y: 0 }],
      ['down', { x: 0, y: 30 }],
    ];
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'right')).toBe('right-far');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'left')).toBe('left');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'down')).toBe('down');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'up')).toBeUndefined();
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});
