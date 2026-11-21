import type { DashboardOverview } from '../types/bindings/DashboardOverview';
import type { ResourceCounts } from '../types/bindings/ResourceCounts';
import type { ResourceSummary } from '../types/bindings/ResourceSummary';
import type { TimelineEvent } from '../types/bindings/TimelineEvent';
import type { TimelineEventType } from '../types/bindings/TimelineEventType';
import type { TokenColor } from '../types/bindings/TokenColor';
import type { Workspace } from '../types/bindings/Workspace';
import type { WorkspaceDeletion } from '../types/bindings/WorkspaceDeletion';
import type { WorkspaceDeletionReport } from '../types/bindings/WorkspaceDeletionReport';
import type { WorkspaceDetail } from '../types/bindings/WorkspaceDetail';
import type { WorkspaceSummary } from '../types/bindings/WorkspaceSummary';

/** A workspace held by the double, with what it contains (documents and notes are only counted). */
export interface CoreDoubleWorkspace {
  workspace: Workspace;
  counts: ResourceCounts;
  /** Documents and notes of the workspace that are in the trash: not counted, but not deleted either. */
  trashed: number;
  /** Names of its root folders, to name the folder that gathers a deleted workspace's content. */
  rootFolders: string[];
}

export interface CoreDoubleState {
  workspaces: CoreDoubleWorkspace[];
  /** Timeline, oldest first. */
  events: TimelineEvent[];
  /** Documents and notes kept without workspace. */
  unassigned: { documents: number; notes: number };
  recentlyIndexed: number;
  recentlyOpened: ResourceSummary[];
  favorites: ResourceSummary[];
}

export type CoreDoubleHandler = (args: Record<string, unknown> | undefined) => unknown;

/**
 * In-memory stand-in for the workspace, overview and timeline commands of the native core
 * (src-tauri/src/services), with the same rules: case-insensitive unique names, timeline events, deletion
 * strategies, error codes. The unit tests call it directly; the end-to-end fixture serializes it into the
 * page, so its body must stay self-contained (no reference to anything declared outside of it).
 */
