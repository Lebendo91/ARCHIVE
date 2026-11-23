//! The full-text index (specification §9, ARCHITECTURE.md §9).
//!
//! It is derived from the documents, notes, workspaces and tags. Every write that changes an indexed text (or
//! removes an entity) marks the entity with [`mark`]; `Database::write` then calls [`flush_pending`] just
//! before committing, so the rows of each changed entity are rebuilt once, in the same transaction: the
//! index never disagrees with the data. It is rebuilt entirely whenever [`INDEX_VERSION`] changes.

use std::cell::RefCell;
use std::collections::HashSet;

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::error::AppResult;
use crate::repo::EntityKind;
use crate::util::now_ms;

/// Version of the indexing rules: changing what is indexed, or how, bumps it so that the index is rebuilt.
pub const INDEX_VERSION: i64 = 1;
/// Separator of the pages of a PDF in its extracted text (a form feed, written by pdf.js in the interface).
pub const PAGE_BREAK: char = '\u{000C}';
/// Size of a passage of a text without pages, in bytes (about as many characters in Latin scripts).
const PASSAGE_BYTES: usize = 2_000;
/// A longer page is cut too, each part keeping its page number.
const PAGE_BYTES: usize = 8_000;

thread_local! {
    /// Entities changed by the write transaction running on this thread.
    static PENDING: RefCell<Vec<(EntityKind, String)>> = const { RefCell::new(Vec::new()) };
}

/// Marks an entity whose indexed text, or existence, changes in the current write transaction.
pub fn mark(kind: EntityKind, id: &str) {
    PENDING.with(|pending| pending.borrow_mut().push((kind, id.to_owned())));
}

/// Forgets the marks of a transaction that does not commit.
pub fn discard_pending() {
    PENDING.with(|pending| pending.borrow_mut().clear());
}

/// Rebuilds the rows of every entity marked by the current transaction, each once. Returns the entities
/// changed, for the memory engine to process them in turn.
pub fn flush_pending(transaction: &Transaction<'_>) -> AppResult<Vec<(EntityKind, String)>> {
    let marked = PENDING.with(|pending| std::mem::take(&mut *pending.borrow_mut()));
    let mut done = HashSet::with_capacity(marked.len());
    let mut changed = Vec::with_capacity(marked.len());
    for (kind, id) in marked {
        if done.insert((kind, id.clone())) {
            sync(transaction, kind, &id)?;
            changed.push((kind, id));
        }
    }
    Ok(changed)
}

/// Text of an entity, as indexed.
struct Entry {
    title: String,
    body: String,
    tags: String,
    meta: String,
    /// What the trigram index of titles holds (a document's title and original file name).
    titles: String,
}

/// Replaces the rows of an entity with its current text, or removes them if it no longer exists.
pub fn sync(connection: &Connection, kind: EntityKind, id: &str) -> AppResult<()> {
    remove(connection, kind, id)?;
    match load(connection, kind, id)? {
        Some(entry) => insert(connection, kind, id, &entry),
        None => Ok(()),
    }
}

/// Builds the index again if it was built with other rules (or never): returns the number of entities
/// indexed, or `None` if it was current.
pub fn ensure_current(transaction: &Transaction<'_>) -> AppResult<Option<usize>> {
    let version: i64 = transaction.query_row(
        "SELECT version FROM search_index_state WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    if version == INDEX_VERSION {
        return Ok(None);
    }
    let count = rebuild(transaction)?;
    transaction.execute(
        "UPDATE search_index_state SET version = ?1, built_at = ?2 WHERE id = 1",
        params![INDEX_VERSION, now_ms()],
    )?;
    Ok(Some(count))
}

/// Indexes every entity again, from scratch.
pub fn rebuild(connection: &Connection) -> AppResult<usize> {
    connection.execute_batch(
        "DELETE FROM search_index; DELETE FROM search_titles; DELETE FROM search_entries;",
    )?;
    let mut count = 0;
    for (kind, table) in [
        (EntityKind::Document, "documents"),
        (EntityKind::Note, "notes"),
        (EntityKind::Workspace, "workspaces"),
        (EntityKind::Tag, "tags"),
    ] {
        let ids: Vec<String> = connection
            .prepare(&format!("SELECT id FROM {table} ORDER BY id"))?
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        for id in ids {
            if let Some(entry) = load(connection, kind, &id)? {
                insert(connection, kind, &id, &entry)?;
                count += 1;
            }
        }
    }
    Ok(count)
}

