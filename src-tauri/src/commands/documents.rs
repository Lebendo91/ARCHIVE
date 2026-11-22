//! Library commands (specification §7.3–7.5). Files are designated by document identifier only: the core
//! resolves the managed path itself, and the user's original files are never touched.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use tauri::ipc::Response;
use tauri::{AppHandle, State, Window};
use tauri_plugin_dialog::DialogExt;

use super::blocking;
use crate::error::{AppError, AppResult};
use crate::repo::documents::{self, Document};
use crate::repo::tags::Tag;
use crate::services::documents::{
    self as service, DocumentDetail, DocumentLocation, DocumentPage, DocumentQuery, PdfExtraction,
};
use crate::state::AppState;
use crate::storage::FileStore;
use crate::util::{safe_file_name, validate_id};

fn managed_path(store: &FileStore, document: &Document) -> AppResult<PathBuf> {
    let path = store.path_for(&document.stored_filename)?;
    if !path.is_file() {
        return Err(AppError::Storage(format!(
            "the managed copy of document {} is missing",
            document.id
        )));
    }
    Ok(path)
}

#[tauri::command]
pub async fn documents_list(
    state: State<'_, AppState>,
    query: DocumentQuery,
) -> AppResult<DocumentPage> {
    let database = state.database()?;
    blocking("documents_list", move || {
        database.read(|connection| service::list(connection, &query))
    })
    .await
}

#[tauri::command]
pub async fn documents_get(state: State<'_, AppState>, id: String) -> AppResult<DocumentDetail> {
    let database = state.database()?;
    blocking("documents_get", move || {
        database.read(|connection| service::detail(connection, &id))
    })
    .await
}

#[tauri::command]
pub async fn documents_rename(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_rename", move || {
        database.write(|transaction| service::rename(transaction, &id, &title))
    })
    .await
}

#[tauri::command]
pub async fn documents_move(
    state: State<'_, AppState>,
    id: String,
    location: DocumentLocation,
) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_move", move || {
        database.write(|transaction| service::move_to(transaction, &id, &location))
    })
    .await
}

#[tauri::command]
pub async fn documents_set_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_set_favorite", move || {
        database.write(|transaction| service::set_favorite(transaction, &id, favorite))
    })
    .await
}

#[tauri::command]
pub async fn documents_set_archived(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_set_archived", move || {
        database.write(|transaction| service::set_archived(transaction, &id, archived))
    })
    .await
}

#[tauri::command]
pub async fn documents_set_tags(
    state: State<'_, AppState>,
    id: String,
    tag_ids: Vec<String>,
) -> AppResult<Vec<Tag>> {
    let database = state.database()?;
    blocking("documents_set_tags", move || {
        database.write(|transaction| service::set_tags(transaction, &id, &tag_ids))
    })
    .await
}

/// Moves a document to the trash: reversible, nothing is deleted.
#[tauri::command]
pub async fn documents_trash(state: State<'_, AppState>, id: String) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_trash", move || {
        database.write(|transaction| documents::trash(transaction, &id))
    })
    .await
}

#[tauri::command]
pub async fn documents_restore(state: State<'_, AppState>, id: String) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_restore", move || {
        database.write(|transaction| documents::restore(transaction, &id))
    })
    .await
}

