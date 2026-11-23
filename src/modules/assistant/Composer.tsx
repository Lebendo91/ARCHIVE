import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Send,
  Square,
  StickyNote,
  X,
} from 'lucide-react';
import { Button, Dialog, DialogContent, Select } from '@/components/ui';
import { ResourcePicker } from '@/components/resources/ResourcePicker';
import { formatNumber, useI18n } from '@/i18n';
import {
  useAssistantPreview,
  type AiProviderView,
  type AssistantScope,
  type SourcePassage,
} from '@/services/ai';
import { useDocument, useNote, useWorkspaces } from '@/services/queries';
import { cn } from '@/utils/cn';

const PREVIEW_DELAY_MS = 400;

function ScopeChip({
  kind,
  id,
  knownTitle,
  onRemove,
}: {
  kind: 'document' | 'note';
  id: string;
  knownTitle: string | undefined;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const document = useDocument(id, { enabled: kind === 'document' && knownTitle === undefined });
  const note = useNote(id, { enabled: kind === 'note' && knownTitle === undefined });
  const title =
    knownTitle ??
    (kind === 'document' ? document.data?.document.title : note.data?.note.title) ??
    t('assistant.scope.unavailable');
  const Icon = kind === 'document' ? FileText : StickyNote;
  return (
    <li className="flex items-center gap-1 rounded-control border border-line bg-steel py-0.5 pr-0.5 pl-2 text-xs text-fg">
      <Icon size={12} aria-hidden="true" className="text-fg-secondary" />
      <span className="max-w-48 truncate">{title}</span>
      <button
        type="button"
        className="rounded-sm p-0.5 text-fg-secondary hover:text-fg focus-visible:outline-2 focus-visible:outline-blue"
        aria-label={t('assistant.scope.remove', { title })}
        onClick={onRemove}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </li>
  );
}

function PassageList({ passages }: { passages: readonly SourcePassage[] }) {
  const { t } = useI18n();
  return (
    <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto">
      {passages.map((passage) => (
        <li key={passage.index} className="text-xs text-fg-secondary">
          <span className="font-mono text-cyan">S{passage.index}</span>{' '}
          <span className="text-fg">{passage.title}</span>
          {passage.page !== null && <> · {t('assistant.citation.page', { page: passage.page })}</>}
          {' · '}
          {passage.excerpt}
        </li>
      ))}
    </ol>
  );
}

/** What the question would send, computed while the user types (the same passages leave on sending). */
function SendPreview({
  conversationId,
  question,
  scope,
  provider,
}: {
  conversationId: string | null;
  question: string;
  scope: AssistantScope;
  provider: AiProviderView;
}) {
  const { t, tCount, locale } = useI18n();
  const [settled, setSettled] = useState(question);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(question);
    }, PREVIEW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [question]);
  const shared = scope.items.length > 0 || scope.workspaceId !== null;
  const typed = settled.trim() !== '';
  const preview = useAssistantPreview(
    {
      ...(conversationId === null ? {} : { conversationId }),
      question: settled,
      scope,
    },
    typed && shared,
  );
  const data = preview.data;
  const passages = data?.passages ?? [];

  let summary: string;
  if (!typed) {
    summary = t('assistant.preview.waiting');
  } else if (!shared) {
    summary = t('assistant.preview.nothingShared');
  } else if (data === undefined) {
    summary = t('assistant.preview.waiting');
  } else if (passages.length === 0) {
    summary = t('assistant.preview.noMatch');
  } else {
    summary = tCount('assistant.preview.passages', passages.length, {
      chars: formatNumber(data.chars, locale),
    });
  }

  return (
    <section
      aria-label={t('assistant.preview.title', { provider: provider.displayName })}
      className="flex flex-col gap-2 rounded-control border border-line px-3 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-secondary" aria-live="polite">
          <span className="font-medium text-fg">
            {t('assistant.preview.title', { provider: provider.displayName })}
          </span>{' '}
          · {summary}
          {data !== undefined && typed && data.historyMessages > 0 && (
            <> {tCount('assistant.preview.history', data.historyMessages)}</>
          )}
        </p>
        {typed && passages.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            className="flex items-center gap-1 text-xs text-blue hover:underline focus-visible:outline-2 focus-visible:outline-blue"
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
            {open ? t('assistant.preview.hide') : t('assistant.preview.show')}
          </button>
        )}
      </div>
      {open && typed && passages.length > 0 && <PassageList passages={passages} />}
    </section>
  );
}

