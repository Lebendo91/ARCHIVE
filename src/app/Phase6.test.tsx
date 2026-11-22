import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SearchRequest } from '@/services/search';
import { seedDocument, seedNote, seedTag, seedWorkspace } from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

const DAY = 24 * 60 * 60 * 1000;
/** The search page waits 250 ms after the last key before searching. */
const SEARCHED = { timeout: 3000 };

/** A small knowledge base on electronics, with a course in PDF whose pages are known. */
function knowledgeBase() {
  const electronics = seedWorkspace('Électronique', { ageMs: 30 * DAY });
  const studies = seedWorkspace('Études supérieures', { ageMs: 30 * DAY });
  const project = seedTag('Projet NE555', 'neutral');
  const course = seedDocument('cours-arduino.pdf', {
    title: 'Cours Arduino',
    workspaceId: electronics.workspace.id,
    content: 'Carte Arduino Uno.\fLes interruptions externes déclenchent une routine.',
    metadata: { format: 'pdf', pageCount: 2 },
    ageMs: 3 * DAY,
  });
  const datasheet = seedDocument('fiche-ne555.pdf', {
    title: 'Fiche technique NE555',
    workspaceId: electronics.workspace.id,
    content: 'Timer NE555 en montage astable.',
    tagIds: [project.id],
    isFavorite: true,
    ageMs: 20 * DAY,
  });
  const interrupts = seedNote('Interruptions sur Arduino', {
    workspaceId: electronics.workspace.id,
    text: 'Une routine d’interruption doit rester courte.',
    ageMs: 2 * DAY,
  });
  const safety = seedNote('Sécurité électrique', {
    workspaceId: studies.workspace.id,
    text: 'Couper l’alimentation avant de modifier un montage.',
    ageMs: 40 * DAY,
  });
  const timer = seedNote('Montage astable du NE555', {
    text: 'La fréquence dépend de R1, R2 et C.',
    tagIds: [project.id],
    ageMs: DAY,
  });
  return {
    electronics,
    studies,
    project,
    course,
    datasheet,
    notes: { interrupts, safety, timer },
    core: {
      workspaces: [electronics, studies],
      tags: [project],
      documents: [course, datasheet],
      notes: [interrupts, safety, timer],
    },
  };
}

function searchRequests(calls: { command: string; args: Record<string, unknown> | undefined }[]) {
  return calls
    .filter((call) => call.command === 'search_query')
    .map((call) => (call.args as { request: SearchRequest }).request);
}

