//! Application settings commands.

use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::repo::settings::{self, AppSettings, SettingsPatch};
use crate::state::AppState;

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> AppResult<AppSettings> {
    let database = state.database()?;
    blocking("settings_get", move || database.read(settings::load)).await
}

#[tauri::command]
pub async fn settings_update(
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> AppResult<AppSettings> {
    let database = state.database()?;
    blocking("settings_update", move || {
        database.write(|transaction| settings::update(transaction, &patch))
    })
    .await
}
