import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Ellipsis,
  FileDown,
  FolderInput,
  NotebookPen,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Tags,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import {
  duplicateNote,
  exportNoteMarkdown,
  getNote,
  restoreNote,
  setNoteArchived,
  setNoteFavorite,
  trashNote,
  type Note,
  type NoteSummary,
} from '@/services/notes';
import { refreshNoteViews } from '@/services/queries';
import { noteResource, useResourceDialogs } from '@/stores/resourceDialogs';
import { toast } from '@/stores/toasts';
import { noteToMarkdown } from './markdown';
import { readNoteContent } from './readNoteContent';

interface ActionItem {
  id: string;
  icon: LucideIcon;
  labelKey: MessageKey;
  danger?: boolean;
  run: (returnFocus: HTMLElement | null) => void;
}

type NoteLike = Note | NoteSummary;

/** Title of a note as shown to the user: an untitled note says so. */
export function useNoteTitle(): (note: Pick<NoteSummary, 'title'>) => string {
  const { t } = useI18n();
  return (note) => (note.title.trim() === '' ? t('notes.untitled') : note.title);
}

/** Writes a note as a Markdown file where the user chooses (spec §8.5). */
export async function exportMarkdown(id: string): Promise<boolean> {
  const { note } = await getNote(id);
  return exportNoteMarkdown(id, noteToMarkdown(readNoteContent(note)));
}

/** Operations on a note (spec §8.2). Each reports its outcome, even when the note leaves the screen. */
export function useNoteActions() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const displayTitle = useNoteTitle();
  const openDialog = useResourceDialogs((state) => state.open);

  const perform = <T,>(operation: () => Promise<T>, success?: (result: T) => string) => {
    operation().then(
      async (result) => {
        await refreshNoteViews(client);
        const message = success?.(result);
        if (message) {
          toast.success(message);
        }
      },
      (error: unknown) => {
        toast.error(t(errorMessageKey(error)));
      },
    );
  };

  /** Actions offered for `note`, in menu order; `null` separates groups. */
  const itemsFor = (note: NoteLike): (ActionItem | null)[] => {
    const title = displayTitle(note);
    if (note.deletedAt !== null) {
      return [
        {
          id: 'restore',
          icon: RotateCcw,
          labelKey: 'notes.actions.restore',
          run: () => {
            perform(
              () => restoreNote(note.id),
              () => t('notes.toasts.restored', { title }),
            );
          },
        },
        null,
        {
          id: 'purge',
          icon: Trash2,
          labelKey: 'notes.actions.purge',
          danger: true,
          run: (returnFocus) => {
            openDialog('purge', noteResource(note), returnFocus);
          },
        },
      ];
    }
    return [
      {
        id: 'open',
        icon: NotebookPen,
        labelKey: 'notes.actions.open',
        run: () => {
          void navigate(`/notes/${note.id}`);
        },
      },
      {
        id: 'duplicate',
        icon: Copy,
        labelKey: 'notes.actions.duplicate',
        run: () => {
          perform(
            () => duplicateNote(note.id, t('notes.copyTitle', { title })),
            () => t('notes.toasts.duplicated'),
          );
        },
      },
      {
        id: 'export',
        icon: FileDown,
        labelKey: 'notes.actions.exportMarkdown',
        run: () => {
          perform(
            () => exportMarkdown(note.id),
            (saved) => (saved ? t('notes.toasts.exported') : ''),
          );
        },
      },
      null,
      {
        id: 'rename',
        icon: Pencil,
        labelKey: 'notes.actions.rename',
        run: (returnFocus) => {
          openDialog('rename', noteResource(note), returnFocus);
        },
      },
      {
        id: 'move',
        icon: FolderInput,
        labelKey: 'notes.actions.move',
        run: (returnFocus) => {
          openDialog('move', noteResource(note), returnFocus);
        },
      },
      {
        id: 'tags',
        icon: Tags,
        labelKey: 'notes.actions.tags',
        run: (returnFocus) => {
          openDialog('tags', noteResource(note), returnFocus);
        },
      },
      {
        id: 'favorite',
        icon: note.isFavorite ? StarOff : Star,
        labelKey: note.isFavorite ? 'notes.actions.unfavorite' : 'notes.actions.favorite',
        run: () => {
          perform(
            () => setNoteFavorite(note.id, !note.isFavorite),
            () => t(note.isFavorite ? 'notes.toasts.unfavorited' : 'notes.toasts.favorited'),
          );
        },
      },
      {
        id: 'archive',
        icon: note.isArchived ? ArchiveRestore : Archive,
        labelKey: note.isArchived ? 'notes.actions.unarchive' : 'notes.actions.archive',
        run: () => {
          perform(
            () => setNoteArchived(note.id, !note.isArchived),
            () =>
              t(note.isArchived ? 'notes.toasts.unarchived' : 'notes.toasts.archived', { title }),
          );
        },
      },
      null,
      {
        id: 'trash',
        icon: Trash2,
        labelKey: 'notes.actions.trash',
        danger: true,
        run: () => {
          perform(
            () => trashNote(note.id),
            () => t('notes.toasts.trashed', { title }),
          );
        },
      },
    ];
  };

  return { itemsFor };
}

const DANGER_CLASSES = 'text-danger data-[highlighted]:text-danger';

/** The « … » menu of a note. */
export function NoteActionsMenu({
  note,
  variant = 'ghost',
  exclude = [],
}: {
  note: NoteLike;
  variant?: 'ghost' | 'secondary';
  /** Actions already offered as buttons next to the menu. */
  exclude?: readonly string[];
}) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { itemsFor } = useNoteActions();
  const displayTitle = useNoteTitle();
  const label = t('notes.actions.menu', { title: displayTitle(note) });
  const items = itemsFor(note).filter((item) => item === null || !exclude.includes(item.id));
  return (
    <DropdownMenu>
      <Tooltip content={label} side="bottom">
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            icon={Ellipsis}
            label={label}
            variant={variant}
            tooltip={false}
          />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        {items.map((item, index) =>
          item === null ? (
            index === 0 || items[index - 1] === null ? null : (
              <DropdownMenuSeparator key={`separator-${String(index)}`} />
            )
          ) : (
            <DropdownMenuItem
              key={item.id}
              icon={item.icon}
              className={item.danger ? DANGER_CLASSES : undefined}
              onSelect={() => {
                item.run(triggerRef.current);
              }}
            >
              {t(item.labelKey)}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Right click (or the context-menu key) on a note opens the same actions as its « … » menu. */
export function NoteContextMenu({ note, children }: { note: NoteLike; children: ReactNode }) {
  const { t } = useI18n();
  const { itemsFor } = useNoteActions();
  const items = itemsFor(note);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((item, index) =>
          item === null ? (
            <ContextMenuSeparator key={`separator-${String(index)}`} />
          ) : (
            <ContextMenuItem
              key={item.id}
              icon={item.icon}
              className={item.danger ? DANGER_CLASSES : undefined}
              onSelect={() => {
                item.run(null);
              }}
            >
              {t(item.labelKey)}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
