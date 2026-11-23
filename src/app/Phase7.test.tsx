import { emit } from '@tauri-apps/api/event';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  seedDocument,
  seedNote,
  seedRelation,
  seedTag,
  type CoreDoubleState,
} from '@/test/coreDouble';
import { mockNativeRuntime, renderApp } from '@/test/render';

const MINUTE = 60 * 1000;

function knowledgeBase() {
  const project = seedTag('Projet NE555', 'neutral');
  const datasheet = seedDocument('fiche-ne555.pdf', {
    title: 'Fiche technique NE555',
    content: 'Timer NE555 en montage astable.',
    tagIds: [project.id],
  });
  const course = seedDocument('cours-arduino.pdf', {
    title: 'Cours Arduino',
    content: 'Les interruptions externes.',
  });
  const timer = seedNote('Montage astable du NE555', {
    text: 'La fréquence dépend de R1, R2 et C.',
    tagIds: [project.id],
  });
  const safety = seedNote('Sécurité électrique', {
    text: 'Couper l’alimentation avant de modifier un montage.',
  });
  const suggestion = seedRelation(
    { kind: 'document', id: datasheet.document.id },
    { kind: 'note', id: timer.note.id },
    {
      confidence: 0.72,
      provenance: {
        rule: 'shared_terms',
        version: 1,
        terms: ['NE555', 'astable'],
        tags: ['Projet NE555'],
        sameWorkspace: false,
      },
    },
  );
  const rejected = seedRelation(
    { kind: 'note', id: timer.note.id },
    { kind: 'note', id: safety.note.id },
    { status: 'rejected', confidence: 0.2 },
  );
  const memory: CoreDoubleState['memory'] = {
    [`note:${timer.note.id}`]: {
      terms: [
        { term: 'ne555', label: 'NE555', weight: 4.2, occurrences: 3 },
        { term: 'astable', label: 'astable', weight: 3.1, occurrences: 2 },
      ],
      language: { code: 'fr', source: 'detected' },
    },
    [`note:${safety.note.id}`]: {
      stages: {
        analysis: {
          status: 'failed',
          attempts: 1,
          issue: 'database',
          retryAt: Date.now() + 2 * MINUTE,
        },
        relations: { status: 'pending' },
      },
    },
  };
  return {
    datasheet,
    course,
    timer,
    safety,
    suggestion,
    rejected,
    core: {
      tags: [project],
      documents: [datasheet, course],
      notes: [timer, safety],
      relations: [suggestion, rejected],
      memory,
    } satisfies Partial<CoreDoubleState>,
  };
}

async function relationsCard() {
  const heading = await screen.findByRole('heading', { name: 'Relations' });
  const card = heading.closest('section');
  if (!card) {
    throw new Error('The relations card is not a section');
  }
  return within(card);
}

async function analysisCard() {
  const heading = await screen.findByRole('heading', { name: 'Analyse' });
  const card = heading.closest('section');
  if (!card) {
    throw new Error('The analysis card is not a section');
  }
  return within(card);
}

