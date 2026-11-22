import type { DashboardOverview } from '../types/bindings/DashboardOverview';
import type { Document } from '../types/bindings/Document';
import type { DocumentItem } from '../types/bindings/DocumentItem';
import type { DocumentQuery } from '../types/bindings/DocumentQuery';
import type { FileKind } from '../types/bindings/FileKind';
import type { Folder } from '../types/bindings/Folder';
import type { ImportFailure } from '../types/bindings/ImportFailure';
import type { ImportOutcome } from '../types/bindings/ImportOutcome';
import type { ImportProgress } from '../types/bindings/ImportProgress';
import type { ImportSummary } from '../types/bindings/ImportSummary';
import type { ImportTarget } from '../types/bindings/ImportTarget';
import type { LinkedResource } from '../types/bindings/LinkedResource';
import type { LinkKind } from '../types/bindings/LinkKind';
import type { LinkTarget } from '../types/bindings/LinkTarget';
import type { MarkdownFile } from '../types/bindings/MarkdownFile';
import type { Note } from '../types/bindings/Note';
import type { NoteContent } from '../types/bindings/NoteContent';
import type { NoteItem } from '../types/bindings/NoteItem';
import type { NoteQuery } from '../types/bindings/NoteQuery';
import type { NoteSummary } from '../types/bindings/NoteSummary';
import type { PdfExtraction } from '../types/bindings/PdfExtraction';
import type { ResourceCounts } from '../types/bindings/ResourceCounts';
import type { ResourceSummary } from '../types/bindings/ResourceSummary';
import type { Tag } from '../types/bindings/Tag';
import type { TimelineEvent } from '../types/bindings/TimelineEvent';
import type { TimelineEventType } from '../types/bindings/TimelineEventType';
import type { TokenColor } from '../types/bindings/TokenColor';
import type { Workspace } from '../types/bindings/Workspace';
import type { WorkspaceDeletion } from '../types/bindings/WorkspaceDeletion';
import type { WorkspaceDeletionReport } from '../types/bindings/WorkspaceDeletionReport';
import type { WorkspaceDetail } from '../types/bindings/WorkspaceDetail';
import type { WorkspaceSummary } from '../types/bindings/WorkspaceSummary';

/** A workspace held by the double, with notes and seeded documents counted only. */
export interface CoreDoubleWorkspace {
  workspace: Workspace;
  /** Resources that exist only as numbers (notes, and documents seeded without detail). */
  counts: ResourceCounts;
  /** Documents and notes of the workspace that are in the trash: not counted, but not deleted either. */
  trashed: number;
  /** Names of root folders seeded as numbers, to name the folder that gathers a deleted workspace. */
  rootFolders: string[];
}

/** A document of the double, with its bytes (base64) for the previews and its extracted text. */
export interface CoreDoubleDocument {
  document: Document;
  content: string | null;
  tagIds: string[];
  base64: string;
}

/** A note of the double: the note, its plain text, its tags and the targets of its internal links. */
export interface CoreDoubleNote {
  note: Note;
  contentText: string;
  tagIds: string[];
  links: LinkTarget[];
}

/** A file the next file picker (or drag and drop) returns. */
export interface CoreDoubleFile {
  name: string;
  /** Content as text (encoded in UTF-8)… */
  text?: string;
  /** …or as base64 bytes (PDF, images). */
  base64?: string;
  /** Failure the core reports for this file (an unreadable file, for example). */
  failure?: ImportFailure;
}

export interface CoreDoubleState {
  workspaces: CoreDoubleWorkspace[];
  /** Timeline, oldest first. */
  events: TimelineEvent[];
  /** Notes and seeded documents kept without workspace. */
  unassigned: { documents: number; notes: number };
  recentlyIndexed: number;
  recentlyOpened: ResourceSummary[];
  favorites: ResourceSummary[];
  documents: CoreDoubleDocument[];
  folders: Folder[];
  tags: Tag[];
  /** Files returned by the next file picker or drag and drop. */
  picks: CoreDoubleFile[];
  /** Files of the latest import that failed temporarily (they succeed when retried). */
  retryable: CoreDoubleFile[];
  notes: CoreDoubleNote[];
  /** Markdown files returned by the next Markdown file picker. */
  markdownPicks: MarkdownFile[];
  /** Notes exported as Markdown, in order. */
  exports: { id: string; markdown: string }[];
  /** Addresses opened in the default application, in order. */
  openedUrls: string[];
}

export type CoreDoubleHandler = (args: Record<string, unknown> | undefined) => unknown;

/**
 * In-memory stand-in for the workspace, Library, overview and timeline commands of the native core
 * (src-tauri/src), with the same rules: case-insensitive unique names, duplicates detected by content, the
 * filters and sorts of the Library, timeline events, deletion strategies, error codes. The unit tests call
 * it directly; the end-to-end fixture serializes it into the page, so its body must stay self-contained
 * (no reference to anything declared outside of it).
 */
