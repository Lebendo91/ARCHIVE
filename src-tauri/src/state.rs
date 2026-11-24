//! Application state shared by the commands.
//!
//! When the database cannot be opened (disk full, database created by a newer version, failed migration…)
//! the application still starts in safe mode: the interface explains the problem and offers to retry,
//! instead of crashing or touching the data (ARCHITECTURE.md §6.4).

use std::path::PathBuf;
use std::sync::{Arc, Mutex, PoisonError, RwLock};

use serde::Serialize;
use ts_rs::TS;

use crate::db::{Database, MigrationReport, migrations};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::paths::AppPaths;
use crate::storage::FileStore;

enum DatabaseState {
    Ready {
        database: Arc<Database>,
        report: MigrationReport,
    },
    Unavailable(StartupFailure),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StartupFailure {
    pub code: ErrorCode,
    pub message: String,
    /// Technical detail shown under « Technical details » (no document content).
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum DatabaseAvailability {
    Ready,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppStatus {
    pub database: DatabaseAvailability,
    pub schema_version: Option<i64>,
    pub supported_schema_version: i64,
    pub last_migration: Option<MigrationReport>,
    pub failure: Option<StartupFailure>,
    pub data_dir: String,
    /// A restoration applied (or tried) at this start, to tell the user once.
    pub restore: Option<crate::backup::RestoreOutcome>,
}

pub struct AppState {
    pub paths: AppPaths,
    pub storage: FileStore,
    database: RwLock<DatabaseState>,
    restore: Option<crate::backup::RestoreOutcome>,
    /// The folder of the last export of this session, which the interface can show (it never sends a path).
    pub last_export: Mutex<Option<PathBuf>>,
}

fn open_database(paths: &AppPaths) -> DatabaseState {
    match Database::open(&paths.database_file, &paths.backups_dir) {
        Ok((database, report)) => {
            if report.applied.is_empty() {
                log::info!("database ready (schema v{})", report.to_version);
            } else {
                log::info!(
                    "database migrated from v{} to v{} (backup: {})",
                    report.from_version,
                    report.to_version,
                    report
                        .backup_file
                        .as_deref()
                        .unwrap_or("none, new database")
                );
            }
            // The search index is derived data: it is built again when its rules changed, or was never built
            // (a database from before Phase 6). Search is then only incomplete, never the rest of the app.
            let started = std::time::Instant::now();
            match database.write(crate::search::index::ensure_current) {
                Ok(Some(count)) => log::info!(
                    "search index built: {count} entries in {} ms",
                    started.elapsed().as_millis()
                ),
                Ok(None) => {}
                Err(error) => log::error!("search index could not be built: {error}"),
            }
            // The memory engine processes every item again when its rules changed (or never ran here).
            match database.write(crate::memory::ensure_current) {
                Ok(Some(count)) => log::info!("memory engine: {count} items queued for processing"),
                Ok(None) => {}
                Err(error) => log::error!("memory engine could not be prepared: {error}"),
            }
            // Answers that were being written when ARCHIVE last closed were interrupted.
            match database.write(crate::ai::conversations::interrupt_unfinished) {
                Ok(0) => {}
                Ok(count) => {
                    log::info!("{count} unfinished assistant answers marked as interrupted")
                }
                Err(error) => {
                    log::error!("unfinished assistant answers could not be updated: {error}")
                }
            }
            DatabaseState::Ready {
                database: Arc::new(database),
                report,
            }
        }
        Err(error) => {
            log::error!("database unavailable, starting in safe mode: {error}");
            DatabaseState::Unavailable(StartupFailure {
                code: error.code(),
                message: error.public_message(),
                detail: error.to_string(),
            })
        }
    }
}

impl AppState {
    pub fn initialize(paths: AppPaths) -> Self {
        // A restoration prepared by the user is applied before anything opens the database (ARCHITECTURE §7.1).
        let restore = crate::backup::apply_pending_restore(&paths);
        let storage = FileStore::new(&paths);
        match storage.cleanup_tmp() {
            Ok(0) => {}
            Ok(removed) => log::info!("removed {removed} leftover temporary files"),
            Err(error) => log::warn!("could not clean the temporary directory: {error}"),
        }
        let database = open_database(&paths);
        if let (Some(restore), DatabaseState::Ready { database, .. }) = (&restore, &database) {
            // The restored database only knows the backups made before it (ARCHITECTURE §7.1).
            match database.write(|transaction| restore.carry_history(transaction)) {
                Ok(0) => {}
                Ok(count) => log::info!("backup history carried over the restoration: {count}"),
                Err(error) => log::error!("the backup history could not be carried over: {error}"),
            }
        }
        Self {
            paths,
            storage,
            database: RwLock::new(database),
            restore: restore.map(|restore| restore.outcome),
            last_export: Mutex::new(None),
        }
    }

    /// The database, or `DatabaseUnavailable` in safe mode.
    pub fn database(&self) -> AppResult<Arc<Database>> {
        match &*self.database.read().unwrap_or_else(PoisonError::into_inner) {
            DatabaseState::Ready { database, .. } => Ok(Arc::clone(database)),
            DatabaseState::Unavailable(failure) => {
                Err(AppError::DatabaseUnavailable(failure.detail.clone()))
            }
        }
    }

    pub fn status(&self) -> AppStatus {
        let state = self.database.read().unwrap_or_else(PoisonError::into_inner);
        let (database, schema_version, last_migration, failure) = match &*state {
            DatabaseState::Ready { report, .. } => (
                DatabaseAvailability::Ready,
                Some(report.to_version),
                (!report.applied.is_empty()).then(|| report.clone()),
                None,
            ),
            DatabaseState::Unavailable(failure) => (
                DatabaseAvailability::Unavailable,
                None,
                None,
                Some(failure.clone()),
            ),
        };
        AppStatus {
            database,
            schema_version,
            supported_schema_version: migrations::latest_version(),
            last_migration,
            failure,
            data_dir: AppPaths::display(&self.paths.data_dir),
            restore: self.restore.clone(),
        }
    }

    /// Tries again to open the database (safe mode « Retry »). Has no effect when it is already open.
    pub fn retry_database(&self) -> AppStatus {
        {
            let mut state = self
                .database
                .write()
                .unwrap_or_else(PoisonError::into_inner);
            if matches!(*state, DatabaseState::Unavailable(_)) {
                *state = open_database(&self.paths);
            }
        }
        self.status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_healthy_data_directory_starts_ready() {
        let dir = tempfile::tempdir().expect("temporary directory");
        let paths = AppPaths::from_data_dir(dir.path());
        paths.ensure_directories().expect("directories");
        let state = AppState::initialize(paths);
        let status = state.status();
        assert_eq!(status.database, DatabaseAvailability::Ready);
        assert_eq!(status.schema_version, Some(migrations::latest_version()));
        assert!(state.database().is_ok());
    }

    #[test]
    fn an_unusable_database_starts_in_safe_mode_and_can_be_retried() {
        let dir = tempfile::tempdir().expect("temporary directory");
        let paths = AppPaths::from_data_dir(dir.path());
        paths.ensure_directories().expect("directories");
        std::fs::write(
            &paths.database_file,
            b"this is not a SQLite database, but a corrupted file",
        )
        .expect("corrupt database");
        let state = AppState::initialize(paths.clone());
        let status = state.status();
        assert_eq!(status.database, DatabaseAvailability::Unavailable);
        assert!(status.failure.is_some());
        assert!(matches!(
            state.database(),
            Err(AppError::DatabaseUnavailable(_))
        ));
        assert!(
            std::fs::read(&paths.database_file)
                .expect("file")
                .starts_with(b"this is not"),
            "data untouched"
        );

        std::fs::remove_file(&paths.database_file).expect("user removes the broken file");
        assert_eq!(state.retry_database().database, DatabaseAvailability::Ready);
    }
}
