import type { Extensions } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { isAllowedHref } from './noteContent';

/**
 * Schema of a note (spec §8.1): the editor and the Markdown conversion use the same extensions, so that an
 * import or an export keeps everything the editor can show.
 */
export function noteExtensions({ placeholder }: { placeholder?: string } = {}): Extensions {
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
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
