import { reportDiagnostic } from '@/services/diagnostics';
import type { GraphEdge, GraphNode } from '@/services/graph';
import { layoutGraph, type LayoutOptions, type Point } from './layout';
import type { LayoutRequest, LayoutResponse } from './layout.worker';

interface Pending {
  resolve: (positions: Map<string, Point>) => void;
  /** The same computation on the interface thread, if the worker cannot run. */
  fallback: () => Map<string, Point>;
}

let worker: Worker | null | undefined;
let sequence = 0;
const pending = new Map<number, Pending>();

/** Without a worker (an unusual environment, or the unit tests), layouts are computed in place. */
function giveUp(): void {
  // Still correct, but the interface may pause while a large graph is laid out: worth knowing.
  reportDiagnostic(
    'warn',
    'graph layout worker unavailable: layouts are computed in the interface thread',
  );
  worker?.terminate();
  worker = null;
  for (const [id, request] of pending) {
    pending.delete(id);
    request.resolve(request.fallback());
  }
}

function layoutWorker(): Worker | null {
  if (worker !== undefined) {
    return worker;
  }
  if (typeof Worker === 'undefined') {
    worker = null;
    return null;
  }
  try {
    worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
      const request = pending.get(event.data.id);
      pending.delete(event.data.id);
      request?.resolve(new Map(event.data.positions));
    };
    worker.onerror = giveUp;
    worker.onmessageerror = giveUp;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Positions of a graph, computed by a worker so that the interface stays responsive (spec §4.2 and §11.3),
 * or in place when no worker can run. The answer is the same either way: the layout is deterministic.
 */
export function computeLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  known: ReadonlyMap<string, Point>,
  options: LayoutOptions,
): Promise<Map<string, Point>> {
  const fallback = () => layoutGraph(nodes, edges, known, options);
  const target = layoutWorker();
  if (!target) {
    return Promise.resolve().then(fallback);
  }
  sequence += 1;
  const id = sequence;
  return new Promise((resolve) => {
    pending.set(id, { resolve, fallback });
    const request: LayoutRequest = {
      id,
      nodes: [...nodes],
      edges: [...edges],
      known: Array.from(known),
      options,
    };
    target.postMessage(request);
  });
}