/// Deletes a document of the trash for good: its entry, its extracted text and its managed copy. The
/// user's original file, wherever it is, is not touched (specification §7.5).
#[tauri::command]
pub async fn documents_purge(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    let store = state.storage.clone();
    blocking("documents_purge", move || {
        let document = database.write(|transaction| documents::purge(transaction, &id))?;
        // The entry is gone first: a copy that cannot be removed is an orphan file, never a broken entry.
        if let Err(error) = store.remove(&document.stored_filename) {
            log::warn!("purge: the managed copy could not be removed: {error}");
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn documents_mark_opened(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    blocking("documents_mark_opened", move || {
        database.write(|transaction| service::mark_opened(transaction, &id))
    })
    .await
}

/// Opens the managed copy with the default application of the system.
#[tauri::command]
pub async fn documents_open_external(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    let store = state.storage.clone();
    blocking("documents_open_external", move || {
        let document = database.read(|connection| documents::get(connection, &id))?;
        let path = managed_path(&store, &document)?;
        tauri_plugin_opener::open_path(&path, None::<&str>)
            .map_err(|error| AppError::Storage(format!("cannot open the document: {error}")))?;
        database.write(|transaction| service::mark_opened(transaction, &id))
    })
    .await
}

/// Shows the managed copy in the file explorer.
#[tauri::command]
pub async fn documents_reveal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let database = state.database()?;
    let store = state.storage.clone();
    blocking("documents_reveal", move || {
        let document = database.read(|connection| documents::get(connection, &id))?;
        let path = managed_path(&store, &document)?;
        tauri_plugin_opener::reveal_item_in_dir(&path)
            .map_err(|error| AppError::Storage(format!("cannot show the document: {error}")))
    })
    .await
}

/// Saves a copy of the document where the user chooses. `false` when the user cancels.
#[tauri::command]
pub async fn documents_export(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<bool> {
    validate_id(&id, "document id")?;
    let database = state.database()?;
    let store = state.storage.clone();
    let document = blocking("documents_export", move || {
        database.read(|connection| documents::get(connection, &id))
    })
    .await?;
    let source = managed_path(&store, &document)?;
    let file_name = safe_file_name(&document.original_filename);
    let destination = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_file_name(&file_name)
            .blocking_save_file()
    })
    .await
    .map_err(|error| AppError::Internal(format!("save dialog failed: {error}")))?;
    let Some(destination) = destination.and_then(|file| file.into_path().ok()) else {
        return Ok(false);
    };
    blocking("documents_export", move || {
        std::fs::copy(&source, &destination)?;
        Ok(true)
    })
    .await
}

/// Largest number of bytes returned by one `documents_read_range` call.
pub const READ_CHUNK_MAX: u32 = 16 * 1024 * 1024;

/// Bytes of the managed copy of a document, for the previews (pdf.js reads PDF files by ranges, images
/// become `blob:` URLs). The file is designated by its document only: no path ever crosses the boundary.
#[tauri::command]
pub async fn documents_read_range(
    state: State<'_, AppState>,
    id: String,
    offset: u64,
    length: u32,
) -> AppResult<Response> {
    if length == 0 || length > READ_CHUNK_MAX {
        return Err(AppError::InvalidInput(format!(
            "length must be between 1 and {READ_CHUNK_MAX}"
        )));
    }
    let database = state.database()?;
    let store = state.storage.clone();
    blocking("documents_read_range", move || {
        let document = database.read(|connection| documents::get(connection, &id))?;
        let mut file = File::open(managed_path(&store, &document)?)?;
        let size = file.metadata()?.len();
        if offset > size {
            return Err(AppError::InvalidInput(
                "offset beyond the end of the file".to_owned(),
            ));
        }
        file.seek(SeekFrom::Start(offset))?;
        let mut bytes = Vec::with_capacity(
            usize::try_from(u64::from(length).min(size - offset)).unwrap_or_default(),
        );
        file.take(u64::from(length)).read_to_end(&mut bytes)?;
        Ok(Response::new(bytes))
    })
    .await
}

#[tauri::command]
pub async fn documents_pending_extraction(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let database = state.database()?;
    blocking("documents_pending_extraction", move || {
        database.read(|connection| service::pending_extraction(connection, 20))
    })
    .await
}

#[tauri::command]
pub async fn documents_save_extraction(
    state: State<'_, AppState>,
    id: String,
    extraction: PdfExtraction,
) -> AppResult<Document> {
    let database = state.database()?;
    blocking("documents_save_extraction", move || {
        database.write(|transaction| service::save_pdf_extraction(transaction, &id, extraction))
    })
    .await
}

#[cfg(test)]
mod tests {
    use crate::util::safe_file_name;

    #[test]
    fn exported_file_names_are_valid_on_windows() {
        assert_eq!(safe_file_name("Cours: NE555?.pdf"), "Cours_ NE555_.pdf");
        assert_eq!(safe_file_name("con.txt"), "document_con.txt");
        assert_eq!(safe_file_name("COM1.csv"), "document_COM1.csv");
        assert_eq!(safe_file_name("rapport final.docx. "), "rapport final.docx");
        assert_eq!(safe_file_name("..."), "document_");
    }
}
