import { useMutation } from '@tanstack/react-query';
import { useI18n } from '@/i18n';
import { storedNoteToMarkdown } from '@/modules/notes/markdown';
import { createExport, exportNotesSource, type ExportScope } from '@/services/exports';

export interface ExportStep {
  /** The notes converted to Markdown here, then the elements written by the core. */
  phase: 'converting' | 'writing';
  done: number;
  total: number;
}

/** Notes converted between two pauses that let the interface respond. */
const BATCH = 20;

/**
 * Export of the knowledge base or of a workspace (specification §16.4). The notes stored as TipTap documents are
 * converted to Markdown here, with the conversion of the export of one note, then the core writes everything.
 */
export function useExportData(onStep: (step: ExportStep) => void) {
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (scope: ExportScope) => {
      const sources = await exportNotesSource(scope);
      const markdown: Record<string, string> = {};
      for (const [index, source] of sources.entries()) {
        const converted = storedNoteToMarkdown(source.content);
        if (converted !== null) {
          markdown[source.id] = converted;
        }
        if ((index + 1) % BATCH === 0 || index + 1 === sources.length) {
          onStep({ phase: 'converting', done: index + 1, total: sources.length });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      return createExport(scope, markdown, t('notes.untitled'), (progress) => {
        onStep({ phase: 'writing', ...progress });
      });
    },
  });
}
