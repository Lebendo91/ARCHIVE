import type { LinkKind } from '@/types/bindings/LinkKind';
import type { LinkTarget } from '@/types/bindings/LinkTarget';
import type { LinkedResource } from '@/types/bindings/LinkedResource';
import type { MarkdownFile } from '@/types/bindings/MarkdownFile';
import type { NewNote } from '@/types/bindings/NewNote';
import type { Note } from '@/types/bindings/Note';
import type { NoteContent } from '@/types/bindings/NoteContent';
import type { NoteDetail } from '@/types/bindings/NoteDetail';
import type { NoteItem } from '@/types/bindings/NoteItem';
import type { NoteLocation } from '@/types/bindings/NoteLocation';
import type { NotePage } from '@/types/bindings/NotePage';
import type { NoteQuery } from '@/types/bindings/NoteQuery';
import type { NoteSort } from '@/types/bindings/NoteSort';
import type { NoteState } from '@/types/bindings/NoteState';
import type { NoteSummary } from '@/types/bindings/NoteSummary';
import type { Tag } from '@/types/bindings/Tag';
import { callCommand } from './tauri';

export type {
  LinkKind,
  LinkTarget,
  LinkedResource,
  MarkdownFile,
  NewNote,
  Note,
  NoteContent,
  NoteDetail,
  NoteItem,
  NoteLocation,
  NotePage,
  NoteQuery,
  NoteSort,
  NoteState,
  NoteSummary,
};

export function listNotes(query: NoteQuery): Promise<NotePage> {
  return callCommand('notes_list', { query });
}

export function getNote(id: string): Promise<NoteDetail> {
  return callCommand('notes_get', { id });
}

export function createNote(input: NewNote): Promise<Note> {
  return callCommand('notes_create', { input });
}

/** Saves a note edited from `revision`; rejected with `stale_revision` if it changed meanwhile. */
export function saveNote(
  id: string,
  revision: number,
  content: NoteContent,
  links: LinkTarget[],
): Promise<Note> {
  return callCommand('notes_save', { id, revision, content, links });
}

export function renameNote(id: string, title: string): Promise<Note> {
  return callCommand('notes_rename', { id, title });
}

export function duplicateNote(id: string, title: string): Promise<Note> {
  return callCommand('notes_duplicate', { id, title });
}

export function moveNote(id: string, location: NoteLocation): Promise<Note> {
  return callCommand('notes_move', { id, location });
}

export function setNoteFavorite(id: string, favorite: boolean): Promise<Note> {
  return callCommand('notes_set_favorite', { id, favorite });
}

export function setNoteArchived(id: string, archived: boolean): Promise<Note> {
  return callCommand('notes_set_archived', { id, archived });
}

export function setNoteTags(id: string, tagIds: string[]): Promise<Tag[]> {
  return callCommand('notes_set_tags', { id, tagIds });
}

export function trashNote(id: string): Promise<Note> {
  return callCommand('notes_trash', { id });
}

export function restoreNote(id: string): Promise<Note> {
  return callCommand('notes_restore', { id });
}

export function purgeNote(id: string): Promise<null> {
  return callCommand('notes_purge', { id });
}

export function markNoteOpened(id: string): Promise<null> {
  return callCommand('notes_mark_opened', { id });
}

/** Markdown files chosen in the native picker, with their text; `null` if the picker was closed. */
export function pickMarkdownFiles(): Promise<MarkdownFile[] | null> {
  return callCommand('notes_import_markdown_pick');
}

/** Writes the Markdown of a note where the user chooses; `false` if the dialog was closed. */
export function exportNoteMarkdown(id: string, markdown: string): Promise<boolean> {
  return callCommand('notes_export_markdown', { id, markdown });
}

/** Opens a web or e-mail address in the default application; the core refuses any other scheme. */
export function openExternalUrl(url: string): Promise<null> {
  return callCommand('app_open_url', { url });
}
