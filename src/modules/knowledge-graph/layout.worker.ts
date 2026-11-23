import type { GraphEdge, GraphNode } from '@/services/graph';
import { layoutGraph, type LayoutOptions, type Point } from './layout';

/** A layout to compute, and its answer: positions as pairs, which cross the worker boundary as they are. */
export interface LayoutRequest {
  id: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  known: [string, Point][];
  options: LayoutOptions;
}

export interface LayoutResponse {
  id: number;
  positions: [string, Point][];
}

/** Computes layouts outside the interface thread: the map never freezes while a graph is laid out. */
self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { id, nodes, edges, known, options } = event.data;
  const positions = layoutGraph(nodes, edges, new Map(known), options);
  const response: LayoutResponse = { id, positions: Array.from(positions) };
  self.postMessage(response);
};
