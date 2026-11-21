import {
  Library,
  MessageSquareText,
  Search,
  ShieldCheck,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Card, type IconTone } from '@/components/ui';
import { formatLongDate, useI18n } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/utils/cn';
import { getGreetingPeriod } from './greeting';

type PillarId = 'centralize' | 'retrieve' | 'connect' | 'understand';

const PILLARS: readonly { id: PillarId; icon: LucideIcon; tone: IconTone }[] = [
  { id: 'centralize', icon: Library, tone: 'brand' },
  { id: 'retrieve', icon: Search, tone: 'interactive' },
  { id: 'connect', icon: Waypoints, tone: 'relations' },
  { id: 'understand', icon: MessageSquareText, tone: 'intelligence' },
];

const TONE_CLASSES: Record<IconTone, string> = {
  neutral: 'text-fg-secondary',
  brand: 'text-amber',
  interactive: 'text-blue',
  intelligence: 'text-cyan',
  relations: 'text-purple',
  success: 'text-success',
  danger: 'text-danger',
};

/**
 * Overview (specification §6). Until documents and notes exist (Phases 3 to 5), it greets the user and
 * explains what ARCHIVE will bring together, without any statistics: no figure is shown that does not
 * come from real data.
 */
export function DashboardPage() {
  const { t, locale } = useI18n();
  const now = useNow();
  const greeting = t(`dashboard.greeting.${getGreetingPeriod(now)}`);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-fg-secondary first-letter:uppercase">
          {formatLongDate(now, locale)}
        </p>
        <h2 className="font-display text-3xl font-semibold text-fg">
          {t('dashboard.welcome', { greeting })}
        </h2>
        <p className="text-base text-fg-secondary">{t('dashboard.subtitle')}</p>
      </header>

      <section aria-labelledby="dashboard-pillars" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h3
            id="dashboard-pillars"
            className="text-2xs font-semibold tracking-label text-fg-secondary uppercase"
          >
            {t('dashboard.pillarsTitle')}
          </h3>
          <Badge>{t('common.comingSoon')}</Badge>
        </div>
        <ul className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {PILLARS.map(({ id, icon: Icon, tone }) => (
            <li key={id}>
              <Card className="flex h-full flex-col gap-4">
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-control border border-line-subtle bg-steel',
                    TONE_CLASSES[tone],
                  )}
                >
                  <Icon size={20} />
                </span>
                <div className="flex flex-col gap-1">
                  <h4 className="font-display text-lg font-semibold text-fg">
                    {t(`dashboard.pillars.${id}.title`)}
                  </h4>
                  <p className="text-sm text-fg-secondary">
                    {t(`dashboard.pillars.${id}.description`)}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Card className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line-subtle bg-steel text-success">
          <ShieldCheck size={20} />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold text-fg">
            {t('dashboard.localFirst.title')}
          </h3>
          <p className="max-w-3xl text-sm text-fg-secondary">
            {t('dashboard.localFirst.description')}
          </p>
        </div>
      </Card>
    </div>
  );
}
