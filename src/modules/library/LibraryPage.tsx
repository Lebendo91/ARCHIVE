import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  Library,
  List,
  SearchX,
  Search,
  SlidersHorizontal,
  Tags,
  Upload,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { QueryError } from '@/components/feedback/QueryError';
import { FilterChip, useListParams } from '@/components/resources/listControls';
import { TagManagerDialog } from '@/components/resources/TagManagerDialog';
import {
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
} from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import type {
  DocumentQuery,
  DocumentSort,
  DocumentState,
  ProcessingStatus,
  WorkspaceScope,
} from '@/services/documents';
import { useDocumentPages, useTags, useWorkspaces } from '@/services/queries';
import { useImportStore } from '@/stores/imports';
import { useUiStore } from '@/stores/ui';
import { KIND_FILTERS } from './documentFormat';
import { DocumentGrid, DocumentTable, type DateColumn } from './DocumentViews';
import { FolderPanel } from './FolderPanel';
import { useStartImport } from './useStartImport';

const PAGE_SIZE = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATES: readonly DocumentState[] = ['active', 'archived', 'trashed'];
const SORTS: readonly DocumentSort[] = [
  'imported_at',
  'title',
  'updated_at',
  'file_size',
  'last_opened_at',
];
const INDEXING: readonly ProcessingStatus[] = ['completed', 'pending', 'failed', 'needs_attention'];
const DATE_PRESETS = ['7', '30', '365'] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function datePreset(value: string | null): DatePreset | undefined {
  return DATE_PRESETS.find((candidate) => candidate === value);
}

function daysAgo(preset: DatePreset | undefined): number | undefined {
  return preset ? Date.now() - Number(preset) * DAY_MS : undefined;
}

/** The date shown in the list follows the sort: the date the documents are ordered by. */
function dateColumnFor(sort: DocumentSort): DateColumn {
  if (sort === 'updated_at') {
    return 'updated';
  }
  return sort === 'last_opened_at' ? 'opened' : 'imported';
}

