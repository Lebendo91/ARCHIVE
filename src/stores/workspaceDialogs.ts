import { create } from 'zustand';
import type { Workspace } from '@/services/workspaces';

export type WorkspaceDialog =
  | { kind: 'create' }
  | { kind: 'edit'; workspace: Workspace }
  | { kind: 'delete'; workspace: Workspace };

interface WorkspaceDialogState {
  /** Last dialog requested. It is kept while the closing animation plays. */
  dialog: WorkspaceDialog | null;
  isOpen: boolean;
  /** Changes at every opening, so that each dialog starts from a fresh state. */
  sequence: number;
  /** Element that gets the focus back when the dialog closes. */
  returnFocus: HTMLElement | null;
  open: (dialog: WorkspaceDialog, returnFocus?: HTMLElement | null) => void;
  close: () => void;
}

/**
 * Workspace dialogs can be opened from anywhere (sidebar, top bar, shortcut, pages): they are rendered once,
 * by the application frame, from this state.
 */
export const useWorkspaceDialogs = create<WorkspaceDialogState>()((set) => ({
  dialog: null,
  isOpen: false,
  sequence: 0,
  returnFocus: null,
  open: (dialog, returnFocus) => {
    const focused = document.activeElement;
    set((state) => ({
      dialog,
      isOpen: true,
      sequence: state.sequence + 1,
      returnFocus: returnFocus ?? (focused instanceof HTMLElement ? focused : null),
    }));
  },
  close: () => {
    set({ isOpen: false });
  },
}));

export const workspaceDialogs = {
  create: (returnFocus?: HTMLElement | null) => {
    useWorkspaceDialogs.getState().open({ kind: 'create' }, returnFocus);
  },
  edit: (workspace: Workspace, returnFocus?: HTMLElement | null) => {
    useWorkspaceDialogs.getState().open({ kind: 'edit', workspace }, returnFocus);
  },
  delete: (workspace: Workspace, returnFocus?: HTMLElement | null) => {
    useWorkspaceDialogs.getState().open({ kind: 'delete', workspace }, returnFocus);
  },
};
