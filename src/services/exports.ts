import { Channel } from '@tauri-apps/api/core';
import type { ExportProgress } from '@/types/bindings/ExportProgress';
import type { ExportScope } from '@/types/bindings/ExportScope';
import type { ExportSummary } from '@/types/bindings/ExportSummary';
import { callCommand } from './tauri';

export type { ExportNoteSource } from '@/types/bindings/ExportNoteSource';
export type { ExportProgress, ExportScope, ExportSummary };

/** The notes of the scope stored as TipTap documents: the interface converts them to Markdown. */
export function exportNotesSource(scope: ExportScope) {
  return callCommand('export_notes_source', { scope });
}

/** Writes the export where the user chooses (a dialog of the core); `null` when cancelled. */
export function createExport(
  scope: ExportScope,
  markdown: Record<string, string>,
  untitled: string,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportSummary | null> {
  return callCommand('export_create', {
    scope,
    markdown,
    untitled,
    onProgress: new Channel<ExportProgress>(onProgress),
  });
}

/** Shows the folder of the last export in the file manager. */
export function revealExport(): Promise<null> {
  return callCommand('export_reveal');
}
