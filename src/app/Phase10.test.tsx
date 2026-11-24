import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedDocument, seedNote, seedWorkspace, type CoreDoubleState } from '@/test/coreDouble';
import { useToastStore } from '@/stores/toasts';
import { MOCK_READY_STATUS, mockNativeRuntime, renderApp } from '@/test/render';
import type { BackupCheck } from '@/types/bindings/BackupCheck';
import type { BackupRecord } from '@/types/bindings/BackupRecord';

/** Noon UTC: the same day in every time zone the tests may run in. */
const CREATED_AT = Date.UTC(2026, 10, 20, 12, 0);

function record(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id: crypto.randomUUID(),
    path: 'C:\\Users\\Alice\\Documents\\ARCHIVE-sauvegarde-2026-11-20-1200.zip',
    createdAt: CREATED_AT,
    sizeBytes: 3_145_728,
    schemaVersion: 5,
    appVersion: '0.1.0',
    contents: {
      documents: 12,
      notes: 1,
      workspaces: 2,
      tags: 3,
      relations: 0,
      conversations: 1,
      files: 12,
    },
    verifiedAt: null,
    valid: null,
    available: true,
    ...overrides,
  };
}

function checkOf(backup: BackupRecord, problems: BackupCheck['problems'] = []): BackupCheck {
  return {
    summary: {
      appVersion: backup.appVersion,
      schemaVersion: backup.schemaVersion,
      createdAt: backup.createdAt,
      contents: backup.contents,
      sizeBytes: backup.sizeBytes,
    },
    problems,
  };
}

function itemOf(text: string | RegExp): HTMLElement {
  const history = screen.getByRole('list', { name: 'Historique' });
  const item = within(history)
    .getAllByRole('listitem')
    .find((candidate) =>
      typeof text === 'string'
        ? candidate.textContent.includes(text)
        : text.test(candidate.textContent),
    );
  if (!item) {
    throw new Error(`No backup with ${String(text)}`);
  }
  return item;
}

