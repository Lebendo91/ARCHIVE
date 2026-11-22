//! Memory engine (specification §10, ARCHITECTURE.md §8): it turns the documents and notes into structured
//! knowledge, through a pipeline whose every stage has its own status:
//!
//! **Import → Extraction → Normalization → Indexing → Analysis → Relationships.**
//!
//! Import, extraction and indexing happen when an item is written (Phases 4 and 6). The three other stages run
//! in the background, from a persistent queue ([`queue`]) that a worker thread empties ([`worker`]):
//! normalization describes the content ([`normalize`]), analysis finds its distinctive terms ([`analysis`]),
//! and the relationships stage suggests links between items that share them ([`relate`]). None of it needs AI;
//! concepts are extracted only through a provider-independent interface, once a provider is configured
//! ([`concepts`]).
//!
//! Everything the engine writes is derived data, kept apart from the content and computed again whenever an
//! item changes, except the user's decisions on suggested relations.

pub mod analysis;
pub mod concepts;
pub mod normalize;
pub mod queue;
pub mod relate;
pub mod status;
pub mod worker;

#[cfg(test)]
mod tests;

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::error::AppResult;
use crate::util::now_ms;

pub use crate::services::notes::LinkKind as ItemKind;

/// Version of the rules of the engine: changing what is computed, or how, bumps it so that every item is
/// processed again at the next start.
pub const MEMORY_VERSION: i64 = 1;

/// Text and metadata of a document or a note, as the engine reads them.
#[derive(Debug, Clone, PartialEq)]
pub struct ItemText {
    pub title: String,
    pub text: String,
    /// Metadata read from the file at import (documents), an empty object for notes.
    pub metadata: serde_json::Value,
    pub workspace_id: Option<String>,
    pub trashed: bool,
}

/// The current text of an item, or `None` if it no longer exists.
pub fn load(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<Option<ItemText>> {
    let row = match kind {
        ItemKind::Document => connection
            .query_row(
                "SELECT d.title, coalesce(c.content_text, ''), d.metadata_json, d.workspace_id,
                        d.deleted_at IS NOT NULL
                 FROM documents d LEFT JOIN document_contents c ON c.document_id = d.id WHERE d.id = ?1",
                [id],
                |row| {
                    Ok(ItemText {
                        title: row.get(0)?,
                        text: row.get(1)?,
                        metadata: crate::repo::json_value(&row.get::<_, String>(2)?),
                        workspace_id: row.get(3)?,
                        trashed: row.get(4)?,
                    })
                },
            )
            .optional()?,
        ItemKind::Note => connection
            .query_row(
                "SELECT title, content_text, workspace_id, deleted_at IS NOT NULL FROM notes WHERE id = ?1",
                [id],
                |row| {
                    Ok(ItemText {
                        title: row.get(0)?,
                        text: row.get(1)?,
                        metadata: serde_json::Value::Object(serde_json::Map::new()),
                        workspace_id: row.get(2)?,
                        trashed: row.get(3)?,
                    })
                },
            )
            .optional()?,
    };
    Ok(row)
}

/// Whether a document or a note exists (in the trash or not).
pub fn exists(connection: &Connection, kind: ItemKind, id: &str) -> AppResult<bool> {
    let sql = match kind {
        ItemKind::Document => "SELECT 1 FROM documents WHERE id = ?1",
        ItemKind::Note => "SELECT 1 FROM notes WHERE id = ?1",
    };
    Ok(connection
        .query_row(sql, [id], |_| Ok(()))
        .optional()?
        .is_some())
}

/// Removes what the engine derived from an item deleted permanently. Its relations are removed with it by the
/// repositories.
pub fn forget(transaction: &Transaction<'_>, kind: ItemKind, id: &str) -> AppResult<()> {
    let kind = kind.entity();
    for table in [
        "processing_jobs",
        "content_profiles",
        "entity_terms",
        "concept_mentions",
    ] {
        transaction.execute(
            &format!("DELETE FROM {table} WHERE entity_type = ?1 AND entity_id = ?2"),
            params![kind, id],
        )?;
    }
    Ok(())
}

/// Queues every document and note when the engine's rules changed (or it never ran on this database): returns
/// the number of items queued, or `None` if the engine was current. Jobs interrupted by the last stop are
/// queued again in any case.
pub fn ensure_current(transaction: &Transaction<'_>) -> AppResult<Option<usize>> {
    let interrupted = queue::reset_interrupted(transaction)?;
    if interrupted > 0 {
        log::info!("memory engine: {interrupted} interrupted jobs queued again");
    }
    let version: i64 =
        transaction.query_row("SELECT version FROM memory_state WHERE id = 1", [], |row| {
            row.get(0)
        })?;
    if version == MEMORY_VERSION {
        return Ok(None);
    }
    let now = now_ms();
    let mut queued = 0;
    for kind in [ItemKind::Document, ItemKind::Note] {
        let table = match kind {
            ItemKind::Document => "documents",
            ItemKind::Note => "notes",
        };
        let ids: Vec<String> = transaction
            .prepare(&format!(
                "SELECT id FROM {table} WHERE deleted_at IS NULL ORDER BY updated_at DESC"
            ))?
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        for id in ids {
            queue::enqueue(transaction, kind, &id, queue::JobStage::Normalization, now)?;
            queued += 1;
        }
    }
    transaction.execute(
        "UPDATE memory_state SET version = ?1, updated_at = ?2 WHERE id = 1",
        params![MEMORY_VERSION, now],
    )?;
    Ok(Some(queued))
}
