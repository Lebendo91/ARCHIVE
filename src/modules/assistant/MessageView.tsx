import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Info,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button, Spinner } from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import type { ConversationMessage, LiveAnswer, SourcePassage } from '@/services/ai';
import { toast } from '@/stores/toasts';
import { AnswerContent, sourceRoute } from './AnswerContent';
import { analyzeAnswer, answerToCopy } from './answer';
import { providerErrorText } from './providerErrors';

export function QuestionView({ message }: { message: ConversationMessage }) {
  const { t } = useI18n();
  return (
    <article className="flex flex-col items-end gap-1" aria-label={t('assistant.message.you')}>
      <p className="max-w-[80%] rounded-card bg-steel px-4 py-3 text-sm whitespace-pre-wrap text-fg">
        {message.content}
      </p>
    </article>
  );
}

function SourcesList({ sources }: { sources: readonly SourcePassage[] }) {
  const { t, tCount } = useI18n();
  const [open, setOpen] = useState(false);
  if (sources.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-fit items-center gap-1 text-xs text-fg-secondary hover:text-fg focus-visible:outline-2 focus-visible:outline-blue"
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        {tCount('assistant.message.sources', sources.length)}
      </button>
      {open && (
        <ol className="flex flex-col gap-2">
          {sources.map((source) => {
            const Icon = source.kind === 'document' ? FileText : StickyNote;
            return (
              <li key={source.index}>
                <Link
                  to={sourceRoute(source)}
                  className="flex flex-col gap-1 rounded-control border border-line p-3 text-xs transition-colors duration-150 ease-standard hover:border-fg-disabled focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <span className="flex items-center gap-2 text-fg">
                    <span className="font-mono text-cyan">S{source.index}</span>
                    <Icon size={14} aria-hidden="true" className="text-fg-secondary" />
                    <span className="font-medium">{source.title}</span>
                    {source.page !== null && (
                      <span className="text-fg-secondary">
                        {t('assistant.citation.page', { page: source.page })}
                      </span>
                    )}
                  </span>
                  <span className="text-fg-secondary">{source.excerpt}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: string }) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  const color =
    tone === 'info' ? 'text-fg-secondary' : tone === 'warning' ? 'text-warning' : 'text-danger';
  return (
    <p className={`flex items-start gap-2 text-xs ${color}`}>
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** An answer of the assistant: its text with checked citations, where it comes from, and its actions. */
export function AnswerView({
  message,
  live,
  isLast,
  busy,
  onRegenerate,
}: {
  message: ConversationMessage;
  /** The same answer while it is being written. */
  live: LiveAnswer | null;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const { t, locale } = useI18n();
  const details = message.details;
  const sources = live?.sources ?? message.sources;
  const text = live?.text ?? message.content;
  const streaming = live !== null || message.status === 'streaming';
  const finish = details.finish;
  const model = live?.model ?? details.servedBy ?? details.model;
  const switched =
    live?.switched ??
    (details.declinedBy !== null && details.servedBy !== null
      ? { from: details.declinedBy, to: details.servedBy }
      : null);
  const complete = message.status === 'complete' && !streaming;
  const verified = complete ? analyzeAnswer(text, sources).verified.length : 0;
  const inputTokens = details.usage?.inputTokens ?? null;
  const outputTokens = details.usage?.outputTokens ?? null;

  const copy = () => {
    navigator.clipboard
      .writeText(answerToCopy(text))
      .then(() => {
        toast.success(t('assistant.message.copied'));
      })
      .catch(() => {
        toast.error(t('assistant.message.copyFailed'));
      });
  };

  return (
    <article
      className="flex flex-col gap-3"
      aria-label={t('assistant.message.assistant')}
      aria-busy={streaming}
    >
      {text !== '' && (
        <AnswerContent text={text} sources={sources} labelled={complete && sources.length > 0} />
      )}
      {streaming && (
        <p className="flex items-center gap-2 text-xs text-fg-secondary" role="status">
          <Spinner size={14} />
          {live?.stopping ? t('assistant.message.stopping') : t('assistant.message.writing')}
        </p>
      )}
      {!streaming && (
        <div className="flex flex-col gap-1">
          {message.status === 'interrupted' && (
            <Notice tone="warning">{t('assistant.message.interrupted')}</Notice>
          )}
          {message.status === 'refused' && (
            <Notice tone="warning">
              {finish?.kind === 'refused' && finish.explanation !== null
                ? `${t('assistant.message.refused')} ${t('assistant.message.refusedExplanation', { explanation: finish.explanation })}`
                : t('assistant.message.refused')}
            </Notice>
          )}
          {message.status === 'blocked' && (
            <Notice tone="warning">
              {t('assistant.message.blocked', {
                reason: finish?.kind === 'blocked' ? finish.reason : '',
              })}
            </Notice>
          )}
          {message.status === 'failed' && (
            <Notice tone="danger">
              {details.error
                ? `${t('assistant.message.failed')} ${providerErrorText(details.error, t)}`
                : t('assistant.message.failed')}
            </Notice>
          )}
          {complete && finish?.kind === 'max_tokens' && (
            <Notice tone="warning">{t('assistant.message.truncated')}</Notice>
          )}
          {complete && !details.scopeShared && (
            <Notice tone="info">{t('assistant.message.generalOnly')}</Notice>
          )}
          {complete && details.scopeShared && sources.length === 0 && (
            <Notice tone="info">{t('assistant.message.noSources')}</Notice>
          )}
          {complete && sources.length > 0 && verified === 0 && (
            <Notice tone="warning">{t('assistant.message.noCitation')}</Notice>
          )}
        </div>
      )}
      <SourcesList sources={sources} />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-secondary">
          {switched ? (
            <span>{t('assistant.message.switched', switched)}</span>
          ) : (
            model !== null && <span>{t('assistant.message.model', { model })}</span>
          )}
          {inputTokens !== null && outputTokens !== null && (
            <span>
              {t('assistant.message.usage', {
                input: formatNumber(inputTokens, locale),
                output: formatNumber(outputTokens, locale),
              })}
            </span>
          )}
          {details.historySent && <span>{t('assistant.message.historySent')}</span>}
        </p>
        {!streaming && (
          <div className="flex items-center gap-1">
            {text !== '' && (
              <Button variant="ghost" size="sm" icon={Copy} onClick={copy}>
                {t('assistant.message.copy')}
              </Button>
            )}
            {isLast && (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                disabled={busy}
                onClick={onRegenerate}
              >
                {message.status === 'complete'
                  ? t('assistant.message.regenerate')
                  : t('assistant.message.retry')}
              </Button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
