//! Documents (specification §7): metadata of imported files. The files themselves are handled by the
//! storage service; the import pipeline (Phase 4) combines both.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{expect_one, json_object_text, json_value, map_write_error, text_enum};
use crate::error::{AppError, AppResult};
use crate::util::{clean_name, now_ms, validate_id};

const ENTITY: &str = "document";
pub const TITLE_MAX: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ProcessingStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    NeedsAttention,
}
text_enum!(ProcessingStatus {
    Pending => "pending",
    Processing => "processing",
    Completed => "completed",
    Failed => "failed",
    NeedsAttention => "needs_attention",
});

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub original_filename: String,
    pub stored_filename: String,
    pub file_extension: String,
    pub mime_type: String,
    pub file_size: i64,
    pub content_hash: String,
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
    pub indexing_status: ProcessingStatus,
    #[ts(type = "Record<string, unknown>")]
    pub metadata: serde_json::Value,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub imported_at: i64,
    pub last_opened_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

/// Metadata of a file already copied into managed storage under `id`.
#[derive(Debug, Clone)]
pub struct NewDocument {
    pub id: String,
    pub title: String,
    pub original_filename: String,
    pub stored_filename: String,
    pub file_extension: String,
    pub mime_type: String,
    pub file_size: i64,
    pub content_hash: String,
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
    pub metadata: serde_json::Value,
}

