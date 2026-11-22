import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { createNote, pickMarkdownFiles } from '@/services/notes';
import { refreshNoteViews } from '@/services/queries';
import { toast } from '@/stores/toasts';
import { markdownToNote } from './markdown';
import type { NoteTarget } from './useCreateNote';

/**
 * Markdown files → notes (spec §8.5): the core reads the files chosen in its picker, the interface converts
 * them with the schema of the editor, and each becomes a note named after its file.
 */
export function useImportMarkdown(): (target?: NoteTarget) => Promise<void> {
  const { t, tCount } = useI18n();
  const client = useQueryClient();
  return useCallback(
    async (target: NoteTarget = {}) => {
      try {
        const files = await pickMarkdownFiles();
        if (!files) {
          return;
        }
        let imported = 0;
        for (const file of files) {
          if (file.markdown === null) {
            toast.error(
              t('notes.import.failed', {
                name: file.name,
                reason: t(`library.import.failures.${file.failure ?? 'unreadable'}`),
              }),
            );
            continue;
          }
          const converted = markdownToNote(file.markdown);
          await createNote({
            content: {
              title: file.name,
              content: JSON.stringify(converted.content),
              contentFormat: 'tiptap-json',
              contentText: converted.text,
            },
            ...(target.workspaceId ? { workspaceId: target.workspaceId } : {}),
            ...(target.workspaceId && target.folderId ? { folderId: target.folderId } : {}),
            links: converted.links,
          });
          imported += 1;
        }
        await refreshNoteViews(client);
        if (imported > 0) {
          toast.success(tCount('notes.toasts.imported', imported));
        } else {
          toast.error(t('notes.import.noneImported'));
        }
      } catch (error) {
        toast.error(t(errorMessageKey(error)));
      }
    },
    [client, t, tCount],
  );
}
