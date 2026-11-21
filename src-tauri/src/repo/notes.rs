//! Notes (specification §8): rich text documents written in ARCHIVE.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{expect_one, map_write_error, text_enum};
use crate::error::{AppError, AppResult};
use crate::util::{check_length, new_id, now_ms, validate_id};

const ENTITY: &str = "note";
pub const TITLE_MAX: usize = 500;
/// Upper bound of a note's serialized content (10 million characters).
pub const CONTENT_MAX: usize = 10_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export)]
pub enum NoteFormat {
    TiptapJson,
    Markdown,
    Plain,
}
text_enum!(NoteFormat {
    TiptapJson => "tiptap-json",
    Markdown => "markdown",
    Plain => "plain",
});

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub content_format: NoteFormat,
    pub workspace_id: Option<String>,
    pub folder_id: Option<String>,
    pub revision: i64,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

/// Content of a save: the serialized document and its plain text (used for search and previews).
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct NoteContent {
    pub title: String,
    pub content: String,
    pub content_format: NoteFormat,
    pub content_text: String,
}

const COLUMNS: &str = "id, title, content, content_format, workspace_id, folder_id, revision, is_favorite, \
                       is_archived, created_at, updated_at, last_opened_at, deleted_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        content_format: row.get(3)?,
        workspace_id: row.get(4)?,
        folder_id: row.get(5)?,
        revision: row.get(6)?,
        is_favorite: row.get(7)?,
        is_archived: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        last_opened_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}

