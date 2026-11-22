import { useQueryClient } from '@tanstack/react-query';
import { EditorContent } from '@tiptap/react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  FileX,
  FolderInput,
  History,
  LoaderCircle,
  NotebookText,
  RotateCcw,
  Star,
  Tags,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { usePageTitle } from '@/app/router/pageTitle';
import { QueryError } from '@/components/feedback/QueryError';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  IconButton,
  SectionCard,
  Skeleton,
} from '@/components/ui';
import { formatDateTime, useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import {
  getNote,
  markNoteOpened,
  openExternalUrl,
  restoreNote,
  setNoteFavorite,
  type LinkedResource,
  type NoteDetail,
} from '@/services/notes';
import {
  queryKeys,
  refreshNoteViews,
  useFolders,
  useNote,
  useWorkspaces,
} from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { noteResource, useResourceDialogs } from '@/stores/resourceDialogs';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import { clearDraft, readDraft, type NoteDraft } from './drafts';
import { EditorToolbar } from './EditorToolbar';
import { LinkDialog, LinkPicker } from './LinkDialogs';
import { plainText } from './markdown';
import { NoteActionsMenu, useNoteTitle } from './noteActions';
import { isExternalUrl, parseArchiveHref } from './noteContent';
import { readNoteContent } from './readNoteContent';
import type { NewNoteState } from './useCreateNote';
import { useNoteAutosave, type SaveStatus } from './useNoteAutosave';
import { useNoteEditor } from './useNoteEditor';

const STATUS_ICONS = {
  saved: Check,
  dirty: History,
  saving: LoaderCircle,
  error: CircleAlert,
  conflict: AlertTriangle,
} as const;

/** Save state, always visible (spec §8.3); only failures interrupt a screen reader. */
function SaveIndicator({ status }: { status: SaveStatus }) {
  const { t } = useI18n();
  const Icon = STATUS_ICONS[status];
  const failed = status === 'error' || status === 'conflict';
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs',
        failed ? 'text-danger' : status === 'saved' ? 'text-fg-secondary' : 'text-fg-secondary',
      )}
    >
      <Icon
        size={14}
        aria-hidden="true"
        className={cn(status === 'saving' && 'animate-spin', status === 'saved' && 'text-success')}
      />
      {t(status === 'conflict' ? 'notes.save.error' : `notes.save.${status}`)}
    </span>
  );
}

function Banner({
  tone,
  children,
  actions,
}: {
  tone: 'warning' | 'danger' | 'info';
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 text-sm',
        tone === 'danger' && 'border-danger/40 bg-danger/10 text-fg',
        tone === 'warning' && 'border-warning/40 bg-warning/10 text-fg',
        tone === 'info' && 'border-line bg-graphite text-fg-secondary',
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {actions ? <span className="flex flex-wrap items-center gap-2">{actions}</span> : null}
    </div>
  );
}

