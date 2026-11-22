import {
  creationEvent,
  seedDocument,
  seedFolder,
  seedTag,
  seedWorkspace,
} from '../../src/test/coreDouble';
import {
  emitNativeEvent,
  expect,
  failNextCommand,
  pickFiles,
  ROUTES,
  saveNoteElsewhere,
  seedCore,
  test,
  waitForFonts,
} from './fixtures';
import { libraryState, pickedFixture } from './library';
import { notesState } from './notes';
import { searchState } from './search';

/**
 * Screenshots for the visual audit (specification §20). They are written to visual-audit/ (kept between runs) and
 * reviewed by a person; they are not compared automatically. Run with `npm run test:visual`.
 */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1100, height: 700 },
] as const;

test.describe('@visual screenshots', () => {
  // Reduced motion: transitions finish instantly, so screenshots show settled states (and the setting is exercised).
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  for (const viewport of VIEWPORTS) {
    const size = `${String(viewport.width)}x${String(viewport.height)}`;

    test(`all screens at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const route of [
        ...ROUTES,
        { path: '/dev/ui', title: 'Galerie de composants', name: 'dev-gallery' },
      ]) {
        await page.goto(`/#${route.path}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.title);
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/${route.name}.png` });
      }
    });

    test(`interactive states at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await waitForFonts(page);
      await page.getByRole('button', { name: 'Menu du profil' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.screenshot({ path: `visual-audit/${size}/state-profile-menu.png` });
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
      await page.getByRole('link', { name: 'Bibliothèque' }).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.screenshot({
        path: `visual-audit/${size}/state-sidebar-collapsed.png`,
      });
      await page.getByRole('button', { name: 'Déplier la barre latérale' }).click();

      // The search entry of the top bar opens the palette (Phase 6): its hover state, without a tooltip.
      await page.getByRole('button', { name: /Rechercher dans ARCHIVE/ }).hover();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.screenshot({ path: `visual-audit/${size}/state-search-entry-hover.png` });

      await page.goto('/#/dev/ui');
      await waitForFonts(page);
      await page.getByRole('button', { name: 'Confirmation destructive' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: `visual-audit/${size}/state-confirm-dialog.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Succès' }).click();
      await page.getByRole('button', { name: 'Erreur' }).click();
      await expect(page.getByText('Import impossible', { exact: true })).toBeVisible();
      await page.screenshot({ path: `visual-audit/${size}/state-toasts.png` });

      await page.goto('/#/settings/storage');
      await page.getByRole('button', { name: 'Vérifier l’intégrité' }).click();
      await expect(page.getByText('Aucun problème détecté.')).toBeVisible();
      await page.screenshot({ path: `visual-audit/${size}/state-storage-integrity.png` });
    });

    test(`workspaces with data at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const hour = 60 * 60 * 1000;
      const electronics = seedWorkspace('Électronique', {
        icon: 'cpu',
        description: 'Cours, projets et fiches de composants.',
        counts: { documents: 12, notes: 5, folders: 3 },
        ageMs: 72 * hour,
      });
      const studies = seedWorkspace('Études supérieures', {
        icon: 'graduation-cap',
        color: 'blue',
        counts: { documents: 4, notes: 9, folders: 2 },
        ageMs: 2 * hour,
      });
      const work = seedWorkspace('Travail', {
        icon: 'briefcase',
        color: 'purple',
        ageMs: hour / 2,
      });
      const old = seedWorkspace('Ancien projet', {
        icon: 'rocket',
        color: 'neutral',
        isArchived: true,
        ageMs: 200 * hour,
      });
      await seedCore(page, {
        workspaces: [electronics, studies, work, old],
        events: [old, electronics, studies, work].map(creationEvent),
      });
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase3-${name}.png` });
      };

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Activité récente' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Travail' }).last()).toBeVisible();
      await shot('overview-data');
      await page.goto('/#/workspaces?archived=1');
      await expect(page.getByRole('heading', { name: 'Espaces archivés' })).toBeVisible();
      await shot('workspaces');
      await page.getByRole('button', { name: 'Nouvel espace de travail' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot('create-dialog');
      await page.keyboard.press('Escape');
      await page.goto(`/#/workspaces/${electronics.workspace.id}`);
      await expect(page.getByText('Espace créé')).toBeVisible();
      await shot('workspace-page');
      await page.getByRole('button', { name: /Actions de l’espace/ }).click();
      await page.getByRole('menuitem', { name: 'Supprimer' }).click();
      await expect(page.getByRole('combobox', { name: 'Espace de destination' })).toBeVisible();
      await shot('delete-dialog');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Créer', exact: true }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await shot('quick-create');
      await page.keyboard.press('Escape');
      await page.goto('/#/archived');
      await expect(
        page.getByRole('heading', { name: 'Espaces de travail archivés' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
      await shot('archived-collapsed');
    });

    test(`library with data at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const library = libraryState();
      const trashed = seedDocument('ancien-releve.csv', {
        title: 'Ancien relevé de mesures',
        deletedAt: Date.now() - 60 * 60 * 1000,
        content: 'mesure;valeur',
      });
      await seedCore(page, {
        ...library.state,
        documents: [...library.state.documents, trashed],
      });
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase4-${name}.png` });
      };

      await page.goto('/#/library');
      await expect(page.getByRole('status').filter({ hasText: '7 documents' })).toBeVisible();
      await shot('library-list');
      await page.getByRole('button', { name: 'Grille', exact: true }).click();
      await shot('library-grid');
      await page.getByRole('button', { name: 'Liste', exact: true }).click();
      await page.getByRole('button', { name: 'Filtres' }).click();
      const filters = page.getByRole('dialog', { name: 'Filtres' });
      await filters.getByRole('combobox', { name: 'Format' }).selectOption({ label: 'JSON' });
      const favorites = filters.getByRole('checkbox', { name: 'Favoris uniquement' });
      await favorites.click();
      await expect(favorites).toBeChecked();
      await favorites.click();
      await expect(favorites).not.toBeChecked();
      await filters.getByRole('combobox', { name: 'Espace de travail' }).selectOption({
        label: 'Sans espace de travail',
      });
      await expect(filters.getByRole('combobox', { name: 'Format' })).toHaveValue('json');
      await shot('filters-popover');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('status').filter({ hasText: '2 documents' })).toBeVisible();
      await shot('filters-chips');
      await page.goto(`/#/library?workspace=${library.electronics.workspace.id}`);
      await expect(page.getByRole('button', { name: 'Semestre 1', exact: true })).toBeVisible();
      await shot('library-folders');
      await page
        .getByRole('button', { name: /Actions du document «\sFiche technique NE555\s»/ })
        .click();
      await expect(page.getByRole('menu')).toBeVisible();
      await shot('document-menu');
      await page.getByRole('menuitem', { name: 'Déplacer…' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot('move-dialog');
      await page.keyboard.press('Escape');
      await page
        .getByRole('button', { name: /Actions du document «\sFiche technique NE555\s»/ })
        .click();
      await page.getByRole('menuitem', { name: 'Étiquettes…' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await shot('tags-dialog');
      await page.keyboard.press('Escape');
      await page.goto('/#/library?q=transistor');
      await expect(
        page.getByRole('heading', { name: 'Aucun document ne correspond' }),
      ).toBeVisible();
      await shot('library-no-results');
      await page.goto('/#/library?state=trashed');
      await expect(page.getByRole('link', { name: 'Ancien relevé de mesures' })).toBeVisible();
      await page
        .getByRole('button', { name: /Actions du document «\sAncien relevé de mesures\s»/ })
        .click();
      await page.getByRole('menuitem', { name: 'Supprimer définitivement…' }).click();
      await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible();
      await shot('purge-dialog');
      await page.keyboard.press('Escape');
    });

    test(`documents with data at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const library = libraryState();
      await seedCore(page, library.state);
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase4-${name}.png` });
      };

      await page.goto(`/#/library/${library.documents.pdf.document.id}`);
      await expect(page.getByRole('img', { name: /Page 1 sur 2/ })).toBeVisible();
      await expect(page.getByText('Chargement du PDF…')).toHaveCount(0);
      await shot('document-pdf');
      await page.getByRole('radio', { name: 'Texte extrait' }).click();
      await expect(page.getByText('Brochage', { exact: false }).first()).toBeVisible();
      await shot('document-pdf-text');
      await page.goto(`/#/library/${library.documents.png.document.id}`);
      await expect(page.getByRole('img', { name: /Aperçu de/ })).toBeVisible();
      await shot('document-image');
      await page.goto(`/#/library/${library.documents.csv.document.id}`);
      await expect(page.getByRole('columnheader', { name: 'référence' })).toBeVisible();
      await shot('document-csv');
      await page.goto(`/#/library/${library.documents.json.document.id}`);
      await expect(page.getByText('"composant": "NE555"')).toBeVisible();
      await shot('document-json');
      await page.goto(`/#/library/${library.documents.docx.document.id}`);
      await expect(page.getByText('Les résistances en série s’additionnent.')).toBeVisible();
      await shot('document-docx');
      await page.goto(`/#/library/${library.documents.broken.document.id}`);
      await expect(page.getByText(/JSON invalide/)).toBeVisible();
      await expect(page.getByText('{"composant":')).toBeVisible();
      await shot('document-failed');
      await page.goto('/#/favorites');
      await expect(page.getByRole('link', { name: 'Fiche technique NE555' })).toBeVisible();
      await shot('favorites');
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Activité récente' })).toBeVisible();
      await shot('overview');
    });

    test(`library imports at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase4-${name}.png` });
      };
      await page.goto('/#/library');
      await expect(
        page.getByRole('heading', { name: 'Votre bibliothèque est vide' }),
      ).toBeVisible();
      await shot('library-empty');
      await pickFiles(page, [
        pickedFixture('fiche-ne555.pdf'),
        pickedFixture('cours-electronique.docx'),
        pickedFixture('export-casse.json'),
        { name: 'facture.pdf', failure: 'content_mismatch' },
        { name: 'cle-usb.txt', text: 'mesures', failure: 'unreadable' },
        pickedFixture('fiche-ne555.pdf'),
      ]);
      await emitNativeEvent(page, 'tauri://drag-enter', {
        paths: [],
        position: { x: 600, y: 400 },
      });
      await expect(page.getByText('Déposez vos fichiers pour les importer')).toBeVisible();
      await shot('drop-overlay');
      await emitNativeEvent(page, 'tauri://drag-drop', { paths: [], position: { x: 600, y: 400 } });
      await expect(page.getByRole('heading', { name: 'Import terminé' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Réessayer les fichiers en échec' }),
      ).toBeVisible();
      await shot('import-panel');
    });

    test(`notes at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const notes = notesState();
      await seedCore(page, notes.state);
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase5-${name}.png` });
      };

      await page.goto('/#/notes');
      await expect(page.getByRole('status').filter({ hasText: '4 notes' })).toBeVisible();
      await shot('notes-list');
      await page.goto(`/#/notes/${notes.notes.kirchhoff.note.id}`);
      await expect(page.getByRole('textbox', { name: 'Contenu de la note' })).toBeVisible();
      await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
      await shot('note-editor');
      await page.getByRole('textbox', { name: 'Contenu de la note' }).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Nouvelle phrase.');
      await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Lien vers une note ou un document…' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Idées de projets' })).toBeVisible();
      await shot('link-picker');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Insérer' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await shot('insert-menu');
      await page.keyboard.press('Escape');
      await page.goto(`/#/notes/${notes.notes.ohm.note.id}`);
      await expect(page.getByRole('link', { name: 'Lois de Kirchhoff' })).toBeVisible();
      await shot('note-backlinks');
      await page.goto('/#/notes');
      await page.getByRole('button', { name: 'Nouvelle note' }).click();
      await expect(page.getByRole('textbox', { name: 'Titre de la note' })).toBeFocused();
      await shot('new-note');
    });

    test(`notes management at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const notes = notesState();
      const lecture = seedTag('Cours');
      const lab = seedTag('TP', 'blue');
      const summary = seedTag('Fiches de révision', 'purple');
      notes.notes.kirchhoff.tagIds = [lecture.id, summary.id];
      notes.notes.ohm.tagIds = [lecture.id];
      const archives = seedFolder(notes.electronics, 'Archives');
      const lectures = seedFolder(notes.electronics, 'Cours');
      const practice = seedFolder(notes.electronics, 'TP', lectures);
      const memo = seedDocument('mesures-tp3.md', {
        content:
          '# Mesures du TP 3\n\nRelevés effectués sur le **montage astable** à NE555.\n\n## Résistances\n\n| Composant | Valeur | Tolérance |\n| --- | --- | --- |\n| R1 | 10 kΩ | 5 % |\n| R2 | 47 kΩ | 5 % |\n\n## À vérifier\n\n- [x] Fréquence d’oscillation\n- [ ] Rapport cyclique\n\n> La période vaut T = 0,693 × (R1 + 2 R2) × C.\n',
      });
      await seedCore(page, {
        ...notes.state,
        tags: [lecture, lab, summary],
        folders: [archives, lectures, practice],
        documents: [...notes.state.documents, memo],
      });
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase5-${name}.png` });
      };

      await page.goto('/#/notes');
      await page.getByRole('button', { name: 'Filtres' }).click();
      await page.getByRole('button', { name: 'Gérer les étiquettes…' }).click();
      const manager = page.getByRole('dialog', { name: 'Étiquettes' });
      await expect(manager.getByText('0 document · 2 notes')).toBeVisible();
      await shot('tag-manager');
      await manager.getByRole('button', { name: /^Supprimer\s«\sCours\s»$/ }).click();
      await shot('tag-delete');
      await manager.getByRole('button', { name: 'Annuler' }).click();
      await manager.getByRole('button', { name: /^Renommer\s«\sTP\s»$/ }).click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('Cours');
      await page.keyboard.press('Enter');
      await expect(manager.getByText('Une étiquette porte déjà ce nom.')).toBeVisible();
      await shot('tag-rename-error');
      await page.keyboard.press('Escape');

      await page.goto(`/#/notes?workspace=${notes.electronics.workspace.id}`);
      await page.getByRole('button', { name: /^Actions du dossier\s«\sCours\s»$/ }).click();
      await page.getByRole('menuitem', { name: 'Déplacer…' }).click();
      await expect(page.getByRole('dialog', { name: /^Déplacer le dossier/ })).toBeVisible();
      await shot('folder-move');
      await page.keyboard.press('Escape');

      await page.goto(`/#/library/${memo.document.id}`);
      await expect(
        page
          .getByRole('region', { name: 'Aperçu' })
          .getByRole('heading', { name: 'Mesures du TP 3' }),
      ).toBeVisible();
      await shot('markdown-preview');

      // The banners of the editor: a failed save, then a note saved elsewhere.
      await page.goto(`/#/notes/${notes.notes.ohm.note.id}`);
      await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
      await failNextCommand(page, 'notes_save', 'io');
      await page.getByRole('textbox', { name: 'Contenu de la note' }).click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Puissance : P = U × I.');
      await expect(page.getByRole('alert').filter({ hasText: 'Réessayer' })).toBeVisible();
      await shot('save-failed');
      await page.getByRole('button', { name: 'Réessayer' }).click();
      await expect(page.getByText('Enregistré', { exact: true })).toBeVisible();
      await saveNoteElsewhere(page, notes.notes.ohm.note.id, 'Version d’une autre fenêtre.');
      await page.keyboard.type(' Fin.');
      await expect(page.getByRole('alert').filter({ hasText: 'modifiée ailleurs' })).toBeVisible();
      await shot('save-conflict');
    });

    test(`search at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const seeds = searchState();
      const minute = 60 * 1000;
      await seedCore(page, {
        ...seeds.state,
        searchHistory: [
          { id: 'h3', query: 'interruptions', searchedAt: Date.now() - 5 * minute },
          { id: 'h2', query: 'notes sur la sécurité', searchedAt: Date.now() - 60 * minute },
          { id: 'h1', query: '"montage astable" -pdf', searchedAt: Date.now() - 600 * minute },
        ],
      });
      const shot = async (name: string) => {
        await waitForFonts(page);
        await page.mouse.move(0, viewport.height - 1);
        await page.screenshot({ path: `visual-audit/${size}/phase6-${name}.png` });
      };
      const palette = page.getByRole('dialog', { name: 'Rechercher dans ARCHIVE' });

      await page.goto('/#/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.keyboard.press('Control+k');
      await expect(palette.getByRole('option', { name: 'interruptions' })).toBeVisible();
      await shot('palette-recent');
      await page.keyboard.type('astable');
      await expect(palette.getByRole('option', { name: /Voir les 3 résultats/ })).toBeVisible();
      await shot('palette-results');
      await page.keyboard.press('Control+a');
      await page.keyboard.type('notes sur la sécurité');
      await expect(palette.getByRole('option', { name: /^Sécurité électrique/ })).toBeVisible();
      await shot('palette-recognized');
      await page.keyboard.press('Escape');

      await page.goto('/#/search');
      await expect(page.getByRole('region', { name: 'Recherches récentes' })).toBeVisible();
      await shot('page-empty');
      await page.goto('/#/search?q=interruptions');
      await expect(page.getByRole('status').filter({ hasText: /^2 résultats$/ })).toBeVisible();
      await shot('page-results');
      await page.goto(`/#/search?q=${encodeURIComponent('notes modifiées ces 7 derniers jours')}`);
      await expect(page.getByRole('status').filter({ hasText: /^2 résultats$/ })).toBeVisible();
      await shot('page-recognized');
      await page.goto(
        `/#/search?q=montage&workspace=${seeds.electronics.workspace.id}&period=30&sort=date`,
      );
      await expect(page.getByRole('status').filter({ hasText: /^3 résultats$/ })).toBeVisible();
      await page.getByRole('button', { name: /^Filtres/ }).click();
      await expect(page.getByRole('dialog', { name: 'Filtres' })).toBeVisible();
      await shot('page-filters');
      await page.keyboard.press('Escape');
      await page.goto(`/#/search?tag=${seeds.tags.project.id}`);
      await expect(page.getByRole('status').filter({ hasText: /^3 résultats$/ })).toBeVisible();
      await shot('page-tag');
      await page.goto('/#/search?q=transistor%20bipolaire');
      await expect(page.getByRole('heading', { name: 'Aucun résultat' })).toBeVisible();
      await shot('page-no-results');
    });

    test(`first run at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Commencez par importer vos documents' }),
      ).toBeVisible();
      await waitForFonts(page);
      await page.mouse.move(0, viewport.height - 1);
      await page.screenshot({ path: `visual-audit/${size}/phase3-first-run.png`, fullPage: true });
    });

    test(`safe mode at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        sessionStorage.setItem('archive-e2e-scenario', 'safe-mode');
      });
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'ARCHIVE n’a pas pu ouvrir vos données' }),
      ).toBeVisible();
      await waitForFonts(page);
      await page.screenshot({ path: `visual-audit/${size}/safe-mode.png` });
    });
  }
});
