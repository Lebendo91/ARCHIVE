import {
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { getAppInfo, getAppStatus, retryDatabase } from './app';
import { getDashboardOverview } from './dashboard';
import { getDocument, listDocuments, type DocumentQuery } from './documents';
import { listFolders, listTags } from './library';
import { getNote, listNotes, type LinkKind, type NoteQuery } from './notes';
import { getSettings, updateSettings } from './settings';
import { checkDatabaseIntegrity, getStorageOverview, openStorageFolder } from './storage';
import { isNativeRuntime } from './tauri';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  setWorkspaceArchived,
  updateWorkspace,
  type WorkspaceDeletion,
  type WorkspacePatch,
} from './workspaces';

/** Query keys of the data provided by the native core. */
export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  appStatus: ['app', 'status'] as const,
  settings: ['settings'] as const,
  storageOverview: ['storage', 'overview'] as const,
  /** Prefix of every workspace query (lists and details). */
  workspaces: ['workspaces'] as const,
  workspaceList: ['workspaces', 'list'] as const,
  workspace: (id: string) => ['workspaces', 'detail', id] as const,
  dashboard: ['dashboard'] as const,
  /** Prefix of every document query (lists and details). */
  documents: ['documents'] as const,
  documentList: (query: DocumentQuery) => ['documents', 'list', query] as const,
  document: (id: string) => ['documents', 'detail', id] as const,
  /** Prefix of every folder query. */
  folders: ['folders'] as const,
  workspaceFolders: (workspaceId: string) => ['folders', workspaceId] as const,
  tags: ['tags'] as const,
  /** Prefix of every note query (lists and details). */
  notes: ['notes'] as const,
  notePages: ['notes', 'pages'] as const,
  note: (id: string) => ['notes', 'detail', id] as const,
  /** Prefix of every search query (results and history): any change of the data may change them. */
  search: ['search'] as const,
  /** Prefix of what the memory engine knows (processing, analysis, relations): any change may change it. */
  memory: ['memory'] as const,
  memoryItem: (kind: LinkKind, id: string) => ['memory', 'item', kind, id] as const,
  relations: (kind: LinkKind, id: string) => ['memory', 'relations', kind, id] as const,
  memoryOverview: ['memory', 'overview'] as const,
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

export function useDashboardOverview() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: getDashboardOverview });
}

/**
 * Every workspace, archived ones included, in display order. One list serves every view (sidebar, pages,
 * dialogs), which filter it: they always agree with each other.
 */
export function useWorkspaces() {
  return useQuery({ queryKey: queryKeys.workspaceList, queryFn: () => listWorkspaces(true) });
}

export function useWorkspace(id: string) {
  return useQuery({ queryKey: queryKeys.workspace(id), queryFn: () => getWorkspace(id) });
}

/**
 * Refreshes every view that shows workspaces, their counts or the activity they generate. The mutation
 * stays pending until the displayed data is up to date, so a dialog never closes on stale content.
 */
async function refreshWorkspaceViews(
  client: QueryClient,
  except?: readonly unknown[],
): Promise<void> {
  const isExcepted = (key: readonly unknown[]) =>
    except?.length === key.length && key.every((part, index) => part === except[index]);
  await Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.workspaces,
      predicate: (query) => !isExcepted(query.queryKey),
    }),
    client.invalidateQueries({ queryKey: queryKeys.dashboard }),
    // Deleting a workspace moves its documents and folders.
    client.invalidateQueries({ queryKey: queryKeys.documents }),
    client.invalidateQueries({ queryKey: queryKeys.folders }),
    client.invalidateQueries({ queryKey: queryKeys.search }),
    client.invalidateQueries({ queryKey: queryKeys.memory }),
  ]);
}

export function useCreateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => refreshWorkspaceViews(client),
  });
}

export function useUpdateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkspacePatch }) =>
      updateWorkspace(id, patch),
    onSuccess: () => refreshWorkspaceViews(client),
  });
}

export function useSetWorkspaceArchived() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setWorkspaceArchived(id, archived),
    onSuccess: () => refreshWorkspaceViews(client),
  });
}

export function useDeleteWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deletion }: { id: string; deletion: WorkspaceDeletion }) =>
      deleteWorkspace(id, deletion),
    onSuccess: async (_report, { id }) => {
      const detailKey = queryKeys.workspace(id);
      // The page of the deleted workspace may still be displayed until the interface navigates away: its
      // data is dropped once nothing shows it, and is never refetched in the meantime.
      client.removeQueries({ queryKey: detailKey, type: 'inactive' });
      await client.invalidateQueries({ queryKey: detailKey, refetchType: 'none' });
      await refreshWorkspaceViews(client, detailKey);
    },
  });
}

/** A page of the Library. The previous page stays displayed while the next one loads. */
export function useDocuments(query: DocumentQuery, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.documentList(query),
    queryFn: () => listDocuments(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Library pages loaded one after the other (« Show more »), from offset 0. */
export function useDocumentPages(query: Omit<DocumentQuery, 'offset'>) {
  return useInfiniteQuery({
    queryKey: ['documents', 'pages', query] as const,
    queryFn: ({ pageParam }) => listDocuments({ ...query, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });
}

export function useDocument(id: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.document(id), queryFn: () => getDocument(id), enabled });
}

export function useFolders(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaceFolders(workspaceId ?? ''),
    queryFn: () => listFolders(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  });
}

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: listTags });
}

/**
 * Every view a change of documents, notes, folders or tags can affect: lists, details (a note names the
 * documents it links to, a document the notes citing it), counts, overview.
 */
export async function refreshLibraryViews(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.documents }),
    client.invalidateQueries({ queryKey: queryKeys.notes }),
    client.invalidateQueries({ queryKey: queryKeys.folders }),
    client.invalidateQueries({ queryKey: queryKeys.tags }),
    client.invalidateQueries({ queryKey: queryKeys.workspaces }),
    client.invalidateQueries({ queryKey: queryKeys.dashboard }),
    client.invalidateQueries({ queryKey: queryKeys.storageOverview }),
    client.invalidateQueries({ queryKey: queryKeys.search }),
    client.invalidateQueries({ queryKey: queryKeys.memory }),
  ]);
}

/**
 * Mutation of the Library (document, folder or tag). Like the workspace mutations, it stays pending until
 * the displayed data is up to date.
 */
export function useLibraryMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => refreshLibraryViews(client) });
}

/** Notes loaded one page after the other (« Show more »), from offset 0. */
export function useNotePages(query: Omit<NoteQuery, 'offset'>) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.notePages, query] as const,
    queryFn: ({ pageParam }) => listNotes({ ...query, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });
}

export function useNote(id: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.note(id), queryFn: () => getNote(id), enabled });
}

/** Notes, documents, tags, folders, workspaces and overview share their views: refresh them all. */
export const refreshNoteViews = refreshLibraryViews;