describe('search page', () => {
  it('shows every result of a search with its type, place, page and the words found', async () => {
    const base = knowledgeBase();
    mockNativeRuntime({}, { core: base.core });
    renderApp('/search?q=interruptions');

    expect(await screen.findByText('2 résultats')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveValue('interruptions');
    const course = screen.getByRole('link', { name: 'Cours Arduino' }).closest('li');
    expect(course).not.toBeNull();
    const row = within(course as HTMLElement);
    expect(row.getByText('Document · PDF · Électronique · page 2', { exact: false })).toBeVisible();
    expect(row.getByText('interruptions', { selector: 'mark' })).toBeVisible();
    expect(row.getByText(/^Termes trouvés\s:\sinterruptions$/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Interruptions sur Arduino' })).toHaveAttribute(
      'href',
      `/notes/${base.notes.interrupts.note.id}`,
    );
    // The counts of each type sit on the choice of type.
    expect(screen.getByRole('radio', { name: 'Tout (2)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Documents (1)' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Notes (1)' })).toBeInTheDocument();
    expect(
      screen.getByText(/La recherche sémantique n’est pas activée\.$/, { exact: false }),
    ).toBeVisible();
  });

  it('filters by type from the address, and keeps the choice in it', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/search?q=interruptions');
    await screen.findByRole('link', { name: 'Cours Arduino' });

    await user.click(screen.getByRole('radio', { name: 'Notes (1)' }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Cours Arduino' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('1 résultat')).toHaveAttribute('role', 'status');
    expect(router.state.location.search).toBe('?q=interruptions&kind=note');
    expect(searchRequests(calls).at(-1)).toMatchObject({ text: 'interruptions', kinds: ['note'] });
  });

  it('applies the type and the period read in the text, says so, and can search the text as typed', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp(
      `/search?q=${encodeURIComponent('notes modifiées ces 7 derniers jours')}`,
    );

    expect(await screen.findByText('2 résultats')).toHaveAttribute('role', 'status');
    expect(
      screen.getByText(/^Type\s:\sNotes · Modifiés\s:\smodifiées ces 7 derniers jours/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Interruptions sur Arduino' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Montage astable du NE555' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Sécurité électrique' })).not.toBeInTheDocument();
    // The type recognized is the one chosen.
    expect(screen.getByRole('radio', { name: 'Notes (2)' })).toBeChecked();
    const last = searchRequests(calls).at(-1);
    expect(last).toMatchObject({ text: '', kinds: ['note'], dateField: 'updated' });
    expect(last?.dateFrom).toBe(
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 6).getTime(),
    );

    // « All » wins over the type read in the text.
    await user.click(screen.getByRole('radio', { name: /^Tout/ }));
    await waitFor(() => {
      expect(router.state.location.search).toContain('kind=all');
    });
    await waitFor(() => {
      expect(searchRequests(calls).at(-1)?.kinds).toBeUndefined();
    });
    expect(screen.queryByText(/^Type\s:\sNotes/)).not.toBeInTheDocument();

    // As typed: nothing is recognized any more, and the words must all be found.
    await user.click(screen.getByRole('button', { name: 'Chercher le texte tel quel' }));
    await waitFor(() => {
      expect(searchRequests(calls).at(-1)).toMatchObject({
        text: 'notes modifiées ces 7 derniers jours',
      });
    });
    expect(router.state.location.search).toContain('literal=1');
    expect(await screen.findByText('Aucun résultat')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reconnaître les dates et les types' }));
    await waitFor(() => {
      expect(router.state.location.search).not.toContain('literal');
    });
  });

  it('filters by workspace, period and favorites, with a chip for each', async () => {
    const base = knowledgeBase();
    const { calls } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/search?q=montage');
    expect(await screen.findByText('3 résultats')).toHaveAttribute('role', 'status');

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    const filters = await screen.findByRole('dialog', { name: 'Filtres' });
    await user.selectOptions(
      within(filters).getByRole('combobox', { name: 'Espace de travail' }),
      'Électronique',
    );
    await user.selectOptions(
      within(filters).getByRole('combobox', { name: 'Période' }),
      '30 derniers jours',
    );
    await user.click(within(filters).getByRole('checkbox', { name: 'Favoris uniquement' }));
    await user.keyboard('{Escape}');

    const chips = screen.getByRole('group', { name: 'Filtres actifs' });
    expect(
      within(chips).getByRole('button', { name: /Espace de travail\s:\sÉlectronique/ }),
    ).toBeVisible();
    expect(
      within(chips).getByRole('button', { name: /Date d’ajout\s:\s30 derniers jours/ }),
    ).toBeVisible();
    expect(within(chips).getByRole('button', { name: /Favoris uniquement/ })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText('1 résultat')).toHaveAttribute('role', 'status');
    });
    expect(screen.getByRole('link', { name: 'Fiche technique NE555' })).toBeVisible();
    expect(searchRequests(calls).at(-1)).toMatchObject({
      workspaceId: base.electronics.workspace.id,
      favoritesOnly: true,
    });
    expect(router.state.location.search).toContain('period=30');

    // Without the workspace and the favorites, the period still leaves out the note of 40 days ago.
    await user.click(within(chips).getByRole('button', { name: /Favoris uniquement/ }));
    await user.click(
      within(chips).getByRole('button', { name: /Espace de travail\s:\sÉlectronique/ }),
    );
    await waitFor(() => {
      expect(screen.getByText('2 résultats')).toHaveAttribute('role', 'status');
    });
    expect(screen.getByRole('link', { name: 'Montage astable du NE555' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Sécurité électrique' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    await waitFor(() => {
      expect(screen.getByText('3 résultats')).toHaveAttribute('role', 'status');
    });
    expect(screen.queryByRole('group', { name: 'Filtres actifs' })).not.toBeInTheDocument();
  });

  it('lists every item carrying a tag, and shows more results on request', async () => {
    const base = knowledgeBase();
    const relays = Array.from({ length: 23 }, (_, index) =>
      seedNote(`Relais ${String(index + 1)}`, { text: 'Bobine et contacts.', ageMs: index * DAY }),
    );
    const { calls } = mockNativeRuntime(
      {},
      { core: { ...base.core, notes: [...base.core.notes, ...relays] } },
    );
    const { user, unmount } = renderApp(`/search?tag=${base.project.id}`);
    expect(await screen.findByText('2 résultats')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /Étiquette\s:\sProjet NE555/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Fiche technique NE555' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Montage astable du NE555' })).toBeVisible();
    unmount();

    renderApp('/search?q=relais');
    expect(await screen.findByText('23 résultats')).toHaveAttribute('role', 'status');
    expect(screen.getAllByRole('link', { name: /^Relais/ })).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Afficher plus de résultats' }));
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /^Relais/ })).toHaveLength(23);
    });
    expect(
      screen.queryByRole('button', { name: 'Afficher plus de résultats' }),
    ).not.toBeInTheDocument();
    expect(searchRequests(calls).map((request) => request.offset)).toContain(20);
  });

  it('searches as the user types, records the search on Enter and on opening a result', async () => {
    const base = knowledgeBase();
    const { calls, core } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/search');
    expect(await screen.findByRole('heading', { name: 'Rechercher dans ARCHIVE' })).toBeVisible();

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'astable');
    await waitFor(() => {
      expect(router.state.location.search).toBe('?q=astable');
    }, SEARCHED);
    expect(await screen.findByText('2 résultats')).toHaveAttribute('role', 'status');
    expect(core.searchHistory).toHaveLength(0);
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(core.searchHistory.map((entry) => entry.query)).toEqual(['astable']);
    });

    await user.click(screen.getByRole('link', { name: 'Montage astable du NE555' }));
    expect(router.state.location.pathname).toBe(`/notes/${base.notes.timer.note.id}`);
    await waitFor(() => {
      expect(calls.filter((call) => call.command === 'search_history_record')).toHaveLength(2);
    });
    expect(core.searchHistory).toHaveLength(1);
  });

  it('says when nothing was found, with what to try', async () => {
    mockNativeRuntime({}, { core: knowledgeBase().core });
    renderApp('/search?q=transistor');
    expect(await screen.findByText('Aucun résultat')).toBeVisible();
    expect(
      screen.getByText(
        /^Aucun résultat pour «\stransistor\s»\. Vérifiez l’orthographe, essayez moins de mots ou retirez des filtres\.$/,
      ),
    ).toBeVisible();
    expect(screen.getByText('0 résultat')).toHaveAttribute('role', 'status');
  });
});

