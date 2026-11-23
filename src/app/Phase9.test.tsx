import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  seedDocument,
  seedNote,
  seedProvider,
  seedWorkspace,
  type CoreDoubleState,
} from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

const KEY = 'sk-ant-test-0123456789';

/** A course in a workspace, and a note outside it. */
function knowledgeBase() {
  const electronics = seedWorkspace('Électronique', { color: 'blue', icon: 'cpu' });
  const course = seedDocument('cours-ne555.pdf', {
    title: 'Cours NE555',
    workspaceId: electronics.workspace.id,
    content:
      'Introduction aux circuits intégrés.\fLe montage astable du NE555 oscille sans cesse entre deux états.\fLe montage monostable délivre une seule impulsion.',
  });
  const recipe = seedNote('Recette', { text: 'Le montage astable des crêpes.' });
  return {
    electronics,
    course,
    recipe,
    state: {
      workspaces: [electronics],
      documents: [course],
      notes: [recipe],
    } satisfies Partial<CoreDoubleState>,
  };
}

describe('AI settings', () => {
  it('adds a provider whose key goes to the core and never comes back', async () => {
    const { core, calls } = mockNativeRuntime({}, { core: {} });
    const { user } = renderApp('/settings/ai');
    expect(await screen.findByText('Aucun fournisseur configuré')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter un fournisseur' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un fournisseur' });
    expect(within(dialog).getByLabelText('Nom affiché')).toHaveValue('Anthropic');
    const key = within(dialog).getByLabelText('Clé API (facultative maintenant)');
    expect(key).toHaveAttribute('type', 'password');
    await user.type(key, KEY);
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    const panel = await screen.findByRole('region', { name: 'Anthropic' });
    expect(
      await within(panel).findByText('Enregistrée dans le gestionnaire d’identifiants de Windows.'),
    ).toBeInTheDocument();
    // The model suggested by Anthropic's documentation, until the account's list is known.
    expect(within(panel).getByText(/Modèle utilisé.*claude-opus-5-5/)).toBeInTheDocument();
    // The key went to the core once, and nothing the interface received or kept holds it.
    const sent = calls.filter((call) => call.command === 'ai_providers_set_key');
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(core)).not.toContain(KEY);
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(calls.some((call) => call.command === 'ai_providers_test')).toBe(false);
  });

  it('tests the connection on demand and chooses a model of the account', async () => {
    const provider = seedProvider({ model: '', key: 'system' });
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          aiProviders: [provider],
          aiModels: {
            [provider.id]: [
              {
                id: 'claude-test-large',
                name: 'Claude Test Large',
                createdAt: null,
                maxOutputTokens: 8000,
                deprecated: false,
                refusalFallback: true,
              },
              {
                id: 'claude-test-old',
                name: 'Claude Test Old',
                createdAt: null,
                maxOutputTokens: 4096,
                deprecated: true,
                refusalFallback: false,
              },
            ],
          },
        },
      },
    );
    const { user } = renderApp('/settings/ai');
    const panel = await screen.findByRole('region', { name: 'Anthropic' });
    expect(within(panel).getByText('Aucun modèle choisi.')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Tester la connexion' }));
    expect(
      await within(panel).findByText(/Connexion réussie.*2 modèles disponibles/),
    ).toBeInTheDocument();
    const list = within(panel).getByLabelText('Modèles de votre compte');
    expect(
      within(list).getByRole('option', { name: /Claude Test Old.*en fin de vie/ }),
    ).toBeInTheDocument();
    await user.selectOptions(list, 'claude-test-large');
    await waitFor(() => {
      expect(core.aiProviders[0]?.model).toBe('claude-test-large');
    });
    // What the provider said of the model goes with it: its longest answer, its fallback.
    expect(core.aiProviders[0]?.preferences).toMatchObject({
      modelMaxOutputTokens: 8000,
      modelRefusalFallback: true,
    });
    expect(
      await within(panel).findByText(/Ce modèle écrit au plus 8.000 jetons par réponse/),
    ).toBeInTheDocument();
  });

  it('explains a refused key, keeps keys for the session without a credential store, and removes them', async () => {
    const provider = seedProvider({ key: 'session' });
    mockNativeRuntime(
      {},
      {
        core: {
          aiProviders: [provider],
          aiSystemStore: false,
          aiModels: { [provider.id]: { kind: 'authentication' } },
        },
      },
    );
    const { user } = renderApp('/settings/ai');
    expect(
      await screen.findByText('Clés gardées pour cette session seulement'),
    ).toBeInTheDocument();
    const panel = await screen.findByRole('region', { name: 'Anthropic' });
    expect(
      within(panel).getByText('Gardée en mémoire pour cette session seulement.'),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Tester la connexion' }));
    expect(
      await within(panel).findByText(/Clé API refusée par le fournisseur/),
    ).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Retirer la clé' }));
    const confirm = await screen.findByRole('dialog', { name: /Retirer la clé/ });
    await user.click(within(confirm).getByRole('button', { name: 'Retirer la clé' }));
    expect(await within(panel).findByText('Aucune clé enregistrée.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Tester la connexion' })).toBeDisabled();
  });

  it('stores the privacy preferences of the assistant', async () => {
    const { calls } = mockNativeRuntime({}, { core: { aiProviders: [seedProvider()] } });
    const { user } = renderApp('/settings/ai');
    const reduced = await screen.findByRole('radio', { name: /Réduite/ });
    await user.click(reduced);
    await user.click(
      screen.getByRole('checkbox', { name: 'Envoyer la conversation avec chaque question' }),
    );
    await waitFor(() => {
      expect(
        calls.filter((call) => call.command === 'settings_update').map((call) => call.args),
      ).toEqual([
        { patch: { assistantContext: 'compact' } },
        { patch: { assistantHistory: false } },
      ]);
    });
  });
});

