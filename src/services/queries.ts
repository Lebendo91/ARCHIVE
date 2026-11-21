import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAppInfo, getAppStatus, retryDatabase } from './app';
import { getSettings, updateSettings } from './settings';
import { checkDatabaseIntegrity, getStorageOverview, openStorageFolder } from './storage';
import { isNativeRuntime } from './tauri';

/** Query keys of the data provided by the native core. */
export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  appStatus: ['app', 'status'] as const,
  settings: ['settings'] as const,
  storageOverview: ['storage', 'overview'] as const,
};

/**
 * Data comes from the local native core: a failure is not a flaky network, so queries are not retried
 * automatically, and a window regaining focus does not trigger refetches.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

export function useAppInfo() {
  return useQuery({ queryKey: queryKeys.appInfo, queryFn: getAppInfo, staleTime: Infinity });
}

export function useAppStatus() {
  return useQuery({ queryKey: queryKeys.appStatus, queryFn: getAppStatus, staleTime: Infinity });
}

export function useSettings({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: getSettings,
    enabled: enabled && isNativeRuntime(),
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.settings, settings);
    },
  });
}

export function useRetryDatabase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: retryDatabase,
    onSuccess: async (status) => {
      client.setQueryData(queryKeys.appStatus, status);
      await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'app' });
    },
  });
}

export function useStorageOverview() {
  return useQuery({ queryKey: queryKeys.storageOverview, queryFn: getStorageOverview });
}

export function useOpenStorageFolder() {
  return useMutation({ mutationFn: openStorageFolder });
}

export function useIntegrityCheck() {
  return useMutation({ mutationFn: checkDatabaseIntegrity });
}
