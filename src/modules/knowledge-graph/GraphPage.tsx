import { Waypoints } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** Knowledge graph (specification §11): delivered in Phase 8. Never displays an invented graph. */
export function GraphPage() {
  return <ModulePlaceholder module="graph" icon={Waypoints} iconTone="relations" />;
}
