//! Cross-cutting views over documents and notes: recently opened resources and favorites
//! (specification §6.1, §12.2).

use rusqlite::{Connection, Row, params};
use serde::Serialize;
use ts_rs::TS;

use super::EntityKind;
use crate::error::{AppError, AppResult};
use crate::util::validate_id;

pub const LIST_MAX: u32 = 50;

/// A document or a note, as shown in lists.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResourceSummary {
    pub kind: EntityKind,
    pub id: String,
    /// Empty for an untitled note: the interface displays « Untitled ».
    pub title: String,
    pub workspace_id: Option<String>,
    pub updated_at: i64,
    pub last_opened_at: Option<i64>,
    pub is_favorite: bool,
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<ResourceSummary> {
    Ok(ResourceSummary {
        kind: row.get(0)?,
        id: row.get(1)?,
        title: row.get(2)?,
        workspace_id: row.get(3)?,
        updated_at: row.get(4)?,
        last_opened_at: row.get(5)?,
        is_favorite: row.get(6)?,
    })
}

const UNION: &str = "SELECT 'document' AS kind, id, title, workspace_id, updated_at, last_opened_at, is_favorite
                     FROM documents WHERE deleted_at IS NULL AND is_archived = 0
                     UNION ALL
                     SELECT 'note' AS kind, id, title, workspace_id, updated_at, last_opened_at, is_favorite
                     FROM notes WHERE deleted_at IS NULL AND is_archived = 0";

fn check(limit: u32, workspace_id: Option<&str>) -> AppResult<()> {
    if limit == 0 || limit > LIST_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {LIST_MAX}"
        )));
    }
    if let Some(workspace_id) = workspace_id {
        validate_id(workspace_id, "workspace id")?;
    }
    Ok(())
}

/// Most recently opened documents and notes, optionally within one workspace.
pub fn recently_opened(
    connection: &Connection,
    workspace_id: Option<&str>,
    limit: u32,
) -> AppResult<Vec<ResourceSummary>> {
    check(limit, workspace_id)?;
    let mut statement = connection.prepare(&format!(
        "SELECT * FROM ({UNION}) WHERE last_opened_at IS NOT NULL AND (?1 IS NULL OR workspace_id = ?1)
         ORDER BY last_opened_at DESC LIMIT ?2"
    ))?;
    let rows = statement.query_map(params![workspace_id, limit], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Favorite documents and notes, most recently modified first, optionally within one workspace.
pub fn favorites(
    connection: &Connection,
    workspace_id: Option<&str>,
    limit: u32,
) -> AppResult<Vec<ResourceSummary>> {
    check(limit, workspace_id)?;
    let mut statement = connection.prepare(&format!(
        "SELECT * FROM ({UNION}) WHERE is_favorite = 1 AND (?1 IS NULL OR workspace_id = ?1)
         ORDER BY updated_at DESC LIMIT ?2"
    ))?;
    let rows = statement.query_map(params![workspace_id, limit], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Number of documents whose text was extracted since `since` (Unix milliseconds).
pub fn indexed_since(connection: &Connection, since: i64) -> AppResult<i64> {
    Ok(connection.query_row(
        "SELECT count(*) FROM document_contents c JOIN documents d ON d.id = c.document_id
         WHERE c.extracted_at >= ?1 AND d.deleted_at IS NULL",
        [since],
        |row| row.get(0),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::repo::notes::{self, NoteContent, NoteFormat};

    fn note(database: &crate::db::Database, title: &str) -> String {
        database
            .write(|tx| {
                notes::create(
                    tx,
                    &NoteContent {
                        title: title.to_owned(),
                        content: String::new(),
                        content_format: NoteFormat::Plain,
                        content_text: String::new(),
                    },
                    None,
                    None,
                )
            })
            .expect("note")
            .id
    }

    #[test]
    fn only_opened_resources_appear_most_recent_first() {
        let (_dir, database) = open_temporary();
        let (first, second, never) = (
            note(&database, "A"),
            note(&database, "B"),
            note(&database, "C"),
        );
        database
            .write(|tx| {
                tx.execute(
                    "UPDATE notes SET last_opened_at = 100 WHERE id = ?1",
                    [&first],
                )?;
                tx.execute(
                    "UPDATE notes SET last_opened_at = 200 WHERE id = ?1",
                    [&second],
                )?;
                Ok(())
            })
            .expect("open");
        let recent = database
            .read(|c| recently_opened(c, None, 10))
            .expect("recent");
        let ids: Vec<&str> = recent.iter().map(|resource| resource.id.as_str()).collect();
        assert_eq!(ids, [second.as_str(), first.as_str()]);
        assert!(!ids.contains(&never.as_str()));
        assert_eq!(recent[0].kind, EntityKind::Note);
    }

    #[test]
    fn favorites_exclude_trashed_and_archived_resources() {
        let (_dir, database) = open_temporary();
        let (kept, trashed, archived) = (
            note(&database, "Gardée"),
            note(&database, "Jetée"),
            note(&database, "Rangée"),
        );
        database
            .write(|tx| {
                for id in [&kept, &trashed, &archived] {
                    notes::set_favorite(tx, id, true)?;
                }
                notes::trash(tx, &trashed)?;
                notes::set_archived(tx, &archived, true)?;
                Ok(())
            })
            .expect("setup");
        let listed = database
            .read(|c| favorites(c, None, 10))
            .expect("favorites");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, kept);
        assert!(database.read(|c| favorites(c, None, 0)).is_err());
    }
}
