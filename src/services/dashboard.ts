import type { DashboardOverview } from '@/types/bindings/DashboardOverview';
import type { EntityKind } from '@/types/bindings/EntityKind';
import type { ResourceSummary } from '@/types/bindings/ResourceSummary';
import type { TimelineEvent } from '@/types/bindings/TimelineEvent';
import type { TimelineEventType } from '@/types/bindings/TimelineEventType';
import { callCommand } from './tauri';

export type { DashboardOverview, EntityKind, ResourceSummary, TimelineEvent, TimelineEventType };

/** Figures and lists of the overview, all computed by the native core from the database (spec §6.1). */
export function getDashboardOverview(): Promise<DashboardOverview> {
  return callCommand('dashboard_overview');
}
