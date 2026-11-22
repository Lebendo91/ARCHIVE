import type { JSONContent } from '@tiptap/core';

/**
 * Last unsaved state of a note, kept in the web view's local storage until the core has saved it: after a
 * crash, the editor offers to restore it (spec §8.3, recovery after restart).
 */
export interface NoteDraft {
  /** Revision the changes were made on: a draft is only offered on top of that same revision. */
  revision: number;
  title: string;
  content: JSONContent;
  savedAt: number;
}

const PREFIX = 'archive-note-draft:';

export function readDraft(noteId: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(PREFIX + noteId);
    if (raw === null) {
      return null;
    }
    const draft = JSON.parse(raw) as Partial<NoteDraft>;
    return typeof draft.revision === 'number' &&
      typeof draft.title === 'string' &&
      typeof draft.content === 'object' &&
      typeof draft.savedAt === 'number'
      ? (draft as NoteDraft)
      : null;
  } catch {
    return null;
  }
}

export function writeDraft(noteId: string, draft: NoteDraft): void {
  try {
    localStorage.setItem(PREFIX + noteId, JSON.stringify(draft));
  } catch {
    // Storage full or unavailable: the autosave still writes to the database.
  }
}

export function clearDraft(noteId: string): void {
  try {
    localStorage.removeItem(PREFIX + noteId);
  } catch {
    // Nothing to clear.
  }
}