describe('search history', () => {
  it('lists the recent searches, runs one, removes one and clears them', async () => {
    const base = knowledgeBase();
    const now = Date.now();
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          ...base.core,
          searchHistory: [
            { id: 'h3', query: 'astable', searchedAt: now - 1000 },
            { id: 'h2', query: 'interruptions', searchedAt: now - 2000 },
            { id: 'h1', query: 'sécurité', searchedAt: now - 3000 },
          ],
        },
      },
    );
    const { user, router } = renderApp('/search');
    const recent = await screen.findByRole('region', { name: 'Recherches récentes' });
    expect(
      within(recent)
        .getAllByRole('button')
        .map((button) => button.textContent)
        .filter((text) => text !== ''),
    ).toEqual(['Effacer l’historique', 'astable', 'interruptions', 'sécurité']);

    // Removing a search moves to the next one.
    await user.click(
      within(recent).getByRole('button', { name: /^Retirer «\sinterruptions\s» de l’historique$/ }),
    );
    await waitFor(() => {
      expect(within(recent).queryByText('interruptions')).not.toBeInTheDocument();
    });
    expect(within(recent).getByRole('button', { name: 'sécurité' })).toHaveFocus();
    expect(core.searchHistory.map((entry) => entry.query)).toEqual(['astable', 'sécurité']);

    // Running one searches it again, and puts it first.
    await user.click(within(recent).getByRole('button', { name: 'sécurité' }));
    expect(router.state.location.search).toBe(`?q=${encodeURIComponent('sécurité')}`);
    expect(await screen.findByText('1 résultat')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveFocus();
    await waitFor(() => {
      expect(core.searchHistory.map((entry) => entry.query)).toEqual(['sécurité', 'astable']);
    });

    // Clearing the field shows the history again; clearing the history empties it.
    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher' }));
    const again = await screen.findByRole('region', { name: 'Recherches récentes' }, SEARCHED);
    await user.click(within(again).getByRole('button', { name: 'Effacer l’historique' }));
    expect(await screen.findByText('Historique des recherches effacé.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recherches récentes' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveFocus();
    expect(core.searchHistory).toEqual([]);
  });
});

describe('search palette', () => {
  it('opens every result on the search page, keeping the words typed', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { level: 1 });

    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Rechercher dans ARCHIVE' });
    await user.keyboard('montage');
    expect(
      await within(palette).findByRole('option', { name: /Voir les 3 résultats/ }),
    ).toBeInTheDocument();
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/search');
    });
    expect(router.state.location.search).toBe('?q=montage');
    expect(
      screen.queryByRole('dialog', { name: 'Rechercher dans ARCHIVE' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('3 résultats')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toHaveValue('montage');
    await waitFor(() => {
      expect(core.searchHistory.map((entry) => entry.query)).toEqual(['montage']);
    });
  });

  it('keeps the text searched as typed when opening every result', async () => {
    mockNativeRuntime({}, { core: knowledgeBase().core });
    const { user, router } = renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Rechercher dans ARCHIVE' });
    await user.keyboard('notes sur la sécurité');
    await user.click(
      await within(palette).findByRole('button', { name: 'Chercher le texte tel quel' }),
    );
    expect(
      await within(palette).findByRole('button', { name: 'Reconnaître les dates et les types' }),
    ).toBeVisible();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/search');
    });
    expect(router.state.location.search).toBe(
      `?q=${encodeURIComponent('notes sur la sécurité')}&literal=1`,
    );
    expect(
      screen.getByRole('button', { name: 'Reconnaître les dates et les types' }),
    ).toBeVisible();
  });

  it('shows an untitled note as such', async () => {
    const untitled = seedNote('', { text: 'Idée de montage à base de relais.' });
    mockNativeRuntime({}, { core: { notes: [untitled] } });
    const { user } = renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Rechercher dans ARCHIVE' });
    await user.keyboard('relais');
    expect(await within(palette).findByRole('option', { name: /^Sans titre/ })).toBeVisible();
  });
});
