//! IPC boundary: every command exposed to the webview lives here and validates its own inputs.
//!
//! Database and file operations run on Tauri's blocking thread pool, never on the main thread, so that the
//! interface stays responsive (specification §4.2).

pub mod app;
pub mod dashboard;
pub mod diagnostics;
pub mod import;
pub mod settings;
pub mod storage;
pub mod workspaces;

use crate::error::{AppError, AppResult};

/// Runs blocking work (SQLite, file system) off the async runtime and logs technical failures.
pub(crate) async fn blocking<T: Send + 'static>(
    context: &'static str,
    task: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| AppError::Internal(format!("background task failed: {error}")))?
        .map_err(|error| error.logged(context))
}