/** Library (spec §7.3): every imported document, with search, filters, sorting, folders and two views. */
export function LibraryPage() {
  const { t, tCount } = useI18n();
  const { params, update } = useListParams();
  const view = useUiStore((state) => state.libraryView);
  const setView = useUiStore((state) => state.setLibraryView);
  const startImport = useStartImport();
  const workspaces = useWorkspaces();
  const tags = useTags();

  const state = pick(params.get('state'), STATES, 'active');
  const sort = pick(params.get('sort'), SORTS, 'imported_at');
  const descending = params.get('order') !== 'asc';
  const kindFilter = KIND_FILTERS.find((filter) => filter.id === params.get('kind'));
  const workspaceParam = params.get('workspace');
  const workspaceId = workspaceParam && workspaceParam !== 'none' ? workspaceParam : null;
  const folderId = workspaceId ? params.get('folder') : null;
  const tagId = params.get('tag');
  const indexing = INDEXING.find((status) => status === params.get('indexing'));
  const favoritesOnly = params.get('favorites') === '1';
  const importedPreset = datePreset(params.get('imported'));
  const updatedPreset = datePreset(params.get('updated'));
  const search = params.get('q') ?? '';

  // The search field updates the address a moment after typing stops.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() !== search) {
        update({ q: searchInput.trim() });
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  });

  const importedAfter = useMemo(() => daysAgo(importedPreset), [importedPreset]);
  const updatedAfter = useMemo(() => daysAgo(updatedPreset), [updatedPreset]);
  const scope: WorkspaceScope | undefined =
    workspaceParam === 'none'
      ? { kind: 'unassigned' }
      : workspaceId
        ? { kind: 'workspace', id: workspaceId }
        : undefined;
  const query: Omit<DocumentQuery, 'offset'> = {
    search: search || undefined,
    workspace: scope,
    folderId: folderId ?? undefined,
    kinds: kindFilter?.kinds,
    tagId: tagId ?? undefined,
    favoritesOnly,
    openedOnly: false,
    state,
    importedAfter,
    updatedAfter,
    indexing,
    sort,
    descending,
    limit: PAGE_SIZE,
  };
  const pages = useDocumentPages(query);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const total = pages.data?.pages[0]?.total ?? 0;
  const filtered =
    search !== '' ||
    scope !== undefined ||
    kindFilter !== undefined ||
    tagId !== null ||
    favoritesOnly ||
    importedAfter !== undefined ||
    updatedAfter !== undefined ||
    indexing !== undefined;

  // Imports started here go into the workspace (and folder) being viewed.
  const selectedWorkspace = workspaces.data?.find(
    (summary) => summary.workspace.id === workspaceId,
  )?.workspace;
  useEffect(() => {
    useImportStore.getState().setContext(
      selectedWorkspace
        ? {
            target: { workspaceId: selectedWorkspace.id, folderId: folderId ?? undefined },
            label: selectedWorkspace.name,
          }
        : null,
    );
    return () => {
      useImportStore.getState().setContext(null);
    };
  }, [selectedWorkspace, folderId]);

  const reset = () => {
    setSearchInput('');
    update({
      q: null,
      workspace: null,
      folder: null,
      kind: null,
      tag: null,
      favorites: null,
      imported: null,
      updated: null,
      indexing: null,
    });
  };

  // One chip per active filter (the search field and the folder panel show their own state).
  const chip = (name: MessageKey, value: string) =>
    t('library.filters.chip', { name: t(name), value });
  const tag = (tags.data ?? []).find((candidate) => candidate.id === tagId);
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
  if (kindFilter) {
    chips.push({
      key: 'kind',
      label: chip('library.filters.kind', t(kindFilter.labelKey)),
      clear: { kind: null },
    });
  }
  if (workspaceParam === 'none') {
    chips.push({
      key: 'workspace',
      label: t('library.filters.unassigned'),
      clear: { workspace: null, folder: null },
    });
  } else if (selectedWorkspace) {
    chips.push({
      key: 'workspace',
      label: chip('library.filters.workspace', selectedWorkspace.name),
      clear: { workspace: null, folder: null },
    });
  }
  if (tag) {
    chips.push({ key: 'tag', label: chip('library.filters.tag', tag.name), clear: { tag: null } });
  }
  if (importedPreset) {
    chips.push({
      key: 'imported',
      label: t(`library.filters.importedLast${importedPreset}`),
      clear: { imported: null },
    });
  }
  if (updatedPreset) {
    chips.push({
      key: 'updated',
      label: t(`library.filters.updatedLast${updatedPreset}`),
      clear: { updated: null },
    });
  }
  if (indexing) {
    chips.push({
      key: 'indexing',
      label: chip('library.filters.indexing', t(`library.indexing.${indexing}`)),
      clear: { indexing: null },
    });
  }
  if (favoritesOnly) {
    chips.push({
      key: 'favorites',
      label: t('library.filters.favorites'),
      clear: { favorites: null },
    });
  }

  let content;
  if (pages.isError) {
    content = (
      <QueryError
        error={pages.error}
        onRetry={() => {
          void pages.refetch();
        }}
      />
    );
  } else if (pages.isPending) {
    content = (
      <div aria-hidden="true" className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-14 rounded-card" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    content = filtered ? (
      <EmptyState
        icon={SearchX}
        title={t('library.noResults.title')}
        description={t('library.noResults.description')}
        actions={<Button onClick={reset}>{t('library.filters.reset')}</Button>}
      />
    ) : state === 'archived' ? (
      <EmptyState
        icon={Library}
        title={t('library.emptyArchived.title')}
        description={t('library.emptyArchived.description')}
      />
    ) : state === 'trashed' ? (
      <EmptyState
        icon={Library}
        title={t('library.emptyTrash.title')}
        description={t('library.emptyTrash.description')}
      />
    ) : (
      <EmptyState
        icon={Library}
        iconTone="brand"
        title={t('library.empty.title')}
        description={t('library.empty.description')}
        actions={
          <Button
            variant="primary"
            icon={Upload}
            onClick={() => {
              void startImport('pick');
            }}
          >
            {t('library.importDocuments')}
          </Button>
        }
      >
        <p className="text-xs text-fg-secondary">{t('library.empty.dropHint')}</p>
      </EmptyState>
    );
  } else {
    const viewProps = {
      items,
      workspaces: workspaces.data ?? [],
      // Every document of a filtered workspace is in it: its column would only repeat the name.
      showWorkspace: workspaceParam === null,
      dateColumn: dateColumnFor(sort),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-fg-secondary">
            {tCount('library.count', total)}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <span aria-hidden="true" className="text-sm text-fg-secondary">
              {t('library.sort.label')}
            </span>
            <Select
              label={t('library.sort.label')}
              hideLabel
              value={sort}
              onChange={(event) => {
                update({ sort: event.target.value === 'imported_at' ? null : event.target.value });
              }}
              className="w-48"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`library.sort.${value}`)}
                </option>
              ))}
            </Select>
            <IconButton
              icon={descending ? ArrowDownWideNarrow : ArrowUpNarrowWide}
              label={descending ? t('library.sort.descending') : t('library.sort.ascending')}
              variant="secondary"
              onClick={() => {
                update({ order: descending ? 'asc' : null });
              }}
            />
            <div role="group" aria-label={t('library.view.label')} className="ml-2 flex gap-1">
              <IconButton
                icon={List}
                label={t('library.view.list')}
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'list'}
                onClick={() => {
                  setView('list');
                }}
              />
              <IconButton
                icon={LayoutGrid}
                label={t('library.view.grid')}
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'grid'}
                onClick={() => {
                  setView('grid');
                }}
              />
            </div>
          </div>
        </div>
        {view === 'grid' ? <DocumentGrid {...viewProps} /> : <DocumentTable {...viewProps} />}
        {pages.hasNextPage ? (
          <Button
            className="self-center"
            loading={pages.isFetchingNextPage}
            onClick={() => {
              void pages.fetchNextPage();
            }}
          >
            {t('library.showMore')}
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
            label={t('library.searchLabel')}
            hideLabel
            icon={Search}
            type="search"
            placeholder={t('library.searchPlaceholder')}
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            className="w-64 xl:w-80"
          />
          <SegmentedControl
            label={t('library.states.label')}
            value={state}
            options={STATES.map((value) => ({ value, label: t(`library.states.${value}`) }))}
            onChange={(value) => {
              update({ state: value === 'active' ? null : value });
            }}
          />
          <FiltersPopover
            active={chips.length}
            kind={kindFilter?.id ?? ''}
            workspace={workspaceParam ?? ''}
            tag={tagId ?? ''}
            imported={importedPreset ?? ''}
            updated={updatedPreset ?? ''}
            indexing={indexing ?? ''}
            favoritesOnly={favoritesOnly}
            onChange={update}
          />
          <Button
            variant="primary"
            icon={Upload}
            className="ml-auto"
            onClick={() => {
              void startImport('pick');
            }}
          >
            {t('library.importAction')}
          </Button>
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
      </div>

      {state === 'trashed' ? (
        <p className="rounded-card border border-line-subtle bg-graphite px-4 py-3 text-sm text-fg-secondary">
          {t('library.trashNotice')}
        </p>
      ) : null}

      {workspaceId ? (
        <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-6">
          <FolderPanel
            workspaceId={workspaceId}
            selectedFolderId={folderId}
            onSelect={(id) => {
              update({ folder: id });
            }}
          />
          <div className="min-w-0">{content}</div>
        </div>
      ) : (
        content
      )}
    </div>
  );
}

