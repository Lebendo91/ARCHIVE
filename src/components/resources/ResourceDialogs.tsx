import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ConfirmDialog, Dialog, DialogContent, Input, Select } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { moveDocument, purgeDocument, renameDocument, setDocumentTags } from '@/services/documents';
import { errorMessageKey } from '@/services/errors';
import { createTag } from '@/services/library';
import { moveNote, purgeNote, renameNote, setNoteTags } from '@/services/notes';
import {
  refreshLibraryViews,
  useDocument,
  useFolders,
  useNote,
  useTags,
  useWorkspaces,
} from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { useResourceDialogs, type DialogResource } from '@/stores/resourceDialogs';
import { toast } from '@/stores/toasts';
import { folderOptionLabel, folderTree } from './folderTree';

/** What differs between a document and a note in the shared dialogs: operations, wording, addresses. */
const RESOURCES = {
  document: {
    rename: renameDocument,
    move: moveDocument,
    setTags: setDocumentTags,
    purge: purgeDocument,
    renameTitle: 'library.rename.title',
    tagsLegend: 'library.tagsDialog.legend',
    renamed: 'library.toasts.renamed',
    moved: 'library.toasts.moved',
    purgeDescription: 'library.purge.description',
    purged: 'library.toasts.purged',
    path: (id: string) => `/library/${id}`,
    trashPath: '/library?state=trashed',
  },
  note: {
    rename: renameNote,
    move: moveNote,
    setTags: setNoteTags,
    purge: purgeNote,
    renameTitle: 'notes.rename.title',
    tagsLegend: 'notes.tagsLegend',
    renamed: 'notes.toasts.renamed',
    moved: 'notes.toasts.moved',
    purgeDescription: 'notes.purge.description',
    purged: 'notes.toasts.purged',
    path: (id: string) => `/notes/${id}`,
    trashPath: '/notes?state=trashed',
  },
} as const satisfies Record<
  DialogResource['type'],
  {
    renameTitle: MessageKey;
    tagsLegend: MessageKey;
    renamed: MessageKey;
    moved: MessageKey;
    purgeDescription: MessageKey;
    purged: MessageKey;
  } & Record<string, unknown>
>;

interface DialogProps {
  open: boolean;
  resource: DialogResource;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** The title shown for a resource: an untitled note is named as such. */
function useDisplayTitle(resource: DialogResource): string {
  const { t } = useI18n();
  return resource.title.trim() === '' ? t('notes.untitled') : resource.title;
}

function useRefresh() {
  const client = useQueryClient();
  return () => refreshLibraryViews(client);
}

function RenameDialog({ open, resource, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const formId = useId();
  const refresh = useRefresh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(resource.title);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const kind = RESOURCES[resource.type];

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '') {
      setError(t('library.rename.required'));
      inputRef.current?.focus();
      return;
    }
    if (trimmed === resource.title) {
      onClose();
      return;
    }
    setPending(true);
    try {
      await kind.rename(resource.id, trimmed);
      await refresh();
      toast.success(t(kind.renamed));
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
        title={t(kind.renameTitle)}
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

function MoveDialog({ open, resource, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const workspaces = useWorkspaces();
  const displayTitle = useDisplayTitle(resource);
  const [workspaceId, setWorkspaceId] = useState(resource.workspaceId ?? '');
  const [folderId, setFolderId] = useState(resource.folderId ?? '');
  const folders = useFolders(workspaceId === '' ? undefined : workspaceId);
  const [pending, setPending] = useState(false);
  const kind = RESOURCES[resource.type];
  const options = (workspaces.data ?? []).filter(
    ({ workspace }) => !workspace.isArchived || workspace.id === resource.workspaceId,
  );

  async function confirm() {
    setPending(true);
    try {
      await kind.move(resource.id, {
        workspaceId: workspaceId === '' ? null : workspaceId,
        folderId: workspaceId === '' || folderId === '' ? null : folderId,
      });
      await refresh();
      toast.success(t(kind.moved));
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
        title={t('library.move.title', { title: displayTitle })}
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
                  {folderOptionLabel(folder.name, depth)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagsDialog({ open, resource, onClose, onCloseAutoFocus }: DialogProps) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const legendId = useId();
  const tags = useTags();
  const displayTitle = useDisplayTitle(resource);
  const document = useDocument(resource.id, { enabled: resource.type === 'document' });
  const note = useNote(resource.id, { enabled: resource.type === 'note' });
  const stored = resource.type === 'document' ? document.data?.tags : note.data?.tags;
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [pending, setPending] = useState(false);
  const current = selected ?? new Set(stored?.map((tag) => tag.id) ?? []);

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
      await RESOURCES[resource.type].setTags(resource.id, [...current]);
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
        title={t('library.tagsDialog.title', { title: displayTitle })}
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
              {t(RESOURCES[resource.type].tagsLegend)}
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

function PurgeDialog({ open, resource, onClose }: Omit<DialogProps, 'onCloseAutoFocus'>) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const displayTitle = useDisplayTitle(resource);
  const [pending, setPending] = useState(false);
  const kind = RESOURCES[resource.type];
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          onClose();
        }
      }}
      title={t('library.purge.title', { title: displayTitle })}
      description={t(kind.purgeDescription)}
      confirmLabel={t('library.purge.confirm')}
      loading={pending}
      onConfirm={() => {
        setPending(true);
        kind
          .purge(resource.id)
          .then(async () => {
            if (pathname === kind.path(resource.id)) {
              await navigate(kind.trashPath);
            }
            await refresh();
            toast.success(t(kind.purged, { title: displayTitle }));
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
  const target = useResourceDialogs.getState().returnFocus;
  (target?.isConnected && target !== document.body
    ? target
    : document.getElementById('main-content')
  )?.focus();
}

/** Dialogs of documents and notes, rendered once by the application frame (see `stores/resourceDialogs`). */
export function ResourceDialogs() {
  const dialog = useResourceDialogs((state) => state.dialog);
  const isOpen = useResourceDialogs((state) => state.isOpen);
  const sequence = useResourceDialogs((state) => state.sequence);
  const close = useResourceDialogs((state) => state.close);
  if (!dialog) {
    return null;
  }
  const props = { open: isOpen, resource: dialog.resource, onClose: close };
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
