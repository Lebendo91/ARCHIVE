//! Search commands (specification §9): queries on the full-text index of the core, and the search history.
//! Nothing leaves the computer: the index and the history are in the local database.

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::search::history::{self, SearchHistoryEntry};
use crate::search::query::{self, SearchRequest, SearchResults};
use crate::state::AppState;

#[tauri::command]
pub async fn search_query(
    state: State<'_, AppState>,
    request: SearchRequest,
) -> AppResult<SearchResults> {
    let database = state.database()?;
    blocking("search_query", move || {
        database.read(|connection| query::search(connection, &request))
    })
    .await
}

#[tauri::command]
pub async fn search_history_list(
    state: State<'_, AppState>,
    limit: u32,
) -> AppResult<Vec<SearchHistoryEntry>> {
    let database = state.database()?;
    blocking("search_history_list", move || {
        database.read(|connection| history::list(connection, limit))
    })
    .await
}

/// Records a search the user ran (a result opened, or the search page submitted).
#[tauri::command]
pub async fn search_history_record(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<SearchHistoryEntry> {
    let database = state.database()?;
    blocking("search_history_record", move || {
        database.write(|transaction| history::record(transaction, &query))
    })
    .await
}

#[tauri::command]
pub async fn search_history_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("search_history_delete", move || {
        database.write(|transaction| history::delete(transaction, &id))
    })
    .await
}

#[tauri::command]
pub async fn search_history_clear(state: State<'_, AppState>) -> AppResult<()> {
    let database = state.database()?;
    blocking("search_history_clear", move || {
        database.write(history::clear)
    })
    .await
}
