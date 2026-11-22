import { FileText } from 'lucide-react';
import { documentKind, type Document } from '@/services/documents';
import { KIND_ICONS } from './documentFormat';

/** Icon of a document's format. Decorative: the title always accompanies it. */
export function DocumentKindIcon({
  document,
  size,
  className,
}: {
  document: Pick<Document, 'fileExtension'>;
  size: number;
  className?: string;
}) {
  const kind = documentKind(document);
  const Icon = kind ? KIND_ICONS[kind] : FileText;
  return <Icon size={size} aria-hidden="true" className={className} />;
}
