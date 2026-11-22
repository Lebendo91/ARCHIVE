import type { Page } from '@playwright/test';
import { seedDocument, seedFolder, seedTag, type CoreDoubleNote } from '../../src/test/coreDouble';
import {
  coreState,
  expect,
  expectNoViolations,
  failNextCommand,
  pickMarkdown,
  saveNoteElsewhere,
  seedCore,
  test,
} from './fixtures';
import { notesState } from './notes';

function noteBody(page: Page) {
  return page.getByRole('textbox', { name: 'Contenu de la note' });
}

function savedStatus(page: Page) {
  return page.getByText('Enregistré', { exact: true });
}

/** The note `id` as the core stores it now. */
async function storedNote(page: Page, id?: string): Promise<CoreDoubleNote | undefined> {
  const { notes } = await coreState(page);
  return id === undefined ? notes[0] : notes.find((entry) => entry.note.id === id);
}

const MARKDOWN_MEMO = [
  '# Mesures',
  '',
  'Relevés du **TP 3**.',
  '',
  '| Résistance | Valeur |',
  '| --- | --- |',
  '| R1 | 10 kΩ |',
  '',
  '![schéma](https://example.com/schema.png)',
  '',
  '<img src="https://example.com/pixel.gif"><iframe src="https://example.com/"></iframe>',
  '',
  '[Fiche](https://example.com/fiche)',
  '',
].join('\n');

