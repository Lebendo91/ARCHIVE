import { Plus } from 'lucide-react';
import { formatCombination, getShortcut } from '@/app/shortcuts/shortcuts';
import { useI18n } from '@/i18n';
import { COLOR_TEXT_CLASSES, workspaceIcon } from '@/modules/workspaces/appearance';
import { useWorkspaces } from '@/services/queries';
import { workspaceDialogs } from '@/stores/workspaceDialogs';
import { SidebarButton, SidebarLink } from './SidebarLink';

/**
 * Shortcuts to the active workspaces and the « New workspace » action (spec §3.3), as items of the
 * workspaces section. Archived workspaces stay out of the navigation.
 */
export function SidebarWorkspaces({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const workspaces = useWorkspaces();
  const active = (workspaces.data ?? []).filter((summary) => !summary.workspace.isArchived);

  return (
    <>
      {active.map(({ workspace }) => (
        <li key={workspace.id}>
          <SidebarLink
            to={`/workspaces/${workspace.id}`}
            label={workspace.name}
            icon={workspaceIcon(workspace.icon)}
            iconClassName={COLOR_TEXT_CLASSES[workspace.color]}
            collapsed={collapsed}
          />
        </li>
      ))}
      <li>
        <SidebarButton
          label={t('nav.createWorkspace')}
          icon={Plus}
          collapsed={collapsed}
          shortcut={formatCombination(getShortcut('newWorkspace').combination, t)}
          onClick={(event) => {
            workspaceDialogs.create(event.currentTarget);
          }}
        />
      </li>
    </>
  );
}
