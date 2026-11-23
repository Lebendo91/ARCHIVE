import { seedRelation, type CoreDoubleState } from '../../src/test/coreDouble';
import { searchState } from './search';

const MINUTE = 60 * 1000;

/**
 * The knowledge base of the search tests, as the memory engine left it: distinctive terms, a suggested
 * relation with why and how sure, a relation the user accepted, a rejected suggestion, and a stage that
 * failed and will be tried again.
 */
export function memoryState() {
  const base = searchState();
  const { notes, documents, course } = base;
  const datasheet = documents.pdf;
  const suggestion = seedRelation(
    { kind: 'document', id: datasheet.document.id },
    { kind: 'note', id: notes.timer.note.id },
    {
      confidence: 0.72,
      provenance: {
        rule: 'shared_terms',
        version: 1,
        terms: ['NE555', 'astable', 'condensateur'],
        tags: ['Projet NE555'],
        sameWorkspace: false,
      },
    },
  );
  const accepted = seedRelation(
    { kind: 'note', id: notes.interrupts.note.id },
    { kind: 'document', id: course.document.id },
    { relationType: 'explains', origin: 'user', status: 'accepted', confidence: null },
  );
  const rejected = seedRelation(
    { kind: 'note', id: notes.timer.note.id },
    { kind: 'note', id: notes.safety.note.id },
    {
      status: 'rejected',
      confidence: 0.18,
      provenance: {
        rule: 'shared_terms',
        version: 1,
        terms: ['montage'],
        tags: [],
        sameWorkspace: false,
      },
    },
  );
  const term = (label: string, weight: number, occurrences: number) => ({
    term: label.toLowerCase(),
    label,
    weight,
    occurrences,
  });
  const memory: CoreDoubleState['memory'] = {
    [`note:${notes.timer.note.id}`]: {
      terms: [term('NE555', 4.2, 3), term('astable', 3.1, 2), term('fréquence', 1.4, 1)],
      language: null,
    },
    [`document:${datasheet.document.id}`]: {
      terms: [term('NE555', 5.6, 4), term('astable', 3.4, 2), term('VCC', 2.2, 1)],
      language: { code: 'fr', source: 'detected' },
      authoredAt: Date.UTC(2026, 8, 1, 8, 0, 0),
    },
    [`note:${notes.safety.note.id}`]: {
      stages: {
        analysis: {
          status: 'failed',
          attempts: 1,
          issue: 'database',
          retryAt: Date.now() + 2 * MINUTE,
        },
        relations: { status: 'pending' },
      },
      language: { code: 'fr', source: 'detected' },
    },
  };
  return {
    ...base,
    relations: { suggestion, accepted, rejected },
    state: {
      ...base.state,
      relations: [suggestion, accepted, rejected],
      memory,
    } satisfies Partial<CoreDoubleState>,
  };
}