export function createCoreDouble(
  initial: Partial<CoreDoubleState> | null,
  onChange?: (state: CoreDoubleState) => void,
): { handlers: Record<string, CoreDoubleHandler>; state: CoreDoubleState } {
  const NAME_MAX = 120;
  const DESCRIPTION_MAX = 2000;
  const DAY = 24 * 60 * 60 * 1000;
  const COLORS = ['amber', 'blue', 'cyan', 'purple', 'success', 'warning', 'danger', 'neutral'];
  const KINDS: Record<string, { kind: FileKind; extension: string; mime: string } | undefined> = {
    pdf: { kind: 'pdf', extension: 'pdf', mime: 'application/pdf' },
    docx: {
      kind: 'docx',
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    txt: { kind: 'text', extension: 'txt', mime: 'text/plain' },
    md: { kind: 'markdown', extension: 'md', mime: 'text/markdown' },
    markdown: { kind: 'markdown', extension: 'md', mime: 'text/markdown' },
    csv: { kind: 'csv', extension: 'csv', mime: 'text/csv' },
    json: { kind: 'json', extension: 'json', mime: 'application/json' },
    png: { kind: 'png', extension: 'png', mime: 'image/png' },
    jpg: { kind: 'jpeg', extension: 'jpg', mime: 'image/jpeg' },
    jpeg: { kind: 'jpeg', extension: 'jpg', mime: 'image/jpeg' },
    webp: { kind: 'webp', extension: 'webp', mime: 'image/webp' },
  };
  const EXTENSION_OF: Record<FileKind, string> = {
    pdf: 'pdf',
    docx: 'docx',
    text: 'txt',
    markdown: 'md',
    csv: 'csv',
    json: 'json',
    png: 'png',
    jpeg: 'jpg',
    webp: 'webp',
  };
  const state: CoreDoubleState = {
    workspaces: initial?.workspaces ?? [],
    events: initial?.events ?? [],
    unassigned: initial?.unassigned ?? { documents: 0, notes: 0 },
    recentlyIndexed: initial?.recentlyIndexed ?? 0,
    recentlyOpened: initial?.recentlyOpened ?? [],
    favorites: initial?.favorites ?? [],
    documents: initial?.documents ?? [],
    folders: initial?.folders ?? [],
    tags: initial?.tags ?? [],
    picks: initial?.picks ?? [],
    retryable: initial?.retryable ?? [],
    notes: initial?.notes ?? [],
    markdownPicks: initial?.markdownPicks ?? [],
    exports: initial?.exports ?? [],
    openedUrls: initial?.openedUrls ?? [],
  };

  const fail = (code: string, message: string): never => {
    // The native core rejects with its serialized error, a plain `{ code, message }` object.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw { code, message };
  };
  // Lengths in Unicode scalar values, like Rust's `chars().count()`.
  const length = (value: string) => Array.from(value).length;
  const nameKey = (name: string) => name.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
  const fold = (text: string) =>
    text.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const find = (id: unknown) =>
    state.workspaces.find((entry) => entry.workspace.id === id) ??
    fail('not_found', 'workspace not found');
  const findDocument = (id: unknown) =>
    state.documents.find((entry) => entry.document.id === id) ??
    fail('not_found', 'document not found');
  const findFolder = (id: unknown) =>
    state.folders.find((folder) => folder.id === id) ?? fail('not_found', 'folder not found');
  const cleanName = (value: unknown, max = NAME_MAX): string => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name === '' || length(name) > max || /\p{Cc}/u.test(name)) {
      fail('invalid_input', 'invalid name');
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
  const nextTime = () => Math.max(Date.now(), (state.events.at(-1)?.createdAt ?? 0) + 1);
  const record = (
    eventType: TimelineEventType,
    entity: {
      type: 'workspace' | 'document' | 'note';
      id: string;
      workspaceId: string | null;
      title: string;
    },
  ) => {
    state.events.push({
      id: crypto.randomUUID(),
      eventType,
      entityType: entity.type,
      entityId: entity.id,
      workspaceId: entity.workspaceId,
      description: entity.title,
      metadata: {},
      // Strictly increasing, like the order of the real timeline.
      createdAt: nextTime(),
      available: true,
    });
  };
  const available = (event: TimelineEvent): boolean => {
    if (event.entityType === 'workspace') {
      return state.workspaces.some((entry) => entry.workspace.id === event.entityId);
    }
    if (event.entityType === 'document') {
      return state.documents.some(
        (entry) => entry.document.id === event.entityId && entry.document.deletedAt === null,
      );
    }
    if (event.entityType === 'note') {
      return state.notes.some(
        (entry) => entry.note.id === event.entityId && entry.note.deletedAt === null,
      );
    }
    return false;
  };
  const latestEvents = (limit: number, workspaceId?: string, before?: number) =>
    state.events
      .filter((event) => workspaceId === undefined || event.workspaceId === workspaceId)
      .filter((event) => before === undefined || event.createdAt < before)
      .slice()
      .reverse()
      .slice(0, limit)
      .map((event) => ({ ...event, available: available(event) }));
  const changed = <T>(value: T): T => {
    onChange?.(state);
    return value;
  };
  const liveDocuments = (workspaceId: string | null) =>
    state.documents.filter(
      (entry) => entry.document.workspaceId === workspaceId && entry.document.deletedAt === null,
    );
  const liveNotes = (workspaceId: string | null) =>
    state.notes.filter(
      (entry) => entry.note.workspaceId === workspaceId && entry.note.deletedAt === null,
    );
  const countsOf = (entry: CoreDoubleWorkspace): ResourceCounts => ({
    documents: entry.counts.documents + liveDocuments(entry.workspace.id).length,
    notes: entry.counts.notes + liveNotes(entry.workspace.id).length,
    folders:
      entry.counts.folders +
      state.folders.filter((folder) => folder.workspaceId === entry.workspace.id).length,
  });
  const summary = (entry: CoreDoubleWorkspace): WorkspaceSummary => ({
    workspace: { ...entry.workspace },
    counts: countsOf(entry),
  });
  const resourceOf = (entry: CoreDoubleDocument): ResourceSummary => ({
    kind: 'document',
    id: entry.document.id,
    title: entry.document.title,
    workspaceId: entry.document.workspaceId,
    updatedAt: entry.document.updatedAt,
    lastOpenedAt: entry.document.lastOpenedAt,
    isFavorite: entry.document.isFavorite,
  });
  const visible = (entry: CoreDoubleDocument) =>
    entry.document.deletedAt === null && !entry.document.isArchived;
  const tagsOf = (entry: CoreDoubleDocument): Tag[] =>
    state.tags
      .filter((tag) => entry.tagIds.includes(tag.id))
      .sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  const touch = (entry: CoreDoubleDocument, changes: Partial<Document>) => {
    entry.document = { ...entry.document, ...changes, updatedAt: Date.now() };
    return { ...entry.document };
  };

  // --- Notes ------------------------------------------------------------------------------------------
  const findNote = (id: unknown) =>
    state.notes.find((entry) => entry.note.id === id) ?? fail('not_found', 'note not found');
  const noteTagsOf = (entry: CoreDoubleNote): Tag[] =>
    state.tags
      .filter((tag) => entry.tagIds.includes(tag.id))
      .sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
  const noteSummaryOf = (entry: CoreDoubleNote): NoteSummary => ({
    id: entry.note.id,
    title: entry.note.title,
    excerpt: entry.contentText.slice(0, 240),
    workspaceId: entry.note.workspaceId,
    folderId: entry.note.folderId,
    isFavorite: entry.note.isFavorite,
    isArchived: entry.note.isArchived,
    createdAt: entry.note.createdAt,
    updatedAt: entry.note.updatedAt,
    lastOpenedAt: entry.note.lastOpenedAt,
    deletedAt: entry.note.deletedAt,
  });
  const noteResourceOf = (entry: CoreDoubleNote): ResourceSummary => ({
    kind: 'note',
    id: entry.note.id,
    title: entry.note.title,
    workspaceId: entry.note.workspaceId,
    updatedAt: entry.note.updatedAt,
    lastOpenedAt: entry.note.lastOpenedAt,
    isFavorite: entry.note.isFavorite,
  });
  const noteVisible = (entry: CoreDoubleNote) =>
    entry.note.deletedAt === null && !entry.note.isArchived;
  /** Title and availability of a link target, or `null` once it no longer exists. */
  const linkedResource = (kind: LinkKind, id: string): LinkedResource | null => {
    if (kind === 'note') {
      const target = state.notes.find((entry) => entry.note.id === id);
      return target
        ? { kind, id, title: target.note.title, available: target.note.deletedAt === null }
        : null;
    }
    const target = state.documents.find((entry) => entry.document.id === id);
    return target
      ? { kind, id, title: target.document.title, available: target.document.deletedAt === null }
      : null;
  };
  /** Notes that link to a resource, trash excluded, by title. */
  const backlinksOf = (kind: LinkKind, id: string): LinkedResource[] =>
    state.notes
      .filter(
        (entry) =>
          entry.note.deletedAt === null &&
          entry.links.some((link) => link.kind === kind && link.id === id),
      )
      .sort((a, b) => fold(a.note.title).localeCompare(fold(b.note.title)))
      .map((entry) => ({
        kind: 'note' as const,
        id: entry.note.id,
        title: entry.note.title,
        available: true,
      }));
  /** Links kept for a note: existing targets, once each, never the note itself. */
  const cleanLinks = (noteId: string, links: unknown): LinkTarget[] => {
    const kept: LinkTarget[] = [];
    for (const link of Array.isArray(links) ? (links as LinkTarget[]) : []) {
      const duplicate = kept.some((other) => other.kind === link.kind && other.id === link.id);
      const self = link.kind === 'note' && link.id === noteId;
      if (!duplicate && !self && linkedResource(link.kind, link.id) !== null) {
        kept.push({ kind: link.kind, id: link.id });
      }
    }
    return kept;
  };
  const checkNoteContent = (value: unknown): NoteContent => {
    const content = (value ?? {}) as NoteContent;
    const title = typeof content.title === 'string' ? content.title.trim() : '';
    if (length(title) > 500) {
      fail('invalid_input', 'note title is too long');
    }
    if (content.contentFormat === 'tiptap-json') {
      let document: unknown;
      try {
        document = JSON.parse(content.content);
      } catch {
        fail('invalid_input', 'note content is not valid JSON');
      }
      if ((document as { type?: unknown } | null)?.type !== 'doc') {
        fail('invalid_input', 'note content must be a TipTap document');
      }
    }
    return { ...content, title };
  };
  const checkLocation = (workspaceId: unknown, folderId: unknown) => {
    if (folderId != null && workspaceId == null) {
      fail('invalid_input', 'a folder requires its workspace');
    }
    if (workspaceId != null) {
      find(workspaceId);
    }
    if (folderId != null && findFolder(folderId).workspaceId !== workspaceId) {
      fail('invalid_input', 'the folder belongs to another workspace');
    }
  };
  const noteEvent = (eventType: TimelineEventType, entry: CoreDoubleNote) => {
    record(eventType, {
      type: 'note',
      id: entry.note.id,
      workspaceId: entry.note.workspaceId,
      title: entry.note.title,
    });
  };
  const touchNote = (entry: CoreDoubleNote, changes: Partial<Note>) => {
    entry.note = { ...entry.note, ...changes, updatedAt: Date.now() };
    return { ...entry.note };
  };
  const newNote = (
    content: NoteContent,
    workspaceId: string | null,
    folderId: string | null,
  ): CoreDoubleNote => {
    const now = Date.now();
    const entry: CoreDoubleNote = {
      note: {
        id: crypto.randomUUID(),
        title: content.title,
        content: content.content,
        contentFormat: content.contentFormat,
        workspaceId,
        folderId,
        revision: 1,
        isFavorite: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        deletedAt: null,
      },
      contentText: content.contentText,
      tagIds: [],
      links: [],
    };
    state.notes.push(entry);
    return entry;
  };

  // --- Bytes and hashes -------------------------------------------------------------------------------
  const toBytes = (file: CoreDoubleFile): Uint8Array =>
    file.base64 !== undefined
      ? Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0))
      : new TextEncoder().encode(file.text ?? '');
  const toBase64 = (bytes: Uint8Array) => {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  };
  /** 64 hexadecimal characters derived from the content (FNV-1a with eight seeds), like a SHA-256. */
  const hashOf = (bytes: Uint8Array) => {
    let hex = '';
    for (let seed = 0; seed < 8; seed += 1) {
      let hash = (0x811c9dc5 ^ seed) >>> 0;
      for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
      }
      hex += hash.toString(16).padStart(8, '0');
    }
    return hex;
  };
  const flattenJson = (value: unknown, path: string, lines: string[]) => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        flattenJson(child, `${path}[${String(index)}]`, lines);
      });
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value).sort()) {
        flattenJson((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, lines);
      }
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      lines.push(`${path}: ${String(value)}`);
    }
  };

  // --- Imports ----------------------------------------------------------------------------------------
  const importOne = (file: CoreDoubleFile, target: ImportTarget): ImportOutcome => {
    if (file.failure) {
      if (['unreadable', 'storage', 'database'].includes(file.failure)) {
        state.retryable.push({ name: file.name, text: file.text, base64: file.base64 });
      }
      return { status: 'failed', reason: file.failure };
    }
    const extension = (file.name.split('.').at(-1) ?? '').toLowerCase();
    const type = file.name.includes('.') ? KINDS[extension] : undefined;
    if (!type) {
      return { status: 'failed', reason: 'unsupported' };
    }
    const bytes = toBytes(file);
    const hash = hashOf(bytes);
    const existing = state.documents.find(
      (entry) => entry.document.contentHash === hash && entry.document.deletedAt === null,
    );
    if (existing) {
      return {
        status: 'duplicate',
        existing: { id: existing.document.id, title: existing.document.title },
      };
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const text = file.text ?? '';
    let content: string | null = null;
    let status: Document['indexingStatus'] = 'completed';
    const metadata: Record<string, unknown> = { format: type.extension };
    if (type.kind === 'json') {
      try {
        const lines: string[] = [];
        flattenJson(JSON.parse(text), '', lines);
        content = lines.join('\n');
      } catch {
        status = 'failed';
        metadata.extractionIssue = 'invalid_json';
      }
    } else if (type.kind === 'pdf') {
      status = 'pending';
    } else if (type.kind === 'docx') {
      content = text || null;
      if (!content) {
        status = 'failed';
        metadata.extractionIssue = 'invalid_docx';
      }
    } else if (['text', 'markdown', 'csv'].includes(type.kind)) {
      content = text.replace(/\r\n?/g, '\n');
      metadata.encoding = 'utf-8';
    }
    const stem = file.name.slice(0, file.name.lastIndexOf('.')).trim() || file.name;
    const document: Document = {
      id,
      title: stem,
      originalFilename: file.name,
      storedFilename: `${id}.${type.extension}`,
      fileExtension: type.extension,
      mimeType: type.mime,
      fileSize: bytes.byteLength,
      contentHash: hash,
      workspaceId: target.workspaceId ?? null,
      folderId: target.folderId ?? null,
      indexingStatus: status,
      metadata,
      isFavorite: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      importedAt: now,
      lastOpenedAt: null,
      deletedAt: null,
    };
    state.documents.push({ document, content, tagIds: [], base64: toBase64(bytes) });
    record('document_imported', {
      type: 'document',
      id,
      workspaceId: document.workspaceId,
      title: document.title,
    });
    const issue =
      metadata.extractionIssue === 'invalid_json' || metadata.extractionIssue === 'invalid_docx'
        ? metadata.extractionIssue
        : null;
    return { status: 'imported', document: { ...document }, issue };
  };
  const runImport = (files: CoreDoubleFile[], args: Record<string, unknown> | undefined) => {
    const target = (args?.target ?? {}) as ImportTarget;
    if (target.folderId !== undefined && target.workspaceId === undefined) {
      fail('invalid_input', 'a folder requires its workspace');
    }
    if (target.workspaceId !== undefined) {
      find(target.workspaceId);
    }
    const channel = args?.onProgress as { onmessage?: (event: ImportProgress) => void } | undefined;
    const emit = (event: ImportProgress) => {
      channel?.onmessage?.(event);
    };
    emit({
      event: 'started',
      files: files.map((file, index) => ({
        index,
        name: file.name,
        size: toBytes(file).byteLength,
      })),
    });
    const result: ImportSummary = { imported: 0, duplicates: 0, failed: 0, cancelled: 0 };
    state.retryable = [];
    files.forEach((file, index) => {
      const outcome = importOne(file, target);
      if (outcome.status === 'imported') result.imported += 1;
      if (outcome.status === 'duplicate') result.duplicates += 1;
      if (outcome.status === 'failed') result.failed += 1;
      emit({ event: 'file', index, outcome });
    });
    emit({ event: 'finished', summary: result });
    return changed(result);
  };

  // --- Library queries --------------------------------------------------------------------------------
  const listDocuments = (query: DocumentQuery) => {
    if (query.limit < 1 || query.limit > 200) {
      fail('invalid_input', 'limit must be between 1 and 200');
    }
    const search = query.search?.trim() ? fold(query.search.trim()) : null;
    const extensions = query.kinds?.map((kind) => EXTENSION_OF[kind]) ?? null;
    const matches = state.documents.filter(({ document, tagIds }) => {
      const inState =
        query.state === 'trashed'
          ? document.deletedAt !== null
          : document.deletedAt === null && document.isArchived === (query.state === 'archived');
      return (
        inState &&
        (search === null ||
          fold(document.title).includes(search) ||
          fold(document.originalFilename).includes(search)) &&
        (query.workspace === undefined ||
          (query.workspace.kind === 'unassigned'
            ? document.workspaceId === null
            : document.workspaceId === query.workspace.id)) &&
        (query.folderId === undefined || document.folderId === query.folderId) &&
        (extensions === null ||
          extensions.length === 0 ||
          extensions.includes(document.fileExtension)) &&
        (query.tagId === undefined || tagIds.includes(query.tagId)) &&
        (!query.favoritesOnly || document.isFavorite) &&
        (!query.openedOnly || document.lastOpenedAt !== null) &&
        (query.importedAfter === undefined || document.importedAt >= query.importedAfter) &&
        (query.updatedAfter === undefined || document.updatedAt >= query.updatedAfter) &&
        (query.indexing === undefined || document.indexingStatus === query.indexing)
      );
    });
    const direction = query.descending ? -1 : 1;
    const key = (document: Document): string | number | null => {
      switch (query.sort) {
        case 'title':
          return fold(document.title);
        case 'imported_at':
          return document.importedAt;
        case 'updated_at':
          return document.updatedAt;
        case 'file_size':
          return document.fileSize;
        case 'last_opened_at':
          return document.lastOpenedAt;
      }
    };
    matches.sort((a, b) => {
      const left = key(a.document);
      const right = key(b.document);
      if (left === null || right === null) {
        // Never opened documents come last, whatever the direction.
        if (left !== right) return left === null ? 1 : -1;
      } else if (left !== right) {
        return (left < right ? -1 : 1) * direction;
      }
      return a.document.id < b.document.id ? -1 : 1;
    });
    const items: DocumentItem[] = matches
      .slice(query.offset, query.offset + query.limit)
      .map((entry) => ({ document: { ...entry.document }, tags: tagsOf(entry) }));
    return { items, total: matches.length };
  };

  const listNotes = (query: NoteQuery) => {
    if (query.limit < 1 || query.limit > 200) {
      fail('invalid_input', 'limit must be between 1 and 200');
    }
    const search = query.search?.trim() ? fold(query.search.trim()) : null;
    const matches = state.notes.filter((entry) => {
      const { note } = entry;
      const inState =
        query.state === 'trashed'
          ? note.deletedAt !== null
          : note.deletedAt === null && note.isArchived === (query.state === 'archived');
      return (
        inState &&
        (search === null ||
          fold(note.title).includes(search) ||
          fold(entry.contentText).includes(search)) &&
        (query.workspace === undefined ||
          (query.workspace.kind === 'unassigned'
            ? note.workspaceId === null
            : note.workspaceId === query.workspace.id)) &&
        (query.folderId === undefined || note.folderId === query.folderId) &&
        (query.tagId === undefined || entry.tagIds.includes(query.tagId)) &&
        (!query.favoritesOnly || note.isFavorite) &&
        (!query.openedOnly || note.lastOpenedAt !== null) &&
        (query.updatedAfter === undefined || note.updatedAt >= query.updatedAfter)
      );
    });
    const direction = query.descending ? -1 : 1;
    const key = (note: Note): string | number | null => {
      switch (query.sort) {
        case 'title':
          return fold(note.title);
        case 'created_at':
          return note.createdAt;
        case 'updated_at':
          return note.updatedAt;
        case 'last_opened_at':
          return note.lastOpenedAt;
      }
    };
    matches.sort((a, b) => {
      const left = key(a.note);
      const right = key(b.note);
      if (left === null || right === null) {
        if (left !== right) return left === null ? 1 : -1;
      } else if (left !== right) {
        return (left < right ? -1 : 1) * direction;
      }
      return a.note.id < b.note.id ? -1 : 1;
    });
    const items: NoteItem[] = matches
      .slice(query.offset, query.offset + query.limit)
      .map((entry) => ({ note: noteSummaryOf(entry), tags: noteTagsOf(entry) }));
    return { items, total: matches.length };
  };

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
        favorites: [
          ...state.documents
            .filter(
              (doc) =>
                visible(doc) &&
                doc.document.isFavorite &&
                doc.document.workspaceId === entry.workspace.id,
            )
            .map(resourceOf),
          ...state.notes
            .filter(
              (note) =>
                noteVisible(note) &&
                note.note.isFavorite &&
                note.note.workspaceId === entry.workspace.id,
            )
            .map(noteResourceOf),
          ...state.favorites.filter((item) => item.workspaceId === entry.workspace.id),
        ].slice(0, 6),
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
      record('workspace_created', {
        type: 'workspace',
        id: workspace.id,
        workspaceId: workspace.id,
        title: workspace.name,
      });
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
        record(archived ? 'resource_archived' : 'resource_restored', {
          type: 'workspace',
          id: entry.workspace.id,
          workspaceId: entry.workspace.id,
          title: entry.workspace.name,
        });
      }
      return changed({ ...entry.workspace });
    },
    workspaces_delete: (args) => {
      const entry = find(args?.id);
      const id = entry.workspace.id;
      const deletion = args?.deletion as WorkspaceDeletion;
      const counts = countsOf(entry);
      const allDocuments = state.documents.filter((doc) => doc.document.workspaceId === id);
      const allNotes = state.notes.filter((note) => note.note.workspaceId === id);
      const ownFolders = state.folders.filter((folder) => folder.workspaceId === id);
      const report: WorkspaceDeletionReport = {
        documents: counts.documents,
        notes: counts.notes,
        foldersMoved: 0,
        foldersRemoved: 0,
        containerFolder: null,
      };
      if (deletion.kind === 'empty') {
        if (
          counts.documents +
            counts.notes +
            counts.folders +
            entry.trashed +
            allDocuments.length +
            allNotes.length >
          0
        ) {
          fail('in_use', 'it still holds folders, documents or notes');
        }
      } else if (deletion.kind === 'move_to') {
        if (deletion.target === id) {
          fail('invalid_input', 'a workspace cannot be moved into itself');
        }
        const target = find(deletion.target);
        const taken = [
          ...target.rootFolders,
          ...state.folders
            .filter(
              (folder) => folder.workspaceId === target.workspace.id && folder.parentId === null,
            )
            .map((folder) => folder.name),
        ];
        let name = entry.workspace.name;
        for (let attempt = 2; taken.some((f) => nameKey(f) === nameKey(name)); attempt += 1) {
          name = `${entry.workspace.name} (${String(attempt)})`;
        }
        const now = Date.now();
        const container: Folder = {
          id: crypto.randomUUID(),
          workspaceId: target.workspace.id,
          parentId: null,
          name,
          createdAt: now,
          updatedAt: now,
        };
        for (const folder of ownFolders) {
          folder.workspaceId = target.workspace.id;
          folder.parentId ??= container.id;
        }
        state.folders.push(container);
        for (const doc of allDocuments) {
          doc.document = {
            ...doc.document,
            workspaceId: target.workspace.id,
            folderId: doc.document.folderId ?? container.id,
          };
        }
        for (const note of allNotes) {
          note.note = {
            ...note.note,
            workspaceId: target.workspace.id,
            folderId: note.note.folderId ?? container.id,
          };
        }
        target.counts = {
          documents: target.counts.documents + entry.counts.documents,
          notes: target.counts.notes + entry.counts.notes,
          folders: target.counts.folders + entry.counts.folders,
        };
        target.trashed += entry.trashed;
        report.foldersMoved = entry.counts.folders + ownFolders.length;
        report.containerFolder = container;
      } else {
        // Unassign: documents and notes stay, without workspace; folders are removed.
        state.unassigned = {
          documents: state.unassigned.documents + entry.counts.documents,
          notes: state.unassigned.notes + entry.counts.notes,
        };
        for (const doc of allDocuments) {
          doc.document = { ...doc.document, workspaceId: null, folderId: null };
        }
        for (const note of allNotes) {
          note.note = { ...note.note, workspaceId: null, folderId: null };
        }
        state.folders = state.folders.filter((folder) => folder.workspaceId !== id);
        report.foldersRemoved = entry.counts.folders + ownFolders.length;
      }
      state.workspaces = state.workspaces.filter((item) => item !== entry);
      return changed(report);
    },
    dashboard_overview: (): DashboardOverview => {
      const live = state.documents.filter((doc) => doc.document.deletedAt === null);
      const total = (key: 'documents' | 'notes') =>
        state.workspaces.reduce((sum, entry) => sum + entry.counts[key], state.unassigned[key]);
      const opened = live
        .filter((doc) => visible(doc) && doc.document.lastOpenedAt !== null)
        .sort((a, b) => (b.document.lastOpenedAt ?? 0) - (a.document.lastOpenedAt ?? 0))
        .map(resourceOf);
      const favorites = live
        .filter((doc) => visible(doc) && doc.document.isFavorite)
        .sort((a, b) => b.document.updatedAt - a.document.updatedAt)
        .map(resourceOf);
      const liveNoteEntries = state.notes.filter((note) => note.note.deletedAt === null);
      const openedNotes = liveNoteEntries
        .filter((note) => noteVisible(note) && note.note.lastOpenedAt !== null)
        .map(noteResourceOf);
      const favoriteNotes = liveNoteEntries
        .filter((note) => noteVisible(note) && note.note.isFavorite)
        .map(noteResourceOf);
      const byOpening = (a: ResourceSummary, b: ResourceSummary) =>
        (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
      const byUpdate = (a: ResourceSummary, b: ResourceSummary) => b.updatedAt - a.updatedAt;
      return {
        documents: total('documents') + live.length,
        notes: total('notes') + liveNoteEntries.length,
        workspaces: state.workspaces.filter((entry) => !entry.workspace.isArchived).length,
        recentlyIndexed:
          state.recentlyIndexed +
          live.filter(
            (doc) => doc.content !== null && doc.document.importedAt >= Date.now() - 7 * DAY,
          ).length,
        recentActivity: latestEvents(8),
        recentlyOpened: [
          ...[...opened, ...openedNotes].sort(byOpening),
          ...state.recentlyOpened,
        ].slice(0, 6),
        favorites: [...[...favorites, ...favoriteNotes].sort(byUpdate), ...state.favorites].slice(
          0,
          6,
        ),
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

    // --- Imports -------------------------------------------------------------------------------------
    documents_import_pick: (args) => {
      if (state.picks.length === 0) {
        return null;
      }
      const files = state.picks;
      state.picks = [];
      return runImport(files, args);
    },
    documents_import_dropped: (args) => {
      if (state.picks.length === 0) {
        fail('invalid_input', 'no recent drag and drop to import');
      }
      const files = state.picks;
      state.picks = [];
      return runImport(files, args);
    },
    documents_import_retry: (args) => {
      if (state.retryable.length === 0) {
        fail('invalid_input', 'no failed file to import again');
      }
      return runImport(state.retryable, args);
    },
    documents_import_cancel: () => null,

    // --- Documents -----------------------------------------------------------------------------------
    documents_list: (args) => listDocuments(args?.query as DocumentQuery),
    documents_get: (args) => {
      const entry = findDocument(args?.id);
      return {
        document: { ...entry.document },
        tags: tagsOf(entry),
        content: entry.content,
        linkedNotes: backlinksOf('document', entry.document.id),
      };
    },
    documents_rename: (args) =>
      changed(touch(findDocument(args?.id), { title: cleanName(args?.title, 500) })),
    documents_move: (args) => {
      const entry = findDocument(args?.id);
      const location = args?.location as { workspaceId: string | null; folderId: string | null };
      if (location.workspaceId === null && location.folderId !== null) {
        fail('invalid_input', 'a folder requires its workspace');
      }
      if (location.workspaceId !== null) {
        find(location.workspaceId);
      }
      if (
        location.folderId !== null &&
        findFolder(location.folderId).workspaceId !== location.workspaceId
      ) {
        fail('invalid_input', 'the folder belongs to another workspace');
      }
      return changed(
        touch(entry, { workspaceId: location.workspaceId, folderId: location.folderId }),
      );
    },
    documents_set_favorite: (args) => {
      const entry = findDocument(args?.id);
      const favorite = args?.favorite === true;
      const becomes = favorite && !entry.document.isFavorite;
      const document = touch(entry, { isFavorite: favorite });
      if (becomes) {
        record('resource_favorited', {
          type: 'document',
          id: document.id,
          workspaceId: document.workspaceId,
          title: document.title,
        });
      }
      return changed(document);
    },
    documents_set_archived: (args) => {
      const entry = findDocument(args?.id);
      const archived = args?.archived === true;
      const before = entry.document.isArchived;
      const document = touch(entry, { isArchived: archived });
      if (before !== archived) {
        record(archived ? 'resource_archived' : 'resource_restored', {
          type: 'document',
          id: document.id,
          workspaceId: document.workspaceId,
          title: document.title,
        });
      }
      return changed(document);
    },
    documents_set_tags: (args) => {
      const entry = findDocument(args?.id);
      const tagIds = (args?.tagIds ?? []) as string[];
      for (const tagId of tagIds) {
        if (!state.tags.some((tag) => tag.id === tagId)) fail('not_found', 'tag not found');
      }
      entry.tagIds = [...new Set(tagIds)];
      return changed(tagsOf(entry));
    },
    documents_trash: (args) => {
      const entry = findDocument(args?.id);
      if (entry.document.deletedAt !== null) fail('not_found', 'document not found');
      entry.document = { ...entry.document, deletedAt: Date.now() };
      return changed({ ...entry.document });
    },
    documents_restore: (args) => {
      const entry = findDocument(args?.id);
      const duplicate = state.documents.find(
        (other) =>
          other !== entry &&
          other.document.deletedAt === null &&
          other.document.contentHash === entry.document.contentHash,
      );
      if (duplicate) {
        fail('duplicate_content', 'a document with the same content already exists');
      }
      entry.document = { ...entry.document, deletedAt: null };
      return changed({ ...entry.document });
    },
    documents_purge: (args) => {
      const entry = findDocument(args?.id);
      if (entry.document.deletedAt === null) {
        fail('invalid_input', 'only a document in the trash can be deleted permanently');
      }
      state.documents = state.documents.filter((doc) => doc !== entry);
      return changed(null);
    },
    documents_mark_opened: (args) => {
      const entry = findDocument(args?.id);
      entry.document = { ...entry.document, lastOpenedAt: Date.now() };
      return changed(null);
    },
    documents_open_external: (args) => {
      findDocument(args?.id);
      return null;
    },
    documents_reveal: (args) => {
      findDocument(args?.id);
      return null;
    },
    documents_export: (args) => {
      findDocument(args?.id);
      return true;
    },
    documents_read_range: (args) => {
      const entry = findDocument(args?.id);
      const offset = Number(args?.offset ?? 0);
      const size = Number(args?.length ?? 0);
      if (size < 1 || size > 16 * 1024 * 1024) fail('invalid_input', 'invalid length');
      const bytes = Uint8Array.from(atob(entry.base64), (character) => character.charCodeAt(0));
      if (offset > bytes.byteLength) fail('invalid_input', 'offset beyond the end of the file');
      return bytes.slice(offset, offset + size).buffer;
    },
    documents_pending_extraction: () =>
      state.documents
        .filter(
          (doc) =>
            doc.document.fileExtension === 'pdf' &&
            doc.document.indexingStatus === 'pending' &&
            doc.document.deletedAt === null,
        )
        .map((doc) => doc.document.id),
    documents_save_extraction: (args) => {
      const entry = findDocument(args?.id);
      const extraction = args?.extraction as PdfExtraction;
      const metadata = { ...entry.document.metadata };
      delete metadata.extractionIssue;
      if (extraction.kind === 'text') {
        metadata.pageCount = extraction.pageCount;
        if (extraction.text.trim() === '') {
          metadata.extractionIssue = 'no_text_layer';
        } else {
          entry.content = extraction.text;
        }
        entry.document = { ...entry.document, indexingStatus: 'completed', metadata };
      } else {
        metadata.extractionIssue =
          extraction.reason === 'encrypted' ? 'encrypted_pdf' : 'invalid_pdf';
        entry.document = { ...entry.document, indexingStatus: 'failed', metadata };
      }
      return changed({ ...entry.document });
    },

    // --- Folders and tags ----------------------------------------------------------------------------
    folders_list: (args) => {
      find(args?.workspaceId);
      return state.folders.filter((folder) => folder.workspaceId === args?.workspaceId);
    },
    folders_create: (args) => {
      const workspace = find(args?.workspaceId);
      const parentId = (args?.parentId ?? null) as string | null;
      if (parentId !== null && findFolder(parentId).workspaceId !== workspace.workspace.id) {
        fail('invalid_input', 'the parent folder belongs to another workspace');
      }
      const name = cleanName(args?.name);
      if (
        state.folders.some(
          (folder) =>
            folder.workspaceId === workspace.workspace.id &&
            folder.parentId === parentId &&
            nameKey(folder.name) === nameKey(name),
        )
      ) {
        fail('name_taken', 'folder name already used');
      }
      const now = Date.now();
      const folder: Folder = {
        id: crypto.randomUUID(),
        workspaceId: workspace.workspace.id,
        parentId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      state.folders.push(folder);
      return changed({ ...folder });
    },
    folders_rename: (args) => {
      const folder = findFolder(args?.id);
      const name = cleanName(args?.name);
      if (
        state.folders.some(
          (other) =>
            other !== folder &&
            other.workspaceId === folder.workspaceId &&
            other.parentId === folder.parentId &&
            nameKey(other.name) === nameKey(name),
        )
      ) {
        fail('name_taken', 'folder name already used');
      }
      folder.name = name;
      folder.updatedAt = Date.now();
      return changed({ ...folder });
    },
    folders_delete: (args) => {
      const folder = findFolder(args?.id);
      const held =
        state.folders.filter((other) => other.parentId === folder.id).length +
        state.documents.filter((doc) => doc.document.folderId === folder.id).length +
        state.notes.filter((note) => note.note.folderId === folder.id).length;
      if (held > 0) {
        fail('in_use', 'folders, documents or notes are still inside');
      }
      state.folders = state.folders.filter((other) => other !== folder);
      return changed(null);
    },
    tags_list: () =>
      state.tags.slice().sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name))),
    tags_create: (args) => {
      const name = cleanName(args?.name, 64);
      if (state.tags.some((tag) => nameKey(tag.name) === nameKey(name))) {
        fail('name_taken', 'tag name already used');
      }
      const tag: Tag = {
        id: crypto.randomUUID(),
        name,
        color: checkColor(args?.color),
        createdAt: Date.now(),
      };
      state.tags.push(tag);
      return changed({ ...tag });
    },
    tags_rename: (args) => {
      const tag =
        state.tags.find((item) => item.id === args?.id) ?? fail('not_found', 'tag not found');
      tag.name = cleanName(args?.name, 64);
      return changed({ ...tag });
    },
    tags_delete: (args) => {
      if (!state.tags.some((tag) => tag.id === args?.id)) fail('not_found', 'tag not found');
      state.tags = state.tags.filter((tag) => tag.id !== args?.id);
      for (const doc of state.documents) {
        doc.tagIds = doc.tagIds.filter((id) => id !== args?.id);
      }
      for (const note of state.notes) {
        note.tagIds = note.tagIds.filter((id) => id !== args?.id);
      }
      return changed(null);
    },

    // --- Notes ---------------------------------------------------------------------------------------
    notes_list: (args) => listNotes(args?.query as NoteQuery),
    notes_get: (args) => {
      const entry = findNote(args?.id);
      return {
        note: { ...entry.note },
        tags: noteTagsOf(entry),
        links: entry.links
          .map((link) => linkedResource(link.kind, link.id))
          .filter((linked): linked is LinkedResource => linked !== null)
          .sort((a, b) => fold(a.title).localeCompare(fold(b.title))),
        backlinks: backlinksOf('note', entry.note.id),
      };
    },
    notes_create: (args) => {
      const input = (args?.input ?? {}) as {
        content: unknown;
        workspaceId?: string;
        folderId?: string;
        links?: unknown;
      };
      const content = checkNoteContent(input.content);
      checkLocation(input.workspaceId, input.folderId);
      const entry = newNote(content, input.workspaceId ?? null, input.folderId ?? null);
      entry.links = cleanLinks(entry.note.id, input.links);
      noteEvent('note_created', entry);
      return changed({ ...entry.note });
    },
    notes_save: (args) => {
      const entry = findNote(args?.id);
      if (entry.note.deletedAt !== null) {
        fail('invalid_input', 'a note in the trash cannot be edited');
      }
      if (args?.revision !== entry.note.revision) {
        fail('stale_revision', 'the note changed since this revision');
      }
      const content = checkNoteContent(args?.content);
      const lastEvent = state.events
        .filter((event) => event.entityType === 'note' && event.entityId === entry.note.id)
        .at(-1);
      touchNote(entry, {
        title: content.title,
        content: content.content,
        contentFormat: content.contentFormat,
        revision: entry.note.revision + 1,
      });
      entry.contentText = content.contentText;
      entry.links = cleanLinks(entry.note.id, args?.links);
      if (!lastEvent || Date.now() - lastEvent.createdAt >= 60 * 60 * 1000) {
        noteEvent('note_modified', entry);
      }
      return changed({ ...entry.note });
    },
    notes_rename: (args) => {
      const entry = findNote(args?.id);
      const title = typeof args?.title === 'string' ? args.title.trim() : '';
      if (length(title) > 500) {
        fail('invalid_input', 'note title is too long');
      }
      return changed(touchNote(entry, { title, revision: entry.note.revision + 1 }));
    },
    notes_duplicate: (args) => {
      const original = findNote(args?.id);
      if (original.note.deletedAt !== null) {
        fail('invalid_input', 'a note in the trash cannot be duplicated');
      }
      const copy = newNote(
        {
          title: typeof args?.title === 'string' ? args.title.trim() : '',
          content: original.note.content,
          contentFormat: original.note.contentFormat,
          contentText: original.contentText,
        },
        original.note.workspaceId,
        original.note.folderId,
      );
      copy.tagIds = [...original.tagIds];
      copy.links = cleanLinks(copy.note.id, original.links);
      noteEvent('note_created', copy);
      return changed({ ...copy.note });
    },
    notes_move: (args) => {
      const entry = findNote(args?.id);
      const location = (args?.location ?? {}) as {
        workspaceId: string | null;
        folderId: string | null;
      };
      checkLocation(location.workspaceId, location.folderId);
      return changed(
        touchNote(entry, { workspaceId: location.workspaceId, folderId: location.folderId }),
      );
    },
    notes_set_favorite: (args) => {
      const entry = findNote(args?.id);
      const favorite = args?.favorite === true;
      const wasFavorite = entry.note.isFavorite;
      const note = touchNote(entry, { isFavorite: favorite });
      if (favorite && !wasFavorite) {
        noteEvent('resource_favorited', entry);
      }
      return changed(note);
    },
    notes_set_archived: (args) => {
      const entry = findNote(args?.id);
      const archived = args?.archived === true;
      const wasArchived = entry.note.isArchived;
      const note = touchNote(entry, { isArchived: archived });
      if (archived !== wasArchived) {
        noteEvent(archived ? 'resource_archived' : 'resource_restored', entry);
      }
      return changed(note);
    },
    notes_set_tags: (args) => {
      const entry = findNote(args?.id);
      const ids = (args?.tagIds ?? []) as string[];
      for (const id of ids) {
        if (!state.tags.some((tag) => tag.id === id)) fail('not_found', 'tag not found');
      }
      entry.tagIds = [...new Set(ids)];
      return changed(noteTagsOf(entry));
    },
    notes_trash: (args) => {
      const entry = findNote(args?.id);
      if (entry.note.deletedAt !== null) fail('not_found', 'note not found');
      entry.note = { ...entry.note, deletedAt: Date.now() };
      return changed({ ...entry.note });
    },
    notes_restore: (args) => {
      const entry = findNote(args?.id);
      entry.note = { ...entry.note, deletedAt: null };
      return changed({ ...entry.note });
    },
    notes_purge: (args) => {
      const entry = findNote(args?.id);
      if (entry.note.deletedAt === null) {
        fail('invalid_input', 'only a note in the trash can be deleted permanently');
      }
      state.notes = state.notes.filter((note) => note !== entry);
      return changed(null);
    },
    notes_mark_opened: (args) => {
      const entry = findNote(args?.id);
      entry.note = { ...entry.note, lastOpenedAt: Date.now() };
      return changed(null);
    },
    notes_import_markdown_pick: () => {
      if (state.markdownPicks.length === 0) {
        return null;
      }
      const files = state.markdownPicks;
      state.markdownPicks = [];
      return changed(files);
    },
    notes_export_markdown: (args) => {
      const entry = findNote(args?.id);
      state.exports.push({ id: entry.note.id, markdown: String(args?.markdown) });
      return changed(true);
    },
    app_open_url: (args) => {
      const url = typeof args?.url === 'string' ? args.url : '';
      if (!/^(https?:\/\/[^/\s]+|mailto:)/.test(url)) {
        fail('invalid_input', 'only web and e-mail addresses can be opened');
      }
      state.openedUrls.push(url);
      return changed(null);
    },
  };
  return { handlers, state };
}

