import { emit } from '@tauri-apps/api/event';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  seedDocument,
  seedFolder,
  seedTag,
  seedWorkspace,
  type CoreDoubleFile,
} from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

/** Accessible names keep their non-breaking spaces (French typography): `\s` matches them. */
function quoted(text: string): RegExp {
  return new RegExp(`«\\s${text}\\s»`);
}

function actionsOf(title: string) {
  return screen.findByRole('button', { name: new RegExp(`Actions du document «\\s${title}\\s»`) });
}

function lastCall(calls: { command: string; args: unknown }[], command: string) {
  return calls.filter((call) => call.command === command).at(-1)?.args;
}

function importPanel() {
  return screen.findByRole('region', { name: 'Import terminé' });
}

const NOTES: CoreDoubleFile = {
  name: 'notes-de-cours.txt',
  text: 'Résumé : le condensateur se charge à travers R1 et R2.\n',
};

describe('import', () => {
  it('imports the files chosen in the picker and reports each outcome', async () => {
    const { calls, core } = mockNativeRuntime(
      {},
      {
        core: {
          picks: [
            NOTES,
            { name: 'composants.csv', text: 'référence;valeur\nR1;10k\n' },
            { name: 'copie des notes.txt', text: NOTES.text },
            { name: 'facture.pdf', failure: 'content_mismatch' },
            { name: 'brochage.json', text: '{"composant": ' },
          ],
        },
      },
    );
    const { user } = renderApp('/library');
    await user.click(await screen.findByRole('button', { name: 'Importer des documents' }));

    const panel = await importPanel();
    expect(within(panel).getByText('3 importés, 1 doublon et 1 échec')).toBeInTheDocument();
    expect(
      within(panel).getByText('Le contenu ne correspond pas à l’extension du fichier'),
    ).toBeInTheDocument();
    // An invalid JSON is kept, and the panel says its text was not extracted.
    expect(within(panel).getByText('Importé, mais sans texte extrait')).toBeInTheDocument();
    const duplicate = within(panel).getByRole('link', { name: /Déjà dans votre bibliothèque/ });
    expect(duplicate).toHaveTextContent(quoted('notes-de-cours'));
    // A file whose content does not match its extension cannot succeed when retried.
    expect(
      within(panel).queryByRole('button', { name: 'Réessayer les fichiers en échec' }),
    ).not.toBeInTheDocument();
    expect(lastCall(calls, 'documents_import_pick')).toMatchObject({ target: {} });

    expect(await screen.findByRole('link', { name: 'notes-de-cours' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'composants' })).toBeInTheDocument();
    expect(screen.getByText('3 documents')).toBeInTheDocument();
    expect(core.documents.map((entry) => entry.document.originalFilename)).toEqual([
      'notes-de-cours.txt',
      'composants.csv',
      'brochage.json',
    ]);

    await user.click(within(panel).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('region', { name: 'Import terminé' })).not.toBeInTheDocument();
  });

  it('imports into the workspace displayed, and retries the files that failed temporarily', async () => {
    const electronics = seedWorkspace('Électronique');
    const { calls, core } = mockNativeRuntime(
      {},
      {
        core: {
          workspaces: [electronics],
          picks: [NOTES, { name: 'mesures.csv', text: 'a;b\n1;2\n', failure: 'unreadable' }],
        },
      },
    );
    const { user } = renderApp(`/workspaces/${electronics.workspace.id}`);
    await user.click(await screen.findByRole('button', { name: /Importer un document/ }));

    const panel = await importPanel();
    expect(within(panel).getByText('1 importé et 1 échec')).toBeInTheDocument();
    expect(
      within(panel).getByText('Fichier illisible (droits, verrouillé ou déplacé)'),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'documents_import_pick')).toMatchObject({
      target: { workspaceId: electronics.workspace.id },
    });

    await user.click(
      within(panel).getByRole('button', { name: 'Réessayer les fichiers en échec' }),
    );
    await waitFor(() => {
      expect(within(panel).getByText('1 importé')).toBeInTheDocument();
    });
    expect(lastCall(calls, 'documents_import_retry')).toMatchObject({
      target: { workspaceId: electronics.workspace.id },
    });
    expect(core.documents.map((entry) => entry.document.workspaceId)).toEqual([
      electronics.workspace.id,
      electronics.workspace.id,
    ]);
  });

  it('imports the files dropped on the window, into the workspace filtered in the Library', async () => {
    const electronics = seedWorkspace('Électronique');
    const { calls } = mockNativeRuntime(
      {},
      { core: { workspaces: [electronics], picks: [NOTES] } },
    );
    renderApp(`/library?workspace=${electronics.workspace.id}`);
    expect(
      await screen.findByRole('heading', { name: 'Aucun document ne correspond' }),
    ).toBeVisible();

    await act(async () => {
      await emit('tauri://drag-enter', { paths: [], position: { x: 10, y: 10 } });
    });
    expect(await screen.findByText('Déposez vos fichiers pour les importer')).toBeInTheDocument();
    expect(screen.getByText(/Ils seront ajoutés à «\sÉlectronique\s»/)).toBeInTheDocument();

    await act(async () => {
      await emit('tauri://drag-drop', { paths: [], position: { x: 10, y: 10 } });
    });
    await importPanel();
    expect(screen.queryByText('Déposez vos fichiers pour les importer')).not.toBeInTheDocument();
    // The interface never sends paths: the core imports the files it recorded for this drop.
    expect(lastCall(calls, 'documents_import_dropped')).toMatchObject({
      target: { workspaceId: electronics.workspace.id },
    });
    expect(await screen.findByRole('link', { name: 'notes-de-cours' })).toBeInTheDocument();
  });

  it('starts an import from anywhere with Ctrl+O', async () => {
    const { calls } = mockNativeRuntime();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Commencez par importer vos documents' });
    await user.keyboard('{Control>}o{/Control}');
    await waitFor(() => {
      expect(calls.some((call) => call.command === 'documents_import_pick')).toBe(true);
    });
    // Closing the picker without choosing does nothing.
    expect(screen.queryByRole('region', { name: 'Import terminé' })).not.toBeInTheDocument();
  });
});

