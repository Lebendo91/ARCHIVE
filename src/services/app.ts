import { callCommand } from './tauri';

/** Mirrors `AppInfo` in src-tauri/src/commands/app.rs (generated bindings replace it in Phase 2). */
export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  commit: string;
  buildProfile: 'debug' | 'release';
  targetOs: string;
  targetArch: string;
}

export function getAppInfo(): Promise<AppInfo> {
  return callCommand<AppInfo>('app_info');
}
