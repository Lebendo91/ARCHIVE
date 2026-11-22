import type { JSONContent } from '@tiptap/core';
import type { LinkKind, LinkTarget } from '@/services/notes';

/** Content of a new note: one empty paragraph. */
export const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

const ARCHIVE_SCHEME = 'archive:';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Address of an internal link: `archive://note/<id>` or `archive://document/<id>`. */
export function archiveHref(kind: LinkKind, id: string): string {
  return `archive://${kind}/${id}`;
}

/** Target of an internal link, or `null` for any other address. */
export function parseArchiveHref(href: string): LinkTarget | null {
  const match = /^archive:\/\/(note|document)\/([^/?#]+)$/.exec(href.trim());
  const kind = match?.[1];
  const id = match?.[2]?.toLowerCase();
  if ((kind !== 'note' && kind !== 'document') || id === undefined || !ID_PATTERN.test(id)) {
    return null;
  }
  return { kind, id };
}

/** Web pages and e-mail addresses only: the core refuses to open anything else. */
export function isExternalUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '') ||
      url.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
}

/** Addresses a link of a note may hold: internal links and external web or e-mail addresses. */
export function isAllowedHref(href: string): boolean {
  return href.startsWith(ARCHIVE_SCHEME) ? parseArchiveHref(href) !== null : isExternalUrl(href);
}

/** Internal links of a note, each target once, in document order. */
export function collectLinks(document: JSONContent): LinkTarget[] {
  const links: LinkTarget[] = [];
  const seen = new Set<string>();
  const visit = (node: JSONContent) => {
    for (const mark of node.marks ?? []) {
      const href: unknown = mark.attrs?.href;
      if (mark.type === 'link' && typeof href === 'string') {
        const target = parseArchiveHref(href);
        const key = target ? `${target.kind}:${target.id}` : null;
        if (target && key && !seen.has(key)) {
          seen.add(key);
          links.push(target);
        }
      }
    }
    for (const child of node.content ?? []) {
      visit(child);
    }
  };
  visit(document);
  return links;
}
