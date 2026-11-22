import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { FileText, NotebookText, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { Button, Dialog, DialogContent, Input, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { listDocuments } from '@/services/documents';
import { listNotes, type LinkKind } from '@/services/notes';
import { archiveHref, isAllowedHref } from './noteContent';

interface LinkDialogProps {
  open: boolean;
  editor: Editor;
  onClose: () => void;
}

/** Web or e-mail link on the selection (or on the link under the cursor), checked before it is applied. */
export function LinkDialog({ open, editor, onClose }: LinkDialogProps) {
  const { t } = useI18n();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const current = editor.getAttributes('link').href as unknown;
  const [href, setHref] = useState(typeof current === 'string' ? current : '');
  const [error, setError] = useState<string>();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = href.trim();
    if (!isAllowedHref(value)) {
      setError(t('notes.linkDialog.invalid'));
      inputRef.current?.focus();
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] },
          { type: 'text', text: ' ' },
        ])
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('notes.linkDialog.title')}
        size="sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        footer={
          <>
            {typeof current === 'string' ? (
              <Button
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  onClose();
                }}
              >
                {t('notes.linkDialog.remove')}
              </Button>
            ) : null}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" form={formId} variant="primary">
              {t('notes.linkDialog.submit')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={submit}>
          <Input
            ref={inputRef}
            label={t('notes.linkDialog.url')}
            hint={t('notes.linkDialog.hint')}
            value={href}
            type="url"
            autoComplete="off"
            spellCheck={false}
            error={error}
            onChange={(event) => {
              setHref(event.target.value);
              setError(undefined);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LinkPickerProps extends LinkDialogProps {
  /** The note being edited: it does not link to itself. */
  noteId: string;
}

const RESULTS = 8;

/** Link to a note or a document of ARCHIVE, found by its title (spec §8.2 and §8.4). */
export function LinkPicker({ open, editor, noteId, onClose }: LinkPickerProps) {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
    }, 200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  const notes = useQuery({
    queryKey: ['link-picker', 'notes', query],
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
    queryKey: ['link-picker', 'documents', query],
    queryFn: () =>
      listDocuments({
        ...(query ? { search: query } : {}),
        favoritesOnly: false,
        openedOnly: false,
        state: 'active',
        sort: 'updated_at',
        descending: true,
        limit: RESULTS,
        offset: 0,
      }),
  });

  const insert = (kind: LinkKind, id: string, title: string) => {
    const href = archiveHref(kind, id);
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'text', text: title, marks: [{ type: 'link', attrs: { href } }] },
          { type: 'text', text: ' ' },
        ])
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    onClose();
  };

  const noteResults = (notes.data?.items ?? [])
    .map((item) => item.note)
    .filter((note) => note.id !== noteId)
    .slice(0, RESULTS);
  const documentResults = (documents.data?.items ?? []).map((item) => item.document);
  const loading = notes.isPending || documents.isPending;
  const empty = !loading && noteResults.length === 0 && documentResults.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('notes.linkPicker.title')}
        size="md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            ref={searchRef}
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
          <p className="text-xs text-fg-secondary">{t('notes.linkPicker.hint')}</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          ) : null}
          {empty ? (
            <p className="text-sm text-fg-secondary">{t('notes.linkPicker.empty')}</p>
          ) : null}
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
                          insert(group.kind, item.id, item.title);
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
      </DialogContent>
    </Dialog>
  );
}
