//! ARCHIVE native core.
//!
//! The webview only renders the interface. Data, files, network access and secrets are owned by this
//! crate and exposed to the interface through explicit, validated commands (see `ARCHITECTURE.md`).

mod commands;

/// Builds and runs the ARCHIVE desktop application.
pub fn run() {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::diagnostics::log_frontend_event,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("ARCHIVE could not start: {error}");
        std::process::exit(1);
    }
}
