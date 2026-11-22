import { expect, expectNoViolations, ROUTES, test } from './fixtures';

test.describe('accessibility (axe-core, WCAG 2.2 A/AA)', () => {
  for (const route of ROUTES) {
    test(`${route.name} has no violation`, async ({ page }) => {
      await page.goto(`/#${route.path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.title);
      await expectNoViolations(page, route.path);
    });
  }

  test('collapsed sidebar has no violation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
    await expectNoViolations(page, 'collapsed sidebar');
  });

  test('open profile menu has no violation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu du profil' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoViolations(page, 'profile menu');
  });

  test('component gallery and open dialog have no violation', async ({ page }) => {
    await page.goto('/#/dev/ui');
    await expectNoViolations(page, 'gallery');
    await page.getByRole('button', { name: 'Ouvrir une fenêtre' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page, 'dialog');
  });
});