/** The shared context, the preview of what will be sent, and the question. */
export function Composer({
  conversationId,
  scope,
  onScopeChange,
  providers,
  provider,
  onProviderChange,
  busy,
  stopping,
  sending,
  onSend,
  onStop,
}: {
  conversationId: string | null;
  scope: AssistantScope;
  onScopeChange: (scope: AssistantScope) => void;
  providers: readonly AiProviderView[];
  provider: AiProviderView;
  onProviderChange: (id: string) => void;
  /** An answer is being written in this conversation. */
  busy: boolean;
  stopping: boolean;
  sending: boolean;
  onSend: (question: string) => Promise<boolean>;
  onStop: () => void;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [picking, setPicking] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const pickerRef = useRef<HTMLInputElement>(null);
  const questionId = useId();
  const workspaces = useWorkspaces();
  const ready = providers.filter((candidate) => candidate.model !== '' && candidate.key !== null);

  const send = () => {
    const text = question.trim();
    if (text === '' || busy || sending) {
      return;
    }
    void onSend(text).then((sent) => {
      if (sent) {
        setQuestion('');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-carbon px-6 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('assistant.scope.title')}
          </span>
          <Select
            label={t('assistant.scope.workspace')}
            hideLabel
            className="h-7 w-52 text-xs"
            value={scope.workspaceId ?? ''}
            onChange={(event) => {
              onScopeChange({
                ...scope,
                workspaceId: event.target.value === '' ? null : event.target.value,
              });
            }}
          >
            <option value="">{t('assistant.scope.noWorkspace')}</option>
            {(workspaces.data ?? [])
              .map((summary) => summary.workspace)
              .filter((workspace) => !workspace.isArchived || workspace.id === scope.workspaceId)
              .map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
          </Select>
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setPicking(true);
            }}
          >
            {t('assistant.scope.chooseItems')}
          </Button>
          {(scope.items.length > 0 || scope.workspaceId !== null) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onScopeChange({ items: [], workspaceId: null });
              }}
            >
              {t('assistant.scope.clear')}
            </Button>
          )}
        </div>
        {scope.items.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label={t('assistant.scope.title')}>
            {scope.items.map((item) => (
              <ScopeChip
                key={`${item.kind}:${item.id}`}
                kind={item.kind}
                id={item.id}
                knownTitle={titles[`${item.kind}:${item.id}`]}
                onRemove={() => {
                  onScopeChange({
                    ...scope,
                    items: scope.items.filter(
                      (other) => other.kind !== item.kind || other.id !== item.id,
                    ),
                  });
                }}
              />
            ))}
          </ul>
        ) : (
          scope.workspaceId === null && (
            <p className="text-xs text-fg-secondary">{t('assistant.scope.none')}</p>
          )
        )}
      </div>

      <SendPreview
        conversationId={conversationId}
        question={question}
        scope={scope}
        provider={provider}
      />

      <form
        className="flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={questionId} className="sr-only">
            {t('assistant.composer.label')}
          </label>
          <textarea
            id={questionId}
            rows={3}
            maxLength={8000}
            value={question}
            placeholder={t('assistant.composer.placeholder')}
            aria-describedby={`${questionId}-hint`}
            className={cn(
              'w-full resize-none rounded-control border border-line bg-obsidian px-3 py-2 text-sm text-fg transition-colors duration-150 ease-standard placeholder:text-fg-muted',
              'focus:border-blue focus:ring-1 focus:ring-blue focus-visible:outline-none enabled:hover:border-fg-disabled',
            )}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`${questionId}-hint`} className="text-2xs text-fg-secondary">
              {busy ? t('assistant.composer.busy') : t('assistant.composer.hint')}
            </p>
            {ready.length > 1 ? (
              <Select
                label={t('settings.ai.providersTitle')}
                hideLabel
                className="h-7 w-64 text-xs"
                value={provider.id}
                onChange={(event) => {
                  onProviderChange(event.target.value);
                }}
              >
                {ready.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName} · {candidate.model}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-2xs text-fg-secondary">
                {t('assistant.provider', { name: provider.displayName, model: provider.model })}
              </p>
            )}
          </div>
        </div>
        {busy ? (
          <Button variant="secondary" icon={Square} loading={stopping} onClick={onStop}>
            {t('assistant.composer.stop')}
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            icon={Send}
            loading={sending}
            disabled={question.trim() === ''}
            className={cn(sending && 'cursor-wait')}
          >
            {t('assistant.composer.send')}
          </Button>
        )}
      </form>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent
          title={t('assistant.scope.pickerTitle')}
          description={t('assistant.scope.pickerDescription')}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            pickerRef.current?.focus();
          }}
        >
          <ResourcePicker
            inputRef={pickerRef}
            onPick={(item) => {
              setTitles((current) => ({ ...current, [`${item.kind}:${item.id}`]: item.title }));
              if (!scope.items.some((other) => other.kind === item.kind && other.id === item.id)) {
                onScopeChange({
                  ...scope,
                  items: [...scope.items, { kind: item.kind, id: item.id }],
                });
              }
              setPicking(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