const COLUMNS: &str = "id, title, original_filename, stored_filename, file_extension, mime_type, file_size, \
                       content_hash, workspace_id, folder_id, indexing_status, metadata_json, is_favorite, \
                       is_archived, created_at, updated_at, imported_at, last_opened_at, deleted_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        title: row.get(1)?,
        original_filename: row.get(2)?,
        stored_filename: row.get(3)?,
        file_extension: row.get(4)?,
        mime_type: row.get(5)?,
        file_size: row.get(6)?,
        content_hash: row.get(7)?,
        workspace_id: row.get(8)?,
        folder_id: row.get(9)?,
        indexing_status: row.get(10)?,
        metadata: json_value(&row.get::<_, String>(11)?),
        is_favorite: row.get(12)?,
        is_archived: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        imported_at: row.get(16)?,
        last_opened_at: row.get(17)?,
        deleted_at: row.get(18)?,
    })
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .chars()
            .all(|character| matches!(character, '0'..='9' | 'a'..='f'))
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Document> {
    validate_id(id, "document id")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM documents WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

/// Document (outside the trash) whose content has this SHA-256 hash, used to refuse duplicate imports.
pub fn find_by_hash(connection: &Connection, content_hash: &str) -> AppResult<Option<Document>> {
    Ok(connection
        .query_row(
            &format!(
                "SELECT {COLUMNS} FROM documents WHERE content_hash = ?1 AND deleted_at IS NULL"
            ),
            [content_hash],
            from_row,
        )
        .optional()?)
}

pub fn insert(transaction: &Transaction<'_>, input: &NewDocument) -> AppResult<Document> {
    validate_id(&input.id, "document id")?;
    let title = clean_name(&input.title, "document title", TITLE_MAX)?;
    let original_filename = clean_name(&input.original_filename, "original file name", TITLE_MAX)?;
    if !is_sha256_hex(&input.content_hash) {
        return Err(AppError::InvalidInput(
            "content hash must be a lowercase SHA-256".to_owned(),
        ));
    }
    if input.file_size < 0 {
        return Err(AppError::InvalidInput("file size is negative".to_owned()));
    }
    if let Some(existing) = find_by_hash(transaction, &input.content_hash)? {
        return Err(AppError::DuplicateContent {
            existing_id: existing.id,
        });
    }
    let metadata = json_object_text(&input.metadata, "document metadata")?;
    let now = now_ms();
    transaction
        .execute(
            "INSERT INTO documents (id, title, original_filename, stored_filename, file_extension, mime_type, file_size,
                                    content_hash, workspace_id, folder_id, metadata_json, created_at, updated_at, imported_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?12)",
            params![
                input.id,
                title,
                original_filename,
                input.stored_filename,
                input.file_extension,
                input.mime_type,
                input.file_size,
                input.content_hash,
                input.workspace_id,
                input.folder_id,
                metadata,
                now
            ],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    get(transaction, &input.id)
}

pub fn rename(transaction: &Transaction<'_>, id: &str, title: &str) -> AppResult<Document> {
    validate_id(id, "document id")?;
    let title = clean_name(title, "document title", TITLE_MAX)?;
    let affected = transaction.execute(
        "UPDATE documents SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn set_favorite(
    transaction: &Transaction<'_>,
    id: &str,
    favorite: bool,
) -> AppResult<Document> {
    validate_id(id, "document id")?;
    let affected = transaction.execute(
        "UPDATE documents SET is_favorite = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, favorite, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn set_archived(
    transaction: &Transaction<'_>,
    id: &str,
    archived: bool,
) -> AppResult<Document> {
    validate_id(id, "document id")?;
    let affected = transaction.execute(
        "UPDATE documents SET is_archived = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, archived, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn set_processing_status(
    transaction: &Transaction<'_>,
    id: &str,
    status: ProcessingStatus,
) -> AppResult<()> {
    validate_id(id, "document id")?;
    let affected = transaction.execute(
        "UPDATE documents SET indexing_status = ?2 WHERE id = ?1",
        params![id, status],
    )?;
    expect_one(affected, ENTITY)
}

/// Stores the extracted text of a document (derived data, replaced on each extraction).
pub fn set_content(
    transaction: &Transaction<'_>,
    id: &str,
    text: &str,
    extractor: &str,
) -> AppResult<()> {
    validate_id(id, "document id")?;
    transaction.execute(
        "INSERT INTO document_contents (document_id, content_text, extractor, extracted_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (document_id) DO UPDATE SET content_text = excluded.content_text,
                                                 extractor = excluded.extractor,
                                                 extracted_at = excluded.extracted_at",
        params![id, text, extractor, now_ms()],
    ).map_err(|error| map_write_error(error, ENTITY))?;
    Ok(())
}

pub fn content(connection: &Connection, id: &str) -> AppResult<Option<String>> {
    validate_id(id, "document id")?;
    Ok(connection
        .query_row(
            "SELECT content_text FROM document_contents WHERE document_id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn trash(transaction: &Transaction<'_>, id: &str) -> AppResult<Document> {
    validate_id(id, "document id")?;
    let affected = transaction.execute(
        "UPDATE documents SET deleted_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
        params![id, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Restores a document from the trash, unless an identical document was imported in the meantime.
pub fn restore(transaction: &Transaction<'_>, id: &str) -> AppResult<Document> {
    let document = get(transaction, id)?;
    if let Some(existing) = find_by_hash(transaction, &document.content_hash)?
        && existing.id != document.id
    {
        return Err(AppError::DuplicateContent {
            existing_id: existing.id,
        });
    }
    transaction.execute("UPDATE documents SET deleted_at = NULL WHERE id = ?1", [id])?;
    get(transaction, id)
}

/// Permanently deletes the record of a document in the trash and returns it, so that the caller removes
/// the managed copy of the file. The user's original file is never touched (specification §7.5).
pub fn purge(transaction: &Transaction<'_>, id: &str) -> AppResult<Document> {
    let document = get(transaction, id)?;
    if document.deleted_at.is_none() {
        return Err(AppError::InvalidInput(
            "only a document in the trash can be deleted permanently".to_owned(),
        ));
    }
    crate::repo::relations::delete_for_entity(transaction, super::EntityKind::Document, id)?;
    transaction.execute("DELETE FROM documents WHERE id = ?1", [id])?;
    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::util::new_id;

    pub(crate) fn sample(hash_seed: char) -> NewDocument {
        let id = new_id();
        NewDocument {
            stored_filename: format!("{id}.pdf"),
            id,
            title: "Cours NE555".to_owned(),
            original_filename: "cours-ne555.pdf".to_owned(),
            file_extension: "pdf".to_owned(),
            mime_type: "application/pdf".to_owned(),
            file_size: 1_024,
            content_hash: hash_seed.to_string().repeat(64),
            workspace_id: None,
            folder_id: None,
            metadata: serde_json::json!({ "pageCount": 12 }),
        }
    }

    #[test]
    fn documents_are_inserted_and_read_back_with_metadata() {
        let (_dir, database) = open_temporary();
        let document = database
            .write(|tx| insert(tx, &sample('a')))
            .expect("insert");
        assert_eq!(document.indexing_status, ProcessingStatus::Pending);
        assert_eq!(document.metadata["pageCount"], 12);
        let renamed = database
            .write(|tx| rename(tx, &document.id, "NE555 — monostable"))
            .expect("rename");
        assert_eq!(renamed.title, "NE555 — monostable");
        assert_eq!(renamed.original_filename, "cours-ne555.pdf");
    }

    #[test]
    fn duplicate_content_is_refused_with_the_existing_document() {
        let (_dir, database) = open_temporary();
        let first = database
            .write(|tx| insert(tx, &sample('b')))
            .expect("first");
        let error = database
            .write(|tx| insert(tx, &sample('b')))
            .expect_err("duplicate");
        assert!(
            matches!(error, AppError::DuplicateContent { ref existing_id } if *existing_id == first.id)
        );
    }

    #[test]
    fn a_trashed_document_cannot_be_restored_over_a_newer_duplicate() {
        let (_dir, database) = open_temporary();
        let first = database
            .write(|tx| insert(tx, &sample('c')))
            .expect("first");
        database.write(|tx| trash(tx, &first.id)).expect("trash");
        let second = database
            .write(|tx| insert(tx, &sample('c')))
            .expect("re-import allowed");
        let error = database
            .write(|tx| restore(tx, &first.id))
            .expect_err("restore refused");
        assert!(
            matches!(error, AppError::DuplicateContent { ref existing_id } if *existing_id == second.id)
        );
    }

    #[test]
    fn extracted_text_is_stored_apart_and_replaced() {
        let (_dir, database) = open_temporary();
        let document = database
            .write(|tx| insert(tx, &sample('d')))
            .expect("insert");
        database
            .write(|tx| set_content(tx, &document.id, "première", "test"))
            .expect("content");
        database
            .write(|tx| set_content(tx, &document.id, "seconde", "test"))
            .expect("replace");
        assert_eq!(
            database
                .read(|c| content(c, &document.id))
                .expect("read")
                .as_deref(),
            Some("seconde")
        );
        database
            .write(|tx| set_processing_status(tx, &document.id, ProcessingStatus::Completed))
            .expect("status");
    }

    #[test]
    fn purge_requires_the_trash_and_removes_derived_data() {
        let (_dir, database) = open_temporary();
        let document = database
            .write(|tx| insert(tx, &sample('e')))
            .expect("insert");
        database
            .write(|tx| set_content(tx, &document.id, "texte", "test"))
            .expect("content");
        assert!(matches!(
            database.write(|tx| purge(tx, &document.id)),
            Err(AppError::InvalidInput(_))
        ));
        database.write(|tx| trash(tx, &document.id)).expect("trash");
        let purged = database.write(|tx| purge(tx, &document.id)).expect("purge");
        assert_eq!(purged.stored_filename, document.stored_filename);
        assert!(
            database
                .read(|c| content(c, &document.id))
                .expect("read")
                .is_none()
        );
    }

    #[test]
    fn invalid_metadata_and_hashes_are_rejected() {
        let (_dir, database) = open_temporary();
        let bad_hash = NewDocument {
            content_hash: "XYZ".to_owned(),
            ..sample('f')
        };
        assert!(matches!(
            database.write(|tx| insert(tx, &bad_hash)),
            Err(AppError::InvalidInput(_))
        ));
        let bad_metadata = NewDocument {
            metadata: serde_json::json!([1, 2]),
            ..sample('0')
        };
        assert!(matches!(
            database.write(|tx| insert(tx, &bad_metadata)),
            Err(AppError::InvalidInput(_))
        ));
    }
}
