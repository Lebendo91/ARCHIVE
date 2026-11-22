import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  Library,
  List,
  SearchX,
  Search,
  Star,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { QueryError } from '@/components/feedback/QueryError';
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
} from '@/components/ui';
import { useI18n } from '@/i18n';
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
import { cn } from '@/utils/cn';
import { KIND_FILTERS } from './documentFormat';
import { DocumentGrid, DocumentTable } from './DocumentViews';
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

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function daysAgo(days: string | null): number | undefined {
  const preset = DATE_PRESETS.find((candidate) => candidate === days);
  return preset ? Date.now() - Number(preset) * DAY_MS : undefined;
}

/** Filters, sorting and search are kept in the address: links can open a pre-filtered Library. */
function useLibraryParams() {
  const [params, setParams] = useSearchParams();
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    setParams(next, { replace: true });
  };
  return { params, update };
}

/** Library (spec §7.3): every imported document, with search, filters, sorting, folders and two views. */
export function LibraryPage() {
  const { t, tCount } = useI18n();
  const { params, update } = useLibraryParams();
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
  const importedParam = params.get('imported');
  const updatedParam = params.get('updated');
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

  const importedAfter = useMemo(() => daysAgo(importedParam), [importedParam]);
  const updatedAfter = useMemo(() => daysAgo(updatedParam), [updatedParam]);
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
    const viewProps = { items, workspaces: workspaces.data ?? [] };
    content = (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-fg-secondary">
          {tCount('library.count', total)}
        </p>
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
          className="w-80"
        />
        <SegmentedControl
          label={t('library.states.label')}
          value={state}
          options={STATES.map((value) => ({ value, label: t(`library.states.${value}`) }))}
          onChange={(value) => {
            update({ state: value === 'active' ? null : value });
          }}
        />
        <div className="ml-auto flex items-center gap-2">
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
          <div role="group" aria-label={t('library.view.label')} className="flex gap-1">
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
          <Button
            variant="primary"
            icon={Upload}
            onClick={() => {
              void startImport('pick');
            }}
          >
            {t('library.importAction')}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label={t('library.filters.label')}
        className="flex flex-wrap items-center gap-2"
      >
        <Select
          label={t('library.filters.kind')}
          hideLabel
          value={kindFilter?.id ?? ''}
          onChange={(event) => {
            update({ kind: event.target.value });
          }}
          className="w-40"
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
          hideLabel
          value={workspaceParam ?? ''}
          onChange={(event) => {
            update({ workspace: event.target.value, folder: null });
          }}
          className="w-48"
        >
          <option value="">{t('library.filters.allWorkspaces')}</option>
          <option value="none">{t('library.filters.unassigned')}</option>
          {(workspaces.data ?? []).map(({ workspace }) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </Select>
        {(tags.data ?? []).length > 0 ? (
          <Select
            label={t('library.filters.tag')}
            hideLabel
            value={tagId ?? ''}
            onChange={(event) => {
              update({ tag: event.target.value });
            }}
            className="w-44"
          >
            <option value="">{t('library.filters.allTags')}</option>
            {(tags.data ?? []).map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          label={t('library.filters.imported')}
          hideLabel
          value={importedParam ?? ''}
          onChange={(event) => {
            update({ imported: event.target.value });
          }}
          className="w-44"
        >
          <option value="">{t('library.filters.importedAny')}</option>
          <option value="7">{t('library.filters.importedLast7')}</option>
          <option value="30">{t('library.filters.importedLast30')}</option>
          <option value="365">{t('library.filters.importedLast365')}</option>
        </Select>
        <Select
          label={t('library.filters.updated')}
          hideLabel
          value={updatedParam ?? ''}
          onChange={(event) => {
            update({ updated: event.target.value });
          }}
          className="w-52"
        >
          <option value="">{t('library.filters.updatedAny')}</option>
          <option value="7">{t('library.filters.updatedLast7')}</option>
          <option value="30">{t('library.filters.updatedLast30')}</option>
          <option value="365">{t('library.filters.updatedLast365')}</option>
        </Select>
        <Select
          label={t('library.filters.indexing')}
          hideLabel
          value={indexing ?? ''}
          onChange={(event) => {
            update({ indexing: event.target.value });
          }}
          className="w-44"
        >
          <option value="">{t('library.filters.anyIndexing')}</option>
          {INDEXING.map((status) => (
            <option key={status} value={status}>
              {t(`library.indexing.${status}`)}
            </option>
          ))}
        </Select>
        <Button
          icon={Star}
          aria-pressed={favoritesOnly}
          className={cn(favoritesOnly && 'border-blue')}
          onClick={() => {
            update({ favorites: favoritesOnly ? null : '1' });
          }}
        >
          {t('library.filters.favorites')}
        </Button>
        {filtered ? (
          <Button variant="ghost" onClick={reset}>
            {t('library.filters.reset')}
          </Button>
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
