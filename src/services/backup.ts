import { Channel } from '@tauri-apps/api/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupProgress } from '@/types/bindings/BackupProgress';
import { callCommand, isNativeRuntime } from './tauri';

export type { BackupCheck } from '@/types/bindings/BackupCheck';
export type { BackupProblem } from '@/types/bindings/BackupProblem';
export type { BackupRecord } from '@/types/bindings/BackupRecord';
export type { BackupProgress } from '@/types/bindings/BackupProgress';

export const backupKeys = { overview: ['backups'] as const };

export function useBackupOverview() {
  return useQuery({
    queryKey: backupKeys.overview,
    queryFn: () => callCommand('backup_overview'),
    enabled: isNativeRuntime(),
  });
}

function useBackupMutation<TVariables, TResult>(run: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => client.invalidateQueries({ queryKey: backupKeys.overview }),
  });
}

/** Creates a backup where the user chooses (a dialog of the core); `null` when cancelled. */
export function useCreateBackup(onProgress: (progress: BackupProgress) => void) {
  return useBackupMutation(() =>
    callCommand('backup_create', { onProgress: new Channel<BackupProgress>(onProgress) }),
  );
}

export function useVerifyBackup() {
  return useBackupMutation((id: string) => callCommand('backup_verify', { id }));
}

export function useOpenBackupFile() {
  return useBackupMutation(() => callCommand('backup_open_file'));
}

export function useRestoreBackup() {
  return useBackupMutation((id: string) => callCommand('backup_restore', { id }));
}

export function useForgetBackup() {
  return useBackupMutation((id: string) => callCommand('backup_forget', { id }));
}

export function revealBackup(id: string): Promise<null> {
  return callCommand('backup_reveal', { id });
}
