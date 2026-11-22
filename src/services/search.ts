import type { DateField } from '@/types/bindings/DateField';
import type { SearchCounts } from '@/types/bindings/SearchCounts';
import type { SearchHistoryEntry } from '@/types/bindings/SearchHistoryEntry';
import type { SearchHit } from '@/types/bindings/SearchHit';
import type { SearchKind } from '@/types/bindings/SearchKind';
import type { SearchRequest } from '@/types/bindings/SearchRequest';
import type { SearchResults } from '@/types/bindings/SearchResults';
import type { SearchSort } from '@/types/bindings/SearchSort';
import type { TextSegment } from '@/types/bindings/TextSegment';
import { callCommand } from './tauri';

export type {
  DateField,
  SearchCounts,
  SearchHistoryEntry,
  SearchHit,
  SearchKind,
  SearchRequest,
  SearchResults,
  SearchSort,
  TextSegment,
};

/** Searches the full-text index of the core (specification §9). */
export function searchQuery(request: SearchRequest): Promise<SearchResults> {
  return callCommand('search_query', { request });
}

export function searchHistory(limit = 10): Promise<SearchHistoryEntry[]> {
  return callCommand('search_history_list', { limit });
}

/** Records a search the user ran: a result opened, or the search page submitted. */
export function recordSearch(query: string): Promise<SearchHistoryEntry> {
  return callCommand('search_history_record', { query });
}

export function deleteSearch(id: string): Promise<null> {
  return callCommand('search_history_delete', { id });
}

export function clearSearchHistory(): Promise<null> {
  return callCommand('search_history_clear');
}