export function createCoreDouble(
  initial: Partial<CoreDoubleState> | null,
  onChange?: (state: CoreDoubleState) => void,
): { handlers: Record<string, CoreDoubleHandler>; state: CoreDoubleState } {
  const NAME_MAX = 120;
  const DESCRIPTION_MAX = 2000;
  const COLORS = ['amber', 'blue', 'cyan', 'purple', 'success', 'warning', 'danger', 'neutral'];
  const state: CoreDoubleState = {
    workspaces: initial?.workspaces ?? [],
    events: initial?.events ?? [],
    unassigned: initial?.unassigned ?? { documents: 0, notes: 0 },
    recentlyIndexed: initial?.recentlyIndexed ?? 0,
    recentlyOpened: initial?.recentlyOpened ?? [],
    favorites: initial?.favorites ?? [],
  };

  const fail = (code: string, message: string): never => {
    // The native core rejects with its serialized error, a plain `{ code, message }` object.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw { code, message };
  };
  // Lengths in Unicode scalar values, like Rust's `chars().count()`.
  const length = (value: string) => Array.from(value).length;
  const nameKey = (name: string) => name.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
  const find = (id: unknown) =>
    state.workspaces.find((entry) => entry.workspace.id === id) ??
    fail('not_found', 'workspace not found');
  const cleanName = (value: unknown): string => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name === '' || length(name) > NAME_MAX || /\p{Cc}/u.test(name)) {
      fail('invalid_input', 'invalid workspace name');
    }
    return name;
  };
  const checkUnique = (name: string, except?: string) => {
    if (
      state.workspaces.some(
        (entry) => entry.workspace.id !== except && nameKey(entry.workspace.name) === nameKey(name),
      )
    ) {
      fail('name_taken', 'a workspace with this name already exists');
    }
  };
  const checkDescription = (value: unknown): string => {
    const description = typeof value === 'string' ? value.trim() : '';
    if (length(description) > DESCRIPTION_MAX) {
      fail('invalid_input', 'workspace description is too long');
    }
    return description;
  };
  const checkColor = (value: unknown): TokenColor => {
    if (typeof value !== 'string' || !COLORS.includes(value)) {
      fail('invalid_input', 'unknown colour');
    }
    return value as TokenColor;
  };
  const checkIcon = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value)) {
      fail('invalid_input', 'icon is not a valid icon name');
    }
    return value as string;
  };
  const record = (eventType: TimelineEventType, workspace: Workspace) => {
    const last = state.events.at(-1)?.createdAt ?? 0;
    state.events.push({
      id: crypto.randomUUID(),
      eventType,
      entityType: 'workspace',
      entityId: workspace.id,
      workspaceId: workspace.id,
      description: workspace.name,
      metadata: {},
      // Strictly increasing, like the order of the real timeline.
      createdAt: Math.max(Date.now(), last + 1),
    });
  };
  const latestEvents = (limit: number, workspaceId?: string, before?: number) =>
    state.events
      .filter((event) => workspaceId === undefined || event.workspaceId === workspaceId)
      .filter((event) => before === undefined || event.createdAt < before)
      .slice()
      .reverse()
      .slice(0, limit);
  const changed = <T>(value: T): T => {
    onChange?.(state);
    return value;
  };
  const summary = (entry: CoreDoubleWorkspace): WorkspaceSummary => ({
    workspace: { ...entry.workspace },
    counts: { ...entry.counts },
  });

  const handlers: Record<string, CoreDoubleHandler> = {
    workspaces_list: (args) =>
      state.workspaces
        .filter((entry) => args?.includeArchived === true || !entry.workspace.isArchived)
        .slice()
        .sort(
          (a, b) =>
            a.workspace.sortOrder - b.workspace.sortOrder ||
            a.workspace.createdAt - b.workspace.createdAt,
        )
        .map(summary),
    workspaces_get: (args): WorkspaceDetail => {
      const entry = find(args?.id);
      return {
        ...summary(entry),
        recentActivity: latestEvents(8, entry.workspace.id),
        favorites: state.favorites.filter((item) => item.workspaceId === entry.workspace.id),
      };
    },
    workspaces_create: (args) => {
      const input = (args?.input ?? {}) as Record<string, unknown>;
      const name = cleanName(input.name);
      checkUnique(name);
      const now = Date.now();
      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name,
        description: checkDescription(input.description),
        color: input.color === undefined ? 'amber' : checkColor(input.color),
        icon: input.icon === undefined ? 'folder' : checkIcon(input.icon),
        isArchived: false,
        sortOrder: Math.max(-1, ...state.workspaces.map((entry) => entry.workspace.sortOrder)) + 1,
        createdAt: now,
        updatedAt: now,
      };
      state.workspaces.push({
        workspace,
        counts: { documents: 0, notes: 0, folders: 0 },
        trashed: 0,
        rootFolders: [],
      });
      record('workspace_created', workspace);
      return changed({ ...workspace });
    },
    workspaces_update: (args) => {
      const entry = find(args?.id);
      const patch = (args?.patch ?? {}) as Record<string, unknown>;
      const next = { ...entry.workspace };
      if (patch.name !== undefined) {
        next.name = cleanName(patch.name);
        checkUnique(next.name, next.id);
      }
      if (patch.description !== undefined) next.description = checkDescription(patch.description);
      if (patch.color !== undefined) next.color = checkColor(patch.color);
      if (patch.icon !== undefined) next.icon = checkIcon(patch.icon);
      next.updatedAt = Date.now();
      entry.workspace = next;
      return changed({ ...next });
    },
    workspaces_set_archived: (args) => {
      const entry = find(args?.id);
      const archived = args?.archived === true;
      if (entry.workspace.isArchived !== archived) {
        entry.workspace = { ...entry.workspace, isArchived: archived, updatedAt: Date.now() };
        record(archived ? 'resource_archived' : 'resource_restored', entry.workspace);
      }
      return changed({ ...entry.workspace });
    },
    workspaces_delete: (args) => {
      const entry = find(args?.id);
      const deletion = args?.deletion as WorkspaceDeletion;
      const { documents, notes, folders } = entry.counts;
      const report: WorkspaceDeletionReport = {
        documents,
        notes,
        foldersMoved: 0,
        foldersRemoved: 0,
        containerFolder: null,
      };
      if (deletion.kind === 'empty') {
        if (documents + notes + folders + entry.trashed > 0) {
          fail('in_use', 'it still holds folders, documents or notes');
        }
      } else if (deletion.kind === 'move_to') {
        if (deletion.target === entry.workspace.id) {
          fail('invalid_input', 'a workspace cannot be moved into itself');
        }
        const target = find(deletion.target);
        let name = entry.workspace.name;
        for (
          let attempt = 2;
          target.rootFolders.some((f) => nameKey(f) === nameKey(name));
          attempt += 1
        ) {
          name = `${entry.workspace.name} (${String(attempt)})`;
        }
        const now = Date.now();
        target.rootFolders.push(name);
        target.counts = {
          documents: target.counts.documents + documents,
          notes: target.counts.notes + notes,
          folders: target.counts.folders + folders + 1,
        };
        target.trashed += entry.trashed;
        report.foldersMoved = folders;
        report.containerFolder = {
          id: crypto.randomUUID(),
          workspaceId: target.workspace.id,
          parentId: null,
          name,
          createdAt: now,
          updatedAt: now,
        };
      } else {
        // Unassign: documents and notes stay, without workspace; folders are removed.
        state.unassigned = {
          documents: state.unassigned.documents + documents,
          notes: state.unassigned.notes + notes,
        };
        report.foldersRemoved = folders;
      }
      state.workspaces = state.workspaces.filter((item) => item !== entry);
      return changed(report);
    },
    dashboard_overview: (): DashboardOverview => {
      const total = (key: 'documents' | 'notes') =>
        state.workspaces.reduce((sum, entry) => sum + entry.counts[key], state.unassigned[key]);
      return {
        documents: total('documents'),
        notes: total('notes'),
        workspaces: state.workspaces.filter((entry) => !entry.workspace.isArchived).length,
        recentlyIndexed: state.recentlyIndexed,
        recentActivity: latestEvents(8),
        recentlyOpened: state.recentlyOpened.slice(0, 6),
        favorites: state.favorites.slice(0, 6),
      };
    },
    timeline_list: (args) => {
      const query = (args?.query ?? {}) as {
        before?: number;
        limit?: number;
        workspaceId?: string;
      };
      const limit = query.limit ?? 0;
      if (limit < 1 || limit > 200) {
        fail('invalid_input', 'limit must be between 1 and 200');
      }
      return latestEvents(limit, query.workspaceId, query.before);
    },
  };
  return { handlers, state };
}

