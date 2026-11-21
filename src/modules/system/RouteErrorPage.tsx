import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { ErrorPanel } from '@/components/feedback/ErrorPanel';
import { ButtonLink } from '@/components/ui';
import { useI18n } from '@/i18n';
import { reportError } from '@/services/diagnostics';

/** Rendering error inside a page: the shell stays usable and the error is logged. */
export function RouteErrorPage() {
  const { t } = useI18n();
  const error = useRouteError();

  useEffect(() => {
    reportError('Route error', error);
  }, [error]);

  return (
    <ErrorPanel
      error={error}
      actions={
        <ButtonLink to="/" icon={ArrowLeft}>
          {t('common.backToOverview')}
        </ButtonLink>
      }
    />
  );
}
