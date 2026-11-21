//! Overview and timeline commands (specification §6, §13).

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::repo::timeline::{self, TimelineEvent, TimelineQuery};
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

#[tauri::command]
pub async fn timeline_list(
    state: State<'_, AppState>,
    query: TimelineQuery,
) -> AppResult<Vec<TimelineEvent>> {
    let database = state.database()?;
    blocking("timeline_list", move || {
        database.read(|connection| timeline::list_query(connection, &query))
    })
    .await
}