let seedSequence = 0;

/** Workspace to seed the double with, created `ageMs` ago. */
export function seedWorkspace(
  name: string,
  options: Partial<Omit<Workspace, 'name'>> & {
    counts?: Partial<ResourceCounts>;
    ageMs?: number;
  } = {},
): CoreDoubleWorkspace {
  seedSequence += 1;
  const { counts, ageMs = 60 * 60 * 1000, ...workspace } = options;
  const createdAt = Date.now() - ageMs;
  return {
    workspace: {
      id: `00000000-0000-7000-8000-${String(seedSequence).padStart(12, '0')}`,
      name,
      description: '',
      color: 'amber',
      icon: 'folder',
      isArchived: false,
      sortOrder: seedSequence,
      createdAt,
      updatedAt: createdAt,
      ...workspace,
    },
    counts: { documents: 0, notes: 0, folders: 0, ...counts },
    trashed: 0,
    rootFolders: [],
  };
}

/** Timeline event recording the creation of a seeded workspace. */
export function creationEvent(entry: CoreDoubleWorkspace): TimelineEvent {
  return {
    id: `event-${entry.workspace.id}`,
    eventType: 'workspace_created',
    entityType: 'workspace',
    entityId: entry.workspace.id,
    workspaceId: entry.workspace.id,
    description: entry.workspace.name,
    metadata: {},
    createdAt: entry.workspace.createdAt,
  };
}
