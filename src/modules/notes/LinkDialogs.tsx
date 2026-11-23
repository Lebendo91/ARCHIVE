import type { Editor } from '@tiptap/core';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { ResourcePicker, type PickedResource } from '@/components/resources/ResourcePicker';
import { Button, Dialog, DialogContent, Input } from '@/components/ui';
import { useI18n } from '@/i18n';
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

/** Link to a note or a document of ARCHIVE, found by its title (spec §8.2 and §8.4). */
export function LinkPicker({ open, editor, noteId, onClose }: LinkPickerProps) {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);

  const insert = ({ kind, id, title }: PickedResource) => {
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
        <ResourcePicker
          inputRef={searchRef}
          exclude={{ kind: 'note', id: noteId }}
          hint={t('notes.linkPicker.hint')}
          onPick={insert}
        />
      </DialogContent>
    </Dialog>
  );
}
