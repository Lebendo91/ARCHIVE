import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ConfirmDialog, Dialog, DialogContent, Input, Select } from '@/components/ui';
import { useI18n } from '@/i18n';
import {
  moveDocument,
  purgeDocument,
  renameDocument,
  setDocumentTags,
  type Document,
} from '@/services/documents';
import { errorMessageKey } from '@/services/errors';
import { createTag, type Folder } from '@/services/library';
import {
  refreshLibraryViews,
  useDocument,
  useFolders,
  useTags,
  useWorkspaces,
} from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { useDocumentDialogs } from '@/stores/documentDialogs';
import { toast } from '@/stores/toasts';

interface DialogProps {
  open: boolean;
  document: Document;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

function useRefresh() {
  const client = useQueryClient();
  return () => refreshLibraryViews(client);
}

function RenameDialog({ open, document, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const formId = useId();
  const refresh = useRefresh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(document.title);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') {
      setError(t('library.rename.required'));
      inputRef.current?.focus();
      return;
    }
    if (trimmed === document.title) {
      onClose();
      return;
    }
    setPending(true);
    try {
      await renameDocument(document.id, trimmed);
      await refresh();
      toast.success(t('library.toasts.renamed'));
      onClose();
    } catch (failure) {
      toast.error(t(errorMessageKey(failure)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('library.rename.title')}
        size="sm"
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={pending}>
              {t('library.rename.submit')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <Input
            ref={inputRef}
            label={t('library.rename.label')}
            value={title}
            maxLength={500}
            autoComplete="off"
            error={error}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(undefined);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Folders in tree order, each with its depth, for an indented list. */
export function folderTree(folders: readonly Folder[]): { folder: Folder; depth: number }[] {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const ordered: { folder: Folder; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const siblings = (children.get(parentId) ?? []).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const folder of siblings) {
      ordered.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

function MoveDialog({ open, document, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const workspaces = useWorkspaces();
  const [workspaceId, setWorkspaceId] = useState(document.workspaceId ?? '');
  const [folderId, setFolderId] = useState(document.folderId ?? '');
  const folders = useFolders(workspaceId === '' ? undefined : workspaceId);
  const [pending, setPending] = useState(false);
  const options = (workspaces.data ?? []).filter(
    ({ workspace }) => !workspace.isArchived || workspace.id === document.workspaceId,
  );

  async function confirm() {
    setPending(true);
    try {
      await moveDocument(document.id, {
        workspaceId: workspaceId === '' ? null : workspaceId,
        folderId: workspaceId === '' || folderId === '' ? null : folderId,
      });
      await refresh();
      toast.success(t('library.toasts.moved'));
      onClose();
    } catch (failure) {
      toast.error(t(errorMessageKey(failure)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('library.move.title', { title: document.title })}
        size="sm"
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={pending} onClick={() => void confirm()}>
              {t('library.move.submit')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label={t('library.move.workspace')}
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setFolderId('');
            }}
          >
            <option value="">{t('library.filters.unassigned')}</option>
            {options.map(({ workspace }) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
          {workspaceId === '' ? null : (
            <Select
              label={t('library.move.folder')}
              value={folderId}
              onChange={(event) => {
                setFolderId(event.target.value);
              }}
            >
              <option value="">{t('library.move.root')}</option>
              {folderTree(folders.data ?? []).map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {`${' '.repeat(depth)}${folder.name}`}
                </option>
              ))}
            </Select>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagsDialog({ open, document, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const legendId = useId();
  const tags = useTags();
  const detail = useDocument(document.id);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [pending, setPending] = useState(false);
  const current = selected ?? new Set(detail.data?.tags.map((tag) => tag.id) ?? []);

  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  async function addTag() {
    const trimmed = name.trim();
    if (trimmed === '') {
      return;
    }
    try {
      const tag = await createTag(trimmed, 'neutral');
      await tags.refetch();
      setSelected(new Set([...current, tag.id]));
      setName('');
    } catch (failure) {
      setNameError(
        isCommandError(failure) && failure.code === 'name_taken'
          ? t('library.tagsDialog.nameTaken')
          : t(errorMessageKey(failure)),
      );
    }
  }

  async function save() {
    setPending(true);
    try {
      await setDocumentTags(document.id, [...current]);
      await refresh();
      toast.success(t('library.toasts.tagsSaved'));
      onClose();
    } catch (failure) {
      toast.error(t(errorMessageKey(failure)));
    } finally {
      setPending(false);
    }
  }

  const allTags = tags.data ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('library.tagsDialog.title', { title: document.title })}
        size="sm"
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={pending} onClick={() => void save()}>
              {t('library.tagsDialog.submit')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <fieldset aria-labelledby={legendId} className="flex flex-col gap-2">
            <legend id={legendId} className="sr-only">
              {t('library.tagsDialog.legend')}
            </legend>
            {allTags.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('library.tagsDialog.empty')}</p>
            ) : (
              allTags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-default items-center gap-3 text-sm text-fg"
                >
                  <input
                    type="checkbox"
                    checked={current.has(tag.id)}
                    onChange={() => {
                      toggle(tag.id);
                    }}
                    className="h-4 w-4 accent-blue"
                  />
                  {tag.name}
                </label>
              ))
            )}
          </fieldset>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addTag();
            }}
          >
            <Input
              className="flex-1"
              label={t('library.tagsDialog.newTag')}
              placeholder={t('library.tagsDialog.newTagPlaceholder')}
              value={name}
              maxLength={64}
              autoComplete="off"
              error={nameError}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(undefined);
              }}
            />
            <Button type="submit" icon={Plus} disabled={name.trim() === ''}>
              {t('library.tagsDialog.add')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PurgeDialog({ open, document, onClose }: Omit<DialogProps, 'onCloseAutoFocus'>) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pending, setPending] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
      title={t('library.purge.title', { title: document.title })}
      description={t('library.purge.description')}
      confirmLabel={t('library.purge.confirm')}
      loading={pending}
      onConfirm={() => {
        setPending(true);
        purgeDocument(document.id)
          .then(async () => {
            if (pathname === `/library/${document.id}`) {
              await navigate('/library?state=trashed');
            }
            await refresh();
            toast.success(t('library.toasts.purged', { title: document.title }));
            onClose();
          })
          .catch((failure: unknown) => {
            toast.error(t(errorMessageKey(failure)));
          })
          .finally(() => {
            setPending(false);
          });
      }}
    />
  );
}

function restoreFocus(event: Event) {
  event.preventDefault();
  const target = useDocumentDialogs.getState().returnFocus;
  (target?.isConnected && target !== document.body
    ? target
    : document.getElementById('main-content')
  )?.focus();
}

/** Document dialogs, rendered once by the application frame (see `stores/documentDialogs`). */
export function DocumentDialogs() {
  const dialog = useDocumentDialogs((state) => state.dialog);
  const isOpen = useDocumentDialogs((state) => state.isOpen);
  const sequence = useDocumentDialogs((state) => state.sequence);
  const close = useDocumentDialogs((state) => state.close);
  if (!dialog) {
    return null;
  }
  const props = { open: isOpen, document: dialog.document, onClose: close };
  switch (dialog.kind) {
    case 'rename':
      return <RenameDialog key={sequence} {...props} onCloseAutoFocus={restoreFocus} />;
    case 'move':
      return <MoveDialog key={sequence} {...props} onCloseAutoFocus={restoreFocus} />;
    case 'tags':
      return <TagsDialog key={sequence} {...props} onCloseAutoFocus={restoreFocus} />;
    case 'purge':
      return <PurgeDialog key={sequence} {...props} />;
  }
}