describe('assistant', () => {
  it('sends only the shared passages and shows the answer with verified citations', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime(
      {},
      {
        core: {
          ...base.state,
          aiProviders: [seedProvider()],
          aiReplies: [
            {
              pieces: [
                'Le montage astable oscille sans cesse [S1].',
                '\n\n[general] Le NE555 date de 1971.',
                '\n\nUne source inventée [S7].',
              ],
            },
          ],
        },
      },
    );
    const { user } = renderApp('/assistant');
    expect(
      await screen.findByRole('heading', { name: 'Interrogez vos connaissances' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rien n’est partagé/)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Espace de travail'),
      base.electronics.workspace.id,
    );
    await user.type(
      screen.getByLabelText('Votre question'),
      'Comment oscille le montage astable ?',
    );
    // The preview names what will leave before anything does.
    expect(
      await screen.findByText(/\d+ passages? · \d+ caractères/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir les passages' }));
    expect(screen.getAllByText('Cours NE555').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    const answer = await screen.findByRole('article', { name: 'Assistant' });
    expect(await within(answer).findByText(/Le NE555 date de 1971/)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(answer).queryByText('Rédaction en cours…')).not.toBeInTheDocument();
    });

    // Only the passages of the shared workspace left: the note « Recette » matched but was not shared.
    expect(core.aiSent).toHaveLength(1);
    const titles = core.aiSent[0]?.sources.map((source) => source.title) ?? [];
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles)).toEqual(new Set(['Cours NE555']));

    const citation = within(answer).getByRole('link', { name: /^S1, Cours NE555, page 2$/ });
    expect(citation).toHaveAttribute('href', `/library/${base.course.document.id}?page=2`);
    expect(within(answer).getByText(/Citation \[S7\] non vérifiée/)).toBeInTheDocument();
    expect(within(answer).queryByRole('link', { name: /^S7/ })).not.toBeInTheDocument();
    expect(within(answer).getByText('Issu d’ARCHIVE')).toBeInTheDocument();
    expect(within(answer).getByText('Connaissances générales')).toBeInTheDocument();
    expect(within(answer).getByText('Non sourcé')).toBeInTheDocument();
    expect(within(answer).queryByText('[general]', { exact: false })).not.toBeInTheDocument();
    expect(within(answer).getByText(/Rédigée par claude-opus-5-5-2026/)).toBeInTheDocument();

    // The conversation is kept, under the first question.
    expect(
      screen.getByRole('button', {
        name: /Ouvrir la conversation «.Comment oscille le montage astable \?.»/,
      }),
    ).toBeInTheDocument();

    await user.click(within(answer).getByRole('button', { name: 'Copier la réponse' }));
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toContain(
        'Le montage astable oscille sans cesse [S1].',
      );
    });
    expect(await navigator.clipboard.readText()).not.toContain('[general]');
  });

  it('says when nothing was shared, and answers again after a failure', async () => {
    mockNativeRuntime(
      {},
      {
        core: {
          aiProviders: [seedProvider()],
          aiReplies: [
            { pieces: ['Début'], error: { kind: 'rate_limited', retry_after_seconds: 12 } },
            { pieces: ['[general] Une réponse générale.'] },
          ],
        },
      },
    );
    const { user } = renderApp('/assistant');
    await user.type(await screen.findByLabelText('Votre question'), 'Qu’est-ce qu’un NE555 ?');
    expect(
      await screen.findByText(/seule votre question sera envoyée/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText('Votre question'), { key: 'Enter' });

    const answer = await screen.findByRole('article', { name: 'Assistant' });
    expect(await within(answer).findByText(/Trop de demandes.*12/)).toBeInTheDocument();
    await user.click(within(answer).getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Une réponse générale.')).toBeInTheDocument();
    expect(await screen.findByText(/Aucun document n’était partagé/)).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Assistant' })).toHaveLength(1);
  });

  it('stops an answer being written and keeps what was written', async () => {
    mockNativeRuntime(
      {},
      {
        core: {
          aiProviders: [seedProvider()],
          aiReplies: [{ pieces: ['Un ', 'long ', 'début ', 'de ', 'réponse'], delayMs: 150 }],
        },
      },
    );
    const { user } = renderApp('/assistant');
    await user.type(await screen.findByLabelText('Votre question'), 'Une question');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    const stop = await screen.findByRole('button', { name: 'Arrêter la réponse' });
    const answer = await screen.findByRole('article', { name: 'Assistant' });
    await within(answer).findByText(/^Un/);
    await user.click(stop);
    expect(
      await screen.findByText('Réponse interrompue.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('clears and deletes a conversation after confirmation', async () => {
    mockNativeRuntime({}, { core: { aiProviders: [seedProvider()] } });
    const { user } = renderApp('/assistant');
    await user.type(await screen.findByLabelText('Votre question'), 'Première question');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText(/réponse de connaissances générales/);
    // Clearing waits for the answer to be recorded.
    await screen.findByRole('button', { name: 'Copier la réponse' });
    await user.click(await screen.findByRole('button', { name: 'Effacer la conversation' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /Effacer cette conversation/ })).getByRole(
        'button',
        { name: 'Effacer' },
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'Interrogez vos connaissances' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Supprimer la conversation' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /Supprimer cette conversation/ })).getByRole(
        'button',
        { name: 'Supprimer' },
      ),
    );
    expect(await screen.findByText('Vos conversations apparaîtront ici.')).toBeInTheDocument();
  });

  it('asks to finish the configuration when the provider has no key', async () => {
    mockNativeRuntime({}, { core: { aiProviders: [seedProvider({ key: null })] } });
    renderApp('/assistant');
    expect(
      await screen.findByRole('heading', { name: 'Configuration à terminer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres de l’IA' })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('extracts concepts on request only, after saying what will be sent, and keeps those of the text', async () => {
    const base = knowledgeBase();
    const { core, calls } = mockNativeRuntime(
      {},
      {
        core: {
          ...base.state,
          aiProviders: [seedProvider()],
          aiConceptReplies: {
            [`document:${base.course.document.id}`]: [
              { name: 'NE555', kind: 'product', excerpt: 'Le montage astable du NE555' },
              { name: 'Transistor', kind: 'technical_term', excerpt: null },
            ],
          },
        },
      },
    );
    const { user } = renderApp(`/library/${base.course.document.id}`);
    const extract = await screen.findByRole('button', {
      name: 'Extraire les concepts avec Anthropic',
    });
    expect(calls.some((call) => call.command === 'memory_extract_concepts')).toBe(false);
    await user.click(extract);
    const dialog = await screen.findByRole('dialog', {
      name: /Extraire les concepts de cet élément/,
    });
    expect(
      within(dialog).getByText(/24.000 caractères du texte seront envoyés à Anthropic/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Extraire' }));
    expect(
      await screen.findByText('1 concept trouvé et vérifié dans le texte.'),
    ).toBeInTheDocument();
    // The concept the text does not hold was not recorded.
    expect(
      core.concepts[`document:${base.course.document.id}`]?.map((concept) => concept.name),
    ).toEqual(['NE555']);
    expect(await screen.findByText('NE555')).toBeInTheDocument();
  });
});
