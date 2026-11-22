import type { JSONContent } from '@tiptap/core';
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { getNote, saveNote, type Note } from '@/services/notes';
import { isCommandError } from '@/services/tauri';
import { setPendingSave } from './closeGuard';
import { clearDraft, writeDraft } from './drafts';
import { collectLinks } from './noteContent';

/** Pause after the last change before saving. */
const DEBOUNCE_MS = 800;
/** Longest delay before a save while the user keeps typing. */
const MAX_WAIT_MS = 5000;
/** Delay before the recovery draft follows the latest change. */
const DRAFT_DELAY_MS = 1000;

/**
 * State shown to the user (spec §8.3). « saved » only after the core confirmed the write; « conflict » when the
 * note changed elsewhere since it was opened: nothing is overwritten until the user decides.
 */
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface NoteSnapshot {
  title: string;
  content: JSONContent;
  /** Plain text, for search and excerpts. */
  text: string;
}

interface Callbacks {
  /** Current title and content of the editor, or `null` while it is not ready. */
  read: () => NoteSnapshot | null;
  /** Called after each successful save. */
  onSaved?: (note: Note) => void;
}

/** Debounced, conflict-safe saving of one note, independent of React rendering. */
export class NoteAutosaver {
  readonly noteId: string;
  private readonly callbacks: RefObject<Callbacks>;
  private revision: number;
  private enabled: boolean;
  private dirty = false;
  private conflict = false;
  private saving: Promise<void> | null = null;
  private timer: number | undefined;
  private draftTimer: number | undefined;
  private firstChange: number | null = null;
  private status: SaveStatus = 'saved';
  private readonly listeners = new Set<() => void>();

  constructor(noteId: string, revision: number, enabled: boolean, callbacks: RefObject<Callbacks>) {
    this.noteId = noteId;
    this.revision = revision;
    this.enabled = enabled;
    this.callbacks = callbacks;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getStatus = (): SaveStatus => this.status;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** To call on every change of the title or the content. */
  changed = (): void => {
    if (!this.enabled) {
      return;
    }
    this.dirty = true;
    if (!this.conflict) {
      if (this.status !== 'saving') {
        this.setStatus('dirty');
      }
      this.schedule();
    }
    // The recovery draft follows the latest change, a moment later.
    window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      const snapshot = this.callbacks.current.read();
      if (snapshot && this.dirty) {
        writeDraft(this.noteId, {
          revision: this.revision,
          title: snapshot.title,
          content: snapshot.content,
          savedAt: Date.now(),
        });
      }
    }, DRAFT_DELAY_MS);
    this.declarePending();
  };

  /** Saves now what is pending (leaving the page, closing the window). */
  flush = async (): Promise<void> => {
    window.clearTimeout(this.timer);
    await this.run();
  };

  /** New attempt after a failed save. */
  retry = (): void => {
    this.dirty = true;
    void this.run();
  };

  /** Conflict: overwrites the version saved elsewhere with the one being edited. */
  keepMine = async (): Promise<void> => {
    const stored = await getNote(this.noteId);
    this.revision = stored.note.revision;
    this.conflict = false;
    this.dirty = true;
    await this.run();
  };

  /** Conflict or recovery: the editor now shows the version stored at `revision`. */
  reset = (revision: number): void => {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.draftTimer);
    this.revision = revision;
    this.dirty = false;
    this.conflict = false;
    this.firstChange = null;
    clearDraft(this.noteId);
    this.setStatus('saved');
    this.declarePending();
  };

  /** The editor is closing: pending changes are saved, and the window cannot close before that save ends. */
  dispose(): void {
    window.clearTimeout(this.draftTimer);
    if (this.dirty || this.saving) {
      const pending = this.flush();
      setPendingSave(this.noteId, () => pending);
      void pending.finally(() => {
        setPendingSave(this.noteId, null);
      });
    } else {
      setPendingSave(this.noteId, null);
    }
  }

  private setStatus(status: SaveStatus): void {
    if (this.status !== status) {
      this.status = status;
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  private declarePending(): void {
    setPendingSave(this.noteId, this.dirty || this.saving ? () => this.flush() : null);
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    const now = Date.now();
    this.firstChange ??= now;
    const wait = Math.min(DEBOUNCE_MS, Math.max(0, this.firstChange + MAX_WAIT_MS - now));
    this.timer = window.setTimeout(() => {
      void this.run();
    }, wait);
  }

  private async run(): Promise<void> {
    if (this.saving) {
      await this.saving;
    }
    if (!this.dirty || this.conflict || !this.enabled) {
      return;
    }
    const snapshot = this.callbacks.current.read();
    if (!snapshot) {
      return;
    }
    this.dirty = false;
    this.firstChange = null;
    window.clearTimeout(this.timer);
    this.setStatus('saving');
    const attempt = (async (): Promise<boolean> => {
      try {
        const note = await saveNote(
          this.noteId,
          this.revision,
          {
            title: snapshot.title,
            content: JSON.stringify(snapshot.content),
            contentFormat: 'tiptap-json',
            contentText: snapshot.text,
          },
          collectLinks(snapshot.content),
        );
        this.revision = note.revision;
        if (this.dirty) {
          this.setStatus('dirty');
        } else {
          window.clearTimeout(this.draftTimer);
          clearDraft(this.noteId);
          this.setStatus('saved');
        }
        this.callbacks.current.onSaved?.(note);
        return true;
      } catch (error) {
        this.dirty = true;
        if (isCommandError(error) && error.code === 'stale_revision') {
          this.conflict = true;
          this.setStatus('conflict');
        } else {
          this.setStatus('error');
        }
        return false;
      } finally {
        this.saving = null;
      }
    })();
    this.saving = attempt.then(() => undefined);
    this.declarePending();
    const succeeded = await attempt;
    this.declarePending();
    // Changes made during the save are saved in turn; after a failure, the user retries.
    if (succeeded && this.hasChangesToSave()) {
      this.schedule();
    }
  }

  /** Read through a method: the fields change while a save is awaited. */
  private hasChangesToSave(): boolean {
    return this.dirty && !this.conflict;
  }
}

export interface NoteAutosaveOptions extends Callbacks {
  noteId: string;
  /** Revision the editor was loaded from. */
  revision: number;
  /** False for a note in the trash: nothing is ever saved. */
  enabled: boolean;
}

export interface NoteAutosave {
  status: SaveStatus;
  saver: NoteAutosaver;
}

/**
 * Automatic saving of the note being edited (spec §8.3): debounced, by revision, with a visible status, a
 * recovery draft and a last save when the editor closes. One instance per note: key the editor by note.
 */
export function useNoteAutosave({
  noteId,
  revision,
  enabled,
  read,
  onSaved,
}: NoteAutosaveOptions): NoteAutosave {
  const callbacks = useRef<Callbacks>({ read, onSaved });
  useEffect(() => {
    callbacks.current = { read, onSaved };
  });
  const [saver] = useState(() => new NoteAutosaver(noteId, revision, enabled, callbacks));
  useEffect(() => {
    saver.setEnabled(enabled);
  }, [saver, enabled]);
  useEffect(
    () => () => {
      saver.dispose();
    },
    [saver],
  );
  const status = useSyncExternalStore(saver.subscribe, saver.getStatus);
  return { status, saver };
}
