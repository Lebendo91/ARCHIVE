import { useId, useState } from 'react';
import { Archive, FolderOpen, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, IconButton } from '@/components/ui';
import { formatDateTime, formatFileSize, formatNumber, useI18n } from '@/i18n';
import {
  revealBackup,
  useBackupOverview,
  useCreateBackup,
  useForgetBackup,
  useOpenBackupFile,
  useRestoreBackup,
  useVerifyBackup,
  type BackupCheck,
  type BackupProblem,
  type BackupProgress,
  type BackupRecord,
} from '@/services/backup';
import { errorMessageKey } from '@/services/errors';
import { isNativeRuntime } from '@/services/tauri';
import { toast } from '@/stores/toasts';

/** What a backup holds, for example « 12 documents · 1 note · 2 espaces · 0 relation ». */
function useContentsText() {
  const { tCount } = useI18n();
  return ({ contents }: Pick<BackupRecord, 'contents'>) =>
    [
      tCount('settings.storage.backup.counts.documents', contents.documents),
      tCount('settings.storage.backup.counts.notes', contents.notes),
      tCount('settings.storage.backup.counts.workspaces', contents.workspaces),
      tCount('settings.storage.backup.counts.relations', contents.relations),
    ].join(' · ');
}

function problemText(problem: BackupProblem, t: ReturnType<typeof useI18n>['t']): string {
  switch (problem.kind) {
    case 'unexpected_entry':
    case 'missing_entry':
    case 'altered':
      return t(`settings.storage.backup.problems.${problem.kind}`, { name: problem.name });
    default:
      return t(`settings.storage.backup.problems.${problem.kind}`);
  }
}

function Problems({ check }: { check: BackupCheck }) {
  const { t, locale } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-control border border-danger/30 bg-danger/10 p-3"
    >
      <p className="text-sm font-medium text-fg">
        {check.summary
          ? t('settings.storage.backup.problemsTitleOf', {
              date: formatDateTime(new Date(check.summary.createdAt), locale),
            })
          : t('settings.storage.backup.problemsTitle')}
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-secondary">
        {check.problems.map((problem, index) => (
          <li key={index}>{problemText(problem, t)}</li>
        ))}
      </ul>
    </div>
  );
}

function Status({ record }: { record: BackupRecord }) {
  const { t } = useI18n();
  if (!record.available) {
    return <Badge tone="warning">{t('settings.storage.backup.missing')}</Badge>;
  }
  if (record.valid === true) {
    return (
      <Badge tone="success" icon={ShieldCheck}>
        {t('settings.storage.backup.valid')}
      </Badge>
    );
  }
  if (record.valid === false) {
    return <Badge tone="danger">{t('settings.storage.backup.invalid')}</Badge>;
  }
  return <Badge>{t('settings.storage.backup.unverified')}</Badge>;
}

/**
 * Backups (specification §16): create one where the user chooses, see the history, verify a backup, and restore
 * one after a confirmation that shows its date and contents.
 */
