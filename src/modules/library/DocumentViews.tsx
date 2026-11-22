import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Card } from '@/components/ui';
import { formatFileSize, formatShortDate, useI18n, type MessageKey } from '@/i18n';
import type { Document, DocumentItem } from '@/services/documents';
import type { WorkspaceSummary } from '@/services/workspaces';
import { DocumentActionsMenu, DocumentContextMenu } from './documentActions';
import { INDEXING_TONES, kindLabelKey } from './documentFormat';
import { DocumentKindIcon } from './DocumentKindIcon';

function FavoriteMark() {
  const { t } = useI18n();
  return (
    <span className="inline-flex shrink-0 text-amber">
      <Star size={14} aria-hidden="true" fill="currentColor" />
      <span className="sr-only">{t('library.favorite')}</span>
    </span>
  );
}

/**
 * The state of a document's text, only when it deserves attention (waiting, failed, to check): a ready text,
 * or an image that has none by nature, shows nothing.
 */
export function IndexingBadge({ document }: { document: Document }) {
  const { t } = useI18n();
  if (document.indexingStatus === 'completed') {
    return null;
  }
  return (
    <Badge tone={INDEXING_TONES[document.indexingStatus]}>
      {t(`library.indexing.${document.indexingStatus}`)}
    </Badge>
  );
}

function workspaceName(
  workspaceId: string | null,
  workspaces: readonly WorkspaceSummary[],
  fallback: string,
): string {
  return (
    workspaces.find((summary) => summary.workspace.id === workspaceId)?.workspace.name ?? fallback
  );
}

/** Which date the views show: the one the documents are sorted by. */
export type DateColumn = 'imported' | 'updated' | 'opened';

const DATE_LABELS: Record<DateColumn, MessageKey> = {
  imported: 'library.columns.imported',
  updated: 'library.columns.updated',
  opened: 'library.columns.opened',
};

function dateOf(document: Document, column: DateColumn): number | null {
  if (column === 'updated') {
    return document.updatedAt;
  }
  return column === 'opened' ? document.lastOpenedAt : document.importedAt;
}

export interface DocumentViewProps {
  items: readonly DocumentItem[];
  workspaces: readonly WorkspaceSummary[];
  /** False when every document belongs to the same workspace (the Library filtered on one). */
  showWorkspace?: boolean;
  dateColumn?: DateColumn;
}

/** List view: one row per document, the title links to its page, right click opens its actions. */
export function DocumentTable({
  items,
  workspaces,
  showWorkspace = true,
  dateColumn = 'imported',
}: DocumentViewProps) {
  const { t, locale } = useI18n();
  return (
    <div className="overflow-hidden rounded-card border border-line-subtle bg-graphite">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line-subtle text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            <th scope="col" className="px-4 py-3">
              {t('library.columns.title')}
            </th>
            {showWorkspace ? (
              <th scope="col" className="w-48 px-4 py-3">
                {t('library.columns.workspace')}
              </th>
            ) : null}
            <th scope="col" className="w-24 px-4 py-3 text-right">
              {t('library.columns.size')}
            </th>
            <th scope="col" className="w-32 px-4 py-3">
              {t(DATE_LABELS[dateColumn])}
            </th>
            <th scope="col" className="w-14 px-2 py-3">
              <span className="sr-only">{t('library.columns.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ document }) => {
            const kind = kindLabelKey(document);
            const date = dateOf(document, dateColumn);
            return (
              <DocumentContextMenu key={document.id} document={document}>
                <tr className="border-b border-line-subtle transition-colors duration-150 last:border-b-0 hover:bg-steel/40">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <DocumentKindIcon
                        document={document}
                        size={18}
                        className="shrink-0 text-fg-secondary"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <Link
                            to={`/library/${document.id}`}
                            className="min-w-0 cursor-default truncate rounded-sm font-medium text-fg hover:text-blue"
                          >
                            {document.title}
                          </Link>
                          {document.isFavorite ? <FavoriteMark /> : null}
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-xs text-fg-secondary">
                            {kind ? `${t(kind)} · ` : ''}
                            {document.originalFilename}
                          </span>
                          <IndexingBadge document={document} />
                        </span>
                      </div>
                    </div>
                  </td>
                  {showWorkspace ? (
                    <td className="truncate px-4 py-3 text-fg-secondary">
                      {workspaceName(document.workspaceId, workspaces, t('library.noWorkspace'))}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 text-right text-fg-secondary tabular-nums">
                    {formatFileSize(document.fileSize, locale)}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {date === null
                      ? t('library.neverOpened')
                      : formatShortDate(new Date(date), locale)}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DocumentActionsMenu document={document} />
                  </td>
                </tr>
              </DocumentContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Grid view: one card per document; the title link covers the card, the menu sits above it. */
export function DocumentGrid({
  items,
  workspaces,
  showWorkspace = true,
  dateColumn = 'imported',
}: DocumentViewProps) {
  const { t, locale } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map(({ document, tags }) => {
        const kind = kindLabelKey(document);
        const date = dateOf(document, dateColumn);
        const details = [
          showWorkspace
            ? workspaceName(document.workspaceId, workspaces, t('library.noWorkspace'))
            : null,
          date === null
            ? t('library.dates.never')
            : t(`library.dates.${dateColumn}`, { date: formatShortDate(new Date(date), locale) }),
        ];
        return (
          <li key={document.id}>
            <DocumentContextMenu document={document}>
              <Card className="relative flex h-full flex-col gap-4 transition-colors duration-150 ease-standard focus-within:border-line hover:border-line hover:bg-steel/40">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel text-fg-secondary">
                    <DocumentKindIcon document={document} size={20} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <Link
                        to={`/library/${document.id}`}
                        className="min-w-0 cursor-default truncate rounded-sm font-medium text-fg after:absolute after:inset-0 after:rounded-card after:content-['']"
                      >
                        {document.title}
                      </Link>
                      {document.isFavorite ? <FavoriteMark /> : null}
                    </span>
                    <span className="truncate text-xs text-fg-secondary">
                      {[kind ? t(kind) : null, formatFileSize(document.fileSize, locale)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <div className="relative z-10 -mt-1 -mr-1">
                    <DocumentActionsMenu document={document} />
                  </div>
                </div>
                {document.indexingStatus !== 'completed' || tags.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <IndexingBadge document={document} />
                    {tags.slice(0, 3).map((tag) => (
                      <Badge key={tag.id}>{tag.name}</Badge>
                    ))}
                  </div>
                ) : null}
                <p className="mt-auto truncate text-xs text-fg-secondary">
                  {details.filter(Boolean).join(' · ')}
                </p>
              </Card>
            </DocumentContextMenu>
          </li>
        );
      })}
    </ul>
  );
}