describe('backups', () => {
  it('creates a backup with its progress and lists what it holds', async () => {
    const electronics = seedWorkspace('Électronique');
    const course = seedDocument('cours-ne555.pdf', { workspaceId: electronics.workspace.id });
    const note = seedNote('Montage astable');
    let finish: (() => void) | undefined;
    const { calls, coreHandlers } = mockNativeRuntime(
      {
        // The core reports each element written; the backup ends when the test says so.
        backup_create: (args) => {
          const channel = args?.onProgress as { onmessage: (event: unknown) => void };
          channel.onmessage({ done: 1, total: 2 });
          return new Promise((resolve) => {
            finish = () => {
              resolve(coreHandlers.backup_create?.(args));
            };
          });
        },
      },
      {
        core: {
          workspaces: [electronics],
          documents: [course],
          notes: [note],
        } satisfies Partial<CoreDoubleState>,
      },
    );
    const { user } = renderApp('/settings/storage');
    expect(await screen.findByText('Aucune sauvegarde pour l’instant.')).toBeInTheDocument();
    expect(screen.getByText(/Les clés API n’y figurent jamais/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer une sauvegarde' }));
    expect(await screen.findByText(/Sauvegarde en cours.*1 \/ 2 éléments/)).toBeInTheDocument();
    finish?.();
    expect(await screen.findByText('Sauvegarde créée.')).toBeInTheDocument();
    expect(screen.queryByText(/Sauvegarde en cours/)).not.toBeInTheDocument();

    const item = itemOf('1 document · 1 note · 1 espace · 0 relation');
    expect(within(item).getByText('Non vérifiée')).toBeInTheDocument();
    expect(within(item).getByText(/ARCHIVE-sauvegarde-.*\.zip$/)).toBeInTheDocument();
    expect(screen.getByText(/^Dernière sauvegarde/)).toBeInTheDocument();
    expect(screen.getByText('Emplacement : C:\\Users\\Alice\\Documents')).toBeInTheDocument();
    expect(calls.filter((call) => call.command === 'backup_create')).toHaveLength(1);
  });

  it('verifies backups and says what is wrong with an altered one', async () => {
    const intact = record({ path: 'C:\\Sauvegardes\\intacte.zip' });
    const altered = record({
      path: 'C:\\Sauvegardes\\modifiee.zip',
      createdAt: CREATED_AT - 86_400_000,
    });
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          backups: [intact, altered],
          backupChecks: {
            [altered.id]: checkOf(altered, [
              { kind: 'altered', name: 'files/3f/0a1b2c3d-0000-4000-8000-00000000003f.pdf' },
            ]),
          },
        },
      },
    );
    const { user } = renderApp('/settings/storage');
    await screen.findByRole('list', { name: 'Historique' });

    await user.click(within(itemOf('modifiee.zip')).getByRole('button', { name: 'Vérifier' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /La sauvegarde du 19 novembre 2026.*ne peut pas être restaurée/,
    );
    expect(alert).toHaveTextContent(
      'Un élément a été modifié depuis la sauvegarde : files/3f/0a1b2c3d-0000-4000-8000-00000000003f.pdf.',
    );
    await waitFor(() => {
      expect(within(itemOf('modifiee.zip')).getByText('Altérée')).toBeInTheDocument();
    });
    expect(
      within(itemOf('modifiee.zip')).getByRole('button', { name: 'Restaurer…' }),
    ).toBeDisabled();
    expect(core.backups.find((backup) => backup.id === altered.id)?.valid).toBe(false);

    await user.click(within(itemOf('intacte.zip')).getByRole('button', { name: 'Vérifier' }));
    expect(
      await screen.findByText(/Sauvegarde intacte.*chaque fichier correspond à son empreinte/),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(itemOf('intacte.zip')).getByText('Vérifiée')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores a backup only after a confirmation that shows its date and contents', async () => {
    const backup = record({ valid: true, verifiedAt: CREATED_AT });
    const { calls, core } = mockNativeRuntime({}, { core: { backups: [backup] } });
    const { user } = renderApp('/settings/storage');
    await screen.findByRole('list', { name: 'Historique' });

    await user.click(within(itemOf('Vérifiée')).getByRole('button', { name: 'Restaurer…' }));
    let dialog = await screen.findByRole('dialog', {
      name: /Restaurer la sauvegarde du 20 novembre 2026/,
    });
    expect(dialog).toHaveTextContent('12 documents · 1 note · 2 espaces · 0 relation');
    expect(dialog).toHaveTextContent('vos données actuelles sont gardées');
    // The safe choice has the focus.
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(calls.some((call) => call.command === 'backup_restore')).toBe(false);

    await user.click(within(itemOf('Vérifiée')).getByRole('button', { name: 'Restaurer…' }));
    dialog = await screen.findByRole('dialog', { name: /Restaurer la sauvegarde/ });
    await user.click(within(dialog).getByRole('button', { name: 'Restaurer et redémarrer' }));
    // The core prepares the restoration and restarts ARCHIVE: the interface waits for it.
    await waitFor(() => {
      expect(core.restoredBackup).toBe(backup.id);
    });
    expect(
      calls.filter((call) => call.command === 'backup_restore').map((call) => call.args?.id),
    ).toEqual([backup.id]);
  });

  it('does not restore a backup whose verification fails at the last moment', async () => {
    const backup = record();
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          backups: [backup],
          backupChecks: { [backup.id]: checkOf(backup, [{ kind: 'database_damaged' }]) },
        },
      },
    );
    const { user } = renderApp('/settings/storage');
    await screen.findByRole('list', { name: 'Historique' });
    await user.click(within(itemOf('Non vérifiée')).getByRole('button', { name: 'Restaurer…' }));
    const dialog = await screen.findByRole('dialog', { name: /Restaurer la sauvegarde/ });
    await user.click(within(dialog).getByRole('button', { name: 'Restaurer et redémarrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sa base de données est endommagée.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(core.restoredBackup).toBeNull();
  });

  it('checks a backup file made elsewhere and adds it to the history', async () => {
    const elsewhere = record({ path: 'D:\\Clé USB\\ARCHIVE-sauvegarde-2026-11-20-1200.zip' });
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          backupPicks: [
            { path: elsewhere.path, check: checkOf(elsewhere) },
            {
              path: 'D:\\Clé USB\\vacances.zip',
              check: { summary: null, problems: [{ kind: 'not_a_backup' }] },
            },
          ],
        },
      },
    );
    const { user } = renderApp('/settings/storage');
    await screen.findByText('Aucune sauvegarde pour l’instant.');

    await user.click(screen.getByRole('button', { name: 'Vérifier un fichier de sauvegarde…' }));
    expect(await screen.findByText(/Sauvegarde intacte/)).toBeInTheDocument();
    expect(within(await screen.findByRole('list', { name: 'Historique' })).getByText('Vérifiée'));
    expect(itemOf('D:\\Clé USB\\ARCHIVE-sauvegarde-2026-11-20-1200.zip')).toBeInTheDocument();

    // A ZIP that is not a backup is reported, and not remembered.
    await user.click(screen.getByRole('button', { name: 'Vérifier un fichier de sauvegarde…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce fichier n’est pas une sauvegarde d’ARCHIVE.',
    );
    expect(core.backups).toHaveLength(1);
  });

  it('shows a backup in its folder, and forgets it without touching the file', async () => {
    const backup = record();
    const { calls, core } = mockNativeRuntime({}, { core: { backups: [backup] } });
    const { user } = renderApp('/settings/storage');
    await screen.findByRole('list', { name: 'Historique' });

    await user.click(
      within(itemOf('Non vérifiée')).getByRole('button', { name: 'Afficher dans le dossier' }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.command === 'backup_reveal')).toBe(true);
    });
    await user.click(
      within(itemOf('Non vérifiée')).getByRole('button', { name: 'Retirer de l’historique' }),
    );
    expect(
      await screen.findByText('Retirée de l’historique. Le fichier n’a pas été touché.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Aucune sauvegarde pour l’instant.')).toBeInTheDocument();
    expect(core.backups).toEqual([]);
  });

  it('cannot verify or restore a backup whose file is gone', async () => {
    mockNativeRuntime({}, { core: { backups: [record({ available: false })] } });
    renderApp('/settings/storage');
    await screen.findByRole('list', { name: 'Historique' });
    const item = itemOf('Introuvable');
    expect(within(item).getByRole('button', { name: 'Vérifier' })).toBeDisabled();
    expect(within(item).getByRole('button', { name: 'Restaurer…' })).toBeDisabled();
    expect(within(item).getByRole('button', { name: 'Afficher dans le dossier' })).toBeDisabled();
    // It can still leave the history.
    expect(within(item).getByRole('button', { name: 'Retirer de l’historique' })).toBeEnabled();
  });
});

