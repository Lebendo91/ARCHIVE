import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Badge, Button, ConfirmDialog } from '@/components/ui';
import { formatNumber, useI18n } from '@/i18n';
import { providerErrorText } from '@/modules/assistant/providerErrors';
import { readyProvider, useAiOverview } from '@/services/ai';
import { extractConcepts, type MemoryItem } from '@/services/memory';
import type { LinkKind } from '@/services/notes';
import { queryKeys } from '@/services/queries';
import { toast } from '@/stores/toasts';
import { errorMessageKey } from '@/services/errors';

/** Characters of an item sent to the provider at most (`src-tauri/src/ai/concepts.rs`). */
const SENT_MAX_CHARS = 24_000;

/**
 * Concepts of an item (specification §10.3): extracted by an AI provider only when the user asks, after
 * saying what will be sent; only the concepts the text really holds are recorded.
 */
export function ConceptsBlock({
  kind,
  id,
  item,
  editable,
}: {
  kind: LinkKind;
  id: string;
  item: MemoryItem;
  editable: boolean;
}) {
  const { t, tCount, locale } = useI18n();
  const client = useQueryClient();
  const overview = useAiOverview();
  const provider = readyProvider(overview.data?.providers);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const extract = () => {
    if (!provider) {
      return;
    }
    setRunning(true);
    extractConcepts(kind, id, provider.id)
      .then((result) => {
        setConfirming(false);
        if (result.error) {
          toast.error(`${t('memory.concepts.failed')} ${providerErrorText(result.error, t)}`);
        } else if (result.finish) {
          toast.error(t('memory.concepts.incomplete'));
        } else {
          toast.success(tCount('memory.concepts.extracted', result.concepts.length));
        }
        return client.invalidateQueries({ queryKey: queryKeys.memory });
      })
      .catch((error: unknown) => {
        setConfirming(false);
        toast.error(t(errorMessageKey(error)));
      })
      .finally(() => {
        setRunning(false);
      });
  };

  return (
    <div className="flex flex-col gap-2">
      {item.concepts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.concepts.map((concept) => (
            <li
              key={`${concept.conceptId}:${String(concept.page)}`}
              title={concept.excerpt ?? undefined}
            >
              <Badge tone="intelligence">
                {concept.name}
                <span className="text-fg-secondary">
                  {' · '}
                  {t(`memory.concepts.kinds.${concept.kind}`)}
                  {concept.page !== null && (
                    <> · {t('assistant.citation.page', { page: concept.page })}</>
                  )}
                </span>
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-secondary">
          {provider ? t('memory.concepts.none') : t('memory.analysis.conceptsUnavailable')}
        </p>
      )}
      {provider ? (
        editable && (
          <div>
            <Button
              size="sm"
              icon={Sparkles}
              loading={running}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('memory.concepts.extract', { provider: provider.displayName })}
            </Button>
          </div>
        )
      ) : (
        <Link to="/settings/ai" className="w-fit text-sm text-blue hover:underline">
          {t('memory.concepts.configure')}
        </Link>
      )}
      {provider && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t('memory.concepts.confirm.title')}
          description={t('memory.concepts.confirm.description', {
            provider: provider.displayName,
            chars: formatNumber(SENT_MAX_CHARS, locale),
          })}
          confirmLabel={t('memory.concepts.confirm.confirm')}
          loading={running}
          onConfirm={extract}
        />
      )}
    </div>
  );
}
