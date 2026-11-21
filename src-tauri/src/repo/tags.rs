//! Tags shared by documents and notes (specification §5.1).

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use super::{TokenColor, expect_one, map_write_error};
use crate::error::{AppError, AppResult};
use crate::util::{clean_name, name_key, new_id, now_ms, validate_id};

const ENTITY: &str = "tag";
pub const NAME_MAX: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: TokenColor,
    pub created_at: i64,
}

/// Resource a tag can be attached to.
#[derive(Debug, Clone, Copy)]
pub enum Tagged<'a> {
    Document(&'a str),
    Note(&'a str),
}

impl Tagged<'_> {
    fn table_and_column(self) -> (&'static str, &'static str, String) {
        match self {
            Tagged::Document(id) => ("document_tags", "document_id", id.to_owned()),
            Tagged::Note(id) => ("note_tags", "note_id", id.to_owned()),
        }
    }
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
    })
}

pub fn get(connection: &Connection, id: &str) -> AppResult<Tag> {
    validate_id(id, "tag id")?;
    connection
        .query_row(
            "SELECT id, name, color, created_at FROM tags WHERE id = ?1",
            [id],
            from_row,
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: ENTITY })
}

pub fn list(connection: &Connection) -> AppResult<Vec<Tag>> {
    let mut statement =
        connection.prepare("SELECT id, name, color, created_at FROM tags ORDER BY name_key")?;
    let rows = statement.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(transaction: &Transaction<'_>, name: &str, color: TokenColor) -> AppResult<Tag> {
    let name = clean_name(name, "tag name", NAME_MAX)?;
    let tag = Tag {
        id: new_id(),
        name,
        color,
        created_at: now_ms(),
    };
    transaction
        .execute(
            "INSERT INTO tags (id, name, name_key, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                tag.id,
                tag.name,
                name_key(&tag.name),
                tag.color,
                tag.created_at
            ],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    Ok(tag)
}

pub fn rename(transaction: &Transaction<'_>, id: &str, name: &str) -> AppResult<Tag> {
    validate_id(id, "tag id")?;
    let name = clean_name(name, "tag name", NAME_MAX)?;
    let affected = transaction
        .execute(
            "UPDATE tags SET name = ?2, name_key = ?3 WHERE id = ?1",
            params![id, name, name_key(&name)],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    expect_one(affected, ENTITY)?;
    get(transaction, id)
}

/// Deletes a tag. Its links to documents and notes go with it; the documents and notes stay.
pub fn delete(transaction: &Transaction<'_>, id: &str) -> AppResult<()> {
    validate_id(id, "tag id")?;
    crate::repo::relations::delete_for_entity(transaction, super::EntityKind::Tag, id)?;
    let affected = transaction.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    expect_one(affected, ENTITY)
}

pub fn attach(transaction: &Transaction<'_>, tag_id: &str, target: Tagged<'_>) -> AppResult<()> {
    validate_id(tag_id, "tag id")?;
    let (table, column, target_id) = target.table_and_column();
    validate_id(&target_id, "tagged resource id")?;
    transaction
        .execute(
            &format!(
                "INSERT OR IGNORE INTO {table} ({column}, tag_id, created_at) VALUES (?1, ?2, ?3)"
            ),
            params![target_id, tag_id, now_ms()],
        )
        .map_err(|error| map_write_error(error, ENTITY))?;
    Ok(())
}

pub fn detach(transaction: &Transaction<'_>, tag_id: &str, target: Tagged<'_>) -> AppResult<()> {
    validate_id(tag_id, "tag id")?;
    let (table, column, target_id) = target.table_and_column();
    transaction.execute(
        &format!("DELETE FROM {table} WHERE {column} = ?1 AND tag_id = ?2"),
        params![target_id, tag_id],
    )?;
    Ok(())
}

pub fn list_for(connection: &Connection, target: Tagged<'_>) -> AppResult<Vec<Tag>> {
    let (table, column, target_id) = target.table_and_column();
    validate_id(&target_id, "tagged resource id")?;
    let mut statement = connection.prepare(&format!(
        "SELECT t.id, t.name, t.color, t.created_at FROM tags t JOIN {table} l ON l.tag_id = t.id
         WHERE l.{column} = ?1 ORDER BY t.name_key"
    ))?;
    let rows = statement.query_map([target_id], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::repo::notes::{self, NoteContent, NoteFormat};

    #[test]
    fn tags_are_unique_attached_and_detached() {
        let (_dir, database) = open_temporary();
        let tag = database
            .write(|tx| create(tx, "Électronique", TokenColor::Blue))
            .expect("tag");
        assert!(matches!(
            database.write(|tx| create(tx, "électronique", TokenColor::Amber)),
            Err(AppError::NameTaken { .. })
        ));
        let note = database
            .write(|tx| {
                notes::create(
                    tx,
                    &NoteContent {
                        title: "NE555".to_owned(),
                        content: String::new(),
                        content_format: NoteFormat::Plain,
                        content_text: String::new(),
                    },
                    None,
                    None,
                )
            })
            .expect("note");
        database
            .write(|tx| attach(tx, &tag.id, Tagged::Note(&note.id)))
            .expect("attach");
        database
            .write(|tx| attach(tx, &tag.id, Tagged::Note(&note.id)))
            .expect("attach twice is harmless");
        assert_eq!(
            database
                .read(|c| list_for(c, Tagged::Note(&note.id)))
                .expect("list")
                .len(),
            1
        );
        database
            .write(|tx| detach(tx, &tag.id, Tagged::Note(&note.id)))
            .expect("detach");
        assert!(
            database
                .read(|c| list_for(c, Tagged::Note(&note.id)))
                .expect("list")
                .is_empty()
        );
    }

    #[test]
    fn deleting_a_tag_keeps_the_tagged_resources() {
        let (_dir, database) = open_temporary();
        let tag = database
            .write(|tx| create(tx, "Archive", TokenColor::Neutral))
            .expect("tag");
        let note = database
            .write(|tx| {
                notes::create(
                    tx,
                    &NoteContent {
                        title: "Gardée".to_owned(),
                        content: String::new(),
                        content_format: NoteFormat::Plain,
                        content_text: String::new(),
                    },
                    None,
                    None,
                )
            })
            .expect("note");
        database
            .write(|tx| attach(tx, &tag.id, Tagged::Note(&note.id)))
            .expect("attach");
        database
            .write(|tx| delete(tx, &tag.id))
            .expect("delete tag");
        assert!(database.read(|c| notes::get(c, &note.id)).is_ok());
        assert!(database.read(list).expect("list").is_empty());
    }

    #[test]
    fn attaching_to_a_missing_resource_is_refused() {
        let (_dir, database) = open_temporary();
        let tag = database
            .write(|tx| create(tx, "Orphelin", TokenColor::Neutral))
            .expect("tag");
        let missing = crate::util::new_id();
        assert!(matches!(
            database.write(|tx| attach(tx, &tag.id, Tagged::Document(&missing))),
            Err(AppError::InvalidInput(_))
        ));
    }
}