let seedSequence = 0;

function seedId(group: string): string {
  seedSequence += 1;
  return `00000000-0000-7000-${group}-${String(seedSequence).padStart(12, '0')}`;
}

/** Workspace to seed the double with, created `ageMs` ago. */
export function seedWorkspace(
  name: string,
  options: Partial<Omit<Workspace, 'name'>> & {
    counts?: Partial<ResourceCounts>;
    ageMs?: number;
  } = {},
): CoreDoubleWorkspace {
  const { counts, ageMs = 60 * 60 * 1000, ...workspace } = options;
  const createdAt = Date.now() - ageMs;
  return {
    workspace: {
      id: seedId('8000'),
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
    available: true,
  };
}

const SEED_KINDS: Record<string, { extension: string; mime: string } | undefined> = {
  pdf: { extension: 'pdf', mime: 'application/pdf' },
  docx: {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  txt: { extension: 'txt', mime: 'text/plain' },
  md: { extension: 'md', mime: 'text/markdown' },
  csv: { extension: 'csv', mime: 'text/csv' },
  json: { extension: 'json', mime: 'application/json' },
  png: { extension: 'png', mime: 'image/png' },
  jpg: { extension: 'jpg', mime: 'image/jpeg' },
};

/** Document to seed the double with: `fileName` gives its format; `content` is its extracted text. */
export function seedDocument(
  fileName: string,
  options: Partial<Document> & {
    content?: string | null;
    tagIds?: string[];
    base64?: string;
    ageMs?: number;
  } = {},
): CoreDoubleDocument {
  const {
    content = null,
    tagIds = [],
    base64 = '',
    ageMs = 60 * 60 * 1000,
    ...overrides
  } = options;
  const extension = fileName.split('.').at(-1) ?? 'txt';
  const kind = SEED_KINDS[extension] ?? { extension: 'txt', mime: 'text/plain' };
  const id = seedId('9000');
  const at = Date.now() - ageMs;
  return {
    document: {
      id,
      title: fileName.slice(0, fileName.lastIndexOf('.')),
      originalFilename: fileName,
      storedFilename: `${id}.${kind.extension}`,
      fileExtension: kind.extension,
      mimeType: kind.mime,
      fileSize: 2048,
      contentHash: id.replace(/-/g, '').padEnd(64, '0'),
      workspaceId: null,
      folderId: null,
      indexingStatus: 'completed',
      metadata: { format: kind.extension },
      isFavorite: false,
      isArchived: false,
      createdAt: at,
      updatedAt: at,
      importedAt: at,
      lastOpenedAt: null,
      deletedAt: null,
      ...overrides,
    },
    content,
    tagIds,
    base64,
  };
}

/** Folder to seed the double with, in `workspace` (under `parent` when given). */
export function seedFolder(
  workspace: CoreDoubleWorkspace,
  name: string,
  parent: Folder | null = null,
): Folder {
  const at = Date.now() - 24 * 60 * 60 * 1000;
  return {
    id: seedId('a000'),
    workspaceId: workspace.workspace.id,
    parentId: parent?.id ?? null,
    name,
    createdAt: at,
    updatedAt: at,
  };
}

/** Tag to seed the double with. */
export function seedTag(name: string, color: TokenColor = 'amber'): Tag {
  return { id: seedId('b000'), name, color, createdAt: Date.now() - 24 * 60 * 60 * 1000 };
}

/** TipTap document of plain paragraphs, the way the editor stores a simple note. */
export function noteDocument(...paragraphs: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) =>
      text === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text }] },
    ),
  });
}

