import type { AppInfo } from '@/types/bindings/AppInfo';
import type { AppStatus } from '@/types/bindings/AppStatus';
import { callCommand } from './tauri';

export type { AppInfo, AppStatus };

export function getAppInfo(): Promise<AppInfo> {
  return callCommand('app_info');
}

export function getAppStatus(): Promise<AppStatus> {
  return callCommand('app_status');
}

export function retryDatabase(): Promise<AppStatus> {
  return callCommand('database_retry');
}