interface FiltersPopoverProps {
  /** Number of active filters, shown on the button. */
  active: number;
  kind: string;
  workspace: string;
  tag: string;
  imported: string;
  updated: string;
  indexing: string;
  favoritesOnly: boolean;
  onChange: (changes: Record<string, string | null>) => void;
}

/** Every Library filter (spec §7.3) in one panel, each with its visible label. */
function FiltersPopover({
  active,
  kind,
  workspace,
  tag,
  imported,
  updated,
  indexing,
  favoritesOnly,
  onChange,
}: FiltersPopoverProps) {
  const { t, tCount } = useI18n();
  const workspaces = useWorkspaces();
  const tags = useTags();
  const favoritesId = useId();
  const [open, setOpen] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button ref={triggerRef} icon={SlidersHorizontal}>
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
              label={t('library.filters.kind')}
              value={kind}
              onChange={(event) => {
                onChange({ kind: event.target.value });
              }}
            >
              <option value="">{t('library.filters.allKinds')}</option>
              {KIND_FILTERS.map((filter) => (
                <option key={filter.id} value={filter.id}>
                  {t(filter.labelKey)}
                </option>
              ))}
            </Select>
            <Select
              label={t('library.filters.workspace')}
              value={workspace}
              onChange={(event) => {
                onChange({ workspace: event.target.value, folder: null });
              }}
            >
              <option value="">{t('library.filters.allWorkspaces')}</option>
              <option value="none">{t('library.filters.unassigned')}</option>
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
              label={t('library.filters.imported')}
              value={imported}
              onChange={(event) => {
                onChange({ imported: event.target.value });
              }}
            >
              <option value="">{t('library.filters.anyDate')}</option>
              {DATE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`library.filters.importedLast${preset}`)}
                </option>
              ))}
            </Select>
            <Select
              label={t('library.filters.updated')}
              value={updated}
              onChange={(event) => {
                onChange({ updated: event.target.value });
              }}
            >
              <option value="">{t('library.filters.anyDate')}</option>
              {DATE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`library.filters.updatedLast${preset}`)}
                </option>
              ))}
            </Select>
            <Select
              label={t('library.filters.indexing')}
              value={indexing}
              onChange={(event) => {
                onChange({ indexing: event.target.value });
              }}
            >
              <option value="">{t('library.filters.anyIndexing')}</option>
              {INDEXING.map((status) => (
                <option key={status} value={status}>
                  {t(`library.indexing.${status}`)}
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
            <Button
              variant="ghost"
              size="sm"
              icon={Tags}
              className="self-start"
              onClick={() => {
                setOpen(false);
                setManagingTags(true);
              }}
            >
              {t('library.tagManager.open')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <TagManagerDialog
        open={managingTags}
        returnFocus={triggerRef}
        onClose={() => {
          setManagingTags(false);
        }}
      />
    </>
  );
}
