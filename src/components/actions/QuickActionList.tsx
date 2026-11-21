import type { LucideIcon } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { Badge, KeyCombo } from '@/components/ui';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Keyboard shortcut of the action, displayed when it is available. */
  keys?: readonly string[];
  /** Without a handler, the action belongs to a module not delivered yet: it is shown as upcoming. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

export interface QuickActionListProps {
  actions: readonly QuickAction[];
  /** Grid columns, for example `grid-cols-2 xl:grid-cols-4`. */
  className?: string;
}

/**
 * Quick actions as tiles: the label has the full width of its tile and never gets truncated. Upcoming ones
 * are visibly unavailable: no dead button.
 */
export function QuickActionList({ actions, className }: QuickActionListProps) {
  const { t } = useI18n();
  return (
    <ul className={cn('grid gap-4', className)}>
      {actions.map(({ id, icon: Icon, label, keys, onClick }) => (
        <li key={id}>
          <button
            type="button"
            disabled={!onClick}
            onClick={onClick}
            className="group flex h-full w-full cursor-default flex-col gap-3 rounded-card border border-line-subtle bg-graphite p-4 text-left transition-colors duration-150 ease-standard enabled:hover:border-line enabled:hover:bg-steel"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <Icon size={20} className="shrink-0 text-amber group-disabled:text-fg-disabled" />
              {onClick ? (
                keys ? (
                  <KeyCombo keys={keys} />
                ) : null
              ) : (
                <Badge>{t('common.comingSoon')}</Badge>
              )}
            </span>
            <span className="text-sm font-medium text-fg group-disabled:text-fg-disabled">
              {label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
