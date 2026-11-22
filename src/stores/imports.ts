import { Channel } from '@tauri-apps/api/core';
import { create } from 'zustand';
import type { ImportFile } from '@/types/bindings/ImportFile';
import type { ImportOutcome } from '@/types/bindings/ImportOutcome';
import type { ImportProgress } from '@/types/bindings/ImportProgress';
import type { ImportSummary } from '@/types/bindings/ImportSummary';
import type { ImportTarget } from '@/types/bindings/ImportTarget';
import { callCommand } from '@/services/tauri';

export type { ImportOutcome, ImportSummary, ImportTarget };

export type ImportSource = 'pick' | 'dropped' | 'retry';

export interface ImportFileState extends ImportFile {
  outcome: ImportOutcome | null;
}

export interface ImportRun {
  id: number;
  /** Where this import goes: a retry goes to the same place. */
  target: ImportTarget;
  files: ImportFileState[];
  summary: ImportSummary | null;
  cancelling: boolean;
}

/** Where imports go by default: the workspace (and folder) the user is looking at, if any. */
export interface ImportContext {
  target: ImportTarget;
  /** Name shown on the drop overlay. */
  label: string | null;
}

interface ImportState {
  run: ImportRun | null;
  running: boolean;
  /** Incremented when an import ends, so that dependent work (PDF text extraction) starts again. */
  completed: number;
  context: ImportContext;
  setContext: (context: ImportContext | null) => void;
  /** Starts an import; resolves with `null` when the user closes the file picker without choosing. */
  start: (source: ImportSource, target?: ImportTarget) => Promise<ImportSummary | null>;
  cancel: () => void;
  dismiss: () => void;
}

const NO_CONTEXT: ImportContext = { target: {}, label: null };
let runSequence = 0;

const COMMANDS = {
  pick: 'documents_import_pick',
  dropped: 'documents_import_dropped',
  retry: 'documents_import_retry',
} as const;

/**
 * Imports run in the native core; this store follows their progress (channel events) for the import panel.
 * Only one import runs at a time, like in the core.
 */
export const useImportStore = create<ImportState>()((set, get) => ({
  run: null,
  running: false,
  completed: 0,
  context: NO_CONTEXT,
  setContext: (context) => {
    set({ context: context ?? NO_CONTEXT });
  },
  start: async (source, target) => {
    if (get().running) {
      return null;
    }
    runSequence += 1;
    const id = runSequence;
    const effectiveTarget = target ?? get().context.target;
    const channel = new Channel<ImportProgress>((event) => {
      set((state) => {
        if (state.run?.id !== id && event.event !== 'started') {
          return state;
        }
        switch (event.event) {
          case 'started':
            return {
              run: {
                id,
                target: effectiveTarget,
                files: event.files.map((file) => ({ ...file, outcome: null })),
                summary: null,
                cancelling: false,
              },
            };
          case 'file':
            return state.run
              ? {
                  run: {
                    ...state.run,
                    files: state.run.files.map((file) =>
                      file.index === event.index ? { ...file, outcome: event.outcome } : file,
                    ),
                  },
                }
              : state;
          case 'finished':
            return state.run ? { run: { ...state.run, summary: event.summary } } : state;
        }
      });
    });
    set({ running: true });
    try {
      return await callCommand(COMMANDS[source], {
        target: effectiveTarget,
        onProgress: channel,
      });
    } finally {
      set((state) => ({ running: false, completed: state.completed + 1 }));
    }
  },
  cancel: () => {
    const { run } = get();
    if (run) {
      set({ run: { ...run, cancelling: true } });
    }
    void callCommand('documents_import_cancel');
  },
  dismiss: () => {
    if (!get().running) {
      set({ run: null });
    }
  },
}));
