import { coreState, expect, expectNoViolations, seedCore, test } from './fixtures';
import { seedDocument, seedNote, seedProvider, seedWorkspace } from '../../src/test/coreDouble';

const KEY = 'sk-ant-e2e-0123456789abcdef';

/** A course in a workspace, a note outside it, and a ready provider whose next answer cites the course. */
function assistantState() {
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
    state: {
      workspaces: [electronics],
      documents: [course],
      notes: [recipe],
      aiProviders: [seedProvider()],
      aiReplies: [
        {
          pieces: [
            'Le montage **astable** oscille sans cesse entre deux états [S1].',
            '\n\n[interpretation] Il convient donc à un clignotant.',
          ],
        },
      ],
    },
  };
}

test.describe('AI settings', () => {
  test('configures a provider without ever showing its key, and passes the accessibility audit', async ({
    page,
  }) => {
    await seedCore(page, {});
    await page.goto('/#/settings/ai');
    await expect(page.getByText('Aucun fournisseur configuré')).toBeVisible();
    await expectNoViolations(page, 'AI settings without provider');

    await page.getByRole('button', { name: 'Ajouter un fournisseur' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter un fournisseur' });
    await dialog.getByRole('radio', { name: 'OpenAI' }).click();
    await expect(dialog.getByLabel('Nom affiché')).toHaveValue('OpenAI');
    await dialog.getByLabel('Clé API (facultative maintenant)').fill(KEY);
    await dialog.getByRole('button', { name: 'Ajouter' }).click();

    const panel = page.getByRole('region', { name: 'OpenAI' });
    await expect(
      panel.getByText('Enregistrée dans le gestionnaire d’identifiants de Windows.'),
    ).toBeVisible();
    // No model is suggested for OpenAI: it is chosen in the account's list after a test.
    await expect(panel.getByText('Aucun modèle choisi.')).toBeVisible();
    expect(await page.content()).not.toContain(KEY);
    expect(JSON.stringify(await coreState(page))).not.toContain(KEY);
    await expectNoViolations(page, 'AI settings with a provider');
  });
});

test.describe('assistant', () => {
  test('answers from the shared passages only, with citations that open their source', async ({
    page,
  }) => {
    const { electronics, course, state } = assistantState();
    await seedCore(page, state);
    await page.goto('/#/assistant');
    await expect(page.getByRole('heading', { name: 'Interrogez vos connaissances' })).toBeVisible();
    await expectNoViolations(page, 'assistant, new conversation');

    await page.getByLabel('Espace de travail').selectOption(electronics.workspace.id);
    const question = page.getByLabel('Votre question');
    await question.fill('Comment oscille le montage astable ?');
    await expect(page.getByText(/\d+ passages? · \d+ caractères/)).toBeVisible();
    await page.getByRole('button', { name: 'Voir les passages' }).click();
    await expectNoViolations(page, 'assistant, preview of what will be sent');
    await question.press('Enter');

    const answer = page.getByRole('article', { name: 'Assistant' });
    await expect(answer.getByText('Il convient donc à un clignotant.')).toBeVisible();
    await expect(answer.getByText('Rédaction en cours…')).toBeHidden();
    await expect(answer.getByText('Issu d’ARCHIVE')).toBeVisible();
    await expect(answer.getByText('Interprétation de l’IA')).toBeVisible();
    await expect(answer.locator('strong', { hasText: 'astable' })).toBeVisible();
    await expectNoViolations(page, 'assistant, answer with citations');

    const sent = (await coreState(page)).aiSent;
    expect(sent).toHaveLength(1);
    expect(new Set(sent[0]?.sources.map((source) => source.title))).toEqual(
      new Set(['Cours NE555']),
    );

    await answer.getByRole('link', { name: /^S1\W+Cours NE555, page 2$/ }).click();
    await expect(page).toHaveURL(new RegExp(`#/library/${course.document.id}\\?page=2$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Cours NE555' })).toBeVisible();

    // The conversation is kept: back to it from the history.
    await page.goto('/#/assistant');
    await page
      .getByRole('button', {
        name: /^Comment oscille le montage astable \?/,
      })
      .click();
    await expect(page.getByRole('article', { name: 'Assistant' })).toContainText(
      'oscille sans cesse',
    );
  });

  test('explains what is missing when no provider can answer', async ({ page }) => {
    await seedCore(page, { aiProviders: [seedProvider({ key: null })] });
    await page.goto('/#/assistant');
    await expect(page.getByRole('heading', { name: 'Configuration à terminer' })).toBeVisible();
    await expectNoViolations(page, 'assistant, provider without key');
    await page.getByRole('link', { name: 'Ouvrir les paramètres de l’IA' }).click();
    await expect(page.getByRole('region', { name: 'Anthropic' })).toBeVisible();
  });
});
