import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { createNote } from '@/services/notes';
import { refreshNoteViews } from '@/services/queries';
import { toast } from '@/stores/toasts';
import { EMPTY_DOCUMENT } from './noteContent';

/** Where a new note goes: a workspace and, inside it, a folder. */
export interface NoteTarget {
  workspaceId?: string;
  folderId?: string;
}

/** State given to the editor page of a note just created: the title field takes the focus. */
export interface NewNoteState {
  created: true;
}

/** Creates an empty note (in the given workspace, if any) and opens it in the editor. */
export function useCreateNote(): (target?: NoteTarget) => Promise<void> {
  const { t } = useI18n();
  const client = useQueryClient();
  const navigate = useNavigate();
  return useCallback(
    async (target: NoteTarget = {}) => {
      try {
        const note = await createNote({
          content: {
            title: '',
            content: JSON.stringify(EMPTY_DOCUMENT),
            contentFormat: 'tiptap-json',
            contentText: '',
          },
          ...(target.workspaceId ? { workspaceId: target.workspaceId } : {}),
          ...(target.workspaceId && target.folderId ? { folderId: target.folderId } : {}),
          links: [],
        });
        await refreshNoteViews(client);
        await navigate(`/notes/${note.id}`, { state: { created: true } satisfies NewNoteState });
      } catch (error) {
        toast.error(t(errorMessageKey(error)));
      }
    },
    [client, navigate, t],
  );
}
