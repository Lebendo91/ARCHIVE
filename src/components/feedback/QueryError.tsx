import { CircleAlert, RotateCcw } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorDetail, errorMessageKey } from '@/services/errors';

export interface QueryErrorProps {
  error: unknown;
  /** Reloads the data (the query's `refetch`). */
  onRetry?: () => void;
}

/** Data of a page could not be loaded: what happened, in plain words, and a way to try again. */
export function QueryError({ error, onRetry }: QueryErrorProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={CircleAlert}
      iconTone="danger"
      title={t('errors.loadTitle')}
      description={t(errorMessageKey(error))}
      actions={
        onRetry ? (
          <Button icon={RotateCcw} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    >
      <details className="rounded-card border border-line-subtle bg-graphite p-4 text-left">
        <summary className="cursor-default text-xs font-medium text-fg-secondary">
          {t('errors.details')}
        </summary>
        <pre className="mt-3 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-fg-secondary">
          {errorDetail(error)}
        </pre>
      </details>
    </EmptyState>
  );
}
