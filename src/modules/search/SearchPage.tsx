import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { History, Info, Search, SearchX, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { QueryError } from '@/components/feedback/QueryError';
import { FilterChip, useListParams } from '@/components/resources/listControls';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { formatList, formatNumber, formatShortDate, useI18n, type MessageKey } from '@/i18n';
import { useTags, useWorkspaces } from '@/services/queries';
import {
  clearSearchHistory,
  deleteSearch,
  searchHistory,
  searchQuery,
  type DateField,
  type SearchCounts,
  type SearchHistoryEntry,
  type SearchHit,
  type SearchKind,
  type SearchSort,
} from '@/services/search';
import { toast } from '@/stores/toasts';
import { Highlighted } from './Highlighted';
import { interpret } from './interpret';
import {
  HitTitle,
  InterpretationLine,
  KIND_ICONS,
  SEARCH_HISTORY_KEY,
  hasApplied,
  hitDetails,
  useRecordSearch,
} from './resultParts';
import { resultPath, searchRequest, type SearchFilters } from './searchRequest';

const PAGE_SIZE = 20;
const HISTORY_SHOWN = 12;
const DEBOUNCE_MS = 250;
const KINDS: readonly SearchKind[] = ['document', 'note', 'workspace', 'tag'];
const SORTS: readonly SearchSort[] = ['relevance', 'date'];
const FIELDS: readonly DateField[] = ['added', 'updated'];
const PERIODS = ['7', '30', '365'] as const;
type Period = (typeof PERIODS)[number];
type KindChoice = SearchKind | 'all';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

/** Start of a period of the last `period` days, today included, in the local calendar. */
function periodStart(period: Period, now: Date): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (Number(period) - 1),
  ).getTime();
}

function countOf(counts: SearchCounts, kind: SearchKind): number {
  switch (kind) {
    case 'document':
      return counts.documents;
    case 'note':
      return counts.notes;
    case 'workspace':
      return counts.workspaces;
    case 'tag':
      return counts.tags;
  }
}

/** The words found in a result, once each, as they are written in it. */
function matchedTerms(hit: SearchHit): string[] {
  const terms = new Map<string, string>();
  for (const segment of hit.title.concat(hit.excerpt)) {
    const term = segment.text.trim();
    if (segment.matched && term !== '' && !terms.has(term.toLowerCase())) {
      terms.set(term.toLowerCase(), term);
    }
  }
  return Array.from(terms.values());
}

