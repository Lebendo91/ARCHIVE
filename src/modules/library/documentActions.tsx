import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Download,
  Ellipsis,
  ExternalLink,
  FolderInput,
  FolderOpen,
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
import {
  exportDocument,
  openDocumentExternally,
  restoreDocument,
  revealDocument,
  setDocumentArchived,
  setDocumentFavorite,
  trashDocument,
  type Document,
} from '@/services/documents';
import { errorMessageKey } from '@/services/errors';
import { refreshLibraryViews } from '@/services/queries';
import { useDocumentDialogs } from '@/stores/documentDialogs';
import { toast } from '@/stores/toasts';

interface ActionItem {
  id: string;
  icon: LucideIcon;
  labelKey: MessageKey;
  danger?: boolean;
  run: (returnFocus: HTMLElement | null) => void;
}

/**
 * Operations on a document (spec §7.5). Each reports its outcome, even when the item that triggered it
 * leaves the screen (a document moved to the trash disappears from the list).
 */
export function useDocumentActions() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const openDialog = useDocumentDialogs((state) => state.open);

  const perform = <T,>(operation: () => Promise<T>, success?: (result: T) => string) => {
    operation().then(
      async (result) => {
        await refreshLibraryViews(client);
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

  /** Actions offered for `document`, in menu order; `null` separates groups. */
  const itemsFor = (document: Document): (ActionItem | null)[] => {
    const title = document.title;
    if (document.deletedAt !== null) {
      return [
        {
          id: 'restore',
          icon: RotateCcw,
          labelKey: 'library.actions.restore',
          run: () => {
            perform(
              () => restoreDocument(document.id),
              () => t('library.toasts.restored', { title }),
            );
          },
        },
        null,
        {
          id: 'purge',
          icon: Trash2,
          labelKey: 'library.actions.purge',
          danger: true,
          run: (returnFocus) => {
            openDialog('purge', document, returnFocus);
          },
        },
      ];
    }
    return [
      {
        id: 'open',
        icon: FolderOpen,
        labelKey: 'library.actions.open',
        run: () => {
          void navigate(`/library/${document.id}`);
        },
      },
      {
        id: 'open-external',
        icon: ExternalLink,
        labelKey: 'library.actions.openExternal',
        run: () => {
          perform(() => openDocumentExternally(document.id));
        },
      },
      {
        id: 'reveal',
        icon: FolderInput,
        labelKey: 'library.actions.reveal',
        run: () => {
          perform(() => revealDocument(document.id));
        },
      },
      {
        id: 'export',
        icon: Download,
        labelKey: 'library.actions.export',
        run: () => {
          perform(
            () => exportDocument(document.id),
            (saved) => (saved ? t('library.toasts.exported') : ''),
          );
        },
      },
      null,
      {
        id: 'rename',
        icon: Pencil,
        labelKey: 'library.actions.rename',
        run: (returnFocus) => {
          openDialog('rename', document, returnFocus);
        },
      },
      {
        id: 'move',
        icon: FolderInput,
        labelKey: 'library.actions.move',
        run: (returnFocus) => {
          openDialog('move', document, returnFocus);
        },
      },
      {
        id: 'tags',
        icon: Tags,
        labelKey: 'library.actions.tags',
        run: (returnFocus) => {
          openDialog('tags', document, returnFocus);
        },
      },
      {
        id: 'favorite',
        icon: document.isFavorite ? StarOff : Star,
        labelKey: document.isFavorite ? 'library.actions.unfavorite' : 'library.actions.favorite',
        run: () => {
          perform(
            () => setDocumentFavorite(document.id, !document.isFavorite),
            () =>
              t(document.isFavorite ? 'library.toasts.unfavorited' : 'library.toasts.favorited'),
          );
        },
      },
      {
        id: 'archive',
        icon: document.isArchived ? ArchiveRestore : Archive,
        labelKey: document.isArchived ? 'library.actions.unarchive' : 'library.actions.archive',
        run: () => {
          perform(
            () => setDocumentArchived(document.id, !document.isArchived),
            () =>
              t(document.isArchived ? 'library.toasts.unarchived' : 'library.toasts.archived', {
                title,
              }),
          );
        },
      },
      null,
      {
        id: 'trash',
        icon: Trash2,
        labelKey: 'library.actions.trash',
        danger: true,
        run: () => {
          perform(
            () => trashDocument(document.id),
            () => t('library.toasts.trashed', { title }),
          );
        },
      },
    ];
  };

  return { itemsFor };
}

const DANGER_CLASSES = 'text-danger data-[highlighted]:text-danger';

/** The « … » menu of a document. */
export function DocumentActionsMenu({
  document,
  variant = 'ghost',
  exclude = [],
}: {
  document: Document;
  variant?: 'ghost' | 'secondary';
  /** Actions already offered as buttons next to the menu. */
  exclude?: readonly string[];
}) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { itemsFor } = useDocumentActions();
  const label = t('library.actions.menu', { title: document.title });
  const items = itemsFor(document).filter((item) => item === null || !exclude.includes(item.id));
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

/** Right click (or the context-menu key) on a document opens the same actions as its « … » menu. */
export function DocumentContextMenu({
  document,
  children,
}: {
  document: Document;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { itemsFor } = useDocumentActions();
  const items = itemsFor(document);
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
