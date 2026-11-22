import { useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  Folder as FolderIcon,
  FolderPlus,
  FolderTree,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Tooltip,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { createFolder, deleteFolder, renameFolder, type Folder } from '@/services/library';
import { refreshLibraryViews, useFolders } from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import { folderTree } from './DocumentDialogs';

type FolderDialog =
  | { kind: 'create'; parent: Folder | null }
  | { kind: 'rename'; folder: Folder }
  | { kind: 'delete'; folder: Folder };

function FolderNameDialog({
  workspaceId,
  dialog,
  onClose,
}: {
  workspaceId: string;
  dialog: Extract<FolderDialog, { kind: 'create' | 'rename' }>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(dialog.kind === 'rename' ? dialog.folder.name : '');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('library.folders.nameRequired'));
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    try {
      if (dialog.kind === 'create') {
        const folder = await createFolder(workspaceId, dialog.parent?.id ?? null, trimmed);
        toast.success(t('library.folders.created', { name: folder.name }));
      } else {
        await renameFolder(dialog.folder.id, trimmed);
        toast.success(t('library.folders.renamed'));
      }
      await refreshLibraryViews(client);
      onClose();
    } catch (failure) {
      if (isCommandError(failure) && failure.code === 'name_taken') {
        setError(t('library.folders.nameTaken'));
        inputRef.current?.focus();
      } else {
        toast.error(t(errorMessageKey(failure)));
      }
    } finally {
      setPending(false);
    }
  }

  const title =
    dialog.kind === 'rename'
      ? t('library.folders.renameTitle')
      : dialog.parent
        ? t('library.folders.createSubTitle', { name: dialog.parent.name })
        : t('library.folders.createTitle');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={title}
        size="sm"
        footer={
          <>
            <Button disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={pending}>
              {dialog.kind === 'rename'
                ? t('library.folders.submitRename')
                : t('library.folders.submitCreate')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <Input
            ref={inputRef}
            label={t('library.folders.nameLabel')}
            value={name}
            maxLength={120}
            autoComplete="off"
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FolderMenu({
  folder,
  onAction,
}: {
  folder: Folder;
  onAction: (dialog: FolderDialog) => void;
}) {
  const { t } = useI18n();
  const label = t('library.folders.menu', { name: folder.name });
  return (
    <DropdownMenu>
      <Tooltip content={label} side="right">
        <DropdownMenuTrigger asChild>
          <IconButton icon={Ellipsis} label={label} size="sm" tooltip={false} />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          icon={FolderPlus}
          onSelect={() => {
            onAction({ kind: 'create', parent: folder });
          }}
        >
          {t('library.folders.createSub')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={Pencil}
          onSelect={() => {
            onAction({ kind: 'rename', folder });
          }}
        >
          {t('library.folders.rename')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Trash2}
          className="text-danger data-[highlighted]:text-danger"
          onSelect={() => {
            onAction({ kind: 'delete', folder });
          }}
        >
          {t('library.folders.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderButton({
  label,
  depth,
  selected,
  onSelect,
}: {
  label: string;
  depth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      style={{ paddingLeft: `${String(12 + depth * 16)}px` }}
      className={cn(
        'flex h-8 min-w-0 flex-1 cursor-default items-center gap-2 rounded-control pr-2 text-left text-sm transition-colors duration-150',
        selected ? 'bg-steel text-fg' : 'text-fg-secondary hover:bg-steel/60 hover:text-fg',
      )}
    >
      <FolderIcon size={16} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Folders of the selected workspace (spec §7.3 folder navigation, Phase 4 folder management): selecting one
 * filters the documents; folders are created, renamed, and deleted only when empty.
 */
export function FolderPanel({
  workspaceId,
  selectedFolderId,
  onSelect,
}: {
  workspaceId: string;
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const titleId = useId();
  const folders = useFolders(workspaceId);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setDialog(null);
  };
  const tree = folderTree(folders.data ?? []);

  return (
    <nav aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          id={titleId}
          className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
        >
          {t('library.folders.title')}
        </h2>
        <IconButton
          icon={FolderPlus}
          label={t('library.folders.create')}
          size="sm"
          onClick={() => {
            setDialog({ kind: 'create', parent: null });
          }}
        />
      </div>
      <ul className="flex flex-col gap-1">
        <li className="flex">
          <FolderButton
            label={t('library.folders.all')}
            depth={0}
            selected={selectedFolderId === null}
            onSelect={() => {
              onSelect(null);
            }}
          />
        </li>
        {tree.map(({ folder, depth }) => (
          <li key={folder.id} className="group flex items-center gap-1">
            <FolderButton
              label={folder.name}
              depth={depth}
              selected={selectedFolderId === folder.id}
              onSelect={() => {
                onSelect(folder.id);
              }}
            />
            <FolderMenu folder={folder} onAction={setDialog} />
          </li>
        ))}
      </ul>
      {folders.isSuccess && tree.length === 0 ? (
        <p className="flex items-center gap-2 px-3 text-xs text-fg-secondary">
          <FolderTree size={14} aria-hidden="true" />
          {t('library.folders.empty')}
        </p>
      ) : null}

      {dialog && dialog.kind !== 'delete' ? (
        <FolderNameDialog workspaceId={workspaceId} dialog={dialog} onClose={close} />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !deleting) {
              close();
            }
          }}
          title={t('library.folders.deleteTitle', { name: dialog.folder.name })}
          description={t('library.folders.deleteDescription')}
          confirmLabel={t('library.folders.deleteConfirm')}
          loading={deleting}
          onConfirm={() => {
            setDeleting(true);
            const { folder } = dialog;
            deleteFolder(folder.id)
              .then(async () => {
                if (selectedFolderId === folder.id) {
                  onSelect(null);
                }
                await refreshLibraryViews(client);
                toast.success(t('library.folders.deleted', { name: folder.name }));
                close();
              })
              .catch((failure: unknown) => {
                toast.error(
                  isCommandError(failure) && failure.code === 'in_use'
                    ? t('library.folders.notEmpty')
                    : t(errorMessageKey(failure)),
                );
                close();
              })
              .finally(() => {
                setDeleting(false);
              });
          }}
        />
      ) : null}
    </nav>
  );
}
