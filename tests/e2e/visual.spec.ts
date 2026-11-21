import { expect, ROUTES, test, waitForFonts } from './fixtures';

/**
 * Screenshots for the visual audit (specification §20). They are written to test-results/screenshots and
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
        await page.screenshot({ path: `test-results/screenshots/${size}/${route.name}.png` });
      }
    });

    test(`interactive states at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await waitForFonts(page);
      await page.getByRole('button', { name: 'Menu du profil' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.screenshot({ path: `test-results/screenshots/${size}/state-profile-menu.png` });
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
      await page.getByRole('link', { name: 'Bibliothèque' }).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/${size}/state-sidebar-collapsed.png`,
      });
      await page.getByRole('button', { name: 'Déplier la barre latérale' }).click();

      await page.getByRole('button', { name: /Rechercher dans ARCHIVE/ }).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.screenshot({
        path: `test-results/screenshots/${size}/state-search-unavailable.png`,
      });

      await page.goto('/#/dev/ui');
      await waitForFonts(page);
      await page.getByRole('button', { name: 'Confirmation destructive' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({ path: `test-results/screenshots/${size}/state-confirm-dialog.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Succès' }).click();
      await page.getByRole('button', { name: 'Erreur' }).click();
      await expect(page.getByText('Import impossible', { exact: true })).toBeVisible();
      await page.screenshot({ path: `test-results/screenshots/${size}/state-toasts.png` });
    });
  }
});
