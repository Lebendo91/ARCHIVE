import type { Editor } from '@tiptap/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  noteDocument,
  seedDocument,
  seedFolder,
  seedNote,
  seedTag,
  seedWorkspace,
} from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

const DAY = 24 * 60 * 60 * 1000;
/** The autosave writes 800 ms after the last change. */
const SAVED = { timeout: 4000 };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `prefix « title »`: accessible names keep their non-breaking spaces, which `\s` matches. */
function quoted(prefix: string, title: string): RegExp {
  return new RegExp(`^${escapeRegExp(prefix)}\\s«\\s${escapeRegExp(title)}\\s»$`);
}

function noteBody() {
  return screen.findByRole('textbox', { name: 'Contenu de la note' });
}

function titleField() {
  return screen.getByRole('textbox', { name: 'Titre de la note' });
}

/** The TipTap editor behind its content element, to place the selection as a user would. */
function editorOf(element: HTMLElement): Editor {
  const { editor } = element as HTMLElement & { editor?: Editor };
  if (!editor) {
    throw new Error('The element is not the content of a TipTap editor');
  }
  return editor;
}

describe('note editor', () => {
  it('creates a note with Ctrl+N, starts in its title, and saves what is typed', async () => {
    const { calls, core } = mockNativeRuntime({}, { core: {} });
    const { user, router } = renderApp('/notes');
    expect(await screen.findByText('Aucune note pour l’instant')).toBeInTheDocument();

    await user.keyboard('{Control>}n{/Control}');
    const title = await screen.findByRole('textbox', { name: 'Titre de la note' });
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    const [created] = core.notes;
    expect(router.state.location.pathname).toBe(`/notes/${created?.note.id ?? ''}`);

    // Enter goes from the title to the text.
    await user.keyboard('Loi des mailles{Enter}');
    const body = await noteBody();
    await waitFor(() => {
      expect(body).toHaveFocus();
    });
    await user.keyboard('La somme des tensions est nulle.');
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();

    await waitFor(() => {
      expect(created?.contentText).toBe('La somme des tensions est nulle.');
    }, SAVED);
    expect(created?.note.title).toBe('Loi des mailles');
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
    // Each save is made on the revision returned by the previous one.
    const revisions = calls
      .filter((call) => call.command === 'notes_save')
      .map((call) => call.args?.revision);
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions).toEqual(revisions.map((_, index) => index + 1));
  });

  it('says when a save failed, and saves again on request', async () => {
    const entry = seedNote('Diodes', { text: 'Seuil de 0,6 V.' });
    let failures = 1;
    const runtime = mockNativeRuntime(
      {
        notes_save: (args) => {
          if (failures > 0) {
            failures -= 1;
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw { code: 'io', message: 'the disk is full' };
          }
          return runtime.coreHandlers.notes_save?.(args);
        },
      },
      { core: { notes: [entry] } },
    );
    const { user } = renderApp(`/notes/${entry.note.id}`);
    await user.click(await noteBody());
    await user.keyboard('Diode au silicium. ');

    const alert = await screen.findByRole('alert', {}, SAVED);
    expect(alert).toHaveTextContent('Échec de l’enregistrement');
    expect(entry.contentText).toBe('Seuil de 0,6 V.');
    await user.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(entry.contentText).toBe('Diode au silicium. Seuil de 0,6 V.');
    }, SAVED);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
  });

  it('stops on a note saved elsewhere until the user keeps their version or reloads the saved one', async () => {
    const entry = seedNote('Transistors', { text: 'Gain en courant.' });
    mockNativeRuntime({}, { core: { notes: [entry] } });
    const { user } = renderApp(`/notes/${entry.note.id}`);
    const body = await noteBody();
    const savedElsewhere = (text: string) => {
      Object.assign(entry.note, { revision: entry.note.revision + 1, content: noteDocument(text) });
      entry.contentText = text;
    };

    savedElsewhere('Version enregistrée ailleurs.');
    await user.click(body);
    await user.keyboard('Ma version. ');
    const alert = await screen.findByRole('alert', {}, SAVED);
    expect(alert).toHaveTextContent('Cette note a été modifiée ailleurs depuis son ouverture.');
    // Nothing is overwritten until the user decides.
    expect(entry.contentText).toBe('Version enregistrée ailleurs.');
    await user.click(within(alert).getByRole('button', { name: 'Garder ma version' }));
    await waitFor(() => {
      expect(entry.contentText).toBe('Ma version. Gain en courant.');
    }, SAVED);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The text has the focus again, to go on writing.
    await waitFor(() => {
      expect(body).toHaveFocus();
    });

    savedElsewhere('Version finale.');
    await user.keyboard('Encore. ');
    const second = await screen.findByRole('alert', {}, SAVED);
    await user.click(
      within(second).getByRole('button', { name: 'Recharger la version enregistrée' }),
    );
    await waitFor(() => {
      expect(body).toHaveTextContent('Version finale.');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Enregistré')).toBeInTheDocument();
    expect(entry.contentText).toBe('Version finale.');
  });

  it('offers the changes kept from the last session, on the revision they were made on', async () => {
    const entry = seedNote('Condensateurs', { text: 'Charge.' });
    const changedSince = seedNote('Bobines', { text: 'Self.', revision: 3 });
    const draft = (revision: number, text: string) =>
      JSON.stringify({
        revision,
        title: 'Condensateurs et bobines',
        content: JSON.parse(noteDocument(text)) as unknown,
        savedAt: Date.now(),
      });
    localStorage.setItem(`archive-note-draft:${entry.note.id}`, draft(1, 'Charge et décharge.'));
    localStorage.setItem(`archive-note-draft:${changedSince.note.id}`, draft(2, 'Brouillon.'));
    mockNativeRuntime({}, { core: { notes: [entry, changedSince] } });
    const { user, router } = renderApp(`/notes/${entry.note.id}`);

    expect(
      await screen.findByText(
        'Des modifications non enregistrées lors de la dernière session ont été retrouvées.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurer ces modifications' }));
    expect(await noteBody()).toHaveTextContent('Charge et décharge.');
    expect(titleField()).toHaveValue('Condensateurs et bobines');
    await waitFor(() => {
      expect(entry.contentText).toBe('Charge et décharge.');
    }, SAVED);
    expect(entry.note.title).toBe('Condensateurs et bobines');
    expect(localStorage.getItem(`archive-note-draft:${entry.note.id}`)).toBeNull();

    // The other draft was made on an older revision: the note changed since, it is not offered.
    await act(() => router.navigate(`/notes/${changedSince.note.id}`));
    await waitFor(() => {
      expect(titleField()).toHaveValue('Bobines');
    });
    expect(screen.queryByText(/Des modifications non enregistrées/)).not.toBeInTheDocument();
  });

  it('keeps a note in the trash read-only until it is restored', async () => {
    const entry = seedNote('Ancienne note', { text: 'Texte.', deletedAt: Date.now() - DAY });
    mockNativeRuntime({}, { core: { notes: [entry] } });
    const { user } = renderApp(`/notes/${entry.note.id}`);
    const body = await noteBody();
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(body).toHaveAttribute('aria-readonly', 'true');
    expect(titleField()).toHaveAttribute('readonly');
    expect(
      screen.getByText('Cette note est dans la corbeille : restaurez-la pour la modifier.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restaurer' }));
    await waitFor(() => {
      expect(body).toHaveAttribute('contenteditable', 'true');
    });
    expect(body).not.toHaveAttribute('aria-readonly');
    expect(titleField()).not.toHaveAttribute('readonly');
    expect(entry.note.deletedAt).toBeNull();
  });
});

