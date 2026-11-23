import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { reportError } from '@/services/diagnostics';
import { getDocument, pendingExtractions, saveExtraction } from '@/services/documents';
import { extractPdfText } from '@/services/pdf';
import { queryKeys } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';
import { useImportStore } from '@/stores/imports';

let draining = false;
let drainAgain = false;
/** Read through a function: another call may have set it while this one was waiting. */
const restartRequested = () => drainAgain;

/** Extracts the text of every pending PDF, one at a time, until none is left. */
async function drain(client: QueryClient): Promise<void> {
  if (draining) {
    drainAgain = true;
    return;
  }
  draining = true;
  try {
    do {
      drainAgain = false;
      for (const id of await pendingExtractions()) {
        const { document } = await getDocument(id);
        const extraction = await extractPdfText(id, document.fileSize);
        await saveExtraction(id, extraction);
        await Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.documents }),
          // The text extracted is now searchable, and analysed.
          client.invalidateQueries({ queryKey: queryKeys.search }),
          client.invalidateQueries({ queryKey: queryKeys.memory }),
        ]);
      }
    } while (restartRequested());
  } catch (error) {
    // The document stays pending and is extracted again at the next start; no content is logged.
    reportError('PDF text extraction', error);
  } finally {
    draining = false;
  }
}

/**
 * PDF text is extracted by pdf.js in the interface (ARCHITECTURE §8): at startup for documents left pending,
 * and after each import.
 */
export function usePdfExtraction(): void {
  const client = useQueryClient();
  const completedImports = useImportStore((state) => state.completed);
  useEffect(() => {
    if (isNativeRuntime()) {
      void drain(client);
    }
  }, [client, completedImports]);
}
