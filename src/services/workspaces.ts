import type { NewWorkspace } from '@/types/bindings/NewWorkspace';
import type { ResourceCounts } from '@/types/bindings/ResourceCounts';
import type { TokenColor } from '@/types/bindings/TokenColor';
import type { Workspace } from '@/types/bindings/Workspace';
import type { WorkspaceDeletion } from '@/types/bindings/WorkspaceDeletion';
import type { WorkspaceDeletionReport } from '@/types/bindings/WorkspaceDeletionReport';
import type { WorkspaceDetail } from '@/types/bindings/WorkspaceDetail';
import type { WorkspacePatch } from '@/types/bindings/WorkspacePatch';
import type { WorkspaceSummary } from '@/types/bindings/WorkspaceSummary';
import { callCommand } from './tauri';

export type {
  NewWorkspace,
  ResourceCounts,
  TokenColor,
  Workspace,
  WorkspaceDeletion,
  WorkspaceDeletionReport,
  WorkspaceDetail,
  WorkspacePatch,
  WorkspaceSummary,
};

/** Limits enforced by the native core (src-tauri/src/repo/workspaces.rs). */
export const WORKSPACE_NAME_MAX = 120;
export const WORKSPACE_DESCRIPTION_MAX = 2_000;

/** Workspaces in their display order, with the number of resources each one holds. */
export function listWorkspaces(includeArchived: boolean): Promise<WorkspaceSummary[]> {
  return callCommand('workspaces_list', { includeArchived });
}

export function getWorkspace(id: string): Promise<WorkspaceDetail> {
  return callCommand('workspaces_get', { id });
}

export function createWorkspace(input: NewWorkspace): Promise<Workspace> {
  return callCommand('workspaces_create', { input });
}

export function updateWorkspace(id: string, patch: WorkspacePatch): Promise<Workspace> {
  return callCommand('workspaces_update', { id, patch });
}

export function setWorkspaceArchived(id: string, archived: boolean): Promise<Workspace> {
  return callCommand('workspaces_set_archived', { id, archived });
}

/** Deletes a workspace; its resources follow `deletion` and are never deleted (spec §12.3). */
export function deleteWorkspace(
  id: string,
  deletion: WorkspaceDeletion,
): Promise<WorkspaceDeletionReport> {
  return callCommand('workspaces_delete', { id, deletion });
}

export function totalResources(counts: ResourceCounts): number {
  return counts.documents + counts.notes + counts.folders;
}
