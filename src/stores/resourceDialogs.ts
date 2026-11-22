import { create } from 'zustand';
import type { Document } from '@/services/documents';
import type { Note, NoteSummary } from '@/services/notes';

export type ResourceDialogKind = 'rename' | 'move' | 'tags' | 'purge';

/** A document or a note, as the shared dialogs need it. */
export interface DialogResource {
  type: 'document' | 'note';
  id: string;
  /** Title as stored: an untitled note has an empty title. */
  title: string;
  workspaceId: string | null;
  folderId: string | null;
}

export function documentResource(document: Document): DialogResource {
  return {
    type: 'document',
    id: document.id,
    title: document.title,
    workspaceId: document.workspaceId,
    folderId: document.folderId,
  };
}

export function noteResource(note: Note | NoteSummary): DialogResource {
  return {
    type: 'note',
    id: note.id,
    title: note.title,
    workspaceId: note.workspaceId,
    folderId: note.folderId,
  };
}

interface ResourceDialogState {
  /** Last dialog requested; kept while the closing animation plays. */
  dialog: { kind: ResourceDialogKind; resource: DialogResource } | null;
  isOpen: boolean;
  sequence: number;
  returnFocus: HTMLElement | null;
  open: (
    kind: ResourceDialogKind,
    resource: DialogResource,
    returnFocus?: HTMLElement | null,
  ) => void;
  close: () => void;
}

/** Rename, move, tags and permanent deletion of documents and notes, rendered once by the application frame. */
export const useResourceDialogs = create<ResourceDialogState>()((set) => ({
  dialog: null,
  isOpen: false,
  sequence: 0,
  returnFocus: null,
  open: (kind, resource, returnFocus) => {
    const focused = focusedElement();
    set((state) => ({
      dialog: { kind, resource },
      isOpen: true,
      sequence: state.sequence + 1,
      returnFocus: returnFocus ?? focused,
    }));
  },
  close: () => {
    set({ isOpen: false });
  },
}));

function focusedElement(): HTMLElement | null {
  const focused = globalThis.document.activeElement;
  return focused instanceof HTMLElement ? focused : null;
}
