import type { Page } from '@playwright/test';
import { coreState, emitNativeEvent, expect, expectNoViolations, seedCore, test } from './fixtures';
import { memoryState } from './memory';

function card(page: Page, title: string) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test.describe('memory engine', () => {
  test('decides on the suggestions of the engine, which say why and how sure, and keeps the decisions', async ({
    page,
  }) => {
    const seeds = memoryState();
    await seedCore(page, seeds.state);
    await page.goto(`/#/notes/${seeds.notes.timer.note.id}`);
    const relations = card(page, 'Relations');
    await expect(relations.getByRole('link', { name: 'Fiche technique NE555' })).toBeVisible();
    await expect(
      relations.getByText(
        /^Termes communs\s:\sNE555, astable et condensateur · Étiquettes communes\s:\sProjet NE555 · Confiance\s:\s72\s%$/,
      ),
    ).toBeVisible();

    await relations
      .getByRole('button', { name: /^Accepter la relation avec «\sFiche technique NE555\s»$/ })
      .click();
    await expect(page.getByText('Relation acceptée.', { exact: true })).toBeVisible();
    await expect(relations.getByText('Suggestion acceptée')).toBeVisible();
    await expect(relations.getByRole('button', { name: 'Ajouter' })).toBeFocused();
    const stored = (await coreState(page)).relations.find(
      (relation) => relation.id === seeds.relations.suggestion.id,
    );
    expect(stored?.status).toBe('accepted');

    // The rejected suggestion waits aside, and comes back on request.
    await relations.getByRole('button', { name: 'Afficher la suggestion rejetée' }).click();
    await relations
      .getByRole('button', {
        name: /^Rétablir la suggestion «\sSécurité électrique au laboratoire\s»$/,
      })
      .click();
    await expect(page.getByText('Suggestion rétablie.', { exact: true })).toBeVisible();
    await expect(
      relations.getByRole('button', {
        name: /^Accepter la relation avec «\sSécurité électrique au laboratoire\s»$/,
      }),
    ).toBeVisible();

    // The decisions are kept: the acceptance is in the timeline.
    await page.reload();
    await expect(card(page, 'Relations').getByText('Suggestion acceptée')).toBeVisible();
    await page.goto('/#/');
    const activity = page.locator('section').filter({ hasText: 'Activité récente' }).first();
    await expect(
      activity.getByText('Fiche technique NE555 — Montage astable du NE555'),
    ).toBeVisible();
    await expect(activity.getByText('Relation acceptée', { exact: true })).toBeVisible();
  });

  test('adds a relation by hand from a document, changes its type and removes it', async ({
    page,
  }) => {
    const seeds = memoryState();
    await seedCore(page, seeds.state);
    await page.goto(`/#/library/${seeds.documents.docx.document.id}`);
    const relations = card(page, 'Relations');
    await expect(relations.getByText('Aucune relation pour l’instant.')).toBeVisible();
    await relations.getByRole('button', { name: 'Ajouter' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouvelle relation' });
    await expect(dialog.getByRole('searchbox', { name: 'Rechercher' })).toBeFocused();
    await dialog
      .getByRole('combobox', { name: 'Type de relation' })
      .selectOption({ label: 'Fait partie de' });
    await page.keyboard.type('électrique');
    await dialog.getByRole('button', { name: 'Sécurité électrique au laboratoire' }).click();
    await expect(page.getByText('Relation ajoutée.', { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(relations.getByText('Fait partie de')).toBeVisible();
    await expect(relations.getByText('Ajoutée par vous')).toBeVisible();

    // Seen from the note, the same relation reads the other way.
    await relations.getByRole('link', { name: 'Sécurité électrique au laboratoire' }).click();
    await expect(card(page, 'Relations').getByText('Contient')).toBeVisible();
    await page.goBack();

    const actions = card(page, 'Relations').getByRole('button', {
      name: /^Actions de la relation avec «\sSécurité électrique au laboratoire\s»$/,
    });
    await actions.click();
    await page.getByRole('menuitem', { name: 'Changer le type…' }).click();
    const typeDialog = page.getByRole('dialog', { name: 'Type de la relation' });
    await typeDialog
      .getByRole('combobox', { name: 'Type de relation' })
      .selectOption({ label: 'Explique' });
    await typeDialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Type de relation modifié.', { exact: true })).toBeVisible();
    await expect(actions).toBeFocused();
    await expect(card(page, 'Relations').getByText('Explique', { exact: true })).toBeVisible();

    await actions.click();
    await page.getByRole('menuitem', { name: 'Retirer' }).click();
    await expect(page.getByText('Relation retirée.', { exact: true })).toBeVisible();
    await expect(
      card(page, 'Relations').getByText('Aucune relation pour l’instant.'),
    ).toBeVisible();
    expect(
      (await coreState(page)).relations.some(
        (relation) =>
          relation.origin === 'user' &&
          relation.relationType === 'explains' &&
          relation.sourceId === seeds.documents.docx.document.id,
      ),
    ).toBe(false);
  });

  test('shows the analysis of an item and the processing, restarts a failed stage and follows the engine', async ({
    page,
  }) => {
    const seeds = memoryState();
    await seedCore(page, seeds.state);
    await page.goto(`/#/notes/${seeds.notes.safety.note.id}`);
    const analysis = card(page, 'Analyse');
    await expect(analysis.getByText('Français (reconnue dans le texte)')).toBeVisible();
    await expect(
      analysis.getByText('Une opération sur la base de données a échoué.'),
    ).toBeVisible();
    await expect(analysis.getByText(/^Nouvel essai dans \d+ minutes?\.$/)).toBeVisible();
    await analysis.getByRole('button', { name: 'Relancer' }).click();
    await expect(page.getByText('Traitement relancé.', { exact: true })).toBeVisible();
    await expect(analysis.getByRole('button', { name: 'Relancer' })).toBeHidden();

    // The engine finishes, and says so: the page follows without being reloaded.
    await page.evaluate((key) => {
      const core = (
        window as unknown as { __ARCHIVE_E2E_CORE__: () => { memory: Record<string, unknown> } }
      ).__ARCHIVE_E2E_CORE__();
      core.memory[key] = {
        terms: [{ term: 'disjoncteur', label: 'disjoncteur', weight: 2.5, occurrences: 2 }],
        language: { code: 'fr', source: 'detected' },
      };
    }, `note:${seeds.notes.safety.note.id}`);
    await emitNativeEvent(page, 'memory:changed', {
      kind: 'note',
      id: seeds.notes.safety.note.id,
      stage: 'analysis',
    });
    await expect(
      analysis.getByRole('link', { name: /^Rechercher «\sdisjoncteur\s»$/ }),
    ).toBeVisible();
    await analysis.getByRole('link', { name: /^Rechercher «\sdisjoncteur\s»$/ }).click();
    await expect(page).toHaveURL(/#\/search\?q=disjoncteur$/);
  });

  test('sums up the processing of the knowledge base in the storage settings', async ({ page }) => {
    await seedCore(page, memoryState().state);
    await page.goto('/#/settings/storage');
    await expect(page.getByRole('heading', { name: 'Moteur de mémoire' })).toBeVisible();
    await expect(page.getByText('1 suggestion de relation attend votre avis.')).toBeVisible();
    await page.getByRole('button', { name: 'Relancer les traitements en échec' }).click();
    await expect(page.getByText('1 traitement relancé.', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Relancer les traitements en échec' }),
    ).toBeHidden();
  });
});

test.describe('accessibility of Phase 7 screens (axe-core, WCAG 2.2 A/AA)', () => {
  test('relations and analysis of a note and of a document, their dialogs and the overview', async ({
    page,
  }) => {
    const seeds = memoryState();
    await seedCore(page, seeds.state);
    await page.goto(`/#/notes/${seeds.notes.timer.note.id}`);
    const relations = card(page, 'Relations');
    await relations.getByRole('button', { name: 'Afficher la suggestion rejetée' }).click();
    await expect(
      card(page, 'Analyse').getByRole('link', { name: /^Rechercher «\sNE555\s»$/ }),
    ).toBeVisible();
    await expectNoViolations(page, 'note with suggestions, rejected suggestions and analysis');

    await relations.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByRole('dialog', { name: 'Nouvelle relation' })).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cours Arduino' }),
    ).toBeVisible();
    await expectNoViolations(page, 'new relation dialog');
    await page.keyboard.press('Escape');

    await page.goto(`/#/notes/${seeds.notes.interrupts.note.id}`);
    await card(page, 'Relations')
      .getByRole('button', { name: /^Actions de la relation avec «\sCours Arduino\s»$/ })
      .click();
    await page.getByRole('menuitem', { name: 'Changer le type…' }).click();
    await expect(page.getByRole('dialog', { name: 'Type de la relation' })).toBeVisible();
    await expectNoViolations(page, 'relation type dialog');
    await page.keyboard.press('Escape');

    await page.goto(`/#/notes/${seeds.notes.safety.note.id}`);
    await expect(card(page, 'Analyse').getByRole('button', { name: 'Relancer' })).toBeVisible();
    await expectNoViolations(page, 'analysis with a failed stage');

    await page.goto(`/#/library/${seeds.documents.pdf.document.id}`);
    await expect(
      card(page, 'Relations').getByRole('link', { name: 'Montage astable du NE555' }),
    ).toBeVisible();
    await expectNoViolations(page, 'document with a suggestion and its analysis');

    await page.goto('/#/settings/storage');
    await expect(page.getByText('1 suggestion de relation attend votre avis.')).toBeVisible();
    await expectNoViolations(page, 'memory engine overview');
  });
});