describe('links', () => {
  it('links to a note through the picker, follows the link, and shows the backlink there', async () => {
    const ohm = seedNote('Loi d’Ohm', { text: 'U = R × I' });
    const kirchhoff = seedNote('Lois de Kirchhoff', { text: 'Mailles et nœuds.' });
    const timer = seedDocument('NE555.pdf', { content: 'Minuterie' });
    mockNativeRuntime({}, { core: { notes: [ohm, kirchhoff], documents: [timer] } });
    const { user, router } = renderApp(`/notes/${kirchhoff.note.id}`);
    const body = await noteBody();
    await user.click(body);

    await user.click(screen.getByRole('button', { name: 'Lien vers une note ou un document…' }));
    const picker = await screen.findByRole('dialog', { name: 'Lien vers une note ou un document' });
    // The note being edited is never offered.
    expect(await within(picker).findByRole('button', { name: 'Loi d’Ohm' })).toBeInTheDocument();
    expect(within(picker).queryByRole('button', { name: 'Lois de Kirchhoff' })).toBeNull();
    await user.type(within(picker).getByRole('searchbox', { name: 'Rechercher' }), 'ne555');
    await waitFor(() => {
      expect(within(picker).queryByRole('button', { name: 'Loi d’Ohm' })).toBeNull();
    });
    await user.click(await within(picker).findByRole('button', { name: 'NE555' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(body).getByRole('link', { name: 'NE555' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lien vers une note ou un document…' }));
    const again = await screen.findByRole('dialog', { name: 'Lien vers une note ou un document' });
    await user.click(await within(again).findByRole('button', { name: 'Loi d’Ohm' }));

    await waitFor(() => {
      expect(kirchhoff.links).toEqual([
        { kind: 'document', id: timer.document.id },
        { kind: 'note', id: ohm.note.id },
      ]);
    }, SAVED);
    const links = await screen.findByRole('region', { name: 'Liens de cette note' });
    expect(await within(links).findByRole('link', { name: 'Loi d’Ohm' })).toHaveAttribute(
      'href',
      `/notes/${ohm.note.id}`,
    );
    expect(within(links).getByRole('link', { name: 'NE555' })).toHaveAttribute(
      'href',
      `/library/${timer.document.id}`,
    );

    // A click on the link in the text opens the note.
    await user.click(within(body).getByRole('link', { name: 'Loi d’Ohm' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/notes/${ohm.note.id}`);
    });
    const backlinks = await screen.findByRole('region', { name: 'Rétroliens' });
    expect(
      await within(backlinks).findByRole('link', { name: 'Lois de Kirchhoff' }),
    ).toHaveAttribute('href', `/notes/${kirchhoff.note.id}`);
  });

  it('opens web addresses with the system, and refuses any other kind of address', async () => {
    const entry = seedNote('Ressources', {
      content: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Fiche technique',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/ne555' } }],
              },
              { type: 'text', text: ' et contact' },
            ],
          },
        ],
      }),
    });
    const { core } = mockNativeRuntime({}, { core: { notes: [entry] } });
    const { user } = renderApp(`/notes/${entry.note.id}`);
    const body = await noteBody();

    await user.click(within(body).getByRole('link', { name: 'Fiche technique' }));
    await waitFor(() => {
      expect(core.openedUrls).toEqual(['https://example.com/ne555']);
    });

    // « contact » becomes an e-mail link, after an address that cannot be opened is refused.
    const editor = editorOf(body);
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection({ from: end - 'contact'.length, to: end });
    await user.click(screen.getByRole('button', { name: 'Lien…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Lien' });
    const address = within(dialog).getByRole('textbox', { name: 'Adresse' });
    expect(address).toHaveFocus();
    await user.type(address, 'javascript:alert(1){Enter}');
    expect(
      within(dialog).getByText('Adresse non valide : utilisez https://, http:// ou mailto:.'),
    ).toBeInTheDocument();
    await user.clear(address);
    await user.type(address, 'mailto:labo@example.com{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(body).getByRole('link', { name: 'contact' })).toHaveAttribute(
      'href',
      'mailto:labo@example.com',
    );
    await waitFor(() => {
      expect(entry.note.content).toContain('mailto:labo@example.com');
    }, SAVED);
    expect(entry.note.content).not.toContain('javascript:');
  });
});

describe('notes list', () => {
  it('searches, filters and sorts the notes, with the filters kept in the address', async () => {
    const lecture = seedTag('Cours');
    const workspace = seedWorkspace('Semestre 1');
    const ohm = seedNote('Loi d’Ohm', {
      text: 'Tension et courant.',
      tagIds: [lecture.id],
      isFavorite: true,
      ageMs: 3 * DAY,
    });
    const shopping = seedNote('Liste d’achats', {
      text: 'Résistances de 10 kΩ.',
      workspaceId: workspace.workspace.id,
      ageMs: DAY,
    });
    const archived = seedNote('Ancien cours', { text: 'Archivé.', isArchived: true });
    mockNativeRuntime(
      {},
      { core: { notes: [ohm, shopping, archived], tags: [lecture], workspaces: [workspace] } },
    );
    const { user, router } = renderApp('/notes');
    expect(await screen.findByText('2 notes')).toBeInTheDocument();
    // Most recently modified first, with the beginning of the text.
    const titles = () =>
      screen
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((text) => text === 'Loi d’Ohm' || text === 'Liste d’achats');
    expect(titles()).toEqual(['Liste d’achats', 'Loi d’Ohm']);
    expect(screen.getByText('Résistances de 10 kΩ.')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Trier par' }), 'title');
    await waitFor(() => {
      expect(titles()).toEqual(['Loi d’Ohm', 'Liste d’achats']);
    });

    const search = screen.getByRole('searchbox', { name: 'Rechercher des notes' });
    await user.type(search, 'resistances');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Loi d’Ohm' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Liste d’achats' })).toBeInTheDocument();
    expect(router.state.location.search).toContain('q=resistances');
    await user.clear(search);
    expect(await screen.findByRole('link', { name: 'Loi d’Ohm' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filtres/ }));
    const filters = await screen.findByRole('dialog', { name: 'Filtres' });
    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Étiquette' }), 'Cours');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Liste d’achats' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Loi d’Ohm' })).toBeInTheDocument();
    expect(router.state.location.search).toContain(`tag=${lecture.id}`);
    expect(router.state.location.search).not.toContain('q=');
    await user.click(screen.getByRole('button', { name: /Retirer le filtre/ }));
    expect(await screen.findByRole('link', { name: 'Liste d’achats' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Archivées' }));
    expect(await screen.findByRole('link', { name: 'Ancien cours' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Loi d’Ohm' })).not.toBeInTheDocument();
  });

  it('duplicates, renames and trashes a note, then restores or purges it', async () => {
    const lecture = seedTag('Cours');
    const entry = seedNote('Amplificateurs', { text: 'Gain.', tagIds: [lecture.id] });
    const { core } = mockNativeRuntime({}, { core: { notes: [entry], tags: [lecture] } });
    const { user } = renderApp('/notes');
    const actions = (title: string) =>
      screen.findByRole('button', { name: quoted('Actions de la note', title) });

    await user.click(await actions('Amplificateurs'));
    await user.click(screen.getByRole('menuitem', { name: 'Dupliquer' }));
    expect(await screen.findByText('Note dupliquée.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Amplificateurs (copie)' })).toBeInTheDocument();
    const copy = core.notes.find((candidate) => candidate !== entry);
    expect(copy?.tagIds).toEqual([lecture.id]);
    expect(copy?.contentText).toBe('Gain.');

    await user.click(await actions('Amplificateurs (copie)'));
    await user.click(screen.getByRole('menuitem', { name: 'Renommer…' }));
    const rename = await screen.findByRole('dialog', { name: 'Renommer la note' });
    const field = within(rename).getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'Amplificateurs opérationnels{Enter}');
    expect(await screen.findByText('Note renommée.')).toBeInTheDocument();
    expect(copy?.note.title).toBe('Amplificateurs opérationnels');

    await user.click(await actions('Amplificateurs opérationnels'));
    await user.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(
      await screen.findByText('Note « Amplificateurs opérationnels » mise à la corbeille.'),
    ).toBeInTheDocument();
    await user.click(await actions('Amplificateurs'));
    await user.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));

    await user.click(screen.getByRole('radio', { name: 'Corbeille' }));
    await user.click(await actions('Amplificateurs'));
    await user.click(screen.getByRole('menuitem', { name: 'Restaurer' }));
    expect(await screen.findByText('Note « Amplificateurs » restaurée.')).toBeInTheDocument();
    expect(entry.note.deletedAt).toBeNull();

    await user.click(await actions('Amplificateurs opérationnels'));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer définitivement…' }));
    const purge = await screen.findByRole('dialog', {
      name: /^Supprimer définitivement «\sAmplificateurs opérationnels\s»\s\?$/,
    });
    expect(
      within(purge).getByText(
        'La note, ses étiquettes et ses liens seront effacés. Les notes qui la citent garderont un lien inactif. Cette action est irréversible.',
      ),
    ).toBeInTheDocument();
    await user.click(within(purge).getByRole('button', { name: 'Supprimer définitivement' }));
    expect(
      await screen.findByText('Note « Amplificateurs opérationnels » supprimée définitivement.'),
    ).toBeInTheDocument();
    expect(core.notes.map((candidate) => candidate.note.title)).toEqual(['Amplificateurs']);
  });
});

describe('Markdown', () => {
  it('imports Markdown files as notes named after them, and reports the files it could not read', async () => {
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          markdownPicks: [
            {
              name: 'Cours de diodes',
              markdown:
                '# Diodes\n\nUne **jonction** PN.\n\n- [x] Relire le cours\n\n[Fiche](https://example.com/1n4148)\n',
              failure: null,
            },
            { name: 'binaire', markdown: null, failure: 'content_mismatch' },
          ],
        },
      },
    );
    const { user } = renderApp('/notes');
    await user.click(await screen.findByRole('button', { name: 'Importer du Markdown' }));

    expect(await screen.findByText('1 note importée.')).toBeInTheDocument();
    expect(
      screen.getByText('binaire : Le contenu ne correspond pas à l’extension du fichier'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Cours de diodes' })).toBeInTheDocument();
    const [imported] = core.notes;
    expect(imported?.note.contentFormat).toBe('tiptap-json');
    expect(imported?.contentText).toContain('Une jonction PN.');
    const content = JSON.parse(imported?.note.content ?? '{}') as {
      content: { type: string; attrs?: Record<string, unknown> }[];
    };
    expect(content.content.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'taskList',
      'paragraph',
    ]);
    expect(content.content[0]?.attrs).toMatchObject({ level: 1 });
    expect(imported?.note.content).toContain('https://example.com/1n4148');
  });

  it('exports a note as Markdown, keeping its structure', async () => {
    const entry = seedNote('Mémo', {
      content: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Composants' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'R1', marks: [{ type: 'bold' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
    const { core } = mockNativeRuntime({}, { core: { notes: [entry] } });
    const { user } = renderApp('/notes');
    await user.click(
      await screen.findByRole('button', { name: quoted('Actions de la note', 'Mémo') }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Exporter en Markdown…' }));
    expect(await screen.findByText('Note exportée en Markdown.')).toBeInTheDocument();
    expect(core.exports).toHaveLength(1);
    expect(core.exports[0]?.id).toBe(entry.note.id);
    expect(core.exports[0]?.markdown).toContain('## Composants');
    expect(core.exports[0]?.markdown).toContain('- **R1**');
  });

  it('lays out a Markdown document of the Library like a note, without images or raw HTML', async () => {
    const memo = seedDocument('mesures.md', {
      content:
        '# Mesures\n\n| Résistance | Valeur |\n| --- | --- |\n| R1 | 10k |\n\n![schéma](https://example.com/schema.png)\n\n<script>window.injected = true</script>\n\n[Fiche](https://example.com/fiche)\n',
    });
    const { core } = mockNativeRuntime({}, { core: { documents: [memo] } });
    const { user } = renderApp(`/library/${memo.document.id}`);

    const preview = await screen.findByRole('region', { name: 'Aperçu' });
    expect(within(preview).getByRole('heading', { level: 1, name: 'Mesures' })).toBeInTheDocument();
    expect(within(preview).getByRole('cell', { name: '10k' })).toBeInTheDocument();
    expect(preview.querySelector('img, script, iframe')).toBeNull();
    expect((window as Window & { injected?: boolean }).injected).toBeUndefined();
    await user.click(within(preview).getByRole('link', { name: 'Fiche' }));
    await waitFor(() => {
      expect(core.openedUrls).toEqual(['https://example.com/fiche']);
    });

    // The text kept for search is the Markdown source.
    await user.click(screen.getByRole('radio', { name: 'Texte extrait' }));
    expect(await screen.findByRole('region', { name: 'Texte extrait' })).toHaveTextContent(
      '| R1 | 10k |',
    );
  });
});

describe('tags and folders', () => {
  it('renames a tag everywhere, and deletes it after saying how many items lose it', async () => {
    const lecture = seedTag('Cours');
    const tutorial = seedTag('TD', 'blue');
    const note = seedNote('Diodes', { tagIds: [lecture.id] });
    const document = seedDocument('NE555.pdf', { tagIds: [lecture.id] });
    const { core } = mockNativeRuntime(
      {},
      { core: { tags: [lecture, tutorial], notes: [note], documents: [document] } },
    );
    const { user } = renderApp('/notes');
    const filtersButton = await screen.findByRole('button', { name: /^Filtres/ });
    await user.click(filtersButton);
    await user.click(await screen.findByRole('button', { name: 'Gérer les étiquettes…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Étiquettes' });
    expect(await within(dialog).findByText('1 document · 1 note')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: quoted('Renommer', 'Cours') }));
    const field = within(dialog).getByRole('textbox', { name: quoted('Nouveau nom de', 'Cours') });
    await user.clear(field);
    await user.type(field, 'td{Enter}');
    expect(await within(dialog).findByText('Une étiquette porte déjà ce nom.')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'Cours magistraux{Enter}');
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Étiquette renommée.');
    expect(lecture.name).toBe('Cours magistraux');

    await user.click(
      await within(dialog).findByRole('button', { name: quoted('Supprimer', 'Cours magistraux') }),
    );
    expect(
      within(dialog).getByText(
        'Elle sera retirée de 2 éléments. Aucun document ni aucune note n’est supprimé.',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer l’étiquette' }));
    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        /^Étiquette «\sCours magistraux\s» supprimée\.$/,
      );
    });
    expect(core.tags.map((tag) => tag.name)).toEqual(['TD']);
    expect(note.tagIds).toEqual([]);
    expect(document.tagIds).toEqual([]);
    expect(core.notes).toHaveLength(1);
    expect(core.documents).toHaveLength(1);
    // Focus moves to the tag that took its place.
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: quoted('Renommer', 'TD') })).toHaveFocus();
    });

    await user.click(within(dialog).getByRole('button', { name: quoted('Supprimer', 'TD') }));
    expect(
      within(dialog).getByText('Aucun document ni aucune note ne la porte.'),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(filtersButton).toHaveFocus();
    expect(core.tags.map((tag) => tag.name)).toEqual(['TD']);
  });

  it('moves a folder with its contents, never inside itself', async () => {
    const workspace = seedWorkspace('Électronique');
    const archives = seedFolder(workspace, 'Archives');
    const archivedPractice = seedFolder(workspace, 'TP', archives);
    const lectures = seedFolder(workspace, 'Cours');
    const practice = seedFolder(workspace, 'TP', lectures);
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          workspaces: [workspace],
          folders: [archives, archivedPractice, lectures, practice],
        },
      },
    );
    const { user } = renderApp(`/notes?workspace=${workspace.workspace.id}`);

    await user.click(
      await screen.findByRole('button', { name: quoted('Actions du dossier', 'Cours') }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer…' }));
    let dialog = await screen.findByRole('dialog', {
      name: quoted('Déplacer le dossier', 'Cours'),
    });
    let place = within(dialog).getByRole('combobox', { name: 'Nouvel emplacement' });
    // Neither the folder nor anything inside it is offered; depth is shown by indentation.
    expect(
      within(place)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Racine de l’espace', 'Archives', '\u00a0\u00a0\u00a0TP']);
    expect(place).toHaveValue('');
    await user.selectOptions(place, archives.id);
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer' }));
    expect(await screen.findByText('Dossier déplacé.')).toBeInTheDocument();
    expect(core.folders.find((folder) => folder.id === lectures.id)?.parentId).toBe(archives.id);
    expect(core.folders.find((folder) => folder.id === practice.id)?.parentId).toBe(lectures.id);

    // « Archives » already holds a « TP »: the one of « Cours », now listed first, cannot join it.
    const [nestedPractice] = await screen.findAllByRole('button', {
      name: quoted('Actions du dossier', 'TP'),
    });
    if (!nestedPractice) {
      throw new Error('A « TP » folder is expected');
    }
    await user.click(nestedPractice);
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer…' }));
    dialog = await screen.findByRole('dialog', { name: quoted('Déplacer le dossier', 'TP') });
    place = within(dialog).getByRole('combobox', { name: 'Nouvel emplacement' });
    await user.selectOptions(place, archives.id);
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer' }));
    expect(
      await within(dialog).findByText('Un dossier du même niveau porte déjà ce nom.'),
    ).toBeInTheDocument();
    expect(place).toHaveFocus();
    expect(place).toHaveAttribute('aria-invalid', 'true');
    expect(core.folders.find((folder) => folder.id === practice.id)?.parentId).toBe(lectures.id);
  });
});

describe('integration', () => {
  it('lists the notes citing a document on its page', async () => {
    const timer = seedDocument('NE555.pdf', { content: 'Minuterie' });
    const astable = seedNote('Montage astable', {
      text: 'Avec un NE555.',
      links: [{ kind: 'document', id: timer.document.id }],
    });
    mockNativeRuntime({}, { core: { documents: [timer], notes: [astable] } });
    renderApp(`/library/${timer.document.id}`);
    expect(await screen.findByText('Notes qui citent ce document')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Montage astable' })).toHaveAttribute(
      'href',
      `/notes/${astable.note.id}`,
    );
  });

  it('shows favorite and recently opened notes with the documents', async () => {
    const favorite = seedNote('Formulaire', { isFavorite: true });
    const opened = seedNote('Compte rendu', { lastOpenedAt: Date.now() - DAY });
    const document = seedDocument('NE555.pdf', { isFavorite: true });
    mockNativeRuntime({}, { core: { notes: [favorite, opened], documents: [document] } });
    const { router } = renderApp('/favorites');
    expect(await screen.findByRole('link', { name: 'Formulaire' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NE555' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Compte rendu' })).not.toBeInTheDocument();

    await act(() => router.navigate('/recent'));
    expect(await screen.findByRole('link', { name: 'Compte rendu' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Formulaire' })).not.toBeInTheDocument();
  });
});
