import { expect, MOCK_APP_INFO, ROUTES, test, waitForFonts } from './fixtures';

test.describe('navigation', () => {
  test('reaches every module from the sidebar and keeps the window title in sync', async ({
    page,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    const links: readonly [string, string][] = [
      ['Bibliothèque', 'Bibliothèque'],
      ['Notes', 'Notes'],
      ['Graphe de connaissances', 'Graphe de connaissances'],
      ['Chronologie', 'Chronologie'],
      ['Assistant IA', 'Assistant IA'],
      ['Tous les espaces', 'Espaces de travail'],
      ['Favoris', 'Favoris'],
      ['Récemment ouverts', 'Récemment ouverts'],
      ['Archives', 'Archives'],
      ['Paramètres', 'Général'],
      ['Aide', 'Aide'],
      ['Vue d’ensemble', 'Vue d’ensemble'],
    ];
    for (const [label, title] of links) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page).toHaveTitle(`${title} — ARCHIVE`);
    }
    await expect(nav.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('opens every route directly', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(`/#${route.path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.title);
    }
  });

  test('collapses the sidebar to icons with tooltips and restores it after a reload', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Replier la barre latérale' }).click();
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(64);
    await page.getByRole('link', { name: 'Bibliothèque' }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Bibliothèque');
    await page.reload();
    await expect(page.locator('aside')).toHaveAttribute('data-collapsed', 'true');
    await page.getByRole('button', { name: 'Déplier la barre latérale' }).click();
    await expect.poll(async () => (await page.locator('aside').boundingBox())?.width).toBe(248);
  });

  test('opens the settings with Ctrl+,', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vue d’ensemble');
    await page.keyboard.press('Control+Comma');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Général');
  });

  test('shows the build information of the native runtime in About', async ({ page }) => {
    await page.goto('/#/settings/about');
    await expect(page.getByText(MOCK_APP_INFO.commit)).toBeVisible();
    await expect(page.getByText('windows · x86_64')).toBeVisible();
  });

  test('offers keyboard navigation with a visible focus indicator', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vue d’ensemble');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'Aller au contenu principal' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus-visible');
    await expect(focused).toHaveCount(1);
    const outline = await focused.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outline).toBe('solid');
  });

  test('closes menus and dialogs with Escape', async ({ page }) => {
    await page.goto('/#/dev/ui');
    await page.getByRole('button', { name: 'Ouvrir une fenêtre' }).click();
    await expect(page.getByRole('dialog', { name: 'Renommer le document' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu du profil' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('shows notifications', async ({ page }) => {
    await page.goto('/#/dev/ui');
    await page.getByRole('button', { name: 'Succès' }).click();
    await expect(page.getByText('Document importé', { exact: true })).toBeVisible();
  });
});

test.describe('layout', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1100, height: 700 },
  ]) {
    test(`has no horizontal overflow at ${String(viewport.width)}×${String(viewport.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      for (const route of ROUTES) {
        await page.goto(`/#${route.path}`);
        await waitForFonts(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, route.path).toBe(false);
      }
    });
  }

  test('scrolls instead of overlapping below the minimum window size', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.goto('/');
    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(size.width).toBeGreaterThanOrEqual(1100);
    expect(size.height).toBeGreaterThanOrEqual(700);
  });
});