/** One result: title, type, place, excerpt, date, and why it was found (spec §9.3). */
function ResultRow({ hit, onOpen }: { hit: SearchHit; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const Icon = KIND_ICONS[hit.kind];
  const kind = t(`search.kind.${hit.kind}`);
  const facts = [
    hit.kind === 'document' && hit.fileExtension
      ? `${kind} · ${hit.fileExtension.toUpperCase()}`
      : kind,
    hitDetails(hit, t),
    t(hit.dateField === 'added' ? 'search.added' : 'search.updated', {
      date: formatShortDate(new Date(hit.date), locale),
    }),
  ].filter((fact) => fact !== '');
  const terms = matchedTerms(hit);
  const reasons = [
    terms.length > 0 ? t('search.matchedTerms', { terms: formatList(terms, locale) }) : '',
    hit.matchedTags.length > 0
      ? t('search.matchedTags', { tags: formatList(hit.matchedTags, locale) })
      : '',
  ].filter((reason) => reason !== '');
  return (
    <li className="relative flex items-start gap-3 border-b border-line-subtle px-4 py-3 transition-colors duration-150 ease-standard last:border-b-0 focus-within:bg-steel/40 hover:bg-steel/40">
      <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          {/* The link covers the whole row; its name stays the title. */}
          <Link
            to={resultPath(hit)}
            onClick={onOpen}
            className="min-w-0 cursor-default truncate rounded-sm font-medium text-fg after:absolute after:inset-0 hover:text-blue"
          >
            <HitTitle hit={hit} />
          </Link>
          {hit.isFavorite ? (
            <span className="inline-flex shrink-0 text-amber">
              <Star size={14} aria-hidden="true" fill="currentColor" />
              <span className="sr-only">{t('search.favorite')}</span>
            </span>
          ) : null}
          {hit.isArchived ? <Badge>{t('search.archived')}</Badge> : null}
          {hit.partial ? <Badge tone="info">{t('search.partial')}</Badge> : null}
        </span>
        {hit.excerpt.length > 0 ? (
          <Highlighted segments={hit.excerpt} className="line-clamp-2 text-sm text-fg-secondary" />
        ) : null}
        <span className="text-xs text-fg-secondary">{facts.join(' · ')}</span>
        {reasons.length > 0 ? (
          <span className="text-xs text-fg-secondary">{reasons.join(' · ')}</span>
        ) : null}
      </div>
    </li>
  );
}

interface FiltersProps {
  active: number;
  workspace: string;
  tag: string;
  field: DateField;
  period: string;
  favoritesOnly: boolean;
  onChange: (changes: Record<string, string | null>) => void;
}

/** Search filters, each with its visible label. */
function SearchFiltersPopover({
  active,
  workspace,
  tag,
  field,
  period,
  favoritesOnly,
  onChange,
}: FiltersProps) {
  const { t, tCount } = useI18n();
  const workspaces = useWorkspaces();
  const tags = useTags();
  const favoritesId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={SlidersHorizontal}>
          {t('library.filters.label')}
          {active > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 text-2xs font-semibold text-obsidian"
              >
                {active}
              </span>
              {/* A separate space, so that the accessible name reads « Filtres (2 filtres actifs) ». */}{' '}
              <span className="sr-only">{tCount('library.filters.activeCount', active)}</span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent label={t('library.filters.label')} className="w-80">
        <div className="flex flex-col gap-4">
          <Select
            label={t('library.filters.workspace')}
            value={workspace}
            onChange={(event) => {
              onChange({ workspace: event.target.value });
            }}
          >
            <option value="">{t('library.filters.allWorkspaces')}</option>
            {(workspaces.data ?? []).map(({ workspace: entry }) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
          {(tags.data ?? []).length > 0 ? (
            <Select
              label={t('library.filters.tag')}
              value={tag}
              onChange={(event) => {
                onChange({ tag: event.target.value });
              }}
            >
              <option value="">{t('library.filters.allTags')}</option>
              {(tags.data ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            label={t('search.filters.date')}
            value={field}
            onChange={(event) => {
              onChange({ field: event.target.value === 'added' ? null : event.target.value });
            }}
          >
            {FIELDS.map((value) => (
              <option key={value} value={value}>
                {t(`search.filters.${value}`)}
              </option>
            ))}
          </Select>
          <Select
            label={t('search.filters.period')}
            value={period}
            onChange={(event) => {
              onChange({ period: event.target.value });
            }}
          >
            <option value="">{t('search.filters.anyPeriod')}</option>
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {t(`search.filters.last${value}`)}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <input
              id={favoritesId}
              type="checkbox"
              checked={favoritesOnly}
              onChange={(event) => {
                onChange({ favorites: event.target.checked ? '1' : null });
              }}
              className="h-4 w-4 accent-blue"
            />
            <label htmlFor={favoritesId} className="text-sm text-fg">
              {t('library.filters.favorites')}
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** What the page shows before a search: how to search, and the recent searches. */
function RecentSearches({
  inputRef,
  onRun,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onRun: (query: string) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const idPrefix = useId();
  const key = [...SEARCH_HISTORY_KEY, HISTORY_SHOWN] as const;
  const history = useQuery({ queryKey: key, queryFn: () => searchHistory(HISTORY_SHOWN) });
  const entries = history.data ?? [];
  const entryId = (entry: SearchHistoryEntry) => `${idPrefix}-${entry.id}`;

  const remove = (entry: SearchHistoryEntry, index: number) => {
    deleteSearch(entry.id)
      .then(() => {
        // Focus goes to the next search (or the one before, or the search field once none is left), before
        // the removed one leaves the list.
        const neighbour = entries[index + 1] ?? entries[index - 1];
        const target = neighbour ? document.getElementById(entryId(neighbour)) : null;
        (target ?? inputRef.current)?.focus();
        client.setQueryData<SearchHistoryEntry[]>(key, (current) =>
          current?.filter((candidate) => candidate.id !== entry.id),
        );
        return client.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY });
      })
      .catch(() => {
        toast.error(t('search.historyFailed'));
      });
  };
  const clear = () => {
    clearSearchHistory()
      .then(() => {
        inputRef.current?.focus();
        client.setQueryData<SearchHistoryEntry[]>(key, []);
        toast.success(t('search.historyCleared'));
        return client.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY });
      })
      .catch(() => {
        toast.error(t('search.historyFailed'));
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={Search}
        iconTone="interactive"
        title={t('search.empty.title')}
        description={t('search.empty.description')}
      />
      {entries.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-recent`} className="mx-auto w-full max-w-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2
              id={`${idPrefix}-recent`}
              className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
            >
              {t('search.recent')}
            </h2>
            <Button variant="ghost" size="sm" onClick={clear}>
              {t('search.clearHistory')}
            </Button>
          </div>
          <ul className="overflow-hidden rounded-card border border-line-subtle bg-graphite">
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center gap-1 border-b border-line-subtle pr-2 last:border-b-0"
              >
                <button
                  id={entryId(entry)}
                  type="button"
                  onClick={() => {
                    onRun(entry.query);
                  }}
                  className="flex min-w-0 flex-1 cursor-default items-center gap-3 rounded-control px-4 py-2.5 text-left text-sm text-fg transition-colors duration-150 ease-standard hover:text-blue"
                >
                  <History size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
                  <span className="truncate">{entry.query}</span>
                </button>
                <IconButton
                  icon={X}
                  size="sm"
                  label={t('search.removeRecent', { query: entry.query })}
                  onClick={() => {
                    remove(entry, index);
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Search page (specification §9): every result of a search, with filters by type, place, tag, date and
 * favorites, the reading of dates and types made visible, and the recent searches.
 */
export function SearchPage() {
  const { t, tCount, locale } = useI18n();
  const { params, update } = useListParams();
  const record = useRecordSearch();
  const workspaces = useWorkspaces();
  const tags = useTags();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = params.get('q') ?? '';
  const kindParam = params.get('kind');
  const explicitKind: KindChoice | undefined =
    kindParam === 'all' ? 'all' : KINDS.find((kind) => kind === kindParam);
  const workspaceParam = params.get('workspace');
  const tagParam = params.get('tag');
  const field = pick(params.get('field'), FIELDS, 'added');
  const period = PERIODS.find((value) => value === params.get('period'));
  const favoritesOnly = params.get('favorites') === '1';
  const sort = pick(params.get('sort'), SORTS, 'relevance');
  const literal = params.get('literal') === '1';

  // A workspace or a tag deleted since the address was made no longer filters anything.
  const workspace = workspaces.data?.find(
    (summary) => summary.workspace.id === workspaceParam,
  )?.workspace;
  const workspaceId =
    workspaceParam && (workspace || !workspaces.isSuccess) ? workspaceParam : undefined;
  const tag = tags.data?.find((candidate) => candidate.id === tagParam);
  const tagId = tagParam && (tag || !tags.isSuccess) ? tagParam : undefined;

  // The field follows the address when it changes from elsewhere (the palette, a recent search).
  const [input, setInput] = useState(q);
  const [shown, setShown] = useState(q);
  if (q !== shown) {
    setShown(q);
    if (q !== input.trim()) {
      setInput(q);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (input.trim() !== q) {
        update({ q: input.trim() });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  });

  const filters: SearchFilters = {
    ...(explicitKind ? { kinds: explicitKind === 'all' ? [] : [explicitKind] } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(tagId ? { tagId } : {}),
    ...(field === 'updated' ? { dateField: field } : {}),
    ...(period ? { dateFrom: periodStart(period, new Date()) } : {}),
    favoritesOnly,
    sort,
  };
  const built = searchRequest(q, filters, { literal, limit: PAGE_SIZE });
  const recognized = literal ? undefined : interpret(q);
  const recognizable = hasApplied(searchRequest(q, {}, { literal: false, limit: 1 }).applied);
  const filtered =
    workspaceId !== undefined || tagId !== undefined || period !== undefined || favoritesOnly;
  const active = q !== '' || filtered;

  const results = useInfiniteQuery({
    queryKey: ['search', 'page', built.request],
    queryFn: ({ pageParam }) => searchQuery({ ...built.request, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.hits.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: active,
    placeholderData: keepPreviousData,
  });
  const hits = results.data?.pages.flatMap((page) => page.hits) ?? [];
  const first = results.data?.pages[0];
  const total = first?.total ?? 0;

  const chip = (name: MessageKey, value: string) =>
    t('library.filters.chip', { name: t(name), value });
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (workspace && workspaceId) {
    chips.push({
      key: 'workspace',
      label: chip('library.filters.workspace', workspace.name),
      clear: { workspace: null },
    });
  }
  if (tag && tagId) {
    chips.push({ key: 'tag', label: chip('library.filters.tag', tag.name), clear: { tag: null } });
  }
  if (period) {
    chips.push({
      key: 'period',
      label: chip(`search.filters.${field}`, t(`search.filters.last${period}`)),
      clear: { period: null },
    });
  }
  if (favoritesOnly) {
    chips.push({
      key: 'favorites',
      label: t('library.filters.favorites'),
      clear: { favorites: null },
    });
  }
  const reset = () => {
    update({ workspace: null, tag: null, field: null, period: null, favorites: null });
  };

  const submit = (query: string) => {
    setInput(query);
    update({ q: query });
    record(query);
  };
  const kindValue: KindChoice = explicitKind ?? built.applied.kind ?? 'all';
  const kindLabel = (label: string, count: number | undefined) =>
    count === undefined
      ? label
      : t('search.kinds.count', { label, count: formatNumber(count, locale) });
  const kindOptions: { value: KindChoice; label: string }[] = [
    {
      value: 'all',
      label: kindLabel(
        t('search.kinds.all'),
        first ? KINDS.reduce((sum, kind) => sum + countOf(first.counts, kind), 0) : undefined,
      ),
    },
    ...KINDS.map((kind) => ({
      value: kind,
      label: kindLabel(t(`search.groups.${kind}`), first ? countOf(first.counts, kind) : undefined),
    })),
  ];

  let content;
  if (!active) {
    content = (
      <RecentSearches
        inputRef={inputRef}
        onRun={(query) => {
          submit(query);
          inputRef.current?.focus();
        }}
      />
    );
  } else if (results.isError) {
    content = (
      <QueryError
        error={results.error}
        onRetry={() => {
          void results.refetch();
        }}
      />
    );
  } else if (results.isPending) {
    content = (
      <div aria-hidden="true" className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label={t('search.kinds.label')}
            value={kindValue}
            options={kindOptions}
            onChange={(value) => {
              if (value === 'all') {
                // « All » must win over a type read in the text.
                update({ kind: recognized?.kind ? 'all' : null });
              } else {
                update({ kind: value === recognized?.kind ? null : value });
              }
            }}
          />
          <div className="ml-auto flex items-center gap-3">
            <p role="status" className="text-sm text-fg-secondary">
              {tCount('search.results', total)}
            </p>
            <Select
              label={t('search.sort.label')}
              hideLabel
              value={sort}
              onChange={(event) => {
                update({ sort: event.target.value === 'relevance' ? null : event.target.value });
              }}
              className="w-40"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`search.sort.${value}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {hits.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t('search.noResultsTitle')}
            description={
              q === ''
                ? t('search.noResultsFiltered')
                : `${t('search.noResults', { query: q })} ${t('search.noResultsHint')}`
            }
            actions={
              chips.length > 0 ? (
                <Button onClick={reset}>{t('library.filters.reset')}</Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-card border border-line-subtle bg-graphite">
            {hits.map((hit) => (
              <ResultRow
                key={`${hit.kind}:${hit.id}`}
                hit={hit}
                onOpen={() => {
                  record(q);
                }}
              />
            ))}
          </ul>
        )}
        {results.hasNextPage ? (
          <Button
            className="self-center"
            loading={results.isFetchingNextPage}
            onClick={() => {
              void results.fetchNextPage();
            }}
          >
            {t('search.showMore')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            ref={inputRef}
            label={t('search.inputLabel')}
            hideLabel
            icon={Search}
            type="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={500}
            placeholder={t('search.placeholder')}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submit(input.trim());
              }
            }}
            className="min-w-64 flex-1 xl:max-w-2xl"
          />
          {active && results.isFetching && !results.isFetchingNextPage ? (
            <Spinner size={16} />
          ) : null}
          <SearchFiltersPopover
            active={chips.length}
            workspace={workspaceId ?? ''}
            tag={tagId ?? ''}
            field={field}
            period={period ?? ''}
            favoritesOnly={favoritesOnly}
            onChange={update}
          />
        </div>
        {chips.length > 0 ? (
          <div
            role="group"
            aria-label={t('library.filters.active')}
            className="flex flex-wrap items-center gap-2"
          >
            {chips.map((entry) => (
              <FilterChip
                key={entry.key}
                label={entry.label}
                onRemove={() => {
                  update(entry.clear);
                }}
              />
            ))}
            <Button variant="ghost" size="sm" onClick={reset}>
              {t('library.filters.reset')}
            </Button>
          </div>
        ) : null}
        {q !== '' ? (
          <InterpretationLine
            applied={built.applied}
            literal={literal}
            recognizable={recognizable}
            onToggle={() => {
              update({ literal: literal ? null : '1' });
            }}
          />
        ) : null}
      </div>

      {content}

      <p className="flex items-start gap-2 text-xs text-fg-secondary">
        <Info size={14} aria-hidden="true" className="mt-px shrink-0" />
        {t('search.fullText')}
      </p>
    </div>
  );
}
