import { ArchiveMark } from '@/components/brand/ArchiveMark';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Shown for the instant needed to read the status and the settings at startup. */
export function BootScreen() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-obsidian text-fg-secondary">
      <ArchiveMark size={48} />
      <Spinner size={20} label={t('boot.loading')} />
    </div>
  );
}
