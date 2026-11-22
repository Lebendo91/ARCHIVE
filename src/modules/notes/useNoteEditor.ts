import type { Editor, JSONContent } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { noteExtensions } from './editorExtensions';

export type NoteEditorOptions =
  | {
      /** A note: an accessible multi-line text box, read-only while `editable` is false. */
      mode: 'edit';
      content: JSONContent;
      editable: boolean;
      placeholder: string;
      label: string;
      /** Every change of the content. */
      onChange: () => void;
      /** A link was clicked (Alt+click places the cursor in it instead). */
      onOpenLink: (href: string) => void;
    }
  | {
      /** Content that is only shown, such as a Markdown document of the Library. */
      mode: 'view';
      content: JSONContent;
      onOpenLink: (href: string) => void;
    };

/** The TipTap editor of a note: its schema, its accessible name, and links that open when clicked. */
export function useNoteEditor(options: NoteEditorOptions): Editor {
  const { content, onOpenLink } = options;
  const onChange = options.mode === 'edit' ? options.onChange : undefined;
  const editable = options.mode === 'edit' && options.editable;
  const handlers = useRef({ onChange, onOpenLink, editable });
  useEffect(() => {
    handlers.current = { onChange, onOpenLink, editable };
  });
  const editor = useEditor({
    extensions: noteExtensions(options.mode === 'edit' ? { placeholder: options.placeholder } : {}),
    content,
    editable,
    editorProps: {
      // Computed again at each update of the view, so that a note made read-only says so.
      attributes: () =>
        options.mode === 'edit'
          ? {
              class: 'note-content',
              role: 'textbox',
              'aria-multiline': 'true',
              'aria-label': options.label,
              ...(handlers.current.editable ? {} : { 'aria-readonly': 'true' }),
            }
          : { class: 'note-content', role: 'document' },
      handleDOMEvents: {
        click: (_view, event) => {
          const anchor = event.target instanceof Element ? event.target.closest('a') : null;
          const href = anchor?.getAttribute('href');
          if (!href || event.altKey) {
            return false;
          }
          event.preventDefault();
          handlers.current.onOpenLink(href);
          return true;
        },
        // A middle click must not ask the web view to open the address itself.
        auxclick: (_view, event) => {
          if (event.target instanceof Element && event.target.closest('a')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: () => {
      handlers.current.onChange?.();
    },
  });
  useEffect(() => {
    // Without an update event: making the editor read-only (or editable again) does not change the note.
    if (editor.isEditable !== editable) {
      handlers.current.editable = editable;
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);
  return editor;
}
