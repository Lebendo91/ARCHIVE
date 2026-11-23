import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileUp, NotebookPen, Search, SearchX, Shuffle, Waypoints } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { QueryError } from '@/components/feedback/QueryError';
import { FilterChip, useListParams } from '@/components/resources/listControls';
import { ResourcePicker } from '@/components/resources/ResourcePicker';
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import { useStartImport } from '@/modules/library/useStartImport';
import { useCreateNote } from '@/modules/notes/useCreateNote';
import {
  GRAPH_EXPANDED_MAX,
  GRAPH_NODE_KINDS,
  loadGraph,
  type GraphData,
  type GraphItem,
  type GraphNode,
} from '@/services/graph';
import { memoryOverview } from '@/services/memory';
import { queryKeys, useWorkspaces } from '@/services/queries';
import { GraphCanvas } from './GraphCanvas';
import { GraphDetails } from './GraphDetails';
import { GraphFiltersPopover } from './GraphFilters';
import { GraphList } from './GraphList';
import { foldText, nodeRoute, nodeTitle, shownDegrees, type GraphSelection } from './graphModel';
import {
  focusParam,
  graphQuery,
  hasDefaultFilters,
  kindsParam,
  readGraphParams,
  RESET_FILTERS,
  type GraphFilters,
  type GraphView,
} from './graphParams';
import type { Point } from './layout';
import { computeLayout } from './layoutClient';

/** Search results listed under the field; the map highlights every one. */
const MATCHES_LISTED = 8;

function activeFilters(filters: GraphFilters): number {
  const defaults = readGraphParams(new URLSearchParams());
  return [
    filters.kinds.length !== defaults.kinds.length ||
      !defaults.kinds.every((kind) => filters.kinds.includes(kind)),
    filters.types.length !== defaults.types.length,
    filters.suggestions,
    filters.workspaceId !== undefined,
  ].filter(Boolean).length;
}

interface Layout {
  /** The graph the positions belong to: the map shows it until the next one is laid out. */
  source: GraphData | null;
  /** Filters of the graph laid out: an expansion keeps them, a change of filters does not. */
  scope: string;
  /** Every position computed or moved, kept while the user explores. */
  positions: Map<string, Point>;
  /** Increased when the user asks for a new arrangement: the map is framed again. */
  generation: number;
}

/**
 * Lays out each graph received once (spec §4.2), outside the interface thread. Until a graph is laid out, the
 * map keeps showing the previous one. An expansion (same filters) leaves the placed nodes where they are;
 * other filters let them make room.
 */
function useGraphLayout(data: GraphData | undefined, scopeKey: string) {
  const [layout, setLayout] = useState<Layout>({
    source: null,
    scope: scopeKey,
    positions: new Map(),
    generation: 0,
  });
  const requested = useRef<GraphData | null>(null);
  useEffect(() => {
    if (!data || requested.current === data) {
      return;
    }
    requested.current = data;
    const pinKnown = layout.source !== null && layout.scope === scopeKey;
    computeLayout(data.nodes, data.edges, layout.positions, { pinKnown })
      .then((fresh) => {
        // A newer graph was asked for meanwhile: this layout is no longer the one to show.
        if (requested.current !== data) {
          return;
        }
        setLayout((previous) => ({
          source: data,
          scope: scopeKey,
          // Nodes moved by the user while the layout was computed keep where they were put.
          positions: pinKnown
            ? new Map([...fresh, ...previous.positions])
            : new Map([...previous.positions, ...fresh]),
          generation: previous.generation,
        }));
      })
      .catch(() => undefined);
  }, [data, layout.positions, layout.scope, layout.source, scopeKey]);

  const move = (key: string, point: Point) => {
    setLayout((previous) => ({
      ...previous,
      positions: new Map(previous.positions).set(key, point),
    }));
  };
  const rearrange = () => {
    const source = layout.source;
    if (!source) {
      return;
    }
    requested.current = source;
    computeLayout(source.nodes, source.edges, new Map(), { pinKnown: false })
      .then((positions) => {
        if (requested.current === source) {
          setLayout((previous) => ({
            source,
            scope: previous.scope,
            positions,
            generation: previous.generation + 1,
          }));
        }
      })
      .catch(() => undefined);
  };
  return { layout, move, rearrange };
}

