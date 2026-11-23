import type { Locator, Page } from '@playwright/test';
import { coreState, expect, expectNoViolations, seedCore, test } from './fixtures';
import { graphState } from './graph';

function graphMap(page: Page): Locator {
  return page.getByRole('group', { name: /^Carte du graphe/ });
}

function graphNode(page: Page, title: string): Locator {
  return graphMap(page).getByRole('button', { name: new RegExp(`^[^:]+\\s:\\s${title},`) });
}

/** The details panel: the section named by the selection. */
function details(page: Page, title: string): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) });
}

/** Translation and scale of the map, read from its drawing. */
async function viewOf(page: Page): Promise<{ x: number; y: number; k: number }> {
  const transform = await graphMap(page).locator(':scope > g').getAttribute('transform');
  const match = /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/.exec(transform ?? '');
  if (!match) {
    throw new Error(`Unexpected transform ${String(transform)}`);
  }
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('The element is not drawn');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('knowledge graph', () => {
  test('explores the map with the mouse: selects, drags, zooms, pans and opens an item', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, seeds.state);
    await page.goto('/#/graph');
    await expect(graphMap(page)).toBeVisible();
    await expect(page.getByText(/^7 éléments · 6 liens$/)).toBeVisible();

    const timer = graphNode(page, 'Montage astable du NE555');
    await timer.click();
    await expect(timer).toHaveAttribute('aria-pressed', 'true');
    const panel = details(page, 'Montage astable du NE555');
    await expect(panel.getByText(/^Étiquettes\s:\sProjet NE555$/)).toBeVisible();
    await expect(panel.getByText('Lien vers')).toHaveCount(2);

    // Dragging moves the item, and does not change the selection.
    const before = await timer.getAttribute('transform');
    const start = await centreOf(timer);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 5 });
    await page.mouse.up();
    await expect(timer).not.toHaveAttribute('transform', before ?? '');
    await expect(timer).toHaveAttribute('aria-pressed', 'true');

    // The wheel zooms around the pointer; dragging the background pans.
    const zoomed = await viewOf(page);
    const box = await graphMap(page).boundingBox();
    if (!box) {
      throw new Error('The map is not drawn');
    }
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await viewOf(page)).k).toBeGreaterThan(zoomed.k);
    const panned = await viewOf(page);
    await page.mouse.down();
    await page.mouse.move(box.x + 140, box.y + 90, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await viewOf(page)).x).toBeCloseTo(panned.x + 100, 0);

    // A click on a line shows what it means.
    await page.getByRole('button', { name: 'Tout afficher' }).click();
    const link = graphMap(page).locator(
      `path[data-edge="link:note:${seeds.notes.timer.note.id}:document:${seeds.documents.png.document.id}"]`,
    );
    const middle = await centreOf(link);
    await page.mouse.click(middle.x, middle.y);
    const edge = details(page, 'Lien de note');
    await expect(
      edge.getByText(
        /^«\sMontage astable du NE555\s» contient un lien vers «\sSchéma du montage astable\s»\.$/,
      ),
    ).toBeVisible();

    // A click on nothing clears the selection; a double click opens the item.
    await page.mouse.click(box.x + 12, box.y + 12);
    await expect(edge).toBeHidden();
    await graphNode(page, 'Cours Arduino').dblclick();
    await expect(page).toHaveURL(new RegExp(`#/library/${seeds.course.document.id}$`));
  });

  test('moves from item to item with the keyboard and zooms without the mouse', async ({
    page,
  }) => {
    await seedCore(page, graphState().state);
    await page.goto('/#/graph');
    await expect(graphMap(page)).toBeVisible();
    // One stop in the tab order for the whole map, then the arrows.
    const stops = graphMap(page).locator('[tabindex="0"]');
    await expect(stops).toHaveCount(1);
    await stops.focus();
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('role', 'button');
    const first = (await focused.getAttribute('aria-label')) ?? '';
    let reached = first;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      reached = (await focused.getAttribute('aria-label')) ?? '';
      if (reached !== first) {
        break;
      }
    }
    expect(reached).not.toBe(first);
    await expect(graphMap(page).locator('[tabindex="0"]')).toHaveAttribute('aria-label', reached);
    await page.keyboard.press('Enter');
    const title = /\s:\s(.+?),/.exec(reached)?.[1] ?? '';
    await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { level: 2, name: title, exact: true })).toBeHidden();

    const initial = await viewOf(page);
    await page.keyboard.press('+');
    await expect.poll(async () => (await viewOf(page)).k).toBeGreaterThan(initial.k);
    await page.keyboard.press('0');
    await expect.poll(async () => (await viewOf(page)).k).toBeCloseTo(initial.k, 2);
  });

  test('starts from an item, adds the neighbours of another one, and starts again elsewhere', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, seeds.state);
    await page.goto(`/#/graph?focus=document:${seeds.documents.pdf.document.id}`);
    await expect(page.getByText(/^2 éléments · 1 lien$/)).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /^Retirer le filtre «\sAutour de «\sFiche technique NE555\s»\s»$/,
      }),
    ).toBeVisible();

    await graphNode(page, 'Montage astable du NE555').click();
    const panel = details(page, 'Montage astable du NE555');
    await expect(panel.getByText('1 connexion n’est pas affichée.')).toBeVisible();
    await panel.getByRole('button', { name: 'Afficher les voisins' }).click();
    await expect(graphNode(page, 'Schéma du montage astable')).toBeVisible();
    await expect(page.getByText(/^3 éléments · 2 liens$/)).toBeVisible();

    await panel.getByRole('button', { name: 'Partir de cet élément' }).click();
    await expect(page).toHaveURL(new RegExp(`focus=note%3A${seeds.notes.timer.note.id}`));
    await expect(
      page.getByRole('button', {
        name: /^Retirer le filtre «\sAutour de «\sMontage astable du NE555\s»\s»$/,
      }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Partir d’un élément…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Partir d’un élément' });
    await expect(dialog.getByRole('searchbox', { name: 'Rechercher' })).toBeFocused();
    await page.keyboard.type('sécurité');
    await dialog.getByRole('button', { name: 'Sécurité électrique au laboratoire' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`focus=note%3A${seeds.notes.safety.note.id}`));
    await expect(graphNode(page, 'Interruptions sur Arduino')).toBeVisible();
    await page
      .getByRole('button', {
        name: /^Retirer le filtre «\sAutour de «\sSécurité électrique au laboratoire\s»\s»$/,
      })
      .click();
    await expect(page.getByText(/^7 éléments · 6 liens$/)).toBeVisible();
  });

  test('filters, searches the items drawn, and decides on a suggestion from the graph', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, seeds.state);
    await page.goto('/#/graph');
    await expect(graphMap(page)).toBeVisible();
    await page.getByRole('button', { name: 'Filtres' }).click();
    const filters = page.getByRole('dialog', { name: 'Filtres' });
    // Controlled by the address: clicked, then checked once the address changed.
    const suggestions = filters.getByRole('checkbox', { name: 'Suggestions d’ARCHIVE' });
    await suggestions.click();
    await expect(suggestions).toBeChecked();
    const tags = filters.getByRole('checkbox', { name: 'Étiquettes' });
    await tags.click();
    await expect(tags).toBeChecked();
    await expect(graphNode(page, 'Projet NE555')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: /^Filtres \(2 filtres actifs\)$/ }),
    ).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Rechercher dans le graphe' });
    await search.fill('arduino');
    const results = page.getByRole('list', { name: 'Éléments trouvés dans le graphe' });
    await expect(results.getByRole('button')).toHaveCount(2);
    await search.fill('ne555');
    await expect(results.getByRole('button')).toHaveCount(3);
    await results.getByRole('button', { name: 'Fiche technique NE555' }).click();
    // A result chosen: its details take the focus, ready to be read and used.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Fiche technique NE555', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fermer les détails' })).toBeFocused();
    const panel = details(page, 'Fiche technique NE555');
    await panel
      .getByRole('button', { name: /^Détails du lien avec «\sMontage astable du NE555\s»$/ })
      .last()
      .click();
    const edge = details(page, 'Suggestion d’ARCHIVE');
    await expect(
      edge.getByText(
        /^Termes communs\s:\sNE555, astable et condensateur · Étiquettes communes\s:\sProjet NE555 · Confiance\s:\s72\s%$/,
      ),
    ).toBeVisible();
    await edge.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText('Relation acceptée.', { exact: true })).toBeVisible();
    await expect(details(page, 'Relation').getByText('Suggestion acceptée')).toBeVisible();
    const stored = (await coreState(page)).relations.find(
      (relation) => relation.id === seeds.relations.suggestion.id,
    );
    expect(stored?.status).toBe('accepted');
  });

  test('lists the items as an alternative to the map', async ({ page }) => {
    await seedCore(page, graphState().state);
    await page.goto('/#/graph');
    await expect(graphMap(page)).toBeVisible();
    await page.getByRole('radio', { name: 'Liste' }).click();
    const list = page.getByRole('list', { name: 'Liste' });
    await expect(list.getByRole('listitem')).toHaveCount(7);
    await list.getByRole('button', { name: 'Interruptions sur Arduino' }).click();
    const panel = details(page, 'Interruptions sur Arduino');
    await expect(panel.getByText('Explique', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Fermer les détails' }).click();
    await expect(list.getByRole('button', { name: 'Interruptions sur Arduino' })).toBeFocused();
  });
});