describe('relations', () => {
  it('shows why a relation is suggested and how sure, and lets the user accept it', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp(`/notes/${base.timer.note.id}`);
    const card = await relationsCard();
    expect(await card.findByRole('link', { name: 'Fiche technique NE555' })).toBeVisible();
    expect(
      card.getByText(
        /^Termes communs\s:\sNE555 et astable · Étiquettes communes\s:\sProjet NE555 · Confiance\s:\s72\s%$/,
      ),
    ).toBeVisible();
    expect(card.getByText(/Rien n’est retenu sans votre accord/)).toBeVisible();

    await user.click(
      card.getByRole('button', { name: /^Accepter la relation avec «\sFiche technique NE555\s»$/ }),
    );
    expect(await screen.findByText('Relation acceptée.')).toBeInTheDocument();
    await waitFor(() => {
      expect(card.getByText('Suggestion acceptée')).toBeVisible();
    });
    expect(core.relations.find((relation) => relation.id === base.suggestion.id)?.status).toBe(
      'accepted',
    );
    // The acceptance is a fact of the timeline; the focus goes on to « Ajouter », nothing left to decide.
    expect(core.events.at(-1)?.eventType).toBe('relation_accepted');
    await waitFor(() => {
      expect(card.getByRole('button', { name: 'Ajouter' })).toHaveFocus();
    });
  });

  it('rejects a suggestion, keeps it aside, and restores it on request', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp(`/notes/${base.timer.note.id}`);
    const card = await relationsCard();
    await user.click(
      await card.findByRole('button', {
        name: /^Rejeter la relation avec «\sFiche technique NE555\s»$/,
      }),
    );
    expect(await screen.findByText('Suggestion rejetée.')).toBeInTheDocument();
    await waitFor(() => {
      expect(card.queryByRole('link', { name: 'Fiche technique NE555' })).not.toBeInTheDocument();
    });
    expect(card.getByText('Aucune relation pour l’instant.')).toBeVisible();

    const toggle = card.getByRole('button', { name: 'Afficher les 2 suggestions rejetées' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(
      card.getByRole('button', { name: /^Rétablir la suggestion «\sFiche technique NE555\s»$/ }),
    );
    expect(await screen.findByText('Suggestion rétablie.')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        card.getByRole('button', {
          name: /^Accepter la relation avec «\sFiche technique NE555\s»$/,
        }),
      ).toBeVisible();
    });
    expect(core.relations.find((relation) => relation.id === base.suggestion.id)?.status).toBe(
      'suggested',
    );
  });

  it('adds a relation chosen by the user, refuses it twice, changes its type and removes it', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp(`/notes/${base.safety.note.id}`);
    const card = await relationsCard();
    await user.click(card.getByRole('button', { name: 'Ajouter' }));
    let dialog = await screen.findByRole('dialog', { name: 'Nouvelle relation' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Type de relation' }),
      'Explique',
    );
    expect(
      within(dialog).getByText(/^Choisissez l’élément à relier à «\sSécurité électrique\s»\.$/),
    ).toBeVisible();
    // The note itself is not offered.
    expect(
      within(dialog).queryByRole('button', { name: 'Sécurité électrique' }),
    ).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Cours Arduino' }));
    expect(await screen.findByText('Relation ajoutée.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Nouvelle relation' })).not.toBeInTheDocument();
    const created = core.relations.find((relation) => relation.relationType === 'explains');
    expect(created).toMatchObject({
      sourceId: base.safety.note.id,
      targetId: base.course.document.id,
      origin: 'user',
      status: 'accepted',
    });
    expect(await card.findByText('Ajoutée par vous')).toBeVisible();
    expect(card.getByText('Explique')).toBeVisible();

    // The same relation twice is refused, in the dialog.
    await user.click(card.getByRole('button', { name: 'Ajouter' }));
    dialog = await screen.findByRole('dialog', { name: 'Nouvelle relation' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Type de relation' }),
      'Explique',
    );
    await user.click(await within(dialog).findByRole('button', { name: 'Cours Arduino' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cette relation existe déjà.',
    );
    await user.keyboard('{Escape}');

    // Its type changes; the menu gets the focus back.
    const menu = card.getByRole('button', {
      name: /^Actions de la relation avec «\sCours Arduino\s»$/,
    });
    await user.click(menu);
    await user.click(await screen.findByRole('menuitem', { name: 'Changer le type…' }));
    const typeDialog = await screen.findByRole('dialog', { name: 'Type de la relation' });
    expect(
      within(typeDialog).getByText(
        /^Relation entre «\sSécurité électrique\s» et «\sCours Arduino\s»\.$/,
      ),
    ).toBeVisible();
    await user.selectOptions(
      within(typeDialog).getByRole('combobox', { name: 'Type de relation' }),
      'Dépend de',
    );
    await user.click(within(typeDialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Type de relation modifié.')).toBeInTheDocument();
    expect(created?.relationType).toBe('depends_on');
    await waitFor(() => {
      expect(card.getByText('Dépend de')).toBeVisible();
    });

    // Removed: it was the user's, it is gone for good.
    await user.click(
      card.getByRole('button', { name: /^Actions de la relation avec «\sCours Arduino\s»$/ }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Retirer' }));
    expect(await screen.findByText('Relation retirée.')).toBeInTheDocument();
    expect(core.relations.some((relation) => relation.id === created?.id)).toBe(false);
  });

  it('shows a relation from the other side with its inverse label', async () => {
    const base = knowledgeBase();
    const explains = seedRelation(
      { kind: 'note', id: base.safety.note.id },
      { kind: 'document', id: base.course.document.id },
      { relationType: 'explains', origin: 'user', status: 'accepted', confidence: null },
    );
    mockNativeRuntime({}, { core: { ...base.core, relations: [explains] } });
    renderApp(`/library/${base.course.document.id}`);
    const card = await relationsCard();
    expect(await card.findByText('Expliqué par')).toBeVisible();
    expect(card.getByRole('link', { name: 'Sécurité électrique' })).toHaveAttribute(
      'href',
      `/notes/${base.safety.note.id}`,
    );
  });
});

describe('analysis', () => {
  it('describes the content, links its terms to a search and shows each stage', async () => {
    const base = knowledgeBase();
    mockNativeRuntime({}, { core: base.core });
    renderApp(`/notes/${base.timer.note.id}`);
    const card = await analysisCard();
    expect(await card.findByText('Français (reconnue dans le texte)')).toBeVisible();
    expect(card.getByText('8 mots · 35 caractères')).toBeVisible();
    expect(card.getByRole('link', { name: /^Rechercher «\sNE555\s»$/ })).toHaveAttribute(
      'href',
      '/search?q=NE555',
    );
    const processing = within(
      card.getByRole('heading', { name: 'Traitement' }).parentElement as HTMLElement,
    );
    const stages = processing.getAllByRole('listitem').map((item) => item.textContent);
    expect(stages).toEqual([
      'NormalisationTerminé',
      'IndexationTerminé',
      'AnalyseTerminé',
      'RelationsTerminé',
    ]);
    expect(card.getByText(/L’extraction de concepts demande un fournisseur d’IA/)).toBeVisible();
    expect(card.queryByRole('button', { name: 'Relancer' })).not.toBeInTheDocument();
  });

  it('says when a stage failed and when it is tried again, and restarts it on request', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp(`/notes/${base.safety.note.id}`);
    const card = await analysisCard();
    expect(await card.findByText('Échec')).toBeVisible();
    expect(card.getByText('Une opération sur la base de données a échoué.')).toBeVisible();
    expect(card.getByText('Nouvel essai dans 2 minutes.')).toBeVisible();
    expect(card.getByText('Les termes apparaîtront une fois l’analyse terminée.')).toBeVisible();
    await user.click(card.getByRole('button', { name: 'Relancer' }));
    expect(await screen.findByText('Traitement relancé.')).toBeInTheDocument();
    expect(core.memory[`note:${base.safety.note.id}`]?.stages?.analysis?.status).toBe('pending');
    await waitFor(() => {
      expect(card.queryByRole('button', { name: 'Relancer' })).not.toBeInTheDocument();
    });
  });

  it('follows the work of the engine as it reports it', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    renderApp(`/notes/${base.safety.note.id}`);
    const card = await analysisCard();
    expect(await card.findByText('Échec')).toBeVisible();
    // The engine finishes the analysis and says so: the card follows.
    core.memory[`note:${base.safety.note.id}`] = {
      terms: [{ term: 'disjoncteur', label: 'disjoncteur', weight: 2, occurrences: 2 }],
    };
    await act(async () => {
      await emit('memory:changed', { kind: 'note', id: base.safety.note.id, stage: 'analysis' });
    });
    expect(
      await card.findByRole('link', { name: /^Rechercher «\sdisjoncteur\s»$/ }, { timeout: 3000 }),
    ).toBeVisible();
    expect(card.queryByText('Échec')).not.toBeInTheDocument();
  });
});

describe('memory overview', () => {
  it('counts the processing of the knowledge base and restarts what failed', async () => {
    const base = knowledgeBase();
    const { core } = mockNativeRuntime({}, { core: base.core });
    const { user } = renderApp('/settings/storage');
    const heading = await screen.findByRole('heading', { name: 'Moteur de mémoire' });
    const card = within(heading.closest('div')?.parentElement?.parentElement as HTMLElement);
    expect(await card.findByText('1 suggestion de relation attend votre avis.')).toBeVisible();
    const count = (label: string) => card.getByText(label).nextElementSibling?.textContent;
    expect(count('Nouvel essai prévu')).toBe('1');
    expect(count('En attente')).toBe('1');
    expect(count('Terminés')).toBe('10');
    await user.click(card.getByRole('button', { name: 'Relancer les traitements en échec' }));
    expect(await screen.findByText('1 traitement relancé.')).toBeInTheDocument();
    expect(core.memory[`note:${base.safety.note.id}`]?.stages?.analysis?.status).toBe('pending');
  });
});
