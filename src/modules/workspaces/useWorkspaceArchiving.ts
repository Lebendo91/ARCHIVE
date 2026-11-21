import { useI18n } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useSetWorkspaceArchived } from '@/services/queries';
import type { Workspace } from '@/services/workspaces';
import { toast } from '@/stores/toasts';

/**
 * Archives or restores a workspace and reports the outcome. Archiving is reversible, so it needs no
 * confirmation. The outcome is reported even when the card that triggered it leaves the screen.
 */
export function useWorkspaceArchiving(): (workspace: Workspace) => void {
  const { t } = useI18n();
  const mutation = useSetWorkspaceArchived();
  return (workspace) => {
    const archived = !workspace.isArchived;
    mutation.mutateAsync({ id: workspace.id, archived }).then(
      (updated) => {
        toast.success(
          t(archived ? 'workspaces.toasts.archived' : 'workspaces.toasts.restored', {
            name: updated.name,
          }),
        );
      },
      (error: unknown) => {
        toast.error(t(errorMessageKey(error)));
      },
    );
  };
}
