import { Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';

export function RouteLoading() {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center bg-obsidian text-fg-secondary">
      <Spinner size={24} label={t('common.loading')} />
    </div>
  );
}
