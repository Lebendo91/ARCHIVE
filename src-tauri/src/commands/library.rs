//! Folders and tags of the Library (specification §7.3, §12.1).

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::repo::TokenColor;
use crate::repo::folders::{self, Folder};
use crate::repo::tags::{self, Tag, TagUsage};
use crate::state::AppState;

#[tauri::command]
pub async fn folders_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<Folder>> {
    let database = state.database()?;
    blocking("folders_list", move || {
        database.read(|connection| folders::list_for_workspace(connection, &workspace_id))
    })
    .await
}

#[tauri::command]
pub async fn folders_create(
    state: State<'_, AppState>,
    workspace_id: String,
    parent_id: Option<String>,
    name: String,
) -> AppResult<Folder> {
    let database = state.database()?;
    blocking("folders_create", move || {
        database.write(|transaction| {
            folders::create(transaction, &workspace_id, parent_id.as_deref(), &name)
        })
    })
    .await
}

#[tauri::command]
pub async fn folders_rename(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<Folder> {
    let database = state.database()?;
    blocking("folders_rename", move || {
        database.write(|transaction| folders::rename(transaction, &id, &name))
    })
    .await
}

/// Moves a folder under another folder of its workspace (`None`: to the root); never inside itself.
#[tauri::command]
pub async fn folders_move(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
) -> AppResult<Folder> {
    let database = state.database()?;
    blocking("folders_move", move || {
        database.write(|transaction| folders::move_to(transaction, &id, parent_id.as_deref()))
    })
    .await
}

/// Deletes an empty folder; a folder that still holds anything is refused (`in_use`).
#[tauri::command]
pub async fn folders_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("folders_delete", move || {
        database.write(|transaction| folders::delete(transaction, &id))
    })
    .await
}

#[tauri::command]
pub async fn tags_list(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    let database = state.database()?;
    blocking("tags_list", move || database.read(tags::list)).await
}

/// Tags with the number of documents and notes carrying each, for their management.
#[tauri::command]
pub async fn tags_usage(state: State<'_, AppState>) -> AppResult<Vec<TagUsage>> {
    let database = state.database()?;
    blocking("tags_usage", move || database.read(tags::usage)).await
}

#[tauri::command]
pub async fn tags_create(
    state: State<'_, AppState>,
    name: String,
    color: TokenColor,
) -> AppResult<Tag> {
    let database = state.database()?;
    blocking("tags_create", move || {
        database.write(|transaction| tags::create(transaction, &name, color))
    })
    .await
}

#[tauri::command]
pub async fn tags_rename(state: State<'_, AppState>, id: String, name: String) -> AppResult<Tag> {
    let database = state.database()?;
    blocking("tags_rename", move || {
        database.write(|transaction| tags::rename(transaction, &id, &name))
    })
    .await
}

/// Deletes a tag; documents and notes keep existing, they only lose this tag.
#[tauri::command]
pub async fn tags_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("tags_delete", move || {
        database.write(|transaction| tags::delete(transaction, &id))
    })
    .await
}
