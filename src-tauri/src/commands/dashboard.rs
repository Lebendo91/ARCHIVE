//! Overview and timeline commands (specification §6, §13).

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::repo::timeline::{self, TimelinePage, TimelineQuery};
use crate::services::dashboard::{self, DashboardOverview};
use crate::state::AppState;

#[tauri::command]
pub async fn dashboard_overview(state: State<'_, AppState>) -> AppResult<DashboardOverview> {
    let database = state.database()?;
    blocking("dashboard_overview", move || {
        database.read(dashboard::overview)
    })
    .await
}

/// A page of the timeline, filtered (specification §13.2).
#[tauri::command]
pub async fn timeline_list(
    state: State<'_, AppState>,
    query: TimelineQuery,
) -> AppResult<TimelinePage> {
    let database = state.database()?;
    blocking("timeline_list", move || {
        database.read(|connection| timeline::page(connection, &query))
    })
    .await
}

/// Clears the whole history on the user's explicit request; documents, notes and workspaces are not touched.
/// Returns the number of events removed.
#[tauri::command]
pub async fn timeline_clear(state: State<'_, AppState>) -> AppResult<usize> {
    let database = state.database()?;
    blocking("timeline_clear", move || {
        let cleared = database.write(timeline::clear)?;
        log::info!("timeline cleared ({cleared} events)");
        Ok(cleared)
    })
    .await
}
