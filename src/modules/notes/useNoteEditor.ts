import type { Editor, JSONContent } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { noteExtensions } from './editorExtensions';

export interface NoteEditorOptions {
  content: JSONContent;
  editable: boolean;
  placeholder: string;
  label: string;
  /** Every change of the content. */
  onChange: () => void;
  /** A link was clicked (Alt+click places the cursor in it instead). */
  onOpenLink: (href: string) => void;
}

/** The TipTap editor of a note: its schema, its accessible name, and links that open when clicked. */
export function useNoteEditor({
  content,
  editable,
  placeholder,
  label,
  onChange,
  onOpenLink,
}: NoteEditorOptions): Editor {
  const handlers = useRef({ onChange, onOpenLink });
  useEffect(() => {
    handlers.current = { onChange, onOpenLink };
  });
  const editor = useEditor({
    extensions: noteExtensions({ placeholder }),
    content,
    editable,
    editorProps: {
      attributes: {
        class: 'note-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
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
      handlers.current.onChange();
    },
  });
  useEffect(() => {
    // Without an update event: making the editor read-only (or editable again) does not change the note.
    if (editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);
  return editor;
}
