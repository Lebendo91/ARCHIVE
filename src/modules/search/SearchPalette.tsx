import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, Search } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Kbd, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import {
  clearSearchHistory,
  searchHistory,
  searchQuery,
  type SearchHit,
  type SearchKind,
} from '@/services/search';
import { useSearchPalette } from '@/stores/searchPalette';
import { cn } from '@/utils/cn';
import { Highlighted } from './Highlighted';
import {
  HitTitle,
  InterpretationLine,
  KIND_ICONS,
  SEARCH_HISTORY_KEY,
  hasApplied,
  hitDetails,
  useRecordSearch,
} from './resultParts';
import { resultPath, searchRequest } from './searchRequest';

const GROUPS: readonly SearchKind[] = ['document', 'note', 'workspace', 'tag'];
const PER_GROUP = 4;
const FETCHED = 24;
const DEBOUNCE_MS = 150;

type PaletteOption =
  | { type: 'recent'; key: string; query: string }
  | { type: 'hit'; key: string; hit: SearchHit }
  | { type: 'all'; key: string; count: number };

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

/** One option of the list: a recent search, a result, or the way to every result. */
function OptionRow({
  option,
  id,
  selected,
  onHover,
  onActivate,
}: {
  option: PaletteOption;
  id: string;
  selected: boolean;
  onHover: () => void;
  onActivate: () => void;
}) {
  const { t, tCount } = useI18n();
  const common = {
    id,
    role: 'option' as const,
    'aria-selected': selected,
    onMouseMove: () => {
      if (!selected) {
        onHover();
      }
    },
    onClick: onActivate,
    className: cn(
      'flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm',
      selected ? 'bg-steel text-fg' : 'text-fg',
    ),
  };
  if (option.type === 'recent') {
    return (
      <div {...common}>
        <History size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
        <span className="min-w-0 flex-1 truncate">{option.query}</span>
      </div>
    );
  }
  if (option.type === 'all') {
    return (
      <div {...common}>
        <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-fg-secondary" />
        <span className="min-w-0 flex-1 truncate">{tCount('search.seeAll', option.count)}</span>
      </div>
    );
  }
  const Icon = KIND_ICONS[option.hit.kind];
  const details = hitDetails(option.hit, t);
  return (
    <div {...common} className={cn(common.className, 'items-start')}>
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <HitTitle hit={option.hit} className="truncate" />
        {option.hit.excerpt.length > 0 ? (
          <Highlighted
            segments={option.hit.excerpt}
            className="truncate text-xs text-fg-secondary"
          />
        ) : null}
      </span>
      {details ? (
        <span className="max-w-40 shrink-0 truncate text-xs text-fg-secondary">{details}</span>
      ) : null}
    </div>
  );
}

