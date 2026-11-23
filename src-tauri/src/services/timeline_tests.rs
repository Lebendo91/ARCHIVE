//! Timeline (specification §13): the meaningful operations recorded by the services, checked end to end.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

use crate::db::testing::open_temporary;
use crate::import::pipeline::{ImportContext, ImportTarget, import_paths};
use crate::paths::AppPaths;
use crate::repo::EntityKind;
use crate::repo::notes::{NoteContent, NoteFormat};
use crate::repo::relations::{self, NewRelation, RelationOrigin};
use crate::repo::timeline::{self, TimelineEventType, TimelineQuery, TimelineTarget};
use crate::repo::workspaces::NewWorkspace;
use crate::services::relations::RelationDecision;
use crate::services::{documents, notes, relations as relation_service, workspaces};
use crate::storage::FileStore;

fn content(title: &str) -> NoteContent {
    NoteContent {
        title: title.to_owned(),
        content: title.to_owned(),
        content_format: NoteFormat::Plain,
        content_text: title.to_owned(),
    }
}

/// Each operation of the specification §13.1, done through the real services, leaves its event; the
/// interface can open what still exists.
#[test]
fn every_meaningful_operation_is_recorded_once_done() {
    let (dir, database) = open_temporary();
    let paths = AppPaths::from_data_dir(dir.path().join("data"));
    paths.ensure_directories().expect("directories");
    let store = FileStore::new(&paths);
    let cancel = AtomicBool::new(false);

    let workspace = database
        .write(|tx| {
            workspaces::create(
                tx,
                &NewWorkspace {
                    name: "Électronique".to_owned(),
                    description: None,
                    color: None,
                    icon: None,
                },
            )
        })
        .expect("workspace");
    let source: PathBuf = dir.path().join("Cours NE555.txt");
    std::fs::write(&source, "Le NE555 en montage astable.").expect("source");
    let summary = import_paths(
        &ImportContext {
            database: &database,
            store: &store,
            cancel: &cancel,
        },
        &[source],
        &ImportTarget {
            workspace_id: Some(workspace.id.clone()),
            folder_id: None,
        },
        |_| {},
    )
    .expect("import");
    assert_eq!(summary.imported, 1);
    let document: String = database
        .read(|c| Ok(c.query_row("SELECT id FROM documents", [], |row| row.get(0))?))
        .expect("document");

    let note = database
        .write(|tx| {
            notes::create(
                tx,
                &notes::NewNote {
                    content: content("Montage astable"),
                    workspace_id: Some(workspace.id.clone()),
                    folder_id: None,
                    links: Vec::new(),
                },
            )
        })
        .expect("note");
    // A modification is recorded at most once an hour: the creation is made older.
    database
        .with_writer(|c| {
            Ok(c.execute(
                "UPDATE timeline_events SET created_at = created_at - 7200000 WHERE entity_id = ?1",
                [&note.id],
            )?)
        })
        .expect("older creation");
    database
        .write(|tx| {
            notes::save(
                tx,
                &note.id,
                note.revision,
                &content("Montage astable du NE555"),
                &[],
            )
        })
        .expect("saved");
    database
        .write(|tx| documents::set_favorite(tx, &document, true))
        .expect("favorite");
    database
        .write(|tx| notes::set_archived(tx, &note.id, true))
        .expect("archived");
    database
        .write(|tx| notes::set_archived(tx, &note.id, false))
        .expect("restored");
    let suggestion = database
        .write(|tx| {
            relations::create(
                tx,
                &NewRelation {
                    source: (EntityKind::Document, document.clone()),
                    target: (EntityKind::Note, note.id.clone()),
                    relation_type: "related_to".to_owned(),
                    origin: RelationOrigin::Rule,
                    confidence: Some(0.6),
                    provenance: serde_json::json!({ "rule": "shared_terms" }),
                },
            )
        })
        .expect("suggestion");
    database
        .write(|tx| relation_service::decide(tx, &suggestion.id, RelationDecision::Accept))
        .expect("accepted");

    let events = database
        .read(|c| {
            timeline::page(
                c,
                &TimelineQuery {
                    limit: 50,
                    ..TimelineQuery::default()
                },
            )
        })
        .expect("timeline")
        .events;
    let mut types: Vec<TimelineEventType> = events.iter().map(|event| event.event_type).collect();
    types.sort_by_key(|kind| format!("{kind:?}"));
    types.dedup();
    assert_eq!(types.len(), 8, "{types:?}");

    let find = |kind: TimelineEventType| {
        events
            .iter()
            .find(|event| event.event_type == kind)
            .expect("event")
    };
    let imported = find(TimelineEventType::DocumentImported);
    assert_eq!(
        imported.workspace_id.as_deref(),
        Some(workspace.id.as_str())
    );
    assert_eq!(imported.metadata["format"], "txt");
    assert_eq!(
        imported.target,
        Some(TimelineTarget {
            kind: EntityKind::Document,
            id: document.clone(),
        })
    );
    // An accepted relation leads to the item it starts from.
    // The note was named after its creation: the timeline shows its title of today.
    let created = find(TimelineEventType::NoteCreated);
    assert_eq!(created.description, "Montage astable");
    assert_eq!(
        created.current_title.as_deref(),
        Some("Montage astable du NE555")
    );
    let accepted = find(TimelineEventType::RelationAccepted);
    assert_eq!(accepted.current_title, None);
    assert!(accepted.available);
    assert_eq!(
        accepted.target,
        Some(TimelineTarget {
            kind: EntityKind::Document,
            id: document.clone(),
        })
    );
    assert_eq!(
        accepted.description,
        "Cours NE555 — Montage astable du NE555"
    );

    // Once the relation is removed, the event stays but leads nowhere.
    database
        .write(|tx| relation_service::remove(tx, &suggestion.id))
        .expect("removed");
    let events = database
        .read(|c| {
            timeline::page(
                c,
                &TimelineQuery {
                    limit: 50,
                    event_types: Some(vec![TimelineEventType::RelationAccepted]),
                    ..TimelineQuery::default()
                },
            )
        })
        .expect("timeline");
    assert_eq!(events.events.len(), 1);
    assert!(!events.has_more);
    assert!(!events.events[0].available && events.events[0].target.is_none());

    // Clearing the history removes the events, never the resources.
    let cleared = database.write(timeline::clear).expect("cleared");
    assert!(cleared >= 8);
    let remaining: (i64, i64, i64) = database
        .read(|c| {
            Ok(c.query_row(
                "SELECT (SELECT count(*) FROM timeline_events), (SELECT count(*) FROM documents),
                        (SELECT count(*) FROM notes)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?)
        })
        .expect("counts");
    assert_eq!(remaining, (0, 1, 1));
}
