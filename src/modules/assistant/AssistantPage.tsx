import { MessageSquareText } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** AI assistant (specification §14): optional, delivered in Phase 9. */
export function AssistantPage() {
  return <ModulePlaceholder module="assistant" icon={MessageSquareText} iconTone="intelligence" />;
}
