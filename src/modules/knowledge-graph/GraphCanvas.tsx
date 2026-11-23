import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { WORKSPACE_ICONS } from '@/modules/workspaces/appearance';
import type { GraphEdge, GraphNode } from '@/services/graph';
import { cn } from '@/utils/cn';
import { GraphLegend } from './GraphLegend';
import {
  isDirected,
  nodeTitle,
  nodeTone,
  workspaceIconName,
  type GraphSelection,
} from './graphModel';
import { LABEL_CHARS, nodeRadius, type Point } from './layout';
import { KIND_ICONS } from './NodeIcon';
import {
  distanceToSegment,
  fitView,
  nearestInDirection,
  revealPoint,
  toGraph,
  zoomAround,
  ZOOM_STEP,
  type Direction,
  type Viewport,
} from './viewport';

/** Below this zoom, only the labels that matter are written: the others would overlap. */
const LABELS_ZOOM = 1.2;
/** A small graph keeps every label. */
const LABELS_ALWAYS = 40;
/** A pointer that moves less than this (in pixels) clicked: it did not drag. */
const DRAG_THRESHOLD = 4;
/** Distance (in pixels) within which a click selects a line. */
const EDGE_HIT = 6;

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const EDGE_STYLES: Record<
  GraphEdge['kind'],
  { tone: string; width: number; dash?: string; marker?: 'relation' | 'suggestion' }
> = {
  link: { tone: 'text-purple', width: 1.25, marker: 'relation' },
  relation: { tone: 'text-purple', width: 2, marker: 'relation' },
  suggestion: { tone: 'text-cyan', width: 1.5, dash: '5 4', marker: 'suggestion' },
  tag: { tone: 'text-fg-muted', width: 1, dash: '2 3' },
  workspace: { tone: 'text-fg-muted', width: 1.25 },
};

function shorten(label: string): string {
  return label.length > LABEL_CHARS ? `${label.slice(0, LABEL_CHARS - 1).trimEnd()}…` : label;
}

const round = (value: number) => Math.round(value * 10) / 10;

interface EdgeShape {
  d: string;
  /** Points of the line, for the hit test of a click. */
  path: Point[];
}

/**
 * Line between two nodes, stopping at their borders; `bend` curves it, so that two connections between the
 * same items do not overlap.
 */
function edgeShape(a: Point, b: Point, ra: number, rb: number, bend: number): EdgeShape | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < ra + rb + 2) {
    return null;
  }
  if (bend === 0) {
    const ux = dx / length;
    const uy = dy / length;
    const start = { x: a.x + ux * ra, y: a.y + uy * ra };
    const end = { x: b.x - ux * (rb + 3), y: b.y - uy * (rb + 3) };
    return {
      d: `M${round(start.x)},${round(start.y)}L${round(end.x)},${round(end.y)}`,
      path: [start, end],
    };
  }
  const control = {
    x: (a.x + b.x) / 2 - (dy / length) * bend,
    y: (a.y + b.y) / 2 + (dx / length) * bend,
  };
  const towards = (from: Point, to: Point, distance: number) => {
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const size = Math.hypot(vx, vy) || 1;
    return { x: from.x + (vx / size) * distance, y: from.y + (vy / size) * distance };
  };
  const start = towards(a, control, ra);
  const end = towards(b, control, rb + 3);
  return {
    d: `M${round(start.x)},${round(start.y)}Q${round(control.x)},${round(control.y)} ${round(end.x)},${round(end.y)}`,
    path: [start, control, end],
  };
}

interface NodeViewProps {
  node: GraphNode;
  point: Point;
  selected: boolean;
  matched: boolean;
  dimmed: boolean;
  focused: boolean;
  tabbable: boolean;
  accessibleName: string;
}

