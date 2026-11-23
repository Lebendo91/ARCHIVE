import { useEffect, useRef, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import {
  Eraser,
  MessageSquarePlus,
  MessageSquareText,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { ButtonLink, ConfirmDialog, EmptyState, IconButton, Skeleton } from '@/components/ui';
import { QueryError } from '@/components/feedback/QueryError';
import { formatRelativeTime, useI18n } from '@/i18n';
import {
  readyProvider,
  stopAnswer,
  useAiOverview,
  useAskAssistant,
  useClearConversation,
  useConversation,
  useConversations,
  useDeleteConversation,
  useLiveAnswers,
  useRegenerateAnswer,
  type AiProviderView,
  type AssistantScope,
  type Conversation,
} from '@/services/ai';
import { errorMessageKey } from '@/services/errors';
import { isNativeRuntime } from '@/services/tauri';
import { toast } from '@/stores/toasts';
import { cn } from '@/utils/cn';
import { Composer } from './Composer';
import { AnswerView, QuestionView } from './MessageView';

const EMPTY_SCOPE: AssistantScope = { items: [], workspaceId: null };

function ConversationList({ selected }: { selected: string | null }) {
  const { t, locale } = useI18n();
  const conversations = useConversations();
  const navigate = useNavigate();
  const now = useNow();
  return (
    <nav
      aria-label={t('assistant.conversations')}
      className="flex w-64 shrink-0 flex-col gap-3 border-r border-line bg-carbon p-3"
    >
      <ButtonLink to="/assistant" variant="primary" icon={MessageSquarePlus} className="w-full">
        {t('assistant.newConversation')}
      </ButtonLink>
      <h2 className="px-2 text-2xs font-semibold tracking-label text-fg-secondary uppercase">
        {t('assistant.conversations')}
      </h2>
      {conversations.isPending && isNativeRuntime() ? (
        <Skeleton className="h-24" />
      ) : (conversations.data ?? []).length === 0 ? (
        <p className="px-2 text-xs text-fg-secondary">{t('assistant.conversationsEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {(conversations.data ?? []).map((conversation) => {
            const active = conversation.id === selected;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  aria-label={t('assistant.openConversation', { title: conversation.title })}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-control px-2 py-2 text-left transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:outline-blue',
                    active ? 'bg-steel text-fg' : 'text-fg-secondary hover:bg-steel hover:text-fg',
                  )}
                  onClick={() => {
                    void navigate(`/assistant?c=${conversation.id}`);
                  }}
                >
                  <span className="w-full truncate text-sm">{conversation.title}</span>
                  <span className="text-2xs text-fg-secondary">
                    {formatRelativeTime(conversation.updatedAt, now.getTime(), locale)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function ConversationMessages({
  conversation,
  busy,
  onRegenerate,
}: {
  conversation: Conversation;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const live = useLiveAnswers((state) => state.answers[conversation.id] ?? null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAnswer = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const length = live?.text.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.messages.length, length]);
  return (
    <div className="flex flex-col gap-6">
      {conversation.messages.map((message) =>
        message.role === 'user' ? (
          <QuestionView key={message.id} message={message} />
        ) : (
          <AnswerView
            key={message.id}
            message={message}
            live={live?.answerId === message.id ? live : null}
            isLast={message.id === lastAnswer?.id}
            busy={busy}
            onRegenerate={onRegenerate}
          />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

function ProviderMissing({ provider }: { provider: AiProviderView | null }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      {provider === null ? (
        <EmptyState
          icon={MessageSquareText}
          iconTone="intelligence"
          title={t('assistant.noProvider.title')}
          description={t('assistant.noProvider.description')}
          actions={
            <ButtonLink to="/settings/ai" variant="primary" icon={Settings}>
              {t('assistant.noProvider.action')}
            </ButtonLink>
          }
        />
      ) : (
        <EmptyState
          icon={Settings}
          iconTone="intelligence"
          title={t('assistant.notReady.title')}
          description={t('assistant.notReady.description', { name: provider.displayName })}
          actions={
            <ButtonLink to="/settings/ai" variant="primary" icon={Settings}>
              {t('assistant.notReady.action')}
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}

/** AI assistant (specification §14): optional, grounded in what the user chooses to share. */
export function AssistantPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selected = params.get('c');
  const overview = useAiOverview();
  const conversation = useConversation(selected);
  const ask = useAskAssistant();
  const regenerate = useRegenerateAnswer();
  const clear = useClearConversation();
  const remove = useDeleteConversation();
  const live = useLiveAnswers((state) =>
    selected === null ? null : (state.answers[selected] ?? null),
  );
  const [scope, setScope] = useState<AssistantScope>(EMPTY_SCOPE);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'clear' | 'delete' | null>(null);
  // An opened conversation brings back what it shared; a new one starts with nothing shared.
  const [scopeOf, setScopeOf] = useState<string | null>(null);
  if (selected === null && scopeOf !== null) {
    setScopeOf(null);
    setScope(EMPTY_SCOPE);
  } else if (conversation.data && scopeOf !== conversation.data.id) {
    setScopeOf(conversation.data.id);
    setScope(conversation.data.scope);
  }

  const providers = overview.data?.providers ?? [];
  const ready = providers.filter((candidate) => candidate.model !== '' && candidate.key !== null);
  const provider =
    ready.find((candidate) => candidate.id === providerId) ??
    readyProvider(providers) ??
    ready[0] ??
    null;
  const streaming =
    live !== null ||
    (conversation.data?.messages.some((message) => message.status === 'streaming') ?? false);

  if (!isNativeRuntime()) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={Sparkles}
          iconTone="intelligence"
          title={t('assistant.noProvider.title')}
          description={t('errors.codes.native_runtime_unavailable')}
        />
      </div>
    );
  }
  if (overview.isError) {
    return <QueryError error={overview.error} onRetry={() => void overview.refetch()} />;
  }
  if (overview.isPending) {
    return <Skeleton className="m-6 h-64" />;
  }
  if (provider === null) {
    return <ProviderMissing provider={providers[0] ?? null} />;
  }

  const send = async (question: string): Promise<boolean> => {
    try {
      const started = await ask.mutateAsync({
        ...(selected === null ? {} : { conversationId: selected }),
        question,
        scope,
        providerId: provider.id,
      });
      if (selected === null) {
        setScopeOf(started.conversationId);
        void navigate(`/assistant?c=${started.conversationId}`);
      }
      return true;
    } catch (error) {
      toast.error(t(errorMessageKey(error)));
      return false;
    }
  };

  const answerAgain = () => {
    if (selected === null) {
      return;
    }
    regenerate.mutate(
      { conversationId: selected, scope, providerId: provider.id },
      {
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  };

  const data = selected === null ? null : (conversation.data ?? null);

  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList selected={selected} />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-3">
          <h2 className="truncate text-base font-semibold text-fg">
            {data?.title ?? t('assistant.newConversation')}
          </h2>
          {data && (
            <div className="flex items-center gap-1">
              <IconButton
                icon={Eraser}
                label={t('assistant.clear')}
                disabled={streaming || data.messages.length === 0}
                onClick={() => {
                  setConfirming('clear');
                }}
              />
              <IconButton
                icon={Trash2}
                label={t('assistant.delete')}
                disabled={streaming}
                onClick={() => {
                  setConfirming('delete');
                }}
              />
            </div>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {selected !== null && conversation.isError ? (
            <QueryError error={conversation.error} onRetry={() => void conversation.refetch()} />
          ) : selected !== null && conversation.isPending ? (
            <Skeleton className="h-40" />
          ) : data && data.messages.length > 0 ? (
            <ConversationMessages
              conversation={data}
              busy={streaming || regenerate.isPending}
              onRegenerate={answerAgain}
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              iconTone="intelligence"
              title={t('assistant.welcome.title')}
              description={t('assistant.welcome.description')}
            />
          )}
        </div>
        <Composer
          conversationId={selected}
          scope={scope}
          onScopeChange={setScope}
          providers={providers}
          provider={provider}
          onProviderChange={setProviderId}
          busy={streaming}
          stopping={live?.stopping ?? false}
          sending={ask.isPending}
          onSend={send}
          onStop={() => {
            if (selected !== null) {
              stopAnswer(selected).catch((error: unknown) => {
                toast.error(t(errorMessageKey(error)));
              });
            }
          }}
        />
      </section>
      <ConfirmDialog
        open={confirming === 'clear'}
        onOpenChange={(open) => {
          setConfirming(open ? 'clear' : null);
        }}
        title={t('assistant.clearConfirm.title')}
        description={t('assistant.clearConfirm.description')}
        confirmLabel={t('assistant.clearConfirm.confirm')}
        tone="danger"
        loading={clear.isPending}
        onConfirm={() => {
          if (selected === null) {
            return;
          }
          clear.mutate(selected, {
            onSuccess: () => {
              setConfirming(null);
              toast.success(t('assistant.cleared'));
            },
            onError: (error) => {
              toast.error(t(errorMessageKey(error)));
            },
          });
        }}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => {
          setConfirming(open ? 'delete' : null);
        }}
        title={t('assistant.deleteConfirm.title')}
        description={t('assistant.deleteConfirm.description')}
        confirmLabel={t('assistant.deleteConfirm.confirm')}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (selected === null) {
            return;
          }
          remove.mutate(selected, {
            onSuccess: () => {
              setConfirming(null);
              toast.success(t('assistant.deleted'));
              void navigate('/assistant');
            },
            onError: (error) => {
              toast.error(t(errorMessageKey(error)));
            },
          });
        }}
      />
    </div>
  );
}
