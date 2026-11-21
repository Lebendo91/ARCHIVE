//! Overview data (specification §6.1): every figure comes from a database query, none is estimated.

use rusqlite::Connection;
use serde::Serialize;
use ts_rs::TS;

use crate::error::AppResult;
use crate::repo::resources::{self, ResourceSummary};
use crate::repo::timeline::{self, TimelineEvent};
use crate::util::now_ms;

const RECENT_ACTIVITY: u32 = 8;
const RECENT_RESOURCES: u32 = 6;
const INDEXED_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DashboardOverview {
    pub documents: i64,
    pub notes: i64,
    /// Active (non-archived) workspaces.
    pub workspaces: i64,
    /// Documents whose text was extracted during the last seven days.
    pub recently_indexed: i64,
    pub recent_activity: Vec<TimelineEvent>,
    pub recently_opened: Vec<ResourceSummary>,
    pub favorites: Vec<ResourceSummary>,
}

pub fn overview(connection: &Connection) -> AppResult<DashboardOverview> {
    let (documents, notes, workspaces): (i64, i64, i64) = connection.query_row(
        "SELECT (SELECT count(*) FROM documents WHERE deleted_at IS NULL),
                (SELECT count(*) FROM notes WHERE deleted_at IS NULL),
                (SELECT count(*) FROM workspaces WHERE is_archived = 0)",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    Ok(DashboardOverview {
        documents,
        notes,
        workspaces,
        recently_indexed: resources::indexed_since(connection, now_ms() - INDEXED_WINDOW_MS)?,
        recent_activity: timeline::list(connection, None, RECENT_ACTIVITY)?,
        recently_opened: resources::recently_opened(connection, None, RECENT_RESOURCES)?,
        favorites: resources::favorites(connection, None, RECENT_RESOURCES)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::open_temporary;
    use crate::repo::workspaces::NewWorkspace;

    #[test]
    fn a_new_installation_has_only_zeros_and_empty_lists() {
        let (_dir, database) = open_temporary();
        let overview = database.read(overview).expect("overview");
        assert_eq!(
            (
                overview.documents,
                overview.notes,
                overview.workspaces,
                overview.recently_indexed
            ),
            (0, 0, 0, 0)
        );
        assert!(
            overview.recent_activity.is_empty()
                && overview.recently_opened.is_empty()
                && overview.favorites.is_empty()
        );
    }

    #[test]
    fn figures_follow_the_database() {
        let (_dir, database) = open_temporary();
        let workspace = database
            .write(|tx| {
                crate::services::workspaces::create(
                    tx,
                    &NewWorkspace {
                        name: "Recherche".to_owned(),
                        description: None,
                        color: None,
                        icon: None,
                    },
                )
            })
            .expect("workspace");
        database
            .write(|tx| crate::services::workspaces::set_archived(tx, &workspace.id, true))
            .expect("archive");
        let overview = database.read(overview).expect("overview");
        assert_eq!(
            overview.workspaces, 0,
            "archived workspaces are not counted"
        );
        assert_eq!(overview.recent_activity.len(), 2);
    }
}