test.describe('notes', () => {
  test('writes a note with the keyboard, formatted by Markdown shortcuts, and keeps it after a reload', async ({
    page,
  }) => {
    await page.goto('/#/notes');
    await expect(page.getByRole('heading', { name: 'Aucune note pour l’instant' })).toBeVisible();
    await page.keyboard.press('Control+n');
    await expect(page.getByRole('textbox', { name: 'Titre de la note' })).toBeFocused();
    await page.keyboard.type('Montages à NE555');
    await page.keyboard.press('Enter');
    await expect(noteBody(page)).toBeFocused();

    await page.keyboard.type('## Astable');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Le condensateur se charge par ');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('R1 et R2');
    await page.keyboard.press('Control+b');
    await page.keyboard.type('.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- Broche 2 : seuil bas');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Broche 6 : seuil haut');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[ ] Mesurer la fréquence');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('> Toujours découpler l’alimentation.');
    await expect(page.getByText('Modifications non enregistrées')).toBeVisible();
    await expect(savedStatus(page)).toBeVisible();
    await expect
      .poll(async () => (await storedNote(page))?.contentText)
      .toContain('Toujours découpler l’alimentation.');
    const stored = await storedNote(page);
    expect(stored?.note.title).toBe('Montages à NE555');
    const structure = JSON.parse(stored?.note.content ?? '{}') as { content: { type: string }[] };
    expect(structure.content.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'taskList',
      'blockquote',
      // Kept by the editor after a block, to go on writing below it.
      'paragraph',
    ]);

    await page.reload();
    const body = noteBody(page);
    await expect(body.getByRole('heading', { level: 2, name: 'Astable' })).toBeVisible();
    await expect(body.locator('strong')).toHaveText('R1 et R2');
    await expect(body.locator('ul:not([data-type="taskList"]) > li')).toHaveCount(2);
    await expect(body.locator('blockquote')).toHaveText('Toujours découpler l’alimentation.');
    const task = body.getByRole('checkbox', { name: /^Tâche\s«\sMesurer la fréquence\s»$/ });
    await expect(task).not.toBeChecked();
    await task.check();
    await expect
      .poll(async () => (await storedNote(page))?.note.content)
      .toContain('"checked":true');

    await page.goto('/#/notes');
    await expect(page.getByRole('link', { name: 'Montages à NE555' })).toBeVisible();
    await expect(page.getByText(/^Astable/)).toBeVisible();
  });

  test('follows the links of a note to notes and documents, which list it in return', async ({
    page,
  }) => {
    const notes = notesState();
    await seedCore(page, notes.state);
    await page.goto(`/#/notes/${notes.notes.kirchhoff.note.id}`);

    await noteBody(page).getByRole('link', { name: 'loi d’Ohm' }).click();
    await expect(page.getByRole('textbox', { name: 'Titre de la note' })).toHaveValue('Loi d’Ohm');
    const backlinks = page.getByRole('region', { name: 'Rétroliens' });
    await expect(backlinks.getByRole('link', { name: 'Lois de Kirchhoff' })).toBeVisible();

    await backlinks.getByRole('link', { name: 'Lois de Kirchhoff' }).click();
    await noteBody(page).getByRole('link', { name: 'fiche du NE555' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Fiche technique NE555' }),
    ).toBeVisible();
    await expect(page.getByText('Notes qui citent ce document')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lois de Kirchhoff' })).toBeVisible();
  });

  test('imports Markdown files as notes and exports a note as Markdown', async ({ page }) => {
    await page.goto('/#/notes');
    await pickMarkdown(page, [
      {
        name: 'TP diodes',
        markdown:
          '# TP diodes\n\n1. Monter le circuit\n2. Mesurer la tension\n\n| Diode | Seuil |\n| --- | --- |\n| 1N4148 | 0,6 V |\n\n```\nV = 0.6\n```\n',
        failure: null,
      },
      { name: 'enregistrement', markdown: null, failure: 'too_large' },
    ]);
    // The empty page offers the import twice: in its toolbar and in its empty state.
    await page.getByRole('button', { name: 'Importer du Markdown' }).first().click();
    await expect(page.getByText('1 note importée.', { exact: true })).toBeVisible();
    await expect(
      page.getByText('enregistrement : Fichier trop volumineux (16 Mo au plus)', {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'TP diodes' }).click();
    const body = noteBody(page);
    await expect(body.getByRole('heading', { level: 1, name: 'TP diodes' })).toBeVisible();
    await expect(body.locator('ol > li')).toHaveCount(2);
    await expect(body.getByRole('cell', { name: '0,6 V' })).toBeVisible();
    await expect(body.locator('pre code')).toHaveText('V = 0.6');

    await page.getByRole('button', { name: /^Actions de la note\s«\sTP diodes\s»$/ }).click();
    await page.getByRole('menuitem', { name: 'Exporter en Markdown…' }).click();
    await expect(page.getByText('Note exportée en Markdown.', { exact: true })).toBeVisible();
    const [exported] = (await coreState(page)).exports;
    expect(exported?.markdown).toContain('# TP diodes');
    expect(exported?.markdown).toContain('1. Monter le circuit');
    expect(exported?.markdown).toMatch(/\|\s*1N4148\s*\|\s*0,6 V\s*\|/);
    expect(exported?.markdown).toContain('V = 0.6');
  });

  test('never loses what was typed: failed save, recovery after a reload, note saved elsewhere', async ({
    page,
  }) => {
    const notes = notesState();
    await seedCore(page, notes.state);
    const { ohm } = notes.notes;
    await page.goto(`/#/notes/${ohm.note.id}`);
    await expect(savedStatus(page)).toBeVisible();

    await failNextCommand(page, 'notes_save', 'io');
    await noteBody(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Puissance : P = U × I.');
    const failed = page
      .getByRole('alert')
      .filter({ hasText: 'Vos modifications n’ont pas été enregistrées' });
    await expect(failed).toBeVisible();
    await expectNoViolations(page, 'failed save');
    // The recovery draft follows the changes within a second; the page then « crashes ».
    await expect
      .poll(() =>
        page.evaluate((id) => localStorage.getItem(`archive-note-draft:${id}`), ohm.note.id),
      )
      .toContain('P = U × I.');
    await page.reload();
    await expect(
      page.getByText(
        'Des modifications non enregistrées lors de la dernière session ont été retrouvées.',
      ),
    ).toBeVisible();
    await expectNoViolations(page, 'recovery banner');
    await page.getByRole('button', { name: 'Restaurer ces modifications' }).click();
    await expect(noteBody(page)).toContainText('P = U × I.');
    await expect(noteBody(page)).toBeFocused();
    await expect
      .poll(async () => (await storedNote(page, ohm.note.id))?.contentText)
      .toContain('P = U × I.');

    await saveNoteElsewhere(page, ohm.note.id, 'Version d’une autre fenêtre.');
    await page.keyboard.type('Fin. ');
    const conflict = page.getByRole('alert').filter({ hasText: 'modifiée ailleurs' });
    await expect(conflict).toBeVisible();
    await expectNoViolations(page, 'conflict banner');
    expect((await storedNote(page, ohm.note.id))?.contentText).toBe('Version d’une autre fenêtre.');
    await conflict.getByRole('button', { name: 'Garder ma version' }).click();
    await expect(conflict).toBeHidden();
    await expect
      .poll(async () => (await storedNote(page, ohm.note.id))?.contentText)
      .toContain('Fin.');
  });

  test('lays out a Markdown document of the Library without loading anything from the network', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).hostname.endsWith('example.com')) {
        requests.push(request.url());
      }
    });
    const memo = seedDocument('mesures.md', { content: MARKDOWN_MEMO });
    await seedCore(page, { documents: [memo] });
    await page.goto(`/#/library/${memo.document.id}`);
    const preview = page.getByRole('region', { name: 'Aperçu' });
    await expect(preview.getByRole('heading', { level: 1, name: 'Mesures' })).toBeVisible();
    await expect(preview.locator('strong')).toHaveText('TP 3');
    await expect(preview.getByRole('cell', { name: '10 kΩ' })).toBeVisible();
    await expect(preview.locator('img, iframe, script')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Texte extrait' }).click();
    await expect(page.getByRole('region', { name: 'Texte extrait' })).toContainText(
      '| R1 | 10 kΩ |',
    );
    expect(requests).toEqual([]);
  });
});

