import { Link } from 'react-router';
import { Badge, Card } from '@/components/ui';
import { useI18n } from '@/i18n';
import type { WorkspaceSummary } from '@/services/workspaces';
import { WorkspaceActionsMenu } from './WorkspaceActionsMenu';
import { WorkspaceIcon } from './WorkspaceIcon';

/** Counts of a workspace, for example « 2 documents · 1 note · 0 dossier ». */
export function WorkspaceCounts({ summary }: { summary: WorkspaceSummary }) {
  const { tCount } = useI18n();
  const { documents, notes, folders } = summary.counts;
  return (
    <p className="text-xs text-fg-secondary">
      {[
        tCount('workspaces.counts.documents', documents),
        tCount('workspaces.counts.notes', notes),
        tCount('workspaces.counts.folders', folders),
      ].join(' · ')}
    </p>
  );
}

/**
 * Workspace in a grid. The whole card opens the workspace (its title link covers the card); the actions
 * menu sits above that link, so that no interactive element is nested in another.
 */
export function WorkspaceCard({ summary }: { summary: WorkspaceSummary }) {
  const { t } = useI18n();
  const { workspace } = summary;
  return (
    <Card className="relative flex h-full flex-col gap-4 transition-colors duration-150 ease-standard focus-within:border-line hover:border-line hover:bg-steel/40">
      <div className="flex items-start gap-4">
        <WorkspaceIcon icon={workspace.icon} color={workspace.color} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="flex min-w-0 items-center gap-2">
            <Link
              to={`/workspaces/${workspace.id}`}
              className="min-w-0 cursor-default truncate rounded-sm font-display text-lg font-semibold text-fg after:absolute after:inset-0 after:rounded-card after:content-['']"
            >
              {workspace.name}
            </Link>
            {workspace.isArchived ? <Badge>{t('workspaces.archivedBadge')}</Badge> : null}
          </h3>
          {workspace.description ? (
            <p className="line-clamp-2 text-sm text-fg-secondary">{workspace.description}</p>
          ) : null}
        </div>
        <div className="relative z-10 -mt-1 -mr-1">
          <WorkspaceActionsMenu workspace={workspace} />
        </div>
      </div>
      <div className="mt-auto">
        <WorkspaceCounts summary={summary} />
      </div>
    </Card>
  );
}
