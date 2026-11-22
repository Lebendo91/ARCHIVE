import type { JSONContent } from '@tiptap/core';
import type { Note } from '@/services/notes';
import { markdownToNote } from './markdown';
import { EMPTY_DOCUMENT } from './noteContent';

/** The TipTap document of a note, whatever its stored format. */
export function readNoteContent(note: Pick<Note, 'content' | 'contentFormat'>): JSONContent {
  if (note.contentFormat === 'markdown') {
    return markdownToNote(note.content).content;
  }
  if (note.contentFormat === 'plain') {
    return {
      type: 'doc',
      content: note.content
        .split('\n')
        .map((line) =>
          line === ''
            ? { type: 'paragraph' }
            : { type: 'paragraph', content: [{ type: 'text', text: line }] },
        ),
    };
  }
  try {
    const document = JSON.parse(note.content) as JSONContent;
    return document.type === 'doc' ? document : EMPTY_DOCUMENT;
  } catch {
    return EMPTY_DOCUMENT;
  }
}