/** Note to seed the double with, written `ageMs` ago; `text` gives its paragraphs (one per line). */
export function seedNote(
  title: string,
  options: Partial<Note> & {
    text?: string;
    tagIds?: string[];
    links?: LinkTarget[];
    ageMs?: number;
  } = {},
): CoreDoubleNote {
  const { text = '', tagIds = [], links = [], ageMs = 60 * 60 * 1000, ...overrides } = options;
  const id = seedId('c000');
  const at = Date.now() - ageMs;
  return {
    note: {
      id,
      title,
      content: noteDocument(...text.split('\n')),
      contentFormat: 'tiptap-json',
      workspaceId: null,
      folderId: null,
      revision: 1,
      isFavorite: false,
      isArchived: false,
      createdAt: at,
      updatedAt: at,
      lastOpenedAt: null,
      deletedAt: null,
      ...overrides,
    },
    contentText: text,
    tagIds,
    links,
  };
}

/** Event of a seeded note's creation, for the timeline. */
export function noteCreationEvent(entry: CoreDoubleNote): TimelineEvent {
  return {
    id: `event-${entry.note.id}`,
    eventType: 'note_created',
    entityType: 'note',
    entityId: entry.note.id,
    workspaceId: entry.note.workspaceId,
    description: entry.note.title,
    metadata: {},
    createdAt: entry.note.createdAt,
    available: true,
  };
}

/** Event of a seeded document's import, for the timeline. */
export function importEvent(entry: CoreDoubleDocument): TimelineEvent {
  return {
    id: `event-${entry.document.id}`,
    eventType: 'document_imported',
    entityType: 'document',
    entityId: entry.document.id,
    workspaceId: entry.document.workspaceId,
    description: entry.document.title,
    metadata: {},
    createdAt: entry.document.importedAt,
    available: true,
  };
}
