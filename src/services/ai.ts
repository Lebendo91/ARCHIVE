import { Channel } from '@tauri-apps/api/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { AiProviderView } from '@/types/bindings/AiProviderView';
import type { AssistantAsk } from '@/types/bindings/AssistantAsk';
import type { AssistantEvent } from '@/types/bindings/AssistantEvent';
import type { AssistantPreviewRequest } from '@/types/bindings/AssistantPreviewRequest';
import type { AssistantRegenerate } from '@/types/bindings/AssistantRegenerate';
import type { AssistantStarted } from '@/types/bindings/AssistantStarted';
import type { MessageStatus } from '@/types/bindings/MessageStatus';
import type { ProviderCreate } from '@/types/bindings/ProviderCreate';
import type { ProviderPatch } from '@/types/bindings/ProviderPatch';
import type { SourcePassage } from '@/types/bindings/SourcePassage';
import { callCommand, isNativeRuntime } from './tauri';

export type { AiProviderView } from '@/types/bindings/AiProviderView';
export type { AssistantScope } from '@/types/bindings/AssistantScope';
export type { Conversation } from '@/types/bindings/Conversation';
export type { ConversationMessage } from '@/types/bindings/ConversationMessage';
export type { ModelInfo } from '@/types/bindings/ModelInfo';
export type { ProviderError } from '@/types/bindings/ProviderError';
export type { ProviderKind } from '@/types/bindings/ProviderKind';
export type { SourcePassage } from '@/types/bindings/SourcePassage';

/** Query keys of the AI layer: providers, conversations and previews. */
export const aiKeys = {
  overview: ['ai', 'overview'] as const,
  /** Prefix of every conversation query. */
  assistant: ['assistant'] as const,
  conversations: ['assistant', 'conversations'] as const,
  conversation: (id: string) => ['assistant', 'conversation', id] as const,
  preview: (request: AssistantPreviewRequest) => ['assistant', 'preview', request] as const,
};

/** Models suggested before the list of the account is known: only when the provider's documentation names one. */
export const SUGGESTED_MODELS: Partial<Record<AiProviderView['provider'], string>> = {
  anthropic: 'claude-opus-5-5',
};

export function useAiOverview() {
  return useQuery({
    queryKey: aiKeys.overview,
    queryFn: () => callCommand('ai_overview'),
    enabled: isNativeRuntime(),
  });
}

/** The provider used when none is chosen, if it can answer (model and key). */
export function readyProvider(providers: readonly AiProviderView[] | undefined) {
  const provider = providers?.find((candidate) => candidate.isDefault) ?? providers?.[0];
  return provider && provider.model !== '' && provider.key !== null ? provider : null;
}

function useProviderMutation<TVariables, TResult>(
  run: (variables: TVariables) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.overview }),
  });
}

export function useCreateProvider() {
  return useProviderMutation((input: ProviderCreate) =>
    callCommand('ai_providers_create', { input }),
  );
}

export function useUpdateProvider() {
  return useProviderMutation(({ id, patch }: { id: string; patch: ProviderPatch }) =>
    callCommand('ai_providers_update', { id, patch }),
  );
}

export function useDeleteProvider() {
  return useProviderMutation((id: string) => callCommand('ai_providers_delete', { id }));
}

/** Hands a key to the core, which keeps it in the credential store; it never comes back. */
export function useSetProviderKey() {
  return useProviderMutation(({ id, key }: { id: string; key: string }) =>
    callCommand('ai_providers_set_key', { id, key }),
  );
}

export function useRemoveProviderKey() {
  return useProviderMutation((id: string) => callCommand('ai_providers_remove_key', { id }));
}

/** The connection test: run only when the user asks for it. */
export function useTestProvider() {
  return useMutation({
    mutationFn: (id: string) => callCommand('ai_providers_test', { id }),
  });
}

export function useConversations() {
  return useQuery({
    queryKey: aiKeys.conversations,
    queryFn: () => callCommand('assistant_conversations'),
    enabled: isNativeRuntime(),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: aiKeys.conversation(id ?? ''),
    queryFn: () => callCommand('assistant_conversation', { id: id ?? '' }),
    enabled: isNativeRuntime() && id !== null,
  });
}