export function BackupsCard() {
  const { t, locale } = useI18n();
  const available = isNativeRuntime();
  const overview = useBackupOverview();
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const create = useCreateBackup(setProgress);
  const verify = useVerifyBackup();
  const openFile = useOpenBackupFile();
  const restore = useRestoreBackup();
  const forget = useForgetBackup();
  const contentsText = useContentsText();
  const [restoring, setRestoring] = useState<BackupRecord | null>(null);
  const [problems, setProblems] = useState<BackupCheck | null>(null);
  const historyId = useId();
  const data = overview.data;

  const onError = (error: unknown) => {
    toast.error(t(errorMessageKey(error)));
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('settings.storage.backup.title')}
          </h3>
          <p className="max-w-2xl text-sm text-fg-secondary">
            {t('settings.storage.backup.description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={Archive}
            disabled={!available}
            loading={create.isPending}
            onClick={() => {
              setProgress(null);
              create.mutate(undefined, {
                onSuccess: (record) => {
                  setProgress(null);
                  if (record) {
                    toast.success(t('settings.storage.backup.created'));
                  }
                },
                onError: (error) => {
                  setProgress(null);
                  onError(error);
                },
              });
            }}
          >
            {t('settings.storage.backup.create')}
          </Button>
          <Button
            disabled={!available}
            loading={openFile.isPending}
            onClick={() => {
              openFile.mutate(undefined, {
                onSuccess: (result) => {
                  if (!result) {
                    return;
                  }
                  const [, check] = result;
                  if (check.problems.length > 0) {
                    setProblems(check);
                  } else {
                    setProblems(null);
                    toast.success(t('settings.storage.backup.verified'));
                  }
                },
                onError,
              });
            }}
          >
            {t('settings.storage.backup.open')}
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm text-fg-secondary">
        {progress && create.isPending && (
          <p>
            {t('settings.storage.backup.progress', {
              done: formatNumber(progress.done, locale),
              total: formatNumber(progress.total, locale),
            })}
          </p>
        )}
        {data?.lastBackupAt != null ? (
          <>
            <p>
              {t('settings.storage.backup.last', {
                date: formatDateTime(new Date(data.lastBackupAt), locale),
              })}
            </p>
            {data.location !== null && (
              <p className="break-all">
                {t('settings.storage.backup.location', { folder: data.location })}
              </p>
            )}
          </>
        ) : (
          <p>{t('settings.storage.backup.none')}</p>
        )}
        <p>{t('settings.storage.backup.automatic')}</p>
      </div>
      {problems && problems.problems.length > 0 && <Problems check={problems} />}
      {data && data.backups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 id={historyId} className="text-xs font-medium text-fg-secondary">
            {t('settings.storage.backup.historyTitle')}
          </h4>
          <ul
            aria-labelledby={historyId}
            className="flex flex-col divide-y divide-line-subtle rounded-control border border-line"
          >
            {data.backups.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                    {formatDateTime(new Date(record.createdAt), locale)}
                    <span className="text-fg-secondary">
                      {formatFileSize(record.sizeBytes, locale)}
                    </span>
                    <Status record={record} />
                  </p>
                  <p className="text-xs text-fg-secondary">{contentsText(record)}</p>
                  <p className="truncate text-xs text-fg-secondary" title={record.path}>
                    {record.path}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ShieldCheck}
                    disabled={!record.available || verify.isPending}
                    onClick={() => {
                      verify.mutate(record.id, {
                        onSuccess: (check) => {
                          if (check.problems.length > 0) {
                            setProblems(check);
                          } else {
                            setProblems(null);
                            toast.success(t('settings.storage.backup.verified'));
                          }
                        },
                        onError,
                      });
                    }}
                  >
                    {t('settings.storage.backup.verify')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={RotateCcw}
                    disabled={!record.available || record.valid === false}
                    onClick={() => {
                      setRestoring(record);
                    }}
                  >
                    {t('settings.storage.backup.restore')}
                  </Button>
                  <IconButton
                    icon={FolderOpen}
                    label={t('settings.storage.backup.reveal')}
                    disabled={!record.available}
                    onClick={() => {
                      revealBackup(record.id).catch(onError);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label={t('settings.storage.backup.forget')}
                    onClick={() => {
                      forget.mutate(record.id, {
                        onSuccess: () => {
                          toast.success(t('settings.storage.backup.forgotten'));
                        },
                        onError,
                      });
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {restoring && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setRestoring(null);
            }
          }}
          title={t('settings.storage.backup.restoreDialog.title', {
            date: formatDateTime(new Date(restoring.createdAt), locale),
          })}
          description={t('settings.storage.backup.restoreDialog.description', {
            contents: contentsText(restoring),
          })}
          confirmLabel={t('settings.storage.backup.restoreDialog.confirm')}
          tone="danger"
          loading={restore.isPending}
          onConfirm={() => {
            restore.mutate(restoring.id, {
              // A valid backup restarts ARCHIVE, which answers only when it cannot be restored.
              onSuccess: (check) => {
                setRestoring(null);
                setProblems(check.problems.length > 0 ? check : null);
              },
              onError: (error) => {
                setRestoring(null);
                onError(error);
              },
            });
          }}
        />
      )}
    </Card>
  );
}
