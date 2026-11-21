import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';
import { useI18n, type ListKey, type MessageKey } from '@/i18n';

export function SettingsSection({
  titleKey,
  descriptionKey,
  children,
}: {
  titleKey: MessageKey;
  descriptionKey?: MessageKey;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold text-fg">{t(titleKey)}</h2>
        {descriptionKey ? <p className="text-sm text-fg-secondary">{t(descriptionKey)}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Read-only view of the configuration in force: only facts, never values pretending to be editable. */
export function CurrentValues({
  rows,
}: {
  rows: readonly { labelKey: MessageKey; valueKey: MessageKey }[];
}) {
  const { t } = useI18n();
  return (
    <Card padding="none">
      <h3 className="px-5 pt-5 text-2xs font-semibold tracking-label text-fg-secondary uppercase">
        {t('settings.currentTitle')}
      </h3>
      <dl className="flex flex-col py-2">
        {rows.map(({ labelKey, valueKey }) => (
          <div
            key={labelKey}
            className="flex items-baseline justify-between gap-6 border-b border-line-subtle px-5 py-3 last:border-b-0"
          >
            <dt className="text-sm text-fg-secondary">{t(labelKey)}</dt>
            <dd className="text-right text-sm font-medium text-fg">{t(valueKey)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function UpcomingSettings({ listKey }: { listKey: ListKey }) {
  const { t, tList } = useI18n();
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('settings.upcomingTitle')}
        </h3>
        <Badge>{t('common.comingSoon')}</Badge>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {tList(listKey).map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-fg-secondary">
            <span className="flex h-5 shrink-0 items-center">
              <Check size={16} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
