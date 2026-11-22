import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  FileUp,
  NotebookPen,
  Search,
  SearchX,
  SlidersHorizontal,
  Tags,
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
import { FolderPanel } from '@/modules/library/FolderPanel';
import type { WorkspaceScope } from '@/services/documents';
import type { NoteQuery, NoteSort, NoteState } from '@/services/notes';
import { useNotePages, useTags, useWorkspaces } from '@/services/queries';
import { NoteList } from './NoteList';
import { useCreateNote } from './useCreateNote';
import { useImportMarkdown } from './useImportMarkdown';

const PAGE_SIZE = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATES: readonly NoteState[] = ['active', 'archived', 'trashed'];
const SORTS: readonly NoteSort[] = ['updated_at', 'created_at', 'title', 'last_opened_at'];
const DATE_PRESETS = ['7', '30', '365'] as const;

/** Start of the period of a date filter (`7`, `30` or `365` days back), if any. */
function daysAgo(preset: string | undefined): number | undefined {
  return preset ? Date.now() - Number(preset) * DAY_MS : undefined;
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

interface FiltersProps {
  active: number;
  workspace: string;
  tag: string;
  updated: string;
  favoritesOnly: boolean;
  onChange: (changes: Record<string, string | null>) => void;
}

/** Note filters, each with its visible label. */
function NoteFilters({ active, workspace, tag, updated, favoritesOnly, onChange }: FiltersProps) {
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

/** Notes (spec §8.2): every note, with search, filters, sorting, folders, and creation and import. */
export function NotesPage() {
  const { t, tCount } = useI18n();
  const { params, update } = useListParams();
  const createNote = useCreateNote();
  const importMarkdown = useImportMarkdown();
  const workspaces = useWorkspaces();
  const tags = useTags();

  const state = pick(params.get('state'), STATES, 'active');
  const sort = pick(params.get('sort'), SORTS, 'updated_at');
  const descending = params.get('order') !== 'asc';
  const workspaceParam = params.get('workspace');
  const workspaceId = workspaceParam && workspaceParam !== 'none' ? workspaceParam : null;
  const folderId = workspaceId ? params.get('folder') : null;
  const tagId = params.get('tag');
  const favoritesOnly = params.get('favorites') === '1';
  const updatedPreset = DATE_PRESETS.find((preset) => preset === params.get('updated'));
  const search = params.get('q') ?? '';

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

  const updatedAfter = useMemo(() => daysAgo(updatedPreset), [updatedPreset]);
  const scope: WorkspaceScope | undefined =
    workspaceParam === 'none'
      ? { kind: 'unassigned' }
      : workspaceId
        ? { kind: 'workspace', id: workspaceId }
        : undefined;
  const query: Omit<NoteQuery, 'offset'> = {
    ...(search ? { search } : {}),
    ...(scope ? { workspace: scope } : {}),
    ...(folderId ? { folderId } : {}),
    ...(tagId ? { tagId } : {}),
    favoritesOnly,
    openedOnly: false,
    state,
    ...(updatedAfter === undefined ? {} : { updatedAfter }),
    sort,
    descending,
    limit: PAGE_SIZE,
  };
  const pages = useNotePages(query);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const total = pages.data?.pages[0]?.total ?? 0;
  const filtered =
    search !== '' ||
    scope !== undefined ||
    tagId !== null ||
    favoritesOnly ||
    updatedAfter !== undefined;

  const selectedWorkspace = workspaces.data?.find(
    (summary) => summary.workspace.id === workspaceId,
  )?.workspace;
  const tag = (tags.data ?? []).find((candidate) => candidate.id === tagId);
  const chip = (name: MessageKey, value: string) =>
    t('library.filters.chip', { name: t(name), value });
  const chips: { key: string; label: string; clear: Record<string, null> }[] = [];
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
  if (updatedPreset) {
    chips.push({
      key: 'updated',
      label: t(`library.filters.updatedLast${updatedPreset}`),
      clear: { updated: null },
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
    setSearchInput('');
    update({ q: null, workspace: null, folder: null, tag: null, favorites: null, updated: null });
  };
  const target = selectedWorkspace
    ? { workspaceId: selectedWorkspace.id, ...(folderId ? { folderId } : {}) }
    : {};

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
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    content = filtered ? (
      <EmptyState
        icon={SearchX}
        title={t('notes.noResults.title')}
        description={t('notes.noResults.description')}
        actions={<Button onClick={reset}>{t('library.filters.reset')}</Button>}
      />
    ) : state === 'archived' ? (
      <EmptyState
        icon={NotebookPen}
        title={t('notes.emptyArchived.title')}
        description={t('notes.emptyArchived.description')}
      />
    ) : state === 'trashed' ? (
      <EmptyState
        icon={NotebookPen}
        title={t('notes.emptyTrash.title')}
        description={t('notes.emptyTrash.description')}
      />
    ) : (
      <EmptyState
        icon={NotebookPen}
        iconTone="brand"
        title={t('notes.empty.title')}
        description={t('notes.empty.description')}
        actions={
          <>
            <Button
              variant="primary"
              icon={NotebookPen}
              onClick={() => {
                void createNote(target);
              }}
            >
              {t('notes.newNote')}
            </Button>
            <Button
              icon={FileUp}
              onClick={() => {
                void importMarkdown(target);
              }}
            >
              {t('notes.importMarkdown')}
            </Button>
          </>
        }
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-fg-secondary">
            {tCount('notes.count', total)}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <span aria-hidden="true" className="text-sm text-fg-secondary">
              {t('notes.sort.label')}
            </span>
            <Select
              label={t('notes.sort.label')}
              hideLabel
              value={sort}
              onChange={(event) => {
                update({ sort: event.target.value === 'updated_at' ? null : event.target.value });
              }}
              className="w-52"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`notes.sort.${value}`)}
                </option>
              ))}
            </Select>
            <IconButton
              icon={descending ? ArrowDownWideNarrow : ArrowUpNarrowWide}
              label={descending ? t('notes.sort.descending') : t('notes.sort.ascending')}
              variant="secondary"
              onClick={() => {
                update({ order: descending ? 'asc' : null });
              }}
            />
          </div>
        </div>
        <NoteList
          items={items}
          sort={sort}
          workspaces={workspaces.data ?? []}
          showWorkspace={workspaceParam === null}
        />
        {pages.hasNextPage ? (
          <Button
            className="self-center"
            loading={pages.isFetchingNextPage}
            onClick={() => {
              void pages.fetchNextPage();
            }}
          >
            {t('notes.showMore')}
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
            label={t('notes.searchLabel')}
            hideLabel
            icon={Search}
            type="search"
            placeholder={t('notes.searchPlaceholder')}
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
            }}
            className="w-64 xl:w-80"
          />
          <SegmentedControl
            label={t('notes.states.label')}
            value={state}
            options={STATES.map((value) => ({ value, label: t(`notes.states.${value}`) }))}
            onChange={(value) => {
              update({ state: value === 'active' ? null : value });
            }}
          />
          <NoteFilters
            active={chips.length}
            workspace={workspaceParam ?? ''}
            tag={tagId ?? ''}
            updated={updatedPreset ?? ''}
            favoritesOnly={favoritesOnly}
            onChange={update}
          />
          <div className="ml-auto flex items-center gap-2">
            <Button
              icon={FileUp}
              onClick={() => {
                void importMarkdown(target);
              }}
            >
              {t('notes.importMarkdown')}
            </Button>
            <Button
              variant="primary"
              icon={NotebookPen}
              onClick={() => {
                void createNote(target);
              }}
            >
              {t('notes.newNote')}
            </Button>
          </div>
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
          {t('notes.trashNotice')}
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
