import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  creationEvent,
  importEvent,
  noteCreationEvent,
  seedDocument,
  seedNote,
  seedRelation,
  seedTag,
  seedWorkspace,
  type CoreDoubleState,
} from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';
import type { TimelineEvent } from '@/types/bindings/TimelineEvent';

const HOUR = 60 * 60 * 1000;

/**
 * A small knowledge base: a note that links to a datasheet and to a diagram, a relation of the user, a
 * suggestion of the engine, and an item connected to nothing.
 */
function knowledgeBase() {
  const electronics = seedWorkspace('Électronique', { color: 'blue', icon: 'cpu' });
  const project = seedTag('Projet NE555', 'neutral');
  const datasheet = seedDocument('fiche-ne555.pdf', {
    title: 'Fiche technique NE555',
    workspaceId: electronics.workspace.id,
    tagIds: [project.id],
  });
  const diagram = seedDocument('schema.png', { title: 'Schéma du montage' });
  const course = seedDocument('cours.pdf', { title: 'Cours d’électronique' });
  const lonely = seedDocument('facture.pdf', { title: 'Facture' });
  const timer = seedNote('Montage astable du NE555', {
    workspaceId: electronics.workspace.id,
    tagIds: [project.id],
    links: [
      { kind: 'document', id: datasheet.document.id },
      { kind: 'document', id: diagram.document.id },
    ],
  });
  const safety = seedNote('Sécurité électrique');
  const explains = seedRelation(
    { kind: 'note', id: safety.note.id },
    { kind: 'document', id: course.document.id },
    { relationType: 'explains', origin: 'user', status: 'accepted', confidence: null },
  );
  const suggestion = seedRelation(
    { kind: 'document', id: course.document.id },
    { kind: 'document', id: datasheet.document.id },
    {
      confidence: 0.58,
      provenance: {
        rule: 'shared_terms',
        version: 1,
        terms: ['tension', 'astable'],
        tags: [],
        sameWorkspace: false,
      },
    },
  );
  const documents = [datasheet, diagram, course, lonely];
  const notes = [timer, safety];
  return {
    electronics,
    project,
    datasheet,
    diagram,
    course,
    lonely,
    timer,
    safety,
    explains,
    suggestion,
    core: {
      workspaces: [electronics],
      tags: [project],
      documents,
      notes,
      relations: [explains, suggestion],
      events: [
        creationEvent(electronics),
        ...documents.map(importEvent),
        ...notes.map(noteCreationEvent),
      ].sort((a, b) => a.createdAt - b.createdAt),
    } satisfies Partial<CoreDoubleState>,
  };
}

function map() {
  return within(screen.getByRole('group', { name: /^Carte du graphe/ }));
}

function node(name: RegExp) {
  return map().getByRole('button', { name });
}

async function details() {
  const heading = await screen.findByRole('heading', { level: 2, name: /.+/ });
  const panel = heading.closest('section');
  if (!panel) {
    throw new Error('The details panel is not a section');
  }
  return within(panel);
}

