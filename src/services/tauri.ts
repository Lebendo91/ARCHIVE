import { invoke } from '@tauri-apps/api/core';
import type { AppInfo } from '@/types/bindings/AppInfo';
import type { AppSettings } from '@/types/bindings/AppSettings';
import type { AppStatus } from '@/types/bindings/AppStatus';
import type { DashboardOverview } from '@/types/bindings/DashboardOverview';
import type { ErrorCode } from '@/types/bindings/ErrorCode';
import type { IntegrityReport } from '@/types/bindings/IntegrityReport';
import type { NewWorkspace } from '@/types/bindings/NewWorkspace';
import type { SettingsPatch } from '@/types/bindings/SettingsPatch';
import type { StorageFolder } from '@/types/bindings/StorageFolder';
import type { StorageOverview } from '@/types/bindings/StorageOverview';
import type { TimelineEvent } from '@/types/bindings/TimelineEvent';
import type { TimelineQuery } from '@/types/bindings/TimelineQuery';
import type { Workspace } from '@/types/bindings/Workspace';
import type { WorkspaceDeletion } from '@/types/bindings/WorkspaceDeletion';
import type { WorkspaceDeletionReport } from '@/types/bindings/WorkspaceDeletionReport';
import type { WorkspaceDetail } from '@/types/bindings/WorkspaceDetail';
import type { WorkspacePatch } from '@/types/bindings/WorkspacePatch';
import type { WorkspaceSummary } from '@/types/bindings/WorkspaceSummary';

export type DiagnosticLevel = 'error' | 'warn' | 'info';

/**
 * Commands exposed by the native core (src-tauri/src/commands) with their arguments and results. The
 * argument and result types are generated from the Rust definitions (src/types/bindings).
 */
export interface CommandSignatures {
  app_info: { args: undefined; result: AppInfo };
  app_status: { args: undefined; result: AppStatus };
  database_retry: { args: undefined; result: AppStatus };
  log_frontend_event: { args: { level: DiagnosticLevel; message: string }; result: null };
  settings_get: { args: undefined; result: AppSettings };
  settings_update: { args: { patch: SettingsPatch }; result: AppSettings };
  storage_overview: { args: undefined; result: StorageOverview };
  storage_open_folder: { args: { folder: StorageFolder }; result: null };
  database_check_integrity: { args: undefined; result: IntegrityReport };
  workspaces_list: { args: { includeArchived: boolean }; result: WorkspaceSummary[] };
  workspaces_get: { args: { id: string }; result: WorkspaceDetail };
  workspaces_create: { args: { input: NewWorkspace }; result: Workspace };
  workspaces_update: { args: { id: string; patch: WorkspacePatch }; result: Workspace };
  workspaces_set_archived: { args: { id: string; archived: boolean }; result: Workspace };
  workspaces_delete: {
    args: { id: string; deletion: WorkspaceDeletion };
    result: WorkspaceDeletionReport;
  };
  dashboard_overview: { args: undefined; result: DashboardOverview };
  timeline_list: { args: { query: TimelineQuery }; result: TimelineEvent[] };
}

export type CommandName = keyof CommandSignatures;
type CommandArgs<C extends CommandName> = CommandSignatures[C]['args'];
type CommandResult<C extends CommandName> = CommandSignatures[C]['result'];

/** Error codes of the native core, plus the two raised on the interface side. */
export type CommandErrorCode = ErrorCode | 'native_runtime_unavailable' | 'unknown';

const NATIVE_ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'invalid_input',
  'not_found',
  'name_taken',
  'in_use',
  'stale_revision',
  'duplicate_content',
  'database_unavailable',
  'database_too_new',
  'migration_failed',
  'storage',
  'database',
  'io',
  'internal',
]);

/** Error raised when a native command fails or when the native runtime is not available. */
export class CommandError extends Error {
  readonly command: CommandName;
  readonly code: CommandErrorCode;

  constructor(
    command: CommandName,
    code: CommandErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CommandError';
    this.command = command;
    this.code = code;
  }
}

/** True when the interface runs inside the ARCHIVE desktop application (or a test double of it). */
export function isNativeRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const internals = (window as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
}

function readErrorCode(error: unknown): CommandErrorCode {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    if (typeof code === 'string' && NATIVE_ERROR_CODES.has(code)) {
      return code as ErrorCode;
    }
  }
  return 'unknown';
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown error';
}

/** Calls a native command. Every data access of the interface goes through this function. */
export async function callCommand<C extends CommandName>(
  command: C,
  ...args: CommandArgs<C> extends undefined ? [] : [CommandArgs<C>]
): Promise<CommandResult<C>> {
  if (!isNativeRuntime()) {
    throw new CommandError(
      command,
      'native_runtime_unavailable',
      `The "${command}" command requires the ARCHIVE desktop runtime.`,
    );
  }
  try {
    return await invoke<CommandResult<C>>(command, args[0]);
  } catch (error) {
    throw new CommandError(command, readErrorCode(error), readErrorMessage(error), {
      cause: error,
    });
  }
}

export function isCommandError(error: unknown): error is CommandError {
  return error instanceof CommandError;
}