function ResourceList({ items, empty }: { items: readonly LinkedResource[]; empty: string }) {
  const { t } = useI18n();
  const displayTitle = useNoteTitle();
  if (items.length === 0) {
    return <p className="text-sm text-fg-secondary">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.kind === 'note' ? NotebookText : FileText;
        const title = item.kind === 'note' ? displayTitle(item) : item.title;
        const path = item.kind === 'note' ? `/notes/${item.id}` : `/library/${item.id}`;
        return (
          <li key={`${item.kind}:${item.id}`} className="flex min-w-0 items-center gap-2 text-sm">
            <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-secondary" />
            {item.available ? (
              <Link to={path} className="min-w-0 truncate rounded-sm text-fg hover:text-blue">
                {title}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-fg-secondary">
                {title}
                <span className="sr-only">{` (${t('notes.details.inTrash')})`}</span>
              </span>
            )}
            {item.available ? null : <Badge>{t('notes.details.inTrash')}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

function NoteDetails({ detail }: { detail: NoteDetail }) {
  const { t, locale } = useI18n();
  const { note } = detail;
  const workspaces = useWorkspaces();
  const folders = useFolders(note.workspaceId ?? undefined);
  const openDialog = useResourceDialogs((state) => state.open);
  const editable = note.deletedAt === null;
  const workspace = workspaces.data?.find(
    (summary) => summary.workspace.id === note.workspaceId,
  )?.workspace;
  const folder = folders.data?.find((candidate) => candidate.id === note.folderId);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SectionCard
        title={t('notes.details.location')}
        actions={
          editable ? (
            <Button
              size="sm"
              icon={FolderInput}
              onClick={(event) => {
                openDialog('move', noteResource(note), event.currentTarget);
              }}
            >
              {t('notes.actions.move')}
            </Button>
          ) : undefined
        }
      >
        <p className="text-sm text-fg">
          {workspace ? workspace.name : t('library.filters.unassigned')}
        </p>
        {workspace ? (
          <p className="text-xs text-fg-secondary">
            {folder ? folder.name : t('library.detail.noFolder')}
          </p>
        ) : null}
        <dl className="mt-4 flex flex-col gap-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{t('notes.details.created')}</dt>
            <dd className="text-fg">{formatDateTime(new Date(note.createdAt), locale)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{t('notes.details.updated')}</dt>
            <dd className="text-fg">{formatDateTime(new Date(note.updatedAt), locale)}</dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard
        title={t('notes.details.tags')}
        actions={
          editable ? (
            <Button
              size="sm"
              icon={Tags}
              onClick={(event) => {
                openDialog('tags', noteResource(note), event.currentTarget);
              }}
            >
              {t('notes.actions.tags')}
            </Button>
          ) : undefined
        }
      >
        {detail.tags.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('notes.details.noTags')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {detail.tags.map((tag) => (
              <li key={tag.id}>
                <Badge>{tag.name}</Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title={t('notes.details.links')}>
        <ResourceList items={detail.links} empty={t('notes.details.noLinks')} />
      </SectionCard>
      <SectionCard title={t('notes.details.backlinks')}>
        <ResourceList items={detail.backlinks} empty={t('notes.details.noBacklinks')} />
      </SectionCard>
    </div>
  );
}

/** A draft from the last session, worth offering: same revision, different content. */
function recoverableDraft(detail: NoteDetail): NoteDraft | null {
  const draft = readDraft(detail.note.id);
  if (draft?.revision !== detail.note.revision || detail.note.deletedAt !== null) {
    return null;
  }
  const stored = JSON.stringify(readNoteContent(detail.note));
  return draft.title !== detail.note.title || JSON.stringify(draft.content) !== stored
    ? draft
    : null;
}

function NoteEditorView({ detail }: { detail: NoteDetail }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const titleId = useId();
  const { note } = detail;
  const inTrash = note.deletedAt !== null;
  const [title, setTitle] = useState(note.title);
  const [dialog, setDialog] = useState<'link' | 'picker' | null>(null);
  const [draft, setDraft] = useState(() => recoverableDraft(detail));
  const titleRef = useRef<HTMLInputElement>(null);
  const initialContent = useMemo(() => readNoteContent(note), [note]);
  const changed = useRef<() => void>(() => undefined);
  usePageTitle(title.trim() === '' ? t('notes.untitled') : title);

  const editor = useNoteEditor({
    content: initialContent,
    editable: !inTrash,
    placeholder: t('notes.editor.placeholder'),
    label: t('notes.editor.bodyLabel'),
    onChange: () => {
      changed.current();
    },
    onOpenLink: (href) => {
      const target = parseArchiveHref(href);
      if (target) {
        void navigate(target.kind === 'note' ? `/notes/${target.id}` : `/library/${target.id}`);
      } else if (isExternalUrl(href)) {
        openExternalUrl(href).catch(() => {
          toast.error(t('notes.links.openFailed'));
        });
      }
    },
  });

  const { status, saver } = useNoteAutosave({
    noteId: note.id,
    revision: note.revision,
    enabled: !inTrash,
    read: () => ({
      title: titleRef.current?.value ?? title,
      content: editor.getJSON(),
      text: plainText(editor),
    }),
    onSaved: () => {
      // The links and backlinks of the side panel, and the lists, follow the saved note.
      void client.invalidateQueries({ queryKey: queryKeys.notes });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard });
      void client.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
  useEffect(() => {
    changed.current = saver.changed;
  }, [saver]);

  // A note just created starts in its title.
  const created = (location.state as Partial<NewNoteState> | null)?.created === true;
  useEffect(() => {
    if (created) {
      titleRef.current?.focus();
    }
  }, [created]);

  const reloadStored = () => {
    getNote(note.id)
      .then((stored) => {
        editor.commands.setContent(readNoteContent(stored.note), { emitUpdate: false });
        setTitle(stored.note.title);
        saver.reset(stored.note.revision);
        void refreshNoteViews(client);
      })
      .catch((error: unknown) => {
        toast.error(t(errorMessageKey(error)));
      });
  };

  return (
    <div className="flex flex-col gap-4">
      {draft ? (
        <Banner
          tone="info"
          actions={
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  editor.commands.setContent(draft.content, { emitUpdate: false });
                  setTitle(draft.title);
                  setDraft(null);
                  saver.changed();
                }}
              >
                {t('notes.recovery.restore')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  clearDraft(note.id);
                  setDraft(null);
                }}
              >
                {t('notes.recovery.discard')}
              </Button>
            </>
          }
        >
          {t('notes.recovery.found')}
        </Banner>
      ) : null}
      {status === 'conflict' ? (
        <div role="alert">
          <Banner
            tone="warning"
            actions={
              <>
                <Button size="sm" onClick={reloadStored}>
                  {t('notes.save.reload')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    saver.keepMine().catch((error: unknown) => {
                      toast.error(t(errorMessageKey(error)));
                    });
                  }}
                >
                  {t('notes.save.keepMine')}
                </Button>
              </>
            }
          >
            {t('notes.save.conflict')}
          </Banner>
        </div>
      ) : null}
      {status === 'error' ? (
        <div role="alert">
          <Banner
            tone="danger"
            actions={
              <Button size="sm" icon={RotateCcw} onClick={saver.retry}>
                {t('notes.save.retry')}
              </Button>
            }
          >
            {t('notes.save.error')}
          </Banner>
        </div>
      ) : null}
      {inTrash ? (
        <Banner
          tone="info"
          actions={
            <Button
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                restoreNote(note.id)
                  .then(async () => {
                    await refreshNoteViews(client);
                    toast.success(
                      t('notes.toasts.restored', {
                        title: title.trim() === '' ? t('notes.untitled') : title,
                      }),
                    );
                  })
                  .catch((error: unknown) => {
                    toast.error(t(errorMessageKey(error)));
                  });
              }}
            >
              {t('notes.actions.restore')}
            </Button>
          }
        >
          {t('notes.editor.readOnly')}
        </Banner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SaveIndicator status={status} />
            {note.isArchived ? <Badge>{t('workspaces.archivedBadge')}</Badge> : null}
            <div className="ml-auto flex items-center gap-2">
              {inTrash ? null : (
                <IconButton
                  icon={Star}
                  label={t('library.favorite')}
                  variant="secondary"
                  aria-pressed={note.isFavorite}
                  className={cn(note.isFavorite && '[&_svg]:fill-amber [&_svg]:text-amber')}
                  onClick={() => {
                    setNoteFavorite(note.id, !note.isFavorite)
                      .then(async () => {
                        await refreshNoteViews(client);
                        toast.success(
                          t(
                            note.isFavorite ? 'notes.toasts.unfavorited' : 'notes.toasts.favorited',
                          ),
                        );
                      })
                      .catch((error: unknown) => {
                        toast.error(t(errorMessageKey(error)));
                      });
                  }}
                />
              )}
              <NoteActionsMenu
                note={{ ...note, title }}
                variant="secondary"
                exclude={['open', 'favorite', 'tags', 'move']}
              />
            </div>
          </div>
          <h2 id={titleId} className="sr-only">
            {title.trim() === '' ? t('notes.untitled') : title}
          </h2>
          <input
            ref={titleRef}
            aria-label={t('notes.editor.titleLabel')}
            placeholder={t('notes.untitled')}
            value={title}
            maxLength={500}
            readOnly={inTrash}
            onChange={(event) => {
              setTitle(event.target.value);
              saver.changed();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                editor.commands.focus('start');
              }
            }}
            className="w-full border-none bg-transparent font-display text-3xl font-semibold text-fg placeholder:text-fg-muted focus-visible:outline-none"
          />
          <EditorToolbar
            editor={editor}
            onLink={() => {
              setDialog('link');
            }}
            onInternalLink={() => {
              setDialog('picker');
            }}
          />
          <div className="rounded-card px-1 py-2 focus-within:ring-1 focus-within:ring-line">
            <EditorContent editor={editor} />
          </div>
        </section>
        <NoteDetails detail={{ ...detail, note: { ...note, title } }} />
      </div>

      {dialog === 'link' ? (
        <LinkDialog
          open
          editor={editor}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'picker' ? (
        <LinkPicker
          open
          editor={editor}
          noteId={note.id}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Editor of a note (spec §8): rich text, automatic saving, links, backlinks, tags and place. */
export function NotePage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const { noteId = '' } = useParams();
  const detail = useNote(noteId);
  const exists = detail.isSuccess;

  // Opening the page counts as opening the note (« Recently opened »), once per visit.
  useEffect(() => {
    if (!exists) {
      return;
    }
    markNoteOpened(noteId)
      .then(() =>
        Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.dashboard }),
          client.invalidateQueries({ queryKey: queryKeys.notePages }),
        ]),
      )
      .catch(() => undefined);
  }, [client, noteId, exists]);

  if (detail.isError) {
    const missing =
      isCommandError(detail.error) &&
      (detail.error.code === 'not_found' || detail.error.code === 'invalid_input');
    if (!missing) {
      return (
        <QueryError
          error={detail.error}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      );
    }
    return (
      <EmptyState
        icon={FileX}
        title={t('notes.detail.notFoundTitle')}
        description={t('notes.detail.notFoundDescription')}
        actions={
          <ButtonLink to="/notes" icon={ArrowLeft}>
            {t('notes.detail.back')}
          </ButtonLink>
        }
      />
    );
  }
  if (detail.isPending) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-10 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    );
  }
  // Keyed by note: each note gets its own editor, its own autosave and its own revision.
  return <NoteEditorView key={detail.data.note.id} detail={detail.data} />;
}
