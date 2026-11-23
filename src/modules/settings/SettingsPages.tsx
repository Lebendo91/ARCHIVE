import { ShortcutsTable } from '@/components/shortcuts/ShortcutsTable';
import { LanguageSettings } from './LanguageSettings';
import { CurrentValues, SettingsSection, UpcomingSettings } from './SettingsPanels';

export function GeneralSettings() {
  return (
    <SettingsSection
      titleKey="settings.sections.general"
      descriptionKey="settings.general.description"
    >
      <LanguageSettings />
      <UpcomingSettings listKey="settings.general.upcoming" />
    </SettingsSection>
  );
}

export function AppearanceSettings() {
  return (
    <SettingsSection
      titleKey="settings.sections.appearance"
      descriptionKey="settings.appearance.description"
    >
      <CurrentValues
        rows={[
          {
            labelKey: 'settings.appearance.current.theme',
            valueKey: 'settings.appearance.current.themeValue',
          },
          {
            labelKey: 'settings.appearance.current.motion',
            valueKey: 'settings.appearance.current.motionValue',
          },
        ]}
      />
      <UpcomingSettings listKey="settings.appearance.upcoming" />
    </SettingsSection>
  );
}

export function ShortcutsSettings() {
  return (
    <SettingsSection
      titleKey="settings.sections.shortcuts"
      descriptionKey="help.shortcutsDescription"
    >
      <ShortcutsTable />
    </SettingsSection>
  );
}
