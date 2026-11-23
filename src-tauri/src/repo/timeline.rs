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
    /// True while the resource still exists outside the trash: the interface links to it only then. For an
    /// accepted relation: while it is still accepted and the item it starts from is outside the trash.
    pub available: bool,
    /// Where the interface leads: the resource itself, or the item an accepted relation starts from.
    pub target: Option<TimelineTarget>,
    /// Title of the resource today, while it exists: a note is created without a title and named afterwards,
    /// a document may be renamed. The description keeps the title of the moment, for what no longer exists.
    pub current_title: Option<String>,
}

/// A resource the interface can open from the timeline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TimelineTarget {
    pub kind: EntityKind,
    pub id: String,
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
    let entity_type: EntityKind = row.get(2)?;
    let entity_id: String = row.get(3)?;
    let available: bool = row.get(8)?;
    let target = if !available {
        None
    } else if entity_type == EntityKind::Relation {
        let source_type: Option<EntityKind> = row.get(9)?;
        let source_id: Option<String> = row.get(10)?;
        source_type
            .zip(source_id)
            .map(|(kind, id)| TimelineTarget { kind, id })
    } else {
        Some(TimelineTarget {
            kind: entity_type,
            id: entity_id.clone(),
        })
    };
    Ok(TimelineEvent {
        id: row.get(0)?,
        event_type: row.get(1)?,
        entity_type,
        entity_id,
        workspace_id: row.get(4)?,
        description: row.get(5)?,
        metadata: json_value(&row.get::<_, String>(6)?),
        created_at: row.get(7)?,
        available,
        target,
        current_title: row.get(11)?,
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
        available: true,
        target: None,
        current_title: None,
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

/// Position in the history: the last event already received. Events are ordered by date, then by id, so that
/// two events of the same millisecond are neither repeated nor skipped from one page to the next.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct TimelineCursor {
    pub created_at: i64,
    pub id: String,
}

/// Filters of a timeline page (specification §13.2).
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct TimelineQuery {
    /// Pagination: the page continues after this event.
    #[serde(default)]
    #[ts(optional)]
    pub after: Option<TimelineCursor>,
    pub limit: u32,
    /// Only the events of this workspace.
    #[serde(default)]
    #[ts(optional)]
    pub workspace_id: Option<String>,
    /// Only these types of event.
    #[serde(default)]
    #[ts(optional)]
    pub event_types: Option<Vec<TimelineEventType>>,
    /// Only the events about these kinds of resource.
    #[serde(default)]
    #[ts(optional)]
    pub entity_types: Option<Vec<EntityKind>>,
    /// Only the events from this moment (milliseconds, included)…
    #[serde(default)]
    #[ts(optional)]
    pub from: Option<i64>,
    /// …and before this one (excluded).
    #[serde(default)]
    #[ts(optional)]
    pub to: Option<i64>,
}

/// Most recent events first, without any filter.
pub fn list(connection: &Connection, limit: u32) -> AppResult<Vec<TimelineEvent>> {
    list_query(
        connection,
        &TimelineQuery {
            limit,
            ..TimelineQuery::default()
        },
    )
}

/// Event and resource types, as JSON for `json_each`, or `None` without this filter.
fn json_filter<T: Serialize>(values: Option<&Vec<T>>, field: &str) -> AppResult<Option<String>> {
    let Some(values) = values else {
        return Ok(None);
    };
    if values.len() > 16 {
        return Err(AppError::InvalidInput(format!("too many {field}")));
    }
    serde_json::to_string(values)
        .map(Some)
        .map_err(|error| AppError::Internal(format!("{field}: {error}")))
}

fn check_limit(limit: u32) -> AppResult<()> {
    if limit == 0 || limit > PAGE_MAX {
        return Err(AppError::InvalidInput(format!(
            "limit must be between 1 and {PAGE_MAX}"
        )));
    }
    Ok(())
}

/// Most recent events first, filtered, from the cursor on.
pub fn list_query(connection: &Connection, query: &TimelineQuery) -> AppResult<Vec<TimelineEvent>> {
    check_limit(query.limit)?;
    select(connection, query, query.limit)
}

/// A page of events, and whether older events match the same filters.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TimelinePage {
    pub events: Vec<TimelineEvent>,
    pub has_more: bool,
}

pub fn page(connection: &Connection, query: &TimelineQuery) -> AppResult<TimelinePage> {
    check_limit(query.limit)?;
    let mut events = select(connection, query, query.limit + 1)?;
    let has_more = events.len() > query.limit as usize;
    events.truncate(query.limit as usize);
    Ok(TimelinePage { events, has_more })
}

