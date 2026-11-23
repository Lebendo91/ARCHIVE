import { useId, useState, type SubmitEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Plus,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Select,
} from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import {
  SUGGESTED_MODELS,
  useAiOverview,
  useCreateProvider,
  useDeleteProvider,
  useRemoveProviderKey,
  useSetProviderKey,
  useTestProvider,
  useUpdateProvider,
  type AiProviderView,
  type ModelInfo,
  type ProviderKind,
} from '@/services/ai';
import { errorMessageKey } from '@/services/errors';
import { useSettings, useUpdateSettings } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';
import { toast } from '@/stores/toasts';
import type { ContextSize } from '@/types/bindings/ContextSize';
import type { ProviderPreferences } from '@/types/bindings/ProviderPreferences';
import { cn } from '@/utils/cn';
import { providerErrorText } from '@/modules/assistant/providerErrors';
import { SettingsSection } from './SettingsPanels';

const KINDS: readonly ProviderKind[] = ['anthropic', 'openai', 'gemini'];
const ANSWER_LENGTHS = [4_000, 8_000, 16_000, 32_000, 64_000] as const;
const CONTEXT_SIZES: readonly ContextSize[] = ['compact', 'standard', 'extended'];

/** AI configuration (specification §15.4): providers, keys, connection test, model and privacy. */
export function AiSettings() {
  const { t } = useI18n();
  const available = isNativeRuntime();
  const overview = useAiOverview();
  const [adding, setAdding] = useState(false);
  const providers = overview.data?.providers ?? [];

  return (
    <SettingsSection titleKey="settings.sections.ai" descriptionKey="settings.ai.description">
      {!available && (
        <p className="text-sm text-fg-secondary">{t('errors.codes.native_runtime_unavailable')}</p>
      )}
      {overview.data && !overview.data.systemStore && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-fg">{t('settings.ai.sessionOnly.title')}</p>
            <p className="text-sm text-fg-secondary">{t('settings.ai.sessionOnly.description')}</p>
          </div>
        </div>
      )}
      <Card padding="none">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-fg">{t('settings.ai.providersTitle')}</h3>
            <p className="text-sm text-fg-secondary">{t('settings.ai.providersDescription')}</p>
          </div>
          <Button
            variant="primary"
            icon={Plus}
            disabled={!available}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('settings.ai.add')}
          </Button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          {providers.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              iconTone="intelligence"
              headingLevel={3}
              title={t('settings.ai.empty.title')}
              description={t('settings.ai.empty.description')}
            />
          ) : (
            providers.map((provider) => <ProviderPanel key={provider.id} provider={provider} />)
          )}
        </div>
      </Card>
      <PrivacySettings />
      <AddProviderDialog open={adding} onOpenChange={setAdding} />
    </SettingsSection>
  );
}

function AddProviderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const create = useCreateProvider();
  const setKey = useSetProviderKey();
  const [kind, setKind] = useState<ProviderKind>('anthropic');
  const [name, setName] = useState<string | null>(null);
  const [key, setKeyValue] = useState('');
  const displayName = name ?? t(`ai.kinds.${kind}`);
  const busy = create.isPending || setKey.isPending;

  const close = () => {
    setKind('anthropic');
    setName(null);
    setKeyValue('');
    onOpenChange(false);
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const suggested = SUGGESTED_MODELS[kind];
      const created = await create.mutateAsync({
        provider: kind,
        displayName,
        ...(suggested === undefined ? {} : { model: suggested }),
      });
      const typed = key.trim();
      // The key leaves the form at once: it is not kept in the interface.
      setKeyValue('');
      if (typed !== '') {
        await setKey.mutateAsync({ id: created.id, key: typed });
      }
      toast.success(t('settings.ai.addDialog.added'));
      close();
    } catch (error) {
      toast.error(t(errorMessageKey(error)));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent
        title={t('settings.ai.addDialog.title')}
        description={t('settings.ai.addDialog.description')}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="add-ai-provider"
              loading={busy}
              disabled={displayName.trim() === ''}
            >
              {t('settings.ai.addDialog.submit')}
            </Button>
          </>
        }
      >
        <form
          id="add-ai-provider"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <SegmentedControl
            label={t('settings.ai.addDialog.kind')}
            options={KINDS.map((value) => ({ value, label: t(`ai.kinds.${value}`) }))}
            value={kind}
            onChange={setKind}
          />
          <Input
            label={t('settings.ai.addDialog.name')}
            value={displayName}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Input
            label={t('settings.ai.addDialog.key')}
            hint={t('settings.ai.addDialog.keyHint')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => {
              setKeyValue(event.target.value);
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeyStatus({ provider }: { provider: AiProviderView }) {
  const { t } = useI18n();
  if (provider.key === 'system') {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-secondary">
        <ShieldCheck size={16} className="text-success" aria-hidden="true" />
        {t('settings.ai.key.system')}
      </p>
    );
  }
  if (provider.key === 'session') {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-secondary">
        <AlertTriangle size={16} className="text-warning" aria-hidden="true" />
        {t('settings.ai.key.session')}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-fg-secondary">
      <KeyRound size={16} aria-hidden="true" />
      {t('settings.ai.key.missing')}
    </p>
  );
}

function KeyForm({ provider }: { provider: AiProviderView }) {
  const { t } = useI18n();
  const setKey = useSetProviderKey();
  const removeKey = useRemoveProviderKey();
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const hasKey = provider.key !== null;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = value.trim();
    if (typed === '') {
      return;
    }
    setValue('');
    setKey.mutate(
      { id: provider.id, key: typed },
      {
        onSuccess: (updated) => {
          toast.success(
            t(updated.key === 'session' ? 'settings.ai.key.savedSession' : 'settings.ai.key.saved'),
          );
        },
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <KeyStatus provider={provider} />
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <Input
          className="w-72"
          label={t(hasKey ? 'settings.ai.key.replaceLabel' : 'settings.ai.key.label')}
          hint={t('settings.ai.key.hint')}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button
          type="submit"
          icon={KeyRound}
          loading={setKey.isPending}
          disabled={value.trim() === ''}
        >
          {t(hasKey ? 'settings.ai.key.replace' : 'settings.ai.key.save')}
        </Button>
        {hasKey && (
          <Button
            variant="ghost"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('settings.ai.key.remove')}
          </Button>
        )}
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.ai.key.removeConfirm.title', { name: provider.displayName })}
        description={t('settings.ai.key.removeConfirm.description')}
        confirmLabel={t('settings.ai.key.removeConfirm.confirm')}
        tone="danger"
        loading={removeKey.isPending}
        onConfirm={() => {
          removeKey.mutate(provider.id, {
            onSuccess: () => {
              setConfirming(false);
              toast.success(t('settings.ai.key.removed'));
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

/** The model chosen from the account's list carries what the provider says of it. */
function modelPreferences(
  preferences: ProviderPreferences,
  model: ModelInfo | undefined,
): ProviderPreferences {
  return {
    ...preferences,
    modelMaxOutputTokens: model?.maxOutputTokens ?? null,
    modelRefusalFallback: model?.refusalFallback ?? false,
  };
}

function ModelChoice({
  provider,
  models,
}: {
  provider: AiProviderView;
  models: readonly ModelInfo[] | null;
}) {
  const { t } = useI18n();
  const update = useUpdateProvider();
  const [manual, setManual] = useState('');

  const save = (model: string) => {
    update.mutate(
      {
        id: provider.id,
        patch: {
          model,
          preferences: modelPreferences(
            provider.preferences,
            models?.find((candidate) => candidate.id === model),
          ),
        },
      },
      {
        onSuccess: () => {
          setManual('');
          toast.success(t('settings.ai.model.saved'));
        },
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg">
        {provider.model === ''
          ? t('settings.ai.model.none')
          : t('settings.ai.model.current', { model: provider.model })}
      </p>
      {models && models.length > 0 ? (
        <Select
          className="max-w-md"
          label={t('settings.ai.model.listLabel')}
          value={models.some((model) => model.id === provider.model) ? provider.model : ''}
          disabled={update.isPending}
          onChange={(event) => {
            if (event.target.value !== '') {
              save(event.target.value);
            }
          }}
        >
          <option value="" disabled>
            {t('settings.ai.model.choose')}
          </option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.deprecated
                ? t('settings.ai.model.deprecated', { name: `${model.name} (${model.id})` })
                : model.name === model.id
                  ? model.id
                  : `${model.name} (${model.id})`}
            </option>
          ))}
        </Select>
      ) : (
        <p className="text-sm text-fg-secondary">{t('settings.ai.model.testFirst')}</p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim() !== '') {
            save(manual.trim());
          }
        }}
      >
        <Input
          className="w-72"
          label={t('settings.ai.model.manualLabel')}
          hint={t('settings.ai.model.manualHint')}
          value={manual}
          maxLength={200}
          spellCheck={false}
          pattern="[A-Za-z0-9._:\-]+"
          onChange={(event) => {
            setManual(event.target.value);
          }}
        />
        <Button type="submit" loading={update.isPending} disabled={manual.trim() === ''}>
          {t('settings.ai.model.save')}
        </Button>
      </form>
    </div>
  );
}

function Preferences({ provider }: { provider: AiProviderView }) {
  const { t, locale } = useI18n();
  const update = useUpdateProvider();
  const fallbackId = useId();
  const preferences = provider.preferences;
  const lengths: number[] = ANSWER_LENGTHS.includes(
    preferences.maxOutputTokens as (typeof ANSWER_LENGTHS)[number],
  )
    ? [...ANSWER_LENGTHS]
    : [...ANSWER_LENGTHS, preferences.maxOutputTokens].sort((a, b) => a - b);
  const limit = preferences.modelMaxOutputTokens;

  const save = (patch: Partial<ProviderPreferences>) => {
    update.mutate(
      { id: provider.id, patch: { preferences: { ...preferences, ...patch } } },
      {
        onSuccess: () => {
          toast.success(t('settings.ai.saved'));
        },
        onError: (error) => {
          toast.error(t(errorMessageKey(error)));
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Select
        className="max-w-xs"
        label={t('settings.ai.answerLength.label')}
        hint={
          limit !== null && limit < preferences.maxOutputTokens
            ? t('settings.ai.answerLength.limited', { tokens: formatNumber(limit, locale) })
            : t('settings.ai.answerLength.hint')
        }
        value={String(preferences.maxOutputTokens)}
        disabled={update.isPending}
        onChange={(event) => {
          save({ maxOutputTokens: Number(event.target.value) });
        }}
      >
        {lengths.map((tokens) => (
          <option key={tokens} value={tokens}>
            {t('settings.ai.answerLength.option', { tokens: formatNumber(tokens, locale) })}
          </option>
        ))}
      </Select>
      {provider.provider === 'anthropic' && (
        <div className="flex items-start gap-3">
          <input
            id={fallbackId}
            type="checkbox"
            className="mt-1 accent-blue"
            checked={preferences.refusalFallback}
            disabled={update.isPending}
            aria-describedby={`${fallbackId}-description`}
            onChange={(event) => {
              save({ refusalFallback: event.target.checked });
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={fallbackId} className="text-sm text-fg">
              {t('settings.ai.fallback.label')}
            </label>
            <p id={`${fallbackId}-description`} className="text-sm text-fg-secondary">
              {t('settings.ai.fallback.description')}
              {provider.model !== '' && !preferences.modelRefusalFallback && (
                <> {t('settings.ai.fallback.unavailable')}</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderPanel({ provider }: { provider: AiProviderView }) {
  const { t, tCount } = useI18n();
  const update = useUpdateProvider();
  const remove = useDeleteProvider();
  const test = useTestProvider();
  const [confirming, setConfirming] = useState(false);
  const result = test.data;
  const failure = result?.error ?? null;
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-5 rounded-card border border-line p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id={headingId} className="text-sm font-semibold text-fg">
            {provider.displayName}
          </h4>
          <Badge tone="intelligence">{t(`ai.kinds.${provider.provider}`)}</Badge>
          {provider.isDefault && (
            <Badge tone="info" icon={Star}>
              {t('settings.ai.isDefault')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!provider.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              loading={update.isPending}
              onClick={() => {
                update.mutate(
                  { id: provider.id, patch: { isDefault: true } },
                  {
                    onSuccess: () => {
                      toast.success(t('settings.ai.madeDefault', { name: provider.displayName }));
                    },
                    onError: (error) => {
                      toast.error(t(errorMessageKey(error)));
                    },
                  },
                );
              }}
            >
              {t('settings.ai.makeDefault')}
            </Button>
          )}
          <IconButton
            icon={Trash2}
            label={t('settings.ai.remove')}
            onClick={() => {
              setConfirming(true);
            }}
          />
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <h5 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('settings.ai.key.title')}
        </h5>
        <KeyForm provider={provider} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            icon={PlugZap}
            loading={test.isPending}
            disabled={provider.key === null}
            onClick={() => {
              test.mutate(provider.id, {
                onError: (error) => {
                  toast.error(t(errorMessageKey(error)));
                },
              });
            }}
          >
            {t('settings.ai.test.action')}
          </Button>
          <p className="text-sm text-fg-secondary">
            {provider.key === null ? t('settings.ai.test.needsKey') : t('settings.ai.test.hint')}
          </p>
        </div>
        <div role="status" aria-live="polite">
          {result && failure === null && (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={16} aria-hidden="true" />
              {tCount('settings.ai.test.success', result.models.length, {
                duration: result.durationMs,
              })}
            </p>
          )}
          {failure !== null && (
            <div className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-medium">{t('settings.ai.test.failed')}</span>
                {' · '}
                {providerErrorText(failure, t)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h5 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('settings.ai.model.title')}
        </h5>
        <ModelChoice
          provider={provider}
          models={result && failure === null ? result.models : null}
        />
      </div>

      <Preferences provider={provider} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.ai.removeConfirm.title', { name: provider.displayName })}
        description={t('settings.ai.removeConfirm.description')}
        confirmLabel={t('settings.ai.removeConfirm.confirm')}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          remove.mutate(provider.id, {
            onSuccess: () => {
              setConfirming(false);
              toast.success(t('settings.ai.removed'));
            },
            onError: (error) => {
              toast.error(t(errorMessageKey(error)));
            },
          });
        }}
      />
    </section>
  );
}

function PrivacySettings() {
  const { t, tList } = useI18n();
  const available = isNativeRuntime();
  const settings = useSettings({ enabled: available });
  const update = useUpdateSettings();
  const historyId = useId();
  const current = settings.data;

  const save = (patch: { assistantContext?: ContextSize; assistantHistory?: boolean }) => {
    update.mutate(patch, {
      onSuccess: () => {
        toast.success(t('settings.ai.saved'));
      },
      onError: (error) => {
        toast.error(t(errorMessageKey(error)));
      },
    });
  };

  return (
    <Card>
      <fieldset
        className="flex flex-col gap-5"
        disabled={!available || current === undefined || update.isPending}
      >
        <legend className="contents">
          <span className="text-base font-semibold text-fg">{t('settings.ai.privacy.title')}</span>
        </legend>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg">{t('settings.ai.privacy.contextLabel')}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {CONTEXT_SIZES.map((size) => {
              const checked = current?.assistantContext === size;
              return (
                <label
                  key={size}
                  className={cn(
                    'flex cursor-default items-start gap-3 rounded-control border p-3 text-sm transition-colors duration-150 ease-standard',
                    checked
                      ? 'border-blue bg-blue/10 text-fg'
                      : 'border-line text-fg-secondary hover:border-fg-disabled',
                  )}
                >
                  <input
                    type="radio"
                    name="assistant-context"
                    value={size}
                    checked={checked}
                    className="mt-1 accent-blue"
                    onChange={() => {
                      save({ assistantContext: size });
                    }}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium text-fg">
                      {t(`settings.ai.privacy.contexts.${size}.label` as MessageKey)}
                    </span>
                    <span>
                      {t(`settings.ai.privacy.contexts.${size}.description` as MessageKey)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <input
            id={historyId}
            type="checkbox"
            className="mt-1 accent-blue"
            checked={current?.assistantHistory ?? true}
            aria-describedby={`${historyId}-description`}
            onChange={(event) => {
              save({ assistantHistory: event.target.checked });
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor={historyId} className="text-sm text-fg">
              {t('settings.ai.privacy.history')}
            </label>
            <p id={`${historyId}-description`} className="text-sm text-fg-secondary">
              {t('settings.ai.privacy.historyDescription')}
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          {tList('settings.ai.privacy.facts').map((fact) => (
            <li key={fact} className="flex items-start gap-2 text-sm text-fg-secondary">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              {fact}
            </li>
          ))}
        </ul>
      </fieldset>
    </Card>
  );
}
