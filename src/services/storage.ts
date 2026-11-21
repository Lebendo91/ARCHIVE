import type { IntegrityReport } from '@/types/bindings/IntegrityReport';
import type { StorageFolder } from '@/types/bindings/StorageFolder';
import type { StorageOverview } from '@/types/bindings/StorageOverview';
import { callCommand } from './tauri';

export type { IntegrityReport, StorageFolder, StorageOverview };

export function getStorageOverview(): Promise<StorageOverview> {
  return callCommand('storage_overview');
}

/** Opens a data folder in the file explorer; the native core resolves the path. */
export function openStorageFolder(folder: StorageFolder): Promise<null> {
  return callCommand('storage_open_folder', { folder });
}

export function checkDatabaseIntegrity(): Promise<IntegrityReport> {
  return callCommand('database_check_integrity');
}
