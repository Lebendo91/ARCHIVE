import {
  creationEvent,
  importEvent,
  noteCreationEvent,
  seedDocument,
  seedNote,
  seedTag,
  type CoreDoubleState,
} from '../../src/test/coreDouble';
import { fixtureBase64, fixtureBytes, libraryState } from './library';

/** Form feed: the core separates the pages of a PDF with it. */
const PAGE = '\f';

/**
 * A knowledge base to search: the Library of the other tests, a course in PDF whose pages are known, and notes
 * on the subjects of the specification's examples (Arduino interrupts, industrial automation, electrical
 * safety, the NE555).
 */
export function searchState() {
  const hour = 60 * 60 * 1000;
  const library = libraryState();
  const { electronics, studies } = library;
  const tagSafety = seedTag('Sécurité', 'neutral');
  const course = seedDocument('cours-arduino.pdf', {
    title: 'Cours Arduino',
    workspaceId: electronics.workspace.id,
    fileSize: fixtureBytes('fiche-ne555.pdf').byteLength,
    base64: fixtureBase64('fiche-ne555.pdf'),
    content: [
      'Présentation de la carte Arduino Uno et du microcontrôleur ATmega328P.',
      'Les entrées et sorties numériques : digitalRead et digitalWrite.',
      'Les interruptions externes : attachInterrupt déclenche une routine sur un front montant de la broche 2.',
    ].join(PAGE),
    metadata: { format: 'pdf', pageCount: 3 },
    ageMs: 3 * 24 * hour,
  });
  const interrupts = seedNote('Interruptions sur Arduino', {
    workspaceId: electronics.workspace.id,
    text: 'Une routine d’interruption doit rester courte.\nLes variables partagées sont déclarées volatile.',
    isFavorite: true,
    ageMs: 6 * hour,
  });
  const automation = seedNote('Automatisme industriel', {
    workspaceId: studies.workspace.id,
    text: 'Le Grafcet décrit les étapes et les transitions d’un automate programmable.',
    ageMs: 40 * 24 * hour,
  });
  const safety = seedNote('Sécurité électrique au laboratoire', {
    workspaceId: electronics.workspace.id,
    text: 'Couper l’alimentation avant de modifier un montage.\nUn disjoncteur différentiel de 30 mA protège les personnes.',
    tagIds: [tagSafety.id],
    ageMs: 10 * 24 * hour,
  });
  const timer = seedNote('Montage astable du NE555', {
    text: 'La fréquence dépend de R1, R2 et C : f = 1,44 / ((R1 + 2 R2) × C).',
    tagIds: [library.tags.project.id],
    ageMs: 2 * 24 * hour,
  });
  const notes = [interrupts, automation, safety, timer];
  const documents = [...library.state.documents, course];
  return {
    ...library,
    course,
    tagSafety,
    notes: { interrupts, automation, safety, timer },
    state: {
      ...library.state,
      tags: [...library.state.tags, tagSafety],
      documents,
      notes,
      events: [
        ...[electronics, studies].map(creationEvent),
        ...documents.map(importEvent),
        ...notes.map(noteCreationEvent),
      ].sort((a, b) => a.createdAt - b.createdAt),
    } satisfies Partial<CoreDoubleState>,
  };
}
