//! Timeline events (specification §13): the real history of the knowledge base.

use rusqlite::{Connection, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{EntityKind, json_object_text, json_value, map_write_error, text_enum};
use crate::error::{AppError, AppResult};
use crate::util::{new_id, now_ms, validate_id};

pub const DESCRIPTION_MAX: usize = 500;
pub const PAGE_MAX: u32 = 200;

/// Meaningful operations only (specification §13.1): no tracking of unnecessary personal activity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum TimelineEventType {
    DocumentImported,
    NoteCreated,
    NoteModified,
    ResourceFavorited,
    WorkspaceCreated,
    RelationAccepted,
    ResourceArchived,
    ResourceRestored,
}
text_enum!(TimelineEventType {
    DocumentImported => "document_imported",
    NoteCreated => "note_created",
    NoteModified => "note_modified",
    ResourceFavorited => "resource_favorited",
    WorkspaceCreated => "workspace_created",
    RelationAccepted => "relation_accepted",
    ResourceArchived => "resource_archived",
    ResourceRestored => "resource_restored",
});

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TimelineEvent {
    pub id: String,
    pub event_type: TimelineEventType,
    pub entity_type: EntityKind,
    pub entity_id: String,
    pub workspace_id: Option<String>,
    pub description: String,
    #[ts(type = "Record<string, unknown>")]
    pub metadata: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewTimelineEvent<'a> {
    pub event_type: TimelineEventType,
    pub entity: (EntityKind, &'a str),
    pub workspace_id: Option<&'a str>,
    pub description: &'a str,
    pub metadata: serde_json::Value,
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<TimelineEvent> {
    Ok(TimelineEvent {
        id: row.get(0)?,
        event_type: row.get(1)?,
        entity_type: row.get(2)?,
        entity_id: row.get(3)?,
        workspace_id: row.get(4)?,
        description: row.get(5)?,
        metadata: json_value(&row.get::<_, String>(6)?),
        created_at: row.get(7)?,
    })
}

pub fn record(
    transaction: &Transaction<'_>,
    event: &NewTimelineEvent<'_>,
) -> AppResult<TimelineEvent> {
    validate_id(event.entity.1, "timeline entity id")?;
    if let Some(workspace_id) = event.workspace_id {
        validate_id(workspace_id, "workspace id")?;
    }
    // The description is a title snapshot: it is shortened rather than refused.
    let description: String = event
        .description
        .trim()
        .chars()
        .take(DESCRIPTION_MAX)
        .collect();
    let stored = TimelineEvent {
        id: new_id(),
        event_type: event.event_type,
        entity_type: event.entity.0,
        entity_id: event.entity.1.to_owned(),
        workspace_id: event.workspace_id.map(str::to_owned),
        description,
        metadata: event.metadata.clone(),
        created_at: now_ms(),
    };
    transaction
        .execute(
            "INSERT INTO timeline_events (id, event_type, entity_type, entity_id, workspace_id, description,
                                          metadata_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                stored.id,
                stored.event_type,
                stored.entity_type,
                stored.entity_id,
                stored.workspace_id,
                stored.description,
                json_object_text(&stored.metadata, "timeline metadata")?,
                stored.created_at
            ],
        )
        .map_err(|error| map_write_error(error, "timeline event"))?;
    Ok(stored)
}

/// Most recent events first. `before` paginates: pass the `created_at` of the last event received.
pub fn list(
    connection: &Connection,
    before: Option<i64>,
    limit: u32,
) -> AppResult<Vec<TimelineEvent>> {
    if limit == 0 || limit > PAGE_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {PAGE_MAX}"
        )));
    }
    let mut statement = connection.prepare(
        "SELECT id, event_type, entity_type, entity_id, workspace_id, description, metadata_json, created_at
         FROM timeline_events WHERE ?1 IS NULL OR created_at < ?1
         ORDER BY created_at DESC, id DESC LIMIT ?2",
    )?;
    let rows = statement.query_map(params![before, limit], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Clears the whole history, on the user's explicit request (specification §13.2).
pub fn clear(transaction: &Transaction<'_>) -> AppResult<usize> {
    Ok(transaction.execute("DELETE FROM timeline_events", [])?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;

    #[test]
    fn events_are_recorded_listed_newest_first_and_cleared() {
        let (_dir, database) = open_temporary();
        let workspace = new_id();
        for (index, kind) in [
            TimelineEventType::WorkspaceCreated,
            TimelineEventType::NoteCreated,
        ]
        .iter()
        .enumerate()
        {
            let entity = new_id();
            database
                .write(|tx| {
                    record(
                        tx,
                        &NewTimelineEvent {
                            event_type: *kind,
                            entity: (EntityKind::Note, &entity),
                            workspace_id: Some(&workspace),
                            description: &format!("Événement {index}"),
                            metadata: serde_json::json!({}),
                        },
                    )
                })
                .expect("record");
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let events = database.read(|c| list(c, None, 10)).expect("list");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, TimelineEventType::NoteCreated);
        let older = database
            .read(|c| list(c, Some(events[0].created_at), 10))
            .expect("page");
        assert_eq!(older.len(), 1);
        assert_eq!(database.write(clear).expect("clear"), 2);
        assert!(
            database
                .read(|c| list(c, None, 10))
                .expect("list")
                .is_empty()
        );
    }

    #[test]
    fn long_descriptions_are_shortened_and_limits_checked() {
        let (_dir, database) = open_temporary();
        let entity = new_id();
        let long = "é".repeat(DESCRIPTION_MAX + 20);
        let event = database
            .write(|tx| {
                record(
                    tx,
                    &NewTimelineEvent {
                        event_type: TimelineEventType::DocumentImported,
                        entity: (EntityKind::Document, &entity),
                        workspace_id: None,
                        description: &long,
                        metadata: serde_json::json!({ "size": 10 }),
                    },
                )
            })
            .expect("record");
        assert_eq!(event.description.chars().count(), DESCRIPTION_MAX);
        assert!(database.read(|c| list(c, None, 0)).is_err());
        assert!(database.read(|c| list(c, None, PAGE_MAX + 1)).is_err());
    }
}