describe('restoration at start', () => {
  const KEPT =
    'C:\\Users\\Alice\\AppData\\Local\\io.github.lebendo91.archive\\backups\\before-restore-1';

  it('says once that the backup was restored and where the replaced data is', async () => {
    mockNativeRuntime({
      app_status: () => ({
        ...MOCK_READY_STATUS,
        restore: { applied: true, backupCreatedAt: CREATED_AT, keptIn: KEPT },
      }),
    });
    const { user } = renderApp('/');
    const notice = await screen.findByText(/La sauvegarde du 20 novembre 2026.*a été restaurée/);
    expect(notice).toHaveTextContent(`Les données remplacées sont gardées dans ${KEPT}.`);
    await user.click(screen.getByRole('link', { name: 'Paramètres' }));
    await screen.findByRole('heading', { level: 1, name: 'Général' });
    // Told once: moving through the application does not tell it again.
    expect(
      useToastStore.getState().toasts.filter((item) => item.title.includes('a été restaurée')),
    ).toHaveLength(1);
  });

  it('says when a restoration could not be applied and the data stayed as it was', async () => {
    mockNativeRuntime({
      app_status: () => ({
        ...MOCK_READY_STATUS,
        restore: { applied: false, backupCreatedAt: CREATED_AT + 1, keptIn: null },
      }),
    });
    renderApp('/');
    expect(
      await screen.findByText(
        'La restauration n’a pas pu être appliquée : vos données actuelles sont inchangées.',
      ),
    ).toBeInTheDocument();
  });

  it('says where the data is when a failed restoration could not put everything back', async () => {
    mockNativeRuntime({
      app_status: () => ({
        ...MOCK_READY_STATUS,
        restore: { applied: false, backupCreatedAt: CREATED_AT + 2, keptIn: KEPT },
      }),
    });
    renderApp('/');
    expect(
      await screen.findByText(/rien n’a été supprimé, elle est gardée dans/),
    ).toHaveTextContent(KEPT);
  });
});
