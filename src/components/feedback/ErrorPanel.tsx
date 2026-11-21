import { CircleAlert, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n';

function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}

export interface ErrorPanelProps {
  error: unknown;
  /** Extra actions displayed after "Reload the interface". */
  actions?: ReactNode;
}

/** Calm, explicit error state: what happened, that data is safe, and how to continue (spec §18.4). */
export function ErrorPanel({ error, actions }: ErrorPanelProps) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={CircleAlert}
      iconTone="danger"
      title={t('errors.boundaryTitle')}
      description={t('errors.boundaryDescription')}
      actions={
        <>
          <Button
            variant="primary"
            icon={RotateCcw}
            onClick={() => {
              window.location.reload();
            }}
          >
            {t('errors.reload')}
          </Button>
          {actions}
        </>
      }
    >
      <details className="rounded-card border border-line-subtle bg-graphite p-4 text-left">
        <summary className="cursor-default text-xs font-medium text-fg-secondary">
          {t('errors.details')}
        </summary>
        <pre className="mt-3 overflow-x-auto font-mono text-xs whitespace-pre-wrap text-fg-secondary">
          {describe(error)}
        </pre>
      </details>
    </EmptyState>
  );
}
