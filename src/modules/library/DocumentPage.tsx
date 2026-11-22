import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, FileX, FolderInput, Star, Tags } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { usePageTitle } from '@/app/router/pageTitle';
import { QueryError } from '@/components/feedback/QueryError';
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  IconButton,
  SectionCard,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { formatDateTime, formatFileSize, formatNumber, useI18n, type MessageKey } from '@/i18n';
import {
  documentKind,
  exportDocument,
  isImageKind,
  markDocumentOpened,
  openDocumentExternally,
  setDocumentFavorite,
  type DocumentDetail,
} from '@/services/documents';
import { errorMessageKey } from '@/services/errors';
import {
  queryKeys,
  refreshLibraryViews,
  useDocument,
  useFolders,
  useWorkspaces,
} from '@/services/queries';
import { isCommandError } from '@/services/tauri';
import { useDocumentDialogs } from '@/stores/documentDialogs';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import { DocumentActionsMenu } from './documentActions';
import { INDEXING_TONES, kindLabelKey, textStateMessage } from './documentFormat';
import { DocumentKindIcon } from './DocumentKindIcon';
import { CsvPreview, ImagePreview, JsonPreview, PdfViewer, TextPreview } from './DocumentPreview';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line-subtle py-2 last:border-b-0">
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className="text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

function metadataText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function metadataNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function DocumentInfo({ detail }: { detail: DocumentDetail }) {
  const { t, locale } = useI18n();
  const { document } = detail;
  const { metadata } = document;
  const kind = kindLabelKey(document);
  const pages = metadataNumber(metadata.pageCount);
  const width = metadataNumber(metadata.width);
  const height = metadataNumber(metadata.height);
  const sourceModified = metadataNumber(metadata.sourceModifiedAt);
  const author = metadataText(metadata.author);
  const declaredTitle = metadataText(metadata.documentTitle);
  const encoding = metadataText(metadata.encoding);
  const message: MessageKey | null = textStateMessage(document);
  return (
    <SectionCard title={t('library.detail.info')}>
      <dl className="-my-2 flex flex-col">
        <InfoRow label={t('library.detail.originalName')}>{document.originalFilename}</InfoRow>
        {kind ? <InfoRow label={t('library.detail.format')}>{t(kind)}</InfoRow> : null}
        <InfoRow label={t('library.detail.size')}>
          {formatFileSize(document.fileSize, locale)}
        </InfoRow>
        {pages !== null ? (
          <InfoRow label={t('library.detail.pages')}>{formatNumber(pages, locale)}</InfoRow>
        ) : null}
        {width !== null && height !== null ? (
          <InfoRow label={t('library.detail.dimensions')}>
            {t('library.detail.dimensionsValue', {
              width: formatNumber(width, locale),
              height: formatNumber(height, locale),
            })}
          </InfoRow>
        ) : null}
        {declaredTitle ? (
          <InfoRow label={t('library.detail.declaredTitle')}>{declaredTitle}</InfoRow>
        ) : null}
        {author ? <InfoRow label={t('library.detail.author')}>{author}</InfoRow> : null}
        <InfoRow label={t('library.detail.imported')}>
          {formatDateTime(new Date(document.importedAt), locale)}
        </InfoRow>
        {sourceModified !== null ? (
          <InfoRow label={t('library.detail.sourceModified')}>
            {formatDateTime(new Date(sourceModified), locale)}
          </InfoRow>
        ) : null}
        {document.lastOpenedAt !== null ? (
          <InfoRow label={t('library.detail.opened')}>
            {formatDateTime(new Date(document.lastOpenedAt), locale)}
          </InfoRow>
        ) : null}
        {encoding ? <InfoRow label={t('library.detail.encoding')}>{encoding}</InfoRow> : null}
        <InfoRow label={t('library.detail.textState')}>
          <span className="flex flex-col items-start gap-1">
            {isImageKind(documentKind(document)) && document.indexingStatus === 'completed' ? (
              <Badge>{t('library.noText')}</Badge>
            ) : (
              <Badge tone={INDEXING_TONES[document.indexingStatus]}>
                {t(`library.indexing.${document.indexingStatus}`)}
              </Badge>
            )}
            {message ? <span className="text-xs text-fg-secondary">{t(message)}</span> : null}
          </span>
        </InfoRow>
        <InfoRow label={t('library.detail.hash')}>
          <code className="font-mono text-xs break-all text-fg-secondary">
            {document.contentHash}
          </code>
        </InfoRow>
      </dl>
    </SectionCard>
  );
}

