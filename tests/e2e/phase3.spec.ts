import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { creationEvent, seedWorkspace } from '../../src/test/coreDouble';
import { expect, seedCore, test, waitForFonts } from './fixtures';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page, context: string): Promise<void> {
  await waitForFonts(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(summary, context).toEqual([]);
}

/** Accessible names keep the non-breaking spaces of French typography: `\s` matches them. */
const actionsOf = (name: string) => new RegExp(`Actions de l’espace «\\s${name}\\s»`);

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Navigation principale' });
}

test.describe('workspaces', () => {
  test('creates a workspace with the keyboard only, and keeps it after a reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vue d’ensemble');
    await page.keyboard.press('Control+Shift+N');
    const dialog = page.getByRole('dialog', { name: 'Nouvel espace de travail' });
    await expect(dialog.getByRole('textbox', { name: 'Nom' })).toBeFocused();
    await page.keyboard.type('Électronique');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Cours, projets et fiches de composants.');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'Bleu' })).toBeChecked();
    await page.keyboard.press('Tab');
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(dialog.getByRole('radio', { name: 'Électronique' })).toBeChecked();
    await dialog.getByRole('textbox', { name: 'Nom' }).press('Enter');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Électronique');
    await expect(page.getByText('Espace « Électronique » créé.', { exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Électronique' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page).toHaveTitle('Électronique — ARCHIVE');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Électronique');
    await expect(page.getByText('Cours, projets et fiches de composants.')).toBeVisible();
    await sidebar(page).getByRole('link', { name: 'Vue d’ensemble' }).click();
    const stats = page.getByRole('region', { name: 'Votre base de connaissances' });
    await expect(stats.getByRole('definition').nth(2)).toHaveText('1');
    await expect(
      page.getByRole('heading', { name: 'Commencez par importer vos documents' }),
    ).toBeVisible();
  });

  test('edits, archives, restores and deletes a workspace', async ({ page }) => {
    const workspace = seedWorkspace('Brouillon', { icon: 'lightbulb' });
    await seedCore(page, { workspaces: [workspace], events: [creationEvent(workspace)] });
    await page.goto('/#/workspaces');

    await page.getByRole('button', { name: actionsOf('Brouillon') }).click();
    await page.getByRole('menuitem', { name: 'Modifier' }).click();
    const edit = page.getByRole('dialog', { name: 'Modifier l’espace de travail' });
    await edit.getByRole('textbox', { name: 'Nom' }).fill('Idées');
    await edit.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Modifications enregistrées.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Idées' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: actionsOf('Idées') })).toBeFocused();

    await page.getByRole('button', { name: actionsOf('Idées') }).click();
    await page.getByRole('menuitem', { name: 'Archiver' }).click();
    await expect(page.getByText('Espace « Idées » archivé.', { exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Idées' })).toHaveCount(0);
    await expect(page.getByRole('main')).toBeFocused();

    await sidebar(page).getByRole('link', { name: 'Archives' }).click();
    await expect(page.getByRole('heading', { name: 'Espaces de travail archivés' })).toBeVisible();
    await page.getByRole('button', { name: actionsOf('Idées') }).click();
    await page.getByRole('menuitem', { name: 'Restaurer' }).click();
    await expect(page.getByText('Espace « Idées » restauré.', { exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: 'Idées' })).toBeVisible();

    await sidebar(page).getByRole('link', { name: 'Idées' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Idées');
    await page.getByRole('button', { name: actionsOf('Idées') }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Cet espace est vide. Sa suppression est définitive.');
    await expect(confirm.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Supprimer l’espace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espaces de travail');
    await expect(page.getByText('Espace « Idées » supprimé.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Aucun espace de travail pour l’instant' }),
    ).toBeVisible();
  });

  test('moves the content of a deleted workspace into the chosen one', async ({ page }) => {
    const source = seedWorkspace('Électronique', {
      icon: 'cpu',
      counts: { documents: 12, notes: 5, folders: 3 },
    });
    const studies = seedWorkspace('Études', { icon: 'graduation-cap', color: 'blue' });
    const projects = seedWorkspace('Projets', { icon: 'rocket', color: 'purple' });
    await seedCore(page, { workspaces: [source, studies, projects] });
    await page.goto(`/#/workspaces/${source.workspace.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Électronique');

    await page.getByRole('button', { name: actionsOf('Électronique') }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Cet espace contient 12 documents, 5 notes et 3 dossiers.');
    await expect(
      dialog.getByRole('radio', { name: /Le déplacer vers un autre espace/ }),
    ).toBeChecked();
    await expectNoViolations(page, 'deletion dialog');
    await dialog.getByRole('combobox', { name: 'Espace de destination' }).selectOption('Projets');
    await dialog.getByRole('button', { name: 'Supprimer l’espace' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espaces de travail');
    await expect(
      page.getByText('Son contenu a été déplacé dans « Projets », dossier « Électronique ».', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByText('12 documents · 5 notes · 4 dossiers')).toBeVisible();
  });
});

test.describe('accessibility of Phase 3 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test.beforeEach(async ({ page }) => {
    const electronics = seedWorkspace('Électronique', {
      icon: 'cpu',
      description: 'Cours, projets et fiches de composants.',
      counts: { documents: 12, notes: 5, folders: 3 },
    });
    const old = seedWorkspace('Ancien projet', { icon: 'rocket', isArchived: true });
    await seedCore(page, {
      workspaces: [electronics, old],
      events: [creationEvent(old), creationEvent(electronics)],
    });
  });

  test('overview, workspaces, workspace page and archives', async ({ page }) => {
    for (const [path, title] of [
      ['/', 'Vue d’ensemble'],
      ['/workspaces?archived=1', 'Espaces de travail'],
      ['/archived', 'Archives'],
    ] as const) {
      await page.goto(`/#${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByText('Électronique').first()).toBeVisible();
      await expectNoViolations(page, path);
    }
    await sidebar(page).getByRole('link', { name: 'Électronique' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Électronique');
    await expectNoViolations(page, 'workspace page');
  });

  test('creation dialog with an error, Quick Create menu and actions menu', async ({ page }) => {
    await page.goto('/#/workspaces');
    await page.getByRole('button', { name: 'Nouvel espace de travail' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Créer l’espace' }).click();
    await expect(dialog.getByText('Le nom est obligatoire.')).toBeVisible();
    await expectNoViolations(page, 'creation dialog');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoViolations(page, 'Quick Create menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: actionsOf('Électronique') }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoViolations(page, 'actions menu');
  });

  test('collapsed sidebar with workspace shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
    await expect(sidebar(page).getByRole('link', { name: 'Électronique' })).toBeVisible();
    await expectNoViolations(page, 'collapsed sidebar');
  });
});
