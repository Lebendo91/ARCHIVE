//! Knowledge graph command (specification §11).

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::services::graph::{self, GraphData, GraphQuery};
use crate::state::AppState;

/// The graph that answers a query, filtered and limited by the core before it is sent (spec §11.3).
#[tauri::command]
pub async fn graph_load(state: State<'_, AppState>, query: GraphQuery) -> AppResult<GraphData> {
    let database = state.database()?;
    blocking("graph_load", move || {
        database.read(|connection| graph::load_graph(connection, &query))
    })
    .await
}
