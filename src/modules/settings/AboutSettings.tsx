import { CircleAlert, CircleHelp, RotateCcw } from 'lucide-react';
import { ArchiveMark } from '@/components/brand/ArchiveMark';
import { Button, ButtonLink, Card, Skeleton } from '@/components/ui';
import { useAppInfo } from '@/hooks/useAppInfo';
import { useI18n, type MessageKey } from '@/i18n';
import type { AppInfo } from '@/services/app';
import { CREDITS } from './credits';
import { SettingsSection } from './SettingsPanels';

function BuildDetails({ info }: { info: AppInfo }) {
  const { t } = useI18n();
  const rows: readonly { labelKey: MessageKey; value: string; mono?: boolean }[] = [
    { labelKey: 'about.version', value: info.version, mono: true },
    { labelKey: 'about.commit', value: info.commit, mono: true },
    {
      labelKey: 'about.buildProfile',
      value: t(info.buildProfile === 'release' ? 'about.profileRelease' : 'about.profileDebug'),
    },
    { labelKey: 'about.platform', value: `${info.targetOs} · ${info.targetArch}`, mono: true },
    { labelKey: 'about.runtime', value: info.tauriVersion, mono: true },
  ];
  return (
    <dl className="flex flex-col">
      {rows.map(({ labelKey, value, mono }) => (
        <div
          key={labelKey}
          className="flex items-baseline justify-between gap-6 border-b border-line-subtle py-3 last:border-b-0"
        >
          <dt className="text-sm text-fg-secondary">{t(labelKey)}</dt>
          <dd className={mono ? 'font-mono text-xs text-fg' : 'text-sm text-fg'}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** About section (specification §15.5): logo, name, version, build information, credits, documentation. */
export function AboutSettings() {
  const { t } = useI18n();
  const appInfo = useAppInfo();

  return (
    <SettingsSection titleKey="settings.sections.about">
      <Card padding="lg" className="flex items-center gap-5">
        <ArchiveMark size={56} />
        <div className="flex flex-col gap-1">
          <p className="font-display text-2xl font-semibold tracking-brand text-fg uppercase">
            {t('app.name')}
          </p>
          <p className="text-sm text-fg-secondary">
            {t('app.designation')} · <span lang="en">{t('app.tagline')}</span>
          </p>
        </div>
      </Card>

      <Card>
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('about.buildTitle')}
        </h3>
        <div className="mt-2" aria-busy={appInfo.status === 'loading'}>
          {appInfo.status === 'loading' ? (
            <div className="flex flex-col gap-3 py-3">
              <Skeleton surface="raised" className="h-4 w-3/4" />
              <Skeleton surface="raised" className="h-4 w-1/2" />
              <Skeleton surface="raised" className="h-4 w-2/3" />
            </div>
          ) : appInfo.status === 'error' ? (
            <div className="flex items-start justify-between gap-4 py-3">
              <p className="flex items-start gap-2 text-sm text-fg-secondary">
                <span className="flex h-5 shrink-0 items-center text-warning">
                  <CircleAlert size={16} />
                </span>
                {t('about.unavailable')}
              </p>
              <Button size="sm" icon={RotateCcw} onClick={appInfo.retry}>
                {t('common.retry')}
              </Button>
            </div>
          ) : (
            <BuildDetails info={appInfo.data} />
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('about.creditsTitle')}
        </h3>
        <p className="mt-2 text-sm text-fg-secondary">{t('about.creditsIntro')}</p>
        <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2">
          {CREDITS.map(({ name, licence }) => (
            <li key={name} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-fg">{name}</span>
              <span className="font-mono text-xs text-fg-secondary">{licence}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
            {t('about.documentationTitle')}
          </h3>
          <p className="text-sm text-fg-secondary">{t('help.intro')}</p>
        </div>
        <ButtonLink to="/help" icon={CircleHelp}>
          {t('about.documentationLink')}
        </ButtonLink>
      </Card>
    </SettingsSection>
  );
}
