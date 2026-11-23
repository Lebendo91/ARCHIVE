import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileText, NotebookText, Search } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { Input, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { listDocuments } from '@/services/documents';
import { listNotes, type LinkKind } from '@/services/notes';

const RESULTS = 8;

export interface PickedResource {
  kind: LinkKind;
  id: string;
  title: string;
}

interface ResourcePickerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  /** The item being edited: it is not offered. */
  exclude?: { kind: LinkKind; id: string };
  hint?: string;
  /** Text already typed when the picker opens. */
  initialQuery?: string;
  onPick: (resource: PickedResource) => void;
}

/**
 * Notes and documents found by their title, to choose one (an internal link, a relation). The most recently
 * modified come first before anything is typed.
 */
export function ResourcePicker({
  inputRef,
  exclude,
  hint,
  initialQuery = '',
  onPick,
}: ResourcePickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
    }, 200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  // While a new search runs, the previous results stay on screen instead of flashing away.
  const notes = useQuery({
    queryKey: ['resource-picker', 'notes', query],
    placeholderData: keepPreviousData,
    queryFn: () =>
      listNotes({
        ...(query ? { search: query } : {}),
        favoritesOnly: false,
        openedOnly: false,
        state: 'active',
        sort: 'updated_at',
        descending: true,
        limit: RESULTS + 1,
        offset: 0,
      }),
  });
  const documents = useQuery({
    queryKey: ['resource-picker', 'documents', query],
    placeholderData: keepPreviousData,
    queryFn: () =>
      listDocuments({
        ...(query ? { search: query } : {}),
        favoritesOnly: false,
        openedOnly: false,
        state: 'active',
        sort: 'updated_at',
        descending: true,
        limit: RESULTS + 1,
        offset: 0,
      }),
  });

  const offered = (kind: LinkKind, id: string) => !(exclude?.kind === kind && exclude.id === id);
  const noteResults = (notes.data?.items ?? [])
    .map((item) => item.note)
    .filter((note) => offered('note', note.id))
    .slice(0, RESULTS);
  const documentResults = (documents.data?.items ?? [])
    .map((item) => item.document)
    .filter((document) => offered('document', document.id))
    .slice(0, RESULTS);
  const loading = notes.isPending || documents.isPending;
  const empty = !loading && noteResults.length === 0 && documentResults.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <Input
        ref={inputRef}
        label={t('notes.linkPicker.search')}
        hideLabel
        icon={Search}
        type="search"
        placeholder={t('notes.linkPicker.searchPlaceholder')}
        value={search}
        autoComplete="off"
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      {hint ? <p className="text-xs text-fg-secondary">{hint}</p> : null}
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      ) : null}
      {empty ? <p className="text-sm text-fg-secondary">{t('notes.linkPicker.empty')}</p> : null}
      {[
        {
          kind: 'note' as const,
          label: t('notes.linkPicker.notes'),
          icon: NotebookText,
          items: noteResults.map((note) => ({
            id: note.id,
            title: note.title.trim() === '' ? t('notes.untitled') : note.title,
          })),
        },
        {
          kind: 'document' as const,
          label: t('notes.linkPicker.documents'),
          icon: FileText,
          items: documentResults.map((document) => ({
            id: document.id,
            title: document.title,
          })),
        },
      ]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.kind} aria-label={group.label} className="flex flex-col gap-1">
            <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {group.label}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ kind: group.kind, id: item.id, title: item.title });
                    }}
                    className="flex h-9 w-full cursor-default items-center gap-3 rounded-control px-2 text-left text-sm text-fg transition-colors duration-150 hover:bg-steel"
                  >
                    <group.icon
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-fg-secondary"
                    />
                    <span className="truncate">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
