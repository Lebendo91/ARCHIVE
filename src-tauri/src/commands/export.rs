//! Export commands (specification §16.4): the data of the knowledge base, or of one workspace, in open formats,
//! written in a folder the user chooses in a dialog opened by the core.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::PoisonError;

use tauri::ipc::Channel;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use super::blocking;
use crate::error::{AppError, AppResult};
use crate::export::{self, ExportNoteSource, ExportProgress, ExportScope, ExportSummary};
use crate::repo::notes::CONTENT_MAX;
use crate::state::AppState;
use crate::util::{clean_name, validate_id};

/// Most notes the interface may convert for one export.
const NOTES_MAX: usize = 200_000;

/// The notes written as TipTap documents in the scope, for the interface to convert to Markdown.
#[tauri::command]
pub async fn export_notes_source(
    state: State<'_, AppState>,
    scope: ExportScope,
) -> AppResult<Vec<ExportNoteSource>> {
    let database = state.database()?;
    blocking("export_notes_source", move || {
        database.read(|connection| export::notes_to_convert(connection, &scope))
    })
    .await
}

/// Writes the export in a new folder inside the folder the user chooses. `None` when the dialog is cancelled.
#[tauri::command]
pub async fn export_create(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    scope: ExportScope,
    markdown: HashMap<String, String>,
    untitled: String,
    on_progress: Channel<ExportProgress>,
) -> AppResult<Option<ExportSummary>> {
    if markdown.len() > NOTES_MAX {
        return Err(AppError::InvalidInput("too many notes".to_owned()));
    }
    for (id, text) in &markdown {
        validate_id(id, "note id")?;
        if text.len() > CONTENT_MAX {
            return Err(AppError::InvalidInput(
                "a converted note is too large".to_owned(),
            ));
        }
    }
    let untitled = clean_name(&untitled, "name of the notes without title", 64)?;
    let database = state.database()?;
    let paths = state.paths.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .blocking_pick_folder()
    })
    .await
    .map_err(|error| AppError::Internal(format!("folder dialog failed: {error}")))?;
    let Some(parent) = picked.and_then(|folder| folder.into_path().ok()) else {
        return Ok(None);
    };
    let summary = blocking("export_create", move || {
        let started = std::time::Instant::now();
        let summary = export::export(
            &database,
            &paths,
            &parent,
            &scope,
            &markdown,
            &untitled,
            |progress| {
                let _ = on_progress.send(progress);
            },
        )?;
        log::info!(
            "export written: {} documents, {} notes, {} missing files, in {} ms",
            summary.documents,
            summary.notes,
            summary.missing_files.len(),
            started.elapsed().as_millis()
        );
        Ok(summary)
    })
    .await?;
    *state
        .last_export
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = Some(PathBuf::from(&summary.folder));
    Ok(Some(summary))
}

/// Shows the folder of the last export in the file manager.
#[tauri::command]
pub async fn export_reveal(state: State<'_, AppState>) -> AppResult<()> {
    let folder = state
        .last_export
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
        .ok_or(AppError::NotFound { entity: "export" })?;
    blocking("export_reveal", move || {
        if !folder.is_dir() {
            return Err(AppError::NotFound { entity: "export" });
        }
        tauri_plugin_opener::reveal_item_in_dir(&folder)
            .map_err(|error| AppError::Internal(format!("cannot show the export: {error}")))
    })
    .await
}
