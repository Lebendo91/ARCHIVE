import { CircleAlert, CircleCheck, FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { formatDateTime, formatFileSize, useI18n, type MessageKey } from '@/i18n';
import { errorMessageKey } from '@/services/errors';
import { useIntegrityCheck, useOpenStorageFolder, useStorageOverview } from '@/services/queries';
import type { StorageFolder, StorageOverview } from '@/services/storage';
import { toast } from '@/stores/toasts';
import { SettingsSection } from './SettingsPanels';

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
      {children}
    </h3>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line-subtle py-3 last:border-b-0">
      <dt className="shrink-0 text-sm text-fg-secondary">{label}</dt>
      <dd className="flex min-w-0 items-center gap-3 text-right text-sm text-fg">{children}</dd>
    </div>
  );
}

const LOCATIONS: readonly {
  labelKey: MessageKey;
  path: (overview: StorageOverview) => string;
  folder?: StorageFolder;
}[] = [
  { labelKey: 'settings.storage.locations.data', path: (o) => o.dataDir, folder: 'data' },
  { labelKey: 'settings.storage.locations.database', path: (o) => o.databaseFile },
  { labelKey: 'settings.storage.locations.files', path: (o) => o.filesDir, folder: 'files' },
  { labelKey: 'settings.storage.locations.backups', path: (o) => o.backupsDir, folder: 'backups' },
  { labelKey: 'settings.storage.locations.logs', path: (o) => o.logsDir, folder: 'logs' },
];

function Locations({ overview }: { overview: StorageOverview }) {
  const { t } = useI18n();
  const openFolder = useOpenStorageFolder();
  return (
    <Card>
      <SectionTitle>{t('settings.storage.locationsTitle')}</SectionTitle>
      <dl className="mt-2">
        {LOCATIONS.map(({ labelKey, path, folder }) => (
          <Row key={labelKey} label={t(labelKey)}>
            <code className="min-w-0 font-mono text-xs break-all text-fg">{path(overview)}</code>
            {folder ? (
              <Button
                size="sm"
                icon={FolderOpen}
                aria-label={t('settings.storage.openLabel', { folder: t(labelKey) })}
                onClick={() => {
                  openFolder.mutate(folder, {
                    onError: (error) => {
                      toast.error(t(errorMessageKey(error)));
                    },
                  });
                }}
              >
                {t('settings.storage.open')}
              </Button>
            ) : null}
          </Row>
        ))}
      </dl>
    </Card>
  );
}

function Usage({ overview }: { overview: StorageOverview }) {
  const { t, locale } = useI18n();
  const size = (bytes: number) => formatFileSize(bytes, locale);
  const disk =
    overview.diskAvailableBytes !== null && overview.diskTotalBytes !== null
      ? t('settings.storage.usage.diskFreeValue', {
          free: size(overview.diskAvailableBytes),
          total: size(overview.diskTotalBytes),
        })
      : t('settings.storage.usage.unknown');
  return (
    <Card>
      <SectionTitle>{t('settings.storage.usageTitle')}</SectionTitle>
      <dl className="mt-2">
        <Row label={t('settings.storage.usage.database')}>{size(overview.databaseBytes)}</Row>
        <Row label={t('settings.storage.usage.files')}>
          <span className="text-fg-secondary">
            {t('settings.storage.usage.filesCount', { count: overview.filesCount })}
          </span>
          <span>{size(overview.filesBytes)}</span>
        </Row>
        <Row label={t('settings.storage.usage.backups')}>{size(overview.backupsBytes)}</Row>
        <Row label={t('settings.storage.usage.logs')}>{size(overview.logsBytes)}</Row>
        <Row label={t('settings.storage.usage.total')}>
          <span className="font-semibold">{size(overview.totalBytes)}</span>
        </Row>
        <Row label={t('settings.storage.usage.diskFree')}>{disk}</Row>
      </dl>
    </Card>
  );
}

function Integrity() {
  const { t, locale } = useI18n();
  const check = useIntegrityCheck();
  const report = check.data;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <SectionTitle>{t('settings.storage.integrityTitle')}</SectionTitle>
          <p className="text-sm text-fg-secondary">{t('settings.storage.integrityDescription')}</p>
        </div>
        <Button
          icon={ShieldCheck}
          loading={check.isPending}
          onClick={() => {
            check.mutate(undefined, {
              onError: (error) => {
                toast.error(t(errorMessageKey(error)));
              },
            });
          }}
        >
          {t('settings.storage.integrityRun')}
        </Button>
      </div>
      {report ? (
        <div role="status" className="flex flex-col gap-2">
          {report.ok ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CircleCheck size={16} />
              {t('settings.storage.integrityOk')}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-warning">
                <CircleAlert size={16} />
                {t('settings.storage.integrityProblems', { count: report.problems.length })}
              </p>
              <ul className="flex flex-col gap-1 pl-6 font-mono text-xs text-fg-secondary">
                {report.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-fg-secondary">
            {t('settings.storage.integrityCheckedAt', {
              date: formatDateTime(new Date(report.checkedAt), locale),
            })}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Backups() {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <SectionTitle>{t('settings.storage.backupsTitle')}</SectionTitle>
        <Badge>{t('common.comingSoon')}</Badge>
      </div>
      <p className="text-sm text-fg-secondary">{t('settings.storage.backupsAutomatic')}</p>
      <p className="text-sm text-fg-secondary">{t('settings.storage.backupsUpcoming')}</p>
    </Card>
  );
}

/** Storage section (specification §15.3): real locations and sizes, folder access, integrity check. */
export function StorageSettings() {
  const { t } = useI18n();
  const overview = useStorageOverview();

  return (
    <SettingsSection
      titleKey="settings.sections.storage"
      descriptionKey="settings.storage.description"
    >
      {overview.isPending ? (
        <Card className="flex flex-col gap-3" aria-busy="true">
          <Skeleton surface="raised" className="h-4 w-1/3" />
          <Skeleton surface="raised" className="h-4 w-2/3" />
          <Skeleton surface="raised" className="h-4 w-1/2" />
        </Card>
      ) : overview.isError ? (
        <Card>
          <p className="flex items-start gap-2 text-sm text-fg-secondary">
            <span className="flex h-5 shrink-0 items-center text-warning">
              <CircleAlert size={16} />
            </span>
            {t(errorMessageKey(overview.error))}
          </p>
        </Card>
      ) : (
        <>
          <Locations overview={overview.data} />
          <Usage overview={overview.data} />
          <Integrity />
        </>
      )}
      <Backups />
    </SettingsSection>
  );
}
