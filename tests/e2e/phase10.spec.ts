import { coreState, expect, expectNoViolations, failNextCommand, seedCore, test } from './fixtures';
import { seedDocument, seedNote, seedWorkspace } from '../../src/test/coreDouble';

/** Noon UTC: the same day in every time zone the tests may run in. */
const CREATED_AT = Date.UTC(2026, 10, 20, 12, 0);

function knowledgeBase() {
  const electronics = seedWorkspace('Électronique', { color: 'blue', icon: 'cpu' });
  return {
    workspaces: [electronics],
    documents: [seedDocument('cours-ne555.pdf', { workspaceId: electronics.workspace.id })],
    notes: [seedNote('Montage astable')],
  };
}

test.describe('Backups', () => {
  test('creates, verifies and restores a backup after a confirmation, and passes the accessibility audit', async ({
    page,
  }) => {
    await seedCore(page, knowledgeBase());
    await page.goto('/#/settings/storage');
    await expect(page.getByText('Aucune sauvegarde pour l’instant.')).toBeVisible();
    await expectNoViolations(page, 'storage settings without backup');

    // A write that fails is reported, and nothing is added to the history.
    await failNextCommand(page, 'backup_create', 'io');
    await page.getByRole('button', { name: 'Créer une sauvegarde' }).click();
    await expect(
      page.getByText('Un fichier ou un dossier est inaccessible.').first(),
    ).toBeVisible();
    expect((await coreState(page)).backups).toEqual([]);

    await page.getByRole('button', { name: 'Créer une sauvegarde' }).click();
    await expect(page.getByText('Sauvegarde créée.').first()).toBeVisible();
    const history = page.getByRole('list', { name: 'Historique' });
    const item = history.getByRole('listitem');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('1 document · 1 note · 1 espace · 0 relation');
    await expect(item.getByText('Non vérifiée')).toBeVisible();

    await item.getByRole('button', { name: 'Vérifier' }).click();
    await expect(page.getByText(/^Sauvegarde intacte/).first()).toBeVisible();
    await expect(item.getByText('Vérifiée')).toBeVisible();
    await expectNoViolations(page, 'storage settings with a verified backup');

    // Cancelled: nothing is prepared.
    await item.getByRole('button', { name: 'Restaurer…' }).click();
    const dialog = page.getByRole('dialog', { name: /Restaurer la sauvegarde du/ });
    await expect(dialog).toContainText('1 document · 1 note · 1 espace · 0 relation');
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeFocused();
    await expectNoViolations(page, 'restore confirmation');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect((await coreState(page)).restoredBackup).toBeNull();

    await item.getByRole('button', { name: 'Restaurer…' }).click();
    await dialog.getByRole('button', { name: 'Restaurer et redémarrer' }).click();
    const [backup] = (await coreState(page)).backups;
    await expect.poll(async () => (await coreState(page)).restoredBackup).toBe(backup?.id);
  });

  test('reports a damaged backup and a file that is not one, and keeps the history after a reload', async ({
    page,
  }) => {
    const base = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      createdAt: CREATED_AT,
      sizeBytes: 3_145_728,
      schemaVersion: 5,
      appVersion: '0.1.0',
      contents: {
        documents: 12,
        notes: 1,
        workspaces: 2,
        tags: 3,
        relations: 4,
        conversations: 1,
        files: 12,
      },
      verifiedAt: null,
      valid: null,
      available: true,
    };
    const damaged = { ...base, path: 'C:\\Sauvegardes\\ARCHIVE-sauvegarde-2026-11-20-1200.zip' };
    await seedCore(page, {
      backups: [damaged],
      backupChecks: {
        [damaged.id]: {
          summary: {
            appVersion: base.appVersion,
            schemaVersion: base.schemaVersion,
            createdAt: base.createdAt,
            contents: base.contents,
            sizeBytes: base.sizeBytes,
          },
          problems: [
            { kind: 'altered', name: 'files/e7/7c9e6679-7425-40de-944b-e07fc1f90ae7.pdf' },
          ],
        },
      },
      backupPicks: [
        {
          path: 'D:\\vacances.zip',
          check: { summary: null, problems: [{ kind: 'not_a_backup' }] },
        },
      ],
    });
    await page.goto('/#/settings/storage');
    const item = page.getByRole('list', { name: 'Historique' }).getByRole('listitem');
    await expect(item).toContainText('12 documents · 1 note · 2 espaces · 4 relations');

    await item.getByRole('button', { name: 'Vérifier' }).click();
    const problems = page.getByRole('alert').filter({ hasText: /ne peut pas être restauré/ });
    await expect(problems).toContainText('La sauvegarde du 20 novembre 2026');
    await expect(problems).toContainText('Un élément a été modifié depuis la sauvegarde');
    await expect(item.getByText('Altérée')).toBeVisible();
    await expect(item.getByRole('button', { name: 'Restaurer…' })).toBeDisabled();
    await expectNoViolations(page, 'damaged backup');

    await page.getByRole('button', { name: 'Vérifier un fichier de sauvegarde…' }).click();
    await expect(problems).toContainText('Ce fichier ne peut pas être restauré');
    await expect(problems).toContainText('Ce fichier n’est pas une sauvegarde d’ARCHIVE.');
    await expect(item).toHaveCount(1);

    // The history is kept by the core: a reload shows the same.
    await page.reload();
    await expect(item.getByText('Altérée')).toBeVisible();
  });
});
