import { useEffect } from 'react';
import { formatDateTime, useI18n } from '@/i18n';
import { useAppStatus } from '@/services/queries';
import { toast } from '@/stores/toasts';

/** Long enough to read the notice and note the folder it names; it can be dismissed sooner. */
const NOTICE_DURATION = 60_000;

/** The outcome already told: the status of one start always carries the same one. */
let told: string | null = null;

/** Tells the user, once, what became of a restoration prepared before this start (specification §16.3). */
export function useRestoreNotice(): void {
  const { t, locale } = useI18n();
  const restore = useAppStatus().data?.restore ?? null;
  useEffect(() => {
    if (restore === null) {
      return;
    }
    const key = JSON.stringify(restore);
    if (told === key) {
      return;
    }
    told = key;
    const date = formatDateTime(new Date(restore.backupCreatedAt), locale);
    const options = { duration: NOTICE_DURATION };
    if (restore.applied) {
      toast.success(
        t('settings.storage.backup.restored', { date, folder: restore.keptIn ?? '' }),
        options,
      );
    } else if (restore.keptIn !== null) {
      toast.error(
        t('settings.storage.backup.restoreStranded', { folder: restore.keptIn }),
        options,
      );
    } else {
      toast.error(t('settings.storage.backup.restoreFailed'), options);
    }
  }, [restore, t, locale]);
}
