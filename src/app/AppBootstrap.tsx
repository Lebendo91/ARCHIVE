import type { ReactNode } from 'react';
import { BootScreen } from '@/modules/system/BootScreen';
import { SafeModeScreen } from '@/modules/system/SafeModeScreen';
import { useAppStatus, useSettings } from '@/services/queries';
import { isNativeRuntime } from '@/services/tauri';

/**
 * Startup sequence: wait for the native core status and the settings (so that the interface appears
 * directly in the right language), or show the safe mode screen if the database could not be opened.
 * Outside the desktop application (browser preview, tests), the interface renders with its defaults.
 */
export function AppBootstrap({ children }: { children: ReactNode }) {
  const status = useAppStatus();
  const settings = useSettings();

  if (!isNativeRuntime()) {
    return children;
  }
  if (status.isPending) {
    return <BootScreen />;
  }
  if (status.isError) {
    return <SafeModeScreen error={status.error} />;
  }
  if (status.data.database === 'unavailable') {
    return <SafeModeScreen status={status.data} />;
  }
  if (settings.isPending) {
    return <BootScreen />;
  }
  return children;
}
