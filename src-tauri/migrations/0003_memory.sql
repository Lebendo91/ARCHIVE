-- ARCHIVE schema v3: memory engine (specification §10, ARCHITECTURE.md §8).
--
-- What the engine derives from the documents and notes lives here, apart from their content: their processing,
-- the normalized description of their content, their distinctive terms, and the concepts an AI provider may
-- extract. The relations it suggests go into `relations` (schema v1), with their origin, status, confidence and
-- provenance. Everything here can be computed again from the documents and notes, except the user's decisions
-- on suggestions, which stay in `relations`.

-- Asynchronous stages of the pipeline (Import → Extraction → Normalization → Indexing → Analysis →
-- Relationships), one row per item and stage. Import, extraction and indexing are done when the item is
-- written: their status is read from the item itself.
CREATE TABLE processing_jobs (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document', 'note')),
  entity_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('normalization', 'analysis', 'relations')),
  -- pending: waiting for its time; processing: being run; failed: will be tried again (run_after);
  -- needs_attention: given up after several failures, until the user asks for a new try.
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'needs_attention')),
  -- Raised by every new request for the stage: a result computed for an older request is not recorded as
  -- the outcome of the newer one, which runs again.
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation >= 1),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- Stable error code of the last failure (never any content of the item).
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) BETWEEN 1 AND 200),
  run_after INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id, stage)
) WITHOUT ROWID;
CREATE INDEX processing_jobs_due ON processing_jobs (run_after) WHERE status IN ('pending', 'failed');

-- Normalized description of the content of an item (specification §10.2): what the file declares or what can
-- be counted or verified, never invented. Unknown values stay NULL.
CREATE TABLE content_profiles (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document', 'note')),
  entity_id TEXT NOT NULL,
  -- Title, author and dates declared inside the file (Word properties, PDF information).
  title_in_file TEXT CHECK (title_in_file IS NULL OR length(title_in_file) BETWEEN 1 AND 500),
  author TEXT CHECK (author IS NULL OR length(author) BETWEEN 1 AND 500),
  authored_at INTEGER,
  revised_at INTEGER,
  page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
  -- Primary language subtag (« fr », « en »…), declared by the file or detected from its common words.
  language TEXT CHECK (language IS NULL OR length(language) BETWEEN 2 AND 8),
  language_source TEXT CHECK (language_source IS NULL OR language_source IN ('declared', 'detected')),
  characters INTEGER NOT NULL CHECK (characters >= 0),
  words INTEGER NOT NULL CHECK (words >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id),
  CHECK ((language IS NULL) = (language_source IS NULL))
) WITHOUT ROWID;

-- Distinctive terms of an item (analysis without AI): the words that characterize it in the knowledge base,
-- with their weight. The basis of the relationships suggested between items.
CREATE TABLE entity_terms (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document', 'note')),
  entity_id TEXT NOT NULL,
  -- Folded form (lowercase, without accents), as the search index holds it.
  term TEXT NOT NULL CHECK (length(term) BETWEEN 1 AND 100),
  -- Form shown to the user: the most frequent spelling in the item.
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  weight REAL NOT NULL CHECK (weight > 0),
  occurrences INTEGER NOT NULL CHECK (occurrences > 0),
  PRIMARY KEY (entity_type, entity_id, term)
) WITHOUT ROWID;
CREATE INDEX entity_terms_term ON entity_terms (term);

-- Words of the full-text index with the number of passages holding them, per column: how common a word is
-- in the knowledge base, read without scanning the index.
CREATE VIRTUAL TABLE search_vocabulary USING fts5vocab(search_index, 'col');

-- Concepts extracted by an AI provider (specification §10.3), kept apart from the content. Each mention keeps
-- its source (item, page, excerpt) and its provenance (provider, model). Nothing is written here without a
-- configured provider.
CREATE TABLE concepts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  name_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('technical_term', 'person', 'organization', 'technology', 'subject',
                                     'method', 'product', 'project')),
  created_at INTEGER NOT NULL,
  UNIQUE (name_key, kind)
);
CREATE TABLE concept_mentions (
  id TEXT PRIMARY KEY NOT NULL,
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('document', 'note')),
  entity_id TEXT NOT NULL,
  page INTEGER CHECK (page IS NULL OR page >= 1),
  excerpt TEXT CHECK (excerpt IS NULL OR length(excerpt) <= 1000),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provenance_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX concept_mentions_entity ON concept_mentions (entity_type, entity_id);
CREATE INDEX concept_mentions_concept ON concept_mentions (concept_id);

-- Version of the rules of the engine: when it differs from the application's, every item is processed again.
CREATE TABLE memory_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at INTEGER
);
INSERT INTO memory_state (id, version, updated_at) VALUES (1, 0, NULL);