/** What a question would send; the caller waits for the user to pause before asking. */
export function useAssistantPreview(request: AssistantPreviewRequest, enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.preview(request),
    queryFn: () => callCommand('assistant_preview', { request }),
    enabled: isNativeRuntime() && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useClearConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callCommand('assistant_conversation_clear', { id }),
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.assistant }),
  });
}

export function useDeleteConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callCommand('assistant_conversation_delete', { id }),
    onSettled: () => client.invalidateQueries({ queryKey: aiKeys.assistant }),
  });
}

/** An answer being written, as it arrives. */
export interface LiveAnswer {
  conversationId: string;
  answerId: string;
  text: string;
  model: string | null;
  switched: { from: string; to: string } | null;
  sources: SourcePassage[];
  stopping: boolean;
}

interface LiveAnswersState {
  answers: Record<string, LiveAnswer>;
  put: (answer: LiveAnswer) => void;
  update: (conversationId: string, change: (answer: LiveAnswer) => LiveAnswer) => void;
  remove: (conversationId: string) => void;
}

export const useLiveAnswers = create<LiveAnswersState>()((set) => ({
  answers: {},
  put: (answer) => {
    set((state) => ({ answers: { ...state.answers, [answer.conversationId]: answer } }));
  },
  update: (conversationId, change) => {
    set((state) => {
      const answer = state.answers[conversationId];
      return answer ? { answers: { ...state.answers, [conversationId]: change(answer) } } : state;
    });
  },
  remove: (conversationId) => {
    set((state) => {
      const answers = { ...state.answers };
      Reflect.deleteProperty(answers, conversationId);
      return { answers };
    });
  },
}));

function apply(answer: LiveAnswer, event: AssistantEvent): LiveAnswer {
  switch (event.kind) {
    case 'model':
      return { ...answer, model: event.model };
    case 'text':
      return { ...answer, text: answer.text + event.text };
    case 'switched':
      return { ...answer, switched: { from: event.from, to: event.to }, model: event.to };
    case 'done':
      return answer;
  }
}

/**
 * Starts an answer and follows it: its pieces go to the live answers, and once it is recorded the
 * conversation is read again. Events may arrive before the command returns: they wait for it.
 */
function useStreamedAnswer<TInput>(
  start: (input: TInput, channel: Channel<AssistantEvent>) => Promise<AssistantStarted>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => {
      const live = useLiveAnswers.getState();
      let started: AssistantStarted | null = null;
      const early: AssistantEvent[] = [];
      const finish = (status: MessageStatus, conversationId: string) => {
        void Promise.all([
          client.invalidateQueries({ queryKey: aiKeys.conversation(conversationId) }),
          client.invalidateQueries({ queryKey: aiKeys.conversations }),
        ]).then(() => {
          live.remove(conversationId);
        });
        return status;
      };
      const channel = new Channel<AssistantEvent>((event) => {
        if (started === null) {
          early.push(event);
          return;
        }
        const conversationId = started.conversationId;
        if (event.kind === 'done') {
          finish(event.status, conversationId);
          return;
        }
        useLiveAnswers.getState().update(conversationId, (answer) => apply(answer, event));
      });
      started = await start(input, channel);
      let answer: LiveAnswer = {
        conversationId: started.conversationId,
        answerId: started.answerId,
        text: '',
        model: null,
        switched: null,
        sources: started.sources,
        stopping: false,
      };
      let done: MessageStatus | null = null;
      for (const event of early) {
        if (event.kind === 'done') {
          done = event.status;
        } else {
          answer = apply(answer, event);
        }
      }
      live.put(answer);
      await client.invalidateQueries({ queryKey: aiKeys.assistant });
      if (done !== null) {
        finish(done, started.conversationId);
      }
      return started;
    },
  });
}

export function useAskAssistant() {
  return useStreamedAnswer((ask: AssistantAsk, channel) =>
    callCommand('assistant_ask', { ask, channel }),
  );
}

export function useRegenerateAnswer() {
  return useStreamedAnswer((request: AssistantRegenerate, channel) =>
    callCommand('assistant_regenerate', { request, channel }),
  );
}

/** Stops the answer being written; what was written so far is kept as an interrupted answer. */
export async function stopAnswer(conversationId: string): Promise<void> {
  useLiveAnswers.getState().update(conversationId, (answer) => ({ ...answer, stopping: true }));
  await callCommand('assistant_stop', { conversationId });
}
