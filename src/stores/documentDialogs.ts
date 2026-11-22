import { create } from 'zustand';
import type { Document } from '@/services/documents';

export type DocumentDialogKind = 'rename' | 'move' | 'tags' | 'purge';

interface DocumentDialogState {
  /** Last dialog requested; kept while the closing animation plays. */
  dialog: { kind: DocumentDialogKind; document: Document } | null;
  isOpen: boolean;
  sequence: number;
  returnFocus: HTMLElement | null;
  open: (kind: DocumentDialogKind, document: Document, returnFocus?: HTMLElement | null) => void;
  close: () => void;
}

/** Document dialogs, rendered once by the application frame like the workspace dialogs. */
export const useDocumentDialogs = create<DocumentDialogState>()((set) => ({
  dialog: null,
  isOpen: false,
  sequence: 0,
  returnFocus: null,
  open: (kind, document, returnFocus) => {
    const focused = focusedElement();
    set((state) => ({
      dialog: { kind, document },
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
