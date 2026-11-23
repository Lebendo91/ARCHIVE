//! Memory engine commands (specification §10): what the engine knows of an item, new tries of its failed
//! stages, and the relations under the user's control.

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::memory::status::{self, MemoryItem, MemoryOverview};
use crate::memory::{ItemKind, queue};
use crate::repo::relations::Relation;
use crate::services::relations::{
    self as service, NewRelationInput, RelationDecision, RelationView,
};
use crate::state::AppState;
use crate::util::validate_id;

#[tauri::command]
pub async fn memory_item(
    state: State<'_, AppState>,
    kind: ItemKind,
    id: String,
) -> AppResult<MemoryItem> {
    validate_id(&id, "item id")?;
    let database = state.database()?;
    blocking("memory_item", move || {
        database.read(|connection| status::item(connection, kind, &id))
    })
    .await
}

/// Tries again the failed stages of an item.
#[tauri::command]
pub async fn memory_retry(
    state: State<'_, AppState>,
    kind: ItemKind,
    id: String,
) -> AppResult<MemoryItem> {
    validate_id(&id, "item id")?;
    let database = state.database()?;
    blocking("memory_retry", move || {
        database.write(|transaction| queue::retry(transaction, kind, &id, false))?;
        database.read(|connection| status::item(connection, kind, &id))
    })
    .await
}

#[tauri::command]
pub async fn memory_overview(state: State<'_, AppState>) -> AppResult<MemoryOverview> {
    let database = state.database()?;
    blocking("memory_overview", move || database.read(status::overview)).await
}

/// Tries again every stage that failed or waits for the user. Returns the number of jobs queued.
#[tauri::command]
pub async fn memory_retry_all(state: State<'_, AppState>) -> AppResult<usize> {
    let database = state.database()?;
    blocking("memory_retry_all", move || database.write(queue::retry_all)).await
}

#[tauri::command]
pub async fn relations_list(
    state: State<'_, AppState>,
    kind: ItemKind,
    id: String,
) -> AppResult<Vec<RelationView>> {
    let database = state.database()?;
    blocking("relations_list", move || {
        database.read(|connection| service::list(connection, kind, &id))
    })
    .await
}

#[tauri::command]
pub async fn relations_create(
    state: State<'_, AppState>,
    input: NewRelationInput,
) -> AppResult<Relation> {
    let database = state.database()?;
    blocking("relations_create", move || {
        database.write(|transaction| service::create(transaction, &input))
    })
    .await
}

#[tauri::command]
pub async fn relations_set_type(
    state: State<'_, AppState>,
    id: String,
    relation_type: String,
) -> AppResult<Relation> {
    validate_id(&id, "relation id")?;
    let database = state.database()?;
    blocking("relations_set_type", move || {
        database.write(|transaction| service::set_type(transaction, &id, &relation_type))
    })
    .await
}

#[tauri::command]
pub async fn relations_decide(
    state: State<'_, AppState>,
    id: String,
    decision: RelationDecision,
) -> AppResult<Relation> {
    validate_id(&id, "relation id")?;
    let database = state.database()?;
    blocking("relations_decide", move || {
        database.write(|transaction| service::decide(transaction, &id, decision))
    })
    .await
}

#[tauri::command]
pub async fn relations_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    validate_id(&id, "relation id")?;
    let database = state.database()?;
    blocking("relations_remove", move || {
        database.write(|transaction| service::remove(transaction, &id))
    })
    .await
}
