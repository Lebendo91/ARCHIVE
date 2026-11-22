import type { DateField, SearchKind } from '@/services/search';

/**
 * Rule-based reading of a few expressions in a search (specification §9.5): a period (« la semaine dernière »,
 * « en mars », « last week »…), optionally after a verb that says which date (« importés », « modifiées »),
 * and a kind at the start followed by a connector (« notes sur… », « documents about… »). What is recognized
 * becomes an explicit filter, shown as such; nothing else is guessed, and the user can always search the
 * text as typed. Periods are computed in the local calendar.
 */
export interface RecognizedDate {
  field: DateField;
  /** Start of the period (inclusive), in milliseconds. */
  from: number;
  /** End of the period (exclusive). */
  to: number;
  /** The words recognized, as typed. */
  phrase: string;
}

export interface Interpretation {
  /** The words left to search. */
  text: string;
  kind?: SearchKind;
  /** The words recognized as a kind, as typed. */
  kindPhrase?: string;
  date?: RecognizedDate;
}

const WORD_END = '(?![\\p{L}\\p{N}])';
const WORD_START = '(?<![\\p{L}\\p{N}])';

/**
 * Lower case without accents, one UTF-16 unit for one, so that the positions found in it are those of the text
 * typed.
 */
function flatten(text: string): string {
  let flat = '';
  for (const character of text) {
    const plain = character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    flat += plain.length === character.length ? plain : character;
  }
  return flat.replace(/[’‘]/g, "'");
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday of the week of `date`. */
function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
}

const MONTHS: Record<string, number> = {
  janvier: 0,
  january: 0,
  fevrier: 1,
  february: 1,
  mars: 2,
  march: 2,
  avril: 3,
  april: 3,
  mai: 4,
  may: 4,
  juin: 5,
  june: 5,
  juillet: 6,
  july: 6,
  aout: 7,
  august: 7,
  septembre: 8,
  september: 8,
  octobre: 9,
  october: 9,
  novembre: 10,
  november: 10,
  decembre: 11,
  december: 11,
};

interface PeriodRule {
  pattern: string;
  range: (now: Date, groups: (string | undefined)[]) => [Date, Date] | null;
}

const PERIODS: PeriodRule[] = [
  {
    pattern: "aujourd'hui|aujourdhui|today",
    range: (now) => [startOfDay(now), addDays(now, 1)],
  },
  {
    pattern: 'hier|yesterday',
    range: (now) => [addDays(now, -1), startOfDay(now)],
  },
  {
    pattern: 'cette semaine|this week',
    range: (now) => [startOfWeek(now), addDays(startOfWeek(now), 7)],
  },
  {
    pattern: 'la semaine (?:derniere|passee)|semaine derniere|last week',
    range: (now) => [addDays(startOfWeek(now), -7), startOfWeek(now)],
  },
  {
    pattern: 'ce mois(?:-ci| ci)?|this month',
    range: (now) => [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ],
  },
  {
    pattern: 'le mois (?:dernier|passe)|mois dernier|last month',
    range: (now) => [
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    ],
  },
  {
    pattern: 'cette annee|this year',
    range: (now) => [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)],
  },
  {
    pattern: "l'annee (?:derniere|passee)|l'an (?:dernier|passe)|annee derniere|last year",
    range: (now) => [new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1)],
  },
  {
    pattern: `(?:en|in) (${Object.keys(MONTHS).join('|')})(?: (\\d{4}))?`,
    range: (now, [name, year]) => {
      const month = MONTHS[name ?? ''];
      if (month === undefined) {
        return null;
      }
      // Without a year, the last such month that has begun.
      const fullYear = year
        ? Number(year)
        : month > now.getMonth()
          ? now.getFullYear() - 1
          : now.getFullYear();
      return [new Date(fullYear, month, 1), new Date(fullYear, month + 1, 1)];
    },
  },
  {
    pattern:
      '(?:depuis|ces|les) (\\d{1,3}) (?:derniers )?jours|(?:(?:in|over) the )?(?:last|past) (\\d{1,3}) days',
    range: (now, [french, english]) => {
      const days = Number(french ?? english);
      return days > 0 ? [addDays(now, -(days - 1)), addDays(now, 1)] : null;
    },
  },
];

const ADDED_VERBS =
  'importe(?:e)?s?|ajoute(?:e)?s?|cree(?:e)?s?|ecrite?s?|imported|added|created|written';
const UPDATED_VERBS = 'modifie(?:e)?s?|mise?s? a jour|modified|updated|edited|changed';

const PERIOD_PATTERN = new RegExp(
  `${WORD_START}(?:(${ADDED_VERBS})\\s+|(${UPDATED_VERBS})\\s+)?(?:${PERIODS.map(
    (rule, index) => `(?<p${String(index)}>${rule.pattern})`,
  ).join('|')})${WORD_END}`,
  'u',
);

const KINDS: { pattern: RegExp; kind?: SearchKind }[] = [
  {
    pattern:
      /^(?:mes |tous les |toutes les |les |my |all )?(?:documents?|docs?|fichiers?|files?)(?![\p{L}\p{N}])/u,
    kind: 'document',
  },
  {
    pattern: /^(?:mes |toutes les |les |my |all )?notes?(?![\p{L}\p{N}])/u,
    kind: 'note',
  },
  { pattern: /^(?:tout|everything|anything)(?![\p{L}\p{N}])/u },
];

const CONNECTOR =
  /^\s+(?:sur|a propos de|au sujet de|concernant|liee?s? a|relatif(?:s)? a|relatives? a|qui parlent de|qui mentionnent|mentionnant|about|on|concerning|regarding|related to|relating to|mentioning)(?![\p{L}\p{N}])/u;

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function interpret(input: string, now: Date = new Date()): Interpretation {
  let text = input;
  let date: RecognizedDate | undefined;

  const period = PERIOD_PATTERN.exec(flatten(text));
  const index = PERIODS.findIndex((_, rule) => period?.groups?.[`p${String(rule)}`] !== undefined);
  const rule = PERIODS[index];
  const matched = period?.groups?.[`p${String(index)}`];
  if (period && rule && matched !== undefined) {
    // The rule read again on its own words gives its groups (month, year, number of days).
    const groups = new RegExp(`^(?:${rule.pattern})$`, 'u').exec(matched)?.slice(1) ?? [];
    const range = rule.range(now, groups);
    if (range) {
      date = {
        field: period[2] ? 'updated' : 'added',
        from: range[0].getTime(),
        to: range[1].getTime(),
        phrase: input.slice(period.index, period.index + period[0].length),
      };
      text = `${text.slice(0, period.index)} ${text.slice(period.index + period[0].length)}`;
    }
  }

  const flat = flatten(text).trimStart();
  const offset = text.length - text.trimStart().length;
  for (const rule of KINDS) {
    const match = rule.pattern.exec(flat);
    if (!match) {
      continue;
    }
    const rest = flat.slice(match[0].length);
    const connector = CONNECTOR.exec(rest);
    if (!connector && !(date && rest.trim() === '' && rule.kind)) {
      break;
    }
    const end = offset + match[0].length + (connector ? connector[0].length : 0);
    const kindPhrase = tidy(text.slice(offset, offset + match[0].length));
    text = text.slice(end);
    return {
      text: tidy(text),
      ...(rule.kind ? { kind: rule.kind, kindPhrase } : {}),
      ...(date ? { date } : {}),
    };
  }
  return { text: tidy(text), ...(date ? { date } : {}) };
}
