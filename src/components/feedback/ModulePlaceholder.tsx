import { Check, type LucideIcon } from 'lucide-react';
import { Badge, Card, EmptyState, type IconTone } from '@/components/ui';
import { useI18n } from '@/i18n';

export type PlaceholderModule = 'graph' | 'timeline' | 'assistant';

export interface ModulePlaceholderProps {
  module: PlaceholderModule;
  icon: LucideIcon;
  iconTone?: IconTone;
}

/**
 * Honest empty state of a module that is not delivered yet: it states that the area is empty, what it will
 * contain and that it is coming soon. It never simulates content or offers actions that do not work.
 */
export function ModulePlaceholder({ module, icon, iconTone = 'neutral' }: ModulePlaceholderProps) {
  const { t, tList } = useI18n();
  const capabilities = tList(`modules.${module}.capabilities`);

  return (
    <EmptyState
      icon={icon}
      iconTone={iconTone}
      title={t(`modules.${module}.title`)}
      description={t(`modules.${module}.description`)}
      badge={<Badge>{t('common.comingSoon')}</Badge>}
    >
      <Card className="text-left">
        <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
          {t('modules.capabilitiesTitle')}
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {capabilities.map((capability) => (
            <li key={capability} className="flex items-start gap-2 text-sm text-fg-secondary">
              <span className="flex h-5 shrink-0 items-center text-fg-secondary">
                <Check size={16} />
              </span>
              {capability}
            </li>
          ))}
        </ul>
      </Card>
    </EmptyState>
  );
}
