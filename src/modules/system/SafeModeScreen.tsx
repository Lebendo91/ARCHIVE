import { FolderOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ArchiveMark } from '@/components/brand/ArchiveMark';
import { Button } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { errorDetail, errorMessageKey } from '@/services/errors';
import { useOpenStorageFolder, useRetryDatabase } from '@/services/queries';
import type { AppStatus } from '@/types/bindings/AppStatus';

export interface SafeModeScreenProps {
  status?: AppStatus;
  /** Failure of the status request itself. */
  error?: unknown;
}

function causeKey(status?: AppStatus): MessageKey {
  switch (status?.failure?.code) {
    case 'database_too_new':
      return 'safeMode.causes.databaseTooNew';
    case 'migration_failed':
      return 'safeMode.causes.migrationFailed';
    default:
      return 'safeMode.causes.other';
  }
}

/**
 * Safe mode: the database could not be opened. The application explains why, reassures about the data
 * (nothing was modified) and offers to retry or to open the data folder (ARCHITECTURE.md §6.4).
 */
export function SafeModeScreen({ status, error }: SafeModeScreenProps) {
  const { t } = useI18n();
  const retry = useRetryDatabase();
  const openFolder = useOpenStorageFolder();
  const [notice, setNotice] = useState<string | null>(null);
  const detail = status?.failure?.detail ?? (error === undefined ? '' : errorDetail(error));

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-obsidian p-8">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-modal border border-line bg-graphite p-8">
        <ArchiveMark size={40} />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold text-fg">{t('safeMode.title')}</h1>
          <p className="text-sm text-fg-secondary">{t(causeKey(status))}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-fg">
          <ShieldCheck size={16} className="shrink-0 text-success" />
          {t('safeMode.reassurance')}
        </p>
        {status ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-secondary">{t('safeMode.dataDir')}</span>
            <code className="font-mono text-xs break-all text-fg">{status.dataDir}</code>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            icon={RotateCcw}
            loading={retry.isPending}
            onClick={() => {
              setNotice(null);
              retry.mutate(undefined, {
                onSuccess: (next) => {
                  if (next.database === 'unavailable') {
                    setNotice(t('safeMode.stillUnavailable'));
                  }
                },
                onError: (failure) => {
                  setNotice(t(errorMessageKey(failure)));
                },
              });
            }}
          >
            {t('safeMode.retry')}
          </Button>
          <Button
            icon={FolderOpen}
            onClick={() => {
              openFolder.mutate('data', {
                onError: (failure) => {
                  setNotice(t(errorMessageKey(failure)));
                },
              });
            }}
          >
            {t('safeMode.openDataFolder')}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm text-warning">
          {notice}
        </p>
        {detail ? (
          <details className="rounded-card border border-line-subtle bg-obsidian p-4">
            <summary className="cursor-default text-xs font-medium text-fg-secondary">
              {t('errors.details')}
            </summary>
            <pre className="mt-3 font-mono text-xs whitespace-pre-wrap text-fg-secondary">
              {detail}
            </pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}