/** One node: its shape (by kind, so that colour is never the only cue), icon, label and states. */
const NodeView = memo(function NodeView({
  node,
  point,
  selected,
  matched,
  dimmed,
  focused,
  tabbable,
  accessibleName,
}: NodeViewProps) {
  const r = nodeRadius(node);
  const Icon =
    node.kind === 'workspace'
      ? WORKSPACE_ICONS[workspaceIconName(node.icon)]
      : KIND_ICONS[node.kind];
  const iconSize = node.kind === 'tag' ? r * 0.9 : r * 1.05;
  const dash = node.archived ? '3 2' : undefined;
  let shape;
  if (node.kind === 'document' || node.kind === 'workspace') {
    const half = node.kind === 'workspace' ? r : r * 0.9;
    shape = (
      <rect
        x={-half}
        y={-half}
        width={half * 2}
        height={half * 2}
        rx={node.kind === 'workspace' ? 6 : 3}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dash}
        className="fill-graphite"
      />
    );
  } else if (node.kind === 'tag') {
    shape = (
      <path
        d={`M0,${-r}L${r},0L0,${r}L${-r},0Z`}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dash}
        className="fill-graphite"
      />
    );
  } else {
    shape = (
      <circle
        r={r}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray={dash}
        className="fill-graphite"
      />
    );
  }
  return (
    <g
      data-key={node.key}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={accessibleName}
      aria-pressed={selected}
      transform={`translate(${round(point.x)},${round(point.y)})`}
      className={cn(
        'outline-none transition-opacity duration-150 ease-standard',
        dimmed && 'opacity-25',
        node.archived && !dimmed && 'opacity-70',
      )}
    >
      {selected || focused ? (
        <circle r={r + 6} fill="none" stroke="currentColor" strokeWidth={2} className="text-blue" />
      ) : matched ? (
        <circle
          r={r + 5}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          className="text-blue"
        />
      ) : null}
      <g className={nodeTone(node)}>
        {shape}
        <Icon
          x={-iconSize / 2}
          y={-iconSize / 2}
          width={iconSize}
          height={iconSize}
          strokeWidth={2}
          aria-hidden="true"
        />
      </g>
    </g>
  );
});

interface LabelViewProps {
  node: GraphNode;
  point: Point;
  label: string;
  strong: boolean;
  dimmed: boolean;
}

/**
 * Title of a node, written under it in a layer above every node so that no node hides it. It stays out of
 * the node's button, whose accessible name holds the full title: a shortened label would no longer be part of
 * that name (WCAG 2.5.3). A click on it still reaches its node.
 */
const LabelView = memo(function LabelView({ node, point, label, strong, dimmed }: LabelViewProps) {
  return (
    <text
      data-label-key={node.key}
      x={round(point.x)}
      y={round(point.y + nodeRadius(node) + 14)}
      textAnchor="middle"
      paintOrder="stroke"
      strokeWidth={3}
      strokeLinejoin="round"
      className={cn(
        'stroke-obsidian text-[11px] transition-opacity duration-150 ease-standard',
        strong ? 'fill-fg font-medium' : 'fill-fg-secondary',
        dimmed && 'opacity-25',
      )}
    >
      {shorten(label)}
    </text>
  );
});

interface EdgeViewProps {
  edge: GraphEdge;
  shape: EdgeShape;
  selected: boolean;
  dimmed: boolean;
  markerPrefix: string;
}

const EdgeView = memo(function EdgeView({
  edge,
  shape,
  selected,
  dimmed,
  markerPrefix,
}: EdgeViewProps) {
  const style = EDGE_STYLES[edge.kind];
  const marker =
    style.marker && isDirected(edge)
      ? `url(#${markerPrefix}-${selected ? 'selected' : style.marker})`
      : undefined;
  return (
    <path
      data-edge={edge.id}
      d={shape.d}
      fill="none"
      stroke="currentColor"
      strokeWidth={selected ? style.width + 1 : style.width}
      strokeDasharray={style.dash}
      markerEnd={marker}
      className={cn(
        'transition-opacity duration-150 ease-standard',
        selected ? 'text-blue' : style.tone,
        dimmed && 'opacity-15',
      )}
    />
  );
});

