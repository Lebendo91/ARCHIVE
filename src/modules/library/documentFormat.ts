import {
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import {
  documentKind,
  extractionIssue,
  type Document,
  type FileKind,
  type ProcessingStatus,
} from '@/services/documents';

export const KIND_ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  docx: FileType,
  text: FileText,
  markdown: FileCode,
  csv: FileSpreadsheet,
  json: FileJson,
  png: FileImage,
  jpeg: FileImage,
  webp: FileImage,
};

export function kindLabelKey(document: Pick<Document, 'fileExtension'>): MessageKey | null {
  const kind = documentKind(document);
  return kind ? `library.kinds.${kind}` : null;
}

export const INDEXING_TONES: Record<ProcessingStatus, BadgeTone> = {
  pending: 'neutral',
  processing: 'info',
  completed: 'success',
  failed: 'warning',
  needs_attention: 'warning',
};

/**
 * Message explaining the state of a document's text: why it is missing or partial. Images say plainly that
 * no OCR is integrated, instead of pretending their text was extracted.
 */
export function textStateMessage(document: Document): MessageKey | null {
  const issue = extractionIssue(document);
  if (issue) {
    return `library.issues.${issue}`;
  }
  const kind = documentKind(document);
  return kind === 'png' || kind === 'jpeg' || kind === 'webp' ? 'library.imageNoText' : null;
}

/** Filter groups offered in the Library: the three image formats are one choice. */
export const KIND_FILTERS: readonly { id: string; labelKey: MessageKey; kinds: FileKind[] }[] = [
  { id: 'pdf', labelKey: 'library.kinds.pdf', kinds: ['pdf'] },
  { id: 'docx', labelKey: 'library.kinds.docx', kinds: ['docx'] },
  { id: 'text', labelKey: 'library.kinds.text', kinds: ['text'] },
  { id: 'markdown', labelKey: 'library.kinds.markdown', kinds: ['markdown'] },
  { id: 'csv', labelKey: 'library.kinds.csv', kinds: ['csv'] },
  { id: 'json', labelKey: 'library.kinds.json', kinds: ['json'] },
  { id: 'images', labelKey: 'library.filters.images', kinds: ['png', 'jpeg', 'webp'] },
];
