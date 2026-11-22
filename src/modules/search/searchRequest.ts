import type {
  DateField,
  SearchHit,
  SearchKind,
  SearchRequest,
  SearchSort,
} from '@/services/search';
import { interpret, type RecognizedDate } from './interpret';

export interface SearchFilters {
  /** Kinds chosen by the user; an empty list says « every kind » explicitly (a recognized kind no longer applies). */
  kinds?: SearchKind[];
  workspaceId?: string;
  tagId?: string;
  dateField?: DateField;
  dateFrom?: number;
  dateTo?: number;
  favoritesOnly?: boolean;
  sort?: SearchSort;
}

/** What was recognized in the text and applied as a filter (shown to the user, who can undo it). */
export interface AppliedInterpretation {
  kind?: SearchKind;
  date?: RecognizedDate;
}

/**
 * The request for what was typed. Recognized dates and kinds become filters, unless the text is searched as
 * typed or a filter of the same nature was chosen explicitly (it wins).
 */
export function searchRequest(
  text: string,
  filters: SearchFilters,
  options: { literal: boolean; limit: number; offset?: number; now?: Date },
): { request: SearchRequest; applied: AppliedInterpretation } {
  const interpretation = options.literal ? null : interpret(text, options.now);
  const kind =
    interpretation?.kind && filters.kinds === undefined ? interpretation.kind : undefined;
  const date =
    interpretation?.date && filters.dateFrom === undefined && filters.dateTo === undefined
      ? interpretation.date
      : undefined;
  // The words left once what was recognized is taken out; a final space still says the last word is complete.
  const remaining = interpretation ? interpretation.text : text;
  const words = remaining !== '' && /\s$/.test(text) ? `${remaining.trimEnd()} ` : remaining;
  const request: SearchRequest = {
    text: words,
    favoritesOnly: filters.favoritesOnly ?? false,
    sort: filters.sort ?? 'relevance',
    limit: options.limit,
    offset: options.offset ?? 0,
  };
  const kinds = kind ? [kind] : filters.kinds;
  if (kinds?.length) {
    request.kinds = kinds;
  }
  if (filters.workspaceId) {
    request.workspaceId = filters.workspaceId;
  }
  if (filters.tagId) {
    request.tagId = filters.tagId;
  }
  if (date) {
    request.dateField = date.field;
    request.dateFrom = date.from;
    request.dateTo = date.to;
  } else {
    if (filters.dateField) {
      request.dateField = filters.dateField;
    }
    if (filters.dateFrom !== undefined) {
      request.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo !== undefined) {
      request.dateTo = filters.dateTo;
    }
  }
  return { request, applied: { ...(kind ? { kind } : {}), ...(date ? { date } : {}) } };
}

/** Where a result leads: its page, or for a tag, every item carrying it. */
export function resultPath(hit: Pick<SearchHit, 'kind' | 'id'>): string {
  switch (hit.kind) {
    case 'document':
      return `/library/${hit.id}`;
    case 'note':
      return `/notes/${hit.id}`;
    case 'workspace':
      return `/workspaces/${hit.id}`;
    case 'tag':
      return `/search?tag=${hit.id}`;
  }
}