describe('knowledge graph', () => {
  it('draws the connected items only, with their links and relations, and nothing else', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    renderApp('/graph');
    expect(await screen.findByRole('group', { name: /^Carte du graphe/ })).toBeInTheDocument();
    expect(screen.getByText(/^5 éléments · 3 liens$/)).toBeInTheDocument();
    expect(node(/^Note\s:\sMontage astable du NE555, 2 connexions$/)).toBeInTheDocument();
    expect(node(/^Document\s:\sCours d’électronique, 1 connexion$/)).toBeInTheDocument();
    // An item without any connection, and the undecided suggestion, are not drawn.
    expect(map().queryByRole('button', { name: /Facture/ })).not.toBeInTheDocument();
    const query = calls.find((call) => call.command === 'graph_load')?.args?.query;
    expect(query).toMatchObject({ nodeKinds: ['document', 'note'], limit: 300 });
    expect(query).not.toHaveProperty('includeSuggestions');
  });

  it('shows the details of an item on demand, and leads to its page', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/graph');
    const timer = await screen.findByRole('button', {
      name: /^Note\s:\sMontage astable du NE555/,
    });
    // Details are loaded once an item is selected, not before.
    expect(calls.some((call) => call.command === 'notes_get')).toBe(false);
    timer.focus();
    await user.keyboard('{Enter}');
    const panel = await details();
    expect(panel.getByRole('heading', { name: 'Montage astable du NE555' })).toBeVisible();
    expect(await panel.findByText(/^Espace\s:\sÉlectronique$/)).toBeVisible();
    expect(panel.getByText(/^Étiquettes\s:\sProjet NE555$/)).toBeVisible();
    expect(calls.some((call) => call.command === 'notes_get')).toBe(true);
    expect(panel.getAllByText('Lien vers')).toHaveLength(2);

    // From a connection to the item at its other end.
    await user.click(panel.getByRole('button', { name: 'Fiche technique NE555' }));
    const document = await details();
    expect(await document.findByRole('heading', { name: 'Fiche technique NE555' })).toHaveFocus();
    expect(document.getByText('Cité dans')).toBeVisible();
    await user.click(document.getByRole('link', { name: 'Ouvrir le document' }));
    expect(router.state.location.pathname).toBe(`/library/${base.datasheet.document.id}`);
  });

  it('explains a relation and lets the user decide on a suggestion from the graph', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp('/graph?suggestions=1');
    const course = await screen.findByRole('button', {
      name: /^Document\s:\sCours d’électronique/,
    });
    course.focus();
    await user.keyboard('{Enter}');
    const panel = await details();
    await user.click(
      panel.getByRole('button', { name: /^Détails du lien avec «\sFiche technique NE555\s»$/ }),
    );
    const edge = await details();
    expect(await edge.findByRole('heading', { name: 'Suggestion d’ARCHIVE' })).toHaveFocus();
    expect(
      edge.getByText(/^«\sCours d’électronique\s» est lié à «\sFiche technique NE555\s»\.$/),
    ).toBeVisible();
    expect(
      await edge.findByText(/^Termes communs\s:\stension et astable · Confiance\s:\s58\s%$/),
    ).toBeVisible();
    await user.click(edge.getByRole('button', { name: 'Accepter' }));
    expect(await screen.findByText('Relation acceptée.')).toBeInTheDocument();
    await waitFor(() => {
      expect(edge.getByRole('heading', { name: 'Relation' })).toBeVisible();
    });
    expect(edge.getByText('Suggestion acceptée')).toBeVisible();
    expect(core.relations.find((relation) => relation.id === base.suggestion.id)?.status).toBe(
      'accepted',
    );
    expect(core.events.at(-1)?.eventType).toBe('relation_accepted');
  });

  it('starts from an item, and adds the neighbours of another one on request', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp(`/graph?focus=document:${base.datasheet.document.id}`);
    // The datasheet and its only neighbour: the note that links to it.
    await screen.findByRole('button', { name: /^Document\s:\sFiche technique NE555/ });
    expect(screen.getByText(/^2 éléments · 1 lien$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /^Retirer le filtre «\sAutour de «\sFiche technique NE555\s»\s»$/,
      }),
    ).toBeVisible();
    const timer = node(/^Note\s:\sMontage astable du NE555/);
    timer.focus();
    await user.keyboard('{Enter}');
    const panel = await details();
    expect(panel.getByText('1 connexion n’est pas affichée.')).toBeVisible();
    await user.click(panel.getByRole('button', { name: 'Afficher les voisins' }));
    await waitFor(() => {
      expect(node(/^Document\s:\sSchéma du montage/)).toBeInTheDocument();
    });
    expect(calls.filter((call) => call.command === 'graph_load').at(-1)?.args?.query).toMatchObject(
      { expanded: [{ kind: 'note', id: base.timer.note.id }] },
    );
    expect(panel.queryByRole('button', { name: 'Afficher les voisins' })).not.toBeInTheDocument();
  });

  it('filters by kind of item and of relation, and searches the items drawn', async () => {
    const base = knowledgeBase();
    mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/graph');
    await screen.findByRole('group', { name: /^Carte du graphe/ });
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    const filters = await screen.findByRole('dialog', { name: 'Filtres' });
    await user.click(within(filters).getByRole('checkbox', { name: 'Espaces de travail' }));
    await waitFor(() => {
      expect(node(/^Espace de travail\s:\sÉlectronique/)).toBeInTheDocument();
    });
    expect(router.state.location.search).toBe('?kinds=document%2Cnote%2Cworkspace');
    await user.click(
      within(filters).getByRole('checkbox', { name: 'Liens écrits dans les notes' }),
    );
    await waitFor(() => {
      expect(map().queryByRole('button', { name: /Schéma du montage/ })).not.toBeInTheDocument();
    });
    // The last kind of item cannot be unchecked: workspaces and tags alone connect nothing.
    await user.click(within(filters).getByRole('checkbox', { name: 'Documents' }));
    expect(within(filters).getByRole('checkbox', { name: 'Notes' })).toBeDisabled();
    await user.keyboard('{Escape}');

    // Only what is drawn is searched: the diagram left with the documents.
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher dans le graphe' }),
      'MONTAGE',
    );
    const results = screen.getByRole('list', { name: 'Éléments trouvés dans le graphe' });
    expect(within(results).getAllByRole('button')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Montage astable du NE555' }),
    ).toHaveFocus();
  });

  it('lists the items as an alternative to the map', async () => {
    const base = knowledgeBase();
    mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp('/graph');
    await screen.findByRole('group', { name: /^Carte du graphe/ });
    await user.click(screen.getByRole('radio', { name: 'Liste' }));
    const list = await screen.findByRole('list', { name: 'Liste' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent(/Montage astable du NE555.*Note.*2 connexions/);
    await user.click(within(list).getByRole('button', { name: 'Sécurité électrique' }));
    const panel = await details();
    expect(panel.getByRole('heading', { name: 'Sécurité électrique' })).toBeVisible();
    expect(panel.getByText('Explique')).toBeVisible();
  });

  it('says how relations are created instead of drawing an invented graph', async () => {
    const base = knowledgeBase();
    mockNativeRuntime(
      {},
      {
        core: {
          ...base.core,
          relations: [base.suggestion],
          notes: base.core.notes.map((entry) => ({ ...entry, links: [] })),
        },
      },
    );
    const { user } = renderApp('/graph');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Aucune relation pour l’instant' }),
    ).toBeVisible();
    expect(screen.getByText(/Ajoutez une relation depuis la page d’un document/)).toBeVisible();
    expect(screen.queryByRole('group', { name: /^Carte du graphe/ })).not.toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: 'Afficher la suggestion en attente' }),
    );
    expect(
      await screen.findByRole('button', { name: /^Document\s:\sCours d’électronique/ }),
    ).toBeInTheDocument();
  });

  it('offers to import or write on an empty knowledge base', async () => {
    mockNativeRuntime({}, { core: {} });
    renderApp('/graph');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Votre base est encore vide' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Importer des documents' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Créer une note' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Filtres' })).not.toBeInTheDocument();
  });
});

