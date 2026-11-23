import { describe, expect, it } from 'vitest';
import type { SourcePassage } from '@/services/ai';
import { analyzeAnswer, answerToCopy, citedNumbers, splitCitations } from './answer';

function source(index: number, page: number | null = null): SourcePassage {
  return {
    index,
    kind: 'document',
    id: `doc-${index}`,
    title: `Cours ${index}`,
    page,
    excerpt: 'Extrait',
    chars: 100,
  };
}

describe('citations of an answer', () => {
  it('reads every form of citation, each number once', () => {
    expect(citedNumbers('Le NE555 [S1] oscille [S2][S1], voir [S3, S4] et [S5; 6].')).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(citedNumbers('Rien à citer [Sx] [S] [1] S2')).toEqual([]);
  });

  it('cuts a text into plain pieces and citations, without the tags of the instructions', () => {
    expect(splitCitations('[general] Un fait [S2], puis la suite.')).toEqual([
      { kind: 'text', text: 'Un fait ', numbers: [] },
      { kind: 'citation', text: '[S2]', numbers: [2] },
      { kind: 'text', text: ', puis la suite.', numbers: [] },
    ]);
    expect(splitCitations('Avant [interprétation] après')).toEqual([
      { kind: 'text', text: 'Avant après', numbers: [] },
    ]);
  });

  it('only verifies the citations of passages really sent, and labels each paragraph', () => {
    const answer = [
      'Le montage astable oscille sans cesse [S1].',
      '',
      '[general] Le NE555 a été créé en 1971.',
      '',
      '[interpretation] On peut en conclure qu’il convient à un clignotant.',
      '',
      'Un détail sans source.',
      '',
      'Une citation inventée [S9].',
      '',
      '## Résumé',
      '',
      '- point cité [S2]',
      '- autre point',
    ].join('\n');
    const analyzed = analyzeAnswer(answer, [source(1, 3), source(2)]);
    expect(analyzed.verified).toEqual([1, 2]);
    expect(analyzed.unverified).toEqual([9]);
    const labels = analyzed.blocks
      .filter((block) => block.token.type !== 'space')
      .map((block) => [block.token.type, block.label]);
    expect(labels).toEqual([
      ['paragraph', 'archive'],
      ['paragraph', 'general'],
      ['paragraph', 'interpretation'],
      ['paragraph', 'unsourced'],
      // A citation of a passage that was never sent proves nothing.
      ['paragraph', 'unsourced'],
      ['heading', null],
      ['list', 'archive'],
    ]);
  });

  it('copies the answer without the tags, keeping the citations', () => {
    expect(answerToCopy('[general] Un fait.\n\nUn autre [S1].')).toBe('Un fait.\n\nUn autre [S1].');
  });
});
