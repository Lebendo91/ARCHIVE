import { describe, expect, it } from 'vitest';
import { interpret } from './interpret';

// Sunday 22 November 2026, 15:00: the week began on Monday the 16th.
const NOW = new Date(2026, 10, 22, 15, 0);
const day = (month: number, date: number, year = 2026) => new Date(year, month, date).getTime();

describe('interpret', () => {
  it('reads a period, with the date it is about', () => {
    expect(interpret('documents importés la semaine dernière', NOW)).toEqual({
      text: '',
      kind: 'document',
      kindPhrase: 'documents',
      date: {
        field: 'added',
        from: day(10, 9),
        to: day(10, 16),
        phrase: 'importés la semaine dernière',
      },
    });
    expect(interpret('notes modifiées hier', NOW).date).toEqual({
      field: 'updated',
      from: day(10, 21),
      to: day(10, 22),
      phrase: 'modifiées hier',
    });
    expect(interpret('Documents imported last week', NOW).kind).toBe('document');
    expect(interpret('rapports d’aujourd’hui', NOW).date?.from).toBe(day(10, 22));
    expect(interpret('ce mois-ci', NOW).date).toMatchObject({ from: day(10, 1), to: day(11, 1) });
    expect(interpret('le mois dernier', NOW).date).toMatchObject({
      from: day(9, 1),
      to: day(10, 1),
    });
    expect(interpret("l'année dernière", NOW).date).toMatchObject({
      from: day(0, 1, 2025),
      to: day(0, 1),
    });
    expect(interpret('depuis 7 jours', NOW).date).toMatchObject({
      from: day(10, 16),
      to: day(10, 23),
    });
    expect(interpret('in the last 3 days', NOW).date).toMatchObject({ from: day(10, 20) });
  });

  it('places a month without year in the past', () => {
    expect(interpret('cours en mars', NOW)).toEqual({
      text: 'cours',
      date: { field: 'added', from: day(2, 1), to: day(3, 1), phrase: 'en mars' },
    });
    expect(interpret('en décembre', NOW).date).toMatchObject({
      from: day(11, 1, 2025),
      to: day(0, 1),
    });
    expect(interpret('in May 2024', NOW).date).toMatchObject({
      from: day(4, 1, 2024),
      to: day(5, 1, 2024),
    });
  });

  it('reads a kind only before a connector or a period', () => {
    expect(interpret('Mes notes sur la sécurité électrique', NOW)).toEqual({
      text: 'la sécurité électrique',
      kind: 'note',
      kindPhrase: 'Mes notes',
    });
    expect(interpret('Documents about Arduino interrupts', NOW)).toEqual({
      text: 'Arduino interrupts',
      kind: 'document',
      kindPhrase: 'Documents',
    });
    expect(interpret('Everything related to the NE555', NOW)).toEqual({ text: 'the NE555' });
    // A title is searched as typed.
    expect(interpret('notes de cours', NOW)).toEqual({ text: 'notes de cours' });
    expect(interpret('notes', NOW)).toEqual({ text: 'notes' });
    expect(interpret('documentation technique', NOW)).toEqual({ text: 'documentation technique' });
  });

  it('leaves words that only look like dates', () => {
    expect(interpret('hiérarchie des normes', NOW)).toEqual({ text: 'hiérarchie des normes' });
    expect(interpret('may the force', NOW)).toEqual({ text: 'may the force' });
    expect(interpret('NE555', NOW)).toEqual({ text: 'NE555' });
  });
});
