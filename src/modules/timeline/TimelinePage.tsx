import { History } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** Timeline (specification §13): delivered in Phase 8, fed by real events from Phase 3 onward. */
export function TimelinePage() {
  return <ModulePlaceholder module="timeline" icon={History} />;
}
