import type { Page } from '@playwright/test';
import { seedWorkspace } from '../../src/test/coreDouble';
import { emitNativeEvent, expect, expectNoViolations, pickFiles, seedCore, test } from './fixtures';
import { libraryState, pickedFixture } from './library';

function importPanel(page: Page) {
  return page.getByRole('region', { name: 'Import terminé' });
}

test.describe('library', () => {
  test('imports real files: the PDF text is extracted by pdf.js, problems are reported', async ({
    page,
  }) => {
    await page.goto('/#/library');
    await expect(page.getByRole('heading', { name: 'Votre bibliothèque est vide' })).toBeVisible();
    await pickFiles(page, [
      pickedFixture('fiche-ne555.pdf'),
      pickedFixture('cours-electronique.docx'),
      pickedFixture('schema-montage.png'),
      pickedFixture('composants.csv'),
      pickedFixture('export-casse.json'),
      { name: 'facture.pdf', failure: 'content_mismatch' },
      pickedFixture('fiche-ne555.pdf'),
    ]);
    await page.getByRole('button', { name: 'Importer des documents' }).click();

    const panel = importPanel(page);
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText('5 importés, 1 doublon et 1 échec', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText('Importé, mais sans texte extrait')).toBeVisible();
    await expect(
      panel.getByText('Le contenu ne correspond pas à l’extension du fichier'),
    ).toBeVisible();
    await expect(panel.getByRole('link', { name: /Déjà dans votre bibliothèque/ })).toBeVisible();
    await panel.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByRole('status').filter({ hasText: '5 documents' })).toBeVisible();

    // The PDF was imported with its text pending: pdf.js reads it in the page and the core stores the text.
    await expect(page.getByText('Texte en attente')).toHaveCount(0);
    await page.getByRole('link', { name: 'fiche-ne555' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'fiche-ne555' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Page 1 sur 2/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Texte extrait' }).click();
    await expect(page.getByText(/Timer NE555/)).toBeVisible();
    await expect(page.getByText(/Broche 8 : alimentation VCC/)).toBeVisible();
    await expect(page.getByText('2', { exact: true })).toBeVisible();

    // The Word document's text and metadata, the image without text.
    await page.goto('/#/library');
    await page.getByRole('link', { name: 'cours-electronique' }).click();
    await expect(page.getByText('Les résistances en série s’additionnent.')).toBeVisible();
    await page.goto('/#/library');
    await page.getByRole('link', { name: 'schema-montage' }).click();
    await expect(page.getByRole('img', { name: /Aperçu de «\sschema-montage\s»/ })).toBeVisible();
    await expect(page.getByText('Sans texte', { exact: true })).toBeVisible();
  });

  test('imports the files dropped on the window into the workspace displayed', async ({ page }) => {
    const electronics = seedWorkspace('Électronique', { icon: 'cpu' });
    await seedCore(page, { workspaces: [electronics] });
    await page.goto(`/#/library?workspace=${electronics.workspace.id}`);
    await expect(page.getByRole('heading', { name: 'Aucun document ne correspond' })).toBeVisible();

    await pickFiles(page, [pickedFixture('notes-de-cours.txt'), pickedFixture('composants.csv')]);
    await emitNativeEvent(page, 'tauri://drag-enter', { paths: [], position: { x: 600, y: 400 } });
    await expect(page.getByText('Déposez vos fichiers pour les importer')).toBeVisible();
    await expect(page.getByText(/Ils seront ajoutés à «\sÉlectronique\s»/)).toBeVisible();
    await emitNativeEvent(page, 'tauri://drag-leave', null);
    await expect(page.getByText('Déposez vos fichiers pour les importer')).toBeHidden();
    await emitNativeEvent(page, 'tauri://drag-enter', { paths: [], position: { x: 600, y: 400 } });
    await emitNativeEvent(page, 'tauri://drag-drop', { paths: [], position: { x: 600, y: 400 } });

    await expect(importPanel(page).getByText('2 importés', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '2 documents' })).toBeVisible();
    await page.goto(`/#/workspaces/${electronics.workspace.id}`);
    await expect(page.getByText('notes-de-cours')).toBeVisible();
  });

  test('keeps search, filters and folder in the address, across a reload', async ({ page }) => {
    const library = libraryState();
    await seedCore(page, library.state);
    await page.goto('/#/library');
    await expect(page.getByRole('status').filter({ hasText: '7 documents' })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Rechercher des documents' }).fill('ne555');
    await expect(page.getByRole('status').filter({ hasText: '2 documents' })).toBeVisible();
    await page.getByRole('button', { name: 'Filtres' }).click();
    await page
      .getByRole('dialog', { name: 'Filtres' })
      .getByRole('combobox', { name: 'Format' })
      .selectOption({ label: 'PDF' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status').filter({ hasText: '1 document' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Retirer le filtre «\sFormat\s: PDF\s»/ }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: '1 document' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Rechercher des documents' })).toHaveValue(
      'ne555',
    );
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(page.getByRole('status').filter({ hasText: '7 documents' })).toBeVisible();

    await page.goto(`/#/library?workspace=${library.electronics.workspace.id}`);
    const folders = page.getByRole('navigation', { name: 'Dossiers' });
    await folders.getByRole('button', { name: 'Semestre 1', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '1 document' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cours d’électricité générale' })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('navigation', { name: 'Dossiers' }).getByRole('button', {
        name: 'Semestre 1',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'true');
  });

  test('navigates and zooms a PDF, and opens the actions from the keyboard', async ({ page }) => {
    const library = libraryState();
    await seedCore(page, library.state);
    await page.goto(`/#/library/${library.documents.pdf.document.id}`);
    await expect(page.getByRole('img', { name: /Page 1 sur 2/ })).toBeVisible();
    const toolbar = page.getByRole('toolbar', { name: 'Navigation dans le PDF' });
    await expect(toolbar.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    await toolbar.getByRole('button', { name: 'Page suivante' }).click();
    await expect(page.getByRole('img', { name: /Page 2 sur 2/ })).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Page suivante' })).toBeDisabled();
    await toolbar.getByRole('spinbutton', { name: 'Page' }).fill('1');
    await toolbar.getByRole('spinbutton', { name: 'Page' }).press('Enter');
    await expect(page.getByRole('img', { name: /Page 1 sur 2/ })).toBeVisible();

    const zoom = toolbar.getByText(/^\d+\s%$/);
    const before = await zoom.textContent();
    await toolbar.getByRole('button', { name: 'Agrandir' }).click();
    await expect(zoom).not.toHaveText(before ?? '');
    await toolbar.getByRole('button', { name: 'Ajuster à la largeur' }).click();
    await expect(zoom).toHaveText(before ?? '');

    await page.getByRole('button', { name: 'Favori' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Favori' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByText('Retiré des favoris.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Actions du document/ }).press('Enter');
    // The header already offers opening, export and favorite: the menu starts with the other actions.
    await expect(page.getByRole('menuitem', { name: 'Afficher dans l’Explorateur' })).toBeFocused();
    await expect(page.getByRole('menuitem', { name: 'Exporter une copie…' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});

test.describe('accessibility of Phase 4 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test('Library list, grid, filters, folders and trash', async ({ page }) => {
    const library = libraryState();
    await seedCore(page, library.state);
    await page.goto('/#/library');
    await expect(page.getByRole('status').filter({ hasText: '7 documents' })).toBeVisible();
    await expectNoViolations(page, 'library list');
    await page.getByRole('button', { name: 'Grille', exact: true }).click();
    await expectNoViolations(page, 'library grid');
    await page.getByRole('button', { name: 'Filtres' }).click();
    await page
      .getByRole('dialog', { name: 'Filtres' })
      .getByRole('combobox', { name: 'Format' })
      .selectOption({ label: 'Word' });
    await expectNoViolations(page, 'filters panel');
    await page.keyboard.press('Escape');
    await expectNoViolations(page, 'filter chips');
    await page.goto(`/#/library?workspace=${library.electronics.workspace.id}`);
    await expect(page.getByRole('navigation', { name: 'Dossiers' })).toBeVisible();
    await expectNoViolations(page, 'folders');
    await page.goto('/#/library?state=trashed');
    await expect(page.getByRole('heading', { name: 'La corbeille est vide' })).toBeVisible();
    await expectNoViolations(page, 'empty trash');
  });

  test('document pages, dialogs and import panel', async ({ page }) => {
    const library = libraryState();
    await seedCore(page, library.state);
    for (const entry of Object.values(library.documents)) {
      await page.goto(`/#/library/${entry.document.id}`);
      await expect(
        page.getByRole('heading', { level: 2, name: entry.document.title }),
      ).toBeVisible();
      await expect(page.getByText('Chargement du PDF…')).toHaveCount(0);
      await expectNoViolations(page, entry.document.originalFilename);
    }
    await page.goto(`/#/library/${library.documents.csv.document.id}`);
    for (const action of ['Renommer…', 'Déplacer…', 'Étiquettes…']) {
      await page.getByRole('button', { name: /Actions du document/ }).click();
      await page.getByRole('menuitem', { name: action }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page, action);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    await page.goto('/#/library');
    await pickFiles(page, [
      pickedFixture('notes-de-cours.txt'),
      { name: 'cle-usb.txt', text: 'mesures', failure: 'unreadable' },
    ]);
    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    await expect(
      importPanel(page).getByText('1 importé et 1 échec', { exact: true }),
    ).toBeVisible();
    await expectNoViolations(page, 'import panel');
  });
});
