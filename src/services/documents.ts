import type { Document } from '@/types/bindings/Document';
import type { DocumentDetail } from '@/types/bindings/DocumentDetail';
import type { DocumentItem } from '@/types/bindings/DocumentItem';
import type { DocumentLocation } from '@/types/bindings/DocumentLocation';
import type { DocumentPage } from '@/types/bindings/DocumentPage';
import type { DocumentQuery } from '@/types/bindings/DocumentQuery';
import type { DocumentSort } from '@/types/bindings/DocumentSort';
import type { DocumentState } from '@/types/bindings/DocumentState';
import type { ExtractionIssue } from '@/types/bindings/ExtractionIssue';
import type { FileKind } from '@/types/bindings/FileKind';
import type { PdfExtraction } from '@/types/bindings/PdfExtraction';
import type { ProcessingStatus } from '@/types/bindings/ProcessingStatus';
import type { Tag } from '@/types/bindings/Tag';
import type { WorkspaceScope } from '@/types/bindings/WorkspaceScope';
import { callCommand } from './tauri';

export type {
  Document,
  DocumentDetail,
  DocumentItem,
  DocumentLocation,
  DocumentPage,
  DocumentQuery,
  DocumentSort,
  DocumentState,
  ExtractionIssue,
  FileKind,
  PdfExtraction,
  ProcessingStatus,
  WorkspaceScope,
};

/** Largest range read in one call (src-tauri/src/commands/documents.rs). */
export const READ_CHUNK_MAX = 16 * 1024 * 1024;

const KINDS_BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'markdown',
  csv: 'csv',
  json: 'json',
  png: 'png',
  jpg: 'jpeg',
  webp: 'webp',
};

/** Format of a document, from the extension of its managed copy. */
export function documentKind(document: Pick<Document, 'fileExtension'>): FileKind | null {
  return KINDS_BY_EXTENSION[document.fileExtension] ?? null;
}

export function isImageKind(kind: FileKind | null): boolean {
  return kind === 'png' || kind === 'jpeg' || kind === 'webp';
}

/** Why the text of a document is missing or partial, as recorded at extraction time. */
export function extractionIssue(document: Document): ExtractionIssue | null {
  const issue = document.metadata.extractionIssue;
  const known: readonly ExtractionIssue[] = [
    'truncated',
    'invalid_json',
    'invalid_docx',
    'invalid_pdf',
    'no_text_layer',
  ];
  return typeof issue === 'string' && (known as readonly string[]).includes(issue)
    ? (issue as ExtractionIssue)
    : null;
}

export function listDocuments(query: DocumentQuery): Promise<DocumentPage> {
  return callCommand('documents_list', { query });
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return callCommand('documents_get', { id });
}

export function renameDocument(id: string, title: string): Promise<Document> {
  return callCommand('documents_rename', { id, title });
}

export function moveDocument(id: string, location: DocumentLocation): Promise<Document> {
  return callCommand('documents_move', { id, location });
}

export function setDocumentFavorite(id: string, favorite: boolean): Promise<Document> {
  return callCommand('documents_set_favorite', { id, favorite });
}

export function setDocumentArchived(id: string, archived: boolean): Promise<Document> {
  return callCommand('documents_set_archived', { id, archived });
}

export function setDocumentTags(id: string, tagIds: string[]): Promise<Tag[]> {
  return callCommand('documents_set_tags', { id, tagIds });
}

export function trashDocument(id: string): Promise<Document> {
  return callCommand('documents_trash', { id });
}

export function restoreDocument(id: string): Promise<Document> {
  return callCommand('documents_restore', { id });
}

/** Deletes a document of the trash for good (entry and managed copy; never the original file). */
export function purgeDocument(id: string): Promise<null> {
  return callCommand('documents_purge', { id });
}

export function markDocumentOpened(id: string): Promise<null> {
  return callCommand('documents_mark_opened', { id });
}

export function openDocumentExternally(id: string): Promise<null> {
  return callCommand('documents_open_external', { id });
}

export function revealDocument(id: string): Promise<null> {
  return callCommand('documents_reveal', { id });
}

/** Saves a copy where the user chooses; `false` when the save dialog is cancelled. */
export function exportDocument(id: string): Promise<boolean> {
  return callCommand('documents_export', { id });
}

export function readDocumentRange(
  id: string,
  offset: number,
  length: number,
): Promise<ArrayBuffer> {
  return callCommand('documents_read_range', { id, offset, length });
}

/** The whole managed copy, read in bounded chunks. */
export async function readDocumentBytes(
  id: string,
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(size);
  let offset = 0;
  while (offset < size) {
    const chunk = new Uint8Array(
      await readDocumentRange(id, offset, Math.min(READ_CHUNK_MAX, size - offset)),
    );
    if (chunk.byteLength === 0) {
      break;
    }
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return offset === size ? bytes : bytes.slice(0, offset);
}

export function pendingExtractions(): Promise<string[]> {
  return callCommand('documents_pending_extraction');
}

export function saveExtraction(id: string, extraction: PdfExtraction): Promise<Document> {
  return callCommand('documents_save_extraction', { id, extraction });
}
