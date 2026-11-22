import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { creationEvent, seedWorkspace } from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

/** Accessible names keep their non-breaking spaces (French typography): `\s` matches them. */
function menuButton(name: string) {
  return screen.findByRole('button', { name: new RegExp(`Actions de l’espace «\\s${name}\\s»`) });
}

function sidebar() {
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

function lastCall(calls: { command: string; args: unknown }[], command: string) {
  return calls.filter((call) => call.command === command).at(-1)?.args;
}

describe('workspace creation', () => {
  it('offers to create the first workspace, then opens it', async () => {
    const { calls, core } = mockNativeRuntime();
    const { user } = renderApp('/workspaces');
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Aucun espace de travail pour l’instant',
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Créer un espace de travail' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nouvel espace de travail' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom' }), '  Électronique  ');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Description' }),
      'Cours et projets',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Bleu' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Électronique' }));
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’espace' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Électronique' }),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'workspaces_create')).toEqual({
      input: { name: 'Électronique', description: 'Cours et projets', color: 'blue', icon: 'cpu' },
    });
    expect(screen.getByText('Espace « Électronique » créé.')).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: 'Électronique' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(document.title).toBe('Électronique — ARCHIVE');
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(
      within(breadcrumb).getByRole('link', { name: 'Espaces de travail' }),
    ).toBeInTheDocument();
    expect(core.workspaces).toHaveLength(1);
    expect(await screen.findByText('Espace créé')).toBeInTheDocument();
  });

  it('reports an empty name, and a name already used even by an archived workspace', async () => {
    const archived = seedWorkspace('Électronique', { isArchived: true });
    const { calls } = mockNativeRuntime({}, { core: { workspaces: [archived] } });
    const { user } = renderApp('/workspaces');
    await user.click(await screen.findByRole('button', { name: 'Nouvel espace de travail' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByRole('textbox', { name: 'Nom' });

    await user.click(within(dialog).getByRole('button', { name: 'Créer l’espace' }));
    expect(name).toHaveAccessibleDescription('Le nom est obligatoire.');
    expect(name).toHaveFocus();
    expect(calls.some((call) => call.command === 'workspaces_create')).toBe(false);

    await user.type(name, 'ÉLECTRONIQUE');
    await user.click(within(dialog).getByRole('button', { name: 'Créer l’espace' }));
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(
        'Un espace de travail, peut-être archivé, porte déjà ce nom.',
      );
    });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.type(name, ' 2');
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  it('opens from the shortcut, the Quick Create menu and the sidebar, and gives the focus back', async () => {
    mockNativeRuntime();
    const { user } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Vue d’ensemble' });

    await user.keyboard('{Control>}{Shift>}N{/Shift}{/Control}');
    expect(
      await screen.findByRole('dialog', { name: 'Nouvel espace de travail' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const quickCreate = screen.getByRole('button', { name: 'Créer' });
    await user.click(quickCreate);
    expect(await screen.findByRole('menuitem', { name: /Nouvelle note/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /Importer un document/ })).not.toHaveAttribute(
      'aria-disabled',
    );
    await user.click(screen.getByRole('menuitem', { name: /Nouvel espace de travail/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Nouvel espace de travail' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(quickCreate).toHaveFocus();
    });

    const sidebarButton = within(sidebar()).getByRole('button', { name: 'Nouvel espace' });
    await user.click(sidebarButton);
    expect(
      await screen.findByRole('dialog', { name: 'Nouvel espace de travail' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(sidebarButton).toHaveFocus();
    });
  });
});

describe('workspace management', () => {
  it('saves only what changed and renames the page', async () => {
    const workspace = seedWorkspace('Électronique', { icon: 'cpu', description: 'Cours' });
    const { calls } = mockNativeRuntime({}, { core: { workspaces: [workspace] } });
    const { user } = renderApp(`/workspaces/${workspace.workspace.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Électronique' });
    expect(screen.getByText('Cours')).toBeInTheDocument();

    const edit = screen.getByRole('button', { name: 'Modifier' });
    await user.click(edit);
    const dialog = await screen.findByRole('dialog', { name: 'Modifier l’espace de travail' });
    const name = within(dialog).getByRole('textbox', { name: 'Nom' });
    expect(name).toHaveValue('Électronique');
    expect(within(dialog).getByRole('radio', { name: 'Électronique' })).toBeChecked();
    await user.clear(name);
    await user.type(name, 'Électronique numérique');
    await user.click(within(dialog).getByRole('radio', { name: 'Violet' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Électronique numérique' }),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'workspaces_update')).toEqual({
      id: workspace.workspace.id,
      patch: { name: 'Électronique numérique', color: 'purple' },
    });
    expect(screen.getByText('Modifications enregistrées.')).toBeInTheDocument();
    await waitFor(() => {
      expect(edit).toHaveFocus();
    });
  });

  it('archives a workspace out of the navigation, lists it in Archives, and restores it', async () => {
    const workspace = seedWorkspace('Électronique');
    mockNativeRuntime({}, { core: { workspaces: [workspace] } });
    const { user, router } = renderApp('/workspaces');

    await user.click(await menuButton('Électronique'));
    await user.click(await screen.findByRole('menuitem', { name: 'Archiver' }));
    expect(await screen.findByText('Espace « Électronique » archivé.')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(sidebar()).queryByRole('link', { name: 'Électronique' }),
      ).not.toBeInTheDocument();
    });
    // Its card left the page with the focused menu button: the focus moves to the content.
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus();
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Aucun espace actif' }),
    ).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Afficher les espaces archivés' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Espaces archivés' })).toBeInTheDocument();
    expect(screen.getByText('Archivé')).toBeInTheDocument();

    await router.navigate('/archived');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Espaces de travail archivés' }),
    ).toBeInTheDocument();
    await user.click(await menuButton('Électronique'));
    await user.click(await screen.findByRole('menuitem', { name: 'Restaurer' }));
    expect(await screen.findByText('Espace « Électronique » restauré.')).toBeInTheDocument();
    expect(
      await within(sidebar()).findByRole('link', { name: 'Électronique' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Aucun élément archivé' }),
    ).toBeInTheDocument();
  });

  it('deletes an empty workspace after an explicit confirmation, the focus on Cancel', async () => {
    const workspace = seedWorkspace('Brouillon');
    const { calls, core } = mockNativeRuntime({}, { core: { workspaces: [workspace] } });
    const { user } = renderApp(`/workspaces/${workspace.workspace.id}`);
    await screen.findByRole('heading', { level: 1, name: 'Brouillon' });

    await user.click(await menuButton('Brouillon'));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog', { name: /Supprimer «\sBrouillon\s»\s\?/ });
    expect(dialog).toHaveAccessibleDescription(
      'Cet espace est vide. Sa suppression est définitive.',
    );
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Supprimer l’espace' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Espaces de travail' }),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'workspaces_delete')).toEqual({
      id: workspace.workspace.id,
      deletion: { kind: 'empty' },
    });
    expect(core.workspaces).toHaveLength(0);
    expect(screen.getByText('Espace « Brouillon » supprimé.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('main')).toHaveFocus();
    });
  });

  it('never deletes the content of a workspace: it moves it into the chosen workspace', async () => {
    const source = seedWorkspace('Électronique', {
      counts: { documents: 2, notes: 1, folders: 3 },
    });
    const studies = seedWorkspace('Études');
    const projects = seedWorkspace('Projets');
    const { calls, core } = mockNativeRuntime(
      {},
      { core: { workspaces: [source, studies, projects] } },
    );
    const { user } = renderApp('/workspaces');

    await user.click(await menuButton('Électronique'));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(dialog).toHaveAccessibleDescription(
        /contient 2 documents, 1 note et 3 dossiers\. Rien de ce contenu ne sera supprimé/,
      );
    });
    expect(
      within(dialog).getByRole('radio', { name: /Le déplacer vers un autre espace/ }),
    ).toBeChecked();
    const target = within(dialog).getByRole('combobox', { name: 'Espace de destination' });
    expect(
      within(target)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Études', 'Projets']);
    await user.selectOptions(target, 'Projets');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer l’espace' }));

    expect(await screen.findByText('Espace « Électronique » supprimé.')).toBeInTheDocument();
    expect(
      screen.getByText('Son contenu a été déplacé dans « Projets », dossier « Électronique ».'),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'workspaces_delete')).toEqual({
      id: source.workspace.id,
      deletion: { kind: 'move_to', target: projects.workspace.id },
    });
    // The three folders and the folder that gathers them are now in « Projets ».
    expect(await screen.findByText('2 documents · 1 note · 4 dossiers')).toBeInTheDocument();
    expect(core.folders.map((folder) => folder.name)).toEqual(['Électronique']);
  });

  it('keeps the content without workspace when no other workspace can receive it', async () => {
    const only = seedWorkspace('Seul', { counts: { notes: 4 } });
    const archived = seedWorkspace('Ancien', { isArchived: true });
    const { calls, core } = mockNativeRuntime({}, { core: { workspaces: [only, archived] } });
    const { user } = renderApp('/workspaces');

    await user.click(await menuButton('Seul'));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog');
    const move = await within(dialog).findByRole('radio', {
      name: /Le déplacer vers un autre espace/,
    });
    expect(move).toBeDisabled();
    expect(move).toHaveAccessibleDescription('Aucun autre espace n’est disponible.');
    expect(
      within(dialog).getByRole('radio', { name: /Le conserver sans espace de travail/ }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer l’espace' }));

    expect(
      await screen.findByText(
        'Ses documents et ses notes ont été conservés sans espace de travail.',
      ),
    ).toBeInTheDocument();
    expect(lastCall(calls, 'workspaces_delete')).toEqual({
      id: only.workspace.id,
      deletion: { kind: 'unassign' },
    });
    expect(core.unassigned.notes).toBe(4);
  });

  it('explains that a workspace no longer exists', async () => {
    mockNativeRuntime();
    renderApp('/workspaces/00000000-0000-7000-8000-999999999999');
    expect(await screen.findByRole('heading', { name: 'Espace introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour aux espaces de travail' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Espace de travail' }),
    ).toBeInTheDocument();
  });
});

describe('overview', () => {
  function statistics() {
    const region = screen.getByRole('region', { name: 'Votre base de connaissances' });
    return Object.fromEntries(
      within(region)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
  }

  it('welcomes a new installation with its first steps and real zeros', async () => {
    mockNativeRuntime();
    const { user } = renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Commencez par importer vos documents' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(statistics()).toEqual({
        Documents: '0',
        Notes: '0',
        'Espaces de travail': '0',
        'Stockage utilisé': '2,6 Mo',
        'Indexés en 7 jours': '0',
      });
    });
    expect(screen.getByRole('figure', { name: 'Exemple d’organisation' })).toBeInTheDocument();
    expect(
      screen.getByText('Votre activité (imports, notes, espaces de travail) apparaîtra ici.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importer un document/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Nouvelle note/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Ouvrir l’assistant IA/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Créer un espace de travail' }));
    expect(
      await screen.findByRole('dialog', { name: 'Nouvel espace de travail' }),
    ).toBeInTheDocument();
  });

  it('shows the figures and the activity of the knowledge base', async () => {
    const electronics = seedWorkspace('Électronique', {
      counts: { documents: 3, notes: 2 },
      ageMs: 5 * 60 * 1000,
    });
    const archived = seedWorkspace('Ancien', { isArchived: true, counts: { notes: 1 } });
    mockNativeRuntime(
      {},
      {
        core: {
          workspaces: [electronics, archived],
          events: [creationEvent(archived), creationEvent(electronics)],
          recentlyIndexed: 2,
        },
      },
    );
    renderApp('/');
    const activity = await screen.findByRole('region', { name: 'Activité récente' });
    expect(await within(activity).findByRole('link', { name: 'Électronique' })).toHaveAttribute(
      'href',
      `/workspaces/${electronics.workspace.id}`,
    );
    // The archived workspace still exists: its creation stays in the history, with its link.
    expect(within(activity).getByRole('link', { name: 'Ancien' })).toBeInTheDocument();
    await waitFor(() => {
      expect(statistics()).toMatchObject({
        Documents: '3',
        Notes: '3',
        'Espaces de travail': '1',
        'Indexés en 7 jours': '2',
      });
    });
    expect(
      screen.queryByRole('heading', { name: /Commencez par importer/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('il y a 5 minutes')).toBeInTheDocument();
  });
});
