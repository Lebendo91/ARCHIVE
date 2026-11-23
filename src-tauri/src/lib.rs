//! ARCHIVE native core.
//!
//! The webview only renders the interface. Data, files, network access and secrets are owned by this
//! crate and exposed to the interface through explicit, validated commands (see `ARCHITECTURE.md`).

pub mod ai;
mod commands;
pub mod db;
pub mod error;
pub mod import;
mod logging;
pub mod memory;
pub mod paths;
#[cfg(test)]
mod perf;
pub mod repo;
pub mod search;
pub mod services;
pub mod state;
pub mod storage;
pub mod util;

use tauri::{DragDropEvent, Manager, WindowEvent};

use crate::import::ImportState;
use crate::paths::AppPaths;
use crate::state::AppState;

/// Builds and runs the ARCHIVE desktop application.
pub fn run() {
    let result = tauri::Builder::default()
        // The file picker is opened by the core only: no dialog permission is granted to the interface.
        .plugin(tauri_plugin_dialog::init())
        .manage(ImportState::default())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Once per session: the interface may first finish the saves of a note being edited.
                log::info!("window close requested");
            }
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                commands::import::on_files_dropped(&window.state::<ImportState>(), paths);
            }
        })
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle())?;
            paths.ensure_directories()?;
            app.handle().plugin(logging::plugin(&paths))?;
            log::info!(
                "ARCHIVE {} starting, data directory: {}",
                env!("CARGO_PKG_VERSION"),
                paths.data_dir.display()
            );
            app.manage(AppState::initialize(paths));
            // AI providers: keys in the operating system's credential store (the Windows Credential Manager).
            app.manage(std::sync::Arc::new(ai::assistant::AiState::new(
                ai::secret::Secrets::new(ai::secret::platform_vault()),
            )));
            // The memory engine works in the background from the start (it waits in safe mode).
            memory::worker::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::app_status,
            commands::app::database_retry,
            commands::app::app_open_url,
            commands::diagnostics::log_frontend_event,
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::storage::storage_overview,
            commands::storage::storage_open_folder,
            commands::storage::database_check_integrity,
            commands::workspaces::workspaces_list,
            commands::workspaces::workspaces_get,
            commands::workspaces::workspaces_create,
            commands::workspaces::workspaces_update,
            commands::workspaces::workspaces_set_archived,
            commands::workspaces::workspaces_delete,
            commands::dashboard::dashboard_overview,
            commands::dashboard::timeline_list,
            commands::dashboard::timeline_clear,
            commands::import::documents_import_pick,
            commands::import::documents_import_dropped,
            commands::import::documents_import_retry,
            commands::import::documents_import_cancel,
            commands::documents::documents_list,
            commands::documents::documents_get,
            commands::documents::documents_rename,
            commands::documents::documents_move,
            commands::documents::documents_set_favorite,
            commands::documents::documents_set_archived,
            commands::documents::documents_set_tags,
            commands::documents::documents_trash,
            commands::documents::documents_restore,
            commands::documents::documents_purge,
            commands::documents::documents_mark_opened,
            commands::documents::documents_open_external,
            commands::documents::documents_reveal,
            commands::documents::documents_export,
            commands::documents::documents_read_range,
            commands::documents::documents_pending_extraction,
            commands::documents::documents_save_extraction,
            commands::library::folders_list,
            commands::library::folders_create,
            commands::library::folders_rename,
            commands::library::folders_delete,
            commands::library::folders_move,
            commands::library::tags_list,
            commands::library::tags_usage,
            commands::library::tags_create,
            commands::library::tags_rename,
            commands::library::tags_delete,
            commands::notes::notes_list,
            commands::notes::notes_get,
            commands::notes::notes_create,
            commands::notes::notes_save,
            commands::notes::notes_rename,
            commands::notes::notes_duplicate,
            commands::notes::notes_move,
            commands::notes::notes_set_favorite,
            commands::notes::notes_set_archived,
            commands::notes::notes_set_tags,
            commands::notes::notes_trash,
            commands::notes::notes_restore,
            commands::notes::notes_purge,
            commands::notes::notes_mark_opened,
            commands::search::search_query,
            commands::search::search_history_list,
            commands::search::search_history_record,
            commands::search::search_history_delete,
            commands::search::search_history_clear,
            commands::memory::memory_item,
            commands::memory::memory_retry,
            commands::memory::memory_overview,
            commands::memory::memory_retry_all,
            commands::memory::relations_list,
            commands::memory::relations_create,
            commands::memory::relations_set_type,
            commands::memory::relations_decide,
            commands::memory::relations_remove,
            commands::graph::graph_load,
            commands::ai::ai_overview,
            commands::ai::ai_providers_create,
            commands::ai::ai_providers_update,
            commands::ai::ai_providers_delete,
            commands::ai::ai_providers_set_key,
            commands::ai::ai_providers_remove_key,
            commands::ai::ai_providers_test,
            commands::ai::assistant_conversations,
            commands::ai::assistant_conversation,
            commands::ai::assistant_conversation_clear,
            commands::ai::assistant_conversation_delete,
            commands::ai::assistant_preview,
            commands::ai::assistant_ask,
            commands::ai::assistant_regenerate,
            commands::ai::assistant_stop,
            commands::notes::notes_import_markdown_pick,
            commands::notes::notes_export_markdown,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("ARCHIVE could not start: {error}");
        std::process::exit(1);
    }
}