/**
 * Knowledge graph (specification §11): the documents and notes and what connects them, drawn in two
 * dimensions with filters, search, selection, details loaded on demand and progressive loading of
 * neighbours. Never an invented graph: without real connections, the page says how they are created.
 */
export function GraphPage() {
  const { t, tCount, tList, locale } = useI18n();
  const navigate = useNavigate();
  const { params, update } = useListParams();
  const filters = readGraphParams(params);
  const workspaces = useWorkspaces();
  const startImport = useStartImport();
  const createNote = useCreateNote();
  const searchId = useId();

  // Expansions and the selection belong to one graph: other filters or another focus start afresh.
  const scopeKey = JSON.stringify([
    filters.kinds,
    filters.types,
    filters.suggestions,
    filters.workspaceId,
    filters.focus,
  ]);
  const focusKey = filters.focus ? `${filters.focus.kind}:${filters.focus.id}` : undefined;
  const [scope, setScope] = useState(scopeKey);
  const [expanded, setExpanded] = useState<GraphItem[]>([]);
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setExpanded([]);
    setSelection(null);
  }

  const query = graphQuery(filters, expanded);
  const graph = useQuery({
    queryKey: queryKeys.graph(query),
    queryFn: () => loadGraph(query),
    placeholderData: keepPreviousData,
  });
  const data = graph.data;
  const { layout, move, rearrange } = useGraphLayout(data, scopeKey);

  const byKey = useMemo(() => new Map((data?.nodes ?? []).map((node) => [node.key, node])), [data]);
  const degrees = useMemo(() => shownDegrees(data?.edges ?? []), [data]);
  const current =
    selection &&
    (selection.type === 'node'
      ? byKey.has(selection.key)
      : (data?.edges.some((edge) => edge.id === selection.id) ?? false))
      ? selection
      : null;

  const [search, setSearch] = useState('');
  const folded = foldText(search.trim());
  const matches = useMemo(
    () =>
      folded === ''
        ? null
        : (data?.nodes ?? []).filter((node) => foldText(nodeTitle(node, t)).includes(folded)),
    [data, folded, t],
  );
  const matchKeys = matches && matches.length > 0 ? new Set(matches.map((node) => node.key)) : null;

  const [starting, setStarting] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const suggestions = useQuery({
    queryKey: queryKeys.memoryOverview,
    queryFn: memoryOverview,
    enabled: data?.nodes.length === 0,
  });

  // An item chosen from the search results: its details take the focus, ready to be read and used.
  const [focusPanel, setFocusPanel] = useState(false);
  const pick = (key: string) => {
    setSelection({ type: 'node', key });
    setFocusPanel(true);
  };
  const headingFocused = useCallback(() => {
    setFocusPanel(false);
  }, []);
  const focusOn = (item: GraphItem) => {
    update({ focus: focusParam(item) });
  };
  const expand = (node: GraphNode) => {
    if (expanded.length < GRAPH_EXPANDED_MAX) {
      setExpanded([...expanded, { kind: node.kind, id: node.id }]);
    }
  };
  const closeDetails = () => {
    const key = current?.type === 'node' ? current.key : undefined;
    setSelection(null);
    if (key) {
      // The focus goes back to the item on the map or in the list.
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement | SVGElement>(`[data-key="${key}"]`)?.focus();
      });
    }
  };
  const view: GraphView = filters.view;
  const focusNode = focusKey ? byKey.get(focusKey) : undefined;
  const workspace = workspaces.data?.find(
    (summary) => summary.workspace.id === filters.workspaceId,
  )?.workspace;
  const active = activeFilters(filters);

  let body;
  if (graph.isError && !data) {
    body = (
      <QueryError
        error={graph.error}
        onRetry={() => {
          void graph.refetch();
        }}
      />
    );
  } else if (!data) {
    body = <Skeleton className="min-h-0 flex-1 rounded-card" />;
  } else if (data.nodes.length === 0) {
    if (data.items === 0 && !filters.focus && !filters.workspaceId) {
      body = (
        <EmptyState
          icon={Waypoints}
          iconTone="relations"
          title={t('graph.empty.baseTitle')}
          description={t('graph.empty.baseDescription')}
          actions={
            <>
              <Button
                variant="primary"
                icon={FileUp}
                onClick={() => {
                  void startImport('pick');
                }}
              >
                {t('dashboard.onboarding.action')}
              </Button>
              <Button
                icon={NotebookPen}
                onClick={() => {
                  void createNote();
                }}
              >
                {t('dashboard.onboarding.secondaryAction')}
              </Button>
            </>
          }
        />
      );
    } else if (hasDefaultFilters(filters) && !filters.focus) {
      const pending = suggestions.data?.suggestions ?? 0;
      body = (
        <EmptyState
          icon={Waypoints}
          iconTone="relations"
          title={t('graph.empty.noneTitle')}
          description={t('graph.empty.noneDescription')}
          actions={
            <>
              <Button
                onClick={() => {
                  update({ kinds: kindsParam(GRAPH_NODE_KINDS) });
                }}
              >
                {t('graph.empty.showOrganisation')}
              </Button>
              {pending > 0 ? (
                <Button
                  onClick={() => {
                    update({ suggestions: '1' });
                  }}
                >
                  {tCount('graph.empty.showSuggestions', pending)}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="rounded-card border border-line-subtle bg-graphite p-5 text-left">
            <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {t('graph.empty.waysTitle')}
            </h3>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-fg">
              {tList('graph.empty.ways').map((way) => (
                <li key={way}>{way}</li>
              ))}
            </ul>
          </div>
        </EmptyState>
      );
    } else {
      body = (
        <EmptyState
          icon={SearchX}
          title={t('graph.empty.filteredTitle')}
          description={t('graph.empty.filteredDescription')}
          actions={
            <Button
              onClick={() => {
                update(RESET_FILTERS);
              }}
            >
              {t('graph.filters.reset')}
            </Button>
          }
        />
      );
    }
  } else {
    body = (
      <div className="flex min-h-0 flex-1 gap-4">
        {view === 'map' ? (
          layout.source ? (
            <GraphCanvas
              nodes={layout.source.nodes}
              edges={layout.source.edges}
              positions={layout.positions}
              frameKey={`${layout.scope}|${String(layout.generation)}`}
              selection={current}
              matches={matchKeys}
              onSelect={setSelection}
              onOpen={(node) => {
                void navigate(nodeRoute(node));
              }}
              onMove={move}
            />
          ) : (
            <Skeleton className="min-h-0 flex-1 rounded-card" />
          )
        ) : (
          <GraphList
            nodes={data.nodes}
            degrees={degrees}
            selection={current}
            matches={matchKeys}
            onSelect={setSelection}
          />
        )}
        {current ? (
          <GraphDetails
            data={data}
            byKey={byKey}
            degrees={degrees}
            selection={current}
            focusHeading={focusPanel}
            onHeadingFocused={headingFocused}
            focusKey={focusKey}
            expandedKeys={new Set(expanded.map((item) => `${item.kind}:${item.id}`))}
            onSelect={setSelection}
            onClose={closeDetails}
            onExpand={expand}
            onFocus={(node) => {
              focusOn({ kind: node.kind, id: node.id });
            }}
          />
        ) : null}
      </div>
    );
  }

  // An empty knowledge base has nothing to search, filter or start from: only its empty state is shown.
  const emptyBase =
    data?.items === 0 && data.nodes.length === 0 && !filters.focus && !filters.workspaceId;
  const notices: string[] = [];
  if (data && data.nodes.length > 0) {
    if (data.truncated) {
      notices.push(
        filters.focus
          ? t('graph.truncatedFocus', {
              shown: formatNumber(data.nodes.length, locale),
              total: formatNumber(data.total, locale),
            })
          : t('graph.truncated', {
              shown: formatNumber(data.nodes.length, locale),
              total: formatNumber(data.total, locale),
            }),
      );
    }
    if (data.edgesTruncated) {
      notices.push(t('graph.edgesTruncated'));
    }
    if (filters.focus && data.edges.length === 0) {
      notices.push(t('graph.alone'));
    }
  }

  return (
    <div className="flex h-full min-h-[36rem] flex-col gap-4">
      {emptyBase ? null : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              label={t('graph.search.label')}
              hideLabel
              icon={Search}
              type="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              placeholder={t('graph.search.placeholder')}
              value={search}
              aria-describedby={search.trim() === '' ? undefined : searchId}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              onKeyDown={(event) => {
                const first = matches?.[0];
                if (event.key === 'Enter' && first) {
                  event.preventDefault();
                  pick(first.key);
                }
              }}
              className="min-w-64 flex-1 xl:max-w-md"
            />
            <GraphFiltersPopover filters={filters} active={active} onChange={update} />
            <Button
              ref={startRef}
              onClick={() => {
                setPickerQuery('');
                setStarting(true);
              }}
            >
              {t('graph.start.action')}
            </Button>
            {graph.isFetching && data ? <Spinner size={16} /> : null}
            <div className="ml-auto flex items-center gap-3">
              {data && data.nodes.length > 0 ? (
                <p role="status" className="text-sm text-fg-secondary">
                  {tCount('graph.nodes', data.nodes.length)} ·{' '}
                  {tCount('graph.edges', data.edges.length)}
                </p>
              ) : null}
              {view === 'map' && data && data.nodes.length > 0 ? (
                <IconButton
                  icon={Shuffle}
                  label={t('graph.map.relayout')}
                  variant="secondary"
                  onClick={rearrange}
                />
              ) : null}
              <SegmentedControl
                label={t('graph.views.label')}
                value={view}
                options={[
                  { value: 'map', label: t('graph.views.map') },
                  { value: 'list', label: t('graph.views.list') },
                ]}
                onChange={(value) => {
                  update({ view: value === 'map' ? null : value });
                }}
              />
            </div>
          </div>
          {focusNode || (workspace && filters.workspaceId) ? (
            <div
              role="group"
              aria-label={t('library.filters.active')}
              className="flex flex-wrap items-center gap-2"
            >
              {focusNode ? (
                <FilterChip
                  label={t('graph.focus', { title: nodeTitle(focusNode, t) })}
                  onRemove={() => {
                    update({ focus: null });
                  }}
                />
              ) : null}
              {workspace ? (
                <FilterChip
                  label={t('library.filters.chip', {
                    name: t('graph.filters.workspace'),
                    value: workspace.name,
                  })}
                  onRemove={() => {
                    update({ workspace: null });
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {matches ? (
            <div id={searchId} className="flex flex-wrap items-center gap-2 text-sm">
              {matches.length > 0 ? (
                <>
                  <span className="text-fg-secondary">
                    {tCount('graph.search.results', matches.length)}
                  </span>
                  <ul aria-label={t('graph.search.resultsLabel')} className="flex flex-wrap gap-2">
                    {matches.slice(0, MATCHES_LISTED).map((node) => (
                      <li key={node.key}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            pick(node.key);
                          }}
                        >
                          {nodeTitle(node, t)}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {matches.length > MATCHES_LISTED ? (
                    <span className="text-fg-secondary">
                      {tCount('graph.search.more', matches.length - MATCHES_LISTED)}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="text-fg-secondary">{t('graph.search.none')}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPickerQuery(search.trim());
                      setStarting(true);
                    }}
                  >
                    {t('graph.search.everywhere')}
                  </Button>
                </>
              )}
            </div>
          ) : null}
          {notices.length > 0 ? (
            <p className="text-xs text-fg-secondary">{notices.join(' ')}</p>
          ) : null}
        </>
      )}
      {body}
      <Dialog
        open={starting}
        onOpenChange={(open) => {
          if (!open) {
            setStarting(false);
          }
        }}
      >
        <DialogContent
          title={t('graph.start.title')}
          size="md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            pickerRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            startRef.current?.focus();
          }}
        >
          <ResourcePicker
            key={pickerQuery}
            inputRef={pickerRef}
            initialQuery={pickerQuery}
            hint={t('graph.start.hint')}
            onPick={(item) => {
              setStarting(false);
              setSearch('');
              focusOn({ kind: item.kind, id: item.id });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
