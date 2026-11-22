import { describe, expect, it } from 'vitest';
import { markdownToNote, noteToMarkdown } from './markdown';

const SOURCE = `# Diodes

Une **jonction PN** ne conduit que dans un *sens*, avec un seuil de \`0,6 V\`.

## Mesures

- Montage direct
- Montage inverse

1. Relever la caractéristique
2. Comparer avec la fiche

- [x] Câbler le montage
- [ ] Mesurer le courant

| Diode | Seuil |
| --- | --- |
| 1N4148 | 0,6 V |

> Toujours limiter le courant.

\`\`\`
I = (E - 0,6) / R
\`\`\`

[Fiche technique](https://example.com/1n4148) et [loi d’Ohm](archive://note/0192e4c1-0000-7000-8000-000000000001)
`;

describe('Markdown conversion', () => {
  it('reads every block and mark the editor knows', () => {
    const { content, text } = markdownToNote(SOURCE);
    expect(content.content?.map((node) => node.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'taskList',
      'table',
      'blockquote',
      'codeBlock',
      'paragraph',
    ]);
    expect(text.split('\n')[0]).toBe('Diodes');
    expect(text).toContain('Une jonction PN ne conduit que dans un sens, avec un seuil de 0,6 V.');
    expect(text).toContain('I = (E - 0,6) / R');
  });

  it('writes the same structure back, and reads its own output identically', () => {
    const { content } = markdownToNote(SOURCE);
    const markdown = noteToMarkdown(content);
    for (const fragment of [
      '# Diodes',
      '**jonction PN**',
      '*sens*',
      '`0,6 V`',
      '## Mesures',
      '- Montage direct',
      '1. Relever la caractéristique',
      '- [x] Câbler le montage',
      '- [ ] Mesurer le courant',
      '> Toujours limiter le courant.',
      'I = (E - 0,6) / R',
      '[Fiche technique](https://example.com/1n4148)',
      '[loi d’Ohm](archive://note/0192e4c1-0000-7000-8000-000000000001)',
    ]) {
      expect(markdown).toContain(fragment);
    }
    expect(markdown).toMatch(/\|\s*1N4148\s*\|\s*0,6 V\s*\|/);
    expect(markdownToNote(markdown).content).toEqual(content);
  });

  it('keeps internal links as relations, and drops images, raw HTML and unsafe addresses', () => {
    const { content, links } = markdownToNote(
      [
        '[Ohm](archive://note/0192e4c1-0000-7000-8000-000000000001)',
        '[NE555](archive://document/0192e4c1-0000-7000-8000-000000000002)',
        '![schéma](https://example.com/schema.png)',
        '<img src="https://example.com/pixel.gif"><script>alert(1)</script>',
        '[piège](javascript:alert(1)) [fichier](file:///C:/Windows/system.ini)',
      ].join('\n\n'),
    );
    expect(links).toEqual([
      { kind: 'note', id: '0192e4c1-0000-7000-8000-000000000001' },
      { kind: 'document', id: '0192e4c1-0000-7000-8000-000000000002' },
    ]);
    const stored = JSON.stringify(content);
    for (const absent of ['schema.png', 'pixel.gif', '<script', 'javascript:', 'file://']) {
      expect(stored).not.toContain(absent);
    }
  });
});
