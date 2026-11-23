import type { TimelineEvent } from '../../src/types/bindings/TimelineEvent';
import { seedRelation, type CoreDoubleState } from '../../src/test/coreDouble';
import { memoryState } from './memory';

const HOUR = 60 * 60 * 1000;

/**
 * The knowledge base of the memory tests, with links written in notes and a suggestion accepted: a real graph
 * to explore. Its history holds every kind of event of the specification §13.1, spread over several days.
 */
export function graphState() {
  const base = memoryState();
  const { notes, documents, course, electronics, studies } = base;
  notes.interrupts.links = [{ kind: 'document', id: course.document.id }];
  notes.timer.links = [
    { kind: 'document', id: documents.pdf.document.id },
    { kind: 'document', id: documents.png.document.id },
  ];
  notes.safety.links = [{ kind: 'note', id: notes.interrupts.note.id }];
  const accepted = seedRelation(
    { kind: 'document', id: documents.docx.document.id },
    { kind: 'note', id: notes.safety.note.id },
    {
      status: 'accepted',
      confidence: 0.64,
      provenance: {
        rule: 'shared_terms',
        version: 1,
        terms: ['tension', 'courant', 'disjoncteur'],
        tags: [],
        sameWorkspace: false,
      },
    },
  );
  const at = (ageMs: number) => Date.now() - ageMs;
  const event = (
    eventType: TimelineEvent['eventType'],
    entity: { type: TimelineEvent['entityType']; id: string; title: string },
    ageMs: number,
    extra: Partial<TimelineEvent> = {},
  ): TimelineEvent => ({
    id: `event-${eventType}-${entity.id}`,
    eventType,
    entityType: entity.type,
    entityId: entity.id,
    workspaceId: null,
    description: entity.title,
    metadata: {},
    createdAt: at(ageMs),
    available: true,
    target: null,
    currentTitle: null,
    ...extra,
  });
  const interrupts = {
    type: 'note' as const,
    id: notes.interrupts.note.id,
    title: notes.interrupts.note.title,
  };
  const automation = {
    type: 'note' as const,
    id: notes.automation.note.id,
    title: notes.automation.note.title,
  };
  const history = [
    event('note_modified', interrupts, 2 * HOUR, { workspaceId: electronics.workspace.id }),
    event('resource_favorited', interrupts, 3 * HOUR, { workspaceId: electronics.workspace.id }),
    event(
      'relation_accepted',
      {
        type: 'relation',
        id: accepted.id,
        title: `${documents.docx.document.title} — ${notes.safety.note.title}`,
      },
      26 * HOUR,
      { metadata: { origin: 'rule', rule: 'shared_terms' } },
    ),
    event('resource_archived', automation, 30 * HOUR, { workspaceId: studies.workspace.id }),
    event('resource_restored', automation, 29 * HOUR, { workspaceId: studies.workspace.id }),
  ];
  return {
    ...base,
    accepted,
    state: {
      ...base.state,
      relations: [...base.state.relations, accepted],
      events: [...base.state.events, ...history].sort((a, b) => a.createdAt - b.createdAt),
    } satisfies Partial<CoreDoubleState>,
  };
}
