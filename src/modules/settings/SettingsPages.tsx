import { ShortcutsTable } from '@/components/shortcuts/ShortcutsTable';
import { CurrentValues, SettingsSection, UpcomingSettings } from './SettingsPanels';

export function GeneralSettings() {
  return (
    <SettingsSection
      titleKey="settings.sections.general"
      descriptionKey="settings.general.description"
    >
      <CurrentValues
        rows={[
          {
            labelKey: 'settings.general.current.language',
            valueKey: 'settings.general.current.languageValue',
          },
        ]}
      />
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

export function StorageSettings() {
  return (
    <SettingsSection
      titleKey="settings.sections.storage"
      descriptionKey="settings.storage.description"
    >
      <UpcomingSettings listKey="settings.storage.upcoming" />
    </SettingsSection>
  );
}

export function AiSettings() {
  return (
    <SettingsSection titleKey="settings.sections.ai" descriptionKey="settings.ai.description">
      <CurrentValues
        rows={[
          {
            labelKey: 'settings.ai.current.provider',
            valueKey: 'settings.ai.current.providerValue',
          },
        ]}
      />
      <UpcomingSettings listKey="settings.ai.upcoming" />
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
