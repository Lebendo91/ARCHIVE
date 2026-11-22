import type { Folder } from '@/services/library';

/** Folders in tree order, each with its depth, for an indented list. */
export function folderTree(folders: readonly Folder[]): { folder: Folder; depth: number }[] {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const ordered: { folder: Folder; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const siblings = (children.get(parentId) ?? []).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const folder of siblings) {
      ordered.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}
