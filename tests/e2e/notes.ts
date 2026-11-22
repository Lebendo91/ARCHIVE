import {
  creationEvent,
  importEvent,
  noteCreationEvent,
  seedDocument,
  seedNote,
  seedWorkspace,
  type CoreDoubleNote,
  type CoreDoubleState,
} from '../../src/test/coreDouble';
import { fixtureBase64 } from './library';

type Inline = Record<string, unknown>;

const text = (value: string, marks: Inline[] = []): Inline =>
  marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value };
const paragraph = (...content: Inline[]): Inline => ({ type: 'paragraph', content });
const heading = (level: number, value: string): Inline => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const link = (href: string) => ({ type: 'link', attrs: { href } });

/** Notes of a student in electronics: a rich note linking to another note and to a document. */
export function notesState() {
  const hour = 60 * 60 * 1000;
  const electronics = seedWorkspace('Électronique', { icon: 'cpu', ageMs: 300 * hour });
  const datasheet = seedDocument('fiche-ne555.pdf', {
    title: 'Fiche technique NE555',
    workspaceId: electronics.workspace.id,
    base64: fixtureBase64('fiche-ne555.pdf'),
    content: 'Timer NE555',
    metadata: { format: 'pdf', pageCount: 2 },
    ageMs: 200 * hour,
  });
  const ohm = seedNote('Loi d’Ohm', {
    workspaceId: electronics.workspace.id,
    text: 'U = R × I\nLa tension aux bornes d’une résistance est proportionnelle au courant.',
    ageMs: 50 * hour,
  });
  const kirchhoffContent = {
    type: 'doc',
    content: [
      heading(2, 'Loi des nœuds'),
      paragraph(
        text('La somme des courants entrant dans un nœud est '),
        text('égale', [{ type: 'bold' }]),
        text(' à la somme des courants sortants. Voir aussi la '),
        text('loi d’Ohm', [link(`archive://note/${ohm.note.id}`)]),
        text(' et la '),
        text('fiche du NE555', [link(`archive://document/${datasheet.document.id}`)]),
        text('.'),
      ),
      heading(2, 'À réviser'),
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [paragraph(text('Loi des mailles'))],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [paragraph(text('Théorème de Thévenin'))],
          },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [paragraph(text('Grandeur'))] },
              { type: 'tableHeader', content: [paragraph(text('Unité'))] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [paragraph(text('Courant'))] },
              { type: 'tableCell', content: [paragraph(text('Ampère (A)'))] },
            ],
          },
        ],
      },
      {
        type: 'blockquote',
        content: [paragraph(text('Ce qui entre dans un nœud en ressort.'))],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'python' },
        content: [text('courants = [0.2, 0.3]\nprint(sum(courants))')],
      },
    ],
  };
  const kirchhoff: CoreDoubleNote = {
    ...seedNote('Lois de Kirchhoff', {
      workspaceId: electronics.workspace.id,
      isFavorite: true,
      ageMs: 3 * hour,
      lastOpenedAt: Date.now() - 2 * hour,
    }),
    links: [
      { kind: 'note', id: ohm.note.id },
      { kind: 'document', id: datasheet.document.id },
    ],
  };
  kirchhoff.note.content = JSON.stringify(kirchhoffContent);
  kirchhoff.contentText =
    'Loi des nœuds\nLa somme des courants entrant dans un nœud est égale à la somme des courants sortants.';
  const ideas = seedNote('Idées de projets', {
    text: 'Clignotant à NE555\nStation météo',
    ageMs: 20 * hour,
  });
  const untitled = seedNote('', { text: '', ageMs: hour / 2 });
  const notes = [kirchhoff, ohm, ideas, untitled];
  return {
    electronics,
    datasheet,
    notes: { kirchhoff, ohm, ideas, untitled },
    state: {
      workspaces: [electronics],
      documents: [datasheet],
      notes,
      events: [
        creationEvent(electronics),
        importEvent(datasheet),
        ...notes.map(noteCreationEvent),
      ].sort((a, b) => a.createdAt - b.createdAt),
    } satisfies Partial<CoreDoubleState>,
  };
}
