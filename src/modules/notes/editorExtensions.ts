import type { Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { isAllowedHref } from './noteContent';

export interface NoteExtensionOptions {
  /** Text shown in an empty note. */
  placeholder?: string;
  /** Accessible name of the checkbox of a task, from the text of the task. */
  taskLabel?: (text: string) => string;
}

/**
 * Schema of a note (spec §8.1): the editor and the Markdown conversion use the same extensions, so that an
 * import or an export keeps everything the editor can show.
 */
export function noteExtensions({ placeholder, taskLabel }: NoteExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        // Clicks are handled by the editor page: internal links open in ARCHIVE, the others in the browser.
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        protocols: ['archive', 'mailto'],
        isAllowedUri: (url) => isAllowedHref(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      ...(taskLabel ? { a11y: { checkboxLabel: (node) => taskLabel(node.textContent) } } : {}),
    }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