export interface GraphCanvasProps {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  positions: ReadonlyMap<string, Point>;
  /** The map is framed again when this changes (another focus, other filters), not on an expansion. */
  frameKey: string;
  selection: GraphSelection | null;
  /** Nodes found by the search in the graph, or `null` without a search. */
  matches: ReadonlySet<string> | null;
  onSelect: (selection: GraphSelection | null) => void;
  onOpen: (node: GraphNode) => void;
  onMove: (key: string, point: Point) => void;
}

interface Drag {
  pointerId: number;
  key: string | null;
  startX: number;
  startY: number;
  origin: Viewport;
  moved: boolean;
}

/**
 * Map of the graph, drawn in SVG without WebGL (spec §11): zoom (wheel, buttons, keyboard), pan, selection
 * of a node or of a line, nodes moved by dragging, and a keyboard path from node to node. The layout is
 * computed by the page; this component only draws it.
 */
export function GraphCanvas({
  nodes,
  edges,
  positions,
  frameKey,
  selection,
  matches,
  onSelect,
  onOpen,
  onMove,
}: GraphCanvasProps) {
  const { t, tCount } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const markerPrefix = `graph-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const helpId = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [framed, setFramed] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const byKey = useMemo(() => new Map(nodes.map((node) => [node.key, node])), [nodes]);
  const point = (key: string): Point => positions.get(key) ?? { x: 0, y: 0 };

  // Framed once the size is known, then on each new focus or filter.
  const frame = () =>
    fitView(
      nodes.map((node) => ({ ...point(node.key), r: nodeRadius(node) })),
      size.width,
      size.height,
    );
  if (size.width > 0 && framed !== frameKey) {
    setFramed(frameKey);
    setView(frame());
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    // The details panel narrows the map from the right: nothing moves under the pointer, so a double
    // click that opens the panel on its first click still reaches the same item.
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // The wheel zooms around the pointer. Registered by hand: React's wheel listeners cannot prevent the
  // page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0015));
      setView((current) =>
        zoomAround(current, factor, event.clientX - rect.left, event.clientY - rect.top),
      );
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
    };
  }, []);

  // The selected node stays in sight: chosen in the list, the search or the details panel.
  const selectedNode = selection?.type === 'node' ? selection.key : null;
  // Also once the details panel has narrowed the map.
  const revealKey = selectedNode ? `${selectedNode}|${String(size.width)}` : null;
  const [revealed, setRevealed] = useState<string | null>(null);
  if (revealKey !== revealed) {
    setRevealed(revealKey);
    const target = selectedNode ? positions.get(selectedNode) : undefined;
    if (target && size.width > 0) {
      setView(revealPoint(view, target, size.width, size.height));
    }
  }

  // Neighbours of the selection: they stay bright, the rest fades.
  const neighbourhood = useMemo(() => {
    if (!selection) {
      return null;
    }
    const keys = new Set<string>();
    const lines = new Set<string>();
    for (const edge of edges) {
      const touches =
        selection.type === 'node'
          ? edge.source === selection.key || edge.target === selection.key
          : edge.id === selection.id;
      if (touches) {
        keys.add(edge.source);
        keys.add(edge.target);
        lines.add(edge.id);
      }
    }
    if (selection.type === 'node') {
      keys.add(selection.key);
    }
    return { keys, lines };
  }, [edges, selection]);

  // Parallel connections between the same two items are curved apart.
  const shapes = useMemo(() => {
    const groups = new Map<string, GraphEdge[]>();
    for (const edge of edges) {
      const pair = [edge.source, edge.target].sort().join('|');
      groups.set(pair, [...(groups.get(pair) ?? []), edge]);
    }
    const result = new Map<string, EdgeShape>();
    for (const group of groups.values()) {
      group.forEach((edge, index) => {
        const source = byKey.get(edge.source);
        const target = byKey.get(edge.target);
        const a = positions.get(edge.source);
        const b = positions.get(edge.target);
        if (!source || !target || !a || !b) {
          return;
        }
        // The bend follows the pair's order, so that two opposite connections curve apart too.
        const sign = edge.source < edge.target ? 1 : -1;
        const bend = (index - (group.length - 1) / 2) * 18 * sign;
        const shape = edgeShape(a, b, nodeRadius(source), nodeRadius(target), bend);
        if (shape) {
          result.set(edge.id, shape);
        }
      });
    }
    return result;
  }, [edges, byKey, positions]);

  /** Outside the selection's neighbourhood and the search results, while either exists: faded. */
  const isDimmed = (key: string) =>
    (neighbourhood !== null || matches !== null) &&
    !(neighbourhood?.keys.has(key) ?? false) &&
    !(matches?.has(key) ?? false);
  const tabKey =
    activeKey !== null && byKey.has(activeKey)
      ? activeKey
      : selectedNode !== null && byKey.has(selectedNode)
        ? selectedNode
        : (nodes[0]?.key ?? null);
  const allLabels = nodes.length <= LABELS_ALWAYS || view.k >= LABELS_ZOOM;

  const nodeElement = (key: string) =>
    svgRef.current?.querySelector<SVGGElement>(`g[data-key="${key}"]`) ?? null;
  const moveFocus = (key: string) => {
    setActiveKey(key);
    nodeElement(key)?.focus();
    setView((current) => revealPoint(current, point(key), size.width, size.height));
  };
  const zoomBy = (factor: number) => {
    setView((current) => zoomAround(current, factor, size.width / 2, size.height / 2));
  };

  const keyOf = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) {
      return null;
    }
    const element = target.closest('[data-key], [data-label-key]');
    return element?.getAttribute('data-key') ?? element?.getAttribute('data-label-key') ?? null;
  };
  const local = (event: PointerEvent | MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }
    drag.current = {
      pointerId: event.pointerId,
      key: keyOf(event.target),
      startX: event.clientX,
      startY: event.clientY,
      origin: view,
      moved: false,
    };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!current.moved) {
      // Captured only once it drags: a plain click (and a double click) keeps its target.
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    if (current.key) {
      const at = local(event);
      onMove(current.key, toGraph(view, at.x, at.y));
    } else {
      setView({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
    }
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    setDragging(false);
    if (current.moved) {
      return;
    }
    if (current.key) {
      setActiveKey(current.key);
      onSelect({ type: 'node', key: current.key });
      return;
    }
    // A click near a line selects it; elsewhere, it clears the selection.
    const at = local(event);
    const position = toGraph(view, at.x, at.y);
    let closest: string | null = null;
    let distance = EDGE_HIT / view.k;
    for (const [id, shape] of shapes) {
      let previous: Point | undefined;
      for (const end of shape.path) {
        const candidate = previous ? distanceToSegment(position, previous, end) : Infinity;
        if (candidate < distance) {
          distance = candidate;
          closest = id;
        }
        previous = end;
      }
    }
    onSelect(closest ? { type: 'edge', id: closest } : null);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const key = keyOf(event.target);
    const direction = ARROWS[event.key];
    if (direction && key) {
      event.preventDefault();
      const from = point(key);
      const next = nearestInDirection(
        from,
        nodes.filter((node) => node.key !== key).map((node) => [node.key, point(node.key)]),
        direction,
      );
      if (next) {
        moveFocus(next);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && key) {
      event.preventDefault();
      onSelect({ type: 'node', key });
    } else if (event.key === 'Escape' && selection) {
      event.preventDefault();
      onSelect(null);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-' || event.key === '−') {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      setView(frame());
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-line-subtle bg-obsidian"
    >
      <svg
        ref={svgRef}
        role="group"
        aria-label={`${t('graph.map.label')} (${tCount('graph.nodes', nodes.length)}, ${tCount('graph.edges', edges.length)})`}
        aria-describedby={helpId}
        width={size.width}
        height={size.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerOver={(event) => {
          setHoverKey(keyOf(event.target));
        }}
        onPointerLeave={() => {
          setHoverKey(null);
        }}
        onDoubleClick={(event) => {
          const key = keyOf(event.target);
          const node = key ? byKey.get(key) : undefined;
          if (node) {
            onOpen(node);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const key = keyOf(event.target);
          if (key) {
            setActiveKey(key);
            setFocusedKey(event.target.matches(':focus-visible') ? key : null);
          }
        }}
        onBlur={() => {
          setFocusedKey(null);
        }}
        className={cn('block touch-none select-none', dragging && 'cursor-grabbing')}
      >
        <defs>
          {(
            [
              ['relation', 'text-purple'],
              ['suggestion', 'text-cyan'],
              ['selected', 'text-blue'],
            ] as const
          ).map(([name, tone]) => (
            <marker
              key={name}
              id={`${markerPrefix}-${name}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
              className={tone}
            >
              <path d="M0,0L10,5L0,10Z" fill="currentColor" />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${round(view.x)},${round(view.y)}) scale(${view.k})`}>
          <g aria-hidden="true">
            {edges.map((edge) => {
              const shape = shapes.get(edge.id);
              return shape ? (
                <EdgeView
                  key={edge.id}
                  edge={edge}
                  shape={shape}
                  selected={selection?.type === 'edge' && selection.id === edge.id}
                  dimmed={
                    (neighbourhood !== null || matches !== null) &&
                    !(neighbourhood?.lines.has(edge.id) ?? false) &&
                    !(matches?.has(edge.source) ?? false) &&
                    !(matches?.has(edge.target) ?? false)
                  }
                  markerPrefix={markerPrefix}
                />
              ) : null;
            })}
          </g>
          <g>
            {nodes.map((node) => {
              const label = nodeTitle(node, t);
              return (
                <NodeView
                  key={node.key}
                  node={node}
                  point={point(node.key)}
                  selected={selectedNode === node.key}
                  matched={matches?.has(node.key) ?? false}
                  dimmed={isDimmed(node.key)}
                  focused={focusedKey === node.key}
                  tabbable={tabKey === node.key}
                  accessibleName={t(node.archived ? 'graph.nodeArchived' : 'graph.node', {
                    kind: t(`graph.kinds.${node.kind}`),
                    title: label,
                    connections: tCount('graph.connections', node.degree),
                  })}
                />
              );
            })}
          </g>
          <g aria-hidden="true">
            {nodes.map((node) => {
              const emphasized =
                node.key === hoverKey ||
                node.key === focusedKey ||
                node.kind === 'workspace' ||
                node.kind === 'tag' ||
                (neighbourhood?.keys.has(node.key) ?? false) ||
                (matches?.has(node.key) ?? false);
              return allLabels || emphasized ? (
                <LabelView
                  key={node.key}
                  node={node}
                  point={point(node.key)}
                  label={nodeTitle(node, t)}
                  strong={selectedNode === node.key || focusedKey === node.key}
                  dimmed={isDimmed(node.key)}
                />
              ) : null;
            })}
          </g>
        </g>
      </svg>
      <p id={helpId} className="sr-only">
        {t('graph.map.help')}
      </p>
      <div className="absolute bottom-3 left-3 flex gap-1 rounded-control border border-line-subtle bg-carbon p-1">
        <IconButton
          icon={ZoomIn}
          size="sm"
          label={t('graph.map.zoomIn')}
          onClick={() => {
            zoomBy(ZOOM_STEP);
          }}
        />
        <IconButton
          icon={ZoomOut}
          size="sm"
          label={t('graph.map.zoomOut')}
          onClick={() => {
            zoomBy(1 / ZOOM_STEP);
          }}
        />
        <IconButton
          icon={Maximize}
          size="sm"
          label={t('graph.map.fit')}
          onClick={() => {
            setView(frame());
          }}
        />
      </div>
      <div className="absolute right-3 bottom-3">
        <GraphLegend />
      </div>
    </div>
  );
}