test.describe('accessibility of Phase 5 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test('notes list, filters, folders and states', async ({ page }) => {
    const notes = notesState();
    await seedCore(page, notes.state);
    await page.goto('/#/notes');
    await expect(page.getByRole('status').filter({ hasText: '4 notes' })).toBeVisible();
    await expectNoViolations(page, 'notes list');
    await page.getByRole('button', { name: 'Filtres' }).click();
    const filters = page.getByRole('dialog', { name: 'Filtres' });
    await expectNoViolations(page, 'notes filters');
    // The filter lives in the address: the box is checked once the address changed.
    const favorites = filters.getByRole('checkbox', { name: 'Favoris uniquement' });
    await favorites.click();
    await expect(favorites).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status').filter({ hasText: '1 note' })).toBeVisible();
    await expectNoViolations(page, 'notes filter chips');
    await page.goto(`/#/notes?workspace=${notes.electronics.workspace.id}`);
    await expect(page.getByRole('navigation', { name: 'Dossiers' })).toBeVisible();
    await expectNoViolations(page, 'notes folders');
    await page.goto('/#/notes?state=archived');
    await expect(page.getByRole('heading', { name: 'Aucune note archivée' })).toBeVisible();
    await expectNoViolations(page, 'no archived note');
    await page.goto('/#/notes?state=trashed');
    await expect(page.getByRole('heading', { name: 'La corbeille est vide' })).toBeVisible();
    await expectNoViolations(page, 'empty notes trash');
  });

  test('note editor, its menus and its dialogs', async ({ page }) => {
    const notes = notesState();
    await seedCore(page, notes.state);
    await page.goto(`/#/notes/${notes.notes.kirchhoff.note.id}`);
    await expect(noteBody(page)).toBeVisible();
    await expect(savedStatus(page)).toBeVisible();
    await expectNoViolations(page, 'rich note');

    await page.getByRole('button', { name: 'Insérer' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoViolations(page, 'insert menu');
    await page.keyboard.press('Escape');

    await noteBody(page).getByRole('cell', { name: 'Courant' }).click();
    await page.getByRole('button', { name: 'Actions du tableau' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoViolations(page, 'table menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Lien…' }).click();
    const link = page.getByRole('dialog', { name: 'Lien' });
    await link.getByRole('textbox', { name: 'Adresse' }).fill('ftp://example.com');
    await link.getByRole('button', { name: 'Appliquer' }).click();
    await expect(link.getByText(/^Adresse non valide/)).toBeVisible();
    await expectNoViolations(page, 'link dialog with an error');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Lien vers une note ou un document…' }).click();
    await expect(page.getByRole('button', { name: 'Idées de projets' })).toBeVisible();
    await expectNoViolations(page, 'link picker');
    await page.keyboard.press('Escape');

    for (const open of [
      () => page.getByRole('button', { name: 'Déplacer…' }).click(),
      () => page.getByRole('button', { name: 'Étiquettes…' }).click(),
      async () => {
        await page.getByRole('button', { name: /^Actions de la note/ }).click();
        await page.getByRole('menuitem', { name: 'Renommer…' }).click();
      },
    ]) {
      await open();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page, 'note dialog');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    await page.getByRole('button', { name: /^Actions de la note/ }).click();
    await page.getByRole('menuitem', { name: 'Mettre à la corbeille' }).click();
    await expect(
      page.getByText('Cette note est dans la corbeille : restaurez-la pour la modifier.'),
    ).toBeVisible();
    await expect(noteBody(page)).toHaveAttribute('aria-readonly', 'true');
    await expectNoViolations(page, 'note in the trash');
  });

  test('tag manager, folder moving, Markdown preview and personal pages', async ({ page }) => {
    const notes = notesState();
    const lecture = seedTag('Cours');
    const lab = seedTag('TP', 'blue');
    notes.notes.kirchhoff.tagIds = [lecture.id];
    const archives = seedFolder(notes.electronics, 'Archives');
    const lectures = seedFolder(notes.electronics, 'Cours');
    const memo = seedDocument('mesures.md', { content: MARKDOWN_MEMO });
    await seedCore(page, {
      ...notes.state,
      tags: [lecture, lab],
      folders: [archives, lectures],
      documents: [...notes.state.documents, memo],
    });

    await page.goto('/#/notes');
    const filtersButton = page.getByRole('button', { name: 'Filtres' });
    await filtersButton.click();
    await page.getByRole('button', { name: 'Gérer les étiquettes…' }).click();
    const manager = page.getByRole('dialog', { name: 'Étiquettes' });
    await expect(manager.getByText('0 document · 1 note')).toBeVisible();
    await expectNoViolations(page, 'tag manager');
    await manager.getByRole('button', { name: /^Renommer\s«\sCours\s»$/ }).click();
    await expect(manager.getByRole('textbox', { name: /^Nouveau nom de/ })).toBeFocused();
    await expectNoViolations(page, 'tag manager, rename');
    await manager.getByRole('button', { name: 'Annuler' }).click();
    await expect(manager.getByRole('button', { name: /^Renommer\s«\sCours\s»$/ })).toBeFocused();
    await manager.getByRole('button', { name: /^Supprimer\s«\sTP\s»$/ }).click();
    await expect(manager.getByText('Aucun document ni aucune note ne la porte.')).toBeVisible();
    await expectNoViolations(page, 'tag manager, deletion');
    await manager.getByRole('button', { name: 'Supprimer l’étiquette' }).click();
    await expect(manager.getByRole('status')).toHaveText(/^Étiquette\s«\sTP\s»\ssupprimée\.$/);
    // Focus went to the remaining tag, whose tooltip Escape closes first (WCAG 1.4.13), then the dialog.
    await expect(manager.getByRole('button', { name: /^Renommer\s«\sCours\s»$/ })).toBeFocused();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect(manager).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(manager).toBeHidden();
    await expect(filtersButton).toBeFocused();

    await page.goto(`/#/notes?workspace=${notes.electronics.workspace.id}`);
    await page.getByRole('button', { name: /^Actions du dossier\s«\sCours\s»$/ }).click();
    await page.getByRole('menuitem', { name: 'Déplacer…' }).click();
    const move = page.getByRole('dialog', { name: /^Déplacer le dossier/ });
    await expect(move).toBeVisible();
    await expectNoViolations(page, 'folder move');
    await move.getByRole('combobox', { name: 'Nouvel emplacement' }).selectOption({
      label: 'Archives',
    });
    await move.getByRole('button', { name: 'Déplacer', exact: true }).click();
    await expect(page.getByText('Dossier déplacé.', { exact: true })).toBeVisible();

    await page.goto(`/#/library/${memo.document.id}`);
    await expect(
      page.getByRole('region', { name: 'Aperçu' }).getByRole('heading', { name: 'Mesures' }),
    ).toBeVisible();
    await expectNoViolations(page, 'Markdown preview');

    for (const path of ['/#/favorites', '/#/recent']) {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Lois de Kirchhoff' })).toBeVisible();
      await expectNoViolations(page, path);
    }
  });
});
