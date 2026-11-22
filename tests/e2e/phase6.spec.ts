import type { Page } from '@playwright/test';
import { coreState, expect, expectNoViolations, seedCore, test } from './fixtures';
import { searchState } from './search';

function palette(page: Page) {
  return page.getByRole('dialog', { name: 'Rechercher dans ARCHIVE' });
}

function paletteInput(page: Page) {
  return palette(page).getByRole('combobox', { name: 'Rechercher' });
}

function searchField(page: Page) {
  return page.getByRole('searchbox', { name: 'Rechercher' });
}

/** Opens the palette with its shortcut, once the window is ready. */
async function openPalette(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(paletteInput(page)).toBeFocused();
}

/** The line that counts the results of the search page. */
function resultCount(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: new RegExp(`^${text}$`) });
}

/** Moves the active option of the palette to the one whose text starts with `title`, with the arrow keys. */
async function selectOption(page: Page, title: string): Promise<void> {
  const options = palette(page).getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  const texts = await options.allTextContents();
  const index = texts.findIndex((text) => text.startsWith(title));
  expect(index, `option « ${title} » among ${texts.join(' | ')}`).toBeGreaterThanOrEqual(0);
  for (let step = 0; step < index; step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(options.nth(index)).toHaveAttribute('aria-selected', 'true');
}

test.describe('search', () => {
  test('searches everything from the top bar, grouped by type, and opens the result chosen with the keyboard', async ({
    page,
  }) => {
    const seeds = searchState();
    await seedCore(page, seeds.state);
    await page.goto('/#/');
    await openPalette(page);
    await expect(
      palette(page).getByText('Vos recherches récentes apparaîtront ici.'),
    ).toBeVisible();

    await page.keyboard.type('astable');
    await expect(palette(page).getByRole('group', { name: 'Documents' })).toBeVisible();
    await expect(palette(page).getByRole('group', { name: 'Notes' })).toBeVisible();
    // The words found are highlighted, in the title and in the passage of the text.
    await expect(
      palette(page)
        .getByRole('option', { name: /^Fiche technique NE555/ })
        .locator('mark'),
    ).toHaveText(['astable']);
    await expect(palette(page).getByRole('option', { name: /Voir les 3 résultats/ })).toBeVisible();

    await selectOption(page, 'Montage astable du NE555');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/notes/${seeds.notes.timer.note.id}$`));
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Titre de la note' })).toHaveValue(
      'Montage astable du NE555',
    );

    // The search is remembered; choosing it again types it back.
    await openPalette(page);
    const recent = palette(page).getByRole('group', { name: 'Recherches récentes' });
    await expect(recent.getByRole('option', { name: 'astable' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(paletteInput(page)).toHaveValue('astable');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
  });

  test('finds the text of documents page by page, and of notes, with their place and date', async ({
    page,
  }) => {
    const seeds = searchState();
    await seedCore(page, seeds.state);
    await page.goto('/#/search?q=attachInterrupt');
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    const course = page.getByRole('listitem').filter({ hasText: 'Cours Arduino' });
    await expect(course).toContainText('Document · PDF · Électronique · page 3');
    await expect(course.locator('mark')).toHaveText(['attachInterrupt']);
    await course.getByRole('link', { name: 'Cours Arduino' }).click();
    await expect(page).toHaveURL(new RegExp(`#/library/${seeds.course.document.id}$`));

    // A Word document, by the text extracted from it.
    await page.goto('/#/search?q=r%C3%A9sistances%20s%C3%A9rie');
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Cours d’électricité générale' }),
    ).toContainText('Document · DOCX · Électronique › Semestre 1');
  });

  test('opens every result on the search page, narrows them by type and filter, and keeps them after a reload', async ({
    page,
  }) => {
    const seeds = searchState();
    await seedCore(page, seeds.state);
    await page.goto('/#/');
    await openPalette(page);
    await page.keyboard.type('montage');
    await expect(
      palette(page).getByRole('option', { name: /Voir les \d+ résultats/ }),
    ).toBeVisible();
    await page.keyboard.press('Control+Enter');
    await expect(page).toHaveURL(/#\/search\?q=montage$/);
    await expect(searchField(page)).toHaveValue('montage');
    await expect(resultCount(page, '4 résultats')).toBeVisible();

    // The choice is kept in the address, which the page then follows.
    await page.getByRole('radio', { name: 'Notes (2)' }).click();
    await expect(page.getByRole('radio', { name: 'Notes (2)' })).toBeChecked();
    await expect(resultCount(page, '2 résultats')).toBeVisible();
    await page.getByRole('button', { name: 'Filtres' }).click();
    await page
      .getByRole('dialog', { name: 'Filtres' })
      .getByRole('combobox', { name: 'Espace de travail' })
      .selectOption({ label: 'Électronique' });
    await page.keyboard.press('Escape');
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Filtres actifs' }).getByRole('button', {
        name: /Espace de travail\s:\sÉlectronique/,
      }),
    ).toBeVisible();

    await page.reload();
    await expect(searchField(page)).toHaveValue('montage');
    await expect(page.getByRole('radio', { name: 'Notes (1)' })).toBeChecked();
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    await page.getByRole('link', { name: 'Sécurité électrique au laboratoire' }).click();
    await expect(page).toHaveURL(new RegExp(`#/notes/${seeds.notes.safety.note.id}$`));
  });

  test('says which type and period it read in the text, and can search the text as typed', async ({
    page,
  }) => {
    await seedCore(page, searchState().state);
    await page.goto(`/#/search?q=${encodeURIComponent('notes modifiées ces 7 derniers jours')}`);
    await expect(
      page.getByText(/^Type\s:\sNotes · Modifiés\s:\smodifiées ces 7 derniers jours/),
    ).toBeVisible();
    await expect(resultCount(page, '2 résultats')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Interruptions sur Arduino' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Montage astable du NE555' })).toBeVisible();

    await page.getByRole('button', { name: 'Chercher le texte tel quel' }).click();
    await expect(page.getByRole('heading', { name: 'Aucun résultat' })).toBeVisible();
    await page.getByRole('button', { name: 'Reconnaître les dates et les types' }).click();
    await expect(resultCount(page, '2 résultats')).toBeVisible();
  });

  test('lists every item carrying a tag from a tag result', async ({ page }) => {
    const seeds = searchState();
    await seedCore(page, seeds.state);
    await page.goto('/#/');
    await openPalette(page);
    await page.keyboard.type('projet');
    await selectOption(page, 'Projet NE555');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/search\\?tag=${seeds.tags.project.id}$`));
    await expect(
      page.getByRole('button', { name: /Retirer le filtre «\sÉtiquette\s:\sProjet NE555\s»/ }),
    ).toBeVisible();
    await expect(resultCount(page, '3 résultats')).toBeVisible();
    for (const title of [
      'Fiche technique NE555',
      'Schéma du montage astable',
      'Montage astable du NE555',
    ]) {
      await expect(page.getByRole('link', { name: title })).toBeVisible();
    }
  });

  test('finds a note by the words just written in it, even after searching them before', async ({
    page,
  }) => {
    await seedCore(page, searchState().state);
    await page.goto('/#/search?q=quartz');
    await expect(page.getByRole('heading', { name: 'Aucun résultat' })).toBeVisible();

    await page.keyboard.press('Control+n');
    await expect(page.getByRole('textbox', { name: 'Titre de la note' })).toBeFocused();
    await page.keyboard.type('Horloge');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Un oscillateur à quartz vibre à 32 768 Hz.');
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.goto('/#/search?q=quartz');
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Horloge' })).toBeVisible();
  });

  test('keeps the recent searches, which can be removed one by one or cleared', async ({
    page,
  }) => {
    await seedCore(page, searchState().state);
    await page.goto('/#/search');
    await expect(page.getByRole('heading', { name: 'Rechercher dans ARCHIVE' })).toBeVisible();
    for (const query of ['grafcet', 'disjoncteur', 'volatile']) {
      await searchField(page).fill(query);
      await searchField(page).press('Enter');
      await expect(resultCount(page, '1 résultat')).toBeVisible();
    }
    await searchField(page).fill('');
    const recent = page.getByRole('region', { name: 'Recherches récentes' });
    await expect(
      recent.getByRole('button', { name: /^(grafcet|disjoncteur|volatile)$/ }),
    ).toHaveText(['volatile', 'disjoncteur', 'grafcet']);

    await recent.getByRole('button', { name: /Retirer «\sdisjoncteur\s» de l’historique/ }).click();
    await expect(recent.getByRole('button', { name: 'grafcet', exact: true })).toBeFocused();
    await expect(recent.getByRole('button', { name: 'disjoncteur', exact: true })).toHaveCount(0);
    expect((await coreState(page)).searchHistory.map((entry) => entry.query)).toEqual([
      'volatile',
      'grafcet',
    ]);

    await recent.getByRole('button', { name: 'Effacer l’historique' }).click();
    await expect(
      page.getByText('Historique des recherches effacé.', { exact: true }),
    ).toBeVisible();
    await expect(recent).toBeHidden();
    await expect(searchField(page)).toBeFocused();
    expect((await coreState(page)).searchHistory).toEqual([]);
  });
});

test.describe('accessibility of Phase 6 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test('search palette, with recent searches and with results', async ({ page }) => {
    await seedCore(page, {
      ...searchState().state,
      searchHistory: [{ id: 'h1', query: 'astable', searchedAt: Date.now() - 60_000 }],
    });
    await page.goto('/#/');
    await openPalette(page);
    await expect(palette(page).getByRole('option', { name: 'astable' })).toBeVisible();
    await expectNoViolations(page, 'palette with recent searches');

    await page.keyboard.type('notes sur la sécurité');
    await expect(palette(page).getByText(/^Type\s:\sNotes$/)).toBeVisible();
    await expect(palette(page).getByRole('option', { name: /^Sécurité électrique/ })).toBeVisible();
    await expectNoViolations(page, 'palette with results and what was recognized');
  });

  test('search page: results, filters, empty states and history', async ({ page }) => {
    await seedCore(page, {
      ...searchState().state,
      searchHistory: [{ id: 'h1', query: 'astable', searchedAt: Date.now() - 60_000 }],
    });
    await page.goto('/#/search');
    await expect(page.getByRole('region', { name: 'Recherches récentes' })).toBeVisible();
    await expectNoViolations(page, 'search page before a search');

    await page.goto('/#/search?q=montage&period=30&favorites=1');
    await expect(resultCount(page, '1 résultat')).toBeVisible();
    await expectNoViolations(page, 'search results with filters');
    await page.getByRole('button', { name: /^Filtres/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filtres' })).toBeVisible();
    await expectNoViolations(page, 'search filters');
    await page.keyboard.press('Escape');

    await page.goto(`/#/search?q=${encodeURIComponent('notes sur les transistors')}`);
    await expect(page.getByRole('heading', { name: 'Aucun résultat' })).toBeVisible();
    await expectNoViolations(page, 'no results');
  });
});
