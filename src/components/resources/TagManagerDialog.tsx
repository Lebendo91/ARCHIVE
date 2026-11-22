import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject, type SubmitEvent } from 'react';
import { Button, Dialog, DialogContent, IconButton, Input, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { deleteTag, renameTag, tagUsage, type TagUsage } from '@/services/library';
import { refreshLibraryViews } from '@/services/queries';
import { isCommandError } from '@/services/tauri';

const USAGE_KEY = ['tags', 'usage'] as const;

type RowMode = 'view' | 'rename' | 'delete';

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

function TagRow({
  usage,
  onChanged,
  onDeleted,
  onFeedback,
}: {
  usage: TagUsage;
  onChanged: () => Promise<void>;
  /** The row is about to leave the list: focus has to go elsewhere. */
  onDeleted: () => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t, tCount } = useI18n();
  const [mode, setModeState] = useState<RowMode>('view');
  const [name, setName] = useState(usage.tag.name);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const total = usage.documents + usage.notes;
  // Back in view, focus returns to the button whose form replaced it.
  const renameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<RowMode | null>(null);
  const setMode = (next: RowMode) => {
    returnFocus.current = next === 'view' ? mode : null;
    setModeState(next);
  };
  useEffect(() => {
    if (mode === 'view' && returnFocus.current) {
      (returnFocus.current === 'rename' ? renameRef : deleteRef).current?.focus();
      returnFocus.current = null;
    }
  }, [mode]);

  async function rename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('library.folders.nameRequired'));
      return;
    }
    if (trimmed === usage.tag.name) {
      setMode('view');
      return;
    }
    setPending(true);
    try {
      await renameTag(usage.tag.id, trimmed);
      await onChanged();
      onFeedback({ tone: 'success', message: t('library.tagManager.renamed') });
      setMode('view');
    } catch (failure) {
      setError(
        isCommandError(failure) && failure.code === 'name_taken'
          ? t('library.tagsDialog.nameTaken')
          : t(errorMessageKey(failure)),
      );
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      await deleteTag(usage.tag.id);
      onDeleted();
      await onChanged();
      onFeedback({
        tone: 'success',
        message: t('library.tagManager.deleted', { name: usage.tag.name }),
      });
    } catch (failure) {
      onFeedback({ tone: 'error', message: t(errorMessageKey(failure)) });
      setPending(false);
    }
  }

  if (mode === 'rename') {
    return (
      <li className="py-2">
        <form
          className="flex items-start gap-2"
          noValidate
          onSubmit={(event) => void rename(event)}
        >
          <Input
            className="flex-1"
            label={t('library.tagManager.nameLabel', { name: usage.tag.name })}
            hideLabel
            value={name}
            maxLength={64}
            autoComplete="off"
            autoFocus
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
          <Button
            onClick={() => {
              setName(usage.tag.name);
              setError(undefined);
              setMode('view');
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {t('library.tagManager.save')}
          </Button>
        </form>
      </li>
    );
  }
  if (mode === 'delete') {
    return (
      <li className="flex flex-col gap-3 rounded-control border border-danger/40 bg-danger/10 p-3">
        <p className="text-sm font-medium text-fg">
          {t('library.tagManager.deleteTitle', { name: usage.tag.name })}
        </p>
        <p className="text-sm text-fg-secondary">
          {total === 0
            ? t('library.tagManager.deleteUnused')
            : tCount('library.tagManager.deleteDescription', total)}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            autoFocus
            onClick={() => {
              setMode('view');
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={pending} onClick={() => void remove()}>
            {t('library.tagManager.deleteConfirm')}
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg">{usage.tag.name}</span>
        <span className="text-xs text-fg-secondary">
          {`${tCount('library.count', usage.documents)} · ${tCount('notes.count', usage.notes)}`}
        </span>
      </div>
      <IconButton
        ref={renameRef}
        icon={Pencil}
        size="sm"
        label={t('library.tagManager.rename', { name: usage.tag.name })}
        onClick={() => {
          setMode('rename');
        }}
      />
      <IconButton
        ref={deleteRef}
        icon={Trash2}
        size="sm"
        label={t('library.tagManager.delete', { name: usage.tag.name })}
        onClick={() => {
          setMode('delete');
        }}
      />
    </li>
  );
}

/**
 * Tags shared by documents and notes: renamed everywhere at once, or deleted after a confirmation that says
 * how many items lose them. Nothing tagged is ever deleted with its tag.
 */
export function TagManagerDialog({
  open,
  onClose,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  /** Control focused again when the dialog closes (the dialog has no trigger of its own). */
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const usage = useQuery({ queryKey: USAGE_KEY, queryFn: tagUsage, enabled: open });
  const onChanged = async () => {
    await Promise.all([
      refreshLibraryViews(client),
      client.invalidateQueries({ queryKey: USAGE_KEY }),
    ]);
  };
  // After a deletion, focus goes to the tag that takes its place (or the last one), else to the dialog.
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusAfterDeletion = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    const index = focusAfterDeletion.current;
    if (index === null || !usage.data) {
      return;
    }
    focusAfterDeletion.current = null;
    const rows = bodyRef.current?.querySelectorAll<HTMLElement>('li') ?? [];
    const row = rows.length > 0 ? rows[Math.min(index, rows.length - 1)] : undefined;
    (
      row?.querySelector<HTMLElement>('button') ??
      bodyRef.current?.closest<HTMLElement>('[role="dialog"]')
    )?.focus();
  }, [usage.data]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFeedback(null);
          onClose();
        }
      }}
    >
      <DialogContent
        title={t('library.tagManager.title')}
        description={t('library.tagManager.description')}
        size="md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus?.current;
          (target?.isConnected ? target : document.getElementById('main-content'))?.focus();
        }}
      >
        <div ref={bodyRef}>
          {usage.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner size={20} />
            </div>
          ) : (usage.data ?? []).length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('library.tagManager.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-subtle">
              {(usage.data ?? []).map((entry, index) => (
                <TagRow
                  key={entry.tag.id}
                  usage={entry}
                  onChanged={onChanged}
                  onDeleted={() => {
                    focusAfterDeletion.current = index;
                  }}
                  onFeedback={setFeedback}
                />
              ))}
            </ul>
          )}
          {/* Live regions, present before their message so that it is announced. */}
          <div className="mt-3 min-h-5 text-sm">
            <p role="status" className="text-fg-secondary">
              {feedback?.tone === 'success' ? feedback.message : null}
            </p>
            <p role="alert" className="text-danger">
              {feedback?.tone === 'error' ? feedback.message : null}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
