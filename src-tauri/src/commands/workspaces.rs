//! Workspace commands (specification §12).

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::repo::workspaces::{self, NewWorkspace, Workspace, WorkspacePatch, WorkspaceSummary};
use crate::services::workspaces::{
    self as service, WorkspaceDeletion, WorkspaceDeletionReport, WorkspaceDetail,
};
use crate::state::AppState;

#[tauri::command]
pub async fn workspaces_list(
    state: State<'_, AppState>,
    include_archived: bool,
) -> AppResult<Vec<WorkspaceSummary>> {
    let database = state.database()?;
    blocking("workspaces_list", move || {
        database.read(|connection| workspaces::list_summaries(connection, include_archived))
    })
    .await
}

#[tauri::command]
pub async fn workspaces_get(state: State<'_, AppState>, id: String) -> AppResult<WorkspaceDetail> {
    let database = state.database()?;
    blocking("workspaces_get", move || {
        database.read(|connection| service::detail(connection, &id))
    })
    .await
}

#[tauri::command]
pub async fn workspaces_create(
    state: State<'_, AppState>,
    input: NewWorkspace,
) -> AppResult<Workspace> {
    let database = state.database()?;
    blocking("workspaces_create", move || {
        database.write(|transaction| service::create(transaction, &input))
    })
    .await
}

#[tauri::command]
pub async fn workspaces_update(
    state: State<'_, AppState>,
    id: String,
    patch: WorkspacePatch,
) -> AppResult<Workspace> {
    let database = state.database()?;
    blocking("workspaces_update", move || {
        database.write(|transaction| service::update(transaction, &id, &patch))
    })
    .await
}

#[tauri::command]
pub async fn workspaces_set_archived(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Workspace> {
    let database = state.database()?;
    blocking("workspaces_set_archived", move || {
        database.write(|transaction| service::set_archived(transaction, &id, archived))
    })
    .await
}

#[tauri::command]
pub async fn workspaces_delete(
    state: State<'_, AppState>,
    id: String,
    deletion: WorkspaceDeletion,
) -> AppResult<WorkspaceDeletionReport> {
    let database = state.database()?;
    blocking("workspaces_delete", move || {
        database.write(|transaction| service::delete(transaction, &id, &deletion))
    })
    .await
}
