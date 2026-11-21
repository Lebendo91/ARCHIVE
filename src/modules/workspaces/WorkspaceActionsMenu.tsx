import { Archive, ArchiveRestore, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import type { Workspace } from '@/services/workspaces';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { useWorkspaceArchiving } from './useWorkspaceArchiving';

export interface WorkspaceActionsMenuProps {
  workspace: Workspace;
  /** Hides « Edit » when the page already shows it as a button. */
  withEdit?: boolean;
  variant?: 'ghost' | 'secondary';
}

/** Edit, archive or restore, and delete a workspace. */
export function WorkspaceActionsMenu({
  workspace,
  withEdit = true,
  variant = 'ghost',
}: WorkspaceActionsMenuProps) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toggleArchived = useWorkspaceArchiving();
  const label = t('workspaces.actions.menu', { name: workspace.name });

  return (
    <DropdownMenu>
      <Tooltip content={label} side="bottom">
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            icon={Ellipsis}
            label={label}
            variant={variant}
            tooltip={false}
          />
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        {withEdit ? (
          <DropdownMenuItem
            icon={Pencil}
            onSelect={() => {
              workspaceDialogs.edit(workspace, triggerRef.current);
            }}
          >
            {t('workspaces.actions.edit')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          icon={workspace.isArchived ? ArchiveRestore : Archive}
          onSelect={() => {
            toggleArchived(workspace);
          }}
        >
          {workspace.isArchived ? t('workspaces.actions.restore') : t('workspaces.actions.archive')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Trash2}
          className="text-danger data-[highlighted]:text-danger"
          onSelect={() => {
            workspaceDialogs.delete(workspace, triggerRef.current);
          }}
        >
          {t('workspaces.actions.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
