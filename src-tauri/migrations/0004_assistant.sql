-- ARCHIVE schema v4: AI assistant (specification §14, ARCHITECTURE.md §11).
--
-- The keys of the providers are not here: `ai_providers` (schema v1) only names their entry in the operating
-- system's credential store. A conversation keeps what was asked, what was answered and, with each answer,
-- which passages of the knowledge base were sent (their reference and a short excerpt, never more), so that
-- every citation can be checked later.

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  -- What the user chose to share: {"items":[{"kind":"document","id":"…"}],"workspaceId":"…"}.
  scope_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(scope_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_updated_at ON conversations (updated_at);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) <= 400000),
  -- complete; for answers also: streaming (being written), interrupted (stopped, or ARCHIVE closed), failed,
  -- refused (declined by the model), blocked (stopped by the provider's filters).
  status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'interrupted', 'failed', 'refused', 'blocked')),
  -- Answers: the passages sent with the question, numbered S1…Sn.
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json)),
  -- Answers: provider, model, usage, error or refusal.
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, position)
);
