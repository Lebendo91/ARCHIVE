import { Boxes } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** Workspaces (specification §12): delivered in Phase 3. */
export function WorkspacesPage() {
  return <ModulePlaceholder module="workspaces" icon={Boxes} />;
}