function LocationCard({ detail }: { detail: DocumentDetail }) {
  const { t } = useI18n();
  const { document } = detail;
  const workspaces = useWorkspaces();
  const folders = useFolders(document.workspaceId ?? undefined);
  const openDialog = useDocumentDialogs((state) => state.open);
  const workspace = workspaces.data?.find(
    (summary) => summary.workspace.id === document.workspaceId,
  )?.workspace;
  const folder = folders.data?.find((candidate) => candidate.id === document.folderId);
  return (
    <SectionCard
      title={t('library.detail.location')}
      actions={
        document.deletedAt === null ? (
          <Button
            size="sm"
            icon={FolderInput}
            onClick={(event) => {
              openDialog('move', document, event.currentTarget);
            }}
          >
            {t('library.actions.move')}
          </Button>
        ) : undefined
      }
    >
      <p className="text-sm text-fg">
        {workspace ? workspace.name : t('library.filters.unassigned')}
      </p>
      {workspace ? (
        <p className="text-xs text-fg-secondary">
          {folder ? folder.name : t('library.detail.noFolder')}
        </p>
      ) : null}
    </SectionCard>
  );
}

function TagsCard({ detail }: { detail: DocumentDetail }) {
  const { t } = useI18n();
  const openDialog = useDocumentDialogs((state) => state.open);
  return (
    <SectionCard
      title={t('library.detail.tags')}
      actions={
        detail.document.deletedAt === null ? (
          <Button
            size="sm"
            icon={Tags}
            onClick={(event) => {
              openDialog('tags', detail.document, event.currentTarget);
            }}
          >
            {t('library.actions.tags')}
          </Button>
        ) : undefined
      }
    >
      {detail.tags.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('library.detail.noTags')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {detail.tags.map((tag) => (
            <li key={tag.id}>
              <Badge>{tag.name}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

type PreviewMode = 'preview' | 'text';

function DocumentView({ detail }: { detail: DocumentDetail }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const { document } = detail;
  const kind = documentKind(document);
  const image = isImageKind(kind);
  // Formats whose preview differs from their extracted text offer both views; images have no text.
  const hasPreview = kind === 'pdf' || kind === 'csv' || kind === 'json' || image;
  const [mode, setMode] = useState<PreviewMode>('preview');
  const inTrash = document.deletedAt !== null;

  const run = (operation: () => Promise<unknown>, success?: string) => {
    operation()
      .then(async () => {
        await refreshLibraryViews(client);
        if (success) {
          toast.success(success);
        }
      })
      .catch((error: unknown) => {
        toast.error(t(errorMessageKey(error)));
      });
  };

  const dataText = kind === 'csv' || kind === 'json';
  let preview: ReactNode;
  if (!hasPreview) {
    preview = (
      <div className="flex flex-col gap-3">
        {kind === 'docx' ? (
          <p className="text-sm text-fg-secondary">{t('library.detail.previewUnavailable')}</p>
        ) : null}
        <TextPreview content={detail.content} />
      </div>
    );
  } else if (mode === 'text' && !image) {
    preview = <TextPreview content={detail.content} variant={dataText ? 'code' : 'prose'} />;
  } else if (kind === 'pdf') {
    preview = <PdfViewer key={document.id} document={document} />;
  } else if (kind === 'csv') {
    preview = <CsvPreview content={detail.content} title={document.title} />;
  } else if (kind === 'json') {
    preview = <JsonPreview key={document.id} document={document} content={detail.content} />;
  } else {
    preview = <ImagePreview key={document.id} document={document} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-x-5 gap-y-4">
        <div className="flex min-w-72 flex-1 items-start gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card border border-line-subtle bg-steel text-fg-secondary">
            <DocumentKindIcon document={document} size={24} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="font-display text-2xl font-semibold break-words text-fg">
              {document.title}
            </h2>
            {inTrash || document.isArchived ? (
              <div className="flex flex-wrap items-center gap-2">
                {inTrash ? <Badge tone="danger">{t('library.detail.inTrash')}</Badge> : null}
                {document.isArchived ? <Badge>{t('workspaces.archivedBadge')}</Badge> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inTrash ? null : (
            <>
              <Button
                icon={ExternalLink}
                onClick={() => {
                  run(() => openDocumentExternally(document.id));
                }}
              >
                {t('library.actions.openExternal')}
              </Button>
              <IconButton
                icon={Download}
                label={t('library.actions.export')}
                variant="secondary"
                onClick={() => {
                  exportDocument(document.id)
                    .then((saved) => {
                      if (saved) {
                        toast.success(t('library.toasts.exported'));
                      }
                    })
                    .catch((error: unknown) => {
                      toast.error(t(errorMessageKey(error)));
                    });
                }}
              />
              <IconButton
                icon={Star}
                label={t('library.favorite')}
                variant="secondary"
                aria-pressed={document.isFavorite}
                className={cn(document.isFavorite && '[&_svg]:fill-amber [&_svg]:text-amber')}
                onClick={() => {
                  run(
                    () => setDocumentFavorite(document.id, !document.isFavorite),
                    t(
                      document.isFavorite
                        ? 'library.toasts.unfavorited'
                        : 'library.toasts.favorited',
                    ),
                  );
                }}
              />
            </>
          )}
          <DocumentActionsMenu
            document={document}
            variant="secondary"
            exclude={['open', 'open-external', 'export', 'favorite']}
          />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-6">
        <section
          aria-label={t('library.detail.viewLabel')}
          className="col-span-2 flex min-w-0 flex-col gap-4"
        >
          {hasPreview && !image ? (
            <SegmentedControl
              label={t('library.detail.viewLabel')}
              value={mode}
              options={[
                { value: 'preview', label: t('library.detail.preview') },
                { value: 'text', label: t('library.detail.text') },
              ]}
              onChange={setMode}
              className="self-start"
            />
          ) : null}
          {preview}
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          <DocumentInfo detail={detail} />
          <LocationCard detail={detail} />
          <TagsCard detail={detail} />
          <SectionCard title={t('library.detail.related')}>
            <p className="text-sm text-fg-secondary">{t('library.detail.relatedUpcoming')}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** Page of a document (spec §7.4): preview, metadata, extracted text, location, tags and operations. */
export function DocumentPage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const { documentId = '' } = useParams();
  const detail = useDocument(documentId);
  usePageTitle(detail.data?.document.title);
  const exists = detail.isSuccess;

  // Opening the page counts as opening the document (« Recently opened »), once per visit.
  useEffect(() => {
    if (!exists) {
      return;
    }
    markDocumentOpened(documentId)
      .then(() =>
        Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.dashboard }),
          client.invalidateQueries({
            queryKey: queryKeys.documents,
            predicate: (query) => query.queryKey[1] !== 'detail',
          }),
        ]),
      )
      .catch(() => undefined);
  }, [client, documentId, exists]);

  if (detail.isError) {
    const missing =
      isCommandError(detail.error) &&
      (detail.error.code === 'not_found' || detail.error.code === 'invalid_input');
    if (!missing) {
      return (
        <QueryError
          error={detail.error}
          onRetry={() => {
            void detail.refetch();
          }}
        />
      );
    }
    return (
      <EmptyState
        icon={FileX}
        title={t('library.detail.notFoundTitle')}
        description={t('library.detail.notFoundDescription')}
        actions={
          <ButtonLink to="/library" icon={ArrowLeft}>
            {t('library.detail.back')}
          </ButtonLink>
        }
      />
    );
  }
  if (detail.isPending) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-12 w-96" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="col-span-2 h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      </div>
    );
  }
  return <DocumentView detail={detail.data} />;
}
