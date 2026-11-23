import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Waypoints, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Badge, Button, ButtonLink, IconButton, Skeleton } from '@/components/ui';
import { formatFileSize, formatList, formatShortDate, useI18n } from '@/i18n';
import { Why } from '@/modules/memory/RelationsCard';
import { GRAPH_NODES_MAX, type GraphData, type GraphEdge, type GraphNode } from '@/services/graph';
import { decideRelation, isRelationType, listRelations } from '@/services/memory';
import { queryKeys, useDocument, useNote, useWorkspace, useWorkspaces } from '@/services/queries';
import { toast } from '@/stores/toasts';
import { connectionLabel, nodeRoute, nodeTitle, type GraphSelection } from './graphModel';
import { NodeIcon } from './NodeIcon';

/** Connections listed in the panel; the others are counted. */
const CONNECTIONS_SHOWN = 40;

function Facts({ facts }: { facts: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-xs text-fg-secondary">
      {facts
        .filter((fact) => fact !== '')
        .map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
    </ul>
  );
}

function FactsState({ pending, failed }: { pending: boolean; failed: boolean }) {
  const { t } = useI18n();
  if (pending) {
    return <Skeleton className="h-10 rounded-control" />;
  }
  return failed ? (
    <p className="text-xs text-fg-secondary">{t('graph.details.unavailable')}</p>
  ) : null;
}

function useWorkspaceName(id: string | null): string {
  const { t } = useI18n();
  const workspaces = useWorkspaces();
  const name = workspaces.data?.find((summary) => summary.workspace.id === id)?.workspace.name;
  return name ? t('graph.details.inWorkspace', { name }) : t('graph.details.noWorkspace');
}

function DocumentFacts({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const detail = useDocument(id);
  const place = useWorkspaceName(detail.data?.document.workspaceId ?? null);
  if (!detail.data) {
    return <FactsState pending={detail.isPending} failed={detail.isError} />;
  }
  const { document, tags } = detail.data;
  return (
    <Facts
      facts={[
        `${document.fileExtension.toUpperCase()} · ${formatFileSize(document.fileSize, locale)}`,
        t('graph.details.imported', {
          date: formatShortDate(new Date(document.importedAt), locale),
        }),
        place,
        tags.length > 0
          ? t('graph.details.tags', {
              tags: formatList(
                tags.map((tag) => tag.name),
                locale,
              ),
            })
          : '',
      ]}
    />
  );
}

function NoteFacts({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const detail = useNote(id);
  const place = useWorkspaceName(detail.data?.note.workspaceId ?? null);
  if (!detail.data) {
    return <FactsState pending={detail.isPending} failed={detail.isError} />;
  }
  const { note, tags } = detail.data;
  return (
    <Facts
      facts={[
        t('graph.details.updated', { date: formatShortDate(new Date(note.updatedAt), locale) }),
        place,
        tags.length > 0
          ? t('graph.details.tags', {
              tags: formatList(
                tags.map((tag) => tag.name),
                locale,
              ),
            })
          : '',
      ]}
    />
  );
}

function WorkspaceFacts({ id }: { id: string }) {
  const { tCount, locale } = useI18n();
  const detail = useWorkspace(id);
  if (!detail.data) {
    return <FactsState pending={detail.isPending} failed={detail.isError} />;
  }
  const { counts } = detail.data;
  return (
    <Facts
      facts={[
        formatList(
          [
            tCount('graph.details.documents', counts.documents),
            tCount('graph.details.notes', counts.notes),
          ],
          locale,
        ),
      ]}
    />
  );
}

/** What is known of the item, loaded only once it is selected (spec §11.3: lazy loading of details). */
function NodeFacts({ node, shown }: { node: GraphNode; shown: number }) {
  const { tCount } = useI18n();
  switch (node.kind) {
    case 'document':
      return <DocumentFacts id={node.id} />;
    case 'note':
      return <NoteFacts id={node.id} />;
    case 'workspace':
      return <WorkspaceFacts id={node.id} />;
    case 'tag':
      return <Facts facts={[tCount('graph.details.tagged', shown)]} />;
  }
}

interface PanelProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

function Panel({ headingRef, icon, title, subtitle, onClose, children }: PanelProps) {
  const { t } = useI18n();
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-card border border-line-subtle bg-graphite p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel"
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-base font-semibold break-words text-fg outline-none"
          >
            {title}
          </h2>
          <div className="text-xs text-fg-secondary">{subtitle}</div>
        </div>
        <IconButton icon={X} size="sm" label={t('graph.details.close')} onClick={onClose} />
      </div>
      {children}
    </section>
  );
}

export interface GraphDetailsProps {
  data: GraphData;
  byKey: ReadonlyMap<string, GraphNode>;
  degrees: ReadonlyMap<string, number>;
  selection: GraphSelection;
  focusKey: string | undefined;
  expandedKeys: ReadonlySet<string>;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
  onExpand: (node: GraphNode) => void;
  onFocus: (node: GraphNode) => void;
}

/**
 * Details of the selection: an item with its connections, or a line with what it means and, for a
 * suggestion, the decision. Loaded on demand.
 */
export function GraphDetails({
  data,
  byKey,
  degrees,
  selection,
  focusKey,
  expandedKeys,
  onSelect,
  onClose,
  onExpand,
  onFocus,
}: GraphDetailsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A choice made in the panel replaces its content: the focus goes to the new heading.
  const focusHeading = useRef(false);
  const select = (next: GraphSelection) => {
    focusHeading.current = true;
    onSelect(next);
  };
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [selection]);

  if (selection.type === 'node') {
    const node = byKey.get(selection.key);
    return node ? (
      <NodeDetails
        headingRef={headingRef}
        node={node}
        data={data}
        byKey={byKey}
        shown={degrees.get(node.key) ?? 0}
        isFocus={focusKey === node.key}
        expanded={expandedKeys.has(node.key)}
        onSelect={select}
        onClose={onClose}
        onExpand={onExpand}
        onFocus={onFocus}
      />
    ) : null;
  }
  const edge = data.edges.find((candidate) => candidate.id === selection.id);
  return edge ? (
    <EdgeDetails
      headingRef={headingRef}
      edge={edge}
      byKey={byKey}
      onSelect={select}
      onClose={onClose}
    />
  ) : null;
}

interface NodeDetailsProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  node: GraphNode;
  data: GraphData;
  byKey: ReadonlyMap<string, GraphNode>;
  shown: number;
  isFocus: boolean;
  expanded: boolean;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
  onExpand: (node: GraphNode) => void;
  onFocus: (node: GraphNode) => void;
}

