-- ARCHIVE schema v2: full-text search (specification §9, ARCHITECTURE.md §9).
--
-- The index is derived data: it is rebuilt from the documents, notes, workspaces and tags whenever its
-- version (search_index_state) differs from the one the application expects, and kept up to date by the
-- write transactions of the core. Nothing in it is ever the only copy of anything.

-- One row per passage of a document or a note (a page of a PDF, or about 2,000 characters of text), and one
-- row per workspace and per tag. The title, the tags and the metadata are repeated on every passage, so that
-- a query whose words are spread over the title and the text still finds the passage.
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  -- Page of a PDF document (1-based), NULL for text without pages.
  page UNINDEXED,
  title,
  body,
  tags,
  -- Original file name, declared title and author of a document.
  meta,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Titles cut into trigrams: part of a word (« 555 » in « NE555 », « ristor » in « transistor ») finds the item.
CREATE VIRTUAL TABLE search_titles USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  tokenize = 'trigram remove_diacritics 1'
);

-- Rows of the two indexes held by each entity: an entity's rows are replaced by row number, without scanning
-- the indexes (their entity columns are not indexed).
CREATE TABLE search_entries (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  index_name TEXT NOT NULL CHECK (index_name IN ('text', 'title')),
  row_id INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id, index_name, row_id)
) WITHOUT ROWID;

CREATE TABLE search_index_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  -- Version of the indexing rules the rows were built with; 0 until the first build.
  version INTEGER NOT NULL CHECK (version >= 0),
  built_at INTEGER NOT NULL
);
INSERT INTO search_index_state (id, version, built_at) VALUES (1, 0, 0);

-- Queries the user ran (spec §9.2: history and recent queries), each once, erasable.
CREATE TABLE search_history (
  id TEXT PRIMARY KEY NOT NULL,
  query TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 300),
  -- Normalized query (case, accents, spaces): the same search typed twice is one entry.
  query_key TEXT NOT NULL UNIQUE,
  searched_at INTEGER NOT NULL
);
CREATE INDEX search_history_searched_at ON search_history (searched_at);