test.describe('timeline', () => {
  test('browses the history by day, filters it, follows a relation and clears it after confirmation', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, seeds.state);
    await page.goto('/#/timeline');
    await expect(page.getByRole('heading', { level: 2, name: 'Aujourd’hui' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Hier' })).toBeVisible();
    const today = page.getByRole('region', { name: 'Aujourd’hui' });
    await expect(today.getByText('Note modifiée · Électronique')).toBeVisible();

    await page.getByRole('combobox', { name: 'Événement' }).selectOption('relation_accepted');
    await expect(page).toHaveURL(/type=relation_accepted/);
    const relation = page.getByRole('link', {
      name: 'Cours d’électricité générale — Sécurité électrique au laboratoire',
    });
    await expect(relation).toBeVisible();
    await expect(page.getByText('Relation acceptée · Suggestion d’ARCHIVE acceptée')).toBeVisible();
    await relation.click();
    await expect(page).toHaveURL(new RegExp(`#/library/${seeds.documents.docx.document.id}$`));
    await page.goBack();
    await expect(page.getByRole('combobox', { name: 'Événement' })).toHaveValue(
      'relation_accepted',
    );

    await page.getByRole('combobox', { name: 'Événement' }).selectOption('');
    await page.getByRole('combobox', { name: 'Période' }).selectOption('custom');
    await page.getByLabel('Du', { exact: true }).fill('2026-03-10');
    await page.getByLabel('Au', { exact: true }).fill('2026-03-01');
    await expect(
      page.getByText('La date de fin doit être postérieure ou égale à la date de début.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).first().click();

    await page.getByRole('button', { name: 'Effacer l’historique' }).click();
    const dialog = page.getByRole('dialog', { name: /^Effacer toute la chronologie\s\?$/ });
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Effacer l’historique' }).click();
    await expect(page.getByText(/^\d+ événements effacés\.$/)).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Aucune activité pour l’instant' }),
    ).toBeVisible();
    const state = await coreState(page);
    expect(state.events).toHaveLength(0);
    expect(state.notes.length).toBeGreaterThan(0);
    await page.goto('/#/');
    const activity = page.locator('section').filter({ hasText: 'Activité récente' }).first();
    await expect(activity.getByRole('link')).toHaveCount(0);
  });
});

test.describe('accessibility of Phase 8 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test('graph: map with a selection, filters, legend, list, start dialog and empty states', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, seeds.state);
    await page.goto('/#/graph?suggestions=1&kinds=document,note,workspace,tag');
    await graphNode(page, 'Montage astable du NE555').click();
    await expect(details(page, 'Montage astable du NE555')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Rechercher dans le graphe' }).fill('ne555');
    await expectNoViolations(page, 'graph map with a selection and a search');

    await page.getByRole('button', { name: /^Filtres/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filtres' })).toBeVisible();
    await expectNoViolations(page, 'graph filters');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByRole('dialog', { name: 'Légende' })).toBeVisible();
    await expectNoViolations(page, 'graph legend');
    await page.keyboard.press('Escape');

    await page.getByRole('radio', { name: 'Liste' }).click();
    await expect(page.getByRole('list', { name: 'Liste' })).toBeVisible();
    await expectNoViolations(page, 'graph list');

    await page.getByRole('button', { name: 'Partir d’un élément…' }).click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cours Arduino' }),
    ).toBeVisible();
    await expectNoViolations(page, 'start dialog');
  });

  test('graph without relations, and timeline with filters and the clearing dialog', async ({
    page,
  }) => {
    const seeds = graphState();
    await seedCore(page, {
      ...seeds.state,
      relations: seeds.state.relations.filter((relation) => relation.status === 'suggested'),
      notes: seeds.state.notes.map((entry) => ({ ...entry, links: [] })),
    });
    await page.goto('/#/graph');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Aucune relation pour l’instant' }),
    ).toBeVisible();
    await expectNoViolations(page, 'graph without relations');

    await page.goto('/#/timeline?period=custom&from=2026-03-10&to=2026-03-01');
    await expect(
      page.getByText('La date de fin doit être postérieure ou égale à la date de début.'),
    ).toBeVisible();
    await expectNoViolations(page, 'timeline with an impossible period');
    await page.goto('/#/timeline');
    await expect(page.getByRole('heading', { level: 2, name: 'Aujourd’hui' })).toBeVisible();
    await expectNoViolations(page, 'timeline');
    await page.getByRole('button', { name: 'Effacer l’historique' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page, 'clearing dialog');
  });
});
