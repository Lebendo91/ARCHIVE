import { seedDocument, seedNote } from '../../src/test/coreDouble';
import { expect, seedCore, test } from './fixtures';

/**
 * Indicative performance of the knowledge graph in Chromium (specification §11.3 and §19.4): layout time,
 * display of a large graph, and zoom. Not run with the other tests: `npm run test:perf`, and read what it
 * prints. The figures depend on the machine.
 */
test.describe('@perf knowledge graph', () => {
  test.setTimeout(240_000);

  test('lays out graphs of 100, 300 and 500 nodes', async ({ page }) => {
    await page.goto('/');
    const timings = await page.evaluate(async () => {
      const path = '/src/modules/knowledge-graph/layout.ts';
      // The module served by Vite, typed by hand: the end-to-end tests do not resolve the app's aliases.
      const { layoutGraph } = (await import(/* @vite-ignore */ path)) as {
        layoutGraph: (nodes: unknown[], edges: unknown[], known: Map<string, unknown>) => unknown;
      };
      const results: Record<string, number> = {};
      for (const size of [100, 300, 500]) {
        const nodes = Array.from({ length: size }, (_, index) => ({
          key: `note:${String(index)}`,
          kind: 'note' as const,
          id: String(index),
          label: `Note ${String(index)}`,
          degree: 6,
          archived: false,
          format: null,
          color: null,
          icon: null,
        }));
        const edges = nodes.flatMap((_, index) =>
          [1, 7, 31].map((step) => ({
            id: `${String(index)}-${String(step)}`,
            kind: 'link' as const,
            source: `note:${String(index)}`,
            target: `note:${String((index * 3 + step) % size)}`,
            relationType: 'links_to',
            origin: 'user' as const,
            confidence: null,
          })),
        );
        const runs: number[] = [];
        for (let run = 0; run < 5; run += 1) {
          const started = performance.now();
          layoutGraph(nodes, edges, new Map());
          runs.push(performance.now() - started);
        }
        runs.sort((a, b) => a - b);
        results[`${String(size)} nodes, ${String(edges.length)} edges`] = Math.round(
          runs.at(2) ?? 0,
        );
      }
      return results;
    });
    console.log('layout, median of 5 runs (ms):', timings);
  });

  test('shows a graph of 300 nodes, laid out by its worker, and zooms it', async ({ page }) => {
    const documents = Array.from({ length: 300 }, (_, index) =>
      seedDocument(`d${String(index)}.pdf`, { title: `Document ${String(index)}` }),
    );
    const notes = Array.from({ length: 300 }, (_, index) =>
      seedNote(`Note ${String(index)}`, {
        links: [0, 1, 2].flatMap((step) => {
          const target = documents[(index * 7 + step * 13) % documents.length];
          return target ? [{ kind: 'document' as const, id: target.document.id }] : [];
        }),
      }),
    );
    await seedCore(page, { documents, notes });
    const started = Date.now();
    await page.goto('/#/graph');
    const map = page.getByRole('group', { name: /^Carte du graphe/ });
    await expect(map.getByRole('button')).toHaveCount(300, { timeout: 60_000 });
    console.log(
      `graph of 300 nodes on screen ${String(Date.now() - started)} ms after the navigation`,
    );
    expect(page.workers().some((worker) => worker.url().includes('layout.worker'))).toBe(true);
    const frames = await page.evaluate(async () => {
      const svg = document.querySelector('svg[role="group"]');
      if (!svg) {
        throw new Error('No map');
      }
      const box = svg.getBoundingClientRect();
      const steps: number[] = [];
      let last = performance.now();
      for (let index = 0; index < 30; index += 1) {
        svg.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: index % 2 ? 120 : -120,
            clientX: box.x + box.width / 2,
            clientY: box.y + box.height / 2,
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const now = performance.now();
        steps.push(now - last);
        last = now;
      }
      steps.sort((a, b) => a - b);
      return { median: Math.round(steps[15] ?? 0), p95: Math.round(steps[28] ?? 0) };
    });
    console.log(
      `zoom step (two frames): median ${String(frames.median)} ms, p95 ${String(frames.p95)} ms`,
    );
  });
});