function PaletteBody({ initialText, onClose }: { initialText: string; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const record = useRecordSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [text, setText] = useState(initialText);
  const [literal, setLiteral] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const query = useDebounced(text, DEBOUNCE_MS);
  const typing = query.trim() !== '';
  const built = useMemo(
    () => searchRequest(query, {}, { literal, limit: FETCHED }),
    [query, literal],
  );
  const recognizable = useMemo(
    () => hasApplied(searchRequest(query, {}, { literal: false, limit: 1 }).applied),
    [query],
  );
  const results = useQuery({
    queryKey: ['search', 'palette', built.request],
    queryFn: () => searchQuery(built.request),
    enabled: typing,
    placeholderData: keepPreviousData,
  });
  const history = useQuery({
    queryKey: SEARCH_HISTORY_KEY,
    queryFn: () => searchHistory(8),
    enabled: !typing,
  });

  const groups = useMemo(() => {
    const hits = typing ? (results.data?.hits ?? []) : [];
    return GROUPS.map((kind) => ({
      kind,
      hits: hits.filter((hit) => hit.kind === kind).slice(0, PER_GROUP),
    })).filter((group) => group.hits.length > 0);
  }, [typing, results.data]);
  const total = typing ? (results.data?.total ?? 0) : 0;
  const options = useMemo<PaletteOption[]>(() => {
    if (!typing) {
      return (history.data ?? []).map((entry) => ({
        type: 'recent',
        key: `recent:${entry.id}`,
        query: entry.query,
      }));
    }
    const list: PaletteOption[] = groups.flatMap((group) =>
      group.hits.map((hit): PaletteOption => ({
        type: 'hit',
        key: `hit:${hit.kind}:${hit.id}`,
        hit,
      })),
    );
    if (total > 0) {
      list.push({ type: 'all', key: 'all', count: total });
    }
    return list;
  }, [typing, history.data, groups, total]);
  const found = options.findIndex((option) => option.key === activeKey);
  const activeIndex = found === -1 ? 0 : found;
  const active = options[activeIndex];
  const optionId = (key: string) => `${listboxId}-${key.replace(/[^\w-]/g, '_')}`;

  // The active option stays visible while moving with the keyboard.
  useEffect(() => {
    if (active) {
      document.getElementById(optionId(active.key))?.scrollIntoView({ block: 'nearest' });
    }
  });

  const openAll = () => {
    record(text);
    // The search page shows the same results: the text searched as typed stays so.
    void navigate(`/search?q=${encodeURIComponent(text.trim())}${literal ? '&literal=1' : ''}`);
    onClose();
  };
  const activate = (option: PaletteOption | undefined) => {
    if (!option) {
      if (text.trim() !== '') {
        openAll();
      }
      return;
    }
    if (option.type === 'recent') {
      setText(option.query);
      setActiveKey(null);
      inputRef.current?.focus();
      return;
    }
    if (option.type === 'all') {
      openAll();
      return;
    }
    record(text);
    void navigate(resultPath(option.hit));
    onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = options[(activeIndex + step + options.length) % options.length];
        setActiveKey(next?.key ?? null);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.ctrlKey && text.trim() !== '') {
        openAll();
      } else {
        activate(active);
      }
    }
  };

  const row = (option: PaletteOption) => (
    <OptionRow
      key={option.key}
      option={option}
      id={optionId(option.key)}
      selected={option.key === active?.key}
      onHover={() => {
        setActiveKey(option.key);
      }}
      onActivate={() => {
        activate(option);
      }}
    />
  );

  const searching = typing && (results.isPending || results.isFetching);
  const empty = typing && results.isSuccess && total === 0 && !results.isFetching;
  return (
    <>
      <div className="flex items-center gap-3 border-b border-line-subtle px-4">
        <Search size={18} aria-hidden="true" className="shrink-0 text-fg-secondary" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={t('search.inputLabel')}
          aria-expanded={options.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(active.key) : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={500}
          placeholder={t('search.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActiveKey(null);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-fg-muted focus-visible:outline-none"
        />
        {searching ? <Spinner size={16} /> : null}
      </div>
      {typing ? (
        <InterpretationLine
          applied={built.applied}
          literal={literal}
          recognizable={recognizable}
          onToggle={() => {
            setLiteral((current) => !current);
            inputRef.current?.focus();
          }}
          className="border-b border-line-subtle px-4 py-2"
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div id={listboxId} role="listbox" aria-label={t('search.paletteLabel')}>
          {typing ? (
            <>
              {groups.map((group) => (
                <div
                  key={group.kind}
                  role="group"
                  aria-labelledby={`${listboxId}-${group.kind}`}
                  className="mb-1"
                >
                  <div
                    id={`${listboxId}-${group.kind}`}
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-label text-fg-secondary uppercase"
                  >
                    {t(`search.groups.${group.kind}`)}
                  </div>
                  {options
                    .filter((option) => option.type === 'hit' && option.hit.kind === group.kind)
                    .map(row)}
                </div>
              ))}
              {options.filter((option) => option.type === 'all').map(row)}
            </>
          ) : options.length > 0 ? (
            <div role="group" aria-labelledby={`${listboxId}-recent`}>
              <div
                id={`${listboxId}-recent`}
                role="presentation"
                className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-label text-fg-secondary uppercase"
              >
                {t('search.recent')}
              </div>
              {options.map(row)}
            </div>
          ) : null}
        </div>
        {empty ? (
          <p role="status" className="px-3 py-6 text-center text-sm text-fg-secondary">
            {t('search.noResults', { query: text.trim() })}
          </p>
        ) : null}
        {!typing && history.isSuccess && options.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-secondary">{t('search.noHistory')}</p>
        ) : null}
        {!typing && options.length > 0 ? (
          <div className="flex justify-end px-1 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearSearchHistory()
                  .then(() => client.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY }))
                  .catch(() => undefined);
                inputRef.current?.focus();
              }}
            >
              {t('search.clearHistory')}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-subtle px-4 py-2 text-xs text-fg-secondary">
        <span className="flex items-center gap-1.5">
          <Kbd>{t('keys.up')}</Kbd>
          <Kbd>{t('keys.down')}</Kbd>
          {t('search.hints.navigate')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{t('keys.enter')}</Kbd>
          {t('search.hints.open')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{t('keys.ctrl')}</Kbd>
          <Kbd>{t('keys.enter')}</Kbd>
          {t('search.hints.all')}
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>{t('keys.escape')}</Kbd>
          {t('search.hints.close')}
        </span>
      </div>
    </>
  );
}

/**
 * Global search (specification §9.1): opened from the top bar or with Ctrl+K, it searches as the user types
 * and opens the chosen result. Results are grouped by kind; the whole list is on the search page.
 */
export function SearchPalette() {
  const { t } = useI18n();
  const isOpen = useSearchPalette((state) => state.isOpen);
  const initialText = useSearchPalette((state) => state.initialText);
  const close = useSearchPalette((state) => state.close);
  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-obsidian/75 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-[12vh] z-50 mx-auto flex max-h-[72vh] w-[calc(100%-64px)] max-w-2xl flex-col overflow-hidden rounded-modal border border-line bg-graphite shadow-modal outline-none data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in"
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>{t('search.paletteLabel')}</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          {isOpen ? <PaletteBody initialText={initialText} onClose={close} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
