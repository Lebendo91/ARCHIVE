import { expect, expectNoViolations, MOCK_DATA_DIR, test } from './fixtures';

test.describe('settings persisted by the native core', () => {
  test('switches the interface to English and keeps it after a reload', async ({ page }) => {
    await page.goto('/#/settings/general');
    // The choice is shown once the native core has saved it: click, then wait for the new state.
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('General');
    await expect(page.getByText('Interface language updated.', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('General');
    await page.getByRole('radio', { name: 'Français' }).click();
    await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Général');
  });

  test('shows the storage locations, sizes and integrity check, without accessibility violation', async ({
    page,
  }) => {
    await page.goto('/#/settings/storage');
    await expect(page.getByText(MOCK_DATA_DIR, { exact: true })).toBeVisible();
    await expect(page.getByText('100 Ko', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vérifier l’intégrité' }).click();
    await expect(page.getByText('Aucun problème détecté.')).toBeVisible();
    await expectNoViolations(page, 'storage settings');
  });

  test('shows the space used by ARCHIVE in the sidebar', async ({ page }) => {
    await page.goto('/');
    const indicator = page.getByRole('link', { name: /Stockage local/ });
    await expect(indicator).toContainText('100 Ko utilisés');
    await indicator.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stockage');
  });
});

test.describe('safe mode', () => {
  test('explains why the data cannot be opened, accessibly', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('archive-e2e-scenario', 'safe-mode');
    });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'ARCHIVE n’a pas pu ouvrir vos données' }),
    ).toBeVisible();
    await expect(page.getByText('Vos données n’ont pas été modifiées.')).toBeVisible();
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText('La base de données est toujours inaccessible.')).toBeVisible();
    await expectNoViolations(page, 'safe mode');
  });
});
