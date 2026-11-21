//! ARCHIVE native core.
//!
//! The webview only renders the interface. Data, files, network access and secrets are owned by this
//! crate and exposed to the interface through explicit, validated commands (see `ARCHITECTURE.md`).

mod commands;
pub mod db;
pub mod error;
pub mod import;
mod logging;
pub mod paths;
pub mod repo;
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::app::app_status,
            commands::app::database_retry,
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
            commands::import::documents_import_pick,
            commands::import::documents_import_dropped,
            commands::import::documents_import_cancel,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("ARCHIVE could not start: {error}");
        std::process::exit(1);
    }
}
