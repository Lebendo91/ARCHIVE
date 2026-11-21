import { ChevronsUpDown, CircleHelp, Info, Settings, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { formatCombination, getShortcut } from '@/app/shortcuts/shortcuts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';

export type ProfileMenuTrigger = 'avatar' | 'sidebar' | 'sidebar-collapsed';

function Avatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-line bg-steel text-fg-secondary',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
      )}
    >
      <UserRound size={16} />
    </span>
  );
}

/** Local profile menu (specification §3.3 and §3.4). ARCHIVE has no account: the profile is this device. */
export function ProfileMenu({ trigger }: { trigger: ProfileMenuTrigger }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const settingsKeys = formatCombination(getShortcut('openSettings').combination, t);

  const triggerButton =
    trigger === 'sidebar' ? (
      <button
        type="button"
        className="flex w-full cursor-default items-center gap-3 rounded-control p-2 text-left transition-colors duration-150 ease-standard hover:bg-graphite"
      >
        <Avatar />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{t('profile.name')}</span>
          <span className="block truncate text-2xs text-fg-secondary">{t('profile.hint')}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-fg-secondary" />
      </button>
    ) : (
      <button
        type="button"
        aria-label={t('profile.menuLabel')}
        className={cn(
          'flex cursor-default items-center justify-center rounded-full transition-colors duration-150 ease-standard hover:bg-graphite',
          trigger === 'sidebar-collapsed' ? 'mx-auto h-10 w-10' : 'h-9 w-9',
        )}
      >
        <Avatar size={trigger === 'avatar' ? 'md' : 'sm'} />
      </button>
    );

  return (
    <DropdownMenu>
      {trigger === 'sidebar' ? (
        <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
      ) : (
        <Tooltip content={t('profile.menuLabel')} side={trigger === 'avatar' ? 'bottom' : 'right'}>
          <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
        </Tooltip>
      )}
      <DropdownMenuContent
        side={trigger === 'avatar' ? 'bottom' : trigger === 'sidebar' ? 'top' : 'right'}
        align={trigger === 'avatar' ? 'end' : 'start'}
      >
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-fg">{t('profile.name')}</span>
          <span className="mt-1 block max-w-60 text-xs text-fg-secondary">
            {t('profile.description')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Settings}
          shortcut={settingsKeys}
          onSelect={() => {
            void navigate('/settings');
          }}
        >
          {t('profile.settings')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={CircleHelp}
          onSelect={() => {
            void navigate('/help');
          }}
        >
          {t('profile.help')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={Info}
          onSelect={() => {
            void navigate('/settings/about');
          }}
        >
          {t('profile.about')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
