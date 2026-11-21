import { ArrowLeft, Compass } from 'lucide-react';
import { ButtonLink, EmptyState } from '@/components/ui';
import { useI18n } from '@/i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={Compass}
      title={t('errors.notFoundTitle')}
      description={t('errors.notFoundDescription')}
      actions={
        <ButtonLink to="/" variant="primary" icon={ArrowLeft}>
          {t('common.backToOverview')}
        </ButtonLink>
      }
    />
  );
}