fn select(
    connection: &Connection,
    query: &TimelineQuery,
    limit: u32,
) -> AppResult<Vec<TimelineEvent>> {
    if let Some(workspace_id) = &query.workspace_id {
        validate_id(workspace_id, "workspace id")?;
    }
    if let Some(cursor) = &query.after {
        validate_id(&cursor.id, "timeline cursor id")?;
    }
    if let (Some(from), Some(to)) = (query.from, query.to)
        && from >= to
    {
        return Err(AppError::InvalidInput(
            "the period must end after it starts".to_owned(),
        ));
    }
    let event_types = json_filter(query.event_types.as_ref(), "event types")?;
    let entity_types = json_filter(query.entity_types.as_ref(), "resource types")?;
    let mut statement = connection.prepare(
        "SELECT e.id, e.event_type, e.entity_type, e.entity_id, e.workspace_id, e.description, e.metadata_json,
                e.created_at,
                coalesce(CASE e.entity_type
                  WHEN 'document' THEN EXISTS (SELECT 1 FROM documents d WHERE d.id = e.entity_id AND d.deleted_at IS NULL)
                  WHEN 'note' THEN EXISTS (SELECT 1 FROM notes n WHERE n.id = e.entity_id AND n.deleted_at IS NULL)
                  WHEN 'workspace' THEN EXISTS (SELECT 1 FROM workspaces w WHERE w.id = e.entity_id)
                  WHEN 'relation' THEN r.status = 'accepted' AND CASE r.source_type
                    WHEN 'document' THEN EXISTS (SELECT 1 FROM documents d WHERE d.id = r.source_id AND d.deleted_at IS NULL)
                    WHEN 'note' THEN EXISTS (SELECT 1 FROM notes n WHERE n.id = r.source_id AND n.deleted_at IS NULL)
                    ELSE 0
                  END
                  ELSE 0
                END, 0),
                r.source_type, r.source_id,
                CASE e.entity_type
                  WHEN 'document' THEN (SELECT d.title FROM documents d WHERE d.id = e.entity_id)
                  WHEN 'note' THEN (SELECT n.title FROM notes n WHERE n.id = e.entity_id)
                  WHEN 'workspace' THEN (SELECT w.name FROM workspaces w WHERE w.id = e.entity_id)
                END
         FROM timeline_events e
         LEFT JOIN relations r ON e.entity_type = 'relation' AND r.id = e.entity_id
         WHERE (?1 IS NULL OR e.created_at < ?1 OR (e.created_at = ?1 AND e.id < ?2))
           AND (?3 IS NULL OR e.workspace_id = ?3)
           AND (?4 IS NULL OR e.event_type IN (SELECT value FROM json_each(?4)))
           AND (?5 IS NULL OR e.entity_type IN (SELECT value FROM json_each(?5)))
           AND (?6 IS NULL OR e.created_at >= ?6)
           AND (?7 IS NULL OR e.created_at < ?7)
         ORDER BY e.created_at DESC, e.id DESC LIMIT ?8",
    )?;
    let rows = statement.query_map(
        params![
            query.after.as_ref().map(|cursor| cursor.created_at),
            query.after.as_ref().map(|cursor| cursor.id.as_str()),
            query.workspace_id,
            event_types,
            entity_types,
            query.from,
            query.to,
            limit
        ],
        from_row,
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Clears the whole history, on the user's explicit request (specification §13.2). Resources are not touched.
pub fn clear(transaction: &Transaction<'_>) -> AppResult<usize> {
    Ok(transaction.execute("DELETE FROM timeline_events", [])?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::db::testing::open_temporary;

    fn record_one(
        database: &Database,
        event_type: TimelineEventType,
        entity: EntityKind,
        workspace: Option<&str>,
        description: &str,
    ) -> TimelineEvent {
        let entity_id = new_id();
        database
            .write(|tx| {
                record(
                    tx,
                    &NewTimelineEvent {
                        event_type,
                        entity: (entity, &entity_id),
                        workspace_id: workspace,
                        description,
                        metadata: serde_json::json!({}),
                    },
                )
            })
            .expect("record")
    }

    fn page(database: &Database, query: &TimelineQuery) -> Vec<TimelineEvent> {
        database
            .read(|c| list_query(c, query))
            .expect("timeline page")
    }

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
            record_one(
                &database,
                *kind,
                EntityKind::Note,
                Some(&workspace),
                &format!("Événement {index}"),
            );
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let events = database.read(|c| list(c, 10)).expect("list");
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, TimelineEventType::NoteCreated);
        // The resource does not exist: nothing to open.
        assert!(!events[0].available && events[0].target.is_none());
        let older = page(
            &database,
            &TimelineQuery {
                after: Some(TimelineCursor {
                    created_at: events[0].created_at,
                    id: events[0].id.clone(),
                }),
                limit: 10,
                ..TimelineQuery::default()
            },
        );
        assert_eq!(older.len(), 1);
        assert_eq!(database.write(clear).expect("clear"), 2);
        assert!(database.read(|c| list(c, 10)).expect("list").is_empty());
    }

    #[test]
    fn pages_follow_each_other_without_repeating_or_skipping_events_of_the_same_millisecond() {
        let (_dir, database) = open_temporary();
        let mut ids: Vec<String> = (0..7)
            .map(|index| {
                record_one(
                    &database,
                    TimelineEventType::NoteCreated,
                    EntityKind::Note,
                    None,
                    &format!("Note {index}"),
                )
                .id
            })
            .collect();
        database
            .with_writer(|c| Ok(c.execute("UPDATE timeline_events SET created_at = 1000", [])?))
            .expect("same millisecond");
        let mut seen = Vec::new();
        let mut after = None;
        loop {
            let events = page(
                &database,
                &TimelineQuery {
                    after: after.clone(),
                    limit: 3,
                    ..TimelineQuery::default()
                },
            );
            let Some(last) = events.last() else {
                break;
            };
            after = Some(TimelineCursor {
                created_at: last.created_at,
                id: last.id.clone(),
            });
            seen.extend(events.into_iter().map(|event| event.id));
        }
        ids.sort_unstable_by(|a, b| b.cmp(a));
        assert_eq!(seen, ids);
    }

    #[test]
    fn events_are_filtered_by_workspace_type_resource_and_period() {
        let (_dir, database) = open_temporary();
        let (first, second) = (new_id(), new_id());
        let imported = record_one(
            &database,
            TimelineEventType::DocumentImported,
            EntityKind::Document,
            Some(&first),
            "Cours",
        );
        record_one(
            &database,
            TimelineEventType::NoteCreated,
            EntityKind::Note,
            Some(&second),
            "Note",
        );
        record_one(
            &database,
            TimelineEventType::ResourceArchived,
            EntityKind::Note,
            Some(&first),
            "Note archivée",
        );
        let by_workspace = page(
            &database,
            &TimelineQuery {
                limit: 10,
                workspace_id: Some(first.clone()),
                ..TimelineQuery::default()
            },
        );
        assert_eq!(by_workspace.len(), 2);
        assert!(
            by_workspace
                .iter()
                .all(|event| event.workspace_id.as_deref() == Some(first.as_str()))
        );
        let by_type = page(
            &database,
            &TimelineQuery {
                limit: 10,
                event_types: Some(vec![
                    TimelineEventType::DocumentImported,
                    TimelineEventType::ResourceArchived,
                ]),
                ..TimelineQuery::default()
            },
        );
        assert_eq!(by_type.len(), 2);
        let by_resource = page(
            &database,
            &TimelineQuery {
                limit: 10,
                entity_types: Some(vec![EntityKind::Note]),
                ..TimelineQuery::default()
            },
        );
        assert_eq!(by_resource.len(), 2);
        assert!(
            by_resource
                .iter()
                .all(|event| event.entity_type == EntityKind::Note)
        );
        database
            .with_writer(|c| {
                Ok(c.execute(
                    "UPDATE timeline_events SET created_at = 5000 WHERE id = ?1",
                    [&imported.id],
                )?)
            })
            .expect("older event");
        let period = page(
            &database,
            &TimelineQuery {
                limit: 10,
                from: Some(4_000),
                to: Some(6_000),
                ..TimelineQuery::default()
            },
        );
        assert_eq!(period.len(), 1);
        assert_eq!(period[0].id, imported.id);
        let combined = page(
            &database,
            &TimelineQuery {
                limit: 10,
                workspace_id: Some(first),
                entity_types: Some(vec![EntityKind::Document]),
                from: Some(6_000),
                ..TimelineQuery::default()
            },
        );
        assert!(combined.is_empty());
    }

    #[test]
    fn long_descriptions_are_shortened_and_queries_checked() {
        let (_dir, database) = open_temporary();
        let long = "é".repeat(DESCRIPTION_MAX + 20);
        let event = record_one(
            &database,
            TimelineEventType::DocumentImported,
            EntityKind::Document,
            None,
            &long,
        );
        assert_eq!(event.description.chars().count(), DESCRIPTION_MAX);
        assert!(database.read(|c| list(c, 0)).is_err());
        assert!(database.read(|c| list(c, PAGE_MAX + 1)).is_err());
        let refused = [
            TimelineQuery {
                limit: 10,
                from: Some(10),
                to: Some(10),
                ..TimelineQuery::default()
            },
            TimelineQuery {
                limit: 10,
                workspace_id: Some("1 OR 1=1".to_owned()),
                ..TimelineQuery::default()
            },
            TimelineQuery {
                limit: 10,
                after: Some(TimelineCursor {
                    created_at: 1,
                    id: "x' OR '1'='1".to_owned(),
                }),
                ..TimelineQuery::default()
            },
            TimelineQuery {
                limit: 10,
                entity_types: Some(vec![EntityKind::Note; 17]),
                ..TimelineQuery::default()
            },
        ];
        for query in refused {
            assert!(matches!(
                database.read(|c| list_query(c, &query)),
                Err(AppError::InvalidInput(_))
            ));
        }
    }
}
