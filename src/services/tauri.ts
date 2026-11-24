import { invoke, type Channel } from '@tauri-apps/api/core';
import type { AiOverview } from '@/types/bindings/AiOverview';
import type { AiProviderView } from '@/types/bindings/AiProviderView';
import type { AssistantAsk } from '@/types/bindings/AssistantAsk';
import type { AssistantEvent } from '@/types/bindings/AssistantEvent';
import type { AssistantPreview } from '@/types/bindings/AssistantPreview';
import type { AssistantPreviewRequest } from '@/types/bindings/AssistantPreviewRequest';
import type { AssistantRegenerate } from '@/types/bindings/AssistantRegenerate';
import type { AssistantStarted } from '@/types/bindings/AssistantStarted';
import type { ConceptExtraction } from '@/types/bindings/ConceptExtraction';
import type { ConnectionTest } from '@/types/bindings/ConnectionTest';
import type { Conversation } from '@/types/bindings/Conversation';
import type { ConversationSummary } from '@/types/bindings/ConversationSummary';
import type { ProviderCreate } from '@/types/bindings/ProviderCreate';
import type { ProviderPatch } from '@/types/bindings/ProviderPatch';
import type { AppInfo } from '@/types/bindings/AppInfo';
import type { BackupCheck } from '@/types/bindings/BackupCheck';
import type { BackupOverview } from '@/types/bindings/BackupOverview';
import type { BackupProgress } from '@/types/bindings/BackupProgress';
import type { BackupRecord } from '@/types/bindings/BackupRecord';
import type { AppSettings } from '@/types/bindings/AppSettings';
import type { AppStatus } from '@/types/bindings/AppStatus';
import type { DashboardOverview } from '@/types/bindings/DashboardOverview';
import type { Document } from '@/types/bindings/Document';
import type { DocumentDetail } from '@/types/bindings/DocumentDetail';
import type { DocumentLocation } from '@/types/bindings/DocumentLocation';
import type { DocumentPage } from '@/types/bindings/DocumentPage';
import type { DocumentQuery } from '@/types/bindings/DocumentQuery';
import type { ErrorCode } from '@/types/bindings/ErrorCode';
import type { Folder } from '@/types/bindings/Folder';
import type { GraphData } from '@/types/bindings/GraphData';
import type { GraphQuery } from '@/types/bindings/GraphQuery';
import type { ImportProgress } from '@/types/bindings/ImportProgress';
import type { ImportSummary } from '@/types/bindings/ImportSummary';
import type { ImportTarget } from '@/types/bindings/ImportTarget';
import type { IntegrityReport } from '@/types/bindings/IntegrityReport';
import type { LinkTarget } from '@/types/bindings/LinkTarget';
import type { MarkdownFile } from '@/types/bindings/MarkdownFile';
import type { NewNote } from '@/types/bindings/NewNote';
import type { NewWorkspace } from '@/types/bindings/NewWorkspace';
import type { Note } from '@/types/bindings/Note';
import type { NoteContent } from '@/types/bindings/NoteContent';
import type { NoteDetail } from '@/types/bindings/NoteDetail';
import type { NoteLocation } from '@/types/bindings/NoteLocation';
import type { NotePage } from '@/types/bindings/NotePage';
import type { NoteQuery } from '@/types/bindings/NoteQuery';
import type { PdfExtraction } from '@/types/bindings/PdfExtraction';
import type { SettingsPatch } from '@/types/bindings/SettingsPatch';
import type { StorageFolder } from '@/types/bindings/StorageFolder';
import type { StorageOverview } from '@/types/bindings/StorageOverview';
import type { SearchHistoryEntry } from '@/types/bindings/SearchHistoryEntry';
import type { SearchRequest } from '@/types/bindings/SearchRequest';
import type { SearchResults } from '@/types/bindings/SearchResults';
import type { LinkKind } from '@/types/bindings/LinkKind';
import type { MemoryItem } from '@/types/bindings/MemoryItem';
import type { MemoryOverview } from '@/types/bindings/MemoryOverview';
import type { NewRelationInput } from '@/types/bindings/NewRelationInput';
import type { Relation } from '@/types/bindings/Relation';
import type { RelationDecision } from '@/types/bindings/RelationDecision';
import type { RelationView } from '@/types/bindings/RelationView';
import type { Tag } from '@/types/bindings/Tag';
import type { TagUsage } from '@/types/bindings/TagUsage';
import type { TimelinePage } from '@/types/bindings/TimelinePage';
import type { TimelineQuery } from '@/types/bindings/TimelineQuery';
import type { TokenColor } from '@/types/bindings/TokenColor';
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
  timeline_list: { args: { query: TimelineQuery }; result: TimelinePage };
  /** Clears the whole history (documents, notes and workspaces are not touched); returns the events removed. */
  timeline_clear: { args: undefined; result: number };
  documents_import_pick: {
    args: { target: ImportTarget; onProgress: Channel<ImportProgress> };
    result: ImportSummary | null;
  };
  documents_import_dropped: {
    args: { target: ImportTarget; onProgress: Channel<ImportProgress> };
    result: ImportSummary;
  };
  documents_import_retry: {
    args: { target: ImportTarget; onProgress: Channel<ImportProgress> };
    result: ImportSummary;
  };
  documents_import_cancel: { args: undefined; result: null };
  documents_list: { args: { query: DocumentQuery }; result: DocumentPage };
  documents_get: { args: { id: string }; result: DocumentDetail };
  documents_rename: { args: { id: string; title: string }; result: Document };
  documents_move: { args: { id: string; location: DocumentLocation }; result: Document };
  documents_set_favorite: { args: { id: string; favorite: boolean }; result: Document };
  documents_set_archived: { args: { id: string; archived: boolean }; result: Document };
  documents_set_tags: { args: { id: string; tagIds: string[] }; result: Tag[] };
  documents_trash: { args: { id: string }; result: Document };
  documents_restore: { args: { id: string }; result: Document };
  documents_purge: { args: { id: string }; result: null };
  documents_mark_opened: { args: { id: string }; result: null };
  documents_open_external: { args: { id: string }; result: null };
  documents_reveal: { args: { id: string }; result: null };
  documents_export: { args: { id: string }; result: boolean };
  /** Bytes of the managed copy (`length` ≤ 16 MiB), returned as binary. */
  documents_read_range: {
    args: { id: string; offset: number; length: number };
    result: ArrayBuffer;
  };
  documents_pending_extraction: { args: undefined; result: string[] };
  documents_save_extraction: { args: { id: string; extraction: PdfExtraction }; result: Document };
  folders_list: { args: { workspaceId: string }; result: Folder[] };
  folders_create: {
    args: { workspaceId: string; parentId: string | null; name: string };
    result: Folder;
  };
  folders_rename: { args: { id: string; name: string }; result: Folder };
  folders_delete: { args: { id: string }; result: null };
  /** Under another folder of the same workspace, or to the root (`null`); never inside itself. */
  folders_move: { args: { id: string; parentId: string | null }; result: Folder };
  tags_list: { args: undefined; result: Tag[] };
  tags_usage: { args: undefined; result: TagUsage[] };
  tags_create: { args: { name: string; color: TokenColor }; result: Tag };
  tags_rename: { args: { id: string; name: string }; result: Tag };
  tags_delete: { args: { id: string }; result: null };
  notes_list: { args: { query: NoteQuery }; result: NotePage };
  notes_get: { args: { id: string }; result: NoteDetail };
  notes_create: { args: { input: NewNote }; result: Note };
  /** Refused with `stale_revision` when the note changed since `revision`. */
  notes_save: {
    args: { id: string; revision: number; content: NoteContent; links: LinkTarget[] };
    result: Note;
  };
  notes_rename: { args: { id: string; title: string }; result: Note };
  notes_duplicate: { args: { id: string; title: string }; result: Note };
  notes_move: { args: { id: string; location: NoteLocation }; result: Note };
  notes_set_favorite: { args: { id: string; favorite: boolean }; result: Note };
  notes_set_archived: { args: { id: string; archived: boolean }; result: Note };
  notes_set_tags: { args: { id: string; tagIds: string[] }; result: Tag[] };
  notes_trash: { args: { id: string }; result: Note };
  notes_restore: { args: { id: string }; result: Note };
  notes_purge: { args: { id: string }; result: null };
  notes_mark_opened: { args: { id: string }; result: null };
  search_query: { args: { request: SearchRequest }; result: SearchResults };
  search_history_list: { args: { limit: number }; result: SearchHistoryEntry[] };
  search_history_record: { args: { query: string }; result: SearchHistoryEntry };
  search_history_delete: { args: { id: string }; result: null };
  search_history_clear: { args: undefined; result: null };
  memory_item: { args: { kind: LinkKind; id: string }; result: MemoryItem };
  /** Tries again the failed stages of an item. */
  memory_retry: { args: { kind: LinkKind; id: string }; result: MemoryItem };
  memory_overview: { args: undefined; result: MemoryOverview };
  /** Tries again every stage that failed or waits for the user; returns the number of jobs queued. */
  memory_retry_all: { args: undefined; result: number };
  relations_list: { args: { kind: LinkKind; id: string }; result: RelationView[] };
  relations_create: { args: { input: NewRelationInput }; result: Relation };
  relations_set_type: { args: { id: string; relationType: string }; result: Relation };
  relations_decide: { args: { id: string; decision: RelationDecision }; result: Relation };
  /** A relation found by the engine is rejected (never suggested again), one created by the user deleted. */
  relations_remove: { args: { id: string }; result: null };
  /** The knowledge graph, filtered and limited by the core before it is sent. */
  graph_load: { args: { query: GraphQuery }; result: GraphData };
  ai_overview: { args: undefined; result: AiOverview };
  ai_providers_create: { args: { input: ProviderCreate }; result: AiProviderView };
  ai_providers_update: { args: { id: string; patch: ProviderPatch }; result: AiProviderView };
  ai_providers_delete: { args: { id: string }; result: null };
  /** The only command that receives a key; none returns it. */
  ai_providers_set_key: { args: { id: string; key: string }; result: AiProviderView };
  ai_providers_remove_key: { args: { id: string }; result: AiProviderView };
  ai_providers_test: { args: { id: string }; result: ConnectionTest };
  assistant_conversations: { args: undefined; result: ConversationSummary[] };
  assistant_conversation: { args: { id: string }; result: Conversation };
  assistant_conversation_clear: { args: { id: string }; result: null };
  assistant_conversation_delete: { args: { id: string }; result: null };
  assistant_preview: { args: { request: AssistantPreviewRequest }; result: AssistantPreview };
  assistant_ask: {
    args: { ask: AssistantAsk; channel: Channel<AssistantEvent> };
    result: AssistantStarted;
  };
  assistant_regenerate: {
    args: { request: AssistantRegenerate; channel: Channel<AssistantEvent> };
    result: AssistantStarted;
  };
  assistant_stop: { args: { conversationId: string }; result: boolean };
  backup_overview: { args: undefined; result: BackupOverview };
  backup_create: { args: { onProgress: Channel<BackupProgress> }; result: BackupRecord | null };
  backup_verify: { args: { id: string }; result: BackupCheck };
  backup_open_file: { args: undefined; result: [BackupRecord | null, BackupCheck] | null };
  /** Restarts ARCHIVE when the backup can be restored; returns its problems otherwise. */
  backup_restore: { args: { id: string }; result: BackupCheck };
  backup_forget: { args: { id: string }; result: null };
  backup_reveal: { args: { id: string }; result: null };
  memory_extract_concepts: {
    args: { kind: LinkKind; id: string; providerId: string };
    result: ConceptExtraction;
  };
  /** `null` when the user closes the file picker without choosing. */
  notes_import_markdown_pick: { args: undefined; result: MarkdownFile[] | null };
  /** `false` when the user closes the save dialog. */
  notes_export_markdown: { args: { id: string; markdown: string }; result: boolean };
  /** Opens a web or e-mail address in the default application (other schemes are refused). */
  app_open_url: { args: { url: string }; result: null };
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
