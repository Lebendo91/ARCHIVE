import { NavLink, Outlet } from 'react-router';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';
import { SETTINGS_SECTIONS } from './sections';

export function SettingsLayout() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-8">
      <nav aria-label={t('settings.sectionsLabel')} className="sticky top-0 w-56 shrink-0">
        <ul className="flex flex-col gap-1">
          {SETTINGS_SECTIONS.map(({ id, icon: Icon }) => (
            <li key={id}>
              <NavLink
                to={`/settings/${id}`}
                className={({ isActive }) =>
                  cn(
                    'flex h-8 cursor-default items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150 ease-standard',
                    isActive
                      ? 'bg-graphite text-fg'
                      : 'text-fg-secondary hover:bg-graphite/60 hover:text-fg',
                  )
                }
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{t(`settings.sections.${id}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 max-w-3xl flex-1">
        <Outlet />
      </div>
    </div>
  );
}
