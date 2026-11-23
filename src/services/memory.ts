import type { ConceptAvailability } from '@/types/bindings/ConceptAvailability';
import type { ConceptKind } from '@/types/bindings/ConceptKind';
import type { ConceptMention } from '@/types/bindings/ConceptMention';
import type { ContentProfile } from '@/types/bindings/ContentProfile';
import type { LanguageSource } from '@/types/bindings/LanguageSource';
import type { LinkKind } from '@/types/bindings/LinkKind';
import type { MemoryChanged } from '@/types/bindings/MemoryChanged';
import type { MemoryItem } from '@/types/bindings/MemoryItem';
import type { MemoryOverview } from '@/types/bindings/MemoryOverview';
import type { NewRelationInput } from '@/types/bindings/NewRelationInput';
import type { PipelineStage } from '@/types/bindings/PipelineStage';
import type { ProcessingStatus } from '@/types/bindings/ProcessingStatus';
import type { QueueCounts } from '@/types/bindings/QueueCounts';
import type { Relation } from '@/types/bindings/Relation';
import type { RelationDecision } from '@/types/bindings/RelationDecision';
import type { RelationDirection } from '@/types/bindings/RelationDirection';
import type { RelationOrigin } from '@/types/bindings/RelationOrigin';
import type { RelationStatus } from '@/types/bindings/RelationStatus';
import type { RelationView } from '@/types/bindings/RelationView';
import type { StageState } from '@/types/bindings/StageState';
import type { Term } from '@/types/bindings/Term';
import { callCommand } from './tauri';

export type {
  ConceptAvailability,
  ConceptKind,
  ConceptMention,
  ContentProfile,
  LanguageSource,
  MemoryChanged,
  MemoryItem,
  MemoryOverview,
  NewRelationInput,
  PipelineStage,
  ProcessingStatus,
  QueueCounts,
  Relation,
  RelationDecision,
  RelationDirection,
  RelationOrigin,
  RelationStatus,
  RelationView,
  StageState,
  Term,
};

/** Event of the core when the memory engine changed what it knows of an item. */
export const MEMORY_CHANGED_EVENT = 'memory:changed';

/** Types of relation the user can choose (the core refuses any other). */
export const RELATION_TYPES = [
  'related_to',
  'references',
  'explains',
  'example_of',
  'part_of',
  'depends_on',
  'contradicts',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export function isRelationType(value: string): value is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(value);
}

/** What the memory engine knows of an item: its processing, its description, its terms, its concepts. */
export function memoryItem(kind: LinkKind, id: string): Promise<MemoryItem> {
  return callCommand('memory_item', { kind, id });
}

export function retryMemoryItem(kind: LinkKind, id: string): Promise<MemoryItem> {
  return callCommand('memory_retry', { kind, id });
}

export function memoryOverview(): Promise<MemoryOverview> {
  return callCommand('memory_overview');
}

export function retryAllMemory(): Promise<number> {
  return callCommand('memory_retry_all');
}

export function listRelations(kind: LinkKind, id: string): Promise<RelationView[]> {
  return callCommand('relations_list', { kind, id });
}

export function createRelation(input: NewRelationInput): Promise<Relation> {
  return callCommand('relations_create', { input });
}

export function setRelationType(id: string, relationType: RelationType): Promise<Relation> {
  return callCommand('relations_set_type', { id, relationType });
}

export function decideRelation(id: string, decision: RelationDecision): Promise<Relation> {
  return callCommand('relations_decide', { id, decision });
}

export function removeRelation(id: string): Promise<null> {
  return callCommand('relations_remove', { id });
}
