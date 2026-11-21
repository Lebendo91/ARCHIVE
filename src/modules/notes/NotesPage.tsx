import { NotebookPen } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** Notes (specification §8): delivered in Phase 5. */
export function NotesPage() {
  return <ModulePlaceholder module="notes" icon={NotebookPen} />;
}
