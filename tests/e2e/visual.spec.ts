import { creationEvent, seedWorkspace } from '../../src/test/coreDouble';
import { expect, ROUTES, seedCore, test, waitForFonts } from './fixtures';

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

      await page.getByRole('button', { name: /Rechercher dans ARCHIVE/ }).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.screenshot({
        path: `visual-audit/${size}/state-search-unavailable.png`,
      });

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

    test(`first run at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Commencez par créer un espace de travail' }),
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
