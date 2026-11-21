import { Archive, Clock, Star } from 'lucide-react';
import { ModulePlaceholder } from '@/components/feedback/ModulePlaceholder';

/** Personal views (specification §3.3): they list real resources once documents and notes exist. */
export function FavoritesPage() {
  return <ModulePlaceholder module="favorites" icon={Star} iconTone="brand" />;
}

export function RecentPage() {
  return <ModulePlaceholder module="recent" icon={Clock} />;
}

export function ArchivedPage() {
  return <ModulePlaceholder module="archived" icon={Archive} />;
}
