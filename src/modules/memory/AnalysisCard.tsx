import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, Button, SectionCard, Skeleton } from '@/components/ui';
import {
  formatDate,
  formatRelativeTime,
  LOCALE_TAGS,
  useI18n,
  type Locale,
  type MessageKey,
} from '@/i18n';
import { INDEXING_TONES } from '@/modules/library/documentFormat';
import { useNow } from '@/hooks/useNow';
import { memoryItem, retryMemoryItem, type MemoryItem, type StageState } from '@/services/memory';
import type { LinkKind } from '@/services/notes';
import { queryKeys } from '@/services/queries';
import { toast } from '@/stores/toasts';

/** Name of a language in the interface's language (« français »), from its subtag. */
function languageName(code: string, locale: Locale): string {
  try {
    const name = new Intl.DisplayNames([LOCALE_TAGS[locale]], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(LOCALE_TAGS[locale]) + name.slice(1) : code;
  } catch {
    return code;
  }
}

const ERROR_CODES = new Set([
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

/**
 * What the failure of a background stage says, in words. The problems of the extraction are explained in the
 * document's information, not repeated here.
 */
function issueKey(stage: StageState): MessageKey | null {
  const issue = stage.issue;
  if (issue === null || stage.stage === 'extraction') {
    return null;
  }
  return ERROR_CODES.has(issue) ? (`errors.codes.${issue}` as MessageKey) : 'errors.codes.unknown';
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line-subtle py-2 last:border-b-0">
      <dt className="text-xs text-fg-secondary">{label}</dt>
      <dd className="text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

function Stages({ stages }: { stages: readonly StageState[] }) {
  const { t, locale } = useI18n();
  const now = useNow();
  return (
    <ol className="flex flex-col gap-2">
      {stages.map((stage) => {
        const issue = issueKey(stage);
        return (
          <li key={stage.stage} className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fg">{t(`memory.analysis.stages.${stage.stage}`)}</span>
              <Badge tone={INDEXING_TONES[stage.status]}>
                {t(`memory.analysis.statuses.${stage.status}`)}
              </Badge>
            </span>
            {issue ? <span className="text-xs text-fg-secondary">{t(issue)}</span> : null}
            {stage.retryAt !== null ? (
              <span className="text-xs text-fg-secondary">
                {t('memory.analysis.retryAt', {
                  time: formatRelativeTime(stage.retryAt, now.getTime(), locale),
                })}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Description({ item, kind }: { item: MemoryItem; kind: LinkKind }) {
  const { t, tCount, locale } = useI18n();
  const { profile } = item;
  if (!profile) {
    return null;
  }
  const language = profile.language
    ? t(
        profile.languageSource === 'declared'
          ? 'memory.analysis.declared'
          : 'memory.analysis.detected',
        { language: languageName(profile.language, locale) },
      )
    : t('memory.analysis.unknownLanguage');
  return (
    <dl className="-my-2 flex flex-col">
      <Row label={t('memory.analysis.language')}>{language}</Row>
      <Row label={t('memory.analysis.length')}>
        {`${tCount('memory.analysis.words', profile.words)} · ${tCount('memory.analysis.characters', profile.characters)}`}
      </Row>
      {kind === 'document' && profile.authoredAt !== null ? (
        <Row label={t('memory.analysis.authoredAt')}>
          {formatDate(new Date(profile.authoredAt), locale)}
        </Row>
      ) : null}
      {kind === 'document' && profile.revisedAt !== null ? (
        <Row label={t('memory.analysis.revisedAt')}>
          {formatDate(new Date(profile.revisedAt), locale)}
        </Row>
      ) : null}
    </dl>
  );
}

function Terms({ item }: { item: MemoryItem }) {
  const { t } = useI18n();
  const analysed = item.stages.find((stage) => stage.stage === 'analysis')?.status === 'completed';
  if (item.terms.length === 0) {
    return (
      <p className="text-sm text-fg-secondary">
        {analysed ? t('memory.analysis.noTerms') : t('memory.analysis.termsPending')}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {item.terms.map((term) => (
        <li key={term.term}>
          <Link
            to={`/search?q=${encodeURIComponent(term.label)}`}
            aria-label={t('memory.analysis.searchTerm', { term: term.label })}
            className="inline-flex h-6 cursor-default items-center rounded-full border border-line bg-steel px-2.5 text-xs text-fg transition-colors duration-150 ease-standard hover:border-fg-disabled hover:text-blue"
          >
            {term.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-medium text-fg-secondary">{children}</h4>;
}

/**
 * What the memory engine knows of a document or a note (specification §10): the status of each stage of its
 * processing, the description of its content, its distinctive terms and its concepts.
 */
export function AnalysisCard({
  kind,
  id,
  editable,
}: {
  kind: LinkKind;
  id: string;
  /** False in the trash: nothing is restarted. */
  editable: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const item = useQuery({
    queryKey: queryKeys.memoryItem(kind, id),
    queryFn: () => memoryItem(kind, id),
  });
  const retryable =
    editable &&
    (item.data?.stages ?? []).some(
      (stage) =>
        stage.stage !== 'extraction' &&
        (stage.status === 'failed' || stage.status === 'needs_attention'),
    );
  const retry = () => {
    retryMemoryItem(kind, id)
      .then((updated) => {
        client.setQueryData(queryKeys.memoryItem(kind, id), updated);
        toast.success(t('memory.analysis.retried'));
      })
      .catch(() => {
        toast.error(t('memory.analysis.retryFailed'));
      });
  };

  let content;
  if (item.isPending) {
    content = <Skeleton className="h-32 rounded-control" />;
  } else if (item.isError) {
    content = <p className="text-sm text-fg-secondary">{t('memory.analysis.unavailable')}</p>;
  } else {
    content = (
      <div className="flex flex-col gap-5">
        <Description item={item.data} kind={kind} />
        <div className="flex flex-col gap-2">
          <Subheading>{t('memory.analysis.terms')}</Subheading>
          <Terms item={item.data} />
        </div>
        <div className="flex flex-col gap-2">
          <Subheading>{t('memory.analysis.processing')}</Subheading>
          <Stages stages={item.data.stages} />
        </div>
        <div className="flex flex-col gap-2">
          <Subheading>{t('memory.analysis.concepts')}</Subheading>
          {item.data.concepts.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {item.data.concepts.map((concept) => (
                <li key={`${concept.conceptId}:${String(concept.page)}`}>
                  <Badge tone="intelligence">{concept.name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-secondary">{t('memory.analysis.conceptsUnavailable')}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <SectionCard
      title={t('memory.analysis.title')}
      actions={
        retryable ? (
          <Button size="sm" icon={RotateCcw} onClick={retry}>
            {t('memory.analysis.retry')}
          </Button>
        ) : undefined
      }
    >
      {content}
    </SectionCard>
  );
}
