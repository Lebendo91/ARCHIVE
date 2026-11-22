import type { Folder } from '@/types/bindings/Folder';
import type { Tag } from '@/types/bindings/Tag';
import type { TokenColor } from '@/types/bindings/TokenColor';
import { callCommand } from './tauri';

export type { Folder, Tag };

export function listFolders(workspaceId: string): Promise<Folder[]> {
  return callCommand('folders_list', { workspaceId });
}

export function createFolder(
  workspaceId: string,
  parentId: string | null,
  name: string,
): Promise<Folder> {
  return callCommand('folders_create', { workspaceId, parentId, name });
}

export function renameFolder(id: string, name: string): Promise<Folder> {
  return callCommand('folders_rename', { id, name });
}

/** Deletes an empty folder; the core refuses a folder that still holds anything. */
export function deleteFolder(id: string): Promise<null> {
  return callCommand('folders_delete', { id });
}

export function listTags(): Promise<Tag[]> {
  return callCommand('tags_list');
}

export function createTag(name: string, color: TokenColor): Promise<Tag> {
  return callCommand('tags_create', { name, color });
}

export function renameTag(id: string, name: string): Promise<Tag> {
  return callCommand('tags_rename', { id, name });
}

export function deleteTag(id: string): Promise<null> {
  return callCommand('tags_delete', { id });
}
