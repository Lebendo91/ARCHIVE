//! Storage commands: overview of the local data (specification §15.3), opening its folders in the file
//! explorer, and the database integrity check (§5.2).

use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::blocking;
use crate::db::integrity::{self, IntegrityReport};
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::state::AppState;
use crate::storage::{self, directory_usage};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StorageOverview {
    pub data_dir: String,
    pub database_file: String,
    pub files_dir: String,
    pub backups_dir: String,
    pub logs_dir: String,
    /// Database file and its WAL journal.
    pub database_bytes: u64,
    pub files_bytes: u64,
    pub files_count: u64,
    pub backups_bytes: u64,
    pub logs_bytes: u64,
    pub total_bytes: u64,
    /// Free space of the disk holding the data, as reported by the operating system (never estimated).
    pub disk_available_bytes: Option<u64>,
    pub disk_total_bytes: Option<u64>,
}

/// Folders the user can open from Settings › Storage. The interface never passes a path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum StorageFolder {
    Data,
    Files,
    Backups,
    Logs,
}

fn overview(paths: &AppPaths) -> AppResult<StorageOverview> {
    let database_bytes = [
        paths.database_file.clone(),
        paths.database_file.with_extension("db-wal"),
        paths.database_file.with_extension("db-shm"),
    ]
    .iter()
    .map(|path| storage::file_size(path))
    .sum();
    let files = directory_usage(&paths.files_dir)?;
    let backups = directory_usage(&paths.backups_dir)?;
    let logs = directory_usage(&paths.logs_dir)?;
    let disk_available_bytes = fs4::available_space(&paths.data_dir)
        .inspect_err(|error| log::warn!("free disk space unavailable: {error}"))
        .ok();
    let disk_total_bytes = fs4::total_space(&paths.data_dir).ok();
    Ok(StorageOverview {
        data_dir: AppPaths::display(&paths.data_dir),
        database_file: AppPaths::display(&paths.database_file),
        files_dir: AppPaths::display(&paths.files_dir),
        backups_dir: AppPaths::display(&paths.backups_dir),
        logs_dir: AppPaths::display(&paths.logs_dir),
        database_bytes,
        files_bytes: files.bytes,
        files_count: files.files,
        backups_bytes: backups.bytes,
        logs_bytes: logs.bytes,
        total_bytes: database_bytes + files.bytes + backups.bytes + logs.bytes,
        disk_available_bytes,
        disk_total_bytes,
    })
}

#[tauri::command]
pub async fn storage_overview(state: State<'_, AppState>) -> AppResult<StorageOverview> {
    let paths = state.paths.clone();
    blocking("storage_overview", move || overview(&paths)).await
}

#[tauri::command]
pub async fn storage_open_folder(
    state: State<'_, AppState>,
    folder: StorageFolder,
) -> AppResult<()> {
    let path = match folder {
        StorageFolder::Data => state.paths.data_dir.clone(),
        StorageFolder::Files => state.paths.files_dir.clone(),
        StorageFolder::Backups => state.paths.backups_dir.clone(),
        StorageFolder::Logs => state.paths.logs_dir.clone(),
    };
    blocking("storage_open_folder", move || {
        std::fs::create_dir_all(&path)?;
        tauri_plugin_opener::open_path(&path, None::<&str>)
            .map_err(|error| AppError::Storage(format!("cannot open the folder: {error}")))
    })
    .await
}

#[tauri::command]
pub async fn database_check_integrity(state: State<'_, AppState>) -> AppResult<IntegrityReport> {
    let database = state.database()?;
    blocking("database_check_integrity", move || {
        database.read(integrity::check)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overview_reports_real_sizes() {
        let dir = tempfile::tempdir().expect("temporary directory");
        let paths = AppPaths::from_data_dir(dir.path());
        paths.ensure_directories().expect("directories");
        let state = AppState::initialize(paths.clone());
        state.database().expect("database ready");
        std::fs::write(paths.files_dir.join("x.bin"), [0_u8; 1000]).expect("file");

        let report = overview(&paths).expect("overview");
        assert!(report.database_bytes > 0, "the database file exists");
        assert_eq!((report.files_count, report.files_bytes), (1, 1000));
        assert_eq!(
            report.total_bytes,
            report.database_bytes + report.files_bytes + report.backups_bytes + report.logs_bytes
        );
        assert!(report.disk_total_bytes.unwrap_or(0) >= report.disk_available_bytes.unwrap_or(0));
    }
}