fn remove(connection: &Connection, kind: EntityKind, id: &str) -> AppResult<()> {
    let rows: Vec<(String, i64)> = connection
        .prepare_cached(
            "SELECT index_name, row_id FROM search_entries WHERE entity_type = ?1 AND entity_id = ?2",
        )?
        .query_map(params![kind, id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (index, row_id) in rows {
        let statement = if index == "title" {
            "DELETE FROM search_titles WHERE rowid = ?1"
        } else {
            "DELETE FROM search_index WHERE rowid = ?1"
        };
        connection.prepare_cached(statement)?.execute([row_id])?;
    }
    connection
        .prepare_cached("DELETE FROM search_entries WHERE entity_type = ?1 AND entity_id = ?2")?
        .execute(params![kind, id])?;
    Ok(())
}

fn insert(connection: &Connection, kind: EntityKind, id: &str, entry: &Entry) -> AppResult<()> {
    let mut passages = passages(&entry.body);
    if passages.is_empty() {
        // The title, tags and metadata stay searchable without any text.
        passages.push((None, String::new()));
    }
    let mut rows = connection.prepare_cached(
        "INSERT INTO search_index (entity_type, entity_id, page, title, body, tags, meta)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    let mut entries = connection.prepare_cached(
        "INSERT INTO search_entries (entity_type, entity_id, index_name, row_id) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (page, body) in &passages {
        rows.execute(params![
            kind,
            id,
            page,
            entry.title,
            body,
            entry.tags,
            entry.meta
        ])?;
        entries.execute(params![kind, id, "text", connection.last_insert_rowid()])?;
    }
    connection
        .prepare_cached(
            "INSERT INTO search_titles (entity_type, entity_id, title) VALUES (?1, ?2, ?3)",
        )?
        .execute(params![kind, id, entry.titles])?;
    entries.execute(params![kind, id, "title", connection.last_insert_rowid()])?;
    Ok(())
}

fn load(connection: &Connection, kind: EntityKind, id: &str) -> AppResult<Option<Entry>> {
    match kind {
        EntityKind::Document => document(connection, id),
        EntityKind::Note => note(connection, id),
        EntityKind::Workspace => Ok(connection
            .query_row(
                "SELECT name, description FROM workspaces WHERE id = ?1",
                [id],
                |row| {
                    let name: String = row.get(0)?;
                    Ok(Entry {
                        titles: name.clone(),
                        title: name,
                        body: row.get(1)?,
                        tags: String::new(),
                        meta: String::new(),
                    })
                },
            )
            .optional()?),
        EntityKind::Tag => Ok(connection
            .query_row("SELECT name FROM tags WHERE id = ?1", [id], |row| {
                let name: String = row.get(0)?;
                Ok(Entry {
                    titles: name.clone(),
                    title: name,
                    body: String::new(),
                    tags: String::new(),
                    meta: String::new(),
                })
            })
            .optional()?),
        EntityKind::Concept | EntityKind::Relation => Ok(None),
    }
}

fn document(connection: &Connection, id: &str) -> AppResult<Option<Entry>> {
    let found: Option<(String, String, String)> = connection
        .query_row(
            "SELECT title, original_filename, metadata_json FROM documents WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((title, original_filename, metadata)) = found else {
        return Ok(None);
    };
    let body: String = connection
        .query_row(
            "SELECT content_text FROM document_contents WHERE document_id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_default();
    let metadata = crate::repo::json_value(&metadata);
    let mut meta = vec![original_filename.clone()];
    for key in ["documentTitle", "author"] {
        if let Some(value) = metadata.get(key).and_then(serde_json::Value::as_str) {
            meta.push(value.to_owned());
        }
    }
    Ok(Some(Entry {
        titles: format!("{title}\n{original_filename}"),
        title,
        body,
        tags: tag_names(connection, "document_tags", "document_id", id)?,
        meta: meta.join("\n"),
    }))
}

fn note(connection: &Connection, id: &str) -> AppResult<Option<Entry>> {
    let found: Option<(String, String)> = connection
        .query_row(
            "SELECT title, content_text FROM notes WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((title, body)) = found else {
        return Ok(None);
    };
    Ok(Some(Entry {
        titles: title.clone(),
        title,
        body,
        tags: tag_names(connection, "note_tags", "note_id", id)?,
        meta: String::new(),
    }))
}

/// Names of the tags of a document or a note, one per line.
fn tag_names(
    connection: &Connection,
    table: &'static str,
    column: &'static str,
    id: &str,
) -> AppResult<String> {
    let names: Vec<String> = connection
        .prepare_cached(&format!(
            "SELECT t.name FROM {table} x JOIN tags t ON t.id = x.tag_id WHERE x.{column} = ?1 ORDER BY t.name"
        ))?
        .query_map([id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names.join("\n"))
}

/// Passages of an extracted text: one per page of a PDF (a very long page is cut too), or pieces of about
/// [`PASSAGE_BYTES`] ending at a line break for any other text. Blank passages are left out.
pub fn passages(text: &str) -> Vec<(Option<i64>, String)> {
    if text.contains(PAGE_BREAK) {
        text.split(PAGE_BREAK)
            .enumerate()
            .flat_map(|(index, page)| {
                let number = i64::try_from(index + 1).unwrap_or(i64::MAX);
                cut(page, PAGE_BYTES)
                    .into_iter()
                    .map(move |piece| (Some(number), piece))
            })
            .collect()
    } else {
        cut(text, PASSAGE_BYTES)
            .into_iter()
            .map(|piece| (None, piece))
            .collect()
    }
}

/// Cuts a text in pieces of at most `size` bytes: at a line break in the second half of the window if there is
/// one, otherwise at a space, otherwise at a character boundary.
fn cut(text: &str, size: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut rest = text.trim();
    while !rest.is_empty() {
        if rest.len() <= size {
            pieces.push(rest.to_owned());
            break;
        }
        let mut end = size;
        while !rest.is_char_boundary(end) {
            end -= 1;
        }
        let window = &rest[..end];
        let split = window
            .rfind('\n')
            .filter(|&at| at > size / 2)
            .or_else(|| window.rfind(' ').filter(|&at| at > size / 2))
            .unwrap_or(end);
        let (piece, tail) = rest.split_at(split);
        let piece = piece.trim();
        if !piece.is_empty() {
            pieces.push(piece.to_owned());
        }
        rest = tail.trim_start();
    }
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pdf_is_cut_by_page_and_other_texts_by_paragraph() {
        let pdf = format!("Brochage du NE555{PAGE_BREAK}{PAGE_BREAK}Montage astable");
        assert_eq!(
            passages(&pdf),
            vec![
                (Some(1), "Brochage du NE555".to_owned()),
                (Some(3), "Montage astable".to_owned())
            ]
        );
        let long = "Ligne de cours.\n".repeat(300);
        let pieces = passages(&long);
        assert!(pieces.len() > 1);
        assert!(pieces.iter().all(|(page, piece)| page.is_none()
            && piece.len() <= PASSAGE_BYTES
            && piece.ends_with("cours.")));
        assert_eq!(
            pieces.iter().map(|(_, piece)| piece.len()).sum::<usize>() + pieces.len() - 1,
            long.trim().len()
        );
    }

    #[test]
    fn a_long_word_is_cut_at_a_character_boundary() {
        let text = "é".repeat(PASSAGE_BYTES);
        let pieces = passages(&text);
        assert!(pieces.len() >= 2);
        let joined: String = pieces.iter().map(|(_, piece)| piece.as_str()).collect();
        assert_eq!(joined, text);
    }

    #[test]
    fn a_blank_text_has_no_passage() {
        assert!(passages("  \n \u{000C} \n").is_empty());
    }
}