fn check_content(content: &NoteContent) -> AppResult<String> {
    let title = content.title.trim().to_owned();
    check_length(&title, "note title", TITLE_MAX)?;
    check_length(&content.content, "note content", CONTENT_MAX)?;
    check_length(&content.content_text, "note text", CONTENT_MAX)?;
    Ok(title)
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Note> {
    validate_id(id, "note id")?;
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM notes WHERE id = ?1"),
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

/// Notes that are not in the trash, most recently modified first.
pub fn list_active(connection: &Connection) -> AppResult<Vec<Note>> {
    let mut statement = connection.prepare(&format!(
        "SELECT {COLUMNS} FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC"
    ))?;
    let rows = statement.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(
    transaction: &Transaction<'_>,
    content: &NoteContent,
    workspace_id: Option<&str>,
    folder_id: Option<&str>,
) -> AppResult<Note> {
    let title = check_content(content)?;
    if let Some(workspace_id) = workspace_id {
        crate::repo::workspaces::get(transaction, workspace_id)?;
    }
    if let Some(folder_id) = folder_id {
        let folder = crate::repo::folders::get(transaction, folder_id)?;
        if Some(folder.workspace_id.as_str()) != workspace_id {
            return Err(AppError::InvalidInput(
                "the folder belongs to another workspace".to_owned(),
            ));
        }
    }
    let id = new_id();
    let now = now_ms();
    transaction
        .execute(
            "INSERT INTO notes (id, title, content, content_format, content_text, workspace_id, folder_id,
                                revision, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
            params![id, title, content.content, content.content_format, content.content_text, workspace_id, folder_id, now],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    get(transaction, &id)
}

/// Saves new content if the caller edited the latest revision; otherwise the save is refused with
/// `StaleRevision` and nothing is overwritten (specification §8.3: conflict-safe updates).
pub fn save(
    transaction: &Transaction<'_>,
    id: &str,
    expected_revision: i64,
    content: &NoteContent,
) -> AppResult<Note> {
    validate_id(id, "note id")?;
    let title = check_content(content)?;
    let affected = transaction.execute(
        "UPDATE notes SET title = ?3, content = ?4, content_format = ?5, content_text = ?6,
                          revision = revision + 1, updated_at = ?7
         WHERE id = ?1 AND revision = ?2 AND deleted_at IS NULL",
        params![
            id,
            expected_revision,
            title,
            content.content,
            content.content_format,
            content.content_text,
            now_ms()
        ],
    )?;
    if affected == 0 {
        let current = get(transaction, id)?;
        if current.deleted_at.is_some() {
            return Err(AppError::InvalidInput(
                "a note in the trash cannot be edited".to_owned(),
            ));
        }
        return Err(AppError::StaleRevision {
            entity: ENTITY,
            expected: expected_revision,
        });
    }
    get(transaction, id)
}

fn set_flag(transaction: &Transaction<'_>, id: &str, column: &str, value: bool) -> AppResult<Note> {
    validate_id(id, "note id")?;
    let affected = transaction.execute(
        &format!("UPDATE notes SET {column} = ?2, updated_at = ?3 WHERE id = ?1"),
        params![id, value, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn set_favorite(transaction: &Transaction<'_>, id: &str, favorite: bool) -> AppResult<Note> {
    set_flag(transaction, id, "is_favorite", favorite)
}

pub fn set_archived(transaction: &Transaction<'_>, id: &str, archived: bool) -> AppResult<Note> {
    set_flag(transaction, id, "is_archived", archived)
}

/// Moves a note to the trash: it disappears from the views but can be restored.
pub fn trash(transaction: &Transaction<'_>, id: &str) -> AppResult<Note> {
    validate_id(id, "note id")?;
    let affected = transaction.execute(
        "UPDATE notes SET deleted_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
        params![id, now_ms()],
    )?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

pub fn restore(transaction: &Transaction<'_>, id: &str) -> AppResult<Note> {
    validate_id(id, "note id")?;
    let affected = transaction.execute("UPDATE notes SET deleted_at = NULL WHERE id = ?1", [id])?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Permanently deletes a note that is already in the trash, with its tag links and relations.
pub fn purge(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    let note = get(transaction, id)?;
    if note.deleted_at.is_none() {
        return Err(AppError::InvalidInput(
            "only a note in the trash can be deleted permanently".to_owned(),
        ));
    }
    crate::repo::relations::delete_for_entity(transaction, super::EntityKind::Note, id)?;
    let affected = transaction.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    expect_one(affected, ENTITY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    fn content(title: &str, text: &str) -> NoteContent {
        NoteContent {
            title: title.to_owned(),
            content: format!("{{\"type\":\"doc\",\"text\":\"{text}\"}}"),
            content_format: NoteFormat::TiptapJson,
            content_text: text.to_owned(),
        }
    }

    #[test]
    fn notes_are_created_saved_and_read_back() {
        let (_dir, database) = open_temporary();
        let note = database
            .write(|tx| create(tx, &content("Lois de Kirchhoff", "Nœuds"), None, None))
            .expect("create");
        assert_eq!(note.revision, 1);
        let saved = database
            .write(|tx| {
                save(
                    tx,
                    &note.id,
                    1,
                    &content("Lois de Kirchhoff", "Nœuds et mailles"),
                )
            })
            .expect("save");
        assert_eq!(saved.revision, 2);
        let read = database.read(|c| get(c, &note.id)).expect("get");
        assert!(read.content.contains("mailles"));
    }

    #[test]
    fn a_save_based_on_an_old_revision_is_refused() {
        let (_dir, database) = open_temporary();
        let note = database
            .write(|tx| create(tx, &content("Brouillon", "v1"), None, None))
            .expect("create");
        database
            .write(|tx| save(tx, &note.id, 1, &content("Brouillon", "v2")))
            .expect("first save");
        let error = database
            .write(|tx| save(tx, &note.id, 1, &content("Brouillon", "conflicting")))
            .expect_err("stale");
        assert!(matches!(error, AppError::StaleRevision { expected: 1, .. }));
        assert!(
            database
                .read(|c| get(c, &note.id))
                .expect("get")
                .content
                .contains("v2")
        );
    }

    #[test]
    fn trash_restore_and_purge() {
        let (_dir, database) = open_temporary();
        let note = database
            .write(|tx| create(tx, &content("Temporaire", ""), None, None))
            .expect("create");
        assert!(matches!(
            database.write(|tx| purge(tx, &note.id)),
            Err(AppError::InvalidInput(_))
        ));
        database.write(|tx| trash(tx, &note.id)).expect("trash");
        assert!(database.read(list_active).expect("list").is_empty());
        assert!(matches!(
            database.write(|tx| save(tx, &note.id, 1, &content("x", "y"))),
            Err(AppError::InvalidInput(_))
        ));
        database.write(|tx| restore(tx, &note.id)).expect("restore");
        assert_eq!(database.read(list_active).expect("list").len(), 1);
        database
            .write(|tx| trash(tx, &note.id))
            .expect("trash again");
        database.write(|tx| purge(tx, &note.id)).expect("purge");
        assert!(matches!(
            database.read(|c| get(c, &note.id)),
            Err(AppError::NotFound { .. })
        ));
    }

    #[test]
    fn favorites_and_archive_flags() {
        let (_dir, database) = open_temporary();
        let note = database
            .write(|tx| create(tx, &content("Idée", ""), None, None))
            .expect("create");
        assert!(
            database
                .write(|tx| set_favorite(tx, &note.id, true))
                .expect("fav")
                .is_favorite
        );
        assert!(
            database
                .write(|tx| set_archived(tx, &note.id, true))
                .expect("archive")
                .is_archived
        );
    }

    #[test]
    fn a_folder_must_belong_to_the_note_workspace() {
        let (_dir, database) = open_temporary();
        let ws = database
            .write(|tx| {
                crate::repo::workspaces::create(
                    tx,
                    &crate::repo::workspaces::NewWorkspace {
                        name: "Cours".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace");
        let folder = database
            .write(|tx| crate::repo::folders::create(tx, &ws.id, None, "Physique"))
            .expect("folder");
        assert!(matches!(
            database.write(|tx| create(tx, &content("x", ""), None, Some(&folder.id))),
            Err(AppError::InvalidInput(_))
        ));
        let note = database
            .write(|tx| create(tx, &content("Optique", ""), Some(&ws.id), Some(&folder.id)))
            .expect("note in folder");
        assert_eq!(note.folder_id.as_deref(), Some(folder.id.as_str()));
    }
}