function NodeDetails({
  headingRef,
  node,
  data,
  byKey,
  shown,
  isFocus,
  expanded,
  onSelect,
  onClose,
  onExpand,
  onFocus,
}: NodeDetailsProps) {
  const { t, tCount } = useI18n();
  const title = nodeTitle(node, t);
  const hidden = Math.max(0, node.degree - shown);
  const full = data.nodes.length >= GRAPH_NODES_MAX;
  const connections = data.edges.filter(
    (edge) => edge.source === node.key || edge.target === node.key,
  );
  return (
    <Panel
      headingRef={headingRef}
      icon={<NodeIcon node={node} />}
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {t(`graph.kinds.${node.kind}`)}
          {node.archived ? <Badge>{t('graph.archived')}</Badge> : null}
        </span>
      }
      onClose={onClose}
    >
      <NodeFacts node={node} shown={shown} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={nodeRoute(node)} variant="primary" size="sm">
          {t(`graph.details.open.${node.kind}`)}
        </ButtonLink>
        {isFocus ? null : (
          <Button
            size="sm"
            onClick={() => {
              onFocus(node);
            }}
          >
            {t('graph.details.center')}
          </Button>
        )}
      </div>
      {hidden > 0 ? (
        <div className="flex flex-col gap-2 rounded-control border border-line-subtle bg-obsidian p-3">
          <p className="text-xs text-fg-secondary">{tCount('graph.details.hidden', hidden)}</p>
          {full ? (
            <p className="text-xs text-fg-secondary">
              {t('graph.details.full', { max: GRAPH_NODES_MAX })}
            </p>
          ) : expanded ? null : (
            <Button
              size="sm"
              className="self-start"
              onClick={() => {
                onExpand(node);
              }}
            >
              {t('graph.details.expand')}
            </Button>
          )}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('graph.details.connections')}
        </h3>
        {connections.length === 0 ? (
          <p className="text-xs text-fg-secondary">{t('graph.details.noConnections')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.slice(0, CONNECTIONS_SHOWN).map((edge) => {
              const otherKey = edge.source === node.key ? edge.target : edge.source;
              const other = byKey.get(otherKey);
              if (!other) {
                return null;
              }
              const otherTitle = nodeTitle(other, t);
              return (
                <li key={edge.id} className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-2xs text-fg-secondary">
                      {connectionLabel(edge, node.key, t)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect({ type: 'node', key: other.key });
                      }}
                      className="cursor-default truncate rounded-sm text-left text-sm text-fg hover:text-blue"
                    >
                      {otherTitle}
                    </button>
                  </div>
                  <IconButton
                    icon={Info}
                    size="sm"
                    label={t('graph.details.showEdge', { title: otherTitle })}
                    onClick={() => {
                      onSelect({ type: 'edge', id: edge.id });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {connections.length > CONNECTIONS_SHOWN ? (
          <p className="text-xs text-fg-secondary">
            {tCount('graph.details.more', connections.length - CONNECTIONS_SHOWN)}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

interface EdgeDetailsProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  edge: GraphEdge;
  byKey: ReadonlyMap<string, GraphNode>;
  onSelect: (selection: GraphSelection) => void;
  onClose: () => void;
}

function EdgeDetails({ headingRef, edge, byKey, onSelect, onClose }: EdgeDetailsProps) {
  const { t } = useI18n();
  const source = byKey.get(edge.source);
  const target = byKey.get(edge.target);
  if (!source || !target) {
    return null;
  }
  const names = { source: nodeTitle(source, t), target: nodeTitle(target, t) };
  const type = edge.relationType ?? '';
  let sentence: string;
  switch (edge.kind) {
    case 'link':
      sentence = t('graph.edge.link', names);
      break;
    case 'workspace':
      sentence = t('graph.edge.workspace', names);
      break;
    case 'tag':
      sentence = t('graph.edge.tag', names);
      break;
    default:
      sentence = t('graph.edge.relation', {
        ...names,
        verb: isRelationType(type) ? t(`graph.edge.verbs.${type}`) : type,
      });
  }
  return (
    <Panel
      headingRef={headingRef}
      icon={
        <Waypoints size={16} className={edge.kind === 'suggestion' ? 'text-cyan' : 'text-purple'} />
      }
      title={t(`graph.edge.kinds.${edge.kind}`)}
      subtitle={
        edge.kind === 'relation' || edge.kind === 'suggestion'
          ? isRelationType(type)
            ? t(`memory.relations.types.${type}`)
            : type
          : null
      }
      onClose={onClose}
    >
      <p className="text-sm text-fg">{sentence}</p>
      {edge.kind === 'link' ? (
        <p className="text-xs text-fg-secondary">{t('graph.edge.linkHint')}</p>
      ) : null}
      {(edge.kind === 'relation' || edge.kind === 'suggestion') &&
      (source.kind === 'document' || source.kind === 'note') ? (
        <RelationFacts
          edge={edge}
          source={{ kind: source.kind, id: source.id }}
          onDecided={(decision) => {
            // A rejected suggestion leaves the graph: the panel shows the item it started from.
            onSelect(
              decision === 'reject'
                ? { type: 'node', key: edge.source }
                : { type: 'edge', id: edge.id },
            );
          }}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('graph.edge.ends')}
        </h3>
        <ul className="flex flex-col gap-1">
          {[source, target].map((end) => (
            <li key={end.key}>
              <button
                type="button"
                onClick={() => {
                  onSelect({ type: 'node', key: end.key });
                }}
                className="flex w-full cursor-default items-center gap-2 truncate rounded-sm text-left text-sm text-fg hover:text-blue"
              >
                <span className="text-2xs text-fg-secondary">{t(`graph.kinds.${end.kind}`)}</span>
                <span className="truncate">{nodeTitle(end, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/**
 * Who made a relation, and why the engine suggests one: read from the relations of its source item, the
 * same data as the Relations card of the item's page. A suggestion is decided here too.
 */
function RelationFacts({
  edge,
  source,
  onDecided,
}: {
  edge: GraphEdge;
  source: { kind: 'document' | 'note'; id: string };
  onDecided: (decision: 'accept' | 'reject') => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const relations = useQuery({
    queryKey: queryKeys.relations(source.kind, source.id),
    queryFn: () => listRelations(source.kind, source.id),
  });
  const relation = relations.data?.find((candidate) => candidate.id === edge.id);
  if (!relation) {
    return relations.isPending ? <Skeleton className="h-10 rounded-control" /> : null;
  }
  const decide = (decision: 'accept' | 'reject') => {
    decideRelation(relation.id, decision)
      .then(() =>
        Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.memory }),
          client.invalidateQueries({ queryKey: queryKeys.dashboard }),
        ]),
      )
      .then(() => {
        onDecided(decision);
        toast.success(
          t(decision === 'accept' ? 'memory.relations.accepted' : 'memory.relations.rejected'),
        );
      })
      .catch(() => {
        toast.error(t('memory.relations.failed'));
      });
  };
  if (relation.status !== 'suggested') {
    return (
      <p className="text-xs text-fg-secondary">{t(`memory.relations.origin.${relation.origin}`)}</p>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-control border border-line-subtle bg-obsidian p-3">
      <p className="text-xs text-fg-secondary">{t('graph.edge.pending')}</p>
      <Why relation={relation} />
      <div className="flex gap-2">
        <Button
          size="sm"
          icon={Check}
          onClick={() => {
            decide('accept');
          }}
        >
          {t('memory.relations.accept')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={() => {
            decide('reject');
          }}
        >
          {t('memory.relations.reject')}
        </Button>
      </div>
    </div>
  );
}
