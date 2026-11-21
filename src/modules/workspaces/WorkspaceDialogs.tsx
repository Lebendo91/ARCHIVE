import { useWorkspaceDialogs } from '@/stores/workspaceDialogs';
import { DeleteWorkspaceDialog } from './DeleteWorkspaceDialog';
import { WorkspaceFormDialog } from './WorkspaceFormDialog';

/**
 * Gives the focus back to the element that opened the dialog, or to the content area when that element is
 * gone (a deleted workspace's card, a closed menu).
 */
function restoreFocus(event: Event) {
  event.preventDefault();
  const target = useWorkspaceDialogs.getState().returnFocus;
  const fallback = document.getElementById('main-content');
  (target?.isConnected && target !== document.body ? target : fallback)?.focus();
}

/** Workspace dialogs, rendered once by the application frame (see `stores/workspaceDialogs`). */
export function WorkspaceDialogs() {
  const dialog = useWorkspaceDialogs((state) => state.dialog);
  const isOpen = useWorkspaceDialogs((state) => state.isOpen);
  const sequence = useWorkspaceDialogs((state) => state.sequence);
  const close = useWorkspaceDialogs((state) => state.close);
  const onOpenChange = (open: boolean) => {
    if (!open) {
      close();
    }
  };

  if (!dialog) {
    return null;
  }
  if (dialog.kind === 'delete') {
    return (
      <DeleteWorkspaceDialog
        key={sequence}
        open={isOpen}
        workspace={dialog.workspace}
        onOpenChange={onOpenChange}
        onCloseAutoFocus={restoreFocus}
      />
    );
  }
  return (
    <WorkspaceFormDialog
      key={sequence}
      open={isOpen}
      workspace={dialog.kind === 'edit' ? dialog.workspace : undefined}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={restoreFocus}
    />
  );
}
