//! ARCHIVE native core.
//!
//! The webview only renders the interface. Data, files, network access and secrets are owned by this
//! crate and exposed to the interface through explicit, validated commands (see `ARCHITECTURE.md`).

mod commands;
pub mod db;
pub mod error;
mod logging;
pub mod paths;
pub mod repo;
pub mod state;
pub mod storage;
pub mod util;

use tauri::Manager;

use crate::paths::AppPaths;
use crate::state::AppState;

/// Builds and runs the ARCHIVE desktop application.
pub fn run() {
    let result = tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("ARCHIVE could not start: {error}");
        std::process::exit(1);
    }
}
