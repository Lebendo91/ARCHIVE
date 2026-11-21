import { BookOpenText, Info } from 'lucide-react';
import { ShortcutsTable } from '@/components/shortcuts/ShortcutsTable';
import { Badge, ButtonLink, Card, CardHeader } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Help: keyboard shortcut reference (specification §17.3), user guide entry point and About link. */
export function HelpPage() {
  const { t } = useI18n();
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <p className="text-base text-fg-secondary">{t('help.intro')}</p>

      <section aria-labelledby="help-shortcuts" className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 id="help-shortcuts" className="font-display text-2xl font-semibold text-fg">
            {t('help.shortcutsTitle')}
          </h2>
          <p className="text-sm text-fg-secondary">{t('help.shortcutsDescription')}</p>
        </header>
        <ShortcutsTable />
      </section>

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-4">
          <CardHeader
            icon={BookOpenText}
            title={t('help.guideTitle')}
            description={t('help.guideDescription')}
            headingLevel={2}
          />
          <div>
            <Badge>{t('common.comingSoon')}</Badge>
          </div>
        </Card>
        <Card className="flex flex-col gap-4">
          <CardHeader
            icon={Info}
            title={t('help.aboutTitle')}
            description={t('help.aboutDescription')}
            headingLevel={2}
          />
          <div>
            <ButtonLink to="/settings/about">{t('help.aboutLink')}</ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
