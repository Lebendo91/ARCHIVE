//! Workspace operations (specification §12): creation, edition, archiving and protected deletion.

use rusqlite::{Connection, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::repo::EntityKind;
use crate::repo::folders::{self, Folder};
use crate::repo::relations;
use crate::repo::resources::{self, ResourceSummary};
use crate::repo::timeline::{
    self, NewTimelineEvent, TimelineEvent, TimelineEventType, TimelineQuery,
};
use crate::repo::workspaces::{self, NewWorkspace, ResourceCounts, Workspace, WorkspacePatch};
use crate::util::{name_key, now_ms, validate_id};

const DETAIL_ACTIVITY: u32 = 8;
const DETAIL_FAVORITES: u32 = 6;

/// What becomes of the resources of a deleted workspace (specification §12.3: never deleted silently).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
#[ts(export)]
pub enum WorkspaceDeletion {
    /// The workspace holds nothing.
    Empty,
    /// Folders, documents and notes move to `target`, gathered in a folder named after the deleted workspace.
    MoveTo { target: String },
    /// Documents and notes stay, without workspace; the folders are removed (never their content).
    Unassign,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceDeletionReport {
    pub documents: i64,
    pub notes: i64,
    pub folders_moved: i64,
    pub folders_removed: i64,
    /// Folder created in the target workspace to gather the moved resources.
    pub container_folder: Option<Folder>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceDetail {
    pub workspace: Workspace,
    pub counts: ResourceCounts,
    pub recent_activity: Vec<TimelineEvent>,
    pub favorites: Vec<ResourceSummary>,
}

fn record(
    transaction: &Transaction<'_>,
    event_type: TimelineEventType,
    workspace: &Workspace,
) -> AppResult<TimelineEvent> {
    timeline::record(
        transaction,
        &NewTimelineEvent {
            event_type,
            entity: (EntityKind::Workspace, &workspace.id),
            workspace_id: Some(&workspace.id),
            description: &workspace.name,
            metadata: serde_json::json!({}),
        },
    )
}

pub fn create(transaction: &Transaction<'_>, input: &NewWorkspace) -> AppResult<Workspace> {
    let workspace = workspaces::create(transaction, input)?;
    record(transaction, TimelineEventType::WorkspaceCreated, &workspace)?;
    Ok(workspace)
}

pub fn update(
    transaction: &Transaction<'_>,
    id: &str,
    patch: &WorkspacePatch,
) -> AppResult<Workspace> {
    workspaces::update(transaction, id, patch)
}

pub fn set_archived(
    transaction: &Transaction<'_>,
    id: &str,
    archived: bool,
) -> AppResult<Workspace> {
    let before = workspaces::get(transaction, id)?;
    let workspace = workspaces::set_archived(transaction, id, archived)?;
    if before.is_archived != archived {
        let event = if archived {
            TimelineEventType::ResourceArchived
        } else {
            TimelineEventType::ResourceRestored
        };
        record(transaction, event, &workspace)?;
    }
    Ok(workspace)
}

pub fn detail(connection: &Connection, id: &str) -> AppResult<WorkspaceDetail> {
    let workspace = workspaces::get(connection, id)?;
    Ok(WorkspaceDetail {
        counts: workspaces::counts(connection, id)?,
        recent_activity: timeline::list_query(
            connection,
            &TimelineQuery {
                before: None,
                limit: DETAIL_ACTIVITY,
                workspace_id: Some(id.to_owned()),
            },
        )?,
        favorites: resources::favorites(connection, Some(id), DETAIL_FAVORITES)?,
        workspace,
    })
}

/// Creates a root folder in `workspace_id` named `base`, or `base (2)`, `base (3)`… if the name is taken.
fn create_unique_root_folder(
    transaction: &Transaction<'_>,
    workspace_id: &str,
    base: &str,
) -> AppResult<Folder> {
    for attempt in 1..=100 {
        let name = if attempt == 1 {
            base.to_owned()
        } else {
            format!("{base} ({attempt})")
        };
        let taken: bool = transaction.query_row(
            "SELECT EXISTS (SELECT 1 FROM folders WHERE workspace_id = ?1 AND parent_id IS NULL AND name_key = ?2)",
            params![workspace_id, name_key(&name)],
            |row| row.get(0),
        )?;
        if !taken {
            return folders::create(transaction, workspace_id, None, &name);
        }
    }
    Err(AppError::Internal(
        "no free folder name in the target workspace".to_owned(),
    ))
}

/// Deletes a workspace according to the strategy chosen by the user, in a single transaction.
pub fn delete(
    transaction: &Transaction<'_>,
    id: &str,
    deletion: &WorkspaceDeletion,
) -> AppResult<WorkspaceDeletionReport> {
    let workspace = workspaces::get(transaction, id)?;
    let counts = workspaces::counts(transaction, id)?;
    // Documents and notes in the trash still belong to the workspace: they follow the same strategy.
    let all_documents: i64 = transaction.query_row(
        "SELECT count(*) FROM documents WHERE workspace_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    let all_notes: i64 = transaction.query_row(
        "SELECT count(*) FROM notes WHERE workspace_id = ?1",
        [id],
        |row| row.get(0),
    )?;
    let mut report = WorkspaceDeletionReport {
        documents: counts.documents,
        notes: counts.notes,
        ..WorkspaceDeletionReport::default()
    };
    let now = now_ms();

    match deletion {
        WorkspaceDeletion::Empty => {
            if counts.total() > 0 || all_documents + all_notes > 0 {
                return Err(AppError::InUse {
                    entity: "workspace",
                    reason: "it still holds folders, documents or notes".to_owned(),
                });
            }
        }
        WorkspaceDeletion::MoveTo { target } => {
            validate_id(target, "target workspace id")?;
            if target == id {
                return Err(AppError::InvalidInput(
                    "a workspace cannot be moved into itself".to_owned(),
                ));
            }
            workspaces::get(transaction, target)?;
            let container = create_unique_root_folder(transaction, target, &workspace.name)?;
            transaction.execute(
                "UPDATE folders SET parent_id = ?2, updated_at = ?3 WHERE workspace_id = ?1 AND parent_id IS NULL",
                params![id, container.id, now],
            )?;
            report.folders_moved = i64::try_from(transaction.execute(
                "UPDATE folders SET workspace_id = ?2, updated_at = ?3 WHERE workspace_id = ?1",
                params![id, target, now],
            )?)
            .unwrap_or(i64::MAX);
            for table in ["documents", "notes"] {
                transaction.execute(
                    &format!(
                        "UPDATE {table} SET workspace_id = ?2, folder_id = coalesce(folder_id, ?3), updated_at = ?4
                         WHERE workspace_id = ?1"
                    ),
                    params![id, target, container.id, now],
                )?;
            }
            report.container_folder = Some(container);
        }
        WorkspaceDeletion::Unassign => {
            for table in ["documents", "notes"] {
                transaction.execute(
                    &format!(
                        "UPDATE {table} SET workspace_id = NULL, folder_id = NULL, updated_at = ?2 WHERE workspace_id = ?1"
                    ),
                    params![id, now],
                )?;
            }
            transaction.execute(
                "UPDATE folders SET parent_id = NULL WHERE workspace_id = ?1",
                [id],
            )?;
            report.folders_removed = i64::try_from(
                transaction.execute("DELETE FROM folders WHERE workspace_id = ?1", [id])?,
            )
            .unwrap_or(i64::MAX);
        }
    }

    relations::delete_for_entity(transaction, EntityKind::Workspace, id)?;
    workspaces::delete(transaction, id)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::db::testing::open_temporary;
    use crate::repo::notes::{self, NoteContent, NoteFormat};

    fn new_workspace(database: &Database, name: &str) -> Workspace {
        database
            .write(|tx| {
                create(
                    tx,
                    &NewWorkspace {
                        name: name.to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace")
    }

    fn note_in(database: &Database, workspace: &str, folder: Option<&str>, title: &str) -> String {
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
                    Some(workspace),
                    folder,
                )
            })
            .expect("note")
            .id
    }

    #[test]
    fn creation_and_archiving_are_recorded_in_the_timeline() {
        let (_dir, database) = open_temporary();
        let workspace = new_workspace(&database, "Électronique");
        database
            .write(|tx| set_archived(tx, &workspace.id, true))
            .expect("archive");
        database
            .write(|tx| set_archived(tx, &workspace.id, true))
            .expect("archive twice");
        database
            .write(|tx| set_archived(tx, &workspace.id, false))
            .expect("restore");
        let detail = database.read(|c| detail(c, &workspace.id)).expect("detail");
        let types: Vec<TimelineEventType> = detail
            .recent_activity
            .iter()
            .map(|event| event.event_type)
            .collect();
        assert_eq!(
            types,
            [
                TimelineEventType::ResourceRestored,
                TimelineEventType::ResourceArchived,
                TimelineEventType::WorkspaceCreated
            ]
        );
        assert!(
            detail
                .recent_activity
                .iter()
                .all(|event| event.description == "Électronique")
        );
    }

    #[test]
    fn an_empty_workspace_is_deleted_with_the_empty_strategy_only() {
        let (_dir, database) = open_temporary();
        let empty = new_workspace(&database, "Vide");
        let report = database
            .write(|tx| delete(tx, &empty.id, &WorkspaceDeletion::Empty))
            .expect("delete");
        assert_eq!(report, WorkspaceDeletionReport::default());

        let busy = new_workspace(&database, "Occupé");
        note_in(&database, &busy.id, None, "Note");
        let error = database
            .write(|tx| delete(tx, &busy.id, &WorkspaceDeletion::Empty))
            .expect_err("refused");
        assert!(matches!(error, AppError::InUse { .. }));
        assert!(
            database.read(|c| workspaces::get(c, &busy.id)).is_ok(),
            "nothing deleted"
        );
    }

    #[test]
    fn moving_keeps_every_resource_and_the_folder_structure() {
        let (_dir, database) = open_temporary();
        let source = new_workspace(&database, "Études");
        let target = new_workspace(&database, "Archives");
        // A folder named like the source workspace already exists in the target: the container gets a suffix.
        database
            .write(|tx| folders::create(tx, &target.id, None, "Études"))
            .expect("existing folder");
        let courses = database
            .write(|tx| folders::create(tx, &source.id, None, "Cours"))
            .expect("folder");
        let physics = database
            .write(|tx| folders::create(tx, &source.id, Some(&courses.id), "Physique"))
            .expect("sub-folder");
        let in_folder = note_in(&database, &source.id, Some(&physics.id), "Optique");
        let at_root = note_in(&database, &source.id, None, "Idées");

        let report = database
            .write(|tx| {
                delete(
                    tx,
                    &source.id,
                    &WorkspaceDeletion::MoveTo {
                        target: target.id.clone(),
                    },
                )
            })
            .expect("delete with move");
        let container = report.container_folder.clone().expect("container folder");
        assert_eq!(container.name, "Études (2)");
        assert_eq!((report.notes, report.folders_moved), (2, 2));

        let moved_courses = database
            .read(|c| folders::get(c, &courses.id))
            .expect("courses");
        assert_eq!(moved_courses.workspace_id, target.id);
        assert_eq!(
            moved_courses.parent_id.as_deref(),
            Some(container.id.as_str())
        );
        let optics = database
            .read(|c| notes::get(c, &in_folder))
            .expect("optics");
        assert_eq!(
            (optics.workspace_id.as_deref(), optics.folder_id.as_deref()),
            (Some(target.id.as_str()), Some(physics.id.as_str()))
        );
        let ideas = database.read(|c| notes::get(c, &at_root)).expect("ideas");
        assert_eq!(ideas.folder_id.as_deref(), Some(container.id.as_str()));
        assert!(matches!(
            database.read(|c| workspaces::get(c, &source.id)),
            Err(AppError::NotFound { .. })
        ));
    }

    #[test]
    fn unassigning_keeps_documents_and_notes_and_removes_only_folders() {
        let (_dir, database) = open_temporary();
        let source = new_workspace(&database, "Travail");
        let parent = database
            .write(|tx| folders::create(tx, &source.id, None, "Clients"))
            .expect("folder");
        let child = database
            .write(|tx| folders::create(tx, &source.id, Some(&parent.id), "Contrats"))
            .expect("sub-folder");
        let kept = note_in(&database, &source.id, Some(&child.id), "Compte rendu");
        let report = database
            .write(|tx| delete(tx, &source.id, &WorkspaceDeletion::Unassign))
            .expect("delete");
        assert_eq!((report.notes, report.folders_removed), (1, 2));
        let note = database.read(|c| notes::get(c, &kept)).expect("note kept");
        assert_eq!((note.workspace_id, note.folder_id), (None, None));
    }

    #[test]
    fn moving_into_itself_or_a_missing_workspace_is_refused() {
        let (_dir, database) = open_temporary();
        let source = new_workspace(&database, "Source");
        note_in(&database, &source.id, None, "Note");
        assert!(matches!(
            database.write(|tx| delete(
                tx,
                &source.id,
                &WorkspaceDeletion::MoveTo {
                    target: source.id.clone()
                }
            )),
            Err(AppError::InvalidInput(_))
        ));
        assert!(matches!(
            database.write(|tx| delete(
                tx,
                &source.id,
                &WorkspaceDeletion::MoveTo {
                    target: crate::util::new_id()
                }
            )),
            Err(AppError::NotFound { .. })
        ));
        assert_eq!(
            database
                .read(|c| workspaces::counts(c, &source.id))
                .expect("counts")
                .notes,
            1
        );
    }

    #[test]
    fn deletion_strategies_parse_from_the_interface_format() {
        let parsed: WorkspaceDeletion =
            serde_json::from_str(r#"{"kind":"move_to","target":"x"}"#).expect("parse");
        assert_eq!(
            parsed,
            WorkspaceDeletion::MoveTo {
                target: "x".to_owned()
            }
        );
        assert!(
            serde_json::from_str::<WorkspaceDeletion>(r#"{"kind":"drop_everything"}"#).is_err()
        );
    }
}
