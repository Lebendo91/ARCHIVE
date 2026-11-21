//! Import commands (specification §7.2). The interface never sends a path: files come from the native file
//! picker, opened here, or from a native drag and drop, recorded by the core (see `import::ImportState`).

use std::path::PathBuf;

use tauri::ipc::Channel;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::DialogExt;

use super::blocking;
use crate::error::{AppError, AppResult};
use crate::import::ImportState;
use crate::import::detect::SUPPORTED_EXTENSIONS;
use crate::import::pipeline::{
    self, ImportContext, ImportProgress, ImportSummary, ImportTarget, check_target_ids,
};
use crate::state::AppState;

async fn run_import(
    state: &AppState,
    imports: &ImportState,
    paths: Vec<PathBuf>,
    target: ImportTarget,
    on_progress: Channel<ImportProgress>,
) -> AppResult<ImportSummary> {
    let database = state.database()?;
    let store = state.storage.clone();
    let cancel = imports.cancel_flag();
    let _running = imports.start()?;
    blocking("documents_import", move || {
        let context = ImportContext {
            database: &database,
            store: &store,
            cancel: &cancel,
        };
        pipeline::import_paths(&context, &paths, &target, |event| {
            // The window may have been closed meanwhile: the import goes on regardless.
            let _ = on_progress.send(event);
        })
    })
    .await
}

/// Opens the native file picker and imports the chosen files. `None` when the user closes the picker.
#[tauri::command]
pub async fn documents_import_pick(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    imports: State<'_, ImportState>,
    target: ImportTarget,
    on_progress: Channel<ImportProgress>,
) -> AppResult<Option<ImportSummary>> {
    check_target_ids(&target)?;
    // The dialog blocks until the user chooses: it never runs on the main thread.
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .add_filter("Documents", SUPPORTED_EXTENSIONS)
            .blocking_pick_files()
    })
    .await
    .map_err(|error| AppError::Internal(format!("file picker failed: {error}")))?;
    let Some(files) = picked else {
        return Ok(None);
    };
    let paths: Vec<PathBuf> = files
        .into_iter()
        .filter_map(|file| file.into_path().ok())
        .collect();
    if paths.is_empty() {
        return Ok(None);
    }
    run_import(&state, &imports, paths, target, on_progress)
        .await
        .map(Some)
}

/// Imports the files of the latest native drag and drop onto the window.
#[tauri::command]
pub async fn documents_import_dropped(
    state: State<'_, AppState>,
    imports: State<'_, ImportState>,
    target: ImportTarget,
    on_progress: Channel<ImportProgress>,
) -> AppResult<ImportSummary> {
    check_target_ids(&target)?;
    let paths = imports
        .take_drop()
        .ok_or_else(|| AppError::InvalidInput("no recent drag and drop to import".to_owned()))?;
    run_import(&state, &imports, paths, target, on_progress).await
}

/// Asks the running import to stop before its next file.
#[tauri::command]
pub fn documents_import_cancel(imports: State<'_, ImportState>) {
    imports.request_cancel();
}

/// Records the files dropped onto the window, for `documents_import_dropped`.
pub fn on_files_dropped(imports: &ImportState, paths: &[PathBuf]) {
    imports.record_drop(paths.to_vec());
}