describe('timeline', () => {
  /** Events of today, yesterday and older, whatever the time the test runs at. */
  function history() {
    const base = knowledgeBase();
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const today = Math.max(Date.now() - 60_000, midnight.getTime() + 1000);
    const at = (createdAt: number, event: TimelineEvent): TimelineEvent => ({
      ...event,
      createdAt,
    });
    const events = [
      at(midnight.getTime() - 3 * 24 * HOUR, creationEvent(base.electronics)),
      at(midnight.getTime() - 6 * HOUR, importEvent(base.datasheet)),
      at(midnight.getTime() - 5 * HOUR, importEvent(base.course)),
      // Created without a title, as Ctrl+N does, and named afterwards.
      at(today - 1000, { ...noteCreationEvent(base.timer), description: '' }),
      at(today, {
        ...noteCreationEvent(base.timer),
        id: 'event-favorite',
        eventType: 'resource_favorited',
      }),
    ];
    return { base, events };
  }

  it('groups the events by day, with their type, details and a way to the resource', async () => {
    const { base, events } = history();
    mockNativeRuntime({}, { core: { ...base.core, events } });
    const { user, router } = renderApp('/timeline');
    const today = await screen.findByRole('region', { name: 'Aujourd’hui' });
    const yesterday = screen.getByRole('region', { name: 'Hier' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    // The note created without a title reads with its title of today.
    expect(within(today).getAllByRole('link', { name: 'Montage astable du NE555' })).toHaveLength(
      2,
    );
    expect(within(today).getByText('Ajouté aux favoris · Note · Électronique')).toBeVisible();
    expect(within(yesterday).getByText('Document importé · PDF · Électronique')).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByText('Début de l’historique.')).toBeVisible();
    await user.click(within(yesterday).getByRole('link', { name: 'Fiche technique NE555' }));
    expect(router.state.location.pathname).toBe(`/library/${base.datasheet.document.id}`);
  });

  it('filters by type of event, resource, workspace and period', async () => {
    const { base, events } = history();
    const { calls } = mockNativeRuntime({}, { core: { ...base.core, events } });
    const { user, router } = renderApp('/timeline');
    await screen.findByRole('region', { name: 'Aujourd’hui' });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Événement' }),
      'Document importé',
    );
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Aujourd’hui' })).not.toBeInTheDocument();
    });
    const main = within(screen.getByRole('main'));
    expect(main.getAllByRole('listitem')).toHaveLength(2);
    expect(router.state.location.search).toBe('?type=document_imported');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Période' }), 'Aujourd’hui');
    expect(await screen.findByText('Aucun événement ne correspond')).toBeVisible();
    const [reset] = screen.getAllByRole('button', { name: 'Réinitialiser les filtres' });
    if (!reset) {
      throw new Error('No reset button');
    }
    await user.click(reset);
    expect(await screen.findByRole('region', { name: 'Aujourd’hui' })).toBeVisible();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ressource' }), 'Notes');
    await waitFor(() => {
      expect(main.getAllByRole('listitem')).toHaveLength(2);
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Période' }), 'Dates choisies');
    const from = screen.getByLabelText('Du');
    const to = screen.getByLabelText('Au');
    fireEvent.change(from, { target: { value: '2026-03-10' } });
    fireEvent.change(to, { target: { value: '2026-03-01' } });
    expect(
      screen.getByText('La date de fin doit être postérieure ou égale à la date de début.'),
    ).toBeVisible();
    // The start alone was applied, from midnight in the local calendar; the impossible period is not.
    const queries = calls
      .filter((call) => call.command === 'timeline_list')
      .map((call) => call.args?.query);
    expect(queries).toContainEqual({
      entityTypes: ['note'],
      from: new Date(2026, 2, 10).getTime(),
      limit: 50,
    });
    expect(main.getAllByRole('listitem')).toHaveLength(2);
  });

  it('clears the history only after confirmation, without touching the resources', async () => {
    const { base, events } = history();
    const { core } = mockNativeRuntime({}, { core: { ...base.core, events } });
    const { user } = renderApp('/timeline');
    await screen.findByRole('region', { name: 'Aujourd’hui' });
    await user.click(screen.getByRole('button', { name: 'Effacer l’historique' }));
    const dialog = await screen.findByRole('dialog', {
      name: /^Effacer toute la chronologie\s\?$/,
    });
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Effacer l’historique' }));
    expect(await screen.findByText('5 événements effacés.')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Aucune activité pour l’instant' }),
    ).toBeVisible();
    expect(core.events).toHaveLength(0);
    expect(core.documents).toHaveLength(4);
    expect(core.notes).toHaveLength(2);
  });
});
