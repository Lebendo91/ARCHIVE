import { describe, expect, it } from 'vitest';
import { parseCsv } from './DocumentPreview';

describe('parseCsv', () => {
  it('uses the separator the first line uses most', () => {
    expect(parseCsv('a,b,c\n1,2,3\n', 10).rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('référence;valeur\nR1;10,5 k\n', 10).rows).toEqual([
      ['référence', 'valeur'],
      ['R1', '10,5 k'],
    ]);
    expect(parseCsv('a\tb\n1\t2', 10).rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads quoted cells with separators, doubled quotes and line breaks', () => {
    const { rows } = parseCsv('nom,note\n"Dupont, Jean","Il a dit ""oui""\nhier"\n', 10);
    expect(rows).toEqual([
      ['nom', 'note'],
      ['Dupont, Jean', 'Il a dit "oui"\nhier'],
    ]);
  });

  it('accepts Windows line endings and a missing final line break', () => {
    expect(parseCsv('a;b\r\n1;2\r\n3;4', 10).rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('keeps empty cells and stops after the requested rows', () => {
    expect(parseCsv('a,,c\n', 10).rows).toEqual([['a', '', 'c']]);
    const long = ['h1,h2', ...Array.from({ length: 20 }, (_, index) => `${String(index)},x`)].join(
      '\n',
    );
    const parsed = parseCsv(long, 5);
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.truncated).toBe(true);
    expect(parseCsv('h\n1\n', 2)).toEqual({ rows: [['h'], ['1']], truncated: false });
    expect(parseCsv('', 5)).toEqual({ rows: [], truncated: false });
  });
});
