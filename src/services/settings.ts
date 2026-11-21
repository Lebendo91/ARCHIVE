import type { AppSettings } from '@/types/bindings/AppSettings';
import type { SettingsPatch } from '@/types/bindings/SettingsPatch';
import { callCommand } from './tauri';

export type { AppSettings, SettingsPatch };

export function getSettings(): Promise<AppSettings> {
  return callCommand('settings_get');
}

export function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
  return callCommand('settings_update', { patch });
}
