import { NotebookPen, Star } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui';
import { formatShortDate, useI18n, type MessageKey } from '@/i18n';
import type { NoteItem, NoteSort } from '@/services/notes';
import type { WorkspaceSummary } from '@/services/workspaces';
import { cn } from '@/utils/cn';
import { NoteActionsMenu, NoteContextMenu, useNoteTitle } from './noteActions';

/** The date shown for each note follows the sort. */
function dateOf(item: NoteItem['note'], sort: NoteSort): { key: MessageKey; at: number } | null {
  if (sort === 'created_at') {
    return { key: 'notes.created', at: item.createdAt };
  }
  if (sort === 'last_opened_at') {
    return item.lastOpenedAt === null ? null : { key: 'notes.opened', at: item.lastOpenedAt };
  }
  return { key: 'notes.modified', at: item.updatedAt };
}

function NoteRow({
  item,
  sort,
  workspaces,
  showWorkspace,
}: {
  item: NoteItem;
  sort: NoteSort;
  workspaces: readonly WorkspaceSummary[];
  showWorkspace: boolean;
}) {
  const { t, locale } = useI18n();
  const displayTitle = useNoteTitle();
  const { note, tags } = item;
  const date = dateOf(note, sort);
  const workspace = workspaces.find((summary) => summary.workspace.id === note.workspaceId);
  const details = [
    showWorkspace ? (workspace?.workspace.name ?? t('library.noWorkspace')) : null,
    date ? t(date.key, { date: formatShortDate(new Date(date.at), locale) }) : null,
  ].filter(Boolean);
  return (
    <NoteContextMenu note={note}>
      <li className="relative flex items-start gap-3 border-b border-line-subtle px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-steel/40">
        <NotebookPen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-secondary" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <Link
              to={`/notes/${note.id}`}
              className={cn(
                'min-w-0 cursor-default truncate rounded-sm font-medium hover:text-blue',
                note.title.trim() === '' ? 'text-fg-secondary italic' : 'text-fg',
              )}
            >
              {displayTitle(note)}
            </Link>
            {note.isFavorite ? (
              <span className="inline-flex shrink-0 text-amber">
                <Star size={14} aria-hidden="true" fill="currentColor" />
                <span className="sr-only">{t('library.favorite')}</span>
              </span>
            ) : null}
          </span>
          <p className="line-clamp-2 text-sm text-fg-secondary">
            {note.excerpt.trim() === '' ? t('notes.noExcerpt') : note.excerpt}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
            <span>{details.join(' · ')}</span>
            {tags.slice(0, 4).map((tag) => (
              <Badge key={tag.id}>{tag.name}</Badge>
            ))}
          </div>
        </div>
        <NoteActionsMenu note={note} />
      </li>
    </NoteContextMenu>
  );
}

/** Notes as a list: title, beginning of the text, place, date and tags; right click opens the actions. */
export function NoteList({
  items,
  sort = 'updated_at',
  workspaces,
  showWorkspace = true,
}: {
  items: readonly NoteItem[];
  sort?: NoteSort;
  workspaces: readonly WorkspaceSummary[];
  showWorkspace?: boolean;
}) {
  return (
    <ul className="overflow-hidden rounded-card border border-line-subtle bg-graphite">
      {items.map((item) => (
        <NoteRow
          key={item.note.id}
          item={item}
          sort={sort}
          workspaces={workspaces}
          showWorkspace={showWorkspace}
        />
      ))}
    </ul>
  );
}
