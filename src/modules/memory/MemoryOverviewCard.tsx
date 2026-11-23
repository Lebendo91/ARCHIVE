import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { Button, Card, Skeleton } from '@/components/ui';
import { formatNumber, useI18n, type MessageKey } from '@/i18n';
import { memoryOverview, retryAllMemory, type QueueCounts } from '@/services/memory';
import { queryKeys } from '@/services/queries';
import { toast } from '@/stores/toasts';

const COUNTS: readonly { key: keyof QueueCounts; labelKey: MessageKey }[] = [
  { key: 'pending', labelKey: 'memory.overview.pending' },
  { key: 'processing', labelKey: 'memory.overview.processing' },
  { key: 'completed', labelKey: 'memory.overview.completed' },
  { key: 'failed', labelKey: 'memory.overview.failed' },
  { key: 'needsAttention', labelKey: 'memory.overview.needsAttention' },
];

/**
 * The processing of the whole knowledge base by the memory engine (specification §10.1): how many stages
 * wait, run, are done or failed, the suggestions waiting for the user, and a new try of what needs attention.
 */
export function MemoryOverviewCard() {
  const { t, tCount, locale } = useI18n();
  const client = useQueryClient();
  const overview = useQuery({ queryKey: queryKeys.memoryOverview, queryFn: memoryOverview });
  const retryAll = () => {
    retryAllMemory()
      .then(async (count) => {
        await client.invalidateQueries({ queryKey: queryKeys.memory });
        toast.success(tCount('memory.overview.retriedAll', count));
      })
      .catch(() => {
        toast.error(t('memory.analysis.retryFailed'));
      });
  };
  const data = overview.data;
  const waiting = data ? data.jobs.failed + data.jobs.needsAttention : 0;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('memory.overview.title')}
          </h3>
          <p className="text-sm text-fg-secondary">{t('memory.overview.description')}</p>
        </div>
        {waiting > 0 ? (
          <Button icon={RotateCcw} onClick={retryAll}>
            {t('memory.overview.retryAll')}
          </Button>
        ) : null}
      </div>
      {overview.isPending ? (
        <Skeleton surface="raised" className="h-12" />
      ) : data ? (
        <>
          <dl className="grid grid-cols-5 gap-3">
            {COUNTS.map(({ key, labelKey }) => (
              <div key={key} className="flex flex-col gap-1">
                <dt className="text-xs text-fg-secondary">{t(labelKey)}</dt>
                <dd className="text-lg font-semibold text-fg tabular-nums">
                  {formatNumber(data.jobs[key], locale)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-fg-secondary">
            {data.suggestions > 0
              ? tCount('memory.overview.suggestions', data.suggestions)
              : t('memory.overview.noSuggestions')}
          </p>
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{t('memory.analysis.unavailable')}</p>
      )}
    </Card>
  );
}