describe('library views', () => {
  const electronics = seedWorkspace('Électronique');
  const components = seedFolder(electronics, 'Composants');
  const pdf = seedDocument('fiche-ne555.pdf', {
    title: 'Fiche technique NE555',
    workspaceId: electronics.workspace.id,
    folderId: components.id,
    ageMs: 60 * 60 * 1000,
  });
  const docx = seedDocument('cours-electronique.docx', {
    title: 'Cours d’électricité générale',
    workspaceId: electronics.workspace.id,
    ageMs: 2 * 60 * 60 * 1000,
  });
  const json = seedDocument('export-casse.json', {
    title: 'export-casse',
    indexingStatus: 'failed',
    metadata: { format: 'json', extractionIssue: 'invalid_json' },
    ageMs: 3 * 60 * 60 * 1000,
  });

  it('searches titles and file names, accents and case aside', async () => {
    const { calls } = mockNativeRuntime(
      {},
      { core: { workspaces: [electronics], folders: [components], documents: [pdf, docx, json] } },
    );
    const { user } = renderApp('/library');
    expect(await screen.findByText('3 documents')).toBeInTheDocument();
    // Only a state that needs attention is flagged in the list.
    expect(screen.getByText('Texte non extrait')).toBeInTheDocument();
    expect(screen.queryByText('Texte extrait')).not.toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher des documents' }),
      'ELECTRICITE',
    );
    expect(await screen.findByText('1 document')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cours d’électricité générale' })).toBeInTheDocument();
    expect(lastCall(calls, 'documents_list')).toMatchObject({
      query: { search: 'ELECTRICITE', state: 'active' },
    });

    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher des documents' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher des documents' }),
      'ne555.pdf',
    );
    expect(await screen.findByRole('link', { name: 'Fiche technique NE555' })).toBeInTheDocument();
    expect(screen.getByText('1 document')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Rechercher des documents' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Rechercher des documents' }),
      'transistor',
    );
    expect(
      await screen.findByRole('heading', { name: 'Aucun document ne correspond' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(await screen.findByText('3 documents')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher des documents' })).toHaveValue('');
  });

  it('filters by format, workspace and favorites, shown as removable chips', async () => {
    const favorite = seedDocument('brochage.json', { title: 'Brochage', isFavorite: true });
    const { calls } = mockNativeRuntime(
      {},
      {
        core: {
          workspaces: [electronics],
          folders: [components],
          documents: [pdf, docx, json, favorite],
        },
      },
    );
    const { user } = renderApp('/library');
    expect(await screen.findByText('4 documents')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    const filters = await screen.findByRole('dialog', { name: 'Filtres' });
    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Format' }), 'JSON');
    await user.click(within(filters).getByRole('checkbox', { name: 'Favoris uniquement' }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('1 document')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Brochage' })).toBeInTheDocument();
    expect(lastCall(calls, 'documents_list')).toMatchObject({
      query: { kinds: ['json'], favoritesOnly: true },
    });
    const chips = screen.getByRole('group', { name: 'Filtres actifs' });
    expect(
      screen.getByRole('button', { name: /Filtres \(2 filtres actifs\)/ }),
    ).toBeInTheDocument();

    await user.click(
      within(chips).getByRole('button', { name: /Retirer le filtre «\sFavoris uniquement\s»/ }),
    );
    expect(await screen.findByText('2 documents')).toBeInTheDocument();
    await user.click(
      within(chips).getByRole('button', { name: /Retirer le filtre «\sFormat\s: JSON\s»/ }),
    );
    expect(await screen.findByText('4 documents')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filtres actifs' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    await user.selectOptions(
      within(await screen.findByRole('dialog', { name: 'Filtres' })).getByRole('combobox', {
        name: 'Espace de travail',
      }),
      'Sans espace de travail',
    );
    await user.keyboard('{Escape}');
    expect(await screen.findByText('2 documents')).toBeInTheDocument();
    expect(lastCall(calls, 'documents_list')).toMatchObject({
      query: { workspace: { kind: 'unassigned' } },
    });
  });

  it('browses and manages the folders of a workspace', async () => {
    const courses = seedFolder(electronics, 'Cours');
    const { calls } = mockNativeRuntime(
      {},
      {
        core: {
          workspaces: [electronics],
          folders: [components, courses],
          documents: [pdf, docx],
        },
      },
    );
    const { user } = renderApp(`/library?workspace=${electronics.workspace.id}`);
    const folders = await screen.findByRole('navigation', { name: 'Dossiers' });
    expect(await screen.findByText('2 documents')).toBeInTheDocument();
    // Every document is in this workspace: no column repeats its name.
    expect(screen.queryByRole('columnheader', { name: 'Espace' })).not.toBeInTheDocument();

    await user.click(within(folders).getByRole('button', { name: 'Composants' }));
    expect(await screen.findByText('1 document')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fiche technique NE555' })).toBeInTheDocument();
    expect(within(folders).getByRole('button', { name: 'Composants' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(lastCall(calls, 'documents_list')).toMatchObject({
      query: { folderId: components.id },
    });

    await user.click(within(folders).getByRole('button', { name: 'Nouveau dossier' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouveau dossier' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom du dossier' }), 'cours');
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(
      await within(dialog).findByText('Un dossier du même niveau porte déjà ce nom.'),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Nom du dossier' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom du dossier' }), 'Datasheets');
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText(/Dossier «\sDatasheets\s» créé\./)).toBeInTheDocument();
    expect(await within(folders).findByRole('button', { name: 'Datasheets' })).toBeInTheDocument();

    // A folder that still holds a document is never deleted with it.
    await user.click(
      within(folders).getByRole('button', { name: /Actions du dossier «\sComposants\s»/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer…' }));
    const confirm = await screen.findByRole('dialog', { name: /Supprimer le dossier/ });
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer le dossier' }));
    expect(
      await screen.findByText(
        'Ce dossier n’est pas vide : déplacez d’abord ses documents, ses notes et ses sous-dossiers.',
      ),
    ).toBeInTheDocument();
    expect(within(folders).getByRole('button', { name: 'Composants' })).toBeInTheDocument();
  });
});

describe('document operations', () => {
  it('edits the tags of a document, creating one on the way', async () => {
    const tag = seedTag('Composants', 'neutral');
    const doc = seedDocument('fiche-ne555.pdf', { title: 'Fiche technique NE555' });
    const { calls, core } = mockNativeRuntime({}, { core: { documents: [doc], tags: [tag] } });
    const { user } = renderApp('/library');

    await user.click(await actionsOf('Fiche technique NE555'));
    await user.click(await screen.findByRole('menuitem', { name: 'Étiquettes…' }));
    const dialog = await screen.findByRole('dialog', { name: /Étiquettes de/ });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Composants' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nouvelle étiquette' }), 'Examen');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(await within(dialog).findByRole('checkbox', { name: 'Examen' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Étiquettes enregistrées.')).toBeInTheDocument();
    const examen = core.tags.find((entry) => entry.name === 'Examen');
    expect(lastCall(calls, 'documents_set_tags')).toEqual({
      id: doc.document.id,
      tagIds: expect.arrayContaining([tag.id, examen?.id]) as unknown,
    });
    expect(core.documents[0]?.tagIds).toHaveLength(2);
  });

  it('moves a document to the trash, restores it, and deletes it only after confirmation', async () => {
    const doc = seedDocument('notes-de-cours.txt', { title: 'Notes de cours' });
    const { calls, core } = mockNativeRuntime({}, { core: { documents: [doc] } });
    const { user } = renderApp('/library');

    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(
      await screen.findByText(/«\sNotes de cours\s» mis à la corbeille\./),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Votre bibliothèque est vide' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Corbeille' }));
    expect(await screen.findByRole('link', { name: 'Notes de cours' })).toBeInTheDocument();
    expect(screen.getByText(/jamais votre fichier d’origine/)).toBeInTheDocument();
    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurer' }));
    expect(await screen.findByText(/«\sNotes de cours\s» restauré\./)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'La corbeille est vide' }),
    ).toBeInTheDocument();
    expect(core.documents[0]?.document.deletedAt).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Documents' }));
    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Mettre à la corbeille' }));
    await user.click(screen.getByRole('radio', { name: 'Corbeille' }));
    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer définitivement…' }));
    const confirm = await screen.findByRole('dialog', { name: /Supprimer définitivement/ });
    expect(confirm).toHaveTextContent('Votre fichier d’origine n’est pas touché.');
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    expect(calls.some((call) => call.command === 'documents_purge')).toBe(false);

    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer définitivement…' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /Supprimer définitivement/ })).getByRole(
        'button',
        { name: 'Supprimer définitivement' },
      ),
    );
    expect(
      await screen.findByText(/«\sNotes de cours\s» supprimé définitivement\./),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'documents_purge')).toEqual({ id: doc.document.id });
    expect(core.documents).toHaveLength(0);
  });

  it('opens a document: metadata, text, favorite, rename, and records the opening once', async () => {
    const doc = seedDocument('notes-de-cours.txt', {
      title: 'Notes de cours',
      content: 'Résumé : le condensateur se charge à travers R1 et R2.',
      metadata: { format: 'txt', encoding: 'utf-8' },
    });
    const { calls, core } = mockNativeRuntime({}, { core: { documents: [doc] } });
    const { user } = renderApp(`/library/${doc.document.id}`);

    expect(await screen.findByRole('heading', { level: 2, name: 'Notes de cours' })).toBeVisible();
    expect(screen.getByText('notes-de-cours.txt')).toBeInTheDocument();
    expect(screen.getByText('utf-8')).toBeInTheDocument();
    expect(
      screen.getByText('Résumé : le condensateur se charge à travers R1 et R2.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.title).toBe('Notes de cours — ARCHIVE');
    });
    expect(calls.filter((call) => call.command === 'documents_mark_opened')).toHaveLength(1);

    const favorite = screen.getByRole('button', { name: 'Favori' });
    expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await user.click(favorite);
    expect(await screen.findByText('Ajouté aux favoris.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Favori' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    await user.click(await actionsOf('Notes de cours'));
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renommer le document' });
    const title = within(dialog).getByRole('textbox', { name: 'Titre' });
    await user.clear(title);
    await user.click(within(dialog).getByRole('button', { name: 'Renommer' }));
    expect(title).toHaveAccessibleDescription('Le titre est obligatoire.');
    await user.type(title, 'Résumé du cours');
    await user.click(within(dialog).getByRole('button', { name: 'Renommer' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Résumé du cours' }),
    ).toBeInTheDocument();
    expect(core.documents[0]?.document.title).toBe('Résumé du cours');
    // The original file name never changes.
    expect(core.documents[0]?.document.originalFilename).toBe('notes-de-cours.txt');
    expect(calls.filter((call) => call.command === 'documents_mark_opened')).toHaveLength(1);
  });

  it('previews a CSV as a table and shows an invalid JSON as it is', async () => {
    const csv = seedDocument('composants.csv', {
      title: 'Liste des composants',
      content: 'référence;valeur;quantité\nR1;"10k; 1 %";2\nC1;100n;1\n',
    });
    const json = seedDocument('export-casse.json', {
      title: 'export-casse',
      indexingStatus: 'failed',
      metadata: { format: 'json', extractionIssue: 'invalid_json' },
      base64: btoa('{"composant": '),
      fileSize: 14,
    });
    mockNativeRuntime({}, { core: { documents: [csv, json] } });
    const { user, router } = renderApp(`/library/${csv.document.id}`);

    const table = await screen.findByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['référence', 'valeur', 'quantité']);
    expect(within(table).getByRole('cell', { name: '10k; 1 %' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Texte extrait' }));
    expect(await screen.findByText(/R1;"10k; 1 %";2/)).toBeInTheDocument();

    await act(async () => {
      await router.navigate(`/library/${json.document.id}`);
    });
    expect(
      await screen.findByText('Contenu brut du fichier, tel qu’il a été importé :'),
    ).toBeInTheDocument();
    expect(screen.getByText('{"composant":')).toBeInTheDocument();
    expect(
      screen.getByText('JSON invalide : le fichier est conservé, mais son texte n’est pas indexé.'),
    ).toBeInTheDocument();
  });

  it('says plainly when a document no longer exists', async () => {
    mockNativeRuntime();
    renderApp('/library/00000000-0000-7000-9000-000000000999');
    expect(await screen.findByRole('heading', { name: 'Document introuvable' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Retour à la bibliothèque' })).toBeInTheDocument();
  });
});

describe('personal views', () => {
  it('lists favorite and recently opened documents', async () => {
    const favorite = seedDocument('fiche-ne555.pdf', {
      title: 'Fiche technique',
      isFavorite: true,
    });
    const opened = seedDocument('notes.txt', {
      title: 'Notes ouvertes',
      lastOpenedAt: Date.now() - 60 * 1000,
    });
    const never = seedDocument('jamais.txt', { title: 'Jamais ouvert' });
    mockNativeRuntime({}, { core: { documents: [favorite, opened, never] } });

    const { router } = renderApp('/favorites');
    expect(await screen.findByRole('link', { name: 'Fiche technique' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Notes ouvertes' })).not.toBeInTheDocument();

    await act(async () => {
      await router.navigate('/recent');
    });
    expect(await screen.findByRole('link', { name: 'Notes ouvertes' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Ouvert' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jamais ouvert' })).not.toBeInTheDocument();
  });
});
