import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { refreshLibraryViews } from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { useImportStore, type ImportSource, type ImportTarget } from '@/stores/imports';
import { toast } from '@/stores/toasts';

/**
 * Starts an import (file picker, drag and drop or retry) and refreshes the Library afterwards. Without a
 * target, documents go where the user is: the workspace (and folder) displayed, if any.
 */
export function useStartImport(): (source?: ImportSource, target?: ImportTarget) => Promise<void> {
  const { t } = useI18n();
  const client = useQueryClient();
  return useCallback(
    async (source = 'pick', target) => {
      try {
        const summary = await useImportStore.getState().start(source, target);
        if (summary) {
          await refreshLibraryViews(client);
        }
      } catch (error) {
        toast.error(
          isCommandError(error) && error.code === 'in_use'
            ? t('library.import.alreadyRunning')
            : t(errorMessageKey(error)),
        );
      }
    },
    [client, t],
  );
}
