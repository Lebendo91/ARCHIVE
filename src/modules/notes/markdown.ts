import { Editor, type JSONContent } from '@tiptap/core';
import type { LinkTarget } from '@/services/notes';
import { noteExtensions } from './editorExtensions';
import { collectLinks } from './noteContent';

let converter: Editor | null = null;

/** An editor without view, with the schema of the notes: it converts, it never displays. */
function headless(): Editor {
  converter ??= new Editor({ extensions: noteExtensions() });
  return converter;
}

export interface ConvertedNote {
  /** TipTap document. */
  content: JSONContent;
  /** Plain text, for search and excerpts. */
  text: string;
  links: LinkTarget[];
}

/** Plain text of a note: one line per block. */
export function plainText(editor: Editor): string {
  return editor.getText({ blockSeparator: '\n' });
}

/** Markdown → note, with the schema of the editor (spec §8.5). */
export function markdownToNote(markdown: string): ConvertedNote {
  const editor = headless();
  editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
  const content = editor.getJSON();
  return { content, text: plainText(editor), links: collectLinks(content) };
}

/** Note → Markdown, keeping its structure (spec §8.5). */
export function noteToMarkdown(content: JSONContent): string {
  const editor = headless();
  editor.commands.setContent(content, { emitUpdate: false });
  return editor.getMarkdown();
}
